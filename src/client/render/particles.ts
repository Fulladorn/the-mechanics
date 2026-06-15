import * as THREE from 'three';
import type { Vec3 } from '../../shared/math';
import { sparkTexture } from './textures';

interface EmitOpts {
  count: number;
  speed: number;
  spread: number; // sideways/vertical velocity spread
  up: number; // bias to initial upward velocity
  gravity: number;
  size: number;
  ttl: number;
  color: [number, number, number];
}

// Pooled GPU points with per-particle size/alpha/colour. One draw call.
export class Particles {
  private max = 600;
  private pos: Float32Array;
  private vel: Float32Array;
  private grav: Float32Array;
  private life: Float32Array;
  private ttl: Float32Array;
  private aSize: Float32Array;
  private aAlpha: Float32Array;
  private aColor: Float32Array;
  private geo: THREE.BufferGeometry;
  private head = 0;
  private dustTimer = 0;

  constructor(scene: THREE.Scene) {
    this.pos = new Float32Array(this.max * 3);
    this.vel = new Float32Array(this.max * 3);
    this.grav = new Float32Array(this.max);
    this.life = new Float32Array(this.max);
    this.ttl = new Float32Array(this.max);
    this.aSize = new Float32Array(this.max);
    this.aAlpha = new Float32Array(this.max);
    this.aColor = new Float32Array(this.max * 3);

    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('aSize', new THREE.BufferAttribute(this.aSize, 1));
    this.geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.aAlpha, 1));
    this.geo.setAttribute('aColor', new THREE.BufferAttribute(this.aColor, 3));
    this.geo.setDrawRange(0, this.max);

    const mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: sparkTexture() } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: `
        attribute float aSize; attribute float aAlpha; attribute vec3 aColor;
        varying float vAlpha; varying vec3 vColor;
        void main(){
          vAlpha = aAlpha; vColor = aColor;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * (320.0 / max(-mv.z, 0.1));
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform sampler2D map; varying float vAlpha; varying vec3 vColor;
        void main(){
          vec4 t = texture2D(map, gl_PointCoord);
          float a = t.a * vAlpha;
          if (a < 0.01) discard;
          gl_FragColor = vec4(t.rgb * vColor, a);
        }`,
    });

    const points = new THREE.Points(this.geo, mat);
    points.frustumCulled = false;
    scene.add(points);
  }

  emit(p: Vec3, o: EmitOpts): void {
    for (let n = 0; n < o.count; n++) {
      const i = this.head;
      this.head = (this.head + 1) % this.max;
      this.pos[i * 3] = p.x;
      this.pos[i * 3 + 1] = p.y;
      this.pos[i * 3 + 2] = p.z;
      this.vel[i * 3] = (Math.random() - 0.5) * o.spread;
      this.vel[i * 3 + 1] = o.up + (Math.random() - 0.5) * o.spread + Math.random() * o.speed;
      this.vel[i * 3 + 2] = (Math.random() - 0.5) * o.spread;
      // random hemisphere kick
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * o.speed;
      this.vel[i * 3] += Math.cos(a) * r;
      this.vel[i * 3 + 2] += Math.sin(a) * r;
      this.grav[i] = o.gravity;
      this.ttl[i] = o.ttl;
      this.life[i] = o.ttl;
      this.aSize[i] = o.size * (0.6 + Math.random() * 0.8);
      this.aColor[i * 3] = o.color[0];
      this.aColor[i * 3 + 1] = o.color[1];
      this.aColor[i * 3 + 2] = o.color[2];
    }
  }

  sparks(p: Vec3): void {
    this.emit(p, { count: 26, speed: 4.5, spread: 1.5, up: 1.5, gravity: 9, size: 18, ttl: 0.6, color: [1.0, 0.85, 0.5] });
  }
  sparkle(p: Vec3): void {
    this.emit(p, { count: 14, speed: 1.6, spread: 0.7, up: 1.2, gravity: 2, size: 14, ttl: 0.7, color: [1.0, 0.92, 0.6] });
  }
  burst(p: Vec3, color: [number, number, number]): void {
    this.emit(p, { count: 30, speed: 5, spread: 2, up: 2, gravity: 5, size: 20, ttl: 0.8, color });
  }
  exhaust(p: Vec3): void {
    this.emit(p, { count: 2, speed: 0.4, spread: 0.4, up: 0.8, gravity: -0.6, size: 22, ttl: 0.9, color: [0.5, 0.52, 0.55] });
  }

  update(dt: number, dustVolume?: { x: number; y: number; z: number; r: number }): void {
    // ambient dust motes drifting in a volume (e.g. light shafts near the door)
    if (dustVolume) {
      this.dustTimer += dt;
      while (this.dustTimer > 0.16) {
        this.dustTimer -= 0.16;
        this.emit(
          {
            x: dustVolume.x + (Math.random() - 0.5) * dustVolume.r * 2,
            y: dustVolume.y + (Math.random() - 0.5) * dustVolume.r,
            z: dustVolume.z + (Math.random() - 0.5) * dustVolume.r * 2,
          },
          { count: 1, speed: 0.04, spread: 0.12, up: 0.03, gravity: -0.015, size: 2.4, ttl: 2.6, color: [0.34, 0.36, 0.42] },
        );
      }
    }
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) {
        if (this.aAlpha[i] !== 0) this.aAlpha[i] = 0;
        continue;
      }
      this.life[i] -= dt;
      this.vel[i * 3 + 1] -= this.grav[i] * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      if (this.pos[i * 3 + 1] < 0.02) {
        this.pos[i * 3 + 1] = 0.02;
        this.vel[i * 3 + 1] *= -0.3;
      }
      this.aAlpha[i] = Math.max(0, this.life[i] / this.ttl[i]);
    }
    (this.geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.attributes.aSize as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.attributes.aAlpha as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.attributes.aColor as THREE.BufferAttribute).needsUpdate = true;
  }
}
