import type { Vec3 } from '../shared/math';
import { CROUCH_HEIGHT, EYE_DROP, PLAYER_RADIUS, STAND_HEIGHT } from '../shared/constants';
import { G, Physics, RAPIER, groups, type RBody, type RCollider } from './physics';
import { stepVelocity, type MoveInput, type MoveMods } from './movement';

// The player's body: Rapier's kinematic character controller does the
// collision (steps, slopes, snapping to the ground), our movement model does
// the feel. Also owns stamina and the toolbelt/hands inventory slots.

export type PlayerMode = 'foot' | 'drive' | 'panel' | 'cinematic' | 'downed';

export const BELT_SLOTS = 4;

export class Player {
  pos: Vec3;
  vel: Vec3 = { x: 0, y: 0, z: 0 };
  yaw: number;
  pitch = 0;
  onGround = true;
  crouching = false;
  height = STAND_HEIGHT;
  mode: PlayerMode = 'foot';
  /** Vehicle being driven. */
  vehicle: string | null = null;
  /** Item carried in hands. */
  held: number | null = null;
  belt: (number | null)[] = new Array(BELT_SLOTS).fill(null);
  sel = 0;
  pockets: { kind: string; tag?: string }[] = [];
  stamina = 1;
  private sprintLock = false;
  flashlight = false;
  /** Surface under the feet (for footsteps). */
  surface = 'grass';
  /** Downward speed at the moment of the last landing. */
  landSpeed = 0;
  airTime = 0;
  topSpeed = 0;
  movedDist = 0;

  private body: RBody;
  private collider: RCollider;
  private kcc: RAPIER.KinematicCharacterController;

  constructor(
    private phys: Physics,
    pos: Vec3,
    yaw: number,
  ) {
    this.pos = { ...pos };
    this.yaw = yaw;
    this.body = phys.createBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(pos.x, pos.y + STAND_HEIGHT / 2, pos.z));
    // The player's own collider takes part in no solver contacts (so a
    // moving car can't slam into an immovable wall); the controller queries
    // the world explicitly instead.
    this.collider = phys.attach(
      RAPIER.ColliderDesc.capsule(STAND_HEIGHT / 2 - PLAYER_RADIUS, PLAYER_RADIUS).setCollisionGroups(groups(G.PLAYER, 0)),
      this.body,
      { surface: 'grass', owner: 'player' },
    );
    this.kcc = phys.world.createCharacterController(0.03);
    this.kcc.setUp({ x: 0, y: 1, z: 0 });
    this.kcc.setSlideEnabled(true);
    this.kcc.enableAutostep(0.42, 0.18, false);
    this.kcc.setMaxSlopeClimbAngle((52 * Math.PI) / 180);
    this.kcc.setMinSlopeSlideAngle((58 * Math.PI) / 180);
    this.kcc.enableSnapToGround(0.35);
    this.kcc.setApplyImpulsesToDynamicBodies(true);
    this.kcc.setCharacterMass(70);
  }

  eye(): Vec3 {
    return { x: this.pos.x, y: this.pos.y + this.height - EYE_DROP, z: this.pos.z };
  }

  /** View direction (unit). */
  look(): Vec3 {
    const cp = Math.cos(this.pitch);
    return { x: -Math.sin(this.yaw) * cp, y: Math.sin(this.pitch), z: -Math.cos(this.yaw) * cp };
  }

  /** Enable/disable the body (while driving, the player isn't in the world). */
  setActive(on: boolean): void {
    this.collider.setEnabled(on);
  }

  teleport(p: Vec3, yaw?: number): void {
    this.pos = { ...p };
    this.vel = { x: 0, y: 0, z: 0 };
    if (yaw !== undefined) this.yaw = yaw;
    this.body.setTranslation({ x: p.x, y: p.y + this.height / 2, z: p.z }, true);
    this.body.setNextKinematicTranslation({ x: p.x, y: p.y + this.height / 2, z: p.z });
  }

  /**
   * One fixed step of walking. Returns 'jump' / 'land' for feedback.
   */
  move(inp: MoveInput, dt: number, mods: MoveMods): 'jump' | 'land' | null {
    this.yaw = inp.yaw;

    // Crouch: shrink the capsule (and refuse to stand up into a ceiling).
    const wantCrouch = inp.crouch;
    if (wantCrouch !== this.crouching) {
      if (wantCrouch || this.headroom()) {
        this.crouching = wantCrouch;
        this.height = wantCrouch ? CROUCH_HEIGHT : STAND_HEIGHT;
        this.collider.setHalfHeight(this.height / 2 - PLAYER_RADIUS);
        // Keep the feet planted: re-centre the capsule on the new height.
        const c = { x: this.pos.x, y: this.pos.y + this.height / 2, z: this.pos.z };
        this.body.setTranslation(c, true);
      }
    }

    // Stamina: sprinting drains it; empty locks sprint until it recovers a bit.
    const moving = Math.hypot(this.vel.x, this.vel.z) > 0.5;
    if (inp.sprint && mods.canSprint && moving && !this.sprintLock && this.onGround) {
      this.stamina = Math.max(0, this.stamina - dt / 6);
      if (this.stamina <= 0) this.sprintLock = true;
    } else {
      this.stamina = Math.min(1, this.stamina + dt / 3.5);
      if (this.sprintLock && this.stamina > 0.35) this.sprintLock = false;
    }

    const wasGround = this.onGround;
    const fallSpeed = -this.vel.y;
    const jumped = stepVelocity(this.vel, this.onGround, { ...inp, crouch: this.crouching }, dt, mods, !this.sprintLock);

    const want = { x: this.vel.x * dt, y: this.vel.y * dt, z: this.vel.z * dt };
    this.kcc.computeColliderMovement(this.collider, want, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, groups(G.PLAYER, G.STATIC | G.VEHICLE | G.DOOR));
    const got = this.kcc.computedMovement();
    const grounded = this.kcc.computedGrounded();

    const t = this.body.translation();
    const nx = t.x + got.x;
    const ny = t.y + got.y;
    const nz = t.z + got.z;
    this.body.setNextKinematicTranslation({ x: nx, y: ny, z: nz });

    // Velocity follows what actually happened, so walls and ceilings bleed
    // speed instead of it silently accumulating.
    if (dt > 0) {
      if (Math.abs(got.x - want.x) > 1e-4) this.vel.x = got.x / dt;
      if (Math.abs(got.z - want.z) > 1e-4) this.vel.z = got.z / dt;
      if (want.y > 0 && got.y < want.y * 0.5) this.vel.y = 0; // bonked head
    }
    const prev = this.pos;
    this.pos = { x: nx, y: ny - this.height / 2, z: nz };
    this.movedDist += Math.hypot(this.pos.x - prev.x, this.pos.z - prev.z);
    this.topSpeed = Math.max(this.topSpeed, Math.hypot(this.vel.x, this.vel.z));

    this.onGround = grounded && !jumped;
    if (this.onGround && this.vel.y < 0) this.vel.y = 0;
    this.airTime = this.onGround ? 0 : this.airTime + dt;

    // What are we standing on?
    if (this.onGround) {
      for (let i = 0; i < this.kcc.numComputedCollisions(); i++) {
        const c = this.kcc.computedCollision(i);
        if (c?.collider && c.normal1.y > 0.5) {
          this.surface = this.phys.surfaceAt(c.collider.handle, this.pos.x, this.pos.z);
          break;
        }
      }
    }

    if (jumped) return 'jump';
    if (!wasGround && this.onGround) {
      this.landSpeed = fallSpeed;
      return 'land';
    }
    return null;
  }

  /** Is there room to stand up here? */
  private headroom(): boolean {
    const eye = { x: this.pos.x, y: this.pos.y + CROUCH_HEIGHT - 0.05, z: this.pos.z };
    const hit = this.phys.castRay(eye, { x: 0, y: 1, z: 0 }, STAND_HEIGHT - CROUCH_HEIGHT + 0.1, G.STATIC | G.VEHICLE | G.DOOR);
    return !hit;
  }
}

export const eyeHeight = (): number => STAND_HEIGHT - EYE_DROP;
export { PLAYER_RADIUS };
