import type { Vec3 } from '../src/shared/math';
import type { Interactable } from '../src/sim/interact';
import type { World } from '../src/sim/world';
import type { Machine } from '../src/sim/machine';
import { SAFE_TARGET } from '../src/sim/puzzles/valveBalance';
import { Bot } from './bot';

// A "first-time player" that knows nothing about the level's internals. Each
// move it looks at what the game shows — the waypoint and the next-step glow
// (World.guide()) — walks until the crosshair can land on a glowing target,
// and uses it the way the prompt's verb says. If a step leaves a player with
// nothing clear to do, it fails with the step's text, so guidance gaps are
// caught like bugs.

export interface FollowOpts {
  /** Stop when this is true (e.g. a beat reached). */
  until: () => boolean;
  /** Solve a puzzle panel once it's open (the bot can't read a puzzle). Defaults to solvePanel below. */
  solvePanel?: (w: World) => void;
  /** Stand-ins for things the bot can't do (driving), run once on entering a beat. */
  stand?: Partial<Record<string, (w: World) => void>>;
  maxMoves?: number;
}

/** Valve settings that bring every gauge to the safe target (solve coupling · v = target − bias). */
export function solveValves(m: Machine, id: string): number[] {
  const p = m.valve.get(id)!;
  const n = p.valves.length;
  const A = p.coupling.map((row, i) => [...row, SAFE_TARGET - p.bias[i]]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
    [A[c], A[piv]] = [A[piv], A[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = A[r][c] / A[c][c];
      for (let k = c; k <= n; k++) A[r][k] -= f * A[c][k];
    }
  }
  return A.map((row, i) => row[n] / row[i]);
}

/** Solve whichever puzzle panel is open (fuse grid or valve bank). */
export function solvePanel(w: World): void {
  if (!w.panel) return;
  const m = w.machine(w.panel.machine);
  const fuse = m.fuse.get(w.panel.panel);
  if (fuse) for (const i of fuse.puzzle.scramble) w.command({ t: 'fuse', index: i });
  if (m.valve.get(w.panel.panel)) {
    solveValves(m, w.panel.panel).forEach((v, i) => w.command({ t: 'valve', index: i, value: v }));
    w.command({ t: 'commitValves' });
  }
}

export class GuideBot extends Bot {
  /** Step texts seen, in order: a readable trail when something fails. */
  trail: string[] = [];

  constructor(w: World) {
    super(w);
  }

  private stepText(): string {
    const b = this.w.currentBeat();
    const d = b?.detail;
    const detail = typeof d === 'function' ? d(this.w) : d;
    const text = typeof b?.text === 'function' ? b.text(this.w) : b?.text;
    return `${b?.id}: ${text}${detail ? ` — ${detail}` : ''}`;
  }

  /** Guided targets a player can act on (a disabled one only if its reason is a key to press). */
  private actionable(): Interactable[] {
    return this.w.guide().filter((c) => !c.disabled || /\bG to drop\b/.test(c.disabled));
  }

  /** From here, can the crosshair land on a guided target? Returns it (focused) or null. */
  private tryFocus(): Interactable | null {
    for (const c of this.actionable()) {
      this.aim(c.pos);
      if (this.w.focus?.id === c.id) return this.w.focus;
    }
    return null;
  }

  /** Walk round the waypoint until a guided target can be focused. */
  private reach(mk: Vec3): Interactable | null {
    const here = this.tryFocus();
    if (here) return here;
    for (const back of [1.0, 1.4, 0.7, 2.0]) {
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        this.approach(mk, back, { x: mk.x + Math.cos(a) * 5, y: 0, z: mk.z + Math.sin(a) * 5 });
        // A person stands on the ground, not on the bonnet: skip spots where
        // we landed on something or are still sliding.
        this.tick(20);
        const p = this.w.player;
        const ground = this.w.terrain.heightAt(p.pos.x, p.pos.z);
        if (Math.hypot(p.vel.x, p.vel.y, p.vel.z) > 0.2 || p.pos.y - ground > 0.3) continue;
        const f = this.tryFocus();
        if (f) return f;
      }
    }
    return null;
  }

  /** Hold a button for up to `secs`, keeping the crosshair on `p` like a player would. */
  private holdOn(p: Vec3, secs: number, patch: { use?: boolean; interact?: boolean }, stop?: () => boolean): void {
    for (let i = 0; i < Math.round(secs * 60); i++) {
      this.point(p);
      this.tick(1, patch);
      if (stop?.()) break;
    }
  }

  private act(f: Interactable, solvePanel?: (w: World) => void): void {
    if (f.disabled) {
      // e.g. "Hands full (G to drop)": do what it says.
      this.tick(1, { drop: true });
      this.tick(3);
      return;
    }
    switch (f.verb) {
      case 'tap':
        this.tick(1, { interact: true });
        this.tick(2);
        break;
      case 'hold':
        this.holdOn(f.pos, (f.time ?? 1) + 0.3, { interact: true });
        this.tick(2);
        break;
      case 'loosen':
        this.holdOn(f.pos, (f.time ?? 0.5) + 0.3, { use: true });
        this.tick(2);
        break;
      case 'torque': {
        this.holdOn(f.pos, 4, { use: true }, () => {
          const g = this.w.focus?.gauge?.();
          return !!g && g.value >= (g.lo + g.hi) / 2;
        });
        this.tick(2);
        break;
      }
      case 'pour': {
        this.holdOn(f.pos, 5, { interact: true }, () => {
          const g = this.w.focus?.gauge?.();
          return !g || g.value >= 0.999;
        });
        this.tick(2);
        break;
      }
    }
    if (this.w.panel && solvePanel) {
      solvePanel(this.w);
      this.tick(2);
      this.w.command({ t: 'closePanel' });
      this.tick(2);
    }
  }

  /** Play by the game's guidance alone until `until()` holds. */
  follow(o: FollowOpts): void {
    const max = o.maxMoves ?? 80;
    const solve = o.solvePanel ?? solvePanel;
    const stood = new Set<string>();
    let last = '';
    let same = 0;
    for (let n = 0; n < max && !o.until(); n++) {
      const beat = this.w.currentBeat()?.id ?? '';
      const stand = o.stand?.[beat];
      if (stand && !stood.has(beat)) {
        stood.add(beat);
        stand(this.w);
        this.tick(3);
        continue;
      }
      const step = this.stepText();
      if (step !== last) this.trail.push(step);
      same = step === last ? same + 1 : 0;
      last = step;
      if (same > 8) throw new Error(`stuck on "${step}" (trail: ${this.trail.slice(-6).join(' | ')})`);
      // "Put the X down (G)": do what the text says.
      if (/\(G\)/.test(step) && this.w.heldItem()) {
        this.tick(1, { drop: true });
        this.tick(4);
        continue;
      }
      const mk = this.w.marker();
      if (!mk) throw new Error(`no waypoint on "${step}"`);
      const f = this.reach(mk);
      // A "go there" step: getting to the waypoint was the whole job.
      if (!f && this.stepText() !== step) continue;
      if (!f) {
        const g = this.w.guide();
        const why = g.length ? `glowing but not reachable: ${g.map((c) => `${c.label}${c.disabled ? ` [${c.disabled}]` : ''}`).join(', ')}` : 'nothing glows at the waypoint';
        throw new Error(`"${step}": ${why}`);
      }
      this.act(f, solve);
    }
    if (!o.until()) throw new Error(`ran out of moves at "${this.stepText()}" (trail: ${this.trail.slice(-8).join(' | ')})`);
  }
}
