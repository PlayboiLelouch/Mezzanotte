// Screenshot delle quattro sezioni su più iPhone (emulati) con dati di esempio + controlli di layout.
// Uso: node tools/screenshots.mjs <cartella-sito> <cartella-output> [data-ora ISO] [densità]
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { mkdir } from 'node:fs/promises';
const { chromium, devices } = createRequire(import.meta.url)('playwright');
const site = process.argv[2];
const out = process.argv[3];
const time = process.argv[4] || '2026-11-25T21:40:00+01:00';
const scale = Number(process.argv[5] || 0);
await mkdir(out, { recursive: true });
const PORT = 8500 + Math.floor(Math.random() * 90);
const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1', '--directory', site], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 700));
const browser = await chromium.launch();
const days = {};
const d0 = new Date(2026, 10, 8, 12);
for (let i = 0; i < 17; i++) {
  const d = new Date(d0); d.setDate(d.getDate() + i);
  const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const e = {};
  if (i % 5 !== 3) e.sleep = i % 4 !== 1;
  if (i % 3 === 0) e.bed = e.sleep ? `23:${String(20 + i).padStart(2, '0')}` : '00:35';
  if (i % 6 !== 2) e.min = 5 + (i * 7) % 20;
  if (e.bed) e.sleep = !(e.bed < '12:00');
  days[iso] = e;
}
const v1 = { app: 'mezzanotte', version: 1, start: '2026-11-08', days, settings: { book: 'Il nome della rosa' }, archive: [], createdAt: '2026-11-08T09:00:00.000Z', updatedAt: '2026-11-24T22:00:00.000Z' };
const report = [];
for (const name of ['iPhone SE', 'iPhone 13 Mini', 'iPhone 15 Pro', 'iPhone 15 Pro Max']) {
  const opts = { ...devices[name], timezoneId: 'Europe/Rome', locale: 'it-IT' };
  if (scale) opts.deviceScaleFactor = scale;
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.clock.install({ time: new Date(time) });
  await page.addInitScript((v) => { if (!localStorage.getItem('mezzanotte:v1')) localStorage.setItem('mezzanotte:v1', v); }, JSON.stringify(v1));
  await page.goto(`http://127.0.0.1:${PORT}/`);
  await page.waitForTimeout(900);
  await page.click('.overlay [data-action="ov-close"]').catch(() => {});
  await page.waitForTimeout(500);
  const slug = name.replace(/\s+/g, '-');
  const r = { device: name };
  for (const t of ['today', 'goals', 'progress', 'profile']) {
    await page.click(`.tab[data-tab="${t}"]`);
    await page.waitForTimeout(1100);
    await page.screenshot({ path: path.join(out, `${slug}-${t}.png`) });
    r[t] = await page.evaluate((t) => {
      const v = document.querySelector(`#view-${t}`);
      const over = [...v.querySelectorAll('*')].filter((el) => { const b = el.getBoundingClientRect(); return b.width > 0 && (b.right > innerWidth + 0.5 || b.left < -0.5); }).map((el) => el.className || el.tagName).slice(0, 4);
      return { overflowX: v.scrollWidth > v.clientWidth, outside: over };
    }, t);
  }
  await page.click('.tab[data-tab="today"]');
  await page.waitForTimeout(400);
  r.habitsVisible = await page.evaluate(() => {
    const tab = document.querySelector('.tabbar').getBoundingClientRect().top;
    return [...document.querySelectorAll('#view-today .habit .check, #view-today .habit .free-pill')].every((c) => c.getBoundingClientRect().bottom < tab);
  });
  r.errors = errors;
  report.push(r);
  await ctx.close();
}
console.log(JSON.stringify(report, null, 1));
await browser.close();
srv.kill();
