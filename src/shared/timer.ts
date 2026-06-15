// Run timer + best-time persistence. Pure formatting + a tiny localStorage-backed
// store (guarded so it no-ops in non-DOM/test environments).

export function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, '0')}`;
}

const KEY = 'mech.best.v1';

export function loadBests(): Record<string, number> {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null;
    return raw ? (JSON.parse(raw) as Record<string, number>) : {};
  } catch {
    return {};
  }
}

/** Record a run; returns the current best and whether this run set it. */
export function recordBest(level: string, sec: number): { best: number; isNew: boolean } {
  const bests = loadBests();
  const prev = bests[level];
  if (prev === undefined || sec < prev) {
    bests[level] = sec;
    try {
      if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, JSON.stringify(bests));
    } catch {
      /* ignore */
    }
    return { best: sec, isNew: true };
  }
  return { best: prev, isNew: false };
}
