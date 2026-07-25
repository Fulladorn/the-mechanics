import type { Vec3 } from '../shared/math';
import { clamp, smoothstep } from '../shared/math';

// Deterministic heightfield. Pure maths — no allocation, no RNG, no DOM — so
// the sim, the tests and the renderer all sample the exact same surface and
// visual geometry can never drift from collision geometry.
//
// The shape is a broad cone with a road spiralling down it. Because the road is
// carved into the cone, every stretch automatically gets an uphill cut on the
// inside and a drop on the outside: switchbacks for free.

export interface TerrainDef {
  /** Mountain apex height and the radius at which it meets the plain. */
  peakY: number;
  baseY: number;
  peakR: number;
  baseR: number;
  /** Road spiral. */
  road: {
    startAngle: number;
    turns: number;
    topR: number;
    bottomR: number;
    topY: number;
    bottomY: number;
    halfWidth: number;
    /** Distance over which the cut blends back into the mountain. */
    shoulder: number;
  };
  /** Ridge/gully amplitude. */
  relief: number;
  seed: number;
  /**
   * Levelled building pads. Anything that needs flat ground (a cabin, a cave
   * mouth, the extraction lot) declares one here rather than hoping the slope
   * cooperates. Flat within `radius`, easing back to the mountain over `blend`.
   */
  pads?: { x: number; z: number; radius: number; blend: number; y?: number }[];
}

const TAU = Math.PI * 2;

/** Cheap deterministic hash → [-1, 1]. */
function hash2(x: number, y: number, seed: number): number {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(seed, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 0x7fffffff - 1;
}

/** Value noise with smooth interpolation. */
function valueNoise(x: number, y: number, seed: number): number {
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

function fbm(x: number, y: number, seed: number, octaves = 4): number {
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

export interface RoadHit {
  /** Lateral distance from the road centreline, in metres. */
  dist: number;
  /** Road surface height at the nearest point. */
  y: number;
  /** Progress along the road, 0 at the top, 1 at the exfil end. */
  t: number;
}

export class Terrain {
  /** Pad heights, resolved once from the un-padded surface. */
  private padY: number[];

  constructor(readonly def: TerrainDef) {
    this.padY = (def.pads ?? []).map((p) => p.y ?? this.surfaceAt(p.x, p.z));
  }

  /**
   * Nearest point on the spiral road. The spiral crosses a given compass angle
   * once per turn, so we only have to test a handful of candidates.
   */
  roadAt(x: number, z: number): RoadHit {
    const r = this.def.road;
    let phi = Math.atan2(z, x);
    if (phi < 0) phi += TAU;
    const rho = Math.hypot(x, z);
    const span = r.turns * TAU;

    let best: RoadHit = { dist: Infinity, y: r.bottomY, t: 1 };
    for (let k = -1; k <= Math.ceil(r.turns) + 1; k++) {
      const t = (phi + k * TAU - r.startAngle) / span;
      if (t < 0 || t > 1) continue;
      const radius = r.topR + (r.bottomR - r.topR) * t;
      const dist = Math.abs(rho - radius);
      if (dist < best.dist) {
        best = { dist, y: r.topY + (r.bottomY - r.topY) * t, t };
      }
    }
    // Past the last turn the road runs straight out onto the plain.
    if (!Number.isFinite(best.dist)) best = { dist: Math.abs(rho - r.bottomR), y: r.bottomY, t: 1 };
    return best;
  }

  /** The mountain surface, ignoring the road cut. */
  private mountainAt(x: number, z: number): number {
    const d = this.def;
    const rho = Math.hypot(x, z);
    const k = clamp((rho - d.peakR) / (d.baseR - d.peakR), 0, 1);
    // Slightly convex falloff reads more like a mountain than a straight cone.
    const cone = d.peakY + (d.baseY - d.peakY) * Math.pow(k, 0.82);
    // Relief fades out on the plain so the flat run-out stays flat.
    const reliefFade = 1 - clamp((rho - d.baseR) / 60, 0, 1);
    const ridge = fbm(x * 0.012, z * 0.012, d.seed, 4) * d.relief;
    const detail = fbm(x * 0.06, z * 0.06, d.seed + 977, 3) * d.relief * 0.18;
    return cone + (ridge + detail) * reliefFade;
  }

  /** The mountain with the road cut into it, before any building pads. */
  private surfaceAt(x: number, z: number): number {
    const r = this.def.road;
    const road = this.roadAt(x, z);
    if (road.dist <= r.halfWidth) {
      // A touch of camber so the road crowns very slightly.
      return road.y - (road.dist / r.halfWidth) ** 2 * 0.12;
    }
    const base = this.mountainAt(x, z);
    const blend = smoothstep(r.halfWidth, r.halfWidth + r.shoulder, road.dist);
    const cut = road.y - 0.12;
    return cut + (base - cut) * blend;
  }

  /** Ground height at a world position, including levelled pads. */
  heightAt(x: number, z: number): number {
    let h = this.surfaceAt(x, z);
    const pads = this.def.pads;
    if (!pads) return h;
    for (let i = 0; i < pads.length; i++) {
      const p = pads[i];
      const d = Math.hypot(x - p.x, z - p.z);
      if (d >= p.radius + p.blend) continue;
      const k = smoothstep(p.radius, p.radius + p.blend, d);
      h = this.padY[i] + (h - this.padY[i]) * k;
    }
    return h;
  }

  /** Surface normal by central difference. */
  normalAt(x: number, z: number, eps = 0.6): Vec3 {
    const hx = this.heightAt(x + eps, z) - this.heightAt(x - eps, z);
    const hz = this.heightAt(x, z + eps) - this.heightAt(x, z - eps);
    const nx = -hx;
    const nz = -hz;
    const ny = 2 * eps;
    const len = Math.hypot(nx, ny, nz) || 1;
    return { x: nx / len, y: ny / len, z: nz / len };
  }

  /** 0 = flat, 1 = vertical. Used for traction and "can I walk here". */
  slopeAt(x: number, z: number): number {
    return 1 - this.normalAt(x, z).y;
  }

  /** True when a position is on (or very near) the drivable road surface. */
  onRoad(x: number, z: number): boolean {
    return this.roadAt(x, z).dist <= this.def.road.halfWidth + 1.2;
  }

  /** World position of a point on the road centreline at progress `t`. */
  roadPoint(t: number): Vec3 {
    const r = this.def.road;
    const tc = clamp(t, 0, 1);
    const angle = r.startAngle + tc * r.turns * TAU;
    const radius = r.topR + (r.bottomR - r.topR) * tc;
    return {
      x: Math.cos(angle) * radius,
      y: r.topY + (r.bottomY - r.topY) * tc,
      z: Math.sin(angle) * radius,
    };
  }
}
