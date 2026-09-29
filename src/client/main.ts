/// <reference types="vite/client" />
import '@fontsource/barlow-condensed/500.css';
import '@fontsource/barlow-condensed/600.css';
import '@fontsource/barlow-condensed/700.css';
import '@fontsource/barlow-condensed/800.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import * as THREE from 'three';
import { loadSettings, type Settings } from './settings';
import { Input } from './input';
import { Hud } from './ui/hud';
import { Menu } from './ui/menu';
import { Shell } from './ui/shell';
import { Game } from './game';
import { Mixer } from './audio/mixer';
import { makeIntent } from '../sim/world';
import { gradeWorld } from '../sim/grade';
import { LEVELS } from '../content/levels';
import { INTROS } from './cinematics';
import { CAMPAIGN, completeMission, loadProgress } from './progress';

// Boot + the app flow: title (over a live backdrop) → contracts → loading →
// play → results / failure → back round again.

const app = document.getElementById('app')!;
let settings: Settings;
let input: Input;
let hud: Hud;
let audio: Mixer;
let menu: Menu;
let shell: Shell;
let game: Game | null = null;
/** The contract being played (null on the title backdrop). */
let playing: string | null = null;
let backdrop: string | null = null;
let orbit = 0;
let resumedAt = 0;
let last = performance.now();
let loadSeq = 0;
let lastCheckpoint: string | null = null;

const TIPS = [
  'Look at something and the prompt tells you what E will do. If it’s greyed out, it tells you why.',
  'Hold <b>Tab</b> for the job sheet: every system on the vehicle, and the next step for each.',
  'Torque bolts with the wrench: hold the mouse button and let go while the needle is in the green.',
  'Negative terminal off first, on last. Your fingers will thank you.',
  'Heavy parts slow you down. Toss them with a long press of <b>G</b>.',
  'Wolves won’t come near a lit flare.',
  'In a vehicle, <b>V</b> swaps between the chase and cockpit cameras.',
  'Stuck on its roof? <b>R</b> rights a vehicle when it’s stopped.',
  'The Company pays the same whether you find the extra stuff or not. Your grade doesn’t.',
];

function loading(k: number, msg: string): void {
  const el = document.getElementById('loading')!;
  el.style.display = '';
  (el.querySelector('.bar i') as HTMLElement).style.width = `${Math.round(k * 100)}%`;
  el.querySelector('.msg')!.textContent = msg;
}

function fade(on: boolean): Promise<void> {
  document.getElementById('fade')!.classList.toggle('on', on);
  return new Promise((r) => setTimeout(r, on ? 620 : 0));
}

async function load(id: string, mode: 'play' | 'backdrop'): Promise<Game | null> {
  const seq = ++loadSeq;
  const make = LEVELS[id] ?? LEVELS.depot;
  const lv = make();
  if (mode === 'play') {
    const tip = document.querySelector('#loading .tip') as HTMLElement;
    tip.innerHTML = `<b>Tip</b>${TIPS[Math.floor(Math.random() * TIPS.length)]}`;
    (document.querySelector('#loading .logo') as HTMLElement).innerHTML = lv.title.toUpperCase().replace(/(\S+)$/, '<em>$1</em>');
  } else {
    (document.querySelector('#loading .logo') as HTMLElement).innerHTML = 'THE <em>MECHANICS</em>';
    (document.querySelector('#loading .tip') as HTMLElement).innerHTML = '';
  }
  loading(0.02, 'Loading');
  game?.dispose();
  game = null;
  audio.stopAll();
  hud.show(false);
  const g = new Game(lv, settings, input, hud, audio, {
    onWin: (gg) => setTimeout(() => gg === game && finished(gg), 2600),
    onFail: (gg) => setTimeout(() => gg === game && failed(gg), 2200),
    onPause: () => pause(),
  });
  await g.init(app, loading);
  if (seq !== loadSeq) {
    g.dispose();
    return null;
  }
  game = g;
  document.getElementById('loading')!.style.display = 'none';
  return g;
}

// --- screens ------------------------------------------------------------------------

async function toTitle(screen: 'title' | 'contracts' = 'title'): Promise<void> {
  playing = null;
  menu.close();
  input.enabled = false;
  document.exitPointerLock?.();
  const id = pickBackdrop();
  if (!game || backdrop !== id || game.level.id !== id) {
    await fade(true);
    const g = await load(id, 'backdrop');
    if (!g) return;
    backdrop = id;
    const a = g.level.attract;
    if (a?.hour !== undefined) g.world.hour = a.hour;
    g.paused = true;
    await fade(false);
  }
  if (game) game.paused = true;
  hud.show(false);
  if (screen === 'title') shell.title(loadProgress());
  else shell.contracts(loadProgress());
}

function pickBackdrop(): string {
  // The latest unlocked contract that has a backdrop shot.
  const p = loadProgress();
  let id = 'depot';
  for (const m of CAMPAIGN) if (LEVELS[m.id] && (!m.requires || p.missions[m.requires]?.completed)) id = m.id;
  return LEVELS[id]().attract ? id : 'depot';
}

async function play(id: string, checkpoint?: string | null): Promise<void> {
  shell.hide();
  menu.close();
  await fade(true);
  playing = id;
  backdrop = null;
  const g = await load(id, 'play');
  if (!g) return;
  // hold the world still until the intro (or the player) takes over
  g.paused = true;
  g.setCinematic(null);
  hud.show(true);
  if (checkpoint) {
    g.world.restoreTo(checkpoint);
    input.yaw = g.world.player.yaw;
    input.pitch = 0;
    hud.stampIt('CHECKPOINT', 'Picking up where you left off', 'warn');
  }
  const intro = !checkpoint ? INTROS[id] : undefined;
  if (intro) {
    input.enabled = false;
    await fade(false);
    g.playIntro(intro(g.world), () => {
      g.paused = false;
      input.yaw = g.world.player.yaw;
      input.pitch = 0;
      input.enabled = true;
      if (g.level.briefing) hud.say(g.level.briefing);
      input.lock();
    });
    return;
  }
  input.enabled = true;
  if (!checkpoint && g.level.briefing) hud.say(g.level.briefing);
  await fade(false);
  g.paused = false;
  input.lock();
}

function finished(g: Game): void {
  g.ended = true;
  const id = playing ?? g.level.id;
  const grade = gradeWorld(g.world);
  const lore = [...g.world.lore].map((l) => g.level.lore?.find((d) => d.id === l)?.title ?? l);
  const run = completeMission(id, {
    time: g.world.elapsed,
    integrity: g.world.vehicles.get(mainVehicle(g))?.integrity ?? 1,
    loreFound: g.world.lore.size > 0,
    grade: grade.letter,
    score: grade.score,
    lore: [...g.world.lore],
  });
  menu.close();
  audio.duck(false);
  input.enabled = false;
  document.exitPointerLock?.();
  hud.show(false);
  shell.results(
    CAMPAIGN.find((m) => m.id === id),
    grade,
    run,
    lore,
  );
}

function mainVehicle(g: Game): string {
  return [...g.world.placements.values()].find((p) => p.vehicle && p.def.inspect)?.key ?? '';
}

function failed(g: Game): void {
  g.ended = true;
  menu.close();
  audio.duck(false);
  input.enabled = false;
  document.exitPointerLock?.();
  hud.show(false);
  lastCheckpoint = g.world.checkpoint;
  shell.failed(g.world.failReason ?? 'downed', !!lastCheckpoint, g.world.lastHurtBy);
}

function pause(): void {
  if (!game || !playing || menu.open || game.ended || game.inIntro) return;
  if (performance.now() - resumedAt < 250) return;
  game.paused = true;
  input.enabled = false;
  document.exitPointerLock?.();
  menu.subtitle = `${game.level.title} — ${game.world.objectiveText()?.text ?? ''}`;
  menu.openPause();
  audio.duck(true);
}

function resume(): void {
  menu.close();
  resumedAt = performance.now();
  if (!game) return;
  game.paused = false;
  input.enabled = true;
  input.lock();
  audio.duck(false);
}

// --- loop -----------------------------------------------------------------------------

function loop(now: number): void {
  requestAnimationFrame(loop);
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.1) dt = 0.1;
  input.poll(dt);
  if (game && !playing) {
    // title backdrop: slow orbit
    const a = game.level.attract;
    if (a) {
      orbit += dt * (a.speed ?? 0.04);
      const from = new THREE.Vector3(a.target.x + Math.sin(orbit) * a.radius, a.target.y + a.height, a.target.z + Math.cos(orbit) * a.radius);
      const m = new THREE.Matrix4().lookAt(from, new THREE.Vector3(a.target.x, a.target.y, a.target.z), new THREE.Vector3(0, 1, 0));
      game.setCinematic({ pos: from, quat: new THREE.Quaternion().setFromRotationMatrix(m) });
    }
  }
  game?.frame(dt);
}

async function boot(): Promise<void> {
  settings = loadSettings();
  input = new Input(app, settings);
  hud = new Hud();
  audio = new Mixer(settings);
  hud.onLine = (line, who) => audio.voice(line, who);
  const wake = () => audio.resume();
  addEventListener('pointerdown', wake);
  addEventListener('keydown', wake);
  addEventListener('keydown', (e) => {
    if (e.code === 'Space' && game?.inIntro) {
      e.preventDefault();
      game.skipIntro();
    }
  });
  const apply = () => {
    input.applyBinds(settings);
    audio.applySettings(settings);
    game?.applySettings(settings);
  };
  menu = new Menu(settings, input, {
    onResume: () => resume(),
    onRestart: () => playing && play(playing),
    onQuit: () => toTitle('contracts'),
    apply,
  });
  shell = new Shell({
    play: (id) => void play(id),
    settings: () => menu.openSettings(true),
    retry: () => {
      const id = playing ?? game?.level.id;
      // after a failure, go back to the last checkpoint; a replay starts fresh
      const cp = shell.screen === 'failed' ? lastCheckpoint : null;
      if (id) void play(id, cp);
    },
    contracts: () => void toTitle('contracts'),
    title: () => void toTitle('title'),
    sfx: (n) => audio.play(n),
  });
  input.onUnlock = () => {
    // Esc in a browser drops the pointer lock before the key reaches us.
    if (playing && game && !game.paused && !game.ended && !game.world.panel) pause();
  };
  const params = new URLSearchParams(location.search);
  if (params.get('q')) settings.video.quality = params.get('q') as Settings['video']['quality'];
  if (import.meta.env.DEV) installDebug();
  requestAnimationFrame(loop);
  const direct = params.get('level');
  if (direct && direct !== 'title') await play(direct);
  else await toTitle();
}

function installDebug(): void {
  const bridge = {
    game: () => game,
    level: (id: string) => play(id),
    title: (s: 'title' | 'contracts' = 'title') => toTitle(s),
    finish: () => game && finished(game),
    fail: () => game && failed(game),
    pause: () => pause(),
    teleport: (x: number, z: number, yaw = 0, pitch = 0, y?: number) => {
      if (!game) return;
      game.world.teleport({ x, y: y ?? game.world.terrain.heightAt(x, z), z }, yaw, pitch);
      input.yaw = yaw;
      input.pitch = pitch;
    },
    /** Aim the player's view at a world point (tests drive real key presses after this). */
    lookAt: (x: number, y: number, z: number) => {
      if (!game) return;
      const e = game.world.player.eye();
      input.yaw = Math.atan2(-(x - e.x), -(z - e.z));
      input.pitch = Math.atan2(y - e.y, Math.hypot(x - e.x, z - e.z));
    },
    focus: () => game?.world.focus?.label ?? null,
    /** Drawn-vs-clickable audit of everything in reach (see View.auditTargets). */
    auditTargets: () => game?.view.auditTargets() ?? [],
    /** Headless browsers never grant pointer lock; pretend it's held so real mouse buttons reach the game. */
    lock: () => {
      input.locked = true;
    },
    look: (yaw: number, pitch = 0) => {
      input.yaw = yaw;
      input.pitch = pitch;
    },
    hour: (h: number) => {
      if (game) game.world.hour = h;
    },
    intent: (p: Partial<ReturnType<typeof makeIntent>> | null) => {
      if (!game) return;
      if (!p) game.debugIntent = null;
      else game.debugIntent = { ...makeIntent(), yaw: input.yaw, pitch: input.pitch, ...p };
    },
    enter: (key: string) => {
      const w = game?.world;
      if (!w) return;
      (w as unknown as { enterVehicle(v: unknown): void }).enterVehicle(w.vehicle(key));
    },
    audio: () => audio.meter(),
    stats: () => {
      const r = game?.view.renderer.info;
      return r ? { draws: r.render.calls, tris: r.render.triangles, geos: r.memory.geometries, tex: r.memory.textures } : null;
    },
    cam: (x: number, y: number, z: number, tx: number, ty: number, tz: number) => {
      if (!game) return;
      const from = new THREE.Vector3(x, y, z);
      const m = new THREE.Matrix4().lookAt(from, new THREE.Vector3(tx, ty, tz), new THREE.Vector3(0, 1, 0));
      game.setCinematic(x === undefined ? null : { pos: from, quat: new THREE.Quaternion().setFromRotationMatrix(m) });
    },
    nocam: () => game?.setCinematic(null),
    /** What's on screen at NDC (sx, sy): the meshes a ray hits, nearest first. */
    pick: (sx: number, sy: number) => {
      if (!game) return [];
      const rc = new THREE.Raycaster();
      rc.setFromCamera(new THREE.Vector2(sx, sy), game.view.camera);
      return rc.intersectObjects(game.view.scene.children, true).slice(0, 4).map((h) => {
        const chain: string[] = [];
        for (let o: THREE.Object3D | null = h.object; o && chain.length < 5; o = o.parent) chain.push(o.name || o.type);
        const m = (h.object as THREE.Mesh).material as THREE.MeshStandardMaterial;
        return { d: +h.distance.toFixed(2), p: [+h.point.x.toFixed(1), +h.point.y.toFixed(1), +h.point.z.toFixed(1)], chain: chain.join('<'), color: m?.color?.getHexString?.(), vc: !!m?.vertexColors, tris: (h.object as THREE.Mesh).geometry?.index?.count };
      });
    },
  };
  (window as unknown as { __mech: typeof bridge }).__mech = bridge;
}

// Browser shortcuts vs. the game. Ctrl+W / Ctrl+Q can't be cancelled by a
// page, so while you're in a job the browser asks before leaving instead of
// silently throwing your run away. (Skipped under automation, where a
// dialog would stall the test harness.)
window.addEventListener('beforeunload', (e) => {
  if (!game || !playing || navigator.webdriver) return;
  e.preventDefault();
  e.returnValue = '';
});
// In real fullscreen, Chromium lets a page capture system shortcuts too.
document.addEventListener('fullscreenchange', () => {
  const kb = (navigator as Navigator & { keyboard?: { lock?: (keys?: string[]) => Promise<void>; unlock?: () => void } }).keyboard;
  if (!kb?.lock) return;
  if (document.fullscreenElement) kb.lock().catch(() => undefined);
  else kb.unlock?.();
});

boot().catch((e) => {
  console.error(e);
  loading(0, 'Could not start: ' + (e as Error).message);
});
