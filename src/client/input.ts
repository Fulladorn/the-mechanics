import { makeIntent, type Command, type Intent } from '../sim/world';
import type { Settings } from './settings';
import type { Action } from './bindings';

// Keyboard / mouse / gamepad → a held-state Intent (sampled every sim tick)
// plus edge-triggered Commands and client-only UI actions. Mouse look only
// accumulates while the pointer is locked; in "cursor mode" (puzzle panels)
// the mouse drives a free cursor instead.

export type UiAction = 'pause' | 'jobsheet' | 'jobsheetUp' | 'camera';

export class Input {
  private held = new Set<Action>();
  private commands: Command[] = [];
  private ui: UiAction[] = [];
  private actionByCode = new Map<string, Action>();
  yaw = 0;
  pitch = 0;
  locked = false;
  enabled = true;
  /** Panel mode: the pointer is free and clicks go to `onCursor`. */
  cursorMode = false;
  onUnlock?: () => void;
  onCursor?: (kind: 'down' | 'up' | 'move', x: number, y: number) => void;
  rebindCapture?: (code: string) => void;

  constructor(
    private el: HTMLElement,
    private settings: Settings,
  ) {
    this.applyBinds(settings);
    el.addEventListener('click', () => {
      if (this.enabled && !this.locked && !this.cursorMode) this.lock();
    });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('mousedown', this.onMouseDown);
    addEventListener('mouseup', this.onMouseUp);
    document.addEventListener('pointerlockchange', () => {
      const was = this.locked;
      this.locked = document.pointerLockElement === el;
      if (was && !this.locked && !this.cursorMode) this.onUnlock?.();
    });
    document.addEventListener('mousemove', this.onMouse);
    addEventListener('keydown', this.onKeyDown);
    addEventListener('keyup', this.onKeyUp);
    addEventListener('wheel', this.onWheel, { passive: false });
    addEventListener('blur', () => this.clearHeld());
  }

  lock(): void {
    try {
      const p = this.el.requestPointerLock() as unknown as Promise<void> | undefined;
      p?.catch?.(() => {});
    } catch {
      /* not allowed yet (needs a gesture) */
    }
  }

  applyBinds(s: Settings): void {
    this.settings = s;
    this.actionByCode.clear();
    for (const a of Object.keys(s.controls.binds) as Action[]) {
      const code = s.controls.binds[a];
      if (code) this.actionByCode.set(code, a);
    }
  }

  bindFor(a: Action): string {
    return this.settings.controls.binds[a];
  }

  private onMouse = (e: MouseEvent): void => {
    if (this.cursorMode) {
      this.onCursor?.('move', e.clientX, e.clientY);
      return;
    }
    if (!this.locked) return;
    const sens = this.settings.controls.sensitivity;
    this.yaw -= e.movementX * sens;
    this.pitch -= e.movementY * sens * (this.settings.controls.invertY ? -1 : 1);
    const lim = Math.PI / 2 - 0.04;
    this.pitch = Math.max(-lim, Math.min(lim, this.pitch));
  };

  private press(code: string): void {
    const a = this.actionByCode.get(code);
    if (!a) return;
    if (!this.held.has(a)) {
      switch (a) {
        case 'pause':
          this.ui.push('pause');
          break;
        case 'jobsheet':
          this.ui.push('jobsheet');
          break;
        case 'camera':
          this.ui.push('camera');
          break;
        case 'flashlight':
          this.commands.push({ t: 'flashlight' });
          break;
        case 'lights':
          this.commands.push({ t: 'lights' });
          break;
        case 'horn':
          this.commands.push({ t: 'horn' });
          break;
        case 'unflip':
          this.commands.push({ t: 'unflip' });
          break;
        case 'slot1':
        case 'slot2':
        case 'slot3':
        case 'slot4':
          this.commands.push({ t: 'slot', n: parseInt(a.slice(4), 10) - 1 });
          break;
      }
    }
    this.held.add(a);
  }

  private release(code: string): void {
    const a = this.actionByCode.get(code);
    if (!a) return;
    this.held.delete(a);
    if (a === 'jobsheet') this.ui.push('jobsheetUp');
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    if (this.rebindCapture) {
      e.preventDefault();
      const cb = this.rebindCapture;
      this.rebindCapture = undefined;
      if (e.code !== 'Escape') cb(e.code);
      return;
    }
    if (e.code === 'Tab' || e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
    if (!this.enabled) {
      // Escape still works to close things while gameplay input is off.
      if (this.actionByCode.get(e.code) === 'pause' && !e.repeat) this.ui.push('pause');
      return;
    }
    if (e.repeat) return;
    this.press(e.code);
  };

  private onKeyUp = (e: KeyboardEvent): void => this.release(e.code);

  private onMouseDown = (e: MouseEvent): void => {
    const code = 'Mouse' + e.button;
    if (this.rebindCapture) {
      const cb = this.rebindCapture;
      this.rebindCapture = undefined;
      cb(code);
      return;
    }
    if (this.cursorMode) {
      if (e.button === 0) this.onCursor?.('down', e.clientX, e.clientY);
      else if (e.button === 2) this.ui.push('pause');
      return;
    }
    if (!this.enabled || !this.locked) return;
    this.press(code);
  };

  private onMouseUp = (e: MouseEvent): void => {
    if (this.cursorMode && e.button === 0) this.onCursor?.('up', e.clientX, e.clientY);
    this.release('Mouse' + e.button);
  };

  private onWheel = (e: WheelEvent): void => {
    if (!this.locked) return;
    e.preventDefault();
    this.commands.push({ t: 'cycle', dir: e.deltaY > 0 ? 1 : -1 });
  };

  // --- gamepad (standard mapping) -----------------------------------------------

  private static PAD: Record<number, Action> = {
    0: 'jump',
    1: 'drop',
    2: 'interact',
    3: 'flashlight',
    6: 'block',
    7: 'use',
    10: 'sprint',
    11: 'crouch',
    9: 'pause',
    8: 'jobsheet',
    12: 'camera',
    13: 'lights',
  };
  private padPrev = new Set<number>();
  private padHeld = new Set<Action>();
  private padAxes = { x: 0, y: 0 };
  padConnected = false;

  poll(dt: number): void {
    const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
    const pad = Array.from(pads).find((p): p is Gamepad => !!p && p.connected);
    this.padConnected = !!pad;
    if (!pad) {
      this.padHeld.clear();
      this.padAxes = { x: 0, y: 0 };
      return;
    }
    const dead = (v: number) => (Math.abs(v) < 0.2 ? 0 : (v - Math.sign(v) * 0.2) / 0.8);
    this.padAxes.x = dead(pad.axes[0] ?? 0);
    this.padAxes.y = dead(pad.axes[1] ?? 0);
    if (!this.cursorMode) {
      const look = this.settings.controls.sensitivity * 1300;
      this.yaw -= dead(pad.axes[2] ?? 0) * look * dt;
      this.pitch -= dead(pad.axes[3] ?? 0) * look * dt * (this.settings.controls.invertY ? -1 : 1);
      const lim = Math.PI / 2 - 0.04;
      this.pitch = Math.max(-lim, Math.min(lim, this.pitch));
    }
    this.padHeld.clear();
    for (const [k, action] of Object.entries(Input.PAD)) {
      const idx = Number(k);
      const down = pad.buttons[idx]?.pressed ?? false;
      if (down) this.padHeld.add(action);
      if (down && !this.padPrev.has(idx)) {
        const code = this.settings.controls.binds[action];
        this.press(code);
        this.held.delete(action); // pad state lives in padHeld
      }
      if (!down && this.padPrev.has(idx) && action === 'jobsheet') this.ui.push('jobsheetUp');
      if (down) this.padPrev.add(idx);
      else this.padPrev.delete(idx);
    }
    for (const [idx, dir] of [
      [4, -1],
      [5, 1],
    ] as [number, number][]) {
      const down = pad.buttons[idx]?.pressed ?? false;
      if (down && !this.padPrev.has(idx)) this.commands.push({ t: 'cycle', dir });
      if (down) this.padPrev.add(idx);
      else this.padPrev.delete(idx);
    }
  }

  private has(a: Action): boolean {
    return this.held.has(a) || this.padHeld.has(a);
  }

  getIntent(): Intent {
    const it = makeIntent();
    const p = this.padAxes;
    it.fwd = this.has('fwd') || p.y < -0.3;
    it.back = this.has('back') || p.y > 0.3;
    it.left = this.has('left') || p.x < -0.3;
    it.right = this.has('right') || p.x > 0.3;
    it.jump = this.has('jump');
    it.crouch = this.has('crouch');
    it.sprint = this.has('sprint');
    it.interact = this.has('interact');
    it.use = this.has('use');
    it.block = this.has('block');
    it.drop = this.has('drop');
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

  drainUi(): UiAction[] {
    const u = this.ui;
    this.ui = [];
    return u;
  }
}
