import * as THREE from 'three';
import { makeRng } from '../../shared/math';
import { SU } from './stylized';

// Sky, sun, moon, clouds, distant ranges and the time-of-day palette.
//
// The palette is keyed by SUN ELEVATION, not clock time, so the light is
// always self-consistent: a low sun is always golden, a set sun always dusky.
// The fog colour is the sky's horizon colour, which is what makes the world
// melt into the sky with no seam.

interface Key {
  e: number;
  zenith: number;
  horizon: number;
  sun: number;
  sunInt: number;
  hemiSky: number;
  hemiGround: number;
  hemiInt: number;
  fogSun: number;
  fogDensity: number;
  rim: number;
  stars: number;
  cloudLit: number;
  cloudShade: number;
  glow: number;
  exposure: number;
}

const KEYS: Key[] = [
  { e: -16, zenith: 0x070d1c, horizon: 0x16213b, sun: 0x8ea6dc, sunInt: 0.55, hemiSky: 0x33477a, hemiGround: 0x0e1119, hemiInt: 0.75, fogSun: 0x243458, fogDensity: 0.0016, rim: 0x5c7cc0, stars: 1, cloudLit: 0x34426a, cloudShade: 0x151c30, glow: 0x1c2848, exposure: 1.15 },
  { e: -6, zenith: 0x17295a, horizon: 0x7c5f86, sun: 0xc58a9a, sunInt: 0.45, hemiSky: 0x5a5c9e, hemiGround: 0x241f2c, hemiInt: 0.75, fogSun: 0xd98a78, fogDensity: 0.0018, rim: 0xb693d0, stars: 0.45, cloudLit: 0xd88f86, cloudShade: 0x463f64, glow: 0xe07a5a, exposure: 1.1 },
  { e: 0.5, zenith: 0x3a5a9e, horizon: 0xf3a57a, sun: 0xff8a48, sunInt: 1.9, hemiSky: 0x8b86c4, hemiGround: 0x4b3934, hemiInt: 0.8, fogSun: 0xffa45a, fogDensity: 0.0019, rim: 0xffbf8a, stars: 0.05, cloudLit: 0xffae78, cloudShade: 0x735e8c, glow: 0xff8a40, exposure: 1.0 },
  { e: 7, zenith: 0x4777c0, horizon: 0xf5cfa0, sun: 0xffc67e, sunInt: 3.0, hemiSky: 0x9cb2e8, hemiGround: 0x5a4a38, hemiInt: 0.85, fogSun: 0xffd08e, fogDensity: 0.0017, rim: 0xffdcaa, stars: 0, cloudLit: 0xfff1d6, cloudShade: 0x9492bc, glow: 0xffc070, exposure: 1.0 },
  { e: 20, zenith: 0x3d79cf, horizon: 0xcfe0ee, sun: 0xfff0d6, sunInt: 3.3, hemiSky: 0xa6c4f0, hemiGround: 0x5c5842, hemiInt: 0.9, fogSun: 0xfff0d2, fogDensity: 0.0014, rim: 0xd8e8ff, stars: 0, cloudLit: 0xffffff, cloudShade: 0xa9b6d4, glow: 0xfff0c8, exposure: 1.0 },
  { e: 60, zenith: 0x3570cc, horizon: 0xd4e5f3, sun: 0xfffaf0, sunInt: 3.4, hemiSky: 0xb0cdf2, hemiGround: 0x5e5c48, hemiInt: 0.95, fogSun: 0xfff6e0, fogDensity: 0.0013, rim: 0xdfeaff, stars: 0, cloudLit: 0xffffff, cloudShade: 0xb3c0dc, glow: 0xfff8e0, exposure: 1.0 },
];

const tmpA = new THREE.Color();
const tmpB = new THREE.Color();
function mixHex(a: number, b: number, t: number, out: THREE.Color): THREE.Color {
  tmpA.setHex(a);
  tmpB.setHex(b);
  return out.copy(tmpA).lerp(tmpB, t);
}

export interface SkyOpts {
  /** Compass bearing (deg) the sun sets toward. */
  sunsetBearing: number;
  shadowMap: number;
  shadowSpan: number;
  /** Draw clouds + distant ranges (outdoor levels). */
  scenery: boolean;
  seed: number;
}

export class Sky {
  readonly sun: THREE.DirectionalLight;
  readonly hemi: THREE.HemisphereLight;
  /** Unit vector toward the key light (sun, or moon at night). */
  readonly keyDir = new THREE.Vector3();
  /** Unit vector toward the actual sun (may be below the horizon). */
  readonly sunDir = new THREE.Vector3();
  elevation = 30;
  exposure = 1;
  /** 0 day .. 1 night, for lamps and fireflies. */
  night = 0;
  private dome: THREE.Mesh;
  private domeMat: THREE.ShaderMaterial;
  private clouds?: THREE.Mesh;
  private cloudMat?: THREE.ShaderMaterial;
  private ranges: THREE.Mesh[] = [];
  private rangeMat?: THREE.ShaderMaterial;
  private pmrem: THREE.PMREMGenerator;
  private envScene = new THREE.Scene();
  private envRT?: THREE.WebGLRenderTarget;
  private envElev = 999;
  private span: number;
  readonly palette = {
    zenith: new THREE.Color(),
    horizon: new THREE.Color(),
    glow: new THREE.Color(),
    cloudLit: new THREE.Color(),
    cloudShade: new THREE.Color(),
    stars: 0,
  };

  constructor(
    private scene: THREE.Scene,
    private renderer: THREE.WebGLRenderer,
    private opts: SkyOpts,
  ) {
    this.span = opts.shadowSpan;
    this.domeMat = new THREE.ShaderMaterial({
      uniforms: {
        uZenith: { value: new THREE.Color() },
        uHorizon: { value: new THREE.Color() },
        uGlow: { value: new THREE.Color() },
        uSunDir: SU.uSunDir,
        uMoonDir: { value: new THREE.Vector3(0, 1, 0) },
        uStars: { value: 0 },
        uSunVis: { value: 1 },
        uTime: SU.uTime,
      },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_Position = p.xyww;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uZenith; uniform vec3 uHorizon; uniform vec3 uGlow;
        uniform vec3 uSunDir; uniform vec3 uMoonDir; uniform float uStars; uniform float uSunVis; uniform float uTime;
        varying vec3 vDir;
        float h3(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
        void main() {
          vec3 d = normalize(vDir);
          float h = d.y;
          float up = smoothstep(-0.02, 0.75, h);
          vec3 col = mix(uHorizon, uZenith, pow(up, 0.55));
          // a warm band hugging the horizon, strongest toward the sun
          float sd = dot(d, uSunDir);
          float band = pow(1.0 - clamp(abs(h), 0.0, 1.0), 7.0);
          col = mix(col, uGlow, band * (0.25 + 0.55 * pow(max(sd, 0.0), 2.0)));
          // sun halo and disc
          col += uGlow * (pow(max(sd, 0.0), 12.0) * 0.45 + pow(max(sd, 0.0), 180.0) * 1.2) * uSunVis;
          float disc = smoothstep(0.99955, 0.99975, sd);
          col = mix(col, vec3(1.0, 0.97, 0.9) * 3.0, disc * uSunVis * step(-0.03, uSunDir.y));
          // below the horizon: ground haze, same as the fog
          col = mix(col, uHorizon * 0.92, smoothstep(0.0, -0.08, h));
          // stars
          if (uStars > 0.01 && h > 0.0) {
            vec3 cell = floor(d * 380.0);
            float s = h3(cell);
            float tw = 0.6 + 0.4 * sin(uTime * 2.0 + s * 60.0);
            float star = step(0.9975, s) * tw * smoothstep(0.0, 0.25, h);
            col += vec3(0.85, 0.9, 1.0) * star * uStars * 1.4;
          }
          // moon
          float md = dot(d, normalize(uMoonDir));
          col += vec3(0.75, 0.8, 1.0) * (smoothstep(0.99935, 0.9996, md) * 1.8 + pow(max(md, 0.0), 60.0) * 0.12) * uStars;
          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
        }`,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(5000, 48, 24), this.domeMat);
    this.dome.renderOrder = -1000;
    this.dome.frustumCulled = false;
    scene.add(this.dome);
    this.envScene.add(new THREE.Mesh(this.dome.geometry, this.domeMat));

    this.hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.8);
    scene.add(this.hemi);

    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = opts.shadowMap > 0;
    this.sun.shadow.mapSize.set(opts.shadowMap || 512, opts.shadowMap || 512);
    const cam = this.sun.shadow.camera;
    cam.near = 1;
    cam.far = 260;
    cam.left = -this.span;
    cam.right = this.span;
    cam.top = this.span;
    cam.bottom = -this.span;
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.04;
    this.sun.shadow.radius = 3;
    scene.add(this.sun, this.sun.target);

    this.pmrem = new THREE.PMREMGenerator(renderer);

    if (opts.scenery) {
      this.buildClouds();
      this.buildRanges();
    }
  }

  // --- clouds -------------------------------------------------------------------

  private buildClouds(): void {
    const rng = makeRng(this.opts.seed + 99);
    const centers: number[] = [];
    const offsets: number[] = [];
    const sizes: number[] = [];
    const seeds: number[] = [];
    const clouds = 26;
    for (let c = 0; c < clouds; c++) {
      const a = rng() * Math.PI * 2;
      const r = 650 + rng() * 1500;
      const cx = Math.cos(a) * r;
      const cz = Math.sin(a) * r;
      const cy = 200 + rng() * 260;
      const w = 90 + rng() * 170;
      const puffs = 9 + Math.floor(rng() * 12);
      for (let i = 0; i < puffs; i++) {
        const ox = (rng() - 0.5) * w;
        const oz = (rng() - 0.5) * w * 0.55;
        // taller in the middle, flat-bottomed
        const mid = 1 - Math.abs(ox) / (w * 0.6);
        const oy = rng() * 35 * Math.max(0.2, mid);
        const s = (28 + rng() * 38) * (0.6 + 0.6 * Math.max(0, mid));
        centers.push(cx, cy, cz);
        offsets.push(ox, oy, oz);
        sizes.push(s);
        seeds.push(rng());
      }
    }
    const count = sizes.length;
    const base = new THREE.PlaneGeometry(1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = base.index;
    geo.setAttribute('position', base.getAttribute('position'));
    geo.setAttribute('uv', base.getAttribute('uv'));
    geo.setAttribute('aCenter', new THREE.InstancedBufferAttribute(new Float32Array(centers), 3));
    geo.setAttribute('aOffset', new THREE.InstancedBufferAttribute(new Float32Array(offsets), 3));
    geo.setAttribute('aSize', new THREE.InstancedBufferAttribute(new Float32Array(sizes), 1));
    geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(new Float32Array(seeds), 1));
    geo.instanceCount = count;

    this.cloudMat = new THREE.ShaderMaterial({
      uniforms: {
        uSunDir: SU.uSunDir,
        uLit: { value: new THREE.Color() },
        uShade: { value: new THREE.Color() },
        uHorizon: { value: new THREE.Color() },
        uTime: SU.uTime,
      },
      vertexShader: /* glsl */ `
        attribute vec3 aCenter; attribute vec3 aOffset; attribute float aSize; attribute float aSeed;
        varying vec2 vUv; varying vec3 vPuffDir; varying float vDist; varying float vSeed; varying float vLow;
        uniform float uTime;
        void main() {
          vUv = uv;
          vSeed = aSeed;
          vec3 c = aCenter + aOffset;
          c.x += uTime * 1.2; // slow drift
          vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
          vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
          vec3 wp = c + (right * position.x + up * position.y) * aSize;
          vPuffDir = normalize(aOffset + vec3(0.0, 18.0, 0.0));
          vLow = clamp(aOffset.y / 30.0, 0.0, 1.0);
          vDist = length(wp - cameraPosition);
          gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uSunDir; uniform vec3 uLit; uniform vec3 uShade; uniform vec3 uHorizon;
        varying vec2 vUv; varying vec3 vPuffDir; varying float vDist; varying float vSeed; varying float vLow;
        void main() {
          vec2 p = vUv * 2.0 - 1.0;
          float r2 = dot(p, p);
          if (r2 > 1.0) discard;
          // impostor sphere normal in view space → approximate world lighting
          vec3 nv = vec3(p, sqrt(1.0 - r2));
          vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
          vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
          vec3 back = vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]);
          vec3 n = normalize(right * nv.x + up * nv.y + back * nv.z + vPuffDir * 0.8);
          float l = dot(n, normalize(uSunDir)) * 0.5 + 0.5;
          l = smoothstep(0.15, 0.95, l);
          vec3 col = mix(uShade, uLit, l);
          col = mix(col, uShade * 0.85, (1.0 - vLow) * 0.35 * (1.0 - l));
          // silver lining toward the sun
          float rim = pow(1.0 - nv.z, 2.0) * pow(max(dot(-back, normalize(uSunDir)), 0.0), 4.0);
          col += uLit * rim * 0.6;
          col = mix(col, uHorizon, smoothstep(900.0, 2600.0, vDist) * 0.55);
          float a = smoothstep(1.0, 0.35, r2) * 0.92;
          gl_FragColor = vec4(col, a);
          #include <colorspace_fragment>
        }`,
      transparent: true,
      depthWrite: false,
      fog: false,
    });
    this.clouds = new THREE.Mesh(geo, this.cloudMat);
    this.clouds.frustumCulled = false;
    this.clouds.renderOrder = -900;
    this.scene.add(this.clouds);
  }

  // --- distant ranges -------------------------------------------------------------

  private buildRanges(): void {
    const rng = makeRng(this.opts.seed + 7);
    this.rangeMat = new THREE.ShaderMaterial({
      uniforms: {
        uSunDir: SU.uSunDir,
        uHorizon: { value: new THREE.Color() },
        uLight: { value: new THREE.Color() },
        uShadow: { value: new THREE.Color() },
      },
      vertexShader: /* glsl */ `
        attribute float aAtmo; attribute float aSnow;
        varying vec3 vN; varying float vAtmo; varying float vH; varying float vSnow; varying vec3 vW;
        void main() {
          vN = normalize(normal);
          vAtmo = aAtmo; vSnow = aSnow; vH = position.y;
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vW = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uSunDir; uniform vec3 uHorizon; uniform vec3 uLight; uniform vec3 uShadow;
        varying vec3 vN; varying float vAtmo; varying float vH; varying float vSnow; varying vec3 vW;
        void main() {
          float l = dot(normalize(vN), normalize(uSunDir)) * 0.5 + 0.5;
          vec3 base = mix(vec3(0.24, 0.3, 0.38), vec3(0.86, 0.9, 0.97), vSnow);
          vec3 col = base * mix(uShadow, uLight, smoothstep(0.25, 0.85, l));
          // atmospheric perspective: far ranges fade into the horizon, and
          // the bottom of every range dissolves into the haze
          float haze = clamp(vAtmo + (1.0 - smoothstep(-20.0, 220.0, vH)) * 0.45, 0.0, 0.97);
          col = mix(col, uHorizon, haze);
          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
        }`,
      fog: false,
    });

    const rings = [
      { r: 1250, h: 150, amp: 170, atmo: 0.35, snow: 0.0 },
      { r: 2100, h: 260, amp: 320, atmo: 0.55, snow: 0.45 },
      { r: 3200, h: 380, amp: 560, atmo: 0.72, snow: 0.7 },
    ];
    const seg = 220;
    for (const ring of rings) {
      const phase = rng() * 100;
      const pos: number[] = [];
      const atmo: number[] = [];
      const snow: number[] = [];
      const idx: number[] = [];
      const rows = 4;
      for (let i = 0; i <= seg; i++) {
        const a = (i / seg) * Math.PI * 2;
        // layered peaks: a few big masses plus ridged detail
        const n1 = Math.sin(a * 3 + phase) * 0.35 + Math.sin(a * 7.3 + phase * 1.7) * 0.25;
        const n2 = Math.abs(Math.sin(a * 17.1 + phase * 0.3)) * 0.25 + Math.abs(Math.sin(a * 41.7 + phase)) * 0.1;
        const top = ring.h + (n1 + n2) * ring.amp;
        for (let j = 0; j <= rows; j++) {
          const k = j / rows;
          const y = -80 + (top + 80) * Math.pow(k, 0.85);
          // push the upper part inward a touch so the silhouette has slope
          const rr = ring.r - k * ring.r * 0.04;
          pos.push(Math.cos(a) * rr, y, Math.sin(a) * rr);
          atmo.push(ring.atmo);
          const snowLine = ring.h + ring.amp * 0.35;
          snow.push(ring.snow > 0 ? THREE.MathUtils.smoothstep(y, snowLine, snowLine + ring.amp * 0.3) * ring.snow : 0);
        }
      }
      for (let i = 0; i < seg; i++) {
        for (let j = 0; j < rows; j++) {
          const a0 = i * (rows + 1) + j;
          const b0 = (i + 1) * (rows + 1) + j;
          idx.push(a0, b0, a0 + 1, a0 + 1, b0, b0 + 1);
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('aAtmo', new THREE.Float32BufferAttribute(atmo, 1));
      g.setAttribute('aSnow', new THREE.Float32BufferAttribute(snow, 1));
      g.setIndex(idx);
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, this.rangeMat);
      m.frustumCulled = false;
      m.renderOrder = -950;
      this.ranges.push(m);
      this.scene.add(m);
    }
  }

  // --- time of day ------------------------------------------------------------------

  /** Sun elevation / bearing (deg) for a clock time. */
  sunAngles(hour: number): { elev: number; bearing: number } {
    const k = (hour - 6.2) / 13.8;
    const elev = 64 * Math.sin(Math.PI * k);
    const bearing = this.opts.sunsetBearing - 180 + k * 180;
    return { elev, bearing };
  }

  /** Apply a clock time: sun position, colours, fog, stars, env map. */
  setHour(hour: number): void {
    const { elev, bearing } = this.sunAngles(hour);
    this.elevation = elev;
    const toDir = (e: number, b: number, out: THREE.Vector3) => {
      const er = THREE.MathUtils.degToRad(e);
      const br = THREE.MathUtils.degToRad(b);
      return out.set(Math.sin(br) * Math.cos(er), Math.sin(er), -Math.cos(br) * Math.cos(er)).normalize();
    };
    toDir(elev, bearing, this.sunDir);
    // Key light: the sun while it's up; the moon (high, opposite side) after.
    const moon = toDir(38, this.opts.sunsetBearing + 150, new THREE.Vector3());
    const sunKey = toDir(Math.max(elev, 2.5), bearing, new THREE.Vector3());
    const m = THREE.MathUtils.smoothstep(elev, 0.5, -7);
    this.keyDir.copy(sunKey).lerp(moon, 1 - m).normalize();
    (this.domeMat.uniforms.uMoonDir.value as THREE.Vector3).copy(moon);

    // Palette.
    let i = 0;
    while (i < KEYS.length - 2 && elev > KEYS[i + 1].e) i++;
    const a = KEYS[i];
    const b = KEYS[i + 1];
    const t = THREE.MathUtils.clamp((elev - a.e) / (b.e - a.e), 0, 1);
    const P = this.palette;
    mixHex(a.zenith, b.zenith, t, P.zenith);
    mixHex(a.horizon, b.horizon, t, P.horizon);
    mixHex(a.glow, b.glow, t, P.glow);
    mixHex(a.cloudLit, b.cloudLit, t, P.cloudLit);
    mixHex(a.cloudShade, b.cloudShade, t, P.cloudShade);
    P.stars = THREE.MathUtils.lerp(a.stars, b.stars, t);
    this.night = THREE.MathUtils.clamp(1 - (elev + 6) / 8, 0, 1);

    mixHex(a.sun, b.sun, t, this.sun.color);
    this.sun.intensity = THREE.MathUtils.lerp(a.sunInt, b.sunInt, t);
    mixHex(a.hemiSky, b.hemiSky, t, this.hemi.color);
    mixHex(a.hemiGround, b.hemiGround, t, this.hemi.groundColor);
    this.hemi.intensity = THREE.MathUtils.lerp(a.hemiInt, b.hemiInt, t);
    this.exposure = THREE.MathUtils.lerp(a.exposure, b.exposure, t);

    SU.uSunDir.value.copy(this.sunDir.y > -0.05 ? this.sunDir : this.keyDir);
    SU.uFogColor.value.copy(P.horizon);
    mixHex(a.fogSun, b.fogSun, t, SU.uFogSun.value);
    SU.uFogDensity.value = THREE.MathUtils.lerp(a.fogDensity, b.fogDensity, t);
    mixHex(a.rim, b.rim, t, SU.uRimColor.value);

    const u = this.domeMat.uniforms;
    (u.uZenith.value as THREE.Color).copy(P.zenith);
    (u.uHorizon.value as THREE.Color).copy(P.horizon);
    (u.uGlow.value as THREE.Color).copy(P.glow);
    u.uStars.value = P.stars;
    u.uSunVis.value = THREE.MathUtils.smoothstep(elev, -4, 1);
    if (this.cloudMat) {
      const cu = this.cloudMat.uniforms;
      (cu.uLit.value as THREE.Color).copy(P.cloudLit);
      (cu.uShade.value as THREE.Color).copy(P.cloudShade);
      (cu.uHorizon.value as THREE.Color).copy(P.horizon);
    }
    if (this.rangeMat) {
      const ru = this.rangeMat.uniforms;
      (ru.uHorizon.value as THREE.Color).copy(P.horizon);
      (ru.uLight.value as THREE.Color).copy(this.sun.color).multiplyScalar(0.5 + this.sun.intensity * 0.18).lerp(this.hemi.color, 0.3);
      (ru.uShadow.value as THREE.Color).copy(this.hemi.color).multiplyScalar(0.55);
    }

    if (Math.abs(elev - this.envElev) > 2.5) this.refreshEnv();
  }

  /** Rebuild the reflection probe from the current sky. */
  refreshEnv(): void {
    this.envElev = this.elevation;
    const old = this.envRT;
    this.envRT = this.pmrem.fromScene(this.envScene, 0, 1, 8000);
    this.scene.environment = this.envRT.texture;
    this.scene.environmentIntensity = 0.55;
    old?.dispose();
  }

  /** Keep the shadow box centred on the player (snapped to texels: no shimmer). */
  follow(target: THREE.Vector3): void {
    this.dome.position.copy(target);
    const texel = (this.span * 2) / this.sun.shadow.mapSize.x;
    const tx = Math.round(target.x / texel) * texel;
    const ty = Math.round(target.y / texel) * texel;
    const tz = Math.round(target.z / texel) * texel;
    this.sun.target.position.set(tx, ty, tz);
    this.sun.position.set(tx + this.keyDir.x * 120, ty + this.keyDir.y * 120, tz + this.keyDir.z * 120);
    this.sun.target.updateMatrixWorld();
    for (const r of this.ranges) r.position.set(target.x, 0, target.z);
  }

  dispose(): void {
    this.envRT?.dispose();
    this.pmrem.dispose();
  }
}
