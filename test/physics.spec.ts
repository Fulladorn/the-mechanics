import { describe, expect, it } from 'vitest';
import { World, makeIntent } from '../src/sim/world';
import { makeSandbox } from '../src/content/levels/sandbox';

const make = async () => {
  const w = await World.create(makeSandbox());
  const I = makeIntent();
  const step = (n: number, p: Partial<typeof I> = {}) => {
    for (let i = 0; i < n; i++) w.step({ ...I, ...p }, 1 / 60);
  };
  return { w, step };
};

describe('player + vehicle physics', () => {
  it('player stands on the ground and walks ~6 m/s', async () => {
    const { w, step } = await make();
    step(30);
    expect(w.player.onGround).toBe(true);
    const z0 = w.player.pos.z;
    step(60, { fwd: true, yaw: 0 });
    expect(z0 - w.player.pos.z).toBeGreaterThan(5);
    expect(z0 - w.player.pos.z).toBeLessThan(7);
  });

  it('the truck rests on its suspension, accelerates, steers and brakes', async () => {
    const { w, step } = await make();
    const v = w.vehicle('betsy');
    step(60);
    expect(v.pos.y).toBeGreaterThan(0.75);
    expect(v.pos.y).toBeLessThan(0.95);
    (w as unknown as { enterVehicle(x: unknown): void }).enterVehicle(v);
    step(90);
    step(180, { fwd: true });
    expect(v.speed).toBeGreaterThan(8);
    const f0 = v.forward();
    step(40, { fwd: true, left: true });
    const f1 = v.forward();
    expect(f1.x).toBeLessThan(f0.x - 0.2); // turned left (toward -X)
    let n = 0;
    while (Math.abs(v.speed) > 0.5 && n++ < 400) step(1, { back: true });
    expect(n).toBeLessThan(240);
  });

  it('a dropped item falls and comes to rest on the ground', async () => {
    const { w, step } = await make();
    const it = w.items.list.find((i) => i.kind === 'battery' && i.state === 'world')!;
    w.items.place(it, { x: 10, y: 5, z: 10 });
    step(240);
    expect(it.pos.y).toBeGreaterThan(-0.05);
    expect(it.pos.y).toBeLessThan(0.4);
  });
});
