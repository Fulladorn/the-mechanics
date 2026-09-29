import type { Quat, Vec3 } from '../shared/math';
import { qIdentity } from '../shared/math';
import { G, Physics, RAPIER, groups, toQuat, toVec, type RBody } from './physics';

// Everything the player can pick up. Three ways to carry a thing:
//   belt   — tools and consumables, on the 4-slot toolbelt
//   hands  — parts and gear, carried in front of you (one at a time)
//   pocket — keys; no slot, just "you have it"
// Items on the ground are real dynamic bodies: drop a wheel and it thuds,
// throw a battery and it tumbles.

export type ItemKind =
  | 'wrench'
  | 'flashlight'
  | 'flare'
  | 'medkit'
  | 'key'
  | 'wheel'
  | 'battery'
  | 'jack'
  | 'chock'
  | 'jerrycan'
  | 'fuelHose'
  | 'radiatorHose'
  | 'coolant'
  | 'fuse'
  | 'winch'
  | 'lightbar'
  | 'tire'
  | 'crate'
  | 'cone';

export type Carry = 'belt' | 'hands' | 'pocket';

export type ItemShape =
  | { t: 'box'; hx: number; hy: number; hz: number }
  | { t: 'cyl'; r: number; hh: number };

export interface ItemDef {
  kind: ItemKind;
  label: string;
  carry: Carry;
  /** Slows you down, no sprinting, lower jumps. */
  heavy: boolean;
  mass: number;
  shape: ItemShape;
  /** Short line for the prompt / job sheet. */
  blurb?: string;
  /** Label used when the item is a broken one. */
  badLabel?: string;
  /** Containers: what they hold. */
  fluid?: 'fuel' | 'coolant';
}

const box = (hx: number, hy: number, hz: number): ItemShape => ({ t: 'box', hx, hy, hz });

export const ITEM_DEFS: Record<ItemKind, ItemDef> = {
  wrench: { kind: 'wrench', label: 'Ratchet Wrench', carry: 'belt', heavy: false, mass: 1.2, shape: box(0.2, 0.03, 0.05), blurb: 'Hold LMB on a bolt to loosen or torque it.' },
  flashlight: { kind: 'flashlight', label: 'Flashlight', carry: 'belt', heavy: false, mass: 0.6, shape: box(0.05, 0.05, 0.14), blurb: 'F to toggle.' },
  flare: { kind: 'flare', label: 'Road Flare', carry: 'belt', heavy: false, mass: 0.3, shape: box(0.03, 0.03, 0.14), blurb: 'LMB to light. Wolves hate it.' },
  medkit: { kind: 'medkit', label: 'First-Aid Kit', carry: 'belt', heavy: false, mass: 0.8, shape: box(0.14, 0.06, 0.1), blurb: 'LMB to patch yourself up.' },
  key: { kind: 'key', label: 'Key', carry: 'pocket', heavy: false, mass: 0.05, shape: box(0.03, 0.01, 0.05) },
  wheel: { kind: 'wheel', label: 'Wheel', badLabel: 'Shredded Wheel', carry: 'hands', heavy: true, mass: 22, shape: { t: 'cyl', r: 0.38, hh: 0.13 } },
  tire: { kind: 'tire', label: 'Old Tire', carry: 'hands', heavy: true, mass: 12, shape: { t: 'cyl', r: 0.36, hh: 0.12 } },
  battery: { kind: 'battery', label: 'Battery', badLabel: 'Dead Battery', carry: 'hands', heavy: true, mass: 16, shape: box(0.16, 0.12, 0.1) },
  jack: { kind: 'jack', label: 'Trolley Jack', carry: 'hands', heavy: true, mass: 14, shape: box(0.14, 0.1, 0.34) },
  chock: { kind: 'chock', label: 'Wheel Chock', carry: 'hands', heavy: false, mass: 3, shape: box(0.1, 0.08, 0.17) },
  jerrycan: { kind: 'jerrycan', label: 'Jerry Can', carry: 'hands', heavy: true, mass: 4, shape: box(0.09, 0.2, 0.17), fluid: 'fuel' },
  coolant: { kind: 'coolant', label: 'Coolant Jug', carry: 'hands', heavy: false, mass: 3, shape: box(0.09, 0.14, 0.09), fluid: 'coolant' },
  fuelHose: { kind: 'fuelHose', label: 'Fuel Line', badLabel: 'Split Fuel Line', carry: 'hands', heavy: false, mass: 1, shape: box(0.28, 0.04, 0.04) },
  radiatorHose: { kind: 'radiatorHose', label: 'Radiator Hose', badLabel: 'Split Radiator Hose', carry: 'hands', heavy: false, mass: 1, shape: box(0.24, 0.05, 0.05) },
  fuse: { kind: 'fuse', label: 'Fuse Pack', carry: 'hands', heavy: false, mass: 0.2, shape: box(0.06, 0.02, 0.04) },
  winch: { kind: 'winch', label: 'Recovery Winch', carry: 'hands', heavy: true, mass: 20, shape: box(0.3, 0.12, 0.12) },
  lightbar: { kind: 'lightbar', label: 'Roof Light Bar', carry: 'hands', heavy: false, mass: 5, shape: box(0.5, 0.05, 0.08) },
  crate: { kind: 'crate', label: 'Sealed Crate', carry: 'hands', heavy: true, mass: 18, shape: box(0.25, 0.2, 0.2) },
  cone: { kind: 'cone', label: 'Traffic Cone', carry: 'hands', heavy: false, mass: 1.2, shape: { t: 'cyl', r: 0.17, hh: 0.3 } },
};

export type ItemState = 'world' | 'held' | 'belt' | 'pocket' | 'mounted' | 'racked' | 'gone';

export interface WorldItem {
  id: number;
  kind: ItemKind;
  /** Render variant, e.g. 'truck' vs 'offroad' wheels. */
  variant?: string;
  cond: 'good' | 'bad';
  /** Containers: 0..1 full. */
  fill: number;
  /** Keys: which lock this opens. */
  tag?: string;
  state: ItemState;
  pos: Vec3;
  rot: Quat;
  /** Sleeping on the ground (render may skip updates). */
  asleep: boolean;
  /** Lock-gated items stay hidden until the named flag is set. */
  hiddenUntil?: string;
  /** Pre-placed items sit fixed (on shelves) until first picked up. */
  pinned?: boolean;
}

export interface ItemSpawn {
  kind: ItemKind;
  pos: Vec3;
  yaw?: number;
  variant?: string;
  cond?: 'good' | 'bad';
  fill?: number;
  tag?: string;
  hiddenUntil?: string;
  /** Start as a sleeping body placed exactly here (shelves, benches). */
  pinned?: boolean;
  /** Spawn straight into a machine slot (see machine.ts) instead of the world. */
  mounted?: boolean;
}

export const itemLabel = (it: WorldItem): string => {
  const d = ITEM_DEFS[it.kind];
  if (it.kind === 'key') return it.tag ? `${it.tag} key` : 'Key';
  if (it.cond === 'bad' && d.badLabel) return d.badLabel;
  if (d.fluid) return `${d.label} (${it.fill > 0.95 ? 'full' : it.fill < 0.02 ? 'empty' : Math.round(it.fill * 100) + '%'})`;
  return d.label;
};

export class ItemManager {
  readonly list: WorldItem[] = [];
  private bodies = new Map<number, RBody>();
  private nextId = 1;

  constructor(private phys: Physics) {}

  get(id: number | null | undefined): WorldItem | undefined {
    if (id == null) return undefined;
    return this.list.find((i) => i.id === id);
  }

  spawn(s: ItemSpawn): WorldItem {
    const def = ITEM_DEFS[s.kind];
    const it: WorldItem = {
      id: this.nextId++,
      kind: s.kind,
      variant: s.variant,
      cond: s.cond ?? 'good',
      fill: s.fill ?? (def.fluid ? 0 : 0),
      tag: s.tag,
      state: s.mounted ? 'mounted' : 'world',
      pos: { ...s.pos },
      rot: s.yaw ? { x: 0, y: Math.sin(s.yaw / 2), z: 0, w: Math.cos(s.yaw / 2) } : qIdentity(),
      asleep: !!s.pinned,
      hiddenUntil: s.hiddenUntil,
      pinned: s.pinned,
    };
    this.list.push(it);
    if (it.state === 'world' && !it.hiddenUntil) this.makeBody(it, { x: 0, y: 0, z: 0 });
    return it;
  }

  /** Reveal lock-gated items once their flag is set. */
  reveal(flag: string): void {
    for (const it of this.list) {
      if (it.hiddenUntil !== flag) continue;
      it.hiddenUntil = undefined;
      if (it.state === 'world' && !this.bodies.has(it.id)) this.makeBody(it, { x: 0, y: 0, z: 0 });
    }
  }

  visible(it: WorldItem): boolean {
    return it.state === 'world' && !it.hiddenUntil;
  }

  private makeBody(it: WorldItem, vel: Vec3, angvel?: Vec3): void {
    const def = ITEM_DEFS[it.kind];
    const desc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(it.pos.x, it.pos.y, it.pos.z)
      .setRotation(it.rot)
      .setLinvel(vel.x, vel.y, vel.z)
      .setLinearDamping(0.08)
      .setAngularDamping(0.6)
      .setCcdEnabled(true);
    if (angvel) desc.setAngvel(angvel);
    const body = this.phys.createBody(desc);
    const sh = def.shape;
    const cdesc =
      sh.t === 'box'
        ? RAPIER.ColliderDesc.roundCuboid(Math.max(0.01, sh.hx - 0.015), Math.max(0.01, sh.hy - 0.015), Math.max(0.01, sh.hz - 0.015), 0.015)
        : RAPIER.ColliderDesc.roundCylinder(Math.max(0.01, sh.hh - 0.03), Math.max(0.02, sh.r - 0.03), 0.03);
    cdesc
      .setMass(def.mass + (def.fluid ? it.fill * 16 : 0))
      .setFriction(0.8)
      .setRestitution(0.15)
      .setCollisionGroups(groups(G.ITEM, G.STATIC | G.VEHICLE | G.ITEM | G.PLAYER | G.DOOR));
    this.phys.attach(cdesc, body, { surface: 'metal', owner: `item:${it.id}` });
    if (it.pinned) body.sleep();
    this.bodies.set(it.id, body);
  }

  private dropBody(it: WorldItem): void {
    const b = this.bodies.get(it.id);
    if (!b) return;
    this.phys.removeBody(b);
    this.bodies.delete(it.id);
  }

  /** Lift an item out of the world (into hands, belt, pocket, a slot...). */
  take(it: WorldItem, state: ItemState): void {
    this.dropBody(it);
    it.state = state;
    it.pinned = false;
    it.asleep = false;
  }

  /** Put an item back into the world as a live body. */
  release(it: WorldItem, pos: Vec3, rot: Quat, vel: Vec3, angvel?: Vec3): void {
    this.dropBody(it);
    it.state = 'world';
    it.pos = { ...pos };
    it.rot = { ...rot };
    it.asleep = false;
    it.pinned = false;
    this.makeBody(it, vel, angvel);
  }

  /** Move a world item somewhere (teleport), keeping it physical. */
  place(it: WorldItem, pos: Vec3, rot?: Quat): void {
    it.pos = { ...pos };
    if (rot) it.rot = { ...rot };
    const b = this.bodies.get(it.id);
    if (b) {
      b.setTranslation(pos, true);
      if (rot) b.setRotation(rot, true);
      b.setLinvel({ x: 0, y: 0, z: 0 }, true);
      b.setAngvel({ x: 0, y: 0, z: 0 }, true);
    }
  }

  /** Copy body transforms back after a physics step. */
  sync(): void {
    for (const [id, b] of this.bodies) {
      const it = this.get(id);
      if (!it) continue;
      it.asleep = b.isSleeping();
      if (it.asleep) continue;
      it.pos = toVec(b.translation());
      it.rot = toQuat(b.rotation());
      // Anything that falls out of the world comes back to where it can be found.
      if (it.pos.y < -200) b.setTranslation({ x: it.pos.x, y: 50, z: it.pos.z }, true);
    }
  }

  /** Nudge a resting item (e.g. a vehicle bumped it). */
  wake(id: number): void {
    this.bodies.get(id)?.wakeUp();
  }

  hasBody(id: number): boolean {
    return this.bodies.has(id);
  }
}
