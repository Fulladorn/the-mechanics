import type { Vec3 } from '../../shared/math';
import type { Box } from '../../sim/collision';
import type { TerrainDef } from '../../sim/terrain';
import type { HazardDef } from '../../sim/hazards';
import type { ItemKind } from '../../shared/types';
import type { PuzzleKind, Socket } from '../../sim/vehicle';

// The data a mission is made of. Everything the sim needs to run a level lives
// here so World stays generic and levels stay pure data.

// Tags let the renderer pick materials/procedural textures per structure.
export type SolidTag =
  | 'floor'
  | 'wall'
  | 'divider'
  | 'crate'
  | 'cabinet'
  | 'pallet'
  | 'terminal'
  | 'door'
  | 'rock'
  | 'cabin'
  | 'cabinRoof'
  | 'guardrail'
  | 'invisible';

export interface Solid {
  box: Box;
  color: number;
  tag: SolidTag;
  hidden?: boolean; // collision-only (not rendered) — e.g. the open doorway
}

// Render-only decoration. Never enters collision, so the sim/tests are untouched.
export type PropKind =
  | 'tire'
  | 'barrel'
  | 'toolbox'
  | 'jackstand'
  | 'hoist'
  | 'shelf'
  | 'toolwall'
  | 'poster'
  | 'posterSymbol'
  | 'pipe'
  | 'ceilingLight'
  | 'parkingLine'
  | 'cone'
  | 'window'
  | 'fan'
  | 'hangLamp'
  | 'weldBot'
  | 'toolchest'
  | 'lockers'
  | 'compressor'
  | 'workbench'
  | 'cables'
  | 'sign'
  | 'banner'
  | 'gauge'
  | 'fireext'
  | 'jerrycan'
  | 'crateStack'
  | 'oilStain'
  | 'tireMark'
  | 'van'
  | 'fence'
  | 'yardLight'
  | 'silhouette'
  | 'tree'
  | 'powerpole'
  | 'cloud'
  | 'bird'
  | 'grass'
  | 'roadline'
  | 'lift'
  | 'paintStation'
  // --- mountain kit ---
  | 'pine'
  | 'boulder'
  | 'rockSpire'
  | 'guardrail'
  | 'campfire'
  | 'signpost'
  | 'cabinDeco'
  | 'snowPatch'
  | 'shrub'
  | 'caveMouth'
  | 'winchAnchor'
  | 'markerFlag'
  | 'wreck';

export interface Prop {
  kind: PropKind;
  pos: Vec3;
  rot?: number;
  scale?: number;
  color?: number;
}

export interface Exterior {
  skyTop: string;
  skyHorizon: string;
  ground: number;
  fogColor: number;
  fogNear: number;
  fogFar: number;
}

/** Anything you can pick up: tools, consumables and vehicle parts alike. */
export interface ItemSpawn {
  kind: ItemKind;
  pos: Vec3;
  /** For part items: which PartVariant this pickup installs. */
  variantId?: string;
  /** Hidden until an objective completes (e.g. the cave reward). */
  lockedUntil?: string;
}

export type StationKind =
  | 'paint' // cycle the body colour
  | 'lore' // the sealed crate / buried log — opens the fuse-grid puzzle
  | 'clockOut' // finish the mission from a terminal
  | 'chock' // stabilise a rolling vehicle
  | 'refuel'; // top up from a fuel drum

/** A fixed point of interaction that isn't an item or a vehicle socket. */
export interface Station {
  id: string;
  kind: StationKind;
  pos: Vec3;
  label: string;
  /** Objective marked done when this station is used. */
  completes?: string;
  /** Only offered once this objective is complete. */
  requires?: string;
}

export interface ObjectiveDef {
  id: string;
  text: string;
  /** Shown in the HUD as the current goal marker. */
  marker?: Vec3;
  /** Optional objectives don't gate mission completion. */
  optional?: boolean;
}

/** Dispatch VO for a mission, keyed by beat. */
export interface NarrativeScript {
  intro: string;
  outro: string;
  lore: string;
  /** Keyed by objective id. */
  objectives: Record<string, string>;
  /** Situational barks. */
  cold?: string;
  wolf?: string;
  lowIntegrity?: string;
  fail?: string;
}

/** A vehicle system that starts fitted but faulty. */
export interface BrokenSystem {
  socketId: string;
  puzzle: PuzzleKind;
}

export interface LevelDef {
  id: string;
  /** Shown on the loading card and the level select. */
  title: string;
  subtitle: string;
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  /** Key into SKY_PRESETS — drives sun angle, colour, fog and the IBL probe. */
  skyPreset?: string;
  /** When present the ground is a heightfield rather than a flat plane. */
  terrain?: TerrainDef;

  solids: Solid[];
  props: Prop[];
  exterior: Exterior;

  spawn: Vec3;
  spawnYaw: number;

  /** Sockets for this mission's vehicle; omitted = the Garage build chassis. */
  vehicleSockets?: Socket[];
  vehicleStart: Vec3;
  vehicleYaw: number;
  vehicleColor?: number;
  /** The vehicle creeps forward until `chock` is used (the cliff-edge opener). */
  creep?: { speed: number; failAfter: number };

  items: ItemSpawn[];
  stations: Station[];

  /** Garage-only: the bunny-hop speed gate. */
  gate?: Box;
  garageDoor?: { center: Vec3; width: number; height: number };
  /** Garage-only: the drive-the-loop checkpoints. */
  checkpoints?: Vec3[];
  /** Mission-only: drive here to extract. */
  exfil?: { pos: Vec3; radius: number };

  objectives: ObjectiveDef[];
  hazards?: HazardDef;
  /** Fires, cabins, the van — anywhere you can warm up. */
  warmth?: Vec3[];
  /** Wolf spawn points. */
  wolves?: Vec3[];

  puzzleSeed: number;
  narrative: NarrativeScript;
}
