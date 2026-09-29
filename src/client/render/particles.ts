import * as THREE from 'three';
import type { Vec3 } from '../../shared/math';
import { smokeTexture, sparkTexture } from './textures';
import type { Quality } from '../settings';

interface EmitOpts {
  count: number;
  speed: number;
  spread: number; // sideways/vertical velocity spread
  up: number; // bias to initial upward velocity
  gravity: number;
  size: number;
  ttl: number;
  color: [number, number, number];
  /** Growth per second, as a multiple of the initial size (smoke expands). */
  grow?: number;
  /** Air resistance; 0 = none, higher = settles faster. */
  drag?: number;
  /** Random spin, radians/sec. */
  spin?: number;
}

/**
 * One pooled GPU point cloud, one draw call. Two of these exist: an additive
 * pool for sparks/glints and an alpha-blended pool for smoke and dust —
 * previously everything was additive, so smoke was impossible.
 */
class Pool {
  private pos: Float32Array;
  private vel: Float32Array;
  private grav: Float32Array;
  private dragA: Float32Array;
  private growA: Float32Array;
  private life: Float32Array;
  private ttl: Float32Array;
  private size0: Float32Array;
  private aSize: Float32Array;
  private aAlpha: Float32Array;
  private aRot: Float32Array;
  private spin: Float32Array;
  private aColor: Float32Array;
  private geo: THREE.BufferGeometry;
  private head = 0;
  private live = 0;

  constructor(scene: THREE.Scene, readonly max: number, additive: boolean, map: THREE.Texture, softness: number, private ground: (x: number, z: number) => number) {
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.grav = new Float32Array(max);
    this.dragA = new Float32Array(max);
    this.growA = new Float32Array(max);
    this.life = new Float32Array(max);
    this.ttl = new Float32Array(max);
    this.size0 = new Float32Array(max);
    this.aSize = new Float32Array(max);
    this.aAlpha = new Float32Array(max);
    this.aRot = new Float32Array(max);
    this.spin = new Float32Array(max);
    this.aColor = new Float32Array(max * 3);

    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('aSize', new THREE.BufferAttribute(this.aSize, 1));
    this.geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.aAlpha, 1));
    this.geo.setAttribute('aRot', new THREE.BufferAttribute(this.aRot, 1));
    this.geo.setAttribute('aColor', new THREE.BufferAttribute(this.aColor, 3));
    this.geo.setDrawRange(0, max);
    this.geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);

    const mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: map }, uSoft: { value: softness } },
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      vertexShader: `
        attribute float aSize; attribute float aAlpha; attribute float aRot; attribute vec3 aColor;
        varying float vAlpha; varying float vRot; varying vec3 vColor;
        void main(){
          vAlpha = aAlpha; vRot = aRot; vColor = aColor;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * (320.0 / max(-mv.z, 0.1));
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform sampler2D map; uniform float uSoft;
        varying float vAlpha; varying float vRot; varying vec3 vColor;
        void main(){
          // rotate the sprite UVs so particles don't all share one orientation
          vec2 uv = gl_PointCoord - 0.5;
          float s = sin(vRot), c = cos(vRot);
          uv = vec2(uv.x * c - uv.y * s, uv.x * s + uv.y * c) + 0.5;
          vec4 t = texture2D(map, uv);
          float a = t.a * vAlpha * uSoft;
          if (a < 0.004) discard;
          gl_FragColor = vec4(t.rgb * vColor, a);
        }`,
    });

    const points = new THREE.Points(this.geo, mat);
    points.frustumCulled = false;
    points.renderOrder = 5;
    scene.add(points);
  }

  emit(p: Vec3, o: EmitOpts): void {
    for (let n = 0; n < o.count; n++) {
      const i = this.head;
      this.head = (this.head + 1) % this.max;
      this.pos[i * 3] = p.x;
      this.pos[i * 3 + 1] = p.y;
      this.pos[i * 3 + 2] = p.z;
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * o.speed;
      this.vel[i * 3] = (Math.random() - 0.5) * o.spread + Math.cos(a) * r;
      this.vel[i * 3 + 1] = o.up + (Math.random() - 0.5) * o.spread + Math.random() * o.speed;
      this.vel[i * 3 + 2] = (Math.random() - 0.5) * o.spread + Math.sin(a) * r;
      this.grav[i] = o.gravity;
      this.dragA[i] = o.drag ?? 0;
      this.growA[i] = o.grow ?? 0;
      this.ttl[i] = o.ttl;
      this.life[i] = o.ttl;
      const sz = o.size * (0.6 + Math.random() * 0.8);
      this.size0[i] = sz;
      this.aSize[i] = sz;
      this.aRot[i] = Math.random() * Math.PI * 2;
      this.spin[i] = (Math.random() - 0.5) * (o.spin ?? 0);
      this.aColor[i * 3] = o.color[0];
      this.aColor[i * 3 + 1] = o.color[1];
      this.aColor[i * 3 + 2] = o.color[2];
    }
    this.live = Math.min(this.max, this.live + o.count);
  }

  update(dt: number): void {
    if (this.live <= 0) return;
    let anyAlive = false;
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) {
        if (this.aAlpha[i] !== 0) this.aAlpha[i] = 0;
        continue;
      }
      anyAlive = true;
      this.life[i] -= dt;
      const d = this.dragA[i];
      if (d > 0) {
        const k = Math.max(0, 1 - d * dt);
        this.vel[i * 3] *= k;
        this.vel[i * 3 + 1] *= k;
        this.vel[i * 3 + 2] *= k;
      }
      this.vel[i * 3 + 1] -= this.grav[i] * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      const floor = this.ground(this.pos[i * 3], this.pos[i * 3 + 2]) + 0.02;
      if (this.pos[i * 3 + 1] < floor) {
        this.pos[i * 3 + 1] = floor;
        this.vel[i * 3 + 1] *= -0.3;
        this.vel[i * 3] *= 0.6;
        this.vel[i * 3 + 2] *= 0.6;
      }
      this.aRot[i] += this.spin[i] * dt;
      const u = Math.max(0, this.life[i] / this.ttl[i]);
      if (this.growA[i] > 0) this.aSize[i] = this.size0[i] * (1 + this.growA[i] * (1 - u));
      // Ease the fade so particles dissolve instead of popping out linearly.
      this.aAlpha[i] = u * u * (3 - 2 * u);
    }
    if (!anyAlive) this.live = 0;
    for (const k of ['position', 'aSize', 'aAlpha', 'aRot', 'aColor']) {
      (this.geo.attributes[k] as THREE.BufferAttribute).needsUpdate = true;
    }
  }
}

export class Particles {
  private sparkPool: Pool;
  private smokePool: Pool;
  private dustTimer = 0;
  private budget: number;

  constructor(scene: THREE.Scene, quality: Quality = 'high', ground: (x: number, z: number) => number = () => 0) {
    this.budget = quality === 'high' ? 1 : quality === 'med' ? 0.7 : 0.4;
    const n = quality === 'high' ? 900 : quality === 'med' ? 600 : 300;
    this.sparkPool = new Pool(scene, n, true, sparkTexture(), 1, ground);
    this.smokePool = new Pool(scene, Math.floor(n * 0.8), false, smokeTexture(), 1, ground);
  }

  private scaled(o: EmitOpts): EmitOpts {
    const count = Math.max(1, Math.round(o.count * this.budget));
    return count === o.count ? o : { ...o, count };
  }

  emit(p: Vec3, o: EmitOpts): void {
    this.sparkPool.emit(p, this.scaled(o));
  }
  emitSmoke(p: Vec3, o: EmitOpts): void {
    this.smokePool.emit(p, this.scaled(o));
  }

  sparks(p: Vec3, strength = 1): void {
    this.emit(p, { count: Math.round(24 * strength), speed: 3.6 * strength, spread: 1.2, up: 1.4, gravity: 9, size: 9, ttl: 0.55, color: [1.0, 0.82, 0.45], spin: 6 });
    this.emitSmoke(p, { count: Math.round(3 * strength), speed: 0.3, spread: 0.3, up: 0.5, gravity: -0.4, size: 16, ttl: 0.9, color: [0.55, 0.55, 0.58], grow: 1.4, drag: 1.6, spin: 1.2 });
  }
  sparkle(p: Vec3): void {
    this.emit(p, { count: 16, speed: 1.7, spread: 0.8, up: 1.2, gravity: 2, size: 13, ttl: 0.7, color: [1.0, 0.92, 0.6], spin: 4 });
  }
  burst(p: Vec3, color: [number, number, number]): void {
    this.emit(p, { count: 34, speed: 5.2, spread: 2.1, up: 2.2, gravity: 5, size: 19, ttl: 0.85, color, spin: 5 });
  }
  exhaust(p: Vec3, strength = 0.5): void {
    this.emitSmoke(p, { count: 1, speed: 0.3, spread: 0.25, up: 0.35, gravity: -0.35, size: 14 + strength * 14, ttl: 0.8 + strength * 0.6, color: [0.55, 0.56, 0.6], grow: 2.4, drag: 1.8, spin: 1.5 });
  }
  /** Footstep / landing puff. `strength` 0..1+ scales the kick. */
  dust(p: Vec3, strength = 1): void {
    this.emitSmoke(p, {
      count: Math.round(3 + strength * 5),
      speed: 0.5 + strength * 0.9,
      spread: 0.6 + strength * 0.6,
      up: 0.2,
      gravity: -0.25,
      size: 15 + strength * 12,
      ttl: 0.55 + strength * 0.35,
      color: [0.56, 0.54, 0.5],
      grow: 1.8,
      drag: 3.2,
      spin: 2,
    });
  }
  /** Tyre smoke when the vehicle scrubs or slams a wall. */
  tyreSmoke(p: Vec3, strength = 1): void {
    this.emitSmoke(p, {
      count: Math.round(2 + strength * 4),
      speed: 0.7 * strength,
      spread: 0.7,
      up: 0.5,
      gravity: -0.4,
      size: 24,
      ttl: 1.2,
      color: [0.62, 0.6, 0.58],
      grow: 2.4,
      drag: 2.0,
      spin: 1.6,
    });
  }
  /** Debris + sparks from a hard impact. */
  impact(p: Vec3, strength = 1): void {
    this.emit(p, { count: Math.round(10 + strength * 16), speed: 3 + strength * 4, spread: 2, up: 1.2, gravity: 14, size: 12, ttl: 0.5, color: [1.0, 0.8, 0.45], spin: 8 });
    this.tyreSmoke(p, strength);
  }

  update(dt: number, dustVolume?: { x: number; y: number; z: number; r: number }): void {
    // ambient motes drifting in a volume (the light shafts near the door)
    if (dustVolume && this.budget > 0.4) {
      this.dustTimer += dt;
      while (this.dustTimer > 0.16) {
        this.dustTimer -= 0.16;
        this.sparkPool.emit(
          {
            x: dustVolume.x + (Math.random() - 0.5) * dustVolume.r * 2,
            y: dustVolume.y + (Math.random() - 0.5) * dustVolume.r,
            z: dustVolume.z + (Math.random() - 0.5) * dustVolume.r * 2,
          },
          { count: 1, speed: 0.04, spread: 0.12, up: 0.03, gravity: -0.015, size: 2.6, ttl: 3.0, color: [0.42, 0.44, 0.5] },
        );
      }
    }
    this.sparkPool.update(dt);
    this.smokePool.update(dt);
  }
}
