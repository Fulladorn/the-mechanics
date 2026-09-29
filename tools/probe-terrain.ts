// Dev tool: print terrain heights at named points and road grades.
// npx vite-node tools/probe-terrain.ts
import { Terrain } from '../src/sim/terrain';
import { RIDGE, RIDGE_TERRAIN } from '../src/content/levels/ridgeTerrain';

const t0 = performance.now();
const t = new Terrain(RIDGE_TERRAIN);
console.log(`bake ${(performance.now() - t0).toFixed(0)} ms, n=${t.n}`);
for (const [k, p] of Object.entries(RIDGE)) {
  console.log(k.padEnd(14), `(${p.x}, ${p.z})`.padEnd(14), 'h', t.heightAt(p.x, p.z).toFixed(1), 'nat', t.natural(p.x, p.z).toFixed(1), 'slope', t.slopeAt(p.x, p.z).toFixed(2));
}
for (let i = 0; i < t.roads.length; i++) {
  const r = t.roads[i];
  let maxG = 0;
  let at = 0;
  let maxCut = 0;
  for (let s = 0; s < r.length - 4; s += 2) {
    const a = r.point(s / r.length);
    const b = r.point((s + 4) / r.length);
    const g = Math.abs(b.y - a.y) / 4;
    if (g > maxG) {
      maxG = g;
      at = s;
    }
    maxCut = Math.max(maxCut, Math.abs(t.natural(a.x, a.z) - a.y));
  }
  const p = r.point(at / r.length);
  console.log(`road ${r.def.id.padEnd(9)} len ${r.length.toFixed(0)}m  max grade ${(maxG * 100).toFixed(0)}% at (${p.x.toFixed(0)},${p.z.toFixed(0)})  max cut/fill ${maxCut.toFixed(1)}m`);
}
// profile north of the overlook
const row: string[] = [];
for (let z = -300; z >= -420; z -= 10) row.push(`${z}:${t.heightAt(20, z).toFixed(0)}`);
console.log('overlook profile', row.join(' '));
// creek depth along the channel
const c: string[] = [];
for (let x = -300; x <= 200; x += 50) c.push(`${x}:${t.heightAt(x, 131).toFixed(1)}`);
console.log('creek z=131', c.join(' '));
