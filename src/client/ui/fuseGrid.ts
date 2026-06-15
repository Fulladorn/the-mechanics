import { press, isSolved, type FusePuzzle } from '../../sim/puzzles/fuseGrid';

// Lights-out: press a node to toggle it + its neighbours; light the whole grid.
// Used for the hidden lore crate. Presentation only.
export class FuseOverlay {
  private root: HTMLDivElement;
  private panel: HTMLDivElement;
  private puzzle!: FusePuzzle;
  private state: boolean[] = [];
  private onSolved!: () => void;
  private onCancel!: () => void;
  open = false;

  constructor() {
    this.root = document.createElement('div');
    this.root.className = 'overlay hidden';
    this.root.style.zIndex = '35';
    this.panel = document.createElement('div');
    this.panel.style.cssText =
      'background:linear-gradient(160deg,#1a2231,#10161f);border:1px solid rgba(255,255,255,.14);' +
      'border-radius:16px;padding:26px 34px;width:380px;text-align:center;';
    this.root.appendChild(this.panel);
    document.body.appendChild(this.root);
    addEventListener('keydown', (e) => {
      if (this.open && e.code === 'Escape') this.cancel();
    });
  }

  show(puzzle: FusePuzzle, onSolved: () => void, onCancel: () => void): void {
    this.puzzle = puzzle;
    this.state = puzzle.start.slice();
    this.onSolved = onSolved;
    this.onCancel = onCancel;
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
    const sz = this.puzzle.size;
    this.panel.innerHTML =
      '<h2 style="font-size:21px;letter-spacing:1px;color:#5fd9c8;margin-bottom:4px;">⬡ SEALED CRATE</h2>' +
      '<p style="opacity:.7;font-size:13px;margin-bottom:14px;">Reroute the circuit — light every node.</p>';
    const grid = document.createElement('div');
    grid.style.cssText = `display:grid;grid-template-columns:repeat(${sz},64px);gap:10px;justify-content:center;`;
    this.state.forEach((on, i) => {
      const cell = document.createElement('button');
      cell.style.cssText =
        `width:64px;height:64px;border-radius:10px;cursor:pointer;border:2px solid rgba(255,255,255,.18);` +
        `transition:background .1s;background:${on ? '#38e0c8' : '#1a2230'};box-shadow:${on ? '0 0 14px rgba(56,224,200,.6)' : 'none'};`;
      cell.onclick = () => {
        this.state = press(sz, this.state, i);
        if (isSolved(this.state)) this.solved();
        else this.render();
      };
      grid.appendChild(cell);
    });
    this.panel.appendChild(grid);
    const hint = document.createElement('div');
    hint.style.cssText = 'margin-top:16px;font-size:12px;opacity:.55;';
    hint.textContent = 'A press flips that node and its neighbours · Esc to back out';
    this.panel.appendChild(hint);
  }

  private solved(): void {
    this.render();
    this.panel.style.borderColor = '#5fd9c8';
    setTimeout(() => {
      this.panel.style.borderColor = 'rgba(255,255,255,.14)';
      this.hide();
      this.onSolved();
    }, 420);
  }
}
