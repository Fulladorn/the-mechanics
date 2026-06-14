import { describe, it, expect } from 'vitest';
import { stepMovement, horizontalSpeed, type Mover } from '../src/sim/movement';
import { makeIntent } from '../src/shared/types';
import { DT, GATE_SPEED, SPEED_HARD_CAP, SPRINT_SPEED, STAND_HEIGHT } from '../src/shared/constants';
import { box, type Box } from '../src/sim/collision';

const floor: Box[] = [box(0, -0.5, 0, 400, 0.5, 400)]; // huge floor, top at y=0

function mover(): Mover {
  return {
    pos: { x: 0, y: 0, z: 0 },
    vel: { x: 0, y: 0, z: 0 },
    yaw: 0,
    pitch: 0,
    onGround: true,
    crouching: false,
    height: STAND_HEIGHT,
  };
}

describe('movement', () => {
  it('settles around sprint speed running on flat ground', () => {
    const p = mover();
    const intent = makeIntent();
    intent.fwd = true;
    intent.sprint = true;
    for (let i = 0; i < 180; i++) stepMovement(p, intent, floor, DT);
    const sp = horizontalSpeed(p.vel);
    expect(sp).toBeGreaterThan(SPRINT_SPEED * 0.9);
    expect(sp).toBeLessThan(SPRINT_SPEED * 1.2);
  });

  it('jumps off the ground and gravity brings it back', () => {
    const p = mover();
    const j = makeIntent();
    j.jump = true;
    stepMovement(p, j, floor, DT);
    expect(p.onGround).toBe(false);
    expect(p.vel.y).toBeGreaterThan(0);

    const idle = makeIntent();
    let ticks = 0;
    while (!p.onGround && ticks < 300) {
      stepMovement(p, idle, floor, DT);
      ticks++;
    }
    expect(p.onGround).toBe(true);
    expect(Math.abs(p.pos.y)).toBeLessThan(0.05);
  });

  it('bunny-hopping (air-strafe) builds speed past the gate threshold, capped', () => {
    const p = mover();
    const run = makeIntent();
    run.fwd = true;
    run.sprint = true;
    for (let i = 0; i < 50; i++) stepMovement(p, run, floor, DT);

    // Circle-strafe: hold one strafe key and sweep the view with it (no forward).
    let yaw = 0;
    for (let i = 0; i < 400; i++) {
      const intent = makeIntent();
      intent.jump = true;
      intent.sprint = true;
      intent.right = true;
      yaw += 0.03;
      intent.yaw = yaw;
      stepMovement(p, intent, floor, DT);
    }
    const sp = horizontalSpeed(p.vel);
    expect(sp).toBeGreaterThan(GATE_SPEED);
    expect(sp).toBeLessThanOrEqual(SPEED_HARD_CAP + 0.01);
  });
});
