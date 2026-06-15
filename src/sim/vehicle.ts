import type { Vec3 } from '../shared/math';
import {
  VEHICLE_BASE_ACCEL,
  VEHICLE_BASE_DURABILITY,
  VEHICLE_BASE_GRIP,
  VEHICLE_BASE_TOPSPEED,
} from '../shared/constants';

// The buildable vehicle: a bare chassis with sockets you fill by carrying parts
// over and bolting them on. Pure + deterministic + DOM-free (mirrors puzzles/*).
// Part *variants* change both looks (render params) and driving stats.

export type PartKind =
  | 'wheel'
  | 'engine'
  | 'battery'
  | 'seat'
  | 'body'
  | 'bumper'
  | 'headlights'
  | 'spoiler'
  | 'exhaust';

export interface StatDelta {
  topSpeed: number;
  accel: number;
  grip: number;
  durability: number;
}

export interface PartVariant {
  id: string;
  kind: PartKind;
  name: string;
  stats: StatDelta;
  /** Pure render params consumed by the mesh builder (no Three import here). */
  render: { color?: number; shape?: string; scale?: number };
}

export interface Socket {
  id: string;
  accepts: PartKind;
  required: boolean;
  anchor: Vec3; // local offset on the chassis (chassis faces -Z, like the kart)
  installed: string | null; // PartVariant.id
}

export interface Vehicle {
  sockets: Socket[];
  bodyColor: number;
  baseStats: StatDelta;
}

export interface VehicleStats {
  topSpeed: number;
  accel: number;
  grip: number;
  durability: number;
}

const d = (
  topSpeed = 0,
  accel = 0,
  grip = 0,
  durability = 0,
): StatDelta => ({ topSpeed, accel, grip, durability });

// Data-driven catalog. The first variant of each kind is the "base" (zero delta)
// so a base-variant build reproduces the legacy kart feel exactly.
export const PART_VARIANTS: Record<PartKind, PartVariant[]> = {
  wheel: [
    { id: 'wheel.street', kind: 'wheel', name: 'Street Tires', stats: d(), render: { shape: 'street', color: 0x1b1e24 } },
    { id: 'wheel.offroad', kind: 'wheel', name: 'Off-road Tires', stats: d(-0.3, 0, 0.05, 0.05), render: { shape: 'offroad', color: 0x14171b } },
    { id: 'wheel.slick', kind: 'wheel', name: 'Racing Slicks', stats: d(0.5, 0.2, -0.03, 0), render: { shape: 'slick', color: 0x202228 } },
  ],
  engine: [
    { id: 'engine.v4', kind: 'engine', name: 'Stock V4', stats: d(), render: { color: 0x3b6ea5 } },
    { id: 'engine.v6', kind: 'engine', name: 'Turbo V6', stats: d(3, 3, 0, 0), render: { color: 0xb5793c } },
    { id: 'engine.v8', kind: 'engine', name: 'Roaring V8', stats: d(6, 5, -0.04, 0), render: { color: 0xd14b3a } },
  ],
  battery: [
    { id: 'battery.std', kind: 'battery', name: 'Standard Cell', stats: d(), render: { color: 0x2f7fd1 } },
    { id: 'battery.hd', kind: 'battery', name: 'Heavy-duty Cell', stats: d(0, 1, 0, 0.1), render: { color: 0x39b36b } },
  ],
  seat: [
    { id: 'seat.std', kind: 'seat', name: 'Bench Seat', stats: d(), render: { color: 0x222831 } },
    { id: 'seat.racing', kind: 'seat', name: 'Racing Bucket', stats: d(0, 0.5, 0, 0), render: { color: 0xc0392b } },
  ],
  body: [
    { id: 'body.std', kind: 'body', name: 'Steel Shell', stats: d(), render: { color: 0xe5484d } },
    { id: 'body.light', kind: 'body', name: 'Fiberglass Shell', stats: d(1, 1.5, 0, -0.1), render: { color: 0xf1c40f } },
    { id: 'body.armor', kind: 'body', name: 'Armor Plating', stats: d(-1.5, 0, 0, 0.3), render: { color: 0x6b7280 } },
  ],
  bumper: [
    { id: 'bumper.std', kind: 'bumper', name: 'Steel Bumper', stats: d(0, 0, 0, 0.15), render: { color: 0x2a2f3a } },
    { id: 'bumper.bull', kind: 'bumper', name: 'Bull Bar', stats: d(-0.5, 0, 0, 0.3), render: { color: 0x9aa0aa } },
  ],
  headlights: [
    { id: 'headlights.std', kind: 'headlights', name: 'Headlights', stats: d(), render: { color: 0xfff2c8 } },
  ],
  spoiler: [
    { id: 'spoiler.gt', kind: 'spoiler', name: 'GT Wing', stats: d(-0.5, 0, 0.08, 0), render: { color: 0x202228 } },
  ],
  exhaust: [
    { id: 'exhaust.sport', kind: 'exhaust', name: 'Sport Exhaust', stats: d(1, 0.5, 0, 0), render: { color: 0x9aa0aa } },
  ],
};

const variantMap: Map<string, PartVariant> = (() => {
  const m = new Map<string, PartVariant>();
  for (const list of Object.values(PART_VARIANTS)) for (const v of list) m.set(v.id, v);
  return m;
})();

export const variantById = (id: string): PartVariant | undefined => variantMap.get(id);
export const defaultVariant = (kind: PartKind): PartVariant => PART_VARIANTS[kind][0];

export function makeVehicle(): Vehicle {
  const sockets: Socket[] = [
    { id: 'wheelFL', accepts: 'wheel', required: true, anchor: { x: -0.85, y: 0.4, z: -0.85 }, installed: null },
    { id: 'wheelFR', accepts: 'wheel', required: true, anchor: { x: 0.85, y: 0.4, z: -0.85 }, installed: null },
    { id: 'wheelRL', accepts: 'wheel', required: true, anchor: { x: -0.85, y: 0.4, z: 0.85 }, installed: null },
    { id: 'wheelRR', accepts: 'wheel', required: true, anchor: { x: 0.85, y: 0.4, z: 0.85 }, installed: null },
    { id: 'engine', accepts: 'engine', required: true, anchor: { x: 0, y: 0.7, z: 0.95 }, installed: null },
    { id: 'seat', accepts: 'seat', required: true, anchor: { x: 0, y: 0.85, z: 0.1 }, installed: null },
    { id: 'body', accepts: 'body', required: true, anchor: { x: 0, y: 0.6, z: 0 }, installed: null },
    { id: 'battery', accepts: 'battery', required: false, anchor: { x: 0.5, y: 0.7, z: -0.7 }, installed: null },
    { id: 'bumper', accepts: 'bumper', required: false, anchor: { x: 0, y: 0.42, z: -1.25 }, installed: null },
    { id: 'headlights', accepts: 'headlights', required: false, anchor: { x: 0, y: 0.5, z: -1.2 }, installed: null },
    { id: 'spoiler', accepts: 'spoiler', required: false, anchor: { x: 0, y: 0.95, z: 1.2 }, installed: null },
    { id: 'exhaust', accepts: 'exhaust', required: false, anchor: { x: 0.5, y: 0.22, z: 1.25 }, installed: null },
  ];
  return {
    sockets,
    bodyColor: 0xe5484d,
    baseStats: {
      topSpeed: VEHICLE_BASE_TOPSPEED,
      accel: VEHICLE_BASE_ACCEL,
      grip: VEHICLE_BASE_GRIP,
      durability: VEHICLE_BASE_DURABILITY,
    },
  };
}

/** Open sockets that accept a part kind (the client picks the nearest by world pos). */
export function openSockets(v: Vehicle, kind: PartKind): Socket[] {
  return v.sockets.filter((s) => s.accepts === kind && s.installed === null);
}

export function socketById(v: Vehicle, id: string): Socket | undefined {
  return v.sockets.find((s) => s.id === id);
}

/** Install (or swap) a variant into a socket. Returns true if it changed. */
export function installPart(v: Vehicle, socketId: string, variantId: string): boolean {
  const s = socketById(v, socketId);
  const variant = variantById(variantId);
  if (!s || !variant || variant.kind !== s.accepts) return false;
  if (s.installed === variantId) return false;
  s.installed = variantId;
  return true;
}

export const isDrivable = (v: Vehicle): boolean =>
  v.sockets.every((s) => !s.required || s.installed !== null);

export const requiredRemaining = (v: Vehicle): PartKind[] =>
  v.sockets.filter((s) => s.required && s.installed === null).map((s) => s.accepts);

const clampStats = (s: VehicleStats): VehicleStats => ({
  topSpeed: Math.max(6, s.topSpeed),
  accel: Math.max(6, s.accel),
  grip: Math.max(0.4, s.grip),
  durability: Math.max(0.5, s.durability),
});

/** Resolve absolute stats = base + sum of installed variant deltas (order-independent). */
export function deriveStats(v: Vehicle): VehicleStats {
  const out: VehicleStats = { ...v.baseStats };
  for (const s of v.sockets) {
    if (!s.installed) continue;
    const variant = variantById(s.installed);
    if (!variant) continue;
    out.topSpeed += variant.stats.topSpeed;
    out.accel += variant.stats.accel;
    out.grip += variant.stats.grip;
    out.durability += variant.stats.durability;
  }
  return clampStats(out);
}
