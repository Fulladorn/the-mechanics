import type { Vec3 } from '../shared/math';
import { clamp, dist2D, yawForward, vnorm } from '../shared/math';
import {
  CHECKPOINT_RADIUS,
  EYE_DROP,
  GATE_SPEED,
  INTERACT_CONE,
  INTERACT_RANGE,
  STAND_HEIGHT,
} from '../shared/constants';
import {
  ITEM_DEFS,
  type Command,
  type Intent,
  type InteractTarget,
  type ItemKind,
  type SimEvent,
  type WorldItem,
} from '../shared/types';
import type { Box, GroundFn } from './collision';
import { horizontalSpeed, stepMovement, type Mover } from './movement';
import { makeKart, stepKart, type KartState } from './kart';
import { makeFuseGrid, type FusePuzzle } from './puzzles/fuseGrid';
import { makeBoltTorque, type BoltPuzzle } from './puzzles/boltTorque';
import { makeValveBalance, type ValvePuzzle } from './puzzles/valveBalance';
import {
  deriveStats,
  filledSockets,
  installPart,
  isDrivable,
  makeVehicle,
  openSockets,
  repairSocket,
  socketById,
  uninstallPart,
  variantById,
  type PartKind,
  type PuzzleKind,
  type Vehicle,
} from './vehicle';
import { Objectives } from './objectives';
import { Terrain } from './terrain';
import {
  DEFAULT_HAZARDS,
  applyDamage,
  fallDamage,
  heal,
  makeVitals,
  stepHazards,
  type HazardDef,
  type Vitals,
} from './hazards';
import { WOLF, makeWolf, stepWolf, strikeWolf, type CombatEvent, type Wolf } from './combat';
import { makeGarage } from '../content/levels/garage';
import type { LevelDef } from '../content/levels/types';

const PART_KINDS = new Set<string>([
  'wheel', 'engine', 'battery', 'seat', 'body', 'bumper', 'headlights', 'spoiler',
  'exhaust', 'fuel', 'brakes', 'coolant', 'winch', 'rooflight',
]);
const isPartKind = (k: string): k is PartKind => PART_KINDS.has(k);

const PAINT_PALETTE = [0xe5484d, 0x2f7fd1, 0x39b36b, 0xf1c40f, 0x8e44ad, 0xe67e22, 0x16a085, 0xdfe3ea];

export interface Player extends Mover {
  mode: 'foot' | 'kart';
  carrying: ItemKind | null;
  carryingVariant: string | null;
  /** Which world item is in hand, so dropping returns the right instance. */
  carryingItemId: number | null;
  hotbar: (ItemKind | null)[];
  selSlot: number;
  topSpeed: number;
  movedDist: number;
  blocking: boolean;
  /** Seconds until the player can swing again. */
  attackCooldown: number;
}

/** A repair puzzle the player currently has open. */
export interface ActivePuzzle {
  socketId: string;
  kind: PuzzleKind;
  fuse?: FusePuzzle;
  bolt?: BoltPuzzle;
  valve?: ValvePuzzle;
}

export class World {
  level: LevelDef;
  terrain?: Terrain;
  player: Player;
  vitals: Vitals;
  items: WorldItem[];
  kart: KartState;
  vehicle: Vehicle;
  wolves: Wolf[] = [];
  objectives: Objectives;
  lorePuzzle: FusePuzzle;
  activePuzzle: ActivePuzzle | null = null;
  loreFound = false;
  gateOpen = false;
  cpIndex = 0;
  events: SimEvent[] = [];
  elapsed = 0;
  won = false;
  failed: 'downed' | 'vehicle' | 'creep' | null = null;
  /** Distance the unstabilised vehicle has crept toward the edge. */
  creepDist = 0;
  chocked = false;
  private hazardDef: Required<HazardDef>;
  private prevFallSpeed = 0;
  private nextItemId = 1;

  constructor(level: LevelDef = makeGarage()) {
    this.level = level;
    this.terrain = level.terrain ? new Terrain(level.terrain) : undefined;
    this.hazardDef = { ...DEFAULT_HAZARDS, ...(level.hazards ?? {}) };

    const spawnY = this.groundHeight(level.spawn.x, level.spawn.z);
    this.player = {
      pos: { x: level.spawn.x, y: Math.max(level.spawn.y, spawnY), z: level.spawn.z },
      vel: { x: 0, y: 0, z: 0 },
      yaw: level.spawnYaw,
      pitch: 0,
      onGround: true,
      crouching: false,
      height: STAND_HEIGHT,
      mode: 'foot',
      carrying: null,
      carryingVariant: null,
      carryingItemId: null,
      hotbar: [null, null, null, null, null, null],
      selSlot: 0,
      topSpeed: 0,
      movedDist: 0,
      blocking: false,
      attackCooldown: 0,
    };
    this.vitals = makeVitals();

    this.items = level.items.map((sp) => ({
      id: this.nextItemId++,
      kind: sp.kind,
      pos: { ...sp.pos },
      picked: false,
      variantId: sp.variantId,
      lockedUntil: sp.lockedUntil,
    }));

    this.kart = makeKart(
      { ...level.vehicleStart, y: this.groundHeight(level.vehicleStart.x, level.vehicleStart.z) },
      level.vehicleYaw,
    );
    this.vehicle = makeVehicle(level.vehicleSockets);
    if (level.vehicleColor !== undefined) this.vehicle.bodyColor = level.vehicleColor;
    this.objectives = new Objectives(level.objectives);
    this.lorePuzzle = makeFuseGrid(level.puzzleSeed + 2, 3);

    (level.wolves ?? []).forEach((p, i) => {
      const pos = { ...p, y: this.groundHeight(p.x, p.z) };
      this.wolves.push(makeWolf(i + 1, pos, level.puzzleSeed));
    });
  }

  // --- geometry helpers -----------------------------------------------------

  /** Ground sampler for movement/vehicle; flat at y=0 without terrain. */
  private ground: GroundFn = (x, z) => this.groundHeight(x, z);

  groundHeight(x: number, z: number): number {
    return this.terrain ? this.terrain.heightAt(x, z) : 0;
  }

  private groundFn(): GroundFn | undefined {
    return this.terrain ? this.ground : undefined;
  }

  eyePos(): Vec3 {
    const p = this.player;
    return { x: p.pos.x, y: p.pos.y + p.height - EYE_DROP, z: p.pos.z };
  }

  /** World position of a chassis socket (chassis sits at the vehicle start). */
  private socketWorldPos(anchor: Vec3): Vec3 {
    const o = this.kart.pos;
    return { x: o.x + anchor.x, y: this.kart.pos.y - this.kart.half.y + anchor.y, z: o.z + anchor.z };
  }

  /** Walls/structures + the closed gate. Used for the vehicle (never itself). */
  staticBoxes(): Box[] {
    const boxes: Box[] = this.level.solids.map((s) => s.box);
    if (this.level.gate && !this.gateOpen) boxes.push(this.level.gate);
    return boxes;
  }

  /** Static geometry plus the parked vehicle (solid while you're on foot). */
  playerBoxes(): Box[] {
    const boxes = this.staticBoxes();
    if (this.player.mode === 'foot') {
      boxes.push({ center: this.kart.pos, half: this.kart.half });
    }
    return boxes;
  }

  /** Items that exist in the world right now (respecting unlock gating). */
  activeItems(): WorldItem[] {
    return this.items.filter((i) => !i.lockedUntil || this.objectives.isDone(i.lockedUntil));
  }

  // --- step -----------------------------------------------------------------

  step(intent: Intent, dt: number): void {
    if (this.won || this.failed) return;
    this.elapsed += dt;
    const p = this.player;
    const stats = deriveStats(this.vehicle);
    const ground = this.groundFn();

    p.blocking = intent.block;
    p.attackCooldown = Math.max(0, p.attackCooldown - dt);

    if (p.mode === 'foot') {
      const before = { x: p.pos.x, z: p.pos.z };
      const wasAirborne = !p.onGround;
      this.prevFallSpeed = p.vel.y < 0 ? -p.vel.y : 0;

      stepMovement(p, intent, this.playerBoxes(), dt, ground);
      p.movedDist += Math.hypot(p.pos.x - before.x, p.pos.z - before.z);
      const sp = horizontalSpeed(p.vel);
      if (sp > p.topSpeed) p.topSpeed = sp;

      if (wasAirborne && p.onGround) this.onLanded();

      if (p.movedDist > 3) this.objectives.complete('move', this.events);

      if (this.level.gate && !this.gateOpen && p.topSpeed >= GATE_SPEED) {
        this.gateOpen = true;
        this.events.push({ t: 'gateOpen' }, { t: 'sfx', name: 'gate' });
        this.objectives.complete('bhop', this.events);
      }
      stepKart(this.kart, null, this.staticBoxes(), dt, stats, ground);
    } else {
      stepKart(this.kart, intent, this.staticBoxes(), dt, stats, ground);
      p.yaw = intent.yaw;
      p.pitch = intent.pitch;
      p.pos.x = this.kart.pos.x;
      p.pos.z = this.kart.pos.z;
      p.pos.y = this.kart.pos.y - this.kart.half.y;
      if (this.kart.lastImpact > 0) {
        this.events.push(
          { t: 'impact', severity: this.kart.lastImpact, pos: { ...this.kart.pos } },
          { t: 'sfx', name: 'crash' },
        );
      }
      this.checkCheckpoints();
      this.checkExfil();
    }

    this.stepCreep(dt);
    this.stepSurvival(dt);
    this.stepWolves(dt);

    if (this.kart.integrity <= 0 && !this.failed) this.fail('vehicle');
  }

  private onLanded(): void {
    const dmg = fallDamage(this.prevFallSpeed, this.hazardDef);
    if (dmg > 0) {
      const r = applyDamage(this.vitals, dmg);
      this.events.push({ t: 'damage', amount: r.damage, cause: 'fall' }, { t: 'sfx', name: 'hurt' });
      if (r.wentDown) this.fail('downed');
    }
  }

  /** The cliff-edge opener: the vehicle rolls until someone chocks the wheels. */
  private stepCreep(dt: number): void {
    const c = this.level.creep;
    if (!c || this.chocked || this.player.mode === 'kart') return;
    const fwd = yawForward(this.kart.heading);
    this.kart.pos.x += fwd.x * c.speed * dt;
    this.kart.pos.z += fwd.z * c.speed * dt;
    if (this.terrain) this.kart.pos.y = this.terrain.heightAt(this.kart.pos.x, this.kart.pos.z) + this.kart.half.y;
    this.creepDist += c.speed * dt;
    if (this.creepDist >= c.failAfter) this.fail('creep');
  }

  private stepSurvival(dt: number): void {
    if (!this.level.hazards) return;
    const sheltered = this.player.mode === 'kart';
    const res = stepHazards(
      this.vitals,
      { pos: this.player.pos, warmth: this.level.warmth ?? [], sheltered },
      this.hazardDef,
      dt,
    );
    if (res.damage > 0) this.events.push({ t: 'damage', amount: res.damage, cause: res.cause ?? 'cold' });
    if (res.wentDown) this.fail('downed');
  }

  private stepWolves(dt: number): void {
    if (!this.wolves.length) return;
    const ground = this.groundFn();
    const combat: CombatEvent[] = [];
    const target = {
      pos: this.player.pos,
      blocking: this.player.blocking,
      downed: this.vitals.downed || this.player.mode === 'kart',
    };
    let bite = 0;
    for (const w of this.wolves) bite += stepWolf(w, target, dt, combat, ground);

    for (const e of combat) {
      const kind = e.t.replace('wolf', '').toLowerCase() as 'notice' | 'telegraph' | 'lunge' | 'hit' | 'hurt' | 'died';
      this.events.push({ t: 'wolf', kind, id: e.id, pos: e.pos });
      if (e.t === 'wolfTelegraph') this.events.push({ t: 'sfx', name: 'wolfGrowl' });
      if (e.t === 'wolfHit') this.events.push({ t: 'sfx', name: 'wolfBite' });
      if (e.t === 'wolfDied') this.events.push({ t: 'sfx', name: 'wolfDie' });
    }
    if (bite > 0) {
      const r = applyDamage(this.vitals, bite);
      this.events.push({ t: 'damage', amount: r.damage, cause: 'attack' }, { t: 'sfx', name: 'hurt' });
      if (r.wentDown) this.fail('downed');
    }
  }

  private checkCheckpoints(): void {
    const cps = this.level.checkpoints;
    if (!cps || this.objectives.isDone('drive')) return;
    if (this.cpIndex >= cps.length) return;
    if (dist2D(this.kart.pos, cps[this.cpIndex]) < CHECKPOINT_RADIUS) {
      this.cpIndex++;
      this.events.push({ t: 'checkpoint', index: this.cpIndex, total: cps.length });
      if (this.cpIndex >= cps.length) {
        this.objectives.complete('drive', this.events);
        this.events.push({ t: 'sfx', name: 'success' });
      } else {
        this.events.push({ t: 'sfx', name: 'gate' });
      }
    }
  }

  private checkExfil(): void {
    const x = this.level.exfil;
    if (!x || this.won) return;
    if (!this.objectives.readyToFinish()) return;
    if (dist2D(this.kart.pos, x.pos) <= x.radius) {
      this.objectives.complete('exfil', this.events);
      this.win();
    }
  }

  private win(): void {
    if (this.won) return;
    this.won = true;
    this.events.push({ t: 'win' }, { t: 'sfx', name: 'win' });
  }

  private fail(reason: 'downed' | 'vehicle' | 'creep'): void {
    if (this.failed || this.won) return;
    this.failed = reason;
    this.events.push({ t: 'fail', reason }, { t: 'sfx', name: 'fail' });
  }

  // --- commands -------------------------------------------------------------

  command(cmd: Command): void {
    switch (cmd.t) {
      case 'slot':
        if (cmd.n >= 0 && cmd.n < this.player.hotbar.length) this.player.selSlot = cmd.n;
        break;
      case 'drop':
        this.dropCarried();
        break;
      case 'attack':
        this.doAttack();
        break;
      case 'useItem':
        this.useSelected();
        break;
      case 'solveLore':
        if (!this.loreFound) {
          this.loreFound = true;
          this.objectives.complete('lore', this.events);
          this.events.push({ t: 'lore' }, { t: 'sfx', name: 'success' });
        }
        break;
      case 'solvePuzzle': {
        if (repairSocket(this.vehicle, cmd.socketId)) {
          this.activePuzzle = null;
          this.events.push({ t: 'repaired', socketId: cmd.socketId }, { t: 'sfx', name: 'repair' });
          this.afterVehicleChange();
        }
        break;
      }
      case 'interact':
        this.doInteract();
        break;
    }
  }

  private doAttack(): void {
    const p = this.player;
    if (p.mode !== 'foot' || p.attackCooldown > 0) return;
    // You need something to swing; bare hands don't count (GDD §3.6).
    const weapon = p.hotbar[p.selSlot];
    if (weapon !== 'wrench' && weapon !== 'flare') return;
    p.attackCooldown = 0.55;
    this.events.push({ t: 'swing' }, { t: 'sfx', name: 'swing' });

    const combat: CombatEvent[] = [];
    const facing = yawForward(p.yaw);
    for (const w of this.wolves) {
      if (strikeWolf(w, p.pos, facing, combat, WOLF)) break;
    }
    for (const e of combat) {
      const kind = e.t.replace('wolf', '').toLowerCase() as 'hurt' | 'died';
      this.events.push({ t: 'wolf', kind, id: e.id, pos: e.pos });
      if (e.t === 'wolfDied') this.events.push({ t: 'sfx', name: 'wolfDie' });
    }
  }

  private useSelected(): void {
    const p = this.player;
    const kind = p.hotbar[p.selSlot];
    if (kind !== 'medkit') return;
    if (this.vitals.hp >= this.vitals.maxHp) return;
    const before = this.vitals.hp;
    heal(this.vitals, 55);
    p.hotbar[p.selSlot] = null;
    this.events.push({ t: 'healed', amount: this.vitals.hp - before }, { t: 'sfx', name: 'heal' });
  }

  /** What the player would interact with right now (HUD prompt + action). */
  findInteract(): InteractTarget | null {
    const p = this.player;
    if (p.mode === 'kart') {
      return { kind: 'enterKart', label: 'Exit vehicle', pos: { ...this.kart.pos } };
    }

    const eye = this.eyePos();
    const fwd = yawForward(p.yaw);
    const candidates: InteractTarget[] = [];

    if (p.carrying && isPartKind(p.carrying)) {
      const variant = p.carryingVariant ? variantById(p.carryingVariant) : undefined;
      const name = variant ? variant.name : ITEM_DEFS[p.carrying].label;
      for (const s of openSockets(this.vehicle, p.carrying)) {
        candidates.push({
          kind: 'installPart',
          label: `Install ${name}`,
          pos: this.socketWorldPos(s.anchor),
          socketId: s.id,
          variantId: p.carryingVariant ?? undefined,
        });
      }
      // Swapping is only meaningful when it's a different variant.
      for (const s of filledSockets(this.vehicle, p.carrying)) {
        if (s.broken || s.installed === p.carryingVariant) continue;
        candidates.push({
          kind: 'installPart',
          label: `Swap in ${name}`,
          pos: this.socketWorldPos(s.anchor),
          socketId: s.id,
          variantId: p.carryingVariant ?? undefined,
        });
      }
    } else if (!p.carrying) {
      for (const it of this.activeItems()) {
        if (it.picked) continue;
        candidates.push({
          kind: 'pickup',
          label: `Pick up ${ITEM_DEFS[it.kind].label}`,
          pos: { ...it.pos },
          itemId: it.id,
        });
      }
      // Broken systems open their repair puzzle — but not while the thing is
      // still rolling toward a drop. Stabilise it first.
      const stabilised = !this.level.creep || this.chocked;
      for (const s of this.vehicle.sockets) {
        if (!stabilised || !s.installed || !s.broken) continue;
        candidates.push({
          kind: 'repair',
          label: `Repair ${s.label ?? ITEM_DEFS[s.accepts].label}`,
          pos: this.socketWorldPos(s.anchor),
          socketId: s.id,
          priority: 2,
        });
      }
      // Pull a fitted, working part back off (so a build is never locked in).
      // Lowest priority: it must never shadow "Drive" or a repair.
      for (const s of this.vehicle.sockets) {
        if (!s.installed || s.broken) continue;
        const v = variantById(s.installed);
        candidates.push({
          kind: 'uninstallPart',
          label: `Remove ${v ? v.name : ITEM_DEFS[s.accepts].label}`,
          pos: this.socketWorldPos(s.anchor),
          socketId: s.id,
          priority: -1,
        });
      }
      for (const st of this.level.stations) {
        if (st.requires && !this.objectives.isDone(st.requires)) continue;
        if (st.kind === 'lore' && this.loreFound) continue;
        if (st.kind === 'chock' && this.chocked) continue;
        if (st.kind === 'clockOut' && !this.objectives.readyToFinish()) continue;
        const kind = st.kind === 'paint' ? 'paint' : st.kind === 'lore' ? 'openLore' : st.kind === 'chock' ? 'chock' : 'clockIn';
        // Chocking is the urgent opener — it outranks everything at the vehicle.
        candidates.push({ kind, label: st.label, pos: { ...st.pos }, stationId: st.id, priority: kind === 'chock' ? 3 : 1 });
      }
      if (isDrivable(this.vehicle) && !this.kart.occupied) {
        candidates.push({ kind: 'enterKart', label: 'Drive', pos: { ...this.kart.pos }, priority: 2 });
      }
    }

    // Prefer what you're looking at: highest priority first, then best-aligned
    // (view dot), with distance only as a tie-breaker. Behaves like a crosshair.
    let best: InteractTarget | null = null;
    let bestPri = -Infinity;
    let bestDot = INTERACT_CONE;
    let bestDist = Infinity;
    for (const c of candidates) {
      const d3 = Math.hypot(c.pos.x - eye.x, c.pos.y - eye.y, c.pos.z - eye.z);
      if (d3 > INTERACT_RANGE) continue;
      const dir = vnorm({ x: c.pos.x - eye.x, y: 0, z: c.pos.z - eye.z });
      const dot = fwd.x * dir.x + fwd.z * dir.z;
      if (dot < INTERACT_CONE) continue;
      const pri = c.priority ?? 1;
      if (pri > bestPri) {
        bestPri = pri;
        bestDot = dot;
        bestDist = d3;
        best = c;
        continue;
      }
      if (pri < bestPri) continue;
      if (dot > bestDot + 0.02 || (Math.abs(dot - bestDot) <= 0.02 && d3 < bestDist)) {
        bestDot = dot;
        bestDist = d3;
        best = c;
      }
    }
    return best;
  }

  private doInteract(): void {
    const target = this.findInteract();
    if (!target) return;
    const p = this.player;

    switch (target.kind) {
      case 'pickup': {
        const it = this.items.find((i) => i.id === target.itemId);
        if (!it || it.picked) return;
        it.picked = true;
        const def = ITEM_DEFS[it.kind];
        if (def.heavy) {
          p.carrying = it.kind;
          p.carryingVariant = it.variantId ?? null;
          p.carryingItemId = it.id;
        } else {
          const slot = p.hotbar.indexOf(null);
          if (slot === -1) {
            it.picked = false; // toolbelt full — leave it where it is
            return;
          }
          p.hotbar[slot] = it.kind;
        }
        this.events.push({ t: 'pickup', kind: it.kind }, { t: 'sfx', name: 'pickup' });
        if (it.kind === 'wrench') this.objectives.complete('pickup', this.events);
        break;
      }

      case 'installPart': {
        if (!target.socketId || !target.variantId) return;
        const socket = socketById(this.vehicle, target.socketId);
        const displaced = socket?.installed ?? null;
        if (installPart(this.vehicle, target.socketId, target.variantId)) {
          const kind = (p.carrying ?? 'engine') as ItemKind;
          // Swapping hands you back the part that came out.
          if (displaced) {
            const old = this.items.find((i) => i.variantId === displaced && i.picked);
            if (old) {
              p.carryingVariant = displaced;
              p.carryingItemId = old.id;
            } else {
              p.carrying = null;
              p.carryingVariant = null;
              p.carryingItemId = null;
            }
          } else {
            p.carrying = null;
            p.carryingVariant = null;
            p.carryingItemId = null;
          }
          this.events.push(
            { t: 'installPart', kind, variantId: target.variantId },
            { t: 'sfx', name: 'install' },
          );
          this.afterVehicleChange();
        }
        break;
      }

      case 'uninstallPart': {
        if (!target.socketId) return;
        const s = socketById(this.vehicle, target.socketId);
        if (!s || !s.installed) return;
        const variantId = s.installed;
        const item = this.items.find((i) => i.variantId === variantId && i.picked);
        if (!item) return; // nothing to hand back — refuse rather than dupe
        if (uninstallPart(this.vehicle, target.socketId) === null) return;
        p.carrying = s.accepts as ItemKind;
        p.carryingVariant = variantId;
        p.carryingItemId = item.id;
        this.events.push({ t: 'uninstallPart', kind: s.accepts as ItemKind }, { t: 'sfx', name: 'pickup' });
        break;
      }

      case 'repair':
        if (target.socketId) this.openRepairPuzzle(target.socketId);
        break;

      case 'paint': {
        const i = (PAINT_PALETTE.indexOf(this.vehicle.bodyColor) + 1) % PAINT_PALETTE.length;
        this.vehicle.bodyColor = PAINT_PALETTE[i];
        this.events.push({ t: 'paint', color: this.vehicle.bodyColor }, { t: 'sfx', name: 'pickup' });
        break;
      }

      case 'chock': {
        if (this.chocked) return;
        this.chocked = true;
        this.events.push({ t: 'chocked' }, { t: 'sfx', name: 'install' });
        this.completeStation(target.stationId);
        break;
      }

      case 'openLore':
        this.events.push({ t: 'openLore' });
        break;

      case 'enterKart':
        if (p.mode === 'kart') this.exitKart();
        else if (isDrivable(this.vehicle)) {
          p.mode = 'kart';
          this.kart.occupied = true;
          this.events.push({ t: 'enterKart' }, { t: 'sfx', name: 'enter' });
        }
        break;

      case 'clockIn':
        this.completeStation(target.stationId);
        this.win();
        break;
    }
  }

  /** Open a system's repair puzzle. Returns false if it isn't broken. */
  openRepairPuzzle(socketId: string): boolean {
    const s = socketById(this.vehicle, socketId);
    if (!s || !s.broken) return false;
    this.activePuzzle = this.makePuzzle(s.id, s.broken);
    this.events.push({
      t: 'openPuzzle',
      socketId: s.id,
      puzzle: s.broken,
      label: s.label ?? ITEM_DEFS[s.accepts].label,
    });
    return true;
  }

  private completeStation(stationId?: string): void {
    const st = this.level.stations.find((s) => s.id === stationId);
    if (st?.completes) this.objectives.complete(st.completes, this.events);
  }

  private makePuzzle(socketId: string, kind: PuzzleKind): ActivePuzzle {
    // Seeded off the level + socket so every player sees the same puzzle and a
    // retry after backing out is the same puzzle, not a fresh one.
    let seed = this.level.puzzleSeed;
    for (let i = 0; i < socketId.length; i++) seed = (seed * 31 + socketId.charCodeAt(i)) | 0;
    switch (kind) {
      case 'fuse':
        return { socketId, kind, fuse: makeFuseGrid(seed, 3) };
      case 'bolt':
        return { socketId, kind, bolt: makeBoltTorque(seed, 4, 1) };
      case 'valve':
        return { socketId, kind, valve: makeValveBalance(seed, 3, 3, 1) };
    }
  }

  private afterVehicleChange(): void {
    if (!isDrivable(this.vehicle)) return;
    const id = this.objectives.has('assemble') ? 'assemble' : this.objectives.has('repair') ? 'repair' : null;
    if (id && !this.objectives.isDone(id)) {
      this.objectives.complete(id, this.events);
      this.events.push({ t: 'vehicleDrivable' });
    }
  }

  private exitKart(): void {
    const p = this.player;
    p.mode = 'foot';
    this.kart.occupied = false;
    this.kart.speed = 0;
    const fwd = yawForward(this.kart.heading);
    const x = this.kart.pos.x - fwd.z * 2;
    const z = this.kart.pos.z + fwd.x * 2;
    p.pos = { x, y: this.groundHeight(x, z), z };
    p.vel = { x: 0, y: 0, z: 0 };
    this.events.push({ t: 'exitKart' });
  }

  private dropCarried(): void {
    const p = this.player;
    if (!p.carrying) return;
    // Match by id, not by kind+variant: two identical parts used to make this
    // drop whichever instance happened to be found first.
    const it = this.items.find((i) => i.id === p.carryingItemId);
    if (it) {
      const fwd = yawForward(p.yaw);
      const x = p.pos.x + fwd.x * 1.2;
      const z = p.pos.z + fwd.z * 1.2;
      it.pos = { x, y: this.groundHeight(x, z) + 0.5, z };
      it.picked = false;
    }
    this.events.push({ t: 'drop', kind: p.carrying });
    p.carrying = null;
    p.carryingVariant = null;
    p.carryingItemId = null;
  }

  /** 0..1 mission progress, for the results screen. */
  integrity(): number {
    return clamp(this.kart.integrity, 0, 1);
  }

  drainEvents(): SimEvent[] {
    if (this.events.length === 0) return [];
    const out = this.events;
    this.events = [];
    return out;
  }
}
