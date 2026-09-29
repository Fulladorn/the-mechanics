// Tiny vector + math helpers. Pure, dependency-free so the sim stays portable.

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export const v3 = (x = 0, y = 0, z = 0): Vec3 => ({ x, y, z });
export const vclone = (a: Vec3): Vec3 => ({ x: a.x, y: a.y, z: a.z });
export const vset = (o: Vec3, a: Vec3): Vec3 => {
  o.x = a.x;
  o.y = a.y;
  o.z = a.z;
  return o;
};
export const vadd = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
export const vsub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const vscale = (a: Vec3, s: number): Vec3 => ({ x: a.x * s, y: a.y * s, z: a.z * s });
export const vdot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
export const vlen = (a: Vec3): number => Math.hypot(a.x, a.y, a.z);
export const vlenXZ = (a: Vec3): number => Math.hypot(a.x, a.z);

export const vnorm = (a: Vec3): Vec3 => {
  const l = vlen(a);
  return l > 1e-9 ? { x: a.x / l, y: a.y / l, z: a.z / l } : { x: 0, y: 0, z: 0 };
};

export const clamp = (v: number, lo: number, hi: number): number =>
  v < lo ? lo : v > hi ? hi : v;

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Hermite ease between two edges. Returns 0 below `lo`, 1 above `hi`. */
export const smoothstep = (lo: number, hi: number, v: number): number => {
  const t = clamp((v - lo) / (hi - lo || 1e-9), 0, 1);
  return t * t * (3 - 2 * t);
};

/** Move `a` towards `b` by at most `maxDelta`. */
export const approach = (a: number, b: number, maxDelta: number): number =>
  Math.abs(b - a) <= maxDelta ? b : a + Math.sign(b - a) * maxDelta;

export const lerpAngle = (a: number, b: number, t: number): number => {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
};

export const dist2D = (a: Vec3, b: Vec3): number => Math.hypot(a.x - b.x, a.z - b.z);

/** Horizontal forward vector from a yaw angle (radians). yaw 0 = -Z (into screen). */
export const yawForward = (yaw: number): Vec3 => ({ x: -Math.sin(yaw), y: 0, z: -Math.cos(yaw) });
/** Horizontal right vector from a yaw angle. */
export const yawRight = (yaw: number): Vec3 => ({ x: Math.cos(yaw), y: 0, z: -Math.sin(yaw) });

/** Deterministic seeded RNG (mulberry32). */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- quaternions (x, y, z, w), matching Rapier's layout ---------------------

export interface Quat {
  x: number;
  y: number;
  z: number;
  w: number;
}

export const qIdentity = (): Quat => ({ x: 0, y: 0, z: 0, w: 1 });

/** Rotation about +Y by `yaw` radians (yaw 0 faces -Z, like yawForward). */
export const qYaw = (yaw: number): Quat => ({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) });

export const qMul = (a: Quat, b: Quat): Quat => ({
  x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
  y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
  z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
  w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
});

export const qConj = (q: Quat): Quat => ({ x: -q.x, y: -q.y, z: -q.z, w: q.w });

/** Rotate a vector by a unit quaternion. */
export function qRotate(q: Quat, v: Vec3): Vec3 {
  const ix = q.w * v.x + q.y * v.z - q.z * v.y;
  const iy = q.w * v.y + q.z * v.x - q.x * v.z;
  const iz = q.w * v.z + q.x * v.y - q.y * v.x;
  const iw = -q.x * v.x - q.y * v.y - q.z * v.z;
  return {
    x: ix * q.w + iw * -q.x + iy * -q.z - iz * -q.y,
    y: iy * q.w + iw * -q.y + iz * -q.x - ix * -q.z,
    z: iz * q.w + iw * -q.z + ix * -q.y - iy * -q.x,
  };
}

/** Yaw (about +Y) of a rotation, in the yawForward convention. */
export function qToYaw(q: Quat): number {
  const f = qRotate(q, { x: 0, y: 0, z: -1 });
  return Math.atan2(-f.x, -f.z);
}

/** Local → world for a rigid frame. */
export const frameToWorld = (pos: Vec3, rot: Quat, local: Vec3): Vec3 => vadd(pos, qRotate(rot, local));

/** World → local for a rigid frame. */
export const worldToFrame = (pos: Vec3, rot: Quat, world: Vec3): Vec3 => qRotate(qConj(rot), vsub(world, pos));

export const qSlerp = (a: Quat, b: Quat, t: number): Quat => {
  let cos = a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w;
  let bx = b.x;
  let by = b.y;
  let bz = b.z;
  let bw = b.w;
  if (cos < 0) {
    cos = -cos;
    bx = -bx;
    by = -by;
    bz = -bz;
    bw = -bw;
  }
  if (cos > 0.9995) {
    const r = { x: a.x + (bx - a.x) * t, y: a.y + (by - a.y) * t, z: a.z + (bz - a.z) * t, w: a.w + (bw - a.w) * t };
    const l = Math.hypot(r.x, r.y, r.z, r.w) || 1;
    return { x: r.x / l, y: r.y / l, z: r.z / l, w: r.w / l };
  }
  const th = Math.acos(cos);
  const s = Math.sin(th);
  const wa = Math.sin((1 - t) * th) / s;
  const wb = Math.sin(t * th) / s;
  return { x: a.x * wa + bx * wb, y: a.y * wa + by * wb, z: a.z * wa + bz * wb, w: a.w * wa + bw * wb };
};
