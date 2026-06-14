/// <reference types="vite/client" />
import { World } from '../sim/world';
import { DT } from '../shared/constants';
import { ITEM_DEFS, makeIntent, type Intent } from '../shared/types';
import { horizontalSpeed } from '../sim/movement';
import { GameView } from './render/view';
import { Input } from './input';
import { Hud } from './ui/hud';
import { PuzzleOverlay } from './ui/puzzle';
import { Sfx } from './audio';

const app = document.getElementById('app')!;

let world: World;
let view: GameView;
let input: Input;
let hud: Hud;
let puzzle: PuzzleOverlay;
let sfx: Sfx;

let running = false;
let paused = false;
let won = false;
let acc = 0;
let last = 0;
let forceActive = false; // dev/test: step without pointer lock
let debugIntent: Intent | null = null;

function boot(): void {
  try {
    world = new World();
    view = new GameView(world, app);
  } catch (err) {
    const l = document.getElementById('loading');
    if (l) l.querySelector('.msg')!.textContent = 'WebGL failed to start: ' + (err as Error).message;
    return;
  }
  input = new Input(app, world.player.yaw);
  hud = new Hud();
  puzzle = new PuzzleOverlay();
  sfx = new Sfx();

  if (import.meta.env.DEV) {
    (window as unknown as { __mech: unknown }).__mech = {
      unlock: () => {
        forceActive = true;
      },
      drive: (p: Partial<Intent>) => {
        const it = makeIntent();
        Object.assign(it, p);
        if (p.yaw !== undefined) input.yaw = p.yaw;
        debugIntent = it;
      },
    };
  }

  document.getElementById('loading')!.style.display = 'none';
  document.getElementById('start')!.classList.remove('hidden');
  (document.getElementById('start-btn') as HTMLButtonElement).onclick = start;
  (document.getElementById('win-btn') as HTMLButtonElement).onclick = replay;

  requestAnimationFrame(loop);
}

function start(): void {
  document.getElementById('start')!.classList.add('hidden');
  sfx.resume();
  app.requestPointerLock();
  running = true;
  last = performance.now();
}

function replay(): void {
  document.getElementById('win')!.classList.add('hidden');
  app.innerHTML = '';
  world = new World();
  view = new GameView(world, app);
  input.yaw = world.player.yaw;
  input.pitch = 0;
  hud.buildHotbar();
  hud.buildObjectives();
  paused = false;
  won = false;
  acc = 0;
  sfx.resume();
  app.requestPointerLock();
  running = true;
  last = performance.now();
}

function openPuzzle(): void {
  paused = true;
  document.exitPointerLock();
  puzzle.show(
    world.puzzle,
    () => {
      world.command({ t: 'solvePuzzle' });
      drainEvents();
      paused = false;
      app.requestPointerLock();
    },
    () => {
      paused = false;
      app.requestPointerLock();
    },
  );
}

function onWin(): void {
  won = true;
  document.exitPointerLock();
  const card = document.getElementById('win')!;
  const sub = card.querySelector('.sub') as HTMLElement;
  sub.innerHTML =
    `Vehicle delivered in <b>${world.elapsed.toFixed(1)}s</b>.<br>` +
    `Dispatch: “Clean work. Don't worry about that symbol stamped on the crate…”`;
  card.classList.remove('hidden');
}

function drainEvents(): void {
  for (const e of world.drainEvents()) {
    switch (e.t) {
      case 'sfx':
        sfx.play(e.name);
        break;
      case 'pickup':
        hud.toast(`Picked up ${ITEM_DEFS[e.kind].label}`);
        break;
      case 'gateOpen':
        hud.toast('⚡ Speed gate online!');
        break;
      case 'checkpoint':
        hud.toast(`Checkpoint ${e.index}/${e.total}`);
        break;
      case 'objectiveDone':
        hud.toast('Objective complete ✓');
        break;
      case 'install':
        hud.toast('Engine installed!');
        break;
      case 'openPuzzle':
        openPuzzle();
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
  } else {
    input.drainCommands(); // discard while frozen
  }

  const alpha = active ? acc / DT : 1;
  view.frame(alpha, input.yaw, input.pitch);

  if (view) {
    const sp =
      world.player.mode === 'kart' ? Math.abs(world.kart.speed) : horizontalSpeed(world.player.vel);
    hud.setSpeed(sp);
    hud.setPrompt(running && !paused && !won ? (world.findInteract()?.label ?? null) : null);
    hud.updateHotbar(world.player.hotbar, world.player.selSlot, world.player.carrying);
    hud.updateObjectives(world.objectives.list, world.objectives.activeIndex());
  }
}

boot();
