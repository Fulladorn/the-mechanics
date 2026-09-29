import { describe, expect, it } from 'vitest';
import type { Vec3 } from '../src/shared/math';
import { World } from '../src/sim/world';
import { makeRidge } from '../src/content/levels/ridge';
import { RIDGE } from '../src/content/levels/ridgeTerrain';
import type { CoverDef, FluidDef, JackDef, Machine, PanelDef, SlotDef, TerminalsDef } from '../src/sim/machine';
import { readings, SAFE_TARGET } from '../src/sim/puzzles/valveBalance';
import type { ItemKind } from '../src/sim/items';
import { Bot } from './bot';

// The whole of The Ridge Job, headless: every prompt is reached by aiming at
// it and pressing the real keys. Travel is teleports (walking and driving are
// covered elsewhere); the ATV rack carries the parts like a player would.

/** A point `d` metres further out from the machine's centre than `p`. */
function outside(m: Machine, p: Vec3, d = 1.2): Vec3 {
  const dx = p.x - m.pos.x;
  const dz = p.z - m.pos.z;
  const l = Math.hypot(dx, dz) || 1;
  return { x: m.pos.x + (dx / l) * (l + d), y: 0, z: m.pos.z + (dz / l) * (l + d) };
}

function solveValves(m: Machine, id: string): number[] {
  const p = m.valve.get(id)!;
  const n = p.valves.length;
  // coupling · v = target − bias
  const A = p.coupling.map((row, i) => [...row, SAFE_TARGET - p.bias[i]]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
    [A[c], A[piv]] = [A[piv], A[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = A[r][c] / A[c][c];
      for (let k = c; k <= n; k++) A[r][k] -= f * A[c][k];
    }
  }
  return A.map((row, i) => row[n] / row[i]);
}

describe('level 1: the ridge job', () => {
  it('can be played start to finish through the real interaction pipeline', async () => {
    const w = await World.create(makeRidge());
    const bot = new Bot(w);
    const beat = () => w.currentBeat()?.id;
    const car = w.vehicle('ridgeback');
    const m = w.machine('ridgeback');
    const atv = w.vehicle('atv');
    const item = (kind: ItemKind, tag?: string) =>
      w.items.list.find((i) => i.kind === kind && i.cond === 'good' && i.state === 'world' && (!tag || i.tag === tag) && w.items.visible(i))!;
    const pick = (kind: ItemKind, re: RegExp, tag?: string) => {
      const it = item(kind, tag);
      expect(it, `a loose ${kind}`).toBeTruthy();
      bot.approach(it.pos, 1.0);
      bot.tapAt(it.pos, re);
    };
    const drop = () => {
      bot.tick(1, { drop: true });
      bot.tick(3);
    };
    const bringAtv = (p: Vec3) => {
      const x = p.x + 3;
      const z = p.z + 3;
      atv.place({ x, y: w.terrain.heightAt(x, z) + 0.8, z }, 0);
      bot.tick(20);
    };
    const rack = (re: RegExp) => {
      const rp = atv.world(atv.def.rack!);
      bot.approach(rp, 1.1, { x: rp.x, y: 0, z: rp.z + 3 });
      bot.tapAt(rp, re);
    };
    const unrack = (re: RegExp) => {
      const rp = atv.world(atv.def.rack!);
      bot.approach(rp, 1.1, { x: rp.x, y: 0, z: rp.z + 3 });
      bot.tapAt({ ...rp, y: rp.y + 0.3 }, re);
    };
    bot.tick(20);
    expect(beat()).toBe('chock');

    // 1. The cold open: chock the rolling truck.
    for (const slot of ['chockL', 'chockR']) {
      pick('chock', /Pick up Wheel Chock/);
      const sp = m.world(m.comp<SlotDef>(slot).pos);
      bot.approach(sp, 1.3, outside(m, sp, 2));
      bot.tapAt(m.world(m.comp<SlotDef>(slot).pos), /Fit the wheel chock/);
    }
    bot.tick(3);
    expect(w.systemOk('ridgeback', 'stabilize')).toBe(true);
    expect(car.pinned).toBe(true);
    const parked = { ...car.pos };
    bot.seconds(3);
    expect(Math.abs(car.pos.z - parked.z)).toBeLessThan(0.05);
    expect(beat()).toBe('inspect');
    expect(w.checkpoint).toBe('chock');

    // 2. Inspect.
    const roof = m.world({ x: 0, y: 1.3, z: 0.4 });
    bot.approach(roof, 2.6, { x: roof.x + 5, y: 0, z: roof.z });
    bot.holdAt(roof, 1.6, /Inspect/);
    bot.tick(2);
    expect(beat()).toBe('jack');

    // 3. Down to the ranger station; the key is on the pickup's hood.
    const R = RIDGE.ranger;
    bot.approach({ x: R.x - 12, y: w.terrain.heightAt(R.x - 12, R.z), z: R.z }, 0.5);
    bot.tick(2);
    expect(beat()).toBe('station');
    pick('key', /Pick up ranger key/, 'ranger');
    const door = { x: R.x - 5, y: w.terrain.heightAt(R.x, R.z) + 1.1, z: R.z - 3.5 + 3.2 };
    bot.approach(door, 1.4, { x: door.x - 3, y: 0, z: door.z });
    bot.tapAt(door, /Open the station door/);
    bot.tick(2);
    expect(beat()).toBe('map');
    const board = { x: R.x - 1, y: w.terrain.heightAt(R.x, R.z) + 1.7, z: R.z - 3.5 + 0.2 };
    bot.approach(board, 1.6, { x: board.x, y: 0, z: board.z + 3 });
    bot.tapAt(board, /Read the trail map/);
    bot.tick(2);
    expect(beat()).toBe('wheel');
    pick('key', /Pick up ATV key/, 'ATV');

    // 4. Salvage the pickup's wheel (it's on blocks: nuts off, wheel off).
    const pu = w.machine('rangerPickup');
    const puSlot = pu.comp<SlotDef>('wheelFL');
    const puHub = pu.world(puSlot.pos);
    bot.approach(puHub, 1.2, pu.world({ x: puSlot.pos.x - 2, y: 0, z: puSlot.pos.z }));
    for (const b of puSlot.bolts!) bot.loosenAt(pu.world(b.pos));
    const took = bot.tapAt(pu.world({ x: puSlot.pos.x - 0.08, y: puSlot.pos.y + 0.27, z: puSlot.pos.z + 0.1 }), /Take off the wheel/);
    expect(took).not.toMatch(/\[/);
    bot.tick(2);
    expect(beat()).toBe('ride');
    rack(/Strap the wheel to the rack/);

    // 5. Ride the ATV back up.
    const atvDoor = atv.world(atv.def.door.pos);
    bot.approach(atvDoor, 1.2, atv.world({ x: -2.5, y: 0, z: atv.def.door.pos.z }));
    expect(bot.tapAt(atvDoor, /Ride the ATV/)).not.toMatch(/\[/);
    expect(w.player.mode).toBe('drive');
    bot.seconds(1);
    expect(atv.running).toBe(true);
    const nearCar = { x: car.pos.x + 4, z: car.pos.z + 7 };
    atv.place({ x: nearCar.x, y: w.terrain.heightAt(nearCar.x, nearCar.z) + 0.8, z: nearCar.z }, 0);
    bot.seconds(1);
    bot.tick(1, { interact: true });
    bot.tick(3);
    expect(w.player.mode).toBe('foot');
    expect(beat()).toBe('fitwheel');

    // 6. Swap the wheel (the Ridgeback's own jack is behind it).
    unrack(/Take the wheel off the rack/);
    drop();
    pick('jack', /Pick up Trolley Jack/);
    const slot = m.comp<SlotDef>('wheelFL');
    const hub = m.world(slot.pos);
    const tyre = m.world({ x: slot.pos.x - 0.08, y: slot.pos.y + 0.3, z: slot.pos.z + 0.1 });
    const jp = m.world(m.comp<JackDef>('jackFL').pos);
    bot.approach(jp, 1.1, outside(m, jp));
    bot.tapAt(jp, /Slide the jack/);
    bot.holdAt(jp, 1.5, /Pump the jack/);
    const side = m.world({ x: slot.pos.x - 2, y: 0, z: slot.pos.z });
    bot.approach(hub, 1.25, side);
    for (const b of slot.bolts!) bot.loosenAt(m.world(b.pos));
    bot.tapAt(tyre, /Take off the shredded wheel/);
    bot.tick(1, { drop: true });
    bot.tick(3);
    const good = w.items.list.find((i) => i.kind === 'wheel' && i.cond === 'good' && i.state === 'world')!;
    bot.approach(good.pos, 1.1);
    bot.tapAt(good.pos, /Pick up Wheel/);
    bot.approach(hub, 1.25, side);
    bot.tapAt(tyre, /Fit the wheel/);
    for (const b of slot.bolts!) bot.torqueAt(m.world(b.pos));
    bot.approach(jp, 1.1, outside(m, jp));
    bot.holdAt(jp, 1.2, /Lower the jack/);
    bot.tapAt(jp, /Pull the jack out/);
    drop();
    bot.tick(3);
    expect(w.systemOk('ridgeback', 'wheel')).toBe(true);
    expect(w.checkpoint).toBe('wheeldone');
    expect(beat()).toBe('sawmill');
    // Coolant from the van goes on the rack for later.
    pick('coolant', /Pick up Coolant Jug/);
    rack(/Strap the coolant jug.* to the rack/);

    // 7. The sawmill: fuel the generator, pull the cord, pull the battery.
    const S = RIDGE.sawmill;
    bot.approach({ x: S.x + 16, y: 0, z: S.z }, 0.5);
    bot.tick(2);
    expect(beat()).toBe('power');
    bringAtv(w.player.pos);
    pick('jerrycan', /Pick up Jerry Can/);
    const gen = w.machine('generator');
    const filler = gen.world(gen.comp<FluidDef>('fuel').pos);
    bot.approach(filler, 1.0, outside(gen, filler, 1.5));
    bot.holdAt(filler, 1.8, /Pour fuel/);
    expect(w.systemOk('generator', 'fuel')).toBe(true);
    drop();
    const cord = w.level.stations.find((s) => s.id === 'pullCord')!.pos;
    bot.approach(cord, 1.2, outside(gen, cord, 1.5));
    bot.holdAt(cord, 1.6, /Pull the start cord/);
    bot.tick(2);
    expect(w.flag('millPower')).toBe(true);
    expect(beat()).toBe('battery');
    const lt = w.machine('loggingTruck');
    const lid = lt.world(lt.comp<CoverDef>('box').pos);
    bot.approach(lid, 1.0, outside(lt, lid, 1.5));
    expect(bot.tapAt(lid, /Open the battery box/)).not.toMatch(/\[/);
    const lterm = lt.comp<TerminalsDef>('batt');
    bot.tapAt(lt.world(lterm.neg), /Unclip the black/);
    bot.tapAt(lt.world(lterm.pos), /Unclip the red/);
    const lslot = lt.comp<SlotDef>('battery');
    bot.loosenAt(lt.world(lslot.bolts![0].pos));
    expect(bot.tapAt(lt.world({ ...lslot.pos, y: lslot.pos.y + 0.08 }), /Take off the battery/)).not.toMatch(/\[/);
    bot.tick(2);
    expect(beat()).toBe('camp');
    bringAtv({ x: S.x + 12, y: 0, z: S.z - 6 });
    rack(/Strap the battery to the rack/);
    // (the half-empty jerry can too)
    pick('jerrycan', /Pick up Jerry Can/);
    rack(/Strap the jerry can.* to the rack/);

    // 8. The campground: storage bin, hoses, siphon.
    const C = RIDGE.camp;
    bot.approach({ x: C.x, y: 0, z: C.z }, 0.5);
    bot.tick(2);
    expect(beat()).toBe('hoses');
    const binSt = w.level.stations.find((s) => s.id === 'rvBin')!;
    bot.approach(binSt.pos, 1.2);
    bot.tapAt(binSt.pos, /Open the RV storage bin/);
    bringAtv(w.player.pos);
    unrack(/Take the jerry can.* off the rack/);
    const siphon = w.level.stations.find((s) => s.id === 'siphon')!;
    bot.approach(siphon.pos, 1.1);
    bot.holdAt(siphon.pos, 2.6, /Siphon fuel/);
    expect(w.flag('siphoned')).toBe(true);
    rack(/Strap the jerry can.* to the rack/);
    pick('fuelHose', /Pick up Fuel Line/);
    // rack is full (coolant, battery, jerry can + this) — carry the radiator hose by hand
    rack(/Strap the fuel line to the rack/);
    pick('radiatorHose', /Pick up Radiator Hose/);
    bot.tick(2);
    expect(beat()).toBe('fitbattery');

    // 9. Back at the Ridgeback: everything else.
    bringAtv({ x: car.pos.x, y: 0, z: car.pos.z + 6 });
    bot.approach({ x: car.pos.x - 3, y: 0, z: car.pos.z + 3 }, 0.1);
    drop();
    const front = m.world({ x: 0, y: 0.32, z: -2.15 });
    const frontStand = outside(m, front, 1.3);
    bot.approach(front, 1.1, frontStand);
    bot.tapAt(front, /Open the hood/);
    bot.seconds(0.5);
    // battery
    const term = m.comp<TerminalsDef>('batt');
    bot.approach(m.world(term.neg), 0.9, frontStand);
    bot.tapAt(m.world(term.neg), /Unclip the black/);
    bot.tapAt(m.world(term.pos), /Unclip the red/);
    const bslot = m.comp<SlotDef>('battery');
    bot.loosenAt(m.world(bslot.bolts![0].pos));
    const battTop = m.world({ x: bslot.pos.x, y: bslot.pos.y + 0.06, z: bslot.pos.z + 0.05 });
    bot.tapAt(battTop, /Take off the dead battery/);
    drop();
    unrack(/Take the fuel line off the rack/);
    drop();
    unrack(/Take the jerry can.* off the rack/);
    drop();
    unrack(/Take the battery off the rack/);
    bot.approach(m.world(term.neg), 0.9, frontStand);
    bot.tapAt(battTop, /Fit the battery/);
    bot.torqueAt(m.world(bslot.bolts![0].pos));
    bot.tapAt(m.world(term.pos), /Clip on the red/);
    bot.tapAt(m.world(term.neg), /Clip on the black/);
    bot.tick(2);
    expect(w.systemOk('ridgeback', 'battery')).toBe(true);
    expect(bot.events('zap').length).toBe(0);

    // radiator hose + coolant + bleed
    const rh = m.comp<SlotDef>('radHose');
    bot.approach(m.world(rh.pos), 0.9, frontStand);
    for (const b of rh.bolts!) bot.loosenAt(m.world(b.pos));
    bot.tapAt(m.world(rh.pos), /Take off the split radiator hose/);
    drop();
    pick('radiatorHose', /Pick up Radiator Hose/);
    bot.approach(m.world(rh.pos), 0.9, frontStand);
    bot.tapAt(m.world(rh.pos), /Fit the radiator hose/);
    for (const b of rh.bolts!) bot.torqueAt(m.world(b.pos));
    unrack(/Take the coolant jug.* off the rack/);
    const rad = m.world(m.comp<FluidDef>('coolant').pos);
    bot.approach(rad, 0.9, frontStand);
    bot.holdAt(rad, 2.8, /Pour coolant/);
    drop();
    const bleed = m.world(m.comp<PanelDef>('bleed').pos);
    bot.approach(bleed, 0.9, frontStand);
    bot.tapAt(bleed, /bleed/i);
    expect(w.panel?.panel).toBe('bleed');
    solveValves(m, 'bleed').forEach((v, i) => w.command({ t: 'valve', index: i, value: v }));
    expect(readings(m.valve.get('bleed')!).every((r) => Math.abs(r - SAFE_TARGET) < 0.05)).toBe(true);
    w.command({ t: 'commitValves' });
    bot.tick(2);
    w.command({ t: 'closePanel' });
    bot.tick(2);
    expect(w.systemOk('ridgeback', 'coolant')).toBe(true);

    // ignition fuses
    const ign = m.world(m.comp<PanelDef>('ignition').pos);
    bot.approach(ign, 1.0, m.world({ x: -2.5, y: 0, z: -0.82 }));
    bot.tapAt(ign, /ignition/i);
    for (const i of m.fuse.get('ignition')!.puzzle.scramble) w.command({ t: 'fuse', index: i });
    bot.tick(2);
    w.command({ t: 'closePanel' });
    bot.tick(2);
    expect(w.systemOk('ridgeback', 'ignition')).toBe(true);

    // fuel line (under the back, passenger side) + fill
    const fl = m.comp<SlotDef>('fuelLine');
    const flp = m.world(fl.pos);
    bot.approach(flp, 1.4, outside(m, flp, 2));
    for (const b of fl.bolts!) bot.loosenAt(m.world(b.pos));
    bot.tapAt(flp, /Take off the split fuel line/);
    drop();
    const newLine = w.items.list.find((i) => i.kind === 'fuelHose' && i.cond === 'good' && i.state === 'world')!;
    bot.approach(newLine.pos, 1.0);
    bot.tapAt(newLine.pos, /Pick up Fuel Line/);
    bot.approach(flp, 1.4, outside(m, flp, 2));
    bot.tapAt(flp, /Fit the fuel line/);
    for (const b of fl.bolts!) bot.torqueAt(m.world(b.pos));
    const can = w.items.list.find((i) => i.kind === 'jerrycan' && i.state === 'world')!;
    bot.approach(can.pos, 1.0);
    bot.tapAt(can.pos, /Pick up Jerry Can/);
    const tank = m.world(m.comp<FluidDef>('fuel').pos);
    bot.approach(tank, 1.0, outside(m, tank, 1.5));
    bot.holdAt(tank, 2.8, /Pour fuel/);
    drop();
    expect(w.systemOk('ridgeback', 'fuel')).toBe(true);
    expect(m.allRequiredGo(w.items)).toBe(true);
    bot.tick(2);
    expect(beat()).toBe('start');

    // 10. Close up, drive.
    bot.approach(front, 1.1, frontStand);
    bot.tapAt(m.world({ x: 0, y: 1.45, z: -1.5 }), /Close the hood/);
    const cd = car.world(car.def.door.pos);
    bot.approach(cd, 1.0, outside(m, cd, 2));
    bot.tapAt(cd, /Drive the Ridgeback/);
    bot.seconds(1.8);
    expect(car.running).toBe(true);
    bot.tick(2);
    expect(beat()).toBe('descent');
    expect(w.checkpoint).toBe('start');
    expect(m.state.slots.chockL).toBeNull();

    // 11. The descent: rockslide, ford, lot.
    const put = (x: number, z: number, yaw: number) => {
      car.place({ x, y: w.terrain.heightAt(x, z) + 1.1, z }, yaw);
      bot.tick(20);
    };
    put(-1, 60, Math.PI);
    expect(w.flag('slide')).toBe(true);
    put(RIDGE.ford.x, RIDGE.ford.z + 14, Math.PI);
    expect(w.ended).toBe(null);
    expect(w.flag('forded')).toBe(true);
    put(RIDGE.lot.x - 3, RIDGE.lot.z, Math.PI);
    bot.seconds(2);
    expect(w.ended).toBe('won');
  }, 120000);

  it('restores from each checkpoint', async () => {
    for (const cp of ['chock', 'wheeldone', 'start']) {
      const w = await World.create(makeRidge());
      w.restoreTo(cp);
      const bot = new Bot(w);
      bot.seconds(1);
      expect(w.ended).toBe(null);
      expect(w.systemOk('ridgeback', 'stabilize') || cp === 'start').toBe(true);
      if (cp !== 'chock') expect(w.systemOk('ridgeback', 'wheel')).toBe(true);
      if (cp === 'start') expect(w.machine('ridgeback').allRequiredGo(w.items)).toBe(true);
    }
  }, 60000);
});
