import type { Vec3 } from '../shared/math';
import { STEP_HEIGHT } from '../shared/constants';

/** Axis-aligned solid box. */
export interface Box {
  center: Vec3;
  half: Vec3;
}

export const box = (cx: number, cy: number, cz: number, hx: number, hy: number, hz: number): Box => ({
  center: { x: cx, y: cy, z: cz },
  half: { x: hx, y: hy, z: hz },
});

/** Build a box from a floor-resting footprint (size) centered at (x,z), sitting on y0. */
export const slab = (x: number, y0: number, z: number, sx: number, sy: number, sz: number): Box =>
  box(x, y0 + sy / 2, z, sx / 2, sy / 2, sz / 2);

/** Samples ground height at a world XZ. Levels without terrain pass undefined. */
export type GroundFn = (x: number, z: number) => number;

// Player is a vertical AABB: feet at `pos`, spanning `height`, half-width `radius`.
const overlaps = (pos: Vec3, r: number, h: number, b: Box): boolean =>
  Math.abs(pos.x - b.center.x) < r + b.half.x &&
  Math.abs(pos.y + h / 2 - b.center.y) < h / 2 + b.half.y &&
  Math.abs(pos.z - b.center.z) < r + b.half.z;

const anyOverlap = (pos: Vec3, r: number, h: number, boxes: Box[]): boolean => {
  for (const b of boxes) if (overlaps(pos, r, h, b)) return true;
  return false;
};

interface MoveResult {
  onGround: boolean;
  /** True when a horizontal axis was clipped by a box. */
  blocked: boolean;
}

/** One pass of axis-by-axis resolution. Mutates `pos`/`vel`. */
function resolveMove(
  pos: Vec3,
  vel: Vec3,
  r: number,
  h: number,
  boxes: Box[],
  dt: number,
  ground?: GroundFn,
): MoveResult {
  let onGround = false;
  let blocked = false;

  // X
  pos.x += vel.x * dt;
  for (const b of boxes) {
    if (!overlaps(pos, r, h, b)) continue;
    const pen = r + b.half.x - Math.abs(pos.x - b.center.x);
    if (pen <= 0) continue;
    pos.x += pos.x < b.center.x ? -pen : pen;
    vel.x = 0;
    blocked = true;
  }

  // Z
  pos.z += vel.z * dt;
  for (const b of boxes) {
    if (!overlaps(pos, r, h, b)) continue;
    const pen = r + b.half.z - Math.abs(pos.z - b.center.z);
    if (pen <= 0) continue;
    pos.z += pos.z < b.center.z ? -pen : pen;
    vel.z = 0;
    blocked = true;
  }

  // Y
  pos.y += vel.y * dt;
  for (const b of boxes) {
    if (!overlaps(pos, r, h, b)) continue;
    const centerY = pos.y + h / 2;
    const pen = h / 2 + b.half.y - Math.abs(centerY - b.center.y);
    if (pen <= 0) continue;
    if (centerY > b.center.y) {
      // landed on top
      pos.y += pen;
      if (vel.y < 0) vel.y = 0;
      onGround = true;
    } else {
      // bonked head
      pos.y -= pen;
      if (vel.y > 0) vel.y = 0;
    }
  }

  // Terrain last: a heightfield is always solid, so it wins over box results.
  if (ground) {
    const gh = ground(pos.x, pos.z);
    if (pos.y <= gh) {
      pos.y = gh;
      if (vel.y < 0) vel.y = 0;
      onGround = true;
    }
  }

  return { onGround, blocked };
}

/** Drop straight down onto the nearest support within `maxDrop`. */
function settle(pos: Vec3, r: number, h: number, boxes: Box[], ground: GroundFn | undefined, maxDrop: number): void {
  const from = pos.y;
  let best = ground ? ground(pos.x, pos.z) : 0;
  for (const b of boxes) {
    const top = b.center.y + b.half.y;
    if (top > from + 1e-4 || top < from - maxDrop) continue;
    // only surfaces we're actually standing over
    if (Math.abs(pos.x - b.center.x) >= r + b.half.x) continue;
    if (Math.abs(pos.z - b.center.z) >= r + b.half.z) continue;
    if (top > best) best = top;
  }
  if (best <= from && best >= from - maxDrop) pos.y = best;
}

/**
 * Move a vertical-AABB actor and resolve against static boxes, axis by axis.
 * `pos` is the feet position and is mutated in place. Returns ground contact.
 *
 * If a horizontal move is clipped while the actor is grounded, it retries the
 * move raised by STEP_HEIGHT and then settles back down — so kerbs, deck edges,
 * rocks and low ledges are walked over instead of forming invisible walls.
 */
export function playerMove(
  pos: Vec3,
  vel: Vec3,
  r: number,
  h: number,
  boxes: Box[],
  dt: number,
  ground?: GroundFn,
): { onGround: boolean } {
  const startPos = { ...pos };
  const startVel = { ...vel };

  const first = resolveMove(pos, vel, r, h, boxes, dt, ground);
  if (!first.blocked || vel.y > 0.1) return { onGround: first.onGround };

  const wanted = Math.hypot(startVel.x, startVel.z) * dt;
  if (wanted < 1e-5) return { onGround: first.onGround };
  const got = Math.hypot(pos.x - startPos.x, pos.z - startPos.z);
  if (got > wanted * 0.92) return { onGround: first.onGround }; // barely clipped

  // Retry from a raised start.
  const stepPos = { x: startPos.x, y: startPos.y + STEP_HEIGHT, z: startPos.z };
  if (anyOverlap(stepPos, r, h, boxes)) return { onGround: first.onGround };
  const stepVel = { x: startVel.x, y: 0, z: startVel.z };
  const second = resolveMove(stepPos, stepVel, r, h, boxes, dt, ground);
  const steppedDist = Math.hypot(stepPos.x - startPos.x, stepPos.z - startPos.z);
  if (steppedDist <= got + 1e-4) return { onGround: first.onGround };

  settle(stepPos, r, h, boxes, ground, STEP_HEIGHT + 0.05);
  pos.x = stepPos.x;
  pos.y = stepPos.y;
  pos.z = stepPos.z;
  vel.x = stepVel.x;
  vel.z = stepVel.z;
  // Keep the original vertical velocity: stepping up shouldn't cancel a fall.
  return { onGround: second.onGround || first.onGround };
}

/** Depenetrate a horizontal box (kart) against static boxes on X/Z only. */
export function resolveKart(center: Vec3, half: Vec3, boxes: Box[]): boolean {
  let hit = false;
  const ov = (b: Box) =>
    Math.abs(center.x - b.center.x) < half.x + b.half.x &&
    Math.abs(center.y - b.center.y) < half.y + b.half.y &&
    Math.abs(center.z - b.center.z) < half.z + b.half.z;
  for (const b of boxes) {
    if (!ov(b)) continue;
    const penX = half.x + b.half.x - Math.abs(center.x - b.center.x);
    const penZ = half.z + b.half.z - Math.abs(center.z - b.center.z);
    if (penX < penZ) {
      center.x += center.x < b.center.x ? -penX : penX;
    } else {
      center.z += center.z < b.center.z ? -penZ : penZ;
    }
    hit = true;
  }
  return hit;
}
