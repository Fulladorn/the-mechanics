import type { MachineDef } from '../../sim/machine';
import type { VehicleDef } from '../../sim/vehicle';
import { wheelSlot } from './common';

// "Betsy" — the Company's practice pickup. Everyone's first job. A boxy
// seventies half-ton with a long bed, a friendly grille and a lot of miles.
//
// Frame: origin at the body centre, ~0.85 m above the ground at rest. -Z is
// the nose, +X is the passenger (right) side.

export const BETSY_GROUND = -0.87;

const HUB_Y = -0.5;
const TRACK = 0.8;
const FRONT = -1.42;
const REAR = 1.36;

export const BETSY_VEHICLE: VehicleDef = {
  id: 'betsy',
  name: 'Betsy',
  kind: 'truck',
  mass: 1450,
  hulls: [
    { half: { x: 0.86, y: 0.42, z: 2.28 }, offset: { x: 0, y: -0.17, z: 0 } },
    { half: { x: 0.8, y: 0.38, z: 0.62 }, offset: { x: 0, y: 0.62, z: -0.3 } },
  ],
  com: { x: 0, y: -0.35, z: 0.05 },
  wheels: [
    { slot: 'wheelFL', pos: { x: -TRACK, y: -0.3, z: FRONT }, radius: 0.37, steer: true, drive: false },
    { slot: 'wheelFR', pos: { x: TRACK, y: -0.3, z: FRONT }, radius: 0.37, steer: true, drive: false },
    { slot: 'wheelRL', pos: { x: -TRACK, y: -0.3, z: REAR }, radius: 0.37, steer: false, drive: true },
    { slot: 'wheelRR', pos: { x: TRACK, y: -0.3, z: REAR }, radius: 0.37, steer: false, drive: true },
  ],
  suspension: { rest: 0.3, travel: 0.2, stiffness: 38, compression: 3.4, relaxation: 2.6 },
  grip: 2.4,
  engine: { force: 7200, brake: 260, topSpeed: 19, reverseSpeed: 6 },
  steer: { max: 0.55, atSpeed: 0.28, rate: 2.4 },
  seat: { x: -0.36, y: 0.86, z: -0.1 },
  exit: { x: -1.75, y: -0.5, z: -0.35 },
  door: { pos: { x: -0.9, y: 0.45, z: -0.45 }, r: 0.42 },
};

export const BETSY_MACHINE: MachineDef = {
  id: 'betsy',
  name: 'Betsy',
  inspect: { pos: { x: 0, y: 0.1, z: 0 }, r: 1.9 },
  components: [
    { t: 'cover', id: 'hood', label: 'Hood', pos: { x: 0, y: 0.3, z: -2.18 }, openPos: { x: 0, y: 1.5, z: -1.52 }, box: { pos: { x: 0, y: 0.32, z: -1.62 }, hx: 0.76, hy: 0.08, hz: 0.66 }, r: 0.4, closeToDrive: true },
    wheelSlot('wheelFL', 'Front-left wheel', { x: -TRACK, y: HUB_Y, z: FRONT }, -1, 'jackFL'),
    wheelSlot('wheelFR', 'Front-right wheel', { x: TRACK, y: HUB_Y, z: FRONT }, 1, 'jackFR'),
    wheelSlot('wheelRL', 'Rear-left wheel', { x: -TRACK, y: HUB_Y, z: REAR }, -1, 'jackRL', 'on the tyre rack'),
    wheelSlot('wheelRR', 'Rear-right wheel', { x: TRACK, y: HUB_Y, z: REAR }, 1, 'jackRR'),
    { t: 'jack', id: 'jackFL', label: 'Jack point', pos: { x: -0.66, y: -0.66, z: FRONT + 0.55 } },
    { t: 'jack', id: 'jackFR', label: 'Jack point', pos: { x: 0.66, y: -0.66, z: FRONT + 0.55 } },
    { t: 'jack', id: 'jackRL', label: 'Jack point', pos: { x: -0.66, y: -0.66, z: REAR - 0.55 } },
    { t: 'jack', id: 'jackRR', label: 'Jack point', pos: { x: 0.66, y: -0.66, z: REAR - 0.55 } },
    {
      t: 'slot',
      id: 'battery',
      label: 'Battery',
      accepts: 'battery',
      pos: { x: 0.42, y: 0.08, z: -1.62 },
      bolts: [{ pos: { x: 0.42, y: 0.1, z: -1.74 }, normal: { x: 0, y: 0, z: -1 } }],
      needs: ['open:hood'],
      terminals: 'batt',
      r: 0.2,
      boltNoun: 'hold-down bolt',
      where: 'on the parts shelf',
    },
    { t: 'terminals', id: 'batt', battery: 'battery', pos: { x: 0.31, y: 0.23, z: -1.6 }, neg: { x: 0.53, y: 0.23, z: -1.6 }, needs: ['open:hood'] },
    { t: 'panel', id: 'fuses', label: 'Fuse box', puzzle: 'fuse', pos: { x: -0.42, y: 0.16, z: -1.66 }, normal: { x: 0, y: 1, z: 0 }, seed: 7001, size: 3, needs: ['open:hood'] },
    {
      t: 'fluid',
      id: 'fuel',
      label: 'Fuel tank',
      fluid: 'fuel',
      pos: { x: -0.9, y: 0.12, z: 0.78 },
      level: 0.04,
      target: 0.4,
      perContainer: 0.55,
    },
  ],
  systems: [
    { id: 'tire', label: 'Rear-left tyre', icon: 'wheel', required: true, parts: ['wheelRL', 'jackRL'], fault: 'Flat as a pancake. Swap it for a good one off the rack.' },
    { id: 'battery', label: 'Battery', icon: 'battery', required: true, parts: ['battery', 'batt'], fault: 'Dead cell. Swap in a fresh one from the shelf.' },
    { id: 'fuses', label: 'Fuse box', icon: 'fuse', required: true, parts: ['fuses'], fault: 'Half the fuses are blown. Reroute the grid.' },
    { id: 'fuel', label: 'Fuel', icon: 'fuel', required: true, parts: ['fuel'], fault: 'Running on fumes. Fill her up from a jerry can.' },
    // The other three wheels are fine, but they're real: they can come off too.
    { id: 'wheels', label: 'Other wheels', icon: 'wheel', required: false, parts: ['wheelFL', 'wheelFR', 'wheelRR', 'jackFL', 'jackFR', 'jackRR'], fault: '' },
  ],
};
