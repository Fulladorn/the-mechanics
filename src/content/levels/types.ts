import type { Vec3 } from '../../shared/math';
import type { TerrainDef } from '../../sim/terrain';
import type { HazardDef } from '../../sim/hazards';
import type { ItemSpawn } from '../../sim/items';
import type { BoltState, MachineDef } from '../../sim/machine';
import type { StaticShape } from '../../sim/physics';
import type { VehicleDef } from '../../sim/vehicle';
import type { World } from '../../sim/world';

// What a mission is made of. The sim reads the gameplay parts (statics,
// items, machines, stations, beats); the client reads the same file for the
// look (props, scatter, sky). Levels are TypeScript, so a beat can say
// "done when the battery is in" as a function instead of a mini-language.

/** A collider, optionally rendered as a plain block (e.g. a crate). */
export interface StaticDef extends StaticShape {
  /** Render as this material; omit for collision-only (buildings draw themselves). */
  render?: string;
  color?: number;
}

/** Render-only dressing, built by the client kit. */
export interface PropDef {
  kind: string;
  pos: Vec3;
  yaw?: number;
  scale?: number;
  /** Free-form knobs for the builder (colour, length, variant...). */
  p?: Record<string, number | string | boolean>;
}

export interface MachinePlacement {
  key: string;
  def: MachineDef;
  pos: Vec3;
  yaw: number;
  /** Drivable? Then this is its physics. */
  vehicle?: VehicleDef;
  /** Client model to draw ('betsy', 'ridgeback', 'atv', 'loggingTruck', ...). */
  model: string;
  paint?: number;
  /** What's already fitted, and in what state. */
  mounts?: Record<string, ItemSpawn & { bolts?: BoltState }>;
  /** Terminals that start unclipped. */
  terminalsOff?: string[];
  /** Pocketed key needed to drive (tag). */
  needsKey?: string;
  /** Kept fixed while this returns true (chocked, on the lift...). */
  pin?: (w: World) => boolean;
}

export interface StationDef {
  id: string;
  pos: Vec3;
  r: number;
  label: string | ((w: World) => string);
  verb: 'tap' | 'hold';
  time?: number;
  priority?: number;
  /** true = usable, string = shown but disabled (reason), false = hidden. */
  when?: (w: World) => true | string | false;
  run: (w: World) => void;
  /** What to highlight: a prop id. */
  target?: string;
}

export interface DoorDef {
  id: string;
  /** Hinge-side bottom corner. */
  hinge: Vec3;
  /** Door width along its local +X (after yaw). */
  width: number;
  height: number;
  yaw: number;
  /** Pocketed key tag needed to open. */
  locked?: string;
  open?: boolean;
  /** Label for the prompt ("front door", "shed"...). */
  label?: string;
  /** Big doors (roll-up) open by script only. */
  scripted?: boolean;
}

export interface BeatDef {
  id: string;
  /** Objective card text. */
  text: string | ((w: World) => string);
  /** Smaller line under it. */
  detail?: string | ((w: World) => string | null);
  /** Waypoint; null hides it. */
  marker?: (w: World) => Vec3 | null;
  start?: (w: World) => void;
  done: (w: World) => boolean;
  finish?: (w: World) => void;
  /** Dispatch nudges after N seconds on this beat. */
  hints?: [number, string][];
  checkpoint?: boolean;
  /** Time of day to ease toward during this beat (hours). */
  hour?: number;
}

export interface SideDef {
  id: string;
  text: string;
  done: (w: World) => boolean;
  /** Only listed once discovered. */
  visible?: (w: World) => boolean;
}

export interface TriggerDef {
  id: string;
  pos: Vec3;
  r: number;
  /** Extra condition. */
  when?: (w: World) => boolean;
  run: (w: World) => void;
  /** Also fires while driving. */
  vehicle?: boolean;
}

export interface LoreDef {
  id: string;
  title: string;
  body: string;
}

export interface WolfSpawn {
  pos: Vec3;
  /** Only wakes once this flag is set. */
  after?: string;
}

export interface LevelDef {
  id: string;
  title: string;
  subtitle: string;
  env: 'depot' | 'mountain';
  terrain: TerrainDef;
  /** Starting time of day in hours (e.g. 9.5 = 09:30). */
  hour: number;
  statics: StaticDef[];
  props: PropDef[];
  items: ItemSpawn[];
  machines: MachinePlacement[];
  stations: StationDef[];
  doors?: DoorDef[];
  wolves?: WolfSpawn[];
  spawn: { pos: Vec3; yaw: number };
  beats: BeatDef[];
  side?: SideDef[];
  triggers?: TriggerDef[];
  hazards?: HazardDef;
  /** Heat sources for the cold meter. */
  warmth?: Vec3[];
  /** A vehicle below this height is gone (over the cliff). */
  lostY?: number;
  lore?: LoreDef[];
  /** Par time in seconds, for grading. */
  par: number;
  /** No fail states (the tutorial). */
  safe?: boolean;
  /** Intro/outro cinematic ids the client knows how to play. */
  intro?: string;
  outro?: string;
  /** First line from Dispatch. */
  briefing: string;
}
