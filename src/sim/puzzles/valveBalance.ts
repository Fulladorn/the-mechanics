import { makeRng } from '../../shared/math';

// "Balance the pressure" — a bank of valves feeds a set of gauges. Each valve
// pushes several gauges by different amounts, so you can't tune them one at a
// time; you have to find the combination that lands every gauge in its safe
// band. Solvable by construction: the puzzle is generated from a known-good
// valve setting and then scrambled.
//
// Pure + seeded, like every other puzzle in sim/puzzles.

export interface ValvePuzzle {
  /** Current valve positions, 0..1. */
  valves: number[];
  /** Coupling matrix: gauge i reads bias[i] + Σ coupling[i][j] * valves[j]. */
  coupling: number[][];
  bias: number[];
  /** Safe band per gauge (centre 0.5 by construction). */
  tolerance: number;
  /** The setting the puzzle was generated from — the reference solution. */
  solution: number[];
}

const TARGET = 0.5;

export function makeValveBalance(seed: number, valves = 3, gauges = 3, difficulty = 0): ValvePuzzle {
  const rng = makeRng(seed);

  // Pick the answer first, then build a system that has it as a solution.
  const solution: number[] = [];
  for (let i = 0; i < valves; i++) solution.push(0.25 + rng() * 0.5);

  const coupling: number[][] = [];
  const bias: number[] = [];
  for (let g = 0; g < gauges; g++) {
    const row: number[] = [];
    for (let v = 0; v < valves; v++) {
      // The diagonal dominates so each valve has an obvious "main" gauge, but
      // the off-diagonal terms are what force you to balance rather than solve
      // one dial at a time.
      const main = g === v ? 0.55 + rng() * 0.3 : 0;
      const cross = (rng() - 0.5) * (0.3 + difficulty * 0.16);
      row.push(main + cross);
    }
    coupling.push(row);
    // Choose the bias so the reference solution reads exactly TARGET.
    let sum = 0;
    for (let v = 0; v < valves; v++) sum += row[v] * solution[v];
    bias.push(TARGET - sum);
  }

  // Start the valves somewhere clearly wrong but reachable.
  const start: number[] = [];
  for (let i = 0; i < valves; i++) {
    const away = 0.22 + rng() * 0.2;
    start.push(Math.min(1, Math.max(0, solution[i] + (rng() > 0.5 ? away : -away))));
  }

  return {
    valves: start,
    coupling,
    bias,
    tolerance: Math.max(0.05, 0.11 - difficulty * 0.02),
    solution,
  };
}

/** Gauge readings for the current valve positions. */
export function readings(p: ValvePuzzle): number[] {
  return p.coupling.map((row, g) => {
    let sum = p.bias[g];
    for (let v = 0; v < row.length; v++) sum += row[v] * p.valves[v];
    return sum;
  });
}

/** How far a gauge sits from the middle of its safe band, in band-widths. */
export function errorOf(p: ValvePuzzle, gauge: number): number {
  return (readings(p)[gauge] - TARGET) / p.tolerance;
}

export const gaugeOk = (p: ValvePuzzle, gauge: number): boolean =>
  Math.abs(readings(p)[gauge] - TARGET) <= p.tolerance;

export const isSolved = (p: ValvePuzzle): boolean => readings(p).every((r) => Math.abs(r - TARGET) <= p.tolerance);

export function setValve(p: ValvePuzzle, index: number, value: number): void {
  if (index < 0 || index >= p.valves.length) return;
  p.valves[index] = Math.min(1, Math.max(0, value));
}

export const SAFE_TARGET = TARGET;
