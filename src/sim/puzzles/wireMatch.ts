import { makeRng } from '../../shared/math';

// A small "match the wires" repair puzzle. Left terminals each have a color;
// the right terminals show the same colors in a shuffled order. Connect each
// left terminal to the right terminal of the same color to restore the circuit.
//
// Logic is pure + seeded so every player in a session sees the same panel and
// it's trivially unit-testable. The DOM overlay only renders this state.

export interface WirePuzzle {
  /** Color for each left terminal, top to bottom (hex strings). */
  colors: string[];
  /** For each right slot (top to bottom), the index into `colors` it shows. */
  rightOrder: number[];
}

const PALETTE = ['#ff5d5d', '#ffcf3f', '#38e0c8', '#6db8ff', '#c08bff', '#7cff8a'];

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = a[i];
    a[i] = a[j];
    a[j] = tmp;
  }
  return a;
}

export function makeWirePuzzle(seed: number, n = 4): WirePuzzle {
  const rng = makeRng(seed);
  const count = Math.max(2, Math.min(n, PALETTE.length));
  const colors = shuffle(PALETTE, rng).slice(0, count);
  let rightOrder = shuffle(
    colors.map((_, i) => i),
    rng,
  );
  // Guarantee it isn't already solved (no right slot lined up with its left).
  if (rightOrder.every((c, slot) => c === slot) && count > 1) {
    rightOrder = rightOrder.slice(1).concat(rightOrder[0]);
  }
  return { colors, rightOrder };
}

/**
 * `connections[leftIndex] = rightSlot`. Solved when every left terminal is wired
 * to the right slot showing its own color.
 */
export function isSolved(p: WirePuzzle, connections: Record<number, number>): boolean {
  for (let left = 0; left < p.colors.length; left++) {
    const slot = connections[left];
    if (slot === undefined) return false;
    if (p.rightOrder[slot] !== left) return false;
  }
  return true;
}

/** The correct wiring (used by tests and the headless runner). */
export function solution(p: WirePuzzle): Record<number, number> {
  const out: Record<number, number> = {};
  for (let left = 0; left < p.colors.length; left++) {
    out[left] = p.rightOrder.indexOf(left);
  }
  return out;
}
