import type { Quat, Vec3 } from '../shared/math';
import { clamp, frameToWorld, qIdentity, qRotate } from '../shared/math';
import type { SimEvent } from './events';
import type { Interactable } from './interact';
import { ITEM_DEFS, itemLabel, type ItemKind, type ItemManager, type WorldItem } from './items';
import { makeFuseGrid, press, isSolved as fuseSolved, type FusePuzzle } from './puzzles/fuseGrid';
import { isSolved as valveSolved, makeValveBalance, setValve, type ValvePuzzle } from './puzzles/valveBalance';

// A "machine" is anything you can wrench on: the vehicle you're fixing, a
// donor truck you're stripping for parts, a generator. It is described as data
// (content/vehicles/*) — slots with bolts, covers, battery terminals, fluid
// fillers, jack points and puzzle panels — and this module turns that into
// interactions and state. Systems (the job-sheet rows) are just named groups
// of those components, so "what's left to do" is always derived, never
// scripted.

export type BoltState = 'out' | 'snug' | 'tight';

export interface BoltDef {
  pos: Vec3;
  /** Direction the bolt head faces (for the wrench pose). */
  normal?: Vec3;
}

export interface SlotDef {
  t: 'slot';
  id: string;
  label: string;
  accepts: ItemKind;
  /** Where the part sits, in the machine frame. */
  pos: Vec3;
  /** Part orientation around Y (render + ghost). */
  yaw?: number;
  bolts?: BoltDef[];
  /** Access needs: 'open:<cover>' | 'flag:<name>'. */
  needs?: string[];
  /** Jack point that must be raised to take the part off or put one on. */
  lift?: string;
  /** Terminals that must be disconnected before the part comes out. */
  terminals?: string;
  /** Interaction radius. */
  r?: number;
  /** Words for the prompt, e.g. 'lug nut', 'hose clamp'. */
  boltNoun?: string;
  /** Where to look for a replacement (job-sheet hint). */
  where?: string;
}

export interface CoverDef {
  t: 'cover';
  id: string;
  label: string;
  pos: Vec3;
  r?: number;
  open?: boolean;
  /** Must be closed before driving. */
  closeToDrive?: boolean;
}

export interface TerminalsDef {
  t: 'terminals';
  id: string;
  /** Battery slot these clamps belong to. */
  battery: string;
  pos: Vec3;
  neg: Vec3;
  needs?: string[];
}

export interface FluidDef {
  t: 'fluid';
  id: string;
  label: string;
  fluid: 'fuel' | 'coolant';
  pos: Vec3;
  level: number;
  /** Level at which the system reads GO. */
  target: number;
  /** A full container adds this much level. */
  perContainer: number;
  /** Slot that must be sound, or whatever you pour runs straight out. */
  leakUnless?: string;
  needs?: string[];
}

export interface PanelDef {
  t: 'panel';
  id: string;
  label: string;
  puzzle: 'fuse' | 'valve';
  pos: Vec3;
  /** Facing of the panel surface (for the focus camera). */
  normal: Vec3;
  seed: number;
  size?: number;
  needs?: string[];
  solved?: boolean;
}

export interface JackDef {
  t: 'jack';
  id: string;
  label: string;
  pos: Vec3;
  /** 'blocks' = permanently propped up (donor vehicles). */
  state?: 'none' | 'blocks';
  /** How far the body rises when jacked, metres. */
  lift?: number;
}

export type ComponentDef = SlotDef | CoverDef | TerminalsDef | FluidDef | PanelDef | JackDef;

export interface SystemDef {
  id: string;
  label: string;
  icon: string;
  required: boolean;
  /** Component ids, in the order a mechanic would tackle them. */
  parts: string[];
  /** What the inspection says is wrong. */
  fault: string;
}

export interface MachineDef {
  id: string;
  name: string;
  components: ComponentDef[];
  systems: SystemDef[];
  /** Where "Inspect" sits (machine frame). */
  inspect?: { pos: Vec3; r: number };
  /** Starts inspected (donors don't need a diagnosis). */
  inspected?: boolean;
}

export interface MachineState {
  inspected: boolean;
  slots: Record<string, number | null>;
  bolts: Record<string, { s: BoltState; torque: number }>;
  covers: Record<string, boolean>;
  terminals: Record<string, { pos: boolean; neg: boolean }>;
  fluids: Record<string, number>;
  panels: Record<string, boolean>;
  jacks: Record<string, { state: 'none' | 'placed' | 'raised' | 'blocks'; item: number | null }>;
  go: Record<string, boolean>;
}

/** Everything a machine needs from the world, without importing the world. */
export interface MachineCtx {
  items: ItemManager;
  held(): WorldItem | undefined;
  hasTool(kind: ItemKind): boolean;
  /** Take the item out of the player's hands (for installing). */
  takeHeld(): WorldItem | undefined;
  /** Put an item into the player's hands. False if they're full. */
  giveHands(it: WorldItem): boolean;
  emit(e: SimEvent): void;
  hurt(amount: number, cause: string): void;
  openPanel(m: Machine, panelId: string): void;
  flag(name: string): boolean;
  /** Accessibility: wider torque band. */
  assist: boolean;
}

export const TORQUE_RATE = 0.8; // gauge units per second
export const TORQUE_BAND: [number, number] = [0.6, 0.82];
export const TORQUE_BAND_ASSIST: [number, number] = [0.5, 0.9];
export const LOOSEN_TIME = 0.45;

const boltKey = (slot: string, i: number) => `${slot}#${i}`;

export class Machine {
  readonly state: MachineState;
  /** World frame; vehicles update this every tick. */
  pos: Vec3;
  rot: Quat;
  readonly fuse = new Map<string, { puzzle: FusePuzzle; lit: boolean[] }>();
  readonly valve = new Map<string, ValvePuzzle>();
  private comps = new Map<string, ComponentDef>();
  /** Set when a system flips to GO this tick (for events). */
  private goCache = new Map<string, boolean>();
  /** Transient feedback state that must survive interactable regeneration. */
  private inBand = new Set<string>();
  private spill = new Map<string, number>();

  constructor(
    readonly def: MachineDef,
    readonly key: string,
    pos: Vec3,
    rot: Quat = qIdentity(),
  ) {
    this.pos = { ...pos };
    this.rot = { ...rot };
    const s: MachineState = {
      inspected: !!def.inspected,
      slots: {},
      bolts: {},
      covers: {},
      terminals: {},
      fluids: {},
      panels: {},
      jacks: {},
      go: {},
    };
    for (const c of def.components) {
      this.comps.set(c.id, c);
      switch (c.t) {
        case 'slot':
          s.slots[c.id] = null;
          (c.bolts ?? []).forEach((_, i) => (s.bolts[boltKey(c.id, i)] = { s: 'out', torque: 0 }));
          break;
        case 'cover':
          s.covers[c.id] = !!c.open;
          break;
        case 'terminals':
          s.terminals[c.id] = { pos: false, neg: false };
          break;
        case 'fluid':
          s.fluids[c.id] = c.level;
          break;
        case 'panel':
          s.panels[c.id] = !!c.solved;
          if (c.puzzle === 'fuse') {
            const p = makeFuseGrid(c.seed, c.size ?? 3);
            this.fuse.set(c.id, { puzzle: p, lit: p.start.slice() });
          } else this.valve.set(c.id, makeValveBalance(c.seed, c.size ?? 3, c.size ?? 3, 1));
          break;
        case 'jack':
          s.jacks[c.id] = { state: c.state ?? 'none', item: null };
          break;
      }
    }
    this.state = s;
  }

  // --- setup ------------------------------------------------------------------

  /**
   * Fit an item into a slot at load time. Bolts start tight and terminals
   * connected unless told otherwise (a loose caliper, a dead battery...).
   */
  mount(slotId: string, it: WorldItem, bolts: BoltState = 'tight'): void {
    const slot = this.comps.get(slotId) as SlotDef | undefined;
    if (!slot || slot.t !== 'slot') throw new Error(`${this.def.id}: no slot ${slotId}`);
    this.state.slots[slotId] = it.id;
    it.state = 'mounted';
    (slot.bolts ?? []).forEach((_, i) => {
      this.state.bolts[boltKey(slotId, i)] = { s: bolts, torque: bolts === 'tight' ? 0.7 : 0 };
    });
    for (const c of this.def.components) {
      if (c.t === 'terminals' && c.battery === slotId) this.state.terminals[c.id] = { pos: true, neg: true };
    }
  }

  comp<T extends ComponentDef>(id: string): T {
    const c = this.comps.get(id);
    if (!c) throw new Error(`${this.def.id}: no component ${id}`);
    return c as T;
  }

  world(local: Vec3): Vec3 {
    return frameToWorld(this.pos, this.rot, local);
  }

  // --- state queries ----------------------------------------------------------

  slotItem(items: ItemManager, id: string): WorldItem | undefined {
    return items.get(this.state.slots[id]);
  }

  boltsOf(slot: SlotDef): { s: BoltState; torque: number }[] {
    return (slot.bolts ?? []).map((_, i) => this.state.bolts[boltKey(slot.id, i)]);
  }

  jackRaised(id: string): boolean {
    const j = this.state.jacks[id];
    return !!j && (j.state === 'raised' || j.state === 'blocks');
  }

  /** Any jack currently lifting the body (vehicles pin themselves while jacked). */
  anyJackRaised(): boolean {
    return Object.values(this.state.jacks).some((j) => j.state === 'raised');
  }

  /** Total lift in metres, for the renderer and the pinned body. */
  jackLift(): number {
    let lift = 0;
    for (const c of this.def.components) {
      if (c.t === 'jack' && this.state.jacks[c.id].state === 'raised') lift = Math.max(lift, c.lift ?? 0.14);
    }
    return lift;
  }

  needMet(code: string, ctx: MachineCtx): boolean {
    const [k, v] = code.split(':');
    if (k === 'open') return !!this.state.covers[v];
    if (k === 'flag') return ctx.flag(v);
    if (k === 'jack') return this.jackRaised(v);
    return true;
  }

  private needsReason(needs: string[] | undefined, ctx: MachineCtx): string | null {
    for (const n of needs ?? []) {
      if (this.needMet(n, ctx)) continue;
      const [k, v] = n.split(':');
      if (k === 'open') return `Open the ${this.comp<CoverDef>(v).label.toLowerCase()} first`;
      if (k === 'jack') return 'Jack it up first';
      return 'Not yet';
    }
    return null;
  }

  componentOk(id: string, items: ItemManager): boolean {
    const c = this.comps.get(id);
    if (!c) return false;
    const s = this.state;
    switch (c.t) {
      case 'slot': {
        const it = this.slotItem(items, id);
        return !!it && it.cond === 'good' && this.boltsOf(c).every((b) => b.s === 'tight');
      }
      case 'terminals':
        return s.terminals[id].pos && s.terminals[id].neg;
      case 'fluid':
        return s.fluids[id] >= c.target - 1e-6;
      case 'panel':
        return s.panels[id];
      case 'cover':
        return !(c.closeToDrive && s.covers[id]);
      case 'jack': {
        const j = s.jacks[id];
        return j.state === 'none' || j.state === 'blocks';
      }
    }
  }

  systemOk(id: string, items: ItemManager): boolean {
    const sys = this.def.systems.find((x) => x.id === id);
    return !!sys && sys.parts.every((p) => this.componentOk(p, items));
  }

  allRequiredGo(items: ItemManager): boolean {
    return this.def.systems.every((s) => !s.required || this.systemOk(s.id, items));
  }

  /** Ready to drive: every required system GO, hood shut, jacks away. */
  readyToDrive(items: ItemManager): string | null {
    for (const s of this.def.systems) if (s.required && !this.systemOk(s.id, items)) return `${s.label} isn't fixed`;
    for (const c of this.def.components) {
      if (c.t === 'cover' && c.closeToDrive && this.state.covers[c.id]) return `Close the ${c.label.toLowerCase()}`;
      if (c.t === 'jack' && this.state.jacks[c.id].state !== 'none' && this.state.jacks[c.id].state !== 'blocks')
        return 'Take the jack out from under it';
    }
    return null;
  }

  /** Emit systemGo / allGo when systems flip. Call once per tick. */
  refresh(items: ItemManager, emit: (e: SimEvent) => void): void {
    let changed = false;
    for (const sys of this.def.systems) {
      const ok = this.systemOk(sys.id, items);
      const was = this.goCache.get(sys.id);
      this.goCache.set(sys.id, ok);
      this.state.go[sys.id] = ok;
      if (was === false && ok) {
        changed = true;
        emit({ t: 'systemGo', machine: this.key, system: sys.id, label: sys.label });
      }
    }
    if (changed && this.allRequiredGo(items)) emit({ t: 'allGo', machine: this.key });
  }

  /**
   * The next thing to do on a system, in plain words, plus where. This is what
   * the job sheet and the objective card show — derived from state, so it can
   * never disagree with what the prompts allow.
   */
  nextStep(
    sysId: string,
    ctx: MachineCtx,
  ): { text: string; pos?: Vec3; need?: ItemKind; where?: string } | null {
    const sys = this.def.systems.find((x) => x.id === sysId);
    if (!sys) return null;
    const items = ctx.items;
    const s = this.state;
    for (const pid of sys.parts) {
      if (this.componentOk(pid, items)) continue;
      const c = this.comps.get(pid)!;
      const at = this.world(c.pos);
      if (c.t === 'slot') {
        const need = this.needsReason(c.needs, ctx);
        if (need) {
          const cover = c.needs?.find((n) => n.startsWith('open:'));
          if (cover && !this.needMet(cover, ctx)) {
            const cv = this.comp<CoverDef>(cover.split(':')[1]);
            return { text: `Open the ${cv.label.toLowerCase()}`, pos: this.world(cv.pos) };
          }
          return { text: need, pos: at };
        }
        const it = this.slotItem(items, pid);
        const bolts = this.boltsOf(c);
        const noun = c.boltNoun ?? 'bolt';
        const total = bolts.length;
        if (it && it.cond === 'bad') {
          if (c.terminals) {
            const t = s.terminals[c.terminals];
            if (t.neg) return { text: 'Unclip the black (−) terminal first', pos: this.world(this.comp<TerminalsDef>(c.terminals).neg) };
            if (t.pos) return { text: 'Unclip the red (+) terminal', pos: this.world(this.comp<TerminalsDef>(c.terminals).pos) };
          }
          const loose = bolts.filter((b) => b.s === 'out').length;
          if (loose < total) return { text: `Loosen the ${noun}s (${loose}/${total})`, pos: at };
          if (c.lift && !this.jackRaised(c.lift)) return this.jackHint(c.lift, ctx);
          return { text: `Take off the ${itemLabel(it).toLowerCase()}`, pos: at };
        }
        if (!it) {
          if (c.lift && !this.jackRaised(c.lift)) return this.jackHint(c.lift, ctx);
          const held = ctx.held();
          const label = ITEM_DEFS[c.accepts].label.toLowerCase();
          if (held && held.kind === c.accepts && held.cond === 'good') return { text: `Fit the ${label}`, pos: at };
          return { text: `Find a good ${label}`, need: c.accepts, where: c.where, pos: at };
        }
        const tight = bolts.filter((b) => b.s === 'tight').length;
        if (tight < total) return { text: `Torque the ${noun}s (${tight}/${total})`, pos: at };
        if (c.terminals) {
          const t = s.terminals[c.terminals];
          if (!t.pos) return { text: 'Clip on the red (+) terminal', pos: this.world(this.comp<TerminalsDef>(c.terminals).pos) };
          if (!t.neg) return { text: 'Clip on the black (−) terminal', pos: this.world(this.comp<TerminalsDef>(c.terminals).neg) };
        }
      } else if (c.t === 'terminals') {
        const t = s.terminals[pid];
        if (!this.slotItem(items, c.battery)) continue;
        const need = this.needsReason(c.needs, ctx);
        if (need) return { text: need, pos: at };
        if (!t.pos) return { text: 'Clip on the red (+) terminal', pos: this.world(c.pos) };
        if (!t.neg) return { text: 'Clip on the black (−) terminal', pos: this.world(c.neg) };
      } else if (c.t === 'fluid') {
        if (c.leakUnless && !this.componentOk(c.leakUnless, items)) continue; // fix the leak first (earlier part)
        const held = ctx.held();
        const def = held ? ITEM_DEFS[held.kind] : undefined;
        if (held && def?.fluid === c.fluid && held.fill > 0.01) return { text: `Pour ${c.fluid} into the ${c.label.toLowerCase()}`, pos: at };
        return { text: `Bring ${c.fluid} for the ${c.label.toLowerCase()}`, need: c.fluid === 'fuel' ? 'jerrycan' : 'coolant', pos: at };
      } else if (c.t === 'panel') {
        const need = this.needsReason(c.needs, ctx);
        if (need) {
          const cover = c.needs?.find((n) => n.startsWith('open:'));
          if (cover) {
            const cv = this.comp<CoverDef>(cover.split(':')[1]);
            return { text: `Open the ${cv.label.toLowerCase()}`, pos: this.world(cv.pos) };
          }
          return { text: need, pos: at };
        }
        return { text: `Fix the ${c.label.toLowerCase()}`, pos: at };
      } else if (c.t === 'cover') {
        return { text: `Close the ${c.label.toLowerCase()}`, pos: at };
      } else if (c.t === 'jack') {
        const j = s.jacks[pid];
        if (j.state === 'raised') return { text: 'Lower the jack', pos: at };
        if (j.state === 'placed') return { text: 'Pull the jack out', pos: at };
      }
    }
    return null;
  }

  private jackHint(id: string, ctx: MachineCtx): { text: string; pos?: Vec3; need?: ItemKind } {
    const j = this.state.jacks[id];
    const at = this.world(this.comp<JackDef>(id).pos);
    if (j.state === 'placed') return { text: 'Pump the jack to lift it', pos: at };
    const held = ctx.held();
    if (held?.kind === 'jack') return { text: 'Slide the jack under the jack point', pos: at };
    return { text: 'Find a jack', need: 'jack', pos: at };
  }

  // --- interactions -------------------------------------------------------------

  /** Candidates for the crosshair near `eye`. */
  interactables(ctx: MachineCtx, eye: Vec3, reach: number): Interactable[] {
    const out: Interactable[] = [];
    const s = this.state;
    const items = ctx.items;
    const held = ctx.held();
    const near = (p: Vec3) => Math.hypot(p.x - eye.x, p.y - eye.y, p.z - eye.z) <= reach + 1.2;
    const tgt = (kind: string, id: string) => `machine:${this.key}:${kind}:${id}`;

    if (!s.inspected && this.def.inspect) {
      const p = this.world(this.def.inspect.pos);
      if (near(p)) {
        out.push({
          id: tgt('inspect', 'all'),
          pos: p,
          r: this.def.inspect.r,
          label: `Inspect the ${this.def.name}`,
          verb: 'hold',
          time: 1.1,
          priority: -1,
          target: tgt('inspect', 'all'),
          run: () => {
            s.inspected = true;
            ctx.emit({ t: 'inspected', machine: this.key });
          },
        });
      }
    }

    for (const c of this.def.components) {
      const at = this.world(c.pos);
      if (!near(at)) continue;
      switch (c.t) {
        case 'slot':
          this.slotInteractables(c, ctx, held, out);
          break;
        case 'cover': {
          const open = s.covers[c.id];
          out.push({
            id: tgt('cover', c.id),
            pos: at,
            r: c.r ?? 0.35,
            label: `${open ? 'Close' : 'Open'} the ${c.label.toLowerCase()}`,
            verb: 'tap',
            priority: -1,
            target: tgt('cover', c.id),
            run: () => {
              s.covers[c.id] = !open;
              ctx.emit({ t: 'cover', machine: this.key, cover: c.id, open: !open, pos: at });
            },
          });
          break;
        }
        case 'terminals': {
          if (!this.slotItem(items, c.battery)) break;
          const need = this.needsReason(c.needs, ctx);
          for (const which of ['pos', 'neg'] as const) {
            const p = this.world(which === 'pos' ? c.pos : c.neg);
            const on = s.terminals[c.id][which];
            const name = which === 'pos' ? 'red (+)' : 'black (−)';
            out.push({
              id: tgt('term', `${c.id}.${which}`),
              pos: p,
              r: 0.07,
              label: `${on ? 'Unclip' : 'Clip on'} the ${name} terminal`,
              verb: 'tap',
              priority: 2,
              disabled: need ?? undefined,
              target: tgt('term', `${c.id}.${which}`),
              run: () => this.toggleTerminal(c, which, ctx),
            });
          }
          break;
        }
        case 'fluid':
          out.push(this.fluidInteractable(c, ctx, held));
          break;
        case 'panel': {
          const solved = s.panels[c.id];
          const need = this.needsReason(c.needs, ctx);
          out.push({
            id: tgt('panel', c.id),
            pos: at,
            r: 0.22,
            label: solved ? `${c.label} ✓` : `Work on the ${c.label.toLowerCase()}`,
            verb: 'tap',
            priority: 1,
            disabled: solved ? 'Already fixed' : (need ?? undefined),
            target: tgt('panel', c.id),
            run: () => {
              ctx.openPanel(this, c.id);
              ctx.emit({ t: 'panelOpen', machine: this.key, panel: c.id });
            },
          });
          break;
        }
        case 'jack':
          this.jackInteractables(c, ctx, held, out);
          break;
      }
    }
    return out;
  }

  private slotInteractables(c: SlotDef, ctx: MachineCtx, held: WorldItem | undefined, out: Interactable[]): void {
    const s = this.state;
    const items = ctx.items;
    const at = this.world(c.pos);
    const it = this.slotItem(items, c.id);
    const tgt = (kind: string, id: string) => `machine:${this.key}:${kind}:${id}`;
    const access = this.needsReason(c.needs, ctx);
    const noun = c.boltNoun ?? 'bolt';

    if (it) {
      // Bolts: loosen tight ones, torque the rest.
      (c.bolts ?? []).forEach((b, i) => {
        const key = boltKey(c.id, i);
        const st = s.bolts[key];
        const p = this.world(b.pos);
        const wrench = ctx.hasTool('wrench');
        const base: Interactable = {
          id: tgt('bolt', key),
          pos: p,
          r: 0.065,
          label: '',
          verb: 'loosen',
          priority: 3,
          target: tgt('bolt', key),
          disabled: access ?? (wrench ? undefined : 'You need a wrench'),
        };
        if (st.s === 'tight') {
          out.push({
            ...base,
            label: `Loosen ${noun}`,
            verb: 'loosen',
            time: LOOSEN_TIME,
            run: () => {
              st.s = 'out';
              st.torque = 0;
              ctx.emit({ t: 'boltLoose', machine: this.key, bolt: key, pos: p });
            },
          });
        } else {
          const band = ctx.assist ? TORQUE_BAND_ASSIST : TORQUE_BAND;
          out.push({
            ...base,
            label: `Torque ${noun}`,
            verb: 'torque',
            gauge: () => ({ value: st.torque, lo: band[0], hi: band[1] }),
            tick: (dt) => {
              st.s = 'snug';
              st.torque = Math.min(1.08, st.torque + TORQUE_RATE * dt);
              const inBand = st.torque >= band[0] && st.torque <= band[1];
              if (inBand && !this.inBand.has(key)) ctx.emit({ t: 'boltBand', machine: this.key, bolt: key });
              if (inBand) this.inBand.add(key);
              else this.inBand.delete(key);
              if (st.torque >= 1.08) {
                // Held it far too long: the thread slips.
                st.torque = 0.25;
                ctx.emit({ t: 'boltSlip', machine: this.key, bolt: key, pos: p });
              }
            },
            release: () => {
              this.inBand.delete(key);
              if (st.torque >= band[0] && st.torque <= band[1]) {
                st.s = 'tight';
                st.torque = 0.7;
                ctx.emit({ t: 'boltTight', machine: this.key, bolt: key, pos: p });
              } else if (st.torque > band[1]) {
                st.torque = 0.25;
                ctx.emit({ t: 'boltSlip', machine: this.key, bolt: key, pos: p });
              }
            },
          });
        }
      });

      // Pull the part.
      if (!held) {
        const bolts = this.boltsOf(c);
        const loose = bolts.filter((b) => b.s === 'out').length;
        let why: string | null = access;
        if (!why && loose < bolts.length) why = `Loosen the ${noun}s first (${loose}/${bolts.length})`;
        if (!why && c.terminals) {
          const t = s.terminals[c.terminals];
          if (t.pos || t.neg) why = 'Unclip the terminals first';
        }
        if (!why && c.lift && !this.jackRaised(c.lift)) why = 'Jack it up first';
        out.push({
          id: tgt('slot', c.id),
          pos: at,
          r: c.r ?? 0.3,
          label: `Take off the ${itemLabel(it).toLowerCase()}`,
          verb: 'tap',
          priority: 1,
          disabled: why ?? undefined,
          target: tgt('slot', c.id),
          run: () => {
            s.slots[c.id] = null;
            (c.bolts ?? []).forEach((_, i) => (s.bolts[boltKey(c.id, i)] = { s: 'out', torque: 0 }));
            ctx.giveHands(it);
            ctx.emit({ t: 'partOff', machine: this.key, slot: c.id, item: it.id, pos: at });
          },
        });
      }
      return;
    }

    // Empty slot.
    if (held && held.kind === c.accepts) {
      let why: string | null = access;
      if (!why && c.lift && !this.jackRaised(c.lift)) why = 'Jack it up first';
      out.push({
        id: tgt('slot', c.id),
        pos: at,
        r: (c.r ?? 0.3) + 0.15,
        label: `Fit the ${itemLabel(held).toLowerCase()}`,
        verb: 'tap',
        priority: 2,
        disabled: why ?? undefined,
        target: tgt('ghost', c.id),
        run: () => {
          const part = ctx.takeHeld();
          if (!part) return;
          s.slots[c.id] = part.id;
          part.state = 'mounted';
          (c.bolts ?? []).forEach((_, i) => (s.bolts[boltKey(c.id, i)] = { s: 'out', torque: 0 }));
          ctx.emit({ t: 'partOn', machine: this.key, slot: c.id, item: part.id, pos: at });
        },
      });
    } else if (!held) {
      // Looking at an empty mount tells you what goes there.
      out.push({
        id: tgt('slot', c.id),
        pos: at,
        r: c.r ?? 0.3,
        label: `Empty: needs a ${ITEM_DEFS[c.accepts].label.toLowerCase()}`,
        verb: 'tap',
        priority: -2,
        disabled: c.where ? `Look ${c.where}` : 'Find one',
        target: tgt('ghost', c.id),
      });
    }
  }

  private toggleTerminal(c: TerminalsDef, which: 'pos' | 'neg', ctx: MachineCtx): void {
    const t = this.state.terminals[c.id];
    const p = this.world(which === 'pos' ? c.pos : c.neg);
    const turningOn = !t[which];
    // The one rule every mechanic learns the hard way: negative off first,
    // negative on last. Get it wrong and you'll see sparks.
    const wrong = turningOn ? which === 'neg' && !t.pos : which === 'pos' && t.neg;
    t[which] = turningOn;
    ctx.emit({ t: 'terminal', machine: this.key, which, on: turningOn, pos: p });
    if (wrong) {
      ctx.emit({ t: 'zap', pos: p });
      ctx.hurt(6, 'zap');
    }
  }

  private fluidInteractable(c: FluidDef, ctx: MachineCtx, held: WorldItem | undefined): Interactable {
    const s = this.state;
    const at = this.world(c.pos);
    const tgt = `machine:${this.key}:fluid:${c.id}`;
    const def = held ? ITEM_DEFS[held.kind] : undefined;
    const access = this.needsReason(c.needs, ctx);
    const level = s.fluids[c.id];
    if (!held || def?.fluid !== c.fluid) {
      return {
        id: tgt,
        pos: at,
        r: 0.14,
        label: `${c.label}: ${Math.round(level * 100)}%`,
        verb: 'tap',
        priority: 0,
        disabled: level >= c.target ? 'Full enough' : `Needs ${c.fluid}`,
        target: tgt,
      };
    }
    return {
      id: tgt,
      pos: at,
      r: 0.18,
      label: held.fill <= 0.01 ? 'The can is empty' : `Pour ${c.fluid}`,
      verb: 'pour',
      priority: 2,
      disabled: access ?? (held.fill <= 0.01 ? `Refill the ${ITEM_DEFS[held.kind].label.toLowerCase()}` : undefined),
      target: tgt,
      gauge: () => ({ value: s.fluids[c.id], lo: c.target, hi: 1 }),
      tick: (dt) => {
        const rate = 0.35; // container fraction per second
        const amount = Math.min(held.fill, rate * dt);
        held.fill -= amount;
        const add = amount * c.perContainer;
        if (c.leakUnless && !this.componentOk(c.leakUnless, ctx.items)) {
          // It's going straight through the split line onto the dirt.
          const spilt = (this.spill.get(c.id) ?? 0) + amount;
          this.spill.set(c.id, spilt > 0.06 ? 0 : spilt);
          if (spilt > 0.06) ctx.emit({ t: 'leak', machine: this.key, fluid: c.fluid, pos: at });
          return;
        }
        const before = s.fluids[c.id];
        s.fluids[c.id] = clamp(before + add, 0, 1);
        if (before < 1 && s.fluids[c.id] >= 1) ctx.emit({ t: 'fluidFull', machine: this.key, fluid: c.fluid });
      },
    };
  }

  private jackInteractables(c: JackDef, ctx: MachineCtx, held: WorldItem | undefined, out: Interactable[]): void {
    const j = this.state.jacks[c.id];
    if (j.state === 'blocks') return;
    const at = this.world(c.pos);
    const tgt = `machine:${this.key}:jack:${c.id}`;
    if (j.state === 'none') {
      if (held?.kind !== 'jack') return;
      out.push({
        id: tgt,
        pos: at,
        r: 0.4,
        label: 'Slide the jack under',
        verb: 'tap',
        priority: 2,
        target: `machine:${this.key}:ghost:${c.id}`,
        run: () => {
          const jack = ctx.takeHeld();
          if (!jack) return;
          jack.state = 'mounted';
          j.state = 'placed';
          j.item = jack.id;
          ctx.emit({ t: 'jack', machine: this.key, state: 'placed', pos: at });
        },
      });
      return;
    }
    if (j.state === 'placed') {
      // Once the wheels it serves are good, the obvious next move is to pull
      // the jack; otherwise it's to pump it.
      const served = this.def.components.filter((x) => x.t === 'slot' && x.lift === c.id) as SlotDef[];
      const done = served.every((x) => ctx.items.get(this.state.slots[x.id])?.cond === 'good');
      out.push({
        id: tgt + ':raise',
        pos: at,
        r: 0.35,
        label: 'Pump the jack',
        verb: 'hold',
        time: 1.3,
        priority: done ? 0 : 1,
        target: tgt,
        run: () => {
          j.state = 'raised';
          ctx.emit({ t: 'jack', machine: this.key, state: 'raised', pos: at });
        },
      });
      if (!held) {
        out.push({
          id: tgt + ':take',
          pos: at,
          r: 0.35,
          label: 'Pull the jack out',
          verb: 'tap',
          priority: done ? 1 : 0,
          target: tgt,
          run: () => {
            const it = ctx.items.get(j.item);
            if (!it || !ctx.giveHands(it)) return;
            j.state = 'none';
            j.item = null;
            ctx.emit({ t: 'jack', machine: this.key, state: 'taken', pos: at });
          },
        });
      }
      return;
    }
    // raised: lowering needs every lifted wheel back on
    const missing = this.def.components.find(
      (x) => x.t === 'slot' && x.lift === c.id && !this.state.slots[x.id],
    ) as SlotDef | undefined;
    out.push({
      id: tgt + ':lower',
      pos: at,
      r: 0.35,
      label: 'Lower the jack',
      verb: 'hold',
      time: 1.0,
      priority: 1,
      disabled: missing ? `Fit the ${ITEM_DEFS[missing.accepts].label.toLowerCase()} first` : undefined,
      target: tgt,
      run: () => {
        j.state = 'placed';
        ctx.emit({ t: 'jack', machine: this.key, state: 'lowered', pos: at });
      },
    });
  }

  // --- puzzle panels ------------------------------------------------------------

  pressFuse(panelId: string, index: number, ctx: MachineCtx): void {
    const f = this.fuse.get(panelId);
    if (!f || this.state.panels[panelId]) return;
    f.lit = press(f.puzzle.size, f.lit, index);
    if (fuseSolved(f.lit)) this.solvePanel(panelId, ctx);
  }

  setValve(panelId: string, index: number, value: number, ctx: MachineCtx): void {
    const v = this.valve.get(panelId);
    if (!v || this.state.panels[panelId]) return;
    setValve(v, index, value);
  }

  /** Valves are committed with a "pressurise" lever so dragging past the band is safe. */
  commitValves(panelId: string, ctx: MachineCtx): boolean {
    const v = this.valve.get(panelId);
    if (!v || this.state.panels[panelId]) return false;
    if (!valveSolved(v)) return false;
    this.solvePanel(panelId, ctx);
    return true;
  }

  solvePanel(panelId: string, ctx: MachineCtx): void {
    if (this.state.panels[panelId]) return;
    this.state.panels[panelId] = true;
    ctx.emit({ t: 'panelSolved', machine: this.key, panel: panelId });
  }

  /** Direction the panel faces in world space. */
  panelNormal(panelId: string): Vec3 {
    return qRotate(this.rot, this.comp<PanelDef>(panelId).normal);
  }
}
