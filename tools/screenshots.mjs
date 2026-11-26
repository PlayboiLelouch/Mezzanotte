// Screenshot delle quattro sezioni su più iPhone (emulati) con dati di esempio + controlli di layout.
// Uso: node tools/screenshots.mjs <cartella-sito> <cartella-output> [data-ora ISO] [densità]
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { mkdir } from 'node:fs/promises';
const { chromium, devices } = createRequire(import.meta.url)('playwright');
const site = process.argv[2];
const out = process.argv[3];
const time = process.argv[4] || '2026-12-09T19:10:00+01:00';
const scale = Number(process.argv[5] || 0);
await mkdir(out, { recursive: true });
const PORT = 8500 + Math.floor(Math.random() * 90);
const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1', '--directory', site], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 700));
const browser = await chromium.launch();
// dati di esempio: sfida iniziata il 30 novembre 2026
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const sleep = {};
const read = {};
const d0 = new Date(2026, 10, 30, 12);
for (let i = 0; i < 9; i++) {
  const x = new Date(d0); x.setDate(d0.getDate() + i);
  if (x.getDay() !== 6 && i % 4 !== 2) sleep[iso(x)] = i % 3 === 0 ? { bed: `23:${String(30 + i).padStart(2, '0')}`, ok: true } : { ok: true };
  if (i % 5 !== 3) read[iso(x)] = { min: 6 + (i * 7) % 18 };
}
const seed = JSON.stringify({ app: 'mezzanotte', version: 3, habits: [], entries: { sleep, read }, journeys: [{ id: 1, start: '2026-11-30' }], settings: {}, meta: { seen: { welcome: '3.1.0', level: 9, achievements: ['primo-passo', 'prima-giornata', 'tre-notti', 'sette-letture', 'prima-settimana', 'ora-di-lettura', 'dieci-giornate'], phases: ['1:0'], goals: ['1:0:sleep', '1:0:read', 'lettura:30', 'lettura:60'], recaps: ['1:0'] } } });
const SAFE = ':root{--safe-top:59px!important;--safe-bottom:34px!important}';
const report = [];
for (const name of ['iPhone SE', 'iPhone 13 Mini', 'iPhone 15 Pro', 'iPhone 15 Pro Max']) {
  const opts = { ...devices[name], timezoneId: 'Europe/Rome', locale: 'it-IT' };
  if (scale) opts.deviceScaleFactor = scale;
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.clock.install({ time: new Date(time) });
  await page.addInitScript(([v, css]) => {
    if (!localStorage.getItem('mezzanotte:v2')) localStorage.setItem('mezzanotte:v2', v);
    if (css) document.addEventListener('DOMContentLoaded', () => { const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st); });
  }, [seed, name === 'iPhone SE' ? '' : SAFE]);
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
