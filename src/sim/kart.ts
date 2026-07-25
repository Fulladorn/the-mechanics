import type { Vec3 } from '../shared/math';
import { clamp } from '../shared/math';
import type { Intent } from '../shared/types';
import { KART_BRAKE, KART_FRICTION, KART_REVERSE_SPEED, KART_TURN_RATE } from '../shared/constants';
import { resolveKart, type Box, type GroundFn } from './collision';
import type { VehicleStats } from './vehicle';

export interface KartState {
  pos: Vec3; // center; y is the chassis center height
  heading: number; // radians; 0 faces -Z
  speed: number; // signed scalar along heading
  occupied: boolean;
  half: Vec3;
  /** Body attitude, driven by the terrain under the wheels (render + feel). */
  pitch: number;
  roll: number;
  /** 0..1 remaining structural integrity. */
  integrity: number;
  /** Set for one step when the vehicle hits something hard. */
  lastImpact: number;
}

export function makeKart(pos: Vec3, heading: number): KartState {
  return {
    pos: { ...pos, y: pos.y + 0.5 },
    heading,
    speed: 0,
    occupied: false,
    half: { x: 0.9, y: 0.5, z: 1.3 },
    pitch: 0,
    roll: 0,
    integrity: 1,
    lastImpact: 0,
  };
}

/** Forward unit vector of the kart in world space. */
export const kartForward = (k: KartState): Vec3 => ({
  x: -Math.sin(k.heading),
  y: 0,
  z: -Math.cos(k.heading),
});

// Driving is parameterised by the built vehicle's resolved stats: top speed,
// acceleration, grip (steering authority), durability (impact resilience).
// On a heightfield the slope under the car also feeds into the throttle, which
// is what makes the mountain descent read as a descent.
export function stepKart(
  k: KartState,
  intent: Intent | null,
  boxes: Box[],
  dt: number,
  stats: VehicleStats,
  ground?: GroundFn,
): void {
  const maxSpeed = stats.topSpeed;
  const accel = stats.accel;
  k.lastImpact = 0;

  if (!k.occupied || !intent) {
    const drag = KART_FRICTION * dt;
    k.speed = Math.abs(k.speed) <= drag ? 0 : k.speed - Math.sign(k.speed) * drag;
  } else {
    const throttle = (intent.fwd ? 1 : 0) - (intent.back ? 1 : 0);
    if (throttle > 0) {
      k.speed += accel * dt;
    } else if (throttle < 0) {
      k.speed -= (k.speed > 0.1 ? KART_BRAKE : accel) * dt;
    } else {
      const drag = KART_FRICTION * dt;
      k.speed = Math.abs(k.speed) <= drag ? 0 : k.speed - Math.sign(k.speed) * drag;
    }

    const steer = (intent.left ? 1 : 0) - (intent.right ? 1 : 0);
    const gripSpeed = clamp(Math.abs(k.speed) / 4, 0, 1);
    k.heading += steer * KART_TURN_RATE * gripSpeed * stats.grip * dt * (k.speed >= 0 ? 1 : -1);
  }

  const fwd = kartForward(k);

  // Gravity along the slope: sample ahead and behind to get the grade the car
  // is actually sitting on, then push the throttle accordingly.
  if (ground) {
    const ahead = ground(k.pos.x + fwd.x * k.half.z, k.pos.z + fwd.z * k.half.z);
    const behind = ground(k.pos.x - fwd.x * k.half.z, k.pos.z - fwd.z * k.half.z);
    const grade = (ahead - behind) / (2 * k.half.z); // +ve = climbing
    k.pitch = -Math.atan(grade);
    k.speed -= grade * 14 * dt;
    // Rolling resistance uphill is what stops you creeping up a cliff face.
    if (grade > 0.55 && k.speed > 0) k.speed *= 1 - Math.min(0.9, (grade - 0.55) * 2) * dt * 4;

    const rx = -fwd.z;
    const rz = fwd.x;
    const right = ground(k.pos.x + rx * k.half.x, k.pos.z + rz * k.half.x);
    const left = ground(k.pos.x - rx * k.half.x, k.pos.z - rz * k.half.x);
    k.roll = Math.atan((right - left) / (2 * k.half.x));
  }

  k.speed = clamp(k.speed, -KART_REVERSE_SPEED, maxSpeed);

  k.pos.x += fwd.x * k.speed * dt;
  k.pos.z += fwd.z * k.speed * dt;

  if (ground) {
    const gh = ground(k.pos.x, k.pos.z);
    // Settle onto the surface rather than snapping, so crests and dips feel
    // like suspension travel instead of teleports.
    const targetY = gh + k.half.y;
    k.pos.y += (targetY - k.pos.y) * Math.min(1, dt * 14);
  }

  if (resolveKart(k.pos, k.half, boxes)) {
    const before = Math.abs(k.speed);
    const keep = clamp(0.25 + (stats.durability - 1) * 0.2, 0.1, 0.7);
    k.speed *= keep; // crunch into a wall, bleed momentum (less if durable)
    // Only a meaningful shunt counts as damage; scraping a wall shouldn't.
    if (before > 5) {
      const severity = ((before - 5) / 12) * (1 - keep);
      k.lastImpact = severity;
      k.integrity = clamp(k.integrity - severity / Math.max(0.5, stats.durability), 0, 1);
    }
  }
}
