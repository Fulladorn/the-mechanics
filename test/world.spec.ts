import { describe, it, expect } from 'vitest';
import { World } from '../src/sim/world';
import { isDrivable } from '../src/sim/vehicle';
import { makeIntent } from '../src/shared/types';
import { CHECKPOINT_RADIUS, DT } from '../src/shared/constants';
import type { Vec3 } from '../src/shared/math';

const faceYaw = (from: Vec3, to: Vec3): number => Math.atan2(-(to.x - from.x), -(to.z - from.z));

function stopMoving(w: World, n = 45): void {
  for (let i = 0; i < n; i++) w.step(makeIntent(), DT);
}

function walkTo(w: World, target: Vec3, stop = 1.6, max = 3000): boolean {
  for (let i = 0; i < max; i++) {
    const p = w.player.pos;
    if (Math.hypot(target.x - p.x, target.z - p.z) <= stop) return true;
    const it = makeIntent();
    it.fwd = true;
    it.sprint = true;
    it.yaw = faceYaw(p, target);
    w.step(it, DT);
  }
  return false;
}

function interactWith(w: World, target: Vec3): void {
  const it = makeIntent();
  it.yaw = faceYaw(w.player.pos, target);
  w.step(it, DT); // set facing
  w.command({ t: 'interact' });
}

function openGate(w: World, max = 4000): void {
  // run-up, then circle-strafe to build speed past the gate threshold
  const run = makeIntent();
  run.fwd = true;
  run.sprint = true;
  for (let i = 0; i < 35; i++) w.step(run, DT);
  let yaw = 0;
  for (let i = 0; i < max && !w.gateOpen; i++) {
    const it = makeIntent();
    it.jump = true;
    it.sprint = true;
    it.right = true;
    yaw += 0.03;
    it.yaw = yaw;
    w.step(it, DT);
  }
}

function driveTo(w: World, target: Vec3, stop = CHECKPOINT_RADIUS * 0.7, max = 2500): boolean {
  for (let i = 0; i < max; i++) {
    const k = w.kart;
    if (Math.hypot(target.x - k.pos.x, target.z - k.pos.z) <= stop) return true;
    const it = makeIntent();
    it.fwd = true;
    let d = faceYaw(k.pos, target) - k.heading;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    if (d > 0.05) it.left = true;
    else if (d < -0.05) it.right = true;
    w.step(it, DT);
  }
  return false;
}

describe('garage full playthrough (headless)', () => {
  it('completes every objective and wins', () => {
    const w = new World();
    const lvl = w.level;

    // 1. move + 2. bunny-hop through the speed gate
    openGate(w);
    expect(w.gateOpen).toBe(true);
    expect(w.objectives.isDone('move')).toBe(true);
    expect(w.objectives.isDone('bhop')).toBe(true);
    stopMoving(w);

    // 3. pick up the wrench
    walkTo(w, lvl.wrenchPos);
    interactWith(w, lvl.wrenchPos);
    expect(w.player.hotbar).toContain('wrench');
    expect(w.objectives.isDone('pickup')).toBe(true);

    // 4. build the car: carry every required part to the chassis and bolt it on
    walkTo(w, { x: 0, y: 0, z: 4 }); // approach the gate gap from the south
    walkTo(w, { x: 0, y: 0, z: -4 }); // through to the north workshop
    const origin = lvl.kartStart;
    for (const s of w.vehicle.sockets.filter((x) => x.required)) {
      const item = w.items.find((i) => i.kind === s.accepts && !i.picked);
      expect(item).toBeTruthy();
      walkTo(w, item!.pos);
      interactWith(w, item!.pos);
      expect(w.player.carrying).toBe(s.accepts);
      const socketPos = { x: origin.x + s.anchor.x, y: s.anchor.y, z: origin.z + s.anchor.z };
      walkTo(w, socketPos, 1.3);
      interactWith(w, socketPos);
      expect(w.player.carrying).toBeNull(); // installed
    }
    expect(isDrivable(w.vehicle)).toBe(true);
    expect(w.objectives.isDone('assemble')).toBe(true);

    // 5. enter the vehicle and drive every checkpoint
    interactWith(w, lvl.kartStart);
    expect(w.player.mode).toBe('kart');
    for (const cp of lvl.checkpoints) {
      driveTo(w, cp);
    }
    expect(w.objectives.isDone('drive')).toBe(true);

    // exit + 7. clock out
    w.command({ t: 'interact' }); // exit kart
    expect(w.player.mode).toBe('foot');
    walkTo(w, lvl.clockInPos);
    interactWith(w, lvl.clockInPos);

    expect(w.won).toBe(true);
    expect(w.objectives.allDone()).toBe(true);
  });
});
