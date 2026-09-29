import * as THREE from 'three';
import { World } from '../sim/world';
import type { SimEvent } from '../sim/events';
import type { LevelDef } from '../content/levels/types';
import { DT } from '../shared/constants';
import { ITEM_DEFS } from '../sim/items';
import { GameView } from './render/view';
import { Hud } from './ui/hud';
import { icon } from './ui/icons';
import type { Input } from './input';
import type { Settings } from './settings';
import type { Audio } from './audio/audio';

// One play session of one level: owns the World, its View and wires sim
// events to sound, particles and HUD. The app shell (main.ts) creates one per
// mission and throws it away afterwards.

export interface SessionHooks {
  onWin(g: Game): void;
  onFail(g: Game): void;
  onPause(): void;
}

export class Game {
  world!: World;
  view!: GameView;
  private acc = 0;
  paused = false;
  private sheet = false;
  private panelKey = '';
  private stepAcc = 0;
  private cine: { pos: THREE.Vector3; quat: THREE.Quaternion } | null = null;
  /** Debug: drive the sim with this instead of the input. */
  debugIntent: ReturnType<Input['getIntent']> | null = null;
  ended = false;

  constructor(
    readonly level: LevelDef,
    private settings: Settings,
    private input: Input,
    readonly hud: Hud,
    private audio: Audio | null,
    private hooks: SessionHooks,
  ) {}

  async init(container: HTMLElement, progress: (k: number, msg: string) => void): Promise<void> {
    progress(0.1, 'Building the world');
    await new Promise((r) => setTimeout(r, 16));
    this.world = await World.create(this.level, { assist: this.settings.accessibility.torqueAssist });
    progress(0.45, 'Painting the landscape');
    await new Promise((r) => setTimeout(r, 16));
    this.view = new GameView(this.world, this.level, container, this.settings);
    progress(0.9, 'Warming up');
    this.input.yaw = this.level.spawn.yaw;
    this.input.pitch = 0;
    this.input.onCursor = (kind, x, y) => this.onCursor(kind, x, y);
    // compile shaders now, not on the first frame of play
    this.view.renderer.compile(this.view.scene, this.view.camera);
    progress(1, 'Ready');
  }

  applySettings(s: Settings): void {
    this.view.applySettings(s);
  }

  dispose(): void {
    this.input.cursorMode = false;
    this.input.onCursor = undefined;
    this.view.dispose();
    this.world.dispose();
  }

  // --- the frame -------------------------------------------------------------------

  frame(dt: number): void {
    const w = this.world;
    const active = !this.paused && !this.ended;

    for (const u of this.input.drainUi()) {
      if (u === 'pause') {
        if (w.panel) {
          w.command({ t: 'closePanel' });
          continue;
        }
        this.hooks.onPause();
      } else if (u === 'jobsheet') this.sheet = true;
      else if (u === 'jobsheetUp') this.sheet = false;
      else if (u === 'camera') {
        this.settings.video.vehicleCam = this.settings.video.vehicleCam === 'chase' ? 'cockpit' : 'chase';
        this.view.rig.resetOrbit();
      }
    }
    this.hud.toggleSheet(this.sheet && active);

    if (active) {
      this.acc += dt;
      const intent = this.debugIntent ?? this.input.getIntent();
      if (w.panel) {
        // frozen in place while working a panel
        intent.fwd = intent.back = intent.left = intent.right = intent.jump = false;
        intent.use = intent.interact = false;
      }
      let steps = 0;
      while (this.acc >= DT && steps < 5) {
        w.step(intent, DT);
        this.view.capture();
        this.drain();
        this.acc -= DT;
        steps++;
      }
      if (steps === 5) this.acc = 0;
      for (const c of this.input.drainCommands()) w.command(c);
      this.drain();
      this.footsteps(dt);
    } else {
      this.input.drainCommands();
    }

    this.updatePanelMode();
    const alpha = active ? this.acc / DT : 1;
    const panelPose = w.panel ? this.view.panelPose(w.panel.machine, w.panel.panel) : null;
    this.view.frame(dt, alpha, {
      yaw: this.input.yaw,
      pitch: this.input.pitch,
      vehicleCam: this.settings.video.vehicleCam,
      panelPose,
      cine: this.cine,
    });
    this.audio?.frame(dt, w, this.view.camera);
    this.hud.update(
      w,
      {
        project: (p) => this.view.project(p),
        camPos: this.view.camera.position,
        bind: (a) => this.input.bindFor(a),
        driving: w.player.mode === 'drive',
        panel: !!w.panel,
        cinematic: !!this.cine,
      },
      dt,
      () => this.jobSheetHtml(),
    );
  }

  private footsteps(dt: number): void {
    const p = this.world.player;
    if (p.mode !== 'foot' || !p.onGround) return;
    const sp = Math.hypot(p.vel.x, p.vel.z);
    if (sp < 1.5) return;
    this.stepAcc += sp * dt;
    const stride = p.crouching ? 1.1 : 1.9;
    if (this.stepAcc > stride) {
      this.stepAcc = 0;
      this.audio?.foot(p.surface, sp);
      this.view.footstep();
    }
  }

  // --- panels ------------------------------------------------------------------------

  private updatePanelMode(): void {
    const w = this.world;
    const key = w.panel ? `${w.panel.machine}:${w.panel.panel}` : '';
    if (key === this.panelKey) return;
    this.panelKey = key;
    if (w.panel) {
      this.input.cursorMode = true;
      document.exitPointerLock();
      const m = w.machine(w.panel.machine);
      const def = m.def.components.find((c) => c.id === w.panel!.panel);
      if (def && def.t === 'panel' && def.puzzle === 'fuse')
        this.hud.panelMode(def.label.toUpperCase(), 'Click a fuse to flip it — it flips its neighbours too. Light all of them green. Right-click or Esc to step back.');
      else
        this.hud.panelMode(
          (def && 'label' in def ? def.label : 'Panel').toUpperCase(),
          'Drag the valve wheels up/down to bring every needle into the green, then pull the yellow lever. Right-click or Esc to step back.',
        );
    } else {
      this.input.cursorMode = false;
      this.hud.panelMode(null);
      if (!this.paused && !this.ended) this.input.lock();
    }
  }

  private drag: { index: number; y: number; start: number } | null = null;

  private onCursor(kind: 'down' | 'up' | 'move', x: number, y: number): void {
    const w = this.world;
    if (!w.panel) return;
    const { machine, panel } = w.panel;
    if (kind === 'down') {
      const hit = this.view.pickPanel(machine, panel, x, y);
      if (!hit) return;
      const k = hit.userData.kind;
      if (k === 'fuse') {
        w.command({ t: 'fuse', index: hit.userData.index });
        this.audio?.play('fuse');
      } else if (k === 'valve') {
        const v = w.machine(machine).valve.get(panel);
        this.drag = { index: hit.userData.index, y, start: v ? v.valves[hit.userData.index] : 0.5 };
      } else if (k === 'commit') {
        w.command({ t: 'commitValves' });
        this.audio?.play('lever');
      }
      this.drain();
    } else if (kind === 'move' && this.drag) {
      const value = Math.max(0, Math.min(1, this.drag.start + (this.drag.y - y) / 260));
      w.command({ t: 'valve', index: this.drag.index, value });
      this.audio?.play('valveTick', undefined, 0.3);
    } else if (kind === 'up') {
      this.drag = null;
    }
  }

  // --- events --------------------------------------------------------------------------

  private drain(): void {
    for (const e of this.world.drainEvents()) this.onEvent(e);
  }

  private onEvent(e: SimEvent): void {
    const v = this.view;
    const a = this.audio;
    const h = this.hud;
    switch (e.t) {
      case 'pickup':
        v.pickup();
        a?.play(e.heavy ? 'pickupHeavy' : 'pickup');
        break;
      case 'belt':
        v.pickup();
        a?.play('pickupTool');
        h.toast(`${ITEM_DEFS[e.kind].label} → toolbelt ${e.slot + 1}`);
        break;
      case 'pocket':
        v.pickup();
        a?.play('keys');
        h.toast(e.tag ? `Got the ${e.tag} key` : 'Pocketed');
        break;
      case 'drop':
        a?.play(e.thrown ? 'throw' : 'drop');
        break;
      case 'boltLoose':
        a?.play('ratchetOut', e.pos);
        v.sparks(e.pos);
        break;
      case 'boltTight':
        a?.play('boltClick', e.pos);
        v.sparks(e.pos);
        v.kick(0.3, 0.04);
        break;
      case 'boltSlip':
        a?.play('boltSlip', e.pos);
        h.toast('Too tight — the thread slipped. Back off and go again.');
        v.kick(0, 0.1);
        break;
      case 'boltBand':
        a?.play('bandTick');
        break;
      case 'partOff':
        a?.play('partOff', e.pos);
        v.pickup();
        break;
      case 'partOn':
        a?.play('partOn', e.pos);
        v.partOn(e.machine, e.slot);
        break;
      case 'cover':
        a?.play(e.open ? 'hoodOpen' : 'hoodClose', e.pos);
        if (!e.open) v.kick(0, 0.08);
        break;
      case 'terminal':
        a?.play(e.on ? 'clampOn' : 'clampOff', e.pos);
        break;
      case 'zap':
        a?.play('zap', e.pos);
        v.sparks(e.pos, true);
        v.kick(3, 0.3);
        h.stampIt('ZAP!', 'Negative off first, negative on last', 'bad');
        break;
      case 'jack':
        a?.play(e.state === 'raised' ? 'jackUp' : e.state === 'lowered' ? 'jackDown' : 'clunk', e.pos);
        if (e.state === 'lowered') v.kick(0, 0.12);
        break;
      case 'leak':
        a?.play('splash', e.pos);
        h.toast('It’s pouring straight out — fix the leak first');
        break;
      case 'fluidFull':
        a?.play('glugDone');
        break;
      case 'inspected':
        h.stampIt('INSPECTED', 'Faults logged on your job sheet — hold Tab', 'warn');
        a?.play('clipboard');
        break;
      case 'systemGo':
        h.stampIt('SYSTEM GO', e.label);
        a?.play('systemGo');
        break;
      case 'allGo':
        a?.play('allGo');
        break;
      case 'panelSolved':
        a?.play('panelSolved');
        setTimeout(() => {
          if (this.world.panel?.panel === e.panel) this.world.command({ t: 'closePanel' });
        }, 900);
        break;
      case 'enter':
        a?.play('doorOpen');
        break;
      case 'exit':
        a?.play('doorClose');
        break;
      case 'crank':
        a?.engine(e.vehicle, true);
        break;
      case 'impact':
        v.impact(e.pos, e.severity);
        a?.play('crash', e.pos, Math.min(1, 0.3 + e.severity));
        break;
      case 'horn':
        a?.play('horn');
        break;
      case 'land':
        v.landed(e.speed);
        a?.play('land', undefined, Math.min(1, e.speed / 10));
        break;
      case 'jump':
        a?.play('jump');
        break;
      case 'damage':
        h.flashHurt(e.amount);
        if (e.cause !== 'cold') a?.play('hurt');
        break;
      case 'healed':
        a?.play('heal');
        h.toast('Patched up');
        break;
      case 'flare':
        a?.play('flare', e.pos);
        break;
      case 'swing':
        v.swing();
        a?.play(e.hit ? 'hit' : 'swing');
        break;
      case 'wolf':
        if (e.kind === 'telegraph') a?.play('growl', e.pos);
        if (e.kind === 'hit') a?.play('bite', e.pos);
        if (e.kind === 'died') a?.play('yelp', e.pos);
        if (e.kind === 'notice') a?.play('growl', e.pos, 0.6);
        break;
      case 'say':
        h.say(e.line, e.who, e.priority);
        a?.voice(e.line, e.who ?? 'Dispatch');
        break;
      case 'objective':
        h.objectivePop();
        a?.play('objective');
        break;
      case 'stamp':
        h.stampIt(e.text, e.sub, e.tone);
        break;
      case 'toast':
        h.toast(e.text);
        break;
      case 'lore':
        h.stampIt('LOG RECOVERED', e.title, 'warn');
        a?.play('lore');
        break;
      case 'door':
        a?.play(e.open ? 'doorOpen' : 'doorClose', e.pos);
        break;
      case 'sfx':
        a?.play(e.name, e.pos, e.vol);
        break;
      case 'shake':
        v.kick(0, e.amount);
        break;
      case 'win':
        this.ended = true;
        this.hooks.onWin(this);
        break;
      case 'fail':
        this.ended = true;
        this.hooks.onFail(this);
        break;
    }
  }

  // --- job sheet -------------------------------------------------------------------------

  private jobSheetHtml(): string {
    const w = this.world;
    const lines: string[] = [];
    const main = [...w.placements.values()].find((p) => p.vehicle && p.def.inspect);
    lines.push(`<h2>${this.level.title}</h2><div class="sub">${this.level.subtitle}</div>`);
    if (main) {
      const m = w.machine(main.key);
      for (const s of m.def.systems) {
        if (!s.fault && !s.required) continue;
        const ok = m.systemOk(s.id, w.items);
        const known = m.state.inspected;
        const chip = !known ? '<span class="chip unknown">?</span>' : ok ? '<span class="chip go">GO</span>' : s.required ? '<span class="chip broken">FIX</span>' : '<span class="chip opt">OPTIONAL</span>';
        const next = known && !ok ? m.nextStep(s.id, w.ctx) : null;
        const nx = !known ? 'Inspect the vehicle to diagnose' : ok ? '' : `${next?.text ?? s.fault}${next?.where ? ` — look ${next.where}` : ''}`;
        lines.push(
          `<div class="sys ${ok && known ? 'done' : ''}">${icon(s.icon)}<span class="nm">${s.label}</span>${chip}${nx ? `<span class="nx">${nx}</span>` : ''}</div>`,
        );
      }
    }
    for (const sd of this.level.side ?? []) {
      if (sd.visible && !sd.visible(w)) continue;
      const done = sd.done(w);
      lines.push(`<div class="sys ${done ? 'done' : ''}">${icon('lore')}<span class="nm">${sd.text}</span><span class="chip ${done ? 'go' : 'opt'}">${done ? 'DONE' : 'OPTIONAL'}</span></div>`);
    }
    const t = Math.floor(w.elapsed);
    lines.push(
      `<div class="foot"><span>TIME ${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}</span><span>LOGS ${w.lore.size}/${this.level.lore?.length ?? 0}</span></div>`,
    );
    return lines.join('');
  }

  // --- cinematics (driven by the app shell) ---------------------------------------------------

  setCinematic(pose: { pos: THREE.Vector3; quat: THREE.Quaternion } | null): void {
    this.cine = pose;
  }
}
