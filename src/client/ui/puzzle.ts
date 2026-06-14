import { isSolved, type WirePuzzle } from '../../sim/puzzles/wireMatch';

// DOM overlay for the wire-match repair puzzle. Movement pauses for the solver
// (co-op teammates keep playing in the full game). Pure presentation — the
// solvable logic lives in sim/puzzles/wireMatch.ts.
export class PuzzleOverlay {
  private root: HTMLDivElement;
  private panel: HTMLDivElement;
  private puzzle!: WirePuzzle;
  private onSolved!: () => void;
  private onCancel!: () => void;
  private leftEls: HTMLDivElement[] = [];
  private rightEls: HTMLDivElement[] = [];
  private connections: Record<number, number> = {};
  private selLeft: number | null = null;
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

  show(puzzle: WirePuzzle, onSolved: () => void, onCancel: () => void): void {
    this.puzzle = puzzle;
    this.onSolved = onSolved;
    this.onCancel = onCancel;
    this.connections = {};
    this.selLeft = null;
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

  private dot(color: string): HTMLDivElement {
    const d = document.createElement('div');
    d.style.cssText =
      `width:44px;height:44px;border-radius:50%;background:${color};` +
      'border:3px solid rgba(255,255,255,.25);cursor:pointer;transition:transform .08s,box-shadow .08s;';
    return d;
  }

  private render(): void {
    const p = this.puzzle;
    this.panel.innerHTML =
      '<h2 style="font-size:22px;letter-spacing:1px;color:#ffcf3f;margin-bottom:4px;">⚡ FUSE PANEL</h2>' +
      '<p style="opacity:.7;font-size:13px;margin-bottom:8px;">Wire each terminal to its matching color.</p>';
    const grid = document.createElement('div');
    grid.style.cssText = 'display:flex;justify-content:center;gap:90px;margin-top:14px;';
    const leftCol = document.createElement('div');
    const rightCol = document.createElement('div');
    leftCol.style.cssText = rightCol.style.cssText = 'display:flex;flex-direction:column;gap:14px;';
    this.leftEls = [];
    this.rightEls = [];
    for (let i = 0; i < p.colors.length; i++) {
      const L = this.dot(p.colors[i]);
      L.onclick = () => {
        this.selLeft = i;
        this.refresh();
      };
      leftCol.appendChild(L);
      this.leftEls.push(L);

      const R = this.dot(p.colors[p.rightOrder[i]]);
      R.onclick = () => this.connect(i);
      rightCol.appendChild(R);
      this.rightEls.push(R);
    }
    grid.append(leftCol, rightCol);
    this.panel.appendChild(grid);
    const hint = document.createElement('div');
    hint.style.cssText = 'margin-top:18px;font-size:12px;opacity:.55;';
    hint.textContent = 'Click a left terminal, then the matching color on the right · Esc to back out';
    this.panel.appendChild(hint);
    this.refresh();
  }

  private refresh(): void {
    this.leftEls.forEach((el, i) => {
      const on = i === this.selLeft;
      el.style.boxShadow = on ? '0 0 0 4px rgba(255,255,255,.6)' : 'none';
      el.style.transform = on ? 'scale(1.12)' : 'scale(1)';
    });
    this.rightEls.forEach((el, slot) => {
      const used = Object.values(this.connections).includes(slot);
      el.style.boxShadow = used ? '0 0 0 4px rgba(56,224,200,.65)' : 'none';
    });
  }

  private connect(slot: number): void {
    if (this.selLeft === null) return;
    // a right slot can only hold one wire
    for (const k of Object.keys(this.connections)) {
      if (this.connections[+k] === slot) delete this.connections[+k];
    }
    this.connections[this.selLeft] = slot;
    this.selLeft = null;
    this.refresh();
    if (isSolved(this.puzzle, this.connections)) {
      this.panel.style.borderColor = '#38e0c8';
      setTimeout(() => {
        this.panel.style.borderColor = 'rgba(255,255,255,.14)';
        this.hide();
        this.onSolved();
      }, 360);
    }
  }
}
