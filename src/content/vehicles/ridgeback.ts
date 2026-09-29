import type { MachineDef } from '../../sim/machine';
import type { VehicleDef } from '../../sim/vehicle';
import { lugNuts, wheelSlot } from './common';

// The Ridgeback — the client's 4×4. A square-shouldered eighties off-roader
// with a snorkel, a roof rack and a spare on the tailgate. Somebody left it
// at the summit overlook with the handbrake cable cut.
//
// Frame: origin at the body centre, ~1.0 m above the ground at rest. -Z is
// the nose, +X is the passenger (right) side.

export const RIDGEBACK_GROUND = -1.02;
const HUB_Y = -0.6;
const TRACK = 0.86;
const FRONT = -1.36;
const REAR = 1.34;

export const RIDGEBACK_VEHICLE: VehicleDef = {
  id: 'ridgeback',
  name: 'Ridgeback',
  kind: 'truck',
  mass: 1750,
  hulls: [
    { half: { x: 0.92, y: 0.4, z: 2.15 }, offset: { x: 0, y: -0.12, z: 0 } },
    { half: { x: 0.86, y: 0.42, z: 1.3 }, offset: { x: 0, y: 0.68, z: 0.25 } },
  ],
  com: { x: 0, y: -0.4, z: 0 },
  wheels: [
    { slot: 'wheelFL', pos: { x: -TRACK, y: -0.32, z: FRONT }, radius: 0.42, steer: true, drive: true },
    { slot: 'wheelFR', pos: { x: TRACK, y: -0.32, z: FRONT }, radius: 0.42, steer: true, drive: true },
    { slot: 'wheelRL', pos: { x: -TRACK, y: -0.32, z: REAR }, radius: 0.42, steer: false, drive: true },
    { slot: 'wheelRR', pos: { x: TRACK, y: -0.32, z: REAR }, radius: 0.42, steer: false, drive: true },
  ],
  suspension: { rest: 0.32, travel: 0.26, stiffness: 36, compression: 3.6, relaxation: 2.8 },
  grip: 2.7,
  engine: { force: 9800, brake: 320, topSpeed: 21, reverseSpeed: 6 },
  steer: { max: 0.56, atSpeed: 0.26, rate: 2.3 },
  seat: { x: -0.38, y: 0.95, z: 0.05 },
  exit: { x: -1.9, y: -0.6, z: -0.1 },
  door: { pos: { x: -1.0, y: 0.35, z: -0.1 }, r: 0.7 },
};

const clamp2 = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) => [
  { pos: a, normal: { x: 0, y: 1, z: 0 } },
  { pos: b, normal: { x: 0, y: 1, z: 0 } },
];

export const RIDGEBACK_MACHINE: MachineDef = {
  id: 'ridgeback',
  name: 'Ridgeback',
  inspect: { pos: { x: 0, y: 0.3, z: 0 }, r: 2.1 },
  components: [
    // Chocks sit on the ground in front of the front tyres (it rolls nose-first).
    { t: 'slot', id: 'chockL', label: 'Left chock', accepts: 'chock', pos: { x: -TRACK, y: RIDGEBACK_GROUND + 0.09, z: FRONT - 0.52 }, r: 0.28 },
    { t: 'slot', id: 'chockR', label: 'Right chock', accepts: 'chock', pos: { x: TRACK, y: RIDGEBACK_GROUND + 0.09, z: FRONT - 0.52 }, r: 0.28 },

    { t: 'cover', id: 'hood', label: 'Hood', pos: { x: 0, y: 0.32, z: -2.05 }, openPos: { x: 0, y: 1.45, z: -1.5 }, r: 0.45, closeToDrive: true },
    wheelSlot('wheelFL', 'Front-left wheel', { x: -TRACK, y: HUB_Y, z: FRONT }, -1, 'jackFL', 'on the ranger’s pickup'),
    wheelSlot('wheelFR', 'Front-right wheel', { x: TRACK, y: HUB_Y, z: FRONT }, 1, 'jackFR'),
    wheelSlot('wheelRL', 'Rear-left wheel', { x: -TRACK, y: HUB_Y, z: REAR }, -1, 'jackRL'),
    wheelSlot('wheelRR', 'Rear-right wheel', { x: TRACK, y: HUB_Y, z: REAR }, 1, 'jackRR'),
    { t: 'jack', id: 'jackFL', label: 'Jack point', pos: { x: -0.7, y: -0.72, z: FRONT + 0.6 }, lift: 0.14 },
    { t: 'jack', id: 'jackFR', label: 'Jack point', pos: { x: 0.7, y: -0.72, z: FRONT + 0.6 }, lift: 0.14 },
    { t: 'jack', id: 'jackRL', label: 'Jack point', pos: { x: -0.7, y: -0.72, z: REAR - 0.6 }, lift: 0.14 },
    { t: 'jack', id: 'jackRR', label: 'Jack point', pos: { x: 0.7, y: -0.72, z: REAR - 0.6 }, lift: 0.14 },

    {
      t: 'slot',
      id: 'battery',
      label: 'Battery',
      accepts: 'battery',
      pos: { x: 0.46, y: 0.1, z: -1.55 },
      bolts: [{ pos: { x: 0.46, y: 0.12, z: -1.67 }, normal: { x: 0, y: 0, z: -1 } }],
      needs: ['open:hood'],
      terminals: 'batt',
      r: 0.2,
      boltNoun: 'hold-down bolt',
      where: 'in the logging truck at the sawmill',
    },
    { t: 'terminals', id: 'batt', battery: 'battery', pos: { x: 0.35, y: 0.26, z: -1.53 }, neg: { x: 0.57, y: 0.26, z: -1.53 }, needs: ['open:hood'] },

    // Coolant: a split top hose, then fill and bleed the air out.
    {
      t: 'slot',
      id: 'radHose',
      label: 'Radiator hose',
      accepts: 'radiatorHose',
      pos: { x: -0.12, y: 0.16, z: -1.62 },
      yaw: Math.PI / 2,
      bolts: clamp2({ x: -0.12, y: 0.2, z: -1.8 }, { x: -0.12, y: 0.2, z: -1.44 }),
      needs: ['open:hood'],
      r: 0.16,
      boltNoun: 'hose clamp',
      where: 'in the RV’s storage bin at the campground',
    },
    {
      t: 'fluid',
      id: 'coolant',
      label: 'Radiator',
      fluid: 'coolant',
      pos: { x: -0.2, y: 0.24, z: -1.9 },
      level: 0.0,
      target: 0.6,
      perContainer: 0.8,
      leakUnless: 'radHose',
      needs: ['open:hood'],
    },
    { t: 'panel', id: 'bleed', label: 'Cooling bleed valves', puzzle: 'valve', pos: { x: -0.56, y: 0.2, z: -1.5 }, normal: { x: 0, y: 1, z: 0 }, seed: 4242, size: 3, needs: ['open:hood'] },

    // Fuel: split line under the rear, then fill up.
    {
      t: 'slot',
      id: 'fuelLine',
      label: 'Fuel line',
      accepts: 'fuelHose',
      pos: { x: 0.62, y: -0.5, z: 0.7 },
      bolts: [
        { pos: { x: 0.62, y: -0.47, z: 0.5 }, normal: { x: 1, y: 0, z: 0 } },
        { pos: { x: 0.62, y: -0.47, z: 0.9 }, normal: { x: 1, y: 0, z: 0 } },
      ],
      r: 0.18,
      boltNoun: 'hose clamp',
      where: 'in the RV’s storage bin at the campground',
    },
    {
      t: 'fluid',
      id: 'fuel',
      label: 'Fuel tank',
      fluid: 'fuel',
      pos: { x: 0.95, y: 0.2, z: 1.2 },
      level: 0.0,
      target: 0.45,
      perContainer: 0.6,
      leakUnless: 'fuelLine',
    },

    // Ignition: someone pulled and scrambled the fuses.
    // (on the driver-side bulkhead, behind the front wheel: a flip-down cover)
    { t: 'panel', id: 'ignition', label: 'Ignition fuse panel', puzzle: 'fuse', pos: { x: -0.95, y: 0.04, z: -0.82 }, normal: { x: -1, y: 0, z: 0 }, seed: 9117, size: 4 },

    // Optional kit.
    {
      t: 'slot',
      id: 'winch',
      label: 'Winch mount',
      accepts: 'winch',
      pos: { x: 0, y: -0.28, z: -2.22 },
      bolts: [
        { pos: { x: -0.24, y: -0.2, z: -2.3 }, normal: { x: 0, y: 0, z: -1 } },
        { pos: { x: 0.24, y: -0.2, z: -2.3 }, normal: { x: 0, y: 0, z: -1 } },
      ],
      r: 0.25,
      where: 'at the old mine',
    },
    {
      t: 'slot',
      id: 'lightbar',
      label: 'Roof rack',
      accepts: 'lightbar',
      pos: { x: 0, y: 1.16, z: -0.9 },
      bolts: [
        { pos: { x: -0.42, y: 1.18, z: -0.9 }, normal: { x: 0, y: 1, z: 0 } },
        { pos: { x: 0.42, y: 1.18, z: -0.9 }, normal: { x: 0, y: 1, z: 0 } },
      ],
      r: 0.3,
      where: 'up the fire lookout',
    },
  ],
  systems: [
    { id: 'stabilize', label: 'Wheel chocks', icon: 'stabilize', required: false, parts: ['chockL', 'chockR'], fault: 'It’s rolling! Chock the front wheels.' },
    { id: 'wheel', label: 'Front-left wheel', icon: 'wheel', required: true, parts: ['wheelFL', 'jackFL'], fault: 'Shredded on the rocks. Needs a whole wheel — same bolt pattern as a ranger pickup.' },
    { id: 'battery', label: 'Battery', icon: 'battery', required: true, parts: ['battery', 'batt'], fault: 'Case is cracked and it’s bone dead. Find another 12-volt.' },
    { id: 'fuel', label: 'Fuel', icon: 'fuel', required: true, parts: ['fuelLine', 'fuel'], fault: 'Tank’s empty — the fuel line is split. Replace it, then fill up.' },
    { id: 'coolant', label: 'Cooling', icon: 'coolant', required: true, parts: ['radHose', 'coolant', 'bleed'], fault: 'Top hose is split and the radiator’s dry. New hose, coolant, then bleed the air out.' },
    { id: 'ignition', label: 'Ignition', icon: 'ignition', required: true, parts: ['ignition'], fault: 'The ignition fuses have been pulled and put back wrong. On purpose.' },
    { id: 'winch', label: 'Winch (extra)', icon: 'winch', required: false, parts: ['winch'], fault: 'No winch fitted. The client would love one.' },
    { id: 'lights', label: 'Light bar (extra)', icon: 'lightbar', required: false, parts: ['lightbar'], fault: 'Empty roof rack. A light bar would help on the way down.' },
    { id: 'wheels', label: 'Other wheels', icon: 'wheel', required: false, parts: ['wheelFR', 'wheelRL', 'wheelRR', 'jackFR', 'jackRL', 'jackRR'], fault: '' },
  ],
};

// --- the ATV ------------------------------------------------------------------------

export const ATV_VEHICLE: VehicleDef = {
  id: 'atv',
  name: 'ATV',
  kind: 'atv',
  mass: 330,
  hulls: [{ half: { x: 0.5, y: 0.26, z: 0.92 }, offset: { x: 0, y: 0.05, z: 0 } }],
  com: { x: 0, y: -0.25, z: 0 },
  wheels: [
    { pos: { x: -0.52, y: -0.12, z: -0.62 }, radius: 0.3, steer: true, drive: true },
    { pos: { x: 0.52, y: -0.12, z: -0.62 }, radius: 0.3, steer: true, drive: true },
    { pos: { x: -0.52, y: -0.12, z: 0.62 }, radius: 0.3, steer: false, drive: true },
    { pos: { x: 0.52, y: -0.12, z: 0.62 }, radius: 0.3, steer: false, drive: true },
  ],
  suspension: { rest: 0.22, travel: 0.2, stiffness: 30, compression: 3.2, relaxation: 2.4 },
  grip: 2.3,
  engine: { force: 2700, brake: 70, topSpeed: 16, reverseSpeed: 4 },
  steer: { max: 0.6, atSpeed: 0.3, rate: 3 },
  seat: { x: 0, y: 0.68, z: 0.15 },
  exit: { x: -1.1, y: -0.3, z: 0.1 },
  door: { pos: { x: 0, y: 0.45, z: -0.15 }, r: 0.5 },
  rack: { x: 0, y: 0.36, z: 0.72 },
};

export const ATV_MACHINE: MachineDef = { id: 'atv', name: 'ATV', inspected: true, components: [], systems: [] };

// --- donors ---------------------------------------------------------------------------

/** The ranger's pickup, up on blocks behind the station: wheels come straight off. */
export const RANGER_PICKUP: MachineDef = {
  id: 'rangerPickup',
  name: 'Ranger pickup',
  inspected: true,
  components: [
    { ...wheelSlot('wheelFL', 'Front-left wheel', { x: -0.8, y: -0.5, z: -1.42 }, -1, 'jackFL') },
    { ...wheelSlot('wheelRL', 'Rear-left wheel', { x: -0.8, y: -0.5, z: 1.36 }, -1, 'jackRL') },
    { t: 'jack', id: 'jackFL', label: 'Blocks', pos: { x: -0.66, y: -0.66, z: -0.87 }, state: 'blocks' },
    { t: 'jack', id: 'jackRL', label: 'Blocks', pos: { x: -0.66, y: -0.66, z: 0.81 }, state: 'blocks' },
  ],
  systems: [],
};

/** Logging truck at the sawmill: a heavy-duty battery in a box behind the cab. */
export const LOGGING_TRUCK: MachineDef = {
  id: 'loggingTruck',
  name: 'Logging truck',
  inspected: true,
  components: [
    { t: 'cover', id: 'box', label: 'Battery box lid', pos: { x: 1.2, y: -0.2, z: -0.6 }, r: 0.35 },
    {
      t: 'slot',
      id: 'battery',
      label: 'Battery',
      accepts: 'battery',
      pos: { x: 1.2, y: -0.34, z: -0.6 },
      bolts: [{ pos: { x: 1.36, y: -0.3, z: -0.6 }, normal: { x: 1, y: 0, z: 0 } }],
      needs: ['open:box'],
      terminals: 'batt',
      r: 0.2,
      boltNoun: 'hold-down bolt',
    },
    { t: 'terminals', id: 'batt', battery: 'battery', pos: { x: 1.2, y: -0.2, z: -0.72 }, neg: { x: 1.2, y: -0.2, z: -0.48 }, needs: ['open:box'] },
  ],
  systems: [],
};

/** The sawmill's generator: fuel it, then pull the cord (a station). */
export const GENERATOR: MachineDef = {
  id: 'generator',
  name: 'Generator',
  inspected: true,
  components: [{ t: 'fluid', id: 'fuel', label: 'Generator tank', fluid: 'fuel', pos: { x: 0.2, y: 0.55, z: 0 }, level: 0, target: 0.3, perContainer: 0.5 }],
  systems: [{ id: 'fuel', label: 'Generator fuel', icon: 'fuel', required: true, parts: ['fuel'], fault: '' }],
};

export { lugNuts };
