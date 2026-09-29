import { describe, expect, it } from 'vitest';
import { World } from '../src/sim/world';
import { makeSandbox } from '../src/content/levels/sandbox';
import { Bot } from './bot';
import type { SlotDef, TerminalsDef } from '../src/sim/machine';

async function setup() {
  const w = await World.create(makeSandbox());
  const bot = new Bot(w);
  bot.tick(30);
  return { w, bot, m: w.machine('betsy') };
}

describe('repair machine', () => {
  it('swaps a flat tyre the long way round', async () => {
    const { w, bot, m } = await setup();
    const find = (kind: string) => w.items.list.find((i) => i.kind === kind && i.state === 'world')!;

    bot.approach(find('wrench').pos);
    bot.tapAt(find('wrench').pos, /Pick up Ratchet Wrench/);
    expect(w.hasItem('wrench')).toBe(true);

    const slot = m.comp<SlotDef>('wheelRL');
    const hub = m.world(slot.pos);
    // Aim at the rubber, not the nuts.
    const tyre = m.world({ x: slot.pos.x - 0.08, y: slot.pos.y + 0.27, z: slot.pos.z + 0.1 });
    // Loosen all five nuts first (you can, with the wheel on the ground).
    bot.approach(hub, 1.2, { x: hub.x - 3, y: 0, z: hub.z });
    slot.bolts!.forEach((_, i) => bot.loosenAt(m.boltPos(slot.id, i)));
    expect(m.boltsOf(slot).every((b) => b.s === 'out')).toBe(true);

    // Can't pull it until it's jacked.
    bot.aim(tyre);
    expect(bot.focusLabel()).toMatch(/Jack it up first/);

    const jack = find('jack');
    bot.approach(jack.pos);
    bot.tapAt(jack.pos, /Pick up Trolley Jack/);
    expect(w.heldItem()?.kind).toBe('jack');
    const jp = m.world(m.comp<SlotDef>('wheelRL').pos);
    const jackPoint = m.world({ x: -0.66, y: -0.66, z: 1.36 - 0.55 });
    bot.approach(jackPoint, 1.1, { x: jp.x - 3, y: 0, z: jp.z });
    bot.tapAt(jackPoint, /Slide the jack under/);
    bot.holdAt(jackPoint, 1.5, /Pump the jack/);
    expect(m.jackRaised('jackRL')).toBe(true);
    expect(w.vehicle('betsy').pinned).toBe(true);

    bot.approach(hub, 1.2, { x: hub.x - 3, y: 0, z: hub.z });
    bot.tapAt(tyre, /Take off the shredded wheel/);
    expect(w.heldItem()?.cond).toBe('bad');
    bot.tick(1, { drop: true });
    bot.tick(2);
    expect(w.heldItem()).toBeUndefined();

    const good = w.items.list.find((i) => i.kind === 'wheel' && i.state === 'world' && i.cond === 'good')!;
    bot.approach(good.pos);
    bot.tapAt(good.pos, /Pick up Wheel/);
    bot.approach(hub, 1.2, { x: hub.x - 3, y: 0, z: hub.z });
    bot.tapAt(tyre, /Fit the wheel/);
    slot.bolts!.forEach((_, i) => bot.torqueAt(m.boltPos(slot.id, i)));
    expect(m.componentOk('wheelRL', w.items)).toBe(true);

    bot.approach(jackPoint, 1.1, { x: jp.x - 3, y: 0, z: jp.z });
    bot.holdAt(jackPoint, 1.2, /Lower the jack/);
    bot.tapAt(jackPoint, /Pull the jack out/);
    expect(w.systemOk('betsy', 'tire')).toBe(true);
    expect(bot.events('systemGo').some((e) => e.t === 'systemGo' && e.system === 'tire')).toBe(true);
    bot.tick(10);
    expect(w.vehicle('betsy').pinned).toBe(false);
  });

  it('sparks if you take the positive terminal off first', async () => {
    const { w, bot, m } = await setup();
    const hood = m.world({ x: 0, y: 0.3, z: -2.18 });
    bot.approach(hood, 1.2, { x: hood.x, y: 0, z: hood.z - 3 });
    bot.tapAt(hood, /Open the hood/);
    const t = m.comp<TerminalsDef>('batt');
    const pos = m.world(t.pos);
    bot.approach(pos, 0.9, { x: pos.x + 1, y: 0, z: pos.z - 3 });
    const hp = w.vitals.hp;
    bot.tapAt(pos, /Unclip the red/);
    expect(bot.events('zap').length).toBe(1);
    expect(w.vitals.hp).toBeLessThan(hp);
  });

  it('torque past the band slips the thread', async () => {
    const { w, bot, m } = await setup();
    w.items.spawn({ kind: 'wrench', pos: { x: 0, y: 0, z: 0 } });
    const wr = w.items.list.find((i) => i.kind === 'wrench' && i.state === 'world')!;
    bot.approach(wr.pos);
    bot.tapAt(wr.pos);
    const slot = m.comp<SlotDef>('wheelFL');
    const hub = m.world(slot.pos);
    bot.approach(hub, 1.2, { x: hub.x - 3, y: 0, z: hub.z });
    const b = m.boltPos(slot.id, 0);
    bot.loosenAt(b);
    bot.aim(b);
    bot.seconds(1.2, { use: true });
    bot.tick(1);
    expect(bot.events('boltSlip').length).toBeGreaterThan(0);
    expect(m.boltsOf(slot)[0].s).not.toBe('tight');
  });
});
