import * as THREE from 'three';
import {
  BlendFunction,
  BloomEffect,
  Effect,
  EffectComposer,
  EffectPass,
  NoiseEffect,
  RenderPass,
  SMAAEffect,
  ToneMappingEffect,
  ToneMappingMode,
  VignetteEffect,
} from 'postprocessing';
import { N8AOPostPass } from 'n8ao';
import type { Quality } from '../settings';

// AO → bloom → painterly grade → ACES → vignette → grain. The grade is the
// "look": a little extra saturation, shadows pushed cool, highlights warm.
// Falls back to a plain render if anything fails (software GL, weak GPUs).

const GRADE_FS = /* glsl */ `
uniform float uExposure;
uniform float uSat;
uniform vec3 uShadowTint;
uniform vec3 uHighTint;
uniform float uSplit;
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec3 c = inputColor.rgb * uExposure;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = max(mix(vec3(l), c, uSat), 0.0);
  float sh = 1.0 - smoothstep(0.0, 0.45, l);
  float hi = smoothstep(0.35, 1.6, l);
  c = mix(c, c * uShadowTint, sh * uSplit);
  c = mix(c, c * uHighTint, hi * uSplit);
  outputColor = vec4(c, inputColor.a);
}`;

class GradeEffect extends Effect {
  constructor() {
    super('Grade', GRADE_FS, {
      uniforms: new Map<string, THREE.Uniform>([
        ['uExposure', new THREE.Uniform(1)],
        ['uSat', new THREE.Uniform(1.12)],
        ['uShadowTint', new THREE.Uniform(new THREE.Color(0.9, 0.95, 1.12))],
        ['uHighTint', new THREE.Uniform(new THREE.Color(1.06, 1.0, 0.92))],
        ['uSplit', new THREE.Uniform(0.55)],
      ]),
    });
  }
  set exposure(v: number) {
    this.uniforms.get('uExposure')!.value = v;
  }
}

export class Post {
  private composer: EffectComposer | null = null;
  private grade?: GradeEffect;
  private ao?: N8AOPostPass;
  enabled = false;

  constructor(
    private renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
    quality: Quality,
    enable: boolean,
  ) {
    if (!enable) {
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      return;
    }
    try {
      const composer = new EffectComposer(renderer, { frameBufferType: THREE.HalfFloatType });
      composer.addPass(new RenderPass(scene, camera));
      if (quality !== 'low') {
        try {
          const ao = new N8AOPostPass(scene, camera);
          const cfg = ao.configuration;
          cfg.aoRadius = 1.2;
          cfg.distanceFalloff = 0.8;
          cfg.intensity = 1.6;
          cfg.halfRes = false;
          composer.addPass(ao as unknown as Parameters<typeof composer.addPass>[0]);
          this.ao = ao;
        } catch {
          /* AO is optional */
        }
      }
      this.grade = new GradeEffect();
      const effects: Effect[] = [
        new SMAAEffect(),
        new BloomEffect({ intensity: 0.5, luminanceThreshold: 0.82, luminanceSmoothing: 0.3, mipmapBlur: true, radius: 0.7 }),
        this.grade,
        new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC }),
        new VignetteEffect({ darkness: 0.42, offset: 0.3 }),
      ];
      if (quality !== 'low') {
        const n = new NoiseEffect({ blendFunction: BlendFunction.OVERLAY, premultiply: true });
        n.blendMode.opacity.value = 0.045;
        effects.push(n);
      }
      composer.addPass(new EffectPass(camera, ...effects));
      this.composer = composer;
      this.enabled = true;
      renderer.toneMapping = THREE.NoToneMapping;
    } catch (e) {
      console.warn('post-processing unavailable:', e);
      this.composer = null;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
    }
  }

  setExposure(v: number): void {
    if (this.grade) this.grade.exposure = v;
    this.renderer.toneMappingExposure = v;
  }

  setSize(w: number, h: number): void {
    this.composer?.setSize(w, h);
  }

  render(dt: number, scene: THREE.Scene, camera: THREE.Camera): void {
    if (this.composer) this.composer.render(dt);
    else this.renderer.render(scene, camera);
  }

  dispose(): void {
    this.composer?.dispose();
  }
}
