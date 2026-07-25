import { press, isSolved as fuseSolved, type FusePuzzle } from '../../sim/puzzles/fuseGrid';
import { inBand, isSolved as boltSolved, release, type BoltPuzzle } from '../../sim/puzzles/boltTorque';
import {
  SAFE_TARGET,
  gaugeOk,
  isSolved as valveSolved,
  readings,
  setValve,
  type ValvePuzzle,
} from '../../sim/puzzles/valveBalance';

// Diegetic repair minigames. The sim owns the puzzle state and the win check;
// this file is presentation and input only (GDD §7.2).
//
// Colour-blind safe: every state that matters is carried by a shape or a label
// as well as a colour — never colour alone.

export type PuzzleSpec =
  | { kind: 'fuse'; puzzle: FusePuzzle; title: string; blurb: string }
  | { kind: 'bolt'; puzzle: BoltPuzzle; title: string; blurb: string }
  | { kind: 'valve'; puzzle: ValvePuzzle; title: string; blurb: string };

const OK = '#38e0c8';
const BAD = '#ff7a6b';
const OK_CB = '#4ea9ff';
const BAD_CB = '#ff9a3c';

export class PuzzleOverlay {
  private root: HTMLDivElement;
  private panel: HTMLDivElement;
  private onSolved: () => void = () => {};
  private onCancel: () => void = () => {};
  private spec?: PuzzleSpec;
  private raf = 0;
  private colorblind = false;
  /** Bolt puzzle transient state. */
  private boltIndex = 0;
  private torque = 0;
  private winding = false;
  private lastT = 0;
  private feedback = '';
  open = false;

  constructor() {
    this.root = document.createElement('div');
    this.root.className = 'overlay hidden';
    this.root.style.zIndex = '35';
    this.panel = document.createElement('div');
    this.panel.className = 'puzzle-panel';
    this.root.appendChild(this.panel);
    document.body.appendChild(this.root);

    addEventListener('keydown', (e) => {
      if (!this.open) return;
      if (e.code === 'Escape') {
        e.preventDefault();
        this.cancel();
      } else if (e.code === 'Space' && this.spec?.kind === 'bolt') {
        e.preventDefault();
        this.winding = true;
      }
    });
    addEventListener('keyup', (e) => {
      if (this.open && e.code === 'Space' && this.spec?.kind === 'bolt') this.releaseBolt();
    });
  }

  setColorblind(on: boolean): void {
    this.colorblind = on;
  }

  private get ok(): string {
    return this.colorblind ? OK_CB : OK;
  }
  private get bad(): string {
    return this.colorblind ? BAD_CB : BAD;
  }

  show(spec: PuzzleSpec, onSolved: () => void, onCancel: () => void): void {
    this.spec = spec;
    this.onSolved = onSolved;
    this.onCancel = onCancel;
    this.open = true;
    this.boltIndex = spec.kind === 'bolt' ? spec.puzzle.bolts.findIndex((b) => !b.done) : 0;
    this.torque = 0;
    this.winding = false;
    this.feedback = '';
    this.root.classList.remove('hidden');
    this.render();
    if (spec.kind === 'bolt') {
      this.lastT = performance.now();
      this.raf = requestAnimationFrame(this.tick);
    }
  }

  private hide(): void {
    this.open = false;
    this.root.classList.add('hidden');
    cancelAnimationFrame(this.raf);
  }

  private cancel(): void {
    this.hide();
    this.onCancel();
  }

  private solved(): void {
    this.panel.classList.add('solved');
    setTimeout(() => {
      this.panel.classList.remove('solved');
      this.hide();
      this.onSolved();
    }, 460);
  }

  private header(title: string, blurb: string): string {
    return (
      `<h2 class="puzzle-title">${title}</h2>` +
      `<p class="puzzle-blurb">${blurb}</p>`
    );
  }

  private footer(hint: string): HTMLElement {
    const d = document.createElement('div');
    d.className = 'puzzle-hint';
    d.textContent = `${hint} · Esc to back out`;
    return d;
  }

  private render(): void {
    if (!this.spec) return;
    switch (this.spec.kind) {
      case 'fuse':
        return this.renderFuse(this.spec.puzzle, this.spec.title, this.spec.blurb);
      case 'bolt':
        return this.renderBolt(this.spec.puzzle, this.spec.title, this.spec.blurb);
      case 'valve':
        return this.renderValve(this.spec.puzzle, this.spec.title, this.spec.blurb);
    }
  }

  // --- fuse grid: lights-out ------------------------------------------------

  private fuseState: boolean[] = [];

  private renderFuse(p: FusePuzzle, title: string, blurb: string): void {
    if (this.fuseState.length !== p.start.length) this.fuseState = p.start.slice();
    this.panel.innerHTML = this.header(title, blurb);
    const grid = document.createElement('div');
    grid.className = 'fuse-grid';
    grid.style.gridTemplateColumns = `repeat(${p.size}, 64px)`;
    this.fuseState.forEach((on, i) => {
      const cell = document.createElement('button');
      cell.className = 'fuse-cell' + (on ? ' on' : '');
      // Shape + label, not just colour.
      cell.textContent = on ? '●' : '○';
      cell.setAttribute('aria-label', on ? 'live' : 'dead');
      cell.onclick = () => {
        this.fuseState = press(p.size, this.fuseState, i);
        if (fuseSolved(this.fuseState)) {
          this.renderFuse(p, title, blurb);
          this.solved();
        } else this.renderFuse(p, title, blurb);
      };
      grid.appendChild(cell);
    });
    this.panel.appendChild(grid);
    const lit = this.fuseState.filter(Boolean).length;
    const count = document.createElement('div');
    count.className = 'puzzle-count';
    count.textContent = `${lit} / ${this.fuseState.length} circuits live`;
    this.panel.appendChild(count);
    this.panel.appendChild(this.footer('A press flips that node and its neighbours'));
  }

  /** Reset per-open state that isn't owned by the sim. */
  resetTransient(): void {
    this.fuseState = [];
  }

  // --- bolt torque ----------------------------------------------------------

  private tick = (now: number): void => {
    if (!this.open || this.spec?.kind !== 'bolt') return;
    const dt = Math.min(0.05, (now - this.lastT) / 1000);
    this.lastT = now;
    const p = this.spec.puzzle;
    const bolt = p.bolts[this.boltIndex];
    if (bolt && !bolt.done) {
      if (this.winding) {
        this.torque += bolt.rate * dt;
        if (this.torque >= p.stripAt) {
          this.torque = p.stripAt;
          this.releaseBolt();
        }
      } else if (this.torque > 0) {
        // Backing off is quick, so a stripped bolt is a setback not a wall.
        this.torque = Math.max(0, this.torque - dt * 1.6);
      }
    }
    this.paintBolt();
    this.raf = requestAnimationFrame(this.tick);
  };

  private releaseBolt(): void {
    if (this.spec?.kind !== 'bolt' || !this.winding) return;
    this.winding = false;
    const p = this.spec.puzzle;
    const result = release(p, this.boltIndex, this.torque);
    this.torque = 0;
    this.feedback =
      result === 'seated' ? 'SEATED ✓' : result === 'stripped' ? 'STRIPPED — back it off' : 'UNDER-TORQUED';
    if (boltSolved(p)) {
      this.renderBolt(p, this.spec.title, this.spec.blurb);
      this.solved();
      return;
    }
    if (result === 'seated') {
      const next = p.bolts.findIndex((b) => !b.done);
      if (next !== -1) this.boltIndex = next;
    }
    this.renderBolt(p, this.spec.title, this.spec.blurb);
  }

  private renderBolt(p: BoltPuzzle, title: string, blurb: string): void {
    this.panel.innerHTML = this.header(title, blurb);

    const row = document.createElement('div');
    row.className = 'bolt-row';
    p.bolts.forEach((b, i) => {
      const btn = document.createElement('button');
      btn.className = 'bolt-pip' + (b.done ? ' done' : i === this.boltIndex ? ' active' : '');
      btn.textContent = b.done ? '✓' : String(i + 1);
      btn.onclick = () => {
        if (b.done) return;
        this.boltIndex = i;
        this.torque = 0;
        this.renderBolt(p, title, blurb);
      };
      row.appendChild(btn);
    });
    this.panel.appendChild(row);

    const bolt = p.bolts[this.boltIndex];
    const gauge = document.createElement('div');
    gauge.className = 'torque-gauge';
    const band = document.createElement('i');
    band.className = 'torque-band';
    if (bolt) {
      band.style.left = `${(bolt.target - bolt.tolerance) * 100}%`;
      band.style.width = `${bolt.tolerance * 200}%`;
    }
    const fill = document.createElement('b');
    fill.className = 'torque-fill';
    const needle = document.createElement('u');
    needle.className = 'torque-needle';
    gauge.append(band, fill, needle);
    this.panel.appendChild(gauge);

    const readout = document.createElement('div');
    readout.className = 'torque-readout';
    this.panel.appendChild(readout);

    const fb = document.createElement('div');
    fb.className = 'puzzle-count';
    fb.textContent = this.feedback;
    this.panel.appendChild(fb);

    this.panel.appendChild(this.footer('Hold Space to wind, release inside the band'));
    this.paintBolt();
  }

  private paintBolt(): void {
    if (this.spec?.kind !== 'bolt') return;
    const bolt = this.spec.puzzle.bolts[this.boltIndex];
    const fill = this.panel.querySelector('.torque-fill') as HTMLElement | null;
    const needle = this.panel.querySelector('.torque-needle') as HTMLElement | null;
    const readout = this.panel.querySelector('.torque-readout') as HTMLElement | null;
    if (!fill || !needle || !bolt) return;
    const pct = Math.min(1, this.torque) * 100;
    fill.style.width = `${pct}%`;
    needle.style.left = `${pct}%`;
    const good = inBand(bolt, this.torque);
    const over = this.torque > bolt.target + bolt.tolerance;
    fill.style.background = good ? this.ok : over ? this.bad : '#8794a8';
    if (readout) {
      readout.textContent = `${Math.round(this.torque * 120)} Nm ${good ? '— IN BAND' : over ? '— OVER' : ''}`;
      readout.style.color = good ? this.ok : over ? this.bad : '#cdd5e0';
    }
  }

  // --- valve balance --------------------------------------------------------

  private renderValve(p: ValvePuzzle, title: string, blurb: string): void {
    this.panel.innerHTML = this.header(title, blurb);

    const gauges = document.createElement('div');
    gauges.className = 'valve-gauges';
    const reads = readings(p);
    reads.forEach((r, i) => {
      const g = document.createElement('div');
      g.className = 'valve-gauge';
      const ok = gaugeOk(p, i);
      const bar = document.createElement('div');
      bar.className = 'valve-bar';
      const safe = document.createElement('i');
      safe.className = 'valve-safe';
      safe.style.left = `${(SAFE_TARGET - p.tolerance) * 100}%`;
      safe.style.width = `${p.tolerance * 200}%`;
      const mark = document.createElement('u');
      mark.className = 'valve-mark';
      mark.style.left = `${Math.max(0, Math.min(1, r)) * 100}%`;
      mark.style.background = ok ? this.ok : this.bad;
      bar.append(safe, mark);
      const label = document.createElement('span');
      // Shape carries the state as well as the colour.
      label.textContent = `${['A', 'B', 'C'][i] ?? i + 1} ${ok ? '✓ OK' : '✕ OUT'}`;
      label.style.color = ok ? this.ok : this.bad;
      g.append(label, bar);
      gauges.appendChild(g);
    });
    this.panel.appendChild(gauges);

    const valves = document.createElement('div');
    valves.className = 'valve-sliders';
    p.valves.forEach((v, i) => {
      const wrap = document.createElement('label');
      wrap.className = 'valve-slider';
      const name = document.createElement('span');
      name.textContent = `Valve ${i + 1}`;
      const input = document.createElement('input');
      input.type = 'range';
      input.min = '0';
      input.max = '1';
      input.step = '0.005';
      input.value = String(v);
      input.oninput = () => {
        setValve(p, i, +input.value);
        if (valveSolved(p)) {
          this.renderValve(p, title, blurb);
          this.solved();
        } else this.renderValve(p, title, blurb);
      };
      wrap.append(name, input);
      valves.appendChild(wrap);
    });
    this.panel.appendChild(valves);
    this.panel.appendChild(this.footer('Every valve feeds more than one gauge'));
  }
}
