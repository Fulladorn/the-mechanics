import { describe, it, expect } from 'vitest';
import { inBand, isSolved as boltSolved, makeBoltTorque, release, solutionFor } from '../src/sim/puzzles/boltTorque';
import {
  SAFE_TARGET,
  isSolved as valveSolved,
  makeValveBalance,
  readings,
  setValve,
} from '../src/sim/puzzles/valveBalance';

describe('bolt torque', () => {
  it('is seeded and reproducible', () => {
    const a = makeBoltTorque(4242, 4, 1);
    const b = makeBoltTorque(4242, 4, 1);
    expect(a.bolts.map((x) => x.target)).toEqual(b.bolts.map((x) => x.target));
  });

  it('starts unsolved with every band reachable', () => {
    const p = makeBoltTorque(7, 4, 1);
    expect(boltSolved(p)).toBe(false);
    for (const b of p.bolts) {
      expect(b.target + b.tolerance).toBeLessThanOrEqual(p.stripAt);
      expect(b.target - b.tolerance).toBeGreaterThan(0);
      expect(b.tolerance).toBeGreaterThan(0.02);
    }
  });

  it('is solvable by releasing on each target', () => {
    const p = makeBoltTorque(99, 4, 1);
    p.bolts.forEach((b, i) => {
      expect(release(p, i, solutionFor(b))).toBe('seated');
    });
    expect(boltSolved(p)).toBe(true);
  });

  it('reports under-torque and strips, without seating the bolt', () => {
    const p = makeBoltTorque(11, 3, 0);
    const b = p.bolts[0];
    expect(release(p, 0, b.target - b.tolerance - 0.05)).toBe('under');
    expect(b.done).toBe(false);
    expect(release(p, 0, b.target + b.tolerance + 0.05)).toBe('stripped');
    expect(b.done).toBe(false);
    expect(release(p, 0, b.target)).toBe('seated');
    expect(b.done).toBe(true);
  });

  it('gets harder with difficulty (tighter bands)', () => {
    const easy = makeBoltTorque(5, 4, 0);
    const hard = makeBoltTorque(5, 4, 3);
    const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(avg(hard.bolts.map((b) => b.tolerance))).toBeLessThan(avg(easy.bolts.map((b) => b.tolerance)));
  });

  it('inBand agrees with release', () => {
    const p = makeBoltTorque(31, 2, 1);
    const b = p.bolts[0];
    expect(inBand(b, b.target)).toBe(true);
    expect(inBand(b, b.target + b.tolerance * 2)).toBe(false);
  });
});

describe('valve balance', () => {
  it('is seeded and reproducible', () => {
    const a = makeValveBalance(4242, 3, 3, 1);
    const b = makeValveBalance(4242, 3, 3, 1);
    expect(a.valves).toEqual(b.valves);
    expect(a.coupling).toEqual(b.coupling);
  });

  it('starts out of balance', () => {
    for (const seed of [1, 2, 3, 17, 4242]) {
      expect(valveSolved(makeValveBalance(seed, 3, 3, 1))).toBe(false);
    }
  });

  it('is solvable by construction', () => {
    for (const seed of [1, 2, 3, 17, 4242]) {
      const p = makeValveBalance(seed, 3, 3, 1);
      p.solution.forEach((v, i) => setValve(p, i, v));
      for (const r of readings(p)) expect(Math.abs(r - SAFE_TARGET)).toBeLessThan(1e-9);
      expect(valveSolved(p)).toBe(true);
    }
  });

  it('every valve moves more than one gauge', () => {
    const p = makeValveBalance(4242, 3, 3, 1);
    for (let v = 0; v < p.valves.length; v++) {
      const before = readings(p);
      setValve(p, v, Math.min(1, p.valves[v] + 0.2));
      const after = readings(p);
      const moved = after.filter((r, i) => Math.abs(r - before[i]) > 1e-6).length;
      expect(moved, `valve ${v} only moved ${moved} gauge(s)`).toBeGreaterThan(1);
      setValve(p, v, before[v]);
    }
  });

  it('clamps valve positions to 0..1', () => {
    const p = makeValveBalance(8, 3, 3, 0);
    setValve(p, 0, 5);
    expect(p.valves[0]).toBe(1);
    setValve(p, 0, -3);
    expect(p.valves[0]).toBe(0);
    setValve(p, 99, 0.5); // out of range is a no-op, not a crash
    expect(p.valves.length).toBe(3);
  });
});
