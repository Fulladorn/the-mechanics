import * as THREE from 'three';
import type { World } from '../sim/world';

// Scripted camera moves: a list of shots, each gliding from one pose to
// another while looking from one point to another. Used for level intros.
// The world is paused underneath, so the cold open can't cost you the truck.

export interface Shot {
  from: THREE.Vector3;
  to: THREE.Vector3;
  look: THREE.Vector3;
  lookTo?: THREE.Vector3;
  dur: number;
  caption?: [string, string];
}

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const ease = (t: number) => t * t * (3 - 2 * t);

export const INTROS: Record<string, (w: World) => Shot[]> = {
  ridge: (w) => {
    const car = w.vehicle('ridgeback').pos;
    const c = V(car.x, car.y, car.z);
    const eye = w.player.eye();
    return [
      {
        from: V(car.x - 30, car.y + 34, car.z - 150),
        to: V(car.x - 12, car.y + 16, car.z - 70),
        look: c.clone().add(V(0, -6, 0)),
        lookTo: c,
        dur: 5.2,
        caption: ['KESTREL RIDGE', '17:36 · Private client'],
      },
      {
        from: V(car.x - 7, car.y + 0.4, car.z - 9),
        to: V(car.x - 8.5, car.y + 0.9, car.z - 3),
        look: c.clone().add(V(0, -0.3, 0)),
        dur: 3.4,
      },
      {
        from: V(eye.x - 1.5, eye.y + 2.5, eye.z + 7),
        to: V(eye.x, eye.y, eye.z),
        look: c.clone().add(V(0, 0.3, 0)),
        dur: 2.6,
      },
    ];
  },
};

export class Cinematic {
  private t = 0;
  private i = 0;
  private m = new THREE.Matrix4();
  readonly pose = { pos: new THREE.Vector3(), quat: new THREE.Quaternion() };
  done = false;

  constructor(private shots: Shot[]) {}

  get caption(): [string, string] | undefined {
    return this.shots[this.i]?.caption;
  }

  update(dt: number): void {
    if (this.done) return;
    this.t += dt;
    let s = this.shots[this.i];
    while (s && this.t >= s.dur) {
      this.t -= s.dur;
      this.i++;
      s = this.shots[this.i];
    }
    if (!s) {
      this.done = true;
      return;
    }
    const k = ease(Math.min(1, this.t / s.dur));
    this.pose.pos.lerpVectors(s.from, s.to, k);
    const look = s.lookTo ? s.look.clone().lerp(s.lookTo, k) : s.look;
    this.m.lookAt(this.pose.pos, look, new THREE.Vector3(0, 1, 0));
    this.pose.quat.setFromRotationMatrix(this.m);
  }

  skip(): void {
    this.done = true;
  }
}
