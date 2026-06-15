import type { Vec3 } from './math';

// Tools + every carryable vehicle part. Part kinds share their name with
// PartKind in sim/vehicle.ts so a carried item maps straight to a socket.
export type ItemKind =
  | 'wrench'
  | 'flashlight'
  | 'wheel'
  | 'engine'
  | 'battery'
  | 'seat'
  | 'body'
  | 'bumper'
  | 'headlights'
  | 'spoiler'
  | 'exhaust';

export interface ItemDef {
  kind: ItemKind;
  label: string;
  icon: string; // emoji glyph for the hotbar (procedural-first, no image assets)
  heavy: boolean; // heavy parts are carried in hand, not stowed in the toolbelt
}

export const ITEM_DEFS: Record<ItemKind, ItemDef> = {
  wrench: { kind: 'wrench', label: 'Wrench', icon: '🔧', heavy: false },
  flashlight: { kind: 'flashlight', label: 'Flashlight', icon: '🔦', heavy: false },
  wheel: { kind: 'wheel', label: 'Wheel', icon: '🛞', heavy: true },
  engine: { kind: 'engine', label: 'Engine', icon: '🛠️', heavy: true },
  battery: { kind: 'battery', label: 'Battery', icon: '🔋', heavy: false },
  seat: { kind: 'seat', label: 'Seat', icon: '💺', heavy: true },
  body: { kind: 'body', label: 'Body Shell', icon: '🚗', heavy: true },
  bumper: { kind: 'bumper', label: 'Bumper', icon: '🛡️', heavy: true },
  headlights: { kind: 'headlights', label: 'Headlights', icon: '💡', heavy: false },
  spoiler: { kind: 'spoiler', label: 'Spoiler', icon: '🪽', heavy: true },
  exhaust: { kind: 'exhaust', label: 'Exhaust', icon: '💨', heavy: true },
};

export interface WorldItem {
  id: number;
  kind: ItemKind;
  pos: Vec3;
  picked: boolean;
  variantId?: string; // for part items: which PartVariant this pickup installs
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
  | { t: 'solveLore' };

/** Things the sim emits each step for the client to turn into FX/SFX/UI. */
export type SimEvent =
  | { t: 'pickup'; kind: ItemKind }
  | { t: 'drop'; kind: ItemKind }
  | { t: 'installPart'; kind: ItemKind; variantId: string }
  | { t: 'paint'; color: number }
  | { t: 'vehicleDrivable' }
  | { t: 'gateOpen' }
  | { t: 'enterKart' }
  | { t: 'exitKart' }
  | { t: 'checkpoint'; index: number; total: number }
  | { t: 'openLore' }
  | { t: 'lore' }
  | { t: 'objectiveDone'; id: string }
  | { t: 'win' }
  | { t: 'sfx'; name: 'pickup' | 'install' | 'success' | 'gate' | 'enter' | 'win' };

export interface InteractTarget {
  kind: 'pickup' | 'installPart' | 'paint' | 'openLore' | 'enterKart' | 'clockIn';
  label: string;
  pos: Vec3;
  itemId?: number; // for pickup
  socketId?: string; // for installPart
  variantId?: string; // for installPart
}
