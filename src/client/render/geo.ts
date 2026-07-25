import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

// Shared geometry factory. Two jobs:
//   1. Bevelled/rounded primitives — a chamfered edge catches a specular
//      highlight, which is what separates "stylized on purpose" from "untextured
//      box". Every prop should use these instead of raw BoxGeometry.
//   2. Caching — props repeat constantly, and an identical geometry should be
//      uploaded to the GPU exactly once.

const cache = new Map<string, THREE.BufferGeometry>();

function cached<T extends THREE.BufferGeometry>(key: string, make: () => T): T {
  const hit = cache.get(key);
  if (hit) return hit as T;
  const g = make();
  cache.set(key, g);
  return g;
}

/** Radius that keeps a bevel proportional but never self-intersecting. */
const bevelFor = (w: number, h: number, d: number, ratio = 0.08, max = 0.06): number =>
  Math.min(max, Math.min(w, h, d) * ratio);

/**
 * Bevelled box — the workhorse. `r` defaults to a small proportional chamfer;
 * pass a larger radius for pillowy/cartoony forms.
 */
export function roundedBox(w: number, h: number, d: number, r?: number, seg = 2): THREE.BufferGeometry {
  const rad = r ?? bevelFor(w, h, d);
  // Below ~1cm the bevel is invisible but still costs 6x the verts.
  if (rad < 0.006) return box(w, h, d);
  const k = `rb:${w.toFixed(3)},${h.toFixed(3)},${d.toFixed(3)},${rad.toFixed(3)},${seg}`;
  return cached(k, () => new RoundedBoxGeometry(w, h, d, seg, rad));
}

/** Hard-edged box. Use only where a crisp edge is wanted (decals, thin plates). */
export function box(w: number, h: number, d: number): THREE.BufferGeometry {
  return cached(`b:${w.toFixed(3)},${h.toFixed(3)},${d.toFixed(3)}`, () => new THREE.BoxGeometry(w, h, d));
}

export function cyl(rt: number, rb: number, h: number, seg = 16, open = false): THREE.BufferGeometry {
  return cached(`c:${rt.toFixed(3)},${rb.toFixed(3)},${h.toFixed(3)},${seg},${open ? 1 : 0}`, () =>
    new THREE.CylinderGeometry(rt, rb, h, seg, 1, open),
  );
}

/**
 * Open-ended partial cylinder — a half-pipe. The natural shape for a mudguard,
 * a fender arch, a pipe cover or a curved awning.
 */
export function shell(
  r: number,
  h: number,
  thetaStart: number,
  thetaLength: number,
  seg = 16,
): THREE.BufferGeometry {
  const k = `sh:${r.toFixed(3)},${h.toFixed(3)},${thetaStart.toFixed(3)},${thetaLength.toFixed(3)},${seg}`;
  return cached(k, () => new THREE.CylinderGeometry(r, r, h, seg, 1, true, thetaStart, thetaLength));
}

export function sphere(r: number, wSeg = 16, hSeg = 12): THREE.BufferGeometry {
  return cached(`s:${r.toFixed(3)},${wSeg},${hSeg}`, () => new THREE.SphereGeometry(r, wSeg, hSeg));
}

export function cone(r: number, h: number, seg = 16): THREE.BufferGeometry {
  return cached(`co:${r.toFixed(3)},${h.toFixed(3)},${seg}`, () => new THREE.ConeGeometry(r, h, seg));
}

export function torus(r: number, tube: number, rSeg = 12, tSeg = 28): THREE.BufferGeometry {
  return cached(`t:${r.toFixed(3)},${tube.toFixed(3)},${rSeg},${tSeg}`, () =>
    new THREE.TorusGeometry(r, tube, rSeg, tSeg),
  );
}

export function plane(w: number, h: number, wSeg = 1, hSeg = 1): THREE.BufferGeometry {
  return cached(`p:${w.toFixed(3)},${h.toFixed(3)},${wSeg},${hSeg}`, () =>
    new THREE.PlaneGeometry(w, h, wSeg, hSeg),
  );
}

export function circle(r: number, seg = 24): THREE.BufferGeometry {
  return cached(`ci:${r.toFixed(3)},${seg}`, () => new THREE.CircleGeometry(r, seg));
}

/** Capsule — good for organic/chunky forms (limbs, handles, fuel tanks). */
export function capsule(r: number, len: number, cap = 6, radial = 12): THREE.BufferGeometry {
  return cached(`cap:${r.toFixed(3)},${len.toFixed(3)},${cap},${radial}`, () =>
    new THREE.CapsuleGeometry(r, len, cap, radial),
  );
}

/**
 * Extrude a 2D outline with a rounded bevel — used for car body panels, signs,
 * and any silhouette that shouldn't read as a cuboid.
 */
export function extrude(
  key: string,
  pts: [number, number][],
  depth: number,
  bevel = 0.03,
): THREE.BufferGeometry {
  return cached(`e:${key},${depth.toFixed(3)},${bevel.toFixed(3)}`, () => {
    const shape = new THREE.Shape();
    shape.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) shape.lineTo(pts[i][0], pts[i][1]);
    shape.closePath();
    const g = new THREE.ExtrudeGeometry(shape, {
      depth,
      bevelEnabled: bevel > 0,
      bevelThickness: bevel,
      bevelSize: bevel,
      bevelSegments: 2,
      curveSegments: 8,
    });
    g.center();
    return g;
  });
}

/** Lathe a profile around Y — bottles, cans, tyres, lamp shades. */
export function lathe(key: string, profile: [number, number][], seg = 20): THREE.BufferGeometry {
  return cached(`l:${key},${seg}`, () =>
    new THREE.LatheGeometry(
      profile.map(([x, y]) => new THREE.Vector2(x, y)),
      seg,
    ),
  );
}

/**
 * A tyre: torus-ish carcass with a flat tread band, built as a lathe so the
 * shoulder radius reads correctly from any angle.
 */
export function tyre(radius: number, width: number, shoulder = 0.35): THREE.BufferGeometry {
  const k = `ty:${radius.toFixed(3)},${width.toFixed(3)},${shoulder.toFixed(2)}`;
  return cached(k, () => {
    const hw = width / 2;
    const inner = radius * 0.55;
    const sh = radius * shoulder * 0.25;
    const prof: [number, number][] = [
      [inner, -hw],
      [radius - sh, -hw],
      [radius, -hw + sh],
      [radius, hw - sh],
      [radius - sh, hw],
      [inner, hw],
    ];
    const g = new THREE.LatheGeometry(
      prof.map(([x, y]) => new THREE.Vector2(x, y)),
      24,
    );
    g.rotateX(Math.PI / 2); // lathe spins around Y; a wheel spins around Z
    g.rotateZ(Math.PI / 2);
    g.computeVertexNormals();
    return g;
  });
}

/** Dispose every cached geometry (level teardown). */
export function disposeGeoCache(): void {
  for (const g of cache.values()) g.dispose();
  cache.clear();
}

export const geoCacheSize = (): number => cache.size;
