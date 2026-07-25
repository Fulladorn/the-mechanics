import { describe, it, expect } from 'vitest';
import {
  DEFAULT_HAZARDS,
  applyDamage,
  fallDamage,
  heal,
  makeVitals,
  stepHazards,
} from '../src/sim/hazards';
import { DT } from '../src/shared/constants';

const ctxAt = (y: number, warmth: { x: number; y: number; z: number }[] = [], sheltered = false) => ({
  pos: { x: 0, y, z: 0 },
  warmth,
  sheltered,
});

describe('exposure', () => {
  it('does not bite below the cold line', () => {
    const v = makeVitals();
    for (let i = 0; i < 600; i++) stepHazards(v, ctxAt(5), DEFAULT_HAZARDS, DT);
    expect(v.cold).toBe(0);
  });

  it('freezes you at altitude and eventually costs HP', () => {
    const v = makeVitals();
    for (let i = 0; i < 60 * 80; i++) stepHazards(v, ctxAt(55), DEFAULT_HAZARDS, DT);
    expect(v.cold).toBe(1);
    expect(v.hp).toBeLessThan(100);
  });

  it('warms back up at a fire', () => {
    const v = makeVitals();
    for (let i = 0; i < 60 * 40; i++) stepHazards(v, ctxAt(55), DEFAULT_HAZARDS, DT);
    expect(v.cold).toBeGreaterThan(0.3);
    expect(v.downed).toBe(false);

    const fire = [{ x: 2, y: 55, z: 0 }];
    for (let i = 0; i < 60 * 10; i++) stepHazards(v, ctxAt(55, fire), DEFAULT_HAZARDS, DT);
    expect(v.cold).toBe(0);
    expect(v.warming).toBe(true);
  });

  it('counts the cab as shelter', () => {
    const v = makeVitals();
    v.cold = 0.8;
    for (let i = 0; i < 60 * 5; i++) stepHazards(v, ctxAt(55, [], true), DEFAULT_HAZARDS, DT);
    expect(v.cold).toBeLessThan(0.8);
  });

  it('regenerates only after a quiet spell', () => {
    const v = makeVitals();
    applyDamage(v, 40);
    expect(v.hp).toBe(60);
    // still inside the regen delay
    for (let i = 0; i < 60 * 3; i++) stepHazards(v, ctxAt(0), DEFAULT_HAZARDS, DT);
    expect(v.hp).toBe(60);
    for (let i = 0; i < 60 * 12; i++) stepHazards(v, ctxAt(0), DEFAULT_HAZARDS, DT);
    expect(v.hp).toBeGreaterThan(60);
    expect(v.hp).toBeLessThanOrEqual(100);
  });
});

describe('falls', () => {
  it('is free below the safe speed and scales above it', () => {
    expect(fallDamage(10, DEFAULT_HAZARDS)).toBe(0);
    expect(fallDamage(DEFAULT_HAZARDS.safeFallSpeed, DEFAULT_HAZARDS)).toBe(0);
    const small = fallDamage(18, DEFAULT_HAZARDS);
    const big = fallDamage(26, DEFAULT_HAZARDS);
    expect(small).toBeGreaterThan(0);
    expect(big).toBeGreaterThan(small);
  });
});

describe('down state', () => {
  it('goes down at zero HP and stops taking damage', () => {
    const v = makeVitals();
    const r = applyDamage(v, 150);
    expect(r.wentDown).toBe(true);
    expect(v.downed).toBe(true);
    expect(v.hp).toBe(0);
    expect(applyDamage(v, 10).damage).toBe(0);
  });

  it('a medkit brings you back up', () => {
    const v = makeVitals();
    applyDamage(v, 100);
    expect(v.downed).toBe(true);
    heal(v, 55);
    expect(v.downed).toBe(false);
    expect(v.hp).toBe(55);
  });

  it('never heals past max', () => {
    const v = makeVitals();
    applyDamage(v, 10);
    heal(v, 999);
    expect(v.hp).toBe(v.maxHp);
  });
});
