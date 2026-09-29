import { describe, expect, it } from 'vitest';
import { makeWolf, stepWolf, type CombatEvent } from '../src/sim/combat';

describe('wolf pack', () => {
  it('takes turns: never more than one wolf committing to a bite', () => {
    const pack = [makeWolf(0, { x: 6, y: 0, z: 0 }, 1), makeWolf(1, { x: -6, y: 0, z: 1 }, 2), makeWolf(2, { x: 0, y: 0, z: 7 }, 3)];
    const target = { pos: { x: 0, y: 0, z: 0 }, blocking: false, downed: false, fear: [], engaged: false };
    const events: CombatEvent[] = [];
    let worst = 0;
    let bites = 0;
    for (let i = 0; i < 60 * 20; i++) {
      for (const w of pack) {
        target.engaged = pack.some((o) => o !== w && (o.state === 'telegraph' || o.state === 'lunge' || o.state === 'recover'));
        if (stepWolf(w, target, 1 / 60, events) > 0) bites++;
      }
      worst = Math.max(worst, pack.filter((w) => w.state === 'telegraph' || w.state === 'lunge').length);
    }
    expect(worst).toBe(1);
    // still a real threat: they do bite, just one after another
    expect(bites).toBeGreaterThan(3);
    // over 20 s, three wolves in turn deal survivable-with-effort damage (not a 5 s death)
    expect(bites).toBeLessThan(14);
  });
});
