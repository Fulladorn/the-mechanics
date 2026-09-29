import { DEFAULT_BINDS, type Action } from './bindings';

export type Quality = 'low' | 'med' | 'high';

export interface Settings {
  /** Migration revision (see SETTINGS_REV). */
  rev: number;
  video: {
    fov: number;
    quality: Quality;
    postfx: boolean;
    shadows: boolean;
    brightness: number; // tone-mapping exposure multiplier
    /** Vehicle camera: third-person chase or first-person cockpit. */
    vehicleCam: 'chase' | 'cockpit';
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
    /** Wider torque band on bolts. */
    torqueAssist: boolean;
    /** Speak Dispatch's lines with the browser voice instead of radio chatter. */
    tts: boolean;
  };
}

export const DEFAULT_SETTINGS: Settings = {
  rev: 3,
  video: { fov: 76, quality: 'med', postfx: true, shadows: true, brightness: 1.0, vehicleCam: 'chase' },
  audio: { master: 0.9, music: 0.45, sfx: 0.9, voice: 1.0 },
  controls: { sensitivity: 0.0022, invertY: false, binds: { ...DEFAULT_BINDS } },
  accessibility: {
    autohop: true,
    headbob: true,
    screenshake: true,
    subtitles: true,
    colorblind: false,
    torqueAssist: false,
    tts: false,
  },
};

const KEY = 'mech.settings.v2';

/** Bumped when a default changes in a way old saves should pick up. */
export const SETTINGS_REV = 3;

function migrate(s: Settings, rev: number): Settings {
  if (rev < 3) {
    // Crouch moved off Left Ctrl (Ctrl+W closed the tab). Only move saves
    // still on the old default, and only if C is free.
    const b = s.controls.binds;
    if (b.crouch === 'ControlLeft' && !Object.values(b).includes('KeyC')) b.crouch = 'KeyC';
  }
  s.rev = SETTINGS_REV;
  return s;
}

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
    const saved = JSON.parse(raw);
    const out = deepMerge(clone(DEFAULT_SETTINGS), saved);
    return migrate(out, isObj(saved) && typeof saved.rev === 'number' ? saved.rev : 0);
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
