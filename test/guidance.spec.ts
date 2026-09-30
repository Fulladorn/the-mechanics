import { describe, expect, it } from 'vitest';
import { World } from '../src/sim/world';
import { makeDepot } from '../src/content/levels/depot';
import { makeRidge } from '../src/content/levels/ridge';
import { GuideBot } from './guide';

// Every repair step must be doable by a player who only follows what the game
// shows: the waypoint, the next-step glow and the prompt. No component ids.

/** Park the quad near p, as if the player had ridden it there. */
function bringAtv(w: World, p: { x: number; z: number }): void {
  const x = p.x + 3;
  const z = p.z + 3;
  w.vehicle('atv').place({ x, y: w.terrain.heightAt(x, z) + 0.8, z }, 0);
}

describe('guidance: a first-timer can follow it', () => {
  it('tutorial: punch in → fuel, by waypoint and glow alone', async () => {
    const w = await World.create(makeDepot());
    const bot = new GuideBot(w);
    bot.tick(20);
    bot.follow({ until: () => w.currentBeat()?.id === 'start', maxMoves: 120 });
    for (const sys of ['tire', 'battery', 'fuses', 'fuel']) expect(w.systemOk('betsy', sys)).toBe(true);
    expect(bot.events('zap').length).toBe(0);
  });

  it('the ridge job: every on-foot step to "start her up", by waypoint and glow alone', async () => {
    const w = await World.create(makeRidge());
    const bot = new GuideBot(w);
    bot.tick(20);
    const car = () => w.vehicle('ridgeback');
    bot.follow({
      until: () => w.currentBeat()?.id === 'start',
      maxMoves: 400,
      stand: {
        // The bot can't drive. Where a player rides the quad, it arrives with it.
        ride: (w) => {
          const c = car().pos;
          w.teleport({ x: c.x + 4, y: w.terrain.heightAt(c.x + 4, c.z + 6) + 0.1, z: c.z + 6 });
          bringAtv(w, { x: c.x + 5, z: c.z + 9 });
        },
        sawmill: (w) => bringAtv(w, w.marker()!),
        camp: (w) => bringAtv(w, w.marker()!),
        fitbattery: (w) => bringAtv(w, { x: car().pos.x + 5, z: car().pos.z + 9 }),
      },
    });
    for (const sys of ['wheel', 'battery', 'fuel', 'coolant', 'ignition']) expect(w.systemOk('ridgeback', sys)).toBe(true);
  });
});

describe('hints stay true', () => {
  it('an empty mount points at the part where it actually is, not where it started', async () => {
    const w = await World.create(makeRidge());
    const m = w.machine('ridgeback');
    const atv = w.vehicle('atv');
    // a good battery strapped to the quad
    const batt = w.items.list.find((i) => i.kind === 'battery' && i.cond === 'good')!;
    w.items.take(batt, 'racked');
    atv.rack.push(batt.id);
    // pull the dead one so the mount is empty
    const dead = m.slotItem(w.items, 'battery')!;
    m.state.slots.battery = null;
    w.items.take(dead, 'gone');
    m.state.covers.hood = true;
    const ctx = w.ctx;
    const empty = m.interactables(ctx, m.world(m.comp('battery').pos), 3).find((c) => c.id.endsWith(':slot:battery'))!;
    expect(empty.disabled).toMatch(/strapped to the .*rack/);
  });
});
