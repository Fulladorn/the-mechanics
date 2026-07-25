import type { Vec3 } from '../../shared/math';
import { slab } from '../../sim/collision';
import { Terrain, type TerrainDef } from '../../sim/terrain';
import type { Socket } from '../../sim/vehicle';
import type { ItemSpawn, LevelDef, Prop, PropKind, Solid, Station } from './types';

// Level 1 — Summer Mountains (GDD §6.1).
//
// A client's 4×4 is rolling toward a cliff edge near the summit. Chock it, put
// it back together from what's scattered down the mountain, then drive the
// switchbacks to the extraction lot without going over an edge.
//
// The road is carved into a cone by sim/terrain.ts, so every stretch gets an
// uphill cut on the inside and a drop on the outside for free. Everything here
// is positioned by (road progress t, lateral offset), which keeps the layout
// readable and keeps props glued to the actual ground the sim collides against.

const BASE_TERRAIN: TerrainDef = {
  peakY: 62,
  baseY: 0,
  peakR: 42,
  baseR: 235,
  road: {
    startAngle: 0.35,
    turns: 2.15,
    topR: 54,
    bottomR: 208,
    topY: 52,
    bottomY: 1.5,
    halfWidth: 5.5,
    shoulder: 10,
  },
  relief: 11.5,
  seed: 20260724,
};

/** Where a landmark sits: road progress `t`, metres outward from the centreline. */
const SITES = {
  cabinA: { t: 0.14, lateral: 13 }, // spare wheel
  cabinB: { t: 0.33, lateral: -14 }, // fuel + flare, inside the bend
  cabinC: { t: 0.62, lateral: 15 }, // roof lights + medkit
  cave: { t: 0.47, lateral: -21 },
  exfil: { t: 1.0, lateral: 0 },
};

export function makeMountains(): LevelDef {
  // The road spiral doesn't depend on pads, so landmark positions can be
  // resolved from a pad-free terrain and then fed back in as levelled pads.
  const draft = new Terrain(BASE_TERRAIN);
  const siteXZ = (s: { t: number; lateral: number }) => {
    const c = draft.roadPoint(s.t);
    const len = Math.hypot(c.x, c.z) || 1;
    return { x: c.x + (c.x / len) * s.lateral, z: c.z + (c.z / len) * s.lateral };
  };

  const TERRAIN: TerrainDef = {
    ...BASE_TERRAIN,
    pads: [
      { ...siteXZ(SITES.cabinA), radius: 7, blend: 9 },
      { ...siteXZ(SITES.cabinB), radius: 7, blend: 9 },
      { ...siteXZ(SITES.cabinC), radius: 7, blend: 9 },
      { ...siteXZ(SITES.cave), radius: 9, blend: 11 },
      { ...siteXZ(SITES.exfil), radius: 16, blend: 22 },
    ],
  };
  const terrain = new Terrain(TERRAIN);

  /** World position at road progress `t`, offset `lateral` metres outward. */
  const road = (t: number, lateral = 0): Vec3 => {
    const c = terrain.roadPoint(t);
    const len = Math.hypot(c.x, c.z) || 1;
    const x = c.x + (c.x / len) * lateral;
    const z = c.z + (c.z / len) * lateral;
    return { x, y: terrain.heightAt(x, z), z };
  };

  /** Same, but lifted `h` metres so an item sits on top of something. */
  const on = (t: number, lateral: number, h: number): Vec3 => {
    const p = road(t, lateral);
    return { x: p.x, y: p.y + h, z: p.z };
  };

  const solids: Solid[] = [];
  const props: Prop[] = [];
  const P = (kind: PropKind, p: Vec3, rot = 0, scale = 1, color?: number) =>
    props.push({ kind, pos: p, rot, scale, color });

  /** Yaw that faces a position back toward the mountain's centre. */
  const facingIn = (p: Vec3) => Math.atan2(p.x, p.z) + Math.PI;

  // --- cabins: a hut on a levelled pad, with a fire to warm up at -----------
  // The pad is flat, so the hut only needs a shallow deck lip — low enough to
  // walk straight onto thanks to step-up in the collision resolver.
  const cabin = (site: { t: number; lateral: number }): Vec3 => {
    const p = road(site.t, site.lateral);
    const rot = facingIn(p);
    solids.push({ box: slab(p.x, p.y, p.z, 7.2, 0.3, 6.2), color: 0x6b4f33, tag: 'cabin' });
    solids.push({ box: slab(p.x, p.y + 0.3, p.z - 0.6, 5.4, 2.6, 4.2), color: 0x7d5836, tag: 'cabin' });
    solids.push({ box: slab(p.x, p.y + 2.9, p.z - 0.6, 6.2, 0.5, 5.0), color: 0x4a3524, tag: 'cabinRoof' });
    P('cabinDeco', { x: p.x, y: p.y + 0.3, z: p.z }, rot);
    P('campfire', { x: p.x + Math.sin(rot + 1.2) * 5.2, y: p.y, z: p.z + Math.cos(rot + 1.2) * 5.2 });
    // Items sit on the deck, which is 0.3 m up — reachable without a jump.
    return { x: p.x, y: p.y + 0.3, z: p.z };
  };

  const cabinA = cabin(SITES.cabinA); // spare wheel
  const cabinB = cabin(SITES.cabinB); // fuel + flare (inside the bend)
  const cabinC = cabin(SITES.cabinC); // roof lights + medkit

  // --- the cave: the environmental puzzle and the first lore log ------------
  const cavePos = road(SITES.cave.t, SITES.cave.lateral);
  solids.push({ box: slab(cavePos.x, cavePos.y, cavePos.z - 4.5, 11, 7, 6), color: 0x4a4640, tag: 'rock' });
  P('caveMouth', cavePos, facingIn(cavePos));

  // --- guardrails on the outside of the tightest bends ---------------------
  for (const t of [0.09, 0.22, 0.4, 0.55, 0.72, 0.86]) {
    for (let i = -3; i <= 3; i++) {
      const p = road(t + i * 0.006, TERRAIN.road.halfWidth + 0.6);
      P('guardrail', p, Math.atan2(p.x, p.z) + Math.PI / 2);
    }
  }

  // --- scenery: pines below the tree line, rock and snow above -------------
  let seed = 991;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let i = 0; i < 260; i++) {
    const t = rnd();
    const side = rnd() > 0.5 ? 1 : -1;
    const lateral = side * (12 + rnd() * 55);
    const p = road(t, lateral);
    if (p.y > 44) continue; // above the tree line
    if (p.y < 40) P('pine', p, rnd() * Math.PI, 0.75 + rnd() * 0.9);
  }
  for (let i = 0; i < 90; i++) {
    const t = rnd();
    const lateral = (rnd() > 0.5 ? 1 : -1) * (9 + rnd() * 46);
    P('boulder', road(t, lateral), rnd() * Math.PI, 0.6 + rnd() * 1.4);
  }
  for (let i = 0; i < 26; i++) {
    const t = rnd() * 0.4;
    P('snowPatch', road(t, (rnd() > 0.5 ? 1 : -1) * (8 + rnd() * 40)), rnd() * Math.PI, 1 + rnd());
  }
  for (let i = 0; i < 120; i++) {
    const t = rnd();
    P('shrub', road(t, (rnd() > 0.5 ? 1 : -1) * (7 + rnd() * 30)), rnd() * Math.PI, 0.7 + rnd() * 0.7);
  }
  for (const t of [0.06, 0.2, 0.36, 0.5, 0.66, 0.8, 0.93]) {
    P('rockSpire', road(t, -(16 + rnd() * 10)), rnd() * Math.PI, 1 + rnd() * 1.2);
  }
  // route markers so the road reads at a distance
  for (let i = 1; i < 22; i++) {
    const t = i / 22;
    P('markerFlag', road(t, TERRAIN.road.halfWidth - 0.8), 0, 1);
    P('markerFlag', road(t, -(TERRAIN.road.halfWidth - 0.8)), 0, 1);
  }
  P('signpost', road(0.03, 7), facingIn(road(0.03, 7)));
  P('signpost', road(0.97, 9), facingIn(road(0.97, 9)));
  // a previous team's wreck, half off the edge — the first hint of the mystery
  const wreck = road(0.44, TERRAIN.road.halfWidth + 7);
  P('wreck', wreck, rnd() * Math.PI);

  // clouds sit below you at the summit, which sells the altitude
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    P('cloud', { x: Math.cos(a) * 300, y: 26 + rnd() * 10, z: Math.sin(a) * 300 }, 0, 4 + rnd() * 3);
  }
  for (const [d, s] of [
    [430, 2.4],
    [520, 3.0],
    [470, 2.0],
  ] as [number, number][]) {
    const a = rnd() * Math.PI * 2;
    P('silhouette', { x: Math.cos(a) * d, y: 0, z: Math.sin(a) * d }, 0, s, 0x51637f);
  }

  // --- the 4×4 and the extraction lot --------------------------------------
  const vehiclePos = road(0.035, 1.5);
  const spawnPos = road(0.02, -2.5);
  const exfilPos = road(SITES.exfil.t, SITES.exfil.lateral);

  // The previous shift's camp, still burning — the only warmth up here. Kept
  // well clear of the 4x4 so its firelight doesn't wash out the hero prop you
  // are supposed to be looking at when the mission opens.
  const summitCamp = road(0.085, -10);
  P('campfire', summitCamp);
  P('crateStack', road(0.09, -12.5), 0.4);

  P('markerFlag', { x: exfilPos.x, y: exfilPos.y, z: exfilPos.z }, 0, 2);
  P('van', road(1.0, 14), facingIn(road(1.0, 14)), 1, 0x394b6b);
  P('yardLight', road(0.99, -12));

  // Wheels, body, engine and seat are already on the 4×4 — this is a recovery
  // job, not a build. Five systems stand between you and driving it down.
  const vehicleSockets: Socket[] = [
    { id: 'wheelFL', accepts: 'wheel', required: true, anchor: { x: -0.85, y: 0.4, z: -0.85 }, installed: 'wheel.offroad' },
    { id: 'wheelFR', accepts: 'wheel', required: true, anchor: { x: 0.85, y: 0.4, z: -0.85 }, installed: 'wheel.offroad' },
    { id: 'wheelRL', accepts: 'wheel', required: true, anchor: { x: -0.85, y: 0.4, z: 0.85 }, installed: 'wheel.offroad' },
    // the missing one — a spare is stashed at the first cabin
    { id: 'wheelRR', accepts: 'wheel', required: true, anchor: { x: 0.85, y: 0.4, z: 0.85 }, installed: null, label: 'Rear Wheel' },
    { id: 'engine', accepts: 'engine', required: true, anchor: { x: 0, y: 0.7, z: 0.95 }, installed: 'engine.v6' },
    { id: 'seat', accepts: 'seat', required: true, anchor: { x: 0, y: 0.85, z: 0.1 }, installed: 'seat.std' },
    { id: 'body', accepts: 'body', required: true, anchor: { x: 0, y: 0.6, z: 0 }, installed: 'body.armor' },
    { id: 'headlights', accepts: 'headlights', required: false, anchor: { x: 0, y: 0.5, z: -1.2 }, installed: 'headlights.std' },
    { id: 'bumper', accepts: 'bumper', required: false, anchor: { x: 0, y: 0.42, z: -1.25 }, installed: 'bumper.bull' },
    // fuel line: severed, and the can is at the second cabin
    { id: 'fuel', accepts: 'fuel', required: true, anchor: { x: -0.55, y: 0.45, z: 1.15 }, installed: null, label: 'Fuel Line' },
    // fitted but faulty — each opens its own repair puzzle
    { id: 'battery', accepts: 'battery', required: true, anchor: { x: 0.55, y: 0.72, z: -0.7 }, installed: 'battery.hd', broken: 'fuse', label: 'Battery' },
    { id: 'brakes', accepts: 'brakes', required: true, anchor: { x: -0.85, y: 0.42, z: -0.85 }, installed: 'brakes.std', broken: 'bolt', label: 'Brakes' },
    { id: 'coolant', accepts: 'coolant', required: true, anchor: { x: 0, y: 0.62, z: -1.05 }, installed: 'coolant.std', broken: 'valve', label: 'Coolant Loop' },
    // optional: better recovery and a lit road
    { id: 'winch', accepts: 'winch', required: false, anchor: { x: 0, y: 0.42, z: -1.4 }, installed: null, label: 'Winch' },
    { id: 'rooflight', accepts: 'rooflight', required: false, anchor: { x: 0, y: 1.35, z: -0.2 }, installed: null, label: 'Roof Lights' },
  ];

  const items: ItemSpawn[] = [
    { kind: 'wrench', pos: on(0.025, -4, 0.6) },
    { kind: 'flashlight', pos: { x: cabinA.x + 1.2, y: cabinA.y + 0.9, z: cabinA.z + 2.2 } },
    { kind: 'wheel', variantId: 'wheel.offroad', pos: { x: cabinA.x - 1.8, y: cabinA.y + 0.45, z: cabinA.z + 2.3 } },
    { kind: 'medkit', pos: { x: cabinA.x + 2.2, y: cabinA.y + 0.9, z: cabinA.z + 1.6 } },
    { kind: 'fuel', variantId: 'fuel.can', pos: { x: cabinB.x - 1.5, y: cabinB.y + 0.5, z: cabinB.z + 2.4 } },
    { kind: 'flare', pos: { x: cabinB.x + 1.6, y: cabinB.y + 0.9, z: cabinB.z + 2.0 } },
    { kind: 'rooflight', variantId: 'rooflight.bar', pos: { x: cabinC.x - 1.6, y: cabinC.y + 0.6, z: cabinC.z + 2.3 } },
    { kind: 'medkit', pos: { x: cabinC.x + 2.0, y: cabinC.y + 0.9, z: cabinC.z + 1.8 } },
    // the cave's reward — only exists once the log has been recovered
    { kind: 'winch', variantId: 'winch.std', pos: { x: cavePos.x, y: cavePos.y + 0.6, z: cavePos.z + 3.2 }, lockedUntil: 'lore' },
  ];

  const stations: Station[] = [
    {
      id: 'chock',
      kind: 'chock',
      pos: { x: vehiclePos.x, y: vehiclePos.y + 0.6, z: vehiclePos.z },
      label: 'Chock the wheels',
      completes: 'stabilize',
    },
    {
      id: 'cave',
      kind: 'lore',
      pos: { x: cavePos.x, y: cavePos.y + 1.0, z: cavePos.z + 4.4 },
      label: 'Reroute the cave door panel',
    },
  ];

  return {
    id: 'mountains',
    title: 'SUMMER MOUNTAINS',
    subtitle: 'Company Contract · Vehicle Recovery',
    bounds: { minX: -260, maxX: 260, minZ: -260, maxZ: 260 },
    skyPreset: 'goldenHour',
    terrain: TERRAIN,
    solids,
    props,
    exterior: {
      skyTop: '#2f5f9e',
      skyHorizon: '#e6c79a',
      ground: 0x6d7f48,
      fogColor: 0xd8c0a2,
      fogNear: 70,
      fogFar: 520,
    },
    spawn: spawnPos,
    spawnYaw: Math.atan2(vehiclePos.x - spawnPos.x, vehiclePos.z - spawnPos.z) + Math.PI,
    vehicleSockets,
    vehicleStart: vehiclePos,
    vehicleYaw: Math.atan2(vehiclePos.x, vehiclePos.z) + Math.PI, // nose pointing at the drop
    vehicleColor: 0x2f7fd1,
    // It is genuinely rolling. Chock it or lose the contract.
    creep: { speed: 0.42, failAfter: 11 },
    items,
    stations,
    exfil: { pos: exfilPos, radius: 9 },
    objectives: [
      { id: 'stabilize', text: 'Chock the 4×4 before it rolls off the edge', marker: vehiclePos },
      { id: 'repair', text: 'Get every critical system to GO', marker: vehiclePos },
      { id: 'lore', text: "Find what the last team left in the cave", marker: cavePos, optional: true },
      { id: 'exfil', text: 'Drive the switchbacks down to the extraction lot', marker: exfilPos },
    ],
    hazards: {
      coldAltitude: 34,
      coldRate: 0.018,
      warmRate: 0.45,
      warmRadius: 8,
      coldDamage: 2.5,
    },
    // The summit camp keeps the opening repair area survivable; everything
    // above the tree line between the cabins is exposed.
    warmth: [summitCamp, cabinA, cabinB, cabinC, { x: exfilPos.x, y: exfilPos.y, z: exfilPos.z }],
    wolves: [road(0.38, -26), road(0.56, 24), road(0.75, -22), road(0.68, 27)],
    puzzleSeed: 4242,
    narrative: {
      intro:
        "That 4x4 on the ridge is a client's pride and joy, and right now it's trying to become a lawn ornament at the bottom of a cliff. Chock it, fix it, drive it down. Don't overthink it.",
      outro:
        "Vehicle's on the flatbed and the client's happy. Whatever you found in that cave — you didn't. Next job's a wet one.",
      lore: "That's... not our equipment. And that symbol isn't in any manual I've got. Bag it and forget it.",
      objectives: {
        stabilize: "Good. Now it's a repair job instead of an insurance claim.",
        repair: "All systems green. Take her down slow — those switchbacks have no guardrail worth the name.",
        lore: 'Somebody was up here before you. Company says no. Company says a lot of things.',
        exfil: '',
      },
      cold: "You're going blue. Find a fire or get in the cab.",
      wolf: 'Wolves on the treeline. Swing something at them or keep moving.',
      lowIntegrity: "That 4x4 is the whole contract. Stop hitting things with it.",
      fail: 'Well. That happened. Reset and try again.',
    },
  };
}
