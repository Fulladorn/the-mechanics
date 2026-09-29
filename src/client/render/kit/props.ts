import * as THREE from 'three';
import type { PropDef } from '../../../content/levels/types';
import type { World } from '../../../sim/world';
import { MAT, styl } from '../stylized';
import { cone, cyl, lathe, mesh, rbox, sph, textTexture, torus, tube, tyre } from '../shapes';
import { wheelModel, wrenchModel } from '../itemModels';
import { num, signBoard, str } from './building';
import type { PropBuild } from './registry';

// Furniture and dressing for the depot and the mountain sites. Each builder
// matches the footprint its collider was given in content/kit.ts (FOOT).

const C = {
  orange: 0xff7a2f,
  cream: 0xf3e9cf,
  navy: 0x2a3d56,
  steel: 0x8c95a3,
  red: 0xd9463b,
  green: 0x3f7d4f,
  yellow: 0xf2c230,
};
const paintMat = (c: number, r = 0.55) => styl({ color: c, rough: r, metal: 0.25, noise: 0.08 });

function lockers(p: PropDef): PropBuild {
  const g = new THREE.Group();
  const names = str(p, 'names', 'A,B,C,D').split(',');
  const openIdx = num(p, 'open', -1);
  const body = paintMat(0x5d7b8f);
  const n = names.length;
  const w = 2.4 / n;
  const doors: THREE.Object3D[] = [];
  for (let i = 0; i < n; i++) {
    const x = -1.2 + w * (i + 0.5);
    g.add(mesh(rbox(w - 0.02, 2.0, 0.5, 0.02), body, x, 1.0, 0));
    // interior (visible when open)
    const back = mesh(rbox(w - 0.1, 1.9, 0.02, 0.005), styl({ color: 0x2b3440, rough: 0.8 }), x, 1.0, -0.2);
    g.add(back);
    const shelf = mesh(rbox(w - 0.1, 0.03, 0.4, 0.005), styl({ color: 0x46505e, rough: 0.7 }), x, 1.05, 0);
    g.add(shelf);
    const pivot = new THREE.Group();
    pivot.position.set(x - w / 2 + 0.02, 0, 0.26);
    const door = mesh(rbox(w - 0.04, 1.94, 0.03, 0.01), body, w / 2 - 0.02, 1.0, 0);
    pivot.add(door);
    for (let v = 0; v < 3; v++) {
      const vent = mesh(rbox(w * 0.5, 0.02, 0.01, 0.004), styl({ color: 0x2b3440, rough: 0.7 }), w / 2, 1.7 - v * 0.05, 0.018);
      pivot.add(vent);
    }
    const handle = mesh(rbox(0.03, 0.14, 0.03, 0.01), MAT.chrome(), w - 0.12, 1.0, 0.03);
    pivot.add(handle);
    const tag = textTexture([{ text: names[i], size: 90, color: names[i] === 'ROOKIE' ? '#d9463b' : '#1d2a3a', y: 64 }], 256, 128, '#f3e9cf');
    const label = mesh(new THREE.PlaneGeometry(w * 0.7, w * 0.35), styl({ map: tag, rough: 0.7, noise: 0 }), w / 2, 1.45, 0.02);
    label.rotation.z = names[i] === 'ROOKIE' ? 0.06 : 0;
    pivot.add(label);
    g.add(pivot);
    doors.push(pivot);
  }
  const target = new THREE.Group();
  if (openIdx >= 0) target.add(doors[openIdx]);
  g.add(target);
  let t = 0;
  return {
    obj: g,
    targets: new Map([['station:locker', doors[openIdx] ?? g]]),
    update: (dt, _time, w) => {
      if (openIdx < 0) return;
      const open = w.flag('locker');
      t += ((open ? 1 : 0) - t) * Math.min(1, dt * 5);
      doors[openIdx].rotation.y = -t * 1.9;
    },
  };
}

function bench(): PropBuild {
  const g = new THREE.Group();
  const wood = MAT.wood(0xb4845a);
  g.add(mesh(rbox(1.8, 0.06, 0.4, 0.02), wood, 0, 0.44, 0));
  for (const x of [-0.75, 0.75]) g.add(mesh(rbox(0.06, 0.42, 0.34, 0.01), MAT.darkMetal(), x, 0.21, 0));
  const bag = mesh(rbox(0.5, 0.25, 0.28, 0.1), MAT.fabric(0x31576f), -0.4, 0.6, 0);
  bag.rotation.y = 0.3;
  g.add(bag);
  const helmet = mesh(sph(0.15, 14, 10), styl({ color: C.orange, rough: 0.4 }), 0.4, 0.55, 0.02);
  helmet.scale.y = 0.7;
  g.add(helmet);
  return { obj: g };
}

function coffee(): PropBuild {
  const g = new THREE.Group();
  g.add(mesh(rbox(0.6, 0.9, 0.5, 0.03), MAT.wood(0x8a6a4a), 0, 0.45, 0));
  g.add(mesh(rbox(0.32, 0.38, 0.28, 0.04), paintMat(0x23262c), 0, 1.09, 0));
  const pot = mesh(lathe('pot', [[0, 0], [0.07, 0.01], [0.08, 0.1], [0.05, 0.16], [0.03, 0.18]], 14), MAT.glass(0x4a2c1c, 0.8), 0, 0.92, 0.04);
  g.add(pot);
  for (let i = 0; i < 3; i++) g.add(mesh(cyl(0.035, 0.03, 0.09, 10), styl({ color: [C.cream, C.orange, 0x3f7d9f][i], rough: 0.4 }), -0.2 + i * 0.07, 0.95, 0.15));
  return { obj: g };
}

function clock(): PropBuild {
  const g = new THREE.Group();
  g.add(mesh(rbox(0.36, 0.5, 0.18, 0.04), paintMat(0x6f7884), 0, 0, 0));
  const face = mesh(cyl(0.12, 0.12, 0.01, 24), styl({ color: C.cream, rough: 0.5 }), 0, 0.1, 0.095);
  face.rotation.x = Math.PI / 2;
  g.add(face);
  const hand = mesh(rbox(0.008, 0.09, 0.005, 0.002), styl({ color: 0x222222 }), 0, 0.13, 0.1);
  g.add(hand);
  const hand2 = mesh(rbox(0.008, 0.06, 0.005, 0.002), styl({ color: 0x222222 }), 0.02, 0.1, 0.1);
  hand2.rotation.z = -1.2;
  g.add(hand2);
  const slot = mesh(rbox(0.16, 0.015, 0.05, 0.004), styl({ color: 0x111111 }), 0, -0.1, 0.09);
  g.add(slot);
  const lamp = styl({ color: 0x222222, emissive: 0xff3b2f, emissiveIntensity: 2, rough: 0.4, noise: 0 });
  const led = mesh(sph(0.012, 8, 6), lamp, 0.13, -0.19, 0.09);
  g.add(led);
  // card rack
  const rack = mesh(rbox(0.3, 0.3, 0.06, 0.01), styl({ color: 0x9aa0aa, metal: 0.4, rough: 0.5 }), 0.36, -0.05, 0.03);
  g.add(rack);
  for (let i = 0; i < 4; i++) {
    const card = mesh(rbox(0.07, 0.14, 0.005, 0.002), styl({ color: C.cream, rough: 0.8 }), 0.26 + i * 0.065, 0.02 - (i % 2) * 0.02, 0.07);
    g.add(card);
  }
  g.position.x -= 0.09;
  return {
    obj: g,
    targets: new Map([['station:clock', g]]),
    update: (_dt, t, w) => {
      const done = w.flag('clockedIn');
      lamp.emissive.setHex(done ? 0x3cff7a : 0xff3b2f);
      lamp.emissiveIntensity = done ? 2 : 1.3 + Math.sin(t * 5) * 0.8;
    },
  };
}

const POSTERS: Record<string, { title: string; sub: string; bg: string; fg: string }> = {
  safety: { title: 'SAFETY FIRST', sub: 'Well. Fourth.', bg: '#ffcf3f', fg: '#1d2a3a' },
  fix: { title: 'WE FIX WHAT OTHERS WON’T', sub: 'THE COMPANY', bg: '#1d2a3a', fg: '#f3e9cf' },
  company: { title: 'ASK FEWER QUESTIONS', sub: 'Curiosity is not billable', bg: '#ff7a2f', fg: '#1d2a3a' },
  hands: { title: 'COUNT YOUR FINGERS', sub: 'Before AND after', bg: '#3f7d4f', fg: '#f3e9cf' },
};

function poster(p: PropDef): PropBuild {
  const a = POSTERS[str(p, 'art', 'fix')] ?? POSTERS.fix;
  const tex = textTexture(
    [
      { text: a.title, size: 58, color: a.fg, y: 190 },
      { text: a.sub, size: 34, color: a.fg, y: 260, font: '600' },
    ],
    512,
    720,
    a.bg,
  );
  const g = new THREE.Group();
  const m = mesh(new THREE.PlaneGeometry(0.8, 1.12), styl({ map: tex, rough: 0.8, noise: 0.05 }));
  m.receiveShadow = true;
  g.add(m);
  // a big wrench icon on the fix poster
  if (str(p, 'art') === 'fix' || str(p, 'art') === 'company') {
    const w = wrenchModel();
    w.scale.setScalar(1.6);
    w.rotation.set(Math.PI / 2, 0, 0.6);
    w.position.set(0, -0.25, 0.02);
    g.add(w);
  }
  return { obj: g };
}

function lamp(p: PropDef): PropBuild {
  const g = new THREE.Group();
  const color = num(p, 'color', 0xfff0d8);
  const strip = p.p?.strip === true;
  const flicker = p.p?.flicker === true;
  const tube2 = styl({ color, emissive: color, emissiveIntensity: 2.4, rough: 0.5, noise: 0, rim: 0 });
  if (strip) {
    g.add(mesh(rbox(0.3, 0.08, 2.2, 0.03), paintMat(0xdad6cc), 0, 0.05, 0));
    for (const x of [-0.07, 0.07]) g.add(mesh(cyl(0.025, 0.025, 2.0, 8), tube2, x, -0.01, 0).rotateX(Math.PI / 2));
    for (const z of [-1.2, 1.2]) g.add(mesh(cyl(0.006, 0.006, 0.8, 4), MAT.darkMetal(), 0, 0.45, z));
  } else {
    g.add(mesh(cyl(0.18, 0.22, 0.05, 16), paintMat(0xdad6cc), 0, 0, 0));
    g.add(mesh(sph(0.11, 12, 8), tube2, 0, -0.05, 0));
  }
  const light = new THREE.PointLight(color, num(p, 'power', 8), num(p, 'range', 12), 1.6);
  light.position.y = -0.3;
  g.add(light);
  const base = light.intensity;
  const gate = str(p, 'flag', '');
  return {
    obj: g,
    update: (_dt, t, w) => {
      const powered = !gate || w.flag(gate);
      const on = !powered ? 0 : flicker && Math.sin(t * 13) + Math.sin(t * 7.3) > 1.2 ? 0.2 : 1;
      light.intensity = base * on;
      tube2.emissiveIntensity = 2.4 * on;
    },
  };
}

function tireRack(): PropBuild {
  const g = new THREE.Group();
  const steel = paintMat(0x4a5a6a);
  for (const x of [-1.05, 1.05]) for (const z of [-0.3, 0.3]) g.add(mesh(rbox(0.06, 1.9, 0.06, 0.01), steel, x, 0.95, z));
  for (const y of [0.9, 1.75]) for (const z of [-0.3, 0.3]) g.add(mesh(rbox(2.16, 0.05, 0.05, 0.01), steel, 0, y, z));
  for (const y of [0.9, 1.75])
    for (let i = 0; i < 5; i++) {
      const t = mesh(tyre(0.33, 0.22, 16, 0.014), MAT.rubber(), -0.8 + i * 0.4, y + 0.33, 0);
      t.rotation.z = Math.PI / 2;
      g.add(t);
    }
  return { obj: g };
}

function shelf(p: PropDef): PropBuild {
  const g = new THREE.Group();
  const steel = paintMat(0x6f7c62);
  for (const x of [-1.05, 1.05]) for (const z of [-0.26, 0.26]) g.add(mesh(rbox(0.05, 2.0, 0.05, 0.01), steel, x, 1.0, z));
  for (const y of [0.35, 0.95, 1.55, 1.95]) g.add(mesh(rbox(2.14, 0.04, 0.56, 0.01), steel, 0, y, 0));
  if (str(p, 'fill') === 'batteries') {
    for (let i = 0; i < 4; i++) {
      const b = new THREE.Group();
      b.add(mesh(rbox(0.3, 0.22, 0.2, 0.02), styl({ color: 0x262a31, rough: 0.55 })));
      b.add(mesh(rbox(0.31, 0.03, 0.21, 0.01), styl({ color: i % 2 ? 0x6b6f72 : C.orange, rough: 0.5 }), 0, 0.11, 0));
      b.position.set(-0.7 + i * 0.45, 1.09, 0);
      g.add(b);
    }
    for (let i = 0; i < 6; i++) g.add(mesh(rbox(0.22, 0.3, 0.22, 0.02), styl({ color: [0xd9463b, 0x2f7fd1, C.cream][i % 3], rough: 0.6 }), -0.8 + i * 0.32, 1.72, 0));
  }
  return { obj: g };
}

function jerryRack(): PropBuild {
  const g = new THREE.Group();
  g.add(mesh(rbox(1.2, 0.05, 0.5, 0.01), paintMat(0x4a5a6a), 0, 1.15, 0));
  for (const x of [-0.58, 0.58]) g.add(mesh(rbox(0.05, 1.2, 0.5, 0.01), paintMat(0x4a5a6a), x, 0.6, 0));
  const sign = signBoard('FLAMMABLE', 0.8, 0.22, '#d9463b', '#f3e9cf');
  sign.position.set(0, 1.4, 0);
  g.add(sign);
  return { obj: g };
}

function crate(): PropBuild {
  const g = new THREE.Group();
  const wood = MAT.wood(0xa87a4c);
  g.add(mesh(rbox(1, 1, 1, 0.03), wood, 0, 0.5, 0));
  const slat = MAT.wood(0x8a5f38);
  for (const s of [-1, 1]) {
    for (const r of [0.8, -0.8]) {
      const b = mesh(rbox(1.3, 0.1, 0.03, 0.01), slat, 0, 0.5, s * 0.51);
      b.rotation.z = r;
      g.add(b);
    }
  }
  return { obj: g };
}

function crateStack(p: PropDef): PropBuild {
  const g = new THREE.Group();
  const h = num(p, 'h', 1);
  const wood = MAT.wood(0xa87a4c);
  let y = 0;
  let i = 0;
  while (y < h - 0.05) {
    const s = Math.min(0.9, h - y);
    const b = mesh(rbox(1.18, s, 1.18, 0.03), i % 2 ? MAT.wood(0x9a6c40) : wood, 0, y + s / 2, 0);
    b.rotation.y = i * 0.1;
    g.add(b);
    y += s;
    i++;
  }
  return { obj: g };
}

function workbench(p: PropDef): PropBuild {
  const g = new THREE.Group();
  g.add(mesh(rbox(2.6, 0.08, 0.8, 0.02), MAT.wood(0xb88a5c), 0, 0.92, 0));
  const steel = paintMat(0x3c5670);
  for (const x of [-1.2, 1.2]) for (const z of [-0.33, 0.33]) g.add(mesh(rbox(0.07, 0.88, 0.07, 0.01), steel, x, 0.44, z));
  g.add(mesh(rbox(2.5, 0.04, 0.7, 0.01), steel, 0, 0.18, 0));
  if (p.p?.vise) {
    const vise = mesh(rbox(0.2, 0.16, 0.24, 0.03), paintMat(0x2f6f9f), 0.9, 1.04, 0.2);
    g.add(vise);
  }
  // clutter
  const wr = wrenchModel();
  wr.position.set(-0.4, 0.97, 0.1);
  wr.rotation.set(0, 0.7, 0);
  g.add(wr);
  g.add(mesh(cyl(0.05, 0.05, 0.14, 12), styl({ color: 0x2f7fd1, rough: 0.5 }), 0.3, 1.03, -0.2));
  g.add(mesh(rbox(0.3, 0.12, 0.2, 0.02), paintMat(C.red), -0.9, 1.02, -0.15));
  const rag = mesh(rbox(0.25, 0.02, 0.2, 0.01), MAT.fabric(0xc9564b), 0.5, 0.97, 0.15);
  rag.rotation.y = 0.4;
  g.add(rag);
  return { obj: g };
}

function toolWall(): PropBuild {
  const g = new THREE.Group();
  g.add(mesh(rbox(2.6, 1.3, 0.04, 0.01), styl({ color: 0xc8a574, rough: 0.9, noise: 0.15 })));
  const outline = styl({ color: 0x222222, rough: 0.9 });
  for (let i = 0; i < 9; i++) {
    const x = -1.1 + i * 0.27;
    const w = wrenchModel();
    w.scale.setScalar(0.7 + (i % 3) * 0.15);
    w.rotation.set(Math.PI / 2, 0, Math.PI / 2);
    w.position.set(x, 0.25, 0.05);
    g.add(w);
    const peg = mesh(cyl(0.008, 0.008, 0.06, 6), outline, x, 0.45, 0.04);
    peg.rotation.x = Math.PI / 2;
    g.add(peg);
  }
  for (let i = 0; i < 5; i++) {
    const hammer = new THREE.Group();
    hammer.add(mesh(rbox(0.03, 0.3, 0.03, 0.01), MAT.wood(0x9a6c40), 0, 0, 0));
    hammer.add(mesh(rbox(0.12, 0.05, 0.05, 0.01), MAT.metal(), 0, 0.15, 0));
    hammer.position.set(-1 + i * 0.5, -0.25, 0.05);
    g.add(hammer);
  }
  return { obj: g };
}

function toolChest(p: PropDef): PropBuild {
  const g = new THREE.Group();
  const col = num(p, 'color', C.red);
  g.add(mesh(rbox(1.0, 1.0, 0.55, 0.03), paintMat(col, 0.4), 0, 0.55, 0));
  for (let i = 0; i < 6; i++) {
    g.add(mesh(rbox(0.9, 0.012, 0.01, 0.003), styl({ color: 0x1a1a1a }), 0, 0.2 + i * 0.14, 0.28));
    g.add(mesh(rbox(0.3, 0.02, 0.03, 0.01), MAT.chrome(), 0, 0.26 + i * 0.14, 0.29));
  }
  for (const x of [-0.4, 0.4]) g.add(mesh(cyl(0.05, 0.05, 0.04, 10), MAT.rubber(), x, 0.05, 0).rotateZ(Math.PI / 2));
  return { obj: g };
}

function compressor(): PropBuild {
  const g = new THREE.Group();
  const tank = mesh(capsuleH(0.25, 0.5), paintMat(C.red, 0.4), 0, 0.35, 0);
  g.add(tank);
  g.add(mesh(rbox(0.4, 0.3, 0.3, 0.04), paintMat(0x2b2d33), 0, 0.75, 0));
  g.add(mesh(cyl(0.08, 0.08, 0.03, 16), styl({ color: C.cream }), 0.22, 0.8, 0.1).rotateZ(Math.PI / 2));
  g.add(mesh(tube('comphose', [[0, 0.6, 0.15], [0.3, 0.3, 0.4], [0.1, 0.05, 0.6], [-0.3, 0.05, 0.5]], 0.018), styl({ color: 0x2f7fd1, rough: 0.5 })));
  return { obj: g };
}

function capsuleH(r: number, len: number): THREE.BufferGeometry {
  const g = new THREE.CapsuleGeometry(r, len, 6, 14);
  g.rotateZ(Math.PI / 2);
  return g;
}

function drum(p: PropDef): PropBuild {
  const g = new THREE.Group();
  const col = num(p, 'color', C.green);
  const m = paintMat(col, 0.5);
  g.add(mesh(cyl(0.31, 0.31, 0.88, 22), m, 0, 0.44, 0));
  for (const y of [0.3, 0.6]) g.add(mesh(torus(0.315, 0.015, 6, 28), m, 0, y, 0).rotateX(Math.PI / 2));
  g.add(mesh(cyl(0.05, 0.05, 0.02, 10), MAT.metal(), 0.15, 0.89, 0.05));
  return { obj: g };
}

function partsWasher(): PropBuild {
  const g = new THREE.Group();
  g.add(mesh(rbox(1.2, 0.8, 0.7, 0.04), paintMat(0x2f6f9f), 0, 0.4, 0));
  const lid = mesh(rbox(1.2, 0.04, 0.72, 0.02), paintMat(0x2f6f9f), 0, 0.95, -0.25);
  lid.rotation.x = -1.1;
  g.add(lid);
  g.add(mesh(rbox(1.1, 0.02, 0.6, 0.01), styl({ color: 0x4a6a4a, rough: 0.2, metal: 0.3 }), 0, 0.78, 0));
  return { obj: g };
}

function scrapBin(): PropBuild {
  const g = new THREE.Group();
  const m = paintMat(0x3f6d8f, 0.6);
  // open-top skip: floor + four walls (so things can land inside)
  g.add(mesh(rbox(1.6, 0.06, 1.1, 0.02), m, 0, 0.03, 0));
  for (const s of [-1, 1]) {
    g.add(mesh(rbox(1.6, 1.0, 0.06, 0.02), m, 0, 0.5, s * 0.52));
    g.add(mesh(rbox(0.06, 1.0, 1.1, 0.02), m, s * 0.77, 0.5, 0));
  }
  const tex = textTexture([{ text: 'SCRAP', size: 110, color: '#f3e9cf', y: 64 }], 512, 128, '#3f6d8f');
  const l = mesh(new THREE.PlaneGeometry(0.9, 0.22), styl({ map: tex, rough: 0.7, noise: 0 }), 0, 0.65, 0.56);
  g.add(l);
  // junk already in it
  const t = mesh(tyre(0.33, 0.2, 14, 0.01, true), MAT.rubber(), -0.3, 0.35, 0);
  t.rotation.set(0.4, 0.2, 1.2);
  g.add(t);
  g.add(mesh(rbox(0.3, 0.2, 0.2, 0.03), styl({ color: 0x3a3d44, rough: 0.8 }), 0.35, 0.2, 0.1));
  return { obj: g };
}

function tirePile(): PropBuild {
  const g = new THREE.Group();
  for (let i = 0; i < 5; i++) {
    const t = mesh(tyre(0.36, 0.24, 16, 0.014, i % 2 === 0), MAT.rubber(0x2a2b2e));
    t.position.set((i % 2) * 0.2, 0.12 + i * 0.24, (i % 3) * 0.05);
    g.add(t);
  }
  const lean = mesh(tyre(0.36, 0.24, 16, 0.014), MAT.rubber(0x2a2b2e), 0.7, 0.36, 0.3);
  lean.rotation.set(0, 0, 1.3);
  g.add(lean);
  return { obj: g };
}

function liftPost(): PropBuild {
  const g = new THREE.Group();
  const m = paintMat(0x2f6f9f, 0.45);
  g.add(mesh(rbox(0.35, 3.2, 0.35, 0.03), m, 0, 1.6, 0));
  g.add(mesh(rbox(0.6, 0.06, 0.6, 0.01), MAT.darkMetal(), 0, 0.03, 0));
  const warn = mesh(rbox(0.36, 0.2, 0.36, 0.02), styl({ color: C.yellow, rough: 0.6 }), 0, 0.5, 0);
  g.add(warn);
  return { obj: g };
}

function liftArms(): PropBuild {
  const g = new THREE.Group();
  const m = paintMat(0x2f6f9f, 0.45);
  for (const s of [-1, 1]) for (const z of [-1.4, 1.4]) {
    const arm = mesh(rbox(1.7, 0.08, 0.14, 0.02), m, s * 0.95, -0.12, z * 0.6);
    arm.rotation.y = s * z * 0.25;
    g.add(arm);
  }
  return { obj: g };
}

function van(p: PropDef): PropBuild {
  const g = new THREE.Group();
  const col = num(p, 'color', C.cream);
  const paint = styl({ color: col, rough: 0.35, metal: 0.15, clearcoat: 0.6 });
  const stripe = styl({ color: num(p, 'stripe', C.orange), rough: 0.4 });
  const glass = MAT.glass(0x4f7fa4, 0.7);
  const y0 = 0.35;
  g.add(mesh(rbox(1.96, 1.5, 3.4, 0.25), paint, 0, y0 + 0.95, 0.55));
  g.add(mesh(rbox(1.92, 1.0, 1.4, 0.25), paint, 0, y0 + 0.7, -1.7));
  const ws = mesh(rbox(1.7, 0.6, 0.05, 0.02), glass, 0, y0 + 1.35, -1.12);
  ws.rotation.x = -0.35;
  g.add(ws);
  g.add(mesh(rbox(1.98, 0.14, 4.6, 0.04), stripe, 0, y0 + 0.75, 0));
  for (const s of [-1, 1]) {
    g.add(mesh(rbox(0.02, 0.45, 0.9, 0.02), glass, s * 0.985, y0 + 1.35, -0.7));
    const logo = textTexture([{ text: 'THE COMPANY', size: 70, color: '#ff7a2f', y: 64 }], 512, 128);
    const l = mesh(new THREE.PlaneGeometry(1.6, 0.4), styl({ map: logo, transparent: true, rough: 0.5, noise: 0, polygonOffset: 2 }), s * 0.99, y0 + 1.25, 0.9);
    l.rotation.y = (s * Math.PI) / 2;
    g.add(l);
  }
  for (const s of [-1, 1]) for (const z of [-1.55, 1.55]) {
    const w = wheelModel(0.34, 0.24, 'offroad');
    w.rotation.z = s < 0 ? Math.PI / 2 : -Math.PI / 2;
    w.position.set(s * 0.86, y0 + 0.0, z);
    g.add(w);
  }
  const bumperF = mesh(rbox(2.0, 0.18, 0.2, 0.06), MAT.darkMetal(), 0, y0 + 0.2, -2.42);
  g.add(bumperF);
  for (const s of [-1, 1]) g.add(mesh(cyl(0.1, 0.1, 0.04, 14), MAT.glow(0xfff4d6, 0.5), s * 0.7, y0 + 0.62, -2.41).rotateX(Math.PI / 2));
  if (p.p?.hood) {
    const hood = mesh(rbox(1.8, 0.05, 0.9, 0.03), paint, 0, y0 + 1.45, -2.0);
    hood.rotation.x = -0.9;
    g.add(hood);
  }
  if (p.p?.open) {
    // back doors swung wide, dark load space inside
    g.add(mesh(rbox(1.8, 1.3, 0.02, 0.01), styl({ color: 0x1c1e22, rough: 0.9 }), 0, y0 + 1.0, 2.24));
    for (const s of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(s * 0.97, y0 + 1.0, 2.25);
      pivot.rotation.y = s * 1.9;
      pivot.add(mesh(rbox(0.94, 1.36, 0.05, 0.02), paint, -s * 0.47, 0, 0));
      g.add(pivot);
    }
  } else {
    g.add(mesh(rbox(1.9, 1.36, 0.04, 0.02), paint, 0, y0 + 1.0, 2.26));
  }
  if (p.p?.wrecked) {
    // on its side in the ditch, glass gone, rust bloom
    g.rotation.z = 1.45;
    g.position.y = 0;
    g.traverse((o) => {
      if (o instanceof THREE.Mesh && o.material === glass) o.visible = false;
    });
    paint.color.multiply(new THREE.Color(0xa89c88));
  }
  g.traverse((o) => {
    if (o instanceof THREE.Mesh) o.castShadow = true;
  });
  if (p.p?.wrecked) {
    const outer = new THREE.Group();
    outer.add(g);
    return { obj: outer };
  }
  return { obj: g };
}

function board(): PropBuild {
  const g = new THREE.Group();
  g.add(mesh(rbox(2.6, 1.3, 0.05, 0.02), styl({ color: 0xf6f4ee, rough: 0.35 })));
  g.add(mesh(rbox(2.7, 1.4, 0.03, 0.02), MAT.metal(0x9aa0aa), 0, 0, -0.02));
  const tex = textTexture(
    [
      { text: 'JOBS — TODAY', size: 64, color: '#1d2a3a', y: 70 },
      { text: 'BETSY: flat RL · dead batt', size: 42, color: '#d9463b', y: 160, font: 'italic 600' },
      { text: 'fuses cooked · NO GAS', size: 42, color: '#d9463b', y: 215, font: 'italic 600' },
      { text: '→ ROOKIE', size: 50, color: '#2f7fd1', y: 290, font: 'italic 700' },
      { text: 'DO NOT let rookie near the van', size: 34, color: '#1d2a3a', y: 380, font: 'italic 600' },
    ],
    1024,
    512,
  );
  g.add(mesh(new THREE.PlaneGeometry(2.5, 1.25), styl({ map: tex, transparent: true, rough: 0.5, noise: 0, polygonOffset: 2 }), 0, 0, 0.03));
  return { obj: g, targets: new Map([['station:board', g]]) };
}

function radio(): PropBuild {
  const g = new THREE.Group();
  g.add(mesh(rbox(0.36, 0.2, 0.14, 0.04), paintMat(0xc9563b, 0.45), 0, 0.1, 0));
  g.add(mesh(cyl(0.06, 0.06, 0.01, 18), styl({ color: 0x2b2d33, rough: 0.8 }), -0.08, 0.1, 0.072).rotateX(Math.PI / 2));
  g.add(mesh(rbox(0.1, 0.05, 0.01, 0.005), styl({ color: 0xfff2c6, emissive: 0xffd080, emissiveIntensity: 0.6 }), 0.09, 0.12, 0.072));
  g.add(mesh(cyl(0.004, 0.004, 0.4, 4), MAT.chrome(), 0.12, 0.35, -0.03).rotateZ(-0.3));
  return { obj: g };
}

function fan(): PropBuild {
  const g = new THREE.Group();
  g.add(mesh(cyl(0.02, 0.02, 0.5, 6), MAT.darkMetal(), 0, -0.25, 0));
  const hub = new THREE.Group();
  hub.position.y = -0.52;
  hub.add(mesh(cyl(0.1, 0.1, 0.1, 12), paintMat(0xdad6cc)));
  for (let i = 0; i < 4; i++) {
    const b = mesh(rbox(1.1, 0.01, 0.16, 0.005), MAT.wood(0x9a6c40), 0.6, 0, 0);
    const piv = new THREE.Group();
    piv.rotation.y = (i / 4) * Math.PI * 2;
    piv.add(b);
    hub.add(piv);
  }
  g.add(hub);
  return { obj: g, update: (dt) => (hub.rotation.y += dt * 3) };
}

function oilStain(p: PropDef): PropBuild {
  const r = num(p, 'r', 1);
  const m = mesh(new THREE.CircleGeometry(r, 20), styl({ color: 0x3a3730, rough: 0.2, metal: 0.3, transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: 2, noise: 0.3, noiseScale: 0.4 }));
  m.rotation.x = -Math.PI / 2;
  m.scale.set(1, 0.7, 1);
  m.castShadow = false;
  return { obj: m };
}

function fence(p: PropDef): PropBuild {
  const g = new THREE.Group();
  const len = num(p, 'len', 4);
  const post = MAT.metal(0x9aa0aa, 0.5);
  const mesh2 = styl({ color: 0x9aa0aa, rough: 0.6, metal: 0.5, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide });
  for (let x = 0; x <= len + 0.01; x += 2.5) g.add(mesh(cyl(0.04, 0.04, 1.9, 8), post, Math.min(x, len), 0.95, 0));
  g.add(mesh(cyl(0.025, 0.025, len, 6), post, len / 2, 1.85, 0).rotateZ(Math.PI / 2));
  const net = mesh(new THREE.PlaneGeometry(len, 1.8), mesh2, len / 2, 0.95, 0);
  net.castShadow = false;
  g.add(net);
  return { obj: g };
}

function barrier(p: PropDef): PropBuild {
  const g = new THREE.Group();
  const len = num(p, 'len', 6);
  g.add(mesh(rbox(0.3, 1.1, 0.3, 0.05), paintMat(0x2b2d33), 0, 0.55, 0));
  const arm = new THREE.Group();
  arm.position.set(0, 1.0, 0);
  for (let i = 0; i < 8; i++)
    arm.add(mesh(rbox(len / 8, 0.1, 0.08, 0.02), styl({ color: i % 2 ? 0xffffff : C.red, rough: 0.5 }), (i + 0.5) * (len / 8), 0, 0));
  g.add(arm);
  return { obj: g };
}

function gate(p: PropDef, w: World): PropBuild {
  const g = new THREE.Group();
  const n = num(p, 'n', 1);
  const flagMat = styl({ color: C.yellow, emissive: 0xffa020, emissiveIntensity: 0.2, rough: 0.6, side: THREE.DoubleSide });
  for (const s of [-1, 1]) {
    g.add(mesh(cyl(0.05, 0.05, 2.6, 8), styl({ color: 0xeeeeee, rough: 0.5 }), s * 2.1, 1.3, 0));
    const f = mesh(new THREE.PlaneGeometry(0.6, 0.4), flagMat, s * 2.1 + s * 0.3, 2.3, 0);
    g.add(f);
  }
  const banner = signBoard(`GATE ${n}`, 1.8, 0.4, '#1d2a3a', '#f3e9cf');
  banner.position.set(0, 2.5, 0);
  g.add(banner);
  const idx = n - 1;
  return {
    obj: g,
    update: (_dt, t) => {
      let next = 0;
      while (w.flag(`gate${next}`)) next++;
      const done = idx < next;
      const isNext = idx === next;
      flagMat.color.setHex(done ? 0x5fd08a : isNext ? C.yellow : 0xcccccc);
      flagMat.emissiveIntensity = isNext ? 0.6 + Math.sin(t * 5) * 0.4 : 0.05;
    },
  };
}

function turnPost(): PropBuild {
  const g = new THREE.Group();
  g.add(mesh(cyl(0.3, 0.35, 1, 16), styl({ color: C.orange, rough: 0.5 }), 0, 0.5, 0));
  for (let i = 0; i < 2; i++) g.add(mesh(cyl(0.305, 0.315, 0.12, 16), styl({ color: 0xffffff, rough: 0.5 }), 0, 0.35 + i * 0.35, 0));
  const arrow = signBoard('↻ TURN', 1.2, 0.35, '#ff7a2f', '#1d2a3a');
  arrow.position.set(0, 1.35, 0);
  g.add(arrow);
  return { obj: g };
}

function parkingBay(p: PropDef, w: World): PropBuild {
  const g = new THREE.Group();
  const paint = styl({ color: 0xf3e9cf, rough: 0.8, noise: 0.25, noiseScale: 0.3, emissive: 0x000000, polygonOffset: 1 });
  const W = 3.2;
  const D = 5.6;
  for (const s of [-1, 1]) g.add(mesh(rbox(0.14, 0.006, D, 0.001), paint, (s * W) / 2, 0, 0));
  g.add(mesh(rbox(W, 0.006, 0.14, 0.001), paint, 0, 0, -D / 2));
  const tex = textTexture([{ text: str(p, 'label', 'BAY'), size: 150, color: '#f3e9cf', y: 128 }], 512, 256);
  const txt = mesh(new THREE.PlaneGeometry(2.4, 1.2), styl({ map: tex, transparent: true, rough: 0.8, noise: 0.2, polygonOffset: 2 }), 0, 0.004, 1.2);
  txt.rotation.x = -Math.PI / 2;
  g.add(txt);
  const glow = mesh(new THREE.PlaneGeometry(W, D), styl({ color: 0x5fd08a, emissive: 0x5fd08a, emissiveIntensity: 0.6, transparent: true, opacity: 0, depthWrite: false, noise: 0, polygonOffset: 3 }), 0, 0.01, 0);
  glow.rotation.x = -Math.PI / 2;
  g.add(glow);
  return {
    obj: g,
    update: (_dt, t) => {
      const on = w.currentBeat()?.id === 'park';
      (glow.material as THREE.MeshStandardMaterial).opacity = on ? 0.18 + 0.12 * Math.sin(t * 4) : 0;
    },
  };
}

function arrow(): PropBuild {
  const s = new THREE.Shape();
  s.moveTo(-0.5, -1.2);
  s.lineTo(0.5, -1.2);
  s.lineTo(0.5, 0.2);
  s.lineTo(1.1, 0.2);
  s.lineTo(0, 1.3);
  s.lineTo(-1.1, 0.2);
  s.lineTo(-0.5, 0.2);
  s.closePath();
  const m = mesh(new THREE.ShapeGeometry(s), styl({ color: 0xf3e9cf, rough: 0.8, noise: 0.25, polygonOffset: 2, transparent: true, opacity: 0.9 }));
  m.rotation.x = -Math.PI / 2;
  m.rotation.z = Math.PI;
  m.castShadow = false;
  return { obj: m };
}

function ramp(p: PropDef): PropBuild {
  const g = new THREE.Group();
  const w = num(p, 'w', 3);
  const l = num(p, 'l', 4.8);
  const deck = mesh(rbox(w, 0.24, l, 0.03), MAT.wood(0xb88a5c), 0, 0, 0);
  deck.rotation.x = num(p, 'pitch', 0.24);
  g.add(deck);
  for (let i = 0; i < 6; i++) {
    const plank = mesh(rbox(w, 0.02, 0.05, 0.01), MAT.wood(0x8a5f38), 0, 0.13, -l / 2 + (i + 0.5) * (l / 6));
    deck.add(plank);
  }
  const stripe = mesh(rbox(w, 0.02, 0.2, 0.01), styl({ color: C.yellow, rough: 0.6 }), 0, 0.13, -l / 2 + 0.1);
  deck.add(stripe);
  return { obj: g };
}

function container(p: PropDef): PropBuild {
  const g = new THREE.Group();
  const col = num(p, 'color', 0x3a6f8f);
  const m = paintMat(col, 0.6);
  g.add(mesh(rbox(6, 2.6, 2.4, 0.04), m, 0, 1.3, 0));
  for (let x = -2.8; x <= 2.8; x += 0.28) {
    for (const s of [-1, 1]) {
      const r = mesh(rbox(0.1, 2.3, 0.05, 0.02), m, x, 1.3, s * 1.22);
      r.castShadow = false;
      g.add(r);
    }
  }
  const tex = textTexture([{ text: 'COMPANY LOGISTICS', size: 90, color: '#f3e9cf', y: 128 }], 1024, 256);
  for (const s of [-1, 1]) {
    const l = mesh(new THREE.PlaneGeometry(3.6, 0.9), styl({ map: tex, transparent: true, rough: 0.6, polygonOffset: 2 }), 0, 1.7, s * 1.255);
    if (s < 0) l.rotation.y = Math.PI;
    g.add(l);
  }
  return { obj: g };
}

function pallet(): PropBuild {
  const g = new THREE.Group();
  const w = MAT.wood(0xc49a6c);
  for (let i = 0; i < 5; i++) g.add(mesh(rbox(1.2, 0.03, 0.16, 0.01), w, 0, 0.135, -0.42 + i * 0.21));
  for (const x of [-0.5, 0, 0.5]) g.add(mesh(rbox(0.1, 0.1, 1.0, 0.01), w, x, 0.05, 0));
  return { obj: g };
}

function lampPost(p: PropDef): PropBuild {
  const g = new THREE.Group();
  const m = paintMat(0x2b2f38);
  g.add(mesh(cyl(0.07, 0.1, 5.5, 10), m, 0, 2.75, 0));
  g.add(mesh(rbox(1.0, 0.08, 0.1, 0.03), m, 0.45, 5.4, 0));
  const head = mesh(rbox(0.5, 0.15, 0.3, 0.05), m, 0.9, 5.3, 0);
  g.add(head);
  const lens = MAT.glow(0xfff0c8, 0.6);
  g.add(mesh(rbox(0.44, 0.02, 0.24, 0.01), lens, 0.9, 5.22, 0));
  if (!p.p?.on) return { obj: g };
  // a real sodium-ish floodlight that comes on at dusk
  const light = new THREE.SpotLight(0xffe2b0, 0, 30, 0.9, 0.6, 1.2);
  light.position.set(0.9, 5.1, 0);
  light.target.position.set(3, 0, 0);
  g.add(light, light.target);
  return {
    obj: g,
    update: (_dt, _t, w) => {
      const dusk = Math.min(1, Math.max(0, (w.hour - 19.4) / 0.8));
      light.intensity = dusk * 40;
      lens.emissiveIntensity = 0.6 + dusk * 3;
    },
  };
}

function flagPole(_p: PropDef): PropBuild {
  const g = new THREE.Group();
  g.add(mesh(cyl(0.05, 0.07, 9, 10), MAT.metal(0xc5ccd6), 0, 4.5, 0));
  const flag = new THREE.Group();
  flag.position.set(0, 8.4, 0);
  const segs: THREE.Mesh[] = [];
  const mat = styl({ color: C.orange, rough: 0.8, side: THREE.DoubleSide, wind: 0 });
  for (let i = 0; i < 6; i++) {
    const s = mesh(new THREE.PlaneGeometry(0.3, 0.9), mat, 0.15 + i * 0.3, 0, 0);
    flag.add(s);
    segs.push(s);
  }
  g.add(flag);
  return {
    obj: g,
    update: (_dt, t) => {
      segs.forEach((s, i) => {
        s.position.z = Math.sin(t * 4 - i * 0.9) * 0.08 * i * 0.4;
        s.rotation.y = Math.cos(t * 4 - i * 0.9) * 0.3;
      });
    },
  };
}

function billboard(p: PropDef): PropBuild {
  const g = new THREE.Group();
  const m = paintMat(0x2b2f38);
  for (const x of [-3, 3]) g.add(mesh(rbox(0.25, 5, 0.25, 0.04), m, x, 2.5, 0));
  const b = signBoard(str(p, 'text', 'THE COMPANY'), 9, 3, '#1d2a3a', '#f3e9cf', '#ff7a2f', str(p, 'sub', ''));
  b.position.y = 5.5;
  g.add(b);
  return { obj: g };
}

function waterTower(): PropBuild {
  const g = new THREE.Group();
  const m = paintMat(0x9aa4ad, 0.5);
  for (const [x, z] of [
    [-1.6, -1.6],
    [1.6, -1.6],
    [-1.6, 1.6],
    [1.6, 1.6],
  ])
    g.add(mesh(cyl(0.12, 0.15, 12, 8), m, x, 6, z));
  const tank = mesh(lathe('tower', [[0, 11.5], [2.6, 11.8], [3.0, 13], [3.0, 16], [2.2, 17.2], [0, 17.6]], 20), paintMat(C.cream, 0.5));
  g.add(tank);
  const band = mesh(cyl(3.02, 3.02, 0.6, 24, true), styl({ color: C.orange, rough: 0.5 }), 0, 14.4, 0);
  g.add(band);
  return { obj: g };
}

function powerPole(): PropBuild {
  const g = new THREE.Group();
  const wood = MAT.wood(0x7a5a3a);
  g.add(mesh(cyl(0.12, 0.16, 9, 8), wood, 0, 4.5, 0));
  g.add(mesh(rbox(2.2, 0.12, 0.12, 0.02), wood, 0, 8.4, 0));
  for (const x of [-0.9, 0, 0.9]) g.add(mesh(cyl(0.05, 0.06, 0.18, 8), styl({ color: 0x5f8f6f, rough: 0.3 }), x, 8.55, 0));
  return { obj: g };
}

function spray(p: PropDef): PropBuild {
  const tex = textTexture([{ text: str(p, 'text', '→'), size: 120, color: '#f3e9cf', y: 128, font: 'italic 800' }], 512, 256);
  const m = mesh(new THREE.PlaneGeometry(1.8, 0.9), styl({ map: tex, transparent: true, rough: 0.8, polygonOffset: 2 }));
  m.rotation.y = Math.PI;
  return { obj: m };
}

function rollup(): THREE.Group {
  const g = new THREE.Group();
  return g;
}

export const PROPS = {
  lockers,
  bench,
  coffee,
  clock,
  poster,
  lamp,
  tireRack,
  shelf,
  jerryRack,
  crate,
  crateStack,
  workbench,
  toolWall,
  toolChest,
  compressor,
  drum,
  partsWasher,
  scrapBin,
  tirePile,
  liftPost,
  liftArms,
  van,
  board,
  radio,
  fan,
  oilStain,
  fence,
  barrier,
  gate,
  turnPost,
  parkingBay,
  arrow,
  ramp,
  container,
  pallet,
  lampPost,
  flagPole,
  billboard,
  waterTower,
  powerPole,
  spray,
};
void rollup;
void cone;
