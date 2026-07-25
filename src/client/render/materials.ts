import * as THREE from 'three';
import {
  concreteRoughness,
  concreteTexture,
  floorNormalTexture,
  panelRoughness,
  panelTexture,
  steelRoughness,
  groundMacroTexture,
  groundTexture,
  steelTexture,
  treadNormal,
  treadTexture,
  wallNormalTexture,
  woodTexture,
} from './textures';

// Shared material library. Previously every prop allocated its own
// MeshStandardMaterial, which meant hundreds of unique materials (hundreds of
// shader binds) and no consistency between props. Everything now goes through
// `paint()` / the named presets, which cache by parameter signature.

const cache = new Map<string, THREE.Material>();

/** Textures are lazily built: generating them all up front stalls the boot. */
function lazy<T>(make: () => T): () => T {
  let v: T | undefined;
  return () => (v ??= make());
}

const tex = {
  concrete: lazy(concreteTexture),
  concreteRough: lazy(concreteRoughness),
  floorNormal: lazy(floorNormalTexture),
  panel: lazy(() => panelTexture()),
  panelRough: lazy(panelRoughness),
  wallNormal: lazy(wallNormalTexture),
  steel: lazy(() => steelTexture()),
  steelRough: lazy(steelRoughness),
  ground: lazy(() => groundTexture()),
  groundMacro: lazy(groundMacroTexture),
  wood: lazy(() => woodTexture()),
  tread: lazy(treadTexture),
  treadNormal: lazy(treadNormal),
};

export interface PaintOpts {
  color?: number;
  metalness?: number;
  roughness?: number;
  emissive?: number;
  emissiveIntensity?: number;
  /** Named texture set applied as map/normal/roughness. */
  surface?: 'none' | 'steel' | 'panel' | 'concrete' | 'wood' | 'tread' | 'ground';
  /** UV repeat for the surface maps. */
  repeat?: [number, number];
  transparent?: boolean;
  opacity?: number;
  side?: THREE.Side;
  flatShading?: boolean;
}

/** A cloned, independently-repeatable copy of a shared texture. */
function repeated(t: THREE.Texture, r?: [number, number]): THREE.Texture {
  if (!r || (r[0] === 1 && r[1] === 1)) return t;
  const c = t.clone();
  c.needsUpdate = true;
  c.wrapS = c.wrapT = THREE.RepeatWrapping;
  c.repeat.set(r[0], r[1]);
  return c;
}

/**
 * Cached MeshStandardMaterial. Identical options always return the *same*
 * instance — never mutate the result; call `paint()` again with new options.
 */
export function paint(o: PaintOpts = {}): THREE.MeshStandardMaterial {
  const key = JSON.stringify(o);
  const hit = cache.get(key);
  if (hit) return hit as THREE.MeshStandardMaterial;

  const p: THREE.MeshStandardMaterialParameters = {
    color: o.color ?? 0xffffff,
    metalness: o.metalness ?? 0.15,
    roughness: o.roughness ?? 0.7,
    flatShading: o.flatShading ?? false,
  };
  if (o.emissive !== undefined) {
    p.emissive = new THREE.Color(o.emissive);
    p.emissiveIntensity = o.emissiveIntensity ?? 1;
  }
  if (o.transparent) {
    p.transparent = true;
    p.opacity = o.opacity ?? 1;
  }
  if (o.side !== undefined) p.side = o.side;

  switch (o.surface) {
    case 'steel':
      p.map = repeated(tex.steel(), o.repeat);
      p.roughnessMap = repeated(tex.steelRough(), o.repeat);
      break;
    case 'panel':
      p.map = repeated(tex.panel(), o.repeat);
      p.roughnessMap = repeated(tex.panelRough(), o.repeat);
      p.normalMap = repeated(tex.wallNormal(), o.repeat);
      p.normalScale = new THREE.Vector2(0.5, 0.5);
      break;
    case 'concrete':
      p.map = repeated(tex.concrete(), o.repeat);
      p.roughnessMap = repeated(tex.concreteRough(), o.repeat);
      p.normalMap = repeated(tex.floorNormal(), o.repeat);
      p.normalScale = new THREE.Vector2(0.45, 0.45);
      break;
    case 'wood':
      p.map = repeated(tex.wood(), o.repeat);
      break;
    case 'tread':
      p.map = repeated(tex.tread(), o.repeat);
      p.normalMap = repeated(tex.treadNormal(), o.repeat);
      p.normalScale = new THREE.Vector2(1.1, 1.1);
      break;
    case 'ground':
      p.map = repeated(tex.ground(), o.repeat);
      // A second, much larger-scale map on the AO channel breaks up the tiling
      // so a big plane never reads as a repeating grid.
      p.aoMap = repeated(tex.groundMacro(), o.repeat ? [o.repeat[0] / 22, o.repeat[1] / 22] : undefined);
      p.aoMapIntensity = 0.7;
      break;
    default:
      break;
  }

  const m = new THREE.MeshStandardMaterial(p);
  cache.set(key, m);
  return m;
}

// --- Named presets: the vocabulary props should be built from ---------------

export const M = {
  /** Painted machinery/props — the default for coloured shop equipment. */
  painted: (color: number, rough = 0.55) => paint({ color, metalness: 0.25, roughness: rough, surface: 'steel' }),
  /** Bare/brushed metal: frames, tools, pipework. */
  steel: (color = 0xaeb6c4, rough = 0.36) => paint({ color, metalness: 0.85, roughness: rough, surface: 'steel' }),
  darkSteel: (color = 0x2f353f) => paint({ color, metalness: 0.7, roughness: 0.5, surface: 'steel' }),
  /** Matte rubber — tyres, mats, hoses. */
  rubber: (color = 0x191c22) => paint({ color, metalness: 0.02, roughness: 0.94 }),
  tyre: (color = 0x1a1d23) => paint({ color, metalness: 0.02, roughness: 0.92, surface: 'tread', repeat: [6, 1] }),
  /** Injection-moulded plastic — cones, crates, housings. */
  plastic: (color: number) => paint({ color, metalness: 0.0, roughness: 0.55 }),
  concrete: (repeat: [number, number]) => paint({ color: 0xffffff, metalness: 0.05, roughness: 0.9, surface: 'concrete', repeat }),
  panel: (color: number, repeat: [number, number]) => paint({ color, metalness: 0.2, roughness: 0.72, surface: 'panel', repeat }),
  wood: (color = 0xffffff) => paint({ color, metalness: 0.0, roughness: 0.78, surface: 'wood' }),
  cardboard: (color = 0xb5793c) => paint({ color, metalness: 0.0, roughness: 0.92 }),
  /** Self-lit surfaces (lamps, screens, signage). */
  glow: (color: number, intensity = 1.4, emissive = color) =>
    paint({ color, emissive, emissiveIntensity: intensity, roughness: 0.4, metalness: 0 }),
  fabric: (color: number) => paint({ color, metalness: 0.0, roughness: 0.88 }),
};

/** Automotive clearcoat. Not cached — each car body owns its colour. */
export function carPaint(color: number): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color,
    // Enough clearcoat to read as automotive paint, not so much that skylights
    // blow every panel out to white.
    metalness: 0.3,
    roughness: 0.36,
    clearcoat: 0.7,
    clearcoatRoughness: 0.14,
    envMapIntensity: 0.85,
  });
}

/** Windscreen/window glass. */
export function glass(tint = 0x9fc4e8, opacity = 0.34): THREE.MeshPhysicalMaterial {
  const key = `glass:${tint}:${opacity}`;
  const hit = cache.get(key);
  if (hit) return hit as THREE.MeshPhysicalMaterial;
  const m = new THREE.MeshPhysicalMaterial({
    color: tint,
    metalness: 0.0,
    roughness: 0.06,
    transmission: 0.0, // transmission is expensive; fake it with alpha
    transparent: true,
    opacity,
    clearcoat: 1.0,
    clearcoatRoughness: 0.03,
    envMapIntensity: 2.0,
    side: THREE.DoubleSide,
  });
  cache.set(key, m);
  return m;
}

/** Chrome-ish trim: bumpers, exhaust tips, rims. */
export const chrome = (color = 0xd7dde8): THREE.MeshStandardMaterial =>
  paint({ color, metalness: 1.0, roughness: 0.14 });

export function disposeMaterialCache(): void {
  for (const m of cache.values()) m.dispose();
  cache.clear();
}

export const materialCacheSize = (): number => cache.size;
