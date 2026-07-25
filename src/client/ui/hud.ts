import { ITEM_DEFS, type ItemKind } from '../../shared/types';
import type { Objective } from '../../sim/objectives';
import { GATE_SPEED } from '../../shared/constants';
import { variantById, socketState, type PartKind, type Vehicle, type VehicleStats } from '../../sim/vehicle';
import type { Vitals } from '../../sim/hazards';
import type { World } from '../../sim/world';

const SPEC_KINDS: PartKind[] = [
  'wheel', 'engine', 'seat', 'body', 'battery', 'bumper', 'headlights', 'spoiler',
  'exhaust', 'fuel', 'brakes', 'coolant', 'winch', 'rooflight',
];

const $ = (sel: string) => document.querySelector(sel) as HTMLElement;
const byId = (id: string) => document.getElementById(id) as HTMLElement;

/** Shape prefixes so system state never depends on colour alone (GDD §7.2). */
const STATE_GLYPH = { GO: '✓', BROKEN: '⚠', MISSING: '✕' } as const;

export class Hud {
  private hud = byId('hud');
  private prompt = byId('prompt');
  private cross = byId('crosshair');
  private speedo = byId('speedo');
  private speedoVal = $('#speedo .val');
  private hotbar = byId('hotbar');
  private objList = $('#objectives ul');
  private objTitle = $('#objectives h3');
  private toastEl = byId('toast');
  private timerEl = byId('runtimer');
  private specParts = $('#specsheet .spec-parts');
  private specStats = $('#specsheet .spec-stats');
  private vitals = byId('vitals');
  private hpFill = $('#vitals .hp i');
  private hpVal = $('#vitals .hp b');
  private coldRow = $('#vitals .cold');
  private coldFill = $('#vitals .cold i');
  private integRow = $('#vitals .integ');
  private integFill = $('#vitals .integ i');
  private integVal = $('#vitals .integ b');
  private damageFx = byId('damage-fx');
  private compass = byId('compass');
  private compassNeedle = $('#compass .needle');
  private compassDist = $('#compass .dist');
  private slots: HTMLElement[] = [];
  private objItems: HTMLElement[] = [];
  private hotbarSig = '';
  private objSig = '';
  private specSig = '';
  private vitalsSig = '';
  private toastTimer = 0;
  private damageTimer = 0;
  private colorblind = false;

  constructor() {
    this.buildHotbar();
  }

  setVisible(on: boolean): void {
    this.hud.style.display = on ? '' : 'none';
  }

  setColorblind(on: boolean): void {
    this.colorblind = on;
    // Set on <body> so the shell, puzzle overlays and HUD all repalette together.
    document.body.classList.toggle('cb', on);
    this.specSig = '';
  }

  setVitalsEnabled(on: boolean): void {
    this.vitals.style.display = on ? '' : 'none';
    this.compass.style.display = on ? '' : 'none';
  }

  buildHotbar(): void {
    this.hotbar.innerHTML = '';
    this.slots = [];
    for (let i = 0; i < 6; i++) {
      const d = document.createElement('div');
      d.className = 'slot';
      d.innerHTML = `<span class="num">${i + 1}</span>`;
      this.hotbar.appendChild(d);
      this.slots.push(d);
    }
    this.hotbarSig = '';
  }

  buildObjectives(list: ReadonlyArray<{ text: string; optional?: boolean }>): void {
    this.objList.innerHTML = '';
    this.objItems = [];
    for (const o of list) {
      const li = document.createElement('li');
      li.textContent = o.optional ? `${o.text} (optional)` : o.text;
      if (o.optional) li.classList.add('opt');
      this.objList.appendChild(li);
      this.objItems.push(li);
    }
    this.objSig = '';
  }

  setPrompt(text: string | null): void {
    if (text) {
      this.prompt.innerHTML = `<span class="key">E</span>${text}`;
      this.prompt.style.opacity = '1';
      this.cross.classList.add('active');
    } else {
      this.prompt.style.opacity = '0';
      this.cross.classList.remove('active');
    }
  }

  setTimer(text: string, show: boolean): void {
    this.timerEl.textContent = text;
    this.timerEl.classList.toggle('show', show);
  }

  setSpeed(v: number): void {
    this.speedoVal.textContent = v.toFixed(1);
    this.speedo.classList.toggle('fast', v >= GATE_SPEED);
  }

  updateHotbar(hotbar: (ItemKind | null)[], sel: number, carrying: ItemKind | null): void {
    const sig = hotbar.join(',') + '|' + sel + '|' + (carrying ?? '');
    if (sig === this.hotbarSig) return;
    this.hotbarSig = sig;
    for (let i = 0; i < 6; i++) {
      const s = this.slots[i];
      s.classList.toggle('sel', i === sel);
      const kind = hotbar[i];
      s.querySelector('.icon')?.remove();
      s.querySelector('.label')?.remove();
      if (kind) {
        const ic = document.createElement('span');
        ic.className = 'icon';
        ic.textContent = ITEM_DEFS[kind].icon;
        s.appendChild(ic);
        if (i === sel) {
          const lb = document.createElement('span');
          lb.className = 'label';
          lb.textContent = ITEM_DEFS[kind].label;
          s.appendChild(lb);
        }
      }
    }
  }

  updateObjectives(list: Objective[], activeIndex: number): void {
    const sig = list.map((o) => (o.done ? '1' : '0')).join('') + activeIndex;
    if (sig === this.objSig) return;
    this.objSig = sig;
    list.forEach((o, i) => {
      const li = this.objItems[i];
      if (!li) return;
      li.classList.toggle('done', o.done);
      li.classList.toggle('active', !o.done && i === activeIndex);
    });
    const remaining = list.filter((o) => !o.done && !o.optional).length;
    if (this.objTitle) this.objTitle.textContent = remaining ? `Objectives · ${remaining} left` : 'Objectives';
  }

  /** The repair checklist: every system with its MISSING/BROKEN/GO state. */
  updateSpec(vehicle: Vehicle, stats: VehicleStats): void {
    const sig =
      vehicle.sockets.map((s) => `${s.id}:${s.installed ?? '-'}:${s.broken ?? ''}`).join(',') +
      `|${stats.topSpeed.toFixed(1)},${stats.accel.toFixed(1)},${stats.grip.toFixed(2)},${stats.durability.toFixed(2)}` +
      `|${this.colorblind ? 1 : 0}`;
    if (sig === this.specSig) return;
    this.specSig = sig;

    this.specParts.innerHTML = SPEC_KINDS.map((k) => {
      const ss = vehicle.sockets.filter((s) => s.accepts === k);
      if (!ss.length) return '';
      const states = ss.map(socketState);
      const go = states.filter((s) => s === 'GO').length;
      const state = go === ss.length ? 'GO' : states.includes('BROKEN') ? 'BROKEN' : 'MISSING';
      const req = ss.some((s) => s.required);
      const first = ss.find((s) => s.installed);
      const name = first ? (variantById(first.installed as string)?.name ?? '') : '';
      const status =
        ss.length > 1 && state !== 'GO'
          ? `${go}/${ss.length}`
          : state === 'GO'
            ? name || 'GO'
            : state === 'BROKEN'
              ? 'BROKEN'
              : '—';
      const cls = state === 'GO' ? 'ok' : req ? 'req' : 'opt';
      const label = ss[0].label ?? ITEM_DEFS[k].label;
      return (
        `<div class="spec-row ${cls}"><span>${ITEM_DEFS[k].icon} ${label}</span>` +
        `<span>${STATE_GLYPH[state]} ${status}</span></div>`
      );
    }).join('');

    const bar = (label: string, val: number, max: number) =>
      `<div class="spec-bar"><span>${label}</span><div class="bar"><i style="width:${Math.max(4, Math.min(100, (val / max) * 100)).toFixed(0)}%"></i></div></div>`;
    this.specStats.innerHTML =
      bar('SPD', stats.topSpeed, 25) +
      bar('ACC', stats.accel, 25) +
      bar('GRIP', stats.grip, 1.6) +
      bar('DUR', stats.durability, 1.8);
  }

  updateVitals(v: Vitals, integrity: number): void {
    const sig = `${Math.round(v.hp)}|${v.cold.toFixed(2)}|${integrity.toFixed(2)}|${v.warming ? 1 : 0}|${this.colorblind ? 1 : 0}`;
    if (sig === this.vitalsSig) return;
    this.vitalsSig = sig;

    const hpPct = Math.max(0, (v.hp / v.maxHp) * 100);
    this.hpFill.style.width = `${hpPct}%`;
    this.hpFill.style.background = this.colorblind
      ? hpPct > 55 ? '#4ea9ff' : hpPct > 25 ? '#ffcf3f' : '#ff9a3c'
      : hpPct > 55 ? '#4fd97e' : hpPct > 25 ? '#ffcf3f' : '#ff5d5d';
    this.hpVal.textContent = String(Math.max(0, Math.round(v.hp)));

    const coldPct = v.cold * 100;
    this.coldFill.style.width = `${coldPct}%`;
    this.coldRow.classList.toggle('warn', v.cold > 0.6);
    this.coldRow.classList.toggle('warming', v.warming);

    this.integFill.style.width = `${integrity * 100}%`;
    this.integFill.style.background = this.colorblind
      ? integrity > 0.5 ? '#4ea9ff' : integrity > 0.25 ? '#ffcf3f' : '#ff9a3c'
      : integrity > 0.5 ? '#5fd9c8' : integrity > 0.25 ? '#ffcf3f' : '#ff5d5d';
    this.integVal.textContent = `${Math.round(integrity * 100)}%`;
    this.integRow.classList.toggle('warn', integrity < 0.35);
  }

  /**
   * Compass strip pointing at the active objective's marker. Finding parts
   * across two kilometres of mountain without one is a scavenger hunt.
   */
  updateCompass(world: World, camYaw: number): void {
    const obj = world.objectives.active();
    const marker = obj?.marker;
    if (!marker || obj?.done) {
      this.compass.classList.remove('show');
      return;
    }
    this.compass.classList.add('show');
    const p = world.player.pos;
    const dx = marker.x - p.x;
    const dz = marker.z - p.z;
    const dist = Math.hypot(dx, dz);
    // Bearing relative to where the camera is looking; 0 = dead ahead.
    const bearing = Math.atan2(-dx, -dz) - camYaw;
    let rel = ((bearing + Math.PI) % (Math.PI * 2)) - Math.PI;
    if (rel < -Math.PI) rel += Math.PI * 2;
    const clamped = Math.max(-1, Math.min(1, rel / (Math.PI * 0.75)));
    this.compassNeedle.style.transform = `translateX(${clamped * 46}%)`;
    this.compassNeedle.classList.toggle('behind', Math.abs(rel) > Math.PI * 0.75);
    this.compassDist.textContent = dist > 999 ? '999m+' : `${Math.round(dist)}m`;
  }

  flashDamage(cause: string): void {
    this.damageFx.classList.add('show');
    this.damageFx.classList.toggle('cold', cause === 'cold');
    clearTimeout(this.damageTimer);
    this.damageTimer = window.setTimeout(() => this.damageFx.classList.remove('show'), 240);
  }

  toast(text: string): void {
    this.toastEl.textContent = text;
    this.toastEl.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toastEl.classList.remove('show'), 2200);
  }
}
