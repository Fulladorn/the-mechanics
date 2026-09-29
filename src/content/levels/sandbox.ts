import { Terrain, type TerrainDef } from '../../sim/terrain';
import { natureColliders, scatter } from '../nature';
import { BETSY_MACHINE, BETSY_VEHICLE } from '../vehicles/betsy';
import type { LevelDef } from './types';

// A flat test field with one gentle hill: used by the physics tests and as a
// dev playground (?level=sandbox).

const TERRAIN: TerrainDef = {
  size: 200,
  cell: 1,
  baseY: 0,
  seed: 7,
  noise: [{ amp: 0.25, scale: 30 }],
  features: [{ kind: 'hill', x: 50, z: -40, r: 30, h: 8 }],
  pads: [{ x: 0, z: 0, radius: 25, blend: 10, y: 0 }],
};

export function makeSandbox(): LevelDef {
  const t = Terrain.for(TERRAIN);
  const away = (x: number, z: number) => (Math.hypot(x, z) > 22 ? 1 : 0);
  const nature = scatter(
    t,
    [
      { kind: 'pine', count: 60, where: away, scale: [0.8, 1.3], gap: 4 },
      { kind: 'fir', count: 30, where: away, scale: [0.8, 1.2], gap: 4 },
      { kind: 'broadleaf', count: 25, where: away, scale: [0.8, 1.2], gap: 5 },
      { kind: 'birch', count: 20, where: away, scale: [0.8, 1.1], gap: 3 },
      { kind: 'bush', count: 60, where: away, scale: [0.7, 1.3], gap: 2 },
      { kind: 'boulder', count: 15, where: away, scale: [0.7, 1.5], gap: 3 },
      { kind: 'rock', count: 40, where: () => 1, scale: [0.4, 1.0], gap: 2 },
      { kind: 'stump', count: 8, where: away, scale: [0.8, 1.2] },
      { kind: 'log', count: 6, where: away, scale: [0.8, 1.2] },
    ],
    99,
    90,
  );
  return {
    nature,
    id: 'sandbox',
    title: 'SANDBOX',
    subtitle: 'Physics playground',
    env: 'depot',
    terrain: TERRAIN,
    hour: 10,
    statics: [
      { shape: 'box', pos: { x: -12, y: 1, z: -10 }, size: { x: 4, y: 1, z: 0.3 }, render: 'concrete' },
      { shape: 'box', pos: { x: 12, y: 0.4, z: 6 }, size: { x: 1.5, y: 0.4, z: 1.5 }, render: 'crate', color: 0xb5793c },
      ...natureColliders(nature),
    ],
    props: [],
    items: [
      { kind: 'wrench', pos: { x: 2, y: 0.5, z: 4 } },
      { kind: 'jack', pos: { x: -2, y: 0.5, z: 4 } },
      { kind: 'wheel', pos: { x: 4, y: 0.5, z: 3 }, variant: 'truck' },
      { kind: 'battery', pos: { x: 5, y: 0.5, z: 2 } },
      { kind: 'jerrycan', pos: { x: 6, y: 0.5, z: 2 }, fill: 1 },
    ],
    machines: [
      {
        key: 'betsy',
        def: BETSY_MACHINE,
        vehicle: BETSY_VEHICLE,
        model: 'betsy',
        pos: { x: 0, y: 0.95, z: -4 },
        yaw: 0,
        paint: 0x3f8fb0,
        mounts: {
          wheelFL: { kind: 'wheel', pos: { x: 0, y: 0, z: 0 }, variant: 'truck' },
          wheelFR: { kind: 'wheel', pos: { x: 0, y: 0, z: 0 }, variant: 'truck' },
          wheelRL: { kind: 'wheel', pos: { x: 0, y: 0, z: 0 }, variant: 'truck', cond: 'bad' },
          wheelRR: { kind: 'wheel', pos: { x: 0, y: 0, z: 0 }, variant: 'truck' },
          battery: { kind: 'battery', pos: { x: 0, y: 0, z: 0 }, cond: 'bad' },
        },
      },
    ],
    stations: [],
    spawn: { pos: { x: 0, y: 0, z: 6 }, yaw: 0 },
    beats: [{ id: 'play', text: 'Mess around', done: () => false }],
    par: 600,
    safe: true,
    briefing: 'Sandbox.',
  };
}
