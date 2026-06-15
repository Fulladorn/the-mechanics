import { makeRng } from '../../shared/math';

// "Torque the bolts" repair puzzle. Each bolt has a hidden target torque; the
// player rotates each into its green band. Pure + seeded (deterministic) so it
// matches across clients and is unit-testable; the DOM overlay only renders it.

export interface BoltPuzzle {
  targets: number[]; // target torque per bolt, in [0,1]
  tolerance: number; // how close counts as "in the band"
}

export function makeBoltTorque(seed: number, n = 4): BoltPuzzle {
  const rng = makeRng(seed);
  const targets: number[] = [];
  for (let i = 0; i < n; i++) targets.push(0.2 + rng() * 0.6);
  return { targets, tolerance: 0.055 };
}

export function isSolved(p: BoltPuzzle, values: number[]): boolean {
  if (values.length !== p.targets.length) return false;
  return p.targets.every((t, i) => Math.abs(values[i] - t) <= p.tolerance);
}

/** The exact target values (used by tests and the headless runner). */
export function solution(p: BoltPuzzle): number[] {
  return p.targets.slice();
}
