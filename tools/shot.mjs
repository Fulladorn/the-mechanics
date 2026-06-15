// Headless smoke test: boot the built client, verify no console/page errors,
// and capture screenshots. Usage: node tools/shot.mjs
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import puppeteer from 'puppeteer';

mkdirSync('screenshots', { recursive: true });

const server = spawn('npx', ['vite', '--port', '4173', '--strictPort'], { stdio: 'ignore' });
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
  await wait(1200);
  await page.screenshot({ path: 'screenshots/01-start.png' });

  await page.click('#start-btn').catch(() => {});
  await wait(800);
  await page.evaluate(() => window.__mech?.unlock());
  await wait(400);

  // helper to pose the camera deterministically then settle a few frames
  const shot = async (name, x, z, yaw, pitch) => {
    await page.evaluate(
      (x, z, yaw, pitch) => window.__mech?.teleport(x, z, yaw, pitch),
      x,
      z,
      yaw,
      pitch,
    );
    await wait(400);
    await page.screenshot({ path: `screenshots/${name}.png` });
  };

  await shot('02-spawn', 0, 15, 0, 0); // runway → gate
  await shot('03-exterior', 0, 16, Math.PI, -0.04); // back toward the open door + yard
  await page.evaluate(() => window.__mech?.unlock()); // gate stays closed; open it
  // bunny-hop to open the gate, then frame the workshop
  await page.evaluate(async () => {
    let yaw = 0;
    for (let i = 0; i < 300; i++) {
      yaw += 0.03;
      window.__mech?.drive({ jump: true, sprint: true, right: true, yaw });
      await new Promise((r) => requestAnimationFrame(r));
    }
    window.__mech?.stop();
  });
  await shot('04-workshop', 0, -10.5, 0, -0.02); // kart bay + benches + hoist + terminal
  await shot('05-corner', -14, -15, Math.PI / 4, 0); // shelves/tires/barrels corner

  console.log('CONSOLE/PAGE ERRORS:', errors.length ? errors : 'none');
} catch (e) {
  console.log('SHOT ERROR:', e.message);
  errors.push(e.message);
} finally {
  await browser.close();
  server.kill('SIGTERM');
}
process.exit(errors.length ? 1 : 0);
