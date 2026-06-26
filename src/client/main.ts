/// <reference types="vite/client" />
import { World } from '../sim/world';
import { DT } from '../shared/constants';
import { ITEM_DEFS, makeIntent, type Intent } from '../shared/types';
import { loadSettings, type Settings } from './settings';
import { Dispatch } from './voice';
import { DISPATCH } from '../content/narrative';
import { Menu } from './ui/menu';
import { Intro } from './ui/intro';
import { horizontalSpeed } from '../sim/movement';
import { GameView } from './render/view';
import { Input } from './input';
import { Hud } from './ui/hud';
import { FuseOverlay } from './ui/fuseGrid';
import { Sfx } from './audio';
import { formatTime, recordBest } from '../shared/timer';
import { deriveStats, installPart, variantById } from '../sim/vehicle';

const app = document.getElementById('app')!;

let world: World;
let view: GameView;
let input: Input;
let hud: Hud;
let fuse: FuseOverlay;
let sfx: Sfx;

let running = false;
let paused = false;
let won = false;
let acc = 0;
let last = 0;
let forceActive = false; // dev/test: step without pointer lock
let debugIntent: Intent | null = null;
let settings: Settings;
let dispatch: Dispatch;
let menu: Menu;
let intro: Intro;
let prevOnGround = true;
let stepAccum = 0;

function boot(): void {
  settings = loadSettings();
  try {
    world = new World();
    view = new GameView(world, app, settings);
  } catch (err) {
    const l = document.getElementById('loading');
    if (l) l.querySelector('.msg')!.textContent = 'WebGL failed to start: ' + (err as Error).message;
    return;
  }
  input = new Input(app, settings, world.player.yaw);
  hud = new Hud();
  fuse = new FuseOverlay();
  sfx = new Sfx(settings);
  dispatch = new Dispatch(settings);
  intro = new Intro();
  menu = new Menu(settings, input, {
    onResume: resumeGame,
    onRestart: () => replay(),
    apply: applySettings,
  });
  input.onUnlock = () => {
    if (running && !won && !paused && !fuse.open && !menu.open) openPause();
  };

  if (import.meta.env.DEV) {
    (window as unknown as { __mech: unknown }).__mech = {
      unlock: () => {
        forceActive = true;
      },
      openGate: () => {
        world.gateOpen = true;
      },
      pause: () => openPause(),
      openSettings: () => menu.openSettings(true),
      openLore: () => openLore(),
      buildCar: () => {
        const v = world.vehicle;
        const set = (id: string, vid: string) => installPart(v, id, vid);
        set('wheelFL', 'wheel.slick');
        set('wheelFR', 'wheel.slick');
        set('wheelRL', 'wheel.slick');
        set('wheelRR', 'wheel.slick');
        set('engine', 'engine.v8');
        set('seat', 'seat.racing');
        set('body', 'body.light');
        set('bumper', 'bumper.bull');
        set('headlights', 'headlights.std');
        set('spoiler', 'spoiler.gt');
        set('exhaust', 'exhaust.sport');
        set('battery', 'battery.hd');
        v.bodyColor = 0x2f7fd1;
        if (!world.objectives.isDone('assemble')) world.objectives.complete('assemble', world.events);
        drainEvents();
      },
      setVariant: (socketId: string, variantId: string) => installPart(world.vehicle, socketId, variantId),
      drive: (p: Partial<Intent>) => {
        const it = makeIntent();
        Object.assign(it, p);
        if (p.yaw !== undefined) input.yaw = p.yaw;
        debugIntent = it;
      },
      look: (yaw: number, pitch = 0) => {
        input.yaw = yaw;
        input.pitch = pitch;
      },
      stop: () => {
        debugIntent = makeIntent();
      },
      teleport: (x: number, z: number, yaw = 0, pitch = 0) => {
        const p = world.player;
        p.mode = 'foot';
        p.pos.x = x;
        p.pos.z = z;
        p.pos.y = 0;
        p.vel.x = p.vel.y = p.vel.z = 0;
        input.yaw = yaw;
        input.pitch = pitch;
        debugIntent = makeIntent();
      },
    };
  }

  document.getElementById('loading')!.style.display = 'none';
  document.getElementById('start')!.classList.remove('hidden');
  (document.getElementById('start-btn') as HTMLButtonElement).onclick = start;
  (document.getElementById('win-btn') as HTMLButtonElement).onclick = replay;
  const setBtn = document.getElementById('settings-btn');
  if (setBtn) setBtn.onclick = () => menu.openSettings(true);

  requestAnimationFrame(loop);
}

function applySettings(): void {
  view.applySettings(settings);
  sfx.applySettings(settings);
  input.applyBinds(settings);
  dispatch.applySettings(settings);
}

function openPause(): void {
  paused = true;
  input.enabled = false;
  input.clearHeld();
  document.exitPointerLock();
  menu.openPause();
}

function resumeGame(): void {
  menu.close();
  paused = false;
  input.enabled = true;
  app.requestPointerLock();
}

function start(): void {
  document.getElementById('start')!.classList.add('hidden');
  sfx.resume();
  running = true;
  last = performance.now();
  dispatch.say(DISPATCH.intro);
  intro.play('TRAINING BAY', 'Company Contract · Orientation', () => app.requestPointerLock());
}

function replay(): void {
  document.getElementById('win')!.classList.add('hidden');
  app.innerHTML = '';
  world = new World();
  view = new GameView(world, app, settings);
  input.yaw = world.player.yaw;
  input.pitch = 0;
  hud.buildHotbar();
  hud.buildObjectives();
  menu.close();
  paused = false;
  won = false;
  acc = 0;
  prevOnGround = true;
  stepAccum = 0;
  input.enabled = true;
  input.clearHeld();
  sfx.stopEngine();
  dispatch.stop();
  sfx.resume();
  app.requestPointerLock();
  running = true;
  last = performance.now();
}

function pauseForStation(): () => void {
  paused = true;
  input.enabled = false;
  input.clearHeld();
  document.exitPointerLock();
  return () => {
    paused = false;
    input.enabled = true;
    app.requestPointerLock();
  };
}

function openLore(): void {
  const resume = pauseForStation();
  fuse.show(world.lorePuzzle, () => {
    world.command({ t: 'solveLore' });
    drainEvents();
    resume();
  }, resume);
}

function onWin(): void {
  won = true;
  sfx.stopEngine();
  document.exitPointerLock();
  dispatch.say(DISPATCH.outro);
  intro.play(
    'EXTRACTION',
    'Training Complete',
    () => {
      const res = recordBest('garage', world.elapsed);
      const card = document.getElementById('win')!;
      const sub = card.querySelector('.sub') as HTMLElement;
      sub.innerHTML =
        `Delivered in <b>${formatTime(world.elapsed)}</b> · Best <b>${formatTime(res.best)}</b>` +
        `${res.isNew ? ' <span style="color:#ffcf3f">NEW!</span>' : ''}` +
        `${world.loreFound ? '<br><span style="color:#5fd9c8">Recovered log secured.</span>' : ''}<br>` +
        `Dispatch: “Clean work. Don't worry about that symbol on the crate…”`;
      card.classList.remove('hidden');
    },
    2200,
  );
}

function drainEvents(): void {
  for (const e of world.drainEvents()) {
    switch (e.t) {
      case 'sfx':
        sfx.play(e.name);
        break;
      case 'pickup':
        hud.toast(`Picked up ${ITEM_DEFS[e.kind].label}`);
        view.pickupFx();
        break;
      case 'gateOpen':
        hud.toast('⚡ Speed gate online!');
        view.gateFx();
        break;
      case 'checkpoint':
        hud.toast(`Checkpoint ${e.index}/${e.total}`);
        view.checkpointFx();
        break;
      case 'objectiveDone':
        hud.toast('Objective complete ✓');
        dispatch.say(DISPATCH.objectives[e.id as keyof typeof DISPATCH.objectives] ?? '');
        break;
      case 'enterKart':
        sfx.startEngine();
        break;
      case 'exitKart':
        sfx.stopEngine();
        break;
      case 'installPart': {
        const v = variantById(e.variantId);
        hud.toast(`${v ? v.name : ITEM_DEFS[e.kind].label} installed`);
        view.installFx();
        break;
      }
      case 'paint':
        hud.toast('Repainted the body');
        break;
      case 'vehicleDrivable':
        hud.toast('🚗 Build complete — hop in!');
        view.gateFx();
        break;
      case 'openLore':
        openLore();
        break;
      case 'lore':
        hud.toast('📂 Recovered log found');
        dispatch.say(DISPATCH.lore);
        break;
      case 'win':
        onWin();
        break;
    }
  }
}

function loop(now: number): void {
  requestAnimationFrame(loop);
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.25) dt = 0.25;

  const active = running && !paused && !won && (input.locked || forceActive);
  if (active) {
    acc += dt;
    const intent = forceActive && debugIntent ? debugIntent : input.getIntent();
    let steps = 0;
    while (acc >= DT && steps < 6) {
      world.step(intent, DT);
      view.capture();
      drainEvents();
      acc -= DT;
      steps++;
    }
    for (const c of input.drainCommands()) world.command(c);
    drainEvents();

    // client-derived audio cues (sim stays untouched)
    const pl = world.player;
    if (pl.mode === 'foot') {
      if (!prevOnGround && pl.onGround) sfx.play('land');
      else if (prevOnGround && !pl.onGround) sfx.play('jump');
      if (pl.onGround) {
        const sp = Math.hypot(pl.vel.x, pl.vel.z);
        if (sp > 2.5) {
          stepAccum += sp * dt;
          if (stepAccum > 2.2) {
            sfx.play('footstep');
            stepAccum = 0;
          }
        }
      }
      prevOnGround = pl.onGround;
    } else {
      sfx.updateEngine(world.kart.speed);
      prevOnGround = true;
    }
  } else {
    input.drainCommands(); // discard while frozen
  }

  const alpha = active ? acc / DT : 1;
  view.frame(dt, alpha, input.yaw, input.pitch);

  if (view) {
    const sp =
      world.player.mode === 'kart' ? Math.abs(world.kart.speed) : horizontalSpeed(world.player.vel);
    hud.setSpeed(sp);
    hud.setTimer(formatTime(world.elapsed), running && !won);
    hud.updateSpec(world.vehicle, deriveStats(world.vehicle));
    hud.setPrompt(running && !paused && !won ? (world.findInteract()?.label ?? null) : null);
    hud.setDropHint(running && !paused && !won && world.player.carrying !== null);
    hud.updateHotbar(world.player.hotbar, world.player.selSlot, world.player.carrying);
    hud.updateObjectives(world.objectives.list, world.objectives.activeIndex());
  }
}

boot();
