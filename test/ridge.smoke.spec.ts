import { describe, expect, it } from 'vitest';
import { World } from '../src/sim/world';
import { makeRidge } from '../src/content/levels/ridge';
import { Bot } from './bot';

describe('the ridge job: smoke', () => {
  it('builds, and the unchocked truck goes over the edge', async () => {
    const w = await World.create(makeRidge());
    const bot = new Bot(w);
    const v = w.vehicle('ridgeback');
    const z0 = v.pos.z;
    bot.seconds(2);
    expect(w.currentBeat()?.id).toBe('chock');
    const track: string[] = [];
    for (let i = 0; i < 20 && !w.ended; i++) {
      bot.seconds(5);
      track.push(`${(i + 1) * 5}s z=${v.pos.z.toFixed(1)} y=${v.pos.y.toFixed(1)} v=${v.speed.toFixed(2)}`);
    }
    console.log(`start z=${z0.toFixed(1)}\n` + track.join('\n'));
    expect(w.ended).toBe('failed');
    expect(w.failReason).toBe('vehicleLost');
  }, 60000);
});
