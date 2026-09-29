import * as THREE from 'three';

// Two overlays that never touch the (shared, cached) materials of the thing
// they decorate:
//   * Focus glow — the meshes under the crosshair are redrawn with an additive
//     fresnel rim, so you always know exactly what E / LMB will act on.
//   * Ghosts     — a translucent hologram of the part you're carrying, sitting
//     in the slot it fits, pulsing. Green when it can go in, amber when
//     something's in the way.

const rimVS = /* glsl */ `
varying vec3 vN; varying vec3 vV;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal);
  vV = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;

function rimMaterial(color: THREE.Color, base: number, power: number, opacity: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: color }, uBase: { value: base }, uPow: { value: power }, uOpacity: { value: opacity }, uPulse: { value: 0 } },
    vertexShader: rimVS,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uBase; uniform float uPow; uniform float uOpacity; uniform float uPulse;
      varying vec3 vN; varying vec3 vV;
      void main() {
        float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), uPow);
        float a = (uBase + f) * uOpacity * (0.75 + 0.25 * uPulse);
        gl_FragColor = vec4(uColor * (0.6 + f), a);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
}

export class Highlight {
  private focusGroup = new THREE.Group();
  private focusMat = rimMaterial(new THREE.Color(0xffe6a8), 0.12, 2.0, 0.85);
  private disabledMat = rimMaterial(new THREE.Color(0xff9a7a), 0.05, 2.5, 0.55);
  private pairs: { src: THREE.Mesh; copy: THREE.Mesh }[] = [];
  private target: THREE.Object3D | null = null;
  private ghostMat = rimMaterial(new THREE.Color(0x6ff0c8), 0.28, 1.6, 0.9);
  private ghostWarn = rimMaterial(new THREE.Color(0xffc15a), 0.22, 1.6, 0.8);
  private ghosts = new Map<string, THREE.Object3D>();
  private t = 0;

  constructor(scene: THREE.Scene) {
    this.focusGroup.renderOrder = 10;
    scene.add(this.focusGroup);
  }

  /** Point the glow at an object (or nothing). */
  focus(obj: THREE.Object3D | null, disabled: boolean): void {
    const mat = disabled ? this.disabledMat : this.focusMat;
    if (obj === this.target) {
      for (const p of this.pairs) p.copy.material = mat;
      return;
    }
    this.target = obj;
    this.focusGroup.clear();
    this.pairs = [];
    if (!obj) return;
    obj.traverse((o) => {
      if (!(o instanceof THREE.Mesh) || !o.visible) return;
      const m = o.material as THREE.Material;
      if (m.transparent && (m as THREE.MeshStandardMaterial).opacity === 0) return;
      const copy = new THREE.Mesh(o.geometry, mat);
      copy.matrixAutoUpdate = false;
      copy.renderOrder = 10;
      this.focusGroup.add(copy);
      this.pairs.push({ src: o, copy });
    });
  }

  /** A hologram of `model` at a world matrix, keyed so it persists. */
  ghost(key: string, model: () => THREE.Object3D, world: THREE.Matrix4, ok: boolean, parent: THREE.Object3D): void {
    let g = this.ghosts.get(key);
    if (!g) {
      g = model();
      g.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.castShadow = false;
          o.receiveShadow = false;
        }
      });
      g.userData.used = true;
      parent.add(g);
      this.ghosts.set(key, g);
    }
    const mat = ok ? this.ghostMat : this.ghostWarn;
    g.traverse((o) => {
      if (o instanceof THREE.Mesh) o.material = mat;
    });
    g.matrixAutoUpdate = false;
    g.matrix.copy(world);
    g.matrixWorldNeedsUpdate = true;
    g.visible = true;
    g.userData.used = true;
  }

  /** Call once per frame after all ghost() calls: hides stale ghosts, animates. */
  update(dt: number): void {
    this.t += dt;
    const pulse = 0.5 + 0.5 * Math.sin(this.t * 5);
    for (const m of [this.focusMat, this.disabledMat, this.ghostMat, this.ghostWarn]) m.uniforms.uPulse.value = pulse;
    for (const p of this.pairs) {
      p.src.updateWorldMatrix(true, false);
      p.copy.matrix.copy(p.src.matrixWorld);
      p.copy.visible = p.src.visible;
    }
    for (const [k, g] of this.ghosts) {
      if (!g.userData.used) {
        g.parent?.remove(g);
        this.ghosts.delete(k);
      } else g.userData.used = false;
    }
  }
}
