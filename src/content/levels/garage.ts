import type { Vec3 } from '../../shared/math';
import { box, slab, type Box } from '../../sim/collision';
import type { PartKind } from '../../sim/vehicle';

export interface PartSpawn {
  part: PartKind;
  variantId: string;
  pos: Vec3;
}

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
  | 'fan'
  | 'hangLamp'
  | 'weldBot'
  | 'toolchest'
  | 'lockers'
  | 'compressor'
  | 'workbench'
  | 'cables'
  | 'sign'
  | 'banner'
  | 'gauge'
  | 'fireext'
  | 'jerrycan'
  | 'crateStack'
  | 'oilStain'
  | 'tireMark'
  | 'van'
  | 'fence'
  | 'yardLight'
  | 'silhouette'
  | 'tree'
  | 'powerpole'
  | 'cloud'
  | 'bird'
  | 'grass'
  | 'roadline'
  | 'lift'
  | 'paintStation';

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
  partSpawns: PartSpawn[];
  paintPos: Vec3;
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

  // --- ceiling: light strips, pipes, fans, hanging lamps (some animated) ---
  for (const x of [-18, -6, 6, 18]) for (const z of [-18, -9, 0, 9, 17]) P('ceilingLight', x, 5.75, z);
  for (const z of [-21, -10, 10, 18]) P('pipe', 0, 5.45, z, 0, 1);
  for (const x of [-20, 20]) for (const z of [-12, 4]) P('pipe', x, 5.2, z, Math.PI / 2, 1.2);
  P('fan', -10, 5.5, -12);
  P('fan', 10, 5.5, -4);
  P('fan', 0, 5.5, 12);
  P('hangLamp', -12, 4.2, -2.0);
  P('hangLamp', 12, 4.2, -3.0);
  P('hangLamp', 0, 4.4, -6);

  // --- north workshop: hero pieces + dense clutter ---
  P('hoist', -7, 0, -13);
  P('weldBot', 7, 0, -18, -0.4); // animated welder + arc flicker + sparks
  P('lockers', -27.4, 0, -12, Math.PI / 2);
  P('lockers', 27.4, 0, -10, -Math.PI / 2);
  P('toolchest', -10, 0, -22, 0, 1, 0xcf3b34);
  P('toolchest', 13, 0, -22, 0, 1, 0x2f7fd1);
  P('compressor', 24, 0, -22);
  P('workbench', -25, 0, -18, Math.PI / 2);
  P('workbench', 25, 0, -4, -Math.PI / 2);
  P('toolwall', -18, 2.4, -23.2, 0);
  P('toolwall', 9, 2.4, -23.2, 0);
  P('posterSymbol', -28.0, 2.6, -16, Math.PI / 2);
  P('poster', -28.0, 2.6, -8, Math.PI / 2);
  P('poster', 28.0, 2.6, -18, -Math.PI / 2);
  P('sign', 0, 4.5, -23.55, 0); // glowing sign over the exit terminal
  P('gauge', 25.9, 2.2, -14, -Math.PI / 2);
  P('gauge', -25.9, 2.2, -10, Math.PI / 2);
  P('cables', -28.1, 4.7, -2, Math.PI / 2, 1.4);
  P('cables', 28.1, 4.7, -6, -Math.PI / 2, 1.2);
  P('fireext', -27.0, 0, -3, Math.PI / 2);
  P('shelf', -26.5, 0, -20, 0);
  P('shelf', 26.5, 0, -20, Math.PI);
  P('toolbox', -12, 1.25, -3, 0, 1, 0xd14b3a);
  P('toolbox', 10.5, 0, -3, 0, 1, 0x2f7fd1);
  P('toolbox', -10.8, 1.2, -6, 0, 0.8, 0x39b36b);
  P('jackstand', -2.4, 0, -7.5);
  P('jackstand', 2.4, 0, -7.5);
  P('jerrycan', -9, 0, -3.6, 0.3);
  P('jerrycan', -9.6, 0, -3.2, -0.5);
  P('crateStack', -24, 0, -22);
  P('crateStack', 22, 0, -21, 0.4);
  P('barrel', -25, 0, -3, 0, 1, 0x3f7d4f);
  P('barrel', -24, 0, -3, 0, 1, 0xcf7a2a);
  P('barrel', 25, 0, -16, 0, 1, 0x3f7d4f);
  P('barrel', 23.5, 0, -16, 0, 1, 0x394b6b);
  P('tire', -24.5, 0, -22);
  P('tire', 24.5, 0, -22);
  P('tire', 6, 0, -21);
  P('tire', -18, 0, -22, 0.3);
  P('cone', -3, 0, -1);
  P('cone', 3, 0, -1);
  P('parkingLine', 0, 0.02, -6);
  // floor decals (flat — harmless to the kart)
  P('oilStain', -6, 0.012, -10, 0.4, 1.3);
  P('oilStain', 8, 0.012, -8, 1.1, 1.0);
  P('oilStain', 0, 0.012, -16, 0, 1.6);
  P('tireMark', 14, 0.011, -12, 0, 1);
  P('tireMark', -14, 0.011, -14, 0.2, 1);

  // --- south: spawn / runway dressing ---
  P('toolbox', 7, 0.95, 12, 0); // wrench sits on this crate (see wrenchPos)
  P('barrel', -25, 0, 16, 0, 1, 0xcf7a2a);
  P('barrel', 25, 0, 16, 0, 1, 0x3f7d4f);
  P('crateStack', -25, 0, 5, 0.2);
  P('crateStack', 25, 0, 8, -0.3);
  P('tire', 25, 0, 6);
  P('tire', -25, 0, 11, 0.5);
  P('toolchest', -24, 0, 18, Math.PI / 2, 1, 0x2f7fd1);
  P('workbench', 24, 0, 16, -Math.PI / 2);
  P('poster', -28.0, 2.6, 8, Math.PI / 2);
  P('banner', 0, 4.9, 1.2, 0); // company banner over the gate (waves)
  P('sign', 9, 3.1, 19.85, 0);
  P('cone', -3.2, 0, 6);
  P('cone', 3.2, 0, 6);
  P('cone', 0, 0, 9, 0, 0.9);
  P('oilStain', 8, 0.012, 14, 0.6, 1.1);
  // clerestory windows high on the side walls (faked daylight)
  for (const z of [-16, -6, 6, 16]) {
    P('window', -28.2, 4.4, z, Math.PI / 2);
    P('window', 28.2, 4.4, z, -Math.PI / 2);
  }

  // --- exterior yard (visible through the south door, z > 21) ---
  P('van', 5.5, 0, 27, Math.PI * 0.92, 1, 0x394b6b);
  P('van', -7, 0, 30, Math.PI * 1.08, 1, 0xb5793c);
  for (let x = -24; x <= 24; x += 3) P('fence', x, 0, 46);
  P('yardLight', -12, 0, 31);
  P('yardLight', 13, 0, 34);
  P('roadline', 0, 0.02, 64, 0, 1);
  for (const [x, z, s] of [
    [-30, 70, 1.3],
    [-18, 92, 1.6],
    [26, 80, 1.4],
    [12, 112, 1.9],
    [-42, 120, 2.1],
    [44, 110, 1.7],
  ])
    P('tree', x, 0, z as number, 0, s as number);
  for (const [x, z] of [
    [-20, 50],
    [18, 56],
    [-32, 66],
    [30, 70],
    [-6, 84],
  ])
    P('powerpole', x, 0, z as number);
  for (const [x, y, z, s] of [
    [-40, 26, 140, 3],
    [22, 30, 160, 3.6],
    [62, 24, 150, 2.6],
    [-72, 28, 175, 3.2],
  ])
    P('cloud', x, y as number, z as number, 0, s as number);
  P('bird', -10, 16, 80, 0, 1);
  P('bird', 12, 19, 95, 1, 1);
  P('bird', 0, 22, 120, 2, 1.2);
  let gseed = 1;
  const rnd = () => (gseed = (gseed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let i = 0; i < 46; i++) P('grass', -46 + rnd() * 92, 0, 28 + rnd() * 70, rnd() * Math.PI);
  P('silhouette', -50, 0, 150, 0, 2.2, 0x2c3550);
  P('silhouette', 30, 0, 178, 0, 2.9, 0x283047);
  P('silhouette', 95, 0, 150, 0, 2.0, 0x2c3550);

  // --- build bay: hydraulic lift under the chassis + a paint station ---
  P('lift', 0, 0, -6);
  P('paintStation', 3.4, 0, -9);

  // parts to scavenge & bolt on (duplicate kinds w/ different variants = choices)
  const partSpawns: PartSpawn[] = [
    { part: 'wheel', variantId: 'wheel.street', pos: { x: -9, y: 0.4, z: -3 } },
    { part: 'wheel', variantId: 'wheel.street', pos: { x: -10.2, y: 0.4, z: -3.5 } },
    { part: 'wheel', variantId: 'wheel.offroad', pos: { x: 9.4, y: 0.4, z: -3 } },
    { part: 'wheel', variantId: 'wheel.offroad', pos: { x: 10.6, y: 0.4, z: -3.5 } },
    { part: 'wheel', variantId: 'wheel.slick', pos: { x: -18, y: 0.4, z: -19.5 } },
    { part: 'wheel', variantId: 'wheel.slick', pos: { x: 18, y: 0.4, z: -19.5 } },
    { part: 'engine', variantId: 'engine.v4', pos: { x: 12, y: 0.7, z: -3 } },
    { part: 'engine', variantId: 'engine.v6', pos: { x: -12, y: 1.35, z: -3 } },
    { part: 'engine', variantId: 'engine.v8', pos: { x: -12, y: 1.25, z: -6 } },
    { part: 'seat', variantId: 'seat.std', pos: { x: -24.5, y: 1.0, z: -18 } },
    { part: 'seat', variantId: 'seat.racing', pos: { x: 24.5, y: 1.0, z: -4 } },
    { part: 'body', variantId: 'body.std', pos: { x: 6, y: 0.5, z: -12 } },
    { part: 'body', variantId: 'body.light', pos: { x: -6, y: 0.5, z: -12 } },
    { part: 'body', variantId: 'body.armor', pos: { x: 0, y: 0.5, z: -19 } },
    { part: 'battery', variantId: 'battery.std', pos: { x: -20, y: 0.45, z: -12 } },
    { part: 'battery', variantId: 'battery.hd', pos: { x: 13.5, y: 0.45, z: -16 } },
    { part: 'bumper', variantId: 'bumper.std', pos: { x: 14, y: 0.45, z: -12 } },
    { part: 'bumper', variantId: 'bumper.bull', pos: { x: -14, y: 0.45, z: -12 } },
    { part: 'headlights', variantId: 'headlights.std', pos: { x: 5, y: 0.95, z: 12 } },
    { part: 'spoiler', variantId: 'spoiler.gt', pos: { x: 24, y: 1.0, z: 16 } },
    { part: 'exhaust', variantId: 'exhaust.sport', pos: { x: -24, y: 1.0, z: 17 } },
  ];

  return {
    bounds: { minX: -28, maxX: 28, minZ: -24, maxZ: 20 },
    solids,
    props,
    gate: box(0, 1.6, 0, 3, 1.6, 0.5),
    garageDoor: { center: { x: 0, y: 0, z: 20.5 }, width: 10, height: 4.5 },
    exterior: {
      skyTop: '#2c5a9e',
      skyHorizon: '#b9c6d6',
      ground: 0x47503a,
      fogColor: 0x9fb0c4,
      fogNear: 35,
      fogFar: 240,
    },
    spawn: { x: 0, y: 0, z: 15 },
    spawnYaw: 0,
    wrenchPos: { x: 7, y: 1.05, z: 12 },
    flashlightPos: { x: -7, y: 1.05, z: 12 },
    partSpawns,
    paintPos: { x: 3.4, y: 1.0, z: -9 },
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
