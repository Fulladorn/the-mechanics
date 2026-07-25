import { describe, it, expect } from 'vitest';
import { WOLF, makeWolf, stepWolf, strikeWolf, type CombatEvent, type Wolf } from '../src/sim/combat';
import { DT } from '../src/shared/constants';
import { yawForward } from '../src/shared/math';

const target = (x: number, z: number, opts: { blocking?: boolean; downed?: boolean } = {}) => ({
  pos: { x, y: 0, z },
  blocking: opts.blocking ?? false,
  downed: opts.downed ?? false,
});

/** Run the wolf until it reaches `state`, returning total damage dealt. */
function runUntil(w: Wolf, t: ReturnType<typeof target>, state: string, max = 2000): { dmg: number; events: CombatEvent[]; hit: boolean } {
  const events: CombatEvent[] = [];
  let dmg = 0;
  for (let i = 0; i < max; i++) {
    dmg += stepWolf(w, t, DT, events);
    if (w.state === state) return { dmg, events, hit: true };
  }
  return { dmg, events, hit: false };
}

describe('wolf', () => {
  it('ignores you until you come into range', () => {
    const w = makeWolf(1, { x: 0, y: 0, z: 0 }, 7);
    const events: CombatEvent[] = [];
    for (let i = 0; i < 300; i++) stepWolf(w, target(0, 100), DT, events);
    expect(w.state).toBe('idle');
    expect(events.some((e) => e.t === 'wolfNotice')).toBe(false);
  });

  it('stalks, telegraphs, then lunges', () => {
    const w = makeWolf(1, { x: 0, y: 0, z: 0 }, 7);
    const t = target(0, 8);
    const r = runUntil(w, t, 'telegraph');
    expect(r.hit).toBe(true);
    expect(r.events.some((e) => e.t === 'wolfNotice')).toBe(true);
    expect(r.events.some((e) => e.t === 'wolfTelegraph')).toBe(true);

    // the telegraph is a real reaction window, not a frame
    let held = 0;
    const events: CombatEvent[] = [];
    while (w.state === 'telegraph' && held < 200) {
      stepWolf(w, t, DT, events);
      held++;
    }
    expect(held * DT).toBeGreaterThan(0.4);
    expect(w.state).toBe('lunge');
  });

  it('a connecting lunge hurts, and blocking cuts it down and staggers', () => {
    const open = makeWolf(1, { x: 0, y: 0, z: 0 }, 7);
    const openDmg = runUntil(open, target(0, 8), 'recover').dmg;
    expect(openDmg).toBeGreaterThan(0);

    const blocked = makeWolf(1, { x: 0, y: 0, z: 0 }, 7);
    const blockedRun = runUntil(blocked, target(0, 8, { blocking: true }), 'recover');
    expect(blockedRun.dmg).toBeGreaterThan(0);
    expect(blockedRun.dmg).toBeLessThan(openDmg);
    expect(blocked.staggered).toBe(true);
  });

  it('hitting a staggered wolf does far more than hitting a fresh one', () => {
    const fresh = makeWolf(1, { x: 0, y: 0, z: 2 }, 7);
    const facing = yawForward(Math.PI); // look toward +Z
    const events: CombatEvent[] = [];
    strikeWolf(fresh, { x: 0, y: 0, z: 0 }, facing, events);
    const chip = WOLF.wolfHp - fresh.hp;

    const staggered = makeWolf(2, { x: 0, y: 0, z: 2 }, 7);
    staggered.staggered = true;
    strikeWolf(staggered, { x: 0, y: 0, z: 0 }, facing, events);
    const punish = WOLF.wolfHp - staggered.hp;

    expect(chip).toBeGreaterThan(0);
    expect(punish).toBeGreaterThan(chip * 2);
  });

  it('cannot be hit from out of range or from behind you', () => {
    const far = makeWolf(1, { x: 0, y: 0, z: 20 }, 7);
    expect(strikeWolf(far, { x: 0, y: 0, z: 0 }, yawForward(Math.PI), [])).toBe(false);

    const behind = makeWolf(2, { x: 0, y: 0, z: -2 }, 7);
    expect(strikeWolf(behind, { x: 0, y: 0, z: 0 }, yawForward(Math.PI), [])).toBe(false);
  });

  it('dies after enough punished openings and then stops acting', () => {
    const w = makeWolf(1, { x: 0, y: 0, z: 2 }, 7);
    const facing = yawForward(Math.PI);
    const events: CombatEvent[] = [];
    for (let i = 0; i < 10 && w.state !== 'dead'; i++) {
      w.staggered = true;
      strikeWolf(w, { x: 0, y: 0, z: 0 }, facing, events);
    }
    expect(w.state).toBe('dead');
    expect(events.some((e) => e.t === 'wolfDied')).toBe(true);
    expect(stepWolf(w, target(0, 2), DT, events)).toBe(0);
  });

  it('breaks off when you are downed', () => {
    const w = makeWolf(1, { x: 0, y: 0, z: 0 }, 7);
    runUntil(w, target(0, 8), 'stalk');
    const events: CombatEvent[] = [];
    for (let i = 0; i < 600; i++) stepWolf(w, target(0, 8, { downed: true }), DT, events);
    expect(['idle', 'flee']).toContain(w.state);
  });

  it('is deterministic for a given seed', () => {
    const run = () => {
      const w = makeWolf(3, { x: 0, y: 0, z: 0 }, 99);
      const events: CombatEvent[] = [];
      let dmg = 0;
      for (let i = 0; i < 900; i++) dmg += stepWolf(w, target(0, 9), DT, events);
      return { dmg, pos: { ...w.pos }, state: w.state, n: events.length };
    };
    expect(run()).toEqual(run());
  });
});
