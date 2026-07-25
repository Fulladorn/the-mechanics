import type { SimEvent } from '../shared/types';
import type { ObjectiveDef } from '../content/levels/types';

// Objectives are level data, not a hard-coded enum — each mission ships its own
// checklist and World just completes them by id.

export interface Objective extends ObjectiveDef {
  done: boolean;
}

export class Objectives {
  list: Objective[];

  constructor(defs: ReadonlyArray<ObjectiveDef>) {
    this.list = defs.map((o) => ({ ...o, done: false }));
  }

  has(id: string): boolean {
    return this.list.some((o) => o.id === id);
  }

  isDone(id: string): boolean {
    return this.list.find((o) => o.id === id)?.done ?? false;
  }

  /** Mark complete; returns true the first time it transitions to done. */
  complete(id: string, events: SimEvent[]): boolean {
    const o = this.list.find((x) => x.id === id);
    if (!o || o.done) return false;
    o.done = true;
    events.push({ t: 'objectiveDone', id });
    return true;
  }

  /**
   * Every required objective except the final one is complete — i.e. the player
   * can now trigger the mission's finish (clock out, or drive to exfil).
   */
  readyToFinish(): boolean {
    return this.list.slice(0, -1).every((o) => o.done || o.optional);
  }

  allDone(): boolean {
    return this.list.every((o) => o.done || o.optional);
  }

  /** Index of the objective the HUD should highlight. */
  activeIndex(): number {
    const i = this.list.findIndex((o) => !o.done && !o.optional);
    if (i !== -1) return i;
    const j = this.list.findIndex((o) => !o.done);
    return j === -1 ? this.list.length - 1 : j;
  }

  active(): Objective | undefined {
    return this.list[this.activeIndex()];
  }
}
