import { makeIntent, type Command, type Intent } from '../shared/types';

// Translates raw keyboard/mouse into a per-frame Intent plus a queue of discrete
// Commands (interact/drop/slot). Movement is continuous; actions are edge-triggered.
export class Input {
  private keys = new Set<string>();
  private commands: Command[] = [];
  private slot = 0;
  yaw = 0;
  pitch = 0;
  sensitivity = 0.0022;
  locked = false;
  enabled = true;

  constructor(private el: HTMLElement, startYaw = 0) {
    this.yaw = startYaw;
    el.addEventListener('click', () => {
      if (this.enabled && !this.locked) el.requestPointerLock();
    });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === el;
    });
    document.addEventListener('mousemove', this.onMouse);
    addEventListener('keydown', this.onKeyDown);
    addEventListener('keyup', this.onKeyUp);
    addEventListener('wheel', this.onWheel, { passive: false });
  }

  private onMouse = (e: MouseEvent): void => {
    if (!this.locked) return;
    this.yaw -= e.movementX * this.sensitivity;
    this.pitch -= e.movementY * this.sensitivity;
    const lim = Math.PI / 2 - 0.04;
    this.pitch = Math.max(-lim, Math.min(lim, this.pitch));
  };

  private onKeyDown = (e: KeyboardEvent): void => {
    if (!this.enabled) return;
    const k = e.code;
    if (!this.keys.has(k)) {
      if (k === 'KeyE') this.commands.push({ t: 'interact' });
      else if (k === 'KeyG') this.commands.push({ t: 'drop' });
      else if (k.startsWith('Digit')) {
        const n = parseInt(k.slice(5), 10) - 1;
        if (n >= 0 && n < 6) {
          this.slot = n;
          this.commands.push({ t: 'slot', n });
        }
      }
    }
    this.keys.add(k);
    if (this.locked && (k === 'Space' || k === 'Tab' || k.startsWith('Arrow'))) e.preventDefault();
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.code);
  };

  private onWheel = (e: WheelEvent): void => {
    if (!this.locked) return;
    e.preventDefault();
    this.slot = (this.slot + (e.deltaY > 0 ? 1 : -1) + 6) % 6;
    this.commands.push({ t: 'slot', n: this.slot });
  };

  getIntent(): Intent {
    const it = makeIntent();
    const k = this.keys;
    it.fwd = k.has('KeyW') || k.has('ArrowUp');
    it.back = k.has('KeyS') || k.has('ArrowDown');
    it.left = k.has('KeyA') || k.has('ArrowLeft');
    it.right = k.has('KeyD') || k.has('ArrowRight');
    it.jump = k.has('Space');
    it.crouch = k.has('ControlLeft') || k.has('ControlRight') || k.has('KeyC');
    it.sprint = k.has('ShiftLeft') || k.has('ShiftRight');
    it.yaw = this.yaw;
    it.pitch = this.pitch;
    return it;
  }

  drainCommands(): Command[] {
    const c = this.commands;
    this.commands = [];
    return c;
  }
}
