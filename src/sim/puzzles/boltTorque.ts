import { makeRng } from '../../shared/math';

// "Torque the bolts" — each bolt has a hidden green band; you hold to wind the
// torque up and release inside the band. Overshoot and the bolt strips, and you
// have to back it off and start that bolt again.
//
// Pure + seeded: every player in a session gets the same bolt pattern, and the
// tests can solve it by construction.

export interface Bolt {
  /** Band centre and half-width, both in 0..1 of the gauge. */
  target: number;
  tolerance: number;
  /** How fast this bolt winds up, in gauge-units per second. */
  rate: number;
  done: boolean;
}

export interface BoltPuzzle {
  bolts: Bolt[];
  /** Above this the bolt strips and resets. */
  stripAt: number;
}

export function makeBoltTorque(seed: number, count = 4, difficulty = 0): BoltPuzzle {
  const rng = makeRng(seed);
  const bolts: Bolt[] = [];
  for (let i = 0; i < count; i++) {
    // Bands sit in the upper half of the gauge so there's always a wind-up.
    const target = 0.45 + rng() * 0.34;
    const tolerance = Math.max(0.045, 0.1 - difficulty * 0.018) * (0.85 + rng() * 0.3);
    bolts.push({ target, tolerance, rate: 0.34 + rng() * 0.22 + difficulty * 0.05, done: false });
  }
  return { bolts, stripAt: 1 };
}

/** Is this torque value inside the bolt's green band? */
export const inBand = (b: Bolt, value: number): boolean => Math.abs(value - b.target) <= b.tolerance;

export const isSolved = (p: BoltPuzzle): boolean => p.bolts.every((b) => b.done);

/**
 * Resolve a release at `value`. Returns what happened so the client can play
 * the right feedback: seated, under-torqued (retry), or stripped (retry).
 */
export function release(p: BoltPuzzle, index: number, value: number): 'seated' | 'under' | 'stripped' {
  const b = p.bolts[index];
  if (!b || b.done) return 'under';
  if (value > b.target + b.tolerance) return 'stripped';
  if (inBand(b, value)) {
    b.done = true;
    return 'seated';
  }
  return 'under';
}

/** A guaranteed-correct release value for a bolt (used by tests + the solver). */
export const solutionFor = (b: Bolt): number => b.target;
