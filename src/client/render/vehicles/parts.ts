import * as THREE from 'three';
import { MAT, styl } from '../stylized';
import { cyl, lathe, mesh, rbox, torus } from '../shapes';

// Shared vehicle bits: lamps, bumpers, mirrors, interior. All in the vehicle
// body frame (nose toward -Z, +X to the right).

export interface VehicleModel {
  root: THREE.Group;
  /** Hinged hood (rotation.x opens it). */
  hood?: THREE.Object3D;
  hoodOpen: number;
  paint: THREE.MeshPhysicalMaterial[];
  headLamps: THREE.MeshStandardMaterial[];
  tailLamps: THREE.MeshStandardMaterial[];
  beams: THREE.SpotLight[];
  steering?: THREE.Object3D;
  /** Hidden in the chase camera? No — hidden in the cockpit camera. */
  exterior: THREE.Object3D[];
  /** Radius and width of this vehicle's road wheels (for the wheel view). */
  wheel: { radius: number; width: number; variant: string };
}

export function headlamp(r: number): { g: THREE.Group; lens: THREE.MeshStandardMaterial } {
  const g = new THREE.Group();
  const lens = styl({ color: 0xfff6dc, emissive: 0xfff1c8, emissiveIntensity: 0.15, rough: 0.2, noise: 0, env: 1.4 });
  const bezel = mesh(torus(r, r * 0.16, 8, 24), MAT.chrome());
  g.add(bezel);
  const bowl = mesh(lathe(`lens${r}`, [[0, r * 0.35], [r * 0.55, r * 0.28], [r * 0.9, r * 0.08], [r * 0.95, 0]], 20), lens);
  bowl.rotation.x = Math.PI / 2;
  g.add(bowl);
  return { g, lens };
}

export function bumper(w: number, h: number, d: number): THREE.Mesh {
  return mesh(rbox(w, h, d, Math.min(h, d) * 0.45), MAT.chrome());
}

export function mirror(side: -1 | 1): THREE.Group {
  const g = new THREE.Group();
  const arm = mesh(cyl(0.012, 0.012, 0.22, 8), MAT.chrome());
  arm.rotation.z = Math.PI / 2;
  arm.position.x = side * 0.1;
  g.add(arm);
  const head = mesh(rbox(0.05, 0.16, 0.11, 0.03), MAT.chrome());
  head.position.x = side * 0.22;
  g.add(head);
  const glass = mesh(rbox(0.005, 0.13, 0.09, 0.002), styl({ color: 0xbfd5e8, rough: 0.05, metal: 0.8, env: 2 }));
  glass.position.set(side * 0.22, 0, 0.056);
  glass.rotation.y = Math.PI / 2;
  g.add(glass);
  return g;
}

export function steeringWheel(r = 0.19): THREE.Group {
  const g = new THREE.Group();
  const black = styl({ color: 0x1c1d21, rough: 0.55 });
  g.add(mesh(torus(r, 0.018, 8, 28), black));
  for (let i = 0; i < 3; i++) {
    const s = mesh(rbox(r, 0.02, 0.012, 0.006), MAT.chrome());
    s.rotation.z = (i / 3) * Math.PI * 2 - Math.PI / 2;
    s.position.set(Math.cos(s.rotation.z) * r * 0.5, Math.sin(s.rotation.z) * r * 0.5, 0);
    g.add(s);
  }
  g.add(mesh(cyl(0.05, 0.05, 0.03, 16), styl({ color: 0xff7a2f, rough: 0.5 })));
  return g;
}

export function benchSeat(w: number, color: number): THREE.Group {
  const g = new THREE.Group();
  const vinyl = styl({ color, rough: 0.55, noise: 0.06 });
  const base = mesh(rbox(w, 0.16, 0.5, 0.07), vinyl);
  base.position.y = 0;
  g.add(base);
  const back = mesh(rbox(w, 0.5, 0.14, 0.07), vinyl);
  back.position.set(0, 0.27, 0.22);
  back.rotation.x = -0.18;
  g.add(back);
  // tuck-and-roll pleats
  for (let i = 0; i < 6; i++) {
    const p = mesh(rbox(0.012, 0.44, 0.02, 0.006), styl({ color: new THREE.Color(color).multiplyScalar(0.8).getHex(), rough: 0.6 }));
    p.position.set(-w / 2 + ((i + 1) / 7) * w, 0.27, 0.15);
    p.rotation.x = -0.18;
    g.add(p);
  }
  return g;
}

export function dashboard(w: number, color = 0x2a2c31): THREE.Group {
  const g = new THREE.Group();
  const dash = mesh(rbox(w, 0.2, 0.3, 0.06), styl({ color, rough: 0.7 }));
  g.add(dash);
  const pad = mesh(rbox(w - 0.04, 0.05, 0.26, 0.03), styl({ color: 0x1c1d21, rough: 0.8 }));
  pad.position.set(0, 0.11, -0.02);
  g.add(pad);
  // gauges
  for (const [x, r] of [
    [-0.46, 0.07],
    [-0.28, 0.07],
  ] as [number, number][]) {
    const ring = mesh(torus(r, 0.008, 6, 20), MAT.chrome());
    ring.position.set(x, 0.0, 0.151);
    g.add(ring);
    const face = mesh(cyl(r, r, 0.01, 20), styl({ color: 0xf1e6cc, emissive: 0xffd9a0, emissiveIntensity: 0.25, rough: 0.5 }));
    face.rotation.x = Math.PI / 2;
    face.position.set(x, 0.0, 0.148);
    g.add(face);
    const needle = mesh(rbox(0.004, r * 0.8, 0.004, 0.001), styl({ color: 0xd9463b, rough: 0.5 }));
    needle.position.set(x, 0.0, 0.156);
    needle.rotation.z = -0.8;
    needle.name = x < -0.4 ? 'speedNeedle' : 'revNeedle';
    g.add(needle);
  }
  const radio = mesh(rbox(0.18, 0.06, 0.02, 0.01), MAT.chrome());
  radio.position.set(0.05, -0.02, 0.152);
  g.add(radio);
  return g;
}

export function tailLamp(w: number, h: number): { m: THREE.Mesh; mat: THREE.MeshStandardMaterial } {
  const mat = styl({ color: 0xd8342c, emissive: 0xff2a1a, emissiveIntensity: 0.2, rough: 0.3, noise: 0 });
  return { m: mesh(rbox(w, h, 0.05, Math.min(w, h) * 0.3), mat), mat };
}

export function beam(): THREE.SpotLight {
  const s = new THREE.SpotLight(0xfff0d0, 0, 45, 0.5, 0.55, 1.4);
  s.castShadow = false;
  return s;
}
