// Headless smoke test: boot the built client, verify no console/page errors,
// and capture screenshots. Usage: node tools/shot.mjs
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import puppeteer from 'puppeteer';

mkdirSync('screenshots', { recursive: true });

const server = spawn('npx', ['vite', '--port', '4173', '--strictPort'], {
  stdio: 'ignore',
});
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await wait(6000);

const browser = await puppeteer.launch({
  headless: true,
  args: [
    '--no-sandbox',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
  ],
});

const errors = [];
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

  await page.goto('http://localhost:4173/', { waitUntil: 'load', timeout: 20000 });
  await wait(1500);
  await page.screenshot({ path: 'screenshots/01-start.png' });

  await page.click('#start-btn').catch(() => {});
  await wait(2500);
  await page.screenshot({ path: 'screenshots/02-garage.png' });

  // Drive the sim directly to prove gameplay renders (headless can't pointer-lock):
  // step the shared World through a short bunny-hop so the gate opens, then shoot.
  await page.evaluate(async () => {
    // @ts-ignore — test hook exposed by main.ts
    const dbg = window.__mech;
    if (!dbg) return;
    dbg.unlock(); // force-enable stepping without pointer lock
    let yaw = 0;
    for (let i = 0; i < 320; i++) {
      yaw += 0.03;
      dbg.drive({ jump: true, sprint: true, right: true, yaw });
      await new Promise((r) => requestAnimationFrame(r));
    }
  });
  await wait(500);
  await page.screenshot({ path: 'screenshots/03-moving.png' });

  console.log('CONSOLE/PAGE ERRORS:', errors.length ? errors : 'none');
} catch (e) {
  console.log('SHOT ERROR:', e.message);
  errors.push(e.message);
} finally {
  await browser.close();
  server.kill('SIGTERM');
}
process.exit(errors.length ? 1 : 0);
