// Test end-to-end con Playwright (Chromium, emulazione iPhone). Nessun Safari reale: è un emulatore.
// Serve il sito in una sottocartella come su GitHub Pages e verifica anche l'aggiornamento reale
// dall'app 1.0 (tests/fixtures/v1-site) alla 3.1 tramite service worker, con migrazione dei dati,
// l'avvio ufficiale del 30 novembre 2026, tutti i sabati e la fine della sfida (29 dicembre).
// Uso: node tests/e2e.mjs [cartella-screenshot]
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdtemp, symlink, mkdir, readFile, writeFile, cp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import http from 'node:http';

const get = (url) => new Promise((resolve, reject) => {
  http.get(url, (res) => {
    let body = '';
    res.setEncoding('utf8');
    res.on('data', (c) => { body += c; });
    res.on('end', () => resolve({ status: res.statusCode, body, type: res.headers['content-type'] }));
  }).on('error', reject);
});

const { chromium, devices } = createRequire(import.meta.url)('playwright');
const here = path.dirname(fileURLToPath(import.meta.url));
const site = path.resolve(here, '..', 'site');
const shots = process.argv[2] || null;
if (shots) await mkdir(shots, { recursive: true });

// cartella servita: /mezzanotte → v1 oppure v3 (scambiabile come un nuovo deploy)
const www = await mkdtemp(path.join(process.env.TMPDIR || tmpdir(), 'mz-'));
const v1dir = path.join(www, 'v1');
await cp(path.join(here, 'fixtures', 'v1-site'), v1dir, { recursive: true });
await symlink(path.join(site, 'icons'), path.join(v1dir, 'icons'));
const mount = path.join(www, 'mezzanotte');
// ogni deploy è una copia nuova (date dei file aggiornate, come un vero deploy su GitHub Pages)
let deploys = 0;
async function deploy(dir) {
  const target = path.join(www, `deploy-${++deploys}`);
  await cp(dir, target, { recursive: true, dereference: true });
  await rm(mount, { force: true });
  await symlink(target, mount);
}
await deploy(v1dir);
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

const IPHONE = { ...devices['iPhone 15 Pro'], timezoneId: 'Europe/Rome', locale: 'it-IT' };
const browser = await chromium.launch();
const errors = [];
const watch = (page) => {
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
};
const SAFE = ':root{--safe-top:59px!important;--safe-bottom:34px!important}';
// simula le safe area dell'iPhone (Dynamic Island e barra inferiore) nelle pagine di test
const withSafeArea = (p) => p.addInitScript((css) => document.addEventListener('DOMContentLoaded', () => { const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st); }), SAFE);
const M = (page) => page.evaluate(() => window.__mezzanotte && { state: window.__mezzanotte.state, xp: window.__mezzanotte.computed?.xp, level: window.__mezzanotte.computed?.level, source: window.__mezzanotte.source, version: window.__mezzanotte.version });

// dati scritti dall'app 1.0
const V1_DAYS = {
  '2026-11-22': { bed: '23:20', sleep: true, min: 5 },
  '2026-11-23': { bed: '00:40', sleep: false, min: 15 },
  '2026-11-24': { sleep: true, min: 20 },
  '2026-11-25': { sleep: true, min: 17 },
};

try {
  await waitServer();
  const ctx = await browser.newContext({ ...IPHONE, acceptDownloads: true });
  const page = await ctx.newPage();
  watch(page);
  // mercoledì 25 novembre 2026, 21:30 ora di Roma
  await page.clock.install({ time: new Date('2026-11-25T21:30:00+01:00') });
  const shot = async (name, p = page) => { if (shots) await p.screenshot({ path: path.join(shots, `${name}.png`) }); };

  // apre una pagina in un dato momento (stesso archivio locale dell'iPhone di test)
  const at = async (time) => {
    const p = await ctx.newPage();
    watch(p);
    await withSafeArea(p);
    await p.clock.install({ time: new Date(time) });
    await p.goto(BASE);
    await p.waitForFunction(() => window.__mezzanotte?.version === '3.1.0');
    return p;
  };
  // chiude le celebrazioni a schermo intero ancora in coda
  const settle = async (p) => {
    for (let i = 0; i < 8; i++) {
      await p.waitForTimeout(450);
      if (await p.locator('.overlay.show [data-action="ov-close"]').count()) await p.click('.overlay.show [data-action="ov-close"]');
      else if (await p.locator('.sheet.show[data-type="summary"]').count()) await p.click('.sheet .close-btn');
      else if (i > 1) break;
    }
    await p.waitForTimeout(300);
  };
  const day = (p, iso) => p.evaluate((d) => ({ sleep: window.__mezzanotte.state.entries.sleep[d], read: window.__mezzanotte.state.entries.read[d] }), iso);

  let v1raw;
  await step('app 1.0 installata: onboarding, dati e timer di lettura avviato', async () => {
    await page.goto(BASE);
    await page.waitForSelector('#onboarding');
    await page.fill('#ob-start', '2026-11-22');
    await page.click('[data-action="start"]');
    await page.waitForSelector('#view-today.active .hero');
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    assert.equal(await page.evaluate(() => !!navigator.serviceWorker.controller), true);
    await page.evaluate((days) => {
      const s = JSON.parse(localStorage.getItem('mezzanotte:v1'));
      s.days = days;
      s.settings.book = 'Il nome della rosa';
      localStorage.setItem('mezzanotte:v1', JSON.stringify(s));
    }, V1_DAYS);
    await page.reload();
    await page.waitForSelector('#view-today.active .hero');
    await page.click('#view-today [data-action="timer-start"]');
    await page.clock.fastForward('02:00');
    v1raw = await page.evaluate(() => localStorage.getItem('mezzanotte:v1'));
    assert.equal(JSON.parse(v1raw).version, 1);
  });

  await step('aggiornamento automatico 1.0 → 3.1 tramite service worker', async () => {
    await deploy(site);
    await page.evaluate(() => navigator.serviceWorker.getRegistration().then((r) => r.update()));
    await page.waitForFunction(() => window.__mezzanotte && window.__mezzanotte.version === '3.1.0', null, { timeout: 20000 });
    await page.waitForSelector('.overlay.show .welcome');
    const txt = await page.textContent('.overlay.show');
    assert.match(txt, /Mezzanotte 3\.1/);
    assert.match(txt, /lunedì 30 novembre/);
    assert.match(txt, /4 giorni di prova \(22–25 nov\)/);
    assert.deepEqual(await page.evaluate(() => caches.keys()), ['mezzanotte-v3.1.0']);
    await shot('00-benvenuto');
  });

  await step('migrazione e avvio ufficiale: prove conservate a parte, nulla cancellato, Giorno 1 il 30 novembre', async () => {
    const m = await M(page);
    assert.equal(m.source, 'v1');
    const s = m.state;
    assert.equal(s.version, 3);
    assert.deepEqual(s.journeys.map((j) => j.start), ['2026-11-30']);
    assert.deepEqual(s.entries.sleep, {});
    assert.deepEqual(s.entries.read, {});
    for (const [iso, d] of Object.entries(V1_DAYS)) {
      assert.equal(s.trial.entries.sleep[iso].ok, d.sleep, iso);
      assert.equal(s.trial.entries.read[iso].min, d.min, iso);
    }
    assert.equal(s.trial.journeys[0].start, '2026-11-22');
    assert.equal(s.habits.find((h) => h.id === 'read').config.book, 'Il nome della rosa');
    assert.equal(m.xp.total, 0);
    const kept = await page.evaluate(() => ({ pre: localStorage.getItem('mezzanotte:backup-pre-3.0'), v1: JSON.parse(localStorage.getItem('mezzanotte:v1')), timer: localStorage.getItem('mezzanotte:timer') }));
    assert.equal(kept.pre, v1raw); // dati originali intatti
    assert.equal(kept.v1.start, '2026-11-30'); // copia compatibile 1.x
    assert.equal(kept.timer, null); // il timer avviato nei giorni di prova non conta
    const idb = await page.evaluate(() => new Promise((res) => {
      const r = indexedDB.open('mezzanotte', 1);
      r.onsuccess = () => { const g = r.result.transaction('kv').objectStore('kv').get('mezzanotte:v2'); g.onsuccess = () => res(JSON.parse(g.result)); };
    }));
    assert.equal(idb.trial.entries.read['2026-11-24'].min, 20);
    await page.click('.overlay [data-action="ov-close"]');
    await page.reload();
    await page.waitForSelector('#view-today.active .prep');
    const again = await M(page);
    assert.equal(again.source, 'v2');
    assert.deepEqual(again.state.trial, s.trial);
    assert.equal(again.state.migrations.length, 2);
    assert.equal(await page.locator('.overlay').count(), 0);
  });

  await step('dati della 3.0 (schema 2) → 3.1: stessa migrazione e copia di sicurezza', async () => {
    const c0 = await browser.newContext(IPHONE);
    const p0 = await c0.newPage();
    watch(p0);
    await p0.clock.install({ time: new Date('2026-11-26T10:00:00+01:00') });
    const v2 = { app: 'mezzanotte', version: 2, habits: [], entries: { sleep: { '2026-11-25': { ok: true } }, read: { '2026-11-25': { min: 9 } } }, journeys: [{ id: 1, start: '2026-11-24' }], settings: { sound: false }, meta: { seen: { welcome: '3.0.0', level: 1, achievements: ['primo-passo'] } } };
    await p0.addInitScript((d) => { if (!localStorage.getItem('mezzanotte:v2')) localStorage.setItem('mezzanotte:v2', d); }, JSON.stringify(v2));
    await p0.goto(BASE);
    await p0.waitForSelector('.overlay.show .welcome');
    const s = (await M(p0)).state;
    assert.equal(s.journeys[0].start, '2026-11-30');
    assert.equal(s.trial.entries.read['2026-11-25'].min, 9);
    assert.equal(JSON.parse(await p0.evaluate(() => localStorage.getItem('mezzanotte:backup-pre-3.1'))).version, 2);
    await c0.close();
  });

  await step('prima del 30 novembre: schermata di preparazione, nessun conteggio', async () => {
    await page.close();
    const p = await at('2026-11-26T18:00:00+01:00');
    await p.waitForSelector('#view-today.active .prep');
    assert.equal(await p.locator('#view-today .habit').count(), 0);
    assert.match(await p.textContent('#view-today .large-title'), /Si parte lunedì/);
    assert.match(await p.textContent('#view-today .prep'), /lunedì 30 novembre/);
    assert.match(await p.textContent('#view-today .prep-count'), /3\s*giorni/);
    assert.match(await p.textContent('#view-today [data-prep-line]'), /Mancano 3 giorni, 11 h e 00 min/);
    await p.clock.fastForward('01:00:00');
    await p.waitForFunction(() => /3 giorni, 10 h e 00 min/.test(document.querySelector('[data-prep-line]').textContent));
    assert.match(await p.textContent('#view-today'), /A letto entro mezzanotte[\s\S]*Almeno 5 minuti di lettura/);
    assert.equal(await p.locator('#view-today .plan-row').count(), 5);
    await shot('01-preparazione', p);
    await p.click('.tab[data-tab="progress"]');
    assert.match(await p.textContent('#view-progress'), /Le statistiche partono lunedì 30 novembre/);
    await p.click('[data-action="progress-tab"][data-id="calendar"]');
    assert.equal(await p.locator('#view-progress button.cal-cell:not([disabled])').count(), 0);
    await p.click('.tab[data-tab="goals"]');
    const phases = await p.$$eval('#view-goals .phase .ph-top span', (els) => els.map((e) => e.textContent));
    assert.deepEqual(phases, ['30 nov – 6 dic', '7–13 dic', '14–20 dic', '21–27 dic', '28–29 dic']);
    assert.match(await p.textContent('#view-goals .j-metrics'), /0\s*\/ 30 giorni[\s\S]*0\s*\/ 10/);
    await p.close();
  });

  await step('29 novembre sera: ancora preparazione, nessuna pressione e nessun errore conteggiato', async () => {
    const p = await at('2026-11-29T23:30:00+01:00');
    await p.waitForSelector('#view-today.active .prep');
    assert.match(await p.textContent('#view-today .large-title'), /Si parte domani/);
    assert.match(await p.textContent('#view-today .prep-count'), /5\s*ore/);
    assert.match(await p.textContent('#view-today [data-prep-line]'), /Mancano 5 h e 30 min/);
    assert.equal(await p.locator('#view-today .routine, #view-today [data-routine]').count(), 0);
    assert.equal((await M(p)).xp.total, 0);
    await p.clock.fastForward('05:31:00'); // lunedì 30, 05:01
    await p.waitForSelector('#view-today .habit');
    assert.match(await p.textContent('#view-today .large-title'), /Giorno 1\s*di 30/);
    await p.close();
  });

  await step('30 novembre: Giorno 1 di 30, primo completamento con XP e medaglia', async () => {
    const p = await at('2026-11-30T08:00:00+01:00');
    await p.waitForSelector('#view-today.active .habit');
    assert.match(await p.textContent('#view-today .large-title'), /Giorno 1\s*di 30/);
    assert.match(await p.textContent('#view-today [data-card="sleep"]'), /A letto entro le 00:00 · routine dalle 23:15/);
    assert.equal((await M(p)).state.journeys[0].start, '2026-11-30');
    await p.click('#view-today [data-card="read"] .check');
    await p.waitForFunction(() => window.__mezzanotte.state.entries.read['2026-11-30']?.min === 5);
    assert.equal((await M(p)).xp.total, 20);
    await p.waitForSelector('.ach-toast.show .medal-art.on');
    assert.match(await p.textContent('.ach-toast'), /Primo passo/);
    await p.waitForFunction(() => document.querySelector('[data-xp]').textContent === '20');
    await p.close();
  });

  await step('routine serale contestuale e registrazione dell\'orario', async () => {
    const p = await at('2026-11-30T21:10:00+01:00');
    await settle(p);
    assert.match(await p.textContent('#view-today [data-routine]'), /Routine serale tra 2 h 05 min/);
    await p.clock.fastForward('02:10:00'); // 23:20
    await p.waitForFunction(() => /niente nuovi lavori/.test(document.querySelector('[data-routine]')?.textContent));
    await p.clock.fastForward('15:00'); // 23:35
    await p.waitForFunction(() => /Chiudi i progetti/.test(document.querySelector('[data-routine]')?.textContent));
    await p.clock.fastForward('12:00'); // 23:47
    await p.waitForFunction(() => /Preparati per dormire/.test(document.querySelector('[data-routine]')?.textContent));
    await p.evaluate(() => window.dispatchEvent(new Event('focus')));
    await p.click('.tab[data-tab="goals"]');
    await p.click('.tab[data-tab="today"]');
    assert.ok(await p.locator('#view-today .routine .r-step.now').count());
    await shot('02-routine', p);
    await p.click('#view-today [data-card="sleep"] .check');
    await p.waitForFunction(() => window.__mezzanotte.state.entries.sleep['2026-11-30']?.ok === true);
    assert.equal((await day(p, '2026-11-30')).sleep.bed, '23:47');
    assert.equal((await M(p)).xp.total, 50);
    assert.match(await p.textContent('#view-today .section-head'), /Giornata completa/);
    await p.close();
  });

  await step('dopo mezzanotte: l\'orario viene associato alla notte giusta', async () => {
    const p = await at('2026-12-02T00:40:00+01:00'); // notte di martedì 1 dicembre
    await settle(p);
    assert.match(await p.textContent('#view-today .eyebrow'), /martedì 1 dicembre/i);
    await p.click('#view-today [data-action="bed-now"]');
    await p.waitForFunction(() => window.__mezzanotte.state.entries.sleep['2026-12-01']?.bed === '00:40');
    assert.deepEqual((await day(p, '2026-12-01')).sleep, { ok: false, bed: '00:40' });
    assert.match(await p.textContent('.toast.show'), /notte di martedì/);
    assert.equal(await p.evaluate(() => window.__mezzanotte.state.entries.sleep['2026-12-02']), undefined);
    await p.close();
  });

  await step('timer di lettura immersivo: pausa, ripresa, salvataggio, traguardi di lettura', async () => {
    const p = await at('2026-12-02T21:00:00+01:00');
    await settle(p);
    await p.click('#view-today [data-action="open-timer"]');
    await p.waitForSelector('.sheet.show[data-type="timer"] .reader');
    assert.match(await p.textContent('.reader'), /Il nome della rosa/);
    assert.match(await p.textContent('.reader .rd-foot'), /5 min letti in tutto/);
    await p.click('.reader [data-action="timer-start"]');
    await p.clock.fastForward('02:00');
    await p.click('.reader [data-action="timer-pause"]');
    const paused = await p.textContent('.reader [data-timer]');
    await p.clock.fastForward('03:00');
    await p.waitForTimeout(200);
    assert.equal(await p.textContent('.reader [data-timer]'), paused);
    assert.match(await p.textContent('[data-timer-label]'), /pausa/);
    await p.click('.reader [data-action="timer-resume"]');
    await p.clock.fastForward('02:00');
    await shot('03-timer', p);
    await p.click('.reader [data-action="timer-finish"]');
    await p.waitForFunction(() => window.__mezzanotte.state.entries.read['2026-12-02']?.min === 4);
    assert.equal(await p.evaluate(() => localStorage.getItem('mezzanotte:timer')), null);
    // 4 minuti: sotto l'obiettivo, nessun XP per la lettura di oggi
    assert.equal(await p.getAttribute('#view-today [data-card="read"]', 'data-status'), 'pending');
    await p.close();
  });

  await step('obiettivi settimanali: animazione dedicata, fase completata, riepilogo della settimana', async () => {
    const p = await at('2026-12-05T20:00:00+01:00');
    await settle(p);
    if (await p.locator('.welcome-back [data-action="away-dismiss"]').count()) await p.click('.welcome-back [data-action="away-dismiss"]');
    await p.click('.tab[data-tab="progress"]');
    await p.click('[data-action="progress-tab"][data-id="calendar"]');
    const calm = async () => {
      await settle(p);
      await p.waitForFunction(() => !document.querySelector('.ach-toast'), null, { timeout: 15000 });
    };
    const edit = async (iso, fn) => {
      await calm();
      await p.click(`#view-progress .cal-cell[data-iso="${iso}"]`);
      await p.waitForSelector('.sheet.show [data-editor="sleep"]');
      await fn();
      await p.click('.sheet .close-btn');
      await p.waitForSelector('.sheet', { state: 'detached' });
    };
    // notti: 30 nov (già), 2, 3, 4 dicembre → 4 su 4: animazione dell'obiettivo del sonno
    for (const d of ['2026-12-02', '2026-12-03']) await edit(d, () => p.click('.sheet [data-action="sleep-set"][data-val="1"]'));
    await calm();
    await p.click(`#view-progress .cal-cell[data-iso="2026-12-04"]`);
    await p.waitForSelector('.sheet.show');
    await p.click('.sheet [data-action="sleep-set"][data-val="1"]');
    await p.waitForSelector('.ach-toast.goal-toast.show');
    assert.match(await p.textContent('.ach-toast.goal-toast'), /Obiettivo settimanale[\s\S]*Sonno: 4 su 4 notti/);
    await p.click('.sheet .close-btn');
    await p.waitForSelector('.sheet', { state: 'detached' });
    assert.equal((await M(p)).state.meta.seen.goals.includes('1:0:sleep'), true);
    // letture: 30 nov (già), 1, 3, 4 dicembre → fase 1 completata
    for (const d of ['2026-12-01', '2026-12-03']) await edit(d, () => p.click('.sheet [data-action="min-add"][data-val="5"]'));
    await calm();
    await p.click(`#view-progress .cal-cell[data-iso="2026-12-04"]`);
    await p.waitForSelector('.sheet.show');
    await p.click('.sheet [data-action="min-add"][data-val="10"]');
    assert.equal(await p.locator('.overlay').count(), 0); // nessuna interruzione con la scheda aperta
    await p.click('.sheet .close-btn');
    await p.waitForSelector('.overlay.show .ov-phase');
    assert.match(await p.textContent('.overlay.show'), /Fase 1 completata[\s\S]*Inizio/);
    await shot('04-fase-completata', p);
    await p.click('.overlay [data-action="ov-close"]');
    await settle(p);
    const m = await M(p);
    assert.equal(m.state.entries.read['2026-12-04'].min, 10);
    await p.close();
    // lunedì 7: riepilogo della settimana 1 nella Home
    const q = await at('2026-12-07T09:00:00+01:00');
    await settle(q);
    await q.waitForSelector('#view-today .recap');
    assert.match(await q.textContent('#view-today .recap'), /Settimana 1: obiettivi raggiunti/);
    assert.match(await q.textContent('#view-today .recap'), /4\/4 notti · 4\/4 letture/);
    await q.click('#view-today .recap [data-action="open-week"]');
    await q.waitForSelector('.sheet.show .wk-hero');
    assert.match(await q.textContent('.sheet'), /Settimana 1 · Inizio[\s\S]*100%/);
    await shot('05-riepilogo-settimana', q);
    await q.click('.sheet .close-btn');
    await q.waitForSelector('.sheet', { state: 'detached' });
    await q.click('#view-today [data-action="recap-dismiss"]');
    assert.equal(await q.locator('#view-today .recap').count(), 0);
    assert.match(await q.textContent('#view-today .week-card'), /Settimana 2 · Costanza/);
    await q.close();
  });

  for (const sat of ['2026-12-05', '2026-12-12', '2026-12-19', '2026-12-26']) {
    await step(`sabato ${sat.slice(8)} dicembre: sera libera, nessuna pressione sull'orario`, async () => {
      const p = await at(`${sat}T23:30:00+01:00`);
      await settle(p);
      assert.equal(await p.getAttribute('#view-today [data-card="sleep"]', 'data-status'), 'free');
      assert.equal(await p.locator('#view-today [data-card="sleep"] .check, #view-today .routine, #view-today [data-routine], #view-today [data-action="bed-now"]').count(), 0);
      const insight = await p.textContent('#view-today .insight');
      assert.doesNotMatch(insight, /notte in orario|mezzanotte|routine/i);
      if (sat === '2026-12-12') await shot('06-sabato', p);
      await p.close();
    });
  }

  await step('fine della sfida: 29 dicembre Giorno 30 di 30, poi bilancio e medaglia dei 30 giorni', async () => {
    const p = await at('2026-12-29T21:00:00+01:00');
    await settle(p);
    assert.match(await p.textContent('#view-today .large-title'), /Giorno 30\s*di 30/);
    await p.click('.tab[data-tab="goals"]');
    assert.match(await p.textContent('#view-goals .phase.current'), /Bilancio[\s\S]*28–29 dic/);
    await p.close();
    const q = await at('2026-12-30T10:00:00+01:00');
    for (let i = 0; i < 8 && !(await q.locator('.sheet.show[data-type="summary"]').count()); i++) {
      if (await q.locator('.overlay.show [data-action="ov-close"]').count()) await q.click('.overlay.show [data-action="ov-close"]');
      await q.waitForTimeout(600);
    }
    await q.waitForSelector('.sheet.show[data-type="summary"]');
    const sum = await q.textContent('.sheet');
    assert.match(sum, /Bilancio del percorso 1/);
    assert.match(sum, /30 nov – 29 dic · 30 giorni/);
    await shot('07-bilancio', q);
    await q.click('.sheet .close-btn');
    const m = await M(q);
    assert.equal(m.state.meta.seen.achievements.includes('trenta-giorni'), true);
    assert.match(await q.textContent('#view-today'), /Percorso completato/);
    await q.close();
  });

  await step('coerenza: XP, livello, settimana e calendario uguali in tutte le sezioni', async () => {
    const p = await at('2026-12-09T19:00:00+01:00');
    await settle(p);
    const m = await M(p);
    const c = await p.evaluate(() => {
      const k = window.__mezzanotte.computed;
      return { xp: k.xp.total, wk: k.blocks.find((b) => b.key === '1:1').habits, lv: k.level.n };
    });
    assert.match(await p.textContent('#view-today [data-xp]'), new RegExp(`^${c.xp.toLocaleString('it-IT').replace('.', '\\.')}$`));
    await p.click('.tab[data-tab="profile"]');
    assert.match(await p.textContent('#view-profile .level-hero'), new RegExp(`${c.xp.toLocaleString('it-IT').replace('.', '\\.')}\\s*XP totali`));
    assert.match(await p.textContent('#view-profile .lh-ring'), new RegExp(`Livello\\s*${c.lv}`));
    assert.equal(await p.locator('#view-profile .ach-cell').count(), 14);
    assert.ok(await p.locator('#view-profile .ach-cell .medal-art.on').count() >= 3);
    assert.match(await p.textContent('#view-profile'), /Giorni di prova[\s\S]*4 giorni \(22–25 nov\)/);
    await shot('08-profilo', p);
    await p.evaluate(() => document.querySelector('#view-profile').scrollTo(0, 650));
    await p.waitForTimeout(300);
    await shot('09-medaglie', p);
    await p.click('.tab[data-tab="goals"]');
    assert.match(await p.textContent('#view-goals .phase.current'), new RegExp(`${c.wk.sleep.done}/${c.wk.sleep.target} notti[\\s\\S]*${c.wk.read.done}/${c.wk.read.target} letture`));
    await shot('10-obiettivi', p);
    await p.click('.tab[data-tab="progress"]');
    await p.waitForTimeout(900);
    await shot('11-progressi', p);
    await p.click('[data-action="progress-tab"][data-id="calendar"]');
    // calendario: i pallini "fatto" coincidono con gli stati del motore
    const cal = await p.$$eval('#view-progress .cal-cell[data-iso]', (els) => els.map((e) => [e.dataset.iso, e.querySelectorAll('.s-done').length]));
    const eng = await p.evaluate(() => {
      const W = window.__mezzanotte; const st = W.state; const out = {};
      for (const d of W.computed.days) out[d.iso] = Object.values(d.status).filter((x) => x === 'done').length;
      return out;
    });
    for (const [iso, n] of cal) assert.equal(n, eng[iso] ?? 0, iso);
    await shot('12-calendario', p);
    await p.click('.tab[data-tab="today"]');
    await shot('13-oggi', p);
    // nessun contenuto sotto la barra di stato: l'ombra copre la safe area superiore
    const shade = await p.evaluate(() => { const r = document.querySelector('.status-shade').getBoundingClientRect(); return { top: r.top, h: r.height, pos: getComputedStyle(document.querySelector('.status-shade')).position }; });
    assert.equal(shade.pos, 'fixed');
    assert.equal(shade.top, 0);
    assert.ok(shade.h >= 59);
    await p.close();
  });

  let backupPath;
  await step('esportazione e importazione (anche di backup 1.x e delle prove)', async () => {
    const p = await at('2026-12-09T19:00:00+01:00');
    await settle(p);
    await p.click('.tab[data-tab="profile"]');
    await p.evaluate(() => { navigator.canShare = () => false; });
    const [dl] = await Promise.all([p.waitForEvent('download'), p.click('[data-action="export"]')]);
    assert.match(dl.suggestedFilename(), /^mezzanotte-backup-2026-12-09\.json$/);
    backupPath = path.join(www, 'backup.json');
    await dl.saveAs(backupPath);
    const data = JSON.parse(await readFile(backupPath, 'utf8'));
    assert.equal(data.version, 3);
    assert.equal(data.trial.entries.read['2026-11-24'].min, 20);
    assert.equal(data.entries.read['2026-12-04'].min, 10);
    // importa un backup 1.x: le prove restano separate
    const old = path.join(www, 'old.json');
    await writeFile(old, v1raw);
    await p.setInputFiles('#import-file', old);
    await p.waitForSelector('.dialog-wrap.show');
    await p.click('.dialog-wrap .actions button.strong');
    await p.waitForFunction(() => window.__mezzanotte.state.trial?.entries.read['2026-11-24']?.min === 20 && !window.__mezzanotte.state.entries.read['2026-12-04']);
    // file non valido: errore, dati invariati
    const bad = path.join(www, 'bad.json');
    await writeFile(bad, '{"ciao":1}');
    await p.setInputFiles('#import-file', bad);
    await p.waitForSelector('.dialog-wrap.show');
    assert.match(await p.textContent('.dialog-wrap.show'), /non è un backup/);
    await p.click('.dialog-wrap .actions button');
    // ripristina il backup 3.1
    await p.setInputFiles('#import-file', backupPath);
    await p.waitForSelector('.dialog-wrap.show .actions button.strong');
    await p.click('.dialog-wrap.show .actions button.strong');
    await p.waitForFunction(() => window.__mezzanotte.state.entries.read['2026-12-04']?.min === 10);
    await p.close();
  });

  await step('funzionamento offline', async () => {
    const p = await at('2026-12-09T20:00:00+01:00');
    await settle(p);
    await ctx.setOffline(true);
    await p.reload();
    await p.waitForSelector('#view-today.active .habit');
    await settle(p);
    await p.click('#view-today [data-card="read"] .check');
    await p.waitForFunction(() => window.__mezzanotte.state.entries.read['2026-12-09']?.min >= 5);
    await p.reload();
    await p.waitForFunction(() => window.__mezzanotte?.state.entries.read['2026-12-09']?.min >= 5);
    await ctx.setOffline(false);
    await p.close();
  });

  await step('passaggio di livello: schermata speciale, chiudibile subito', async () => {
    const c2 = await browser.newContext(IPHONE);
    const p5 = await c2.newPage();
    watch(p5);
    await p5.clock.install({ time: new Date('2026-12-09T18:00:00+01:00') });
    const raw = JSON.parse(await readFile(backupPath, 'utf8'));
    raw.meta.seen.level = 1;
    raw.meta.seen.achievements = [];
    await p5.addInitScript((s) => localStorage.setItem('mezzanotte:v2', s), JSON.stringify(raw));
    await p5.goto(BASE);
    await p5.waitForSelector('.overlay.show .ov-ring');
    assert.match(await p5.textContent('.overlay.show'), /Nuovo livello/);
    await p5.waitForTimeout(1400);
    await shot('14-livello', p5);
    await p5.click('.overlay [data-action="ov-close"]');
    await p5.waitForSelector('.ach-toast.show');
    await c2.close();
  });

  await step('nuovo utente: onboarding e primo percorso', async () => {
    const c3 = await browser.newContext({ ...IPHONE, reducedMotion: 'reduce' });
    const p6 = await c3.newPage();
    watch(p6);
    await p6.clock.install({ time: new Date('2027-01-11T08:00:00+01:00') });
    await p6.goto(BASE);
    await p6.waitForSelector('#onboarding');
    await p6.click('[data-action="start"]');
    await p6.waitForSelector('#view-today.active .habit');
    assert.equal(await p6.evaluate(() => document.documentElement.classList.contains('reduce-motion')), true);
    assert.equal(await p6.locator('.overlay').count(), 0);
    assert.match(await p6.textContent('#view-today .large-title'), /Giorno 1/);
    await p6.click('#view-today [data-card="read"] .check');
    await p6.waitForFunction(() => window.__mezzanotte.state.entries.read['2027-01-11']?.min === 5);
    assert.equal((await M(p6)).xp.total, 20);
    await p6.click('.toast.show button');
    await p6.waitForFunction(() => !window.__mezzanotte.state.entries.read['2027-01-11']);
    assert.equal((await M(p6)).xp.total, 0);
    await c3.close();
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
