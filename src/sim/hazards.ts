import type { Vec3 } from '../shared/math';
import { clamp, dist2D } from '../shared/math';

// Survival meters. Deliberately small and legible, per GDD §3.5: health,
// stamina, and one biome exposure meter (Cold, on the mountain). Pure and
// DOM-free like the rest of the sim.

export interface HazardDef {
  /** Metres of altitude above which cold starts biting. */
  coldAltitude?: number;
  /** Exposure per second at full exposure. */
  coldRate?: number;
  /** Warmth restored per second inside a heat source. */
  warmRate?: number;
  /** Radius of a heat source. */
  warmRadius?: number;
  /** Damage per second once exposure is full. */
  coldDamage?: number;
  /** Fall speed (m/s) below which a landing is free. */
  safeFallSpeed?: number;
  /** HP per (m/s) of impact beyond the safe threshold. */
  fallDamagePerSpeed?: number;
  /** HP regenerated per second when out of danger. */
  regen?: number;
  /** Seconds out of danger before regen kicks in. */
  regenDelay?: number;
}

export const DEFAULT_HAZARDS: Required<HazardDef> = {
  // Tuned so exposure is a clock you have to respect, not a stopwatch: ~55 s of
  // full exposure to freeze, then ~40 s before it's fatal. The earlier values
  // killed you in half a minute at the summit, where the mission starts.
  coldAltitude: 34,
  coldRate: 0.018,
  warmRate: 0.42,
  warmRadius: 8,
  coldDamage: 2.5,
  safeFallSpeed: 13,
  fallDamagePerSpeed: 7.5,
  regen: 4.5,
  regenDelay: 6,
};

export interface Vitals {
  hp: number;
  maxHp: number;
  /** 0 = warm, 1 = freezing. */
  cold: number;
  /** True while the player is inside a warmth radius. */
  warming: boolean;
  /** Seconds since the last damage taken. */
  sinceDamage: number;
  downed: boolean;
}

export const makeVitals = (maxHp = 100): Vitals => ({
  hp: maxHp,
  maxHp,
  cold: 0,
  warming: false,
  sinceDamage: 999,
  downed: false,
});

export interface HazardContext {
  /** Player feet position. */
  pos: Vec3;
  /** Warmth sources: fires, cabins, the running vehicle. */
  warmth: Vec3[];
  /** True when the player is sheltered (inside the vehicle or a cabin). */
  sheltered: boolean;
}

export interface HazardResult {
  /** HP lost this step, for damage feedback. */
  damage: number;
  /** Cause, so the UI can say why. */
  cause: 'cold' | 'fall' | 'attack' | null;
  /** Set on the step the player goes down. */
  wentDown: boolean;
}

const none: HazardResult = { damage: 0, cause: null, wentDown: false };

export function stepHazards(
  v: Vitals,
  ctx: HazardContext,
  def: Required<HazardDef>,
  dt: number,
): HazardResult {
  if (v.downed) return none;

  // --- exposure ---
  let warm = ctx.sheltered;
  if (!warm) {
    for (const w of ctx.warmth) {
      if (dist2D(ctx.pos, w) <= def.warmRadius && Math.abs(ctx.pos.y - w.y) < 6) {
        warm = true;
        break;
      }
    }
  }
  v.warming = warm;

  if (warm) {
    v.cold = clamp(v.cold - def.warmRate * dt, 0, 1);
  } else {
    // Colder the higher you climb; nothing below the tree line.
    const exposure = clamp((ctx.pos.y - def.coldAltitude) / 26, 0, 1);
    v.cold = clamp(v.cold + def.coldRate * exposure * dt, 0, 1);
  }

  let damage = 0;
  let cause: HazardResult['cause'] = null;
  if (v.cold >= 1) {
    damage = def.coldDamage * dt;
    cause = 'cold';
  }

  v.sinceDamage += dt;
  if (damage > 0) v.sinceDamage = 0;
  else if (v.sinceDamage > def.regenDelay && v.hp < v.maxHp) {
    v.hp = clamp(v.hp + def.regen * dt, 0, v.maxHp);
  }

  if (damage > 0) v.hp = clamp(v.hp - damage, 0, v.maxHp);
  const wentDown = v.hp <= 0 && !v.downed;
  if (wentDown) v.downed = true;
  return damage > 0 || wentDown ? { damage, cause, wentDown } : none;
}

/** Apply a discrete hit (fall, bite, impact). Returns the HP actually lost. */
export function applyDamage(v: Vitals, amount: number): HazardResult {
  if (v.downed || amount <= 0) return none;
  v.hp = clamp(v.hp - amount, 0, v.maxHp);
  v.sinceDamage = 0;
  const wentDown = v.hp <= 0;
  if (wentDown) v.downed = true;
  return { damage: amount, cause: 'attack', wentDown };
}

/** HP cost of landing at `impactSpeed` (m/s downward). 0 if it was a safe drop. */
export function fallDamage(impactSpeed: number, def: Required<HazardDef>): number {
  const over = impactSpeed - def.safeFallSpeed;
  return over <= 0 ? 0 : over * def.fallDamagePerSpeed;
}

export const heal = (v: Vitals, amount: number): void => {
  v.hp = clamp(v.hp + amount, 0, v.maxHp);
  if (v.hp > 0) v.downed = false;
};
