/// <reference types="vite/client" />
import { World } from '../sim/world';
import { DT } from '../shared/constants';
import { ITEM_DEFS, makeIntent, type Intent } from '../shared/types';
import { loadSettings, type Settings } from './settings';
import { Dispatch } from './voice';
import { Menu } from './ui/menu';
import { Intro } from './ui/intro';
import { Shell } from './ui/shell';
import { horizontalSpeed } from '../sim/movement';
import { GameView } from './render/view';
import { Input } from './input';
import { Hud } from './ui/hud';
import { PuzzleOverlay, type PuzzleSpec } from './ui/puzzles';
import { Sfx } from './audio';
import { formatTime } from '../shared/timer';
import { deriveStats, installPart, variantById } from '../sim/vehicle';
import { makeGarage } from '../content/levels/garage';
import { makeMountains } from '../content/levels/mountains';
import type { LevelDef } from '../content/levels/types';
import { CAMPAIGN, completeMission, loadProgress } from './progress';

const app = document.getElementById('app')!;

const LEVELS: Record<string, () => LevelDef> = {
  garage: makeGarage,
  mountains: makeMountains,
};

let world: World;
let view: GameView;
let input: Input;
let hud: Hud;
let puzzles: PuzzleOverlay;
let sfx: Sfx;
let shell: Shell;

type Phase = 'menu' | 'playing' | 'over';
let phase: Phase = 'menu';
let paused = false;
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
let currentLevel = 'garage';
let lowIntegrityWarned = false;
let coldWarned = false;
let wolfWarned = false;

function boot(): void {
  settings = loadSettings();
  try {
    world = new World(makeGarage());
    view = new GameView(world, app, settings);
  } catch (err) {
    const l = document.getElementById('loading');
    if (l) l.querySelector('.msg')!.textContent = 'WebGL failed to start: ' + (err as Error).message;
    return;
  }
  input = new Input(app, settings, world.player.yaw);
  hud = new Hud();
  puzzles = new PuzzleOverlay();
  puzzles.setColorblind(settings.accessibility.colorblind);
  sfx = new Sfx(settings);
  dispatch = new Dispatch(settings);
  intro = new Intro();
  menu = new Menu(settings, input, {
    onResume: resumeGame,
    onRestart: () => startMission(currentLevel),
    onQuit: () => toMenu(),
    apply: applySettings,
  });
  shell = new Shell({
    onPlay: (id) => startMission(id),
    onSettings: () => menu.openSettings(true),
  });
  input.onUnlock = () => {
    if (phase === 'playing' && !paused && !puzzles.open && !menu.open) openPause();
  };

  if (import.meta.env.DEV) installDebugBridge();

  document.getElementById('loading')!.style.display = 'none';
  toMenu();
  requestAnimationFrame(loop);
}

function installDebugBridge(): void {
  (window as unknown as { __mech: unknown }).__mech = {
    unlock: () => {
      forceActive = true;
    },
    level: (id: string) => startMission(id),
    openGate: () => {
      world.gateOpen = true;
    },
    pause: () => openPause(),
    openSettings: () => menu.openSettings(true),
    openLore: () => openLore(),
    toMenu: () => toMenu(),
    /** Renderer cost for the current scene — the meaningful perf signal when
     *  the harness is running on a software rasteriser. */
    stats: () => {
      const info = view.renderer.info;
      return {
        drawCalls: info.render.calls,
        triangles: info.render.triangles,
        programs: info.programs?.length ?? 0,
        geometries: info.memory.geometries,
        textures: info.memory.textures,
      };
    },
    /** Force the mission outcome, to inspect the results and fail cards. */
    forceWin: () => {
      for (const o of world.objectives.list) o.done = true;
      world.events.push({ t: 'win' });
      drainEvents();
    },
    forceFail: (reason: 'downed' | 'vehicle' | 'creep' = 'downed') => {
      world.events.push({ t: 'fail', reason });
      drainEvents();
    },
    chock: () => {
      world.command({ t: 'interact' });
      world.chocked = true;
    },
    /** Finish every repair on the current vehicle without doing the work. */
    fixAll: () => {
      for (const s of world.vehicle.sockets) {
        if (s.broken) world.command({ t: 'solvePuzzle', socketId: s.id });
        if (s.required && !s.installed) {
          const item = world.items.find((i) => i.kind === s.accepts && !i.picked);
          if (item?.variantId) installPart(world.vehicle, s.id, item.variantId);
        }
      }
      world.chocked = true;
      drainEvents();
    },
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
    enterKart: () => {
      world.player.mode = 'kart';
      world.kart.occupied = true;
      sfx.startEngine();
    },
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
    /** Teleport by world XZ (y snaps to the ground). */
    teleport: (x: number, z: number, yaw = 0, pitch = 0) => {
      const p = world.player;
      p.mode = 'foot';
      p.pos.x = x;
      p.pos.z = z;
      p.pos.y = world.groundHeight(x, z);
      p.vel.x = p.vel.y = p.vel.z = 0;
      input.yaw = yaw;
      input.pitch = pitch;
      debugIntent = makeIntent();
    },
    /** Open a specific repair puzzle without walking to it. */
    openRepair: (socketId: string) => {
      const ok = world.openRepairPuzzle(socketId);
      drainEvents();
      return ok;
    },
    /** Stand `back` metres from the vehicle, looking straight at it. */
    faceVehicle: (back = 6, height = 1.2) => {
      const k = world.kart.pos;
      const yaw = Math.atan2(-back * 0.6, -back);
      const x = k.x + Math.sin(yaw + Math.PI) * back;
      const z = k.z + Math.cos(yaw + Math.PI) * back;
      const p = world.player;
      p.mode = 'foot';
      p.pos.x = x;
      p.pos.z = z;
      p.pos.y = world.groundHeight(x, z) + height;
      p.vel.x = p.vel.y = p.vel.z = 0;
      input.yaw = Math.atan2(-(k.x - x), -(k.z - z));
      input.pitch = -0.12;
      debugIntent = makeIntent();
      return { vehicle: { ...k }, player: { ...p.pos }, yaw: input.yaw };
    },
    /** Teleport along the mountain road: t in 0..1, lateral metres outward. */
    roadTo: (t: number, lateral = 0, yaw = 0, pitch = 0) => {
      const terr = world.terrain;
      if (!terr) return;
      const c = terr.roadPoint(t);
      const len = Math.hypot(c.x, c.z) || 1;
      const x = c.x + (c.x / len) * lateral;
      const z = c.z + (c.z / len) * lateral;
      const p = world.player;
      p.mode = 'foot';
      p.pos.x = x;
      p.pos.z = z;
      p.pos.y = world.groundHeight(x, z);
      p.vel.x = p.vel.y = p.vel.z = 0;
      input.yaw = yaw;
      input.pitch = pitch;
      debugIntent = makeIntent();
    },
  };
}

// --- lifecycle --------------------------------------------------------------

function applySettings(): void {
  view.applySettings(settings);
  sfx.applySettings(settings);
  input.applyBinds(settings);
  dispatch.applySettings(settings);
  puzzles.setColorblind(settings.accessibility.colorblind);
  hud.setColorblind(settings.accessibility.colorblind);
}

function toMenu(): void {
  phase = 'menu';
  paused = false;
  menu.close();
  puzzles.resetTransient();
  document.exitPointerLock();
  sfx.stopEngine();
  dispatch.stop();
  hud.setVisible(false);
  shell.showMenu(loadProgress());
}

function startMission(id: string): void {
  const make = LEVELS[id] ?? makeGarage;
  currentLevel = id;
  shell.hideAll();
  app.innerHTML = '';
  world = new World(make());
  view = new GameView(world, app, settings);
  input.yaw = world.player.yaw;
  input.pitch = 0;
  input.enabled = true;
  input.clearHeld();
  hud.buildHotbar();
  hud.buildObjectives(world.objectives.list);
  hud.setVisible(true);
  hud.setColorblind(settings.accessibility.colorblind);
  hud.setVitalsEnabled(!!world.level.hazards);
  menu.close();
  puzzles.resetTransient();
  paused = false;
  phase = 'playing';
  acc = 0;
  prevOnGround = true;
  stepAccum = 0;
  lowIntegrityWarned = false;
  coldWarned = false;
  wolfWarned = false;
  sfx.stopEngine();
  dispatch.stop();
  sfx.resume();
  sfx.setAmbience(world.level.terrain ? 'mountain' : 'garage');
  sfx.setMood('calm');
  last = performance.now();
  dispatch.say(world.level.narrative.intro);
  intro.play(world.level.title, world.level.subtitle, () => app.requestPointerLock());
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

/** Freeze the player while a diegetic panel is open. */
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
  puzzles.resetTransient();
  puzzles.show(
    {
      kind: 'fuse',
      puzzle: world.lorePuzzle,
      title: '⬡ SEALED CRATE',
      blurb: 'Reroute the circuit — light every node.',
    },
    () => {
      world.command({ t: 'solveLore' });
      drainEvents();
      resume();
    },
    resume,
  );
}

function openRepair(socketId: string, kind: 'fuse' | 'bolt' | 'valve', label: string): void {
  const p = world.activePuzzle;
  if (!p || p.socketId !== socketId) return;
  const resume = pauseForStation();
  puzzles.resetTransient();
  const spec: PuzzleSpec | null =
    kind === 'fuse' && p.fuse
      ? { kind: 'fuse', puzzle: p.fuse, title: `⚡ ${label.toUpperCase()}`, blurb: 'Reroute the fuse grid — light every load.' }
      : kind === 'bolt' && p.bolt
        ? { kind: 'bolt', puzzle: p.bolt, title: `🔩 ${label.toUpperCase()}`, blurb: 'Torque every bolt into the green band.' }
        : kind === 'valve' && p.valve
          ? { kind: 'valve', puzzle: p.valve, title: `🎚 ${label.toUpperCase()}`, blurb: 'Balance every gauge into its safe band.' }
          : null;
  if (!spec) {
    resume();
    return;
  }
  puzzles.show(
    spec,
    () => {
      world.command({ t: 'solvePuzzle', socketId });
      drainEvents();
      resume();
    },
    resume,
  );
}

function onWin(): void {
  phase = 'over';
  sfx.stopEngine();
  document.exitPointerLock();
  hud.setVisible(false);
  dispatch.say(world.level.narrative.outro);
  const result = completeMission(currentLevel, {
    time: world.elapsed,
    integrity: world.integrity(),
    loreFound: world.loreFound,
  });
  intro.play(
    'EXTRACTION',
    world.level.id === 'garage' ? 'Training Complete' : 'Contract Complete',
    () => shell.showResults(world.level, result, loadProgress()),
    2200,
  );
}

function onFail(reason: 'downed' | 'vehicle' | 'creep'): void {
  phase = 'over';
  sfx.stopEngine();
  document.exitPointerLock();
  hud.setVisible(false);
  dispatch.say(world.level.narrative.fail ?? '');
  shell.showFail(world.level, reason, currentLevel);
}

// --- event plumbing ---------------------------------------------------------

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
        hud.buildObjectives(world.objectives.list);
        dispatch.say(world.level.narrative.objectives[e.id] ?? '');
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
      case 'uninstallPart':
        hud.toast(`${ITEM_DEFS[e.kind].label} removed`);
        break;
      case 'chocked':
        hud.toast('🧱 Wheels chocked — she’s not going anywhere');
        view.installFx();
        break;
      case 'openPuzzle':
        openRepair(e.socketId, e.puzzle, e.label);
        break;
      case 'repaired':
        hud.toast('System GO ✓');
        view.installFx();
        break;
      case 'paint':
        hud.toast('Repainted the body');
        break;
      case 'vehicleDrivable':
        hud.toast('🚗 All systems GO — hop in!');
        view.gateFx();
        break;
      case 'openLore':
        openLore();
        break;
      case 'lore':
        hud.toast('📂 Recovered log found');
        dispatch.say(world.level.narrative.lore);
        break;
      case 'damage':
        hud.flashDamage(e.cause);
        view.pulse(0, Math.min(0.4, e.amount * 0.02));
        break;
      case 'healed':
        hud.toast('Patched up');
        break;
      case 'impact':
        view.impactFx(e.pos, e.severity);
        break;
      case 'wolf':
        if (e.kind === 'notice' && !wolfWarned) {
          wolfWarned = true;
          dispatch.say(world.level.narrative.wolf ?? '');
        }
        if (e.kind === 'telegraph') hud.toast('⚠ Wolf lunging — block (RMB) or dodge');
        if (e.kind === 'died') view.wolfDownFx(e.pos);
        break;
      case 'swing':
        view.swingFx();
        break;
      case 'win':
        onWin();
        break;
      case 'fail':
        onFail(e.reason);
        break;
    }
  }
}

/** Situational Dispatch barks that aren't tied to a discrete sim event. */
function ambientBarks(): void {
  const n = world.level.narrative;
  if (!coldWarned && world.vitals.cold > 0.55) {
    coldWarned = true;
    dispatch.say(n.cold ?? '');
  } else if (coldWarned && world.vitals.cold < 0.2) coldWarned = false;

  if (!lowIntegrityWarned && world.kart.integrity < 0.45) {
    lowIntegrityWarned = true;
    dispatch.say(n.lowIntegrity ?? '');
  }
}

// --- loop -------------------------------------------------------------------

function loop(now: number): void {
  requestAnimationFrame(loop);
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.25) dt = 0.25;

  // Poll the pad every frame: a controller player never touches the mouse, so
  // pointer lock can't be what gates input.
  if (phase === 'playing' && !paused && !puzzles.open && !menu.open) input.poll(dt);
  const active = phase === 'playing' && !paused && (input.locked || forceActive || input.padConnected);
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
    ambientBarks();

    // client-derived audio cues (sim stays untouched)
    const pl = world.player;
    if (pl.mode === 'foot') {
      if (!prevOnGround && pl.onGround) {
        sfx.play('land');
        view.footFx(Math.min(1.4, Math.abs(pl.vel.y) / 8 + 0.5));
      } else if (prevOnGround && !pl.onGround) sfx.play('jump');
      if (pl.onGround) {
        const sp = Math.hypot(pl.vel.x, pl.vel.z);
        if (sp > 2.5) {
          stepAccum += sp * dt;
          if (stepAccum > 2.2) {
            sfx.play('footstep');
            view.footFx(0.35);
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

  if (phase !== 'menu') {
    const sp =
      world.player.mode === 'kart' ? Math.abs(world.kart.speed) : horizontalSpeed(world.player.vel);
    hud.setSpeed(sp);
    hud.setTimer(formatTime(world.elapsed), phase === 'playing');
    hud.updateSpec(world.vehicle, deriveStats(world.vehicle));
    hud.setPrompt(phase === 'playing' && !paused ? (world.findInteract()?.label ?? null) : null);
    hud.updateHotbar(world.player.hotbar, world.player.selSlot, world.player.carrying);
    hud.updateObjectives(world.objectives.list, world.objectives.activeIndex());
    hud.updateVitals(world.vitals, world.kart.integrity);
    hud.updateCompass(world, view.camera.rotation.y);
  }
}

void CAMPAIGN;
boot();
