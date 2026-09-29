import * as THREE from 'three';
import type { Terrain } from '../../sim/terrain';
import { FOG_PARS, SU } from './stylized';

// GPU grass. A fixed lattice of blades wraps around the camera (toroidally),
// so each blade has a stable world position while it's in range and the CPU
// never touches it. Height, ground colour and density come from the terrain's
// baked textures, so blades sit exactly on the ground and match its colour.
// Wind, lighting, shadows and fog all run in the vertex/fragment shaders.

export interface GrassOpts {
  radius: number;
  spacing: number;
  height: number;
  flowerRadius: number;
  flowerSpacing: number;
}

export const GRASS_QUALITY: Record<'low' | 'med' | 'high', GrassOpts> = {
  // Budget: Medium = 60 fps on an RTX 5060-class GPU.
  low: { radius: 26, spacing: 0.17, height: 0.38, flowerRadius: 22, flowerSpacing: 0.9 },
  med: { radius: 44, spacing: 0.12, height: 0.4, flowerRadius: 36, flowerSpacing: 0.65 },
  high: { radius: 60, spacing: 0.1, height: 0.42, flowerRadius: 48, flowerSpacing: 0.55 },
};

const SAMPLE_GLSL = /* glsl */ `
uniform sampler2D uHeightTex;
uniform sampler2D uGroundTex;
uniform float uHalf;
uniform float uCell;
uniform float uN;
float terrainH(vec2 p) {
  vec2 g = (p + uHalf) / uCell;
  vec2 i = floor(g);
  vec2 f = g - i;
  ivec2 ii = ivec2(clamp(i, vec2(0.0), vec2(uN - 1.0)));
  ivec2 i1 = ivec2(clamp(i + 1.0, vec2(0.0), vec2(uN - 1.0)));
  float h00 = texelFetch(uHeightTex, ivec2(ii.x, ii.y), 0).r;
  float h10 = texelFetch(uHeightTex, ivec2(i1.x, ii.y), 0).r;
  float h01 = texelFetch(uHeightTex, ivec2(ii.x, i1.y), 0).r;
  float h11 = texelFetch(uHeightTex, ivec2(i1.x, i1.y), 0).r;
  // same triangle split as the collider
  if (f.x + f.y <= 1.0) return h00 + (h10 - h00) * f.x + (h01 - h00) * f.y;
  return h11 + (h01 - h11) * (1.0 - f.x) + (h10 - h11) * (1.0 - f.y);
}
vec2 groundUv(vec2 p) { return ((p + uHalf) / uCell + 0.5) / uN; }
float gh1(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
vec2 gh2(vec2 p) { return vec2(gh1(p), gh1(p + 17.31)); }
`;

function bladeGeometry(): THREE.BufferGeometry {
  // A tapered, three-segment blade in the XY plane; y is 0..1.
  const pts = [
    [-0.5, 0],
    [0.5, 0],
    [-0.36, 0.42],
    [0.36, 0.42],
    [-0.2, 0.78],
    [0.2, 0.78],
    [0, 1],
  ];
  const pos = new Float32Array(pts.length * 3);
  pts.forEach(([x, y], i) => {
    pos[i * 3] = x;
    pos[i * 3 + 1] = y;
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(pts.length * 3).fill(0), 3));
  g.setIndex([0, 1, 2, 2, 1, 3, 2, 3, 4, 4, 3, 5, 4, 5, 6]);
  return g;
}

function flowerGeometry(): THREE.BufferGeometry {
  // stem (y 0..1, head flag 0) + a crossed head (head flag 1)
  const pos: number[] = [];
  const head: number[] = [];
  const idx: number[] = [];
  const quad = (a: number[], b: number[], c: number[], d: number[], h: number) => {
    const s = pos.length / 3;
    pos.push(...a, ...b, ...c, ...d);
    head.push(h, h, h, h);
    idx.push(s, s + 1, s + 2, s + 2, s + 1, s + 3);
  };
  quad([-0.012, 0, 0], [0.012, 0, 0], [-0.008, 1, 0], [0.008, 1, 0], 0);
  // a little five-petal head: two crossed quads, tilted up
  const r = 0.055;
  quad([-r, 1 - r * 0.6, 0], [r, 1 - r * 0.6, 0], [-r, 1 + r * 1.2, r * 0.5], [r, 1 + r * 1.2, r * 0.5], 1);
  quad([0, 1 - r * 0.6, -r], [0, 1 - r * 0.6, r], [r * 0.5, 1 + r * 1.2, -r], [r * 0.5, 1 + r * 1.2, r], 1);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(pos.length).fill(0), 3));
  g.setAttribute('aHead', new THREE.Float32BufferAttribute(head, 1));
  g.setIndex(idx);
  return g;
}

function lattice(radius: number, spacing: number): Float32Array {
  const side = Math.floor((radius * 2) / spacing);
  const out = new Float32Array(side * side * 2);
  let k = 0;
  for (let i = 0; i < side; i++) {
    for (let j = 0; j < side; j++) {
      out[k++] = -radius + (i + 0.5) * spacing;
      out[k++] = -radius + (j + 0.5) * spacing;
    }
  }
  return out;
}

export class Grass {
  readonly group = new THREE.Group();
  private uniforms: Record<string, THREE.IUniform>;

  constructor(t: Terrain, tex: { height: THREE.DataTexture; ground: THREE.DataTexture; flowers: THREE.DataTexture }, o: GrassOpts) {
    this.uniforms = {
      uHeightTex: { value: tex.height },
      uGroundTex: { value: tex.ground },
      uFlowerTex: { value: tex.flowers },
      uHalf: { value: t.half },
      uCell: { value: t.def.cell },
      uN: { value: t.n },
      uCam: { value: new THREE.Vector3() },
      uRadius: { value: o.radius },
      uSpacing: { value: o.spacing },
      uGrassH: { value: o.height },
      uTime: SU.uTime,
      uWind: SU.uWind,
      uWindStrength: SU.uWindStrength,
      // things that flatten the grass (the player, vehicles)
      uPush: { value: [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()] },
    };

    this.group.add(this.makeLayer(bladeGeometry(), lattice(o.radius, o.spacing), false, o.radius, o.spacing));
    this.group.add(this.makeLayer(flowerGeometry(), lattice(o.flowerRadius, o.flowerSpacing), true, o.flowerRadius, o.flowerSpacing));
  }

  private makeLayer(base: THREE.BufferGeometry, offsets: Float32Array, flower: boolean, radius: number, spacing: number): THREE.Mesh {
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = base.index;
    for (const [k, a] of Object.entries(base.attributes)) geo.setAttribute(k, a);
    geo.setAttribute('aOff', new THREE.InstancedBufferAttribute(offsets, 2));
    geo.instanceCount = offsets.length / 2;

    const mat = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0, side: THREE.DoubleSide });
    const U = this.uniforms;
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, U, {
        uRadiusL: { value: radius },
        uSpacingL: { value: spacing },
        uSunDir: SU.uSunDir,
        uFogColor: SU.uFogColor,
        uFogSun: SU.uFogSun,
        uFogDensity: SU.uFogDensity,
        uFogHeight: SU.uFogHeight,
        uFogBase: SU.uFogBase,
        uFogMax: SU.uFogMax,
      });
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
${SAMPLE_GLSL}
uniform sampler2D uFlowerTex;
uniform vec3 uCam;
uniform float uRadiusL;
uniform float uSpacingL;
uniform float uGrassH;
uniform float uTime;
uniform vec2 uWind;
uniform float uWindStrength;
uniform vec4 uPush[4];
attribute vec2 aOff;
${flower ? 'attribute float aHead;' : ''}
varying vec3 vGrassCol;
varying float vTip;
varying vec3 vStylWorld;`,
        )
        .replace(
          '#include <beginnormal_vertex>',
          `vec3 objectNormal = vec3(0.0, 1.0, 0.0);`,
        )
        .replace(
          '#include <begin_vertex>',
          `
float R = uRadiusL;
vec2 L = vec2(2.0 * R);
vec2 wp = aOff + L * floor((uCam.xz - aOff + R) / L);
vec2 cell = floor(wp / uSpacingL + 0.5);
wp += (gh2(cell) - 0.5) * uSpacingL * 0.95;
float rnd = gh1(cell * 1.37 + 3.1);
float dist = distance(wp, uCam.xz);
vec4 gs = texture2D(uGroundTex, groundUv(wp));
${flower ? 'float dens = texture2D(uFlowerTex, groundUv(wp)).r;' : 'float dens = gs.a;'}
float fade = 1.0 - smoothstep(R * 0.55, R * 0.98, dist);
float keep = step(rnd, dens * fade) ;
float hgt = ${flower ? 'mix(0.26, 0.42, gh1(cell + 9.1))' : 'uGrassH * mix(0.45, 1.3, pow(gh1(cell + 5.7), 1.5)) * (0.5 + 0.5 * dens)'} * keep;
float ang = gh1(cell + 2.3) * 6.2831;
vec2 dir = vec2(cos(ang), sin(ang));
float y = position.y;
vec3 p;
p.x = wp.x + dir.x * position.x * ${flower ? '1.0' : '0.045'} - dir.y * position.z;
p.z = wp.y + dir.y * position.x * ${flower ? '1.0' : '0.045'} + dir.x * position.z;
p.y = terrainH(wp) + y * hgt;
// wind: gusts roll across the field
float ph = dot(wp, vec2(0.23, 0.19)) + uTime * 1.6;
float gust = 0.55 + 0.45 * sin(dot(wp, vec2(0.031, 0.027)) - uTime * 0.9);
float sway = (sin(ph) * 0.6 + sin(ph * 2.1 + 1.3) * 0.25 + 0.35) * gust * uWindStrength;
float bend = y * y * hgt;
p.x += uWind.x * sway * bend * 0.55;
p.z += uWind.y * sway * bend * 0.55;
// natural lean + push-away from the player and wheels
p.xz += dir.yx * vec2(1.0, -1.0) * bend * 0.12;
for (int i = 0; i < 4; i++) {
  vec2 d = p.xz - uPush[i].xy;
  float dl = length(d);
  float k = (1.0 - smoothstep(0.0, uPush[i].z, dl)) * uPush[i].w;
  p.xz += (dl > 0.001 ? d / dl : vec2(0.0)) * k * bend * 0.9;
  p.y -= k * bend * 0.45;
}
// culled blades collapse to a single point under the ground
vec3 transformed = keep > 0.5 && hgt > 0.02 ? p : vec3(wp.x, terrainH(wp) - 1.0, wp.y);
vec3 g = pow(gs.rgb, vec3(2.2));
${
  flower
    ? `
float pick = gh1(cell + 13.7);
vec3 petal = pick < 0.3 ? vec3(0.95, 0.93, 0.88) : pick < 0.55 ? vec3(1.0, 0.8, 0.18) : pick < 0.72 ? vec3(0.62, 0.42, 0.9) : pick < 0.88 ? vec3(0.98, 0.52, 0.66) : vec3(0.45, 0.65, 1.0);
vGrassCol = aHead > 0.5 ? pow(petal, vec3(2.2)) : g * 0.8;`
    : `
float tipWarm = gh1(cell + 21.7);
vec3 tip = g * 1.25 + vec3(0.06, 0.05, -0.01) * tipWarm;
vGrassCol = mix(g * 0.42, tip, smoothstep(0.0, 1.0, y));`
}
vTip = y;
vStylWorld = p;`,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
varying vec3 vGrassCol;
varying float vTip;
varying vec3 vStylWorld;
${FOG_PARS}`,
        )
        .replace('#include <color_fragment>', `diffuseColor.rgb = vGrassCol;`)
        .replace('float faceDirection = gl_FrontFacing ? 1.0 : - 1.0;', 'float faceDirection = 1.0;')
        .replace(
          '#include <opaque_fragment>',
          `// light through the blade tips when looking toward the sun
outgoingLight += vGrassCol * 0.35 * vTip * pow(max(dot(normalize(vStylWorld - cameraPosition), uSunDir), 0.0), 3.0);
#include <opaque_fragment>`,
        )
        .replace('#include <fog_fragment>', 'gl_FragColor.rgb = stylFog(gl_FragColor.rgb, vStylWorld);');
    };
    mat.customProgramCacheKey = () => (flower ? 'flower' : 'grass');
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    return mesh;
  }

  update(cam: THREE.Vector3, pushers: { x: number; z: number; r: number; k: number }[]): void {
    (this.uniforms.uCam.value as THREE.Vector3).copy(cam);
    const push = this.uniforms.uPush.value as THREE.Vector4[];
    for (let i = 0; i < 4; i++) {
      const p = pushers[i];
      if (p) push[i].set(p.x, p.z, p.r, p.k);
      else push[i].set(0, 0, 1, 0);
    }
  }
}
