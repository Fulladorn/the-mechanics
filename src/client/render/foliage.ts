import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { makeRng } from '../../shared/math';
import type { NatureInst, NatureKind } from '../../content/nature';
import { styl } from './stylized';

// Painterly trees, bushes and rocks. Each variant is ONE merged geometry with
// baked vertex colours (trunk, shaded underside, sunlit tips) and "soft"
// normals that point away from the canopy centre, so a whole tree lights like
// one fluffy form instead of a pile of facets. Instances are grouped by map
// cell so frustum culling still works.

const col = (hex: number) => new THREE.Color(hex);

function paint(g: THREE.BufferGeometry, fn: (p: THREE.Vector3, n: THREE.Vector3, out: THREE.Color) => void): THREE.BufferGeometry {
  const pos = g.getAttribute('position');
  const nor = g.getAttribute('normal');
  const c = new Float32Array(pos.count * 3);
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();
  const o = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    n.fromBufferAttribute(nor, i);
    fn(p, n, o);
    c[i * 3] = o.r;
    c[i * 3 + 1] = o.g;
    c[i * 3 + 2] = o.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}

/** Push every vertex along a smooth noise, then blend normals toward "away from centre". */
function blob(g: THREE.BufferGeometry, rng: () => number, amp: number, center: THREE.Vector3, soft: number): THREE.BufferGeometry {
  g = g.index ? g.toNonIndexed() : g;
  g = mergeVerts(g);
  const pos = g.getAttribute('position');
  const ph = [rng() * 10, rng() * 10, rng() * 10];
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const d = Math.sin(v.x * 3.1 + ph[0]) * Math.sin(v.y * 2.7 + ph[1]) * Math.sin(v.z * 3.3 + ph[2]);
    const dir = v.clone().sub(center).normalize();
    v.addScaledVector(dir, d * amp);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  softNormals(g, center, soft);
  return g;
}

function mergeVerts(g: THREE.BufferGeometry): THREE.BufferGeometry {
  g.deleteAttribute('uv');
  g.deleteAttribute('normal');
  const pos = g.getAttribute('position');
  const map = new Map<string, number>();
  const verts: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i < pos.count; i++) {
    const k = `${pos.getX(i).toFixed(4)},${pos.getY(i).toFixed(4)},${pos.getZ(i).toFixed(4)}`;
    let j = map.get(k);
    if (j === undefined) {
      j = verts.length / 3;
      map.set(k, j);
      verts.push(pos.getX(i), pos.getY(i), pos.getZ(i));
    }
    idx.push(j);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  out.setIndex(idx);
  out.computeVertexNormals();
  return out;
}

function softNormals(g: THREE.BufferGeometry, center: THREE.Vector3, k: number): void {
  const pos = g.getAttribute('position');
  const nor = g.getAttribute('normal');
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    n.fromBufferAttribute(nor, i);
    const away = p.sub(center).normalize();
    n.lerp(away, k).normalize();
    nor.setXYZ(i, n.x, n.y, n.z);
  }
}

const TRUNK = col(0x6b4a33);
const TRUNK_DARK = col(0x3f2c20);

function trunk(h: number, r: number, color = TRUNK): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(r * 0.55, r, h, 7, 3);
  g.translate(0, h / 2, 0);
  g.deleteAttribute('uv');
  return paint(g, (p, _n, o) => o.copy(TRUNK_DARK).lerp(color, Math.min(1, p.y / (h * 0.5))));
}

function pine(seed: number, fir = false): THREE.BufferGeometry {
  const rng = makeRng(seed);
  const parts: THREE.BufferGeometry[] = [trunk(5.0, 0.26)];
  const tiers = fir ? 6 : 5;
  const H = fir ? 7.5 : 6.6;
  // lowest boughs clear head height, so you can walk under a pine
  const base = fir ? 2.1 : 2.2;
  const center = new THREE.Vector3(0, base + H * 0.4, 0);
  const deep = col(fir ? 0x1f4a3a : 0x2a5a3a);
  const mid = col(fir ? 0x2f6a48 : 0x3f7d45);
  const tip = col(fir ? 0x6aa060 : 0x8cbf5a);
  for (let i = 0; i < tiers; i++) {
    const k = i / (tiers - 1);
    const r = (fir ? 2.1 : 2.5) * (1 - k * 0.78) + 0.25;
    const h = (H / tiers) * 1.7;
    const y = base + (i / tiers) * H * 0.92;
    const cone = new THREE.ConeGeometry(r, h, 10, 2, false);
    cone.translate((rng() - 0.5) * 0.15, y + h / 2, (rng() - 0.5) * 0.15);
    // droop the skirt a touch, jagged
    const pos = cone.getAttribute('position');
    for (let j = 0; j < pos.count; j++) {
      const py = pos.getY(j);
      if (py < y + 0.05) {
        const a = Math.atan2(pos.getZ(j), pos.getX(j));
        pos.setY(j, py - 0.25 - Math.abs(Math.sin(a * 5 + i)) * 0.3);
      }
    }
    let g = blob(cone, rng, 0.12, center, 0.55);
    g = paint(g, (p, n, o) => {
      const up = THREE.MathUtils.clamp((p.y - y) / h, 0, 1);
      const out = Math.hypot(p.x, p.z) / r;
      o.copy(deep).lerp(mid, up * 0.8 + out * 0.3).lerp(tip, Math.max(0, n.y) * 0.35 * (0.5 + k));
    });
    parts.push(g);
  }
  return finish(parts);
}

function broadleaf(seed: number, birch = false): THREE.BufferGeometry {
  const rng = makeRng(seed);
  const parts: THREE.BufferGeometry[] = [];
  const th = birch ? 3.6 : 2.8;
  parts.push(
    birch
      ? paint(trunkGeo(th, 0.17), (p, _n, o) => {
          o.set(0xeae6dc);
          if (Math.sin(p.y * 9 + Math.atan2(p.z, p.x) * 2) > 0.82) o.set(0x2b2b2b);
        })
      : trunk(th, 0.3),
  );
  const center = new THREE.Vector3(0, th + 1.4, 0);
  const deep = col(birch ? 0x6f9a3a : 0x3f7a3a);
  const light = col(birch ? 0xd8d860 : 0x9cc65a);
  const blobs = birch ? 5 : 7;
  for (let i = 0; i < blobs; i++) {
    const r = (birch ? 0.9 : 1.3) + rng() * 0.6;
    const a = (i / blobs) * Math.PI * 2 + rng();
    const d = i === 0 ? 0 : 0.9 + rng() * 0.5;
    const s = new THREE.IcosahedronGeometry(r, 2);
    s.translate(Math.cos(a) * d, th + 1.1 + rng() * 1.3 + (i === 0 ? 0.8 : 0), Math.sin(a) * d);
    let g = blob(s, rng, 0.14, center, 0.75);
    g = paint(g, (p, n, o) => {
      const up = THREE.MathUtils.clamp((p.y - th) / 3.2, 0, 1);
      o.copy(deep).lerp(light, up * 0.55 + Math.max(0, n.y) * 0.35);
    });
    parts.push(g);
  }
  return finish(parts);
}

function trunkGeo(h: number, r: number): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(r * 0.7, r, h, 8, 4);
  g.translate(0, h / 2, 0);
  g.deleteAttribute('uv');
  return g;
}

function bush(seed: number): THREE.BufferGeometry {
  const rng = makeRng(seed);
  const parts: THREE.BufferGeometry[] = [];
  const center = new THREE.Vector3(0, 0.3, 0);
  const deep = col(0x3a7038);
  const light = col(0x8fbf55);
  for (let i = 0; i < 4; i++) {
    const r = 0.45 + rng() * 0.35;
    const s = new THREE.IcosahedronGeometry(r, 1);
    s.translate((rng() - 0.5) * 0.9, r * 0.6, (rng() - 0.5) * 0.9);
    let g = blob(s, rng, 0.08, center, 0.7);
    g = paint(g, (p, n, o) => o.copy(deep).lerp(light, Math.max(0, n.y) * 0.5 + p.y * 0.3));
    parts.push(g);
  }
  return finish(parts);
}

function rock(seed: number, big: boolean): THREE.BufferGeometry {
  const rng = makeRng(seed);
  const r = big ? 1.1 : 0.55;
  let g: THREE.BufferGeometry = new THREE.IcosahedronGeometry(r, 2);
  g.scale(1 + rng() * 0.4, 0.55 + rng() * 0.25, 1 + rng() * 0.3);
  g = blob(g, rng, r * 0.14, new THREE.Vector3(0, -r * 0.3, 0), 0.25);
  // flatten the bottom into the ground
  const pos = g.getAttribute('position');
  for (let i = 0; i < pos.count; i++) if (pos.getY(i) < -r * 0.15) pos.setY(i, -r * 0.15 - (pos.getY(i) + r * 0.15) * 0.2);
  g.computeVertexNormals();
  const grey = col(0x9a948a);
  const dark = col(0x6d6a70);
  const moss = col(0x6f9a45);
  g = paint(g, (p, n, o) => {
    const noise = Math.sin(p.x * 5.3) * Math.sin(p.z * 4.1 + p.y * 3);
    o.copy(dark).lerp(grey, 0.55 + noise * 0.25 + n.y * 0.2);
    if (n.y > 0.55) o.lerp(moss, THREE.MathUtils.smoothstep(n.y, 0.55, 0.9) * 0.8);
  });
  g.translate(0, r * 0.15, 0);
  return g;
}

function stump(): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(0.32, 0.4, 0.5, 9, 1);
  g.translate(0, 0.25, 0);
  g.deleteAttribute('uv');
  return paint(g, (p, n, o) => (n.y > 0.9 ? o.set(0xd8b07a) : o.copy(TRUNK).multiplyScalar(0.9 + p.y * 0.3)));
}

function log(): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(0.25, 0.27, 3.2, 9, 2);
  g.rotateZ(Math.PI / 2);
  g.translate(0, 0.25, 0);
  g.deleteAttribute('uv');
  return paint(g, (p, n, o) => (Math.abs(n.x) > 0.9 ? o.set(0xd8b07a) : o.copy(TRUNK).multiplyScalar(0.85 + Math.sin(p.x * 7) * 0.08)));
}

function deadTree(seed: number): THREE.BufferGeometry {
  const rng = makeRng(seed);
  const parts = [trunk(5, 0.28, col(0x8a7a6a))];
  for (let i = 0; i < 4; i++) {
    const b = new THREE.CylinderGeometry(0.04, 0.09, 1.6, 5);
    b.translate(0, 0.8, 0);
    b.rotateZ(0.7 + rng() * 0.5);
    b.rotateY(rng() * 6.28);
    b.translate(0, 2.5 + i * 0.6, 0);
    b.deleteAttribute('uv');
    parts.push(paint(b, (_p, _n, o) => o.set(0x7a6a5a)));
  }
  return finish(parts);
}

function finish(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const clean = parts.map((p) => {
    const g = p.index ? p : p;
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'color') g.deleteAttribute(k);
    return g.index ? g.toNonIndexed() : g;
  });
  const m = mergeGeometries(clean, false)!;
  m.computeBoundingSphere();
  return m;
}

const BUILDERS: Record<NatureKind, (seed: number) => THREE.BufferGeometry> = {
  pine: (s) => pine(s),
  fir: (s) => pine(s, true),
  broadleaf: (s) => broadleaf(s),
  birch: (s) => broadleaf(s, true),
  bush: (s) => bush(s),
  rock: (s) => rock(s, false),
  boulder: (s) => rock(s, true),
  stump: () => stump(),
  log: () => log(),
  deadTree: (s) => deadTree(s),
};

// Object-space height where the canopy starts: trunks below it never dither.
const FADE_MIN_Y: Partial<Record<NatureKind, number>> = { pine: 1.9, fir: 1.8, broadleaf: 2.4, birch: 3.1 };

const WIND: Partial<Record<NatureKind, number>> = { pine: 0.018, fir: 0.015, broadleaf: 0.03, birch: 0.04, bush: 0.05, deadTree: 0.01 };

export class Nature {
  readonly group = new THREE.Group();

  constructor(list: NatureInst[], cell = 120) {
    const geos = new Map<string, THREE.BufferGeometry>();
    const buckets = new Map<string, NatureInst[]>();
    for (const n of list) {
      const cx = Math.floor(n.x / cell);
      const cz = Math.floor(n.z / cell);
      const k = `${n.kind}:${n.variant}:${cx}:${cz}`;
      let b = buckets.get(k);
      if (!b) buckets.set(k, (b = []));
      b.push(n);
    }
    const mats = new Map<NatureKind, THREE.Material>();
    const matFor = (k: NatureKind) => {
      let m = mats.get(k);
      if (!m) {
        const stone = k === 'rock' || k === 'boulder';
        const canopy = k === 'pine' || k === 'fir' || k === 'broadleaf' || k === 'birch' || k === 'bush';
        // Canopies are double-sided (seen from under or inside, they're solid
        // shade, not holes) and dither away as the camera pushes into them.
        m = styl({
          vertexColors: true,
          rough: 0.9,
          noise: 0.1,
          noiseScale: 2,
          rim: stone ? 0.15 : 0.45,
          wind: WIND[k] ?? 0,
          side: canopy || stone ? THREE.DoubleSide : THREE.FrontSide,
          backShade: canopy ? 0.72 : 0.45,
          nearFade: canopy ? 1.1 : stone ? 0.6 : 0,
          fadeMinY: FADE_MIN_Y[k],
          spec: 0.5,
        });
        mats.set(k, m);
      }
      return m;
    };
    const mtx = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    for (const [k, list2] of buckets) {
      const [kind, variant] = k.split(':');
      const gk = `${kind}:${variant}`;
      let g = geos.get(gk);
      if (!g) geos.set(gk, (g = BUILDERS[kind as NatureKind](Number(variant) * 7919 + 17)));
      const im = new THREE.InstancedMesh(g, matFor(kind as NatureKind), list2.length);
      list2.forEach((n, i) => {
        q.setFromAxisAngle(up, n.yaw);
        s.setScalar(n.scale);
        p.set(n.x, n.y - 0.08 * n.scale, n.z);
        mtx.compose(p, q, s);
        im.setMatrixAt(i, mtx);
      });
      im.instanceMatrix.needsUpdate = true;
      im.castShadow = kind !== 'bush' && kind !== 'rock';
      im.receiveShadow = true;
      im.computeBoundingSphere();
      this.group.add(im);
    }
  }
}
