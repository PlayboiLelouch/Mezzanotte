// Test end-to-end con Playwright (Chromium, emulazione iPhone). Nessun Safari reale: è un emulatore.
// Serve il sito in una sottocartella come su GitHub Pages e verifica anche l'aggiornamento reale
// dall'app 1.0 (tests/fixtures/v1-site) alla 3.0 tramite service worker, con migrazione dei dati.
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
    // registrazioni nel formato 1.x, poi ricarica: l'app 1.0 le mostra
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
    assert.ok(await page.evaluate(() => localStorage.getItem('mezzanotte:timer')));
  });

  await step('aggiornamento automatico 1.0 → 3.0 tramite service worker', async () => {
    await deploy(site);
    await page.evaluate(() => navigator.serviceWorker.getRegistration().then((r) => r.update()));
    // la pagina 1.0 si ricarica da sola al cambio di service worker
    await page.waitForFunction(() => window.__mezzanotte && window.__mezzanotte.version === '3.0.0', null, { timeout: 20000 });
    await page.waitForSelector('.overlay.show .welcome');
    const keys = await page.evaluate(() => caches.keys());
    assert.deepEqual(keys, ['mezzanotte-v3.0.0']);
    await shot('00-benvenuto-3.0');
  });

  await step('migrazione: nessun dato perso, copia originale conservata, compatibilità 1.x', async () => {
    const m = await M(page);
    assert.equal(m.source, 'v1');
    const s = m.state;
    assert.equal(s.version, 2);
    assert.equal(s.journeys[0].start, '2026-11-22');
    for (const [iso, d] of Object.entries(V1_DAYS)) {
      assert.equal(s.entries.sleep[iso].ok, d.sleep, iso);
      assert.equal(s.entries.read[iso].min, d.min, iso);
      if (d.bed) assert.equal(s.entries.sleep[iso].bed, d.bed);
    }
    assert.equal(s.habits.find((h) => h.id === 'read').config.book, 'Il nome della rosa');
    const kept = await page.evaluate(() => ({
      pre: localStorage.getItem('mezzanotte:backup-pre-3.0'),
      v2: localStorage.getItem('mezzanotte:v2'),
      v1: localStorage.getItem('mezzanotte:v1'),
    }));
    assert.equal(kept.pre, v1raw); // dati originali intatti
    assert.ok(JSON.parse(kept.v2).version === 2);
    const mirror = JSON.parse(kept.v1);
    assert.equal(mirror.version, 1);
    assert.equal(mirror.start, '2026-11-22');
    assert.deepEqual(mirror.days['2026-11-23'], { sleep: false, bed: '00:40', min: 15 });
    // copia in IndexedDB
    const idb = await page.evaluate(() => new Promise((res) => {
      const r = indexedDB.open('mezzanotte', 1);
      r.onsuccess = () => { const g = r.result.transaction('kv').objectStore('kv').get('mezzanotte:v2'); g.onsuccess = () => res(g.result); };
    }));
    assert.equal(JSON.parse(idb).entries.read['2026-11-24'].min, 20);
    // XP calcolati dai dati: 22 (50) + 23 (20) + 24 (50) + 25 (50) + lettura settimana 1 (4/4 → 50) = 220
    assert.equal(m.xp.total, 220);
    assert.equal(m.level.n, 2);
    // seconda apertura: nessuna nuova migrazione, stessi dati
    await page.click('.overlay [data-action="ov-close"]');
    await page.reload();
    await page.waitForSelector('#view-today.active .habit');
    const again = await M(page);
    assert.equal(again.source, 'v2');
    assert.deepEqual(again.state.entries, s.entries);
    assert.equal(again.state.migrations.length, 1);
    assert.equal(await page.locator('.overlay').count(), 0);
  });

  await step('oggi: le due abitudini sono visibili senza scorrere e la routine non è un obbligo', async () => {
    const vh = await page.evaluate(() => window.innerHeight);
    const tabTop = await page.evaluate(() => document.querySelector('.tabbar').getBoundingClientRect().top);
    for (const card of ['sleep', 'read']) {
      const box = await page.locator(`#view-today [data-card="${card}"] .check`).boundingBox();
      assert.ok(box && box.y + box.height < tabTop, `${card} visibile`);
    }
    assert.ok(tabTop <= vh);
    assert.match(await page.textContent('#view-today .large-title'), /Giorno 4/);
    assert.match(await page.textContent('#view-today .xp-line'), /Livello 2/);
    assert.ok(await page.locator('#view-today .insight').count());
    // timer della 1.0 ancora in corso dopo l'aggiornamento
    assert.match(await page.textContent('#view-today [data-card="read"]'), /in corso/);
    await shot('01-oggi');
  });

  await step('timer di lettura: pausa, ripresa e salvataggio (sessione iniziata nella 1.0)', async () => {
    await page.click('#view-today [data-action="open-timer"]');
    await page.waitForSelector('.sheet.show [data-timer-ring]');
    await page.clock.fastForward('02:00');
    await page.waitForFunction(() => document.querySelector('.sheet [data-timer]')?.textContent >= '04:00');
    await page.click('.sheet [data-action="timer-pause"]');
    const paused = await page.textContent('.sheet [data-timer]');
    await page.clock.fastForward('03:00');
    await page.waitForTimeout(200);
    assert.equal(await page.textContent('.sheet [data-timer]'), paused);
    assert.match(await page.textContent('.sheet [data-timer-label]'), /pausa/);
    await page.click('.sheet [data-action="timer-resume"]');
    await page.clock.fastForward('02:00');
    await shot('06-timer');
    const before = (await M(page)).state.entries.read['2026-11-25'].min;
    await page.click('.sheet [data-action="timer-finish"]');
    await page.waitForFunction((b) => window.__mezzanotte.state.entries.read['2026-11-25'].min > b, before);
    const after = (await M(page)).state.entries.read['2026-11-25'].min;
    assert.equal(after - before, 6); // 2 + 2 + 2 minuti, pausa esclusa
    assert.equal(await page.evaluate(() => localStorage.getItem('mezzanotte:timer')), null);
    // 57 + 6 = 63 minuti totali → traguardo "60 minuti di lettura" con celebrazione
    await page.waitForSelector('.ach-toast.show');
    assert.match(await page.textContent('.ach-toast'), /60 minuti/);
  });

  await step('XP: un tocco su un\'abitudine già fatta apre i dettagli, nessuna duplicazione', async () => {
    let m = await M(page);
    const xp0 = m.xp.total;
    // lettura già fatta oggi: il tocco apre i dettagli invece di duplicare
    await page.click('#view-today [data-card="read"] .check');
    await page.waitForSelector('.sheet.show [data-editor="read"]');
    await page.click('.sheet .close-btn');
    await page.waitForSelector('.sheet', { state: 'detached' });
    // modifiche ripetute dalla scheda del giorno
    await page.click('#view-today [data-card="sleep"] .h-main');
    await page.waitForSelector('.sheet.show [data-editor="sleep"]');
    for (let i = 0; i < 3; i++) {
      await page.click('.sheet [data-action="sleep-set"][data-val="0"]');
      await page.click('.sheet [data-action="sleep-set"][data-val="1"]');
    }
    await page.click('.sheet .close-btn');
    await page.waitForSelector('.sheet', { state: 'detached' });
    m = await M(page);
    assert.equal(m.xp.total, xp0);
    assert.match(await page.textContent('#view-today .section-head'), /Giornata completa/);
  });

  await step('obiettivi: percorso in 5 fasi, fase attuale, traguardi da sbloccare', async () => {
    await page.click('.tab[data-tab="goals"]');
    await page.waitForSelector('#view-goals.active .phases');
    assert.equal(await page.locator('#view-goals .phase').count(), 5);
    assert.equal(await page.locator('#view-goals .phase.current').count(), 1);
    assert.match(await page.textContent('#view-goals .phase.current'), /Inizio/);
    assert.ok(await page.locator('#view-goals .next-ach').count());
    await page.click('#view-goals [data-action="new-habit"]');
    await page.waitForSelector('.dialog-wrap.show');
    assert.match(await page.textContent('.dialog-wrap'), /una cosa alla volta/i);
    await page.click('.dialog-wrap button');
    await page.waitForSelector('.dialog-wrap', { state: 'detached' });
    await page.waitForTimeout(500);
    await shot('02-obiettivi');
  });

  await step('progressi: costanza, calendario interattivo, storico', async () => {
    await page.click('.tab[data-tab="progress"]');
    await page.waitForSelector('#view-progress.active .consistency');
    const cons = await page.textContent('#view-progress .cons-ring');
    assert.match(cons, /\d+%|—/);
    assert.ok(await page.locator('#view-progress svg[aria-label="Orari a letto, ultime 4 settimane"] circle.pt').count() >= 2);
    assert.ok(await page.locator('#view-progress svg[aria-label="Minuti di lettura, ultime 4 settimane"] rect').count() >= 4);
    await page.waitForTimeout(800);
    await shot('03-progressi');
    await page.click('[data-action="progress-tab"][data-id="calendar"]');
    await page.waitForSelector('#view-progress .cal-grid');
    // giorni futuri e precedenti al percorso non modificabili
    assert.ok(await page.locator('#view-progress .cal-cell[disabled]').count() >= 20);
    await page.click('#view-progress .cal-cell[data-iso="2026-11-23"]');
    await page.waitForSelector('.sheet.show');
    await page.fill('.sheet input[type="time"]', '23:50');
    await page.locator('.sheet input[type="time"]').dispatchEvent('change');
    await page.click('.sheet [data-action="hours-step"][data-val="0.5"]');
    await page.click('.sheet [data-action="hours-step"][data-val="0.5"]');
    let st = (await M(page)).state.entries.sleep['2026-11-23'];
    assert.deepEqual(st, { ok: true, bed: '23:50', hours: 7.5 });
    await shot('05-scheda-giorno');
    assert.equal(await page.locator('.overlay').count(), 0); // nessuna interruzione mentre la scheda è aperta
    await page.click('.sheet .close-btn');
    await page.waitForSelector('.sheet', { state: 'detached' });
    // 4 notti su 4 e 4 letture su 4: la fase 1 è completata → schermata dedicata
    await page.waitForSelector('.overlay.show .ov-phase');
    assert.match(await page.textContent('.overlay.show'), /Fase 1 completata/);
    assert.match(await page.textContent('.overlay.show'), /Inizio/);
    await shot('12-fase-completata');
    await page.click('.overlay [data-action="ov-close"]');
    await page.waitForSelector('.overlay', { state: 'detached' });
    await shot('04-calendario');
    await page.click('[data-action="progress-tab"][data-id="history"]');
    assert.equal(await page.locator('#view-progress .hist').count(), 4);
  });

  await step('profilo: livello, 12 traguardi, preferenze (suoni disattivati di default)', async () => {
    await page.click('.tab[data-tab="profile"]');
    await page.waitForSelector('#view-profile.active .level-hero');
    assert.equal(await page.locator('#view-profile .ach-cell').count(), 12);
    const s = (await M(page)).state.settings;
    assert.equal(s.sound, false);
    assert.equal(s.haptics, true);
    await page.click('[data-action="toggle-motion"]');
    assert.equal(await page.evaluate(() => document.documentElement.classList.contains('reduce-motion')), true);
    await page.click('[data-action="toggle-motion"]');
    assert.equal(await page.evaluate(() => document.documentElement.classList.contains('reduce-motion')), false);
    await page.click('[data-action="open-reminders"]');
    await page.waitForSelector('.sheet.show .guide');
    assert.match(await page.textContent('.sheet'), /non può programmare notifiche locali/);
    await page.click('.sheet .close-btn');
    await page.waitForSelector('.sheet', { state: 'detached' });
    await shot('07-profilo');
  });

  let backupPath;
  await step('esportazione e importazione (anche di backup 1.x)', async () => {
    await page.evaluate(() => { navigator.canShare = () => false; });
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-action="export"]')]);
    assert.match(dl.suggestedFilename(), /^mezzanotte-backup-2026-11-25\.json$/);
    backupPath = path.join(www, 'backup.json');
    await dl.saveAs(backupPath);
    const data = JSON.parse(await readFile(backupPath, 'utf8'));
    assert.equal(data.version, 2);
    assert.equal(data.entries.sleep['2026-11-23'].bed, '23:50');
    assert.ok((await M(page)).state.meta.lastExport);
    // importa un backup 1.x
    const old = path.join(www, 'old.json');
    await writeFile(old, v1raw.replace('"min":20', '"min":21'));
    await page.setInputFiles('#import-file', old);
    await page.waitForSelector('.dialog-wrap.show');
    await page.click('.dialog-wrap .actions button.strong');
    await page.waitForFunction(() => window.__mezzanotte.state.entries.read['2026-11-24']?.min === 21);
    assert.ok(await page.evaluate(() => localStorage.getItem('mezzanotte:backup-prima-del-reset')));
    // file non valido: errore e dati invariati
    const bad = path.join(www, 'bad.json');
    await writeFile(bad, '{"ciao":1}');
    await page.setInputFiles('#import-file', bad);
    await page.waitForSelector('.dialog-wrap.show');
    assert.match(await page.textContent('.dialog-wrap.show'), /non è un backup/);
    await page.click('.dialog-wrap .actions button');
    // ripristina il backup 3.0
    await page.setInputFiles('#import-file', backupPath);
    await page.waitForSelector('.dialog-wrap.show .actions button.strong');
    await page.click('.dialog-wrap.show .actions button.strong');
    await page.waitForFunction(() => window.__mezzanotte.state.entries.sleep['2026-11-23']?.bed === '23:50');
    assert.equal((await M(page)).state.entries.read['2026-11-24'].min, 20);
  });

  await step('funzionamento offline', async () => {
    await ctx.setOffline(true);
    await page.reload();
    await page.waitForSelector('#view-today.active .habit');
    await page.click('.tab[data-tab="progress"]');
    await page.click('.tab[data-tab="today"]');
    const before = (await M(page)).state.entries.read['2026-11-25'].min;
    await page.click('#view-today [data-card="read"] [data-action="open-day"].h-act');
    await page.click('.sheet [data-action="min-add"][data-val="5"]');
    await page.waitForFunction((b) => window.__mezzanotte.state.entries.read['2026-11-25'].min === b + 5, before);
    await page.click('.sheet .close-btn');
    await ctx.setOffline(false);
  });

  await step('sabato sera libero: non conta e non interrompe la serie', async () => {
    const p2 = await ctx.newPage();
    watch(p2);
    await p2.clock.install({ time: new Date('2026-11-28T20:00:00+01:00') });
    await p2.goto(BASE);
    await p2.waitForSelector('#view-today.active [data-card="sleep"]');
    assert.equal(await p2.getAttribute('#view-today [data-card="sleep"]', 'data-status'), 'free');
    assert.match(await p2.textContent('#view-today [data-card="sleep"]'), /Libera/);
    assert.equal(await p2.locator('#view-today [data-card="sleep"] .check').count(), 0);
    await shot('09-sabato', p2);
    await p2.close();
  });

  await step('mezzanotte e cambio di giorno: la notte resta di ieri fino alle 5:00', async () => {
    const p3 = await ctx.newPage();
    watch(p3);
    await p3.clock.install({ time: new Date('2026-11-26T23:58:00+01:00') });
    await p3.goto(BASE);
    await p3.waitForSelector('#view-today.active [data-card="sleep"]');
    assert.match(await p3.textContent('#view-today .eyebrow'), /26 novembre/i);
    await p3.clock.fastForward('04:00'); // 00:02
    await p3.waitForTimeout(1200);
    assert.match(await p3.textContent('#view-today .eyebrow'), /26 novembre/i);
    assert.match(await p3.textContent('#view-today [data-card="sleep"]'), /Mezzanotte è passata/);
    await p3.clock.fastForward('05:00:00'); // 05:02 → nuovo giorno
    await p3.waitForFunction(() => /27 novembre/i.test(document.querySelector('#view-today .eyebrow').textContent));
    // al mattino la scheda del sonno chiede della notte appena passata
    assert.match(await p3.textContent('#view-today [data-card="sleep"]'), /ieri sera/);
    await p3.click('#view-today [data-card="sleep"] .check');
    await p3.waitForFunction(() => window.__mezzanotte.state.entries.sleep['2026-11-26']?.ok === true);
    assert.equal(await p3.evaluate(() => window.__mezzanotte.state.entries.sleep['2026-11-26'].bed), undefined);
    await p3.close();
  });

  await step('rientro dopo alcuni giorni: messaggio positivo e recupero', async () => {
    const p4 = await ctx.newPage();
    watch(p4);
    await p4.clock.install({ time: new Date('2026-12-02T09:00:00+01:00') });
    await p4.goto(BASE);
    await p4.waitForSelector('#view-today.active .welcome-back');
    const txt = await p4.textContent('#view-today .insight');
    assert.match(txt, /Bentornato/);
    assert.match(txt, /XP/);
    const all = await p4.textContent('#view-today');
    assert.doesNotMatch(all, /perso|fallit|peccato|purtroppo/i);
    // le abitudini restano visibili senza scorrere anche al rientro
    const tabTop = await p4.evaluate(() => document.querySelector('.tabbar').getBoundingClientRect().top);
    const box = await p4.locator('#view-today [data-card="read"] .check').boundingBox();
    assert.ok(box.y + box.height < tabTop);
    await shot('10-bentornato', p4);
    await p4.click('[data-action="open-catchup"]');
    await p4.waitForSelector('.sheet.show .cu-row');
    await p4.click('.sheet .cu-row [data-action="catchup-read"][data-iso="2026-11-30"]');
    await p4.waitForFunction(() => window.__mezzanotte.state.entries.read['2026-11-30']?.min === 5);
    await p4.click('.sheet [data-action="catchup-done"]');
    await p4.waitForSelector('.sheet', { state: 'detached' });
    assert.equal(await p4.locator('#view-today .welcome-back').count(), 0);
    await p4.close();
  });

  await step('fine del percorso: bilancio, nuovo percorso senza perdere lo storico, nuova abitudine', async () => {
    const p7 = await ctx.newPage();
    watch(p7);
    await p7.clock.install({ time: new Date('2026-12-23T19:00:00+01:00') });
    await p7.goto(BASE);
    // eventuali celebrazioni prima del bilancio
    for (let i = 0; i < 6 && !(await p7.locator('.sheet.show[data-type="summary"]').count()); i++) {
      if (await p7.locator('.overlay.show [data-action="ov-close"]').count()) await p7.click('.overlay.show [data-action="ov-close"]');
      await p7.waitForTimeout(700);
    }
    await p7.waitForSelector('.sheet.show[data-type="summary"]');
    const sum = await p7.textContent('.sheet');
    assert.match(sum, /Bilancio del percorso 1/);
    assert.match(sum, /Notti in orario/);
    assert.match(sum, /Minuti di lettura/);
    assert.match(sum, /Prossimo percorso/);
    await shot('13-bilancio', p7);
    const before = await M(p7);
    await p7.click('.sheet [data-action="start-next"]');
    await p7.waitForSelector('.dialog-wrap.show');
    await p7.click('.dialog-wrap .actions button.strong');
    await p7.waitForFunction(() => window.__mezzanotte.state.journeys.length === 2);
    const after = await M(p7);
    assert.equal(after.state.journeys[1].start, '2026-12-23');
    assert.deepEqual(after.state.entries, before.state.entries);
    assert.ok(after.xp.total >= before.xp.total);
    assert.match(await p7.textContent('#view-today .large-title'), /Giorno 1/);
    // nuova abitudine, ora sbloccata
    await p7.click('.tab[data-tab="goals"]');
    await p7.click('#view-goals [data-action="new-habit"]');
    await p7.waitForSelector('.sheet.show #nh-name');
    await p7.fill('#nh-name', 'Allenamento');
    await p7.click('.sheet [data-action="draft-step"][data-k="perWeek"][data-val="-1"]');
    await p7.click('.sheet [data-action="create-habit"]');
    await p7.waitForFunction(() => window.__mezzanotte.state.habits.length === 3);
    const h = (await M(p7)).state.habits[2];
    assert.equal(h.id, 'allenamento');
    assert.equal(h.config.perWeek, 3);
    await p7.click('.tab[data-tab="today"]');
    await p7.click('#view-today [data-card="allenamento"] .check');
    await p7.waitForFunction(() => window.__mezzanotte.state.entries.allenamento['2026-12-23']?.done === true);
    await p7.close();
  });

  await step('passaggio di livello: schermata speciale, chiudibile subito', async () => {
    const c2 = await browser.newContext(IPHONE);
    const p5 = await c2.newPage();
    watch(p5);
    await p5.clock.install({ time: new Date('2026-11-25T18:00:00+01:00') });
    const raw = JSON.parse(await readFile(backupPath, 'utf8'));
    raw.meta.seen.level = 1;
    raw.meta.seen.achievements = [];
    await p5.addInitScript((s) => localStorage.setItem('mezzanotte:v2', s), JSON.stringify(raw));
    await p5.goto(BASE);
    await p5.waitForSelector('.overlay.show .ov-ring');
    assert.match(await p5.textContent('.overlay.show'), /Livello\s*2/);
    assert.match(await p5.textContent('.overlay.show'), /Costruttore/);
    await shot('08-livello', p5);
    await p5.click('.overlay [data-action="ov-close"]');
    await p5.waitForSelector('.ach-toast.show');
    await c2.close();
  });

  await step('nuovo utente: onboarding e primo percorso', async () => {
    const c3 = await browser.newContext({ ...IPHONE, reducedMotion: 'reduce' });
    const p6 = await c3.newPage();
    watch(p6);
    await p6.clock.install({ time: new Date('2026-11-25T08:00:00+01:00') });
    await p6.goto(BASE);
    await p6.waitForSelector('#onboarding');
    await shot('11-onboarding', p6);
    await p6.click('[data-action="start"]');
    await p6.waitForSelector('#view-today.active .habit');
    assert.equal(await p6.evaluate(() => document.documentElement.classList.contains('reduce-motion')), true);
    assert.equal(await p6.locator('.overlay').count(), 0); // nessun benvenuto per chi è appena arrivato
    assert.match(await p6.textContent('#view-today .large-title'), /Giorno 1/);
    // completamento con un tocco, poi "Annulla"
    await p6.click('#view-today [data-card="read"] .check');
    await p6.waitForFunction(() => window.__mezzanotte.state.entries.read['2026-11-25']?.min === 5);
    assert.equal((await M(p6)).xp.total, 20);
    await p6.click('.toast.show button');
    await p6.waitForFunction(() => !window.__mezzanotte.state.entries.read['2026-11-25']);
    assert.equal((await M(p6)).xp.total, 0);
    // di nuovo: +20 XP e il primo traguardo
    await p6.click('#view-today [data-card="read"] .check');
    await p6.waitForSelector('.ach-toast.show');
    assert.equal((await M(p6)).xp.total, 20);
    assert.match(await p6.textContent('.ach-toast'), /Primo passo/);
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
