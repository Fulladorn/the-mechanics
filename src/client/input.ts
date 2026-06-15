import { makeIntent, type Command, type Intent } from '../shared/types';
import type { Settings } from './settings';
import type { Action } from './bindings';

// Translates raw keyboard/mouse into a per-frame Intent + a queue of discrete
// Commands, via a rebindable code->action map driven by Settings. Movement is
// continuous; actions are edge-triggered.
export class Input {
  private held = new Set<Action>();
  private commands: Command[] = [];
  private actionByCode = new Map<string, Action>();
  private slot = 0;
  private jumpConsumed = false;
  yaw = 0;
  pitch = 0;
  locked = false;
  enabled = true;
  onUnlock?: () => void;
  /** When set, the next keydown is captured for rebinding instead of played. */
  rebindCapture?: (code: string) => void;

  constructor(
    private el: HTMLElement,
    private settings: Settings,
    startYaw = 0,
  ) {
    this.yaw = startYaw;
    this.applyBinds(settings);
    el.addEventListener('click', () => {
      if (this.enabled && !this.locked) el.requestPointerLock();
    });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      const was = this.locked;
      this.locked = document.pointerLockElement === el;
      if (was && !this.locked) this.onUnlock?.();
    });
    document.addEventListener('mousemove', this.onMouse);
    addEventListener('keydown', this.onKeyDown);
    addEventListener('keyup', this.onKeyUp);
    addEventListener('wheel', this.onWheel, { passive: false });
  }

  applyBinds(s: Settings): void {
    this.settings = s;
    this.actionByCode.clear();
    for (const a of Object.keys(s.controls.binds) as Action[]) {
      const code = s.controls.binds[a];
      if (code) this.actionByCode.set(code, a);
    }
  }

  private onMouse = (e: MouseEvent): void => {
    if (!this.locked) return;
    const sens = this.settings.controls.sensitivity;
    this.yaw -= e.movementX * sens;
    this.pitch -= e.movementY * sens * (this.settings.controls.invertY ? -1 : 1);
    const lim = Math.PI / 2 - 0.04;
    this.pitch = Math.max(-lim, Math.min(lim, this.pitch));
  };

  private onKeyDown = (e: KeyboardEvent): void => {
    if (this.rebindCapture) {
      e.preventDefault();
      const cb = this.rebindCapture;
      this.rebindCapture = undefined;
      if (e.code !== 'Escape') cb(e.code);
      return;
    }
    if (!this.enabled) return;
    const a = this.actionByCode.get(e.code);
    if (!a) return;
    if (!this.held.has(a)) {
      if (a === 'interact') this.commands.push({ t: 'interact' });
      else if (a === 'drop') this.commands.push({ t: 'drop' });
      else if (a === 'pause') {
        if (this.locked) document.exitPointerLock();
        else this.onUnlock?.();
      } else if (a.startsWith('slot')) {
        this.slot = parseInt(a.slice(4), 10) - 1;
        this.commands.push({ t: 'slot', n: this.slot });
      }
    }
    this.held.add(a);
    if (this.locked && (e.code === 'Space' || e.code === 'Tab' || e.code.startsWith('Arrow')))
      e.preventDefault();
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    const a = this.actionByCode.get(e.code);
    if (a) this.held.delete(a);
    if (a === 'jump') this.jumpConsumed = false;
  };

  private onWheel = (e: WheelEvent): void => {
    if (!this.locked) return;
    e.preventDefault();
    this.slot = (this.slot + (e.deltaY > 0 ? 1 : -1) + 6) % 6;
    this.commands.push({ t: 'slot', n: this.slot });
  };

  getIntent(): Intent {
    const it = makeIntent();
    const h = this.held;
    it.fwd = h.has('fwd');
    it.back = h.has('back');
    it.left = h.has('left');
    it.right = h.has('right');
    const jumpHeld = h.has('jump');
    if (this.settings.accessibility.autohop) {
      it.jump = jumpHeld;
    } else {
      it.jump = jumpHeld && !this.jumpConsumed;
      if (jumpHeld) this.jumpConsumed = true;
    }
    it.crouch = h.has('crouch');
    it.sprint = h.has('sprint');
    it.yaw = this.yaw;
    it.pitch = this.pitch;
    return it;
  }

  clearHeld(): void {
    this.held.clear();
  }

  drainCommands(): Command[] {
    const c = this.commands;
    this.commands = [];
    return c;
  }
}
