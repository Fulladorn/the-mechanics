import type { World } from './world';

// Contract grading. Five things a client cares about, weighted into 100
// points: how fast, what shape their vehicle came back in, what you found
// along the way, the extra jobs you did, and whether you came home in one
// piece. Pure: the results screen and the tests read the same numbers.

export type Letter = 'S' | 'A' | 'B' | 'C' | 'D';

export interface GradeLine {
  id: 'time' | 'vehicle' | 'finds' | 'extras' | 'care';
  label: string;
  value: string;
  points: number;
  max: number;
}

export interface Grade {
  letter: Letter;
  score: number;
  lines: GradeLine[];
  time: number;
}

export interface GradeInput {
  time: number;
  par: number;
  integrity: number;
  lore: number;
  loreTotal: number;
  extras: number;
  extrasTotal: number;
  damage: number;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export function letterFor(score: number): Letter {
  if (score >= 90) return 'S';
  if (score >= 78) return 'A';
  if (score >= 62) return 'B';
  if (score >= 45) return 'C';
  return 'D';
}

export function fmtClock(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec - m * 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function grade(g: GradeInput): Grade {
  // Full marks at or under par, linear down to nothing at 2.2× par.
  const tk = clamp01(1 - (g.time - g.par) / (g.par * 1.2));
  const lines: GradeLine[] = [
    { id: 'time', label: 'Time', value: `${fmtClock(g.time)}  (par ${fmtClock(g.par)})`, points: Math.round(tk * 35), max: 35 },
    {
      id: 'vehicle',
      label: 'Vehicle condition',
      value: `${Math.round(clamp01(g.integrity) * 100)}%`,
      points: Math.round(clamp01((g.integrity - 0.3) / 0.7) * 30),
      max: 30,
    },
  ];
  // Levels without collectibles or extras don't penalise you for them: their
  // points fold into the other lines.
  const opt: GradeLine[] = [];
  if (g.loreTotal > 0)
    opt.push({ id: 'finds', label: 'Finds', value: `${g.lore} / ${g.loreTotal}`, points: Math.round((g.lore / g.loreTotal) * 12), max: 12 });
  if (g.extrasTotal > 0)
    opt.push({ id: 'extras', label: 'Extra work', value: `${g.extras} / ${g.extrasTotal}`, points: Math.round((g.extras / g.extrasTotal) * 10), max: 10 });
  const care = clamp01(1 - g.damage / 120);
  opt.push({
    id: 'care',
    label: 'Injuries',
    value: g.damage < 1 ? 'None' : g.damage < 30 ? 'Scrapes' : g.damage < 70 ? 'Banged up' : 'Stitches',
    points: Math.round(care * 13),
    max: 13,
  });
  lines.push(...opt);
  const got = lines.reduce((a, l) => a + l.points, 0);
  const max = lines.reduce((a, l) => a + l.max, 0);
  const score = Math.round((got / max) * 100);
  return { letter: letterFor(score), score, lines, time: g.time };
}

/** Grade a finished world. `main` is the contract vehicle's key. */
export function gradeWorld(w: World): Grade {
  const lv = w.level;
  const main = [...w.placements.values()].find((p) => p.vehicle && p.def.inspect);
  const v = main ? w.vehicles.get(main.key) : undefined;
  const side = lv.side ?? [];
  return grade({
    time: w.elapsed,
    par: lv.par,
    integrity: v?.integrity ?? 1,
    lore: w.lore.size,
    loreTotal: lv.lore?.length ?? 0,
    extras: side.filter((s) => s.done(w)).length,
    extrasTotal: side.length,
    damage: w.damageTaken,
  });
}
