import type { Quat, Vec3 } from '../shared/math';
import { approach, clamp, frameToWorld, qRotate, qYaw } from '../shared/math';
import { G, Physics, RAPIER, groups, toQuat, toVec, type RBody } from './physics';
import type { Machine } from './machine';
import type { ItemManager } from './items';

// A drivable vehicle: a Rapier chassis with a raycast wheel controller. Real
// suspension travel, weight transfer, and a slope that actually pulls on you.
//
// While you're working on it the body is PINNED (fixed): a jacked-up truck
// with a wheel off must not twitch because the solver disagrees with itself.
// It only turns dynamic when it can actually roll.

export interface WheelDef {
  /** Machine slot holding this wheel (a missing/flat wheel changes the car). */
  slot?: string;
  pos: Vec3;
  radius: number;
  steer: boolean;
  drive: boolean;
}

export interface VehicleDef {
  id: string;
  name: string;
  kind: 'truck' | 'atv';
  mass: number;
  /** Chassis collision boxes (local). */
  hulls: { half: Vec3; offset: Vec3 }[];
  /** Centre of mass, local. Low = hard to roll. */
  com: Vec3;
  wheels: WheelDef[];
  suspension: { rest: number; travel: number; stiffness: number; compression: number; relaxation: number };
  grip: number;
  engine: { force: number; brake: number; topSpeed: number; reverseSpeed: number };
  steer: { max: number; atSpeed: number; rate: number };
  /** Driver's eye, local. */
  seat: Vec3;
  /** Where you step out, local. */
  exit: Vec3;
  /** Where you stand to get in. */
  door: { pos: Vec3; r: number };
  /** ATV cargo rack, local. */
  rack?: Vec3;
}

export interface WheelVisual {
  /** Suspension-compressed hub height offset, local metres. */
  hub: number;
  steer: number;
  spin: number;
  contact: boolean;
}

export interface VehicleIntent {
  throttle: number; // -1..1
  steer: number; // -1 (right)..1 (left)
  handbrake: boolean;
}

/** How far a wheel hangs below its hub when its corner is jacked up. */
export const HUB_DROOP = 0.05;

export class Vehicle {
  readonly body: RBody;
  private ctrl: RAPIER.DynamicRayCastVehicleController;
  occupied = false;
  /** Seconds of engine crank left after getting in. */
  crank = 0;
  running = false;
  lights = false;
  integrity = 1;
  /** Seconds spent upside down. */
  flipped = 0;
  /** Scripted slow roll (the cliff-edge opener). */
  creep = 0;
  pinned = false;
  private pinLift = 0;
  steer = 0;
  throttle = 0;
  brake = 0;
  speed = 0;
  wheels: WheelVisual[];
  pos: Vec3;
  rot: Quat;
  private prevVel: Vec3 = { x: 0, y: 0, z: 0 };
  /** Impact severity this tick (0 when none). */
  impact = 0;
  /** Items strapped to the cargo rack, bottom first. */
  rack: number[] = [];
  /** Rolling average for audio (engine load). */
  load = 0;

  constructor(
    readonly def: VehicleDef,
    readonly key: string,
    private phys: Physics,
    pos: Vec3,
    yaw: number,
    readonly machine: Machine | null,
  ) {
    const q = qYaw(yaw);
    this.body = phys.createBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(pos.x, pos.y, pos.z)
        .setRotation(q)
        .setLinearDamping(0.05)
        .setAngularDamping(0.8)
        .setCcdEnabled(true),
    );
    const hullMass = def.mass / def.hulls.length;
    for (const h of def.hulls) {
      const desc = RAPIER.ColliderDesc.roundCuboid(Math.max(0.05, h.half.x - 0.06), Math.max(0.05, h.half.y - 0.06), Math.max(0.05, h.half.z - 0.06), 0.06)
        .setTranslation(h.offset.x, h.offset.y, h.offset.z)
        .setMass(hullMass)
        .setFriction(0.5)
        .setRestitution(0.05)
        .setCollisionGroups(groups(G.VEHICLE, G.STATIC | G.VEHICLE | G.ITEM | G.PLAYER | G.DOOR));
      phys.attach(desc, this.body, { surface: 'metal', owner: `vehicle:${key}` });
    }
    // Pull the centre of mass down to where a real chassis carries its weight.
    this.body.setAdditionalMassProperties(
      def.mass * 0.35,
      def.com,
      { x: def.mass * 0.6, y: def.mass * 0.8, z: def.mass * 0.35 },
      { x: 0, y: 0, z: 0, w: 1 },
      true,
    );

    this.ctrl = phys.world.createVehicleController(this.body);
    const s = def.suspension;
    def.wheels.forEach((w, i) => {
      // Axle +X makes positive engine force drive toward -Z (our forward).
      this.ctrl.addWheel(w.pos, { x: 0, y: -1, z: 0 }, { x: 1, y: 0, z: 0 }, s.rest, w.radius);
      this.ctrl.setWheelSuspensionStiffness(i, s.stiffness);
      this.ctrl.setWheelSuspensionCompression(i, s.compression);
      this.ctrl.setWheelSuspensionRelaxation(i, s.relaxation);
      this.ctrl.setWheelMaxSuspensionTravel(i, s.travel);
      this.ctrl.setWheelMaxSuspensionForce(i, def.mass * 60);
      this.ctrl.setWheelFrictionSlip(i, def.grip);
      this.ctrl.setWheelSideFrictionStiffness(i, 1);
    });
    this.wheels = def.wheels.map(() => ({ hub: 0, steer: 0, spin: 0, contact: false }));
    this.pos = { ...pos };
    this.rot = q;
    this.syncMachine();
  }

  forward(): Vec3 {
    return qRotate(this.rot, { x: 0, y: 0, z: -1 });
  }

  up(): Vec3 {
    return qRotate(this.rot, { x: 0, y: 1, z: 0 });
  }

  world(local: Vec3): Vec3 {
    return frameToWorld(this.pos, this.rot, local);
  }

  /** A wheel's slot is empty: the car can't roll on it. */
  private wheelMissing(items: ItemManager): boolean {
    if (!this.machine) return false;
    return this.def.wheels.some((w) => w.slot && !this.machine!.state.slots[w.slot]);
  }

  /**
   * Decide whether the body should be pinned this tick. Jacked, chocked or
   * missing a wheel → pinned; the renderer still animates the jack lift.
   */
  updatePin(items: ItemManager, forced: boolean): void {
    const m = this.machine;
    const lift = m ? m.jackLift() : 0;
    const want = !this.occupied && (forced || (m ? m.anyJackRaised() : false) || this.wheelMissing(items));
    if (want && !this.pinned) {
      this.pinned = true;
      this.body.setLinvel({ x: 0, y: 0, z: 0 }, false);
      this.body.setAngvel({ x: 0, y: 0, z: 0 }, false);
      this.body.setBodyType(RAPIER.RigidBodyType.Fixed, false);
    } else if (!want && this.pinned) {
      this.pinned = false;
      // Drop the jack lift before letting physics have it back.
      if (this.pinLift) {
        const t = this.body.translation();
        this.body.setTranslation({ x: t.x, y: t.y - this.pinLift, z: t.z }, false);
        this.pinLift = 0;
      }
      this.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
    }
    if (this.pinned && lift !== this.pinLift) {
      const t = this.body.translation();
      this.body.setTranslation({ x: t.x, y: t.y + (lift - this.pinLift), z: t.z }, true);
      this.pinLift = lift;
    }
  }

  /** Apply controls before the physics step. */
  control(intent: VehicleIntent | null, dt: number, items: ItemManager): void {
    const def = this.def;
    this.impact = 0;
    if (this.pinned) return;

    // Something is about to push on it: make sure the body is awake, or its
    // velocity (and the controller's) is stale.
    if (this.occupied || this.creep > 0) this.body.wakeUp();
    const lv = this.body.linvel();
    const f = this.forward();
    const speed = lv.x * f.x + lv.y * f.y + lv.z * f.z;
    this.speed = speed;
    const fwdSpeed = speed;
    let engine = 0;
    let brake = 0;
    let steerTarget = 0;
    let handbrake = false;

    if (this.occupied && intent && this.running) {
      const t = intent.throttle;
      if (t > 0) {
        if (fwdSpeed < -0.5) brake = def.engine.brake;
        else if (fwdSpeed < def.engine.topSpeed) engine = def.engine.force * t;
      } else if (t < 0) {
        if (fwdSpeed > 0.5) brake = def.engine.brake;
        else if (fwdSpeed > -def.engine.reverseSpeed) engine = def.engine.force * 0.6 * t;
      } else {
        brake = def.engine.brake * 0.06; // engine braking / rolling resistance
      }
      const k = clamp(Math.abs(fwdSpeed) / def.engine.topSpeed, 0, 1);
      steerTarget = intent.steer * def.steer.max * (1 - k * (1 - def.steer.atSpeed));
      handbrake = intent.handbrake;
      this.throttle = t;
    } else if (this.creep > 0) {
      // The handbrake has given up; gravity does the rest, slowly.
      brake = Math.abs(fwdSpeed) > this.creep ? def.engine.brake * 0.4 : 0;
      this.throttle = 0;
    } else {
      brake = def.engine.brake * (this.occupied ? 0.3 : 1);
      this.throttle = 0;
    }
    this.steer = approach(this.steer, steerTarget, def.steer.rate * dt);
    this.brake = brake;
    this.load = approach(this.load, Math.abs(engine) / def.engine.force, dt * 4);

    const missing = this.wheelMissing(items);
    def.wheels.forEach((w, i) => {
      this.ctrl.setWheelSteering(i, w.steer ? this.steer : 0);
      this.ctrl.setWheelEngineForce(i, w.drive ? engine / Math.max(1, def.wheels.filter((x) => x.drive).length) : 0);
      const rear = !w.steer;
      this.ctrl.setWheelBrake(i, handbrake && rear ? def.engine.brake * 1.5 : brake / def.wheels.length);
      // A shredded tyre grips badly and sits low.
      const bad = w.slot && this.machine ? items.get(this.machine.state.slots[w.slot])?.cond === 'bad' : false;
      this.ctrl.setWheelRadius(i, bad ? w.radius * 0.84 : w.radius);
      this.ctrl.setWheelFrictionSlip(i, (bad ? def.grip * 0.55 : def.grip) * (handbrake && rear ? 0.45 : 1));
      if (missing) this.ctrl.setWheelEngineForce(i, 0);
    });

    this.ctrl.updateVehicle(dt, undefined, groups(G.VEHICLE, G.STATIC | G.DOOR));
  }

  /** Read back after the physics step. */
  sync(dt: number): void {
    const t = this.body.translation();
    const r = this.body.rotation();
    this.pos = toVec(t);
    this.rot = toQuat(r);
    this.syncMachine();

    const v = this.body.linvel();
    if (!this.pinned) {
      // Impacts: a sudden change in velocity beyond what gravity explains.
      const dv = Math.hypot(v.x - this.prevVel.x, v.y - this.prevVel.y - -15 * dt, v.z - this.prevVel.z);
      if (dv > 5) this.impact = (dv - 5) / 10;
    }
    this.prevVel = { x: v.x, y: v.y, z: v.z };

    if (this.creep > 0 && !this.pinned) {
      // Keep the scripted roll a creep, not a runaway, until it's off the edge.
      const sp = Math.hypot(v.x, v.z);
      const up = this.up();
      if (sp > this.creep * 1.4 && up.y > 0.9) {
        const k = (this.creep * 1.4) / sp;
        this.body.setLinvel({ x: v.x * k, y: v.y, z: v.z * k }, true);
      }
    }

    this.def.wheels.forEach((w, i) => {
      const wv = this.wheels[i];
      const len = this.ctrl.wheelSuspensionLength(i) ?? this.def.suspension.rest;
      wv.hub = -len;
      wv.steer = this.ctrl.wheelSteering(i) ?? 0;
      wv.contact = this.ctrl.wheelIsInContact(i);
      if (this.pinned) return;
      wv.spin += (this.speed / w.radius) * dt;
    });
    this.syncHubs();

    const up = this.up();
    this.flipped = up.y < 0.3 ? this.flipped + dt : 0;
  }

  /** Tell the machine where each wheel hub really is (see Machine.hubPose). */
  private syncHubs(): void {
    const m = this.machine;
    if (!m) return;
    this.def.wheels.forEach((w, i) => {
      if (!w.slot) return;
      const slot = m.def.components.find((c) => c.id === w.slot);
      if (!slot) return;
      if (this.pinned) {
        // Parked for work: the hub rests at its slot; a jacked wheel droops.
        const lift = slot.t === 'slot' ? slot.lift : undefined;
        m.hubPose.set(w.slot, { dy: lift && m.jackRaised(lift) ? -HUB_DROOP : 0, steer: 0 });
      } else {
        const wv = this.wheels[i];
        m.hubPose.set(w.slot, { dy: w.pos.y + wv.hub - slot.pos.y, steer: wv.steer });
      }
    });
  }

  private syncMachine(): void {
    if (!this.machine) return;
    this.machine.pos = this.pos;
    this.machine.rot = this.rot;
  }

  /** Put it back on its wheels, a little above where it was. */
  unflip(): void {
    const t = this.body.translation();
    const f = this.forward();
    const yaw = Math.atan2(-f.x, -f.z);
    this.body.setTranslation({ x: t.x, y: t.y + 1.6, z: t.z }, true);
    this.body.setRotation(qYaw(yaw), true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.flipped = 0;
  }

  /** Teleport (checkpoints, cinematics). */
  place(pos: Vec3, yaw: number): void {
    const wasPinned = this.pinned;
    if (wasPinned) this.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
    this.body.setTranslation(pos, true);
    this.body.setRotation(qYaw(yaw), true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.pinLift = 0;
    this.pinned = false;
    this.pos = { ...pos };
    this.rot = qYaw(yaw);
    this.syncMachine();
  }

  linvel(): Vec3 {
    return toVec(this.body.linvel());
  }
}
