import { describe, expect, it } from 'vitest';
import { World } from '../src/sim/world';
import { makeDepot, DEPOT } from '../src/content/levels/depot';
import type { PanelDef, SlotDef, TerminalsDef, JackDef, FluidDef } from '../src/sim/machine';
import { Bot } from './bot';

describe('tutorial: orientation day', () => {
  it('can be played start to finish through the real interaction pipeline', async () => {
    const w = await World.create(makeDepot());
    const bot = new Bot(w);
    const m = w.machine('betsy');
    const beat = () => w.currentBeat()?.id;
    bot.tick(20);
    expect(beat()).toBe('clockin');

    // 1. punch in
    bot.approach(DEPOT.clock, 1.2);
    bot.tapAt(DEPOT.clock, /Punch in/);
    bot.tick(2);
    expect(beat()).toBe('gear');

    // 2. locker, tools
    bot.approach(DEPOT.locker, 1.3, { x: DEPOT.locker.x, y: 0, z: DEPOT.locker.z + 3 });
    bot.tapAt(DEPOT.locker, /Open your locker/);
    for (const kind of ['wrench', 'flashlight'] as const) {
      const it = w.items.list.find((i) => i.kind === kind)!;
      expect(w.items.visible(it)).toBe(true);
      bot.approach(it.pos, 1.0, { x: it.pos.x, y: 0, z: it.pos.z + 3 });
      bot.tapAt(it.pos, /Pick up/);
    }
    bot.tick(2);
    expect(beat()).toBe('inspect');

    // 3. inspect
    const roof = m.world({ x: 0, y: 1.1, z: 1.4 });
    bot.approach(roof, 2.4, { x: roof.x + 5, y: 0, z: roof.z });
    bot.holdAt(roof, 1.4, /Inspect/);
    bot.tick(2);
    expect(m.state.inspected).toBe(true);
    expect(beat()).toBe('tire');

    // 4. tyre (the flat is on the truck's rear-left; the truck faces +Z so that's world +X)
    const slot = m.comp<SlotDef>('wheelRL');
    const outside = (p: { x: number; z: number }, d = 3) => {
      const c = m.pos;
      const dx = p.x - c.x;
      const dz = p.z - c.z;
      const l = Math.hypot(dx, dz) || 1;
      return { x: c.x + (dx / l) * (l + d), y: 0, z: c.z + (dz / l) * (l + d) };
    };
    const hub = m.world(slot.pos);
    const tyre = m.world({ x: slot.pos.x - 0.08, y: slot.pos.y + 0.27, z: slot.pos.z + 0.1 });
    bot.approach(hub, 1.2, outside(hub));
    slot.bolts!.forEach((_, i) => bot.loosenAt(m.boltPos(slot.id, i)));
    const jackItem = w.items.list.find((i) => i.kind === 'jack')!;
    bot.approach(jackItem.pos, 1.1);
    bot.tapAt(jackItem.pos, /Pick up Trolley Jack/);
    const jp = m.world(m.comp<JackDef>('jackRL').pos);
    bot.approach(jp, 1.1, outside(jp));
    bot.tapAt(jp, /Slide the jack/);
    bot.holdAt(jp, 1.5, /Pump the jack/);
    bot.approach(hub, 1.2, outside(hub));
    bot.tapAt(tyre, /Take off the shredded wheel/);
    bot.tick(1, { drop: true });
    bot.tick(3);
    const spare = w.nearestItem('wheel')!;
    expect(spare).toBeTruthy();
    bot.approach(spare.pos, 1.1);
    bot.tapAt(spare.pos, /Pick up Wheel/);
    bot.approach(hub, 1.2, outside(hub));
    bot.tapAt(tyre, /Fit the wheel/);
    slot.bolts!.forEach((_, i) => bot.torqueAt(m.boltPos(slot.id, i)));
    bot.approach(jp, 1.1, outside(jp));
    bot.holdAt(jp, 1.2, /Lower the jack/);
    bot.tapAt(jp, /Pull the jack out/);
    bot.tick(1, { drop: true });
    bot.tick(3);
    expect(w.systemOk('betsy', 'tire')).toBe(true);
    bot.tick(2);
    expect(beat()).toBe('battery');

    // 5. battery
    const front = m.world({ x: 0, y: 0.3, z: -2.18 });
    const frontStand = outside(front, 1.2);
    bot.approach(front, 1.0, frontStand);
    bot.tapAt(front, /Open the hood/);
    bot.seconds(0.4);
    const term = m.comp<TerminalsDef>('batt');
    const neg = m.world(term.neg);
    const pos = m.world(term.pos);
    bot.approach(neg, 0.8, frontStand);
    bot.tapAt(neg, /Unclip the black/);
    bot.tapAt(pos, /Unclip the red/);
    const bslot = m.comp<SlotDef>('battery');
    bot.loosenAt(m.boltPos(bslot.id, 0));
    const battTop = m.world({ x: bslot.pos.x, y: bslot.pos.y + 0.05, z: bslot.pos.z + 0.05 });
    bot.tapAt(battTop, /Take off the dead battery/);
    bot.tick(1, { drop: true });
    bot.tick(3);
    const fresh = w.nearestItem('battery')!;
    bot.approach(fresh.pos, 1.0);
    bot.tapAt(fresh.pos, /Pick up Battery/);
    bot.approach(neg, 0.8, frontStand);
    bot.tapAt(battTop, /Fit the battery/);
    bot.torqueAt(m.boltPos(bslot.id, 0));
    bot.tapAt(pos, /Clip on the red/);
    bot.tapAt(neg, /Clip on the black/);
    expect(bot.events('zap').length).toBe(0);
    bot.tick(2);
    expect(w.systemOk('betsy', 'battery')).toBe(true);
    expect(beat()).toBe('fuses');

    // 6. fuses (lights-out is self-inverse: pressing the scramble again solves it)
    const panel = m.comp<PanelDef>('fuses');
    const pp = m.world(panel.pos);
    bot.approach(pp, 0.8, frontStand);
    bot.tapAt(pp, /fuse box/i);
    expect(w.panel).toBeTruthy();
    for (const i of m.fuse.get('fuses')!.puzzle.scramble) w.command({ t: 'fuse', index: i });
    bot.tick(2);
    expect(w.systemOk('betsy', 'fuses')).toBe(true);
    w.command({ t: 'closePanel' });
    bot.tick(2);
    expect(beat()).toBe('fuel');

    // 7. fuel
    const can = w.nearestItem('jerrycan')!;
    expect(can.fill).toBeGreaterThan(0.9);
    bot.approach(can.pos, 1.0);
    bot.tapAt(can.pos, /Pick up Jerry Can/);
    const filler = m.world(m.comp<FluidDef>('fuel').pos);
    bot.approach(filler, 1.0, outside(filler));
    bot.holdAt(filler, 2.5, /Pour fuel/);
    expect(w.systemOk('betsy', 'fuel')).toBe(true);
    bot.tick(1, { drop: true });
    bot.tick(3);
    expect(beat()).toBe('start');

    // 8. close the hood, get in
    bot.approach(front, 1.0, frontStand);
    bot.tapAt(m.world({ x: 0, y: 1.5, z: -1.52 }), /Close the hood/);
    expect(w.doors.get('rollup')!.open).toBe(true);
    const v = w.vehicle('betsy');
    const door = v.world(v.def.door.pos);
    bot.approach(door, 1.0, outside(door, 2));
    bot.tapAt(door, /Drive the Betsy/);
    bot.seconds(1.6);
    expect(v.running).toBe(true);
    bot.tick(2);
    expect(beat()).toBe('course');

    // 9. the course (placed through each gate) and the bay
    for (const g of DEPOT.gates) {
      v.place({ x: g.x, y: 1.0, z: g.z }, Math.PI);
      bot.tick(10);
    }
    bot.tick(2);
    expect(beat()).toBe('park');
    v.place({ x: DEPOT.bay.x, y: 1.0, z: DEPOT.bay.z }, Math.PI);
    bot.seconds(1.5);
    expect(w.ended).toBe('won');
  });
});
