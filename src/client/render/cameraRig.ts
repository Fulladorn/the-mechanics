import * as THREE from 'three';
import type { Terrain } from '../../sim/terrain';

// Where the camera is and how it moves. Four modes:
//   foot     — first person, with crouch easing, landing dip and head bob
//   chase    — third-person spring arm behind a vehicle; the mouse orbits it
//              and it drifts back behind the car when you stop steering it
//   cockpit  — in the driver's seat; the mouse looks around the cab
//   focus    — eased to a pose (puzzle panels, cinematics)

export type CamMode = 'foot' | 'chase' | 'cockpit' | 'focus';

const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler(0, 0, 0, 'YXZ');
const up = new THREE.Vector3(0, 1, 0);

export class CameraRig {
  mode: CamMode = 'foot';
  private chasePos = new THREE.Vector3();
  private chaseInit = false;
  private orbitYaw = 0;
  private orbitPitch = 0.18;
  private lastLook = { yaw: 0, pitch: 0 };
  private idle = 0;
  private dip = 0;
  private dipV = 0;
  private bob = 0;
  private eyeY = 0;
  private focusFrom: { pos: THREE.Vector3; quat: THREE.Quaternion } | null = null;
  private focusT = 0;
  focusTo: { pos: THREE.Vector3; quat: THREE.Quaternion } | null = null;
  shake = 0;

  constructor(
    readonly camera: THREE.PerspectiveCamera,
    private terrain: Terrain,
  ) {}

  land(strength: number): void {
    this.dipV -= Math.min(1.2, strength) * 1.4;
  }

  /** First-person. `eye` interpolated; yaw/pitch straight from the mouse. */
  foot(eye: THREE.Vector3, yaw: number, pitch: number, speed: number, grounded: boolean, dt: number, bobOn: boolean): void {
    this.mode = 'foot';
    this.chaseInit = false;
    // ease crouch/step height changes instead of snapping
    if (Math.abs(this.eyeY - eye.y) > 1.5) this.eyeY = eye.y;
    this.eyeY += (eye.y - this.eyeY) * Math.min(1, dt * 18);
    // landing dip: a damped spring
    this.dipV += -this.dip * 60 * dt - this.dipV * 10 * dt;
    this.dip += this.dipV * dt;
    if (grounded && speed > 0.5) this.bob += dt * (4 + speed * 1.15);
    const bobAmt = bobOn ? Math.min(1, speed / 6) * 0.035 : 0;
    const by = Math.abs(Math.sin(this.bob)) * bobAmt - bobAmt * 0.5;
    const bx = Math.cos(this.bob) * bobAmt * 0.5;
    const c = this.camera;
    c.position.set(eye.x, this.eyeY + by + this.dip * 0.09, eye.z);
    tmpE.set(pitch + this.dip * 0.02, yaw, 0, 'YXZ');
    c.quaternion.setFromEuler(tmpE);
    c.position.addScaledVector(new THREE.Vector3(1, 0, 0).applyQuaternion(c.quaternion), bx);
    this.applyShake(dt);
    this.lastLook = { yaw, pitch };
  }

  /** Chase camera around a vehicle transform. */
  chase(target: THREE.Vector3, rot: THREE.Quaternion, speed: number, look: { yaw: number; pitch: number }, dt: number, dist = 6.2, height = 1.9): void {
    this.mode = 'chase';
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(rot);
    const heading = Math.atan2(-fwd.x, -fwd.z);
    // mouse moves orbit the camera; it eases back behind the car after a bit
    const dy = look.yaw - this.lastLook.yaw;
    const dp = look.pitch - this.lastLook.pitch;
    this.lastLook = { ...look };
    if (Math.abs(dy) + Math.abs(dp) > 1e-4) this.idle = 0;
    else this.idle += dt;
    this.orbitYaw += dy;
    this.orbitPitch = THREE.MathUtils.clamp(this.orbitPitch - dp, -0.15, 0.9);
    if (this.idle > 1.2 && speed > 2) {
      this.orbitYaw += (0 - this.orbitYaw) * Math.min(1, dt * 1.6);
      this.orbitPitch += (0.18 - this.orbitPitch) * Math.min(1, dt * 1.2);
    }
    const yaw = heading + this.orbitYaw;
    const d = dist + Math.min(2.5, Math.abs(speed) * 0.08);
    const want = new THREE.Vector3(
      target.x + Math.sin(yaw) * d * Math.cos(this.orbitPitch),
      target.y + height + Math.sin(this.orbitPitch) * d,
      target.z + Math.cos(yaw) * d * Math.cos(this.orbitPitch),
    );
    // stay above the ground along the arm
    for (let k = 0.3; k <= 1.0001; k += 0.35) {
      const px = target.x + (want.x - target.x) * k;
      const pz = target.z + (want.z - target.z) * k;
      const floor = this.terrain.heightAt(px, pz) + 0.6;
      const py = target.y + (want.y - target.y) * k;
      if (py < floor) want.y += (floor - py) / k;
    }
    if (!this.chaseInit) {
      this.chasePos.copy(want);
      this.chaseInit = true;
    }
    this.chasePos.lerp(want, 1 - Math.exp(-dt * 7));
    const c = this.camera;
    c.position.copy(this.chasePos);
    const lookAt = target.clone().add(new THREE.Vector3(0, 1.0, 0)).addScaledVector(fwd, Math.min(3, Math.abs(speed) * 0.12));
    c.lookAt(lookAt);
    this.applyShake(dt);
  }

  /** In the driver's seat. */
  cockpit(seat: THREE.Vector3, rot: THREE.Quaternion, look: { yaw: number; pitch: number }, dt: number): void {
    if (this.mode !== 'cockpit') this.lastLook = { ...look };
    this.mode = 'cockpit';
    this.chaseInit = false;
    const dy = look.yaw - this.lastLook.yaw;
    const dp = look.pitch - this.lastLook.pitch;
    this.lastLook = { ...look };
    this.orbitYaw = THREE.MathUtils.clamp(this.orbitYaw + dy, -1.9, 1.9);
    this.orbitPitch = THREE.MathUtils.clamp(this.orbitPitch + dp, -0.8, 0.6);
    const c = this.camera;
    c.position.copy(seat);
    tmpE.set(this.orbitPitch, this.orbitYaw, 0, 'YXZ');
    tmpQ.setFromEuler(tmpE);
    c.quaternion.copy(rot).multiply(tmpQ);
    this.applyShake(dt);
  }

  resetOrbit(): void {
    this.orbitYaw = 0;
    this.orbitPitch = 0.18;
  }

  /** Ease to a fixed pose (panels, cinematics). */
  focus(pose: { pos: THREE.Vector3; quat: THREE.Quaternion }, dt: number, speed = 4): void {
    if (this.mode !== 'focus' || this.focusTo !== pose) {
      this.focusFrom = { pos: this.camera.position.clone(), quat: this.camera.quaternion.clone() };
      this.focusT = 0;
      this.focusTo = pose;
    }
    this.mode = 'focus';
    this.focusT = Math.min(1, this.focusT + dt * speed);
    const e = this.focusT * this.focusT * (3 - 2 * this.focusT);
    this.camera.position.lerpVectors(this.focusFrom!.pos, pose.pos, e);
    this.camera.quaternion.slerpQuaternions(this.focusFrom!.quat, pose.quat, e);
  }

  /** Pose looking at `target` from `from`. */
  static pose(from: THREE.Vector3, target: THREE.Vector3): { pos: THREE.Vector3; quat: THREE.Quaternion } {
    const m = new THREE.Matrix4().lookAt(from, target, up);
    return { pos: from.clone(), quat: new THREE.Quaternion().setFromRotationMatrix(m) };
  }

  private applyShake(dt: number): void {
    if (this.shake <= 0.001) return;
    const s = this.shake;
    this.camera.position.x += (Math.random() - 0.5) * s * 0.3;
    this.camera.position.y += (Math.random() - 0.5) * s * 0.3;
    this.camera.rotateZ((Math.random() - 0.5) * s * 0.05);
    this.shake *= Math.exp(-dt * 9);
  }
}
