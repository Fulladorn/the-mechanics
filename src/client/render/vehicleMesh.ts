import * as THREE from 'three';
import type { PartKind, PartVariant } from '../../sim/vehicle';
import { M, carPaint, chrome, glass, paint } from './materials';
import { box, capsule, cyl, extrude, roundedBox, shell, torus, tyre } from './geo';

// The hero prop. The chassis faces -Z, matching the sim: wheels sit at z=∓0.85,
// the nose is at -Z. Every part is built to bolt onto a socket anchor from
// sim/vehicle.ts, so the data contract there is untouched.

const mesh = (g: THREE.BufferGeometry, m: THREE.Material, cast = true): THREE.Mesh => {
  const x = new THREE.Mesh(g, m);
  x.castShadow = cast;
  x.receiveShadow = true;
  return x;
};

const at = <T extends THREE.Object3D>(o: T, x: number, y: number, z: number): T => {
  o.position.set(x, y, z);
  return o;
};

/**
 * Roadster "bathtub" side profile: raised nose, dipped cockpit, kicked-up tail.
 * Extruded across the car's width — this silhouette is what makes it read as a
 * vehicle rather than a stack of cuboids.
 */
const BODY_PROFILE: [number, number][] = [
  [-1.18, -0.22],
  [-1.21, 0.04],
  [-1.05, 0.16],
  [-0.82, 0.21],
  [-0.5, 0.17],
  [-0.34, 0.36],
  [-0.24, 0.37],
  [-0.21, 0.1],
  [0.5, 0.09],
  [0.58, 0.36],
  [1.02, 0.38],
  [1.19, 0.22],
  [1.17, -0.22],
];

function bodyShellGeo(width: number): THREE.BufferGeometry {
  const g = extrude('carBody', BODY_PROFILE, width, 0.05).clone();
  // extrude() lays the profile in XY and extrudes along Z; the car needs its
  // length along Z and its width along X.
  g.rotateY(-Math.PI / 2);
  g.computeVertexNormals();
  return g;
}

/**
 * A mudguard arch over a wheel well. Cloned off the body material so it shares
 * the paint colour but can be double-sided without affecting the hull.
 */
function fender(radius: number, width: number, mat: THREE.MeshPhysicalMaterial): THREE.Mesh {
  const fm = mat.clone();
  fm.side = THREE.DoubleSide;
  const m = mesh(shell(radius, width, Math.PI * 0.06, Math.PI * 0.88, 18), fm);
  m.rotation.z = Math.PI / 2; // axis along X, like the axle
  m.name = 'shell';
  return m;
}

function wheel(shape: string, color: number): THREE.Group {
  const g = new THREE.Group();
  const width = shape === 'slick' ? 0.42 : shape === 'offroad' ? 0.34 : 0.3;
  const radius = shape === 'offroad' ? 0.46 : shape === 'slick' ? 0.4 : 0.41;

  const t = mesh(tyre(radius, width), M.tyre(color));
  g.add(t);

  // rim: dish + spokes + lip, so it catches light instead of reading as a disc
  const rim = mesh(cyl(radius * 0.6, radius * 0.6, width * 0.7, 16), chrome(0xc6cedb));
  rim.rotation.z = Math.PI / 2;
  g.add(rim);
  const lip = mesh(torus(radius * 0.62, 0.03, 6, 20), chrome(0xdde3ec));
  lip.rotation.y = Math.PI / 2;
  g.add(at(lip, width * 0.34, 0, 0));
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const spoke = mesh(box(width * 0.42, radius * 0.52, 0.05), chrome(0xb4bccb));
    spoke.rotation.x = a;
    g.add(at(spoke, width * 0.16, Math.cos(a) * radius * 0.28, Math.sin(a) * radius * 0.28));
  }
  const hub = mesh(cyl(0.08, 0.08, width * 0.85, 10), M.painted(0xc0392b, 0.3));
  hub.rotation.z = Math.PI / 2;
  g.add(hub);
  // brake disc peeking through the spokes
  const disc = mesh(cyl(radius * 0.52, radius * 0.52, 0.03, 18), M.steel(0x6d7480, 0.32));
  disc.rotation.z = Math.PI / 2;
  g.add(at(disc, -width * 0.18, 0, 0));

  if (shape === 'offroad') {
    // aggressive shoulder lugs
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const lug = mesh(roundedBox(width + 0.05, 0.1, 0.09, 0.02), M.rubber(0x0e1013));
      lug.rotation.x = a;
      g.add(at(lug, 0, Math.cos(a) * radius, Math.sin(a) * radius));
    }
  }
  return g;
}

function engineBlock(color: number, big: boolean): THREE.Group {
  const g = new THREE.Group();
  const block = mesh(roundedBox(0.92, 0.6, 1.0, 0.06), M.painted(color, 0.4));
  g.add(block);
  g.add(at(mesh(roundedBox(0.62, 0.2, 0.72, 0.04), M.steel(0x9aa2b0, 0.35)), 0, 0.4, 0));
  // intake trumpets — the "it's got a big engine" silhouette
  const n = big ? 4 : 3;
  for (let i = 0; i < n; i++) {
    const x = -((n - 1) / 2) * 0.19 + i * 0.19;
    g.add(at(mesh(cyl(0.075, 0.055, 0.16, 10), chrome(0xd0d7e2)), x, 0.56, 0));
  }
  // headers sweeping out of the block
  for (let i = 0; i < 3; i++) {
    const p = mesh(cyl(0.045, 0.045, 0.44, 8), chrome(0xc8a06a));
    p.rotation.x = Math.PI / 2;
    p.rotation.z = 0.2;
    g.add(at(p, -0.22 + i * 0.22, 0.02, -0.6));
  }
  g.add(at(mesh(roundedBox(0.4, 0.26, 0.1, 0.03), M.darkSteel()), 0, 0.1, 0.53));
  const belt = mesh(torus(0.13, 0.022, 6, 16), M.rubber());
  belt.rotation.y = Math.PI / 2;
  g.add(at(belt, 0.48, 0.08, 0));
  return g;
}

function seat(color: number, racing: boolean): THREE.Group {
  const g = new THREE.Group();
  const mat = M.fabric(color);
  g.add(at(mesh(roundedBox(0.56, 0.14, 0.56, 0.06), mat), 0, 0.07, 0));
  const back = mesh(roundedBox(0.56, racing ? 0.78 : 0.6, 0.14, 0.06), mat);
  back.rotation.x = -0.16;
  g.add(at(back, 0, racing ? 0.46 : 0.37, 0.3));
  if (racing) {
    // bolsters + harness slots sell the bucket seat
    for (const sx of [-1, 1]) {
      const b = mesh(roundedBox(0.1, 0.62, 0.2, 0.05), mat);
      b.rotation.x = -0.16;
      g.add(at(b, sx * 0.26, 0.44, 0.22));
    }
    for (const sx of [-1, 1]) g.add(at(mesh(box(0.09, 0.05, 0.02), M.darkSteel()), sx * 0.13, 0.6, 0.22));
  }
  g.add(at(mesh(roundedBox(0.5, 0.05, 0.1, 0.02), M.darkSteel()), 0, 0.02, -0.2));
  return g;
}

function bodyShell(shape: string, bodyColor: number): THREE.Group {
  const g = new THREE.Group();
  const wide = shape === 'armor' ? 1.86 : 1.66;
  const mat = carPaint(bodyColor);

  const hull = mesh(bodyShellGeo(wide), mat);
  hull.name = 'shell';
  g.add(hull);

  // fenders over all four wheel wells (wheels sit 0.2 below the body anchor)
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const f = fender(0.56, 0.4, mat);
      f.name = 'shell';
      g.add(at(f, sx * 0.85, -0.2, sz * 0.85));
    }

  // cockpit surround / dash lip
  g.add(at(mesh(roundedBox(wide - 0.16, 0.07, 0.14, 0.03), mat), 0, 0.36, -0.28));
  // side sills
  for (const sx of [-1, 1]) g.add(at(mesh(roundedBox(0.1, 0.14, 1.5, 0.04), M.darkSteel()), sx * (wide / 2 - 0.02), -0.12, 0.1));

  // grille + nose vents
  g.add(at(mesh(roundedBox(0.78, 0.2, 0.06, 0.02), M.darkSteel()), 0, 0.0, -1.19));
  for (let i = 0; i < 5; i++)
    g.add(at(mesh(box(0.72, 0.018, 0.03), chrome(0x9aa2b0)), 0, -0.07 + i * 0.035, -1.21));

  // roll bar behind the seat
  const bar = mesh(torus(0.42, 0.045, 8, 18), M.darkSteel(0x3a414d));
  bar.rotation.y = Math.PI / 2;
  g.add(at(bar, 0, 0.4, 0.62));
  for (const sx of [-1, 1]) {
    const brace = mesh(capsule(0.04, 0.34, 4, 8), M.darkSteel(0x3a414d));
    brace.rotation.x = 0.5;
    g.add(at(brace, sx * 0.42, 0.42, 0.82));
  }

  // aero screen
  const scr = mesh(roundedBox(0.86, 0.26, 0.03, 0.012), glass(0xbcd8f0, 0.28), false);
  scr.rotation.x = -0.42;
  g.add(at(scr, 0, 0.5, -0.28));

  // mirrors
  for (const sx of [-1, 1]) {
    g.add(at(mesh(cyl(0.012, 0.012, 0.14, 5), M.darkSteel()), sx * (wide / 2 - 0.06), 0.44, -0.3));
    g.add(at(mesh(roundedBox(0.11, 0.08, 0.03, 0.015), M.darkSteel(0x30363f)), sx * (wide / 2 - 0.06), 0.52, -0.31));
  }

  // steering wheel + column
  const col = mesh(cyl(0.022, 0.022, 0.36, 6), M.darkSteel());
  col.rotation.x = 0.75;
  g.add(at(col, 0, 0.36, -0.16));
  const sw = new THREE.Group();
  sw.name = 'steer';
  const ring = mesh(torus(0.14, 0.022, 6, 18), M.rubber(0x1c1f26));
  sw.add(ring);
  for (let i = 0; i < 3; i++) {
    const sp = mesh(box(0.025, 0.13, 0.015), chrome(0xa8b0be));
    sp.rotation.z = (i / 3) * Math.PI * 2;
    sw.add(at(sp, Math.sin((i / 3) * Math.PI * 2) * 0.07, Math.cos((i / 3) * Math.PI * 2) * 0.07, 0));
  }
  sw.rotation.x = 0.75 + Math.PI / 2;
  g.add(at(sw, 0, 0.48, -0.05));

  if (shape === 'armor') {
    for (const sx of [-1, 1]) {
      const plate = mesh(roundedBox(0.1, 0.42, 1.9, 0.03), M.steel(0x6b7280, 0.55));
      g.add(at(plate, sx * (wide / 2 + 0.03), 0.02, 0));
      for (let i = 0; i < 4; i++)
        g.add(at(mesh(cyl(0.03, 0.03, 0.12, 6), chrome(0x8a919e)), sx * (wide / 2 + 0.06), 0.02, -0.7 + i * 0.47));
    }
    g.add(at(mesh(roundedBox(wide - 0.1, 0.1, 0.5, 0.03), M.steel(0x6b7280, 0.55)), 0, 0.24, -0.95));
  }
  if (shape === 'light') {
    // exposed carbon-ish weave panels on the flanks
    for (const sx of [-1, 1])
      g.add(at(mesh(roundedBox(0.03, 0.2, 1.1, 0.01), paint({ color: 0x1b1e24, metalness: 0.6, roughness: 0.28 })), sx * (wide / 2 + 0.01), 0.06, 0.15));
  }
  return g;
}

/** Build the mesh for an installed part variant. */
export function makePart(kind: PartKind, variant: PartVariant, bodyColor: number): THREE.Object3D {
  const col = variant.render.color ?? 0x8a8f99;
  const shape = variant.render.shape ?? '';

  switch (kind) {
    case 'wheel':
      return wheel(shape, col);

    case 'engine':
      return engineBlock(col, variant.id === 'engine.v8');

    case 'battery': {
      const g = new THREE.Group();
      g.add(mesh(roundedBox(0.34, 0.3, 0.48, 0.03), M.plastic(col)));
      g.add(at(mesh(roundedBox(0.3, 0.04, 0.44, 0.015), M.darkSteel()), 0, 0.17, 0));
      for (const sx of [-1, 1]) g.add(at(mesh(cyl(0.035, 0.035, 0.06, 8), chrome(0xd8b46a)), sx * 0.1, 0.21, -0.14));
      g.add(at(mesh(box(0.2, 0.08, 0.01), M.glow(0xf2f4f8, 0.1)), 0, 0.02, 0.245));
      return g;
    }

    case 'seat':
      return seat(col, shape === 'racing' || variant.id === 'seat.racing');

    case 'body':
      return bodyShell(shape, bodyColor);

    case 'bumper': {
      const g = new THREE.Group();
      const wide = shape === '' ? 1.6 : 1.78;
      const bar = mesh(capsule(0.09, wide - 0.18, 5, 10), chrome(col));
      bar.rotation.z = Math.PI / 2;
      g.add(bar);
      for (const sx of [-1, 1]) g.add(at(mesh(roundedBox(0.09, 0.16, 0.22, 0.03), M.darkSteel()), sx * 0.42, 0, 0.12));
      if (shape !== '') {
        // bull bar uprights
        for (const sx of [-0.42, 0, 0.42])
          g.add(at(mesh(capsule(0.05, 0.36, 4, 8), chrome(col)), sx, 0.22, 0));
        const top = mesh(capsule(0.05, wide - 0.5, 4, 8), chrome(col));
        top.rotation.z = Math.PI / 2;
        g.add(at(top, 0, 0.42, 0));
      }
      return g;
    }

    case 'headlights': {
      const g = new THREE.Group();
      for (const sx of [-1, 1]) {
        const housing = mesh(cyl(0.15, 0.13, 0.12, 16), chrome(0xc6cedb));
        housing.rotation.x = Math.PI / 2;
        g.add(at(housing, sx * 0.55, 0, 0.02));
        const lens = mesh(cyl(0.135, 0.135, 0.03, 16), M.glow(0xffffff, 2.6, col), false);
        lens.rotation.x = Math.PI / 2;
        g.add(at(lens, sx * 0.55, 0, -0.05));
        // Real light so the beam actually does something at night / in the cave.
        const beam = new THREE.SpotLight(0xfff2d0, 26, 34, Math.PI / 7, 0.45, 1.4);
        beam.position.set(sx * 0.55, 0, -0.06);
        beam.target.position.set(sx * 0.55, -0.4, -14);
        beam.name = 'headlamp';
        g.add(beam, beam.target);
      }
      return g;
    }

    case 'spoiler': {
      const g = new THREE.Group();
      const wing = mesh(roundedBox(1.44, 0.05, 0.34, 0.022), M.painted(col, 0.35));
      wing.rotation.x = 0.16;
      g.add(at(wing, 0, 0.32, 0));
      for (const sx of [-1, 1]) {
        const strut = mesh(roundedBox(0.05, 0.34, 0.14, 0.02), chrome(0xa8b0be));
        strut.rotation.z = sx * 0.1;
        g.add(at(strut, sx * 0.56, 0.16, 0));
      }
      const gurney = mesh(box(1.44, 0.05, 0.02), M.painted(col, 0.35));
      g.add(at(gurney, 0, 0.37, 0.17));
      return g;
    }

    case 'exhaust': {
      const g = new THREE.Group();
      // A curved tube reads far better than a straight cylinder.
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, 0, -0.42),
        new THREE.Vector3(0.02, 0.05, -0.1),
        new THREE.Vector3(0.0, 0.06, 0.2),
        new THREE.Vector3(-0.02, 0.02, 0.45),
      ]);
      g.add(mesh(new THREE.TubeGeometry(curve, 14, 0.055, 10, false), chrome(col)));
      const tip = mesh(cyl(0.085, 0.065, 0.16, 12), chrome(0xe2e7ef));
      tip.rotation.x = Math.PI / 2;
      g.add(at(tip, -0.02, 0.02, 0.52));
      for (const z of [-0.2, 0.12]) {
        const clamp = mesh(torus(0.062, 0.014, 5, 12), M.darkSteel());
        clamp.rotation.x = Math.PI / 2;
        g.add(at(clamp, 0.01, 0.04, z));
      }
      return g;
    }

    default:
      return new THREE.Group();
  }
}

/** The bare chassis every part bolts onto. */
export function makeChassis(): THREE.Group {
  const g = new THREE.Group();
  const frame = M.steel(0x4a515e, 0.45);

  for (const sx of [-1, 1]) {
    // Side rails kick up over the axles like a real ladder frame.
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(sx * 0.6, 0.42, -1.25),
      new THREE.Vector3(sx * 0.62, 0.5, -0.85),
      new THREE.Vector3(sx * 0.6, 0.4, -0.2),
      new THREE.Vector3(sx * 0.6, 0.4, 0.4),
      new THREE.Vector3(sx * 0.62, 0.5, 0.85),
      new THREE.Vector3(sx * 0.6, 0.42, 1.25),
    ]);
    g.add(mesh(new THREE.TubeGeometry(curve, 20, 0.075, 8, false), frame));
  }
  for (const z of [-0.9, -0.1, 0.9]) g.add(at(mesh(roundedBox(1.32, 0.11, 0.13, 0.03), frame), 0, 0.44, z));
  // floor pan
  g.add(at(mesh(roundedBox(1.26, 0.06, 1.86, 0.02), paint({ color: 0x2a2f38, metalness: 0.45, roughness: 0.6 })), 0, 0.4, 0));
  // axles + suspension arms, so the wheels visibly attach to something
  for (const sz of [-0.85, 0.85]) {
    g.add(at(mesh(cyl(0.045, 0.045, 1.7, 8), M.darkSteel()).rotateZ(Math.PI / 2), 0, 0.4, sz));
    for (const sx of [-1, 1]) {
      const spring = mesh(cyl(0.055, 0.055, 0.3, 6), M.painted(0xd14b3a, 0.4));
      spring.rotation.z = sx * 0.28;
      g.add(at(spring, sx * 0.72, 0.56, sz));
    }
  }
  // radiator + nose cone so the bare chassis still has a "front"
  g.add(at(mesh(roundedBox(0.72, 0.34, 0.09, 0.02), M.steel(0x7a828f, 0.5)), 0, 0.5, -1.1));
  g.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return g;
}
