// Scripted playthrough in a real browser: drives the game via the window.__mech
// debug bridge, screenshots every beat, asserts no console/page errors, and
// reports frame-time stats. Usage: node tools/playtest.mjs [--head] [--out DIR]
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import puppeteer from 'puppeteer';

const argv = process.argv.slice(2);
const HEAD = argv.includes('--head');
const OUT = (() => {
  const i = argv.indexOf('--out');
  return i !== -1 && argv[i + 1] ? argv[i + 1] : 'screenshots';
})();
const PORT = 4173;

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });

// Wait for the dev server to actually answer instead of sleeping a fixed 6s.
async function waitForServer(timeoutMs = 40000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://localhost:${PORT}/`);
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    await wait(300);
  }
  throw new Error('vite dev server never came up');
}

const errors = [];
const notes = [];
let shotN = 0;
let browser;

try {
  await waitForServer();
  browser = await puppeteer.launch({
    headless: !HEAD,
    args: [
      '--no-sandbox',
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--ignore-gpu-blocklist',
      '--window-size=1600,900',
    ],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 900 });
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push('CONSOLE: ' + m.text());
  });
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
  page.on('requestfailed', (r) => {
    // favicon/data: noise is not interesting
    if (!r.url().startsWith('data:')) errors.push('REQFAIL: ' + r.url());
  });

  /** Screenshot with an auto-incrementing ordered prefix. */
  const shot = async (name) => {
    const n = String(++shotN).padStart(2, '0');
    await page.screenshot({ path: `${OUT}/${n}-${name}.png` });
    return `${n}-${name}`;
  };

  /** Pose the camera, settle a few frames, then capture. */
  const pose = async (name, x, z, yaw, pitch = 0, settle = 500) => {
    await page.evaluate((a) => window.__mech?.teleport(a.x, a.z, a.yaw, a.pitch), { x, z, yaw, pitch });
    await wait(settle);
    return shot(name);
  };

  const mech = (fn, arg) => page.evaluate(fn, arg);

  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load', timeout: 30000 });
  await wait(2000);
  await shot('boot');

  await page.click('#start-btn').catch(() => notes.push('no #start-btn'));
  await wait(1200);
  await mech(() => window.__mech?.unlock());
  await wait(600);
  await shot('after-clock-in');

  // --- frame-time sampling over a few seconds of real rendering ---
  await mech(() => {
    window.__ft = [];
    let last = performance.now();
    const tick = (t) => {
      window.__ft.push(t - last);
      last = t;
      if (window.__ft.length < 400) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

  await mech(() => window.__mech?.openGate());
  await pose('spawn-runway', 0, 15, 0, 0);
  await pose('door-exterior', 0, 16, Math.PI, -0.04);
  await pose('workshop-wide', 0, -10.5, 0, -0.02);
  await pose('workshop-hoist', -4, -9, -0.6, 0.02);
  await pose('welder', 4, -13, -0.5, 0.05);
  await pose('ceiling', 0, -8, 0, 0.75);
  await pose('floor-detail', -6, -9, 0.4, -0.85);

  const ft = await page.evaluate(() => window.__ft ?? []);
  if (ft.length > 20) {
    const s = ft.slice(10).sort((a, b) => a - b);
    const pct = (p) => s[Math.floor(s.length * p)].toFixed(1);
    notes.push(`frame ms: p50=${pct(0.5)} p95=${pct(0.95)} p99=${pct(0.99)} max=${s[s.length - 1].toFixed(1)}`);
  }

  // --- build the car and inspect it from every angle (the hero prop) ---
  await mech(() => window.__mech?.buildCar());
  await wait(700);
  await pose('car-rear34', 4.5, -3, 0.95, -0.05);
  await pose('car-front34', 2.2, -11, Math.PI * 0.92, -0.04);
  await pose('car-side', 5.5, -6, Math.PI / 2, -0.02);
  await pose('car-close', 2.6, -6, Math.PI / 2, -0.12);

  // --- drive ---
  await mech(() => window.__mech?.enterKart?.());
  await wait(400);
  await mech(() => window.__mech?.drive({ fwd: true }));
  await wait(1800);
  await shot('driving');
  await mech(() => window.__mech?.stop());
  await wait(400);

  // --- UI surfaces ---
  await mech(() => window.__mech?.openLore());
  await wait(600);
  await shot('lore-puzzle');
  await page.keyboard.press('Escape');
  await wait(500);

  await mech(() => window.__mech?.pause());
  await wait(500);
  await shot('pause');
  await mech(() => window.__mech?.openSettings());
  await wait(500);
  await shot('settings');

  notes.push(`captured ${shotN} screenshots to ${OUT}/`);
} catch (e) {
  errors.push('HARNESS: ' + e.message);
} finally {
  await browser?.close();
  server.kill('SIGTERM');
}

for (const n of notes) console.log('· ' + n);
console.log(errors.length ? `\n✗ ${errors.length} ERROR(S):` : '\n✓ no console/page errors');
for (const e of errors) console.log('  ' + e);
process.exit(errors.length ? 1 : 0);
