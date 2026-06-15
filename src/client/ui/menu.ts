import { saveSettings, DEFAULT_SETTINGS, type Settings, type Quality } from '../settings';
import { ACTION_LABELS, bindLabel, type Action } from '../bindings';
import type { Input } from '../input';

export interface MenuHooks {
  onResume: () => void;
  onRestart: () => void;
  apply: () => void; // push settings into view/audio/input/dispatch
}

const REBINDABLE: Action[] = [
  'fwd',
  'back',
  'left',
  'right',
  'jump',
  'crouch',
  'sprint',
  'interact',
  'drop',
  'pause',
];

export class Menu {
  root: HTMLDivElement;
  private panel: HTMLDivElement;
  private view: 'pause' | 'settings' = 'pause';
  private standalone = false;
  private capturing: Action | null = null;
  open = false;

  constructor(
    private settings: Settings,
    private input: Input,
    private hooks: MenuHooks,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'overlay hidden';
    this.root.style.zIndex = '36';
    this.panel = document.createElement('div');
    this.panel.className = 'menu-panel';
    this.root.appendChild(this.panel);
    document.body.appendChild(this.root);
    addEventListener('keydown', (e) => {
      if (!this.open) return;
      if (this.capturing) {
        this.capturing = null; // a key was pressed/cancelled during rebind
        setTimeout(() => this.open && this.render(), 0);
        return;
      }
      if (e.code === 'Escape') {
        e.preventDefault();
        if (this.view === 'settings' && !this.standalone) {
          this.view = 'pause';
          this.render();
        } else if (this.view === 'settings' && this.standalone) {
          this.close();
        } else {
          this.hooks.onResume();
        }
      }
    });
  }

  openPause(): void {
    this.view = 'pause';
    this.standalone = false;
    this.show();
  }
  openSettings(standalone = true): void {
    this.view = 'settings';
    this.standalone = standalone;
    this.show();
  }
  private show(): void {
    this.open = true;
    this.render();
    this.root.classList.remove('hidden');
  }
  close(): void {
    this.open = false;
    this.capturing = null;
    this.root.classList.add('hidden');
  }

  private changed(): void {
    saveSettings(this.settings);
    this.hooks.apply();
  }

  private render(): void {
    this.panel.innerHTML = '';
    if (this.view === 'pause') this.renderPause();
    else this.renderSettings();
  }

  private btn(label: string, onClick: () => void, primary = false): HTMLButtonElement {
    const b = document.createElement('button');
    b.className = 'btn' + (primary ? '' : ' btn-ghost');
    b.textContent = label;
    b.onclick = onClick;
    return b;
  }

  private renderPause(): void {
    const h = document.createElement('h1');
    h.textContent = 'PAUSED';
    h.className = 'menu-title';
    this.panel.appendChild(h);
    const col = document.createElement('div');
    col.className = 'menu-col';
    col.append(
      this.btn('Resume', () => this.hooks.onResume(), true),
      this.btn('Settings', () => this.openSettings(false)),
      this.btn('Restart Mission', () => this.hooks.onRestart()),
    );
    this.panel.appendChild(col);
  }

  private renderSettings(): void {
    const h = document.createElement('h1');
    h.textContent = 'SETTINGS';
    h.className = 'menu-title';
    this.panel.appendChild(h);

    const body = document.createElement('div');
    body.className = 'menu-scroll';
    this.panel.appendChild(body);

    const s = this.settings;
    this.group(body, 'Video');
    this.slider(body, 'Field of view', s.video.fov, 65, 110, 1, (v) => {
      s.video.fov = v;
      this.changed();
    });
    this.slider(body, 'Brightness', s.video.brightness, 0.5, 1.6, 0.05, (v) => {
      s.video.brightness = v;
      this.changed();
    });
    this.segmented(body, 'Quality', ['low', 'med', 'high'], s.video.quality, (v) => {
      s.video.quality = v as Quality;
      this.changed();
    });
    this.toggle(body, 'Post-processing', s.video.postfx, (v) => {
      s.video.postfx = v;
      this.changed();
    });
    this.toggle(body, 'Shadows', s.video.shadows, (v) => {
      s.video.shadows = v;
      this.changed();
    });

    this.group(body, 'Audio');
    for (const key of ['master', 'music', 'sfx', 'voice'] as const) {
      this.slider(body, key[0].toUpperCase() + key.slice(1), s.audio[key], 0, 1, 0.05, (v) => {
        s.audio[key] = v;
        this.changed();
      });
    }

    this.group(body, 'Controls');
    this.slider(body, 'Mouse sensitivity', s.controls.sensitivity * 1000, 0.5, 6, 0.1, (v) => {
      s.controls.sensitivity = v / 1000;
      this.changed();
    });
    this.toggle(body, 'Invert look (Y)', s.controls.invertY, (v) => {
      s.controls.invertY = v;
      this.changed();
    });
    for (const a of REBINDABLE) this.rebindRow(body, a);
    body.appendChild(
      this.btn('Reset controls to defaults', () => {
        s.controls.binds = { ...DEFAULT_SETTINGS.controls.binds };
        this.input.applyBinds(s);
        this.changed();
        this.render();
      }),
    );

    this.group(body, 'Accessibility');
    this.toggle(body, 'Auto-hop assist', s.accessibility.autohop, (v) => {
      s.accessibility.autohop = v;
      this.changed();
    });
    this.toggle(body, 'View bob', s.accessibility.headbob, (v) => {
      s.accessibility.headbob = v;
      this.changed();
    });
    this.toggle(body, 'Screen shake', s.accessibility.screenshake, (v) => {
      s.accessibility.screenshake = v;
      this.changed();
    });
    this.toggle(body, 'Subtitles', s.accessibility.subtitles, (v) => {
      s.accessibility.subtitles = v;
      this.changed();
    });
    this.toggle(body, 'Colorblind cues', s.accessibility.colorblind, (v) => {
      s.accessibility.colorblind = v;
      this.changed();
    });

    const back = this.btn(this.standalone ? 'Back' : 'Back to pause', () => {
      if (this.standalone) this.close();
      else {
        this.view = 'pause';
        this.render();
      }
    });
    back.style.marginTop = '14px';
    this.panel.appendChild(back);
  }

  private group(parent: HTMLElement, title: string): void {
    const g = document.createElement('div');
    g.className = 'menu-group';
    g.textContent = title;
    parent.appendChild(g);
  }

  private rowEl(label: string): HTMLDivElement {
    const r = document.createElement('div');
    r.className = 'menu-row';
    const l = document.createElement('span');
    l.textContent = label;
    r.appendChild(l);
    return r;
  }

  private slider(
    parent: HTMLElement,
    label: string,
    value: number,
    min: number,
    max: number,
    step: number,
    onInput: (v: number) => void,
  ): void {
    const r = this.rowEl(label);
    const wrap = document.createElement('div');
    wrap.className = 'menu-ctrl';
    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(value);
    const val = document.createElement('span');
    val.className = 'menu-val';
    val.textContent = (+value).toFixed(2);
    input.oninput = () => {
      val.textContent = (+input.value).toFixed(2);
      onInput(+input.value);
    };
    wrap.append(input, val);
    r.appendChild(wrap);
    parent.appendChild(r);
  }

  private toggle(parent: HTMLElement, label: string, value: boolean, onChange: (v: boolean) => void): void {
    const r = this.rowEl(label);
    const b = document.createElement('button');
    b.className = 'menu-toggle' + (value ? ' on' : '');
    b.textContent = value ? 'ON' : 'OFF';
    b.onclick = () => {
      const nv = !b.classList.contains('on');
      b.classList.toggle('on', nv);
      b.textContent = nv ? 'ON' : 'OFF';
      onChange(nv);
    };
    r.appendChild(b);
    parent.appendChild(r);
  }

  private segmented(
    parent: HTMLElement,
    label: string,
    options: string[],
    value: string,
    onChange: (v: string) => void,
  ): void {
    const r = this.rowEl(label);
    const wrap = document.createElement('div');
    wrap.className = 'menu-seg';
    for (const o of options) {
      const b = document.createElement('button');
      b.textContent = o.toUpperCase();
      b.className = o === value ? 'active' : '';
      b.onclick = () => {
        onChange(o);
        wrap.querySelectorAll('button').forEach((x) => x.classList.remove('active'));
        b.classList.add('active');
      };
      wrap.appendChild(b);
    }
    r.appendChild(wrap);
    parent.appendChild(r);
  }

  private rebindRow(parent: HTMLElement, action: Action): void {
    const r = this.rowEl(ACTION_LABELS[action]);
    const b = document.createElement('button');
    b.className = 'menu-key';
    const code = this.settings.controls.binds[action];
    b.textContent = this.capturing === action ? 'press a key…' : bindLabel(code);
    b.onclick = () => {
      this.capturing = action;
      b.textContent = 'press a key…';
      this.input.rebindCapture = (pressed: string) => {
        // free this key from any other action (no duplicate binds)
        for (const a of Object.keys(this.settings.controls.binds) as Action[]) {
          if (this.settings.controls.binds[a] === pressed) this.settings.controls.binds[a] = '';
        }
        this.settings.controls.binds[action] = pressed;
        this.capturing = null;
        this.input.applyBinds(this.settings);
        this.changed();
        this.render();
      };
    };
    r.appendChild(b);
    parent.appendChild(r);
  }
}
