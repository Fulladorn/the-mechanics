import type { Vec3 } from '../src/shared/math';
import { World, makeIntent, type Intent } from '../src/sim/world';
import type { SimEvent } from '../src/sim/events';

// A scripted "player" for headless tests. It moves by teleporting (walking is
// covered elsewhere) but every action goes through the real aim → focus →
// key pipeline, so if a prompt is unreachable or mislabelled, the test fails.

export class Bot {
  intent: Intent = makeIntent();
  log: SimEvent[] = [];
  constructor(readonly w: World) {}

  tick(n = 1, patch: Partial<Intent> = {}): void {
    for (let i = 0; i < n; i++) {
      this.w.step({ ...this.intent, ...patch }, 1 / 60);
      this.log.push(...this.w.drainEvents());
    }
  }

  seconds(s: number, patch: Partial<Intent> = {}): void {
    this.tick(Math.round(s * 60), patch);
  }

  /** Stand `back` metres from `p` on the side facing `from` (or the player's side), eyes on it. */
  approach(p: Vec3, back = 1.3, from?: Vec3): void {
    const me = from ?? this.w.player.pos;
    let dx = me.x - p.x;
    let dz = me.z - p.z;
    const l = Math.hypot(dx, dz) || 1;
    dx /= l;
    dz /= l;
    const x = p.x + dx * back;
    const z = p.z + dz * back;
    this.w.teleport({ x, y: this.w.terrain.heightAt(x, z) + 0.05, z });
    // Let the controller settle (and push us out of anything we landed in).
    this.tick(12);
    this.aim(p);
  }

  aim(p: Vec3): void {
    const e = this.w.player.eye();
    const dx = p.x - e.x;
    const dy = p.y - e.y;
    const dz = p.z - e.z;
    this.intent.yaw = Math.atan2(-dx, -dz);
    this.intent.pitch = Math.atan2(dy, Math.hypot(dx, dz));
    this.tick(1);
  }

  focusLabel(): string {
    return this.w.focus ? this.w.focus.label + (this.w.focus.disabled ? ` [${this.w.focus.disabled}]` : '') : '(nothing)';
  }

  /** Aim at p and tap E; returns the label that was used. */
  tapAt(p: Vec3, expect?: RegExp): string {
    this.aim(p);
    const label = this.focusLabel();
    if (expect && !expect.test(label)) throw new Error(`expected ${expect} at ${fmt(p)}, got "${label}"`);
    this.tick(1, { interact: true });
    this.tick(1);
    return label;
  }

  holdAt(p: Vec3, seconds: number, expect?: RegExp): string {
    this.aim(p);
    const label = this.focusLabel();
    if (expect && !expect.test(label)) throw new Error(`expected ${expect} at ${fmt(p)}, got "${label}"`);
    this.seconds(seconds, { interact: true });
    this.tick(1);
    return label;
  }

  loosenAt(p: Vec3): string {
    this.aim(p);
    const label = this.focusLabel();
    if (!/Loosen/.test(label)) throw new Error(`expected Loosen at ${fmt(p)}, got "${label}"`);
    this.seconds(0.6, { use: true });
    this.tick(1);
    return label;
  }

  /** Wind a bolt up and let go inside the band. */
  torqueAt(p: Vec3): string {
    this.aim(p);
    const label = this.focusLabel();
    if (!/Torque/.test(label)) throw new Error(`expected Torque at ${fmt(p)}, got "${label}"`);
    for (let i = 0; i < 200; i++) {
      this.tick(1, { use: true });
      const g = this.w.focus?.gauge?.();
      if (g && g.value >= (g.lo + g.hi) / 2) break;
    }
    this.tick(1);
    return label;
  }

  events(t: SimEvent['t']): SimEvent[] {
    return this.log.filter((e) => e.t === t);
  }
}

const fmt = (p: Vec3) => `(${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)})`;
