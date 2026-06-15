import { DEFAULT_BINDS, type Action } from './bindings';

export type Quality = 'low' | 'med' | 'high';

export interface Settings {
  video: {
    fov: number;
    quality: Quality;
    postfx: boolean;
    shadows: boolean;
    brightness: number; // tone-mapping exposure multiplier
  };
  audio: {
    master: number;
    music: number;
    sfx: number;
    voice: number;
  };
  controls: {
    sensitivity: number;
    invertY: boolean;
    binds: Record<Action, string>;
  };
  accessibility: {
    autohop: boolean;
    headbob: boolean;
    screenshake: boolean;
    subtitles: boolean;
    colorblind: boolean;
  };
}

export const DEFAULT_SETTINGS: Settings = {
  video: { fov: 78, quality: 'high', postfx: true, shadows: true, brightness: 1.0 },
  audio: { master: 0.9, music: 0.45, sfx: 0.9, voice: 1.0 },
  controls: { sensitivity: 0.0022, invertY: false, binds: { ...DEFAULT_BINDS } },
  accessibility: {
    autohop: true,
    headbob: true,
    screenshake: true,
    subtitles: true,
    colorblind: false,
  },
};

const KEY = 'mech.settings.v1';

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

// Deep-merge persisted values over defaults so newly-added keys never break old saves.
function deepMerge<T>(base: T, over: unknown): T {
  if (!isObj(base) || !isObj(over)) return (over === undefined ? base : (over as T));
  const out: Record<string, unknown> = { ...base };
  for (const k of Object.keys(over)) {
    out[k] = isObj((base as Record<string, unknown>)[k])
      ? deepMerge((base as Record<string, unknown>)[k], (over as Record<string, unknown>)[k])
      : (over as Record<string, unknown>)[k] ?? (base as Record<string, unknown>)[k];
  }
  return out as T;
}

const clone = (s: Settings): Settings =>
  typeof structuredClone === 'function' ? structuredClone(s) : JSON.parse(JSON.stringify(s));

export function loadSettings(): Settings {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null;
    if (!raw) return clone(DEFAULT_SETTINGS);
    return deepMerge(clone(DEFAULT_SETTINGS), JSON.parse(raw));
  } catch {
    return clone(DEFAULT_SETTINGS);
  }
}

export function saveSettings(s: Settings): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignore quota/availability errors */
  }
}

export { deepMerge as _deepMergeForTest };
