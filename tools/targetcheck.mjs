// Drawn-vs-clickable audit in the real renderer: stand on each side of every
// machine and at every station, in both levels, and check that everything
// the crosshair could act on sits on something that's actually drawn there.
// Then again with covers open and jacks up (parts move when they open).
//
//   node tools/targetcheck.mjs            # exits 1 on any mismatch
import { spawn } from 'node:child_process';
import puppeteer from 'puppeteer';

import { execSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = 4193;
// A static build (not the dev server): editing files mid-run can't hot-reload the page under us.
const OUT = join(tmpdir(), 'mech-targetcheck');
execSync(`npx vite build --mode development --outDir ${OUT} --emptyOutDir`, { stdio: 'ignore', env: { ...process.env, NODE_ENV: 'development' } });
const server = spawn('npx', ['vite', 'preview', '--outDir', OUT, '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const frames = (page, k = 3) =>
  page.evaluate((k) => new Promise((r) => {
    let i = 0;
    const f = () => (++i >= k ? r() : requestAnimationFrame(f));
    requestAnimationFrame(f);
  }), k);

const problems = new Map();
let browser;
try {
  for (let i = 0; i < 150; i++) {
    try {
      if ((await fetch(`http://localhost:${PORT}/`)).ok) break;
    } catch {
      /* not up yet */
    }
    await wait(300);
  }
  browser = await puppeteer.launch({
    headless: true,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--window-size=640,360'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 640, height: 360 });
  page.on('pageerror', (e) => problems.set('page error', e.message));
  page.on('error', (e) => problems.set('page crashed', e.message));
  page.on('console', (m) => m.type() === 'error' && console.error('  console:', m.text().slice(0, 200)));
  page.on('framenavigated', (f) => f === page.mainFrame() && console.error('  navigated →', f.url()));

  const LEVELS = process.argv.slice(2).length ? process.argv.slice(2) : ['depot', 'ridge'];
  for (const level of LEVELS) {
    await page.goto(`http://localhost:${PORT}/?level=${level}&q=low`, { waitUntil: 'load', timeout: 60000 });
    await page.waitForFunction(() => window.__mech?.game(), { timeout: 180000 });
    await page.evaluate(() => {
      const g = window.__mech.game();
      g.view.grass.group.visible = false;
      g.skipIntro?.();
    });
    for (const pass of ['as found', 'opened up']) {
      if (pass === 'opened up')
        await page.evaluate(() => {
          const w = window.__mech.game().world;
          for (const m of w.machines.values()) {
            for (const c of m.def.components) {
              if (c.t === 'cover') m.state.covers[c.id] = true;
              if (c.t === 'jack' && m.state.jacks[c.id].state === 'none') m.state.jacks[c.id].state = 'raised';
            }
          }
        });
      const spots = await page.evaluate(() => {
        const g = window.__mech.game();
        const w = g.world;
        const out = [];
        for (const m of w.machines.values()) {
          for (const [x, z] of [[-1.7, 0], [1.7, 0], [0, -3], [0, 3], [-1.6, -1.6], [1.6, 1.6]]) {
            const p = m.world({ x, y: 0, z });
            out.push({ at: `${m.key} (${x},${z})`, x: p.x, z: p.z, look: m.world({ x: x * 0.3, y: 0, z: z * 0.3 }) });
          }
        }
        for (const s of g.level.stations ?? []) out.push({ at: `station ${s.id}`, x: s.pos.x + 1, z: s.pos.z + 1, look: s.pos });
        return out;
      });
      for (const s of spots) {
        let bad = [];
        try {
          await page.evaluate((s) => {
            window.__mech.teleport(s.x, s.z);
            window.__mech.lookAt(s.look.x, s.look.y ?? 1, s.look.z);
          }, s);
          await frames(page, 4);
          bad = await page.evaluate(() => window.__mech.auditTargets());
        } catch (e) {
          // a spot that ends the mission (e.g. falling off the ridge) reloads the page
          problems.set(`${level} · spot ${s.at}`, `could not audit: ${e.message}`);
          break;
        }
        for (const b of bad) {
          const key = `${level} · ${b.id}`;
          if (!problems.has(key)) problems.set(key, `${b.label}: ${b.problem}${b.off !== undefined ? ` (${b.off} m)` : ''} — ${pass}, from ${s.at}`);
        }
      }
      console.log(`${level} ${pass}: ${spots.length} spots checked`);
    }
  }
} catch (e) {
  problems.set('harness', e.message);
} finally {
  await browser?.close();
  server.kill('SIGTERM');
}

if (problems.size) {
  console.error(`\n✗ ${problems.size} drawn-vs-clickable problem(s):`);
  for (const [k, v] of problems) console.error(`  ${k} — ${v}`);
  process.exit(1);
}
console.log('\n✓ every target sits on what is drawn');
process.exit(0);
