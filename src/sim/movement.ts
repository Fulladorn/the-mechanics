import type { Vec3 } from '../shared/math';
import { yawForward, yawRight } from '../shared/math';
import {
  AIR_ACCEL,
  AIR_WISH_CAP,
  CROUCH_SPEED,
  GRAVITY,
  GROUND_ACCEL,
  GROUND_FRICTION,
  JUMP_SPEED,
  SPEED_HARD_CAP,
  SPRINT_SPEED,
  WALK_SPEED,
} from '../shared/constants';

// The movement *model* — pure velocity maths, no collision. Quake/Source-style:
// ground friction + capped acceleration on the ground, a tiny wish-speed cap
// in the air so strafing with the mouse can build speed (the optional
// bunny-hop skill). Collision is Rapier's character controller (player.ts).

export interface MoveInput {
  fwd: boolean;
  back: boolean;
  left: boolean;
  right: boolean;
  jump: boolean;
  crouch: boolean;
  sprint: boolean;
  yaw: number;
}

export interface MoveMods {
  /** Multiplies walk/sprint speed (carrying something heavy). */
  speed: number;
  /** Multiplies jump velocity. */
  jump: number;
  canSprint: boolean;
}

export const NO_MODS: MoveMods = { speed: 1, jump: 1, canSprint: true };

function applyFriction(vel: Vec3, dt: number): void {
  const speed = Math.hypot(vel.x, vel.z);
  if (speed < 1e-4) {
    vel.x = 0;
    vel.z = 0;
    return;
  }
  const drop = Math.max(speed, 1.2) * GROUND_FRICTION * dt;
  const k = Math.max(speed - drop, 0) / speed;
  vel.x *= k;
  vel.z *= k;
}

function accelerate(vel: Vec3, wx: number, wz: number, wishSpeed: number, accel: number, dt: number): void {
  const current = vel.x * wx + vel.z * wz;
  const add = wishSpeed - current;
  if (add <= 0) return;
  let acc = accel * wishSpeed * dt;
  if (acc > add) acc = add;
  vel.x += acc * wx;
  vel.z += acc * wz;
}

function airAccelerate(vel: Vec3, wx: number, wz: number, wishSpeed: number, dt: number): void {
  const capped = Math.min(wishSpeed, AIR_WISH_CAP);
  const current = vel.x * wx + vel.z * wz;
  const add = capped - current;
  if (add <= 0) return;
  let acc = AIR_ACCEL * wishSpeed * dt;
  if (acc > add) acc = add;
  vel.x += acc * wx;
  vel.z += acc * wz;
}

/** Wish direction (unit, xz) from the movement keys and yaw. */
export function wishDir(inp: MoveInput): { x: number; z: number; len: number } {
  const f = yawForward(inp.yaw);
  const r = yawRight(inp.yaw);
  let wx = 0;
  let wz = 0;
  if (inp.fwd) {
    wx += f.x;
    wz += f.z;
  }
  if (inp.back) {
    wx -= f.x;
    wz -= f.z;
  }
  if (inp.right) {
    wx += r.x;
    wz += r.z;
  }
  if (inp.left) {
    wx -= r.x;
    wz -= r.z;
  }
  const len = Math.hypot(wx, wz);
  return len > 1e-6 ? { x: wx / len, z: wz / len, len } : { x: 0, z: 0, len: 0 };
}

/**
 * Advance velocity one fixed step. Holding jump auto-hops on landing and skips
 * ground friction that tick, which preserves (and with strafing, builds) speed.
 * Returns true if a jump started this tick.
 */
export function stepVelocity(vel: Vec3, onGround: boolean, inp: MoveInput, dt: number, mods: MoveMods = NO_MODS, sprintOk = true): boolean {
  const w = wishDir(inp);
  let wishSpeed = inp.crouch ? CROUCH_SPEED : inp.sprint && mods.canSprint && sprintOk ? SPRINT_SPEED : WALK_SPEED;
  wishSpeed *= mods.speed;
  if (w.len === 0) wishSpeed = 0;
  let jumped = false;

  if (onGround) {
    if (!inp.jump) applyFriction(vel, dt);
    accelerate(vel, w.x, w.z, wishSpeed, GROUND_ACCEL, dt);
    if (inp.jump) {
      vel.y = JUMP_SPEED * mods.jump;
      jumped = true;
    } else if (vel.y < 0) vel.y = 0;
  }
  if (!onGround || jumped) {
    if (!onGround) airAccelerate(vel, w.x, w.z, wishSpeed, dt);
    vel.y -= GRAVITY * dt;
  }

  const hsp = Math.hypot(vel.x, vel.z);
  if (hsp > SPEED_HARD_CAP) {
    const k = SPEED_HARD_CAP / hsp;
    vel.x *= k;
    vel.z *= k;
  }
  return jumped;
}

export const horizontalSpeed = (vel: Vec3): number => Math.hypot(vel.x, vel.z);
