import type { SimEvent } from '../shared/types';

export type ObjectiveId = 'move' | 'bhop' | 'pickup' | 'assemble' | 'drive' | 'clockin';

export interface Objective {
  id: ObjectiveId;
  text: string;
  done: boolean;
}

export const OBJECTIVE_LIST: ReadonlyArray<{ id: ObjectiveId; text: string }> = [
  { id: 'move', text: 'Move (WASD) and look (mouse)' },
  { id: 'bhop', text: 'Hold Space + strafe to bunny-hop through the speed gate (10 m/s)' },
  { id: 'pickup', text: 'Pick up the Wrench (E)' },
  { id: 'assemble', text: 'Build the car — bolt on every required part' },
  { id: 'drive', text: 'Drive your build through every checkpoint' },
  { id: 'clockin', text: 'Clock out at the exit terminal (E)' },
];

export class Objectives {
  list: Objective[] = OBJECTIVE_LIST.map((o) => ({ ...o, done: false }));

  isDone(id: ObjectiveId): boolean {
    return this.list.find((o) => o.id === id)?.done ?? false;
  }

  /** Mark complete; returns true the first time it transitions to done. */
  complete(id: ObjectiveId, events: SimEvent[]): boolean {
    const o = this.list.find((x) => x.id === id);
    if (!o || o.done) return false;
    o.done = true;
    events.push({ t: 'objectiveDone', id });
    return true;
  }

  /** All objectives before the final clock-out are complete. */
  readyToClockOut(): boolean {
    return this.list.filter((o) => o.id !== 'clockin').every((o) => o.done);
  }

  allDone(): boolean {
    return this.list.every((o) => o.done);
  }

  activeIndex(): number {
    const i = this.list.findIndex((o) => !o.done);
    return i === -1 ? this.list.length - 1 : i;
  }
}
