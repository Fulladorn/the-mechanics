import type { Vec3 } from '../shared/math';
import { dist2D, yawForward, vnorm } from '../shared/math';
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
import type { Box } from './collision';
import { horizontalSpeed, stepMovement, type Mover } from './movement';
import { makeKart, stepKart, type KartState } from './kart';
import { makeWirePuzzle, type WirePuzzle } from './puzzles/wireMatch';
import { Objectives } from './objectives';
import { makeGarage, type GarageLevel } from '../content/levels/garage';

export interface Player extends Mover {
  mode: 'foot' | 'kart';
  carrying: ItemKind | null;
  hotbar: (ItemKind | null)[];
  selSlot: number;
  topSpeed: number;
  movedDist: number;
}

export class World {
  level: GarageLevel;
  player: Player;
  items: WorldItem[];
  kart: KartState;
  puzzle: WirePuzzle;
  puzzleSolved = false;
  gateOpen = false;
  cpIndex = 0;
  objectives = new Objectives();
  events: SimEvent[] = [];
  elapsed = 0;
  won = false;

  constructor(level: GarageLevel = makeGarage()) {
    this.level = level;
    this.player = {
      pos: { ...level.spawn },
      vel: { x: 0, y: 0, z: 0 },
      yaw: level.spawnYaw,
      pitch: 0,
      onGround: true,
      crouching: false,
      height: STAND_HEIGHT,
      mode: 'foot',
      carrying: null,
      hotbar: [null, null, null, null, null, null],
      selSlot: 0,
      topSpeed: 0,
      movedDist: 0,
    };
    let id = 1;
    this.items = [
      { id: id++, kind: 'wrench', pos: { ...level.wrenchPos }, picked: false },
      { id: id++, kind: 'flashlight', pos: { ...level.flashlightPos }, picked: false },
      { id: id++, kind: 'engine', pos: { ...level.enginePos }, picked: false },
    ];
    this.kart = makeKart(level.kartStart, level.kartYaw);
    this.puzzle = makeWirePuzzle(level.puzzleSeed, 4);
  }

  eyePos(): Vec3 {
    const p = this.player;
    return { x: p.pos.x, y: p.pos.y + p.height - EYE_DROP, z: p.pos.z };
  }

  /** Walls/structures + the closed gate. Used for the kart (never itself). */
  staticBoxes(): Box[] {
    const boxes: Box[] = this.level.solids.map((s) => s.box);
    if (!this.gateOpen) boxes.push(this.level.gate);
    return boxes;
  }

  /** Static geometry plus the parked kart (solid while you're on foot). */
  playerBoxes(): Box[] {
    const boxes = this.staticBoxes();
    if (this.player.mode === 'foot') {
      boxes.push({ center: this.kart.pos, half: this.kart.half });
    }
    return boxes;
  }

  step(intent: Intent, dt: number): void {
    this.elapsed += dt;
    const p = this.player;

    if (p.mode === 'foot') {
      const before = { x: p.pos.x, z: p.pos.z };
      stepMovement(p, intent, this.playerBoxes(), dt);
      p.movedDist += Math.hypot(p.pos.x - before.x, p.pos.z - before.z);
      const sp = horizontalSpeed(p.vel);
      if (sp > p.topSpeed) p.topSpeed = sp;

      if (p.movedDist > 3) this.objectives.complete('move', this.events);

      if (!this.gateOpen && p.topSpeed >= GATE_SPEED) {
        this.gateOpen = true;
        this.events.push({ t: 'gateOpen' }, { t: 'sfx', name: 'gate' });
        this.objectives.complete('bhop', this.events);
      }
      // kart idles/coasts while you're on foot
      stepKart(this.kart, null, this.staticBoxes(), dt);
    } else {
      stepKart(this.kart, intent, this.staticBoxes(), dt);
      // ride along: keep look control, snap body to the seat
      p.yaw = intent.yaw;
      p.pitch = intent.pitch;
      p.pos.x = this.kart.pos.x;
      p.pos.z = this.kart.pos.z;
      p.pos.y = 0;
      this.checkCheckpoints();
    }
  }

  private checkCheckpoints(): void {
    if (this.objectives.isDone('drive')) return;
    const cps = this.level.checkpoints;
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

  command(cmd: Command): void {
    switch (cmd.t) {
      case 'slot':
        if (cmd.n >= 0 && cmd.n < this.player.hotbar.length) this.player.selSlot = cmd.n;
        break;
      case 'drop':
        this.dropCarried();
        break;
      case 'solvePuzzle':
        if (!this.puzzleSolved) {
          this.puzzleSolved = true;
          this.objectives.complete('puzzle', this.events);
          this.events.push({ t: 'install' }, { t: 'sfx', name: 'success' });
        }
        break;
      case 'interact':
        this.doInteract();
        break;
    }
  }

  /** What the player would interact with right now (for the HUD prompt + action). */
  findInteract(): InteractTarget | null {
    const p = this.player;
    if (p.mode === 'kart') {
      return { kind: 'enterKart', label: 'Exit kart', pos: { ...this.kart.pos } };
    }

    const eye = this.eyePos();
    const fwd = yawForward(p.yaw);
    const candidates: InteractTarget[] = [];

    if (p.carrying === 'engine') {
      if (!this.kart.engineInstalled) {
        candidates.push({ kind: 'install', label: 'Install Engine Block', pos: { ...this.kart.pos } });
      }
    } else {
      for (const it of this.items) {
        if (it.picked) continue;
        candidates.push({
          kind: 'pickup',
          label: `Pick up ${ITEM_DEFS[it.kind].label}`,
          pos: { ...it.pos },
        });
      }
      if (!this.puzzleSolved) {
        candidates.push({ kind: 'openPuzzle', label: 'Repair fuse panel', pos: { ...this.level.benchPos } });
      }
      if (this.kart.engineInstalled && !this.kart.occupied) {
        candidates.push({ kind: 'enterKart', label: 'Drive go-kart', pos: { ...this.kart.pos } });
      }
      if (this.objectives.readyToClockOut()) {
        candidates.push({ kind: 'clockIn', label: 'Clock out — finish', pos: { ...this.level.clockInPos } });
      }
    }

    let best: InteractTarget | null = null;
    let bestDist = Infinity;
    for (const c of candidates) {
      const d3 = Math.hypot(c.pos.x - eye.x, c.pos.y - eye.y, c.pos.z - eye.z);
      if (d3 > INTERACT_RANGE) continue;
      const dir = vnorm({ x: c.pos.x - eye.x, y: 0, z: c.pos.z - eye.z });
      if (fwd.x * dir.x + fwd.z * dir.z < INTERACT_CONE) continue;
      if (d3 < bestDist) {
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
        const it = this.nearestItem();
        if (!it) return;
        it.picked = true;
        const def = ITEM_DEFS[it.kind];
        if (def.heavy) {
          p.carrying = it.kind;
        } else {
          const slot = p.hotbar.indexOf(null);
          if (slot !== -1) p.hotbar[slot] = it.kind;
        }
        this.events.push({ t: 'pickup', kind: it.kind }, { t: 'sfx', name: 'pickup' });
        if (it.kind === 'wrench') this.objectives.complete('pickup', this.events);
        break;
      }
      case 'install':
        this.kart.engineInstalled = true;
        p.carrying = null;
        this.events.push({ t: 'install' }, { t: 'sfx', name: 'install' });
        this.objectives.complete('carry', this.events);
        break;
      case 'openPuzzle':
        this.events.push({ t: 'openPuzzle' });
        break;
      case 'enterKart':
        if (p.mode === 'kart') {
          this.exitKart();
        } else {
          p.mode = 'kart';
          this.kart.occupied = true;
          this.events.push({ t: 'enterKart' }, { t: 'sfx', name: 'enter' });
        }
        break;
      case 'clockIn':
        if (!this.won) {
          this.won = true;
          this.objectives.complete('clockin', this.events);
          this.events.push({ t: 'win' }, { t: 'sfx', name: 'win' });
        }
        break;
    }
  }

  private exitKart(): void {
    const p = this.player;
    p.mode = 'foot';
    this.kart.occupied = false;
    this.kart.speed = 0;
    // step out to the left of the kart
    const fwd = yawForward(this.kart.heading);
    p.pos = { x: this.kart.pos.x - fwd.z * 2, y: 0, z: this.kart.pos.z + fwd.x * 2 };
    p.vel = { x: 0, y: 0, z: 0 };
    this.events.push({ t: 'exitKart' });
  }

  private dropCarried(): void {
    const p = this.player;
    if (!p.carrying) return;
    const it = this.items.find((i) => i.kind === p.carrying);
    if (it) {
      const fwd = yawForward(p.yaw);
      it.pos = { x: p.pos.x + fwd.x * 1.2, y: 0.6, z: p.pos.z + fwd.z * 1.2 };
      it.picked = false;
    }
    this.events.push({ t: 'drop', kind: p.carrying });
    p.carrying = null;
  }

  private nearestItem(): WorldItem | null {
    const eye = this.eyePos();
    let best: WorldItem | null = null;
    let bestD = INTERACT_RANGE;
    for (const it of this.items) {
      if (it.picked) continue;
      const d = Math.hypot(it.pos.x - eye.x, it.pos.y - eye.y, it.pos.z - eye.z);
      if (d <= bestD) {
        bestD = d;
        best = it;
      }
    }
    return best;
  }

  drainEvents(): SimEvent[] {
    if (this.events.length === 0) return [];
    const out = this.events;
    this.events = [];
    return out;
  }
}
