import * as THREE from 'three';
import type { Terrain } from '../../sim/terrain';
import { fbm } from '../../sim/terrain';
import { styl } from './stylized';

// Lakes and creeks: one flat sheet at the level's water line, built only over
// wet ground. Colour and opacity come from the depth under each vertex, so
// shallows read as clear turquoise over the stones, deep water goes dark
// teal, and the shoreline fades out softly instead of cutting a hard edge.
// Ripples are a procedural normal map scrolled two ways.

const SHALLOW = new THREE.Color(0x86c9bf);
const MID = new THREE.Color(0x3f8d98);
const DEEP = new THREE.Color(0x1d4f63);
const FOAM = new THREE.Color(0xeef6f2);

function rippleNormals(size = 256): THREE.DataTexture {
  // A sum of directional waves with whole-number frequencies tiles
  // seamlessly, and a little noise-driven phase wobble breaks up the grid.
  const waves: [number, number, number, number][] = [];
  const rnd = (i: number) => Math.abs(Math.sin(i * 127.1) * 43758.5453) % 1;
  for (let i = 0; i < 14; i++) {
    const fx = Math.round((rnd(i) - 0.5) * 12);
    const fy = Math.round((rnd(i + 50) - 0.5) * 12) || 1;
    waves.push([fx, fy, rnd(i + 99) * Math.PI * 2, 1 / Math.hypot(fx, fy)]);
  }
  const h = new Float32Array(size * size);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const u = (x / size) * Math.PI * 2;
      const v = (y / size) * Math.PI * 2;
      const wob = fbm(Math.cos(u) + Math.sin(v) * 0.5, Math.sin(u) * 0.5 + Math.cos(v), 77, 2) * 1.5;
      let s = 0;
      for (const [fx, fy, ph, a] of waves) s += Math.sin(fx * u + fy * v + ph + wob) * a;
      h[y * size + x] = s;
    }
  const data = new Uint8Array(size * size * 4);
  const at = (x: number, y: number) => h[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * 3;
      const dy = (at(x, y + 1) - at(x, y - 1)) * 3;
      const l = Math.hypot(dx, dy, 1);
      const i = (y * size + x) * 4;
      data[i] = ((-dx / l) * 0.5 + 0.5) * 255;
      data[i + 1] = ((-dy / l) * 0.5 + 0.5) * 255;
      data[i + 2] = ((1 / l) * 0.5 + 0.5) * 255;
      data[i + 3] = 255;
    }
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}

export class Water {
  readonly group = new THREE.Group();
  private mat: THREE.MeshStandardMaterial;
  private normals: THREE.DataTexture;

  constructor(t: Terrain, level: number) {
    const cell = 2.5;
    const n = Math.floor(t.def.size / cell);
    const half = t.half;
    const N = n + 1;
    const pos = new Float32Array(N * N * 3);
    const col = new Float32Array(N * N * 4);
    const depth = new Float32Array(N * N);
    const c = new THREE.Color();
    for (let ix = 0; ix < N; ix++)
      for (let iz = 0; iz < N; iz++) {
        const x = -half + ix * cell;
        const z = -half + iz * cell;
        const k = ix * N + iz;
        const d = level - t.heightAt(x, z);
        depth[k] = d;
        pos[k * 3] = x;
        pos[k * 3 + 1] = level;
        pos[k * 3 + 2] = z;
        const s = THREE.MathUtils.smoothstep(d, 0, 1.2);
        c.copy(SHALLOW).lerp(MID, s).lerp(DEEP, THREE.MathUtils.smoothstep(d, 1.2, 5));
        // a band of foam right at the waterline
        c.lerp(FOAM, (1 - THREE.MathUtils.smoothstep(d, 0.02, 0.3)) * 0.55);
        col[k * 4] = c.r;
        col[k * 4 + 1] = c.g;
        col[k * 4 + 2] = c.b;
        col[k * 4 + 3] = THREE.MathUtils.smoothstep(d, -0.15, 0.5) * 0.62 + THREE.MathUtils.smoothstep(d, 0.5, 3) * 0.3;
      }
    const index: number[] = [];
    for (let ix = 0; ix < n; ix++)
      for (let iz = 0; iz < n; iz++) {
        const a = ix * N + iz;
        const b = (ix + 1) * N + iz;
        const cc = ix * N + iz + 1;
        const dd = (ix + 1) * N + iz + 1;
        if (Math.max(depth[a], depth[b], depth[cc], depth[dd]) < -0.1) continue;
        index.push(a, cc, b, b, cc, dd);
      }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 4));
    const up = new Float32Array(N * N * 3);
    for (let i = 0; i < N * N; i++) up[i * 3 + 1] = 1;
    geo.setAttribute('normal', new THREE.BufferAttribute(up, 3));
    const uv = new Float32Array(N * N * 2);
    for (let i = 0; i < N * N; i++) {
      uv[i * 2] = pos[i * 3] / 14;
      uv[i * 2 + 1] = pos[i * 3 + 2] / 14;
    }
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(index);
    geo.computeBoundingSphere();

    this.normals = rippleNormals();
    this.mat = styl({ color: 0xffffff, vertexColors: true, rough: 0.06, metal: 0.0, transparent: true, env: 1.6, noise: 0, rim: 0.15, depthWrite: false });
    this.mat.normalMap = this.normals;
    this.mat.normalScale.set(0.45, 0.45);
    this.mat.needsUpdate = true;
    const m = new THREE.Mesh(geo, this.mat);
    m.renderOrder = 2;
    m.receiveShadow = true;
    this.group.add(m);
  }

  update(time: number): void {
    // two slow drifts crossing each other read as moving water
    this.normals.offset.set(time * 0.012, time * 0.007);
  }

  dispose(): void {
    this.normals.dispose();
    this.mat.dispose();
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose();
    });
  }
}
