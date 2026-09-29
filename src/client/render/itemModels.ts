import * as THREE from 'three';
import type { WorldItem, ItemKind } from '../../sim/items';
import { MAT, styl } from './stylized';
import { capsule, cone, cyl, lathe, mesh, rbox, sph, torus, tube, tyre } from './shapes';

// Every carryable thing, modelled to match its physics collider (centred on
// the body origin). Broken parts LOOK broken — scuffed, corroded, split — so
// you can tell a good wheel from a bad one across the room.

const PAL = {
  company: 0xff7a2f,
  companyDark: 0xd9541a,
  cream: 0xf1e6cc,
  red: 0xd9463b,
  yellow: 0xf4c430,
  lead: 0x9aa0a8,
  black: 0x24262b,
};

/** A road wheel: axle along Y, outer face +Y. */
export function wheelModel(radius = 0.38, width = 0.26, variant = 'truck', bad = false): THREE.Group {
  const g = new THREE.Group();
  g.name = 'wheel';
  const rubber = bad ? styl({ color: 0x2c2b2a, rough: 0.97, noise: 0.25, noiseScale: 0.15 }) : MAT.rubber(0x26282d);
  const tread = mesh(tyre(radius, width, variant === 'offroad' ? 14 : 20, variant === 'offroad' ? 0.03 : 0.018, bad), rubber);
  g.add(tread);
  // steel rim: dished face, painted, with a chrome cap
  const rimCol = variant === 'offroad' ? 0x2e3036 : variant === 'ranger' ? 0x5b6b4a : PAL.cream;
  const rimMat = styl({ color: rimCol, rough: 0.42, metal: 0.35, noise: 0.05, env: 0.9 });
  const rr = radius * 0.62;
  const hw = width / 2;
  const rim = mesh(
    lathe(`rim${radius}${width}`, [
      [0.02, hw * 0.6],
      [rr * 0.35, hw * 0.62],
      [rr * 0.5, hw * 0.45],
      [rr * 0.78, hw * 0.5],
      [rr * 0.98, hw * 0.78],
      [rr * 1.0, hw * 0.55],
      [rr * 0.98, -hw * 0.8],
    ]),
    rimMat,
  );
  g.add(rim);
  // vent holes between the spokes
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.26;
    const h = mesh(cyl(rr * 0.11, rr * 0.11, 0.02, 12), MAT.darkMetal(0x15161a));
    h.position.set(Math.cos(a) * rr * 0.66, hw * 0.5, Math.sin(a) * rr * 0.66);
    g.add(h);
  }
  const cap = mesh(lathe('hubcap', [[0.0, hw * 0.78], [rr * 0.2, hw * 0.74], [rr * 0.3, hw * 0.62], [rr * 0.3, hw * 0.55]]), MAT.chrome());
  g.add(cap);
  if (bad) {
    // a gash in the tread and a strip of peeled rubber
    const gash = mesh(rbox(0.05, width * 0.8, 0.16, 0.02), styl({ color: 0x5c5048, rough: 1, noise: 0.3 }));
    gash.position.set(radius * 0.99, 0, 0.05);
    g.add(gash);
    const strip = mesh(rbox(0.3, 0.012, 0.07, 0.005), rubber);
    strip.position.set(radius + 0.05, hw * 0.3, 0.2);
    strip.rotation.set(0.3, 0.6, 0.2);
    g.add(strip);
  }
  return g;
}

function battery(bad: boolean): THREE.Group {
  const g = new THREE.Group();
  const body = mesh(rbox(0.32, 0.22, 0.2, 0.025), styl({ color: 0x262a31, rough: 0.55, noise: 0.05 }));
  body.position.y = -0.01;
  g.add(body);
  const lid = mesh(rbox(0.33, 0.035, 0.21, 0.012), styl({ color: bad ? 0x6b6f72 : PAL.company, rough: 0.5 }));
  lid.position.y = 0.105;
  g.add(lid);
  const label = mesh(rbox(0.2, 0.1, 0.004, 0.002), styl({ color: bad ? 0x8a8676 : PAL.cream, rough: 0.7 }));
  label.position.set(0, 0.0, 0.1);
  g.add(label);
  for (const [x, col] of [
    [-0.11, PAL.red],
    [0.11, PAL.black],
  ] as [number, number][]) {
    const post = mesh(cyl(0.017, 0.02, 0.04, 12), MAT.metal(PAL.lead, 0.5));
    post.position.set(x, 0.14, 0);
    g.add(post);
    const ring = mesh(cyl(0.028, 0.028, 0.012, 14), styl({ color: col, rough: 0.5 }));
    ring.position.set(x, 0.126, 0);
    g.add(ring);
    if (bad) {
      // crusty green-white corrosion
      for (let k = 0; k < 5; k++) {
        const c = mesh(sph(0.014 + k * 0.002, 6, 5), styl({ color: k % 2 ? 0x9fd6b8 : 0xe8efe2, rough: 1, noise: 0.3 }));
        c.position.set(x + Math.cos(k * 1.7) * 0.025, 0.13 + k * 0.004, Math.sin(k * 1.7) * 0.025);
        g.add(c);
      }
    }
  }
  const handle = mesh(torus(0.05, 0.007, 6, 14, Math.PI), styl({ color: 0x1a1b1e, rough: 0.6 }));
  handle.position.set(0, 0.125, 0);
  g.add(handle);
  return g;
}

function jack(): THREE.Group {
  const g = new THREE.Group();
  const red = styl({ color: PAL.red, rough: 0.45, metal: 0.25 });
  const frame = mesh(rbox(0.24, 0.08, 0.6, 0.03), red);
  frame.position.y = -0.04;
  g.add(frame);
  const arm = mesh(rbox(0.1, 0.06, 0.4, 0.02), red);
  arm.position.set(0, 0.03, -0.08);
  arm.rotation.x = 0.18;
  g.add(arm);
  const saddle = mesh(cyl(0.07, 0.07, 0.03, 16), MAT.darkMetal());
  saddle.position.set(0, 0.07, -0.28);
  g.add(saddle);
  const pump = mesh(cyl(0.035, 0.035, 0.12, 12), MAT.metal());
  pump.position.set(0, 0.04, 0.2);
  g.add(pump);
  for (const [x, z] of [
    [-0.12, -0.25],
    [0.12, -0.25],
    [-0.12, 0.24],
    [0.12, 0.24],
  ]) {
    const w = mesh(cyl(0.035, 0.035, 0.03, 12), MAT.rubber());
    w.rotation.z = Math.PI / 2;
    w.position.set(x, -0.065, z);
    g.add(w);
  }
  const handle = mesh(cyl(0.012, 0.012, 0.5, 8), MAT.metal(0xb8bec8));
  handle.rotation.x = -1.0;
  handle.position.set(0, 0.2, 0.42);
  g.add(handle);
  const grip = mesh(capsule(0.02, 0.06, 4, 8), MAT.rubber(PAL.black));
  grip.rotation.x = -1.0;
  grip.position.set(0, 0.42, 0.56);
  g.add(grip);
  return g;
}

function chock(): THREE.Group {
  const g = new THREE.Group();
  const s = new THREE.Shape();
  s.moveTo(-0.17, -0.08);
  s.lineTo(0.17, -0.08);
  s.lineTo(0.17, -0.04);
  s.lineTo(-0.1, 0.08);
  s.lineTo(-0.17, 0.08);
  s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, { depth: 0.16, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.012, bevelSegments: 2 });
  geo.translate(0, 0, -0.08);
  geo.rotateY(Math.PI / 2);
  geo.computeVertexNormals();
  g.add(mesh(geo, styl({ color: PAL.yellow, rough: 0.7, noise: 0.1 })));
  const band = mesh(rbox(0.21, 0.02, 0.3, 0.008), styl({ color: 0x2a2a2a, rough: 0.8 }));
  band.position.set(0, -0.02, 0.02);
  band.rotation.x = -0.35;
  g.add(band);
  return g;
}

function jerrycan(fill: number): THREE.Group {
  const g = new THREE.Group();
  const col = styl({ color: PAL.red, rough: 0.5, metal: 0.2, noise: 0.08 });
  const body = mesh(rbox(0.17, 0.38, 0.33, 0.03), col);
  body.position.y = -0.01;
  g.add(body);
  // embossed X on each side
  for (const sx of [-1, 1]) {
    for (const r of [0.55, -0.55]) {
      const x = mesh(rbox(0.012, 0.36, 0.035, 0.01), col);
      x.position.set(sx * 0.087, -0.02, 0);
      x.rotation.x = r;
      g.add(x);
    }
  }
  const handles = mesh(rbox(0.06, 0.05, 0.22, 0.02), col);
  handles.position.set(0, 0.2, 0.03);
  g.add(handles);
  const spout = mesh(cyl(0.028, 0.032, 0.06, 12), MAT.metal(0xc5ccd6));
  spout.position.set(0, 0.2, -0.13);
  spout.rotation.x = -0.4;
  g.add(spout);
  const tag = mesh(rbox(0.004, 0.08, 0.12, 0.002), styl({ color: fill > 0.02 ? PAL.yellow : 0x777777, rough: 0.7 }));
  tag.position.set(0.09, 0.05, 0);
  g.add(tag);
  return g;
}

function coolantJug(fill: number): THREE.Group {
  const g = new THREE.Group();
  const shell = styl({ color: 0x7ff0c2, rough: 0.25, transparent: true, opacity: 0.55, depthWrite: false, rim: 0.6 });
  const body = mesh(rbox(0.17, 0.26, 0.17, 0.05), shell);
  g.add(body);
  if (fill > 0.02) {
    const liquid = mesh(rbox(0.15, 0.24 * fill, 0.15, 0.04), styl({ color: 0x2fe39a, rough: 0.2, emissive: 0x0c5a3a, emissiveIntensity: 0.4 }));
    liquid.position.y = -0.12 + 0.12 * fill;
    g.add(liquid);
  }
  const cap = mesh(cyl(0.035, 0.035, 0.04, 14), styl({ color: 0x1f5fbf, rough: 0.5 }));
  cap.position.set(0.04, 0.15, 0);
  g.add(cap);
  const handle = mesh(torus(0.04, 0.01, 6, 12, Math.PI), shell);
  handle.position.set(-0.03, 0.13, 0);
  g.add(handle);
  return g;
}

function hose(kind: 'fuel' | 'radiator', bad: boolean): THREE.Group {
  const g = new THREE.Group();
  const r = kind === 'fuel' ? 0.018 : 0.028;
  const pts: [number, number, number][] =
    kind === 'fuel'
      ? [
          [-0.26, 0, 0],
          [-0.12, 0.02, 0.02],
          [0.02, -0.01, -0.02],
          [0.14, 0.02, 0.01],
          [0.26, 0, 0],
        ]
      : [
          [-0.22, -0.02, 0],
          [-0.1, 0.03, 0],
          [0.05, 0.03, 0],
          [0.15, -0.01, 0],
          [0.22, -0.04, 0],
        ];
  g.add(mesh(tube(`${kind}${bad}`, pts, r, 24, 10), MAT.rubber(kind === 'fuel' ? 0x303238 : 0x1d1f23)));
  for (const end of [pts[0], pts[pts.length - 1]]) {
    const clamp = mesh(torus(r * 1.15, 0.005, 6, 14), MAT.metal(0xc5ccd6));
    clamp.position.set(end[0] * 0.92, end[1], end[2]);
    clamp.rotation.y = Math.PI / 2;
    g.add(clamp);
  }
  if (bad) {
    const split = mesh(rbox(0.05, r * 1.4, r * 0.9, 0.004), styl({ color: 0x8a6d4a, rough: 1 }));
    split.position.set(0.03, r * 0.55, 0);
    g.add(split);
    const tape = mesh(cyl(r * 1.08, r * 1.08, 0.04, 10), styl({ color: 0x9aa4ad, rough: 0.6 }));
    tape.rotation.z = Math.PI / 2;
    tape.position.set(-0.08, 0.02, 0);
    g.add(tape);
  }
  return g;
}

export function wrenchModel(): THREE.Group {
  const g = new THREE.Group();
  const steel = MAT.chrome();
  const shaft = mesh(rbox(0.3, 0.018, 0.034, 0.008), steel);
  shaft.position.x = 0.02;
  g.add(shaft);
  const head = mesh(cyl(0.032, 0.032, 0.026, 18), steel);
  head.position.x = -0.15;
  g.add(head);
  const socket = mesh(cyl(0.017, 0.019, 0.05, 6), MAT.darkMetal(0x4a4f58));
  socket.position.set(-0.15, -0.035, 0);
  g.add(socket);
  const grip = mesh(rbox(0.13, 0.03, 0.042, 0.014), styl({ color: PAL.company, rough: 0.6 }));
  grip.position.x = 0.12;
  g.add(grip);
  return g;
}

function flashlight(): THREE.Group {
  const g = new THREE.Group();
  const body = mesh(cyl(0.025, 0.025, 0.2, 14), styl({ color: PAL.yellow, rough: 0.5 }));
  body.rotation.x = Math.PI / 2;
  g.add(body);
  const head = mesh(cyl(0.045, 0.03, 0.07, 16), styl({ color: 0x2b2d33, rough: 0.5 }));
  head.rotation.x = Math.PI / 2;
  head.position.z = -0.12;
  g.add(head);
  const lens = mesh(cyl(0.04, 0.04, 0.005, 16), MAT.glow(0xfff2c6, 0.6));
  lens.rotation.x = Math.PI / 2;
  lens.position.z = -0.157;
  g.add(lens);
  return g;
}

function flare(): THREE.Group {
  const g = new THREE.Group();
  const stick = mesh(cyl(0.022, 0.022, 0.26, 12), styl({ color: 0xd8342c, rough: 0.6 }));
  stick.rotation.x = Math.PI / 2;
  g.add(stick);
  const cap = mesh(cyl(0.025, 0.025, 0.04, 12), styl({ color: 0x2b2d33, rough: 0.5 }));
  cap.rotation.x = Math.PI / 2;
  cap.position.z = -0.14;
  g.add(cap);
  return g;
}

function medkit(): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(rbox(0.28, 0.12, 0.2, 0.03), styl({ color: 0xf2f0ea, rough: 0.5 })));
  const c1 = mesh(rbox(0.1, 0.005, 0.03, 0.002), styl({ color: 0xd63a34, rough: 0.5 }));
  c1.position.y = 0.062;
  g.add(c1);
  const c2 = c1.clone();
  c2.rotation.y = Math.PI / 2;
  g.add(c2);
  const latch = mesh(rbox(0.04, 0.03, 0.01, 0.004), MAT.metal());
  latch.position.set(0, 0.02, 0.1);
  g.add(latch);
  return g;
}

function key(tag?: string): THREE.Group {
  const g = new THREE.Group();
  const brass = styl({ color: 0xd6a94a, rough: 0.3, metal: 0.9, env: 1.2 });
  const bow = mesh(torus(0.018, 0.006, 6, 14), brass);
  bow.rotation.x = Math.PI / 2;
  bow.position.x = -0.03;
  g.add(bow);
  const blade = mesh(rbox(0.05, 0.004, 0.012, 0.002), brass);
  blade.position.x = 0.012;
  g.add(blade);
  const fob = mesh(rbox(0.04, 0.012, 0.06, 0.01), styl({ color: tag === 'atv' ? 0xf4c430 : 0x3a7bd5, rough: 0.6 }));
  fob.position.set(-0.07, 0, 0);
  g.add(fob);
  return g;
}

function winch(): THREE.Group {
  const g = new THREE.Group();
  const drum = mesh(cyl(0.09, 0.09, 0.34, 18), styl({ color: 0x2b2d33, rough: 0.45, metal: 0.5 }));
  drum.rotation.z = Math.PI / 2;
  g.add(drum);
  const cable = mesh(cyl(0.095, 0.095, 0.26, 18), styl({ color: 0x8c8f94, rough: 0.6, metal: 0.6, noise: 0.3, noiseScale: 0.02 }));
  cable.rotation.z = Math.PI / 2;
  g.add(cable);
  const motor = mesh(cyl(0.08, 0.08, 0.16, 16), styl({ color: PAL.company, rough: 0.5 }));
  motor.rotation.z = Math.PI / 2;
  motor.position.x = 0.24;
  g.add(motor);
  const hook = mesh(torus(0.03, 0.009, 6, 12, Math.PI * 1.4), MAT.metal());
  hook.position.set(-0.05, -0.06, 0.1);
  g.add(hook);
  return g;
}

function lightbar(): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(rbox(1.0, 0.08, 0.14, 0.03), styl({ color: 0x1f2126, rough: 0.5 })));
  for (let i = 0; i < 4; i++) {
    const l = mesh(cyl(0.05, 0.05, 0.02, 16), MAT.glow(0xfff4d6, 0.8));
    l.rotation.x = Math.PI / 2;
    l.position.set(-0.36 + i * 0.24, 0, -0.07);
    g.add(l);
  }
  return g;
}

function crate(): THREE.Group {
  const g = new THREE.Group();
  const wood = MAT.wood(0x9a7248);
  g.add(mesh(rbox(0.5, 0.4, 0.4, 0.02), wood));
  const strap = styl({ color: 0x5a5f68, rough: 0.5, metal: 0.6 });
  for (const x of [-0.18, 0.18]) {
    const s = mesh(rbox(0.04, 0.42, 0.42, 0.01), strap);
    s.position.x = x;
    g.add(s);
  }
  // the symbol: a ring with a notch, glowing faintly
  const sym = mesh(torus(0.08, 0.012, 8, 24, Math.PI * 1.7), MAT.glow(0x6ff0dc, 1.2));
  sym.position.set(0, 0.03, 0.205);
  g.add(sym);
  return g;
}

function fuse(): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(rbox(0.12, 0.03, 0.08, 0.01), styl({ color: 0xeaeaea, rough: 0.5 })));
  for (let i = 0; i < 4; i++) {
    const f = mesh(rbox(0.018, 0.03, 0.035, 0.004), styl({ color: [0xe24a3b, 0x3b8de2, 0xf4c430, 0x43b26a][i], rough: 0.4 }));
    f.position.set(-0.042 + i * 0.028, 0.02, 0);
    g.add(f);
  }
  return g;
}

function oldTire(): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(tyre(0.36, 0.24, 16, 0.012, true), styl({ color: 0x2b2a29, rough: 1, noise: 0.2 })));
  return g;
}

/** Build the mesh for an item as it currently is. */
export function itemModel(it: Pick<WorldItem, 'kind' | 'cond' | 'fill' | 'variant' | 'tag'>): THREE.Group {
  const bad = it.cond === 'bad';
  let g: THREE.Group;
  switch (it.kind as ItemKind) {
    case 'wheel':
      g = wheelModel(it.variant === 'atv' ? 0.3 : 0.38, it.variant === 'atv' ? 0.22 : 0.26, it.variant ?? 'truck', bad);
      break;
    case 'tire':
      g = oldTire();
      break;
    case 'battery':
      g = battery(bad);
      break;
    case 'jack':
      g = jack();
      break;
    case 'chock':
      g = chock();
      break;
    case 'jerrycan':
      g = jerrycan(it.fill);
      break;
    case 'coolant':
      g = coolantJug(it.fill);
      break;
    case 'fuelHose':
      g = hose('fuel', bad);
      break;
    case 'radiatorHose':
      g = hose('radiator', bad);
      break;
    case 'wrench':
      g = wrenchModel();
      break;
    case 'flashlight':
      g = flashlight();
      break;
    case 'flare':
      g = flare();
      break;
    case 'medkit':
      g = medkit();
      break;
    case 'key':
      g = key(it.tag);
      break;
    case 'winch':
      g = winch();
      break;
    case 'lightbar':
      g = lightbar();
      break;
    case 'crate':
      g = crate();
      break;
    case 'fuse':
      g = fuse();
      break;
    case 'cone': {
      g = new THREE.Group();
      const orange = styl({ color: 0xff6a1f, rough: 0.5, noise: 0.05 });
      g.add(mesh(lathe('cone', [[0.02, 0.3], [0.05, 0.28], [0.15, -0.26], [0.16, -0.27], [0.0, -0.27]], 16), orange));
      g.add(mesh(cyl(0.105, 0.125, 0.09, 16, true), styl({ color: 0xf6f4ee, rough: 0.4 }), 0, -0.03, 0));
      g.add(mesh(rbox(0.36, 0.035, 0.36, 0.01), orange, 0, -0.28, 0));
      break;
    }
    default:
      g = new THREE.Group();
      g.add(mesh(rbox(0.2, 0.2, 0.2), MAT.paint(0xff00ff)));
  }
  g.userData.kind = it.kind;
  return g;
}

/** Tiny cone used for waypoints etc. */
export const markerGeo = () => cone(0.2, 0.4, 12);
