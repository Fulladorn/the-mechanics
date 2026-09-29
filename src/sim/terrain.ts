import type { Vec3 } from '../shared/math';
import { clamp, smoothstep } from '../shared/math';

// Deterministic, authored heightfield.
//
// A level describes its landscape as data — layered noise, a handful of
// sculpted features (peaks, ridges, basins), roads as Catmull-Rom splines and
// levelled building pads — and this module bakes it into ONE height grid.
// That grid is the single source of truth: the Rapier heightfield collider, the
// rendered terrain mesh, grass placement and every gameplay query all read the
// same samples, interpolated with the same triangle split Rapier uses. Visual
// and physical ground can never drift apart.

export interface NoiseLayer {
  amp: number;
  /** World metres per noise cell. */
  scale: number;
  octaves?: number;
  /** Ridged noise (sharp crests) instead of rolling hills. */
  ridged?: boolean;
}

export interface TerrainFeature {
  /** hill: smooth bump (negative h = basin). ridge: a bump swept along a segment. plateau: flat-topped mesa. */
  kind: 'hill' | 'ridge' | 'plateau';
  x: number;
  z: number;
  x2?: number;
  z2?: number;
  r: number;
  h: number;
  /** Profile exponent; >1 steeper sides. */
  sharp?: number;
}

export type RoadSurface = 'gravel' | 'dirt' | 'asphalt' | 'track';

export interface RoadDef {
  id: string;
  /** Control points: x, z and optionally a pinned road height. */
  points: [number, number, number?][];
  halfWidth: number;
  /** Distance over which the cut/fill blends back into the landscape. */
  shoulder: number;
  surface: RoadSurface;
  /** Smoothing passes applied to un-pinned heights (limits the grade). */
  smooth?: number;
}

export interface Pad {
  x: number;
  z: number;
  radius: number;
  blend: number;
  y?: number;
}

export interface TerrainDef {
  /** Square extent centred on the origin, in metres. */
  size: number;
  /** Grid spacing in metres. */
  cell: number;
  baseY: number;
  seed: number;
  noise: NoiseLayer[];
  features?: TerrainFeature[];
  roads?: RoadDef[];
  pads?: Pad[];
  /** Standing water surface (lakes). Terrain below it is lakebed. */
  waterLevel?: number;
  /** Beyond this radius the land eases toward `edgeY` so the grid border never shows a cliff. */
  edge?: { radius: number; blend: number; y: number };
}

export interface RoadHit {
  /** Lateral distance from the nearest centreline, metres. */
  dist: number;
  /** Road surface height at that point. */
  y: number;
  /** Arc-length progress 0..1 along that road. */
  t: number;
  /** Index into def.roads. */
  road: number;
  /** Unit tangent (xz) at that point. */
  tx: number;
  tz: number;
}

const NO_ROAD: RoadHit = { dist: Infinity, y: 0, t: 0, road: -1, tx: 0, tz: 1 };

/** Cheap deterministic hash → [-1, 1]. */
export function hash2(x: number, y: number, seed: number): number {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(seed, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 0x7fffffff - 1;
}

/** Value noise with smooth interpolation, in [-1, 1]. */
export function valueNoise(x: number, y: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, seed);
  const b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed);
  const d = hash2(xi + 1, yi + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

export function fbm(x: number, y: number, seed: number, octaves = 4): number {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  let fx = x;
  let fy = y;
  for (let i = 0; i < octaves; i++) {
    sum += valueNoise(fx, fy, seed + i * 131) * amp;
    norm += amp;
    amp *= 0.5;
    fx *= 2.03;
    fy *= 2.03;
  }
  return sum / norm;
}

function ridged(x: number, y: number, seed: number, octaves = 4): number {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  let fx = x;
  let fy = y;
  for (let i = 0; i < octaves; i++) {
    const n = 1 - Math.abs(valueNoise(fx, fy, seed + i * 173));
    sum += n * n * amp;
    norm += amp;
    amp *= 0.5;
    fx *= 2.07;
    fy *= 2.07;
  }
  return (sum / norm) * 2 - 1;
}

/** Densely sampled road polyline with a spatial hash for nearest queries. */
class RoadPath {
  xs: Float64Array;
  zs: Float64Array;
  ys: Float64Array;
  /** Cumulative arc length at each sample. */
  ls: Float64Array;
  length: number;
  private grid = new Map<number, number[]>();
  /** Per-segment visit stamp, so a nearest query never allocates. */
  private stamp: Uint32Array;
  private gen = 1;
  private static CELL = 8;

  constructor(
    readonly def: RoadDef,
    baseHeight: (x: number, z: number) => number,
  ) {
    const pts = def.points;
    const STEP = 1.0;
    const xs: number[] = [];
    const zs: number[] = [];
    const pinned: (number | undefined)[] = [];
    // Catmull-Rom through the control points (centripetal-ish via uniform t,
    // sampled by distance so every sample is ~1 m apart).
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[Math.min(pts.length - 1, i + 2)];
      const segLen = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
      const n = Math.max(2, Math.ceil(segLen / STEP));
      for (let k = 0; k < n; k++) {
        const t = k / n;
        const t2 = t * t;
        const t3 = t2 * t;
        const cr = (a: number, b: number, c: number, d: number) =>
          0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
        xs.push(cr(p0[0], p1[0], p2[0], p3[0]));
        zs.push(cr(p0[1], p1[1], p2[1], p3[1]));
        // Pinned heights interpolate linearly between pinned neighbours below.
        pinned.push(k === 0 ? p1[2] : undefined);
      }
    }
    const last = pts[pts.length - 1];
    xs.push(last[0]);
    zs.push(last[1]);
    pinned.push(last[2]);

    const count = xs.length;
    this.xs = Float64Array.from(xs);
    this.zs = Float64Array.from(zs);
    this.ls = new Float64Array(count);
    for (let i = 1; i < count; i++) {
      this.ls[i] = this.ls[i - 1] + Math.hypot(xs[i] - xs[i - 1], zs[i] - zs[i - 1]);
    }
    this.length = this.ls[count - 1];

    // Heights: natural ground under the road, then pinned points override and
    // un-pinned stretches are smoothed so the grade stays drivable.
    const ys = new Float64Array(count);
    const isPinned = new Uint8Array(count);
    for (let i = 0; i < count; i++) {
      const p = pinned[i];
      if (p !== undefined) {
        ys[i] = p;
        isPinned[i] = 1;
      } else ys[i] = baseHeight(xs[i], zs[i]);
    }
    // Linear interpolation between pinned samples where both ends are pinned
    // gives authored control; the natural height blends in between.
    let prev = -1;
    for (let i = 0; i < count; i++) {
      if (!isPinned[i]) continue;
      if (prev >= 0 && i - prev > 1) {
        for (let j = prev + 1; j < i; j++) {
          const k = (this.ls[j] - this.ls[prev]) / (this.ls[i] - this.ls[prev] || 1);
          const lin = ys[prev] + (ys[i] - ys[prev]) * k;
          // Mostly the authored line, a little of the land so it isn't dead flat.
          ys[j] = lin * 0.85 + ys[j] * 0.15;
        }
      }
      prev = i;
    }
    const passes = def.smooth ?? 6;
    const radius = 10;
    for (let p = 0; p < passes; p++) {
      const src = ys.slice();
      for (let i = 0; i < count; i++) {
        if (isPinned[i]) continue;
        let s = 0;
        let w = 0;
        for (let j = Math.max(0, i - radius); j <= Math.min(count - 1, i + radius); j++) {
          s += src[j];
          w++;
        }
        ys[i] = s / w;
      }
    }
    this.ys = ys;

    this.stamp = new Uint32Array(count);
    const C = RoadPath.CELL;
    for (let i = 0; i < count - 1; i++) {
      const minX = Math.floor(Math.min(xs[i], xs[i + 1]) / C);
      const maxX = Math.floor(Math.max(xs[i], xs[i + 1]) / C);
      const minZ = Math.floor(Math.min(zs[i], zs[i + 1]) / C);
      const maxZ = Math.floor(Math.max(zs[i], zs[i + 1]) / C);
      for (let gx = minX; gx <= maxX; gx++) {
        for (let gz = minZ; gz <= maxZ; gz++) {
          const key = gx * 73856093 + gz * 19349663;
          let list = this.grid.get(key);
          if (!list) this.grid.set(key, (list = []));
          list.push(i);
        }
      }
    }
  }

  /** Nearest point within `maxDist` (or NO_ROAD). */
  nearest(x: number, z: number, maxDist: number, roadIndex: number, out: RoadHit): RoadHit {
    const C = RoadPath.CELL;
    const r = Math.ceil(maxDist / C);
    const cx = Math.floor(x / C);
    const cz = Math.floor(z / C);
    let bestD2 = maxDist * maxDist;
    let bestI = -1;
    let bestK = 0;
    const gen = ++this.gen;
    for (let gx = cx - r; gx <= cx + r; gx++) {
      for (let gz = cz - r; gz <= cz + r; gz++) {
        const list = this.grid.get(gx * 73856093 + gz * 19349663);
        if (!list) continue;
        for (const i of list) {
          if (this.stamp[i] === gen) continue;
          this.stamp[i] = gen;
          const ax = this.xs[i];
          const az = this.zs[i];
          const bx = this.xs[i + 1];
          const bz = this.zs[i + 1];
          const dx = bx - ax;
          const dz = bz - az;
          const l2 = dx * dx + dz * dz || 1e-9;
          const k = clamp(((x - ax) * dx + (z - az) * dz) / l2, 0, 1);
          const px = ax + dx * k - x;
          const pz = az + dz * k - z;
          const d2 = px * px + pz * pz;
          if (d2 < bestD2) {
            bestD2 = d2;
            bestI = i;
            bestK = k;
          }
        }
      }
    }
    if (bestI < 0) return NO_ROAD;
    const i = bestI;
    const len = Math.hypot(this.xs[i + 1] - this.xs[i], this.zs[i + 1] - this.zs[i]) || 1;
    out.dist = Math.sqrt(bestD2);
    out.y = this.ys[i] + (this.ys[i + 1] - this.ys[i]) * bestK;
    out.t = (this.ls[i] + len * bestK) / (this.length || 1);
    out.road = roadIndex;
    out.tx = (this.xs[i + 1] - this.xs[i]) / len;
    out.tz = (this.zs[i + 1] - this.zs[i]) / len;
    return out;
  }

  /** Centreline point at arc progress t. */
  point(t: number): Vec3 {
    const target = clamp(t, 0, 1) * this.length;
    let lo = 0;
    let hi = this.ls.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (this.ls[mid] <= target) lo = mid;
      else hi = mid;
    }
    const span = this.ls[hi] - this.ls[lo] || 1;
    const k = (target - this.ls[lo]) / span;
    return {
      x: this.xs[lo] + (this.xs[hi] - this.xs[lo]) * k,
      y: this.ys[lo] + (this.ys[hi] - this.ys[lo]) * k,
      z: this.zs[lo] + (this.zs[hi] - this.zs[lo]) * k,
    };
  }
}

const cache = new WeakMap<TerrainDef, Terrain>();

export class Terrain {
  /** Samples per side. */
  readonly n: number;
  readonly half: number;
  /** Heights, indexed [ix * n + iz] (Rapier's column-major heightfield layout). */
  readonly heights: Float32Array;
  readonly roads: RoadPath[] = [];
  private padY: number[] = [];
  private hitTmp: RoadHit = { ...NO_ROAD };

  /** Terrains are expensive to bake and immutable, so share them per definition. */
  static for(def: TerrainDef): Terrain {
    let t = cache.get(def);
    if (!t) cache.set(def, (t = new Terrain(def)));
    return t;
  }

  constructor(readonly def: TerrainDef) {
    this.half = def.size / 2;
    this.n = Math.round(def.size / def.cell) + 1;

    for (let i = 0; i < (def.roads ?? []).length; i++) {
      this.roads.push(new RoadPath(def.roads![i], (x, z) => this.natural(x, z)));
    }
    this.padY = (def.pads ?? []).map((p) => p.y ?? this.carved(p.x, p.z));

    const n = this.n;
    this.heights = new Float32Array(n * n);
    for (let ix = 0; ix < n; ix++) {
      const x = -this.half + ix * def.cell;
      for (let iz = 0; iz < n; iz++) {
        const z = -this.half + iz * def.cell;
        this.heights[ix * n + iz] = this.analytic(x, z);
      }
    }
  }

  // --- analytic surface (used once, to bake the grid) -----------------------

  /** Landscape before roads and pads. */
  natural(x: number, z: number): number {
    const d = this.def;
    let h = d.baseY;
    for (let i = 0; i < d.noise.length; i++) {
      const L = d.noise[i];
      const s = d.seed + i * 7919;
      const n = L.ridged ? ridged(x / L.scale, z / L.scale, s, L.octaves ?? 4) : fbm(x / L.scale, z / L.scale, s, L.octaves ?? 4);
      h += n * L.amp;
    }
    for (const f of d.features ?? []) {
      let dist: number;
      if (f.kind === 'ridge' && f.x2 !== undefined && f.z2 !== undefined) {
        const dx = f.x2 - f.x;
        const dz = f.z2 - f.z;
        const l2 = dx * dx + dz * dz || 1e-9;
        const k = clamp(((x - f.x) * dx + (z - f.z) * dz) / l2, 0, 1);
        dist = Math.hypot(x - (f.x + dx * k), z - (f.z + dz * k));
      } else dist = Math.hypot(x - f.x, z - f.z);
      const u = dist / f.r;
      if (u >= 1.6) continue;
      const sharp = f.sharp ?? 1;
      if (f.kind === 'plateau') {
        h += f.h * (1 - smoothstep(0.55, 1.0, u));
      } else {
        // Smooth, compact bump (cosine-ish), shaped by `sharp`.
        const g = Math.exp(-Math.pow(u * 1.6, 2 * sharp) * 1.2);
        h += f.h * g;
      }
    }
    if (d.edge) {
      const rho = Math.hypot(x, z);
      const k = smoothstep(d.edge.radius, d.edge.radius + d.edge.blend, rho);
      h = h + (d.edge.y - h) * k;
    }
    return h;
  }

  /** Natural land with every road cut/filled in. */
  private carved(x: number, z: number): number {
    let h = this.natural(x, z);
    for (let i = 0; i < this.roads.length; i++) {
      const rd = this.roads[i];
      const hw = rd.def.halfWidth;
      const hit = rd.nearest(x, z, hw + rd.def.shoulder, i, this.hitTmp);
      if (hit.road < 0) continue;
      if (hit.dist <= hw) {
        // Slight crown so water would run off.
        h = hit.y - (hit.dist / hw) ** 2 * 0.08;
      } else {
        const k = smoothstep(hw, hw + rd.def.shoulder, hit.dist);
        h = hit.y - 0.08 + (h - (hit.y - 0.08)) * k;
      }
    }
    return h;
  }

  private analytic(x: number, z: number): number {
    let h = this.carved(x, z);
    const pads = this.def.pads;
    if (pads) {
      for (let i = 0; i < pads.length; i++) {
        const p = pads[i];
        const d = Math.hypot(x - p.x, z - p.z);
        if (d >= p.radius + p.blend) continue;
        const k = smoothstep(p.radius, p.radius + p.blend, d);
        h = this.padY[i] + (h - this.padY[i]) * k;
      }
    }
    return h;
  }

  // --- grid queries (the source of truth at runtime) -------------------------

  /** Height of grid sample (ix, iz), clamped to the grid. */
  sample(ix: number, iz: number): number {
    const n = this.n;
    ix = ix < 0 ? 0 : ix >= n ? n - 1 : ix;
    iz = iz < 0 ? 0 : iz >= n ? n - 1 : iz;
    return this.heights[ix * n + iz];
  }

  /**
   * Ground height, interpolated across the same triangle split Rapier uses
   * for heightfields (the diagonal runs from (ix+1, iz) to (ix, iz+1)).
   */
  heightAt(x: number, z: number): number {
    const c = this.def.cell;
    const gx = (x + this.half) / c;
    const gz = (z + this.half) / c;
    const ix = Math.floor(gx);
    const iz = Math.floor(gz);
    const u = gx - ix;
    const v = gz - iz;
    const h00 = this.sample(ix, iz);
    const h10 = this.sample(ix + 1, iz);
    const h01 = this.sample(ix, iz + 1);
    if (u + v <= 1) return h00 + (h10 - h00) * u + (h01 - h00) * v;
    const h11 = this.sample(ix + 1, iz + 1);
    return h11 + (h01 - h11) * (1 - u) + (h10 - h11) * (1 - v);
  }

  normalAt(x: number, z: number, eps = 0.75): Vec3 {
    const hx = this.heightAt(x + eps, z) - this.heightAt(x - eps, z);
    const hz = this.heightAt(x, z + eps) - this.heightAt(x, z - eps);
    const nx = -hx;
    const nz = -hz;
    const ny = 2 * eps;
    const len = Math.hypot(nx, ny, nz) || 1;
    return { x: nx / len, y: ny / len, z: nz / len };
  }

  /** 0 = flat, 1 = vertical. */
  slopeAt(x: number, z: number): number {
    return 1 - this.normalAt(x, z).y;
  }

  /** Nearest road within `maxDist` metres (any road). */
  roadAt(x: number, z: number, maxDist = 30): RoadHit {
    let best: RoadHit = NO_ROAD;
    for (let i = 0; i < this.roads.length; i++) {
      const hit = this.roads[i].nearest(x, z, Math.min(maxDist, best.dist), i, { ...NO_ROAD });
      if (hit.road >= 0 && hit.dist < best.dist) best = hit;
    }
    return best;
  }

  roadSurface(index: number): RoadSurface {
    return this.roads[index]?.def.surface ?? 'dirt';
  }

  /** True when standing on (or right at the edge of) any road. */
  onRoad(x: number, z: number): boolean {
    const hit = this.roadAt(x, z, 8);
    return hit.road >= 0 && hit.dist <= this.roads[hit.road].def.halfWidth + 0.8;
  }

  /** Centreline point on road `id` at progress t (0..1). */
  roadPoint(id: string, t: number): Vec3 {
    const r = this.roads.find((x) => x.def.id === id);
    if (!r) throw new Error(`no road ${id}`);
    return r.point(t);
  }

  roadLength(id: string): number {
    return this.roads.find((x) => x.def.id === id)?.length ?? 0;
  }

  /** Depth of standing water above the ground here (0 when dry). */
  waterDepth(x: number, z: number): number {
    const w = this.def.waterLevel;
    if (w === undefined) return 0;
    return Math.max(0, w - this.heightAt(x, z));
  }

  inBounds(x: number, z: number, margin = 0): boolean {
    return Math.abs(x) <= this.half - margin && Math.abs(z) <= this.half - margin;
  }
}
