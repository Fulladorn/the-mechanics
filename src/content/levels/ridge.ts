import type { Vec3 } from '../../shared/math';
import { Terrain } from '../../sim/terrain';
import type { World } from '../../sim/world';
import type { ItemSpawn } from '../../sim/items';
import { Kit, furnish } from '../kit';
import { natureColliders, scatter } from '../nature';
import {
  ATV_MACHINE,
  ATV_VEHICLE,
  GENERATOR,
  LOGGING_TRUCK,
  RANGER_PICKUP,
  RIDGEBACK_MACHINE,
  RIDGEBACK_VEHICLE,
} from '../vehicles/ridgeback';
import { RIDGE, RIDGE_TERRAIN } from './ridgeTerrain';
import type { BeatDef, LevelDef } from './types';

// THE RIDGE JOB — Kestrel Ridge, late afternoon into night.
//
// A private client's 4×4 was left at the summit overlook, and it has just
// started rolling toward the drop. Chock it, diagnose it, and put it back
// together from what the mountain has lying around: a wheel off the ranger's
// pickup, a battery out of a logging truck at the old sawmill, hoses and fuel
// from an RV at the lake. Then drive it down in the dark.
//
// Beats flow top-down; each system beat is "done when the system reads GO",
// so players who work out of order just see beats tick past.

const M = 'ridgeback';

export function makeRidge(): LevelDef {
  const t = Terrain.for(RIDGE_TERRAIN);
  const k = new Kit();
  const gy = (x: number, z: number) => t.heightAt(x, z);
  const at = (x: number, z: number, dy = 0): Vec3 => ({ x, y: gy(x, z) + dy, z });

  // --- the overlook ---------------------------------------------------------------------------
  const O = RIDGE.overlook;
  const oy = gy(O.x, O.z);
  const carPos = { x: RIDGE.car.x, y: gy(RIDGE.car.x, RIDGE.car.z) + 1.05, z: RIDGE.car.z };
  const van = { x: RIDGE.van.x, z: RIDGE.van.z };
  const vy = gy(van.x, van.z);
  k.prop('van', { x: van.x, y: vy, z: van.z }, 0.05, { color: 0xf1ede2, stripe: 0xff7a2f, open: true });
  k.block(van.x, vy, van.z, 2.0, 2.3, 4.8, 0.05, 'metal');
  k.prop('sign', { x: 11, y: oy + 2.2, z: -330 }, Math.PI / 2, { text: 'KESTREL RIDGE OVERLOOK · 2,114 m', w: 5.2, h: 0.8, post: true });
  furnish(k, 'bench', 29, oy, -330, -Math.PI / 2);
  k.prop('viewer', at(28.5, -345), 0.2);
  // The guard rail — with a truck-sized gap where the client's 4×4 is headed.
  for (const [x0, x1] of [
    [4, 15],
    [25, 36],
  ]) {
    k.prop('rail', at(x0, -357.5, 0), 0, { len: x1 - x0 });
    k.box({ x: (x0 + x1) / 2, y: gy((x0 + x1) / 2, -357.5) + 0.45, z: -357.5 }, { x: (x1 - x0) / 2, y: 0.45, z: 0.1 }, 0, 'metal');
  }
  k.prop('railBroken', at(19, -358), 0.3);

  // --- ranger station --------------------------------------------------------------------------
  const R = RIDGE.ranger;
  const ry = gy(R.x, R.z);
  const rx0 = R.x - 5;
  const rx1 = R.x + 5;
  const rz0 = R.z - 3.5;
  const rz1 = R.z + 3.5;
  const win = (s: number, e: number) => ({ s, e, y0: 1.0, y1: 2.0, glazed: true });
  k.room(rx0, rz0, rx1, rz1, ry, 3, 0.25, {
    w: [{ s: 2.6, e: 3.8, y0: 0, y1: 2.2 }, win(5, 6.4)],
    s: [win(2, 3.6), win(6.4, 8)],
    n: [win(3.6, 5.4)],
    e: [win(2.6, 4.4)],
  }, 'logs', 0x9a6a44);
  k.prop('roof', { x: R.x, y: ry + 3, z: R.z }, Math.PI / 2, { w: 8.2, d: 11.2, rise: 1.8, color: 0x3f5b3a });
  k.prop('slab', { x: R.x, y: ry + 0.02, z: R.z }, 0, { w: 9.9, d: 6.9, mat: 'planks' });
  k.prop('porch', { x: rx0 - 1.2, y: ry, z: R.z - 0.3 }, Math.PI / 2, { w: 5, d: 2.2 });
  k.prop('sign', { x: rx0 - 0.2, y: ry + 3.5, z: R.z }, -Math.PI / 2, { text: 'KESTREL RIDGE · RANGER STATION', w: 5, h: 0.7, style: 'wood' });
  furnish(k, 'workbench', R.x + 3.4, ry, rz0 + 0.55, 0);
  k.prop('mapBoard', { x: R.x - 1, y: ry + 1.7, z: rz0 + 0.16 }, 0);
  k.prop('keyHook', { x: rx1 - 0.14, y: ry + 1.55, z: R.z + 1.4 }, -Math.PI / 2);
  k.prop('radio', { x: R.x + 2.6, y: ry + 0.98, z: rz0 + 0.45 }, 0);
  k.prop('lamp', { x: R.x, y: ry + 2.9, z: R.z }, 0, { color: 0xffd9a8, power: 1.6, range: 8 });
  furnish(k, 'shelf', rx1 - 0.35, ry, R.z - 1.5, -Math.PI / 2, { fill: 'supplies' });
  k.prop('woodStove', { x: R.x - 3.8, y: ry, z: rz1 - 0.7 }, 0);
  // lived in: a cot, a table by the stove, rafters overhead
  furnish(k, 'cot', R.x + 2.3, ry, rz1 - 0.62, 0);
  k.prop('rug', { x: R.x - 0.4, y: ry + 0.03, z: R.z + 1.5 }, 0, { w: 2.4, d: 1.7 });
  furnish(k, 'crewTable', R.x - 0.4, ry, R.z + 1.5, 0.1);
  k.prop('trusses', { x: R.x, y: ry + 3, z: R.z }, Math.PI / 2, { w: 7.2, d: 10, rise: 1.8, n: 2, wood: true });
  k.prop('flagPole', at(rx0 - 4, R.z + 5), 0);
  k.prop('woodpile', at(rx1 + 1.2, R.z + 2), Math.PI / 2);
  k.block(rx1 + 1.2, ry, R.z + 2, 0.9, 1.1, 2.4, 0, 'wood');
  const pickup = { x: RIDGE.rangerPickup.x, z: RIDGE.rangerPickup.z };
  const py = gy(pickup.x, pickup.z);
  // blocks under the pickup (it's up for the winter)
  for (const [dx, dz] of [
    [-0.66, -1.42],
    [0.66, -1.42],
    [-0.66, 1.36],
    [0.66, 1.36],
  ])
    k.prop('cinderBlocks', { x: pickup.x + dz, y: py, z: pickup.z - dx }, Math.PI / 2);
  k.block(pickup.x, py, pickup.z, 5.0, 1.2, 2.0, 0, 'metal');

  // --- the sawmill -----------------------------------------------------------------------------
  const S = RIDGE.sawmill;
  const sy = gy(S.x, S.z);
  const sx0 = S.x - 8;
  const sx1 = S.x + 8;
  const sz0 = S.z - 10;
  const sz1 = S.z + 4;
  k.room(sx0, sz0, sx1, sz1, sy, 5.5, 0.3, {
    e: [{ s: 3, e: 11, y0: 0, y1: 4.6 }],
    n: [win(3, 5), win(11, 13)],
    s: [{ s: 2, e: 3.2, y0: 0, y1: 2.2 }],
  }, 'boards', 0x7d5d44);
  k.prop('roof', { x: S.x, y: sy + 5.5, z: (sz0 + sz1) / 2 }, Math.PI / 2, { w: 14.6, d: 16.6, rise: 2.4, color: 0x6c6f73 });
  k.prop('slab', { x: S.x, y: sy + 0.02, z: (sz0 + sz1) / 2 }, 0, { w: 15.5, d: 13.5, mat: 'dirtFloor' });
  k.prop('sign', { x: sx1 + 0.2, y: sy + 6.4, z: (sz0 + sz1) / 2 }, Math.PI / 2, { text: 'HALVORSEN TIMBER CO.', w: 6, h: 0.9, style: 'wood' });
  k.prop('lamp', { x: S.x, y: sy + 5.2, z: (sz0 + sz1) / 2 }, 0, { color: 0xffe6b8, power: 3, range: 14, flag: 'millPower' });
  // open-sided saw shed + log deck
  k.prop('sawShed', at(S.x + 4, S.z + 14), 0);
  k.block(S.x + 4, sy, S.z + 14, 10, 1.1, 3, 0, 'wood');
  for (let i = 0; i < 4; i++) {
    k.prop('logPile', at(S.x - 14 + i * 1.5, S.z + 12 + i * 5.5), 0.1 * i);
    k.block(S.x - 14 + i * 1.5, gy(S.x - 14 + i * 1.5, S.z + 12 + i * 5.5), S.z + 12 + i * 5.5, 7, 1.6, 2.6, 0.1 * i, 'wood');
  }
  const gen = { x: sx1 + 3, z: sz0 + 1.5 };
  k.prop('cable', at(gen.x - 1, gen.z + 0.5), 0, { len: 3 });
  k.prop('drum', at(sx1 + 2, sz1 + 3), 0, { color: 0x3f6d8f });
  k.prop('drum', at(sx1 + 2.8, sz1 + 3.4), 0, { color: 0xb44a2c });
  k.prop('pallet', at(sx0 - 2, S.z - 4), 0.2);

  // --- campground ------------------------------------------------------------------------------
  const C = RIDGE.camp;
  const cy = gy(C.x, C.z);
  const rv = { x: C.x + 7, z: C.z + 3, yaw: -0.35 };
  k.prop('rv', { x: rv.x, y: gy(rv.x, rv.z), z: rv.z }, rv.yaw, { color: 0xefe6d2, stripe: 0x3d7ea6 });
  k.block(rv.x, gy(rv.x, rv.z), rv.z, 8.4, 3.2, 2.5, rv.yaw, 'metal');
  const rvLocal = (lx: number, lz: number, dy: number): Vec3 => {
    const c = Math.cos(rv.yaw);
    const s = Math.sin(rv.yaw);
    const x = rv.x + lx * c + lz * s;
    const z = rv.z - lx * s + lz * c;
    return { x, y: gy(x, z) + dy, z };
  };
  const rvBin = rvLocal(-1.6, 1.3, 0.75);
  const rvFiller = rvLocal(2.6, 1.3, 1.0);
  const fire = at(C.x - 4, C.z + 2);
  k.prop('campfire', fire, 0, { flag: 'dusk' });
  for (const [dx, dz, yaw] of [
    [-10, -4, 0.5],
    [-8, 7, -0.4],
    [3, 10, 2.2],
  ])
    k.prop('tent', at(C.x + dx, C.z + dz), yaw, { color: dx < 0 ? 0xd9643a : 0x5b8f4c });
  for (const [dx, dz, yaw] of [
    [-3, -6, 0.2],
    [6, -7, -0.1],
  ]) {
    furnish(k, 'picnicTable', C.x + dx, gy(C.x + dx, C.z + dz), C.z + dz, yaw);
  }
  k.prop('dock', at(C.x + 30, C.z + 36, -0.2), -0.7, { len: 14 });
  k.prop('canoe', at(C.x + 22, C.z + 30, 0.1), 0.9);
  k.prop('sign', at(C.x - 14, C.z - 8, 2), -2.36, { text: 'LAKESIDE CAMPGROUND', w: 4, h: 0.7, style: 'wood', post: true });

  // --- fire lookout tower ----------------------------------------------------------------------
  const T = RIDGE.tower;
  const ty = gy(T.x, T.z);
  const TH = 9;
  k.prop('lookout', { x: T.x, y: ty, z: T.z }, 0, { h: TH });
  // legs
  for (const [dx, dz] of [
    [-2, -2],
    [2, -2],
    [-2, 2],
    [2, 2],
  ])
    k.box({ x: T.x + dx, y: ty + TH / 2, z: T.z + dz }, { x: 0.15, y: TH / 2, z: 0.15 }, 0, 'wood');
  // platform + cabin walls with a doorway on the stair side
  k.box({ x: T.x, y: ty + TH - 0.1, z: T.z }, { x: 2.4, y: 0.1, z: 2.4 }, 0, 'wood');
  k.box({ x: T.x, y: ty + TH + 0.5, z: T.z - 2.35 }, { x: 2.4, y: 0.5, z: 0.05 }, 0, 'wood');
  k.box({ x: T.x - 2.35, y: ty + TH + 0.5, z: T.z }, { x: 0.05, y: 0.5, z: 2.4 }, 0, 'wood');
  k.box({ x: T.x + 2.35, y: ty + TH + 0.5, z: T.z - 0.7 }, { x: 0.05, y: 0.5, z: 1.7 }, 0, 'wood');
  k.box({ x: T.x, y: ty + TH + 0.5, z: T.z + 2.35 }, { x: 2.4, y: 0.5, z: 0.05 }, 0, 'wood');
  // switchback stairs up the east side: two flights and a landing
  const flight = (x: number, z0: number, z1: number, y0: number, y1: number) => {
    const len = Math.hypot(z1 - z0, y1 - y0);
    const pitch = Math.atan2(y1 - y0, z1 - z0);
    k.statics.push({
      shape: 'box',
      pos: { x, y: (y0 + y1) / 2 - 0.08, z: (z0 + z1) / 2 },
      size: { x: 0.55, y: 0.08, z: len / 2 },
      yaw: 0,
      pitch: -pitch,
      surface: 'wood',
    });
  };
  flight(T.x + 3.0, T.z + 3.2, T.z - 2.6, ty, ty + TH / 2);
  k.box({ x: T.x + 3.0, y: ty + TH / 2 - 0.08, z: T.z - 3.2 }, { x: 0.6, y: 0.08, z: 0.6 }, 0, 'wood');
  flight(T.x + 4.2, T.z - 3.2, T.z + 1.6, ty + TH / 2, ty + TH);
  k.box({ x: T.x + 3.4, y: ty + TH - 0.08, z: T.z + 1.9 }, { x: 1.2, y: 0.08, z: 0.5 }, 0, 'wood');

  // --- the old mine ----------------------------------------------------------------------------
  const Mi = RIDGE.mine;
  const my = gy(Mi.x, Mi.z);
  k.prop('minePortal', { x: Mi.x, y: my, z: Mi.z }, -Math.PI / 2);
  // a timbered tunnel running west into the hill
  for (const sd of [-1, 1]) k.box({ x: Mi.x - 7, y: my + 1.4, z: Mi.z + sd * 1.8 }, { x: 7, y: 1.6, z: 0.2 }, 0, 'rock');
  k.box({ x: Mi.x - 7, y: my + 3.1, z: Mi.z }, { x: 7, y: 0.2, z: 2 }, 0, 'rock');
  k.box({ x: Mi.x - 14.2, y: my + 1.4, z: Mi.z }, { x: 0.2, y: 1.6, z: 2 }, 0, 'rock');
  k.prop('mineTunnel', { x: Mi.x, y: my, z: Mi.z }, 0, { len: 14 });
  // the hill the drift runs into (drawn by mineTunnel): keep people out of it
  for (const sd of [-1, 1]) {
    k.box({ x: Mi.x - 8.3, y: my + 2, z: Mi.z + sd * 3.95 }, { x: 7.4, y: 3, z: 1.55 }, 0, 'rock');
    k.box({ x: Mi.x - 8.3, y: my + 2, z: Mi.z + sd * 7.75 }, { x: 5.3, y: 3, z: 2.25 }, 0, 'rock');
  }
  k.prop('mineCart', { x: Mi.x - 5, y: my, z: Mi.z + 0.6 }, 0);
  k.block(Mi.x - 5, my, Mi.z + 0.6, 1.4, 1.1, 0.9, 0, 'metal');
  k.prop('lantern', { x: Mi.x - 12, y: my + 1.2, z: Mi.z - 1.5 }, 0);

  // --- bridge, rockslide, ford -----------------------------------------------------------------
  const B = RIDGE.bridge;
  const deckY = 22.8;
  k.box({ x: B.x, y: deckY - 0.25, z: B.z }, { x: 3.5, y: 0.25, z: 18 }, 0, 'wood');
  for (const sd of [-1, 1]) k.box({ x: B.x + sd * 3.6, y: deckY + 0.5, z: B.z }, { x: 0.1, y: 0.5, z: 18 }, 0, 'wood');
  k.prop('bridge', { x: B.x, y: deckY, z: B.z }, 0, { len: 36, w: 7, depth: deckY - 12 });
  const SL = RIDGE.slide;
  const slideY = gy(SL.x, SL.z);
  k.prop('rockslide', { x: SL.x, y: slideY, z: SL.z }, 0.2, { flag: 'slide' });
  for (let i = 0; i < 7; i++) {
    const x = SL.x - 6 + i * 2;
    const z = SL.z + Math.sin(i * 1.7) * 1.2;
    k.statics.push({ shape: 'ball', pos: { x, y: gy(x, z) + 0.6, z }, size: { x: 1.5, y: 0, z: 0 }, surface: 'rock', flag: 'slide' });
  }
  k.prop('fordPosts', at(RIDGE.ford.x, RIDGE.ford.z), 0);

  // --- the Company's crashed van (lore) ------------------------------------------------------------
  const wreck = at(-66, 186);
  k.prop('van', { x: wreck.x, y: wreck.y + 1.0, z: wreck.z }, 2.3, { color: 0xd9d3c4, stripe: 0xff7a2f, wrecked: true });
  k.block(wreck.x, wreck.y, wreck.z, 2.0, 2.0, 4.8, 2.3, 'metal');
  // what it was carrying: sealed crates, one split open, thrown clear
  furnish(k, 'crate', wreck.x + 2.6, wreck.y, wreck.z + 1.8, 0.7);
  k.prop('crate', at(wreck.x - 1.2, wreck.z + 3.4, -0.25), 1.9, undefined, 0.7);
  k.prop('crate', at(wreck.x + 3.8, wreck.z - 1.2, -0.3), 0.3, undefined, 0.6);

  // --- extraction lot ---------------------------------------------------------------------------
  const L = RIDGE.lot;
  const ly = gy(L.x, L.z);
  k.prop('flatbed', { x: L.x + 7, y: ly, z: L.z + 4 }, Math.PI, { color: 0xf1ede2, stripe: 0xff7a2f });
  k.block(L.x + 7, ly, L.z + 4, 2.5, 2.8, 9.5, Math.PI, 'metal');
  k.prop('parkingBay', { x: L.x - 3, y: ly + 0.03, z: L.z }, 0, { w: 3.6, d: 6.4 });
  k.prop('lampPost', { x: L.x - 8, y: ly, z: L.z - 6 }, 0.6, { on: true });
  k.prop('lampPost', { x: L.x + 12, y: ly, z: L.z - 6 }, -0.6, { on: true });
  k.prop('sign', { x: L.x, y: ly + 3, z: L.z - 12 }, 0, { text: 'THE COMPANY · PICKUP', w: 4.2, h: 0.8, post: true });
  for (let i = 0; i < 6; i++) k.prop('cone', at(L.x - 9 + i * 3.6, L.z - 10), 0);

  // --- signposts ----------------------------------------------------------------------------------
  const J = RIDGE.junction;
  k.prop('fingerpost', at(J.x + 5, J.z - 4), 0, { a: 'SAWMILL', ay: Math.PI, b: 'CAMPGROUND', by: 0, c: 'VALLEY', cy: -Math.PI / 2 });
  k.prop('fingerpost', at(-44, -156), 0.4, { a: 'RANGER STN', ay: 0, b: 'OVERLOOK', by: Math.PI / 2 });
  k.prop('fingerpost', at(-86, -274), 0, { a: 'OLD MINE', ay: Math.PI, b: 'SUMMIT', by: Math.PI / 2 });
  k.prop('fingerpost', at(-6, 62), 0, { a: 'LOGGING RD', ay: Math.PI, b: 'BRIDGE', by: -Math.PI / 2 });
  // power poles along the main road for scale
  for (let i = 0; i < 14; i++) {
    const p = t.roadPoint('south2', i / 13);
    k.prop('powerPole', at(p.x + 6, p.z), 0);
  }

  // --- the land ------------------------------------------------------------------------------------
  const keepClear: { x: number; z: number; r: number }[] = [
    { x: O.x, z: O.z + 10, r: 34 },
    { x: R.x, z: R.z + 5, r: 26 },
    { x: S.x, z: S.z, r: 34 },
    { x: C.x + 6, z: C.z + 8, r: 26 },
    { x: T.x, z: T.z, r: 9 },
    { x: Mi.x - 6, z: Mi.z, r: 14 },
    { x: L.x, z: L.z, r: 26 },
    { x: B.x, z: B.z, r: 22 },
    { x: RIDGE.ford.x, z: RIDGE.ford.z, r: 14 },
  ];
  const wl = RIDGE_TERRAIN.waterLevel!;
  const open = (x: number, z: number, tt: Terrain) => {
    for (const c of keepClear) if (Math.hypot(x - c.x, z - c.z) < c.r) return 0;
    if (tt.heightAt(x, z) < wl + 0.6) return 0;
    const road = tt.roadAt(x, z, 10);
    if (road.road >= 0 && road.dist < tt.roads[road.road].def.halfWidth + 2.5) return 0;
    return 1;
  };
  const alt = (x: number, z: number, tt: Terrain) => tt.heightAt(x, z);
  const nature = scatter(
    t,
    [
      { kind: 'pine', count: 2400, where: (x, z, tt) => open(x, z, tt) * (tt.slopeAt(x, z) < 0.35 ? 1 : 0.25) * (alt(x, z, tt) > 30 ? 1 : 0.55), scale: [0.9, 1.7], gap: 3.2 },
      { kind: 'fir', count: 900, where: (x, z, tt) => open(x, z, tt) * (alt(x, z, tt) > 50 ? 1 : 0.2), scale: [0.9, 1.5], gap: 3.4 },
      { kind: 'broadleaf', count: 380, where: (x, z, tt) => open(x, z, tt) * (alt(x, z, tt) < 34 ? 1 : 0.1), scale: [0.9, 1.4], gap: 5 },
      { kind: 'birch', count: 300, where: (x, z, tt) => open(x, z, tt) * (alt(x, z, tt) < 40 ? 1 : 0.2), scale: [0.8, 1.2], gap: 3 },
      { kind: 'deadTree', count: 60, where: (x, z, tt) => open(x, z, tt) * (alt(x, z, tt) > 70 ? 1 : 0.1), scale: [0.8, 1.3], gap: 5 },
      { kind: 'bush', count: 1400, where: open, scale: [0.7, 1.4], gap: 2 },
      { kind: 'boulder', count: 260, where: (x, z, tt) => open(x, z, tt) * (0.3 + tt.slopeAt(x, z) * 2), scale: [0.8, 2.2], gap: 4 },
      { kind: 'rock', count: 700, where: open, scale: [0.4, 1.1], gap: 2 },
      { kind: 'stump', count: 120, where: (x, z, tt) => open(x, z, tt) * (Math.hypot(x - S.x, z - S.z) < 110 ? 1 : 0.1), scale: [0.8, 1.2], gap: 2 },
      { kind: 'log', count: 60, where: open, scale: [0.8, 1.2], gap: 4 },
    ],
    5151,
    395,
  );
  k.statics.push(...natureColliders(nature));

  // --- items --------------------------------------------------------------------------------------
  const vanRear = (dx: number, dy = 0.4): Vec3 => ({ x: van.x + dx, y: vy + dy, z: van.z + 2.9 });
  const items: ItemSpawn[] = [
    { kind: 'chock', pos: vanRear(-0.5) },
    { kind: 'chock', pos: vanRear(0.5) },
    { kind: 'flare', pos: vanRear(0, 0.9) },
    { kind: 'coolant', fill: 1, pos: vanRear(0.9, 0.5) },
    { kind: 'jack', pos: { x: carPos.x + 1.7, y: gy(carPos.x + 1.7, carPos.z + 4) + 0.3, z: carPos.z + 4 } },
    // ranger station
    { kind: 'key', tag: 'ranger', pos: { x: pickup.x + 0.6, y: py + 1.24, z: pickup.z - 0.3 }, pinned: true },
    { kind: 'key', tag: 'ATV', pos: { x: rx1 - 0.2, y: ry + 1.4, z: R.z + 1.4 }, pinned: true },
    { kind: 'flare', pos: { x: R.x + 3.8, y: ry + 1.0, z: rz0 + 0.45 } },
    { kind: 'flare', pos: { x: R.x + 4.0, y: ry + 1.0, z: rz0 + 0.6 } },
    { kind: 'medkit', pos: { x: rx1 - 0.4, y: ry + 1.3, z: R.z - 1.2 } },
    // sawmill
    { kind: 'jerrycan', fill: 1, pos: { x: gen.x - 1.2, y: gy(gen.x - 1.2, gen.z + 1) + 0.3, z: gen.z + 1 } },
    // RV storage bin
    { kind: 'fuelHose', pos: { x: rvBin.x, y: rvBin.y - 0.1, z: rvBin.z }, hiddenUntil: 'rvBin' },
    { kind: 'radiatorHose', pos: { x: rvBin.x + 0.4, y: rvBin.y - 0.1, z: rvBin.z + 0.2 }, hiddenUntil: 'rvBin' },
    { kind: 'medkit', pos: { x: fire.x + 1.5, y: fire.y + 0.3, z: fire.z - 1.5 } },
    // extras
    { kind: 'winch', pos: { x: Mi.x - 12.5, y: my + 0.3, z: Mi.z + 1 } },
    { kind: 'lightbar', pos: { x: T.x - 1, y: ty + TH + 0.2, z: T.z - 1 } },
  ];

  // --- beats --------------------------------------------------------------------------------------
  const car = (w: World) => w.vehicle(M);
  const step = (w: World, sys: string) => w.machine(M).nextStep(sys, w.ctx);
  const stepMarker = (w: World, sys: string): Vec3 | null => {
    const s = step(w, sys);
    if (!s) return null;
    if (s.need && !w.carrying(s.need)) {
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
    start: (w) => {
      if (!w.systemOk(M, sys)) w.say(start);
    },
    done: (w) => w.systemOk(M, sys),
    hints,
  });
  const nearCar = (w: World, r: number) => w.near(car(w).pos, r);
  const onFoot = (w: World) => w.player.mode === 'foot';

  // Restores for checkpoints ---------------------------------------------------------------------
  const restoreChocked = (w: World) => {
    w.consume('chock', 2);
    w.fit(M, 'chockL', { kind: 'chock', pos: carPos });
    w.fit(M, 'chockR', { kind: 'chock', pos: carPos });
    w.placeVehicle(M, carPos, 0);
    w.giveBelt('wrench');
    w.giveBelt('flashlight');
    w.machine(M).state.inspected = true;
    w.teleport({ x: carPos.x - 3, y: gy(carPos.x - 3, carPos.z + 5), z: carPos.z + 5 }, 0.5);
  };
  const restoreWheel = (w: World) => {
    w.fit(M, 'wheelFL', { kind: 'wheel', variant: 'truck', pos: carPos });
    w.setFlag('stationOpen');
    w.openDoor('rangerDoor');
    w.setFlag('map');
    w.givePocket('ranger');
    w.givePocket('ATV');
    const pu = w.machine('rangerPickup');
    const old = w.items.get(pu.state.slots.wheelFL);
    if (old) w.items.take(old, 'gone');
    pu.state.slots.wheelFL = null;
    w.placeVehicle('atv', { x: carPos.x + 5, y: carPos.y, z: carPos.z + 8 }, 0.4);
    w.teleport({ x: carPos.x - 3, y: gy(carPos.x - 3, carPos.z + 5), z: carPos.z + 5 }, 0.5);
  };
  const restoreAllGo = (w: World) => {
    w.fit(M, 'battery', { kind: 'battery', pos: carPos });
    w.fit(M, 'fuelLine', { kind: 'fuelHose', pos: carPos });
    w.fit(M, 'radHose', { kind: 'radiatorHose', pos: carPos });
    const m = w.machine(M);
    m.state.fluids.fuel = 0.6;
    m.state.fluids.coolant = 0.8;
    m.solvePanel('bleed', w.ctx);
    m.solvePanel('ignition', w.ctx);
    m.state.covers.hood = false;
    const lt = w.machine('loggingTruck');
    const b = w.items.get(lt.state.slots.battery);
    if (b) w.items.take(b, 'gone');
    lt.state.slots.battery = null;
    w.setFlag('millPower');
    w.openDoor('shed');
    w.setFlag('rvBin');
    w.setFlag('dusk');
    w.consume('fuelHose');
    w.consume('radiatorHose');
    w.teleport({ x: carPos.x - 3, y: gy(carPos.x - 3, carPos.z + 5), z: carPos.z + 5 }, 0.5);
  };

  const beats: BeatDef[] = [
    {
      id: 'chock',
      text: 'It’s rolling — chock the front wheels!',
      detail: (w) => {
        const n = ['chockL', 'chockR'].filter((s) => w.machine(M).slotItem(w.items, s)).length;
        if (w.carrying('chock')) return `Put it in front of a front tyre (${n}/2)`;
        return `Chocks are in the back of the van (${n}/2)`;
      },
      marker: (w) => {
        if (w.carrying('chock')) return stepMarker(w, 'stabilize');
        return w.nearestItem('chock')?.pos ?? stepMarker(w, 'stabilize');
      },
      start: (w) => {
        w.giveBelt('wrench');
        w.giveBelt('flashlight');
        w.say('Client says his 4×4’s at the overlook, handbrake on. Easy one. …Wait. Is that thing MOVING? Chocks! Back of the van! GO!');
        w.setFlag('creeping');
      },
      done: (w) => w.systemOk(M, 'stabilize'),
      finish: (w) => {
        w.stamp('SECURED', 'Nobody saw that');
        w.say('…Okay. Okay. Breathe. The handbrake cable’s been cut clean through. Have a proper look at it before we do anything else.');
      },
      hints: [
        [12, 'Grab a chock from the van, run it to a front tyre, E to wedge it in.'],
        [35, 'Two chocks. Both front wheels. Quick!'],
      ],
      checkpoint: true,
      restore: restoreChocked,
      hour: 17.8,
    },
    {
      id: 'inspect',
      text: 'Inspect the Ridgeback',
      detail: 'Look at it and hold E',
      marker: (w) => car(w).pos,
      done: (w) => w.machine(M).state.inspected,
      finish: (w) =>
        w.say('Flat front tyre, cracked battery, split hoses, bone-dry tank, and the ignition fuses have been pulled and shoved back wrong. Somebody really didn’t want this truck leaving. Hold Tab for the job sheet.'),
      hints: [[25, 'Stand next to it, look at it, hold E.']],
    },
    {
      id: 'jack',
      text: 'Find a new wheel',
      detail: 'Ranger station is down the switchbacks — follow the road',
      marker: () => at(R.x - 8, R.z),
      start: (w) => w.say('The ranger station’s just down the road. Rangers always have spares. Its own jack is behind the truck — you’ll want it later.'),
      done: (w) => w.near(at(R.x, R.z), 22),
      hints: [
        [70, 'Straight down the road. Mind the hairpins — and the edge.'],
        [160, 'Still walking? The station’s the log cabin with the green roof.'],
      ],
    },
    {
      id: 'station',
      text: 'Get into the ranger station',
      detail: (w) => (w.hasItem('key', 'ranger') ? 'You’ve got the key' : 'Locked. Rangers keep a spare in the truck'),
      marker: (w) => (w.hasItem('key', 'ranger') ? at(rx0, R.z - 0.8, 1) : w.items.list.find((i) => i.kind === 'key' && i.tag === 'ranger')?.pos ?? null),
      start: (w) => w.say('Locked, naturally. There’s a ranger pickup round the back — they always leave a spare key on the dash.'),
      done: (w) => !!w.doors.get('rangerDoor')?.open,
      finish: (w) => w.setFlag('stationOpen'),
      hints: [[45, 'Behind the cabin. The green pickup up on blocks.']],
    },
    {
      id: 'map',
      text: 'Check the map board',
      detail: 'It’s on the back wall',
      marker: () => ({ x: R.x - 1, y: ry + 1.7, z: rz0 + 0.3 }),
      done: (w) => w.flag('map'),
      finish: (w) =>
        w.say('Sawmill west, campground on the lake east, old mine up the hill. And a fire lookout on that knoll. Grab what’s useful — flares, the first-aid kit, and that ATV key on the hook.'),
      hints: [[30, 'Big map on the wall. Look at it, E.']],
    },
    {
      id: 'wheel',
      text: 'Take a wheel off the ranger’s pickup',
      detail: (w) => step(w, 'wheel') && !w.carrying('wheel') ? 'It’s up on blocks — just undo the lug nuts' : 'Got it',
      marker: (w) => (w.carrying('wheel') ? null : w.machine('rangerPickup').world({ x: -0.8, y: -0.5, z: -1.42 })),
      done: (w) => w.carrying('wheel') || w.systemOk(M, 'wheel'),
      finish: (w) => w.say('Heavy, isn’t it. Strap it to the ATV’s rack — E at the back of the quad — and ride it up. Key’s on the hook inside.'),
      hints: [[60, 'Wrench on each lug nut — hold the mouse button till it spins off.']],
    },
    {
      id: 'ride',
      text: 'Get the wheel back up to the Ridgeback',
      detail: (w) => (w.player.mode === 'drive' ? 'Back up the switchbacks' : w.hasItem('key', 'ATV') ? 'Strap it on the ATV and ride' : 'ATV key is on the hook in the station'),
      marker: (w) => (w.player.mode === 'drive' ? car(w).pos : w.hasItem('key', 'ATV') ? w.vehicle('atv').pos : { x: rx1 - 0.2, y: ry + 1.4, z: R.z + 1.4 }),
      done: (w) => (nearCar(w, 14) && w.carrying('wheel')) || w.systemOk(M, 'wheel'),
      hour: 18.3,
    },
    systemBeat('fitwheel', 'wheel', 'Swap the front-left wheel', 'Jack under the front, nuts off, shredded wheel off, new one on, torque it, lower it.', [
      [80, 'Hold Tab — the job sheet has the next step.'],
    ]),
    {
      id: 'wheeldone',
      text: 'Wheel’s on',
      done: () => true,
      finish: (w) => {
        w.say('Nice. Battery next — the old Halvorsen sawmill had logging trucks. West at the junction. Take the quad.');
      },
      checkpoint: true,
      restore: restoreWheel,
    },
    {
      id: 'sawmill',
      text: 'Head to the old sawmill',
      detail: 'West at the junction',
      marker: () => at(S.x + 14, S.z),
      done: (w) => w.near(at(S.x, S.z), 34),
      hour: 18.8,
      hints: [[120, 'Down to the junction, then follow the sign for the sawmill.']],
    },
    {
      id: 'power',
      text: 'Get power to the mill',
      detail: (w) => (w.systemOk('generator', 'fuel') ? 'Pull the generator’s start cord (hold E)' : 'The generator needs fuel — there’s a jerry can'),
      marker: (w) => (w.systemOk('generator', 'fuel') || w.carrying('jerrycan') ? at(gen.x, gen.z, 0.7) : w.nearestItem('jerrycan', false)?.pos ?? null),
      start: (w) => w.say('Shed door’s electric and the power’s off. There’s a generator round the side. Save some fuel for your truck if you can.'),
      done: (w) => w.flag('millPower'),
      finish: (w) => w.say('And there’s your logging truck. Battery box is behind the cab.'),
      hints: [[60, 'Pour the jerry can into the generator, then hold E on it to pull the cord.']],
    },
    {
      id: 'battery',
      text: 'Pull the logging truck’s battery',
      detail: (w) => {
        const lt = w.machine('loggingTruck');
        if (!lt.state.covers.box) return 'Open the battery box';
        if (lt.state.terminals.batt?.neg) return 'Black terminal off first';
        if (lt.state.terminals.batt?.pos) return 'Now the red one';
        if (lt.slotItem(w.items, 'battery')) return 'Undo the hold-down, lift it out';
        return 'Got it';
      },
      marker: (w) => (w.carrying('battery') ? null : w.machine('loggingTruck').world({ x: 1.2, y: -0.2, z: -0.6 })),
      done: (w) => w.carrying('battery') || w.systemOk(M, 'battery'),
      finish: (w) => w.say('Good. Hoses next: there’s an RV at the lakeside campground. And fuel — RVs carry plenty. Sun’s going, so shift.'),
    },
    {
      id: 'camp',
      text: 'Go to the lakeside campground',
      detail: 'East at the junction, down by the lake',
      marker: () => at(C.x, C.z),
      start: (w) => w.setFlag('dusk'),
      done: (w) => w.near(at(C.x, C.z), 26),
      hour: 19.5,
      hints: [[120, 'Junction, then east. Follow the lake.']],
    },
    {
      id: 'hoses',
      text: 'Raid the RV',
      detail: (w) => {
        const need: string[] = [];
        if (!w.carrying('fuelHose') && !w.systemOk(M, 'fuel')) need.push('fuel line');
        if (!w.carrying('radiatorHose') && !w.systemOk(M, 'coolant')) need.push('radiator hose');
        if (!w.flag('siphoned') && !w.systemOk(M, 'fuel')) need.push('fuel (siphon into the jerry can)');
        return need.length ? `Need: ${need.join(', ')}` : 'Got everything';
      },
      marker: (w) => {
        if (!w.flag('rvBin')) return rvBin;
        if (!w.carrying('fuelHose') && !w.systemOk(M, 'fuel')) return w.nearestItem('fuelHose')?.pos ?? rvBin;
        if (!w.carrying('radiatorHose') && !w.systemOk(M, 'coolant')) return w.nearestItem('radiatorHose')?.pos ?? rvBin;
        return rvFiller;
      },
      start: (w) => w.say('Wolves come down to the lake at dusk. Keep a flare handy — they won’t go near one.'),
      done: (w) =>
        (w.carrying('fuelHose') || w.systemOk(M, 'fuel')) &&
        (w.carrying('radiatorHose') || w.systemOk(M, 'coolant')) &&
        (w.flag('siphoned') || w.systemOk(M, 'fuel')),
      finish: (w) => w.say('That’s the lot. Back up to the Ridgeback — and don’t hang about.'),
      hints: [[60, 'Storage bin on the side of the RV. Fuel filler at the back — hold E with the jerry can in your hands to siphon.']],
    },
    systemBeat('fitbattery', 'battery', 'Fit the battery', 'Hood up. Black off, red off, hold-down, swap, and back on — red first.', [[90, 'Tab for the job sheet.']]),
    systemBeat('fitfuel', 'fuel', 'Fix the fuel line and fill up', 'New fuel line first — it’s under the back, two clamps — THEN pour, or it goes straight on the ground.', [[90, 'Under the rear, passenger side.']]),
    systemBeat('fitcoolant', 'coolant', 'Fix the cooling system', 'Radiator hose, coolant, then bleed the air out with the valves.', [[90, 'Bring every needle into the green, then pull the lever.']]),
    systemBeat('fitignition', 'ignition', 'Sort out the ignition fuses', 'Last one: the ignition fuse panel. Someone scrambled it on purpose.', [[60, 'Each fuse flips its neighbours.']]),
    {
      id: 'start',
      text: 'Start her up',
      detail: (w) => w.machine(M).readyToDrive(w.items) ?? 'Driver’s door — E',
      marker: (w) => car(w).world(RIDGEBACK_VEHICLE.door.pos),
      start: (w) => {
        w.stamp('ALL SYSTEMS GO', 'The Ridgeback', 'good');
        w.say('Everything reads green. Drop the hood and fire it up — the chocks will pop out when you roll.');
      },
      done: (w) => w.player.mode === 'drive' && w.player.vehicle === M && car(w).running,
      finish: (w) => w.say('Listen to that. Now bring it down to the valley — the Company flatbed’s waiting at the bottom. Lights on: L.'),
      checkpoint: true,
      restore: restoreAllGo,
      hour: 20.2,
    },
    {
      id: 'descent',
      text: 'Drive down to the Company lot',
      detail: (w) => (w.flag('slide') && !w.flag('forded') ? 'Road’s blocked — take the logging track and ford the creek' : 'Follow the road to the valley floor'),
      marker: (w) => {
        if (w.flag('slide') && !w.flag('forded')) return at(RIDGE.ford.x, RIDGE.ford.z);
        return at(L.x - 3, L.z);
      },
      done: (w) => w.flag('reachedLot'),
      hour: 20.8,
      hints: [[240, 'Just keep heading down. The lot’s at the very bottom of the valley.']],
    },
    {
      id: 'park',
      text: 'Park it by the flatbed',
      detail: 'In the painted bay, then stop',
      marker: () => at(L.x - 3, L.z),
      done: (w) => {
        const v = car(w);
        return Math.hypot(v.pos.x - (L.x - 3), v.pos.z - L.z) < 2.6 && Math.abs(v.speed) < 0.8;
      },
      finish: (w) => {
        w.stamp('DELIVERED', 'The Ridge Job');
        w.say('Delivered. Good work up there, mechanic. Company’s going to want to hear about those cut cables… and so do I.');
      },
    },
  ];

  const wolfSpots = [
    { pos: at(C.x - 30, C.z - 20), after: 'dusk' },
    { pos: at(C.x - 24, C.z + 26), after: 'dusk' },
    { pos: at(C.x + 12, C.z - 28), after: 'dusk' },
    { pos: at(-70, 110), after: 'slide' },
    { pos: at(-120, 160), after: 'slide' },
  ];

  let creepT = 0;
  return {
    id: 'ridge',
    title: 'THE RIDGE JOB',
    subtitle: 'Kestrel Ridge · Private client',
    env: 'mountain',
    terrain: RIDGE_TERRAIN,
    hour: 17.6,
    sunset: 250,
    attract: { target: { x: carPos.x, y: carPos.y, z: carPos.z }, radius: 11, height: 2.4, hour: 19.4, speed: 0.05 },
    statics: k.statics,
    props: k.props,
    nature,
    ground: [
      // the drift floor (no grass under the rock) and the spoil apron out front
      { x0: Mi.x - 15, z0: Mi.z - 2.3, x1: Mi.x + 0.4, z1: Mi.z + 2.3, color: 0x4e4338, grass: 0 },
      { x0: Mi.x - 2, z0: Mi.z - 6, x1: Mi.x + 10, z1: Mi.z + 6, color: 0x8b7a62, grass: 0.1, feather: 3.5 },
      // the Company's pickup lot: a graded gravel pad
      { x0: RIDGE.lot.x - 15, z0: RIDGE.lot.z - 13, x1: RIDGE.lot.x + 17, z1: RIDGE.lot.z + 11, color: 0x8e8574, grass: 0, feather: 2.5 },
    ],
    items,
    machines: [
      {
        key: M,
        def: RIDGEBACK_MACHINE,
        vehicle: RIDGEBACK_VEHICLE,
        model: 'ridgeback',
        pos: carPos,
        yaw: 0,
        paint: 0xc9cdd2,
        mounts: {
          wheelFL: { kind: 'wheel', pos: carPos, variant: 'offroad', cond: 'bad' },
          wheelFR: { kind: 'wheel', pos: carPos, variant: 'offroad' },
          wheelRL: { kind: 'wheel', pos: carPos, variant: 'offroad' },
          wheelRR: { kind: 'wheel', pos: carPos, variant: 'offroad' },
          battery: { kind: 'battery', pos: carPos, cond: 'bad' },
          radHose: { kind: 'radiatorHose', pos: carPos, cond: 'bad' },
          fuelLine: { kind: 'fuelHose', pos: carPos, cond: 'bad' },
        },
        pin: (w) => w.systemOk(M, 'stabilize') && !(w.player.mode === 'drive' && w.player.vehicle === M),
      },
      {
        key: 'atv',
        def: ATV_MACHINE,
        vehicle: ATV_VEHICLE,
        model: 'atv',
        pos: { x: rx1 + 3.5, y: ry + 0.75, z: R.z - 2 },
        yaw: -Math.PI / 2,
        paint: 0x3f6d3a,
        needsKey: 'ATV',
      },
      {
        key: 'rangerPickup',
        def: RANGER_PICKUP,
        model: 'rangerPickup',
        pos: { x: pickup.x, y: py + 1.05, z: pickup.z },
        yaw: Math.PI / 2,
        paint: 0x4c6b3c,
        mounts: {
          wheelFL: { kind: 'wheel', pos: carPos, variant: 'truck' },
          wheelRL: { kind: 'wheel', pos: carPos, variant: 'truck' },
        },
      },
      {
        key: 'loggingTruck',
        def: LOGGING_TRUCK,
        model: 'loggingTruck',
        pos: { x: S.x - 1, y: sy + 1.25, z: S.z - 3 },
        yaw: -Math.PI / 2,
        paint: 0xc4862e,
        mounts: { battery: { kind: 'battery', pos: carPos, variant: 'heavy' } },
      },
      {
        key: 'generator',
        def: GENERATOR,
        model: 'generator',
        pos: { x: gen.x, y: gy(gen.x, gen.z), z: gen.z },
        yaw: -Math.PI / 2,
      },
    ],
    stations: [
      {
        id: 'mapBoard',
        pos: { x: R.x - 1, y: ry + 1.7, z: rz0 + 0.2 },
        r: 0.8,
        box: { hx: 0.98, hy: 0.44, hz: 0.08 },
        label: 'Read the trail map',
        verb: 'tap',
        priority: 1,
        run: (w) => {
          w.setFlag('map');
          w.sfx('sheetOpen');
        },
      },
      {
        id: 'pullCord',
        // the pull handle on the engine end (generator model: local 0.26, 0.38, 0.36)
        pos: { x: gen.x - 0.36, y: gy(gen.x, gen.z) + 0.38, z: gen.z + 0.26 },
        r: 0.24,
        label: (w) => (w.flag('millPower') ? 'Generator running' : 'Pull the start cord'),
        verb: 'hold',
        time: 1.4,
        priority: 1,
        when: (w) => (w.flag('millPower') ? 'Already running' : w.systemOk('generator', 'fuel') ? true : 'Needs fuel'),
        run: (w) => {
          w.setFlag('millPower');
          w.sfx('genStart', { x: gen.x, y: gy(gen.x, gen.z), z: gen.z });
          w.openDoor('shed');
          w.stamp('POWER ON', 'Halvorsen Timber', 'warn');
        },
      },
      {
        id: 'rvBin',
        pos: rvBin,
        r: 0.6,
        box: { hx: 0.5, hy: 0.3, hz: 0.1, yaw: rv.yaw },
        label: 'Open the RV storage bin',
        verb: 'tap',
        priority: 1,
        when: (w) => (w.flag('rvBin') ? false : true),
        run: (w) => {
          w.setFlag('rvBin');
          w.sfx('latch', rvBin);
        },
      },
      {
        id: 'siphon',
        pos: rvFiller,
        r: 0.45,
        label: 'Siphon fuel into the jerry can',
        verb: 'hold',
        time: 2.4,
        priority: 2,
        when: (w) => {
          const h = w.heldItem();
          if (h?.kind !== 'jerrycan') return 'Bring a jerry can';
          if (h.fill > 0.97) return 'The can is full';
          return true;
        },
        run: (w) => {
          const h = w.heldItem();
          if (h) h.fill = 1;
          w.setFlag('siphoned');
          w.sfx('glugDone', rvFiller);
          w.toast('Jerry can: full');
        },
      },
      {
        id: 'mineLog',
        pos: { x: Mi.x - 12, y: my + 1.0, z: Mi.z - 1.3 },
        r: 0.5,
        label: 'Read the foreman’s logbook',
        verb: 'tap',
        priority: 1,
        run: (w) => {
          w.collectLore('mine');
          w.say('“Nov 3. Company men again. Paid cash to seal the lower drift. Same broken-ring crates as last year. Told the boys not to ask.”', 'Logbook');
        },
      },
      {
        id: 'towerLog',
        pos: { x: T.x + 1.2, y: ty + TH + 1.0, z: T.z - 2 },
        r: 0.5,
        label: 'Read the lookout’s journal',
        verb: 'tap',
        priority: 1,
        run: (w) => {
          w.collectLore('tower');
          w.say('“Aug 19. White van, no plates, up at the overlook at 2 a.m. Two men, torches, under a silver 4×4. Reported it. Nobody called back.”', 'Journal');
        },
      },
      {
        id: 'vanLog',
        // through the smashed windscreen at the nose (the van lies on its side)
        pos: { x: wreck.x - 2.6 * Math.sin(2.3), y: wreck.y + 1.0, z: wreck.z - 2.6 * Math.cos(2.3) },
        r: 0.7,
        label: 'Search the wrecked van',
        verb: 'hold',
        time: 1.2,
        priority: -1,
        run: (w) => {
          w.collectLore('van');
          w.say('A Company van — our livery. Manifest in the glovebox: one crate, stamped with a broken ring. Destination: “Kestrel Ridge overlook”. …That’s our client’s truck.', 'Dispatch');
        },
      },
    ],
    doors: [
      { id: 'rangerDoor', hinge: { x: rx0, y: ry, z: rz0 + 2.6 }, width: 1.2, height: 2.2, yaw: -Math.PI / 2, locked: 'ranger', label: 'station door' },
      { id: 'shed', hinge: { x: sx1, y: sy, z: sz0 + 3 }, width: 8, height: 4.6, yaw: -Math.PI / 2, scripted: true, style: 'rollup' },
    ],
    wolves: wolfSpots,
    spawn: { pos: { x: van.x - 3.2, y: vy, z: van.z + 5.5 }, yaw: -0.25 },
    beats,
    side: [
      { id: 'winch', text: 'Fit the winch from the old mine', done: (w) => w.systemOk(M, 'winch'), visible: (w) => w.flag('map') },
      { id: 'lights', text: 'Fit the light bar from the fire lookout', done: (w) => w.systemOk(M, 'lights'), visible: (w) => w.flag('map') },
    ],
    triggers: [
      { id: 'mineDark', pos: { x: Mi.x - 3, y: my, z: Mi.z }, r: 3, when: (w) => !w.player.flashlight, run: (w) => w.say('Dark in there. F for your flashlight.') },
      { id: 'towerTop', pos: { x: T.x, y: ty + TH, z: T.z }, r: 3, when: (w) => w.player.pos.y > ty + TH - 0.5, run: (w) => w.say('Some view. You can see the whole valley — the lake, the mill, all the way down to the lot.') },
      {
        id: 'rockslide',
        pos: at(0, 62),
        r: 9,
        vehicle: true,
        when: (w) => w.player.mode === 'drive' && w.player.vehicle === M,
        run: (w) => {
          w.setFlag('slide');
          w.sfx('rockslide', at(SL.x, SL.z));
          w.events.push({ t: 'shake', amount: 0.6 });
          w.say('WHOA — rockslide! Road’s gone. Take the logging track on your right — it fords the creek.');
        },
      },
      { id: 'ford', pos: at(RIDGE.ford.x, RIDGE.ford.z + 14), r: 10, vehicle: true, run: (w) => w.setFlag('forded') },
      { id: 'bridge', pos: at(0, 150), r: 10, vehicle: true, run: (w) => w.setFlag('forded') },
      { id: 'lot', pos: at(L.x, L.z), r: 24, vehicle: true, when: (w) => w.player.vehicle === M || (onFoot(w) && nearCar(w, 20)), run: (w) => w.setFlag('reachedLot') },
      { id: 'wolvesNear', pos: at(C.x, C.z), r: 30, when: (w) => w.flag('dusk'), run: (w) => w.say('Hear that? Wolves. Flares on your belt — select one and click to light it.', 'Dispatch') },
    ],
    lore: [
      { id: 'mine', title: 'Foreman’s logbook', body: 'Company men paid cash to seal the lower drift. Broken-ring crates.' },
      { id: 'tower', title: 'Lookout’s journal', body: 'A white van at the overlook at 2 a.m. Men under a silver 4×4.' },
      { id: 'van', title: 'Company manifest', body: 'One crate, broken ring. Destination: Kestrel Ridge overlook.' },
    ],
    warmth: [fire],
    par: 1320,
    intro: 'ridge',
    briefing: '',
    tick: (w, dt) => {
      // The cold open: the truck creeps toward the drop until it's chocked.
      const v = car(w);
      const chocked = w.systemOk(M, 'stabilize');
      v.creep = w.flag('creeping') && !chocked && !v.occupied ? 0.42 : 0;
      if (v.occupied && v.running) {
        const m = w.machine(M);
        for (const s of ['chockL', 'chockR']) if (m.state.slots[s] !== null) m.eject(s, w.items);
      }
      // Over the edge: anywhere in the gorge behind the overlook, well below it.
      if (v.pos.z < -362 && v.pos.y < oy - 8) w.fail('vehicleLost');
      creepT += dt;
      if (v.creep > 0 && creepT > 6 && v.pos.z < -352) {
        creepT = 0;
        w.say('It’s at the edge!', 'Dispatch', 2);
      }
    },
  };
}
