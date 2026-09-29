// Quick screenshot harness: node shot.mjs <outdir> <script.json>
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import puppeteer from 'puppeteer';
const [out, scriptPath, level = 'sandbox', q = 'med'] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const steps = JSON.parse(readFileSync(scriptPath, 'utf8'));
const PORT = 4190;
const server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { stdio: 'ignore', cwd: '/home/user/the-mechanics' });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const errors = [];
let browser;
try {
  for (let i = 0; i < 100; i++) { try { const r = await fetch(`http://localhost:${PORT}/`); if (r.ok) break; } catch {} await wait(300); }
  browser = await puppeteer.launch({ headless: true, executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--window-size=1280,720'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
  await page.goto(`http://localhost:${PORT}/?level=${level}&q=${q}`, { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction(() => window.__mech?.game(), { timeout: 120000 });
  await wait(1500);
  let n = 0;
  for (const s of steps) {
    if (s.eval) await page.evaluate(s.eval);
    await wait(s.wait ?? 800);
    if (s.shot) { await page.screenshot({ path: `${out}/${String(++n).padStart(2, '0')}-${s.shot}.png` }); }
    if (s.log) console.log(s.log, JSON.stringify(await page.evaluate(s.logEval)));
  }
} catch (e) { errors.push('HARNESS: ' + e.message); }
finally { await browser?.close(); server.kill('SIGTERM'); }
console.log(errors.length ? errors.slice(0, 30).join('\n') : 'no errors');
process.exit(0);
