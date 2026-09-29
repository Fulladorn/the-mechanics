import { makeRng } from '../shared/math';
import type { Terrain } from '../sim/terrain';
import type { StaticDef } from './levels/types';

// Trees, bushes and rocks as plain data. Levels scatter them deterministically
// so the sim can give trunks and boulders colliders and the renderer can
// instance the same list. Neither side ever disagrees about where a tree is.

export type NatureKind = 'pine' | 'fir' | 'broadleaf' | 'birch' | 'bush' | 'rock' | 'boulder' | 'stump' | 'log' | 'deadTree';

export interface NatureInst {
  kind: NatureKind;
  x: number;
  y: number;
  z: number;
  yaw: number;
  scale: number;
  variant: number;
}

export interface ScatterRule {
  kind: NatureKind;
  count: number;
  /** Returns 0..1 probability of keeping a candidate point. */
  where: (x: number, z: number, t: Terrain) => number;
  scale: [number, number];
  variants?: number;
  /** Minimum spacing to other instances of any kind. */
  gap?: number;
}

export function scatter(t: Terrain, rules: ScatterRule[], seed: number, area = t.half - 8): NatureInst[] {
  const rng = makeRng(seed);
  const out: NatureInst[] = [];
  const grid = new Map<number, NatureInst[]>();
  const C = 6;
  const key = (x: number, z: number) => Math.floor(x / C) * 73856093 + Math.floor(z / C) * 19349663;
  const clear = (x: number, z: number, gap: number) => {
    const r = Math.ceil(gap / C);
    for (let i = -r; i <= r; i++)
      for (let j = -r; j <= r; j++) {
        for (const o of grid.get(key(x + i * C, z + j * C)) ?? []) if (Math.hypot(o.x - x, o.z - z) < gap) return false;
      }
    return true;
  };
  for (const rule of rules) {
    let placed = 0;
    let tries = 0;
    while (placed < rule.count && tries++ < rule.count * 30) {
      const x = (rng() * 2 - 1) * area;
      const z = (rng() * 2 - 1) * area;
      if (rng() > rule.where(x, z, t)) continue;
      const gap = rule.gap ?? 1.5;
      if (!clear(x, z, gap)) continue;
      const inst: NatureInst = {
        kind: rule.kind,
        x,
        z,
        y: t.heightAt(x, z),
        yaw: rng() * Math.PI * 2,
        scale: rule.scale[0] + rng() * (rule.scale[1] - rule.scale[0]),
        variant: Math.floor(rng() * (rule.variants ?? 3)),
      };
      out.push(inst);
      const k = key(x, z);
      let l = grid.get(k);
      if (!l) grid.set(k, (l = []));
      l.push(inst);
      placed++;
    }
  }
  return out;
}

/** Colliders for the solid bits: trunks, boulders, logs. */
export function natureColliders(list: NatureInst[]): StaticDef[] {
  const out: StaticDef[] = [];
  for (const n of list) {
    const s = n.scale;
    switch (n.kind) {
      case 'pine':
      case 'fir':
      case 'broadleaf':
      case 'birch':
      case 'deadTree':
        out.push({ shape: 'cyl', pos: { x: n.x, y: n.y + 1.5 * s, z: n.z }, size: { x: 0.22 * s, y: 1.5 * s, z: 0 }, surface: 'wood', owner: 'tree' });
        break;
      case 'boulder':
        out.push({ shape: 'ball', pos: { x: n.x, y: n.y + 0.3 * s, z: n.z }, size: { x: 0.95 * s, y: 0, z: 0 }, surface: 'rock', owner: 'rock' });
        break;
      case 'rock':
        if (s > 0.8) out.push({ shape: 'ball', pos: { x: n.x, y: n.y + 0.05 * s, z: n.z }, size: { x: 0.5 * s, y: 0, z: 0 }, surface: 'rock', owner: 'rock' });
        break;
      case 'log':
        out.push({ shape: 'box', pos: { x: n.x, y: n.y + 0.25 * s, z: n.z }, size: { x: 1.6 * s, y: 0.25 * s, z: 0.25 * s }, yaw: n.yaw, surface: 'wood', owner: 'log' });
        break;
      case 'stump':
        out.push({ shape: 'cyl', pos: { x: n.x, y: n.y + 0.25 * s, z: n.z }, size: { x: 0.35 * s, y: 0.25 * s, z: 0 }, surface: 'wood', owner: 'stump' });
        break;
    }
  }
  return out;
}
