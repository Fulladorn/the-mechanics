import { ITEM_DEFS, type ItemKind } from '../../shared/types';
import { OBJECTIVE_LIST, type Objective } from '../../sim/objectives';
import { GATE_SPEED } from '../../shared/constants';
import { variantById, type PartKind, type Vehicle, type VehicleStats } from '../../sim/vehicle';

const SPEC_KINDS: PartKind[] = ['wheel', 'engine', 'seat', 'body', 'battery', 'bumper', 'headlights', 'spoiler', 'exhaust'];

const $ = (sel: string) => document.querySelector(sel) as HTMLElement;
const byId = (id: string) => document.getElementById(id) as HTMLElement;

export class Hud {
  private prompt = byId('prompt');
  private cross = byId('crosshair');
  private speedo = byId('speedo');
  private speedoVal = $('#speedo .val');
  private hotbar = byId('hotbar');
  private objList = $('#objectives ul');
  private toastEl = byId('toast');
  private timerEl = byId('runtimer');
  private specParts = $('#specsheet .spec-parts');
  private specStats = $('#specsheet .spec-stats');
  private slots: HTMLElement[] = [];
  private objItems: HTMLElement[] = [];
  private hotbarSig = '';
  private objSig = '';
  private specSig = '';
  private toastTimer = 0;

  constructor() {
    this.buildHotbar();
    this.buildObjectives();
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

  buildObjectives(): void {
    this.objList.innerHTML = '';
    this.objItems = [];
    for (const o of OBJECTIVE_LIST) {
      const li = document.createElement('li');
      li.textContent = o.text;
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
  }

  updateSpec(vehicle: Vehicle, stats: VehicleStats): void {
    const sig =
      vehicle.sockets.map((s) => s.installed ?? '-').join(',') +
      `|${stats.topSpeed.toFixed(1)},${stats.accel.toFixed(1)},${stats.grip.toFixed(2)},${stats.durability.toFixed(2)}`;
    if (sig === this.specSig) return;
    this.specSig = sig;

    this.specParts.innerHTML = SPEC_KINDS.map((k) => {
      const ss = vehicle.sockets.filter((s) => s.accepts === k);
      if (!ss.length) return '';
      const filled = ss.filter((s) => s.installed);
      const ok = filled.length === ss.length;
      const req = ss.some((s) => s.required);
      const name = filled.length ? (variantById(filled[0].installed as string)?.name ?? '') : '';
      const status = ss.length > 1 ? `${filled.length}/${ss.length}` : ok ? name || '✓' : '—';
      const cls = ok ? 'ok' : req ? 'req' : 'opt';
      return `<div class="spec-row ${cls}"><span>${ITEM_DEFS[k].icon} ${ITEM_DEFS[k].label}</span><span>${ok && ss.length > 1 ? name || status : status}</span></div>`;
    }).join('');

    const bar = (label: string, val: number, max: number) =>
      `<div class="spec-bar"><span>${label}</span><div class="bar"><i style="width:${Math.max(4, Math.min(100, (val / max) * 100)).toFixed(0)}%"></i></div></div>`;
    this.specStats.innerHTML =
      bar('SPD', stats.topSpeed, 25) +
      bar('ACC', stats.accel, 25) +
      bar('GRIP', stats.grip, 1.6) +
      bar('DUR', stats.durability, 1.8);
  }

  toast(text: string): void {
    this.toastEl.textContent = text;
    this.toastEl.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toastEl.classList.remove('show'), 2200);
  }
}
