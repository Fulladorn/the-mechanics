import * as THREE from 'three';
import type { Machine, PanelDef, SlotDef, TerminalsDef, JackDef, FluidDef } from '../../sim/machine';
import type { Vehicle } from '../../sim/vehicle';
import type { World } from '../../sim/world';
import { readings, SAFE_TARGET } from '../../sim/puzzles/valveBalance';
import { itemModel, wheelModel } from './itemModels';
import { MAT, styl } from './stylized';
import { cyl, lathe, mesh, rbox, textTexture, torus, tube } from './shapes';
import type { VehicleModel } from './vehicles/parts';

// Draws a Machine's live state. Parts come and go from slots, nuts spin in and
// out, the jack rises, the hood swings, terminal clamps hop off their posts.
// For drivable vehicles it also runs the wheels (suspension, steer, spin).

interface SlotVis {
  def: SlotDef;
  group: THREE.Group;
  item: number | null;
  obj: THREE.Object3D | null;
  cond: string;
  /** In-flight install animation. */
  arrive: { from: THREE.Vector3; t: number } | null;
  nuts: THREE.Mesh[];
  wheel?: WheelVis;
}

interface WheelVis {
  index: number;
  pivot: THREE.Group;
  squash: THREE.Group;
  spin: THREE.Group;
  side: -1 | 1;
}

const NUT_GEO = () => cyl(0.022, 0.022, 0.03, 6);
const nutMat = () => MAT.chrome();

export class MachineView {
  readonly root = new THREE.Group();
  private slots = new Map<string, SlotVis>();
  private jacks = new Map<string, { def: JackDef; obj: THREE.Group; arm: THREE.Object3D; lift: number }>();
  private clamps = new Map<string, { def: TerminalsDef; pos: THREE.Group; neg: THREE.Group; pT: number; nT: number }>();
  private panels = new Map<string, PanelVis>();
  private falling: { mesh: THREE.Mesh; vel: THREE.Vector3; t: number; spin: number }[] = [];
  private tmpPanel = new THREE.Vector3();
  private caps = new Map<string, { def: FluidDef; cap: THREE.Mesh }>();
  private hoodT = 0;
  private prevPos = new THREE.Vector3();
  private curPos = new THREE.Vector3();
  private prevRot = new THREE.Quaternion();
  private curRot = new THREE.Quaternion();
  private spinBase = 0;
  private fixedWheels: { index: number; pivot: THREE.Group; spin: THREE.Group }[] = [];

  constructor(
    readonly machine: Machine,
    readonly vehicle: Vehicle | null,
    readonly model: VehicleModel | null,
    /** Extra static art for non-vehicle machines (donor trucks, generators). */
    art: THREE.Object3D | null,
  ) {
    if (model) this.root.add(model.root);
    if (art) this.root.add(art);
    this.curPos.set(machine.pos.x, machine.pos.y, machine.pos.z);
    this.prevPos.copy(this.curPos);
    this.curRot.set(machine.rot.x, machine.rot.y, machine.rot.z, machine.rot.w);
    this.prevRot.copy(this.curRot);

    // Wheels that aren't machine parts (the ATV's) are just part of the model.
    if (vehicle) {
      vehicle.def.wheels.forEach((wd, index) => {
        if (wd.slot) return;
        const side: -1 | 1 = wd.pos.x < 0 ? -1 : 1;
        const pivot = new THREE.Group();
        const spin = new THREE.Group();
        pivot.add(spin);
        const r = model?.wheel;
        const o = wheelModel(wd.radius, r?.width ?? 0.24, r?.variant ?? 'atv', false);
        o.rotation.z = side < 0 ? Math.PI / 2 : -Math.PI / 2;
        spin.add(o);
        pivot.position.set(wd.pos.x, wd.pos.y - vehicle.def.suspension.rest, wd.pos.z);
        this.root.add(pivot);
        this.fixedWheels.push({ index, pivot, spin });
      });
    }

    for (const c of machine.def.components) {
      if (c.t === 'slot') this.addSlot(c);
      else if (c.t === 'jack') this.addJack(c);
      else if (c.t === 'terminals') this.addClamps(c);
      else if (c.t === 'panel') this.addPanel(c);
      else if (c.t === 'fluid') this.addCap(c);
    }
  }

  // --- building ---------------------------------------------------------------------

  private addSlot(def: SlotDef): void {
    const group = new THREE.Group();
    group.position.set(def.pos.x, def.pos.y, def.pos.z);
    group.rotation.y = def.yaw ?? 0;
    const vis: SlotVis = { def, group, item: null, obj: null, cond: '', arrive: null, nuts: [] };
    const wi = this.vehicle ? this.vehicle.def.wheels.findIndex((w) => w.slot === def.id) : -1;
    if (def.accepts === 'wheel') {
      // Wheels hang off a pivot the vehicle view moves with the suspension.
      const side: -1 | 1 = def.pos.x < 0 ? -1 : 1;
      const pivot = new THREE.Group();
      pivot.position.copy(group.position);
      const squash = new THREE.Group();
      const spin = new THREE.Group();
      pivot.add(squash);
      squash.add(spin);
      this.root.add(pivot);
      vis.wheel = { index: wi, pivot, squash, spin, side };
      // Hub + studs stay on the car even with the wheel off.
      const hub = mesh(cyl(0.11, 0.12, 0.06, 16), MAT.darkMetal(0x4b4f58));
      hub.rotation.z = Math.PI / 2;
      hub.position.x = side * 0.08;
      pivot.add(hub);
      const disc = mesh(cyl(0.16, 0.16, 0.02, 24), MAT.metal(0x8d939c, 0.5));
      disc.rotation.z = Math.PI / 2;
      disc.position.x = side * 0.04;
      pivot.add(disc);
    } else {
      this.root.add(group);
    }
    // One nut mesh per bolt, parented where it will move with the part.
    (def.bolts ?? []).forEach((b) => {
      const n = mesh(NUT_GEO(), nutMat());
      // Nuts hang off the hub pivot (not the rolling, squashing tyre), so
      // they sit exactly where the sim puts their click targets.
      const holder = vis.wheel ? vis.wheel.pivot : group;
      // Bolt positions/normals are in the machine frame; the holder may be
      // yawed (a hose lying across the engine), so bring them into its frame.
      const unyaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), vis.wheel ? 0 : -(def.yaw ?? 0));
      const off = new THREE.Vector3(b.pos.x - def.pos.x, b.pos.y - def.pos.y, b.pos.z - def.pos.z).applyQuaternion(unyaw);
      n.position.copy(off);
      const nrm = b.normal ?? { x: 0, y: 1, z: 0 };
      const nv = new THREE.Vector3(nrm.x, nrm.y, nrm.z).applyQuaternion(unyaw);
      n.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), nv);
      n.userData.base = n.position.clone();
      n.userData.normal = nv;
      holder.add(n);
      vis.nuts.push(n);
    });
    this.slots.set(def.id, vis);
  }

  private addJack(def: JackDef): void {
    const obj = new THREE.Group();
    const red = styl({ color: 0xd9463b, rough: 0.45, metal: 0.25 });
    const base = mesh(rbox(0.24, 0.08, 0.6, 0.03), red);
    base.position.y = 0.04;
    obj.add(base);
    const arm = new THREE.Group();
    arm.position.set(0, 0.08, 0.2);
    const bar = mesh(rbox(0.1, 0.06, 0.46, 0.02), red);
    bar.position.z = -0.23;
    arm.add(bar);
    const saddle = mesh(cyl(0.07, 0.07, 0.03, 16), MAT.darkMetal());
    saddle.position.set(0, 0.04, -0.46);
    arm.add(saddle);
    obj.add(arm);
    const handle = mesh(cyl(0.012, 0.012, 0.6, 8), MAT.metal());
    handle.rotation.x = -1.05;
    handle.position.set(0, 0.3, 0.52);
    obj.add(handle);
    obj.visible = false;
    obj.position.set(def.pos.x, def.pos.y, def.pos.z + 0.26);
    this.root.add(obj);
    this.jacks.set(def.id, { def, obj, arm, lift: 0 });
  }

  private addClamps(def: TerminalsDef): void {
    const make = (col: number) => {
      const g = new THREE.Group();
      const c = mesh(rbox(0.05, 0.035, 0.04, 0.01), MAT.metal(0xc4a14a, 0.4));
      g.add(c);
      const boot = mesh(rbox(0.055, 0.03, 0.05, 0.012), styl({ color: col, rough: 0.5 }));
      boot.position.set(0, 0.03, 0.01);
      g.add(boot);
      const cable = mesh(tube(`cable${col}`, [[0, 0.03, 0.02], [0, 0.06, 0.1], [0.02, 0.02, 0.2], [0.04, -0.1, 0.25]], 0.012, 10, 6), MAT.rubber(col === 0xd9463b ? 0x7c2019 : 0x1c1d21));
      g.add(cable);
      this.root.add(g);
      return g;
    };
    this.clamps.set(def.id, { def, pos: make(0xd9463b), neg: make(0x24262b), pT: 1, nT: 1 });
  }

  private addPanel(def: PanelDef): void {
    const p = new PanelVis(def, this.machine);
    this.root.add(p.group);
    this.panels.set(def.id, p);
  }

  private addCap(def: FluidDef): void {
    const cap = mesh(cyl(0.045, 0.05, 0.03, 16), MAT.chrome());
    cap.position.set(def.pos.x, def.pos.y, def.pos.z);
    if (Math.abs(def.pos.x) > 0.5) {
      cap.rotation.z = Math.PI / 2;
      cap.position.x += Math.sign(def.pos.x) * 0.02;
    }
    this.root.add(cap);
    this.caps.set(def.id, { def, cap });
  }

  panel(id: string): PanelVis | undefined {
    return this.panels.get(id);
  }

  /** World position of a component, from the current interpolated transform. */
  worldOf(local: THREE.Vector3): THREE.Vector3 {
    return local.clone().applyMatrix4(this.root.matrixWorld);
  }

  // --- per-frame ------------------------------------------------------------------------

  capture(): void {
    this.prevPos.copy(this.curPos);
    this.prevRot.copy(this.curRot);
    const m = this.machine;
    this.curPos.set(m.pos.x, m.pos.y, m.pos.z);
    this.curRot.set(m.rot.x, m.rot.y, m.rot.z, m.rot.w);
  }

  /** A part just went on: fly it in from `from` (world). */
  arrive(slotId: string, from: THREE.Vector3): void {
    const v = this.slots.get(slotId);
    if (v) v.arrive = { from: from.clone(), t: 0 };
  }

  sync(w: World, dt: number, alpha: number, time: number): void {
    const m = this.machine;
    this.root.position.lerpVectors(this.prevPos, this.curPos, alpha);
    this.root.quaternion.slerpQuaternions(this.prevRot, this.curRot, alpha);
    this.root.updateMatrixWorld(true);
    const s = m.state;
    this.stepFalling(dt);

    // Hood.
    if (this.model?.hood) {
      const open = !!s.covers.hood;
      this.hoodT += ((open ? 1 : 0) - this.hoodT) * Math.min(1, dt * 7);
      const e = this.hoodT;
      this.model.hood.rotation.x = this.model.hoodOpen * (e * e * (3 - 2 * e));
    }
    // Other named lids (donor battery boxes) swing up about their hinge.
    for (const [id, open] of Object.entries(s.covers)) {
      if (id === 'hood' && this.model?.hood) continue;
      const lid = this.root.getObjectByName(`cover:${id}`);
      if (!lid) continue;
      lid.rotation.x += ((open ? -1.9 : 0) - lid.rotation.x) * Math.min(1, dt * 7);
    }

    // Wheels spin with the vehicle; parked, they settle to a nut-aligned angle.
    const v = this.vehicle;
    const moving = v && !v.pinned && Math.abs(v.speed) > 0.2;
    if (v && !moving) {
      const step = (Math.PI * 2) / 5;
      const target = Math.round(this.spinBase / step) * step;
      this.spinBase += (target - this.spinBase) * Math.min(1, dt * 6);
    }

    for (const vis of this.slots.values()) {
      const id = s.slots[vis.def.id];
      const item = w.items.get(id);
      const cond = item ? item.cond + ':' + (item.variant ?? '') : '';
      if (id !== vis.item || cond !== vis.cond) {
        if (vis.obj) vis.obj.parent?.remove(vis.obj);
        vis.obj = null;
        vis.item = id;
        vis.cond = cond;
        if (item) {
          if (vis.wheel) {
            const r = this.model?.wheel;
            const o = wheelModel(r?.radius ?? 0.37, r?.width ?? 0.26, item.variant ?? r?.variant ?? 'truck', item.cond === 'bad');
            o.rotation.z = vis.wheel.side < 0 ? Math.PI / 2 : -Math.PI / 2;
            vis.wheel.spin.add(o);
            vis.obj = o;
          } else {
            const o = itemModel(item);
            vis.group.add(o);
            vis.obj = o;
          }
        }
      }
      // install fly-in
      if (vis.arrive && vis.obj) {
        vis.arrive.t += dt / 0.28;
        const t = Math.min(1, vis.arrive.t);
        const holder = vis.obj.parent!;
        const local = holder.worldToLocal(vis.arrive.from.clone());
        const e = 1 - Math.pow(1 - t, 3);
        const overshoot = Math.sin(t * Math.PI) * 0.04;
        vis.obj.position.copy(local.multiplyScalar(1 - e));
        vis.obj.position.y += overshoot;
        if (t >= 1) {
          vis.obj.position.set(0, 0, 0);
          vis.arrive = null;
        }
      }
      // nuts
      const hasPart = !!item;
      (vis.def.bolts ?? []).forEach((_, i) => {
        const nut = vis.nuts[i];
        const st = s.bolts[`${vis.def.id}#${i}`];
        const show = hasPart && st.s !== 'out';
        // Came off just now (not the whole part leaving): spin it out and
        // let it drop, so you see it's off instead of it just blinking out.
        if (nut.visible && !show && hasPart) this.dropNut(nut);
        nut.visible = show;
        if (!nut.visible) return;
        const base = nut.userData.base as THREE.Vector3;
        const nrm = nut.userData.normal as THREE.Vector3;
        const out = st.s === 'snug' ? 0.035 * (1 - Math.min(1, st.torque / 0.6)) + 0.004 : 0;
        nut.position.copy(base).addScaledVector(nrm, out);
        nut.rotation.y = st.torque * 14;
      });
      if (vis.wheel) this.syncWheel(vis, v, dt);
    }
    if (v) {
      for (const fw of this.fixedWheels) {
        const wd = v.def.wheels[fw.index];
        const st = v.wheels[fw.index];
        fw.pivot.position.set(wd.pos.x, wd.pos.y + (v.pinned ? -v.def.suspension.rest : st.hub), wd.pos.z);
        fw.pivot.rotation.y = st.steer;
        fw.spin.rotation.x = -(st.spin + this.spinBase);
      }
    }

    // Jacks.
    for (const j of this.jacks.values()) {
      const st = s.jacks[j.def.id];
      j.obj.visible = st.state === 'placed' || st.state === 'raised';
      const lift = m.jackLift();
      j.lift += ((st.state === 'raised' ? 1 : 0) - j.lift) * Math.min(1, dt * 3);
      // The jack stands on the ground, which moves down in the body frame as
      // the body rises.
      const ground = this.groundY() - lift;
      j.obj.position.y = ground;
      j.arm.rotation.x = 0.12 + j.lift * 0.25;
    }

    // Battery clamps.
    for (const c of this.clamps.values()) {
      const t = s.terminals[c.def.id];
      const hasBatt = !!s.slots[c.def.battery];
      c.pT += ((t.pos && hasBatt ? 1 : 0) - c.pT) * Math.min(1, dt * 12);
      c.nT += ((t.neg && hasBatt ? 1 : 0) - c.nT) * Math.min(1, dt * 12);
      const place = (g: THREE.Group, p: { x: number; y: number; z: number }, on: number, side: number) => {
        g.position.set(p.x + side * 0.07 * (1 - on), p.y + 0.02 + 0.05 * (1 - on), p.z + 0.05 * (1 - on));
        g.rotation.z = side * 0.9 * (1 - on);
      };
      place(c.pos, c.def.pos, c.pT, -1);
      place(c.neg, c.def.neg, c.nT, 1);
    }

    // Fluid caps pop off while pouring.
    for (const c of this.caps.values()) {
      const pouring = w.focus?.id === `machine:${m.key}:fluid:${c.def.id}` && w.focus.verb === 'pour' && w.holdProgress > 0;
      c.cap.visible = !pouring;
    }

    // Panel covers stay shut until you're at them (or working them).
    const eye = w.player.eye();
    for (const p of this.panels.values()) {
      const at = p.group.getWorldPosition(this.tmpPanel);
      const near = w.player.mode === 'foot' && Math.hypot(at.x - eye.x, at.y - eye.y, at.z - eye.z) < 2.4;
      p.sync(dt, time, near && !!(p.def.needs ?? []).every((n) => m.needMet(n, w.ctx)));
    }
  }

  /** A loosened nut backs off its stud and tumbles to the ground. */
  private dropNut(nut: THREE.Mesh): void {
    const n = new THREE.Mesh(nut.geometry, nut.material);
    nut.updateWorldMatrix(true, false);
    this.root.updateWorldMatrix(true, false);
    const local = this.root.worldToLocal(nut.getWorldPosition(new THREE.Vector3()));
    n.position.copy(local);
    n.quaternion.copy(nut.quaternion);
    const out = (nut.userData.normal as THREE.Vector3).clone();
    this.root.add(n);
    this.falling.push({ mesh: n, vel: out.multiplyScalar(0.55).add(new THREE.Vector3(0, 0.6, 0)), t: 0, spin: 18 });
  }

  private stepFalling(dt: number): void {
    const floor = this.groundY() - this.machine.jackLift() + 0.012;
    for (let i = this.falling.length - 1; i >= 0; i--) {
      const f = this.falling[i];
      f.t += dt;
      f.vel.y -= 9.8 * dt;
      f.mesh.position.addScaledVector(f.vel, dt);
      f.mesh.rotation.x += f.spin * dt;
      if (f.mesh.position.y < floor) {
        f.mesh.position.y = floor;
        f.vel.set(f.vel.x * 0.3, Math.abs(f.vel.y) * 0.25, f.vel.z * 0.3);
        f.spin *= 0.4;
      }
      // rest a moment on the floor, then tidy away
      if (f.t > 2.5) {
        f.mesh.scale.multiplyScalar(Math.max(0, 1 - dt * 6));
        if (f.t > 3) {
          this.root.remove(f.mesh);
          this.falling.splice(i, 1);
        }
      }
    }
  }

  private groundY(): number {
    if (this.vehicle) {
      const w = this.vehicle.def.wheels[0];
      return w.pos.y - this.vehicle.def.suspension.rest + 0.1 - w.radius;
    }
    return -0.9;
  }

  private syncWheel(vis: SlotVis, v: Vehicle | null, dt: number): void {
    const wv = vis.wheel!;
    const def = vis.def;
    // The sim owns where the hub is (Machine.hubPose); draw it there.
    const hp = this.machine.hubPose.get(def.id);
    wv.pivot.position.set(def.pos.x, def.pos.y + (hp?.dy ?? 0), def.pos.z);
    wv.pivot.rotation.y = hp?.steer ?? 0;
    const st = v && wv.index >= 0 ? v.wheels[wv.index] : null;
    wv.spin.rotation.x = -((st && !v!.pinned ? st.spin : 0) + this.spinBase);
    const it = vis.item;
    const bad = vis.cond.startsWith('bad');
    const target = it !== null && bad && !(def.lift && this.machine.jackRaised(def.lift)) ? 0.84 : 1;
    wv.squash.scale.y += (target - wv.squash.scale.y) * Math.min(1, dt * 5);
    wv.squash.position.y = -(1 - wv.squash.scale.y) * 0.37 * 0.5;
  }

  /** For the vehicle view: continuous wheel spin while driving. */
  addSpin(d: number): void {
    this.spinBase += d;
  }

  /** The object to outline for a focus target. */
  targetObject(kind: string, id: string): THREE.Object3D | null {
    switch (kind) {
      case 'bolt': {
        const [slot, i] = id.split('#');
        return this.slots.get(slot)?.nuts[Number(i)] ?? null;
      }
      case 'slot': {
        const v = this.slots.get(id);
        return v?.obj ?? v?.wheel?.pivot ?? v?.group ?? null;
      }
      case 'cover':
        return this.model?.hood ?? this.root.getObjectByName(`cover:${id}`) ?? null;
      case 'term': {
        const [tid, which] = id.split('.');
        const c = this.clamps.get(tid);
        return c ? (which === 'pos' ? c.pos : c.neg) : null;
      }
      case 'panel':
        return this.panels.get(id)?.group ?? null;
      case 'fluid':
        return this.caps.get(id)?.cap ?? null;
      case 'jack':
        return this.jacks.get(id)?.obj ?? null;
      case 'inspect':
        return this.model?.root ?? this.root;
      default:
        return null;
    }
  }

  /** World matrix where a part would sit in a slot. */
  slotMatrix(def: SlotDef): THREE.Matrix4 {
    const v = this.slots.get(def.id)!;
    if (v.wheel) {
      v.wheel.pivot.updateWorldMatrix(true, false);
      const r = new THREE.Matrix4().makeRotationZ(v.wheel.side < 0 ? Math.PI / 2 : -Math.PI / 2);
      return v.wheel.pivot.matrixWorld.clone().multiply(r);
    }
    v.group.updateWorldMatrix(true, false);
    return v.group.matrixWorld.clone();
  }

  ghostModel(def: SlotDef, item: { kind: string; cond: 'good' | 'bad'; fill: number; variant?: string }): THREE.Object3D {
    if (def.accepts === 'wheel') {
      const r = this.model?.wheel;
      return wheelModel(r?.radius ?? 0.37, r?.width ?? 0.26, item.variant ?? r?.variant ?? 'truck', false);
    }
    return itemModel(item as Parameters<typeof itemModel>[0]);
  }

  /** Where a jack would stand under a jack point (world). */
  jackMatrix(id: string): THREE.Matrix4 {
    const j = this.jacks.get(id)!;
    const local = new THREE.Matrix4().makeTranslation(j.obj.position.x, this.groundY() + 0.1, j.obj.position.z);
    this.root.updateWorldMatrix(true, false);
    return this.root.matrixWorld.clone().multiply(local);
  }
}

/** 3D puzzle panel: a fuse grid or a valve manifold. */
export class PanelVis {
  readonly group = new THREE.Group();
  /** Clickable meshes (userData.index / userData.kind). */
  readonly hits: THREE.Object3D[] = [];
  private leds: THREE.MeshStandardMaterial[] = [];
  private fuses: THREE.Mesh[] = [];
  private valves: THREE.Group[] = [];
  private needles: THREE.Object3D[] = [];
  private lidPivot: THREE.Group;
  private lidT = 0;
  private flash = 0;

  constructor(
    readonly def: PanelDef,
    private machine: Machine,
  ) {
    const g = this.group;
    g.position.set(def.pos.x, def.pos.y, def.pos.z);
    const n = new THREE.Vector3(def.normal.x, def.normal.y, def.normal.z);
    g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
    const housing = mesh(rbox(0.34, 0.3, 0.08, 0.02), styl({ color: 0x2c2f36, rough: 0.6 }));
    housing.position.z = -0.03;
    g.add(housing);
    this.lidPivot = new THREE.Group();
    this.lidPivot.position.set(0, 0.15, 0.02);
    const lid = mesh(rbox(0.34, 0.3, 0.02, 0.015), styl({ color: 0x3a3d45, rough: 0.5 }));
    lid.position.y = -0.15;
    this.lidPivot.add(lid);
    // a proper cover: hinge barrel, a latch, and a label you can read
    const hinge = mesh(cyl(0.012, 0.012, 0.3, 10), MAT.darkMetal());
    hinge.rotation.z = Math.PI / 2;
    this.lidPivot.add(hinge);
    const latch = mesh(rbox(0.06, 0.025, 0.02, 0.006), MAT.chrome());
    latch.position.set(0, -0.285, 0.015);
    this.lidPivot.add(latch);
    const label = mesh(
      new THREE.PlaneGeometry(0.22, 0.07),
      styl({ map: textTexture([{ text: def.puzzle === 'fuse' ? 'FUSES' : 'VALVES', size: 70, color: '#f3e9cf', y: 64 }], 256, 96, '#c0392b'), rough: 0.6, noise: 0 }),
    );
    label.position.set(0, -0.12, 0.0115);
    this.lidPivot.add(label);
    g.add(this.lidPivot);

    if (def.puzzle === 'fuse') {
      const size = def.size ?? 3;
      for (let i = 0; i < size * size; i++) {
        const r = Math.floor(i / size);
        const c = i % size;
        const x = (c - (size - 1) / 2) * 0.085;
        const y = ((size - 1) / 2 - r) * 0.075;
        const slot = mesh(rbox(0.06, 0.05, 0.02, 0.008), styl({ color: 0x15161a, rough: 0.8 }));
        slot.position.set(x, y, 0.005);
        g.add(slot);
        const fuse = mesh(rbox(0.036, 0.036, 0.03, 0.008), styl({ color: 0xe8e2d0, rough: 0.4 }));
        fuse.position.set(x, y, 0.02);
        fuse.userData = { index: i, kind: 'fuse' };
        g.add(fuse);
        this.fuses.push(fuse);
        this.hits.push(fuse);
        const led = styl({ color: 0x222222, emissive: 0xff3b2f, emissiveIntensity: 1.5, rough: 0.4, noise: 0 });
        const l = mesh(cyl(0.007, 0.007, 0.006, 8), led);
        l.rotation.x = Math.PI / 2;
        l.position.set(x + 0.022, y + 0.018, 0.017);
        g.add(l);
        this.leds.push(led);
      }
    } else {
      const count = def.size ?? 3;
      for (let i = 0; i < count; i++) {
        const x = (i - (count - 1) / 2) * 0.1;
        // gauge
        const face = mesh(cyl(0.035, 0.035, 0.01, 20), styl({ color: 0xf1e6cc, rough: 0.5 }));
        face.rotation.x = Math.PI / 2;
        face.position.set(x, 0.06, 0.01);
        g.add(face);
        const band = mesh(torus(0.028, 0.004, 4, 20, 0.6), styl({ color: 0x43b26a, emissive: 0x2a8a4a, emissiveIntensity: 0.6, rough: 0.5 }));
        band.position.set(x, 0.06, 0.017);
        band.rotation.z = Math.PI / 2 - 0.3;
        g.add(band);
        const needle = mesh(rbox(0.004, 0.03, 0.003, 0.001), styl({ color: 0xd9463b, rough: 0.5 }));
        needle.geometry = rbox(0.004, 0.03, 0.003, 0.001);
        const np = new THREE.Group();
        np.position.set(x, 0.06, 0.02);
        needle.position.y = 0.013;
        np.add(needle);
        g.add(np);
        this.needles.push(np);
        // valve wheel
        const valve = new THREE.Group();
        valve.position.set(x, -0.06, 0.03);
        const wheel = mesh(torus(0.035, 0.008, 6, 18), styl({ color: 0xd9463b, rough: 0.45, metal: 0.3 }));
        valve.add(wheel);
        for (let k = 0; k < 3; k++) {
          const sp = mesh(rbox(0.07, 0.008, 0.006, 0.002), styl({ color: 0xd9463b, rough: 0.45 }));
          sp.rotation.z = (k / 3) * Math.PI;
          valve.add(sp);
        }
        const hit = mesh(cyl(0.045, 0.045, 0.03, 12), styl({ color: 0, transparent: true, opacity: 0, depthWrite: false }));
        hit.rotation.x = Math.PI / 2;
        hit.userData = { index: i, kind: 'valve' };
        valve.add(hit);
        this.hits.push(hit);
        g.add(valve);
        this.valves.push(valve);
      }
      const lever = mesh(rbox(0.03, 0.08, 0.03, 0.01), styl({ color: 0xf4c430, rough: 0.5 }));
      lever.position.set(0.15, -0.1, 0.03);
      lever.userData = { kind: 'commit' };
      g.add(lever);
      this.hits.push(lever);
    }
    g.traverse((o) => {
      if (o instanceof THREE.Mesh) o.castShadow = false;
    });
  }

  sync(dt: number, time: number, accessible: boolean): void {
    const solved = this.machine.state.panels[this.def.id];
    this.lidT += ((accessible ? 1 : 0) - this.lidT) * Math.min(1, dt * 6);
    this.lidPivot.rotation.x = -this.lidT * 1.9;
    this.flash = Math.max(0, this.flash - dt);
    if (this.def.puzzle === 'fuse') {
      const f = this.machine.fuse.get(this.def.id);
      if (!f) return;
      f.lit.forEach((on, i) => {
        const led = this.leds[i];
        const ok = on || solved;
        led.emissive.setHex(ok ? 0x3cff7a : 0xff3b2f);
        led.emissiveIntensity = ok ? 1.8 : 1.1 + Math.sin(time * 6 + i) * 0.4;
        this.fuses[i].position.z = 0.02 + (ok ? 0 : 0.008);
      });
    } else {
      const v = this.machine.valve.get(this.def.id);
      if (!v) return;
      const r = readings(v);
      r.forEach((val, i) => {
        const np = this.needles[i];
        const target = -(val - SAFE_TARGET) * 3.2;
        np.rotation.z += (target - np.rotation.z) * Math.min(1, dt * 8);
        this.valves[i].rotation.z = -v.valves[i] * Math.PI * 1.6;
      });
    }
  }
}
