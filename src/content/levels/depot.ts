import type { Vec3 } from '../../shared/math';
import { Terrain, type TerrainDef } from '../../sim/terrain';
import type { World } from '../../sim/world';
import type { ItemSpawn } from '../../sim/items';
import { Kit, furnish } from '../kit';
import { natureColliders, scatter } from '../nature';
import { BETSY_MACHINE, BETSY_VEHICLE } from '../vehicles/betsy';
import type { BeatDef, LevelDef } from './types';

// ORIENTATION DAY — the Company depot. A warm morning; Betsy, the practice
// pickup, is sat in the bay with a flat, a dead battery, cooked fuses and an
// empty tank. Punch in, get your tools, fix her, drive the cone course, park.
//
// Layout (top view, -Z north): the hall spans x -12..12, z -9..9. Locker room
// in the north-west corner, storeroom (dark) north-east. The roll-up door on
// the south wall opens onto the yard where the course is.

const TERRAIN: TerrainDef = {
  size: 360,
  cell: 1,
  baseY: 0,
  seed: 1807,
  noise: [
    { amp: 3.5, scale: 90 },
    { amp: 0.6, scale: 14 },
  ],
  features: [
    { kind: 'hill', x: -120, z: -90, r: 70, h: 18 },
    { kind: 'hill', x: 110, z: -60, r: 80, h: 14 },
    { kind: 'hill', x: -60, z: 150, r: 60, h: 10 },
    { kind: 'ridge', x: 60, z: 120, x2: 150, z2: 60, r: 40, h: 16 },
  ],
  roads: [
    // the yard itself is a very wide asphalt "road"
    { id: 'yard', points: [[0, 6, 0], [0, 30, 0], [0, 50, 0]], halfWidth: 22, shoulder: 8, surface: 'asphalt', smooth: 0 },
    { id: 'lane', points: [[20, 58, 0], [40, 80], [55, 120], [50, 170]], halfWidth: 3.6, shoulder: 6, surface: 'dirt' },
  ],
  pads: [
    { x: 0, z: 0, radius: 26, blend: 14, y: 0 },
    { x: 0, z: 30, radius: 34, blend: 16, y: 0 },
  ],
  edge: { radius: 165, blend: 20, y: 12 },
};

const WALL = 0xd9cbb0;
const TRIM = 0x3d5a73;

export const DEPOT = {
  clock: { x: -6.22, y: 1.35, z: -5.4 },
  locker: { x: -9.4, y: 1.2, z: -8.3 },
  board: { x: 0, y: 1.9, z: -8.8 },
  bin: { x: 10, y: 0, z: 5.6 },
  gates: [
    { x: -3.2, z: 24 },
    { x: 3.2, z: 31 },
    { x: -3.2, z: 38 },
    { x: 3.2, z: 45 },
  ],
  turn: { x: 0, z: 54 },
  bay: { x: 14.5, z: 26, yaw: 0 },
  crate: { x: 9, y: 2.6, z: -20 },
};

export function makeDepot(): LevelDef {
  const t = Terrain.for(TERRAIN);
  const k = new Kit();

  // --- the hall -----------------------------------------------------------------------------
  const H = 6;
  const glaze = (s: number, e: number) => ({ s, e, y0: 2.6, y1: 4.4, glazed: true });
  k.room(-12, -9, 12, 9, 0, H, 0.3, {
    s: [{ s: 7.5, e: 16.5, y0: 0, y1: 4.4 }],
    n: [{ s: 9.2, e: 10.6, y0: 0, y1: 2.3 }, glaze(4, 8), glaze(14, 18)],
    // (no window in the storeroom: it's meant to be dark)
    e: [glaze(7.5, 10.5), glaze(13.5, 16.5)],
    w: [glaze(1.5, 4.5), glaze(7.5, 10.5), glaze(13.5, 16.5)],
  }, 'siding', WALL);
  k.prop('roof', { x: 0, y: H, z: 0 }, 0, { w: 24.6, d: 18.8, rise: 2.6, color: 0x8e3b2f, skylights: 3 });
  k.prop('trusses', { x: 0, y: H, z: 0 }, 0, { w: 24, d: 18, rise: 2.6, n: 5 });
  k.prop('slab', { x: 0, y: 0.015, z: 0 }, 0, { w: 23.7, d: 17.7, mat: 'shopFloor' });
  k.prop('bayLines', { x: 0, y: 0.03, z: 0.5 }, 0, { w: 3.6, d: 6.2 });
  k.prop('bayLines', { x: -7.3, y: 0.03, z: 1.2 }, 0, { w: 3.4, d: 6.2 });
  k.prop('sign', { x: 0, y: 7.3, z: 9.25 }, Math.PI, { text: 'THE COMPANY · BAY 3', w: 7, h: 1.1 });

  // Locker room (NW) and storeroom (NE): partial-height rooms with ceilings.
  k.wall({ x: -12, z: -4 }, { x: -6, z: -4 }, 0, 3, 0.2, [{ s: 2.3, e: 3.5, y0: 0, y1: 2.2 }], 'plaster', 0xe7dfcd);
  k.wall({ x: -6, z: -9 }, { x: -6, z: -4 }, 0, 3, 0.2, [], 'plaster', 0xe7dfcd);
  k.prop('slab', { x: -9, y: 3.0, z: -6.5 }, 0, { w: 6.2, d: 5.2, mat: 'ceiling', thick: 0.12 });
  k.wall({ x: 6, z: -4 }, { x: 12, z: -4 }, 0, 3, 0.2, [{ s: 2.5, e: 3.9, y0: 0, y1: 2.2 }], 'plaster', 0xd6cdb9);
  k.wall({ x: 6, z: -9 }, { x: 6, z: -4 }, 0, 3, 0.2, [], 'plaster', 0xd6cdb9);
  k.prop('slab', { x: 9, y: 3.0, z: -6.5 }, 0, { w: 6.2, d: 5.2, mat: 'ceiling', thick: 0.12 });
  k.prop('roomSign', { x: -9.1, y: 2.5, z: -3.88 }, 0, { text: 'CREW' });
  k.prop('roomSign', { x: 9.2, y: 2.5, z: -3.88 }, 0, { text: 'STORES' });

  // --- locker room -----------------------------------------------------------------------------
  furnish(k, 'lockers', -10.2, 0, -8.6, 0, { names: 'HOLT,ORTIZ,ROOKIE,NAKAMURA', open: 2 }, false);
  k.block(-10.2, 0, -8.78, 2.4, 2.0, 0.2, 0, 'metal');
  furnish(k, 'bench', -10.2, 0, -6.6, 0);
  furnish(k, 'coffee', -6.5, 0, -8.5, 0);
  k.prop('clock', DEPOT.clock, -Math.PI / 2);
  k.prop('poster', { x: -11.83, y: 1.7, z: -5.6 }, Math.PI / 2, { art: 'safety' });
  k.prop('poster', { x: -6.13, y: 1.75, z: -7.4 }, -Math.PI / 2, { art: 'hands' });
  k.prop('lamp', { x: -9, y: 2.92, z: -6.5 }, 0, { color: 0xffe2b8, power: 2.6, range: 8 });

  // --- storeroom (dark: the flashlight lesson) ----------------------------------------------------
  furnish(k, 'tireRack', 11.4, 0, -6.4, -Math.PI / 2);
  furnish(k, 'shelf', 7.4, 0, -8.6, 0, { fill: 'batteries' });
  furnish(k, 'jerryRack', 9.6, 0, -8.7, 0);
  furnish(k, 'crate', 7, 0, -5, 0.3);
  k.prop('lamp', { x: 9, y: 2.92, z: -6.5 }, 0, { color: 0xffd8a0, power: 1.2, range: 6, flicker: true });

  // --- the bay ----------------------------------------------------------------------------------
  furnish(k, 'workbench', -11.4, 0, 3.4, Math.PI / 2, { vise: true });
  k.prop('toolWall', { x: -11.83, y: 1.9, z: 3.4 }, Math.PI / 2);
  furnish(k, 'toolChest', -11.3, 0, 6.2, Math.PI / 2, { color: 0xd9463b });
  furnish(k, 'compressor', 11.3, 0, -0.5, -Math.PI / 2);
  furnish(k, 'drum', 11.2, 0, 1.6, 0, { color: 0x3f7d4f });
  furnish(k, 'drum', 11.3, 0, 2.4, 0, { color: 0xcf7a2a });
  furnish(k, 'partsWasher', 10.9, 0, -2.6, -Math.PI / 2);
  furnish(k, 'scrapBin', DEPOT.bin.x, 0, DEPOT.bin.z, -0.2);
  k.prop('tirePile', { x: 11, y: 0, z: 7.6 }, 0.3);
  // the other bay: the Company van up on a two-post lift
  furnish(k, 'liftPost', -9.1, 0, 1.2, 0);
  furnish(k, 'liftPost', -5.5, 0, 1.2, 0);
  k.prop('van', { x: -7.3, y: 1.35, z: 1.3 }, Math.PI, { color: 0xf1ede2, stripe: 0xff7a2f, hood: true });
  k.prop('liftArms', { x: -7.3, y: 1.35, z: 1.2 }, 0);
  k.prop('board', DEPOT.board, 0);
  k.prop('poster', { x: 5, y: 2.4, z: -8.83 }, 0, { art: 'fix' });
  k.prop('poster', { x: -3.5, y: 2.4, z: -8.83 }, 0, { art: 'company' });
  k.prop('poster', { x: 11.83, y: 2.2, z: 4 }, -Math.PI / 2, { art: 'hands' });
  k.prop('radio', { x: -11.3, y: 0.95, z: 2.4 }, Math.PI / 2);
  for (const [x, z] of [
    [-4, -3],
    [4, -3],
    [-4, 4.5],
    [4, 4.5],
  ])
    k.prop('lamp', { x, y: H - 0.2, z }, 0, { color: 0xfff0d8, power: 16, range: 16, strip: true });
  k.prop('fan', { x: 0, y: H - 0.1, z: 0 }, 0);
  k.prop('oilStain', { x: 0.4, y: 0.035, z: -0.5 }, 0.4, { r: 1.1 });
  k.prop('oilStain', { x: -7, y: 0.035, z: 2.5 }, 1.2, { r: 0.8 });

  // --- the yard ---------------------------------------------------------------------------------
  // fence line with a locked road gate to the south-east
  const fence = (ax: number, az: number, bx: number, bz: number) => {
    const len = Math.hypot(bx - ax, bz - az);
    const yaw = Math.atan2(-(bz - az), bx - ax);
    k.box({ x: (ax + bx) / 2, y: 0.9, z: (az + bz) / 2 }, { x: len / 2, y: 0.9, z: 0.06 }, yaw, 'metal');
    k.prop('fence', { x: ax, y: 0, z: az }, yaw, { len });
  };
  fence(-26, 9, -26, 64);
  fence(26, 9, 26, 54);
  fence(-26, 64, 18, 64);
  fence(26, 54, 26, 64);
  fence(-26, 9, -12.2, 9);
  fence(12.2, 9, 26, 9);
  k.box({ x: 22, y: 0.6, z: 64 }, { x: 4, y: 0.6, z: 0.1 }, 0, 'metal');
  k.prop('barrier', { x: 18, y: 0, z: 64 }, 0, { len: 8 });
  // course
  DEPOT.gates.forEach((g, i) => k.prop('gate', { x: g.x, y: 0, z: g.z }, 0, { n: i + 1 }));
  k.prop('turnPost', { x: DEPOT.turn.x, y: 0, z: DEPOT.turn.z }, 0);
  k.box({ x: DEPOT.turn.x, y: 0.5, z: DEPOT.turn.z }, { x: 0.35, y: 0.5, z: 0.35 }, 0, 'metal');
  k.prop('parkingBay', { x: DEPOT.bay.x, y: 0.02, z: DEPOT.bay.z }, DEPOT.bay.yaw, { label: 'BAY 7' });
  k.prop('arrow', { x: 0, y: 0.02, z: 17 }, 0);
  k.prop('arrow', { x: 8, y: 0.02, z: 54 }, -Math.PI / 2);
  // the ramp, because obviously
  k.box({ x: -12, y: 0.55, z: 38 }, { x: 1.6, y: 0.12, z: 2.4 }, 0, 'wood', undefined, undefined, 'ramp');
  k.statics[k.statics.length - 1].pitch = 0.24;
  k.prop('ramp', { x: -12, y: 0.55, z: 38 }, 0, { w: 3.2, l: 4.8, pitch: 0.24 });
  // dressing
  k.prop('van', { x: -18, y: 0, z: 20 }, 0.2, { color: 0x394b6b, stripe: 0xff7a2f });
  k.block(-18, 0, 20, 2.1, 2.3, 4.9, 0.2, 'metal');
  furnish(k, 'container', 19, 0, 16, Math.PI / 2, { color: 0x3a6f8f });
  furnish(k, 'pallet', 18, 0, 40, 0.3);
  furnish(k, 'drum', -22, 0, 12, 0, { color: 0x2f5d9f });
  furnish(k, 'drum', -21.3, 0, 12.7, 0, { color: 0xcf7a2a });
  k.prop('lampPost', { x: -14, y: 0, z: 12 }, 0);
  k.prop('lampPost', { x: 14, y: 0, z: 34 }, 0);
  k.prop('flagPole', { x: -20, y: 0, z: 34 }, 0);
  k.prop('billboard', { x: -8, y: 0, z: 66.5 }, 0, { text: 'THE COMPANY', sub: 'We fix what others won’t.' });
  k.prop('waterTower', { x: 44, y: t.heightAt(44, -34), z: -34 }, 0);
  for (const [x, z] of [
    [34, 20],
    [42, 60],
    [48, 100],
    [52, 140],
  ])
    k.prop('powerPole', { x, y: t.heightAt(x, z), z }, 0.3);

  // --- behind the hall: the movement course ---------------------------------------------------------
  furnish(k, 'pallet', -3, 0, -12, 0);
  k.block(-3, 0, -12, 1.2, 0.9, 1.0, 0, 'wood');
  k.prop('crateStack', { x: -3, y: 0, z: -12 }, 0, { h: 0.9 });
  k.block(-0.8, 0, -13.2, 1.2, 1.8, 1.2, 0.2, 'wood');
  k.prop('crateStack', { x: -0.8, y: 0, z: -13.2 }, 0.2, { h: 1.8 });
  furnish(k, 'container', 2.5, 0, -16, 0.1, { color: 0x9f3a2f });
  furnish(k, 'container', 9, 0, -20.5, 0.1, { color: 0x3f7d4f });
  k.prop('spray', { x: 5.8, y: 1.4, z: -16.7 }, 0.1, { text: 'JUMP →' });

  // --- nature around the site --------------------------------------------------------------------------
  const outside = (x: number, z: number) => (x > -34 && x < 34 && z > -28 && z < 72 ? 0 : 1);
  const nature = scatter(
    t,
    [
      { kind: 'pine', count: 260, where: (x, z) => outside(x, z) * (Math.hypot(x, z - 20) > 60 ? 1 : 0.4), scale: [0.9, 1.5], gap: 3.5 },
      { kind: 'broadleaf', count: 110, where: outside, scale: [0.9, 1.4], gap: 5 },
      { kind: 'birch', count: 60, where: outside, scale: [0.8, 1.2], gap: 3 },
      { kind: 'bush', count: 220, where: (x, z) => (x > -28 && x < 28 && z > -12 && z < 66 ? 0 : 1), scale: [0.7, 1.4], gap: 2 },
      { kind: 'boulder', count: 30, where: outside, scale: [0.8, 1.8], gap: 4 },
      { kind: 'rock', count: 80, where: outside, scale: [0.4, 1.0], gap: 2 },
    ],
    3301,
    170,
  );
  k.statics.push(...natureColliders(nature));

  // --- items ---------------------------------------------------------------------------------------
  const items: ItemSpawn[] = [
    { kind: 'wrench', pos: { x: -9.45, y: 1.12, z: -8.55 }, hiddenUntil: 'locker', pinned: true },
    { kind: 'flashlight', pos: { x: -9.2, y: 1.12, z: -8.5 }, yaw: 1.2, hiddenUntil: 'locker', pinned: true },
    { kind: 'jack', pos: { x: -10.2, y: 0.1, z: 5.4 }, yaw: 0.4, pinned: true },
    { kind: 'wheel', pos: { x: 10.4, y: 0.131, z: -7.7 }, variant: 'truck', pinned: true },
    { kind: 'wheel', pos: { x: 10.4, y: 0.393, z: -7.7 }, variant: 'truck', pinned: true },
    { kind: 'battery', pos: { x: 7.2, y: 0.28, z: -7.9 }, yaw: 0.2, pinned: true },
    { kind: 'jerrycan', pos: { x: 9.1, y: 0.2, z: -8.1 }, yaw: 1.6, fill: 1, pinned: true },
    { kind: 'jerrycan', pos: { x: 9.7, y: 0.2, z: -8.2 }, yaw: 1.5, fill: 0, pinned: true },
    { kind: 'medkit', pos: { x: -11.2, y: 1.01, z: 2.3 }, yaw: 0.3, pinned: true },
  ];
  // traffic cones along the course: knockable
  const cones: Vec3[] = [];
  for (const g of DEPOT.gates) for (const dx of [-1.9, 1.9]) cones.push({ x: g.x + dx, y: 0.3, z: g.z });
  for (let z = 20; z <= 48; z += 4) for (const x of [-7, 7]) cones.push({ x, y: 0.3, z });
  for (const c of cones) items.push({ kind: 'cone', pos: c, pinned: true });
  // the sealed crate on the far container
  items.push({ kind: 'crate', pos: { x: DEPOT.crate.x, y: DEPOT.crate.y + 0.21, z: DEPOT.crate.z }, yaw: 0.3, pinned: true });
  const coneStart = cones.map((c) => ({ ...c }));

  // --- the job -------------------------------------------------------------------------------------
  const M = 'betsy';
  const step = (w: World, sys: string) => w.machine(M).nextStep(sys, w.ctx);
  const stepMarker = (w: World, sys: string): Vec3 | null => {
    const s = step(w, sys);
    if (!s) return null;
    if (s.need) {
      const it = w.nearestItem(s.need);
      if (it) return it.pos;
    }
    return s.pos ?? null;
  };
  const systemBeat = (id: string, sys: string, text: string, start: string, hints: [number, string][]): BeatDef => ({
    id,
    text,
    detail: (w) => step(w, sys)?.text ?? null,
    marker: (w) => stepMarker(w, sys),
    start: (w) => w.say(start),
    done: (w) => w.systemOk(M, sys),
    hints,
  });

  const beats: BeatDef[] = [
    {
      id: 'clockin',
      text: 'Punch in at the time clock',
      detail: 'Look at it and press E',
      marker: () => DEPOT.clock,
      done: (w) => w.flag('clockedIn'),
      finish: (w) => w.say("You're on the clock. Everything you touch from here on is billable."),
      hints: [
        [22, 'Time clock. On the wall by the door. Look right at it and hit E.'],
        [60, 'Big grey box, little card slot. You can do this.'],
      ],
    },
    {
      id: 'gear',
      text: 'Get your tools from your locker',
      detail: (w) => (w.flag('locker') ? 'Pick up the wrench and the flashlight' : 'The one with ROOKIE on it'),
      marker: (w) => {
        if (!w.flag('locker')) return DEPOT.locker;
        return w.nearestItem(w.hasItem('wrench') ? 'flashlight' : 'wrench')?.pos ?? null;
      },
      done: (w) => w.hasItem('wrench') && w.hasItem('flashlight'),
      finish: (w) => w.say('Tools live on your belt — 1 to 4 to switch, F for the flashlight. Right. Meet Betsy.'),
      hints: [[35, 'Your locker. It says ROOKIE. The tape’s still wet.']],
    },
    {
      id: 'inspect',
      text: 'Inspect Betsy',
      detail: 'Look at the truck and hold E',
      marker: (w) => w.machine(M).pos,
      start: (w) => w.say("That's Betsy. She's been every rookie's first patient since before you were born. Give her a once-over."),
      done: (w) => w.machine(M).state.inspected,
      finish: (w) => w.say("That's your job sheet. Hold Tab any time to see what's broken and what to do next."),
      hints: [[30, 'Walk up to the truck, look at it, hold E.']],
    },
    systemBeat('tire', 'tire', 'Fix the flat tyre', "Rear tyre's flat. Jack under the jack point, pump it up, nuts off, wheel off. New wheels are in the storeroom.", [
      [70, 'Stuck? Hold Tab — the job sheet always says the next step.'],
      [150, 'Jack first, then nuts. Or nuts first, then jack. Either way the wheel’s not coming off by itself.'],
    ]),
    systemBeat('battery', 'battery', 'Swap the dead battery', 'Battery next. Pop the hood. Black terminal off first, then red. Going back on, red first, black last. Get it backwards and you’ll find out why.', [
      [90, 'New batteries are on the pallet in the storeroom.'],
    ]),
    systemBeat('fuses', 'fuses', 'Fix the fuse box', 'Fuse box is under the hood too. Somebody’s been playing with it. Flip fuses until the whole board is green.', [
      [60, 'Each fuse flips its neighbours. Work it like a puzzle, because it is one.'],
    ]),
    systemBeat('fuel', 'fuel', 'Fill up the tank', 'She’s bone dry. Jerry cans are in the storeroom. Hold E at the filler cap to pour.', [
      [80, 'The FULL can, rookie. The one that sloshes.'],
    ]),
    {
      id: 'start',
      text: 'Start her up',
      detail: (w) => w.machine(M).readyToDrive(w.items) ?? 'Get in the driver’s side — E at the door',
      marker: (w) => w.vehicle(M).world(BETSY_VEHICLE.door.pos),
      start: (w) => {
        w.say('All systems green. Hood down, climb in, and bring her out. I’ll get the door.');
        w.openDoor('rollup');
      },
      done: (w) => w.player.mode === 'drive' && w.vehicle(M).running,
      finish: (w) => w.say("Listen to that. Cone course out back. Weave through the gates — Space is the handbrake, V swaps the camera."),
      hints: [[40, 'Driver’s door. Left side. E.']],
    },
    {
      id: 'course',
      text: 'Weave through the gates',
      detail: (w) => `Gate ${Math.min(gateIndex(w) + 1, DEPOT.gates.length)} of ${DEPOT.gates.length}`,
      marker: (w) => {
        const g = DEPOT.gates[gateIndex(w)];
        return g ? { x: g.x, y: 1.5, z: g.z } : null;
      },
      done: (w) => gateIndex(w) >= DEPOT.gates.length,
      finish: (w) => w.say(w.flag('coneHit') ? 'You clipped a cone. The cones have families, rookie.' : 'Clean run. Now loop round the post and park her.'),
      hints: [[60, 'Through the flags. Yellow means next.']],
    },
    {
      id: 'park',
      text: 'Park Betsy in Bay 7',
      detail: 'Round the post, then into the painted bay and stop',
      marker: () => ({ x: DEPOT.bay.x, y: 0.5, z: DEPOT.bay.z }),
      done: (w) => {
        const v = w.vehicle(M);
        return Math.hypot(v.pos.x - DEPOT.bay.x, v.pos.z - DEPOT.bay.z) < 1.8 && Math.abs(v.speed) < 0.7;
      },
      finish: (w) => {
        w.stamp('CERTIFIED', 'Orientation complete');
        w.say("Parked. Not bad, rookie. You're certified. Real contracts start now — and they're not all this friendly.");
      },
    },
  ];

  let coneCheck = 0;
  return {
    id: 'depot',
    title: 'ORIENTATION DAY',
    subtitle: 'Company Depot · Bay 3',
    env: 'depot',
    terrain: TERRAIN,
    hour: 9.4,
    sunset: 235,
    attract: { target: { x: 0, y: 3, z: 6 }, radius: 36, height: 8, hour: 19.3, speed: 0.035 },
    statics: k.statics,
    props: k.props,
    nature,
    items,
    machines: [
      {
        key: M,
        def: BETSY_MACHINE,
        vehicle: BETSY_VEHICLE,
        model: 'betsy',
        pos: { x: 0, y: 0.9, z: 0.6 },
        yaw: Math.PI,
        paint: 0x4f9fc4,
        mounts: {
          wheelFL: { kind: 'wheel', pos: { x: 0, y: 0, z: 0 }, variant: 'truck' },
          wheelFR: { kind: 'wheel', pos: { x: 0, y: 0, z: 0 }, variant: 'truck' },
          wheelRL: { kind: 'wheel', pos: { x: 0, y: 0, z: 0 }, variant: 'truck', cond: 'bad' },
          wheelRR: { kind: 'wheel', pos: { x: 0, y: 0, z: 0 }, variant: 'truck' },
          battery: { kind: 'battery', pos: { x: 0, y: 0, z: 0 }, cond: 'bad' },
        },
      },
    ],
    stations: [
      {
        id: 'clock',
        pos: DEPOT.clock,
        r: 0.28,
        label: (w) => (w.flag('clockedIn') ? 'Clocked in 09:24' : 'Punch in'),
        verb: 'tap',
        priority: 1,
        when: (w) => (w.flag('clockedIn') ? 'Already on the clock' : true),
        run: (w) => {
          w.setFlag('clockedIn');
          w.sfx('punch', DEPOT.clock);
          w.stamp('09:24', 'Clocked in', 'warn');
        },
      },
      {
        id: 'locker',
        pos: DEPOT.locker,
        r: 0.45,
        label: 'Open your locker',
        verb: 'tap',
        priority: 1,
        when: (w) => (w.flag('locker') ? false : w.flag('clockedIn') ? true : 'Punch in first'),
        run: (w) => {
          w.setFlag('locker');
          w.sfx('locker', DEPOT.locker);
        },
      },
      {
        id: 'board',
        pos: DEPOT.board,
        r: 0.7,
        label: 'Read the job board',
        verb: 'tap',
        priority: -1,
        run: (w) =>
          w.say('Job board: "BETSY — flat RL, dead batt, fuses cooked, no gas. Rookie job. DO NOT let the rookie near the van." Charming.'),
      },
    ],
    doors: [
      { id: 'rollup', hinge: { x: -4.5, y: 0, z: 9 }, width: 9, height: 4.4, yaw: 0, scripted: true, style: 'rollup' },
      { id: 'back', hinge: { x: -2.8, y: 0, z: -9 }, width: 1.4, height: 2.3, yaw: 0, label: 'back door' },
      { id: 'crew', hinge: { x: -9.7, y: 0, z: -4 }, width: 1.2, height: 2.2, yaw: 0, label: 'door', open: true },
      { id: 'stores', hinge: { x: 8.5, y: 0, z: -4 }, width: 1.4, height: 2.2, yaw: 0, label: 'storeroom door' },
    ],
    spawn: { pos: { x: -11.1, y: 0, z: -4.9 }, yaw: -0.95 },
    beats,
    side: [
      { id: 'crate', text: 'Reach the sealed crate on the containers', done: (w) => w.lore.has('crate'), visible: (w) => w.flag('seenCrate') || w.lore.has('crate') },
      { id: 'cones', text: 'Run the course without hitting a cone', done: (w) => gateIndex(w) >= DEPOT.gates.length && !w.flag('coneHit'), visible: (w) => w.beat >= 7 },
    ],
    triggers: [
      { id: 'storeroomDark', pos: { x: 9, y: 0, z: -5.5 }, r: 2.2, when: (w) => !w.player.flashlight, run: (w) => w.say('Storeroom light’s been out since the last rookie. F for your flashlight.') },
      { id: 'seeCrate', pos: { x: 3, y: 0, z: -12 }, r: 6, run: (w) => {
        w.setFlag('seenCrate');
        w.say('That crate on the container? Not ours. Not on any manifest. If you can get up there, have a look — off the record.');
      } },
      { id: 'crateTop', pos: DEPOT.crate, r: 2.5, when: (w) => w.player.pos.y > 2.3, run: (w) => {
        w.collectLore('crate');
        w.say('A symbol. Like a ring with a bite out of it. …Leave it. Above your pay grade.');
      } },
    ],
    lore: [{ id: 'crate', title: 'The sealed crate', body: 'A crate that isn’t on any manifest, stamped with a broken ring.' }],
    rooms: [
      { x0: -12, z0: -9, x1: 12, z1: 9, y1: 8.6, ambient: 0.5 },
      { x0: -12, z0: -9, x1: -6, z1: -4, y1: 3, ambient: 0.35 },
      { x0: 6, z0: -9, x1: 12, z1: -4, y1: 3, ambient: 0.08 },
    ],
    ground: [{ x0: -12.6, z0: -9.6, x1: 12.6, z1: 9.6, color: 0x9a968e, grass: 0 }],
    par: 480,
    safe: true,
    briefing: 'Morning, rookie. Welcome to the Company. Punch in before you touch anything — Legal gets weird about it.',
    tick: (w, dt) => {
      // Gates: pass them in order with the truck.
      const gi = gateIndex(w);
      const g = DEPOT.gates[gi];
      if (g && w.player.mode === 'drive') {
        const v = w.vehicle(M);
        if (Math.hypot(v.pos.x - g.x, v.pos.z - g.z) < 2.4) {
          w.setFlag(`gate${gi}`);
          w.sfx('gate');
          w.toast(`Gate ${gi + 1} / ${DEPOT.gates.length}`);
        }
      }
      // Cones knocked over?
      coneCheck -= dt;
      if (coneCheck <= 0 && !w.flag('coneHit')) {
        coneCheck = 0.5;
        const list = w.items.list.filter((i) => i.kind === 'cone');
        list.forEach((c, i) => {
          const s = coneStart[i];
          if (s && Math.hypot(c.pos.x - s.x, c.pos.z - s.z) > 0.5) w.setFlag('coneHit');
        });
      }
      // Teaching moments, the first time each thing comes up.
      const f = w.focus;
      if (f?.verb === 'loosen' && !f.disabled) w.once('t_loosen', () => w.say('Hold left mouse on a nut. The wrench does the rest.'));
      if (f?.verb === 'torque' && !f.disabled)
        w.once('t_torque', () => w.say('Now torque them: hold left mouse, watch the ring, let go in the green. Too far and the thread slips.'));
      if (f?.label.startsWith('Slide the jack')) w.once('t_jack', () => w.say('Jack goes under there. E to place it, then hold E to pump.'));
      const held = w.heldItem();
      if (held?.cond === 'bad') w.once(`t_scrap_${held.kind}`, () => w.say('Scrap bin’s by the door. Or just drop it — G. Hold G to throw.'));
      if (held?.kind === 'jerrycan' && held.fill > 0.5) w.once('t_pour', () => w.say('Filler cap’s on the side of the bed. Hold E there to pour.'));
      // Scrap bin: anything bad that lands in it gets a nod.
      for (const it of w.items.list) {
        if (it.state !== 'world' || it.cond !== 'bad') continue;
        if (Math.abs(it.pos.x - DEPOT.bin.x) < 0.8 && Math.abs(it.pos.z - DEPOT.bin.z) < 0.6 && it.pos.y > 0.2)
          w.once(`binned_${it.id}`, () => {
            w.stamp('NICE SHOT', 'Scrapped', 'good');
            w.sfx('binClang', it.pos);
          });
      }
    },
  };
}

function gateIndex(w: World): number {
  let i = 0;
  while (i < DEPOT.gates.length && w.flag(`gate${i}`)) i++;
  return i;
}
