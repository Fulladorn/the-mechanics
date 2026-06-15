import type { Vec3 } from '../../shared/math';
import { box, slab, type Box } from '../../sim/collision';

// Tags let the renderer pick materials/procedural textures per structure.
export type SolidTag =
  | 'floor'
  | 'wall'
  | 'divider'
  | 'crate'
  | 'cabinet'
  | 'pallet'
  | 'terminal'
  | 'door'
  | 'invisible';

export interface Solid {
  box: Box;
  color: number;
  tag: SolidTag;
  hidden?: boolean; // collision-only (not rendered) — used for the open doorway
}

// Render-only decoration. Never enters collision, so the sim/tests are untouched.
export type PropKind =
  | 'tire'
  | 'barrel'
  | 'toolbox'
  | 'jackstand'
  | 'hoist'
  | 'shelf'
  | 'toolwall'
  | 'poster'
  | 'posterSymbol'
  | 'pipe'
  | 'ceilingLight'
  | 'parkingLine'
  | 'cone'
  | 'window'
  | 'van'
  | 'fence'
  | 'yardLight'
  | 'silhouette';

export interface Prop {
  kind: PropKind;
  pos: Vec3;
  rot?: number;
  scale?: number;
  color?: number;
}

export interface Exterior {
  skyTop: string;
  skyHorizon: string;
  ground: number;
  fogColor: number;
  fogNear: number;
  fogFar: number;
}

export interface GarageLevel {
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  solids: Solid[];
  props: Prop[];
  gate: Box;
  garageDoor: { center: Vec3; width: number; height: number };
  exterior: Exterior;
  spawn: Vec3;
  spawnYaw: number;
  wrenchPos: Vec3;
  flashlightPos: Vec3;
  enginePos: Vec3;
  benchPos: Vec3;
  boltPos: Vec3;
  fusePos: Vec3;
  lorePos: Vec3;
  kartStart: Vec3;
  kartYaw: number;
  checkpoints: Vec3[];
  clockInPos: Vec3;
  puzzleSeed: number;
}

// The training bay: a big shed split by a divider wall. The only way north
// (into the workshop) is the speed gate — which opens once you bunny-hop fast
// enough. A big roll-up door on the south wall opens onto the exterior yard.
export function makeGarage(): GarageLevel {
  const solids: Solid[] = [
    // floor
    { box: box(0, -0.5, -2, 28, 0.5, 22), color: 0x3a4150, tag: 'floor' },
    // north wall
    { box: box(0, 3, -24.5, 28.5, 3, 0.5), color: 0x53607a, tag: 'wall' },
    // south wall split around a 10m-wide door gap (x in [-5,5])
    { box: box(-16.75, 3, 20.5, 11.75, 3, 0.5), color: 0x53607a, tag: 'wall' },
    { box: box(16.75, 3, 20.5, 11.75, 3, 0.5), color: 0x53607a, tag: 'wall' },
    { box: box(0, 5.25, 20.5, 5, 0.75, 0.5), color: 0x53607a, tag: 'wall' }, // lintel
    { box: box(0, 2.25, 20.5, 5, 2.25, 0.6), color: 0, tag: 'invisible', hidden: true }, // keep player inside
    // door frame posts (visible)
    { box: box(-5.2, 2.4, 20.5, 0.25, 2.4, 0.6), color: 0x2a2f3a, tag: 'door' },
    { box: box(5.2, 2.4, 20.5, 0.25, 2.4, 0.6), color: 0x2a2f3a, tag: 'door' },
    // side walls
    { box: box(-28.5, 3, -2, 0.5, 3, 22.5), color: 0x53607a, tag: 'wall' },
    { box: box(28.5, 3, -2, 0.5, 3, 22.5), color: 0x53607a, tag: 'wall' },
    // divider wall at z=0 with a gap (x in [-3,3]) for the gate
    { box: box(-15.5, 3, 0, 12.5, 3, 0.5), color: 0x47526b, tag: 'divider' },
    { box: box(15.5, 3, 0, 12.5, 3, 0.5), color: 0x47526b, tag: 'divider' },
    // south half: supply crates
    { box: slab(7, 0, 12, 1.4, 0.9, 1.4), color: 0xb5793c, tag: 'crate' },
    { box: slab(-7, 0, 12, 1.2, 0.9, 1.2), color: 0xb5793c, tag: 'crate' },
    // north half: workshop fixtures
    { box: slab(-12, 0, -3, 2.4, 1.2, 1.4), color: 0x6b7280, tag: 'cabinet' }, // fuse bench
    { box: slab(-12, 0, -6, 2.0, 1.1, 1.2), color: 0x6b7280, tag: 'cabinet' }, // bolt bench
    { box: slab(12, 0, -3, 1.8, 0.35, 1.8), color: 0x8a8f99, tag: 'pallet' },
    { box: slab(0, 0, -23, 2.2, 2.4, 0.7), color: 0x2f3a4d, tag: 'terminal' },
  ];

  const props: Prop[] = [];
  const P = (kind: PropKind, x: number, y: number, z: number, rot = 0, scale = 1, color?: number) =>
    props.push({ kind, pos: { x, y, z }, rot, scale, color });

  // ceiling light strips (instanced) over the whole bay
  for (const x of [-18, -6, 6, 18]) for (const z of [-18, -9, 0, 9, 17]) P('ceilingLight', x, 5.75, z);
  // ceiling pipes
  for (const z of [-21, -10, 10, 18]) P('pipe', 0, 5.4, z, 0, 1);
  P('pipe', -26, 5.2, -2, Math.PI / 2, 1.4);
  P('pipe', 26, 5.2, -2, Math.PI / 2, 1.4);

  // workshop (north) clutter
  P('hoist', -7, 0, -13);
  P('toolwall', -18, 2.4, -23.2, 0);
  P('toolwall', 9, 2.4, -23.2, 0);
  P('posterSymbol', -28.0, 2.6, -16, Math.PI / 2);
  P('poster', -28.0, 2.6, -8, Math.PI / 2);
  P('poster', 28.0, 2.6, -12, -Math.PI / 2);
  P('shelf', -26.5, 0, -20, 0);
  P('shelf', -26.5, 0, -6, 0);
  P('shelf', 26.5, 0, -20, Math.PI);
  P('toolbox', -12, 1.25, -3, 0, 1, 0xd14b3a); // on the fuse bench
  P('toolbox', 10.5, 0, -3, 0, 1, 0x2f7fd1);
  P('jackstand', -2.4, 0, -7.5);
  P('jackstand', 2.4, 0, -7.5);
  P('barrel', -25, 0, -3, 0, 1, 0x3f7d4f);
  P('barrel', -24, 0, -3, 0, 1, 0xcf7a2a);
  P('barrel', 25, 0, -16, 0, 1, 0x3f7d4f);
  P('tire', -24.5, 0, -22, 0, 1);
  P('tire', 24.5, 0, -22, 0, 1);
  P('tire', 6, 0, -21, 0, 1);
  P('cone', -3, 0, -1, 0);
  P('cone', 3, 0, -1, 0);
  // parking box around the kart
  P('parkingLine', 0, 0.02, -6, 0, 1);

  // spawn / runway (south) dressing
  P('toolbox', 7, 0.95, 12, 0); // wrench sits on this crate (see wrenchPos)
  P('barrel', -25, 0, 16, 0, 1, 0xcf7a2a);
  P('barrel', 25, 0, 16, 0, 1, 0x3f7d4f);
  P('tire', 25, 0, 6, 0, 1);
  P('poster', -28.0, 2.6, 8, Math.PI / 2);
  P('cone', -3.2, 0, 6, 0);
  P('cone', 3.2, 0, 6, 0);
  // clerestory windows high on the side walls (faked, emissive)
  for (const z of [-16, -6, 6, 16]) {
    P('window', -28.2, 4.4, z, Math.PI / 2);
    P('window', 28.2, 4.4, z, -Math.PI / 2);
  }

  // exterior yard (visible through the south door, z > 21)
  P('van', 0.5, 0, 27, Math.PI, 1, 0x394b6b);
  for (let x = -22; x <= 22; x += 3) P('fence', x, 0, 44);
  P('yardLight', -11, 0, 30);
  P('yardLight', 12, 0, 33);
  P('silhouette', -34, 0, 95, 0, 1.3, 0x2c3550);
  P('silhouette', 6, 0, 120, 0, 1.7, 0x283047);
  P('silhouette', 40, 0, 100, 0, 1.2, 0x2c3550);

  return {
    bounds: { minX: -28, maxX: 28, minZ: -24, maxZ: 20 },
    solids,
    props,
    gate: box(0, 1.6, 0, 3, 1.6, 0.5),
    garageDoor: { center: { x: 0, y: 0, z: 20.5 }, width: 10, height: 4.5 },
    exterior: {
      skyTop: '#27407a',
      skyHorizon: '#d6a866',
      ground: 0x5b5446,
      fogColor: 0x8b93a8,
      fogNear: 38,
      fogFar: 150,
    },
    spawn: { x: 0, y: 0, z: 15 },
    spawnYaw: 0,
    wrenchPos: { x: 7, y: 1.05, z: 12 },
    flashlightPos: { x: -7, y: 1.05, z: 12 },
    enginePos: { x: 12, y: 0.7, z: -3 },
    benchPos: { x: -12, y: 1.0, z: -2.0 },
    fusePos: { x: -12, y: 1.0, z: -2.0 },
    boltPos: { x: -12, y: 1.0, z: -5.0 },
    lorePos: { x: -25.5, y: 1.0, z: -20 },
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
