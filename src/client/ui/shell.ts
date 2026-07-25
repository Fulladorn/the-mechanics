import { formatTime } from '../../shared/timer';
import { CAMPAIGN, allComplete, isUnlocked, loadProgress, recordOf, type Progress, type RunResult } from '../progress';
import type { LevelDef } from '../../content/levels/types';

// The screens around the game: main menu + level select, the results card, and
// the mission-failed card. All of it renders over the live 3D view.

export interface ShellHooks {
  onPlay: (levelId: string) => void;
  onSettings: () => void;
}

const el = (tag: string, cls?: string, html?: string): HTMLElement => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
};

export class Shell {
  private root: HTMLDivElement;
  private card: HTMLDivElement;

  constructor(private hooks: ShellHooks) {
    this.root = document.createElement('div');
    this.root.className = 'overlay hidden';
    this.root.style.zIndex = '32';
    this.card = document.createElement('div');
    this.card.className = 'shell-card';
    this.root.appendChild(this.card);
    document.body.appendChild(this.root);
  }

  hideAll(): void {
    this.root.classList.add('hidden');
  }

  private show(): void {
    this.root.classList.remove('hidden');
    this.root.scrollTop = 0;
  }

  // --- main menu ------------------------------------------------------------

  showMenu(progress: Progress): void {
    this.card.className = 'shell-card shell-menu';
    this.card.innerHTML = '';

    this.card.appendChild(el('h1', 'shell-title', 'THE MECHANICS'));
    this.card.appendChild(
      el('div', 'shell-tag', 'Contracted repairs in places nobody should be sent.'),
    );

    const list = el('div', 'mission-list');
    for (const m of CAMPAIGN) {
      const rec = recordOf(progress, m.id);
      const unlocked = isUnlocked(progress, m);
      const row = el('button', 'mission' + (unlocked ? '' : ' locked') + (rec.completed ? ' done' : ''));

      const head = el('div', 'mission-head');
      head.appendChild(el('span', 'mission-name', m.title));
      const badge = el(
        'span',
        'mission-badge',
        unlocked ? (rec.completed ? 'COMPLETE' : 'AVAILABLE') : '🔒 LOCKED',
      );
      head.appendChild(badge);
      row.appendChild(head);
      row.appendChild(el('div', 'mission-blurb', m.blurb));

      if (rec.completed) {
        const stats = el('div', 'mission-stats');
        stats.appendChild(el('span', '', `Best ${formatTime(rec.bestTime ?? 0)}`));
        if (rec.bestIntegrity !== undefined)
          stats.appendChild(el('span', '', `Integrity ${Math.round(rec.bestIntegrity * 100)}%`));
        stats.appendChild(el('span', rec.loreFound ? 'lore-yes' : '', rec.loreFound ? '📂 Log recovered' : '📂 Log missing'));
        row.appendChild(stats);
      } else if (!unlocked) {
        const req = CAMPAIGN.find((x) => x.id === m.requires);
        row.appendChild(el('div', 'mission-stats', `<span>Complete ${req?.title ?? 'the previous mission'} to unlock</span>`));
      }

      if (unlocked) row.onclick = () => this.hooks.onPlay(m.id);
      list.appendChild(row);
    }
    this.card.appendChild(list);

    if (allComplete(progress)) {
      this.card.appendChild(
        el('div', 'shell-note', 'All contracts cleared. Replay any mission to beat your times.'),
      );
    }

    const actions = el('div', 'shell-actions');
    const settings = el('button', 'btn btn-ghost', 'Settings');
    settings.onclick = () => this.hooks.onSettings();
    actions.appendChild(settings);
    this.card.appendChild(actions);

    this.card.appendChild(
      el(
        'div',
        'shell-controls',
        '<b>WASD</b> move · <b>Mouse</b> look · <b>Space</b> jump (hold to bunny-hop) · ' +
          '<b>Shift</b> sprint · <b>Ctrl</b> crouch · <b>E</b> interact · <b>G</b> drop · ' +
          '<b>LMB</b> swing · <b>RMB</b> block · <b>F</b> use item · <b>1–6</b> toolbelt',
      ),
    );
    this.show();
  }

  // --- results --------------------------------------------------------------

  showResults(level: LevelDef, result: RunResult, progress: Progress): void {
    this.card.className = 'shell-card shell-results';
    this.card.innerHTML = '';
    this.card.appendChild(el('h1', 'shell-title', 'CONTRACT COMPLETE'));
    this.card.appendChild(el('div', 'shell-tag', level.title));

    const rows = el('div', 'result-rows');
    const row = (k: string, v: string, cls = '') => {
      const r = el('div', 'result-row' + (cls ? ' ' + cls : ''));
      r.appendChild(el('span', '', k));
      r.appendChild(el('b', '', v));
      rows.appendChild(r);
    };
    row('Time', formatTime(result.time) + (result.isNewBest ? '  ★ NEW BEST' : ''), result.isNewBest ? 'best' : '');
    row('Best', formatTime(result.bestTime));
    if (level.exfil) row('Vehicle integrity', `${Math.round(result.integrity * 100)}%`);
    row('Recovered log', result.loreFound ? 'Secured' : 'Not found');
    this.card.appendChild(rows);

    if (result.unlocked) {
      this.card.appendChild(el('div', 'shell-unlock', `🔓 Unlocked: <b>${result.unlocked.title}</b>`));
    }

    const actions = el('div', 'shell-actions');
    if (result.unlocked) {
      const next = el('button', 'btn', 'Next Contract ▶');
      next.onclick = () => this.hooks.onPlay(result.unlocked!.id);
      actions.appendChild(next);
    }
    const again = el('button', result.unlocked ? 'btn btn-ghost' : 'btn', 'Run It Back');
    again.onclick = () => this.hooks.onPlay(level.id);
    actions.appendChild(again);
    const back = el('button', 'btn btn-ghost', 'Mission Select');
    back.onclick = () => this.showMenu(progress);
    actions.appendChild(back);
    this.card.appendChild(actions);
    this.show();
  }

  // --- failure --------------------------------------------------------------

  showFail(level: LevelDef, reason: 'downed' | 'vehicle' | 'creep', levelId: string): void {
    const copy: Record<typeof reason, [string, string]> = {
      downed: ['YOU WENT DOWN', 'No teammate, no revive. Dispatch is writing it up as "equipment failure".'],
      vehicle: ['VEHICLE TOTALLED', "The contract was the vehicle. What's left of it isn't going on a flatbed."],
      creep: ['OVER THE EDGE', "It rolled. You watched. The client is going to have questions."],
    };
    const [title, blurb] = copy[reason];

    this.card.className = 'shell-card shell-fail';
    this.card.innerHTML = '';
    this.card.appendChild(el('h1', 'shell-title fail', title));
    this.card.appendChild(el('div', 'shell-tag', blurb));

    const actions = el('div', 'shell-actions');
    const retry = el('button', 'btn', 'Retry Contract');
    retry.onclick = () => this.hooks.onPlay(levelId);
    actions.appendChild(retry);
    const back = el('button', 'btn btn-ghost', 'Mission Select');
    back.onclick = () => this.showMenu(loadProgress());
    actions.appendChild(back);
    this.card.appendChild(actions);
    void level;
    this.show();
  }
}
