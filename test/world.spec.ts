import { describe, it, expect } from 'vitest';
import { World } from '../src/sim/world';
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

    // 4. repair the fuse panel (walk to bench, open it, solve via the UI command)
    walkTo(w, { x: 0, y: 0, z: 4 }); // approach the gate gap from the south
    walkTo(w, { x: 0, y: 0, z: -4 }); // through to the north workshop
    walkTo(w, lvl.fusePos);
    interactWith(w, lvl.fusePos);
    w.command({ t: 'solvePuzzle' });
    expect(w.objectives.isDone('puzzle')).toBe(true);

    // 4b. torque the engine-mount bolts
    walkTo(w, lvl.boltPos);
    interactWith(w, lvl.boltPos);
    w.command({ t: 'solveBolt' });
    expect(w.objectives.isDone('bolt')).toBe(true);

    // 5. carry the engine block to the kart and install it
    walkTo(w, lvl.enginePos);
    interactWith(w, lvl.enginePos);
    expect(w.player.carrying).toBe('engine');
    walkTo(w, lvl.kartStart);
    interactWith(w, lvl.kartStart);
    expect(w.kart.engineInstalled).toBe(true);
    expect(w.objectives.isDone('carry')).toBe(true);

    // 6. enter the kart and drive every checkpoint
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
