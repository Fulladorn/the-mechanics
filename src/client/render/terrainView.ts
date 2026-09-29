import * as THREE from 'three';
import type { Terrain } from '../../sim/terrain';
import { Biome, type GroundSample } from './biome';
import { styl } from './stylized';

// Renders a Terrain from its own height grid (so the mesh IS the collider,
// triangle for triangle), chunked with three LODs and skirts to hide the
// cracks between them. Ground colour, grass density and flower density are
// baked once into grid-sized arrays that the grass renderer also samples.

export interface GroundBake {
  /** RGBA8 per grid sample: rgb ground colour, a grass density. */
  rgba: Uint8Array;
  /** Flower density per sample, 0..255. */
  flowers: Uint8Array;
  n: number;
}

export function bakeGround(t: Terrain, biome: Biome): GroundBake {
  const n = t.n;
  const rgba = new Uint8Array(n * n * 4);
  const flowers = new Uint8Array(n * n);
  const s: GroundSample = { color: new THREE.Color(), grass: 0, flowers: 0 };
  const c = t.def.cell;
  for (let ix = 0; ix < n; ix++) {
    const x = -t.half + ix * c;
    for (let iz = 0; iz < n; iz++) {
      const z = -t.half + iz * c;
      biome.sample(x, z, s);
      // Texture layout is row-major in z (v) then x (u): index = iz * n + ix.
      const o = (iz * n + ix) * 4;
      // Colours are stored in sRGB bytes; the grass shader decodes.
      const sc = s.color.clone().convertLinearToSRGB();
      rgba[o] = Math.round(THREE.MathUtils.clamp(sc.r, 0, 1) * 255);
      rgba[o + 1] = Math.round(THREE.MathUtils.clamp(sc.g, 0, 1) * 255);
      rgba[o + 2] = Math.round(THREE.MathUtils.clamp(sc.b, 0, 1) * 255);
      rgba[o + 3] = Math.round(THREE.MathUtils.clamp(s.grass, 0, 1) * 255);
      flowers[iz * n + ix] = Math.round(THREE.MathUtils.clamp(s.flowers, 0, 1) * 255);
    }
  }
  return { rgba, flowers, n };
}

export class TerrainView {
  readonly group = new THREE.Group();
  private mat: THREE.MeshStandardMaterial;

  constructor(
    private t: Terrain,
    private bake: GroundBake,
    quality: 'low' | 'med' | 'high',
  ) {
    this.mat = styl({ vertexColors: true, rough: 0.96, noise: 0.14, noiseScale: 5, rim: 0.08, env: 0.25 });
    const n = t.n - 1; // cells per side
    const chunk = 96;
    const chunks = Math.ceil(n / chunk);
    const lodSteps = quality === 'low' ? [2, 4, 8] : [1, 2, 4];
    const lodDist = quality === 'high' ? [0, 320, 650] : quality === 'med' ? [0, 220, 480] : [0, 140, 320];
    for (let cx = 0; cx < chunks; cx++) {
      for (let cz = 0; cz < chunks; cz++) {
        const x0 = cx * chunk;
        const z0 = cz * chunk;
        const x1 = Math.min(n, x0 + chunk);
        const z1 = Math.min(n, z0 + chunk);
        const lod = new THREE.LOD();
        lodSteps.forEach((step, i) => {
          const m = new THREE.Mesh(this.buildChunk(x0, z0, x1, z1, step), this.mat);
          m.receiveShadow = true;
          m.castShadow = i === 0;
          lod.addLevel(m, lodDist[i]);
        });
        const cxw = -t.half + ((x0 + x1) / 2) * t.def.cell;
        const czw = -t.half + ((z0 + z1) / 2) * t.def.cell;
        lod.position.set(0, 0, 0);
        // LOD distance is measured from the object's position: park it at the
        // chunk centre and offset the geometry back.
        lod.position.set(cxw, 0, czw);
        for (const l of lod.levels) l.object.position.set(-cxw, 0, -czw);
        lod.autoUpdate = true;
        this.group.add(lod);
      }
    }
  }

  private buildChunk(x0: number, z0: number, x1: number, z1: number, step: number): THREE.BufferGeometry {
    const t = this.t;
    const c = t.def.cell;
    const nx = Math.floor((x1 - x0) / step);
    const nz = Math.floor((z1 - z0) / step);
    const cols = nx + 1;
    const rows = nz + 1;
    // grid + a skirt ring
    const skirt = 2 * cols + 2 * rows;
    const vcount = cols * rows + skirt;
    const pos = new Float32Array(vcount * 3);
    const nor = new Float32Array(vcount * 3);
    const col = new Float32Array(vcount * 3);
    const idx: number[] = [];
    const tmp = new THREE.Color();

    const put = (v: number, ix: number, iz: number, drop = 0) => {
      const x = -t.half + ix * c;
      const z = -t.half + iz * c;
      const h = t.sample(ix, iz);
      pos[v * 3] = x;
      pos[v * 3 + 1] = h - drop;
      pos[v * 3 + 2] = z;
      // Normal from the global grid (central differences) so chunks match.
      const hx = t.sample(ix + 1, iz) - t.sample(ix - 1, iz);
      const hz = t.sample(ix, iz + 1) - t.sample(ix, iz - 1);
      const nl = Math.hypot(hx, 2 * c, hz) || 1;
      nor[v * 3] = -hx / nl;
      nor[v * 3 + 1] = (2 * c) / nl;
      nor[v * 3 + 2] = -hz / nl;
      const o = (iz * this.bake.n + ix) * 4;
      tmp.setRGB(this.bake.rgba[o] / 255, this.bake.rgba[o + 1] / 255, this.bake.rgba[o + 2] / 255).convertSRGBToLinear();
      col[v * 3] = tmp.r;
      col[v * 3 + 1] = tmp.g;
      col[v * 3 + 2] = tmp.b;
    };

    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) put(j * cols + i, x0 + i * step, z0 + j * step);
    // Triangulate with the same diagonal as the collider: (ix+1, iz) — (ix, iz+1).
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const a = j * cols + i; // (i, j)
        const b = a + 1; // (i+1, j)
        const d = a + cols; // (i, j+1)
        const e = d + 1; // (i+1, j+1)
        idx.push(a, d, b, b, d, e);
      }
    }

    // Skirt: duplicate the border, dropped 3 m, stitched to the edge.
    let v = cols * rows;
    const edge = (list: [number, number, number][]) => {
      const start = v;
      for (const [vi, ix, iz] of list) {
        put(v, ix, iz, 3);
        void vi;
        v++;
      }
      for (let k = 0; k < list.length - 1; k++) {
        const top0 = list[k][0];
        const top1 = list[k + 1][0];
        const bot0 = start + k;
        const bot1 = start + k + 1;
        idx.push(top0, bot0, top1, top1, bot0, bot1);
        idx.push(top0, top1, bot0, top1, bot1, bot0); // both windings: never see through
      }
    };
    const north: [number, number, number][] = [];
    const south: [number, number, number][] = [];
    for (let i = 0; i < cols; i++) {
      north.push([i, x0 + i * step, z0]);
      south.push([nz * cols + i, x0 + i * step, z0 + nz * step]);
    }
    const west: [number, number, number][] = [];
    const east: [number, number, number][] = [];
    for (let j = 0; j < rows; j++) {
      west.push([j * cols, x0, z0 + j * step]);
      east.push([j * cols + nx, x0 + nx * step, z0 + j * step]);
    }
    edge(north);
    edge(south);
    edge(west);
    edge(east);

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos.subarray(0, v * 3), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor.subarray(0, v * 3), 3));
    g.setAttribute('color', new THREE.BufferAttribute(col.subarray(0, v * 3), 3));
    g.setIndex(idx);
    g.computeBoundingSphere();
    return g;
  }
}

/** Grid height and ground textures for GPU samplers (grass, water). */
export function groundTextures(t: Terrain, bake: GroundBake): { height: THREE.DataTexture; ground: THREE.DataTexture; flowers: THREE.DataTexture } {
  const n = t.n;
  // Row-major in z, as a texture expects (v = z).
  const h = new Float32Array(n * n);
  for (let ix = 0; ix < n; ix++) for (let iz = 0; iz < n; iz++) h[iz * n + ix] = t.heights[ix * n + iz];
  const height = new THREE.DataTexture(h, n, n, THREE.RedFormat, THREE.FloatType);
  height.minFilter = height.magFilter = THREE.NearestFilter;
  height.needsUpdate = true;
  const ground = new THREE.DataTexture(bake.rgba as Uint8Array<ArrayBuffer>, n, n, THREE.RGBAFormat, THREE.UnsignedByteType);
  ground.minFilter = ground.magFilter = THREE.LinearFilter;
  ground.colorSpace = THREE.NoColorSpace;
  ground.needsUpdate = true;
  const flowers = new THREE.DataTexture(bake.flowers as Uint8Array<ArrayBuffer>, n, n, THREE.RedFormat, THREE.UnsignedByteType);
  flowers.minFilter = flowers.magFilter = THREE.LinearFilter;
  flowers.needsUpdate = true;
  return { height, ground, flowers };
}
