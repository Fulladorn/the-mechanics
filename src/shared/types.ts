import type { Vec3 } from './math';

export type ItemKind = 'wrench' | 'engine' | 'flashlight';

export interface ItemDef {
  kind: ItemKind;
  label: string;
  icon: string; // emoji glyph for the hotbar (procedural-first, no image assets)
  heavy: boolean; // heavy parts are carried in hand, not stowed in the toolbelt
}

export const ITEM_DEFS: Record<ItemKind, ItemDef> = {
  wrench: { kind: 'wrench', label: 'Wrench', icon: '🔧', heavy: false },
  flashlight: { kind: 'flashlight', label: 'Flashlight', icon: '🔦', heavy: false },
  engine: { kind: 'engine', label: 'Engine Block', icon: '🛠️', heavy: true },
};

export interface WorldItem {
  id: number;
  kind: ItemKind;
  pos: Vec3;
  picked: boolean;
}

/** Continuous per-tick input. Look angles are absolute (driven by the mouse). */
export interface Intent {
  fwd: boolean;
  back: boolean;
  left: boolean;
  right: boolean;
  jump: boolean;
  crouch: boolean;
  sprint: boolean;
  yaw: number;
  pitch: number;
}

export const makeIntent = (): Intent => ({
  fwd: false,
  back: false,
  left: false,
  right: false,
  jump: false,
  crouch: false,
  sprint: false,
  yaw: 0,
  pitch: 0,
});

/** Discrete, edge-triggered actions queued by the client. */
export type Command =
  | { t: 'interact' }
  | { t: 'drop' }
  | { t: 'slot'; n: number }
  | { t: 'solvePuzzle' };

/** Things the sim emits each step for the client to turn into FX/SFX/UI. */
export type SimEvent =
  | { t: 'pickup'; kind: ItemKind }
  | { t: 'drop'; kind: ItemKind }
  | { t: 'install' }
  | { t: 'gateOpen' }
  | { t: 'enterKart' }
  | { t: 'exitKart' }
  | { t: 'checkpoint'; index: number; total: number }
  | { t: 'openPuzzle' }
  | { t: 'objectiveDone'; id: string }
  | { t: 'win' }
  | { t: 'sfx'; name: 'pickup' | 'install' | 'success' | 'gate' | 'enter' | 'win' };

export interface InteractTarget {
  kind: 'pickup' | 'openPuzzle' | 'install' | 'enterKart' | 'clockIn';
  label: string;
  pos: Vec3;
}
