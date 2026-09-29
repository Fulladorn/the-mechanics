import * as THREE from 'three';

// The painterly material system. Every lit surface in the game goes through
// `styl()`, which is a stock MeshStandardMaterial (so shadows, IBL and three's
// lights keep working) patched with:
//
//   * wrap lighting   — light bends softly around forms instead of cutting to
//                       black at the terminator; shadowed sides pick up the
//                       violet sky fill, which is where the "painted" look
//                       comes from
//   * rim light       — a thin sky-coloured sheen on silhouettes so shapes
//                       read against busy backgrounds
//   * world noise     — a low-frequency tint wobble in world space, so no two
//                       square metres of the same material are identical
//   * atmosphere fog  — distance + height fog that glows toward the sun, shared
//                       with the sky so the horizon is seamless
//   * wind            — optional vertex sway for foliage
//
// All the environment knobs are shared uniform objects in `SU`, updated once a
// frame by the sky/time-of-day system.

export const SU = {
  uTime: { value: 0 },
  uSunDir: { value: new THREE.Vector3(0.3, 0.8, 0.2).normalize() },
  uFogColor: { value: new THREE.Color(0xb8c8dc) },
  uFogSun: { value: new THREE.Color(0xffd9a8) },
  uFogDensity: { value: 0.0022 },
  uFogHeight: { value: 0.018 },
  uFogBase: { value: 0 },
  uFogMax: { value: 0.96 },
  uRimColor: { value: new THREE.Color(0xcfe0ff) },
  uWrap: { value: 0.42 },
  uWind: { value: new THREE.Vector2(0.9, 0.4) },
  uWindStrength: { value: 1 },
};

export interface StylOpts {
  color?: number;
  rough?: number;
  metal?: number;
  emissive?: number;
  emissiveIntensity?: number;
  vertexColors?: boolean;
  /** World-noise tint amount (0..0.4). */
  noise?: number;
  /** Metres per noise cell. */
  noiseScale?: number;
  /** Rim sheen strength. */
  rim?: number;
  /** Foliage sway amplitude (per metre of height above the mesh origin). */
  wind?: number;
  map?: THREE.Texture;
  transparent?: boolean;
  opacity?: number;
  side?: THREE.Side;
  flat?: boolean;
  env?: number;
  alphaTest?: number;
  /** Skip the atmosphere (interiors, UI-ish meshes). */
  noFog?: boolean;
  /** Automotive clearcoat (MeshPhysicalMaterial). */
  clearcoat?: number;
  depthWrite?: boolean;
  polygonOffset?: number;
  /** Double-sided surfaces: multiply the colour of back faces (the inside of a canopy is shade). */
  backShade?: number;
  /** Dither this surface out when the camera is closer than this (metres), so you never see into it. */
  nearFade?: number;
  /** Only fade above this object-space height (keeps tree trunks solid). */
  fadeMinY?: number;
  /** Scale on specular (direct + environment). Matte ground and leaves want little. */
  spec?: number;
}

const NOISE_GLSL = /* glsl */ `
float stylHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float stylNoise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(stylHash(i), stylHash(i + vec2(1.0, 0.0)), u.x),
             mix(stylHash(i + vec2(0.0, 1.0)), stylHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
`;

export const FOG_PARS = /* glsl */ `
uniform vec3 uSunDir;
uniform vec3 uFogColor;
uniform vec3 uFogSun;
uniform float uFogDensity;
uniform float uFogHeight;
uniform float uFogBase;
uniform float uFogMax;
vec3 stylFog(vec3 col, vec3 wp) {
  vec3 fv = wp - cameraPosition;
  float fd = length(fv);
  float hf = exp(-max(wp.y - uFogBase, 0.0) * uFogHeight);
  float f = 1.0 - exp(-fd * uFogDensity * (0.3 + 0.7 * hf));
  f = clamp(f, 0.0, uFogMax);
  float sunA = pow(max(dot(fv / max(fd, 0.001), uSunDir), 0.0), 5.0);
  vec3 fc = mix(uFogColor, uFogSun, sunA);
  return mix(col, fc, f);
}
`;

const cache = new Map<string, THREE.Material>();

/**
 * Cached painterly material. Identical options return the same instance, so
 * never mutate the result (colour-changing things like car paint pass
 * `clearcoat`, which is never cached).
 */
export function styl(o: StylOpts = {}): THREE.MeshStandardMaterial {
  const cacheable = !o.map && o.clearcoat === undefined;
  const key = cacheable ? JSON.stringify(o) : '';
  if (cacheable) {
    const hit = cache.get(key);
    if (hit) return hit as THREE.MeshStandardMaterial;
  }

  const params: THREE.MeshPhysicalMaterialParameters = {
    color: o.color ?? 0xffffff,
    roughness: o.rough ?? 0.8,
    metalness: o.metal ?? 0,
    vertexColors: !!o.vertexColors,
    flatShading: !!o.flat,
    side: o.side ?? THREE.FrontSide,
    envMapIntensity: o.env ?? 0.6,
  };
  if (o.map) params.map = o.map;
  if (o.emissive !== undefined) {
    params.emissive = new THREE.Color(o.emissive);
    params.emissiveIntensity = o.emissiveIntensity ?? 1;
  }
  if (o.transparent) {
    params.transparent = true;
    params.opacity = o.opacity ?? 1;
  }
  if (o.alphaTest !== undefined) params.alphaTest = o.alphaTest;
  if (o.depthWrite !== undefined) params.depthWrite = o.depthWrite;
  if (o.clearcoat !== undefined) {
    params.clearcoat = o.clearcoat;
    params.clearcoatRoughness = 0.18;
  }

  const m: THREE.MeshStandardMaterial =
    o.clearcoat !== undefined ? new THREE.MeshPhysicalMaterial(params) : new THREE.MeshStandardMaterial(params);
  if (o.polygonOffset) {
    m.polygonOffset = true;
    m.polygonOffsetFactor = -o.polygonOffset;
    m.polygonOffsetUnits = -o.polygonOffset;
  }
  patch(m, o);
  if (cacheable) cache.set(key, m);
  return m;
}

function patch(m: THREE.Material, o: StylOpts): void {
  const noise = o.noise ?? 0.12;
  const noiseScale = o.noiseScale ?? 3;
  const rim = o.rim ?? 0.35;
  const wind = o.wind ?? 0;
  const fog = !o.noFog;
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = SU.uTime;
    shader.uniforms.uSunDir = SU.uSunDir;
    shader.uniforms.uFogColor = SU.uFogColor;
    shader.uniforms.uFogSun = SU.uFogSun;
    shader.uniforms.uFogDensity = SU.uFogDensity;
    shader.uniforms.uFogHeight = SU.uFogHeight;
    shader.uniforms.uFogBase = SU.uFogBase;
    shader.uniforms.uFogMax = SU.uFogMax;
    shader.uniforms.uRimColor = SU.uRimColor;
    shader.uniforms.uWrap = SU.uWrap;
    shader.uniforms.uWind = SU.uWind;
    shader.uniforms.uWindStrength = SU.uWindStrength;
    shader.uniforms.uNoiseAmt = { value: noise };
    shader.uniforms.uNoiseScale = { value: 1 / noiseScale };
    shader.uniforms.uRim = { value: rim };
    shader.uniforms.uWindAmp = { value: wind };
    shader.uniforms.uBackShade = { value: o.backShade ?? 1 };
    shader.uniforms.uFadeMinY = { value: o.fadeMinY ?? -1e4 };
    shader.uniforms.uSpec = { value: o.spec ?? 1 };
    shader.uniforms.uNearFade = { value: o.nearFade ?? 0 };

    let vs = shader.vertexShader;
    vs = vs.replace(
      '#include <common>',
      `#include <common>
varying vec3 vStylWorld;
varying float vStylLocalY;
uniform float uTime;
uniform vec2 uWind;
uniform float uWindStrength;
uniform float uWindAmp;`,
    );
    if (wind > 0) {
      vs = vs.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
{
  vec4 wo = vec4(0.0, 0.0, 0.0, 1.0);
  #ifdef USE_INSTANCING
    wo = instanceMatrix * wo;
  #endif
  wo = modelMatrix * wo;
  float h = max(position.y, 0.0);
  float ph = dot(wo.xz, vec2(0.21, 0.17)) + uTime * 1.35;
  float gust = 0.6 + 0.4 * sin(uTime * 0.37 + wo.x * 0.013 + wo.z * 0.011);
  float sway = (sin(ph) * 0.7 + sin(ph * 2.3 + 1.7) * 0.3) * gust * uWindStrength;
  transformed.x += uWind.x * sway * h * uWindAmp;
  transformed.z += uWind.y * sway * h * uWindAmp;
}`,
      );
    }
    vs = vs.replace(
      '#include <worldpos_vertex>',
      `#include <worldpos_vertex>
{
  vec4 swp = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
    swp = instanceMatrix * swp;
  #endif
  vStylWorld = (modelMatrix * swp).xyz;
  vStylLocalY = position.y;
}`,
    );
    shader.vertexShader = vs;

    let fs = shader.fragmentShader;
    fs = fs.replace(
      '#include <common>',
      `#include <common>
varying vec3 vStylWorld;
varying float vStylLocalY;
uniform float uFadeMinY;
uniform float uSpec;
uniform vec3 uRimColor;
uniform float uWrap;
uniform float uNoiseAmt;
uniform float uNoiseScale;
uniform float uRim;
uniform float uBackShade;
uniform float uNearFade;
${NOISE_GLSL}
float stylBayer(vec2 p) {
  // 4x4 ordered dither threshold in (0,1)
  ivec2 q = ivec2(mod(p, 4.0));
  int i = q.x + q.y * 4;
  int m[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5);
  return (float(m[i]) + 0.5) / 16.0;
}
${FOG_PARS}`,
    );
    fs = fs.replace(
      '#include <color_fragment>',
      `#include <color_fragment>
if (uNearFade > 0.0 && vStylLocalY > uFadeMinY) {
  float camD = distance(vStylWorld, cameraPosition);
  if (smoothstep(uNearFade * 0.55, uNearFade, camD) < stylBayer(gl_FragCoord.xy)) discard;
}
{
  vec2 np = vStylWorld.xz * uNoiseScale + vStylWorld.y * 0.13;
  float n = stylNoise(np) * 0.65 + stylNoise(np * 2.7 + 11.3) * 0.35;
  diffuseColor.rgb *= 1.0 + (n - 0.5) * 2.0 * uNoiseAmt;
}`,
    );
    // Wrap lighting: the light wraps a little way past the terminator and the
    // falloff is eased, giving soft painted form shading.
    fs = fs.replace(
      '#include <lights_physical_pars_fragment>',
      THREE.ShaderChunk.lights_physical_pars_fragment.replace(
        'float dotNL = saturate( dot( geometryNormal, directLight.direction ) );\n\n\tvec3 irradiance = dotNL * directLight.color;',
        `float rawNL = dot( geometryNormal, directLight.direction );
	float dotNL = saturate( rawNL );
	float wrapNL = saturate( ( rawNL + uWrap ) / ( 1.0 + uWrap ) );
	wrapNL = wrapNL * wrapNL * ( 3.0 - 2.0 * wrapNL );
	vec3 irradiance = wrapNL * directLight.color;`,
        )
        // Specular takes the true N.L (wrap is a diffuse trick: wrapped
        // specular paints a grazing white sheen on faces turned away).
        .replace(
          'reflectedLight.directSpecular += irradiance * BRDF_GGX( directLight.direction, geometryViewDir, geometryNormal, material );',
          'reflectedLight.directSpecular += dotNL * directLight.color * BRDF_GGX( directLight.direction, geometryViewDir, geometryNormal, material ) * uSpec;',
        )
        .replace('reflectedLight.indirectSpecular += radiance * singleScattering;', 'reflectedLight.indirectSpecular += radiance * singleScattering * uSpec;')
        .replace('reflectedLight.indirectSpecular += multiScattering * cosineWeightedIrradiance;', 'reflectedLight.indirectSpecular += multiScattering * cosineWeightedIrradiance * uSpec;'),
    );
    fs = fs.replace(
      '#include <opaque_fragment>',
      `{
  float rimF = 1.0 - saturate( dot( normal, normalize( vViewPosition ) ) );
  rimF = rimF * rimF * rimF;
  // The sheen is sky light: it catches surfaces that face up, never the
  // undersides (a pale rim on the bottom of a bough reads as a hole).
  rimF *= smoothstep( -0.25, 0.45, inverseTransformDirection( normal, viewMatrix ).y );
#ifdef DOUBLE_SIDED
  if (!gl_FrontFacing) {
    // Undersides and interiors: no sheen, no sky reflection. Keep the light's
    // brightness but take the surface's own hue, then sink it into shade.
    float lum = dot( outgoingLight, vec3( 0.3, 0.59, 0.11 ) );
    float base = max( dot( diffuseColor.rgb, vec3( 0.3, 0.59, 0.11 ) ), 0.04 );
    outgoingLight = min( diffuseColor.rgb * ( lum / base ), diffuseColor.rgb * 1.1 ) * uBackShade;
    rimF = 0.0;
  }
#endif
  outgoingLight += uRimColor * rimF * uRim * ( 0.35 + 0.65 * diffuseColor.rgb );
}
#include <opaque_fragment>`,
    );
    if (fog) {
      fs = fs.replace('#include <fog_fragment>', `gl_FragColor.rgb = stylFog( gl_FragColor.rgb, vStylWorld );`);
    }
    shader.fragmentShader = fs;
  };
  m.customProgramCacheKey = () => `styl:${wind > 0 ? 1 : 0}:${fog ? 1 : 0}`;
}

/** Apply the atmosphere to a custom ShaderMaterial's fragment (sky-matched fog). */
export function fogUniforms(): Record<string, THREE.IUniform> {
  return {
    uSunDir: SU.uSunDir,
    uFogColor: SU.uFogColor,
    uFogSun: SU.uFogSun,
    uFogDensity: SU.uFogDensity,
    uFogHeight: SU.uFogHeight,
    uFogBase: SU.uFogBase,
    uFogMax: SU.uFogMax,
  };
}

// --- a small palette of named materials ------------------------------------

export const MAT = {
  paint: (color: number, rough = 0.55) => styl({ color, rough, metal: 0.1, noise: 0.08 }),
  metal: (color = 0xa9b1bd, rough = 0.38) => styl({ color, rough, metal: 0.85, noise: 0.06, env: 1 }),
  darkMetal: (color = 0x363b45) => styl({ color, rough: 0.5, metal: 0.7, noise: 0.08, env: 0.8 }),
  chrome: () => styl({ color: 0xe6ebf2, rough: 0.14, metal: 1, noise: 0.02, env: 1.4, rim: 0.2 }),
  rubber: (color = 0x24262b) => styl({ color, rough: 0.92, noise: 0.05, rim: 0.25 }),
  plastic: (color: number) => styl({ color, rough: 0.5, noise: 0.05 }),
  wood: (color = 0x9a6a3f) => styl({ color, rough: 0.85, noise: 0.22, noiseScale: 0.6 }),
  fabric: (color: number) => styl({ color, rough: 0.95, noise: 0.1, noiseScale: 0.4 }),
  concrete: (color = 0xb9b4aa) => styl({ color, rough: 0.92, noise: 0.18, noiseScale: 1.6 }),
  glow: (color: number, intensity = 2) => styl({ color, emissive: color, emissiveIntensity: intensity, rough: 0.5, noise: 0, rim: 0 }),
  glass: (tint = 0x9cc3de, opacity = 0.45) =>
    styl({ color: tint, rough: 0.06, metal: 0.2, transparent: true, opacity, env: 1.6, noise: 0, rim: 0.6, depthWrite: false }),
};

/** Car paint (not cached: each body owns its colour). */
export function carPaint(color: number): THREE.MeshPhysicalMaterial {
  return styl({ color, rough: 0.34, metal: 0.15, clearcoat: 0.8, noise: 0.04, rim: 0.3, env: 0.9 }) as THREE.MeshPhysicalMaterial;
}
