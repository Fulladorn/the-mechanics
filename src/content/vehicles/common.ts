import type { Vec3 } from '../../shared/math';
import type { BoltDef, SlotDef } from '../../sim/machine';

// Shared helpers for describing vehicles as machines.

/**
 * Lug nuts on a wheel hub. `side` is -1 for the left (−X) side, +1 for the
 * right; the nuts sit on the outer face in a circle.
 */
export function lugNuts(hub: Vec3, side: -1 | 1, count = 5, radius = 0.075, outset = 0.13): BoltDef[] {
  const out: BoltDef[] = [];
  for (let i = 0; i < count; i++) {
    const a = Math.PI / 2 + (i / count) * Math.PI * 2;
    out.push({
      pos: { x: hub.x + side * outset, y: hub.y + Math.sin(a) * radius, z: hub.z + Math.cos(a) * radius },
      normal: { x: side, y: 0, z: 0 },
    });
  }
  return out;
}

/** A wheel slot with lug nuts that needs the given jack raised. */
export function wheelSlot(id: string, label: string, hub: Vec3, side: -1 | 1, jack: string, where?: string): SlotDef {
  return {
    t: 'slot',
    id,
    label,
    accepts: 'wheel',
    pos: hub,
    bolts: lugNuts(hub, side),
    lift: jack,
    r: 0.36,
    boltNoun: 'lug nut',
    where,
  };
}
