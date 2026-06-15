import { isSolved, type BoltPuzzle } from '../../sim/puzzles/boltTorque';

// Slide each bolt's handle into its green torque band. Presentation only — the
// solvable logic lives in sim/puzzles/boltTorque.ts.
export class BoltOverlay {
  private root: HTMLDivElement;
  private panel: HTMLDivElement;
  private puzzle!: BoltPuzzle;
  private onSolved!: () => void;
  private onCancel!: () => void;
  private values: number[] = [];
  open = false;

  constructor() {
    this.root = document.createElement('div');
    this.root.className = 'overlay hidden';
    this.root.style.zIndex = '35';
    this.panel = document.createElement('div');
    this.panel.style.cssText =
      'background:linear-gradient(160deg,#1a2231,#10161f);border:1px solid rgba(255,255,255,.14);' +
      'border-radius:16px;padding:26px 34px;width:460px;text-align:center;';
    this.root.appendChild(this.panel);
    document.body.appendChild(this.root);
    addEventListener('keydown', (e) => {
      if (this.open && e.code === 'Escape') this.cancel();
    });
  }

  show(puzzle: BoltPuzzle, onSolved: () => void, onCancel: () => void): void {
    this.puzzle = puzzle;
    this.onSolved = onSolved;
    this.onCancel = onCancel;
    this.values = puzzle.targets.map(() => 0.5);
    this.open = true;
    this.render();
    this.root.classList.remove('hidden');
  }
  private hide(): void {
    this.open = false;
    this.root.classList.add('hidden');
  }
  private cancel(): void {
    this.hide();
    this.onCancel();
  }

  private render(): void {
    const p = this.puzzle;
    this.panel.innerHTML =
      '<h2 style="font-size:22px;letter-spacing:1px;color:#ffcf3f;margin-bottom:4px;">🔩 ENGINE MOUNT</h2>' +
      '<p style="opacity:.7;font-size:13px;margin-bottom:14px;">Torque each bolt into its green band.</p>';
    p.targets.forEach((t, i) => {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:12px;margin:12px 0;';
      const label = document.createElement('span');
      label.textContent = `Bolt ${i + 1}`;
      label.style.cssText = 'width:56px;font-size:13px;opacity:.8;text-align:left;';
      const track = document.createElement('div');
      track.style.cssText = 'position:relative;flex:1;height:26px;';
      const band = document.createElement('div');
      const W = 100;
      band.style.cssText =
        `position:absolute;top:8px;height:10px;border-radius:4px;background:rgba(56,224,200,.4);` +
        `left:${(t - p.tolerance) * W}%;width:${p.tolerance * 2 * W}%;`;
      const input = document.createElement('input');
      input.type = 'range';
      input.min = '0';
      input.max = '1';
      input.step = '0.005';
      input.value = String(this.values[i]);
      input.style.cssText = 'position:absolute;top:0;left:0;width:100%;accent-color:#ffcf3f;';
      input.oninput = () => {
        this.values[i] = +input.value;
        const ok = Math.abs(this.values[i] - t) <= p.tolerance;
        band.style.background = ok ? 'rgba(56,224,200,.85)' : 'rgba(56,224,200,.4)';
        if (isSolved(p, this.values)) this.solved();
      };
      track.append(band, input);
      row.append(label, track);
      this.panel.appendChild(row);
    });
    const hint = document.createElement('div');
    hint.style.cssText = 'margin-top:14px;font-size:12px;opacity:.55;';
    hint.textContent = 'Drag each handle into the green band · Esc to back out';
    this.panel.appendChild(hint);
  }

  private solved(): void {
    this.panel.style.borderColor = '#38e0c8';
    setTimeout(() => {
      this.panel.style.borderColor = 'rgba(255,255,255,.14)';
      this.hide();
      this.onSolved();
    }, 360);
  }
}
