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
import { Game } from './game';
import { makeIntent } from '../sim/world';
import { LEVELS } from '../content/levels';

// Boot + app loop. (The full title/contract/results shell wraps this.)

const app = document.getElementById('app')!;
let settings: Settings;
let input: Input;
let hud: Hud;
let game: Game | null = null;
let last = performance.now();

function loading(k: number, msg: string): void {
  const el = document.getElementById('loading')!;
  el.style.display = '';
  (el.querySelector('.bar i') as HTMLElement).style.width = `${Math.round(k * 100)}%`;
  el.querySelector('.msg')!.textContent = msg;
}

async function start(id: string): Promise<void> {
  const make = LEVELS[id] ?? LEVELS.sandbox;
  game?.dispose();
  game = null;
  loading(0.02, 'Loading');
  const g = new Game(make(), settings, input, hud, null, {
    onWin: () => hud.stampIt('JOB DONE'),
    onFail: () => hud.stampIt('FAILED', '', 'bad'),
    onPause: () => {},
  });
  await g.init(app, loading);
  game = g;
  document.getElementById('loading')!.style.display = 'none';
  hud.show(true);
  hud.say(g.level.briefing);
}

function loop(now: number): void {
  requestAnimationFrame(loop);
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.1) dt = 0.1;
  input.poll(dt);
  game?.frame(dt);
}

async function boot(): Promise<void> {
  settings = loadSettings();
  input = new Input(app, settings);
  hud = new Hud();
  const params = new URLSearchParams(location.search);
  if (params.get('q')) settings.video.quality = params.get('q') as Settings['video']['quality'];
  if (import.meta.env.DEV) installDebug();
  requestAnimationFrame(loop);
  await start(params.get('level') ?? 'sandbox');
}

function installDebug(): void {
  const bridge = {
    game: () => game,
    level: (id: string) => start(id),
    teleport: (x: number, z: number, yaw = 0, pitch = 0, y?: number) => {
      if (!game) return;
      game.world.teleport({ x, y: y ?? game.world.terrain.heightAt(x, z), z }, yaw, pitch);
      input.yaw = yaw;
      input.pitch = pitch;
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
  };
  (window as unknown as { __mech: typeof bridge }).__mech = bridge;
}

boot().catch((e) => {
  console.error(e);
  loading(0, 'Could not start: ' + (e as Error).message);
});
