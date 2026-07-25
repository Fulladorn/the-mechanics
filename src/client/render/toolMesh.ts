import * as THREE from 'three';
import type { ItemKind } from '../../shared/types';
import { M, chrome, paint } from './materials';
import { box, circle, cyl, roundedBox } from './geo';

// Hand tools and consumables. Shared by the world (items lying around) and the
// viewmodel (what's in your hand), so a wrench on the floor and a wrench in
// your fist are literally the same model.

const mesh = (g: THREE.BufferGeometry, m: THREE.Material): THREE.Mesh => new THREE.Mesh(g, m);

const at = (o: THREE.Object3D, x: number, y: number, z: number): THREE.Object3D => {
  o.position.set(x, y, z);
  return o;
};

function wrench(): THREE.Group {
  const g = new THREE.Group();
  const steel = chrome(0xc8d0dc);
  g.add(mesh(roundedBox(0.07, 0.44, 0.048, 0.02), steel));
  g.add(at(mesh(roundedBox(0.19, 0.14, 0.052, 0.024), steel), 0, 0.26, 0));
  g.add(at(mesh(box(0.07, 0.085, 0.066), steel), 0.052, 0.315, 0));
  g.add(at(mesh(roundedBox(0.15, 0.11, 0.048, 0.02), steel), 0, -0.25, 0));
  g.add(at(mesh(roundedBox(0.076, 0.19, 0.052, 0.024), M.rubber(0xd14b3a)), 0, -0.05, 0));
  return g;
}

function flashlight(): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(cyl(0.058, 0.065, 0.28, 14), M.painted(0xffcf3f, 0.42)));
  g.add(at(mesh(cyl(0.095, 0.066, 0.1, 14), M.darkSteel()), 0, 0.18, 0));
  const lens = mesh(circle(0.084, 14), M.glow(0xfff1c0, 2.4));
  lens.rotation.x = -Math.PI / 2;
  g.add(at(lens, 0, 0.232, 0));
  g.add(at(mesh(cyl(0.06, 0.06, 0.06, 14), M.rubber(0x2a2f38)), 0, -0.05, 0));
  return g;
}

function medkit(): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(roundedBox(0.34, 0.22, 0.2, 0.035), M.plastic(0xe8e8ea)));
  g.add(at(mesh(roundedBox(0.35, 0.05, 0.21, 0.02), M.plastic(0xd14b3a)), 0, 0.08, 0));
  // red cross, on both faces so it reads from either side
  for (const sz of [-1, 1]) {
    g.add(at(mesh(box(0.14, 0.045, 0.008), M.painted(0xd14b3a, 0.4)), 0, -0.02, sz * 0.102));
    g.add(at(mesh(box(0.045, 0.14, 0.008), M.painted(0xd14b3a, 0.4)), 0, -0.02, sz * 0.102));
  }
  const handle = mesh(roundedBox(0.14, 0.03, 0.03, 0.012), M.darkSteel());
  g.add(at(handle, 0, 0.13, 0));
  return g;
}

function flare(): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(cyl(0.038, 0.038, 0.3, 12), paint({ color: 0xc4433a, roughness: 0.8 })));
  g.add(at(mesh(cyl(0.04, 0.04, 0.06, 12), paint({ color: 0xf2f4f8, roughness: 0.7 })), 0, 0.1, 0));
  g.add(at(mesh(cyl(0.042, 0.03, 0.05, 12), M.glow(0xff6a2a, 2.6)), 0, 0.18, 0));
  g.add(at(mesh(cyl(0.039, 0.039, 0.03, 12), M.darkSteel()), 0, -0.13, 0));
  return g;
}

const BUILDERS: Partial<Record<ItemKind, () => THREE.Group>> = {
  wrench,
  flashlight,
  medkit,
  flare,
};

/** True when this item is a hand tool rather than a vehicle part. */
export const isToolKind = (kind: ItemKind): boolean => kind in BUILDERS;

/** Build a tool mesh, or null if the kind isn't a tool. */
export function makeTool(kind: ItemKind): THREE.Group | null {
  const make = BUILDERS[kind];
  if (!make) return null;
  const g = make();
  g.traverse((o) => {
    if (o instanceof THREE.Mesh) o.castShadow = true;
  });
  return g;
}
