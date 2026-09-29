import * as THREE from 'three';
import type { PropDef } from '../../../content/levels/types';
import type { World } from '../../../sim/world';
import { MAT, carPaint, styl } from '../stylized';
import { cone, cyl, lathe, mesh, rbox, sph, textTexture, tube } from '../shapes';
import { wheelModel } from '../itemModels';
import { woodSign } from './building';
import type { PropBuild } from './registry';

// Dressing for Kestrel Ridge: the ranger cabin's insides, the sawmill yard,
// the campground, the fire lookout, the mine, the bridge and the Company lot.
// Builders take the prop's local frame (origin on the ground, +Y up).

const num = (p: PropDef, k: string, d = 0) => (typeof p.p?.[k] === 'number' ? (p.p[k] as number) : d);
const str = (p: PropDef, k: string, d = '') => (typeof p.p?.[k] === 'string' ? (p.p[k] as string) : d);
const shadows = (g: THREE.Object3D) => {
  g.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return g;
};

const WOOD = () => MAT.wood(0x8a6040);
const DARKWOOD = () => MAT.wood(0x5a3d26);
const TIMBER = () => MAT.wood(0x9a7a52);
const ROCK = () => styl({ color: 0x8f877c, rough: 0.95, noise: 0.35, noiseScale: 1.2, rim: 0.2 });
const MOSS = () => styl({ color: 0x5f7f3c, rough: 1, noise: 0.3 });

// --- overlook ------------------------------------------------------------------------------

function viewer(): PropBuild {
  const g = new THREE.Group();
  const green = styl({ color: 0x3f6d58, rough: 0.5, metal: 0.4 });
  g.add(mesh(cyl(0.06, 0.09, 1.1, 10), green, 0, 0.55, 0));
  const head = new THREE.Group();
  head.position.y = 1.2;
  head.rotation.x = 0.15;
  head.add(mesh(rbox(0.34, 0.2, 0.24, 0.06), green));
  for (const sx of [-1, 1]) {
    const eye = mesh(cyl(0.05, 0.06, 0.16, 12), MAT.darkMetal(), sx * 0.08, 0.02, -0.18);
    eye.rotation.x = Math.PI / 2;
    head.add(eye);
  }
  g.add(head);
  return { obj: shadows(g) };
}

function rail(p: PropDef): PropBuild {
  const g = new THREE.Group();
  const len = num(p, 'len', 10);
  const steel = MAT.metal(0xb8bec8, 0.35);
  for (let x = 0; x <= len + 0.01; x += 2) g.add(mesh(rbox(0.12, 0.8, 0.12, 0.02), DARKWOOD(), x, 0.4, 0));
  g.add(mesh(rbox(len + 0.3, 0.3, 0.05, 0.03), steel, len / 2, 0.6, -0.08));
  return { obj: shadows(g) };
}

function railBroken(): PropBuild {
  const g = new THREE.Group();
  const steel = MAT.metal(0xb8bec8, 0.35);
  const bent = mesh(rbox(2.4, 0.3, 0.05, 0.03), steel, -3.4, 0.45, 0.5);
  bent.rotation.set(0.3, 0.5, -0.15);
  g.add(bent);
  const post = mesh(rbox(0.12, 0.8, 0.12, 0.02), DARKWOOD(), -4.6, 0.3, 0.2);
  post.rotation.z = 0.9;
  g.add(post);
  return { obj: shadows(g) };
}

// --- ranger station ---------------------------------------------------------------------

function porch(p: PropDef): PropBuild {
  const g = new THREE.Group();
  const w = num(p, 'w', 5);
  const d = num(p, 'd', 2);
  const deck = TIMBER();
  g.add(mesh(rbox(w, 0.12, d, 0.02), deck, 0, 0.06, 0));
  for (let x = -w / 2 + 0.15; x < w / 2; x += 0.2) g.add(mesh(rbox(0.01, 0.005, d, 0.001), styl({ color: 0x5a4028 }), x, 0.125, 0));
  for (const sx of [-1, 1]) {
    g.add(mesh(rbox(0.14, 2.6, 0.14, 0.03), DARKWOOD(), sx * (w / 2 - 0.1), 1.3, d / 2 - 0.1));
    g.add(mesh(rbox(0.06, 0.06, d, 0.02), DARKWOOD(), sx * (w / 2 - 0.1), 0.95, 0));
  }
  const roofM = styl({ color: 0x3f5b3a, rough: 0.7, metal: 0.2, noise: 0.1 });
  const lean = mesh(rbox(w + 0.3, 0.08, d + 0.4, 0.02), roofM, 0, 2.7, 0.1);
  lean.rotation.x = 0.18;
  g.add(lean);
  // a bench and a boot scraper
  g.add(mesh(rbox(1.4, 0.06, 0.36, 0.02), WOOD(), -w / 4, 0.55, -d / 2 + 0.3));
  for (const sx of [-1, 1]) g.add(mesh(rbox(0.06, 0.44, 0.3, 0.01), WOOD(), -w / 4 + sx * 0.6, 0.34, -d / 2 + 0.3));
  return { obj: shadows(g) };
}

function mapBoard(): PropBuild {
  const g = new THREE.Group();
  const tex = textTexture(
    [
      { text: 'KESTREL RIDGE', size: 70, color: '#3a2a1a', y: 70, font: '800' },
      { text: '▲ Overlook   ⌂ Ranger Stn', size: 36, color: '#3a2a1a', y: 150 },
      { text: '✦ Old Mine   ⌖ Fire Lookout', size: 36, color: '#3a2a1a', y: 200 },
      { text: '← Sawmill      Campground →', size: 36, color: '#b44a2c', y: 260, font: 'italic 700' },
      { text: '↓ Valley · Creek · Bridge', size: 36, color: '#2f5f7a', y: 320 },
    ],
    1024,
    400,
    '#e8dcc0',
  );
  g.add(mesh(new THREE.PlaneGeometry(1.8, 0.72), styl({ map: tex, rough: 0.9, noise: 0.1 }), 0, 0, 0.03));
  g.add(mesh(rbox(1.96, 0.88, 0.05, 0.02), DARKWOOD()));
  // topo squiggles pinned on
  for (let i = 0; i < 4; i++) g.add(mesh(sph(0.018, 6, 4), styl({ color: [0xd9463b, 0x2f7fd1, 0xf2c230, 0x3f7d4f][i], rough: 0.4 }), -0.6 + i * 0.4, 0.28, 0.05));
  return { obj: g, targets: new Map([['station:mapBoard', g]]) };
}

function keyHook(): PropBuild {
  const g = new THREE.Group();
  g.add(mesh(rbox(0.36, 0.14, 0.03, 0.01), DARKWOOD()));
  for (const x of [-0.1, 0, 0.1]) g.add(mesh(cyl(0.008, 0.008, 0.06, 6), MAT.metal(), x, -0.03, 0.03).rotateX(Math.PI / 2));
  return { obj: g };
}

function woodStove(): PropBuild {
  const g = new THREE.Group();
  const iron = styl({ color: 0x2a2b2e, rough: 0.6, metal: 0.6 });
  g.add(mesh(rbox(0.6, 0.6, 0.5, 0.05), iron, 0, 0.45, 0));
  for (const [x, z] of [
    [-0.25, -0.2],
    [0.25, -0.2],
    [-0.25, 0.2],
    [0.25, 0.2],
  ])
    g.add(mesh(cyl(0.03, 0.03, 0.15, 6), iron, x, 0.08, z));
  g.add(mesh(cyl(0.08, 0.08, 2.4, 10), iron, 0, 1.9, 0.1));
  const glow = MAT.glow(0xff7a2f, 1.5);
  g.add(mesh(rbox(0.3, 0.16, 0.02, 0.01), glow, 0, 0.42, -0.26));
  const light = new THREE.PointLight(0xff8a3c, 1.2, 5, 2);
  light.position.set(0, 0.5, -0.5);
  g.add(light);
  return {
    obj: shadows(g),
    update: (_dt, t) => {
      light.intensity = 1.0 + Math.sin(t * 9) * 0.15 + Math.sin(t * 23) * 0.1;
    },
  };
}

function woodpile(): PropBuild {
  const g = new THREE.Group();
  const log = MAT.wood(0x8a5f3a);
  const end = styl({ color: 0xd9b27a, rough: 0.9, noise: 0.2 });
  for (let row = 0; row < 4; row++)
    for (let i = 0; i < 7 - (row % 2); i++) {
      const r = 0.09 + ((i * 13 + row * 7) % 5) * 0.008;
      const m = mesh(cyl(r, r, 0.8, 8), log, -0.6 + i * 0.2 + (row % 2) * 0.1, 0.1 + row * 0.18, 0);
      m.rotation.x = Math.PI / 2;
      g.add(m);
      const e = mesh(cyl(r - 0.01, r - 0.01, 0.01, 8), end, m.position.x, m.position.y, 0.41);
      e.rotation.x = Math.PI / 2;
      g.add(e);
    }
  return { obj: shadows(g) };
}

function cinderBlocks(): PropBuild {
  const g = new THREE.Group();
  const c = MAT.concrete(0x9a958c);
  g.add(mesh(rbox(0.4, 0.2, 0.2, 0.02), c, 0, 0.1, 0));
  g.add(mesh(rbox(0.4, 0.2, 0.2, 0.02), c, 0, 0.3, 0.02));
  return { obj: shadows(g) };
}

// --- sawmill ---------------------------------------------------------------------------

function sawShed(): PropBuild {
  const g = new THREE.Group();
  const w = 10;
  const d = 3;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(mesh(rbox(0.2, 3.4, 0.2, 0.03), DARKWOOD(), sx * (w / 2 - 0.2), 1.7, sz * (d / 2 - 0.1)));
  const roofM = styl({ color: 0x6c6f73, rough: 0.6, metal: 0.4, noise: 0.15 });
  const r = mesh(rbox(w + 0.6, 0.08, d + 1, 0.02), roofM, 0, 3.5, 0);
  r.rotation.x = 0.1;
  g.add(r);
  // the log deck and the big blade
  g.add(mesh(rbox(w - 0.6, 0.2, 1.6, 0.03), TIMBER(), 0, 1.0, 0));
  for (let x = -4; x <= 4; x += 1) g.add(mesh(cyl(0.05, 0.05, 1.6, 8), MAT.darkMetal(), x, 1.12, 0).rotateX(Math.PI / 2));
  const blade = mesh(cyl(0.7, 0.7, 0.02, 32), MAT.metal(0xc8ced6, 0.3), 1.5, 1.4, 0);
  blade.rotation.x = Math.PI / 2;
  g.add(blade);
  const log = mesh(cyl(0.34, 0.34, 4.4, 14), MAT.wood(0x7a5232), -2.2, 1.45, 0);
  log.rotation.z = Math.PI / 2;
  g.add(log);
  g.add(mesh(rbox(1.8, 0.3, 1.8, 0.1), styl({ color: 0xd9b27a, rough: 1, noise: 0.35 }), 3, 0.1, 1.8));
  return { obj: shadows(g) };
}

function logPile(): PropBuild {
  const g = new THREE.Group();
  const logM = MAT.wood(0x7a5232);
  const end = styl({ color: 0xcfa66e, rough: 0.9, noise: 0.25 });
  let i = 0;
  for (let row = 0; row < 3; row++)
    for (let c = 0; c < 5 - row; c++) {
      const r = 0.24 + ((i * 17) % 5) * 0.02;
      // logs lie along X (the collider is 7 long × 2.6 deep), stacked across Z
      const z = -1 + c * 0.52 + row * 0.26;
      const y = 0.26 + row * 0.44;
      const m = mesh(cyl(r, r, 7, 12), logM, 0, y, z);
      m.rotation.z = Math.PI / 2;
      g.add(m);
      for (const s of [-1, 1]) {
        const e = mesh(cyl(r - 0.02, r - 0.02, 0.02, 12), end, s * 3.5, y, z);
        e.rotation.z = Math.PI / 2;
        g.add(e);
      }
      i++;
    }
  return { obj: shadows(g) };
}

function cable(p: PropDef): PropBuild {
  const len = num(p, 'len', 3);
  const m = mesh(tube(`cable${len}`, [[0, 0.03, 0], [len * 0.3, 0.02, 0.3], [len * 0.7, 0.03, -0.2], [len, 0.05, 0.1]], 0.02, 20, 6), MAT.rubber(0x1c1d21));
  return { obj: m };
}

// --- campground --------------------------------------------------------------------------

function rv(p: PropDef): PropBuild {
  const g = new THREE.Group();
  const body = carPaint(num(p, 'color', 0xefe6d2));
  const stripe = styl({ color: num(p, 'stripe', 0x3d7ea6), rough: 0.4 });
  const glass = MAT.glass(0x4f7fa4, 0.7);
  const y0 = 0.45;
  // box body with a rounded nose, cab-over bunk
  g.add(mesh(rbox(8.2, 2.6, 2.4, 0.3), body, 0.2, y0 + 1.6, 0));
  g.add(mesh(rbox(1.6, 1.3, 2.3, 0.35), body, -4.4, y0 + 0.95, 0));
  g.add(mesh(rbox(1.9, 0.8, 2.3, 0.3), body, -3.8, y0 + 2.5, 0));
  const ws = mesh(rbox(0.05, 0.7, 2.0, 0.02), glass, -5.15, y0 + 1.25, 0);
  ws.rotation.z = -0.35;
  g.add(ws);
  for (const sz of [-1, 1]) {
    g.add(mesh(rbox(8.4, 0.18, 0.02, 0.01), stripe, 0, y0 + 1.2, sz * 1.215));
    g.add(mesh(rbox(8.4, 0.08, 0.02, 0.01), stripe, 0, y0 + 1.45, sz * 1.215));
    for (const x of [-2, 0.6, 2.8]) g.add(mesh(rbox(1.1, 0.6, 0.03, 0.03), glass, x, y0 + 2.1, sz * 1.21));
  }
  // storage bin (the +Z side, near the back) and the fuel filler
  g.add(mesh(rbox(0.9, 0.5, 0.03, 0.03), styl({ color: 0xcfc6b0, rough: 0.5 }), -1.6, y0 + 0.45, 1.215));
  g.add(mesh(cyl(0.06, 0.06, 0.04, 12), MAT.chrome(), 2.6, y0 + 0.55, 1.22).rotateX(Math.PI / 2));
  g.add(mesh(rbox(0.9, 1.9, 0.03, 0.02), styl({ color: 0xd8cfb8, rough: 0.5 }), 1.2, y0 + 1.25, 1.215));
  // awning + ladder + a camp chair
  const awn = mesh(rbox(3.4, 0.04, 1.8, 0.02), styl({ color: 0x3d7ea6, rough: 0.8, side: THREE.DoubleSide }), 0.6, y0 + 2.7, 2.2);
  awn.rotation.x = -0.12;
  g.add(awn);
  for (const x of [-1, 2.2]) g.add(mesh(cyl(0.025, 0.025, 2.7, 6), MAT.metal(), x, 1.35, 3.0));
  for (let i = 0; i < 8; i++) g.add(mesh(rbox(0.3, 0.03, 0.03, 0.01), MAT.metal(), 4.2, y0 + 0.4 + i * 0.3, -1.25));
  for (const sz of [-1, 1])
    for (const x of [-3.2, 2.6]) {
      const w = wheelModel(0.42, 0.28, 'truck', false);
      w.rotation.z = sz < 0 ? Math.PI / 2 : -Math.PI / 2;
      w.position.set(x, 0.42, sz * 1.02);
      g.add(w);
    }
  g.add(mesh(rbox(0.5, 0.06, 0.5, 0.02), styl({ color: 0x2f7a5a, rough: 0.8 }), 1.8, 0.45, 3.6));
  return { obj: shadows(g) };
}

function campfire(p: PropDef, w: World): PropBuild {
  const g = new THREE.Group();
  const stone = ROCK();
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const s = mesh(sph(0.16, 8, 6), stone, Math.cos(a) * 0.6, 0.08, Math.sin(a) * 0.6);
    s.scale.set(1, 0.7, 1.1);
    g.add(s);
  }
  for (let i = 0; i < 4; i++) {
    const l = mesh(cyl(0.07, 0.07, 0.8, 8), MAT.wood(0x5a3d26), 0, 0.14, 0);
    l.rotation.set(0.9, (i / 4) * Math.PI, 0);
    g.add(l);
  }
  const flame = styl({ color: 0xffb04a, emissive: 0xff7a1a, emissiveIntensity: 3, rough: 1, noise: 0, rim: 0, transparent: true, opacity: 0.9, noFog: false });
  const flames: THREE.Mesh[] = [];
  for (let i = 0; i < 3; i++) {
    const f = mesh(cone(0.18 - i * 0.03, 0.6 - i * 0.1, 8), flame, (i - 1) * 0.08, 0.4, (i % 2) * 0.06);
    f.castShadow = false;
    g.add(f);
    flames.push(f);
  }
  const light = new THREE.PointLight(0xff8a3c, 0, 14, 1.6);
  light.position.y = 0.8;
  g.add(light);
  const flag = str(p, 'flag', '');
  return {
    obj: g,
    update: (_dt, t) => {
      const lit = !flag || w.flag(flag);
      flames.forEach((f, i) => {
        f.visible = lit;
        f.scale.y = 1 + Math.sin(t * (8 + i * 3) + i) * 0.18;
        f.rotation.y = t * (1 + i);
      });
      light.intensity = lit ? 3.2 + Math.sin(t * 11) * 0.5 + Math.sin(t * 27) * 0.3 : 0;
    },
  };
}

function tent(p: PropDef): PropBuild {
  const g = new THREE.Group();
  const col = num(p, 'color', 0xd9643a);
  const fly = styl({ color: col, rough: 0.8, side: THREE.DoubleSide, noise: 0.1 });
  const shape = new THREE.Shape();
  shape.moveTo(-1.1, 0);
  shape.quadraticCurveTo(-0.6, 1.1, 0, 1.25);
  shape.quadraticCurveTo(0.6, 1.1, 1.1, 0);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 2.2, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.06, bevelSegments: 3, curveSegments: 10 });
  geo.translate(0, 0, -1.1);
  g.add(mesh(geo, fly));
  const door = mesh(new THREE.CircleGeometry(0.45, 12, 0, Math.PI), styl({ color: 0x2b2d33, rough: 0.9, side: THREE.DoubleSide }), 0, 0.02, 1.2);
  g.add(door);
  for (const sx of [-1, 1]) g.add(mesh(tube(`guy${sx}`, [[sx * 0.6, 1.0, 1.1], [sx * 1.6, 0, 1.9]], 0.006, 2, 4), styl({ color: 0xe8e2d0 })));
  return { obj: shadows(g) };
}

function picnicTable(): PropBuild {
  const g = new THREE.Group();
  const w = WOOD();
  g.add(mesh(rbox(1.8, 0.06, 0.8, 0.02), w, 0, 0.76, 0));
  for (const sz of [-1, 1]) g.add(mesh(rbox(1.8, 0.05, 0.3, 0.02), w, 0, 0.45, sz * 0.62));
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const leg = mesh(rbox(0.07, 0.95, 0.07, 0.02), w, sx * 0.7, 0.42, sz * 0.4);
      leg.rotation.x = sz * 0.5;
      g.add(leg);
    }
  return { obj: shadows(g) };
}

function dock(p: PropDef): PropBuild {
  const g = new THREE.Group();
  const len = num(p, 'len', 12);
  for (let z = 0; z < len; z += 0.3) g.add(mesh(rbox(2.0, 0.06, 0.26, 0.01), TIMBER(), 0, 0.5, -z));
  for (let z = 0; z < len; z += 2) for (const sx of [-1, 1]) g.add(mesh(cyl(0.1, 0.1, 2.4, 8), DARKWOOD(), sx * 0.95, -0.4, -z));
  return { obj: shadows(g) };
}

function canoe(): PropBuild {
  const g = new THREE.Group();
  const hull = lathe('canoe', [[0, -0.001], [0.2, 0.1], [0.36, 0.3], [0.4, 0.5], [0.36, 0.7], [0.2, 0.9], [0, 1.0]], 16);
  const m = mesh(hull, styl({ color: 0xc2432c, rough: 0.45, clearcoat: 0.4 }));
  m.scale.set(1, 4.6, 0.55);
  m.rotation.x = Math.PI / 2;
  m.position.set(0, 0.18, -2.3);
  g.add(m);
  return { obj: shadows(g) };
}

// --- fire lookout ---------------------------------------------------------------------------

function lookout(p: PropDef): PropBuild {
  const g = new THREE.Group();
  const h = num(p, 'h', 9);
  const timber = DARKWOOD();
  // legs with cross bracing
  for (const [x, z] of [
    [-2, -2],
    [2, -2],
    [-2, 2],
    [2, 2],
  ])
    g.add(mesh(rbox(0.3, h, 0.3, 0.04), timber, x, h / 2, z));
  for (let y = 1.5; y < h - 0.5; y += 2.6) {
    for (const [ax, az, bx, bz] of [
      [-2, -2, 2, -2],
      [2, -2, 2, 2],
      [2, 2, -2, 2],
      [-2, 2, -2, -2],
    ]) {
      const brace = mesh(rbox(Math.hypot(bx - ax, bz - az, 2.4), 0.1, 0.1, 0.02), timber, (ax + bx) / 2, y + 1.2, (az + bz) / 2);
      brace.rotation.y = -Math.atan2(bz - az, bx - ax);
      brace.rotation.z = Math.atan2(2.4, Math.hypot(bx - ax, bz - az));
      g.add(brace);
    }
  }
  // platform, cabin with big windows, pyramid roof
  g.add(mesh(rbox(4.8, 0.2, 4.8, 0.03), TIMBER(), 0, h - 0.1, 0));
  const wallM = styl({ color: 0x8a5f3a, rough: 0.9, noise: 0.2 });
  const glass = MAT.glass(0xb8d6ec, 0.3);
  for (const [x, z, ry] of [
    [0, -2.35, 0],
    [0, 2.35, 0],
    [-2.35, 0, Math.PI / 2],
    [2.35, 0, Math.PI / 2],
  ] as [number, number, number][]) {
    const wall = mesh(rbox(4.7, 1.0, 0.1, 0.02), wallM, x, h + 0.5, z);
    wall.rotation.y = ry;
    g.add(wall);
    const win = mesh(rbox(4.5, 1.2, 0.03, 0.01), glass, x, h + 1.6, z);
    win.rotation.y = ry;
    g.add(win);
  }
  for (const [x, z] of [
    [-2.3, -2.3],
    [2.3, -2.3],
    [-2.3, 2.3],
    [2.3, 2.3],
  ])
    g.add(mesh(rbox(0.12, 2.4, 0.12, 0.02), timber, x, h + 1.2, z));
  const roof = mesh(cone(3.8, 1.6, 4), styl({ color: 0x3f5b3a, rough: 0.7, metal: 0.2 }), 0, h + 3.2, 0);
  roof.rotation.y = Math.PI / 4;
  g.add(roof);
  // fire finder in the middle + a journal on the ledge
  g.add(mesh(cyl(0.3, 0.35, 1.0, 12), wallM, 0, h + 0.5, 0));
  g.add(mesh(cyl(0.34, 0.34, 0.05, 20), MAT.metal(0xc5ccd6), 0, h + 1.03, 0));
  g.add(mesh(rbox(0.26, 0.04, 0.2, 0.01), styl({ color: 0x5a2e2a, rough: 0.7 }), 1.2, h + 1.02, -2.15));
  // stairs: two flights + landing (matches the colliders in ridge.ts)
  const stair = (x: number, z0: number, z1: number, y0: number, y1: number) => {
    const n = 14;
    for (let i = 0; i < n; i++) {
      const k = (i + 0.5) / n;
      g.add(mesh(rbox(1.1, 0.05, (Math.abs(z1 - z0) / n) * 0.9, 0.01), TIMBER(), x, y0 + (y1 - y0) * k, z0 + (z1 - z0) * k));
    }
    for (const sx of [-1, 1]) {
      const len = Math.hypot(z1 - z0, y1 - y0);
      const s = mesh(rbox(0.06, 0.24, len, 0.01), timber, x + sx * 0.58, (y0 + y1) / 2, (z0 + z1) / 2);
      s.rotation.x = Math.atan2(y1 - y0, z0 - z1);
      g.add(s);
      const hand = mesh(rbox(0.05, 0.05, len, 0.01), timber, x + sx * 0.58, (y0 + y1) / 2 + 0.9, (z0 + z1) / 2);
      hand.rotation.x = s.rotation.x;
      g.add(hand);
    }
  };
  stair(3.0, 3.2, -2.6, 0, h / 2);
  g.add(mesh(rbox(1.2, 0.1, 1.2, 0.02), TIMBER(), 3.0, h / 2 - 0.05, -3.2));
  stair(4.2, -3.2, 1.6, h / 2, h);
  g.add(mesh(rbox(2.4, 0.1, 1.0, 0.02), TIMBER(), 3.4, h - 0.05, 1.9));
  return { obj: shadows(g) };
}

// --- the mine ---------------------------------------------------------------------------------

function minePortal(): PropBuild {
  const g = new THREE.Group();
  const t = DARKWOOD();
  // prop frame is facing +Z (yaw puts it facing east): posts, header, and a rock face around it
  for (const sx of [-1, 1]) g.add(mesh(rbox(0.35, 3.4, 0.35, 0.05), t, sx * 2.0, 1.7, 0));
  g.add(mesh(rbox(4.8, 0.4, 0.45, 0.05), t, 0, 3.5, 0));
  const sign = woodSign('HALVORSEN No. 2', 2.6, 0.5);
  sign.position.set(0, 4.05, 0.1);
  g.add(sign);
  const rock = ROCK();
  for (let i = 0; i < 14; i++) {
    const a = (i / 13) * Math.PI;
    const r = 3.2 + ((i * 7) % 4) * 0.35;
    const b = mesh(sph(1.2 + ((i * 11) % 5) * 0.25, 7, 5), rock, Math.cos(a) * r, Math.sin(a) * r * 1.1, -0.9 - ((i * 3) % 4) * 0.2);
    b.scale.set(1, 0.8, 1);
    g.add(b);
  }
  const moss = mesh(sph(2.6, 8, 6), MOSS(), 0, 5.4, -2.2);
  moss.scale.set(1.6, 0.5, 1.2);
  g.add(moss);
  // rails out of the portal
  for (const sx of [-0.45, 0.45]) g.add(mesh(rbox(0.06, 0.06, 6, 0.01), MAT.darkMetal(), sx, 0.05, 2.4));
  for (let z = -0.2; z < 5.4; z += 0.6) g.add(mesh(rbox(1.3, 0.08, 0.16, 0.01), t, 0, 0.03, z));
  return { obj: shadows(g) };
}

function mineTunnel(p: PropDef): PropBuild {
  // Interior dressing for the timbered drift: sets every 2 m, rock lining.
  const g = new THREE.Group();
  const len = num(p, 'len', 14);
  const t = DARKWOOD();
  const rock = styl({ color: 0x5f5850, rough: 1, noise: 0.35, noiseScale: 1.5, side: THREE.BackSide });
  const lining = mesh(rbox(len, 3.2, 3.6, 0.3), rock, -len / 2, 1.5, 0);
  g.add(lining);
  // Outside, the drift is buried under a mossy rock mound that runs into the
  // hillside behind it (you're inside the mound, so its faces cull away).
  const mound = mesh(sph(1, 14, 10), ROCK(), -len / 2 - 1, 0.2, 0);
  mound.scale.set(len / 2 + 2.5, 5.2, 5.5);
  mound.castShadow = true;
  g.add(mound);
  const cap = mesh(sph(1, 12, 8), MOSS(), -len / 2 - 1.5, 3.4, 0);
  cap.scale.set(len / 2 + 1, 2.4, 4.2);
  g.add(cap);
  for (let x = -1; x > -len; x -= 2) {
    for (const sz of [-1, 1]) g.add(mesh(rbox(0.25, 3.0, 0.25, 0.04), t, x, 1.5, sz * 1.55));
    g.add(mesh(rbox(0.3, 0.3, 3.4, 0.04), t, x, 3.0, 0));
  }
  for (const sz of [-0.45, 0.45]) g.add(mesh(rbox(len, 0.06, 0.06, 0.01), MAT.darkMetal(), -len / 2, 0.05, sz));
  return { obj: g };
}

function mineCart(): PropBuild {
  const g = new THREE.Group();
  const rust = styl({ color: 0x7a4a2e, rough: 0.8, metal: 0.4, noise: 0.25 });
  g.add(mesh(rbox(1.3, 0.7, 0.8, 0.05), rust, 0, 0.6, 0));
  g.add(mesh(rbox(1.1, 0.3, 0.6, 0.05), ROCK(), 0, 0.9, 0));
  for (const sx of [-0.4, 0.4])
    for (const sz of [-0.45, 0.45]) {
      const w = mesh(cyl(0.17, 0.17, 0.08, 12), MAT.darkMetal(), sx, 0.17, sz);
      w.rotation.x = Math.PI / 2;
      g.add(w);
    }
  return { obj: shadows(g) };
}

function lantern(): PropBuild {
  const g = new THREE.Group();
  g.add(mesh(cyl(0.08, 0.1, 0.22, 10), MAT.glass(0xffe2a0, 0.5), 0, 0.11, 0));
  g.add(mesh(sph(0.05, 8, 6), MAT.glow(0xffc870, 3), 0, 0.1, 0));
  g.add(mesh(cyl(0.1, 0.1, 0.03, 10), MAT.darkMetal(), 0, 0.23, 0));
  const light = new THREE.PointLight(0xffc070, 1.4, 7, 2);
  light.position.y = 0.2;
  g.add(light);
  return { obj: g, update: (_dt, t) => (light.intensity = 1.3 + Math.sin(t * 6) * 0.1) };
}

// --- bridge, rockslide, ford ------------------------------------------------------------------

function bridge(p: PropDef): PropBuild {
  const g = new THREE.Group();
  const len = num(p, 'len', 36);
  const w = num(p, 'w', 7);
  const depth = num(p, 'depth', 10);
  const deck = TIMBER();
  const steel = styl({ color: 0x4a6a7a, rough: 0.5, metal: 0.6 });
  g.add(mesh(rbox(w, 0.5, len, 0.04), deck, 0, -0.25, 0));
  for (let z = -len / 2 + 0.2; z < len / 2; z += 0.5) {
    const plank = mesh(rbox(w - 0.2, 0.02, 0.42, 0.01), MAT.wood(0x7a5a3a), 0, 0.01, z);
    plank.castShadow = false;
    g.add(plank);
  }
  // steel truss sides
  for (const sx of [-1, 1]) {
    g.add(mesh(rbox(0.2, 0.2, len, 0.02), steel, sx * (w / 2 + 0.05), 1.0, 0));
    g.add(mesh(rbox(0.2, 0.2, len, 0.02), steel, sx * (w / 2 + 0.05), 0.1, 0));
    for (let z = -len / 2; z <= len / 2; z += 3) {
      g.add(mesh(rbox(0.14, 1.0, 0.14, 0.02), steel, sx * (w / 2 + 0.05), 0.55, z));
      const diag = mesh(rbox(0.1, 1.3, 0.1, 0.01), steel, sx * (w / 2 + 0.05), 0.55, z + 1.5);
      diag.rotation.x = ((Math.round(z / 3) % 2 ? 1 : -1) * Math.PI) / 4.5;
      g.add(diag);
    }
  }
  // stone piers down to the creek bed
  const stone = ROCK();
  for (const z of [-len / 4, len / 4]) {
    g.add(mesh(rbox(w * 0.7, depth, 2.0, 0.2), stone, 0, -depth / 2 - 0.5, z));
  }
  return { obj: shadows(g) };
}

function rockslide(p: PropDef, w: World): PropBuild {
  const g = new THREE.Group();
  const rock = ROCK();
  // matches the seven boulder colliders across the road, plus rubble and dust
  for (let i = 0; i < 7; i++) {
    const x = -6 + i * 2;
    const z = Math.sin(i * 1.7) * 1.2;
    const b = mesh(sph(1.6, 8, 6), rock, x, 0.6, z);
    b.scale.set(1.1, 0.85, 1.05);
    b.rotation.set(i, i * 2.3, 0);
    g.add(b);
  }
  for (let i = 0; i < 26; i++) {
    const s = mesh(sph(0.3 + ((i * 7) % 5) * 0.12, 6, 4), rock, -8 + ((i * 37) % 160) / 10, 0.1, -3 + ((i * 53) % 60) / 10);
    g.add(s);
  }
  const flag = str(p, 'flag', '');
  const fall = { t: 0 };
  return {
    obj: shadows(g),
    update: (dt) => {
      const on = !flag || w.flag(flag);
      g.visible = on;
      if (on && fall.t < 1) {
        // tumble in from above when it first appears
        fall.t = Math.min(1, fall.t + dt * 1.4);
        const e = 1 - Math.pow(1 - fall.t, 3);
        g.position.y = p.pos.y + (1 - e) * 14;
      }
    },
  };
}

function fordPosts(): PropBuild {
  const g = new THREE.Group();
  const post = styl({ color: 0xe8e2d0, rough: 0.6 });
  const band = styl({ color: 0xd9463b, rough: 0.5 });
  for (const [x, z] of [
    [-3.5, -10],
    [3.5, -10],
    [-3.5, 10],
    [3.5, 10],
  ]) {
    g.add(mesh(cyl(0.08, 0.08, 2.4, 8), post, x, 1.0, z));
    for (let y = 0.4; y < 2.2; y += 0.5) g.add(mesh(cyl(0.085, 0.085, 0.16, 8), band, x, y, z));
  }
  return { obj: shadows(g) };
}

// --- the lot ------------------------------------------------------------------------------------

function flatbed(p: PropDef): PropBuild {
  const g = new THREE.Group();
  const body = carPaint(num(p, 'color', 0xf1ede2));
  const stripe = styl({ color: num(p, 'stripe', 0xff7a2f), rough: 0.4 });
  const dark = styl({ color: 0x24262b, rough: 0.7 });
  const glass = MAT.glass(0x4f7fa4, 0.7);
  // cab forward (-Z), flat deck behind
  g.add(mesh(rbox(2.4, 1.9, 2.0, 0.2), body, 0, 1.95, -3.3));
  g.add(mesh(rbox(2.2, 0.8, 0.03, 0.02), glass, 0, 2.4, -4.31));
  g.add(mesh(rbox(2.42, 0.2, 2.02, 0.02), stripe, 0, 1.3, -3.3));
  const logo = textTexture([{ text: 'THE COMPANY', size: 70, color: '#ff7a2f', y: 64 }], 512, 128);
  for (const sx of [-1, 1]) {
    const l = mesh(new THREE.PlaneGeometry(1.6, 0.4), styl({ map: logo, transparent: true, rough: 0.5, noise: 0, polygonOffset: 2 }), sx * 1.21, 1.8, -3.3);
    l.rotation.y = (sx * Math.PI) / 2;
    g.add(l);
  }
  g.add(mesh(rbox(2.5, 0.2, 6.6, 0.04), dark, 0, 1.1, 0.9));
  g.add(mesh(rbox(2.5, 0.06, 6.6, 0.02), MAT.metal(0x9aa0a8, 0.5), 0, 1.23, 0.9));
  // ramps down at the back
  for (const sx of [-0.7, 0.7]) {
    const ramp = mesh(rbox(0.5, 0.05, 2.6, 0.02), MAT.metal(0x9aa0a8, 0.5), sx, 0.62, 5.2);
    ramp.rotation.x = 0.42;
    g.add(ramp);
  }
  // beacon lights on the cab roof
  const amber = MAT.glow(0xffb347, 2);
  const beacons: THREE.Mesh[] = [];
  for (const sx of [-0.7, 0.7]) {
    const b = mesh(cyl(0.1, 0.12, 0.14, 12), amber, sx, 3.0, -3.3);
    g.add(b);
    beacons.push(b);
  }
  for (const sz of [-1, 1])
    for (const z of [-3.2, 1.6, 3.0]) {
      const w = wheelModel(0.5, 0.32, 'truck', false);
      w.rotation.z = sz < 0 ? Math.PI / 2 : -Math.PI / 2;
      w.position.set(sz * 1.05, 0.5, z);
      g.add(w);
    }
  const light = new THREE.PointLight(0xffb347, 2, 18, 2);
  light.position.set(0, 3.2, -3.3);
  g.add(light);
  return {
    obj: shadows(g),
    update: (_dt, t) => {
      const on = Math.sin(t * 6) > 0;
      (beacons[0].material as THREE.MeshStandardMaterial).emissiveIntensity = on ? 3 : 0.3;
      light.intensity = on ? 2.5 : 0.4;
    },
  };
}

function fingerpost(p: PropDef): PropBuild {
  const g = new THREE.Group();
  g.add(mesh(rbox(0.14, 2.8, 0.14, 0.03), DARKWOOD(), 0, 1.4, 0));
  const arms: [string, string][] = [
    ['a', 'ay'],
    ['b', 'by'],
    ['c', 'cy'],
  ];
  arms.forEach(([k, ky], i) => {
    const text = str(p, k, '');
    if (!text) return;
    const yaw = num(p, ky, 0);
    const arm = new THREE.Group();
    arm.position.y = 2.4 - i * 0.36;
    arm.rotation.y = yaw;
    const board = woodSign(text, 1.3, 0.26);
    board.position.x = 0.7;
    board.scale.z = 0.5;
    arm.add(board);
    const back = board.clone();
    back.rotation.y = Math.PI;
    back.position.set(0.7, 0, -0.02);
    arm.add(back);
    const tip = mesh(cone(0.18, 0.2, 3), MAT.wood(0x6b4a2e), 1.45, 0, 0);
    tip.rotation.z = -Math.PI / 2;
    tip.scale.set(1, 1, 0.3);
    arm.add(tip);
    g.add(arm);
  });
  return { obj: shadows(g) };
}

function coneProp(): PropBuild {
  const g = new THREE.Group();
  const orange = styl({ color: 0xff6a2a, rough: 0.5 });
  g.add(mesh(rbox(0.4, 0.04, 0.4, 0.02), orange, 0, 0.02, 0));
  g.add(mesh(cone(0.16, 0.6, 14), orange, 0, 0.34, 0));
  g.add(mesh(cyl(0.1, 0.12, 0.08, 14), styl({ color: 0xf3f0e6, rough: 0.4 }), 0, 0.36, 0));
  return { obj: shadows(g) };
}

export const RIDGE_PROPS = {
  viewer,
  rail,
  railBroken,
  porch,
  mapBoard,
  keyHook,
  woodStove,
  woodpile,
  cinderBlocks,
  sawShed,
  logPile,
  cable,
  rv,
  campfire,
  tent,
  picnicTable,
  dock,
  canoe,
  lookout,
  minePortal,
  mineTunnel,
  mineCart,
  lantern,
  bridge,
  rockslide,
  fordPosts,
  flatbed,
  fingerpost,
  cone: coneProp,
};
