import type { Quat, Vec3 } from '../shared/math';
import { qConj, qRotate } from '../shared/math';

// What the crosshair can act on. Every gameplay system (items, machines,
// stations, vehicles) contributes candidates each tick; `pickFocus` chooses the
// one under the crosshair with a real ray test, falling back to a small aim
// assist cone so tiny things like lug nuts are still easy to hit.

/**
 * tap    — press E
 * hold   — hold E for `time` seconds
 * loosen — hold LMB (with the wrench) for `time` seconds
 * torque — hold LMB to wind torque, release inside the band
 * pour   — hold E to pour continuously
 */
export type Verb = 'tap' | 'hold' | 'loosen' | 'torque' | 'pour';

export interface Gauge {
  value: number;
  lo: number;
  hi: number;
}

/** An oriented box target, centred on the interactable's `pos`. */
export interface TargetBox {
  hx: number;
  hy: number;
  hz: number;
  rot?: Quat;
}

export interface Interactable {
  /** Stable id: holds and highlights key off it. */
  id: string;
  pos: Vec3;
  /** Hit radius (for boxes: a bounding radius, used for culling and aim assist). */
  r: number;
  /** Hit the whole face of something flat or oblong (doors, boards, lockers). */
  box?: TargetBox;
  label: string;
  verb: Verb;
  /** Seconds, for hold/loosen. */
  time?: number;
  /** When set the prompt shows but can't be used; this is the reason why. */
  disabled?: string;
  /** Higher wins ties on the ray. */
  priority?: number;
  /** What to highlight in the world: 'item:12', 'machine:betsy:bolt:wheelRL#2' ... */
  target?: string;
  run?: () => void;
  tick?: (dt: number) => void;
  release?: () => void;
  gauge?: () => Gauge;
}

export interface Ray {
  origin: Vec3;
  dir: Vec3;
}

export const INTERACT_REACH = 3.1;

/** Distance along the ray to a sphere, or -1 when missed. */
function raySphere(ray: Ray, c: Vec3, r: number): number {
  const ox = ray.origin.x - c.x;
  const oy = ray.origin.y - c.y;
  const oz = ray.origin.z - c.z;
  const b = ox * ray.dir.x + oy * ray.dir.y + oz * ray.dir.z;
  const cc = ox * ox + oy * oy + oz * oz - r * r;
  const disc = b * b - cc;
  if (disc < 0) return -1;
  const s = Math.sqrt(disc);
  const t0 = -b - s;
  if (t0 >= 0) return t0;
  const t1 = -b + s;
  return t1 >= 0 ? 0 : -1; // inside the sphere counts as a hit at 0
}

/** Distance along the ray into an oriented box (slab test), or -1 when missed; inside = 0. */
export function rayBox(ray: Ray, c: Vec3, b: TargetBox): number {
  const inv = b.rot ? qConj(b.rot) : null;
  const rel = { x: ray.origin.x - c.x, y: ray.origin.y - c.y, z: ray.origin.z - c.z };
  const o = inv ? qRotate(inv, rel) : rel;
  const d = inv ? qRotate(inv, ray.dir) : ray.dir;
  let tmin = -Infinity;
  let tmax = Infinity;
  for (const [oa, da, h] of [
    [o.x, d.x, b.hx],
    [o.y, d.y, b.hy],
    [o.z, d.z, b.hz],
  ]) {
    if (Math.abs(da) < 1e-9) {
      if (oa < -h || oa > h) return -1;
      continue;
    }
    let t1 = (-h - oa) / da;
    let t2 = (h - oa) / da;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return -1;
  }
  if (tmax < 0) return -1;
  return Math.max(0, tmin);
}

function perpDist(ray: Ray, c: Vec3): number {
  const dx = c.x - ray.origin.x;
  const dy = c.y - ray.origin.y;
  const dz = c.z - ray.origin.z;
  const t = dx * ray.dir.x + dy * ray.dir.y + dz * ray.dir.z;
  return Math.hypot(dx - ray.dir.x * t, dy - ray.dir.y * t, dz - ray.dir.z * t);
}

/**
 * Pick what the player is aiming at. Direct ray hits win (nearest first, then
 * priority); otherwise the candidate closest to the crosshair within a few
 * degrees. `occluded(t)` lets the caller reject things behind walls.
 */
export function pickFocus(
  ray: Ray,
  candidates: Interactable[],
  reach = INTERACT_REACH,
  occluded?: (c: Interactable, dist: number) => boolean,
): Interactable | null {
  // Two passes: real targets (priority >= 0) first; big fallback volumes
  // (priority < 0: "inspect the truck", doors, getting in) only when the
  // crosshair isn't on anything more specific.
  for (const fallback of [false, true]) {
    let best: Interactable | null = null;
    let bestScore = Infinity;
    for (const c of candidates) {
      const pri = c.priority ?? 0;
      if (pri < 0 !== fallback) continue;
      const t = c.box ? rayBox(ray, c.pos, c.box) : raySphere(ray, c.pos, c.r);
      if (t < 0 || t > reach) continue;
      // Score: distance along the ray, plus how far the crosshair is from the
      // target's centre (so of two overlapping lug nuts, the one you're
      // pointing at wins), minus a bonus per priority level (so a nut beats
      // the wheel it sits on). A box you're inside the face of counts as
      // dead centre — it's big on purpose.
      const off = c.box ? Math.min(perpDist(ray, c.pos), 0.15) : perpDist(ray, c.pos);
      const s = t + 3 * off - Math.max(0, pri) * 0.2;
      if (s >= bestScore) continue;
      if (occluded?.(c, t)) continue;
      best = c;
      bestScore = s;
    }
    if (best) return best;

    // Aim assist: smallest angle to the centre, within ~5° plus the target's size.
    let bestAng = Infinity;
    for (const c of candidates) {
      const pri = c.priority ?? 0;
      if (pri < 0 !== fallback) continue;
      const dx = c.pos.x - ray.origin.x;
      const dy = c.pos.y - ray.origin.y;
      const dz = c.pos.z - ray.origin.z;
      const d = Math.hypot(dx, dy, dz);
      if (d > reach + c.r || d < 1e-4) continue;
      const cos = (dx * ray.dir.x + dy * ray.dir.y + dz * ray.dir.z) / d;
      if (cos <= 0) continue;
      const ang = Math.acos(Math.min(1, cos));
      const allow = 0.085 + Math.atan(c.r / d) * 0.6;
      if (ang > allow || ang >= bestAng) continue;
      if (occluded?.(c, d)) continue;
      best = c;
      bestAng = ang;
    }
    if (best) return best;
  }
  return null;
}
