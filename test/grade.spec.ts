import { describe, expect, it } from 'vitest';
import { grade, letterFor } from '../src/sim/grade';

describe('grading', () => {
  const base = { time: 400, par: 480, integrity: 1, lore: 3, loreTotal: 3, extras: 2, extrasTotal: 2, damage: 0 };

  it('a clean, fast, complete run is an S', () => {
    const g = grade(base);
    expect(g.score).toBe(100);
    expect(g.letter).toBe('S');
  });

  it('slow runs lose time points down to nothing at 2.2x par', () => {
    const slow = grade({ ...base, time: 480 * 2.2 });
    expect(slow.lines.find((l) => l.id === 'time')!.points).toBe(0);
    expect(slow.letter).not.toBe('S');
  });

  it('levels without collectibles do not penalise for them', () => {
    const g = grade({ ...base, lore: 0, loreTotal: 0, extras: 0, extrasTotal: 0 });
    expect(g.lines.some((l) => l.id === 'finds')).toBe(false);
    expect(g.score).toBe(100);
  });

  it('a wrecked, hurt, slow run is a D', () => {
    const g = grade({ ...base, time: 2000, integrity: 0.3, lore: 0, extras: 0, damage: 150 });
    expect(g.letter).toBe('D');
  });

  it('letters have stable thresholds', () => {
    expect(letterFor(90)).toBe('S');
    expect(letterFor(78)).toBe('A');
    expect(letterFor(62)).toBe('B');
    expect(letterFor(45)).toBe('C');
    expect(letterFor(44)).toBe('D');
  });
});
