import type { Vec3 } from '../shared/math';
import { clamp, dist2D, qYaw, vnorm, yawForward } from '../shared/math';
import type { BeatDef, DoorDef, LevelDef, MachinePlacement, StationDef } from '../content/levels/types';
import type { FailReason, SimEvent } from './events';
import { DEFAULT_HAZARDS, applyDamage, fallDamage, heal, makeVitals, stepHazards, type HazardDef, type Vitals } from './hazards';
import { INTERACT_REACH, pickFocus, type Interactable } from './interact';
import { ITEM_DEFS, ItemManager, itemLabel, type ItemKind, type ItemSpawn, type WorldItem } from './items';
import { Machine, type MachineCtx, type Step } from './machine';
import { G, Physics, RAPIER, initRapier, type RCollider } from './physics';
import { BELT_SLOTS, Player } from './player';
import { Terrain } from './terrain';
import { Vehicle } from './vehicle';
import { WOLF, makeWolf, stepWolf, strikeWolf, type CombatEvent, type Wolf } from './combat';

// The game world: one level's worth of physics, player, items, machines,
// vehicles, wolves, hazards and the mission director. DOM-free — the browser
// client and the headless tests drive it identically.

export interface Intent {
  fwd: boolean;
  back: boolean;
  left: boolean;
  right: boolean;
  jump: boolean;
  crouch: boolean;
  sprint: boolean;
  yaw: number;
  pitch: number;
  /** E held. */
  interact: boolean;
  /** LMB held. */
  use: boolean;
  /** RMB held. */
  block: boolean;
  /** G held (tap drops, hold charges a throw). */
  drop: boolean;
}

export const makeIntent = (): Intent => ({
  fwd: false,
  back: false,
  left: false,
  right: false,
  jump: false,
  crouch: false,
  sprint: false,
  yaw: 0,
  pitch: 0,
  interact: false,
  use: false,
  block: false,
  drop: false,
});

export type Command =
  | { t: 'slot'; n: number }
  | { t: 'cycle'; dir: number }
  | { t: 'flashlight' }
  | { t: 'lights' }
  | { t: 'horn' }
  | { t: 'unflip' }
  | { t: 'fuse'; index: number }
  | { t: 'valve'; index: number; value: number }
  | { t: 'commitValves' }
  | { t: 'closePanel' };

interface Door {
  def: DoorDef;
  collider: RCollider;
  open: boolean;
  /** 0..1 swing, for the renderer. */
  swing: number;
}

interface Flare {
  pos: Vec3;
  ttl: number;
}

/** How many things fit on an ATV's cargo rack. */
export const RACK_MAX = 4;

export interface WorldOpts {
  /** Accessibility: wider torque bands. */
  assist?: boolean;
}

export class World {
  readonly terrain: Terrain;
  readonly phys: Physics;
  readonly items: ItemManager;
  readonly player: Player;
  readonly vitals: Vitals;
  readonly machines = new Map<string, Machine>();
  readonly vehicles = new Map<string, Vehicle>();
  readonly placements = new Map<string, MachinePlacement>();
  readonly doors = new Map<string, Door>();
  readonly wolves: Wolf[] = [];
  private wolfAfter = new Map<number, string>();
  /** Colliders switched on (or off) by a flag. */
  private gated: { c: RCollider; flag: string; on: boolean }[] = [];
  /** Last checkpoint beat reached. */
  checkpoint: string | null = null;
  readonly flags = new Set<string>();
  readonly lore = new Set<string>();
  flares: Flare[] = [];
  events: SimEvent[] = [];

  elapsed = 0;
  hour: number;
  private hourTarget: number | null = null;
  beat = 0;
  private beatStarted = false;
  beatTime = 0;
  private hintsFired = new Set<string>();
  private triggersFired = new Set<string>();
  ended: 'won' | 'failed' | null = null;
  failReason: FailReason | null = null;
  damageTaken = 0;

  /** What the crosshair is on (recomputed every step). */
  focus: Interactable | null = null;
  /** Progress of the current hold (E or LMB), 0..1. */
  holdProgress = 0;
  private holdId: string | null = null;
  private holdLatch = false;
  /** After a loosen completes, LMB must be let go before it does anything else. */
  private useLatch = false;
  private torquing: Interactable | null = null;
  private prev: Intent = makeIntent();
  dropCharge = 0;
  /** Open puzzle panel. */
  panel: { machine: string; panel: string } | null = null;
  swingCooldown = 0;
  private hazardDef: Required<HazardDef>;
  private opts: WorldOpts;
  readonly ctx: MachineCtx;

  static async create(level: LevelDef, opts: WorldOpts = {}): Promise<World> {
    await initRapier();
    return new World(level, opts);
  }

  private constructor(
    readonly level: LevelDef,
    opts: WorldOpts,
  ) {
    this.opts = opts;
    this.hour = level.hour;
    this.hazardDef = { ...DEFAULT_HAZARDS, ...(level.hazards ?? {}) };
    this.terrain = Terrain.for(level.terrain);
    this.phys = new Physics();
    this.phys.addTerrain(this.terrain);
    for (const s of level.statics) {
      const c = this.phys.addStatic(s);
      if (s.flag) {
        c.setEnabled(false);
        this.gated.push({ c, flag: s.flag, on: true });
      }
      if (s.unflag) this.gated.push({ c, flag: s.unflag, on: false });
    }
    this.items = new ItemManager(this.phys);
    this.vitals = makeVitals();
    this.player = new Player(this.phys, level.spawn.pos, level.spawn.yaw);

    this.ctx = {
      items: this.items,
      held: () => this.items.get(this.player.held),
      hasTool: (k) => this.hasItem(k),
      takeHeld: () => {
        const it = this.items.get(this.player.held);
        this.player.held = null;
        return it;
      },
      giveHands: (it) => this.giveHands(it),
      emit: (e) => this.events.push(e),
      hurt: (n, cause) => this.hurt(n, cause),
      openPanel: (m, id) => this.openPanel(m, id),
      flag: (n) => this.flags.has(n),
      get assist() {
        return !!opts.assist;
      },
    };

    for (const pl of level.machines) this.addMachine(pl);
    for (const s of level.items) if (!s.mounted) this.items.spawn(s);
    for (const d of level.doors ?? []) this.addDoor(d);
    (level.wolves ?? []).forEach((w, i) => {
      const pos = { ...w.pos, y: this.terrain.heightAt(w.pos.x, w.pos.z) };
      const wolf = makeWolf(i + 1, pos, level.terrain.seed);
      this.wolves.push(wolf);
      if (w.after) this.wolfAfter.set(wolf.id, w.after);
    });
  }

  private addMachine(pl: MachinePlacement): void {
    const m = new Machine(pl.def, pl.key, pl.pos, qYaw(pl.yaw));
    for (const [slot, spec] of Object.entries(pl.mounts ?? {})) {
      const it = this.items.spawn({ ...spec, mounted: true });
      m.mount(slot, it, spec.bolts ?? 'tight');
    }
    for (const id of pl.terminalsOff ?? []) m.state.terminals[id] = { pos: false, neg: false };
    this.machines.set(pl.key, m);
    this.placements.set(pl.key, pl);
    if (pl.vehicle) {
      const v = new Vehicle(pl.vehicle, pl.key, this.phys, pl.pos, pl.yaw, m);
      this.vehicles.set(pl.key, v);
    }
  }

  private addDoor(d: DoorDef): void {
    const cx = d.hinge.x + Math.cos(d.yaw) * (d.width / 2);
    const cz = d.hinge.z - Math.sin(d.yaw) * (d.width / 2);
    const collider = this.phys.addStatic({
      shape: 'box',
      pos: { x: cx, y: d.hinge.y + d.height / 2, z: cz },
      size: { x: d.width / 2, y: d.height / 2, z: 0.05 },
      yaw: d.yaw,
      surface: 'wood',
      owner: `door:${d.id}`,
    });
    const open = !!d.open;
    collider.setEnabled(!open);
    this.doors.set(d.id, { def: d, collider, open, swing: open ? 1 : 0 });
  }

  // --- content API --------------------------------------------------------------

  flag(name: string): boolean {
    return this.flags.has(name);
  }

  setFlag(name: string): void {
    if (this.flags.has(name)) return;
    this.flags.add(name);
    this.items.reveal(name);
    for (const g of this.gated) if (g.flag === name) g.c.setEnabled(g.on);
    this.events.push({ t: 'flag', name });
  }

  say(line: string, who = 'Dispatch', priority = 1): void {
    if (line) this.events.push({ t: 'say', line, who, priority });
  }

  stamp(text: string, sub?: string, tone: 'good' | 'warn' | 'bad' = 'good'): void {
    this.events.push({ t: 'stamp', text, sub, tone });
  }

  toast(text: string): void {
    this.events.push({ t: 'toast', text });
  }

  sfx(name: string, pos?: Vec3, vol?: number): void {
    this.events.push({ t: 'sfx', name, pos, vol });
  }

  machine(key: string): Machine {
    const m = this.machines.get(key);
    if (!m) throw new Error(`no machine ${key}`);
    return m;
  }

  vehicle(key: string): Vehicle {
    const v = this.vehicles.get(key);
    if (!v) throw new Error(`no vehicle ${key}`);
    return v;
  }

  systemOk(machine: string, system: string): boolean {
    return this.machine(machine).systemOk(system, this.items);
  }

  /** Player (or their vehicle) within r metres of p (xz). */
  near(p: Vec3, r: number): boolean {
    return dist2D(this.playerPos(), p) <= r;
  }

  playerPos(): Vec3 {
    if (this.player.mode === 'drive' && this.player.vehicle) return this.vehicle(this.player.vehicle).pos;
    return this.player.pos;
  }

  spawnItem(s: ItemSpawn): WorldItem {
    return this.items.spawn(s);
  }

  /** In hands, on the belt or in a pocket. */
  hasItem(kind: ItemKind, tag?: string): boolean {
    const p = this.player;
    if (kind === 'key') return p.pockets.some((k) => k.kind === 'key' && (!tag || k.tag === tag));
    const held = this.items.get(p.held);
    if (held?.kind === kind) return true;
    return p.belt.some((id) => this.items.get(id)?.kind === kind);
  }

  /** In hand, on the belt, or strapped to a vehicle rack. */
  carrying(kind: ItemKind, good = true): boolean {
    const p = this.player;
    const ok = (it: WorldItem | undefined) => !!it && it.kind === kind && (!good || it.cond === 'good');
    if (ok(this.items.get(p.held))) return true;
    if (p.belt.some((id) => ok(this.items.get(id)))) return true;
    for (const v of this.vehicles.values()) if (v.rack.some((id) => ok(this.items.get(id)))) return true;
    return false;
  }

  heldItem(): WorldItem | undefined {
    return this.items.get(this.player.held);
  }

  /** Nearest loose item of a kind (optionally only good ones). */
  nearestItem(kind: ItemKind, good = true, emptyOk = false): WorldItem | undefined {
    const p = this.playerPos();
    let best: WorldItem | undefined;
    let bd = Infinity;
    for (const it of this.items.list) {
      if (it.kind !== kind || !this.items.visible(it)) continue;
      if (good && it.cond !== 'good') continue;
      if (ITEM_DEFS[kind].fluid && it.fill < 0.05 && !emptyOk) continue;
      const d = Math.hypot(it.pos.x - p.x, it.pos.z - p.z);
      if (d < bd) {
        bd = d;
        best = it;
      }
    }
    return best;
  }

  /** Run `fn` the first time `flag` is claimed. */
  once(flag: string, fn: () => void): void {
    if (this.flags.has(flag)) return;
    this.setFlag(flag);
    fn();
  }

  collectLore(id: string): void {
    if (this.lore.has(id)) return;
    this.lore.add(id);
    const def = this.level.lore?.find((l) => l.id === id);
    this.events.push({ t: 'lore', id, title: def?.title ?? id });
  }

  openDoor(id: string, open = true): void {
    const d = this.doors.get(id);
    if (!d || d.open === open) return;
    d.open = open;
    d.collider.setEnabled(!open);
    const pos = { x: d.def.hinge.x, y: d.def.hinge.y + 1, z: d.def.hinge.z };
    this.events.push({ t: 'door', id, open, pos });
  }

  /** Current objective. */
  currentBeat(): BeatDef | undefined {
    return this.level.beats[this.beat];
  }

  objectiveText(): { text: string; detail: string | null } | null {
    const b = this.currentBeat();
    if (!b) return null;
    const text = typeof b.text === 'function' ? b.text(this) : b.text;
    const detail = b.detail ? (typeof b.detail === 'function' ? b.detail(this) : b.detail) : null;
    return { text, detail };
  }

  marker(): Vec3 | null {
    return this.currentBeat()?.marker?.(this) ?? null;
  }

  // --- inventory ------------------------------------------------------------------

  private giveHands(it: WorldItem): boolean {
    if (this.player.held !== null) return false;
    this.items.take(it, 'held');
    this.player.held = it.id;
    this.events.push({ t: 'pickup', item: it.id, kind: it.kind, heavy: ITEM_DEFS[it.kind].heavy });
    return true;
  }

  private pickUp(it: WorldItem): void {
    const def = ITEM_DEFS[it.kind];
    const p = this.player;
    if (def.carry === 'pocket') {
      this.items.take(it, 'pocket');
      p.pockets.push({ kind: it.kind, tag: it.tag });
      this.events.push({ t: 'pocket', kind: it.kind, tag: it.tag });
      return;
    }
    if (def.carry === 'belt') {
      const slot = p.belt.indexOf(null);
      if (slot < 0) return;
      this.items.take(it, 'belt');
      p.belt[slot] = it.id;
      // Picking up a tool selects it: you grabbed it to use it.
      p.sel = slot;
      this.events.push({ t: 'belt', item: it.id, kind: it.kind, slot });
      return;
    }
    this.giveHands(it);
  }

  /** Drop (power 0) or throw (power 0..1) what's in hand, or the selected tool. */
  private release(power: number): void {
    const p = this.player;
    let id = p.held;
    let fromBelt = false;
    if (id === null) {
      id = p.belt[p.sel];
      fromBelt = true;
    }
    const it = this.items.get(id);
    if (!it) return;
    const eye = p.eye();
    const dir = p.look();
    const reach = 0.75;
    const hit = this.phys.castRay(eye, dir, reach + 0.3, G.STATIC | G.VEHICLE | G.DOOR);
    const d = hit ? Math.max(0.15, hit.toi - 0.35) : reach;
    const pos = { x: eye.x + dir.x * d, y: eye.y + dir.y * d - 0.25, z: eye.z + dir.z * d };
    const speed = power > 0 ? 3 + power * 9 * (ITEM_DEFS[it.kind].heavy ? 0.55 : 1) : 0.4;
    const vel = { x: p.vel.x + dir.x * speed, y: p.vel.y * 0.5 + dir.y * speed + (power > 0 ? 1.8 : 0), z: p.vel.z + dir.z * speed };
    // Thrown things tumble end over end about the player's right axis.
    const spin = power > 0 ? { x: Math.cos(p.yaw) * -6 * power, y: 0, z: Math.sin(p.yaw) * 6 * power } : undefined;
    this.items.release(it, pos, qYaw(p.yaw), vel, spin);
    if (fromBelt) p.belt[p.sel] = null;
    else p.held = null;
    this.events.push({ t: 'drop', item: it.id, kind: it.kind, thrown: power > 0 });
  }

  selectedTool(): ItemKind | null {
    return this.items.get(this.player.belt[this.player.sel])?.kind ?? null;
  }

  private consumeBelt(kind: ItemKind): boolean {
    const p = this.player;
    const i = p.belt.findIndex((id) => this.items.get(id)?.kind === kind);
    if (i < 0) return false;
    const it = this.items.get(p.belt[i]);
    if (it) it.state = 'gone';
    p.belt[i] = null;
    return true;
  }

  // --- damage -----------------------------------------------------------------------

  hurt(amount: number, cause: string): void {
    if (this.ended) return;
    if (this.level.safe) amount = Math.min(amount, Math.max(0, this.vitals.hp - 25));
    const r = applyDamage(this.vitals, amount);
    if (r.damage <= 0) return;
    this.damageTaken += r.damage;
    this.events.push({ t: 'damage', amount: r.damage, cause });
    if (r.wentDown) this.fail('downed');
  }

  fail(reason: FailReason): void {
    if (this.ended || this.level.safe) return;
    this.ended = 'failed';
    this.failReason = reason;
    this.events.push({ t: 'fail', reason });
  }

  win(): void {
    if (this.ended) return;
    this.ended = 'won';
    this.events.push({ t: 'win' });
  }

  // --- the crosshair ----------------------------------------------------------------

  /**
   * What the current step wants you to use, among the things in reach: the
   * beat's targets, or failing that whatever sits at its marker. Drives the
   * hint glow, and the guidance tests walk the game using only this.
   */
  guide(): Interactable[] {
    const b = this.currentBeat();
    if (!b) return [];
    const cands = this.lastCands;
    const ids = b.targets?.(this);
    if (ids) {
      const set = new Set(ids);
      return cands.filter((c) => set.has(c.id));
    }
    if (ids !== undefined) return []; // explicit null: nothing to highlight
    const mk = this.marker();
    if (!mk) return [];
    return cands.filter((c) => (c.priority ?? 0) >= 0 && Math.hypot(c.pos.x - mk.x, c.pos.y - mk.y, c.pos.z - mk.z) < 0.35);
  }

  private lastCands: Interactable[] = [];

  /** Where a (good) item of this kind is, from the player's point of view. */
  whereIs(kind: ItemKind, good = true, emptyOk = false): { at: 'hands' | 'belt' | 'rack' | 'world' | 'none'; vehicle?: string; item?: WorldItem } {
    const p = this.player;
    const ok = (it: WorldItem | undefined) => !!it && it.kind === kind && (!good || it.cond === 'good');
    const held = this.items.get(p.held);
    if (ok(held)) return { at: 'hands', item: held };
    const belt = p.belt.map((id) => this.items.get(id)).find(ok);
    if (belt) return { at: 'belt', item: belt };
    for (const v of this.vehicles.values()) {
      const r = v.rack.map((id) => this.items.get(id)).find(ok);
      if (r) return { at: 'rack', vehicle: v.key, item: r };
    }
    const it = this.nearestItem(kind, good, emptyOk);
    return it ? { at: 'world', item: it } : { at: 'none' };
  }

  /**
   * The step as the player should hear it: if it needs an item and your
   * hands hold something else, first deal with what you're holding — strap
   * it to a nearby rack, or put it down.
   */
  handsFor(step: Step | null): Step | null {
    if (!step?.need || step.targets.length) return step;
    const held = this.heldItem();
    if (!held || (held.kind === step.need && held.cond === 'good')) return step;
    const what = itemLabel(held).toLowerCase();
    const rack = this.worthKeeping(held) ? this.stowRack() : null;
    if (rack)
      return { text: `Strap the ${what} to the ${rack.def.name ?? 'rack'} (E at the rack) — then: ${step.text.toLowerCase()}`, pos: rack.world(rack.def.rack!), targets: [`vehicle:${rack.key}:rack`] };
    return { text: `Put the ${what} down (G) — then: ${step.text.toLowerCase()}`, pos: step.pos, targets: [] };
  }

  /** A machine step's targets; for "go and get X": X lying about, or the rack it's strapped to. */
  targetsFor(step: Step | null): string[] | null {
    step = this.handsFor(step);
    if (!step) return null;
    if (step.targets.length) return step.targets;
    if (!step.need) return [];
    const w = this.whereIs(step.need);
    if (w.at === 'rack') return [`vehicle:${w.vehicle}:unrack:${w.item!.id}`];
    if (w.at === 'world') return [`item:${w.item!.id}`];
    return [];
  }

  /** Is this worth strapping on and carrying around? Good parts yes; scrap and used tools no. */
  worthKeeping(it: WorldItem): boolean {
    return it.cond === 'good' && it.kind !== 'jack' && it.kind !== 'chock';
  }

  /** The nearest rack with room within `range` m (to stow what's in your hands), or null. */
  stowRack(range = 30): Vehicle | null {
    const p = this.playerPos();
    let best: Vehicle | null = null;
    let bd = range;
    for (const v of this.vehicles.values()) {
      if (!v.def.rack || v.rack.length >= RACK_MAX) continue;
      const d = Math.hypot(v.pos.x - p.x, v.pos.z - p.z);
      if (d < bd) {
        bd = d;
        best = v;
      }
    }
    return best;
  }

  /** Waypoint for a machine step: the part to fetch (or its rack), else where to work. */
  markerFor(step: Step | null): Vec3 | null {
    step = this.handsFor(step);
    if (!step) return null;
    if (step.need && !step.targets.length) {
      const w = this.whereIs(step.need);
      if (w.at === 'rack' || w.at === 'world') return w.item!.pos;
    }
    return step.pos ?? null;
  }

  private candidates(): Interactable[] {
    const out: Interactable[] = [];
    const p = this.player;
    const eye = p.eye();
    const reach = INTERACT_REACH;
    const held = this.items.get(p.held);

    // Items lying about.
    for (const it of this.items.list) {
      if (!this.items.visible(it)) continue;
      if (Math.hypot(it.pos.x - eye.x, it.pos.y - eye.y, it.pos.z - eye.z) > reach + 1) continue;
      const def = ITEM_DEFS[it.kind];
      const sh = def.shape;
      const r = sh.t === 'box' ? Math.max(sh.hx, sh.hy, sh.hz) + 0.05 : sh.r + 0.03;
      let disabled: string | undefined;
      if (def.carry === 'hands' && held) disabled = 'Hands full (G to drop)';
      if (def.carry === 'belt' && !p.belt.includes(null)) disabled = 'Toolbelt full';
      out.push({
        id: `item:${it.id}`,
        pos: it.pos,
        r,
        label: `Pick up ${itemLabel(it)}`,
        verb: 'tap',
        priority: 0,
        disabled,
        target: `item:${it.id}`,
        run: () => this.pickUp(it),
      });
    }

    // Machines (vehicles under repair, donors).
    for (const m of this.machines.values()) {
      if (Math.hypot(m.pos.x - eye.x, m.pos.z - eye.z) > reach + 8) continue;
      out.push(...m.interactables(this.ctx, eye, reach));
    }

    // Getting in, racks.
    for (const v of this.vehicles.values()) {
      if (Math.hypot(v.pos.x - eye.x, v.pos.z - eye.z) > reach + 5) continue;
      this.vehicleInteractables(v, held, out);
    }

    // Level stations.
    for (const st of this.level.stations) {
      if (Math.hypot(st.pos.x - eye.x, st.pos.y - eye.y, st.pos.z - eye.z) > reach + st.r + 0.5) continue;
      const i = this.stationInteractable(st);
      if (i) out.push(i);
    }

    // Doors.
    for (const d of this.doors.values()) {
      if (d.def.scripted) continue;
      const def = d.def;
      const c = {
        x: def.hinge.x + Math.cos(def.yaw) * def.width * 0.5,
        y: def.hinge.y + 1.1,
        z: def.hinge.z - Math.sin(def.yaw) * def.width * 0.5,
      };
      if (Math.hypot(c.x - eye.x, c.y - eye.y, c.z - eye.z) > reach + 1) continue;
      const locked = def.locked && !d.open && !this.hasItem('key', def.locked) ? `Locked — needs the ${def.locked} key` : undefined;
      const name = def.label ?? 'door';
      // the whole door leaf is the target (swung open, it's where it hangs)
      const sw = d.open ? -1.6 * 1 : 0;
      const ay = def.yaw + sw;
      const leaf = {
        x: def.hinge.x + Math.cos(ay) * def.width * 0.5,
        y: def.hinge.y + Math.min(1.1, def.height / 2),
        z: def.hinge.z - Math.sin(ay) * def.width * 0.5,
      };
      out.push({
        id: `door:${def.id}`,
        pos: leaf,
        r: Math.max(def.width / 2, 0.6),
        box: { hx: def.width / 2, hy: Math.min(1.1, def.height / 2), hz: 0.12, rot: qYaw(ay) },
        label: `${d.open ? 'Close' : 'Open'} the ${name}`,
        verb: 'tap',
        priority: -1,
        disabled: locked,
        target: `door:${def.id}`,
        run: () => this.openDoor(def.id, !d.open),
      });
    }
    return out;
  }

  private vehicleInteractables(v: Vehicle, held: WorldItem | undefined, out: Interactable[]): void {
    const pl = this.placements.get(v.key)!;
    const door = v.world(v.def.door.pos);
    let why: string | null = null;
    if (v.machine) {
      if (!v.machine.state.inspected && v.machine.def.inspect) why = 'Inspect it first';
      else why = v.machine.readyToDrive(this.items);
    }
    if (!why && pl.needsKey && !this.hasItem('key', pl.needsKey)) why = `Needs the ${pl.needsKey} key`;
    if (!why && held) why = v.def.rack ? 'Hands full — strap it to the rack' : 'Hands full (G to drop)';
    if (!why && v.flipped > 1) why = 'It’s on its roof — R to flip it';
    const verb = v.def.kind === 'atv' ? 'Ride' : 'Drive';
    out.push({
      id: `vehicle:${v.key}:enter`,
      pos: door,
      r: v.def.door.r,
      label: `${verb} the ${v.def.name}`,
      verb: 'tap',
      priority: 0,
      disabled: why ?? undefined,
      target: `vehicle:${v.key}`,
      run: () => this.enterVehicle(v),
    });
    if (v.def.rack) {
      const rp = v.world(v.def.rack);
      const top = this.items.get(v.rack[v.rack.length - 1]);
      if (held) {
        const full = v.rack.length >= RACK_MAX;
        out.push({
          id: `vehicle:${v.key}:rack`,
          pos: rp,
          r: 0.55,
          label: `Strap the ${itemLabel(held).toLowerCase()} to the rack`,
          verb: 'tap',
          priority: 2,
          disabled: full ? 'Rack’s full' : undefined,
          target: `vehicle:${v.key}:rack`,
          run: () => {
            const it = this.ctx.takeHeld();
            if (!it) return;
            it.state = 'racked';
            v.rack.push(it.id);
            this.events.push({ t: 'sfx', name: 'strap', pos: rp });
          },
        });
      } else if (top) {
        // It's a flat rack, not a stack: look at the part you want and take
        // it. Each strapped part is its own target, where it's drawn.
        for (const id of v.rack) {
          const it = this.items.get(id);
          if (!it) continue;
          const sh = ITEM_DEFS[it.kind].shape;
          out.push({
            id: `vehicle:${v.key}:unrack:${it.id}`,
            pos: it.pos,
            r: (sh.t === 'box' ? Math.max(sh.hx, sh.hy, sh.hz) : sh.r) + 0.04,
            label: `Take the ${itemLabel(it).toLowerCase()} off the rack`,
            verb: 'tap',
            priority: 1,
            target: `item:${it.id}`,
            run: () => {
              v.rack.splice(v.rack.indexOf(it.id), 1);
              it.state = 'world';
              this.giveHands(it);
            },
          });
        }
      }
    }
  }

  private stationInteractable(st: StationDef): Interactable | null {
    const ok = st.when ? st.when(this) : true;
    if (ok === false) return null;
    return {
      id: `station:${st.id}`,
      pos: st.pos,
      r: st.box ? Math.max(st.r, st.box.hx, st.box.hy) : st.r,
      box: st.box ? { hx: st.box.hx, hy: st.box.hy, hz: st.box.hz, rot: qYaw(st.box.yaw ?? 0) } : undefined,
      label: typeof st.label === 'function' ? st.label(this) : st.label,
      verb: st.verb,
      time: st.time,
      priority: st.priority ?? 0,
      disabled: ok === true ? undefined : ok,
      target: st.target ?? `station:${st.id}`,
      run: () => st.run(this),
    };
  }

  // --- vehicles ---------------------------------------------------------------------

  private enterVehicle(v: Vehicle): void {
    const p = this.player;
    p.mode = 'drive';
    p.vehicle = v.key;
    p.setActive(false);
    p.flashlight = false;
    v.occupied = true;
    this.torquing = null;
    if (!v.running) v.crank = v.def.kind === 'atv' ? 0.6 : 1.3;
    this.events.push({ t: 'enter', vehicle: v.key });
  }

  private exitVehicle(): void {
    const p = this.player;
    const v = p.vehicle ? this.vehicles.get(p.vehicle) : undefined;
    if (!v) return;
    // Try the driver's side, then the other side, then over the roof.
    const sides = [v.def.exit, { x: -v.def.exit.x, y: v.def.exit.y, z: v.def.exit.z }, { x: 0, y: 2.2, z: 0 }];
    let spot = v.world(sides[0]);
    for (const s of sides) {
      const w = v.world(s);
      const from = { x: w.x, y: v.pos.y + 0.8, z: w.z };
      const d = vnorm({ x: w.x - v.pos.x, y: 0, z: w.z - v.pos.z });
      const blocked = this.phys.castRay({ x: v.pos.x, y: v.pos.y + 0.8, z: v.pos.z }, d, Math.hypot(w.x - v.pos.x, w.z - v.pos.z), G.STATIC | G.DOOR);
      if (!blocked) {
        spot = { x: from.x, y: 0, z: from.z };
        break;
      }
    }
    const gy = this.terrain.heightAt(spot.x, spot.z);
    const down = this.phys.castRay({ x: spot.x, y: v.pos.y + 2.5, z: spot.z }, { x: 0, y: -1, z: 0 }, 6, G.STATIC);
    spot.y = Math.max(gy, down ? down.point.y : gy) + 0.05;
    v.occupied = false;
    p.mode = 'foot';
    p.vehicle = null;
    p.setActive(true);
    const f = v.forward();
    p.teleport(spot, Math.atan2(-f.x, -f.z));
    this.events.push({ t: 'exit', vehicle: v.key });
  }

  private openPanel(m: Machine, id: string): void {
    this.panel = { machine: m.key, panel: id };
    this.player.mode = 'panel';
    this.torquing = null;
  }

  private closePanel(): void {
    if (!this.panel) return;
    this.panel = null;
    if (this.player.mode === 'panel') this.player.mode = 'foot';
    this.events.push({ t: 'panelClose' });
  }

  // --- commands ---------------------------------------------------------------------

  command(c: Command): void {
    const p = this.player;
    switch (c.t) {
      case 'slot':
        if (c.n >= 0 && c.n < BELT_SLOTS) p.sel = c.n;
        break;
      case 'cycle':
        p.sel = (p.sel + (c.dir > 0 ? 1 : BELT_SLOTS - 1)) % BELT_SLOTS;
        break;
      case 'flashlight':
        if (this.hasItem('flashlight')) {
          p.flashlight = !p.flashlight;
          this.events.push({ t: 'sfx', name: 'click' });
        }
        break;
      case 'lights': {
        const v = p.vehicle ? this.vehicles.get(p.vehicle) : undefined;
        if (v) {
          v.lights = !v.lights;
          this.events.push({ t: 'sfx', name: 'click' });
        }
        break;
      }
      case 'horn':
        if (p.vehicle) this.events.push({ t: 'horn', vehicle: p.vehicle });
        break;
      case 'unflip': {
        const v = p.vehicle ? this.vehicles.get(p.vehicle) : undefined;
        if (v && (v.flipped > 0.5 || Math.abs(v.speed) < 1)) v.unflip();
        break;
      }
      case 'fuse':
        if (this.panel) this.machine(this.panel.machine).pressFuse(this.panel.panel, c.index, this.ctx);
        break;
      case 'valve':
        if (this.panel) this.machine(this.panel.machine).setValve(this.panel.panel, c.index, c.value, this.ctx);
        break;
      case 'commitValves':
        if (this.panel && !this.machine(this.panel.machine).commitValves(this.panel.panel, this.ctx)) {
          this.events.push({ t: 'sfx', name: 'hiss' });
        }
        break;
      case 'closePanel':
        this.closePanel();
        break;
    }
  }

  // --- the tick -----------------------------------------------------------------------

  step(intent: Intent, dt: number): void {
    if (this.ended) return;
    this.elapsed += dt;
    this.stepClock(dt);
    const p = this.player;
    const pressed = (k: keyof Intent) => !!intent[k] && !this.prev[k];
    const released = (k: keyof Intent) => !intent[k] && !!this.prev[k];
    this.swingCooldown = Math.max(0, this.swingCooldown - dt);

    if (p.mode === 'foot') {
      p.pitch = clamp(intent.pitch, -1.5, 1.5);
      const held = this.items.get(p.held);
      const heavy = held ? ITEM_DEFS[held.kind].heavy : false;
      const r = p.move(
        { fwd: intent.fwd, back: intent.back, left: intent.left, right: intent.right, jump: intent.jump, crouch: intent.crouch, sprint: intent.sprint, yaw: intent.yaw },
        dt,
        heavy ? { speed: 0.72, jump: 0.78, canSprint: false } : { speed: 1, jump: 1, canSprint: true },
      );
      if (r === 'jump') this.events.push({ t: 'jump' });
      if (r === 'land') {
        this.events.push({ t: 'land', speed: p.landSpeed, surface: p.surface });
        const dmg = fallDamage(p.landSpeed, this.hazardDef);
        if (dmg > 0) this.hurt(dmg, 'fall');
      }
      this.updateFocus();
      this.handleInteract(intent, pressed('interact'), dt);
      this.handleUse(intent, pressed('use'), released('use'), dt);
      if (intent.drop) this.dropCharge += dt;
      if (released('drop')) {
        this.release(this.dropCharge > 0.22 ? clamp((this.dropCharge - 0.1) / 0.7, 0.2, 1) : 0);
        this.dropCharge = 0;
      }
    } else if (p.mode === 'drive') {
      this.focus = null;
      const v = this.vehicle(p.vehicle!);
      p.yaw = intent.yaw;
      p.pitch = intent.pitch;
      if (pressed('interact') && Math.abs(v.speed) < 3.5) this.exitVehicle();
    } else {
      this.focus = null;
    }

    // Vehicles: pin state, controls.
    for (const v of this.vehicles.values()) {
      const pl = this.placements.get(v.key)!;
      v.updatePin(this.items, pl.pin ? pl.pin(this) : false);
      if (v.crank > 0) {
        v.crank -= dt;
        if (v.crank <= 0) {
          v.running = true;
          this.events.push({ t: 'crank', vehicle: v.key, ok: true });
        }
      }
      const driving = p.mode === 'drive' && p.vehicle === v.key;
      v.control(
        driving
          ? {
              throttle: (intent.fwd ? 1 : 0) - (intent.back ? 1 : 0),
              steer: (intent.left ? 1 : 0) - (intent.right ? 1 : 0),
              handbrake: intent.jump,
            }
          : null,
        dt,
        this.items,
      );
    }

    this.phys.step(dt);
    this.items.sync();

    for (const v of this.vehicles.values()) {
      v.sync(dt);
      if (v.impact > 0.02) {
        this.events.push({ t: 'impact', vehicle: v.key, severity: v.impact, pos: { ...v.pos } });
        if (!this.level.safe) v.integrity = clamp(v.integrity - v.impact * 0.28, 0, 1);
        if (v.occupied && v.impact > 0.25) this.hurt(v.impact * 6, 'crash');
      }
      if (v.def.rack) {
        // Stack racked cargo up the rack, each piece riding on the one below.
        let y = v.def.rack.y + 0.05;
        for (const id of v.rack) {
          const it = this.items.get(id);
          if (!it) continue;
          const sh = ITEM_DEFS[it.kind].shape;
          const hh = sh.t === 'box' ? sh.hy : sh.hh;
          it.pos = v.world({ x: v.def.rack.x, y: y + hh, z: v.def.rack.z });
          it.rot = v.rot;
          y += hh * 2 + 0.02;
        }
      }
      // Only the contract vehicle (the one you inspect) can lose you the job.
      const contract = !!this.placements.get(v.key)?.def.inspect;
      if (contract && this.level.lostY !== undefined && v.pos.y < this.level.lostY) this.fail('vehicleLost');
      if (contract && v.integrity <= 0) this.fail('wrecked');
    }
    if (p.mode === 'drive' && p.vehicle) {
      const v = this.vehicle(p.vehicle);
      const seat = v.world(v.def.seat);
      p.pos = { x: seat.x, y: seat.y - (p.height - 0.18), z: seat.z };
    }

    for (const m of this.machines.values()) m.refresh(this.items, (e) => this.events.push(e));

    this.stepFlares(dt);
    this.stepWolves(intent, dt);
    this.stepSurvival(dt);
    this.stepDirector(dt);
    this.stepDoors(dt);
    this.prev = { ...intent };
  }

  private stepClock(dt: number): void {
    // The sun keeps moving on its own, a little; beats pull it along faster.
    this.hour += dt * 0.0012;
    if (this.hourTarget !== null) {
      const d = this.hourTarget - this.hour;
      if (Math.abs(d) < 0.001) this.hourTarget = null;
      else this.hour += Math.sign(d) * Math.min(Math.abs(d), dt * 0.012);
    }
  }

  private updateFocus(): void {
    const p = this.player;
    const eye = p.eye();
    const dir = p.look();
    const cands = this.candidates();
    this.lastCands = cands;
    const prev = this.focus;
    const next = pickFocus({ origin: eye, dir }, cands, INTERACT_REACH, (c, dist) => {
      // Walls and terrain block the crosshair; the thing itself doesn't.
      const hit = this.phys.castRay(eye, dir, dist, G.STATIC | G.DOOR);
      // For boxes `dist` is where the ray enters the face; for spheres allow
      // for the radius (the collider may wrap the thing itself).
      if (!hit || hit.toi > dist - (c.box ? (c.box.slack ?? 0.02) : c.r) - 0.05) return false;
      const owner = hit.tag?.owner ?? '';
      return !(c.target && owner && c.target.startsWith(owner));
    });
    // Mid-hold on a nut, stay locked to it while the crosshair is still
    // roughly on it: a little wobble onto the neighbouring nut shouldn't
    // throw away the progress you've built up.
    const busy = prev && (this.holdId === 'u:' + prev.id || this.torquing?.id === prev.id);
    if (busy && next?.id !== prev.id) {
      const same = cands.find((c) => c.id === prev.id);
      if (same) {
        const dx = same.pos.x - eye.x;
        const dy = same.pos.y - eye.y;
        const dz = same.pos.z - eye.z;
        const t = dx * dir.x + dy * dir.y + dz * dir.z;
        const off = Math.hypot(dx - dir.x * t, dy - dir.y * t, dz - dir.z * t);
        if (t > 0 && t < INTERACT_REACH + 0.3 && off < 0.11) {
          this.focus = same;
          return;
        }
      }
    }
    this.focus = next;
  }

  private handleInteract(intent: Intent, pressedE: boolean, dt: number): void {
    const f = this.focus;
    if (!intent.interact) {
      this.holdLatch = false;
      if (this.holdId?.startsWith('e:')) this.resetHold();
      return;
    }
    if (!f || f.disabled) {
      if (this.holdId?.startsWith('e:')) this.resetHold();
      return;
    }
    if (f.verb === 'tap') {
      if (pressedE) f.run?.();
      return;
    }
    if (f.verb === 'pour') {
      this.holdId = 'e:' + f.id;
      f.tick?.(dt);
      const g = f.gauge?.();
      this.holdProgress = g ? g.value : 0;
      return;
    }
    if (f.verb === 'hold') {
      if (this.holdLatch) return;
      if (this.holdId !== 'e:' + f.id) {
        this.holdId = 'e:' + f.id;
        this.holdProgress = 0;
      }
      this.holdProgress += dt / (f.time ?? 1);
      if (this.holdProgress >= 1) {
        f.run?.();
        this.resetHold();
        this.holdLatch = true; // let go before the next hold starts
      }
    }
  }

  private handleUse(intent: Intent, pressedUse: boolean, releasedUse: boolean, dt: number): void {
    const f = this.focus;
    const onBolt = f && !f.disabled && (f.verb === 'loosen' || f.verb === 'torque');

    if (this.torquing && (releasedUse || !onBolt || f!.id !== this.torquing.id)) {
      this.torquing.release?.();
      this.torquing = null;
      this.holdProgress = 0;
    }
    if (!intent.use) {
      this.useLatch = false;
      if (this.holdId?.startsWith('u:')) this.resetHold();
      return;
    }
    if (this.useLatch) return;
    if (onBolt) {
      if (f!.verb === 'torque') {
        this.torquing = f;
        f!.tick?.(dt);
        this.holdProgress = f!.gauge?.().value ?? 0;
        return;
      }
      if (this.holdId !== 'u:' + f!.id) {
        this.holdId = 'u:' + f!.id;
        this.holdProgress = 0;
      }
      this.holdProgress += dt / (f!.time ?? 0.5);
      if (this.holdProgress >= 1) {
        f!.run?.();
        this.resetHold();
        this.useLatch = true;
      }
      return;
    }
    if (pressedUse) this.useTool();
  }

  private resetHold(): void {
    this.holdId = null;
    this.holdProgress = 0;
  }

  /** LMB with no bolt under the crosshair: use whatever tool is selected. */
  private useTool(): void {
    const p = this.player;
    if (p.held !== null) return;
    const tool = this.selectedTool();
    if (tool === 'medkit') {
      if (this.vitals.hp >= this.vitals.maxHp) {
        this.toast('Already patched up');
        return;
      }
      const before = this.vitals.hp;
      heal(this.vitals, 55);
      this.consumeBelt('medkit');
      this.events.push({ t: 'healed', amount: this.vitals.hp - before });
    } else if (tool === 'flare') {
      this.consumeBelt('flare');
      const f = yawForward(p.yaw);
      const x = p.pos.x + f.x * 3.5;
      const z = p.pos.z + f.z * 3.5;
      const pos = { x, y: this.terrain.heightAt(x, z) + 0.05, z };
      this.flares.push({ pos, ttl: 30 });
      this.events.push({ t: 'flare', pos });
    } else if (tool === 'wrench' && this.swingCooldown <= 0) {
      this.swingCooldown = 0.55;
      const combat: CombatEvent[] = [];
      const facing = yawForward(p.yaw);
      let hit = false;
      for (const w of this.wolves) if (strikeWolf(w, p.pos, facing, combat, WOLF)) hit = true;
      this.events.push({ t: 'swing', hit });
      this.pushCombat(combat);
    }
  }

  private pushCombat(list: CombatEvent[]): void {
    for (const e of list) {
      const kind = e.t.replace('wolf', '').toLowerCase() as 'notice' | 'telegraph' | 'lunge' | 'hit' | 'hurt' | 'died' | 'flee';
      this.events.push({ t: 'wolf', kind, id: e.id, pos: e.pos });
    }
  }

  private stepFlares(dt: number): void {
    for (const f of this.flares) f.ttl -= dt;
    this.flares = this.flares.filter((f) => f.ttl > 0);
  }

  /** Has this wolf come out yet (its `after` flag is set)? */
  wolfAwake(id: number): boolean {
    const after = this.wolfAfter.get(id);
    return !after || this.flags.has(after);
  }

  private stepWolves(intent: Intent, dt: number): void {
    if (!this.wolves.length) return;
    const p = this.player;
    const combat: CombatEvent[] = [];
    const target = {
      pos: this.playerPos(),
      blocking: intent.block && p.mode === 'foot',
      downed: this.vitals.downed || p.mode === 'drive',
      fear: this.flares.map((f) => f.pos),
      engaged: false,
    };
    let bite = 0;
    const ground = (x: number, z: number) => this.terrain.heightAt(x, z);
    for (const w of this.wolves) {
      const after = this.wolfAfter.get(w.id);
      if (after && !this.flags.has(after)) continue;
      target.engaged = this.wolves.some((o) => o !== w && (o.state === 'telegraph' || o.state === 'lunge' || o.state === 'recover'));
      bite += stepWolf(w, target, dt, combat, ground);
    }
    this.pushCombat(combat);
    if (bite > 0) this.hurt(bite, 'wolf');
  }

  private stepSurvival(dt: number): void {
    if (!this.level.hazards) return;
    const p = this.player;
    const warmth = [...(this.level.warmth ?? [])];
    const sheltered = p.mode === 'drive';
    const res = stepHazards(this.vitals, { pos: p.pos, warmth, sheltered }, this.hazardDef, dt);
    if (res.damage > 0) {
      this.damageTaken += res.damage;
      this.events.push({ t: 'damage', amount: res.damage, cause: res.cause ?? 'cold' });
    }
    if (res.wentDown) this.fail('cold');
  }

  private stepDoors(dt: number): void {
    for (const d of this.doors.values()) {
      const target = d.open ? 1 : 0;
      d.swing += clamp(target - d.swing, -dt * 2.5, dt * 2.5);
    }
  }

  private stepDirector(dt: number): void {
    this.level.tick?.(this, dt);
    const beats = this.level.beats;
    // Triggers run regardless of beat.
    for (const t of this.level.triggers ?? []) {
      if (this.triggersFired.has(t.id)) continue;
      if (this.player.mode === 'drive' && !t.vehicle) continue;
      if (!this.near(t.pos, t.r)) continue;
      if (t.when && !t.when(this)) continue;
      this.triggersFired.add(t.id);
      t.run(this);
    }

    let guard = 0;
    while (this.beat < beats.length && guard++ < 8) {
      const b = beats[this.beat];
      if (!this.beatStarted) {
        this.beatStarted = true;
        this.beatTime = 0;
        if (b.hour !== undefined) this.hourTarget = b.hour;
        b.start?.(this);
        const o = this.objectiveText();
        if (o) this.events.push({ t: 'objective', id: b.id, text: o.text });
      }
      if (!b.done(this)) break;
      b.finish?.(this);
      this.events.push({ t: 'objectiveDone', id: b.id });
      if (b.checkpoint) {
        this.checkpoint = b.id;
        this.events.push({ t: 'checkpoint', id: b.id });
      }
      this.beat++;
      this.beatStarted = false;
    }
    if (this.beat >= beats.length) {
      this.win();
      return;
    }
    const b = beats[this.beat];
    this.beatTime += dt;
    for (const [t, line] of b.hints ?? []) {
      const key = `${b.id}@${t}`;
      if (this.beatTime >= t && !this.hintsFired.has(key)) {
        this.hintsFired.add(key);
        this.say(line, 'Dispatch', 0);
      }
    }
  }

  /**
   * Jump to just after a checkpoint beat: every beat up to it is finished,
   * and each one's `restore` rebuilds the state it would have left behind.
   */
  restoreTo(beatId: string): void {
    const beats = this.level.beats;
    const idx = beats.findIndex((b) => b.id === beatId);
    if (idx < 0) return;
    for (let i = 0; i <= idx; i++) {
      const b = beats[i];
      if (b.hour !== undefined) this.hour = b.hour;
      b.restore?.(this);
      this.hintsFired.add(`${b.id}@restored`);
    }
    this.phys.step(1 / 60);
    this.items.sync();
    for (const v of this.vehicles.values()) v.sync(1 / 60);
    for (const m of this.machines.values()) m.refresh(this.items, () => {});
    this.beat = idx + 1;
    this.beatStarted = false;
    this.checkpoint = beatId;
    this.events = [];
  }

  // --- restore helpers (checkpoints) ---------------------------------------------

  /** Fit a fresh part in a machine slot, bolted down. */
  fit(machine: string, slot: string, spec: ItemSpawn): void {
    const m = this.machine(machine);
    const old = this.items.get(m.state.slots[slot]);
    if (old) this.items.take(old, 'gone');
    const it = this.items.spawn({ ...spec, mounted: true });
    m.mount(slot, it, 'tight');
  }

  /** Remove every loose item of a kind (it was used up before the checkpoint). */
  consume(kind: ItemKind, count = 1): void {
    for (const it of this.items.list) {
      if (count <= 0) return;
      if (it.kind === kind && it.state === 'world') {
        this.items.take(it, 'gone');
        count--;
      }
    }
  }

  /** Put a tool straight on the belt. */
  giveBelt(kind: ItemKind): void {
    if (this.hasItem(kind)) return;
    const it = this.items.list.find((i) => i.kind === kind && i.state === 'world') ?? this.items.spawn({ kind, pos: this.player.pos });
    const slot = this.player.belt.indexOf(null);
    if (slot < 0) return;
    this.items.take(it, 'belt');
    this.player.belt[slot] = it.id;
  }

  givePocket(tag: string): void {
    if (this.hasItem('key', tag)) return;
    const it = this.items.list.find((i) => i.kind === 'key' && i.tag === tag);
    if (it) this.items.take(it, 'pocket');
    this.player.pockets.push({ kind: 'key', tag });
  }

  placeVehicle(key: string, pos: Vec3, yaw: number): void {
    this.vehicle(key).place(pos, yaw);
  }

  drainEvents(): SimEvent[] {
    if (!this.events.length) return [];
    const out = this.events;
    this.events = [];
    return out;
  }

  dispose(): void {
    this.phys.dispose();
  }

  /** Debug/test: put the player somewhere. */
  teleport(pos: Vec3, yaw?: number, pitch?: number): void {
    const p = this.player;
    if (p.mode === 'drive') this.exitVehicle();
    const y = pos.y ?? this.terrain.heightAt(pos.x, pos.z);
    p.teleport({ x: pos.x, y, z: pos.z }, yaw);
    if (pitch !== undefined) p.pitch = pitch;
  }
}

export { RAPIER };
