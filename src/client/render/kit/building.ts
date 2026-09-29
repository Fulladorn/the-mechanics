import * as THREE from 'three';
import type { PropDef } from '../../../content/levels/types';
import type { Opening } from '../../../content/kit';
import { MAT, styl } from '../stylized';
import { cyl, mesh, rbox, textTexture } from '../shapes';
import type { PropBuild } from './registry';

// Architecture: walls (with real holes for doors and windows so sunlight
// comes through), gable roofs with skylights, trusses, slabs, signage.

const num = (p: PropDef, k: string, d = 0) => (typeof p.p?.[k] === 'number' ? (p.p[k] as number) : d);
const str = (p: PropDef, k: string, d = '') => (typeof p.p?.[k] === 'string' ? (p.p[k] as string) : d);

function wall(p: PropDef): PropBuild {
  const g = new THREE.Group();
  const len = num(p, 'len');
  const h = num(p, 'h');
  const t = num(p, 't', 0.3);
  const color = num(p, 'color', 0xd9cbb0);
  const style = str(p, 'style', 'plaster');
  const ops = JSON.parse(str(p, 'ops', '[]')) as Opening[];
  const body = styl({ color, rough: 0.9, noise: 0.1, noiseScale: 1.2 });
  const base = styl({ color: new THREE.Color(color).multiplyScalar(0.62).getHex(), rough: 0.85, noise: 0.12 });
  const trim = styl({ color: 0x3d5a73, rough: 0.6 });
  const frame = styl({ color: 0x2f3440, rough: 0.55, metal: 0.3 });
  const siding = style === 'siding';
  const logMat = MAT.wood(color);

  const panel = (s: number, e: number, y0: number, y1: number) => {
    if (e - s < 0.01 || y1 - y0 < 0.01) return;
    const w = e - s;
    const hh = y1 - y0;
    const m = mesh(rbox(w, hh, t, 0.02), body, s + w / 2, y0 + hh / 2, 0);
    g.add(m);
    if (siding) {
      // horizontal lap boards, a slightly darker wainscot band and a cap
      for (let y = Math.ceil(y0 / 0.45) * 0.45; y < y1 - 0.1; y += 0.45) {
        if (y < 0.05) continue;
        for (const sd of [-1, 1]) {
          const b = mesh(rbox(w, 0.035, 0.02, 0.008), base, s + w / 2, y, sd * (t / 2 + 0.008));
          b.castShadow = false;
          g.add(b);
        }
      }
    }
    if (style === 'logs') {
      // stacked round logs, both faces, with a darker chink line between
      for (let y = y0 + 0.14; y < y1 - 0.05; y += 0.28) {
        for (const sd of [-1, 1]) {
          const lg = mesh(cyl(0.15, 0.15, w, 10), logMat, s + w / 2, y, sd * (t / 2 - 0.04));
          lg.rotation.z = Math.PI / 2;
          lg.scale.set(1, 1, 0.55);
          g.add(lg);
        }
      }
      return;
    }
    if (style === 'boards') {
      for (let x = s + 0.18; x < e - 0.05; x += 0.36) {
        for (const sd of [-1, 1]) {
          const b = mesh(rbox(0.07, hh, 0.025, 0.008), base, x, y0 + hh / 2, sd * (t / 2 + 0.012));
          b.castShadow = false;
          g.add(b);
        }
      }
    }
    if (y0 < 0.01) {
      for (const sd of [-1, 1]) {
        const band = mesh(rbox(w, Math.min(0.9, hh), 0.03, 0.01), base, s + w / 2, Math.min(0.9, hh) / 2, sd * (t / 2 + 0.012));
        band.castShadow = false;
        g.add(band);
      }
    }
  };

  let cur = 0;
  const sorted = [...ops].sort((a, b) => a.s - b.s);
  for (const o of sorted) {
    panel(cur, o.s, 0, h);
    panel(o.s, o.e, 0, o.y0);
    panel(o.s, o.e, o.y1, h);
    const w = o.e - o.s;
    const cx = o.s + w / 2;
    if (o.glazed) {
      // window: frame, mullion, glass (no shadow, so the sun gets in)
      const glass = mesh(rbox(w, o.y1 - o.y0, 0.03, 0.005), MAT.glass(0xb8d6ec, 0.28), cx, (o.y0 + o.y1) / 2, 0);
      glass.castShadow = false;
      g.add(glass);
      for (const [fx, fy, fw, fh] of [
        [cx, o.y0, w + 0.1, 0.1],
        [cx, o.y1, w + 0.1, 0.1],
        [o.s, (o.y0 + o.y1) / 2, 0.1, o.y1 - o.y0],
        [o.e, (o.y0 + o.y1) / 2, 0.1, o.y1 - o.y0],
        [cx, (o.y0 + o.y1) / 2, 0.06, o.y1 - o.y0],
      ])
        g.add(mesh(rbox(fw, fh, t + 0.06, 0.02), frame, fx, fy, 0));
    } else {
      // door frame
      for (const x of [o.s, o.e]) g.add(mesh(rbox(0.12, o.y1, t + 0.08, 0.02), trim, x, o.y1 / 2, 0));
      g.add(mesh(rbox(w + 0.24, 0.14, t + 0.08, 0.02), trim, cx, o.y1 + 0.07, 0));
    }
    cur = o.e;
  }
  panel(cur, len, 0, h);
  // cap
  g.add(mesh(rbox(len, 0.1, t + 0.06, 0.02), trim, len / 2, h, 0));
  return { obj: g };
}

function roof(p: PropDef): PropBuild {
  const g = new THREE.Group();
  const w = num(p, 'w');
  const d = num(p, 'd');
  const rise = num(p, 'rise', 2.4);
  const color = num(p, 'color', 0x8e3b2f);
  const n = num(p, 'skylights', 0);
  const half = w / 2;
  const slope = Math.hypot(half, rise);
  const ang = Math.atan2(rise, half);
  const deck = styl({ color, rough: 0.7, metal: 0.2, noise: 0.1 });
  const under = styl({ color: 0x6f6a62, rough: 0.9 });
  const glass = MAT.glass(0xd8ecff, 0.35);
  // strips along z; skylight slots cut into each side
  const slots: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const zc = -d / 2 + ((i + 0.5) / n) * d;
    slots.push([zc - 1.1, zc + 1.1]);
  }
  for (const sx of [-1, 1]) {
    const side = new THREE.Group();
    side.position.set((sx * half) / 2, rise / 2, 0);
    side.rotation.z = -sx * ang;
    let z0 = -d / 2 - 0.5;
    const pieces: [number, number, boolean][] = [];
    for (const [a, b] of slots) {
      pieces.push([z0, a, false]);
      pieces.push([a, b, true]);
      z0 = b;
    }
    pieces.push([z0, d / 2 + 0.5, false]);
    for (const [a, b, sky] of pieces) {
      const len = b - a;
      if (len <= 0.01) continue;
      if (sky) {
        // leave a real hole: glass that doesn't cast a shadow + frame
        const sw = slope * 0.45;
        const gl = mesh(rbox(sw, 0.04, len, 0.01), glass, 0, 0.02, (a + b) / 2);
        gl.castShadow = false;
        side.add(gl);
        for (const off of [-1, 1]) {
          const solid = mesh(rbox((slope - sw) / 2 + 0.1, 0.18, len, 0.02), deck, off * ((sw + (slope - sw) / 2) / 2 + 0.02), 0, (a + b) / 2);
          side.add(solid);
        }
      } else {
        side.add(mesh(rbox(slope + 0.6, 0.18, len, 0.03), deck, 0, 0, (a + b) / 2));
        const u = mesh(rbox(slope + 0.4, 0.02, len, 0.01), under, 0, -0.1, (a + b) / 2);
        u.castShadow = false;
        side.add(u);
      }
    }
    // standing seams
    for (let z = -d / 2; z <= d / 2; z += 0.9) {
      const seam = mesh(rbox(slope + 0.6, 0.05, 0.04, 0.015), deck, 0, 0.1, z);
      seam.castShadow = false;
      side.add(seam);
    }
    g.add(side);
  }
  const ridge = mesh(rbox(0.5, 0.2, d + 1, 0.06), styl({ color: new THREE.Color(color).multiplyScalar(0.8).getHex(), rough: 0.6, metal: 0.3 }), 0, rise + 0.05, 0);
  g.add(ridge);
  // gable ends
  const shape = new THREE.Shape();
  shape.moveTo(-half, 0);
  shape.lineTo(half, 0);
  shape.lineTo(0, rise);
  shape.closePath();
  const gab = new THREE.ExtrudeGeometry(shape, { depth: 0.3, bevelEnabled: false });
  const gm = styl({ color: 0xd9cbb0, rough: 0.9, noise: 0.1 });
  for (const sz of [-1, 1]) {
    const m = mesh(gab, gm, 0, 0, sz * (d / 2) - 0.15);
    g.add(m);
  }
  return { obj: g };
}

function trusses(p: PropDef): PropBuild {
  const g = new THREE.Group();
  const w = num(p, 'w');
  const d = num(p, 'd');
  const rise = num(p, 'rise', 2.4);
  const n = num(p, 'n', 4);
  const steel = styl({ color: 0x5b6472, rough: 0.55, metal: 0.6 });
  const half = w / 2;
  const slope = Math.hypot(half, rise);
  const ang = Math.atan2(rise, half);
  for (let i = 0; i < n; i++) {
    const z = -d / 2 + ((i + 1) / (n + 1)) * d;
    g.add(mesh(rbox(w, 0.16, 0.14, 0.02), steel, 0, -0.2, z));
    for (const sx of [-1, 1]) {
      const r = mesh(rbox(slope, 0.18, 0.14, 0.02), steel, (sx * half) / 2, rise / 2 - 0.25, z);
      r.rotation.z = -sx * ang;
      g.add(r);
    }
    for (let k = -3; k <= 3; k++) {
      const x = (k / 4) * half;
      const top = rise * (1 - Math.abs(x) / half) - 0.25;
      if (top < 0.1) continue;
      const web = mesh(rbox(0.06, top + 0.2, 0.06, 0.01), steel, x, top / 2 - 0.2, z);
      web.rotation.z = k % 2 === 0 ? 0 : 0.35 * Math.sign(k);
      g.add(web);
    }
  }
  return { obj: g };
}

function slab(p: PropDef): PropBuild {
  const w = num(p, 'w');
  const d = num(p, 'd');
  const th = num(p, 'thick', 0.03);
  const kind = str(p, 'mat', 'shopFloor');
  const mat =
    kind === 'ceiling'
      ? styl({ color: 0xe8e2d4, rough: 0.95, noise: 0.05 })
      : kind === 'planks'
        ? MAT.wood(0x9a7248)
        : kind === 'dirtFloor'
          ? styl({ color: 0x7d6a55, rough: 1, noise: 0.3, noiseScale: 0.8 })
          : styl({ color: 0xa6a298, rough: 0.9, noise: 0.22, noiseScale: 1.4, rim: 0.05 });
  const m = mesh(rbox(w, th, d, 0.005), mat, 0, 0, 0);
  m.castShadow = kind === 'ceiling';
  const g = new THREE.Group();
  g.add(m);
  if (kind === 'planks') {
    const seam = styl({ color: 0x5a4028, rough: 0.9 });
    for (let x = -w / 2 + 0.2; x < w / 2; x += 0.2) {
      const j = mesh(rbox(0.012, 0.004, d, 0.001), seam, x, th / 2 + 0.002, 0);
      j.castShadow = false;
      g.add(j);
    }
  }
  if (kind === 'shopFloor') {
    // expansion joints
    const joint = styl({ color: 0x7a766e, rough: 0.9 });
    for (let x = -w / 2 + 4; x < w / 2; x += 4) {
      const j = mesh(rbox(0.03, 0.005, d, 0.001), joint, x, th / 2 + 0.002, 0);
      j.castShadow = false;
      g.add(j);
    }
    for (let z = -d / 2 + 4; z < d / 2; z += 4) {
      const j = mesh(rbox(w, 0.005, 0.03, 0.001), joint, 0, th / 2 + 0.002, z);
      j.castShadow = false;
      g.add(j);
    }
  }
  return { obj: g };
}

function bayLines(p: PropDef): PropBuild {
  const g = new THREE.Group();
  const w = num(p, 'w', 3.6);
  const d = num(p, 'd', 6);
  const paint = styl({ color: 0xf2c230, rough: 0.8, noise: 0.2, noiseScale: 0.3, polygonOffset: 1 });
  for (const sx of [-1, 1]) {
    const l = mesh(rbox(0.12, 0.006, d, 0.001), paint, (sx * w) / 2, 0, 0);
    l.castShadow = false;
    g.add(l);
  }
  const f = mesh(rbox(w, 0.006, 0.12, 0.001), paint, 0, 0, -d / 2);
  f.castShadow = false;
  g.add(f);
  return { obj: g };
}

export function signBoard(text: string, w: number, h: number, bg = '#1d2a3a', fg = '#f3e9cf', accent = '#ff7a2f', sub?: string): THREE.Group {
  const g = new THREE.Group();
  const lines = sub
    ? [
        { text, size: 150, color: fg, y: 130 },
        { text: sub, size: 70, color: accent, y: 250 },
      ]
    : [{ text, size: 150, color: fg, y: 170 }];
  const tex = textTexture(lines, 1024, Math.round((1024 * h) / w), bg);
  const face = mesh(new THREE.PlaneGeometry(w, h), styl({ map: tex, rough: 0.6, noise: 0.05, emissive: 0x111111, emissiveIntensity: 0.3 }));
  face.position.z = 0.051;
  g.add(face);
  g.add(mesh(rbox(w + 0.12, h + 0.12, 0.1, 0.03), styl({ color: 0x2b2f38, rough: 0.6 })));
  const stripe = mesh(rbox(w, 0.06, 0.02, 0.01), styl({ color: 0xff7a2f, rough: 0.5 }), 0, -h / 2 + 0.03, 0.06);
  g.add(stripe);
  return g;
}

function sign(p: PropDef): PropBuild {
  const w = num(p, 'w', 4);
  const h = num(p, 'h', 1);
  const wood = str(p, 'style', '') === 'wood';
  const board = wood ? woodSign(str(p, 'text', 'SIGN'), w, h) : signBoard(str(p, 'text', 'SIGN'), w, h);
  if (!p.p?.post) return { obj: board };
  // on two posts, board top at the prop's y
  const g = new THREE.Group();
  board.position.y = -h / 2;
  g.add(board);
  const postMat = wood ? MAT.wood(0x6b4a2e) : styl({ color: 0x2b2f38, rough: 0.6, metal: 0.3 });
  for (const sx of [-1, 1]) g.add(mesh(rbox(0.12, 3, 0.12, 0.03), postMat, sx * (w / 2 - 0.3), -1.5, -0.08));
  return { obj: g };
}

/** A routed timber sign: cream letters on stained boards. */
export function woodSign(text: string, w: number, h: number): THREE.Group {
  const g = new THREE.Group();
  const tex = textTexture([{ text, size: 120, color: '#f3e9cf', y: Math.round((1024 * h) / w / 2) + 40, font: '700' }], 1024, Math.round((1024 * h) / w), '#5a3d26');
  const face = mesh(new THREE.PlaneGeometry(w, h), styl({ map: tex, rough: 0.85, noise: 0.2, noiseScale: 0.5 }));
  face.position.z = 0.051;
  g.add(face);
  g.add(mesh(rbox(w + 0.14, h + 0.14, 0.1, 0.03), MAT.wood(0x6b4a2e)));
  return g;
}

function roomSign(p: PropDef): PropBuild {
  const g = signBoard(str(p, 'text'), 0.9, 0.28, '#f3e9cf', '#1d2a3a');
  return { obj: g };
}

export const BUILDING = { wall, roof, trusses, slab, bayLines, sign, roomSign };
export { num, str };
