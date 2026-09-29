import * as THREE from 'three';
import { MAT, carPaint, styl } from '../stylized';
import { cyl, lathe, mesh, profile, rbox, textTexture, torus, tube } from '../shapes';
import { beam, benchSeat, bumper, dashboard, headlamp, mirror, steeringWheel, tailLamp, type VehicleModel } from './parts';

// Betsy: a friendly seventies half-ton. Built in the vehicle body frame —
// origin at the body centre, ground at y ≈ -0.87, nose toward -Z.
//
// Construction: bevelled side-profile extrusions for the fenders, doors and
// bed sides (that's what gives the soft, toy-like silhouette), a hinged hood
// over a real engine bay, and a proper cab interior for the cockpit camera.

const FRONT_ARCH = -1.42;
const REAR_ARCH = 1.36;
const ARCH_R = 0.5;

export function buildBetsy(paintHex = 0x5aa6c8): VehicleModel {
  const root = new THREE.Group();
  root.name = 'betsy';
  const body = carPaint(paintHex);
  const cream = carPaint(0xf3e9cf);
  const trim = styl({ color: 0x2b2d33, rough: 0.6 });
  const inner = styl({ color: 0x3a3d44, rough: 0.8 });
  const exterior: THREE.Object3D[] = [];
  const add = (o: THREE.Object3D, ext = true) => {
    root.add(o);
    if (ext) exterior.push(o);
    return o;
  };

  // --- front fenders + cab lower (one outline, extruded full width) -----------
  // The engine bay is hollow: the full-width extrusion only covers the cab;
  // the fenders ahead of the cowl are thin slabs on each side.
  const cabLower = new THREE.Shape();
  cabLower.moveTo(-1.0, -0.5);
  cabLower.lineTo(0.12, -0.5);
  cabLower.lineTo(0.12, 0.44);
  cabLower.lineTo(-0.98, 0.44);
  cabLower.closePath();
  add(mesh(profile('betsyCab', cabLower, 1.74, 0.06), body));

  const fender = new THREE.Shape();
  fender.moveTo(-2.24, -0.42);
  fender.lineTo(FRONT_ARCH - ARCH_R, -0.42);
  fender.absarc(FRONT_ARCH, -0.42, ARCH_R, Math.PI, 0, true);
  fender.lineTo(-0.96, -0.42);
  fender.lineTo(-0.96, 0.34);
  fender.lineTo(-2.14, 0.28);
  fender.quadraticCurveTo(-2.3, 0.26, -2.3, 0.1);
  fender.closePath();
  for (const sx of [-1, 1]) {
    const f = mesh(profile('betsyFender', fender, 0.2, 0.05), body);
    f.position.x = sx * 0.78;
    add(f);
    // inner wheel-well liner
    const liner = mesh(cyl(ARCH_R - 0.02, ARCH_R - 0.02, 0.36, 20, true), inner);
    liner.rotation.z = Math.PI / 2;
    liner.position.set(sx * 0.62, -0.42, FRONT_ARCH);
    liner.scale.set(1, 1, 1);
    const clip = new THREE.Group();
    clip.add(liner);
    add(clip);
  }
  // radiator support / grille panel
  const grillePanel = mesh(rbox(1.5, 0.52, 0.1, 0.05), body);
  grillePanel.position.set(0, -0.08, -2.22);
  add(grillePanel);
  const grille = mesh(rbox(1.1, 0.34, 0.06, 0.05), styl({ color: 0x1e2026, rough: 0.6 }));
  grille.position.set(0, -0.04, -2.27);
  add(grille);
  for (let i = 0; i < 4; i++) {
    const bar = mesh(rbox(1.06, 0.028, 0.03, 0.012), MAT.chrome());
    bar.position.set(0, -0.16 + i * 0.08, -2.3);
    add(bar);
  }
  const surround = mesh(torus(0.62, 0.025, 6, 40), MAT.chrome());
  surround.scale.set(1, 0.33, 1);
  surround.position.set(0, -0.04, -2.3);
  add(surround);
  const badge = mesh(cyl(0.06, 0.06, 0.02, 20), styl({ color: 0xff7a2f, rough: 0.4, metal: 0.3 }));
  badge.rotation.x = Math.PI / 2;
  badge.position.set(0, 0.12, -2.31);
  add(badge);

  // headlamps + indicators
  const headLamps: THREE.MeshStandardMaterial[] = [];
  const beams: THREE.SpotLight[] = [];
  for (const sx of [-1, 1]) {
    const h = headlamp(0.11);
    h.g.position.set(sx * 0.66, 0.02, -2.3);
    add(h.g);
    headLamps.push(h.lens);
    const pod = mesh(cyl(0.14, 0.15, 0.1, 20), body);
    pod.rotation.x = Math.PI / 2;
    pod.position.set(sx * 0.66, 0.02, -2.25);
    add(pod);
    const ind = mesh(rbox(0.12, 0.05, 0.04, 0.02), styl({ color: 0xffb347, emissive: 0xff9020, emissiveIntensity: 0.1, rough: 0.3 }));
    ind.position.set(sx * 0.66, -0.2, -2.29);
    add(ind);
    const b = beam();
    b.position.set(sx * 0.66, 0.02, -2.35);
    b.target.position.set(sx * 0.9, -1.4, -14);
    root.add(b, b.target);
    beams.push(b);
  }

  // front bumper with rubber over-riders
  const fb = bumper(1.96, 0.16, 0.16);
  fb.position.set(0, -0.36, -2.36);
  add(fb);
  for (const sx of [-1, 1]) {
    const o = mesh(rbox(0.1, 0.2, 0.08, 0.035), MAT.rubber());
    o.position.set(sx * 0.42, -0.34, -2.42);
    add(o);
  }

  // --- hood: hinged at the cowl ------------------------------------------------
  const hood = new THREE.Group();
  hood.name = 'hood';
  hood.position.set(0, 0.35, -0.99);
  const hoodShape = new THREE.Shape();
  hoodShape.moveTo(0, 0);
  hoodShape.lineTo(-1.14, -0.06);
  hoodShape.quadraticCurveTo(-1.26, -0.07, -1.28, -0.14);
  hoodShape.lineTo(-1.26, -0.2);
  hoodShape.lineTo(0, -0.05);
  hoodShape.closePath();
  const hoodPanel = mesh(profile('betsyHood', hoodShape, 1.58, 0.04), body);
  hood.add(hoodPanel);
  const hoodStripe = mesh(rbox(0.3, 0.012, 1.1, 0.005), cream);
  hoodStripe.position.set(0, 0.012, -0.6);
  hoodStripe.rotation.x = 0.05;
  hood.add(hoodStripe);
  const ornament = mesh(rbox(0.05, 0.05, 0.14, 0.02), MAT.chrome());
  ornament.position.set(0, 0.0, -1.14);
  hood.add(ornament);
  add(hood);

  // --- engine bay (visible with the hood up) --------------------------------------
  const bayFloor = mesh(rbox(1.36, 0.06, 1.2, 0.02), inner);
  bayFloor.position.set(0, -0.3, -1.6);
  add(bayFloor, false);
  const firewall = mesh(rbox(1.5, 0.66, 0.05, 0.02), inner);
  firewall.position.set(0, 0.02, -1.0);
  add(firewall, false);
  const engine = new THREE.Group();
  const block = mesh(rbox(0.46, 0.34, 0.62, 0.06), styl({ color: 0x3d6fa8, rough: 0.5, metal: 0.4 }));
  block.position.set(-0.05, -0.1, -1.45);
  engine.add(block);
  const valve = mesh(rbox(0.34, 0.08, 0.56, 0.03), MAT.chrome());
  valve.position.set(-0.05, 0.1, -1.45);
  engine.add(valve);
  const air = mesh(cyl(0.16, 0.16, 0.08, 24), styl({ color: 0x2a2c31, rough: 0.5, metal: 0.4 }));
  air.position.set(-0.05, 0.18, -1.45);
  engine.add(air);
  const airCap = mesh(cyl(0.04, 0.05, 0.03, 12), MAT.chrome());
  airCap.position.set(-0.05, 0.23, -1.45);
  engine.add(airCap);
  const radiator = mesh(rbox(1.0, 0.44, 0.07, 0.02), styl({ color: 0x2a2c31, rough: 0.5, metal: 0.5 }));
  radiator.position.set(0, -0.06, -2.1);
  engine.add(radiator);
  const radHose = mesh(tube('betsyRad', [[-0.2, 0.08, -2.05], [-0.14, 0.12, -1.9], [-0.1, 0.05, -1.76]], 0.03), MAT.rubber());
  engine.add(radHose);
  // battery tray + fuse box housing sit where the machine slots are
  const tray = mesh(rbox(0.38, 0.04, 0.26, 0.01), MAT.darkMetal());
  tray.position.set(0.42, -0.05, -1.62);
  engine.add(tray);
  add(engine, false);

  // --- greenhouse: pillars, roof, glass ------------------------------------------
  const glass = MAT.glass(0x5f8fb4, 0.55);
  const roof = mesh(rbox(1.7, 0.1, 0.84, 0.05), cream);
  roof.position.set(0, 1.0, -0.3);
  add(roof);
  const drip = mesh(rbox(1.68, 0.03, 0.76, 0.015), MAT.chrome());
  drip.position.set(0, 0.955, -0.26);
  add(drip);
  for (const sx of [-1, 1]) {
    // A-pillar (leaning back), B-pillar
    const a = mesh(rbox(0.09, 0.64, 0.09, 0.035), cream);
    a.position.set(sx * 0.8, 0.7, -0.79);
    a.rotation.x = 0.5;
    add(a);
    const b = mesh(rbox(0.09, 0.56, 0.12, 0.035), cream);
    b.position.set(sx * 0.8, 0.72, 0.07);
    add(b);
    // side window
    const win = mesh(rbox(0.012, 0.44, 0.74, 0.01), glass);
    win.position.set(sx * 0.8, 0.7, -0.36);
    add(win);
    const m = mirror(sx as -1 | 1);
    m.position.set(sx * 0.86, 0.56, -0.86);
    add(m);
  }
  const windshield = mesh(rbox(1.52, 0.66, 0.012, 0.01), glass);
  windshield.position.set(0, 0.71, -0.8);
  windshield.rotation.x = 0.5;
  add(windshield);
  const backWall = mesh(rbox(1.62, 0.56, 0.06, 0.02), cream);
  backWall.position.set(0, 0.72, 0.1);
  add(backWall);
  const backWin = mesh(rbox(1.1, 0.26, 0.014, 0.01), glass);
  backWin.position.set(0, 0.78, 0.135);
  add(backWin);

  // door seams, handles, company decal
  const decal = textTexture(
    [
      { text: 'THE COMPANY', size: 64, color: '#ff7a2f', y: 96 },
      { text: 'FLEET · 07 · TRAINING', size: 34, color: '#f3e9cf', y: 160 },
    ],
    512,
    256,
  );
  const decalMat = styl({ map: decal, transparent: true, rough: 0.5, noise: 0, polygonOffset: 2 });
  for (const sx of [-1, 1]) {
    for (const z of [-0.97, 0.08]) {
      const seam = mesh(rbox(0.006, 0.86, 0.01, 0.002), trim);
      seam.position.set(sx * 0.875, -0.03, z);
      add(seam);
    }
    const handle = mesh(rbox(0.03, 0.03, 0.14, 0.012), MAT.chrome());
    handle.position.set(sx * 0.885, 0.3, -0.05);
    add(handle);
    const d = mesh(new THREE.PlaneGeometry(0.8, 0.4), decalMat);
    d.position.set(sx * 0.878, 0.02, -0.44);
    d.rotation.y = (sx * Math.PI) / 2;
    add(d);
    // cream belt stripe
    const stripe = mesh(rbox(0.012, 0.07, 3.3, 0.006), cream);
    stripe.position.set(sx * 0.878, 0.33, 0.55);
    add(stripe);
    // running board
    const step = mesh(rbox(0.22, 0.05, 1.3, 0.02), trim);
    step.position.set(sx * 0.93, -0.5, -0.42);
    add(step);
  }

  // --- bed -----------------------------------------------------------------------
  const bedSide = new THREE.Shape();
  bedSide.moveTo(0.18, -0.42);
  bedSide.lineTo(REAR_ARCH - ARCH_R, -0.42);
  bedSide.absarc(REAR_ARCH, -0.42, ARCH_R, Math.PI, 0, true);
  bedSide.lineTo(2.3, -0.42);
  bedSide.lineTo(2.3, 0.34);
  bedSide.lineTo(0.18, 0.34);
  bedSide.closePath();
  for (const sx of [-1, 1]) {
    const s = mesh(profile('betsyBed', bedSide, 0.14, 0.04), body);
    s.position.x = sx * 0.81;
    add(s);
    const rail = mesh(rbox(0.16, 0.05, 2.16, 0.02), cream);
    rail.position.set(sx * 0.81, 0.36, 1.24);
    add(rail);
    const liner = mesh(cyl(ARCH_R - 0.02, ARCH_R - 0.02, 0.3, 20, true), inner);
    liner.rotation.z = Math.PI / 2;
    liner.position.set(sx * 0.64, -0.42, REAR_ARCH);
    add(liner, false);
  }
  const bedFloor = mesh(rbox(1.5, 0.05, 2.1, 0.01), MAT.wood(0x9a7248));
  bedFloor.position.set(0, -0.12, 1.24);
  add(bedFloor);
  for (let i = 0; i < 5; i++) {
    const strip = mesh(rbox(0.03, 0.02, 2.08, 0.008), MAT.metal(0xb0b6c0));
    strip.position.set(-0.6 + i * 0.3, -0.09, 1.24);
    add(strip);
  }
  const bedFront = mesh(rbox(1.56, 0.5, 0.06, 0.02), body);
  bedFront.position.set(0, 0.1, 0.2);
  add(bedFront);
  const tailgate = mesh(rbox(1.56, 0.5, 0.07, 0.025), body);
  tailgate.position.set(0, 0.1, 2.3);
  add(tailgate);
  const tgText = textTexture([{ text: 'BETSY', size: 110, color: '#f3e9cf', y: 128 }], 512, 256);
  const tg = mesh(new THREE.PlaneGeometry(0.9, 0.45), styl({ map: tgText, transparent: true, rough: 0.5, noise: 0, polygonOffset: 2 }));
  tg.position.set(0, 0.12, 2.337);
  add(tg);

  // tail lamps + rear bumper
  const tailLamps: THREE.MeshStandardMaterial[] = [];
  for (const sx of [-1, 1]) {
    const t = tailLamp(0.1, 0.22);
    t.m.position.set(sx * 0.8, 0.12, 2.33);
    add(t.m);
    tailLamps.push(t.mat);
  }
  const rb = bumper(1.9, 0.14, 0.14);
  rb.position.set(0, -0.36, 2.4);
  add(rb);

  // --- underneath ----------------------------------------------------------------
  const frame = styl({ color: 0x23252a, rough: 0.7 });
  for (const sx of [-1, 1]) {
    const rail = mesh(rbox(0.1, 0.14, 4.3, 0.02), frame);
    rail.position.set(sx * 0.46, -0.56, 0);
    add(rail);
  }
  for (const z of [FRONT_ARCH, REAR_ARCH]) {
    const axle = mesh(cyl(0.05, 0.05, 1.5, 10), frame);
    axle.rotation.z = Math.PI / 2;
    axle.position.set(0, -0.5, z);
    add(axle);
  }
  const tank = mesh(rbox(0.5, 0.26, 0.6, 0.06), frame);
  tank.position.set(-0.4, -0.45, 0.8);
  add(tank);
  const exhaust = mesh(tube('betsyExh', [[0.3, -0.6, -0.8], [0.35, -0.62, 0.8], [0.55, -0.62, 2.2], [0.58, -0.6, 2.42]], 0.035), MAT.metal(0x7c8189));
  add(exhaust);
  // fuel filler neck on the left bed side
  const filler = mesh(cyl(0.06, 0.06, 0.04, 16), MAT.chrome());
  filler.rotation.z = Math.PI / 2;
  filler.position.set(-0.9, 0.12, 0.78);
  add(filler);

  // --- interior ------------------------------------------------------------------
  const dash = dashboard(1.56);
  dash.position.set(0, 0.52, -0.82);
  add(dash, false);
  const seat = benchSeat(1.46, 0xc9a77c);
  seat.position.set(0, 0.28, -0.3);
  add(seat, false);
  const column = mesh(cyl(0.025, 0.03, 0.4, 10), styl({ color: 0x1c1d21, rough: 0.6 }));
  column.position.set(-0.36, 0.5, -0.66);
  column.rotation.x = 1.0;
  add(column, false);
  const steering = steeringWheel(0.19);
  steering.position.set(-0.36, 0.62, -0.53);
  steering.rotation.x = -0.55;
  add(steering, false);
  const stick = mesh(cyl(0.012, 0.012, 0.36, 8), MAT.chrome());
  stick.position.set(0.02, 0.36, -0.54);
  stick.rotation.x = 0.4;
  add(stick, false);
  const knob = mesh(lathe('knob', [[0, 0], [0.03, 0.01], [0.032, 0.035], [0, 0.05]], 12), styl({ color: 0x1c1d21, rough: 0.3 }));
  knob.position.set(0.02, 0.52, -0.47);
  add(knob, false);
  const rearview = mesh(rbox(0.22, 0.06, 0.02, 0.01), MAT.chrome());
  rearview.position.set(0, 0.9, -0.66);
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
    paint: [body, cream],
    headLamps,
    tailLamps,
    beams,
    steering,
    exterior,
    wheel: { radius: 0.37, width: 0.26, variant: 'truck' },
  };
}
