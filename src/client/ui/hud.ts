import type { World } from '../../sim/world';
import { ITEM_DEFS, itemLabel } from '../../sim/items';
import { bindLabel, type Action } from '../bindings';
import { icon } from './icons';

// The in-game HUD. Minimal by design: a reticle that knows what it's pointing
// at, one objective, one waypoint, the toolbelt, and meters that only show up
// when they matter. Everything else lives on the job sheet (Tab).

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector(sel) as T;

export interface HudCtx {
  project(p: { x: number; y: number; z: number }): { x: number; y: number; behind: boolean };
  camPos: { x: number; y: number; z: number };
  bind(a: Action): string;
  driving: boolean;
  panel: boolean;
  cinematic: boolean;
}

export class Hud {
  private root = $('#hud');
  private reticle = $('#reticle');
  private holdArc = document.querySelector('#reticle .hold') as SVGCircleElement;
  private bandArc = document.querySelector('#reticle .band') as SVGCircleElement;
  private torqueArc = document.querySelector('#reticle .torque') as SVGCircleElement;
  private prompt = $('#prompt');
  private promptKey = $('#prompt .key');
  private promptLabel = $('#prompt .label');
  private promptWhy = $('#prompt .why');
  private objective = $('#objective');
  private objText = $('#objective .text');
  private objDetail = $('#objective .detail');
  private objClock = $('#objective .clock');
  private waypoint = $('#waypoint');
  private wpDist = $('#waypoint .dist');
  private carry = $('#carry');
  private belt = $('#belt');
  private drive = $('#drive');
  private radio = $('#radio');
  private radioWho = $('#radio .nm');
  private radioLine = $('#radio .line');
  private stamp = $('#stamp');
  private toastEl = $('#toast');
  private hurt = $('#hurt');
  private frost = $('#frost');
  private jobsheet = $('#jobsheet');
  private panelHelp = $('#panelhelp');
  private last = new Map<string, string>();
  private radioTimer = 0;
  private toastTimer = 0;
  private hurtT = 0;
  private sheetOpen = false;
  private queue: { line: string; who: string; priority: number }[] = [];
  private beltSlots: HTMLElement[] = [];

  constructor() {
    for (let i = 0; i < 4; i++) {
      const s = document.createElement('div');
      s.className = 'slot empty';
      s.innerHTML = `<span class="n">${i + 1}</span>${icon('crate')}`;
      this.belt.appendChild(s);
      this.beltSlots.push(s);
    }
  }

  private set(key: string, v: string, apply: () => void): void {
    if (this.last.get(key) === v) return;
    this.last.set(key, v);
    apply();
  }

  show(on: boolean): void {
    this.root.classList.toggle('off', !on);
  }

  // --- messages -------------------------------------------------------------------

  /**
   * Radio lines never get lost: story lines (priority 1) queue ahead of idle
   * hints and cut a hint short; urgent lines (2+) interrupt; hints wait.
   */
  say(line: string, who = 'Dispatch', priority = 1): void {
    if (!line) return;
    if (this.radioTimer <= 0) {
      this.showLine(line, who, priority);
      return;
    }
    if (priority >= 2) {
      this.showLine(line, who, priority);
      return;
    }
    if (priority >= 1) {
      const at = this.queue.findIndex((q) => q.priority < 1);
      this.queue.splice(at < 0 ? this.queue.length : at, 0, { line, who, priority });
      if (this.shownPriority < 1) this.radioTimer = Math.min(this.radioTimer, 0.6);
      return;
    }
    // don't pile up stale hints
    if (this.queue.length < 3) this.queue.push({ line, who, priority });
  }

  private shownPriority = 1;
  /** Called as each radio line actually appears (the voice follows the text). */
  onLine?: (line: string, who: string) => void;

  private showLine(line: string, who: string, priority = 1): void {
    this.onLine?.(line, who);
    this.radioWho.textContent = who;
    this.radioLine.textContent = line;
    this.radio.classList.add('show');
    this.shownPriority = priority;
    this.radioTimer = 2.4 + line.length * 0.055;
  }

  stampIt(text: string, sub = '', tone: 'good' | 'warn' | 'bad' = 'good'): void {
    const t = this.stamp.querySelector('.t')!;
    const s = this.stamp.querySelector('.s')!;
    t.textContent = text;
    s.textContent = sub;
    this.stamp.className = '';
    void this.stamp.offsetWidth; // restart the animation
    this.stamp.className = `show ${tone === 'good' ? '' : tone}`;
  }

  toast(text: string): void {
    this.toastEl.textContent = text;
    this.toastEl.classList.add('show');
    this.toastTimer = 2.2;
  }

  flashHurt(amount: number): void {
    this.hurtT = Math.min(1, this.hurtT + 0.3 + amount / 30);
  }

  objectivePop(): void {
    this.objective.classList.remove('pop');
    void this.objective.offsetWidth;
    this.objective.classList.add('pop');
    setTimeout(() => this.objective.classList.remove('pop'), 350);
  }

  toggleSheet(open: boolean): void {
    this.sheetOpen = open;
    this.jobsheet.classList.toggle('show', open);
  }

  panelMode(title: string | null, text = ''): void {
    this.panelHelp.classList.toggle('hidden', !title);
    if (title) {
      this.panelHelp.querySelector('h4')!.textContent = title;
      this.panelHelp.querySelector('p')!.textContent = text;
    }
  }

  /**
   * The prompt sits a little below the crosshair (clear of the part you're
   * working on) but never under the Dispatch subtitle or the carry line: it
   * rides up above whichever of them is showing.
   */
  private placePrompt(): void {
    const want = innerHeight / 2 + 70;
    let floor = innerHeight;
    for (const el of [this.radio, this.carry]) {
      if (!el.classList.contains('show')) continue;
      floor = Math.min(floor, el.getBoundingClientRect().top);
    }
    const h = this.prompt.offsetHeight || 40;
    const below = Math.min(want, floor - h - 10);
    // no room under the crosshair (a long line on a short screen): flip above it
    const top = below >= innerHeight / 2 + 24 ? below : innerHeight / 2 - 28 - h;
    this.set('promptTop', String(Math.round(top)), () => (this.prompt.style.top = `${Math.round(top)}px`));
  }

  /** A live line under the puzzle help: how close you are. */
  panelProgress(text: string): void {
    let el = this.panelHelp.querySelector('.progress') as HTMLElement | null;
    if (!el) {
      el = document.createElement('div');
      el.className = 'progress';
      el.style.cssText = 'margin-top:8px;font:700 15px var(--display);color:var(--orange);letter-spacing:0.5px';
      this.panelHelp.appendChild(el);
    }
    this.set('panelProg', text, () => (el!.textContent = text));
  }

  // --- per frame ----------------------------------------------------------------------

  update(w: World, c: HudCtx, dt: number, jobSheet: () => string): void {
    const p = w.player;
    const onFoot = p.mode === 'foot' && !c.panel && !c.cinematic;

    // radio queue
    if (this.radioTimer > 0) {
      this.radioTimer -= dt;
      if (this.radioTimer <= 0) {
        const next = this.queue.shift();
        if (next) this.showLine(next.line, next.who, next.priority);
        else this.radio.classList.remove('show');
      }
    }
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.toastEl.classList.remove('show');
    }
    this.hurtT = Math.max(0, this.hurtT - dt * 1.2);
    this.hurt.style.opacity = String(Math.max(this.hurtT, w.vitals.hp < 35 ? 0.35 + 0.15 * Math.sin(performance.now() / 300) : 0));
    this.frost.style.opacity = String(Math.max(0, (w.vitals.cold - 0.3) / 0.7));

    // reticle + prompt
    const f = onFoot ? w.focus : null;
    this.reticle.style.display = onFoot ? '' : 'none';
    this.reticle.classList.toggle('on', !!f);
    const g = f && !f.disabled ? f.gauge?.() : undefined;
    const torquing = !!f && f.verb === 'torque' && !f.disabled && w.holdProgress > 0;
    this.reticle.classList.toggle('torquing', torquing || (!!f && f.verb === 'pour' && !f.disabled));
    const C = 2 * Math.PI * 22;
    if (g) {
      this.bandArc.style.strokeDasharray = `${C * (g.hi - g.lo)} ${C}`;
      this.bandArc.style.strokeDashoffset = `${-C * g.lo}`;
      this.torqueArc.style.strokeDasharray = `${C * Math.min(1, g.value)} ${C}`;
      const inBand = g.value >= g.lo && g.value <= g.hi;
      this.reticle.classList.toggle('inband', inBand);
      this.reticle.classList.toggle('over', g.value > g.hi && f!.verb === 'torque');
    }
    const HC = 2 * Math.PI * 18;
    const showHold = !!f && !f.disabled && (f.verb === 'hold' || f.verb === 'loosen') && w.holdProgress > 0;
    this.holdArc.style.strokeDasharray = `${showHold ? HC * Math.min(1, w.holdProgress) : 0} ${HC}`;

    if (f) {
      const key = f.verb === 'loosen' || f.verb === 'torque' ? c.bind('use') : c.bind('interact');
      const hold = f.verb === 'hold' || f.verb === 'loosen' || f.verb === 'torque' || f.verb === 'pour';
      this.set('pk', key + hold, () => {
        this.promptKey.textContent = bindLabel(key);
        this.promptKey.classList.toggle('hold', hold);
      });
      this.set('pl', f.label, () => (this.promptLabel.textContent = f.label));
      this.set('pw', f.disabled ?? '', () => {
        this.promptWhy.textContent = f.disabled ?? '';
        this.promptWhy.style.display = f.disabled ? '' : 'none';
      });
      this.prompt.classList.toggle('disabled', !!f.disabled);
      this.prompt.classList.add('show');
      this.placePrompt();
    } else {
      this.prompt.classList.remove('show');
    }

    // objective
    const o = w.objectiveText();
    this.objective.style.display = o && !c.cinematic ? '' : 'none';
    if (o) {
      this.set('ot', o.text, () => (this.objText.textContent = o.text));
      this.set('od', o.detail ?? '', () => {
        this.objDetail.textContent = o.detail ?? '';
        this.objDetail.style.display = o.detail ? '' : 'none';
      });
    }
    const hh = Math.floor(w.hour) % 24;
    const mm = Math.floor((w.hour % 1) * 60);
    this.set('clk', `${hh}:${mm}`, () => (this.objClock.textContent = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`));

    // waypoint
    // Once you're aiming at what the step wants, the waypoint has done its job
    // (and would sit right on top of the prompt).
    const onIt = !!w.focus && w.guide().some((g) => g.id === w.focus!.id);
    const mk = c.cinematic || c.panel || onIt ? null : w.marker();
    if (mk) {
      const d = Math.hypot(mk.x - c.camPos.x, mk.y - c.camPos.y, mk.z - c.camPos.z);
      // Float above far targets (a building); sit on near ones (a lug nut).
      const s = c.project({ x: mk.x, y: mk.y + Math.min(0.6, d * 0.08), z: mk.z });
      const m = 60;
      let x = s.x;
      let y = s.y;
      let edge = false;
      if (s.behind) {
        x = innerWidth - x;
        y = innerHeight - m;
        edge = true;
      }
      if (x < m || x > innerWidth - m || y < m || y > innerHeight - m) edge = true;
      x = Math.max(m, Math.min(innerWidth - m, x));
      y = Math.max(m + 20, Math.min(innerHeight - m, y));
      // never park on top of the objective card: slide down below it
      const card = this.objective.getBoundingClientRect();
      if (card.width > 0 && x < card.right + 24 && y < card.bottom + 24) {
        if (edge && s.x < card.right) y = card.bottom + 44;
        else x = Math.max(x, card.right + 44);
      }
      this.waypoint.style.display = d < 2.2 ? 'none' : '';
      this.waypoint.style.left = `${x}px`;
      this.waypoint.style.top = `${y}px`;
      this.waypoint.classList.toggle('edge', edge);
      this.set('wd', String(Math.round(d)), () => (this.wpDist.textContent = `${Math.round(d)} m`));
    } else this.waypoint.style.display = 'none';

    // toolbelt + carry line
    const showBelt = onFoot;
    this.belt.style.display = showBelt ? '' : 'none';
    p.belt.forEach((id, i) => {
      const it = w.items.get(id);
      const k = it ? it.kind : '';
      this.set('b' + i, k, () => {
        const s = this.beltSlots[i];
        s.innerHTML = `<span class="n">${i + 1}</span>${icon(k || 'crate')}`;
        s.classList.toggle('empty', !it);
      });
      this.beltSlots[i].classList.toggle('sel', i === p.sel && p.held === null);
    });
    const held = w.items.get(p.held);
    // Riding with cargo strapped on: say what's on the rack.
    const ride = p.mode === 'drive' && p.vehicle ? w.vehicle(p.vehicle) : null;
    const cargo = ride?.def.rack ? ride.rack.map((id) => w.items.get(id)).filter((it) => !!it) : [];
    const carryText = held
      ? `Carrying <b>${itemLabel(held)}</b> · <span class="k">${bindLabel(c.bind('drop'))}</span> drop · hold to throw`
      : cargo.length
        ? `On the rack: <b>${cargo.map((it) => itemLabel(it!)).join(', ')}</b>`
        : '';
    this.set('carry', carryText, () => (this.carry.innerHTML = carryText));
    this.carry.classList.toggle('show', (!!held && onFoot) || cargo.length > 0);

    // vitals: only when they matter
    const hpOn = w.vitals.hp < w.vitals.maxHp - 0.5;
    const coldOn = w.vitals.cold > 0.04;
    const stOn = p.stamina < 0.98 && onFoot;
    this.meter('hp', hpOn, w.vitals.hp / w.vitals.maxHp);
    this.meter('cold', coldOn, w.vitals.cold);
    this.meter('stam', stOn, p.stamina);

    // driving
    this.drive.classList.toggle('show', c.driving && !c.cinematic);
    if (c.driving && p.vehicle) {
      const v = w.vehicle(p.vehicle);
      const kmh = Math.round(Math.abs(v.speed) * 3.6);
      this.set('spd', String(kmh), () => (this.drive.querySelector('.spd')!.textContent = String(kmh)));
      const integ = Math.round(v.integrity * 100);
      this.set('integ', String(integ), () => {
        const i = this.drive.querySelector('.integ i') as HTMLElement;
        i.style.width = `${integ}%`;
        i.style.background = integ > 60 ? '' : integ > 30 ? 'linear-gradient(90deg,#ffb347,#ffd98a)' : 'linear-gradient(90deg,#ff5a4f,#ff9a7a)';
      });
      const keys = `${bindLabel(c.bind('interact'))} exit · ${bindLabel(c.bind('camera'))} camera · ${bindLabel(c.bind('lights'))} lights · ${bindLabel(c.bind('jump'))} handbrake`;
      this.set('dk', keys, () => (this.drive.querySelector('.keys')!.textContent = keys));
    }

    // job sheet
    if (this.sheetOpen) {
      const html = jobSheet();
      this.set('sheet', html, () => (this.jobsheet.innerHTML = html));
    }
  }

  private meter(cls: string, on: boolean, v: number): void {
    const m = document.querySelector(`#vitals .${cls}`) as HTMLElement;
    m.classList.toggle('off', !on);
    (m.querySelector('i') as HTMLElement).style.width = `${Math.round(Math.max(0, Math.min(1, v)) * 100)}%`;
  }

  /** Is this item kind carried in hand? (for prompt hints) */
  static inHands(kind: keyof typeof ITEM_DEFS): boolean {
    return ITEM_DEFS[kind].carry === 'hands';
  }
}
