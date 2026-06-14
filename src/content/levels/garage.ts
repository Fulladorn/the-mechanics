import type { Vec3 } from '../../shared/math';
import { box, slab, type Box } from '../../sim/collision';

// Tags let the renderer pick materials/procedural textures per structure.
export type SolidTag = 'floor' | 'wall' | 'divider' | 'crate' | 'cabinet' | 'pallet' | 'terminal';

export interface Solid {
  box: Box;
  color: number;
  tag: SolidTag;
}

export interface GarageLevel {
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  solids: Solid[];
  /** Speed-gate barrier; collidable only while closed. */
  gate: Box;
  spawn: Vec3;
  spawnYaw: number;
  wrenchPos: Vec3;
  flashlightPos: Vec3;
  enginePos: Vec3;
  benchPos: Vec3;
  kartStart: Vec3;
  kartYaw: number;
  checkpoints: Vec3[];
  clockInPos: Vec3;
  puzzleSeed: number;
}

// The training bay: a big shed split by a divider wall. The only way north
// (into the workshop) is the speed gate — which opens once you bunny-hop fast
// enough — so the movement skill is taught before everything else.
export function makeGarage(): GarageLevel {
  const solids: Solid[] = [
    // floor
    { box: box(0, -0.5, -2, 28, 0.5, 22), color: 0x3a4150, tag: 'floor' },
    // perimeter walls (height 6)
    { box: box(0, 3, -24.5, 28.5, 3, 0.5), color: 0x53607a, tag: 'wall' },
    { box: box(0, 3, 20.5, 28.5, 3, 0.5), color: 0x53607a, tag: 'wall' },
    { box: box(-28.5, 3, -2, 0.5, 3, 22.5), color: 0x53607a, tag: 'wall' },
    { box: box(28.5, 3, -2, 0.5, 3, 22.5), color: 0x53607a, tag: 'wall' },
    // divider wall at z=0 with a gap (x in [-3,3]) for the gate
    { box: box(-15.5, 3, 0, 12.5, 3, 0.5), color: 0x47526b, tag: 'divider' },
    { box: box(15.5, 3, 0, 12.5, 3, 0.5), color: 0x47526b, tag: 'divider' },
    // south half: supply crates
    { box: slab(7, 0, 12, 1.4, 0.9, 1.4), color: 0xb5793c, tag: 'crate' },
    { box: slab(-7, 0, 12, 1.2, 0.9, 1.2), color: 0xb5793c, tag: 'crate' },
    // north half: workshop fixtures
    { box: slab(-12, 0, -3, 2.4, 1.2, 1.4), color: 0x6b7280, tag: 'cabinet' },
    { box: slab(12, 0, -3, 1.8, 0.35, 1.8), color: 0x8a8f99, tag: 'pallet' },
    { box: slab(0, 0, -23, 2.2, 2.4, 0.7), color: 0x2f3a4d, tag: 'terminal' },
  ];

  return {
    bounds: { minX: -28, maxX: 28, minZ: -24, maxZ: 20 },
    solids,
    gate: box(0, 1.6, 0, 3, 1.6, 0.5),
    spawn: { x: 0, y: 0, z: 15 },
    spawnYaw: 0,
    wrenchPos: { x: 7, y: 1.05, z: 12 },
    flashlightPos: { x: -7, y: 1.05, z: 12 },
    enginePos: { x: 12, y: 0.7, z: -3 },
    benchPos: { x: -12, y: 1.0, z: -2.0 },
    kartStart: { x: 0, y: 0, z: -6 },
    kartYaw: 0,
    checkpoints: [
      { x: 16, y: 0, z: -9 },
      { x: 16, y: 0, z: -20 },
      { x: -16, y: 0, z: -20 },
      { x: -16, y: 0, z: -9 },
    ],
    clockInPos: { x: 0, y: 1.2, z: -22.2 },
    puzzleSeed: 1337,
  };
}
