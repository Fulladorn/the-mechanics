import { describe, it, expect } from 'vitest';
import { Terrain, type TerrainDef } from '../src/sim/terrain';
import { makeMountains } from '../src/content/levels/mountains';

const DEF: TerrainDef = {
  peakY: 60,
  baseY: 0,
  peakR: 40,
  baseR: 220,
  road: {
    startAngle: 0.3,
    turns: 2,
    topR: 50,
    bottomR: 200,
    topY: 50,
    bottomY: 2,
    halfWidth: 5,
    shoulder: 10,
  },
  relief: 8,
  seed: 12345,
};

describe('terrain', () => {
  it('is deterministic for a given definition', () => {
    const a = new Terrain(DEF);
    const b = new Terrain({ ...DEF });
    for (const [x, z] of [
      [0, 0],
      [37, -84],
      [-150, 66],
      [210, 12],
    ]) {
      expect(a.heightAt(x, z)).toBe(b.heightAt(x, z));
    }
  });

  it('flattens the road to the spiral height', () => {
    const t = new Terrain(DEF);
    for (const p of [0.1, 0.35, 0.6, 0.85]) {
      const c = t.roadPoint(p);
      // dead centre of the road is within a camber's worth of the spiral height
      expect(Math.abs(t.heightAt(c.x, c.z) - c.y)).toBeLessThan(0.2);
      expect(t.onRoad(c.x, c.z)).toBe(true);
    }
  });

  it('the road descends monotonically from summit to base', () => {
    const t = new Terrain(DEF);
    let prev = Infinity;
    for (let i = 0; i <= 40; i++) {
      const p = t.roadPoint(i / 40);
      const h = t.heightAt(p.x, p.z);
      expect(h).toBeLessThan(prev);
      prev = h;
    }
  });

  it('falls away off the outer edge of the road', () => {
    const t = new Terrain(DEF);
    const p = t.roadPoint(0.4);
    const len = Math.hypot(p.x, p.z);
    const out = (d: number) => t.heightAt(p.x + (p.x / len) * d, p.z + (p.z / len) * d);
    // Outward from the spiral the mountain drops away — that's the cliff.
    expect(out(30)).toBeLessThan(out(0));
  });

  it('road surface is walkably flat across its width', () => {
    const t = new Terrain(DEF);
    const p = t.roadPoint(0.5);
    const len = Math.hypot(p.x, p.z);
    for (let d = -4; d <= 4; d += 1) {
      const x = p.x + (p.x / len) * d;
      const z = p.z + (p.z / len) * d;
      expect(t.slopeAt(x, z)).toBeLessThan(0.25);
    }
  });

  it('levels a pad flat where a cabin sits', () => {
    const withPad = new Terrain({
      ...DEF,
      pads: [{ x: 120, z: 0, radius: 8, blend: 8 }],
    });
    const centre = withPad.heightAt(120, 0);
    // every corner of a 6 m footprint lands on the same height
    for (const [dx, dz] of [
      [3, 3],
      [-3, 3],
      [3, -3],
      [-3, -3],
    ]) {
      expect(Math.abs(withPad.heightAt(120 + dx, dz) - centre)).toBeLessThan(0.02);
    }
  });
});

describe('mountains terrain layout', () => {
  const level = makeMountains();
  const t = new Terrain(level.terrain!);

  it('spawns the player and the vehicle on solid ground', () => {
    expect(Math.abs(level.spawn.y - t.heightAt(level.spawn.x, level.spawn.z))).toBeLessThan(0.3);
    expect(
      Math.abs(level.vehicleStart.y - t.heightAt(level.vehicleStart.x, level.vehicleStart.z)),
    ).toBeLessThan(0.3);
  });

  it('puts the vehicle and the exfil pad on the road', () => {
    expect(t.onRoad(level.vehicleStart.x, level.vehicleStart.z)).toBe(true);
    expect(t.onRoad(level.exfil!.pos.x, level.exfil!.pos.z)).toBe(true);
  });

  it('keeps every pickup within reach of the ground', () => {
    for (const item of level.items) {
      const g = t.heightAt(item.pos.x, item.pos.z);
      const above = item.pos.y - g;
      // On the ground or on a cabin deck — never buried, never floating.
      expect(above, `${item.kind} at ${above.toFixed(2)}m above ground`).toBeGreaterThan(-0.1);
      expect(above, `${item.kind} at ${above.toFixed(2)}m above ground`).toBeLessThan(1.6);
    }
  });

  it('spawns wolves off the road so they ambush rather than block it', () => {
    for (const w of level.wolves ?? []) {
      expect(t.onRoad(w.x, w.z)).toBe(false);
    }
  });
});
