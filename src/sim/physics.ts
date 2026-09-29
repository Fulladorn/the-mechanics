import RAPIER from '@dimforge/rapier3d-compat';
import type { Quat, Vec3 } from '../shared/math';
import { qMul, qYaw } from '../shared/math';
import type { Terrain } from './terrain';

// Thin wrapper over Rapier: the one place the sim talks to the physics engine.
// Everything above this layer deals in plain Vec3/Quat and collider tags, so
// gameplay code (and its tests) never touch Rapier types directly.

export { RAPIER };
export type RWorld = RAPIER.World;
export type RBody = RAPIER.RigidBody;
export type RCollider = RAPIER.Collider;

let ready: Promise<void> | null = null;
/** Rapier's WASM must be instantiated once before any world exists. */
export function initRapier(): Promise<void> {
  return (ready ??= RAPIER.init());
}

/** Collision membership bits. */
export const G = {
  STATIC: 0x0001,
  PLAYER: 0x0002,
  VEHICLE: 0x0004,
  ITEM: 0x0008,
  DOOR: 0x0010,
  ALL: 0xffff,
} as const;

/** Rapier packs (membership << 16) | filter into one u32. */
export const groups = (member: number, filter: number): number => ((member & 0xffff) << 16) | (filter & 0xffff);

export type Surface = 'grass' | 'gravel' | 'dirt' | 'wood' | 'concrete' | 'metal' | 'rock' | 'water' | 'snow';

export interface ColliderTag {
  surface: Surface;
  /** Owning entity, e.g. 'vehicle:ridgeback', 'item:12', 'door:station'. */
  owner?: string;
}

export interface RayHit {
  toi: number;
  point: Vec3;
  normal: Vec3;
  tag?: ColliderTag;
  handle: number;
}

export interface ContactForce {
  owner1?: string;
  owner2?: string;
  force: number;
}

export interface StaticShape {
  shape: 'box' | 'cyl' | 'ball';
  pos: Vec3;
  /** box: half extents; cyl: x = radius, y = half height; ball: x = radius. */
  size: Vec3;
  yaw?: number;
  /** Tilt about the (yawed) X axis — ramps. */
  pitch?: number;
  surface?: Surface;
  owner?: string;
  friction?: number;
}

export class Physics {
  readonly world: RAPIER.World;
  private queue: RAPIER.EventQueue;
  readonly tags = new Map<number, ColliderTag>();
  private terrainCollider?: RAPIER.Collider;
  private terrain?: Terrain;

  constructor(gravity = -15) {
    this.world = new RAPIER.World({ x: 0, y: gravity, z: 0 });
    this.world.timestep = 1 / 60;
    this.queue = new RAPIER.EventQueue(true);
  }

  // --- building the static world -------------------------------------------

  addTerrain(t: Terrain): void {
    this.terrain = t;
    const n = t.n - 1;
    const desc = RAPIER.ColliderDesc.heightfield(n, n, t.heights, { x: t.def.size, y: 1, z: t.def.size })
      .setFriction(0.9)
      .setCollisionGroups(groups(G.STATIC, G.ALL));
    this.terrainCollider = this.world.createCollider(desc);
    this.tags.set(this.terrainCollider.handle, { surface: 'grass', owner: 'terrain' });
  }

  addStatic(s: StaticShape): RAPIER.Collider {
    let desc: RAPIER.ColliderDesc;
    if (s.shape === 'box') desc = RAPIER.ColliderDesc.cuboid(s.size.x, s.size.y, s.size.z);
    else if (s.shape === 'cyl') desc = RAPIER.ColliderDesc.cylinder(s.size.y, s.size.x);
    else desc = RAPIER.ColliderDesc.ball(s.size.x);
    desc
      .setTranslation(s.pos.x, s.pos.y, s.pos.z)
      .setRotation(s.pitch ? qMul(qYaw(s.yaw ?? 0), { x: Math.sin(s.pitch / 2), y: 0, z: 0, w: Math.cos(s.pitch / 2) }) : qYaw(s.yaw ?? 0))
      .setFriction(s.friction ?? 0.8)
      .setCollisionGroups(groups(s.owner?.startsWith('door:') ? G.DOOR | G.STATIC : G.STATIC, G.ALL));
    const c = this.world.createCollider(desc);
    this.tags.set(c.handle, { surface: s.surface ?? 'concrete', owner: s.owner });
    return c;
  }

  removeCollider(c: RAPIER.Collider): void {
    this.tags.delete(c.handle);
    this.world.removeCollider(c, true);
  }

  tagOf(handle: number): ColliderTag | undefined {
    return this.tags.get(handle);
  }

  /** Surface under a point: road/grass from the terrain, or the collider's tag. */
  surfaceAt(handle: number | null, x: number, z: number): Surface {
    if (handle === null) return 'grass';
    if (this.terrainCollider && handle === this.terrainCollider.handle && this.terrain) {
      const t = this.terrain;
      const road = t.roadAt(x, z, 8);
      if (road.road >= 0 && road.dist <= t.roads[road.road].def.halfWidth + 0.6) {
        const s = t.roadSurface(road.road);
        return s === 'asphalt' ? 'concrete' : s === 'track' ? 'dirt' : s;
      }
      if (t.slopeAt(x, z) > 0.45) return 'rock';
      return 'grass';
    }
    return this.tags.get(handle)?.surface ?? 'concrete';
  }

  // --- dynamic bodies -------------------------------------------------------

  createBody(desc: RAPIER.RigidBodyDesc): RAPIER.RigidBody {
    return this.world.createRigidBody(desc);
  }

  attach(desc: RAPIER.ColliderDesc, body: RAPIER.RigidBody, tag: ColliderTag): RAPIER.Collider {
    const c = this.world.createCollider(desc, body);
    this.tags.set(c.handle, tag);
    return c;
  }

  removeBody(b: RAPIER.RigidBody): void {
    for (let i = 0; i < b.numColliders(); i++) this.tags.delete(b.collider(i).handle);
    this.world.removeRigidBody(b);
  }

  // --- queries --------------------------------------------------------------

  /**
   * Cast a ray. `filter` is a membership mask of what it may hit; `exclude`
   * skips a specific collider handle (e.g. the caster's own body).
   */
  castRay(origin: Vec3, dir: Vec3, maxToi: number, filter: number = G.STATIC, excludeBody?: RAPIER.RigidBody): RayHit | null {
    const ray = new RAPIER.Ray(origin, dir);
    const hit = this.world.castRayAndGetNormal(
      ray,
      maxToi,
      true,
      undefined,
      groups(G.ALL, filter),
      undefined,
      excludeBody,
    );
    if (!hit) return null;
    const p = ray.pointAt(hit.timeOfImpact);
    return {
      toi: hit.timeOfImpact,
      point: { x: p.x, y: p.y, z: p.z },
      normal: { x: hit.normal.x, y: hit.normal.y, z: hit.normal.z },
      tag: this.tags.get(hit.collider.handle),
      handle: hit.collider.handle,
    };
  }

  // --- stepping -------------------------------------------------------------

  step(dt: number, contacts?: ContactForce[]): void {
    this.world.timestep = dt;
    this.world.step(this.queue);
    this.queue.drainContactForceEvents((e) => {
      if (!contacts) return;
      contacts.push({
        owner1: this.tags.get(e.collider1())?.owner,
        owner2: this.tags.get(e.collider2())?.owner,
        force: e.totalForceMagnitude(),
      });
    });
    this.queue.drainCollisionEvents(() => {});
  }

  dispose(): void {
    this.queue.free();
    this.world.free();
  }
}

export const toVec = (v: { x: number; y: number; z: number }): Vec3 => ({ x: v.x, y: v.y, z: v.z });
export const toQuat = (q: { x: number; y: number; z: number; w: number }): Quat => ({ x: q.x, y: q.y, z: q.z, w: q.w });
