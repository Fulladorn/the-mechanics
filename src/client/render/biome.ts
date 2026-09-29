import * as THREE from 'three';
import { fbm, type Terrain } from '../../sim/terrain';

// Ground colour and grass density for any point on a terrain, per level
// palette. Shared by the terrain mesh (vertex colours) and the GPU grass
// (a colour/density texture), so blades always match the ground under them.

export interface BiomePalette {
  grassA: number;
  grassB: number;
  grassDark: number;
  dry: number;
  dirt: number;
  gravel: number;
  rut: number;
  asphalt: number;
  rock: number;
  rockDark: number;
  snow: number;
  sand: number;
  lakebed: number;
  snowLine: number;
  /** Surface of the yard/lot pads (e.g. concrete apron). */
  pad?: number;
}

export const PALETTES: Record<string, BiomePalette> = {
  alpine: {
    grassA: 0x6aa844,
    grassB: 0xa7c24e,
    grassDark: 0x3f7d3c,
    dry: 0xc2b25e,
    dirt: 0x9a7650,
    gravel: 0xa49476,
    rut: 0x6f5c45,
    asphalt: 0x4d4f55,
    rock: 0x958c80,
    rockDark: 0x6b6770,
    snow: 0xf1f5fb,
    sand: 0xc8b98c,
    lakebed: 0x5f7b64,
    snowLine: 9999,
  },
  depot: {
    grassA: 0x78b04c,
    grassB: 0xb5c957,
    grassDark: 0x4a8a3e,
    dry: 0xc9b964,
    dirt: 0xa07c55,
    gravel: 0xaaa08e,
    rut: 0x857765,
    asphalt: 0x6a6660,
    rock: 0x9a9184,
    rockDark: 0x716c74,
    snow: 0xf1f5fb,
    sand: 0xcbb98a,
    lakebed: 0x5f7b64,
    snowLine: 9999,
  },
};

const C = {
  a: new THREE.Color(),
  b: new THREE.Color(),
  c: new THREE.Color(),
};

export interface GroundSample {
  color: THREE.Color;
  /** 0..1 grass density. */
  grass: number;
  /** 0..1 flower density. */
  flowers: number;
}

export class Biome {
  private seed: number;
  constructor(
    readonly t: Terrain,
    readonly pal: BiomePalette,
    /** Extra per-level rule (e.g. concrete aprons, forest floor). */
    readonly override?: (x: number, z: number, out: GroundSample) => boolean,
  ) {
    this.seed = t.def.seed + 4242;
  }

  sample(x: number, z: number, out: GroundSample): GroundSample {
    const t = this.t;
    const p = this.pal;
    const h = t.heightAt(x, z);
    const slope = t.slopeAt(x, z);
    const n1 = fbm(x / 38, z / 38, this.seed, 3) * 0.5 + 0.5;
    const n2 = fbm(x / 9, z / 9, this.seed + 11, 2) * 0.5 + 0.5;
    const col = out.color;

    // Meadow: two greens mixed by broad noise, with drier patches.
    col.setHex(p.grassA).lerp(C.a.setHex(p.grassB), THREE.MathUtils.smoothstep(n1, 0.35, 0.8));
    col.lerp(C.a.setHex(p.dry), THREE.MathUtils.smoothstep(n2 * n1, 0.35, 0.6) * 0.45);
    col.lerp(C.a.setHex(p.grassDark), THREE.MathUtils.smoothstep(n2, 0.6, 0.95) * 0.35);
    let grass = 1;
    let flowers = THREE.MathUtils.smoothstep(n1 * (1 - n2), 0.28, 0.45);

    // Rock on steep ground — but not on road embankments, which are
    // made ground (grassed-over fill), however steep.
    const road = t.roadAt(x, z, 14);
    let embank = 0;
    if (road.road >= 0) {
      const d = t.roads[road.road].def;
      embank = 1 - THREE.MathUtils.smoothstep(road.dist, d.halfWidth + d.shoulder * 0.7, d.halfWidth + d.shoulder + 1.5);
    }
    const rockK = THREE.MathUtils.smoothstep(slope, 0.26, 0.42) * (1 - embank);
    if (rockK > 0) {
      C.b.setHex(p.rock).lerp(C.c.setHex(p.rockDark), n2 * 0.6);
      col.lerp(C.b, rockK);
      grass *= 1 - rockK;
      flowers *= 1 - rockK;
    }
    // Snow above the snow line.
    if (h > p.snowLine - 12) {
      const s = THREE.MathUtils.smoothstep(h + n1 * 10, p.snowLine - 6, p.snowLine + 4) * (1 - rockK * 0.6);
      col.lerp(C.a.setHex(p.snow), s);
      grass *= 1 - s;
      flowers *= 1 - s;
    }

    // Roads: packed surface with wheel ruts, dirt shoulders.
    if (road.road >= 0) {
      const def = t.roads[road.road].def;
      const hw = def.halfWidth;
      const surf = def.surface;
      const base = surf === 'asphalt' ? p.asphalt : surf === 'gravel' ? p.gravel : p.dirt;
      if (road.dist < hw + 0.2) {
        col.setHex(base);
        grass = 0;
        flowers = 0;
        if (surf !== 'asphalt') {
          // Mottled stone, darker packed wheel ruts, loose lighter edges and —
          // on the backcountry tracks — a grassy crown between the ruts.
          const n3 = fbm(x / 2.3, z / 2.3, this.seed + 29, 2) * 0.5 + 0.5;
          col.lerp(C.a.setHex(p.dirt), THREE.MathUtils.smoothstep(n1 * n3, 0.25, 0.55) * 0.45);
          const rut = Math.abs(road.dist - hw * 0.42);
          col.lerp(C.a.setHex(p.rut), (1 - THREE.MathUtils.smoothstep(rut, 0.2, 0.75)) * 0.7);
          col.multiplyScalar(0.9 + n3 * 0.2);
          const edge = THREE.MathUtils.smoothstep(road.dist, hw * 0.75, hw + 0.2);
          col.lerp(C.a.setHex(p.dry), edge * 0.25);
          if (hw < 4.5) {
            const crown = 1 - THREE.MathUtils.smoothstep(road.dist, hw * 0.1, hw * 0.24);
            col.lerp(C.a.setHex(p.grassDark), crown * (0.35 + n3 * 0.25));
            grass = crown * (0.25 + n3 * 0.35);
          }
        } else col.multiplyScalar(0.96 + n2 * 0.06);
      } else {
        const k = 1 - THREE.MathUtils.smoothstep(road.dist, hw + 0.2, hw + 2.2 + n2 * 1.5);
        col.lerp(C.a.setHex(p.dirt), k * 0.85);
        grass *= 1 - k;
        flowers *= 1 - k;
      }
    }

    // Lake: sand ring then lakebed.
    const wl = t.def.waterLevel;
    if (wl !== undefined) {
      const d = wl - h;
      if (d > -0.6) {
        const sandK = THREE.MathUtils.smoothstep(d, -0.6, 0.05);
        col.lerp(C.a.setHex(p.sand), sandK);
        grass *= 1 - sandK;
        flowers *= 1 - sandK;
        if (d > 0.3) col.lerp(C.a.setHex(p.lakebed), THREE.MathUtils.smoothstep(d, 0.3, 2.5));
      }
    }

    out.grass = grass;
    out.flowers = flowers;
    this.override?.(x, z, out);
    return out;
  }
}
