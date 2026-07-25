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
    // Mouse buttons are bindable too ("Mouse0"/"Mouse2"), so swing and block
    // land where players expect them.
    addEventListener('mousedown', this.onMouseDown);
    addEventListener('mouseup', this.onMouseUp);
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

  /** Shared edge-trigger handling for a pressed action code. */
  private press(code: string): void {
    const a = this.actionByCode.get(code);
    if (!a) return;
    if (!this.held.has(a)) {
      if (a === 'interact') this.commands.push({ t: 'interact' });
      else if (a === 'drop') this.commands.push({ t: 'drop' });
      else if (a === 'attack') this.commands.push({ t: 'attack' });
      else if (a === 'use') this.commands.push({ t: 'useItem' });
      else if (a === 'pause') {
        if (this.locked) document.exitPointerLock();
        else this.onUnlock?.();
      } else if (a.startsWith('slot')) {
        this.slot = parseInt(a.slice(4), 10) - 1;
        this.commands.push({ t: 'slot', n: this.slot });
      }
    }
    this.held.add(a);
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    if (this.rebindCapture) {
      e.preventDefault();
      const cb = this.rebindCapture;
      this.rebindCapture = undefined;
      if (e.code !== 'Escape') cb(e.code);
      return;
    }
    if (!this.enabled) return;
    this.press(e.code);
    if (this.locked && (e.code === 'Space' || e.code === 'Tab' || e.code.startsWith('Arrow')))
      e.preventDefault();
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    const a = this.actionByCode.get(e.code);
    if (a) this.held.delete(a);
    if (a === 'jump') this.jumpConsumed = false;
  };

  private onMouseDown = (e: MouseEvent): void => {
    const code = 'Mouse' + e.button;
    if (this.rebindCapture) {
      const cb = this.rebindCapture;
      this.rebindCapture = undefined;
      cb(code);
      return;
    }
    // Only while the game actually has the pointer, so menu clicks don't swing.
    if (!this.enabled || !this.locked) return;
    this.press(code);
  };

  private onMouseUp = (e: MouseEvent): void => {
    const a = this.actionByCode.get('Mouse' + e.button);
    if (a) this.held.delete(a);
  };

  private onWheel = (e: WheelEvent): void => {
    if (!this.locked) return;
    e.preventDefault();
    this.slot = (this.slot + (e.deltaY > 0 ? 1 : -1) + 6) % 6;
    this.commands.push({ t: 'slot', n: this.slot });
  };

  // --- gamepad --------------------------------------------------------------

  /** Standard-mapping button indices we care about. */
  private static PAD_BUTTONS: Record<number, Action> = {
    0: 'jump',
    1: 'drop',
    2: 'interact',
    3: 'use',
    6: 'block',
    7: 'attack',
    10: 'sprint',
    11: 'crouch',
    9: 'pause',
  };

  private padPrev = new Set<number>();
  private padHeld = new Set<Action>();
  private padAxes = { x: 0, y: 0, lookX: 0, lookY: 0 };
  padConnected = false;

  /**
   * Poll the first connected pad. Movement is thresholded because the sim's
   * Intent is boolean; look is analog and integrated per frame. Called from the
   * frame loop rather than from getIntent, so a pad can drive the game without
   * the player having to click for pointer lock first.
   */
  poll(dt: number): void {
    const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
    const pad = Array.from(pads).find((p): p is Gamepad => !!p && p.connected);
    this.padConnected = !!pad;
    if (!pad) {
      this.padHeld.clear();
      this.padAxes = { x: 0, y: 0, lookX: 0, lookY: 0 };
      return;
    }

    const dead = (v: number) => (Math.abs(v) < 0.22 ? 0 : (v - Math.sign(v) * 0.22) / 0.78);
    this.padAxes.x = dead(pad.axes[0] ?? 0);
    this.padAxes.y = dead(pad.axes[1] ?? 0);
    this.padAxes.lookX = dead(pad.axes[2] ?? 0);
    this.padAxes.lookY = dead(pad.axes[3] ?? 0);

    // Analog look, scaled to feel like the mouse sensitivity setting.
    const look = this.settings.controls.sensitivity * 1400;
    this.yaw -= this.padAxes.lookX * look * dt;
    this.pitch -= this.padAxes.lookY * look * dt * (this.settings.controls.invertY ? -1 : 1);
    const lim = Math.PI / 2 - 0.04;
    this.pitch = Math.max(-lim, Math.min(lim, this.pitch));

    this.padHeld.clear();
    for (const [idxStr, action] of Object.entries(Input.PAD_BUTTONS)) {
      const idx = Number(idxStr);
      const pressed = pad.buttons[idx]?.pressed ?? false;
      if (pressed) this.padHeld.add(action);
      // Edge-trigger the discrete actions exactly like a key press.
      if (pressed && !this.padPrev.has(idx)) {
        if (action === 'interact') this.commands.push({ t: 'interact' });
        else if (action === 'drop') this.commands.push({ t: 'drop' });
        else if (action === 'attack') this.commands.push({ t: 'attack' });
        else if (action === 'use') this.commands.push({ t: 'useItem' });
        else if (action === 'pause') this.onUnlock?.();
      }
      if (pressed) this.padPrev.add(idx);
      else this.padPrev.delete(idx);
    }
    // shoulder buttons cycle the toolbelt
    for (const [idx, dir] of [
      [4, -1],
      [5, 1],
    ] as [number, number][]) {
      const pressed = pad.buttons[idx]?.pressed ?? false;
      if (pressed && !this.padPrev.has(idx)) {
        this.slot = (this.slot + dir + 6) % 6;
        this.commands.push({ t: 'slot', n: this.slot });
      }
      if (pressed) this.padPrev.add(idx);
      else this.padPrev.delete(idx);
    }
  }

  getIntent(): Intent {
    const it = makeIntent();
    const h = this.held;
    const p = this.padAxes;
    it.fwd = h.has('fwd') || p.y < -0.3;
    it.back = h.has('back') || p.y > 0.3;
    it.left = h.has('left') || p.x < -0.3;
    it.right = h.has('right') || p.x > 0.3;
    const jumpHeld = h.has('jump') || this.padHeld.has('jump');
    if (this.settings.accessibility.autohop) {
      it.jump = jumpHeld;
    } else {
      it.jump = jumpHeld && !this.jumpConsumed;
      if (jumpHeld) this.jumpConsumed = true;
    }
    it.crouch = h.has('crouch') || this.padHeld.has('crouch');
    it.sprint = h.has('sprint') || this.padHeld.has('sprint');
    it.block = h.has('block') || this.padHeld.has('block');
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
