import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';

// Sky, sun and shadow rig.
//
// Replaces the old gradient-sphere + fixed 80 m shadow box. Two things matter:
//   * The environment map is generated *from the sky*, so metals and car
//     clearcoat reflect the actual sky the player is standing under.
//   * The sun's shadow camera follows the player in a tight box, so a 2048 map
//     covers ~36 m instead of ~80 m — roughly 5x the effective shadow detail.

export interface SkyPreset {
  /** Sun elevation in degrees above the horizon. */
  elevation: number;
  /** Sun compass azimuth in degrees. */
  azimuth: number;
  turbidity: number;
  rayleigh: number;
  mieCoefficient: number;
  mieDirectionalG: number;
  /** Directional light colour + intensity. */
  sunColor: number;
  sunIntensity: number;
  /** Hemisphere bounce. */
  skyColor: number;
  groundColor: number;
  hemiIntensity: number;
  /** Scene fog. */
  fogColor: number;
  fogNear: number;
  fogFar: number;
  /** Multiplier on the PMREM environment contribution. */
  envIntensity: number;
}

export const SKY_PRESETS: Record<string, SkyPreset> = {
  /** Late-morning summer light — warm, bright, high contrast. */
  summerDay: {
    // Sun high and off to the right of the yard, so looking out of the garage
    // you get a lit scene and a sky worth looking at rather than the flat,
    // washed-out anti-solar side.
    elevation: 40,
    azimuth: 58,
    turbidity: 3.0,
    rayleigh: 2.3,
    mieCoefficient: 0.005,
    mieDirectionalG: 0.82,
    sunColor: 0xfff0d4,
    sunIntensity: 2.2,
    skyColor: 0xa9c6ea,
    groundColor: 0x514c3d,
    hemiIntensity: 0.5,
    fogColor: 0xa9c0da,
    fogNear: 60,
    fogFar: 330,
    envIntensity: 0.7,
  },
  /** Golden hour on the mountain — long shadows, amber key. */
  goldenHour: {
    elevation: 11,
    azimuth: 205,
    turbidity: 6.5,
    rayleigh: 2.6,
    mieCoefficient: 0.009,
    mieDirectionalG: 0.88,
    sunColor: 0xffd9a0,
    sunIntensity: 2.6,
    skyColor: 0xb4cfe8,
    groundColor: 0x5f5137,
    hemiIntensity: 0.42,
    fogColor: 0xd8c0a2,
    fogNear: 60,
    fogFar: 460,
    envIntensity: 1.0,
  },
};

export class SkyRig {
  sky: Sky;
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  /** World-space sun direction (unit, pointing *towards* the sun). */
  sunDir = new THREE.Vector3();
  private pmrem: THREE.PMREMGenerator;
  private envRT?: THREE.WebGLRenderTarget;
  private shadowSpan: number;

  constructor(
    private scene: THREE.Scene,
    private renderer: THREE.WebGLRenderer,
    preset: SkyPreset,
    opts: { shadowMapSize?: number; shadowSpan?: number } = {},
  ) {
    this.shadowSpan = opts.shadowSpan ?? 18;

    this.sky = new Sky();
    this.sky.scale.setScalar(12000);
    // The sky is a backdrop: never fogged, never shadowed, always behind.
    (this.sky.material as THREE.ShaderMaterial).depthWrite = false;
    this.sky.renderOrder = -1000;
    scene.add(this.sky);

    this.hemi = new THREE.HemisphereLight(preset.skyColor, preset.groundColor, preset.hemiIntensity);
    scene.add(this.hemi);

    this.sun = new THREE.DirectionalLight(preset.sunColor, preset.sunIntensity);
    this.sun.castShadow = true;
    const size = opts.shadowMapSize ?? 2048;
    this.sun.shadow.mapSize.set(size, size);
    this.sun.shadow.camera.near = 0.5;
    this.sun.shadow.camera.far = 120;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.035;
    scene.add(this.sun, this.sun.target);

    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.pmrem.compileEquirectangularShader();

    this.apply(preset);
  }

  apply(p: SkyPreset): void {
    const u = (this.sky.material as THREE.ShaderMaterial).uniforms;
    u.turbidity.value = p.turbidity;
    u.rayleigh.value = p.rayleigh;
    u.mieCoefficient.value = p.mieCoefficient;
    u.mieDirectionalG.value = p.mieDirectionalG;

    const phi = THREE.MathUtils.degToRad(90 - p.elevation);
    const theta = THREE.MathUtils.degToRad(p.azimuth);
    this.sunDir.setFromSphericalCoords(1, phi, theta);
    u.sunPosition.value.copy(this.sunDir);

    this.sun.color.setHex(p.sunColor);
    this.sun.intensity = p.sunIntensity;
    this.hemi.color.setHex(p.skyColor);
    this.hemi.groundColor.setHex(p.groundColor);
    this.hemi.intensity = p.hemiIntensity;

    this.scene.fog = new THREE.Fog(p.fogColor, p.fogNear, p.fogFar);
    this.scene.background = new THREE.Color(p.fogColor);

    this.refreshEnvironment(p.envIntensity);
    this.setShadowSpan(this.shadowSpan);
  }

  /** Re-bake the IBL probe from the current sky. */
  refreshEnvironment(intensity = 1): void {
    try {
      this.envRT?.dispose();
      this.envRT = this.pmrem.fromScene(this.sky as unknown as THREE.Scene);
      this.scene.environment = this.envRT.texture;
      this.scene.environmentIntensity = intensity;
    } catch {
      /* IBL is a nicety — a weak GPU still gets direct + hemisphere light */
    }
  }

  setShadowSpan(span: number): void {
    this.shadowSpan = span;
    const c = this.sun.shadow.camera;
    c.left = -span;
    c.right = span;
    c.top = span;
    c.bottom = -span;
    c.updateProjectionMatrix();
  }

  /**
   * Keep the shadow frustum centred on the player. Snapped to texel-sized steps
   * so the shadow map doesn't shimmer as the camera moves.
   */
  follow(target: THREE.Vector3): void {
    const texel = (this.shadowSpan * 2) / this.sun.shadow.mapSize.x;
    const snap = (v: number) => Math.round(v / texel) * texel;
    const cx = snap(target.x);
    const cz = snap(target.z);
    this.sun.target.position.set(cx, 0, cz);
    this.sun.position.set(cx + this.sunDir.x * 60, this.sunDir.y * 60, cz + this.sunDir.z * 60);
    this.sun.target.updateMatrixWorld();
    this.sun.updateMatrixWorld();
  }

  dispose(): void {
    this.envRT?.dispose();
    this.pmrem.dispose();
  }
}

/**
 * A soft light shaft — an additive, view-independent cone that fakes a
 * volumetric beam under a lamp or through a doorway. Cheap and reads well in a
 * dusty workshop.
 */
export function lightShaft(
  topRadius: number,
  bottomRadius: number,
  height: number,
  color = 0xffe9c0,
  opacity = 0.055,
): THREE.Mesh {
  const geo = new THREE.CylinderGeometry(topRadius, bottomRadius, height, 20, 1, true);
  // Fade out towards the floor so the beam dissolves instead of ending flat.
  const pos = geo.attributes.position;
  const alpha = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    alpha[i] = THREE.MathUtils.clamp((y + height / 2) / height, 0, 1) ** 1.6;
  }
  geo.setAttribute('aFade', new THREE.BufferAttribute(alpha, 1));

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uOpacity: { value: opacity },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    fog: false,
    vertexShader: `
      attribute float aFade;
      varying float vFade;
      varying vec3 vView;
      void main() {
        vFade = aFade;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vView = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uOpacity;
      varying float vFade;
      varying vec3 vView;
      void main() {
        // Softer at grazing angles so the cone has no hard silhouette.
        float rim = smoothstep(0.0, 0.7, abs(vView.z));
        gl_FragColor = vec4(uColor, uOpacity * vFade * rim);
      }`,
  });

  const m = new THREE.Mesh(geo, mat);
  m.frustumCulled = false;
  return m;
}
