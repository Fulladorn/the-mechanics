import { describe, it, expect } from 'vitest';
import { makeWirePuzzle, isSolved, solution } from '../src/sim/puzzles/wireMatch';

const identity = (n: number): Record<number, number> => {
  const c: Record<number, number> = {};
  for (let i = 0; i < n; i++) c[i] = i;
  return c;
};

describe('wireMatch puzzle', () => {
  it('is deterministic for a given seed', () => {
    expect(makeWirePuzzle(42, 4)).toEqual(makeWirePuzzle(42, 4));
  });

  it('is never generated already-solved (straight wiring fails)', () => {
    for (let s = 0; s < 60; s++) {
      const p = makeWirePuzzle(s, 4);
      expect(isSolved(p, identity(p.colors.length))).toBe(false);
    }
  });

  it('its own solution solves it', () => {
    for (let s = 0; s < 60; s++) {
      const p = makeWirePuzzle(s, 4);
      expect(isSolved(p, solution(p))).toBe(true);
    }
  });

  it('a partial wiring is not solved', () => {
    const p = makeWirePuzzle(7, 4);
    const partial = solution(p);
    delete partial[0];
    expect(isSolved(p, partial)).toBe(false);
  });
});
