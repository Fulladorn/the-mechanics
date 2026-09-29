import { describe, expect, it } from 'vitest';
import type { Vec3 } from '../src/shared/math';
import { qRotate, qYaw } from '../src/shared/math';
import { World } from '../src/sim/world';
import type { LevelDef } from '../src/content/levels/types';
import type { CoverDef } from '../src/sim/machine';
import { makeDepot } from '../src/content/levels/depot';
import { makeRidge } from '../src/content/levels/ridge';
import { G } from '../src/sim/physics';
import { Bot } from './bot';

// Aim where a player would aim. For every station, door and machine cover we
// stand the player at each reachable spot in front of it and aim at the
// centre and the four inset corners of the thing you can see; for every loose
// item we aim at it from all round. Any aim that doesn't focus the right
// prompt is a bug (this is how "E does nothing on the locker" slipped past).

interface Target {
  expect: string;
  center: Vec3;
  /** Face axes (unit, world) and half sizes; spheres use a tiny face. */
  ax: Vec3;
  ay: Vec3;
  normal: Vec3;
  hx: number;
  hy: number;
  twoSided: boolean;
  /** How far away to stand. */
  standOff?: number;
}

const add = (a: Vec3, b: Vec3, k = 1): Vec3 => ({ x: a.x + b.x * k, y: a.y + b.y * k, z: a.z + b.z * k });

function targets(w: World, lv: LevelDef): Target[] {
  const out: Target[] = [];
  for (const st of lv.stations) {
    if (st.when && st.when(w) === false) continue;
    const rot = qYaw(st.box?.yaw ?? 0);
    out.push({
      expect: `station:${st.id}`,
      center: st.pos,
      ax: qRotate(rot, { x: 1, y: 0, z: 0 }),
      ay: { x: 0, y: 1, z: 0 },
      normal: qRotate(rot, { x: 0, y: 0, z: 1 }),
      hx: st.box?.hx ?? st.r * 0.5,
      hy: st.box?.hy ?? st.r * 0.5,
      twoSided: !st.box,
      standOff: st.box ? 1.5 : Math.max(1.4, st.r + 1.1),
    });
  }
  for (const d of w.doors.values()) {
    if (d.def.scripted) continue;
    const rot = qYaw(d.def.yaw - (d.open ? 1.6 : 0));
    const ax = qRotate(rot, { x: 1, y: 0, z: 0 });
    out.push({
      expect: `door:${d.def.id}`,
      center: add({ ...d.def.hinge, y: d.def.hinge.y + Math.min(1.1, d.def.height / 2) }, ax, d.def.width / 2),
      ax,
      ay: { x: 0, y: 1, z: 0 },
      normal: qRotate(rot, { x: 0, y: 0, z: 1 }),
      hx: d.def.width / 2,
      hy: Math.min(1.1, d.def.height / 2),
      twoSided: true,
    });
  }
  for (const m of w.machines.values()) {
    for (const c of m.def.components) {
      if (c.t !== 'cover' || !(c as CoverDef).box || m.state.covers[c.id]) continue;
      const b = (c as CoverDef).box!;
      out.push({
        expect: `machine:${m.key}:cover:${c.id}`,
        center: m.world(b.pos),
        ax: qRotate(m.rot, { x: 1, y: 0, z: 0 }),
        ay: qRotate(m.rot, { x: 0, y: 0, z: 1 }),
        normal: qRotate(m.rot, { x: 0, y: 1, z: 0 }),
        hx: b.hx,
        hy: b.hz,
        twoSided: false,
      });
    }
  }
  return out;
}

/** Stand-and-aim from every reachable spot round `t`; returns failure strings. */
function audit(w: World, bot: Bot, t: Target, dist: number, requireAll: boolean): string[] {
  const fails: string[] = [];
  let tried = 0;
  let ok = 0;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const dir = { x: Math.cos(a), y: 0, z: Math.sin(a) };
    const facing = dir.x * t.normal.x + dir.z * t.normal.z;
    // In front of a one-sided wall face (an upward face, like a hood, is seen
    // from all round; doors and round things from either side).
    const upFace = Math.abs(t.normal.y) > 0.5;
    if (!upFace && !t.twoSided && facing < 0.5) continue;
    if (!upFace && t.twoSided && Math.abs(facing) < 0.5) continue;
    const want = { x: t.center.x + dir.x * dist, z: t.center.z + dir.z * dist };
    // stand on whatever floor is there (ground, a platform, a deck)
    const gy = w.terrain.heightAt(want.x, want.z);
    const floorY = Math.max(gy, t.center.y - 1.3);
    w.teleport({ x: want.x, y: floorY + 0.05, z: want.z });
    bot.tick(15);
    const p = w.player.pos;
    if (Math.hypot(p.x - want.x, p.z - want.z) > 0.25) continue; // can't stand there
    const eye = w.player.eye();
    const to = { x: t.center.x - eye.x, y: t.center.y - eye.y, z: t.center.z - eye.z };
    const len = Math.hypot(to.x, to.y, to.z);
    if (len > 3.0) continue;
    const blocked = w.phys.castRay(eye, { x: to.x / len, y: to.y / len, z: to.z / len }, len - 0.2, G.STATIC | G.DOOR);
    if (blocked && blocked.tag?.owner !== t.expect && blocked.tag?.owner !== t.expect.replace('station:', '')) continue; // no line of sight
    tried++;
    const pts = [t.center];
    for (const [sx, sy] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ])
      pts.push(add(add(t.center, t.ax, sx * t.hx * 0.6), t.ay, sy * t.hy * 0.6));
    let all = true;
    for (const q of pts) {
      bot.aim(q);
      bot.tick(1);
      const got = w.focus?.id ?? '(nothing)';
      if (got !== t.expect) {
        all = false;
        if (requireAll) fails.push(`${t.expect}: from (${want.x.toFixed(1)},${want.z.toFixed(1)}) aiming at (${q.x.toFixed(2)},${q.y.toFixed(2)},${q.z.toFixed(2)}) got ${got}`);
      }
      if (!requireAll) break; // items: the centre is enough
    }
    if (all) ok++;
  }
  if (tried === 0) fails.push(`${t.expect}: nowhere to stand and see it`);
  else if (!requireAll && ok === 0) fails.push(`${t.expect}: not focusable from any of ${tried} spots`);
  return fails;
}

async function auditLevel(make: () => LevelDef, reveal: string[], prepare?: (w: World) => void): Promise<string[]> {
  const lv = make();
  const w = await World.create(lv);
  for (const f of reveal) w.setFlag(f);
  prepare?.(w);
  const bot = new Bot(w);
  bot.tick(10);
  const fails: string[] = [];
  for (const t of targets(w, lv)) fails.push(...audit(w, bot, t, t.standOff ?? 1.5, true));
  for (const it of w.items.list) {
    if (it.state !== 'world' || !w.items.visible(it)) continue;
    fails.push(
      ...audit(
        w,
        bot,
        { expect: `item:${it.id}`, center: { ...it.pos }, ax: { x: 1, y: 0, z: 0 }, ay: { x: 0, y: 1, z: 0 }, normal: { x: 0, y: 1, z: 0 }, hx: 0.01, hy: 0.01, twoSided: true },
        1.3,
        false,
      ).map((f) => `${f} [${it.kind}${it.tag ? ' ' + it.tag : ''}]`),
    );
  }
  return fails;
}

describe('interaction audit: aim where a player would', () => {
  it('orientation day', async () => {
    const fails = await auditLevel(makeDepot, ['locker', 'clockedIn'], (w) => (w.machine('betsy').state.inspected = true));
    expect(fails, fails.join('\n')).toEqual([]);
  }, 120000);

  it('the ridge job', async () => {
    // the truck chocked (otherwise it rolls away mid-audit) and inspected
    const fails = await auditLevel(makeRidge, ['rvBin', 'dusk'], (w) => {
      const car = w.vehicle('ridgeback').pos;
      w.fit('ridgeback', 'chockL', { kind: 'chock', pos: car });
      w.fit('ridgeback', 'chockR', { kind: 'chock', pos: car });
      w.machine('ridgeback').state.inspected = true;
    });
    expect(fails, fails.join('\n')).toEqual([]);
  }, 240000);
});
