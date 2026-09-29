import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Nature } from '../src/client/render/foliage';
import type { NatureKind } from '../src/content/nature';

// Every canopy must be a closed surface: an edge used by only one triangle is
// a hole you can see the sky through.
function openEdges(g: THREE.BufferGeometry): number {
  const pos = g.getAttribute('position');
  const r = (v: number) => (Math.round(v * 1000) / 1000 + 0).toFixed(3);
  const key = (i: number) => `${r(pos.getX(i))},${r(pos.getY(i))},${r(pos.getZ(i))}`;
  const edges = new Map<string, number>();
  for (let t = 0; t < pos.count / 3; t++) {
    const ks = [key(t * 3), key(t * 3 + 1), key(t * 3 + 2)];
    if (new Set(ks).size < 3) continue;
    for (let e = 0; e < 3; e++) {
      const k = [ks[e], ks[(e + 1) % 3]].sort().join('|');
      edges.set(k, (edges.get(k) ?? 0) + 1);
    }
  }
  return [...edges.values()].filter((v) => v === 1).length;
}

describe('trees are solid', () => {
  for (const kind of ['pine', 'fir', 'broadleaf', 'birch', 'bush'] as NatureKind[]) {
    it(`${kind} has no holes`, () => {
      for (let variant = 0; variant < 3; variant++) {
        const n = new Nature([{ kind, variant, x: 0, y: 0, z: 0, yaw: 0, scale: 1 } as never]);
        const g = (n.group.children[0] as THREE.Mesh).geometry;
        expect(openEdges(g), `${kind} v${variant}`).toBe(0);
      }
    });
  }
});
