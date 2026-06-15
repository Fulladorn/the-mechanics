import type { Vec3 } from '../shared/math';
import { clamp } from '../shared/math';
import type { Intent } from '../shared/types';
import { KART_BRAKE, KART_FRICTION, KART_REVERSE_SPEED, KART_TURN_RATE } from '../shared/constants';
import { resolveKart, type Box } from './collision';
import type { VehicleStats } from './vehicle';

export interface KartState {
  pos: Vec3; // center; y is the chassis center height
  heading: number; // radians; 0 faces -Z
  speed: number; // signed scalar along heading
  occupied: boolean;
  half: Vec3;
}

export function makeKart(pos: Vec3, heading: number): KartState {
  return {
    pos: { ...pos, y: 0.5 },
    heading,
    speed: 0,
    occupied: false,
    half: { x: 0.9, y: 0.5, z: 1.3 },
  };
}

/** Forward unit vector of the kart in world space. */
export const kartForward = (k: KartState): Vec3 => ({
  x: -Math.sin(k.heading),
  y: 0,
  z: -Math.cos(k.heading),
});

// Driving is now parameterised by the built vehicle's resolved stats:
// top speed, acceleration, grip (steering authority), durability (wall resilience).
export function stepKart(
  k: KartState,
  intent: Intent | null,
  boxes: Box[],
  dt: number,
  stats: VehicleStats,
): void {
  const maxSpeed = stats.topSpeed;
  const accel = stats.accel;

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
    k.speed = clamp(k.speed, -KART_REVERSE_SPEED, maxSpeed);

    const steer = (intent.left ? 1 : 0) - (intent.right ? 1 : 0);
    const gripSpeed = clamp(Math.abs(k.speed) / 4, 0, 1);
    k.heading += steer * KART_TURN_RATE * gripSpeed * stats.grip * dt * (k.speed >= 0 ? 1 : -1);
  }

  const fwd = kartForward(k);
  k.pos.x += fwd.x * k.speed * dt;
  k.pos.z += fwd.z * k.speed * dt;

  if (resolveKart(k.pos, k.half, boxes)) {
    const keep = clamp(0.25 + (stats.durability - 1) * 0.2, 0.1, 0.7);
    k.speed *= keep; // crunch into a wall, bleed momentum (less if durable)
  }
}
