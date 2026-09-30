import type { Grade } from '../../sim/grade';
import { fmtClock } from '../../sim/grade';
import type { FailReason } from '../../sim/events';
import { CAMPAIGN, isUnlocked, recordOf, type MissionMeta, type Progress, type RunResult } from '../progress';

// The out-of-game screens: title, contract board, results and failure. They
// sit over a live 3D backdrop (the game renders underneath), so everything
// here is glass and paper over the scene rather than a flat page.

export interface ShellHooks {
  play(id: string): void;
  settings(): void;
  retry(): void;
  contracts(): void;
  title(): void;
  sfx(name: string): void;
}

const FAIL_TEXT: Record<FailReason, { head: string; body: string; tip: string }> = {
  downed: {
    head: 'YOU WENT DOWN',
    body: 'Search and rescue found you a few hours later. The client was not impressed.',
    tip: 'Wolves hate fire. Put a flare on your belt, select it and click to light it — they won’t come near.',
  },
  vehicleLost: {
    head: 'VEHICLE LOST',
    body: 'It’s at the bottom of the ravine now. Someone will have to explain that to the insurance people.',
    tip: 'A vehicle that’s rolling needs chocks behind its wheels first. Everything else can wait.',
  },
  wrecked: {
    head: 'VEHICLE WRECKED',
    body: 'That was the client’s truck. Was.',
    tip: 'Ease off on the rough stuff — the integrity bar on the right shows how much it can still take.',
  },
  cold: {
    head: 'HYPOTHERMIA',
    body: 'The mountain gets cold fast once the sun goes.',
    tip: 'Stand near a fire or sit in a running vehicle with the heater on to warm up.',
  },
};

/** "You went down" — the tip should be about what actually did it. */
const DOWNED_BY: Record<string, { body?: string; tip: string }> = {
  wolf: { tip: 'Wolves hate fire. Put a flare on your belt, select it and click to light it — they won’t come near. Right mouse blocks a bite.' },
  fall: { body: 'That drop was further than it looked.', tip: 'Walk down slopes instead of jumping off them; long falls hurt, and crouching near an edge keeps you on it.' },
  crash: { body: 'The vehicle stopped. You didn’t.', tip: 'Ease off on the rough stuff and brake before the hairpins.' },
};

const GRADE_WORD: Record<string, string> = {
  S: 'Legendary work',
  A: 'Excellent work',
  B: 'Solid work',
  C: 'It runs',
  D: 'Barely',
};

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, html?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

export class Shell {
  readonly root: HTMLElement;
  screen: 'title' | 'contracts' | 'results' | 'failed' | 'credits' | null = null;

  constructor(private hooks: ShellHooks) {
    this.root = document.getElementById('shell')!;
  }

  hide(): void {
    this.screen = null;
    this.root.className = '';
    this.root.innerHTML = '';
  }

  private mount(screen: NonNullable<Shell['screen']>, node: HTMLElement): void {
    this.screen = screen;
    this.root.innerHTML = '';
    this.root.className = `on s-${screen}`;
    this.root.appendChild(node);
  }

  private button(label: string, fn: () => void, kind: 'primary' | 'ghost' | 'text' = 'ghost', sub?: string): HTMLButtonElement {
    const b = el('button', `sbtn ${kind}`);
    b.innerHTML = `<span class="l">${label}</span>${sub ? `<span class="sub">${sub}</span>` : ''}`;
    b.onmouseenter = () => this.hooks.sfx('uiHover');
    b.onclick = (e) => {
      e.stopPropagation();
      this.hooks.sfx('uiClick');
      fn();
    };
    return b;
  }

  // --- title ------------------------------------------------------------------------

  title(p: Progress): void {
    const wrap = el('div', 'title');
    const brand = el(
      'div',
      'brand',
      `<div class="kicker">A game about fixing things in bad places</div>
       <h1>THE <em>MECHANICS</em></h1>`,
    );
    const nav = el('nav', 'tnav');
    const next = CAMPAIGN.find((m) => isUnlocked(p, m) && !recordOf(p, m.id).completed) ?? CAMPAIGN[CAMPAIGN.length - 1];
    const started = CAMPAIGN.some((m) => recordOf(p, m.id).completed);
    nav.append(
      this.button(started ? 'Continue' : 'Start work', () => this.hooks.play(next.id), 'primary', next.title),
      this.button('Contracts', () => this.hooks.contracts()),
      this.button('Settings', () => this.hooks.settings()),
      this.button('Credits', () => this.credits()),
    );
    const foot = el('div', 'tfoot', 'Headphones recommended &nbsp;·&nbsp; Click in-game to capture the mouse, Esc to pause');
    wrap.append(brand, nav, foot);
    this.mount('title', wrap);
  }

  credits(): void {
    const wrap = el('div', 'credits');
    wrap.append(
      el(
        'div',
        'paper',
        `<h2>Credits</h2>
         <p><b>Design, code, art &amp; sound synthesis</b><br/>The Mechanics team</p>
         <p><b>Foley</b><br/>Kenney — Impact Sounds, RPG Audio, Interface Sounds (CC0)</p>
         <p><b>Type</b><br/>Barlow Condensed &amp; Inter (SIL Open Font License)</p>
         <p><b>Built with</b><br/>three.js · Rapier · postprocessing · N8AO · Vite</p>
         <p class="thanks">Thanks for playing. Go check your tyre pressure.</p>`,
      ),
    );
    const back = this.button('Back', () => this.hooks.title(), 'ghost');
    wrap.appendChild(back);
    this.mount('credits', wrap);
  }

  // --- contracts ---------------------------------------------------------------------

  contracts(p: Progress): void {
    const wrap = el('div', 'contracts');
    wrap.appendChild(el('div', 'chead', `<div class="kicker">Dispatch board</div><h2>Contracts</h2>`));
    const list = el('div', 'clist');
    CAMPAIGN.forEach((m, i) => list.appendChild(this.card(m, i, p)));
    wrap.appendChild(list);
    const back = this.button('Back', () => this.hooks.title(), 'text');
    back.classList.add('back');
    wrap.appendChild(back);
    this.mount('contracts', wrap);
  }

  private card(m: MissionMeta, i: number, p: Progress): HTMLElement {
    const r = recordOf(p, m.id);
    const open = isUnlocked(p, m);
    const c = el('div', `ccard${open ? '' : ' locked'}${r.completed ? ' done' : ''}`);
    c.style.setProperty('--tilt', `${i % 2 ? 0.9 : -1.1}deg`);
    const req = m.requires ? CAMPAIGN.find((x) => x.id === m.requires) : undefined;
    c.innerHTML = `
      <div class="pin"></div>
      <div class="no">Job #${String(i + 1).padStart(3, '0')}</div>
      <div class="client">${m.client}</div>
      <h3>${m.title}</h3>
      <p>${m.blurb}</p>
      <div class="meta"><span>~${m.minutes} min</span><span>${m.hour}</span></div>
      <div class="rec">${
        r.completed
          ? `<span class="best">Best ${r.bestTime !== undefined ? fmtClock(r.bestTime) : '—'}</span>${r.bestGrade ? `<span class="gr g${r.bestGrade}">${r.bestGrade}</span>` : ''}`
          : open
            ? '<span class="new">New contract</span>'
            : `<span class="lock">Finish “${req?.title ?? ''}” first</span>`
      }</div>`;
    if (open) {
      const go = this.button(r.completed ? 'Replay' : 'Take the job', () => this.hooks.play(m.id), r.completed ? 'ghost' : 'primary');
      c.appendChild(go);
    }
    if (r.completed) c.appendChild(el('div', 'donestamp', 'COMPLETE'));
    return c;
  }

  // --- results -------------------------------------------------------------------------

  results(m: MissionMeta | undefined, g: Grade, run: RunResult, lore: string[]): void {
    const wrap = el('div', 'results');
    const sheet = el('div', 'rsheet');
    sheet.innerHTML = `
      <div class="kicker">${m?.client ?? ''}</div>
      <h2>${m?.title ?? 'Contract'}</h2>
      <div class="rstamp">CONTRACT COMPLETE</div>
      <div class="rgrid"></div>
      <div class="rfoot"></div>`;
    const grid = sheet.querySelector('.rgrid')!;
    g.lines.forEach((l, i) => {
      const row = el(
        'div',
        'rrow',
        `<span class="lb">${l.label}</span><span class="vl">${l.value}</span><span class="pt"><i style="width:${(l.points / l.max) * 100}%"></i></span>`,
      );
      row.style.animationDelay = `${0.35 + i * 0.12}s`;
      grid.appendChild(row);
    });
    const foot = sheet.querySelector('.rfoot')!;
    const notes: string[] = [];
    if (run.isNewBest) notes.push('<span class="nb">New best time</span>');
    if (lore.length) notes.push(`Found: ${lore.join(', ')}`);
    if (run.unlocked) notes.push(`<span class="nb">Unlocked: ${run.unlocked.title}</span>`);
    foot.innerHTML = notes.join(' &nbsp;·&nbsp; ');

    const gradeBox = el(
      'div',
      `rgrade g${g.letter}`,
      `<div class="letter">${g.letter}</div><div class="word">${GRADE_WORD[g.letter]}</div><div class="score">${g.score} / 100</div>`,
    );
    const nav = el('nav', 'rnav');
    if (run.unlocked) nav.appendChild(this.button('Next contract', () => this.hooks.play(run.unlocked!.id), 'primary', run.unlocked.title));
    nav.appendChild(this.button('Replay', () => this.hooks.retry(), run.unlocked ? 'ghost' : 'primary'));
    nav.appendChild(this.button('Contracts', () => this.hooks.contracts(), 'ghost'));
    wrap.append(sheet, gradeBox, nav);
    this.mount('results', wrap);
    this.hooks.sfx('resultsStamp');
    setTimeout(() => this.screen === 'results' && this.hooks.sfx('gradeStamp'), 1100);
  }

  // --- failed --------------------------------------------------------------------------

  failed(reason: FailReason, checkpoint: boolean, cause?: string | null): void {
    const f = { ...FAIL_TEXT[reason], ...(reason === 'downed' && cause ? DOWNED_BY[cause] : undefined) };
    const wrap = el('div', 'failed');
    wrap.appendChild(
      el(
        'div',
        'fbox',
        `<div class="kicker">Contract failed</div><h2>${f.head}</h2><p>${f.body}</p><div class="tip"><b>Tip</b>${f.tip}</div>`,
      ),
    );
    const nav = el('nav', 'rnav');
    nav.appendChild(this.button(checkpoint ? 'Retry from checkpoint' : 'Retry', () => this.hooks.retry(), 'primary'));
    nav.appendChild(this.button('Contracts', () => this.hooks.contracts(), 'ghost'));
    wrap.appendChild(nav);
    this.mount('failed', wrap);
  }
}
