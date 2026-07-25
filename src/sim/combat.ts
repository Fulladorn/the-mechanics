import type { Vec3 } from '../shared/math';
import { clamp, dist2D, makeRng, vnorm } from '../shared/math';

// One enemy archetype: the mountain wolf. Combat is the spice, not the meal
// (GDD §3.6) — a legible telegraph → dodge-or-block → punish loop, tuned so a
// lone player can win it slowly and cleanly.
//
// Pure and seeded: no Math.random, no wall-clock. Each wolf carries its own RNG
// stream so adding or removing one can't desync the others.

export type WolfState = 'idle' | 'stalk' | 'telegraph' | 'lunge' | 'recover' | 'flee' | 'dead';

export interface Wolf {
  id: number;
  pos: Vec3;
  yaw: number;
  hp: number;
  state: WolfState;
  /** Seconds left in the current state. */
  timer: number;
  /** Home position — wolves don't chase you across the whole mountain. */
  home: Vec3;
  /** True once this wolf has been staggered and is briefly open to a hit. */
  staggered: boolean;
  rng: () => number;
}

export interface CombatDef {
  wolfHp: number;
  /** Distance at which a wolf notices you. */
  noticeRange: number;
  /** How far from home a wolf will pursue. */
  leash: number;
  moveSpeed: number;
  lungeSpeed: number;
  /** Seconds of wind-up before a lunge — the player's window to react. */
  telegraphTime: number;
  lungeTime: number;
  recoverTime: number;
  /** Damage a connecting lunge deals. */
  biteDamage: number;
  /** Radius within which a lunge connects. */
  biteRange: number;
  /** Damage the player's improvised weapon deals. */
  hitDamage: number;
  meleeRange: number;
}

export const WOLF: CombatDef = {
  wolfHp: 100,
  noticeRange: 17,
  leash: 34,
  moveSpeed: 5.2,
  lungeSpeed: 12.5,
  telegraphTime: 0.75,
  lungeTime: 0.42,
  recoverTime: 1.25,
  biteDamage: 17,
  biteRange: 2.4,
  hitDamage: 42,
  meleeRange: 3.0,
};

export function makeWolf(id: number, pos: Vec3, seed: number): Wolf {
  return {
    id,
    pos: { ...pos },
    yaw: 0,
    hp: WOLF.wolfHp,
    state: 'idle',
    timer: 0,
    home: { ...pos },
    staggered: false,
    rng: makeRng(seed + id * 7919),
  };
}

export interface CombatEvent {
  t: 'wolfTelegraph' | 'wolfLunge' | 'wolfHit' | 'wolfHurt' | 'wolfDied' | 'wolfNotice';
  id: number;
  pos: Vec3;
  damage?: number;
}

export interface WolfTarget {
  pos: Vec3;
  /** Blocking halves incoming damage and staggers the attacker. */
  blocking: boolean;
  /** Downed players are ignored. */
  downed: boolean;
}

/**
 * Advance one wolf. Returns the damage it dealt to the target this step (the
 * caller applies it, so hazards stay the single place HP changes).
 */
export function stepWolf(
  w: Wolf,
  target: WolfTarget,
  dt: number,
  events: CombatEvent[],
  ground?: (x: number, z: number) => number,
  def: CombatDef = WOLF,
): number {
  if (w.state === 'dead') return 0;

  const toPlayer = dist2D(w.pos, target.pos);
  const homeDist = dist2D(w.pos, w.home);
  w.timer -= dt;
  let damage = 0;

  const faceTarget = () => {
    const d = vnorm({ x: target.pos.x - w.pos.x, y: 0, z: target.pos.z - w.pos.z });
    if (d.x !== 0 || d.z !== 0) w.yaw = Math.atan2(-d.x, -d.z);
  };
  const moveToward = (p: Vec3, speed: number) => {
    const d = vnorm({ x: p.x - w.pos.x, y: 0, z: p.z - w.pos.z });
    w.pos.x += d.x * speed * dt;
    w.pos.z += d.z * speed * dt;
    if (ground) w.pos.y = ground(w.pos.x, w.pos.z);
  };

  switch (w.state) {
    case 'idle': {
      // drift a little around home so the pack looks alive
      if (w.timer <= 0) {
        w.timer = 1.5 + w.rng() * 2.5;
        w.yaw = w.rng() * Math.PI * 2;
      }
      if (homeDist > 6) moveToward(w.home, def.moveSpeed * 0.35);
      else {
        w.pos.x += -Math.sin(w.yaw) * def.moveSpeed * 0.28 * dt;
        w.pos.z += -Math.cos(w.yaw) * def.moveSpeed * 0.28 * dt;
        if (ground) w.pos.y = ground(w.pos.x, w.pos.z);
      }
      if (!target.downed && toPlayer < def.noticeRange) {
        w.state = 'stalk';
        w.timer = 0;
        events.push({ t: 'wolfNotice', id: w.id, pos: { ...w.pos } });
      }
      break;
    }

    case 'stalk': {
      faceTarget();
      if (target.downed || homeDist > def.leash) {
        w.state = 'flee';
        w.timer = 3;
        break;
      }
      // Close to just outside bite range, then commit.
      if (toPlayer > def.biteRange * 1.5) moveToward(target.pos, def.moveSpeed);
      else {
        w.state = 'telegraph';
        w.timer = def.telegraphTime;
        events.push({ t: 'wolfTelegraph', id: w.id, pos: { ...w.pos } });
      }
      break;
    }

    case 'telegraph': {
      faceTarget();
      if (w.timer <= 0) {
        w.state = 'lunge';
        w.timer = def.lungeTime;
        events.push({ t: 'wolfLunge', id: w.id, pos: { ...w.pos } });
      }
      break;
    }

    case 'lunge': {
      moveToward(target.pos, def.lungeSpeed);
      if (toPlayer <= def.biteRange && !target.downed) {
        if (target.blocking) {
          // Blocked: the wolf bounces off and is open for a moment.
          damage = def.biteDamage * 0.25;
          w.staggered = true;
          w.state = 'recover';
          w.timer = def.recoverTime * 1.6;
        } else {
          damage = def.biteDamage;
          w.state = 'recover';
          w.timer = def.recoverTime;
        }
        events.push({ t: 'wolfHit', id: w.id, pos: { ...w.pos }, damage });
      } else if (w.timer <= 0) {
        // Missed — a dodge earns the same punish window as a block.
        w.staggered = true;
        w.state = 'recover';
        w.timer = def.recoverTime;
      }
      break;
    }

    case 'recover': {
      if (w.timer <= 0) {
        w.staggered = false;
        w.state = target.downed || homeDist > def.leash ? 'flee' : 'stalk';
        w.timer = 0;
      }
      break;
    }

    case 'flee': {
      moveToward(w.home, def.moveSpeed * 0.8);
      if (w.timer <= 0 || homeDist < 3) {
        w.state = 'idle';
        w.timer = 0;
      }
      break;
    }
  }

  if (ground) w.pos.y = ground(w.pos.x, w.pos.z);
  return damage;
}

/**
 * Player swings at a wolf. Hitting a staggered wolf does full damage; hitting
 * one mid-approach only chips it — which is what makes dodging worth doing.
 */
export function strikeWolf(w: Wolf, from: Vec3, facing: Vec3, events: CombatEvent[], def: CombatDef = WOLF): boolean {
  if (w.state === 'dead') return false;
  const d = dist2D(w.pos, from);
  if (d > def.meleeRange) return false;
  const dir = vnorm({ x: w.pos.x - from.x, y: 0, z: w.pos.z - from.z });
  if (facing.x * dir.x + facing.z * dir.z < 0.4) return false;

  const dmg = w.staggered ? def.hitDamage : def.hitDamage * 0.35;
  w.hp = clamp(w.hp - dmg, 0, def.wolfHp);
  if (w.hp <= 0) {
    w.state = 'dead';
    events.push({ t: 'wolfDied', id: w.id, pos: { ...w.pos } });
  } else {
    // Any connecting hit interrupts a wind-up — swinging first is a valid read.
    if (w.state === 'telegraph') {
      w.state = 'recover';
      w.timer = def.recoverTime;
      w.staggered = true;
    }
    events.push({ t: 'wolfHurt', id: w.id, pos: { ...w.pos }, damage: dmg });
  }
  return true;
}

export const aliveWolves = (ws: Wolf[]): Wolf[] => ws.filter((w) => w.state !== 'dead');
