import type { Vec3 } from '../shared/math';

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

// Player is a vertical AABB: feet at `pos`, spanning `height`, half-width `radius`.
const overlaps = (pos: Vec3, r: number, h: number, b: Box): boolean =>
  Math.abs(pos.x - b.center.x) < r + b.half.x &&
  Math.abs(pos.y + h / 2 - b.center.y) < h / 2 + b.half.y &&
  Math.abs(pos.z - b.center.z) < r + b.half.z;

/**
 * Move a vertical-AABB actor and resolve against static boxes, axis by axis.
 * `pos` is the feet position and is mutated in place. Returns ground contact.
 */
export function playerMove(
  pos: Vec3,
  vel: Vec3,
  r: number,
  h: number,
  boxes: Box[],
  dt: number,
): { onGround: boolean } {
  let onGround = false;

  // X
  pos.x += vel.x * dt;
  for (const b of boxes) {
    if (!overlaps(pos, r, h, b)) continue;
    const pen = r + b.half.x - Math.abs(pos.x - b.center.x);
    if (pen <= 0) continue;
    pos.x += pos.x < b.center.x ? -pen : pen;
    vel.x = 0;
  }

  // Z
  pos.z += vel.z * dt;
  for (const b of boxes) {
    if (!overlaps(pos, r, h, b)) continue;
    const pen = r + b.half.z - Math.abs(pos.z - b.center.z);
    if (pen <= 0) continue;
    pos.z += pos.z < b.center.z ? -pen : pen;
    vel.z = 0;
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

  return { onGround };
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
