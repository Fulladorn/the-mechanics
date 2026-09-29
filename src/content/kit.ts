import type { Vec3 } from '../shared/math';
import type { PropDef, StaticDef } from './levels/types';
import type { Surface } from '../sim/physics';

// Level-building kit. Each helper emits the colliders the sim needs AND the
// prop entry the renderer draws, from the same numbers — so a wall's hole is
// always where the doorway is, and a shelf you bump into is the shelf you see.

export interface Opening {
  /** Distance along the wall where the opening starts / ends. */
  s: number;
  e: number;
  /** Bottom / top of the opening above the wall base. */
  y0: number;
  y1: number;
  /** Solid for collision anyway (glazed windows). */
  glazed?: boolean;
}

export class Kit {
  readonly statics: StaticDef[] = [];
  readonly props: PropDef[] = [];

  prop(kind: string, pos: Vec3, yaw = 0, p?: PropDef['p'], scale?: number): this {
    this.props.push({ kind, pos, yaw, p, scale });
    return this;
  }

  box(pos: Vec3, half: Vec3, yaw = 0, surface: Surface = 'concrete', render?: string, color?: number, owner?: string): this {
    this.statics.push({ shape: 'box', pos, size: half, yaw, surface, render, color, owner });
    return this;
  }

  /** A box resting on y0 with full size w×h×d, rotated by yaw. */
  block(x: number, y0: number, z: number, w: number, h: number, d: number, yaw = 0, surface: Surface = 'wood', owner?: string): this {
    return this.box({ x, y: y0 + h / 2, z }, { x: w / 2, y: h / 2, z: d / 2 }, yaw, surface, undefined, undefined, owner);
  }

  /**
   * A straight wall from a to b (xz), `h` tall from y0, with openings. The
   * renderer gets one 'wall' prop; the sim gets solid boxes around the holes.
   */
  wall(a: { x: number; z: number }, b: { x: number; z: number }, y0: number, h: number, t: number, openings: Opening[], style: string, color: number): this {
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const dx = (b.x - a.x) / len;
    const dz = (b.z - a.z) / len;
    const yaw = Math.atan2(-dz, dx); // local +X along the wall
    const at = (d: number) => ({ x: a.x + dx * d, z: a.z + dz * d });
    const ops = [...openings].sort((p, q) => p.s - q.s);
    const solid = (s: number, e: number, yb: number, yt: number) => {
      if (e - s < 0.01 || yt - yb < 0.01) return;
      const c = at((s + e) / 2);
      this.box({ x: c.x, y: y0 + (yb + yt) / 2, z: c.z }, { x: (e - s) / 2, y: (yt - yb) / 2, z: t / 2 }, yaw, 'concrete');
    };
    let cur = 0;
    for (const o of ops) {
      solid(cur, o.s, 0, h);
      if (o.glazed) solid(o.s, o.e, 0, h);
      else {
        solid(o.s, o.e, 0, o.y0);
        solid(o.s, o.e, o.y1, h);
      }
      cur = o.e;
    }
    solid(cur, len, 0, h);
    this.props.push({
      kind: 'wall',
      pos: { x: a.x, y: y0, z: a.z },
      yaw,
      p: { len, h, t, style, color, ops: JSON.stringify(ops) },
    });
    return this;
  }

  /** Axis-aligned rectangle of walls (x0..x1, z0..z1) with openings per side. */
  room(
    x0: number,
    z0: number,
    x1: number,
    z1: number,
    y0: number,
    h: number,
    t: number,
    ops: { n?: Opening[]; s?: Opening[]; e?: Opening[]; w?: Opening[] },
    style: string,
    color: number,
    skip: { n?: boolean; s?: boolean; e?: boolean; w?: boolean } = {},
  ): this {
    if (!skip.n) this.wall({ x: x0, z: z0 }, { x: x1, z: z0 }, y0, h, t, ops.n ?? [], style, color);
    if (!skip.s) this.wall({ x: x0, z: z1 }, { x: x1, z: z1 }, y0, h, t, ops.s ?? [], style, color);
    if (!skip.w) this.wall({ x: x0, z: z0 }, { x: x0, z: z1 }, y0, h, t, ops.w ?? [], style, color);
    if (!skip.e) this.wall({ x: x1, z: z0 }, { x: x1, z: z1 }, y0, h, t, ops.e ?? [], style, color);
    return this;
  }

  merge(other: { statics: StaticDef[]; props: PropDef[] }): this {
    this.statics.push(...other.statics);
    this.props.push(...other.props);
    return this;
  }
}

/** Footprints (w, h, d) of furniture props, used for their colliders. */
export const FOOT: Record<string, [number, number, number]> = {
  lockers: [2.4, 2.0, 0.55],
  workbench: [2.6, 0.95, 0.8],
  tireRack: [2.2, 1.9, 0.7],
  shelf: [2.2, 2.0, 0.6],
  scrapBin: [1.6, 1.0, 1.1],
  compressor: [0.9, 1.1, 0.6],
  drum: [0.62, 0.9, 0.62],
  pallet: [1.2, 0.15, 1.0],
  crate: [1.0, 1.0, 1.0],
  toolChest: [1.0, 1.1, 0.55],
  bench: [1.8, 0.45, 0.4],
  coffee: [0.6, 1.0, 0.5],
  container: [6.0, 2.6, 2.4],
  van: [2.0, 2.3, 4.8],
  liftPost: [0.35, 3.2, 0.35],
  waterTower: [3, 12, 3],
  jerryRack: [1.2, 1.2, 0.5],
  partsWasher: [1.2, 1.0, 0.7],
};

/** Place a furniture prop with a matching box collider. */
export function furnish(k: Kit, kind: string, x: number, y: number, z: number, yaw = 0, p?: PropDef['p'], solid = true): Kit {
  const f = FOOT[kind];
  if (f && solid) k.block(x, y, z, f[0], f[1], f[2], yaw, kind === 'drum' || kind === 'container' ? 'metal' : 'wood');
  return k.prop(kind, { x, y, z }, yaw, p);
}
