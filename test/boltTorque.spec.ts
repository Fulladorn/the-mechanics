import { describe, it, expect } from 'vitest';
import { makeBoltTorque, isSolved, solution } from '../src/sim/puzzles/boltTorque';

describe('boltTorque puzzle', () => {
  it('is deterministic for a seed', () => {
    expect(makeBoltTorque(5, 4)).toEqual(makeBoltTorque(5, 4));
  });

  it('its own solution solves it', () => {
    for (let s = 0; s < 40; s++) {
      const p = makeBoltTorque(s, 4);
      expect(isSolved(p, solution(p))).toBe(true);
    }
  });

  it('a bolt outside its band fails', () => {
    const p = makeBoltTorque(1, 4);
    const v = solution(p).slice();
    v[0] = Math.min(1, v[0] + p.tolerance + 0.05);
    expect(isSolved(p, v)).toBe(false);
  });

  it('wrong value count is unsolved', () => {
    expect(isSolved(makeBoltTorque(2, 4), [0.5])).toBe(false);
  });
});
