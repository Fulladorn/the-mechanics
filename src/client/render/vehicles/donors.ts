import * as THREE from 'three';
import { MAT, carPaint, styl } from '../stylized';
import { cyl, mesh, profile, rbox, textTexture, tube } from '../shapes';
import { wheelModel } from '../itemModels';
import { beam, headlamp, tailLamp, type VehicleModel } from './parts';

// The supporting cast: the ranger's quad bike, the Halvorsen logging truck and
// the sawmill generator. Same body-frame conventions as the hero vehicles.

// --- ATV ----------------------------------------------------------------------------------

export function buildAtv(paintHex = 0x3f6d3a): VehicleModel {
  const root = new THREE.Group();
  root.name = 'atv';
  const body = carPaint(paintHex);
  const black = styl({ color: 0x1f2126, rough: 0.7 });
  const seatMat = styl({ color: 0x2a2724, rough: 0.6, noise: 0.08 });
  const tubeMat = MAT.metal(0x2e3036, 0.4);
  const exterior: THREE.Object3D[] = [];
  const add = (o: THREE.Object3D) => {
    root.add(o);
    exterior.push(o);
    return o;
  };

  // central tub + tank + seat
  const tub = mesh(rbox(0.6, 0.26, 1.2, 0.1), body);
  tub.position.set(0, 0.04, 0.02);
  add(tub);
  const tank = mesh(rbox(0.46, 0.22, 0.42, 0.1), body);
  tank.position.set(0, 0.24, -0.2);
  add(tank);
  const seat = mesh(rbox(0.36, 0.12, 0.62, 0.06), seatMat);
  seat.position.set(0, 0.28, 0.24);
  add(seat);
  // fenders: rounded shells over each wheel pair
  const fenderShape = new THREE.Shape();
  fenderShape.moveTo(-0.42, 0);
  fenderShape.quadraticCurveTo(-0.4, 0.26, 0, 0.3);
  fenderShape.quadraticCurveTo(0.4, 0.26, 0.42, 0);
  fenderShape.lineTo(0.36, 0);
  fenderShape.quadraticCurveTo(0.34, 0.2, 0, 0.24);
  fenderShape.quadraticCurveTo(-0.34, 0.2, -0.36, 0);
  fenderShape.closePath();
  for (const z of [-0.62, 0.62]) {
    for (const sx of [-1, 1]) {
      const f = mesh(profile('atvFender', fenderShape, 0.3, 0.03), body);
      f.position.set(sx * 0.5, -0.12, z);
      add(f);
    }
    const bridge = mesh(rbox(0.8, 0.05, 0.5, 0.02), body);
    bridge.position.set(0, 0.14, z);
    add(bridge);
  }
  // handlebars + headlight
  add(mesh(tube('atvBars', [[-0.36, 0.52, -0.38], [-0.14, 0.5, -0.42], [0.14, 0.5, -0.42], [0.36, 0.52, -0.38]], 0.018, 16, 8), tubeMat));
  add(mesh(tube('atvStem', [[0, 0.22, -0.34], [0, 0.5, -0.42]], 0.025, 6, 8), tubeMat));
  for (const sx of [-1, 1]) {
    const grip = mesh(cyl(0.025, 0.025, 0.12, 10), black);
    grip.rotation.z = Math.PI / 2;
    grip.position.set(sx * 0.38, 0.52, -0.38);
    add(grip);
  }
  const headLamps: THREE.MeshStandardMaterial[] = [];
  const h = headlamp(0.07);
  h.g.position.set(0, 0.2, -0.86);
  add(h.g);
  headLamps.push(h.lens);
  const beams = [beam()];
  beams[0].position.set(0, 0.2, -0.9);
  beams[0].target.position.set(0, -1, -12);
  root.add(beams[0], beams[0].target);
  const tailLamps: THREE.MeshStandardMaterial[] = [];
  const t = tailLamp(0.12, 0.05);
  t.m.position.set(0, 0.06, 0.92);
  add(t.m);
  tailLamps.push(t.mat);
  // racks: front and the cargo rack at the back
  for (const [z, w] of [
    [-0.72, 0.36],
    [0.72, 0.42],
  ] as [number, number][]) {
    const y = z > 0 ? 0.36 : 0.26;
    for (const sx of [-1, 1]) add(mesh(tube(`atvRackS${z}${sx}`, [[sx * 0.34, y, z - w / 2], [sx * 0.34, y, z + w / 2]], 0.014, 4, 6), tubeMat));
    for (let i = 0; i < 4; i++) {
      const zz = z - w / 2 + (i / 3) * w;
      add(mesh(tube(`atvRackC${z}${i}`, [[-0.34, y, zz], [0.34, y, zz]], 0.012, 4, 6), tubeMat));
    }
  }
  // engine and footwells
  const engine = mesh(rbox(0.34, 0.26, 0.4, 0.05), MAT.darkMetal(0x3a3d44));
  engine.position.set(0, -0.12, 0.04);
  add(engine);
  for (const sx of [-1, 1]) {
    const well = mesh(rbox(0.16, 0.03, 0.34, 0.01), black);
    well.position.set(sx * 0.36, -0.08, 0.05);
    add(well);
  }
  add(mesh(tube('atvExh', [[0.18, -0.1, 0.1], [0.24, 0.04, 0.6], [0.26, 0.1, 0.86]], 0.03, 10, 8), MAT.metal(0x7c8189)));
  const decal = textTexture([{ text: 'KESTREL RIDGE · RANGER', size: 44, color: '#f3e9cf', y: 128 }], 512, 256);
  const decalMat = styl({ map: decal, transparent: true, rough: 0.5, noise: 0, polygonOffset: 2 });
  for (const sx of [-1, 1]) {
    const d = mesh(new THREE.PlaneGeometry(0.5, 0.25), decalMat);
    d.position.set(sx * 0.305, 0.04, 0.02);
    d.rotation.y = (sx * Math.PI) / 2;
    add(d);
  }

  root.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return { root, hoodOpen: 0, paint: [body], headLamps, tailLamps, beams, exterior, wheel: { radius: 0.3, width: 0.24, variant: 'atv' } };
}

// --- logging truck (static art; the battery box is a machine slot) ------------------------

export function buildLoggingTruck(paintHex = 0xc4862e): THREE.Group {
  const g = new THREE.Group();
  const paint = carPaint(paintHex);
  const dark = styl({ color: 0x24262b, rough: 0.7 });
  const glass = MAT.glass(0x5f8fb4, 0.6);
  // the body frame is centred on the battery box region; ground at y ≈ -1.25
  const G = -1.25;
  // chassis rails
  for (const sx of [-1, 1]) g.add(mesh(rbox(0.16, 0.24, 8.6, 0.03), dark, sx * 0.5, G + 0.85, 1.6));
  // cab (nose at -Z)
  const cab = mesh(rbox(2.3, 1.5, 1.8, 0.14), paint, 0, G + 2.1, -1.6);
  g.add(cab);
  const hood = mesh(rbox(1.6, 0.9, 1.6, 0.16), paint, 0, G + 1.65, -3.2);
  g.add(hood);
  const grille = mesh(rbox(1.2, 0.7, 0.06, 0.03), dark, 0, G + 1.6, -4.02);
  g.add(grille);
  for (let i = 0; i < 6; i++) g.add(mesh(rbox(1.1, 0.04, 0.04, 0.01), MAT.chrome(), 0, G + 1.34 + i * 0.1, -4.06));
  for (const sx of [-1, 1]) {
    const h = headlamp(0.12);
    h.g.position.set(sx * 0.7, G + 1.9, -4.02);
    g.add(h.g);
    const stack = mesh(cyl(0.08, 0.08, 1.8, 12), MAT.chrome(), sx * 1.2, G + 2.7, -0.8);
    g.add(stack);
    const win = mesh(rbox(0.02, 0.6, 1.2, 0.01), glass, sx * 1.16, G + 2.45, -1.6);
    g.add(win);
    const tank = mesh(cyl(0.3, 0.3, 1.1, 18), MAT.metal(0xb8bec8, 0.3));
    tank.rotation.x = Math.PI / 2;
    tank.position.set(sx * 1.05, G + 0.95, -2.2);
    g.add(tank);
  }
  g.add(mesh(rbox(2.1, 0.8, 0.02, 0.01), glass, 0, G + 2.45, -2.51));
  g.add(mesh(rbox(2.4, 0.3, 0.3, 0.08), dark, 0, G + 0.95, -4.15));
  const logo = textTexture([{ text: 'HALVORSEN', size: 80, color: '#f3e9cf', y: 110 }, { text: 'TIMBER CO.', size: 44, color: '#2b2d33', y: 175 }], 512, 256);
  for (const sx of [-1, 1]) {
    const d = mesh(new THREE.PlaneGeometry(1.2, 0.6), styl({ map: logo, transparent: true, rough: 0.5, noise: 0, polygonOffset: 2 }));
    d.position.set(sx * 1.16, G + 1.8, -1.5);
    d.rotation.y = (sx * Math.PI) / 2;
    g.add(d);
  }
  // battery box behind the cab (right side) — the lid is the machine cover
  g.add(mesh(rbox(0.5, 0.3, 0.6, 0.04), dark, 1.2, -0.47, -0.6));
  // the lid: a hinged plate on the outboard edge (named, so the game can
  // highlight it and swing it open)
  const lidPivot = new THREE.Group();
  lidPivot.position.set(1.45, -0.3, -0.6);
  const lid = mesh(rbox(0.52, 0.04, 0.62, 0.02), MAT.darkMetal(0x4a4f58), -0.25, 0.02, 0);
  lidPivot.add(lid);
  lidPivot.name = 'cover:box';
  g.add(lidPivot);
  // log bunk + a load of logs
  const logMat = MAT.wood(0x8a5f3a);
  const endMat = styl({ color: 0xd9b27a, rough: 0.9, noise: 0.2 });
  for (const z of [0.6, 3.4, 5.4]) {
    g.add(mesh(rbox(2.4, 0.2, 0.3, 0.05), dark, 0, G + 1.1, z));
    for (const sx of [-1, 1]) g.add(mesh(rbox(0.12, 1.4, 0.12, 0.03), dark, sx * 1.14, G + 1.8, z));
  }
  let i = 0;
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 4 - row; col++) {
      const r = 0.24 + ((i * 37) % 7) * 0.012;
      const log = mesh(cyl(r, r, 6.2, 14), logMat);
      log.rotation.x = Math.PI / 2;
      log.position.set(-0.78 + col * 0.52 + row * 0.26, G + 1.45 + row * 0.44, 3.0);
      g.add(log);
      for (const e of [-1, 1]) {
        const end = mesh(cyl(r - 0.02, r - 0.02, 0.02, 14), endMat);
        end.rotation.x = Math.PI / 2;
        end.position.set(log.position.x, log.position.y, 3.0 + e * 3.1);
        g.add(end);
      }
      i++;
    }
  }
  // wheels: steer axle + tandem drive axles
  for (const [z, dual] of [
    [-3.0, false],
    [2.2, true],
    [3.6, true],
  ] as [number, boolean][]) {
    for (const sx of [-1, 1]) {
      const w = wheelModel(0.52, 0.34, 'truck', false);
      w.rotation.z = sx < 0 ? Math.PI / 2 : -Math.PI / 2;
      w.position.set(sx * (dual ? 1.02 : 0.98), G + 0.52, z);
      g.add(w);
    }
  }
  const tail = tailLamp(0.2, 0.1);
  tail.m.position.set(0, G + 0.9, 6.2);
  g.add(tail.m);
  g.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return g;
}

// --- generator ---------------------------------------------------------------------------------

export function buildGenerator(): THREE.Group {
  const g = new THREE.Group();
  const frame = MAT.metal(0x2e3036, 0.4);
  const red = styl({ color: 0xc23b2c, rough: 0.45, metal: 0.2 });
  // open tubular frame on skids
  for (const sx of [-1, 1]) {
    g.add(mesh(rbox(0.06, 0.06, 1.0, 0.02), frame, sx * 0.34, 0.04, 0));
    g.add(mesh(tube(`genF${sx}`, [[sx * 0.34, 0.05, -0.46], [sx * 0.34, 0.7, -0.46], [sx * 0.34, 0.7, 0.46], [sx * 0.34, 0.05, 0.46]], 0.02, 16, 6), frame));
  }
  const engine = mesh(rbox(0.5, 0.36, 0.44, 0.06), MAT.darkMetal(0x3a3d44), 0, 0.26, 0.14);
  g.add(engine);
  const alternator = mesh(cyl(0.16, 0.16, 0.34, 18), red);
  alternator.rotation.x = Math.PI / 2;
  alternator.position.set(0, 0.24, -0.26);
  g.add(alternator);
  const tank = mesh(rbox(0.52, 0.18, 0.56, 0.08), red, 0, 0.6, 0);
  g.add(tank);
  const cap = mesh(cyl(0.05, 0.05, 0.03, 12), MAT.chrome(), 0.2, 0.7, 0);
  g.add(cap);
  const panel = mesh(rbox(0.3, 0.16, 0.02, 0.02), styl({ color: 0x1f2126, rough: 0.6 }), 0, 0.34, -0.47);
  g.add(panel);
  const cord = mesh(rbox(0.08, 0.04, 0.03, 0.01), styl({ color: 0x1f2126, rough: 0.5 }), 0.26, 0.38, 0.36);
  cord.name = 'station:pullCord';
  g.add(cord);
  g.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return g;
}
