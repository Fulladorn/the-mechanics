import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

// Geometry toolkit for the code-built art. Everything soft-edged: a bevel
// catches light, and that's what makes a stylized prop look deliberate rather
// than unfinished. Geometries are cached by parameters and shared.

const cache = new Map<string, THREE.BufferGeometry>();
function cached<T extends THREE.BufferGeometry>(key: string, make: () => T): T {
  let g = cache.get(key) as T | undefined;
  if (!g) {
    g = make();
    g.userData.shared = true;
    cache.set(key, g);
  }
  return g;
}
const f = (n: number) => n.toFixed(3);

export function rbox(w: number, h: number, d: number, r = Math.min(w, h, d) * 0.18, seg = 3): THREE.BufferGeometry {
  r = Math.min(r, Math.min(w, h, d) * 0.49);
  if (r < 0.004) return cached(`b${f(w)}${f(h)}${f(d)}`, () => new THREE.BoxGeometry(w, h, d));
  return cached(`rb${f(w)}${f(h)}${f(d)}${f(r)}${seg}`, () => new RoundedBoxGeometry(w, h, d, seg, r));
}

export function cyl(rt: number, rb: number, h: number, seg = 18, open = false): THREE.BufferGeometry {
  return cached(`c${f(rt)}${f(rb)}${f(h)}${seg}${open}`, () => new THREE.CylinderGeometry(rt, rb, h, seg, 1, open));
}

export function sph(r: number, w = 16, h = 12): THREE.BufferGeometry {
  return cached(`s${f(r)}${w}${h}`, () => new THREE.SphereGeometry(r, w, h));
}

export function torus(r: number, tube: number, rs = 10, ts = 28, arc = Math.PI * 2): THREE.BufferGeometry {
  return cached(`t${f(r)}${f(tube)}${rs}${ts}${f(arc)}`, () => new THREE.TorusGeometry(r, tube, rs, ts, arc));
}

export function cone(r: number, h: number, seg = 16): THREE.BufferGeometry {
  return cached(`co${f(r)}${f(h)}${seg}`, () => new THREE.ConeGeometry(r, h, seg));
}

export function capsule(r: number, len: number, cap = 5, radial = 12): THREE.BufferGeometry {
  return cached(`ca${f(r)}${f(len)}${cap}${radial}`, () => new THREE.CapsuleGeometry(r, len, cap, radial));
}

export function plane(w: number, h: number): THREE.BufferGeometry {
  return cached(`p${f(w)}${f(h)}`, () => new THREE.PlaneGeometry(w, h));
}

/** Revolve a (radius, y) profile around Y. Smooth normals. */
export function lathe(key: string, prof: [number, number][], seg = 24): THREE.BufferGeometry {
  return cached(`l${key}${seg}`, () => {
    const g = new THREE.LatheGeometry(
      prof.map(([x, y]) => new THREE.Vector2(x, y)),
      seg,
    );
    g.computeVertexNormals();
    return g;
  });
}

/** A tube along points (smooth Catmull-Rom). */
export function tube(key: string, pts: [number, number, number][], r: number, seg = 24, radial = 8): THREE.BufferGeometry {
  return cached(`tu${key}${f(r)}${seg}${radial}`, () => {
    const curve = new THREE.CatmullRomCurve3(pts.map(([x, y, z]) => new THREE.Vector3(x, y, z)));
    return new THREE.TubeGeometry(curve, seg, r, radial, false);
  });
}

/**
 * Extrude a 2D outline (x = along, y = up) by `depth` across X, centred.
 * Result: outline x → local Z, outline y → local Y, depth → local X.
 */
export function profile(key: string, outline: THREE.Shape | [number, number][], depth: number, bevel = 0.04, bevelSeg = 3): THREE.BufferGeometry {
  return cached(`pr${key}${f(depth)}${f(bevel)}${bevelSeg}`, () => {
    let shape: THREE.Shape;
    if (outline instanceof THREE.Shape) shape = outline;
    else {
      shape = new THREE.Shape();
      shape.moveTo(outline[0][0], outline[0][1]);
      for (let i = 1; i < outline.length; i++) shape.lineTo(outline[i][0], outline[i][1]);
      shape.closePath();
    }
    const d = Math.max(0.001, depth - bevel * 2);
    const g = new THREE.ExtrudeGeometry(shape, {
      depth: d,
      bevelEnabled: bevel > 0,
      bevelThickness: bevel,
      bevelSize: bevel,
      bevelSegments: bevelSeg,
      curveSegments: 18,
    });
    // (X, Y, Z) → (d/2 - Z, Y, X)
    g.rotateY(-Math.PI / 2);
    g.translate(d / 2, 0, 0);
    g.computeVertexNormals();
    return g;
  });
}

/**
 * Tyre with a chunky block tread, axle along Y, centred. Outer sidewall at +Y.
 * `flat` squashes one side and roughs up the tread (a shredded tyre).
 */
export function tyre(radius: number, width: number, lugs = 18, depth = 0.022, flat = false): THREE.BufferGeometry {
  return cached(`ty${f(radius)}${f(width)}${lugs}${f(depth)}${flat}`, () => {
    const A = lugs * 4; // around
    const W = 12; // across
    const inner = radius * 0.62;
    const hw = width / 2;
    const pos: number[] = [];
    const idx: number[] = [];
    // profile across the width: sidewall → shoulder → tread → shoulder → sidewall
    const prof: { r: number; y: number; tread: boolean }[] = [];
    for (let j = 0; j <= W; j++) {
      const u = j / W; // 0..1 across
      const y = -hw + u * width;
      const e = Math.abs(u - 0.5) * 2; // 0 centre .. 1 edge
      let r: number;
      if (e > 0.82) {
        // sidewall bulge
        const k = (e - 0.82) / 0.18;
        r = radius - radius * 0.06 * k * k - (radius - inner) * Math.pow(k, 3) * 0.95;
      } else r = radius - Math.pow(e / 0.82, 4) * radius * 0.05;
      prof.push({ r, y, tread: e < 0.8 });
    }
    for (let i = 0; i <= A; i++) {
      const a = (i / A) * Math.PI * 2;
      const lug = Math.floor((i / A) * lugs * 2);
      for (let j = 0; j <= W; j++) {
        const p = prof[j];
        let r = p.r;
        if (p.tread) {
          // staggered blocks either side of a centre groove
          const side = j < W / 2 ? 0 : 1;
          const on = (lug + side) % 2 === 0;
          const groove = Math.abs(j - W / 2) < 0.6;
          r += on && !groove ? depth : 0;
          if (flat) r -= depth * 0.6 * (0.5 + 0.5 * Math.sin(a * 7 + j));
        }
        pos.push(Math.cos(a) * r, p.y, Math.sin(a) * r);
      }
    }
    for (let i = 0; i < A; i++) {
      for (let j = 0; j < W; j++) {
        const a0 = i * (W + 1) + j;
        const b0 = (i + 1) * (W + 1) + j;
        idx.push(a0, a0 + 1, b0, b0, a0 + 1, b0 + 1);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  });
}

/** Mesh helper: geometry + material, shadows on. */
export function mesh(g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const o = new THREE.Mesh(g, m);
  o.position.set(x, y, z);
  o.castShadow = true;
  o.receiveShadow = true;
  return o;
}

/** A canvas texture with text (door decals, signs, labels). */
export function textTexture(lines: { text: string; size: number; color: string; font?: string; y: number }[], w = 512, h = 256, bg?: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  if (bg) {
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
  }
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (const l of lines) {
    g.fillStyle = l.color;
    g.font = `${l.font ?? '800'} ${l.size}px "Barlow Condensed", "Arial Narrow", sans-serif`;
    g.fillText(l.text, w / 2, l.y);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
