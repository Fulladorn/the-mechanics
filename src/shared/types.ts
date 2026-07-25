import type { Vec3 } from './math';

// Tools + every carryable vehicle part. Part kinds share their name with
// PartKind in sim/vehicle.ts so a carried item maps straight to a socket.
export type ItemKind =
  | 'wrench'
  | 'flashlight'
  | 'medkit'
  | 'flare'
  | 'wheel'
  | 'engine'
  | 'battery'
  | 'seat'
  | 'body'
  | 'bumper'
  | 'headlights'
  | 'spoiler'
  | 'exhaust'
  | 'fuel'
  | 'brakes'
  | 'coolant'
  | 'winch'
  | 'rooflight';

export interface ItemDef {
  kind: ItemKind;
  label: string;
  icon: string; // emoji glyph for the hotbar (procedural-first, no image assets)
  heavy: boolean; // heavy parts are carried in hand, not stowed in the toolbelt
}

export const ITEM_DEFS: Record<ItemKind, ItemDef> = {
  wrench: { kind: 'wrench', label: 'Wrench', icon: '🔧', heavy: false },
  flashlight: { kind: 'flashlight', label: 'Flashlight', icon: '🔦', heavy: false },
  medkit: { kind: 'medkit', label: 'Medkit', icon: '🩹', heavy: false },
  flare: { kind: 'flare', label: 'Flare', icon: '🧨', heavy: false },
  wheel: { kind: 'wheel', label: 'Wheel', icon: '🛞', heavy: true },
  engine: { kind: 'engine', label: 'Engine', icon: '🛠️', heavy: true },
  battery: { kind: 'battery', label: 'Battery', icon: '🔋', heavy: false },
  seat: { kind: 'seat', label: 'Seat', icon: '💺', heavy: true },
  body: { kind: 'body', label: 'Body Shell', icon: '🚗', heavy: true },
  bumper: { kind: 'bumper', label: 'Bumper', icon: '🛡️', heavy: true },
  headlights: { kind: 'headlights', label: 'Headlights', icon: '💡', heavy: false },
  spoiler: { kind: 'spoiler', label: 'Spoiler', icon: '🪽', heavy: true },
  exhaust: { kind: 'exhaust', label: 'Exhaust', icon: '💨', heavy: true },
  fuel: { kind: 'fuel', label: 'Fuel Can', icon: '⛽', heavy: true },
  brakes: { kind: 'brakes', label: 'Brakes', icon: '🛑', heavy: true },
  coolant: { kind: 'coolant', label: 'Coolant Loop', icon: '💧', heavy: true },
  winch: { kind: 'winch', label: 'Winch', icon: '⚓', heavy: true },
  rooflight: { kind: 'rooflight', label: 'Roof Lights', icon: '🔆', heavy: true },
};

export interface WorldItem {
  id: number;
  kind: ItemKind;
  pos: Vec3;
  picked: boolean;
  variantId?: string; // for part items: which PartVariant this pickup installs
  /** Hidden until this objective completes (e.g. the cave reward). */
  lockedUntil?: string;
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
  /** RMB held: guard in combat, brace a held object. */
  block: boolean;
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
  block: false,
  yaw: 0,
  pitch: 0,
});

/** Discrete, edge-triggered actions queued by the client. */
export type Command =
  | { t: 'interact' }
  | { t: 'drop' }
  | { t: 'slot'; n: number }
  | { t: 'attack' }
  | { t: 'useItem' }
  | { t: 'solveLore' }
  | { t: 'solvePuzzle'; socketId: string };

export type SfxName =
  | 'pickup'
  | 'install'
  | 'success'
  | 'gate'
  | 'enter'
  | 'win'
  | 'repair'
  | 'hurt'
  | 'wolfGrowl'
  | 'wolfBite'
  | 'wolfDie'
  | 'swing'
  | 'crash'
  | 'heal'
  | 'fail';

/** Things the sim emits each step for the client to turn into FX/SFX/UI. */
export type SimEvent =
  | { t: 'pickup'; kind: ItemKind }
  | { t: 'drop'; kind: ItemKind }
  | { t: 'installPart'; kind: ItemKind; variantId: string }
  | { t: 'uninstallPart'; kind: ItemKind }
  | { t: 'paint'; color: number }
  | { t: 'vehicleDrivable' }
  | { t: 'gateOpen' }
  | { t: 'enterKart' }
  | { t: 'exitKart' }
  | { t: 'checkpoint'; index: number; total: number }
  | { t: 'openLore' }
  | { t: 'openPuzzle'; socketId: string; puzzle: 'fuse' | 'bolt' | 'valve'; label: string }
  | { t: 'repaired'; socketId: string }
  | { t: 'lore' }
  | { t: 'objectiveDone'; id: string }
  | { t: 'damage'; amount: number; cause: string }
  | { t: 'healed'; amount: number }
  | { t: 'chocked' }
  | { t: 'impact'; severity: number; pos: Vec3 }
  | { t: 'wolf'; kind: 'notice' | 'telegraph' | 'lunge' | 'hit' | 'hurt' | 'died'; id: number; pos: Vec3 }
  | { t: 'swing' }
  | { t: 'win' }
  | { t: 'fail'; reason: 'downed' | 'vehicle' | 'creep' }
  | { t: 'sfx'; name: SfxName };

export type InteractKind =
  | 'pickup'
  | 'installPart'
  | 'uninstallPart'
  | 'repair'
  | 'paint'
  | 'openLore'
  | 'chock'
  | 'enterKart'
  | 'clockIn';

export interface InteractTarget {
  kind: InteractKind;
  label: string;
  pos: Vec3;
  /**
   * Higher wins regardless of aim. Keeps "Drive" and "Repair" from being
   * shadowed by the "Remove part" prompt on every socket of the same vehicle.
   */
  priority?: number;
  itemId?: number; // for pickup
  socketId?: string; // for installPart / uninstallPart / repair
  variantId?: string; // for installPart
  stationId?: string; // for stations
}
