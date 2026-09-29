import * as THREE from 'three';
import type { PropDef } from '../../../content/levels/types';
import type { World } from '../../../sim/world';
import { RANGER, buildBetsy } from '../vehicles/betsy';
import { buildRidgeback } from '../vehicles/ridgeback';
import { buildAtv, buildGenerator, buildLoggingTruck } from '../vehicles/donors';
import { RIDGE_PROPS } from './ridgeProps';
import type { VehicleModel } from '../vehicles/parts';
import { BUILDING } from './building';
import { PROPS as KIT_PROPS } from './props';

// Name → builder tables for vehicle models and level props. Levels only ever
// refer to art by these names, so the sim and tests never import three.js.

export interface PropBuild {
  obj: THREE.Object3D;
  /** Per-frame animation (flicker, spin, sway...). */
  update?: (dt: number, time: number, w: World) => void;
  /** Focus-target ids this prop can be highlighted by (e.g. 'station:clock'). */
  targets?: Map<string, THREE.Object3D>;
}

type PropBuilder = (p: PropDef, w: World) => PropBuild | null;

const PROPS = new Map<string, PropBuilder>();
let registered = false;
function ensure(): void {
  if (registered) return;
  registered = true;
  registerProps(BUILDING as Record<string, PropBuilder>);
  registerProps(KIT_PROPS as Record<string, PropBuilder>);
  registerProps(RIDGE_PROPS as Record<string, PropBuilder>);
}

export function registerProps(table: Record<string, PropBuilder>): void {
  for (const [k, v] of Object.entries(table)) PROPS.set(k, v);
}

export function buildProp(p: PropDef, w: World): PropBuild | null {
  ensure();
  const b = PROPS.get(p.kind);
  if (!b) return null;
  const built = b(p, w);
  if (!built) return null;
  const o = built.obj;
  o.position.set(p.pos.x, p.pos.y, p.pos.z);
  o.rotation.y = p.yaw ?? 0;
  if (p.scale && p.scale !== 1) o.scale.setScalar(p.scale);
  return built;
}

export function buildModel(model: string, paint?: number): { vehicle: VehicleModel | null; art: THREE.Object3D | null } {
  switch (model) {
    case 'betsy':
      return { vehicle: buildBetsy(paint), art: null };
    case 'rangerPickup':
      return { vehicle: buildBetsy(paint, RANGER), art: null };
    case 'ridgeback':
      return { vehicle: buildRidgeback(paint), art: null };
    case 'atv':
      return { vehicle: buildAtv(paint), art: null };
    case 'loggingTruck':
      return { vehicle: null, art: buildLoggingTruck(paint) };
    case 'generator':
      return { vehicle: null, art: buildGenerator() };
    default:
      return { vehicle: null, art: null };
  }
}
