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

  await page.evaluate(() => window.__mech?.openGate());
  await shot('02-spawn', 0, 15, 0, 0); // runway → gate
  await shot('03-exterior', 0, 16, Math.PI, -0.04); // back toward the open door + yard
  await shot('04-workshop', 0, -10.5, 0, -0.02); // chassis bay + benches + hoist + terminal

  // build the car, then frame the finished, customized build
  await page.evaluate(() => window.__mech?.buildCar());
  await wait(500);
  await shot('05-build', 4.5, -3, 0.95, -0.05); // rear 3/4 of the assembled build + spec sheet
  await shot('06-build-front', 2.2, -11, Math.PI * 0.92, -0.04); // front 3/4 of the build

  // optional hidden lore crate (lights-out)
  await page.evaluate(() => window.__mech?.openLore());
  await wait(400);
  await page.screenshot({ path: 'screenshots/07-lore.png' });
  await page.keyboard.press('Escape');
  await wait(300);

  // UI: pause menu + settings panel
  await page.evaluate(() => window.__mech?.pause());
  await wait(400);
  await page.screenshot({ path: 'screenshots/08-pause.png' });
  await page.evaluate(() => window.__mech?.openSettings());
  await wait(400);
  await page.screenshot({ path: 'screenshots/09-settings.png' });

  console.log('CONSOLE/PAGE ERRORS:', errors.length ? errors : 'none');
} catch (e) {
  console.log('SHOT ERROR:', e.message);
  errors.push(e.message);
} finally {
  await browser.close();
  server.kill('SIGTERM');
}
process.exit(errors.length ? 1 : 0);
