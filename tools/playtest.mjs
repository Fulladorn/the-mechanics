// Browser tour of the whole game through the window.__mech debug bridge:
// title → contracts → the tutorial → The Ridge Job (cold open, key sites,
// dusk, night drive) → results, pause and failure screens. Screenshots every
// stop and fails if the page logs an error.
//
//   npm run playtest                     # full tour into ./screenshots
//   npm run shot                         # --smoke: boot both levels, no photos
//   node tools/playtest.mjs --q med      # quality preset (default: low)
//   node tools/playtest.mjs --grass      # keep the grass (slow on software GL)
//
// Software GL (SwiftShader) is slow, so frames are counted rather than timed;
// PUPPETEER_EXECUTABLE_PATH can point at a local Chromium.
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import puppeteer from 'puppeteer';

const argv = process.argv.slice(2);
const arg = (k, d) => {
  const i = argv.indexOf(k);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : d;
};
const SMOKE = argv.includes('--smoke');
const HEAD = argv.includes('--head');
const GRASS = argv.includes('--grass');
const OUT = arg('--out', 'screenshots');
const Q = arg('--q', 'low');
const PORT = 4173;

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
const errors = [];
let browser;
let n = 0;

async function waitForServer() {
  for (let i = 0; i < 150; i++) {
    try {
      if ((await fetch(`http://localhost:${PORT}/`)).ok) return;
    } catch {
      /* not up yet */
    }
    await wait(300);
  }
  throw new Error('dev server did not start');
}

async function frames(page, k = 3) {
  await page.evaluate((k) => new Promise((r) => {
    let i = 0;
    const f = () => (++i >= k ? r() : requestAnimationFrame(f));
    requestAnimationFrame(f);
  }), k);
}

async function shot(page, name) {
  await frames(page);
  if (SMOKE) return;
  await page.screenshot({ path: `${OUT}/${String(++n).padStart(2, '0')}-${name}.png` });
  console.log('  📸', name);
}

async function open(page, query) {
  await page.goto(`http://localhost:${PORT}/?q=${Q}${query}`, { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction(() => window.__mech?.game(), { timeout: 180000 });
  if (!GRASS) await page.evaluate(() => (window.__mech.game().view.grass.group.visible = false));
  await frames(page, 2);
}

const ev = (page, fn, ...a) => page.evaluate(fn, ...a);

try {
  await waitForServer();
  browser = await puppeteer.launch({
    headless: !HEAD,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--window-size=1280,720'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });
  page.on('console', (m) => m.type() === 'error' && errors.push('console: ' + m.text()));
  page.on('pageerror', (e) => errors.push('page: ' + e.message));

  // --- shell -------------------------------------------------------------------
  console.log('title + contracts');
  await open(page, '');
  await shot(page, 'title');
  await ev(page, () => window.__mech.title('contracts'));
  await wait(600);
  await shot(page, 'contracts');

  // --- tutorial ---------------------------------------------------------------------
  console.log('orientation day');
  await ev(page, () => window.__mech.level('depot'));
  await page.waitForFunction(() => window.__mech.game()?.level.id === 'depot' && !window.__mech.game().paused, { timeout: 180000 });
  if (!GRASS) await ev(page, () => (window.__mech.game().view.grass.group.visible = false));
  await shot(page, 'depot-start');

  // Real input: press the actual E key (through Input, not the debug intent)
  // on the time clock, the ROOKIE locker and both tools.
  const pressAt = async (label, pos, from, check) => {
    await ev(page, (a) => window.__mech.teleport(a.from[0], a.from[1]), { from });
    await frames(page, 4);
    await ev(page, (p) => window.__mech.lookAt(p[0], p[1], p[2]), pos);
    await frames(page, 4);
    const focus = await ev(page, () => window.__mech.focus());
    await page.keyboard.down('KeyE');
    await frames(page, 3);
    await page.keyboard.up('KeyE');
    await frames(page, 3);
    const ok = await ev(page, check);
    console.log(`  ${ok ? '✓' : '✗'} E on ${label} (focus: ${focus})`);
    if (!ok) errors.push(`real input: E on ${label} did nothing (focus was ${focus})`);
  };
  await pressAt('time clock', [-6.22, 1.35, -5.4], [-8, -5.4], () => window.__mech.game().world.flag('clockedIn'));
  await pressAt('ROOKIE locker', [-9.9, 1.3, -8.33], [-9.9, -6.8], () => window.__mech.game().world.flag('locker'));
  await frames(page, 20);
  await pressAt('wrench', [-10.0, 1.14, -8.55], [-9.95, -7.3], () => window.__mech.game().world.hasItem('wrench'));
  await pressAt('flashlight', [-9.78, 1.14, -8.5], [-9.8, -7.3], () => window.__mech.game().world.hasItem('flashlight'));
  await page.keyboard.press('KeyF');
  await frames(page, 3);
  if (!(await ev(page, () => window.__mech.game().world.player.flashlight))) errors.push('real input: F did not toggle the flashlight');
  await shot(page, 'depot-locker-open');
  await ev(page, () => window.__mech.teleport(6, 7, 0.9, -0.12));
  await shot(page, 'depot-betsy');
  await ev(page, () => {
    const w = window.__mech.game().world;
    w.openDoor('rollup');
    window.__mech.teleport(0, 30, 0, 0.02);
  });
  await shot(page, 'depot-yard');
  await ev(page, () => window.__mech.pause());
  await shot(page, 'pause');

  // --- level 1 ---------------------------------------------------------------------
  console.log('the ridge job');
  await ev(page, () => window.__mech.level('ridge'));
  await page.waitForFunction(() => window.__mech.game()?.level.id === 'ridge', { timeout: 180000 });
  if (!GRASS) await ev(page, () => (window.__mech.game().view.grass.group.visible = false));
  await shot(page, 'ridge-cold-open');
  await ev(page, () => window.__mech.game().skipIntro());
  await wait(300);
  await shot(page, 'ridge-overlook');
  const stops = [
    ['ranger-station', -10, 64, -128, -26, 60, -146, 18.0],
    ['sawmill', -205, 36, -8, -232, 30, -22, 18.6],
    ['campground-dusk', 160, 27, 30, 190, 22, 58, 19.5],
    ['fire-lookout', 100, 74, -100, 122, 72, -122, 18.2],
    ['bridge', -14, 26, 104, 0, 20, 131, 19.0],
  ];
  for (const [name, x, y, z, tx, ty, tz, hour] of stops) {
    await ev(page, (a) => {
      window.__mech.hour(a[7]);
      window.__mech.cam(a[1], a[2], a[3], a[4], a[5], a[6]);
    }, [name, x, y, z, tx, ty, tz, hour]);
    await wait(400);
    await shot(page, name);
  }
  await ev(page, () => window.__mech.nocam());
  await ev(page, () => {
    const w = window.__mech.game().world;
    w.restoreTo('start');
    w.hour = 20.8;
    window.__mech.enter('ridgeback');
    const v = w.vehicle('ridgeback');
    v.running = true;
    v.lights = true;
    window.__mech.intent({ fwd: true });
  });
  await wait(2000);
  await shot(page, 'night-descent');
  await ev(page, () => window.__mech.intent(null));
  await ev(page, () => {
    window.__mech.game().world.elapsed = 1260;
    window.__mech.finish();
  });
  await wait(2500);
  await shot(page, 'results');
  await ev(page, () => window.__mech.fail());
  await wait(1200);
  await shot(page, 'failed');

  const stats = await ev(page, () => window.__mech.stats());
  console.log('renderer', JSON.stringify(stats));
} catch (e) {
  errors.push('harness: ' + e.message);
} finally {
  await browser?.close();
  server.kill('SIGTERM');
}

if (errors.length) {
  console.error(`\n✗ ${errors.length} error(s):\n` + errors.slice(0, 40).join('\n'));
  process.exit(1);
}
console.log(SMOKE ? '\n✓ smoke: both levels boot clean' : `\n✓ tour clean — ${n} screenshots in ${OUT}/`);
process.exit(0);
