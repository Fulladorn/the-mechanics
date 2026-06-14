import type { Vec3 } from '../shared/math';
import { yawForward, yawRight } from '../shared/math';
import type { Intent } from '../shared/types';
import {
  AIR_ACCEL,
  AIR_WISH_CAP,
  CROUCH_HEIGHT,
  CROUCH_SPEED,
  GRAVITY,
  GROUND_ACCEL,
  GROUND_FRICTION,
  JUMP_SPEED,
  PLAYER_RADIUS,
  SPEED_HARD_CAP,
  SPRINT_SPEED,
  STAND_HEIGHT,
  WALK_SPEED,
} from '../shared/constants';
import { playerMove, type Box } from './collision';

export interface Mover {
  pos: Vec3;
  vel: Vec3;
  yaw: number;
  pitch: number;
  onGround: boolean;
  crouching: boolean;
  height: number;
}

function applyFriction(vel: Vec3, dt: number): void {
  const speed = Math.hypot(vel.x, vel.z);
  if (speed < 1e-4) {
    vel.x = 0;
    vel.z = 0;
    return;
  }
  const drop = speed * GROUND_FRICTION * dt;
  const k = Math.max(speed - drop, 0) / speed;
  vel.x *= k;
  vel.z *= k;
}

// Classic acceleration: only add speed up to `wishSpeed` along the wish dir.
function accelerate(vel: Vec3, wx: number, wz: number, wishSpeed: number, accel: number, dt: number): void {
  const current = vel.x * wx + vel.z * wz;
  const add = wishSpeed - current;
  if (add <= 0) return;
  let acc = accel * wishSpeed * dt;
  if (acc > add) acc = add;
  vel.x += acc * wx;
  vel.z += acc * wz;
}

// Air acceleration: the wish speed is capped tiny, but accel magnitude uses the
// full wish speed — so redirecting the wish dir mid-air (strafe + mouse) keeps
// adding speed. This is the bunny-hop skill ceiling.
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

/**
 * Advance a mover one fixed step. Holding jump auto-hops on landing and skips
 * ground friction that tick, preserving (and, with strafing, building) speed.
 */
export function stepMovement(p: Mover, intent: Intent, boxes: Box[], dt: number): void {
  p.yaw = intent.yaw;
  p.pitch = intent.pitch;

  const f = yawForward(p.yaw);
  const r = yawRight(p.yaw);
  let wx = 0;
  let wz = 0;
  if (intent.fwd) {
    wx += f.x;
    wz += f.z;
  }
  if (intent.back) {
    wx -= f.x;
    wz -= f.z;
  }
  if (intent.right) {
    wx += r.x;
    wz += r.z;
  }
  if (intent.left) {
    wx -= r.x;
    wz -= r.z;
  }
  const wl = Math.hypot(wx, wz);
  if (wl > 1e-6) {
    wx /= wl;
    wz /= wl;
  }

  p.crouching = intent.crouch;
  p.height = p.crouching ? CROUCH_HEIGHT : STAND_HEIGHT;

  let wishSpeed = p.crouching ? CROUCH_SPEED : intent.sprint ? SPRINT_SPEED : WALK_SPEED;
  if (wl < 1e-6) wishSpeed = 0;

  if (p.onGround) {
    // Skip friction on the tick we hop so a held jump preserves speed, but still
    // accelerate on ground contact so you can build up to sprint speed mid-chain.
    if (!intent.jump) applyFriction(p.vel, dt);
    accelerate(p.vel, wx, wz, wishSpeed, GROUND_ACCEL, dt);
    if (intent.jump) {
      p.vel.y = JUMP_SPEED;
      p.onGround = false;
    }
  }
  if (!p.onGround) {
    airAccelerate(p.vel, wx, wz, wishSpeed, dt);
    p.vel.y -= GRAVITY * dt;
  }

  const hsp = Math.hypot(p.vel.x, p.vel.z);
  if (hsp > SPEED_HARD_CAP) {
    const k = SPEED_HARD_CAP / hsp;
    p.vel.x *= k;
    p.vel.z *= k;
  }

  const res = playerMove(p.pos, p.vel, PLAYER_RADIUS, p.height, boxes, dt);
  p.onGround = res.onGround;
}

export const horizontalSpeed = (vel: Vec3): number => Math.hypot(vel.x, vel.z);
