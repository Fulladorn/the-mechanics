import * as THREE from 'three';
import type { World } from '../../sim/world';
import { ITEM_DEFS, type ItemKind } from '../../sim/items';
import { itemModel } from './itemModels';
import { styl } from './stylized';
import { capsule, cyl, mesh, rbox } from './shapes';

// First-person hands and whatever they're holding. Rendered in its own scene
// on top of the world (so a carried wheel never clips into a wall) with lights
// that mirror the world's sun and sky.
//
// Every verb has a body: reaching for pickups, ratcheting on a bolt, pumping
// a jack, tipping a jerry can, winding up a throw.

function buildHand(side: -1 | 1): THREE.Group {
  const h = new THREE.Group();
  const glove = styl({ color: 0xe0a24a, rough: 0.85, noise: 0.08, noiseScale: 0.05, rim: 0.3, noFog: true });
  const dark = styl({ color: 0xb87a2c, rough: 0.8, noFog: true });
  const sleeve = styl({ color: 0x2f4a6e, rough: 0.9, noFog: true });
  h.add(mesh(rbox(0.15, 0.11, 0.17, 0.045), glove));
  const fingers: THREE.Group[] = [];
  for (let i = 0; i < 4; i++) {
    const f = new THREE.Group();
    const s1 = mesh(capsule(0.021, 0.05, 3, 6), glove);
    s1.rotation.x = Math.PI / 2;
    f.add(s1);
    const s2 = mesh(capsule(0.019, 0.04, 3, 6), glove);
    s2.rotation.x = Math.PI / 2.2;
    s2.position.set(0, -0.03, -0.055);
    f.add(s2);
    f.position.set(-0.048 + i * 0.032, 0.012, -0.088);
    h.add(f);
    fingers.push(f);
  }
  const thumb = mesh(capsule(0.024, 0.05, 3, 6), glove);
  thumb.rotation.set(Math.PI / 2.4, 0, side * 0.6);
  thumb.position.set(side * 0.072, -0.012, -0.045);
  h.add(thumb);
  const pads = mesh(rbox(0.14, 0.035, 0.07, 0.016), dark);
  pads.position.set(0, 0.06, -0.06);
  h.add(pads);
  const cuff = mesh(cyl(0.08, 0.075, 0.1, 12), dark);
  cuff.rotation.x = Math.PI / 2;
  cuff.position.set(0, -0.01, 0.12);
  h.add(cuff);
  const arm = mesh(cyl(0.085, 0.1, 0.5, 12), sleeve);
  arm.rotation.x = Math.PI / 2;
  arm.position.set(0, -0.02, 0.4);
  h.add(arm);
  h.userData.fingers = fingers;
  h.userData.thumb = thumb;
  h.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.castShadow = false;
      o.receiveShadow = false;
      o.frustumCulled = false;
    }
  });
  return h;
}

/** Close the hand: 0 open, 1 a fist (fingers fold toward the palm pads). */
function curl(h: THREE.Group, k: number): void {
  (h.userData.fingers as THREE.Group[]).forEach((f, i) => (f.rotation.x = k * (1.25 + i * 0.06)));
  const t = h.userData.thumb as THREE.Mesh;
  t.rotation.y = k * -0.5 * Math.sign(t.position.x);
}

const HOLD: Partial<Record<ItemKind, { pos: [number, number, number]; rot: [number, number, number]; scale: number }>> = {
  wheel: { pos: [0, -0.5, -0.78], rot: [0.15, 0.2, Math.PI / 2], scale: 0.9 },
  tire: { pos: [0, -0.5, -0.78], rot: [0.15, 0.2, Math.PI / 2], scale: 0.9 },
  battery: { pos: [0, -0.38, -0.62], rot: [0.25, 0.3, 0], scale: 1 },
  jack: { pos: [0.05, -0.42, -0.7], rot: [0.2, 0.3, 0], scale: 0.9 },
  chock: { pos: [0.12, -0.33, -0.55], rot: [0.3, 0.6, 0], scale: 1 },
  jerrycan: { pos: [0.12, -0.42, -0.6], rot: [0.1, 0.9, 0], scale: 1 },
  coolant: { pos: [0.12, -0.34, -0.55], rot: [0.1, 0.4, 0], scale: 1 },
  fuelHose: { pos: [0, -0.3, -0.55], rot: [0.3, 0.1, 0.1], scale: 1 },
  radiatorHose: { pos: [0, -0.3, -0.55], rot: [0.3, 0.1, 0.1], scale: 1 },
  winch: { pos: [0, -0.4, -0.65], rot: [0.2, 0.3, 0], scale: 0.9 },
  lightbar: { pos: [0, -0.35, -0.7], rot: [0.2, 0.25, 0], scale: 0.8 },
  crate: { pos: [0, -0.4, -0.7], rot: [0.15, 0.3, 0], scale: 0.9 },
  fuse: { pos: [0.1, -0.28, -0.45], rot: [0.5, 0.3, 0], scale: 1.2 },
};

export class Viewmodel {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  private rig = new THREE.Group();
  private left: THREE.Group;
  private right: THREE.Group;
  private held = new THREE.Group();
  private heldKey = '';
  private tool = new THREE.Group();
  private toolKey = '';
  private sun = new THREE.DirectionalLight(0xffffff, 2);
  private hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.8);
  readonly flashlight: THREE.SpotLight;

  private t = 0;
  private sway = new THREE.Vector2();
  private lastLook = new THREE.Vector2();
  private dip = 0;
  private reach = 0;
  private swing = 0;
  private wasGround = true;
  private raise = 0;

  constructor(aspect: number, fov: number) {
    this.camera = new THREE.PerspectiveCamera(fov, aspect, 0.02, 10);
    this.scene.add(this.camera, this.sun, this.hemi, this.sun.target);
    this.sun.target.position.set(0, 0, -1);
    this.camera.add(this.rig);
    this.left = buildHand(-1);
    this.right = buildHand(1);
    this.rig.add(this.left, this.right, this.held, this.tool);
    this.flashlight = new THREE.SpotLight(0xfff1d6, 0, 26, 0.42, 0.45, 1.3);
    this.flashlight.castShadow = false;
  }

  bump(): void {
    this.reach = 1;
  }
  swingFx(): void {
    this.swing = 1;
  }

  setFov(fov: number, aspect: number): void {
    this.camera.fov = Math.min(fov, 70);
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  /** Mirror the world's light onto the hands (dimmed when standing in shade). */
  light(sun: THREE.DirectionalLight, hemi: THREE.HemisphereLight, env: THREE.Texture | null, shade: number, camQuat: THREE.Quaternion, keyDir: THREE.Vector3): void {
    this.sun.color.copy(sun.color);
    this.sun.intensity = sun.intensity * (1 - shade * 0.85);
    this.hemi.color.copy(hemi.color);
    this.hemi.groundColor.copy(hemi.groundColor);
    this.hemi.intensity = hemi.intensity;
    this.scene.environment = env;
    this.scene.environmentIntensity = 0.5;
    // light direction in camera space so the hands are lit like the world
    const d = keyDir.clone().applyQuaternion(camQuat.clone().invert());
    this.sun.position.copy(d).multiplyScalar(5);
    this.sun.target.position.set(0, 0, 0);
  }

  update(dt: number, w: World, yaw: number, pitch: number, bob: boolean, visible: boolean): void {
    this.rig.visible = visible;
    if (!visible) return;
    const p = w.player;
    this.t += dt;

    // --- what's in hand -----------------------------------------------------------
    const heldItem = w.items.get(p.held);
    const hk = heldItem ? `${heldItem.id}:${heldItem.cond}:${Math.round(heldItem.fill * 5)}` : '';
    if (hk !== this.heldKey) {
      this.heldKey = hk;
      this.held.clear();
      if (heldItem) {
        const m = itemModel(heldItem);
        const hold = HOLD[heldItem.kind] ?? { pos: [0, -0.35, -0.6], rot: [0.2, 0.3, 0], scale: 1 };
        m.position.set(...hold.pos);
        m.rotation.set(...hold.rot);
        m.scale.setScalar(hold.scale);
        m.traverse((o) => {
          if (o instanceof THREE.Mesh) {
            o.castShadow = false;
            o.frustumCulled = false;
          }
        });
        this.held.add(m);
        this.reach = 1;
      }
    }
    const tool = heldItem ? null : w.selectedTool();
    const tk = tool ?? '';
    if (tk !== this.toolKey) {
      this.toolKey = tk;
      this.tool.clear();
      if (tool) {
        const m = itemModel({ kind: tool, cond: 'good', fill: 0 });
        m.traverse((o) => {
          if (o instanceof THREE.Mesh) o.frustumCulled = false;
        });
        this.tool.add(m);
        this.raise = 0;
      }
    }

    // --- pose -----------------------------------------------------------------------
    const heavy = heldItem ? ITEM_DEFS[heldItem.kind].heavy : false;
    const f = w.focus;
    const working = !!f && !f.disabled && w.holdProgress > 0;
    const onBolt = working && (f!.verb === 'loosen' || f!.verb === 'torque');
    const pumping = working && f!.verb === 'hold';
    const pouring = working && f!.verb === 'pour';
    this.raise = Math.min(1, this.raise + dt * 4);

    // sway lag from mouse, bob from gait
    const dy = yaw - this.lastLook.x;
    const dp = pitch - this.lastLook.y;
    this.lastLook.set(yaw, pitch);
    this.sway.x += (THREE.MathUtils.clamp(dy * 2.4, -0.3, 0.3) - this.sway.x) * Math.min(1, dt * 12);
    this.sway.y += (THREE.MathUtils.clamp(dp * 2.4, -0.3, 0.3) - this.sway.y) * Math.min(1, dt * 12);
    const speed = Math.hypot(p.vel.x, p.vel.z);
    const gait = p.onGround ? Math.min(1, speed / 6) : 0;
    const b = bob ? 1 : 0.35;
    const bobY = Math.sin(this.t * (6 + speed)) * 0.012 * gait * b * (heavy ? 1.6 : 1);
    const bobX = Math.cos(this.t * (3 + speed * 0.5)) * 0.016 * gait * b;
    if (!this.wasGround && p.onGround) this.dip = Math.min(1, p.landSpeed / 10 + 0.3);
    this.wasGround = p.onGround;
    this.dip *= Math.exp(-dt * 8);
    this.reach = Math.max(0, this.reach - dt * 3.5);
    this.swing = Math.max(0, this.swing - dt * 3);
    const reach = Math.sin(this.reach * Math.PI);
    const charge = Math.min(1, w.dropCharge / 0.8);

    this.rig.position.set(bobX - this.sway.x * 0.06, bobY - this.dip * 0.06 - this.sway.y * 0.04 - (heavy ? 0.02 : 0), charge * 0.12 - reach * 0.08);
    this.rig.rotation.set(this.sway.y * 0.1 - this.dip * 0.06, this.sway.x * 0.14, this.sway.x * 0.08);

    const L = this.left;
    const R = this.right;
    if (heldItem) {
      // two hands on the part; heavy parts sag and sway
      const hold = HOLD[heldItem.kind] ?? { pos: [0, -0.35, -0.6] as [number, number, number], rot: [0, 0, 0], scale: 1 };
      const [hx, hy, hz] = hold.pos;
      const wobble = heavy ? Math.sin(this.t * 2.1) * 0.02 : 0;
      const pour = pouring ? 1 : 0;
      this.held.position.set(0, wobble - charge * 0.05, charge * 0.15);
      this.held.rotation.set(-pour * 0.7 - charge * 0.2, 0, pour * 0.2);
      const spread = heldItem.kind === 'wheel' || heldItem.kind === 'tire' ? 0.3 : heavy ? 0.22 : 0.14;
      L.position.set(hx - spread, hy + 0.02 + wobble, hz + 0.1 + charge * 0.15);
      R.position.set(hx + spread, hy + 0.02 + wobble, hz + 0.1 + charge * 0.15);
      L.rotation.set(0.3, 0.5, 0.9);
      R.rotation.set(0.3, -0.5, -0.9);
      curl(L, 0.55);
      curl(R, 0.55);
      L.visible = R.visible = true;
      this.tool.visible = false;
    } else {
      this.tool.visible = !!tool;
      // Empty hands stay out of frame; they come up to reach, pump and work.
      const act = Math.max(reach, pumping ? 1 : 0);
      L.position.set(-0.36 + reach * 0.12, -0.62 + act * 0.3, -0.42 - reach * 0.22);
      L.rotation.set(0.5 - reach * 0.4, 0.22, -0.16);
      L.visible = act > 0.02 || pumping;
      curl(L, pumping ? 0.9 : 0.25 - reach * 0.25);
      if (tool) {
        R.visible = true;
        const ratchet = onBolt ? Math.sin(this.t * (f!.verb === 'torque' ? 14 : 22)) * 0.35 : 0;
        const up = (1 - this.raise) * -0.3;
        const sw = Math.sin(this.swing * Math.PI);
        // carried like a tool, not a baton: up in the lower right, head
        // angled forward and inboard so its silhouette reads
        this.tool.position.set(0.23 - (onBolt ? 0.08 : 0) - sw * 0.2, -0.22 + up + (onBolt ? 0.04 : 0), -0.5 - (onBolt ? 0.12 : 0) - sw * 0.15);
        this.tool.rotation.set(0.6 + ratchet * 0.3 + sw * 1.2, (tool === 'wrench' ? -Math.PI / 2 - 0.75 : -0.3) + ratchet, (tool === 'wrench' ? -0.35 : 0.1) - sw * 0.6);
        // a fist round the grip, knuckles to the camera, not a flat glove
        // the fist sits on the tool's grip (wrench: the orange sleeve)
        const [gx, gy, gz] = tool === 'wrench' ? [-0.083, -0.087, 0.049] : [-0.021, -0.038, 0.055];
        R.position.set(this.tool.position.x + gx + 0.035, this.tool.position.y + gy - 0.03, this.tool.position.z + gz + 0.07);
        R.rotation.set(0.25 + ratchet * 0.3, -0.3, 1.3);
        curl(R, 1);
      } else {
        const act = Math.max(reach, pumping ? 1 : 0);
        R.visible = act > 0.02;
        const pump = pumping ? Math.abs(Math.sin(this.t * 7)) * 0.08 : 0;
        R.position.set(0.36 - reach * 0.1 - (pumping ? 0.12 : 0), -0.62 + act * 0.3 - pump, -0.42 - reach * 0.2 - (pumping ? 0.15 : 0));
        R.rotation.set(0.5 - reach * 0.4, -0.22, 0.16);
        curl(R, pumping ? 0.9 : 0.25 - reach * 0.25);
        if (pumping) L.position.set(-0.24, -0.44 - pump, -0.57);
      }
    }

    // flashlight beam from the tool (or the chest when carrying)
    const torch = p.flashlight;
    this.flashlight.intensity = torch ? 38 : 0;
  }
}
