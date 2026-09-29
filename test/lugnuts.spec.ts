import { describe, expect, it } from 'vitest';
import { World } from '../src/sim/world';
import { makeSandbox } from '../src/content/levels/sandbox';
import { HUB_DROOP } from '../src/sim/vehicle';
import type { SlotDef } from '../src/sim/machine';
import { Bot } from './bot';

// The lug-nut job has to be easy to *do*: you click where the nut is drawn,
// a nut you took off stays off, and a wobbly hand doesn't throw away progress.

async function setup() {
  const w = await World.create(makeSandbox());
  const bot = new Bot(w);
  bot.tick(30);
  const m = w.machine('betsy');
  const wrench = w.items.list.find((i) => i.kind === 'wrench' && i.state === 'world')!;
  bot.approach(wrench.pos);
  bot.tapAt(wrench.pos, /Pick up Ratchet Wrench/);
  const slot = m.comp<SlotDef>('wheelRL');
  const hub = m.world(slot.pos);
  bot.approach(hub, 1.2, { x: hub.x - 3, y: 0, z: hub.z });
  return { w, bot, m, slot };
}

const lerp = (a: { x: number; y: number; z: number }, b: typeof a, k: number) => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: a.z + (b.z - a.z) * k });

describe('lug nuts', () => {
  it('a nut you took off a flat wheel never offers to go back on', async () => {
    const { w, bot, m, slot } = await setup();
    const p0 = m.boltPos(slot.id, 0);
    expect(bot.loosenAt(p0)).toMatch(/Loosen lug nut · 0\/5 off/);
    expect(m.boltsOf(slot)[0].s).toBe('out');
    bot.aim(p0);
    expect(bot.focusLabel()).not.toMatch(/Torque/);
    // Holding the trigger there must not re-thread it.
    bot.seconds(1, { use: true });
    bot.tick(1);
    expect(m.boltsOf(slot)[0].s).toBe('out');
    // The job sheet says which wheel and counts what's off.
    expect(w.machine('betsy').nextStep('tire', w.ctx)?.text).toMatch(/rear-left wheel's lug nuts — 1\/5 off/);
  });

  it('aiming at the middle of the hub picks a nut, not the wheel', async () => {
    const { bot, m, slot } = await setup();
    bot.aim(m.slotPoint(slot.id, slot.pos));
    expect(bot.focusLabel()).toMatch(/^Loosen lug nut/);
    // and with the nuts off, the wheel itself says how to proceed
    slot.bolts!.forEach((_, i) => bot.loosenAt(m.boltPos(slot.id, i)));
    bot.aim(m.slotPoint(slot.id, slot.pos));
    expect(bot.focusLabel()).toMatch(/Take off the shredded wheel \[Jack it up first — .*hold E to pump\]/);
  });

  it('click targets follow the hub when the corner is jacked (where the nut is drawn)', async () => {
    const { w, bot, m, slot } = await setup();
    const jack = w.items.list.find((i) => i.kind === 'jack' && i.state === 'world')!;
    bot.approach(jack.pos);
    bot.tapAt(jack.pos, /Pick up Trolley Jack/);
    const jp = m.world({ x: -0.66, y: -0.66, z: 1.36 - 0.55 });
    const hub = m.world(slot.pos);
    bot.approach(jp, 1.1, { x: hub.x - 3, y: 0, z: hub.z });
    bot.tapAt(jp, /Slide the jack under/);
    bot.holdAt(jp, 1.5, /Pump the jack/);
    expect(m.jackRaised('jackRL')).toBe(true);
    bot.tick(2);
    // Same instant, same body pose: the target sits HUB_DROOP below the rest spot.
    expect(m.world(slot.bolts![0].pos).y - m.boltPos(slot.id, 0).y).toBeCloseTo(HUB_DROOP, 3);
    bot.approach(m.world(slot.pos), 1.2, { x: hub.x - 3, y: 0, z: hub.z });
    slot.bolts!.forEach((_, i) => bot.loosenAt(m.boltPos(slot.id, i)));
    expect(m.boltsOf(slot).every((b) => b.s === 'out')).toBe(true);
  });

  it('a wobble toward the next nut mid-hold keeps working the first one', async () => {
    const { bot, m, slot } = await setup();
    const p0 = m.boltPos(slot.id, 0);
    const p1 = m.boltPos(slot.id, 1);
    bot.aim(p0);
    bot.seconds(0.2, { use: true });
    // Hand drifts 60% of the way (past the midpoint) to the neighbour, still holding (re-aim
    // without the bot's usual idle tick, which would let go of the button).
    const e = bot.w.player.eye();
    const q = lerp(p0, p1, 0.6);
    bot.intent.yaw = Math.atan2(-(q.x - e.x), -(q.z - e.z));
    bot.intent.pitch = Math.atan2(q.y - e.y, Math.hypot(q.x - e.x, q.z - e.z));
    bot.seconds(0.4, { use: true });
    bot.tick(1);
    const b = m.boltsOf(slot);
    expect(b[0].s).toBe('out');
    expect(b[1].s).toBe('tight');
  });
});
