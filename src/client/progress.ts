import { loadBests, recordBest } from '../shared/timer';

// Campaign progression: which missions are unlocked, best times, integrity and
// lore. Local-only (the game ships as a static bundle), guarded so it no-ops in
// non-DOM environments.

export interface MissionRecord {
  completed: boolean;
  bestTime?: number;
  bestIntegrity?: number;
  loreFound: boolean;
}

export interface Progress {
  missions: Record<string, MissionRecord>;
}

export interface MissionMeta {
  id: string;
  title: string;
  blurb: string;
  /** Mission that must be completed before this one unlocks. */
  requires?: string;
}

/** The campaign, in order. */
export const CAMPAIGN: MissionMeta[] = [
  {
    id: 'garage',
    title: 'The Garage',
    blurb: 'Training bay. Learn to move, scavenge, build a vehicle and drive it. No way to fail.',
  },
  {
    id: 'mountains',
    title: 'Summer Mountains',
    blurb: "A client's 4×4 is rolling toward a cliff edge. Chock it, fix it, drive it down.",
    requires: 'garage',
  },
];

const KEY = 'mech.progress.v1';

const empty = (): Progress => ({ missions: {} });

export function loadProgress(): Progress {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null;
    if (!raw) return empty();
    const parsed = JSON.parse(raw) as Partial<Progress>;
    return { missions: parsed.missions ?? {} };
  } catch {
    return empty();
  }
}

function save(p: Progress): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* ignore quota/availability errors */
  }
}

export function recordOf(p: Progress, id: string): MissionRecord {
  return p.missions[id] ?? { completed: false, loreFound: false };
}

export function isUnlocked(p: Progress, meta: MissionMeta): boolean {
  if (!meta.requires) return true;
  return recordOf(p, meta.requires).completed;
}

/** Everything beaten at least once — the campaign is open for free replay. */
export const allComplete = (p: Progress): boolean =>
  CAMPAIGN.every((m) => recordOf(p, m.id).completed);

export interface RunResult {
  time: number;
  integrity: number;
  loreFound: boolean;
  bestTime: number;
  isNewBest: boolean;
  unlocked?: MissionMeta;
}

/** Persist a completed run and report what it earned. */
export function completeMission(
  id: string,
  opts: { time: number; integrity: number; loreFound: boolean },
): RunResult {
  const p = loadProgress();
  const prev = recordOf(p, id);
  const wasCompleted = prev.completed;

  const best = recordBest(id, opts.time);
  p.missions[id] = {
    completed: true,
    bestTime: best.best,
    bestIntegrity: Math.max(prev.bestIntegrity ?? 0, opts.integrity),
    loreFound: prev.loreFound || opts.loreFound,
  };
  save(p);

  // Report the mission this run just opened up, if any.
  const unlocked = wasCompleted
    ? undefined
    : CAMPAIGN.find((m) => m.requires === id && !recordOf(p, m.id).completed);

  return {
    time: opts.time,
    integrity: opts.integrity,
    loreFound: opts.loreFound,
    bestTime: best.best,
    isNewBest: best.isNew,
    unlocked,
  };
}

/** Best times as recorded by the shared timer store (used by the level list). */
export const bestTimes = loadBests;

export function resetProgress(): void {
  save(empty());
}
