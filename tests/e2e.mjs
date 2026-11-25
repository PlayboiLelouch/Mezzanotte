// Test end-to-end con Playwright (Chromium, emulazione iPhone).
// Serve il sito in una sottocartella, come su GitHub Pages.
// Uso: node tests/e2e.mjs [cartella-screenshot]
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdtemp, symlink, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import http from 'node:http';

// richiesta HTTP locale (senza proxy): restituisce { status, body }
const get = (url) => new Promise((resolve, reject) => {
  http.get(url, (res) => {
    let body = '';
    res.setEncoding('utf8');
    res.on('data', (c) => { body += c; });
    res.on('end', () => resolve({ status: res.statusCode, body }));
  }).on('error', reject);
});

const { chromium, devices } = createRequire(import.meta.url)('playwright');
const here = path.dirname(fileURLToPath(import.meta.url));
const site = path.resolve(here, '..', 'site');
const shots = process.argv[2] || null;
if (shots) await mkdir(shots, { recursive: true });

const www = await mkdtemp(path.join(process.env.TMPDIR || tmpdir(), 'mz-'));
await symlink(site, path.join(www, 'mezzanotte'));
const PORT = 8000 + Math.floor(Math.random() * 900);
const server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1', '--directory', www], { stdio: 'ignore' });
const BASE = `http://127.0.0.1:${PORT}/mezzanotte/`;

let passed = 0;
const step = async (name, fn) => {
  try {
    await fn();
    passed++;
    console.log(`✓ ${name}`);
  } catch (err) {
    console.error(`✗ ${name}\n  ${err.stack || err}`);
    process.exitCode = 1;
    throw err;
  }
};

async function waitServer() {
  for (let i = 0; i < 50; i++) {
    try { if ((await get(BASE)).status === 200) return; } catch { /* attendi */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('server non avviato');
}

const browser = await chromium.launch();
try {
  await waitServer();
  const ctx = await browser.newContext({
    ...devices['iPhone 15 Pro'],
    timezoneId: 'Europe/Rome',
    locale: 'it-IT',
    acceptDownloads: true,
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  // mercoledì 25 novembre 2026, 21:30 ora di Roma
  await page.clock.install({ time: new Date('2026-11-25T21:30:00+01:00') });
  const shot = async (name) => { if (shots) await page.screenshot({ path: path.join(shots, `${name}.png`) }); };

  await step('configurazione iPhone: meta tag, manifest, icone', async () => {
    await page.goto(BASE);
    const meta = await page.evaluate(() => ({
      capable: document.querySelector('meta[name="apple-mobile-web-app-capable"]')?.content,
      status: document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')?.content,
      title: document.querySelector('meta[name="apple-mobile-web-app-title"]')?.content,
      viewport: document.querySelector('meta[name="viewport"]')?.content,
      touch: document.querySelector('link[rel="apple-touch-icon"]')?.href,
      splash: [...document.querySelectorAll('link[rel="apple-touch-startup-image"]')].map((l) => l.href),
      manifest: document.querySelector('link[rel="manifest"]')?.href,
    }));
    assert.equal(meta.capable, 'yes');
    assert.equal(meta.status, 'black-translucent');
    assert.equal(meta.title, 'Mezzanotte');
    assert.match(meta.viewport, /viewport-fit=cover/);
    assert.ok(meta.splash.length >= 10);
    const man = JSON.parse((await get(meta.manifest)).body);
    assert.equal(man.display, 'standalone');
    assert.equal(man.name, 'MEZZANOTTE');
    assert.equal(man.start_url, './?source=pwa');
    const urls = [meta.touch, ...meta.splash, ...man.icons.map((i) => new URL(i.src, meta.manifest).href)];
    for (const u of urls) assert.equal((await get(u)).status, 200, u);
    assert.ok(man.icons.some((i) => i.sizes === '512x512' && i.purpose === 'maskable'));
  });

  await step('onboarding e avvio della sfida (iniziata 3 giorni fa)', async () => {
    await page.waitForSelector('#onboarding');
    await shot('01-onboarding');
    await page.fill('#ob-start', '2026-11-22');
    await page.click('[data-action="start"]');
    await page.waitForSelector('#view-today.active .hero');
    const chip = await page.textContent('#view-today .chip');
    assert.match(chip, /Giorno 4\/30/);
    await page.waitForTimeout(900);
    await shot('02-oggi');
  });

  await step('service worker attivo e app sotto controllo', async () => {
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    const controlled = await page.evaluate(() => !!navigator.serviceWorker.controller);
    assert.equal(controlled, true);
    const cached = await page.evaluate(async () => (await (await caches.open((await caches.keys())[0])).keys()).length);
    assert.ok(cached >= 10);
  });

  await step('oggi: sonno, lettura con pulsanti e timer, banner di ieri', async () => {
    await page.click('#view-today [data-card="sleep"] [data-val="1"]');
    await page.click('#view-today [data-card="read"] [data-action="min-add"][data-val="10"]');
    await page.click('#view-today [data-card="read"] [data-action="min-step"][data-val="-5"]');
    let st = await page.evaluate(() => window.__mezzanotte.state.days['2026-11-25']);
    assert.deepEqual(st, { sleep: true, min: 5 });
    await page.click('#view-today [data-action="timer-start"]');
    await page.clock.fastForward('07:10');
    await page.waitForFunction(() => document.querySelector('[data-timer]')?.textContent === '07:10');
    await page.click('#view-today [data-action="timer-stop"]');
    st = await page.evaluate(() => window.__mezzanotte.state.days['2026-11-25']);
    assert.equal(st.min, 12);
    // banner: notte di ieri (martedì 24) da registrare
    await page.click('#view-today .banner [data-iso="2026-11-24"][data-val="1"]');
    st = await page.evaluate(() => window.__mezzanotte.state.days['2026-11-24']);
    assert.equal(st.sleep, true);
    assert.equal(await page.locator('#view-today .banner [data-iso="2026-11-24"]').count(), 0);
    await page.waitForTimeout(1200);
    await shot('03-oggi-compilato');
  });

  await step('calendario: scheda del giorno, orario dopo mezzanotte', async () => {
    await page.click('.tab[data-tab="calendar"]');
    await page.waitForSelector('#view-calendar.active');
    assert.equal(await page.locator('#view-calendar .week-block').count(), 5);
    assert.equal(await page.locator('#view-calendar .day-cell').count(), 30);
    await page.waitForTimeout(600);
    await shot('04-calendario');
    await page.click('#view-calendar [data-iso="2026-11-23"]');
    await page.waitForSelector('.sheet.show');
    await page.fill('.sheet input[type="time"]', '00:40');
    await page.locator('.sheet input[type="time"]').dispatchEvent('change');
    await page.click('.sheet [data-action="min-add"][data-val="15"]');
    let st = await page.evaluate(() => window.__mezzanotte.state.days['2026-11-23']);
    assert.deepEqual(st, { bed: '00:40', sleep: false, min: 15 });
    await page.waitForTimeout(500);
    await shot('05-scheda-giorno');
    await page.click('.sheet [data-action="close-sheet"].btn');
    await page.waitForSelector('.sheet', { state: 'detached' });
    // sabato 28 è nel futuro → disabilitato
    assert.equal(await page.locator('#view-calendar .day-cell[disabled]').count(), 26);
    // 22 novembre (domenica): orario entro mezzanotte
    await page.click('#view-calendar [data-iso="2026-11-22"]');
    await page.fill('.sheet input[type="time"]', '23:20');
    await page.locator('.sheet input[type="time"]').dispatchEvent('change');
    await page.click('.sheet [data-action="min-step"][data-val="5"]');
    await page.click('.sheet .close-btn');
    st = await page.evaluate(() => window.__mezzanotte.state.days['2026-11-22']);
    assert.deepEqual(st, { bed: '23:20', sleep: true, min: 5 });
  });

  await step('statistiche: percentuali, serie, grafici', async () => {
    await page.click('.tab[data-tab="stats"]');
    await page.waitForSelector('#view-stats.active');
    const s = await page.evaluate(() => {
      const m = window.__mezzanotte;
      return m.core.computeStats(m.state, '2026-11-25');
    });
    // sonno: 22 ✓, 23 ✗, 24 ✓ (25 in sospeso ma già ✓) → 3/4; lettura 22,23,25 ✓, 24 ✗ → 3/4
    assert.equal(s.sleepDone, 3);
    assert.equal(s.sleepCounted, 4);
    assert.equal(s.readDone, 3);
    assert.equal(s.readCounted, 4);
    assert.equal(s.sleepStreak.current, 2);
    assert.equal(s.totalMin, 32);
    const pct = await page.textContent('#view-stats .pct');
    assert.match(pct, /75/);
    assert.ok(await page.locator('#view-stats svg[aria-label="Orari di sonno"] circle').count() >= 2);
    assert.ok(await page.locator('#view-stats svg[aria-label="Minuti di lettura"] rect').count() >= 3);
    assert.equal(await page.locator('#view-stats .history-list li').count(), 4);
    await page.waitForTimeout(1100);
    await shot('06-statistiche');
    await page.evaluate(() => document.querySelector('#view-stats').scrollTo(0, 99999));
    await page.waitForTimeout(300);
    await shot('07-storico');
  });

  await step('persistenza dopo il riavvio', async () => {
    await page.reload();
    await page.waitForSelector('#view-today.active .hero');
    const days = await page.evaluate(() => Object.keys(window.__mezzanotte.state.days).length);
    assert.equal(days, 4);
    const raw = await page.evaluate(() => localStorage.getItem('mezzanotte:v1'));
    assert.ok(raw && JSON.parse(raw).start === '2026-11-22');
  });

  let backupPath;
  await step('esportazione del backup', async () => {
    await page.click('.tab[data-tab="settings"]');
    await page.evaluate(() => { navigator.canShare = () => false; });
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-action="export"]')]);
    assert.match(dl.suggestedFilename(), /^mezzanotte-backup-2026-11-25\.json$/);
    backupPath = path.join(www, 'backup.json');
    await dl.saveAs(backupPath);
    const data = JSON.parse(await readFile(backupPath, 'utf8'));
    assert.equal(data.app, 'mezzanotte');
    assert.equal(data.days['2026-11-23'].bed, '00:40');
    await shot('08-impostazioni');
  });

  await step('importazione del backup (con conferma)', async () => {
    const data = JSON.parse(await readFile(backupPath, 'utf8'));
    data.days['2026-11-24'].min = 20;
    data.settings.book = 'Se una notte d\'inverno un viaggiatore';
    await writeFile(backupPath, JSON.stringify(data));
    await page.setInputFiles('#import-file', backupPath);
    await page.waitForSelector('.dialog-wrap.show');
    await page.click('.dialog-wrap .actions button.strong');
    await page.waitForFunction(() => window.__mezzanotte.state.days['2026-11-24']?.min === 20);
    await page.waitForSelector('.dialog-wrap', { state: 'detached' });
    const book = await page.inputValue('[data-change="book"]');
    assert.equal(book, 'Se una notte d\'inverno un viaggiatore');
    // file non valido → errore, dati invariati
    const bad = path.join(www, 'bad.json');
    await writeFile(bad, '{"ciao":1}');
    await page.setInputFiles('#import-file', bad);
    await page.waitForSelector('.dialog-wrap.show');
    assert.match(await page.textContent('.dialog-wrap.show'), /non è un backup/);
    await page.click('.dialog-wrap .actions button');
    assert.equal(await page.evaluate(() => window.__mezzanotte.state.days['2026-11-24'].min), 20);
  });

  await step('funzionamento offline', async () => {
    await ctx.setOffline(true);
    await page.reload();
    await page.waitForSelector('#view-today.active .hero');
    await page.click('.tab[data-tab="calendar"]');
    assert.equal(await page.locator('#view-calendar .day-cell').count(), 30);
    await page.click('.tab[data-tab="today"]');
    await page.click('#view-today [data-action="min-add"][data-val="5"]');
    assert.equal(await page.evaluate(() => window.__mezzanotte.state.days['2026-11-25'].min), 17);
    await ctx.setOffline(false);
  });

  await step('sabato sera libero nella vista Oggi', async () => {
    const p2 = await ctx.newPage();
    await p2.clock.install({ time: new Date('2026-11-28T20:00:00+01:00') });
    await p2.goto(BASE);
    await p2.waitForSelector('#view-today.active .hero');
    assert.match(await p2.textContent('#view-today .hero'), /Sabato/);
    assert.match(await p2.textContent('#view-today [data-card="sleep"]'), /Libero/);
    if (shots) await p2.screenshot({ path: path.join(shots, '09-sabato.png') });
    await p2.close();
  });

  await step('nessun errore JavaScript', async () => {
    assert.deepEqual(errors, []);
  });

  await ctx.close();
  console.log(`\n${passed} verifiche end-to-end superate`);
} finally {
  await browser.close();
  server.kill();
}
