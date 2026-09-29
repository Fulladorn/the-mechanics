import * as THREE from 'three';
import { MAT, carPaint, styl } from '../stylized';
import { cyl, mesh, profile, rbox, textTexture, tube } from '../shapes';
import { wheelModel } from '../itemModels';
import { beam, benchSeat, dashboard, headlamp, mirror, steeringWheel, tailLamp, type VehicleModel } from './parts';

// The Ridgeback: a square-shouldered eighties 4×4. Body frame — origin at the
// body centre, ground at y ≈ -1.02, nose toward -Z, +X to the right.
//
// Same construction as Betsy (bevelled profile extrusions for the soft toy
// silhouette), plus the off-road kit that makes it read at a glance: black
// fender flares, a bull bar, a snorkel, roof rails and a spare on the back.

const FRONT = -1.36;
const REAR = 1.34;
const HUB = -0.6;
const ARCH = 0.56;

export function buildRidgeback(paintHex = 0xc9cdd2): VehicleModel {
  const root = new THREE.Group();
  root.name = 'ridgeback';
  const body = carPaint(paintHex);
  const accent = carPaint(0x2f5f7a);
  const clad = styl({ color: 0x2c2e33, rough: 0.8, noise: 0.08 });
  const trim = styl({ color: 0x22242a, rough: 0.6 });
  const inner = styl({ color: 0x3a3d44, rough: 0.8 });
  const exterior: THREE.Object3D[] = [];
  const add = (o: THREE.Object3D, ext = true) => {
    root.add(o);
    if (ext) exterior.push(o);
    return o;
  };

  // --- lower body: cab + rear tub (full width), arches cut out ----------------------
  const dz = Math.sqrt(ARCH * ARCH - 0.15 * 0.15);
  const a0 = Math.atan2(0.15, -dz);
  const a1 = Math.atan2(0.15, dz);
  const tub = new THREE.Shape();
  tub.moveTo(-0.95, -0.45);
  tub.lineTo(REAR - dz, -0.45);
  tub.absarc(REAR, HUB, ARCH, a0, a1, true);
  tub.lineTo(2.18, -0.45);
  tub.lineTo(2.2, 0.28);
  tub.lineTo(-0.95, 0.3);
  tub.closePath();
  add(mesh(profile('rbTub', tub, 1.78, 0.07), body));

  // front fenders: side slabs (the engine bay stays hollow)
  const fender = new THREE.Shape();
  fender.moveTo(-2.26, -0.45);
  fender.lineTo(FRONT - dz, -0.45);
  fender.absarc(FRONT, HUB, ARCH, a0, a1, true);
  fender.lineTo(-0.95, -0.45);
  fender.lineTo(-0.95, 0.3);
  fender.lineTo(-2.18, 0.27);
  fender.quadraticCurveTo(-2.3, 0.25, -2.3, 0.1);
  fender.closePath();
  for (const sx of [-1, 1]) {
    const f = mesh(profile('rbFender', fender, 0.2, 0.05), body);
    f.position.x = sx * 0.8;
    add(f);
    // black flares over every arch
    for (const z of [FRONT, REAR]) {
      // A torus arc spun into the wheel plane, centred over the top of the arch.
      const arc = Math.PI * 0.86;
      const flare = mesh(new THREE.TorusGeometry(ARCH + 0.02, 0.06, 6, 20, arc), clad);
      flare.rotation.z = (Math.PI - arc) / 2;
      const pivot = new THREE.Group();
      pivot.add(flare);
      pivot.rotation.y = Math.PI / 2;
      pivot.position.set(sx * 0.93, HUB, z);
      add(pivot);
      const liner = mesh(cyl(ARCH - 0.02, ARCH - 0.02, 0.36, 20, true), inner);
      liner.rotation.z = Math.PI / 2;
      liner.position.set(sx * 0.66, HUB, z);
      add(liner, false);
    }
    // lower cladding + rock sliders
    const band = mesh(rbox(0.04, 0.2, 1.3, 0.02), clad);
    band.position.set(sx * 0.91, -0.34, -0.02);
    add(band);
    const slider = mesh(rbox(0.12, 0.08, 1.4, 0.03), trim);
    slider.position.set(sx * 0.9, -0.52, -0.02);
    add(slider);
    // two-tone stripe
    const stripe = mesh(rbox(0.012, 0.06, 4.1, 0.006), accent);
    stripe.position.set(sx * 0.9, 0.05, 0.02);
    add(stripe);
  }

  // grille + lamps + bull bar ------------------------------------------------------------
  const grillePanel = mesh(rbox(1.56, 0.56, 0.1, 0.04), body);
  grillePanel.position.set(0, -0.06, -2.24);
  add(grillePanel);
  const grille = mesh(rbox(0.9, 0.3, 0.05, 0.02), trim);
  grille.position.set(0, -0.02, -2.29);
  add(grille);
  for (let i = 0; i < 5; i++) {
    const slat = mesh(rbox(0.035, 0.28, 0.03, 0.01), MAT.metal(0x9aa0a8, 0.4));
    slat.position.set(-0.36 + i * 0.18, -0.02, -2.31);
    add(slat);
  }
  const headLamps: THREE.MeshStandardMaterial[] = [];
  const beams: THREE.SpotLight[] = [];
  for (const sx of [-1, 1]) {
    const surround = mesh(rbox(0.26, 0.24, 0.06, 0.04), trim);
    surround.position.set(sx * 0.62, -0.02, -2.28);
    add(surround);
    const h = headlamp(0.095);
    h.g.position.set(sx * 0.62, -0.02, -2.32);
    add(h.g);
    headLamps.push(h.lens);
    const ind = mesh(rbox(0.1, 0.05, 0.03, 0.015), styl({ color: 0xffb347, emissive: 0xff9020, emissiveIntensity: 0.1, rough: 0.3 }));
    ind.position.set(sx * 0.62, -0.2, -2.3);
    add(ind);
    const b = beam();
    b.position.set(sx * 0.62, -0.02, -2.4);
    b.target.position.set(sx * 0.9, -1.6, -16);
    root.add(b, b.target);
    beams.push(b);
  }
  const bar = MAT.metal(0x2c2e33, 0.35);
  add(mesh(tube('rbBull', [[-0.72, -0.42, -2.42], [-0.72, 0.06, -2.5], [-0.3, 0.14, -2.52], [0.3, 0.14, -2.52], [0.72, 0.06, -2.5], [0.72, -0.42, -2.42]], 0.035, 40, 8), bar));
  for (const sx of [-1, 1]) add(mesh(tube(`rbBullV${sx}`, [[sx * 0.3, -0.4, -2.45], [sx * 0.3, 0.14, -2.52]], 0.03, 6, 8), bar));
  const bumperF = mesh(rbox(1.9, 0.2, 0.2, 0.05), trim);
  bumperF.position.set(0, -0.42, -2.36);
  add(bumperF);

  // hood: hinged at the cowl -------------------------------------------------------------
  const hood = new THREE.Group();
  hood.name = 'hood';
  hood.position.set(0, 0.3, -0.95);
  const hoodShape = new THREE.Shape();
  hoodShape.moveTo(0, 0.02);
  hoodShape.lineTo(-1.26, -0.02);
  hoodShape.quadraticCurveTo(-1.34, -0.03, -1.34, -0.1);
  hoodShape.lineTo(-1.3, -0.14);
  hoodShape.lineTo(0, -0.04);
  hoodShape.closePath();
  hood.add(mesh(profile('rbHood', hoodShape, 1.62, 0.035), body));
  const bulge = mesh(rbox(0.7, 0.05, 0.9, 0.03), body);
  bulge.position.set(0, 0.04, -0.62);
  hood.add(bulge);
  const scoop = mesh(rbox(0.3, 0.04, 0.12, 0.02), trim);
  scoop.position.set(0, 0.07, -0.95);
  hood.add(scoop);
  add(hood);

  // engine bay ---------------------------------------------------------------------------
  const bayFloor = mesh(rbox(1.4, 0.06, 1.24, 0.02), inner);
  bayFloor.position.set(0, -0.32, -1.6);
  add(bayFloor, false);
  const firewall = mesh(rbox(1.54, 0.64, 0.05, 0.02), inner);
  firewall.position.set(0, 0.0, -0.96);
  add(firewall, false);
  const engine = new THREE.Group();
  const block = mesh(rbox(0.5, 0.36, 0.64, 0.06), styl({ color: 0x7a2a26, rough: 0.5, metal: 0.4 }));
  block.position.set(-0.08, -0.12, -1.42);
  engine.add(block);
  const cover = mesh(rbox(0.4, 0.08, 0.58, 0.03), MAT.darkMetal(0x3a3d44));
  cover.position.set(-0.08, 0.1, -1.42);
  engine.add(cover);
  const radiator = mesh(rbox(1.04, 0.46, 0.08, 0.02), styl({ color: 0x2a2c31, rough: 0.5, metal: 0.5 }));
  radiator.position.set(0, -0.06, -2.08);
  engine.add(radiator);
  const radCap = mesh(cyl(0.05, 0.05, 0.03, 14), MAT.chrome());
  radCap.position.set(-0.2, 0.2, -1.95);
  engine.add(radCap);
  const expTank = mesh(rbox(0.14, 0.16, 0.1, 0.03), styl({ color: 0xe8e2d0, rough: 0.4, transparent: true, opacity: 0.85 }));
  expTank.position.set(-0.52, 0.02, -1.85);
  engine.add(expTank);
  const tray = mesh(rbox(0.4, 0.04, 0.28, 0.01), MAT.darkMetal());
  tray.position.set(0.46, -0.04, -1.55);
  engine.add(tray);
  add(engine, false);

  // snorkel (passenger A-pillar) -----------------------------------------------------------
  add(mesh(tube('rbSnorkel', [[0.93, 0.1, -1.1], [0.95, 0.4, -0.98], [0.93, 1.0, -0.86], [0.9, 1.12, -0.84]], 0.045, 20, 10), clad));
  const snorkelHead = mesh(rbox(0.12, 0.1, 0.16, 0.04), clad);
  snorkelHead.position.set(0.9, 1.16, -0.86);
  add(snorkelHead);

  // greenhouse: long roof, upright glass -----------------------------------------------------
  const glass = MAT.glass(0x5f8fb4, 0.55);
  const roof = mesh(rbox(1.68, 0.09, 3.02, 0.05), body);
  roof.position.set(0, 1.08, 0.62);
  add(roof);
  for (const [z, w] of [
    [-0.86, 0.1],
    [0.22, 0.12],
    [1.24, 0.12],
    [2.1, 0.14],
  ] as [number, number][]) {
    for (const sx of [-1, 1]) {
      const p = mesh(rbox(0.09, 0.8, w, 0.035), trim);
      p.position.set(sx * 0.82, 0.68, z);
      if (z < 0) p.rotation.x = 0.22;
      add(p);
    }
  }
  for (const sx of [-1, 1]) {
    for (const [z0, z1] of [
      [-0.8, 0.16],
      [0.3, 1.18],
      [1.32, 2.04],
    ]) {
      const win = mesh(rbox(0.012, 0.62, z1 - z0, 0.01), glass);
      win.position.set(sx * 0.83, 0.7, (z0 + z1) / 2);
      add(win);
    }
    const m = mirror(sx as -1 | 1);
    m.position.set(sx * 0.9, 0.5, -0.82);
    add(m);
    const handle = mesh(rbox(0.03, 0.03, 0.14, 0.012), MAT.chrome());
    handle.position.set(sx * 0.9, 0.22, -0.1);
    add(handle);
  }
  const windshield = mesh(rbox(1.56, 0.72, 0.012, 0.01), glass);
  windshield.position.set(0, 0.7, -0.88);
  windshield.rotation.x = 0.22;
  add(windshield);
  const rearGlass = mesh(rbox(1.3, 0.56, 0.012, 0.01), glass);
  rearGlass.position.set(0, 0.72, 2.17);
  add(rearGlass);

  // roof rails
  for (const sx of [-1, 1]) {
    const rail = mesh(rbox(0.05, 0.05, 2.6, 0.02), trim);
    rail.position.set(sx * 0.72, 1.2, 0.7);
    add(rail);
    for (const z of [-0.5, 0.7, 1.9]) {
      const foot = mesh(rbox(0.06, 0.08, 0.06, 0.02), trim);
      foot.position.set(sx * 0.72, 1.14, z);
      add(foot);
    }
  }
  for (const z of [-0.4, 0.4, 1.2, 1.9]) {
    const cross = mesh(rbox(1.44, 0.035, 0.04, 0.015), trim);
    cross.position.set(0, 1.22, z);
    add(cross);
  }

  // name on the rear quarters
  const badge = textTexture([{ text: 'RIDGEBACK 4×4', size: 58, color: '#2f5f7a', y: 128 }], 512, 256);
  const badgeMat = styl({ map: badge, transparent: true, rough: 0.5, noise: 0, polygonOffset: 2 });
  for (const sx of [-1, 1]) {
    const d = mesh(new THREE.PlaneGeometry(0.9, 0.45), badgeMat);
    d.position.set(sx * 0.905, 0.12, 1.8);
    d.rotation.y = (sx * Math.PI) / 2;
    add(d);
  }

  // rear: tail lamps, bumper, spare wheel ------------------------------------------------------
  const tailLamps: THREE.MeshStandardMaterial[] = [];
  for (const sx of [-1, 1]) {
    const t = tailLamp(0.1, 0.34);
    t.m.position.set(sx * 0.8, 0.0, 2.22);
    add(t.m);
    tailLamps.push(t.mat);
  }
  const bumperR = mesh(rbox(1.86, 0.18, 0.18, 0.05), trim);
  bumperR.position.set(0, -0.42, 2.26);
  add(bumperR);
  const spare = wheelModel(0.42, 0.28, 'offroad', false);
  spare.rotation.x = Math.PI / 2;
  spare.position.set(0.2, 0.0, 2.38);
  add(spare);
  const spareMount = mesh(rbox(0.12, 0.3, 0.1, 0.03), trim);
  spareMount.position.set(0.2, 0.0, 2.25);
  add(spareMount);

  // underneath -------------------------------------------------------------------------------
  const frame = styl({ color: 0x23252a, rough: 0.7 });
  for (const sx of [-1, 1]) {
    const rail = mesh(rbox(0.1, 0.14, 4.2, 0.02), frame);
    rail.position.set(sx * 0.46, -0.6, 0);
    add(rail);
  }
  for (const z of [FRONT, REAR]) {
    const axle = mesh(cyl(0.07, 0.07, 1.6, 10), frame);
    axle.rotation.z = Math.PI / 2;
    axle.position.set(0, HUB, z);
    add(axle);
    const diff = mesh(new THREE.SphereGeometry(0.16, 12, 10), frame);
    diff.position.set(0.1, HUB, z);
    add(diff);
  }
  const tank = mesh(rbox(0.6, 0.26, 0.7, 0.06), frame);
  tank.position.set(0.3, -0.5, 1.0);
  add(tank);
  // the fuel line runs along the passenger rail to the tank
  const lineRun = mesh(tube('rbFuelRun', [[0.62, -0.5, -0.6], [0.62, -0.5, 0.45]], 0.012, 8, 6), MAT.metal(0x8d939c));
  add(lineRun);
  const exhaust = mesh(tube('rbExh', [[-0.3, -0.62, -0.8], [-0.35, -0.64, 0.8], [-0.6, -0.64, 2.1], [-0.62, -0.62, 2.34]], 0.04), MAT.metal(0x7c8189));
  add(exhaust);
  const filler = mesh(cyl(0.065, 0.065, 0.04, 16), MAT.chrome());
  filler.rotation.z = Math.PI / 2;
  filler.position.set(0.93, 0.2, 1.2);
  add(filler);
  // ignition panel housing (driver side, behind the front wheel)
  const ignBox = mesh(rbox(0.04, 0.26, 0.34, 0.02), trim);
  ignBox.position.set(-0.92, 0.04, -0.82);
  add(ignBox);

  // interior -----------------------------------------------------------------------------------
  const dash = dashboard(1.58, 0x33363c);
  dash.position.set(0, 0.6, -0.72);
  add(dash, false);
  for (const sx of [-1, 1]) {
    const seat = benchSeat(0.58, 0x6b5a48);
    seat.position.set(sx * 0.38, 0.36, 0.12);
    add(seat, false);
  }
  const rearSeat = benchSeat(1.5, 0x6b5a48);
  rearSeat.position.set(0, 0.36, 1.1);
  add(rearSeat, false);
  const column = mesh(cyl(0.025, 0.03, 0.4, 10), styl({ color: 0x1c1d21, rough: 0.6 }));
  column.position.set(-0.38, 0.58, -0.58);
  column.rotation.x = 1.0;
  add(column, false);
  const steering = steeringWheel(0.18);
  steering.position.set(-0.38, 0.72, -0.44);
  steering.rotation.x = -0.6;
  add(steering, false);
  const transfer = mesh(cyl(0.012, 0.012, 0.3, 8), MAT.chrome());
  transfer.position.set(0.05, 0.42, -0.42);
  transfer.rotation.x = 0.35;
  add(transfer, false);
  const rearview = mesh(rbox(0.22, 0.06, 0.02, 0.01), MAT.chrome());
  rearview.position.set(0, 0.98, -0.76);
  add(rearview, false);

  root.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });

  return {
    root,
    hood,
    hoodOpen: 1.15,
    paint: [body],
    headLamps,
    tailLamps,
    beams,
    steering,
    exterior,
    wheel: { radius: 0.42, width: 0.3, variant: 'offroad' },
  };
}
