import * as THREE from 'three';
import type { World } from '../../sim/world';
import type { Wolf } from '../../sim/combat';
import { styl } from './stylized';
import { capsule, cone, mesh, sph, tube } from './shapes';

// Wolves: soft, chunky, a little cartoonish — readable silhouettes at dusk
// with eyes that catch the headlights. Each one is a small rig (body, head,
// four legs, tail) posed procedurally from the sim state: a trot cycle driven
// by ground speed, a low stalking crouch, a wind-up before the lunge, a
// stretched leap, a tail-down flee, and lying still once beaten.

interface Rig {
  root: THREE.Group;
  body: THREE.Group;
  head: THREE.Group;
  legs: THREE.Group[];
  tail: THREE.Group;
  eyes: THREE.MeshStandardMaterial;
  pos: THREE.Vector3;
  yaw: number;
  phase: number;
  speed: number;
  crouch: number;
  dead: number;
}

const FUR = 0x807b73;
const FUR_DARK = 0x4f4b47;
const BELLY = 0xd8d0c2;

function buildWolf(tint: number): Omit<Rig, 'pos' | 'yaw' | 'phase' | 'speed' | 'crouch' | 'dead'> {
  const fur = styl({ color: new THREE.Color(FUR).lerp(new THREE.Color(tint), 0.25).getHex(), rough: 0.95, noise: 0.25, noiseScale: 3, rim: 0.45 });
  const dark = styl({ color: FUR_DARK, rough: 0.95, noise: 0.2, noiseScale: 3, rim: 0.4 });
  const belly = styl({ color: BELLY, rough: 0.95, noise: 0.2, noiseScale: 3, rim: 0.3 });
  const eyes = styl({ color: 0xffd35a, emissive: 0xffc23a, emissiveIntensity: 0.4, rough: 0.2, noise: 0, rim: 0 });

  const root = new THREE.Group();
  const body = new THREE.Group();
  body.position.y = 0.62;
  root.add(body);

  // torso: a long capsule, deeper at the chest, with a ruff and a pale belly
  const torso = mesh(capsule(0.2, 0.62, 6, 14), fur);
  torso.rotation.x = Math.PI / 2;
  torso.scale.set(1, 1, 1.12);
  body.add(torso);
  const chest = mesh(sph(0.25, 14, 10), fur, 0, 0.03, -0.3);
  chest.scale.set(1, 1.1, 1);
  body.add(chest);
  const ruff = mesh(sph(0.23, 12, 9), dark, 0, 0.12, -0.36);
  ruff.scale.set(1.05, 0.9, 0.8);
  body.add(ruff);
  const under = mesh(capsule(0.13, 0.5, 5, 12), belly, 0, -0.12, 0);
  under.rotation.x = Math.PI / 2;
  body.add(under);
  const saddle = mesh(capsule(0.15, 0.45, 5, 12), dark, 0, 0.1, 0.08);
  saddle.rotation.x = Math.PI / 2;
  saddle.scale.set(1.05, 0.7, 1);
  body.add(saddle);

  // head
  const head = new THREE.Group();
  head.position.set(0, 0.2, -0.52);
  body.add(head);
  const skull = mesh(sph(0.16, 14, 10), fur);
  skull.scale.set(1, 0.92, 1.05);
  head.add(skull);
  const snout = mesh(cone(0.085, 0.24, 10), fur, 0, -0.04, -0.2);
  snout.rotation.x = -Math.PI / 2;
  head.add(snout);
  const jaw = mesh(cone(0.06, 0.18, 8), belly, 0, -0.09, -0.16);
  jaw.rotation.x = -Math.PI / 2;
  head.add(jaw);
  const nose = mesh(sph(0.03, 8, 6), styl({ color: 0x1a1a1c, rough: 0.3, noise: 0 }), 0, -0.02, -0.32);
  head.add(nose);
  for (const sx of [-1, 1]) {
    const ear = mesh(cone(0.055, 0.14, 6), dark, sx * 0.08, 0.14, 0.02);
    ear.rotation.z = -sx * 0.25;
    head.add(ear);
    const eye = mesh(sph(0.022, 8, 6), eyes, sx * 0.065, 0.04, -0.12);
    head.add(eye);
  }

  // legs: hip pivot → leg, so a rotation swings from the shoulder
  const legs: THREE.Group[] = [];
  for (const [x, z] of [
    [-0.12, -0.3],
    [0.12, -0.3],
    [-0.12, 0.3],
    [0.12, 0.3],
  ]) {
    const hip = new THREE.Group();
    hip.position.set(x, -0.08, z);
    const leg = mesh(capsule(0.05, 0.42, 4, 8), z < 0 ? fur : dark, 0, -0.26, 0);
    hip.add(leg);
    const paw = mesh(sph(0.06, 8, 6), dark, 0, -0.52, -0.02);
    paw.scale.set(1, 0.6, 1.3);
    hip.add(paw);
    body.add(hip);
    legs.push(hip);
  }

  // tail: a bushy curve on a pivot
  const tail = new THREE.Group();
  tail.position.set(0, 0.06, 0.42);
  const tailMesh = mesh(tube('wolfTail', [[0, 0, 0], [0, -0.06, 0.18], [0, -0.2, 0.34], [0, -0.34, 0.42]], 0.07, 12, 8), fur);
  tail.add(tailMesh);
  const tip = mesh(sph(0.075, 8, 6), dark, 0, -0.34, 0.42);
  tail.add(tip);
  body.add(tail);

  root.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return { root, body, head, legs, tail, eyes };
}

export class WolfPack {
  readonly group = new THREE.Group();
  private rigs = new Map<number, Rig>();

  constructor(private w: World) {
    w.wolves.forEach((wolf, i) => {
      const r = buildWolf([0x8a7a66, 0x6b6f76, 0x9a8f80, 0x5d5a55, 0x7f8a8f][i % 5]);
      const rig: Rig = { ...r, pos: new THREE.Vector3(wolf.pos.x, wolf.pos.y, wolf.pos.z), yaw: wolf.yaw, phase: i, speed: 0, crouch: 0, dead: 0 };
      rig.root.position.copy(rig.pos);
      this.group.add(rig.root);
      this.rigs.set(wolf.id, rig);
    });
  }

  update(dt: number, night: number): void {
    for (const wolf of this.w.wolves) {
      const r = this.rigs.get(wolf.id);
      if (!r) continue;
      r.root.visible = this.w.wolfAwake(wolf.id);
      if (!r.root.visible) continue;
      this.pose(wolf, r, dt, night);
    }
  }

  private pose(wolf: Wolf, r: Rig, dt: number, night: number): void {
    const target = new THREE.Vector3(wolf.pos.x, wolf.pos.y, wolf.pos.z);
    const before = r.pos.clone();
    r.pos.lerp(target, Math.min(1, dt * 12));
    const moved = Math.hypot(r.pos.x - before.x, r.pos.z - before.z) / Math.max(dt, 1e-4);
    r.speed += (moved - r.speed) * Math.min(1, dt * 6);
    // turn smoothly toward the sim's heading
    let d = wolf.yaw - r.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    r.yaw += d * Math.min(1, dt * 8);
    r.root.position.copy(r.pos);
    r.root.rotation.y = r.yaw;

    const st = wolf.state;
    const crouchT = st === 'telegraph' ? 1 : st === 'stalk' ? 0.45 : 0;
    r.crouch += (crouchT - r.crouch) * Math.min(1, dt * 6);
    r.dead += ((st === 'dead' ? 1 : 0) - r.dead) * Math.min(1, dt * 3);

    // gait: stride frequency follows speed; lunge is a stretched leap
    const gallop = st === 'lunge' || st === 'flee';
    r.phase += dt * (2 + r.speed * (gallop ? 2.2 : 2.8));
    const amp = Math.min(0.9, r.speed * 0.16) * (1 - r.dead);
    r.legs.forEach((leg, i) => {
      const front = i < 2;
      const off = gallop ? (front ? 0 : Math.PI * 0.9) + (i % 2) * 0.3 : (i === 0 || i === 3 ? 0 : Math.PI);
      leg.rotation.x = Math.sin(r.phase + off) * amp + (st === 'lunge' ? (front ? -0.9 : 0.8) : 0);
    });
    const bob = Math.abs(Math.sin(r.phase)) * amp * 0.05;
    r.body.position.y = 0.62 - r.crouch * 0.16 + bob - r.dead * 0.38;
    r.body.rotation.x = (st === 'lunge' ? -0.18 : 0) + r.crouch * 0.08;
    r.body.rotation.z = r.dead * (Math.PI / 2);
    r.head.rotation.x = r.crouch * 0.35 + (st === 'idle' ? Math.sin(r.phase * 0.3) * 0.15 : 0) - r.dead * 0.2;
    r.head.rotation.y = st === 'idle' ? Math.sin(r.phase * 0.21) * 0.5 : 0;
    // tail: up when bold, tucked when fleeing, swaying at a trot
    r.tail.rotation.x = st === 'flee' ? 0.7 : st === 'telegraph' ? -0.35 : -0.1 + Math.sin(r.phase * 0.5) * 0.08;
    r.tail.rotation.y = Math.sin(r.phase) * 0.2 * amp;
    // eyes glow as the light goes
    r.eyes.emissiveIntensity = 0.3 + night * 2.2 * (1 - r.dead);
  }

  dispose(): void {
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose();
    });
  }
}
