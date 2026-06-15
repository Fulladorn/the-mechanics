import { describe, it, expect } from 'vitest';
import {
  PART_VARIANTS,
  makeVehicle,
  installPart,
  isDrivable,
  deriveStats,
  defaultVariant,
  openSockets,
  variantById,
  type PartKind,
} from '../src/sim/vehicle';
import {
  VEHICLE_BASE_ACCEL,
  VEHICLE_BASE_DURABILITY,
  VEHICLE_BASE_GRIP,
  VEHICLE_BASE_TOPSPEED,
} from '../src/shared/constants';

const KINDS = Object.keys(PART_VARIANTS) as PartKind[];

/** Install the base (first) variant into every required socket. */
function buildBase() {
  const v = makeVehicle();
  for (const s of v.sockets) {
    if (s.required) installPart(v, s.id, defaultVariant(s.accepts).id);
  }
  return v;
}

describe('vehicle catalog', () => {
  it('every PartKind has at least one variant, ids unique, kind matches bucket', () => {
    const ids = new Set<string>();
    for (const kind of KINDS) {
      expect(PART_VARIANTS[kind].length).toBeGreaterThan(0);
      for (const variant of PART_VARIANTS[kind]) {
        expect(variant.kind).toBe(kind);
        expect(ids.has(variant.id)).toBe(false);
        ids.add(variant.id);
        expect(variantById(variant.id)).toBe(variant);
      }
    }
  });
});

describe('vehicle assembly', () => {
  it('starts not drivable; becomes drivable once all required sockets are filled', () => {
    const v = makeVehicle();
    expect(isDrivable(v)).toBe(false);
    for (const s of v.sockets.filter((x) => x.required)) {
      expect(isDrivable(v)).toBe(false); // still missing at least this one
      installPart(v, s.id, defaultVariant(s.accepts).id);
    }
    expect(isDrivable(v)).toBe(true);
  });

  it('cosmetic-only parts do not make it drivable', () => {
    const v = makeVehicle();
    for (const s of v.sockets.filter((x) => !x.required)) {
      installPart(v, s.id, defaultVariant(s.accepts).id);
    }
    expect(isDrivable(v)).toBe(false);
  });

  it('rejects a variant whose kind does not match the socket', () => {
    const v = makeVehicle();
    expect(installPart(v, 'engine', 'wheel.street')).toBe(false);
    expect(installPart(v, 'engine', 'engine.v8')).toBe(true);
  });

  it('four wheel sockets each take a wheel one at a time', () => {
    const v = makeVehicle();
    expect(openSockets(v, 'wheel').length).toBe(4);
    let open = openSockets(v, 'wheel');
    while (open.length) {
      installPart(v, open[0].id, 'wheel.street');
      open = openSockets(v, 'wheel');
    }
    expect(v.sockets.filter((s) => s.accepts === 'wheel' && s.installed).length).toBe(4);
  });
});

describe('vehicle stats', () => {
  it('a base-variant build reproduces the legacy kart numbers (no feel drift)', () => {
    expect(deriveStats(buildBase())).toEqual({
      topSpeed: VEHICLE_BASE_TOPSPEED,
      accel: VEHICLE_BASE_ACCEL,
      grip: VEHICLE_BASE_GRIP,
      durability: VEHICLE_BASE_DURABILITY,
    });
  });

  it('a V8 raises top speed over a V4', () => {
    const base = buildBase();
    const v8 = buildBase();
    installPart(v8, 'engine', 'engine.v8');
    expect(deriveStats(v8).topSpeed).toBeGreaterThan(deriveStats(base).topSpeed);
  });

  it('deriveStats is order-independent', () => {
    const a = makeVehicle();
    const b = makeVehicle();
    const reqA = a.sockets.filter((s) => s.required);
    for (const s of reqA) installPart(a, s.id, defaultVariant(s.accepts).id);
    for (const s of [...b.sockets.filter((s) => s.required)].reverse())
      installPart(b, s.id, defaultVariant(s.accepts).id);
    expect(deriveStats(a)).toEqual(deriveStats(b));
  });

  it('clamps keep a drivable car within sane floors', () => {
    const v = buildBase();
    // pile on negatives
    installPart(v, 'body', 'body.armor');
    installPart(v, 'engine', 'engine.v4');
    const s = deriveStats(v);
    expect(s.topSpeed).toBeGreaterThanOrEqual(6);
    expect(s.grip).toBeGreaterThanOrEqual(0.4);
    expect(s.durability).toBeGreaterThanOrEqual(0.5);
  });
});
