import * as THREE from 'three';
import {
  BloomEffect,
  BrightnessContrastEffect,
  ChromaticAberrationEffect,
  EffectComposer,
  EffectPass,
  GodRaysEffect,
  HueSaturationEffect,
  NoiseEffect,
  RenderPass,
  SMAAEffect,
  ToneMappingEffect,
  ToneMappingMode,
  VignetteEffect,
  BlendFunction,
} from 'postprocessing';
import { N8AOPostPass } from 'n8ao';
import type { Quality } from '../settings';
import { sunTexture } from './textures';

// Effect chain: AO → god rays → (SMAA, bloom, grade, grain, CA, tone, vignette).
// Falls back to a plain renderer.render if construction fails (SwiftShader, weak
// GPUs) so the game and the headless harness never hard-crash.

export class Post {
  private composer: EffectComposer | null = null;
  private ca?: ChromaticAberrationEffect;
  private grade?: BrightnessContrastEffect;
  private sunSprite?: THREE.Mesh;
  enabled = false;

  constructor(
    private renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
    quality: Quality,
    enable = true,
    sun?: THREE.DirectionalLight,
  ) {
    if (!enable) {
      this.enabled = false;
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
          if (cfg) {
            // The old settings (radius 1.6 / intensity 2.2) crushed every
            // contact into a black smear. Tighter and much gentler.
            cfg.aoRadius = 0.9;
            cfg.distanceFalloff = 0.6;
            cfg.intensity = 1.25;
            cfg.halfRes = quality === 'med';
          }
          composer.addPass(ao as unknown as Parameters<typeof composer.addPass>[0]);
        } catch {
          /* AO optional */
        }
      }

      const effects: ConstructorParameters<typeof EffectPass>[1][] = [];

      // God rays need a physical sun proxy in the scene to occlude against.
      if (sun && quality === 'high') {
        try {
          // A soft radial billboard, not a hard sphere — a solid disc in the
          // sky reads as a bug, not as the sun.
          const sprite = new THREE.Mesh(
            new THREE.PlaneGeometry(150, 150),
            new THREE.MeshBasicMaterial({
              map: sunTexture(),
              color: 0xfff3d8,
              transparent: true,
              depthWrite: false,
              blending: THREE.AdditiveBlending,
              fog: false,
            }),
          );
          sprite.frustumCulled = false;
          sprite.renderOrder = -900;
          scene.add(sprite);
          this.sunSprite = sprite;
          const god = new GodRaysEffect(camera, sprite, {
            density: 0.86,
            decay: 0.92,
            weight: 0.32,
            exposure: 0.5,
            samples: 48,
            blur: true,
          });
          effects.push(god);
        } catch {
          /* god rays optional */
        }
      }

      effects.push(new SMAAEffect());
      effects.push(
        new BloomEffect({
          intensity: quality === 'high' ? 0.36 : 0.26,
          // A low threshold made the whole shop bloom into a white haze; only
          // genuinely bright things (lamps, sky, sparks) should glow.
          luminanceThreshold: 0.88,
          luminanceSmoothing: 0.25,
          mipmapBlur: true,
        }),
      );
      // Grade: a touch of saturation and contrast is what makes the stylized
      // palette pop instead of reading as washed-out grey.
      effects.push(new HueSaturationEffect({ saturation: 0.16 }));
      // The renderer's toneMappingExposure is bypassed once the composer owns
      // tone mapping, so the brightness setting rides on this effect instead.
      this.grade = new BrightnessContrastEffect({ brightness: 0.01, contrast: 0.1 });
      effects.push(this.grade);
      effects.push(new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC }));
      if (quality !== 'low') {
        // Fine grain doubles as dithering, which kills gradient banding in the
        // sky and in the big flat fog falloffs.
        effects.push(new NoiseEffect({ blendFunction: BlendFunction.OVERLAY, premultiply: true }));
        const noise = effects[effects.length - 1] as NoiseEffect;
        noise.blendMode.opacity.value = 0.055;
      }
      this.ca = new ChromaticAberrationEffect({ offset: new THREE.Vector2(0, 0), radialModulation: true, modulationOffset: 0.4 });
      effects.push(this.ca);
      effects.push(new VignetteEffect({ darkness: 0.38, offset: 0.34 }));

      composer.addPass(new EffectPass(camera, ...(effects as never[])));

      this.composer = composer;
      this.enabled = true;
      // tone mapping is handled by the effect chain, not the renderer
      renderer.toneMapping = THREE.NoToneMapping;
    } catch (e) {
      console.warn('Post-processing unavailable, falling back to direct render:', e);
      this.composer = null;
      this.enabled = false;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
    }
  }

  /** Park the god-ray sun proxy along the sun direction, behind everything. */
  positionSun(camera: THREE.Camera, sunDir: THREE.Vector3): void {
    if (!this.sunSprite) return;
    this.sunSprite.position.copy(camera.position).addScaledVector(sunDir, 700);
    this.sunSprite.quaternion.copy(camera.quaternion); // billboard
  }

  /** Exposure from the brightness setting (1 = neutral). */
  setExposure(v: number): void {
    if (this.grade) this.grade.brightness = 0.01 + (v - 1) * 0.45;
    else this.renderer.toneMappingExposure = v;
  }

  /** Speed-driven lens distortion (0 = still, 1 = flat out). */
  setSpeedFx(t: number): void {
    if (!this.ca) return;
    const k = THREE.MathUtils.clamp(t, 0, 1) ** 2 * 0.0018;
    this.ca.offset.set(k, k * 0.6);
  }

  setSize(w: number, h: number): void {
    this.composer?.setSize(w, h);
  }

  render(dt: number, scene: THREE.Scene, camera: THREE.Camera): void {
    if (this.enabled && this.composer) this.composer.render(dt);
    else this.renderer.render(scene, camera);
  }
}
