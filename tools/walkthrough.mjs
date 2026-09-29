// Player's-eye walkthrough: the guidance bot (test/guide.ts) plays a level
// inside the real game in the browser — following only the waypoint, the
// next-step glow and the prompts — and a screenshot is taken every time the
// step changes. Review the folder like a first-time player would.
//
//   node tools/walkthrough.mjs depot [outdir]
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import puppeteer from 'puppeteer';

const LEVEL = process.argv[2] ?? 'depot';
const OUT = process.argv[3] ?? `walkthrough-${LEVEL}`;
const UNTIL = { depot: 'start', ridge: 'start' }[LEVEL] ?? 'start';
const PORT = 4194;
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const frames = (page, k = 3) =>
  page.evaluate((k) => new Promise((r) => {
    let i = 0;
    const f = () => (++i >= k ? r() : requestAnimationFrame(f));
    requestAnimationFrame(f);
  }), k);

let browser;
const errors = [];
try {
  for (let i = 0; i < 150; i++) {
    try {
      if ((await fetch(`http://localhost:${PORT}/`)).ok) break;
    } catch {
      /* not up */
    }
    await wait(300);
  }
  browser = await puppeteer.launch({
    headless: true,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--window-size=1280,720'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`http://localhost:${PORT}/?level=${LEVEL}&q=low`, { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction(() => window.__mech?.game() && !window.__mech.game().inIntro, { timeout: 180000 });
  await page.evaluate(async () => {
    const g = window.__mech.game();
    g.view.grass.group.visible = false;
    g.paused = true; // the bot steps the world itself; the game just draws it
    const { GuideBot } = await import('/test/guide.ts');
    window.__bot = new GuideBot(g.world);
  });
  let n = 0;
  let last = '';
  for (let move = 0; move < 400; move++) {
    const r = await page.evaluate((until) => {
      const g = window.__mech.game();
      const bot = window.__bot;
      let err = null;
      if (g.world.currentBeat()?.id === until) return { done: true };
      try {
        bot.follow({ until: () => false, maxMoves: 1 });
      } catch (e) {
        err = String(e.message ?? e);
      }
      // show what the bot sees: its view, the step, the prompt
      window.__mech.look(bot.intent.yaw, bot.intent.pitch);
      g.view.capture();
      g.view.capture();
      const b = g.world.currentBeat();
      const d = typeof b?.detail === 'function' ? b.detail(g.world) : b?.detail;
      return { step: `${b?.id}: ${d ?? ''}`, err, done: false };
    }, UNTIL);
    if (r.done) break;
    await frames(page, 3);
    if (r.step !== last) {
      last = r.step;
      const name = `${String(++n).padStart(2, '0')}-${r.step.replace(/[^a-z0-9]+/gi, '-').slice(0, 60)}`;
      await page.screenshot({ path: `${OUT}/${name}.png` });
      console.log('📸', r.step);
    }
    if (r.err && !/ran out of moves/.test(r.err)) {
      errors.push(`${r.step}: ${r.err}`);
      break;
    }
  }
} catch (e) {
  errors.push('harness: ' + e.message);
} finally {
  await browser?.close();
  server.kill('SIGTERM');
}
if (errors.length) {
  console.error('\n✗ ' + errors.join('\n'));
  process.exit(1);
}
console.log(`\n✓ walked the ${LEVEL} by guidance — screenshots in ${OUT}/`);
process.exit(0);
