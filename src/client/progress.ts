import { loadBests, recordBest } from '../shared/timer';

// Campaign progression: which missions are unlocked, best times, integrity and
// lore. Local-only (the game ships as a static bundle), guarded so it no-ops in
// non-DOM environments.

export interface MissionRecord {
  completed: boolean;
  bestTime?: number;
  bestIntegrity?: number;
  loreFound: boolean;
  bestGrade?: string;
  bestScore?: number;
  lore?: string[];
}

export interface Progress {
  missions: Record<string, MissionRecord>;
}

export interface MissionMeta {
  id: string;
  title: string;
  /** Where / who, shown above the title on the contract card. */
  client: string;
  blurb: string;
  /** Rough play length, minutes. */
  minutes: number;
  hour: string;
  /** Mission that must be completed before this one unlocks. */
  requires?: string;
}

/** The campaign, in order. */
export const CAMPAIGN: MissionMeta[] = [
  {
    id: 'depot',
    title: 'Orientation Day',
    client: 'The Company · Depot 7',
    blurb: 'Your first shift. Punch in, get your tools, and get the practice truck back on the road before the boss finishes his coffee. Nothing here can go wrong. Probably.',
    minutes: 8,
    hour: 'Morning',
  },
  {
    id: 'ridge',
    title: 'The Ridge Job',
    client: 'Private client · Kestrel Ridge',
    blurb: 'A 4×4 abandoned at the summit overlook — and it just started rolling. Save it, scavenge the mountain for parts, and drive it down before the wolves come out.',
    minutes: 22,
    hour: 'Golden hour → dusk',
    requires: 'depot',
  },
];

const KEY = 'mech.progress.v2';

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
  isBestGrade: boolean;
}

/** Persist a completed run and report what it earned. */
export function completeMission(
  id: string,
  opts: { time: number; integrity: number; loreFound: boolean; grade?: string; score?: number; lore?: string[] },
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
    bestGrade: (opts.score ?? -1) > (prev.bestScore ?? -1) ? opts.grade : prev.bestGrade,
    bestScore: Math.max(prev.bestScore ?? -1, opts.score ?? -1),
    lore: [...new Set([...(prev.lore ?? []), ...(opts.lore ?? [])])],
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
    isBestGrade: (opts.score ?? -1) > (prev.bestScore ?? -1),
  };
}

/** Best times as recorded by the shared timer store (used by the level list). */
export const bestTimes = loadBests;

export function resetProgress(): void {
  save(empty());
}
