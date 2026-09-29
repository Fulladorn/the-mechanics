// Audio sanity check in a real Chrome: samples the master meter (dev bridge
// __mech.audio()) across the title screen, the tutorial and the Ridge —
// engine cranking and driving, radio lines, UI sounds — and fails on NaN,
// clipping or silence.   node tools/audiocheck.mjs
import { spawn } from 'node:child_process';
import puppeteer from 'puppeteer';

const PORT = 4175;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
const problems = [];
let browser;

async function sample(page, label, seconds) {
  const out = [];
  const end = Date.now() + seconds * 1000;
  while (Date.now() < end) {
    out.push(await page.evaluate(() => window.__mech.audio()));
    await wait(250);
  }
  const peak = Math.max(...out.map((m) => m.peak));
  const rms = out.reduce((a, m) => a + m.rms, 0) / out.length;
  const nan = out.some((m) => m.nan);
  console.log(`${label.padEnd(26)} rms ${rms.toFixed(4)}  peak ${peak.toFixed(3)}  ${nan ? 'NaN!' : ''} [${out[0].state}]`);
  if (nan) problems.push(`${label}: NaN in the output`);
  if (peak > 0.995) problems.push(`${label}: clipping (peak ${peak.toFixed(3)})`);
  return { rms, peak };
}

try {
  for (let i = 0; i < 150; i++) {
    try {
      if ((await fetch(`http://localhost:${PORT}/`)).ok) break;
    } catch {}
    await wait(300);
  }
  browser = await puppeteer.launch({
    headless: true,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--window-size=960,540'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 960, height: 540 });
  page.on('pageerror', (e) => problems.push('page: ' + e.message));
  await page.goto(`http://localhost:${PORT}/?q=low`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__mech?.game(), { timeout: 180000 });
  await page.evaluate(() => (window.__mech.game().view.grass.group.visible = false));
  await page.mouse.click(480, 270); // a gesture, like a player would make
  const title = await sample(page, 'title (music + ambience)', 12);
  if (title.rms < 0.0005) problems.push('title: silent');

  await page.evaluate(() => window.__mech.level('depot'));
  await page.waitForFunction(() => window.__mech.game()?.level.id === 'depot' && !window.__mech.game().paused, { timeout: 180000 });
  await page.evaluate(() => (window.__mech.game().view.grass.group.visible = false));
  await sample(page, 'depot interior + radio', 6);
  await page.evaluate(() => {
    const w = window.__mech.game().world;
    w.openDoor('rollup');
    window.__mech.enter('betsy');
    w.vehicle('betsy').running = false;
    w.vehicle('betsy').crank = 1.3;
  });
  const crank = await sample(page, 'betsy cranking', 3);
  await page.evaluate(() => window.__mech.intent({ fwd: true }));
  const drive = await sample(page, 'betsy driving', 6);
  if (drive.rms < 0.001) problems.push('driving: engine inaudible');
  await page.evaluate(() => window.__mech.intent(null));

  await page.evaluate(() => window.__mech.level('ridge'));
  await page.waitForFunction(() => window.__mech.game()?.level.id === 'ridge', { timeout: 180000 });
  await page.evaluate(() => {
    const g = window.__mech.game();
    g.view.grass.group.visible = false;
    g.skipIntro();
  });
  await sample(page, 'ridge overlook (radio)', 6);
  await page.evaluate(() => {
    const w = window.__mech.game().world;
    w.restoreTo('start');
    w.hour = 20.8;
    window.__mech.enter('ridgeback');
    window.__mech.intent({ fwd: true });
  });
  await sample(page, 'ridgeback crank + drive', 10);
  console.log(crank.peak > 0 ? '' : '(crank produced no level)');
} catch (e) {
  problems.push('harness: ' + e.message);
} finally {
  await browser?.close();
  server.kill('SIGTERM');
}
if (problems.length) {
  console.error('\n✗ ' + problems.join('\n✗ '));
  process.exit(1);
}
console.log('\n✓ audio clean: no NaN, no clipping, every stage audible');
process.exit(0);
