import * as THREE from 'three';
import type { Prop, PropKind } from '../../content/levels/garage';
import { M, chrome, glass, paint } from './materials';
import { box, capsule, circle, cone, cyl, extrude, lathe, plane, roundedBox, shell, sphere, torus, tyre } from './geo';
import { posterTexture } from './textures';

// Every world prop, rebuilt on the shared geometry/material kit. Props are pure
// mesh construction: no lights owned here except where a fixture is meaningless
// without one (yard lamps), and no per-frame state — `view.ts` animates by
// looking up named children ('spin', 'wave', 'needle', 'arm').

const mesh = (g: THREE.BufferGeometry, m: THREE.Material, cast = true, receive = true): THREE.Mesh => {
  const x = new THREE.Mesh(g, m);
  x.castShadow = cast;
  x.receiveShadow = receive;
  return x;
};

const at = (o: THREE.Object3D, x: number, y: number, z: number): THREE.Object3D => {
  o.position.set(x, y, z);
  return o;
};

/** Deterministic jitter so repeated props aren't identical but stay stable. */
function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

// --- workshop ---------------------------------------------------------------

function barrel(color: number): THREE.Group {
  const g = new THREE.Group();
  // Lathe profile gives the rolled rim + belly that says "oil drum".
  const body = mesh(
    lathe(
      'barrel',
      [
        [0, 0],
        [0.33, 0],
        [0.35, 0.06],
        [0.34, 0.2],
        [0.36, 0.32],
        [0.34, 0.44],
        [0.36, 0.58],
        [0.34, 0.7],
        [0.36, 0.84],
        [0.35, 0.94],
        [0.33, 1.0],
        [0, 1.0],
      ],
      20,
    ),
    M.painted(color, 0.48),
  );
  g.add(body);
  for (const y of [0.32, 0.7]) {
    const ring = mesh(torus(0.355, 0.022, 8, 20), M.darkSteel());
    ring.rotation.x = Math.PI / 2;
    g.add(at(ring, 0, y, 0));
  }
  const cap = mesh(cyl(0.07, 0.07, 0.03, 10), chrome(0xb9c0cc));
  g.add(at(cap, 0.16, 1.01, 0));
  return g;
}

function tireStack(): THREE.Group {
  const g = new THREE.Group();
  const r = rng(7);
  for (let i = 0; i < 3; i++) {
    const t = mesh(tyre(0.5, 0.3), M.tyre());
    t.rotation.z = Math.PI / 2; // lie flat
    t.rotation.y = r() * Math.PI;
    g.add(at(t, r() * 0.05 - 0.025, 0.16 + i * 0.31, r() * 0.05 - 0.025));
  }
  return g;
}

function toolbox(color: number): THREE.Group {
  const g = new THREE.Group();
  g.add(at(mesh(roundedBox(0.7, 0.34, 0.42, 0.04), M.painted(color)), 0, 0.19, 0));
  g.add(at(mesh(roundedBox(0.73, 0.1, 0.45, 0.035), M.painted(color)), 0, 0.41, 0));
  const handle = mesh(capsule(0.022, 0.26, 4, 8), M.darkSteel());
  handle.rotation.z = Math.PI / 2;
  g.add(at(handle, 0, 0.5, 0));
  g.add(at(mesh(box(0.6, 0.012, 0.36), M.darkSteel()), 0, 0.36, 0));
  return g;
}

function jackstand(): THREE.Group {
  const g = new THREE.Group();
  g.add(at(mesh(cyl(0.14, 0.3, 0.09, 4), M.painted(0xe8a020)), 0, 0.045, 0));
  for (let i = 0; i < 3; i++) {
    const leg = mesh(box(0.05, 0.55, 0.05), M.painted(0xe8a020));
    leg.rotation.set(0.16, (i / 3) * Math.PI * 2, 0);
    g.add(at(leg, Math.sin((i / 3) * Math.PI * 2) * 0.11, 0.3, Math.cos((i / 3) * Math.PI * 2) * 0.11));
  }
  g.add(at(mesh(roundedBox(0.07, 0.45, 0.07, 0.012), chrome(0xc4ccd8)), 0, 0.4, 0));
  const saddle = mesh(roundedBox(0.2, 0.07, 0.13, 0.02), chrome(0xc4ccd8));
  g.add(at(saddle, 0, 0.63, 0));
  return g;
}

function hoist(): THREE.Group {
  const g = new THREE.Group();
  const orange = M.painted(0xd1772f, 0.45);
  g.add(at(mesh(roundedBox(0.18, 2.3, 0.18, 0.03), orange), -0.7, 1.15, 0));
  g.add(at(mesh(roundedBox(0.2, 0.16, 1.9, 0.03), orange), -0.7, 0.08, 0));
  g.add(at(mesh(roundedBox(1.8, 0.18, 0.18, 0.03), orange), 0.15, 2.1, 0));
  // gusset
  const gus = mesh(box(0.5, 0.5, 0.12), orange);
  gus.rotation.z = Math.PI / 4;
  g.add(at(gus, -0.45, 1.85, 0));
  // chain + hook
  for (let i = 0; i < 7; i++) {
    const link = mesh(torus(0.038, 0.011, 6, 10), chrome(0x8f97a4));
    link.rotation.x = Math.PI / 2;
    link.rotation.z = i % 2 ? Math.PI / 2 : 0;
    g.add(at(link, 0.85, 1.98 - i * 0.07, 0));
  }
  const hook = mesh(torus(0.07, 0.018, 6, 12), chrome(0x8f97a4));
  g.add(at(hook, 0.85, 1.44, 0));
  return g;
}

function shelf(): THREE.Group {
  const g = new THREE.Group();
  const frame = M.painted(0x4a5160, 0.5);
  for (const x of [-0.9, 0.9])
    for (const z of [-0.4, 0.4]) g.add(at(mesh(roundedBox(0.08, 2.0, 0.08, 0.014), frame), x, 1.0, z));
  const r = rng(21);
  for (let i = 0; i < 3; i++) {
    g.add(at(mesh(box(1.9, 0.05, 0.9), M.steel(0x8d95a3, 0.55)), 0, 0.4 + i * 0.7, 0));
    const cols = [0xb5793c, 0x3f7d4f, 0x2f7fd1];
    for (let j = 0; j < 2; j++) {
      if (r() < 0.25) continue;
      const c = mesh(roundedBox(0.44, 0.38, 0.44, 0.02), M.cardboard(cols[(i + j) % 3]));
      g.add(at(c, -0.5 + j * 0.85, 0.4 + i * 0.7 + 0.22, r() * 0.1 - 0.05));
    }
  }
  return g;
}

function toolwall(): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(box(3.2, 2.0, 0.1), paint({ color: 0x2f3644, roughness: 0.8, surface: 'steel', repeat: [3, 2] })));
  // pegboard holes
  const holes = new THREE.InstancedMesh(circle(0.018, 6), M.plastic(0x14181f), 8 * 5);
  const m4 = new THREE.Matrix4();
  let n = 0;
  for (let ix = 0; ix < 8; ix++)
    for (let iy = 0; iy < 5; iy++)
      m4.makeTranslation(-1.4 + ix * 0.4, -0.8 + iy * 0.4, 0.052), holes.setMatrixAt(n++, m4);
  holes.instanceMatrix.needsUpdate = true;
  g.add(holes);
  const r = rng(5);
  const tools: [number, number][] = [
    [0.07, 0.42],
    [0.1, 0.55],
    [0.06, 0.36],
    [0.12, 0.48],
    [0.08, 0.6],
  ];
  const cols = [0xc8d0dc, 0xffcf3f, 0xd14b3a, 0x9aa0aa];
  tools.forEach(([w, h], i) => {
    const t = mesh(roundedBox(w, h, 0.05, 0.012), M.steel(cols[i % cols.length], 0.35));
    g.add(at(t, -1.2 + i * 0.6, 0.05 + r() * 0.2, 0.1));
  });
  return g;
}

function poster(symbol: boolean): THREE.Group {
  const g = new THREE.Group();
  const m = new THREE.Mesh(
    plane(1.3, 1.3),
    new THREE.MeshStandardMaterial({ map: posterTexture(symbol), roughness: 0.92, side: THREE.DoubleSide }),
  );
  m.receiveShadow = true;
  g.add(m);
  // A hair of relief so it isn't a decal floating on the wall.
  g.add(at(mesh(box(1.36, 1.36, 0.02), M.cardboard(0xd8d2c0), false), 0, 0, -0.012));
  return g;
}

function pipeRun(scale: number): THREE.Group {
  const g = new THREE.Group();
  const p = mesh(cyl(0.11, 0.11, 9 * scale, 12), M.steel(0x97a0ae, 0.45));
  p.rotation.x = Math.PI / 2;
  g.add(p);
  // flanges break the run up so it doesn't read as one long tube
  for (const z of [-3, 0, 3]) {
    const f = mesh(cyl(0.15, 0.15, 0.07, 12), M.darkSteel());
    f.rotation.x = Math.PI / 2;
    g.add(at(f, 0, 0, z * scale));
  }
  return g;
}

function trafficCone(): THREE.Group {
  const g = new THREE.Group();
  g.add(at(mesh(roundedBox(0.42, 0.05, 0.42, 0.02), M.plastic(0xe8631a)), 0, 0.025, 0));
  const body = mesh(
    lathe(
      'cone',
      [
        [0.2, 0],
        [0.17, 0.08],
        [0.12, 0.28],
        [0.06, 0.5],
        [0.05, 0.56],
        [0, 0.56],
      ],
      14,
    ),
    M.plastic(0xf2691c),
  );
  g.add(at(body, 0, 0.05, 0));
  const band = mesh(cyl(0.104, 0.125, 0.1, 14, true), M.glow(0xf2f4f8, 0.12));
  g.add(at(band, 0, 0.38, 0));
  return g;
}

function workbench(): THREE.Group {
  const g = new THREE.Group();
  g.add(at(mesh(roundedBox(2.4, 0.1, 0.9, 0.02), M.wood(0xb08858)), 0, 0.9, 0));
  g.add(at(mesh(box(2.42, 0.03, 0.92), M.steel(0x8d95a3, 0.4)), 0, 0.955, 0));
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) g.add(at(mesh(roundedBox(0.08, 0.88, 0.08, 0.014), M.painted(0x39404d)), sx * 1.05, 0.44, sz * 0.35));
  g.add(at(mesh(box(2.2, 0.06, 0.68), M.painted(0x39404d)), 0, 0.3, 0));
  // pegboard back
  g.add(at(mesh(box(2.2, 1.0, 0.05), paint({ color: 0x2f3644, roughness: 0.8 })), 0, 1.5, -0.42));
  const cols = [0xc8d0dc, 0xffcf3f, 0xd14b3a];
  const r = rng(11);
  for (let i = 0; i < 4; i++)
    g.add(at(mesh(roundedBox(0.06, 0.36 + r() * 0.18, 0.04, 0.012), M.steel(cols[i % 3], 0.35)), -0.8 + i * 0.5, 1.48, -0.37));
  // vice
  const v = new THREE.Group();
  v.add(mesh(roundedBox(0.28, 0.2, 0.18, 0.02), M.painted(0x2f5fb0, 0.4)));
  v.add(at(mesh(cyl(0.02, 0.02, 0.26, 8), chrome()), 0, 0.02, 0.16));
  g.add(at(v, 0.85, 1.06, 0.18));
  return g;
}

function toolchest(color: number): THREE.Group {
  const g = new THREE.Group();
  g.add(at(mesh(roundedBox(1.1, 1.0, 0.6, 0.035), M.painted(color, 0.42)), 0, 0.56, 0));
  g.add(at(mesh(roundedBox(1.16, 0.06, 0.66, 0.02), M.darkSteel()), 0, 1.09, 0));
  for (let i = 0; i < 4; i++) {
    g.add(at(mesh(box(1.04, 0.015, 0.02), paint({ color: 0x14171d })), 0, 0.28 + i * 0.2, 0.3));
    const h = mesh(capsule(0.014, 0.26, 3, 6), chrome(0xdfe3ea));
    h.rotation.z = Math.PI / 2;
    g.add(at(h, 0, 0.36 + i * 0.2, 0.32));
  }
  for (const sx of [-1, 1]) {
    const w = mesh(cyl(0.09, 0.09, 0.07, 12), M.rubber());
    w.rotation.z = Math.PI / 2;
    g.add(at(w, sx * 0.45, 0.07, 0.2));
  }
  return g;
}

function lockers(): THREE.Group {
  const g = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const x = -0.62 + i * 0.62;
    g.add(at(mesh(roundedBox(0.6, 2.0, 0.5, 0.02), M.painted(0x46586b, 0.5)), x, 1.0, 0));
    g.add(at(mesh(box(0.5, 0.04, 0.02), paint({ color: 0x1d232c })), x, 1.02, 0.26));
    for (let v = 0; v < 4; v++)
      g.add(at(mesh(box(0.34, 0.016, 0.012), paint({ color: 0x232a34 })), x, 1.72 - v * 0.06, 0.26));
    g.add(at(mesh(capsule(0.014, 0.13, 3, 6), chrome(0xc9d0da)), x + 0.22, 1.0, 0.27));
  }
  g.add(at(mesh(box(1.92, 0.06, 0.54), M.painted(0x3a4959, 0.5)), 0, 2.03, 0));
  return g;
}

function compressor(): THREE.Group {
  const g = new THREE.Group();
  const tank = mesh(capsule(0.38, 0.9, 6, 16), M.painted(0xc4433a, 0.42));
  tank.rotation.z = Math.PI / 2;
  g.add(at(tank, 0, 0.52, 0));
  g.add(at(mesh(roundedBox(0.5, 0.4, 0.46, 0.03), M.darkSteel()), 0, 1.0, 0));
  g.add(at(mesh(cyl(0.16, 0.16, 0.2, 12), M.steel(0x8d95a3, 0.4)), 0.22, 1.14, 0));
  // gauge cluster
  g.add(at(mesh(cyl(0.07, 0.07, 0.03, 12), M.glow(0xe8e0c4, 0.25)), -0.2, 1.16, 0.2));
  for (const sx of [-1, 1]) {
    const w = mesh(cyl(0.12, 0.12, 0.08, 12), M.rubber());
    w.rotation.x = Math.PI / 2;
    g.add(at(w, sx * 0.48, 0.12, 0.46));
  }
  return g;
}

function crateStack(): THREE.Group {
  const g = new THREE.Group();
  const r = rng(31);
  const cols = [0xb5793c, 0x9c6a34, 0xa87340];
  for (let i = 0; i < 3; i++) {
    const sz = 0.74 - i * 0.07;
    const c = mesh(roundedBox(sz, 0.58, sz, 0.02), M.cardboard(cols[i % 3]));
    c.rotation.y = (r() - 0.5) * 0.4;
    g.add(at(c, (r() - 0.5) * 0.08, 0.29 + i * 0.6, (r() - 0.5) * 0.08));
    // strapping
    const strap = mesh(box(sz * 1.02, 0.03, 0.012), paint({ color: 0x2a2f38 }));
    strap.rotation.y = c.rotation.y;
    g.add(at(strap, c.position.x, 0.29 + i * 0.6, c.position.z + sz / 2));
  }
  return g;
}

function fireExt(): THREE.Group {
  const g = new THREE.Group();
  const body = mesh(
    lathe(
      'fx',
      [
        [0, 0],
        [0.14, 0.02],
        [0.15, 0.1],
        [0.15, 0.52],
        [0.11, 0.6],
        [0.05, 0.64],
        [0.045, 0.7],
        [0, 0.7],
      ],
      14,
    ),
    M.painted(0xc0231f, 0.35),
  );
  g.add(at(body, 0, 0.16, 0));
  g.add(at(mesh(cyl(0.05, 0.05, 0.1, 10), M.darkSteel()), 0, 0.9, 0));
  const horn = mesh(cyl(0.02, 0.06, 0.16, 8), paint({ color: 0x14171d }));
  horn.rotation.z = -0.7;
  g.add(at(horn, 0.13, 0.76, 0));
  g.add(at(mesh(box(0.05, 0.28, 0.2), M.darkSteel()), -0.14, 0.5, 0));
  return g;
}

function jerrycan(color: number): THREE.Group {
  const g = new THREE.Group();
  g.add(at(mesh(roundedBox(0.3, 0.44, 0.17, 0.03), M.painted(color, 0.5)), 0, 0.23, 0));
  for (const sx of [-1, 1]) g.add(at(mesh(box(0.015, 0.34, 0.13), M.painted(color, 0.5)), sx * 0.1, 0.23, 0.09));
  g.add(at(mesh(cyl(0.04, 0.045, 0.06, 8), M.darkSteel()), 0.1, 0.47, 0));
  const h = mesh(roundedBox(0.16, 0.035, 0.05, 0.014), M.darkSteel());
  g.add(at(h, -0.02, 0.48, 0));
  return g;
}

function weldBot(): THREE.Group {
  const g = new THREE.Group();
  const yellow = M.painted(0xe8a020, 0.45);
  g.add(at(mesh(cyl(0.42, 0.5, 0.36, 14), M.darkSteel()), 0, 0.18, 0));
  g.add(at(mesh(roundedBox(0.32, 0.95, 0.32, 0.03), yellow), 0, 0.76, 0));
  const arm = new THREE.Group();
  arm.name = 'arm';
  arm.position.set(0, 1.18, 0);
  arm.add(at(mesh(roundedBox(0.95, 0.16, 0.16, 0.03), yellow), 0.42, 0, 0));
  arm.add(at(mesh(cyl(0.11, 0.11, 0.2, 12), M.darkSteel()), 0, 0, 0));
  arm.add(at(mesh(roundedBox(0.14, 0.6, 0.14, 0.025), M.darkSteel()), 0.85, -0.3, 0));
  arm.add(at(mesh(cyl(0.03, 0.055, 0.24, 8), chrome(0x8f97a4)), 0.85, -0.66, 0));
  g.add(arm);
  // workpiece on a stand
  g.add(at(mesh(roundedBox(0.1, 0.85, 0.1, 0.02), M.darkSteel()), 0, 0.42, 1.3));
  g.add(at(mesh(roundedBox(1.3, 0.08, 0.85, 0.02), M.steel(0x7f8794, 0.5)), 0, 0.87, 1.3));
  // safety screen
  const screen = mesh(plane(1.6, 1.4), paint({ color: 0x2a1416, transparent: true, opacity: 0.5, side: THREE.DoubleSide }));
  g.add(at(screen, 0, 1.1, 2.1));
  return g;
}

function lift(): THREE.Group {
  const g = new THREE.Group();
  g.add(at(mesh(roundedBox(2.6, 0.14, 3.4, 0.03), M.darkSteel()), 0, 0.07, 0));
  const stripe = mesh(plane(2.6, 3.4), M.glow(0xffcf3f, 0.18));
  stripe.rotation.x = -Math.PI / 2;
  g.add(at(stripe, 0, 0.145, 0));
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      g.add(at(mesh(cyl(0.1, 0.13, 0.5, 10), M.steel(0x7f8794, 0.45)), sx * 1.1, 0.25, sz * 1.5));
      g.add(at(mesh(cyl(0.14, 0.14, 0.06, 10), M.painted(0xe8a020)), sx * 1.1, 0.53, sz * 1.5));
    }
  return g;
}

function paintStation(): THREE.Group {
  const g = new THREE.Group();
  g.add(at(mesh(roundedBox(1.0, 1.2, 0.7, 0.04), M.painted(0x3b4452, 0.5)), 0, 0.6, 0));
  const screen = mesh(plane(0.68, 0.38), M.glow(0x2f7fd1, 1.6));
  g.add(at(screen, 0, 0.9, 0.36));
  g.add(at(mesh(roundedBox(0.74, 0.44, 0.03, 0.01), M.darkSteel()), 0, 0.9, 0.345));
  const cols = [0xe5484d, 0x2f7fd1, 0x39b36b, 0xf1c40f];
  cols.forEach((c, i) => {
    g.add(at(mesh(cyl(0.085, 0.085, 0.26, 12), M.painted(c, 0.35)), -0.33 + i * 0.22, 1.33, 0));
    g.add(at(mesh(cyl(0.087, 0.087, 0.04, 12), chrome(0xc9d0da)), -0.33 + i * 0.22, 1.47, 0));
  });
  // hose coil
  const hose = mesh(torus(0.16, 0.02, 6, 18), M.rubber(0x2a2f38));
  hose.rotation.x = Math.PI / 2;
  g.add(at(hose, 0.42, 0.42, 0.38));
  return g;
}

function ceilingFan(): THREE.Group {
  const g = new THREE.Group();
  g.add(at(mesh(cyl(0.035, 0.035, 0.5, 8), M.darkSteel()), 0, 0.25, 0));
  g.add(mesh(cyl(0.17, 0.2, 0.18, 12), M.darkSteel()));
  const blades = new THREE.Group();
  blades.name = 'spin';
  for (let i = 0; i < 4; i++) {
    const b = mesh(roundedBox(0.9, 0.03, 0.24, 0.012), M.steel(0x9aa2b0, 0.5));
    b.rotation.set(0.14, (i / 4) * Math.PI * 2, 0);
    b.position.set(Math.sin((i / 4) * Math.PI * 2) * 0.5, 0, Math.cos((i / 4) * Math.PI * 2) * 0.5);
    blades.add(b);
  }
  blades.position.y = -0.09;
  g.add(blades);
  // cage
  const ring = mesh(torus(0.62, 0.012, 5, 24), M.darkSteel(), false);
  ring.rotation.x = Math.PI / 2;
  g.add(at(ring, 0, -0.14, 0));
  return g;
}

function hangLamp(): THREE.Group {
  const g = new THREE.Group();
  g.add(at(mesh(cyl(0.012, 0.012, 0.75, 6), paint({ color: 0x14171d }), false), 0, 0.55, 0));
  const shade = mesh(
    lathe(
      'shade',
      [
        [0.05, 0.24],
        [0.16, 0.14],
        [0.3, 0.0],
        [0.31, -0.02],
      ],
      16,
    ),
    paint({ color: 0x2b313b, metalness: 0.6, roughness: 0.4, side: THREE.DoubleSide }),
  );
  g.add(at(shade, 0, 0.06, 0));
  // Inner surface is bright so the shade reads as lit from within.
  const inner = mesh(circle(0.28, 16), M.glow(0xfff0cc, 2.2), false, false);
  inner.rotation.x = Math.PI / 2;
  g.add(at(inner, 0, 0.02, 0));
  g.add(at(mesh(sphere(0.075, 10, 8), M.glow(0xfff4d4, 3.0), false, false), 0, -0.01, 0));
  return g;
}

/** Industrial linear fixture: reflector housing + a bright diffuser panel. */
function ceilingLight(): THREE.Group {
  const g = new THREE.Group();
  g.add(at(mesh(roundedBox(2.5, 0.13, 0.62, 0.03), M.steel(0xbec6d2, 0.45)), 0, 0.02, 0));
  // Angled reflector wings bounce the emissive panel and give it real form.
  for (const sx of [-1, 1]) {
    const wing = mesh(box(2.5, 0.02, 0.26), M.steel(0xe4e9f0, 0.3));
    wing.rotation.x = sx * 0.55;
    g.add(at(wing, 0, -0.04, sx * 0.34));
  }
  const tube = mesh(box(2.3, 0.06, 0.34), M.glow(0xfff6e2, 3.2), false, false);
  g.add(at(tube, 0, -0.08, 0));
  // hanger rods
  for (const sx of [-1, 1]) g.add(at(mesh(cyl(0.012, 0.012, 0.34, 5), M.darkSteel(), false), sx * 1.0, 0.2, 0));
  return g;
}

function gauge(): THREE.Group {
  const g = new THREE.Group();
  const face = mesh(cyl(0.28, 0.28, 0.05, 20), M.glow(0xe8e0c4, 0.14));
  face.rotation.x = Math.PI / 2;
  g.add(face);
  const ring = mesh(torus(0.29, 0.03, 8, 22), M.darkSteel());
  g.add(ring);
  const needle = mesh(box(0.018, 0.22, 0.012), paint({ color: 0xd14b3a, emissive: 0x3a0e08, emissiveIntensity: 0.4 }), false);
  needle.name = 'needle';
  g.add(at(needle, 0, 0.08, 0.045));
  g.add(at(mesh(cyl(0.025, 0.025, 0.02, 8), M.darkSteel(), false), 0, 0, 0.05));
  return g;
}

function cables(scale: number): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(roundedBox(0.08, 0.08, 4 * scale, 0.015), M.darkSteel()));
  // sagging catenary loops between clips
  for (let i = 0; i < 3; i++) {
    const pts: THREE.Vector3[] = [];
    const z0 = -1.4 * scale + i * 1.4 * scale;
    for (let t = 0; t <= 8; t++) {
      const u = t / 8;
      pts.push(new THREE.Vector3(0, -Math.sin(u * Math.PI) * 0.24, z0 + u * 1.3 * scale));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    g.add(mesh(new THREE.TubeGeometry(curve, 12, 0.016, 5, false), M.rubber(0x14171d), false));
  }
  return g;
}

function sign(): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(roundedBox(1.6, 0.5, 0.08, 0.02), paint({ color: 0x08110d })));
  g.add(at(mesh(box(1.34, 0.16, 0.03), M.glow(0x2fe08a, 2.6)), 0, 0.05, 0.05));
  g.add(at(mesh(box(0.9, 0.05, 0.03), M.glow(0x2fe08a, 2.6)), -0.2, -0.12, 0.05));
  return g;
}

function banner(): THREE.Group {
  const g = new THREE.Group();
  const rod = mesh(cyl(0.035, 0.035, 4.2, 8), chrome(0x9aa2b0));
  rod.rotation.z = Math.PI / 2;
  g.add(at(rod, 0, 0.55, 0));
  // Segmented cloth so it can actually ripple rather than tilt as one plate.
  const cloth = new THREE.Group();
  cloth.name = 'wave';
  for (let i = 0; i < 8; i++) {
    const seg = mesh(plane(0.5, 1.0), paint({ color: 0x2f5fb0, roughness: 0.85, side: THREE.DoubleSide }), false);
    seg.name = 'seg' + i;
    cloth.add(at(seg, -1.75 + i * 0.5, -0.5, 0));
  }
  for (let i = 0; i < 8; i++) {
    const stripe = mesh(plane(0.5, 0.15), paint({ color: 0xffcf3f, side: THREE.DoubleSide }), false);
    cloth.children[i].add(at(stripe, 0, 0.12, 0.006));
  }
  g.add(at(cloth, 0, 0.5, 0));
  return g;
}

function oilStain(): THREE.Mesh {
  const m = mesh(
    circle(0.9, 20),
    paint({ color: 0x0a0c10, metalness: 0.55, roughness: 0.2, transparent: true, opacity: 0.8 }),
    false,
    true,
  );
  m.rotation.x = -Math.PI / 2;
  (m.material as THREE.Material).polygonOffset = true;
  (m.material as THREE.Material).polygonOffsetFactor = -2;
  return m;
}

function tireMark(): THREE.Group {
  const g = new THREE.Group();
  for (const sx of [-1, 1]) {
    const s = mesh(
      plane(0.26, 3.5),
      paint({ color: 0x141518, roughness: 0.55, transparent: true, opacity: 0.5 }),
      false,
      true,
    );
    (s.material as THREE.Material).polygonOffset = true;
    (s.material as THREE.Material).polygonOffsetFactor = -2;
    s.rotation.x = -Math.PI / 2;
    g.add(at(s, sx * 0.5, 0, 0));
  }
  return g;
}

function parkingLines(): THREE.Group {
  const g = new THREE.Group();
  const m = M.glow(0xffcf3f, 0.2);
  const w = 3.6;
  const d = 4.8;
  const t = 0.13;
  const mk = (sx: number, sz: number, lx: number, lz: number) => {
    const bar = mesh(box(sx, 0.02, sz), m, false, true);
    (bar.material as THREE.Material).polygonOffset = true;
    (bar.material as THREE.Material).polygonOffsetFactor = -2;
    g.add(at(bar, lx, 0.015, lz));
  };
  mk(w, t, 0, -d / 2);
  mk(w, t, 0, d / 2);
  mk(t, d, -w / 2, 0);
  mk(t, d, w / 2, 0);
  return g;
}

// --- exterior ---------------------------------------------------------------

function van(color: number): THREE.Group {
  const g = new THREE.Group();
  const paintMat = paint({ color, metalness: 0.45, roughness: 0.35 });
  g.add(at(mesh(roundedBox(2.1, 1.5, 4.2, 0.16), paintMat), 0, 1.15, 0));
  g.add(at(mesh(roundedBox(2.0, 0.95, 1.3, 0.18), paintMat), 0, 0.88, -1.75));
  // glass
  g.add(at(mesh(roundedBox(1.82, 0.6, 0.06, 0.02), glass(0x1a2733, 0.7)), 0, 1.06, -2.36));
  for (const sx of [-1, 1]) g.add(at(mesh(roundedBox(0.05, 0.5, 0.7, 0.02), glass(0x1a2733, 0.7)), sx * 1.02, 1.06, -1.6));
  g.add(at(mesh(roundedBox(0.42, 0.16, 0.42, 0.04), M.glow(0xffb020, 1.6)), 0, 1.96, -1.4));
  g.add(at(mesh(roundedBox(2.0, 0.16, 0.2, 0.04), M.darkSteel()), 0, 0.5, -2.2));
  for (const sx of [-1, 1])
    for (const sz of [-1.3, 1.3]) {
      const w = mesh(tyre(0.44, 0.28), M.tyre());
      g.add(at(w, sx * 1.03, 0.45, sz));
      const rim = mesh(cyl(0.24, 0.24, 0.3, 10), chrome(0xb9c0cc));
      rim.rotation.z = Math.PI / 2;
      g.add(at(rim, sx * 1.04, 0.45, sz));
    }
  return g;
}

function yardLight(): THREE.Group {
  const g = new THREE.Group();
  g.add(at(mesh(cyl(0.09, 0.13, 4.2, 8), M.painted(0x3c424d, 0.6)), 0, 2.1, 0));
  const armCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 4.1, 0),
    new THREE.Vector3(0, 4.35, 0.25),
    new THREE.Vector3(0, 4.3, 0.6),
  ]);
  g.add(mesh(new THREE.TubeGeometry(armCurve, 8, 0.05, 6, false), M.painted(0x3c424d, 0.6)));
  g.add(at(mesh(roundedBox(0.55, 0.16, 0.4, 0.05), M.darkSteel()), 0, 4.32, 0.6));
  g.add(at(mesh(plane(0.48, 0.34), M.glow(0xffe6a0, 1.8), false, false), 0, 4.23, 0.6));
  const lamp = new THREE.PointLight(0xffe6b0, 10, 14, 2);
  g.add(at(lamp, 0, 4.1, 0.6));
  return g;
}

function tree(): THREE.Group {
  const g = new THREE.Group();
  const r = rng(13);
  g.add(at(mesh(cyl(0.16, 0.3, 1.7, 8), paint({ color: 0x5a3f28, roughness: 0.95 })), 0, 0.85, 0));
  // Overlapping, jittered canopy blobs read far better than stacked cones.
  for (let i = 0; i < 4; i++) {
    const rad = 1.45 - i * 0.3;
    const c = mesh(
      sphere(rad, 9, 7),
      paint({ color: i % 2 ? 0x386f3f : 0x2f6136, roughness: 1, flatShading: true }),
    );
    c.scale.set(1, 0.78, 1);
    g.add(at(c, (r() - 0.5) * 0.4, 1.7 + i * 0.72, (r() - 0.5) * 0.4));
  }
  return g;
}

function powerpole(): THREE.Group {
  const g = new THREE.Group();
  g.add(at(mesh(cyl(0.11, 0.16, 6, 8), paint({ color: 0x4a3f30, roughness: 0.95 })), 0, 3, 0));
  g.add(at(mesh(roundedBox(1.7, 0.12, 0.12, 0.02), paint({ color: 0x4a3f30, roughness: 0.95 })), 0, 5.4, 0));
  g.add(at(mesh(roundedBox(1.2, 0.1, 0.1, 0.02), paint({ color: 0x4a3f30, roughness: 0.95 })), 0, 5.0, 0));
  for (const sx of [-1, 1]) {
    g.add(at(mesh(cyl(0.045, 0.05, 0.13, 6), M.glow(0x6fa8c8, 0.1)), sx * 0.72, 5.53, 0));
    g.add(at(mesh(cyl(0.04, 0.045, 0.11, 6), M.glow(0x6fa8c8, 0.1)), sx * 0.5, 5.12, 0));
  }
  return g;
}

function cloud(): THREE.Group {
  const g = new THREE.Group();
  const m = paint({ color: 0xf6f9ff, roughness: 1, emissive: 0xdae4f4, emissiveIntensity: 0.22 });
  const r = rng(3);
  for (const [dx, dy, dz, rad] of [
    [0, 0, 0, 2.3],
    [1.9, 0.25, 0.2, 1.7],
    [-1.9, 0.1, 0.3, 1.75],
    [0.7, 0.85, -0.4, 1.45],
    [-0.9, 0.7, 0.5, 1.3],
  ]) {
    const s = mesh(sphere(rad as number, 10, 8), m, false, false);
    s.scale.set(1, 0.58 + r() * 0.12, 1);
    g.add(at(s, dx as number, dy as number, dz as number));
  }
  return g;
}

function bird(): THREE.Group {
  const g = new THREE.Group();
  const m = paint({ color: 0x2a2f38, roughness: 0.9 });
  g.add(mesh(capsule(0.05, 0.16, 3, 6), m, false, false));
  const wing = new THREE.Group();
  wing.name = 'wing';
  for (const sx of [-1, 1]) {
    const w = mesh(box(0.5, 0.02, 0.17), m, false, false);
    wing.add(at(w, sx * 0.3, 0, 0));
  }
  g.add(wing);
  g.scale.setScalar(1.3);
  return g;
}

function roadline(): THREE.Group {
  const g = new THREE.Group();
  for (let i = 0; i < 9; i++) {
    const d = mesh(plane(0.4, 2.2), paint({ color: 0xd8c060, roughness: 0.8 }), false, true);
    d.rotation.x = -Math.PI / 2;
    g.add(at(d, 0, 0, -16 + i * 4));
  }
  return g;
}

/** Distant massif: overlapping jittered peaks with snow caps, not one cone. */
function silhouette(color: number): THREE.Group {
  const g = new THREE.Group();
  const rock = paint({ color, roughness: 1, flatShading: true });
  const snow = paint({ color: 0xdfe8f4, roughness: 0.95, flatShading: true });
  const r = rng(97);
  const peaks: [number, number, number, number][] = [
    [0, 0, 1.0, 1.0],
    [-30, -14, 0.62, 0.7],
    [26, -20, 0.72, 0.78],
    [-52, -34, 0.44, 0.5],
    [50, -30, 0.5, 0.56],
  ];
  for (const [dx, dz, hs, rs] of peaks) {
    const h = 17 * hs;
    const rad = 25 * rs;
    const geo = cone(rad, h, 6).clone();
    geo.translate(0, h / 2, 0);
    // squash and skew each peak so no two silhouettes repeat
    const p = new THREE.Mesh(geo, rock);
    p.scale.set(1 + (r() - 0.5) * 0.35, 1 + (r() - 0.5) * 0.25, 0.75 + r() * 0.4);
    p.rotation.y = r() * Math.PI;
    p.position.set(dx, 0, dz);
    p.castShadow = false;
    p.receiveShadow = false;
    g.add(p);

    if (hs > 0.55) {
      const capH = h * 0.3;
      const capGeo = cone(rad * 0.3, capH, 6).clone();
      capGeo.translate(0, capH / 2, 0);
      const cap = new THREE.Mesh(capGeo, snow);
      cap.scale.copy(p.scale);
      cap.rotation.y = p.rotation.y;
      cap.position.set(dx, h - capH * 0.95, dz);
      cap.castShadow = false;
      cap.receiveShadow = false;
      g.add(cap);
    }
  }
  return g;
}

function fenceSection(): THREE.Group {
  const g = new THREE.Group();
  g.add(at(mesh(cyl(0.05, 0.055, 1.5, 6), M.painted(0x6a7180, 0.6)), 0, 0.75, 0));
  for (const y of [0.5, 1.15]) g.add(at(mesh(box(3.0, 0.05, 0.04), M.painted(0x6a7180, 0.6)), 1.5, y, 0));
  return g;
}

// --- mountain kit -----------------------------------------------------------

/** Conifer: a tapered stack of drooping skirts, not a cone. */
function pine(): THREE.Group {
  const g = new THREE.Group();
  const r = rng(53);
  const needles = paint({ color: 0x2c5b34, roughness: 1, flatShading: true });
  const dark = paint({ color: 0x24492b, roughness: 1, flatShading: true });
  g.add(at(mesh(cyl(0.11, 0.22, 2.2, 6), paint({ color: 0x4c3626, roughness: 0.95 })), 0, 1.1, 0));
  const tiers = 5;
  for (let i = 0; i < tiers; i++) {
    const u = i / tiers;
    const rad = 1.5 * (1 - u * 0.72);
    const h = 1.5 - u * 0.5;
    const c = mesh(cone(rad, h, 7), i % 2 ? needles : dark);
    c.rotation.y = r() * Math.PI;
    g.add(at(c, (r() - 0.5) * 0.14, 1.5 + i * 1.02, (r() - 0.5) * 0.14));
  }
  return g;
}

function boulder(): THREE.Mesh {
  // A low-poly sphere with jittered vertices reads as rock far better than a box.
  const geo = sphere(0.9, 7, 5).clone();
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const r = rng(29);
  for (let i = 0; i < pos.count; i++) {
    const k = 0.72 + r() * 0.5;
    pos.setXYZ(i, pos.getX(i) * k * 1.15, pos.getY(i) * k * 0.78, pos.getZ(i) * k);
  }
  geo.computeVertexNormals();
  const m = mesh(geo, paint({ color: 0x6f6b62, roughness: 0.96, flatShading: true }));
  m.position.y = 0.42;
  return m;
}

function rockSpire(): THREE.Group {
  const g = new THREE.Group();
  const r = rng(71);
  const rock = paint({ color: 0x6a655c, roughness: 0.96, flatShading: true });
  for (let i = 0; i < 3; i++) {
    const h = 4 + r() * 5;
    const c = mesh(cone(1.1 + r() * 0.7, h, 5), rock);
    c.rotation.set((r() - 0.5) * 0.2, r() * Math.PI, (r() - 0.5) * 0.2);
    g.add(at(c, (r() - 0.5) * 2.4, h / 2 - 0.4, (r() - 0.5) * 2.4));
  }
  return g;
}

function guardrail(): THREE.Group {
  const g = new THREE.Group();
  g.add(at(mesh(roundedBox(0.14, 0.9, 0.14, 0.02), M.darkSteel(0x4a4f58)), 0, 0.45, 0));
  const beam = mesh(roundedBox(3.1, 0.28, 0.08, 0.03), M.steel(0xa8b0bd, 0.5));
  g.add(at(beam, 0, 0.78, 0.08));
  // reflector
  g.add(at(mesh(box(0.1, 0.1, 0.02), M.glow(0xff5d3a, 1.4)), 0, 0.78, 0.13));
  return g;
}

function campfire(): THREE.Group {
  const g = new THREE.Group();
  const r = rng(17);
  const stoneMat = paint({ color: 0x6f6b62, roughness: 0.95, flatShading: true });
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const s = mesh(sphere(0.2 + r() * 0.1, 5, 4), stoneMat);
    s.scale.y = 0.7;
    g.add(at(s, Math.cos(a) * 0.85, 0.1, Math.sin(a) * 0.85));
  }
  // Logs leaned into a tepee: short and tight, not long spokes on the ground.
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const log = mesh(cyl(0.06, 0.08, 0.8, 6), paint({ color: 0x3a2a1c, roughness: 0.95 }));
    log.rotation.set(0.55, a, 0);
    g.add(at(log, Math.cos(a) * 0.16, 0.3, Math.sin(a) * 0.16));
  }
  const flame = new THREE.Group();
  flame.name = 'flame';
  for (let i = 0; i < 3; i++) {
    const f = mesh(cone(0.2 - i * 0.05, 0.42 + i * 0.16, 6), M.glow(i === 0 ? 0xffb020 : 0xff7a1a, 0.85), false);
    f.name = 'lick' + i;
    flame.add(at(f, 0, 0.42 + i * 0.12, 0));
  }
  g.add(flame);
  const light = new THREE.PointLight(0xff9a3c, 7, 9, 2);
  light.name = 'fireLight';
  g.add(at(light, 0, 0.9, 0));
  return g;
}

function signpost(): THREE.Group {
  const g = new THREE.Group();
  g.add(at(mesh(cyl(0.07, 0.08, 2.4, 6), paint({ color: 0x4c3626, roughness: 0.95 })), 0, 1.2, 0));
  for (let i = 0; i < 2; i++) {
    const board = mesh(roundedBox(1.5, 0.3, 0.06, 0.02), M.wood(0xb59060));
    board.rotation.y = i * 0.5 - 0.25;
    g.add(at(board, 0.5, 2.0 - i * 0.42, 0));
  }
  return g;
}

/**
 * Everything that turns the cabin's collision boxes into a building: a pitched
 * roof over the flat slab, a door, lit windows, and deck clutter.
 */
function cabinDeco(): THREE.Group {
  const g = new THREE.Group();

  // Pitched roof over the flat roof slab (top at y ≈ 3.15). Each panel spans
  // ridge → eave exactly once; making them double length splayed them open.
  const roofMat = paint({ color: 0x54402c, roughness: 0.9, metalness: 0.05 });
  const halfW = 3.3;
  const rise = 1.35;
  const pitch = Math.atan2(rise, halfW);
  const slope = Math.hypot(halfW, rise);
  const eaveY = 3.25;
  for (const sx of [-1, 1]) {
    const panel = mesh(box(slope, 0.16, 5.5), roofMat);
    panel.rotation.z = -sx * pitch;
    g.add(at(panel, (sx * halfW) / 2, eaveY + rise / 2, -0.6));
  }
  g.add(at(mesh(roundedBox(0.34, 0.2, 5.7, 0.07), M.darkSteel(0x3a2c1e)), 0, eaveY + rise + 0.06, -0.6));
  // gable ends: a flat triangle closing each end of the roof
  const gableShape: [number, number][] = [
    [-halfW, 0],
    [halfW, 0],
    [0, rise],
  ];
  for (const sz of [-1, 1]) {
    const gable = mesh(extrude('cabinGable', gableShape, 0.14, 0), roofMat);
    g.add(at(gable, 0, eaveY + rise / 2, -0.6 + sz * 2.72));
  }
  // chimney
  g.add(at(mesh(roundedBox(0.5, 1.5, 0.5, 0.05), paint({ color: 0x5d5750, roughness: 0.95 })), 1.7, 4.2, -1.8));

  // door + lit windows on the face that looks at the road
  g.add(at(mesh(roundedBox(0.9, 1.9, 0.08, 0.03), M.wood(0x6a4a2c)), 0, 1.25, 1.46));
  g.add(at(mesh(cyl(0.05, 0.05, 0.1, 8), chrome(0xc9a24a)), 0.32, 1.2, 1.53));
  for (const sx of [-1.7, 1.7]) {
    g.add(at(mesh(roundedBox(0.9, 0.8, 0.1, 0.03), M.wood(0x4e3722)), sx, 1.7, 1.46));
    g.add(at(mesh(box(0.72, 0.62, 0.04), M.glow(0xffd08a, 1.5)), sx, 1.7, 1.52));
    g.add(at(mesh(box(0.06, 0.62, 0.06), M.wood(0x4e3722)), sx, 1.7, 1.55));
  }

  g.add(at(mesh(roundedBox(0.7, 0.7, 0.7, 0.05), M.cardboard(0x9c6a34)), -2.2, 0.5, 2.0));
  g.add(at(mesh(roundedBox(1.4, 0.1, 0.5, 0.02), M.wood(0xa8834f)), 1.8, 0.62, 1.9));
  for (const sx of [-1, 1]) g.add(at(mesh(roundedBox(0.09, 0.5, 0.09, 0.02), M.wood(0x7d5836)), 1.8 + sx * 0.55, 0.32, 1.9));
  // stacked firewood
  for (let i = 0; i < 6; i++) {
    const log = mesh(cyl(0.09, 0.09, 1.1, 6), paint({ color: 0x59422c, roughness: 0.95 }));
    log.rotation.z = Math.PI / 2;
    g.add(at(log, 2.4, 0.12 + Math.floor(i / 3) * 0.2, -1.4 + (i % 3) * 0.2));
  }
  // lantern by the door
  g.add(at(mesh(roundedBox(0.2, 0.28, 0.2, 0.04), M.glow(0xffce7a, 2.0)), 0, 1.9, 1.6));
  return g;
}

function snowPatch(): THREE.Mesh {
  const geo = circle(1.6, 9).clone();
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const r = rng(41);
  for (let i = 1; i < pos.count; i++) {
    const k = 0.6 + r() * 0.7;
    pos.setXYZ(i, pos.getX(i) * k, pos.getY(i) * k, 0);
  }
  geo.computeVertexNormals();
  const m = mesh(geo, paint({ color: 0xe8eef8, roughness: 0.85 }), false, true);
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.06;
  (m.material as THREE.Material).polygonOffset = true;
  (m.material as THREE.Material).polygonOffsetFactor = -2;
  return m;
}

function shrub(): THREE.Group {
  const g = new THREE.Group();
  const r = rng(83);
  const m = paint({ color: 0x4a6b34, roughness: 1, flatShading: true });
  for (let i = 0; i < 3; i++) {
    const s = mesh(sphere(0.34 + r() * 0.2, 6, 4), m);
    s.scale.y = 0.7;
    g.add(at(s, (r() - 0.5) * 0.5, 0.26 + r() * 0.12, (r() - 0.5) * 0.5));
  }
  return g;
}

function caveMouth(): THREE.Group {
  const g = new THREE.Group();
  const rock = paint({ color: 0x59544c, roughness: 0.97, flatShading: true });
  // an arch of jittered blocks around a black opening
  const r = rng(61);
  for (let i = 0; i <= 10; i++) {
    const a = Math.PI * (i / 10);
    const b = mesh(sphere(0.9 + r() * 0.5, 6, 4), rock);
    b.scale.set(1, 0.8, 0.9);
    g.add(at(b, Math.cos(a) * 3.0, Math.sin(a) * 3.2, 4.4));
  }
  const dark = mesh(plane(4.6, 3.2), paint({ color: 0x05070a, roughness: 1 }), false, false);
  g.add(at(dark, 0, 1.6, 4.3));
  // the door panel you reroute — the mystery symbol glows faintly on it
  const panel = mesh(roundedBox(0.9, 1.2, 0.14, 0.03), M.darkSteel(0x232a33));
  g.add(at(panel, 2.6, 1.1, 4.6));
  g.add(at(mesh(circle(0.26, 16), M.glow(0x5fd9c8, 1.8), false, false), 2.6, 1.25, 4.69));
  return g;
}

/** A previous team's 4×4, half over the edge. The first real "we're not first". */
function wreck(): THREE.Group {
  const g = new THREE.Group();
  const rust = paint({ color: 0x6b4a35, roughness: 0.95, metalness: 0.25 });
  const body = mesh(roundedBox(1.9, 1.0, 4.0, 0.16), rust);
  g.add(at(body, 0, 0.85, 0));
  g.add(at(mesh(roundedBox(1.7, 0.7, 1.4, 0.14), rust), 0, 1.5, -0.4));
  for (const sx of [-1, 1])
    for (const sz of [-1.3, 1.2]) {
      if (sx > 0 && sz > 0) continue; // one wheel is long gone
      const w = mesh(tyre(0.42, 0.3), M.tyre(0x24262b));
      g.add(at(w, sx * 0.95, 0.42, sz));
    }
  g.rotation.set(0.28, 0, 0.42); // sitting nose-down on the slope
  return g;
}

function markerFlag(): THREE.Group {
  const g = new THREE.Group();
  g.add(at(mesh(cyl(0.035, 0.04, 1.3, 5), M.painted(0xdfe3ea, 0.6)), 0, 0.65, 0));
  g.add(at(mesh(box(0.05, 0.3, 0.05), M.glow(0xff5d3a, 1.2)), 0, 1.15, 0));
  return g;
}

// ---------------------------------------------------------------------------

/** Kinds cheap and numerous enough to be worth instancing (built by view.ts). */
export const INSTANCED_KINDS = new Set<PropKind>(['grass', 'window']);
/**
 * Repeated scenery. Built once per template and drawn instanced — as Groups
 * these alone cost over a thousand draw calls on the mountain.
 */
export const SCATTER_KINDS: PropKind[] = [
  'pine',
  'boulder',
  'shrub',
  'snowPatch',
  'markerFlag',
  'guardrail',
  'rockSpire',
  'tree',
  'tire',
  'crateStack',
];
/** Kinds view.ts animates each frame. */
export const ANIMATED_KINDS = new Set<PropKind>([
  'fan', 'hangLamp', 'banner', 'bird', 'cloud', 'gauge', 'weldBot', 'campfire',
]);

export function makeProp(p: Prop): THREE.Object3D | null {
  switch (p.kind) {
    case 'barrel':
      return barrel(p.color ?? 0x3f7d4f);
    case 'tire':
      return tireStack();
    case 'toolbox':
      return toolbox(p.color ?? 0xd14b3a);
    case 'jackstand':
      return jackstand();
    case 'hoist':
      return hoist();
    case 'shelf':
      return shelf();
    case 'toolwall':
      return toolwall();
    case 'poster':
      return poster(false);
    case 'posterSymbol':
      return poster(true);
    case 'pipe':
      return pipeRun(p.scale ?? 1);
    case 'cone':
      return trafficCone();
    case 'parkingLine':
      return parkingLines();
    case 'van':
      return van(p.color ?? 0x394b6b);
    case 'yardLight':
      return yardLight();
    case 'silhouette':
      return silhouette(p.color ?? 0x2c3550);
    case 'fan':
      return ceilingFan();
    case 'hangLamp':
      return hangLamp();
    case 'weldBot':
      return weldBot();
    case 'toolchest':
      return toolchest(p.color ?? 0xcf3b34);
    case 'lockers':
      return lockers();
    case 'compressor':
      return compressor();
    case 'workbench':
      return workbench();
    case 'cables':
      return cables(p.scale ?? 1);
    case 'sign':
      return sign();
    case 'banner':
      return banner();
    case 'gauge':
      return gauge();
    case 'fireext':
      return fireExt();
    case 'jerrycan':
      return jerrycan(p.color ?? 0xcf3b34);
    case 'crateStack':
      return crateStack();
    case 'oilStain':
      return oilStain();
    case 'tireMark':
      return tireMark();
    case 'tree':
      return tree();
    case 'powerpole':
      return powerpole();
    case 'cloud':
      return cloud();
    case 'bird':
      return bird();
    case 'roadline':
      return roadline();
    case 'lift':
      return lift();
    case 'paintStation':
      return paintStation();
    case 'fence':
      return fenceSection();
    case 'ceilingLight':
      return ceilingLight();
    case 'pine':
      return pine();
    case 'boulder':
      return boulder();
    case 'rockSpire':
      return rockSpire();
    case 'guardrail':
      return guardrail();
    case 'campfire':
      return campfire();
    case 'signpost':
      return signpost();
    case 'cabinDeco':
      return cabinDeco();
    case 'snowPatch':
      return snowPatch();
    case 'shrub':
      return shrub();
    case 'caveMouth':
      return caveMouth();
    case 'wreck':
      return wreck();
    case 'markerFlag':
      return markerFlag();
    default:
      return null;
  }
}
