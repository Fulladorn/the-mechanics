import { describe, it, expect } from 'vitest';
import { makeFuseGrid, press, isSolved } from '../src/sim/puzzles/fuseGrid';

describe('fuseGrid puzzle', () => {
  it('is deterministic for a seed', () => {
    expect(makeFuseGrid(9, 3)).toEqual(makeFuseGrid(9, 3));
  });

  it('is never generated already-solved', () => {
    for (let s = 0; s < 40; s++) {
      expect(isSolved(makeFuseGrid(s, 3).start)).toBe(false);
    }
  });

  it('replaying the scramble presses solves it (so it is always solvable)', () => {
    for (let s = 0; s < 40; s++) {
      const p = makeFuseGrid(s, 3);
      let st = p.start.slice();
      for (const i of p.scramble) st = press(p.size, st, i);
      expect(isSolved(st)).toBe(true);
    }
  });
});
