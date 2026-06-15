import * as THREE from 'three';
import {
  EffectComposer,
  RenderPass,
  EffectPass,
  BloomEffect,
  SMAAEffect,
  VignetteEffect,
  ToneMappingEffect,
  ToneMappingMode,
} from 'postprocessing';
import { N8AOPostPass } from 'n8ao';
import type { Quality } from '../settings';

// Wraps an EffectComposer (bloom + AO + SMAA + ACES tone mapping + vignette).
// Falls back to a plain renderer.render if construction fails (e.g. SwiftShader),
// so the game and the headless screenshot tool never hard-crash on weak GPUs.
export class Post {
  private composer: EffectComposer | null = null;
  enabled = false;

  constructor(
    private renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
    quality: Quality,
    enable = true,
  ) {
    if (!enable) {
      this.enabled = false;
      return;
    }
    try {
      const composer = new EffectComposer(renderer);
      composer.addPass(new RenderPass(scene, camera));

      if (quality !== 'low') {
        try {
          const ao = new N8AOPostPass(scene, camera);
          const cfg = ao.configuration;
          if (cfg) {
            cfg.aoRadius = 1.6;
            cfg.distanceFalloff = 1.0;
            cfg.intensity = 2.2;
          }
          // n8ao's pass is structurally a postprocessing Pass at runtime
          composer.addPass(ao as unknown as Parameters<typeof composer.addPass>[0]);
        } catch {
          /* AO optional */
        }
      }

      const bloom = new BloomEffect({
        intensity: quality === 'high' ? 0.42 : 0.3,
        luminanceThreshold: 0.9,
        luminanceSmoothing: 0.2,
        mipmapBlur: true,
      });
      const tone = new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC });
      const vignette = new VignetteEffect({ darkness: 0.42, offset: 0.32 });
      composer.addPass(new EffectPass(camera, new SMAAEffect(), bloom, tone, vignette));

      this.composer = composer;
      this.enabled = true;
      // tone mapping is now handled by the effect chain, not the renderer
      renderer.toneMapping = THREE.NoToneMapping;
    } catch (e) {
      console.warn('Post-processing unavailable, falling back to direct render:', e);
      this.composer = null;
      this.enabled = false;
    }
  }

  setSize(w: number, h: number): void {
    this.composer?.setSize(w, h);
  }

  render(dt: number, scene: THREE.Scene, camera: THREE.Camera): void {
    if (this.enabled && this.composer) this.composer.render(dt);
    else this.renderer.render(scene, camera);
  }
}
