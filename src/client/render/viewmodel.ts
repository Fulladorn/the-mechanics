import * as THREE from 'three';
import type { World } from '../../sim/world';
import { ITEM_DEFS, type ItemKind } from '../../shared/types';
import { variantById, type PartKind } from '../../sim/vehicle';
import type { Settings } from '../settings';
import { M, paint } from './materials';
import { capsule, cyl, roundedBox } from './geo';
import { makePart } from './vehicleMesh';
import { makeTool } from './toolMesh';

// First-person hands, held tools and carried parts, plus the motion that sells
// them: bob, sway lag behind the mouse, strafe lean, and a landing dip. All of
// it hangs off a pivot parented to the camera.

const mesh = (g: THREE.BufferGeometry, m: THREE.Material): THREE.Mesh => {
  const x = new THREE.Mesh(g, m);
  x.castShadow = false;
  x.receiveShadow = false;
  return x;
};

/** A gloved hand with actual fingers — the old version was two boxes. */
function buildHand(sx: number): THREE.Group {
  const h = new THREE.Group();
  const glove = M.fabric(0xe8a23c);
  const cuffMat = paint({ color: 0x39414f, roughness: 0.75 });

  const palm = mesh(roundedBox(0.15, 0.115, 0.17, 0.045), glove);
  h.add(palm);

  // four curled fingers + a thumb
  for (let i = 0; i < 4; i++) {
    const f = new THREE.Group();
    const seg1 = mesh(capsule(0.021, 0.05, 3, 6), glove);
    seg1.rotation.x = Math.PI / 2;
    f.add(seg1);
    const seg2 = mesh(capsule(0.019, 0.042, 3, 6), glove);
    seg2.rotation.x = Math.PI / 2.2;
    seg2.position.set(0, -0.032, -0.055);
    f.add(seg2);
    f.position.set(-0.048 + i * 0.032, 0.012, -0.088);
    h.add(f);
  }
  const thumb = mesh(capsule(0.024, 0.05, 3, 6), glove);
  thumb.rotation.set(Math.PI / 2.4, 0, sx * 0.6);
  thumb.position.set(sx * 0.072, -0.012, -0.045);
  h.add(thumb);

  // knuckle pads + cuff
  const pads = mesh(roundedBox(0.14, 0.035, 0.07, 0.016), paint({ color: 0xc07d1f, roughness: 0.7 }));
  pads.position.set(0, 0.062, -0.062);
  h.add(pads);
  const cuff = mesh(cyl(0.078, 0.07, 0.12, 10), cuffMat);
  cuff.rotation.x = Math.PI / 2;
  cuff.position.set(0, -0.01, 0.14);
  h.add(cuff);
  const band = mesh(cyl(0.082, 0.082, 0.025, 10), paint({ color: 0xffcf3f, roughness: 0.6 }));
  band.rotation.x = Math.PI / 2;
  band.position.set(0, -0.01, 0.1);
  h.add(band);

  // Idle hands sit low and wide, mostly out of frame. The previous rig put
  // them dead centre at 0.15 m across, which swallowed the bottom third of the
  // screen with two yellow slabs.
  h.scale.setScalar(0.72);
  h.position.set(sx * 0.38, -0.46, -0.44);
  h.rotation.set(0.5, sx * -0.22, sx * 0.16);
  return h;
}

export class Viewmodel {
  private pivot = new THREE.Group();
  private hands = new THREE.Group();
  private leftHand: THREE.Group;
  private rightHand: THREE.Group;
  private heldPart = new THREE.Group();
  private tools = new Map<ItemKind, THREE.Object3D>();
  private heldKey = '';

  private bobT = 0;
  private swayYaw = 0;
  private lastYaw = 0;
  private swayVel = 0;
  private lean = 0;
  private dip = 0;
  private wasGrounded = true;
  /** Counts down while an install/use animation plays. */
  private punch = 0;

  constructor(camera: THREE.PerspectiveCamera) {
    camera.add(this.pivot);

    this.leftHand = buildHand(-1);
    this.rightHand = buildHand(1);
    this.hands.add(this.leftHand, this.rightHand);
    this.pivot.add(this.hands);

    this.heldPart.position.set(0, -0.46, -0.95);
    this.heldPart.visible = false;
    this.pivot.add(this.heldPart);

    for (const kind of ['wrench', 'flashlight', 'medkit', 'flare'] as ItemKind[]) {
      const tool = makeTool(kind);
      if (!tool) continue;
      tool.scale.setScalar(0.85);
      tool.position.set(0.27, -0.29, -0.5);
      tool.rotation.set(0.32, -0.3, 0.22);
      tool.visible = false;
      this.pivot.add(tool);
      this.tools.set(kind, tool);
    }

    // Never let the viewmodel clip into geometry or cast odd shadows.
    this.pivot.traverse((o) => {
      o.renderOrder = 10;
      if (o instanceof THREE.Mesh) {
        o.castShadow = false;
        o.receiveShadow = false;
        o.frustumCulled = false;
      }
    });
  }

  /** Trigger the "you just did a thing with your hands" punch animation. */
  bump(): void {
    this.punch = 1;
  }

  update(dt: number, w: World, speed: number, yaw: number, settings: Settings): void {
    const p = w.player;
    const onFoot = p.mode === 'foot';
    this.pivot.visible = onFoot;
    if (!onFoot) return;

    // --- held content ---
    const carry = p.carrying;
    const cv = p.carryingVariant;
    const key = carry && cv ? `${carry}|${cv}` : '';
    if (key !== this.heldKey) {
      this.heldKey = key;
      while (this.heldPart.children.length) this.heldPart.remove(this.heldPart.children[0]);
      if (carry && cv) {
        const variant = variantById(cv);
        if (variant) {
          const m = makePart(carry as PartKind, variant, w.vehicle.bodyColor);
          m.traverse((o) => {
            if (o instanceof THREE.SpotLight) o.intensity = 0;
            if (o instanceof THREE.Mesh) {
              o.castShadow = false;
              o.frustumCulled = false;
            }
          });
          // Big parts need scaling down hard or they fill the screen.
          m.scale.setScalar(ITEM_DEFS[carry].heavy ? (carry === 'body' ? 0.3 : 0.5) : 0.55);
          this.heldPart.add(m);
        }
      }
    }
    const carrying = !!key;
    this.heldPart.visible = carrying;

    const sel = p.hotbar[p.selSlot];
    let toolOut = false;
    for (const [kind, o] of this.tools) {
      const on = !carrying && sel === kind;
      o.visible = on;
      toolOut ||= on;
    }

    // Both hands come up to grip a carried part; otherwise they rest low and
    // the right hand only rises when it's holding a tool.
    this.rightHand.visible = !toolOut || carrying;
    this.leftHand.position.set(carrying ? -0.27 : -0.38, carrying ? -0.4 : -0.46, carrying ? -0.62 : -0.44);
    this.rightHand.position.set(
      carrying ? 0.27 : toolOut ? 0.3 : 0.38,
      carrying ? -0.4 : toolOut ? -0.36 : -0.46,
      carrying ? -0.62 : toolOut ? -0.5 : -0.44,
    );

    // --- motion ---
    const amp = settings.accessibility.headbob ? 1 : 0.32;
    const sp = Math.min(speed / 8, 1.4);
    this.bobT += dt * (3.4 + speed * 1.5);

    // Figure-8: horizontal at half the vertical rate reads as a real gait.
    const bobY = Math.sin(this.bobT * 2) * 0.011 * sp * amp;
    const bobX = Math.cos(this.bobT) * 0.014 * sp * amp;

    // sway: the viewmodel lags behind fast mouse movement
    let dYaw = yaw - this.lastYaw;
    if (dYaw > Math.PI) dYaw -= Math.PI * 2;
    if (dYaw < -Math.PI) dYaw += Math.PI * 2;
    this.lastYaw = yaw;
    this.swayVel += (dYaw * 2.2 - this.swayVel) * Math.min(1, dt * 14);
    this.swayVel *= 0.86;
    this.swayYaw += (this.swayVel - this.swayYaw) * Math.min(1, dt * 10);

    // strafe lean from the player's own velocity, projected onto their right
    const rx = Math.cos(yaw);
    const rz = -Math.sin(yaw);
    const strafe = (p.vel.x * rx + p.vel.z * rz) / 8;
    this.lean += (THREE.MathUtils.clamp(strafe, -1, 1) - this.lean) * Math.min(1, dt * 6);

    // landing dip
    if (!this.wasGrounded && p.onGround) this.dip = 1;
    this.wasGrounded = p.onGround;
    this.dip *= Math.exp(-dt * 9);
    if (!p.onGround) this.dip = Math.max(this.dip, -0.35);

    this.punch = Math.max(0, this.punch - dt * 4);
    const punchEase = Math.sin(this.punch * Math.PI) ** 2;

    this.pivot.position.set(
      bobX - this.swayYaw * 0.05 - this.lean * 0.03,
      bobY - this.dip * 0.07 - punchEase * 0.02,
      punchEase * 0.09,
    );
    this.pivot.rotation.set(
      -this.dip * 0.09 + punchEase * 0.16,
      -this.swayYaw * 0.12,
      this.lean * 0.05 + this.swayYaw * 0.06,
    );

    // the carried part wobbles under its own weight — the "wonky physics" beat
    if (carrying) {
      this.heldPart.rotation.set(
        Math.sin(this.bobT * 0.9) * 0.05 - this.dip * 0.2,
        Math.sin(this.bobT * 0.6) * 0.07 - this.swayYaw * 0.3,
        Math.cos(this.bobT * 0.75) * 0.06 + this.lean * 0.12,
      );
    }
  }
}
