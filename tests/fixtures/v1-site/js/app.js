// MEZZANOTTE — interfaccia
import * as C from './core.js';

const VERSION = '1.0.0';
const STORAGE_KEY = 'mezzanotte:v1';
const TIMER_KEY = 'mezzanotte:timer';
const HINT_KEY = 'mezzanotte:hide-install-hint';

const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const plural = (n, one, many) => (n === 1 ? one : many);

// ---------- Icone (stile SF Symbols) ----------
const I = {
  moon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20.3 14.6A8.6 8.6 0 0 1 9.4 3.7a.7.7 0 0 0-.9-.9A9.9 9.9 0 1 0 21.2 15.5a.7.7 0 0 0-.9-.9Z"/></svg>',
  book: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 6.5C10.3 5 7.9 4.3 4 4.5v13c3.9-.2 6.3.5 8 2 1.7-1.5 4.1-2.2 8-2v-13c-3.9-.2-6.3.5-8 2Z"/><path d="M12 6.5v13"/></svg>',
  today: '<svg viewBox="0 0 28 28" fill="none" stroke="currentColor" stroke-width="2"><circle cx="14" cy="14" r="10.5"/><path d="M14 8v6l4 2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  cal: '<svg viewBox="0 0 28 28" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="4" y="5.5" width="20" height="18" rx="4.5"/><path d="M4 11h20M9.5 3.5v4M18.5 3.5v4"/><circle cx="10" cy="16" r="1.2" fill="currentColor" stroke="none"/><circle cx="14" cy="16" r="1.2" fill="currentColor" stroke="none"/><circle cx="18" cy="16" r="1.2" fill="currentColor" stroke="none"/></svg>',
  chart: '<svg viewBox="0 0 28 28" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 22V14M11.3 22V7M16.6 22v-10M22 22V4"/></svg>',
  gear: '<svg viewBox="0 0 28 28" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3.5l2 2.6 3.2-.6.9 3.1 3 1.4-.9 3.1 1.9 2.6-2.6 2 .1 3.2-3.2.4-1.4 2.9-3-1.2-3 1.2-1.4-2.9-3.2-.4.1-3.2-2.6-2 1.9-2.6-.9-3.1 3-1.4.9-3.1 3.2.6Z"/><circle cx="14" cy="14" r="3.6"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  minus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M5 12h14"/></svg>',
  chev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg>',
  share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M7.5 7.5L12 3l4.5 4.5"/><path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1"/></svg>',
  play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13a1 1 0 0 0 1.5.9l10-6.5a1 1 0 0 0 0-1.8l-10-6.5A1 1 0 0 0 8 5.5Z"/></svg>',
  stop: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2.5"/></svg>',
  flame: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.5c.4 3-1.6 4.8-3.2 6.6C7.3 10.8 6 12.5 6 15a6 6 0 0 0 12 0c0-2.2-1-4.1-2.3-5.4-.2 1.4-.9 2.5-2 3 .4-3.3-.5-7.4-1.7-10.1Z"/></svg>',
  star: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6L3.3 9.3l6.1-.7Z"/></svg>',
  download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M5 20h14"/></svg>',
};

// ---------- Persistenza ----------
const idb = {
  open() {
    return new Promise((res, rej) => {
      if (!('indexedDB' in window)) return rej(new Error('no idb'));
      const r = indexedDB.open('mezzanotte', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('kv');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  },
  async set(key, val) {
    try {
      const db = await this.open();
      await new Promise((res, rej) => {
        const tx = db.transaction('kv', 'readwrite');
        tx.objectStore('kv').put(val, key);
        tx.oncomplete = res;
        tx.onerror = () => rej(tx.error);
      });
      db.close();
    } catch { /* copia di sicurezza non disponibile */ }
  },
  async get(key) {
    try {
      const db = await this.open();
      const val = await new Promise((res, rej) => {
        const tx = db.transaction('kv', 'readonly');
        const g = tx.objectStore('kv').get(key);
        g.onsuccess = () => res(g.result);
        g.onerror = () => rej(g.error);
      });
      db.close();
      return val;
    } catch {
      return undefined;
    }
  },
};

function readLocal() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? C.validateState(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

async function loadState() {
  let s = readLocal();
  if (!s) {
    const backup = await idb.get(STORAGE_KEY);
    if (backup) {
      try { s = C.validateState(JSON.parse(backup)); } catch { s = null; }
    }
  }
  return s || C.createState(null);
}

function save() {
  const json = JSON.stringify(state);
  try { localStorage.setItem(STORAGE_KEY, json); } catch { toast('Spazio di archiviazione pieno'); }
  idb.set(STORAGE_KEY, json);
}

// ---------- Stato UI ----------
let state = C.createState(null);
let tab = 'today';
let today = C.logicalToday();
let sheetIso = null;
const animMemory = new Map();

const isStandalone = () => window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

function getTimer() {
  try { return JSON.parse(localStorage.getItem(TIMER_KEY) || 'null'); } catch { return null; }
}
function setTimer(t) {
  try {
    if (t) localStorage.setItem(TIMER_KEY, JSON.stringify(t));
    else localStorage.removeItem(TIMER_KEY);
  } catch { /* ignora */ }
}

function update(iso, patch, sourceEl) {
  const before = state.start ? C.computeStats(state, today) : null;
  const prevInfo = C.dayInfo(state, iso, today);
  state = C.setEntry(state, iso, patch);
  save();
  const info = C.dayInfo(state, iso, today);
  if (sourceEl) {
    if (info.read === 'done' && prevInfo.read !== 'done') burst(sourceEl, '#34d399');
    if (info.sleep === 'done' && prevInfo.sleep !== 'done') burst(sourceEl, '#a78bfa');
  }
  if (before) {
    const after = C.computeStats(state, today);
    after.blocks.forEach((b, i) => {
      if (b.achieved && !before.blocks[i].achieved) toast(`${b.label}: obiettivo raggiunto!`, I.star);
    });
  }
  render();
}

// ---------- Componenti ----------
function ring(id, size, stroke, pct, color) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const to = c * (1 - Math.min(1, Math.max(0, pct)));
  const from = animMemory.has(id) ? animMemory.get(id) : c;
  return `<circle class="ring-track" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke-width="${stroke}"/>
    <circle class="ring-bar" data-anim="${id}" data-to="${to}" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none"
      stroke="${color}" stroke-width="${stroke}" stroke-dasharray="${c}" style="stroke-dashoffset:${from}"
      transform="rotate(-90 ${size / 2} ${size / 2})"/>`;
}

function bar(id, pct, color) {
  const to = Math.round(Math.min(1, Math.max(0, pct)) * 1000) / 10;
  const from = animMemory.has(id) ? animMemory.get(id) : 0;
  return `<div class="bar"><i class="${color}" data-anim="${id}" data-to="${to}" data-kind="width" style="width:${from}%"></i></div>`;
}

function runAnimations(root = document) {
  const els = root.querySelectorAll('[data-anim]');
  if (!els.length) return;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    els.forEach((el) => {
      const to = Number(el.dataset.to);
      if (el.dataset.kind === 'width') el.style.width = `${to}%`;
      else el.style.strokeDashoffset = to;
      animMemory.set(el.dataset.anim, to);
    });
  }));
}

function pill(status, kind) {
  const map = {
    done: kind === 'sleep' ? ['done violet', 'Fatto'] : ['done', 'Fatto'],
    missed: ['missed', 'Mancato'],
    pending: ['pending', 'Da fare'],
    free: ['free', 'Libero'],
    future: ['pending', 'In arrivo'],
  };
  const [cls, label] = map[status];
  return `<span class="status-pill ${cls}">${label}</span>`;
}

function sleepCard(iso, { title }) {
  const info = C.dayInfo(state, iso, today);
  const e = state.days[iso] || {};
  const yes = e.sleep === true;
  const no = e.sleep === false;
  const freeNote = info.saturday
    ? `<div class="note-free">Sabato sera libero: questa notte non conta per la sfida. Puoi comunque annotare l'orario.</div>`
    : '';
  return `<section class="card" data-card="sleep">
    <div class="card-title"><span class="icon-badge violet">${I.moon}</span>${title}${pill(info.sleep, 'sleep')}</div>
    ${freeNote}
    <div class="segmented" role="group" aria-label="A letto entro mezzanotte?">
      <button class="${yes ? 'on-yes' : ''}" data-action="sleep" data-iso="${iso}" data-val="1" aria-pressed="${yes}">Entro mezzanotte</button>
      <button class="${no ? 'on-no' : ''}" data-action="sleep" data-iso="${iso}" data-val="0" aria-pressed="${no}">Più tardi</button>
    </div>
    <div class="time-row">
      <label for="bed-${iso}">Orario a letto</label>
      <div style="display:flex;align-items:center;gap:6px">
        ${e.bed ? `<button class="time-clear" data-action="clear-bed" data-iso="${iso}">Rimuovi</button>` : ''}
        <input class="time-input" id="bed-${iso}" type="time" value="${e.bed || ''}" data-change="bed" data-iso="${iso}" aria-label="Orario a letto">
      </div>
    </div>
  </section>`;
}

function readCard(iso, { title, withTimer }) {
  const info = C.dayInfo(state, iso, today);
  const min = info.min;
  const timer = getTimer();
  const running = timer && timer.iso === iso;
  const book = state.settings.book ? `<div class="small muted" style="margin:-4px 0 12px">📖 ${esc(state.settings.book)}</div>` : '';
  const timerHtml = withTimer
    ? running
      ? `<div class="timer-box"><span class="pulse"></span><div><div class="t" data-timer>00:00</div><div class="small muted">Lettura in corso</div></div>
          <button class="btn btn-green" data-action="timer-stop" data-iso="${iso}">${I.stop} Fine</button></div>`
      : `<button class="btn btn-ghost" style="margin-top:14px" data-action="timer-start" data-iso="${iso}">${I.play} Avvia timer di lettura</button>`
    : '';
  return `<section class="card" data-card="read">
    <div class="card-title"><span class="icon-badge green">${I.book}</span>${title}${pill(info.read, 'read')}</div>
    ${book}
    <div class="stepper">
      <button class="round-btn" data-action="min-step" data-iso="${iso}" data-val="-5" aria-label="Togli 5 minuti">${I.minus}</button>
      <div class="minutes"><div class="big-num" style="color:${min >= C.READ_GOAL_MIN ? 'var(--green)' : 'var(--text)'}">${min}<small>min</small></div>
        <div class="goal">${min >= C.READ_GOAL_MIN ? 'Obiettivo raggiunto' : `Obiettivo: ${C.READ_GOAL_MIN} minuti`}</div></div>
      <button class="round-btn" data-action="min-step" data-iso="${iso}" data-val="5" aria-label="Aggiungi 5 minuti">${I.plus}</button>
    </div>
    <div class="quick">
      ${[5, 10, 15, 30].map((m) => `<button data-action="min-add" data-iso="${iso}" data-val="${m}">+${m}</button>`).join('')}
    </div>
    ${timerHtml}
  </section>`;
}

function weekGoalsCard(stats) {
  const idx = C.diffDays(state.start, today);
  const block = stats.blocks.find((b) => idx >= b.from && idx <= b.to);
  if (!block) return '';
  return `<section class="card">
    <div class="card-title">${block.label} · Obiettivi<span class="right muted">${C.formatDateShort(block.first)} – ${C.formatDateShort(block.last)}</span></div>
    <div class="bar-row"><div class="top"><span>🌙 A letto entro mezzanotte</span><span>${block.sleepDone}/${block.sleepTarget}</span></div>
      ${bar('wk-sleep', block.sleepDone / block.sleepTarget, 'violet')}</div>
    <div class="bar-row" style="margin-top:14px"><div class="top"><span>📖 Lettura ≥ ${C.READ_GOAL_MIN} min</span><span>${block.readDone}/${block.readTarget}</span></div>
      ${bar('wk-read', block.readDone / block.readTarget, 'green')}</div>
    ${block.achieved ? `<p class="small" style="margin:14px 0 0;color:var(--green);font-weight:600">✓ Obiettivi della settimana raggiunti</p>` : ''}
  </section>`;
}

// ---------- Viste ----------
function headerHtml(eyebrow, title, right = '') {
  return `<header class="header"><div class="header-row"><div><div class="eyebrow">${eyebrow}</div><h1 class="large-title">${title}</h1></div>${right}</div></header>`;
}

function countdownText(now = new Date()) {
  if (now.getHours() < C.DAY_CUTOFF_HOUR) return { big: 'È tardi', label: 'Mezzanotte è passata: spegni tutto e vai a dormire.' };
  const m = C.minutesToMidnight(now);
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return { big: h ? `${h} h ${String(mm).padStart(2, '0')} min` : `${mm} min`, label: 'a mezzanotte' };
}

function viewToday() {
  if (!state.start) return '';
  const stats = C.computeStats(state, today);
  const eyebrow = cap(C.formatDateLong(today));
  const installHint = !isStandalone() && !localStorage.getItem(HINT_KEY)
    ? `<div class="banner"><div class="txt"><b>Installa MEZZANOTTE</b>Aggiungila alla schermata Home per usarla a schermo intero e offline.</div>
        <div class="act"><button class="yes" data-action="install-help">Come</button><button class="no" data-action="hide-hint" aria-label="Chiudi">✕</button></div></div>`
    : '';

  if (!stats.started) {
    const n = C.diffDays(today, state.start);
    return `${headerHtml(eyebrow, 'Oggi')}${installHint}
      <section class="card finished-card"><div class="trophy">🌙</div>
        <h2 style="margin:0 0 6px">La sfida inizia ${n === 1 ? 'domani' : `tra ${n} giorni`}</h2>
        <p class="muted" style="margin:0">Primo giorno: ${C.formatDateLong(state.start)}.</p></section>`;
  }

  if (stats.finished) {
    const blocks = stats.blocks.filter((b) => b.achieved).length;
    return `${headerHtml(eyebrow, 'Sfida completata')}
      <section class="card finished-card"><div class="trophy">🏆</div>
        <h2 style="margin:0 0 6px">30 giorni completati</h2>
        <p class="muted" style="margin:0 0 18px">Obiettivi raggiunti in ${blocks} ${plural(blocks, 'blocco', 'blocchi')} su ${stats.blocks.length}. Completamento totale ${stats.overallRate}%.</p>
        <div class="split" style="text-align:left"><div><b>${stats.sleepDone}</b><span>${plural(stats.sleepDone, 'notte', 'notti')} entro mezzanotte</span></div><div><b>${stats.totalMin}</b><span>minuti di lettura</span></div></div>
        <button class="btn btn-primary" style="margin-top:18px" data-action="new-challenge">Inizia una nuova sfida</button>
        <button class="btn btn-ghost" data-action="goto" data-tab="stats">Vedi le statistiche</button>
      </section>`;
  }

  const idx = C.diffDays(state.start, today);
  const block = C.blockProgress(state, C.blockForIndex(idx), today);
  const cd = countdownText();
  const sat = C.isSaturday(today);
  const yesterday = C.addDays(today, -1);
  const ySleep = yesterday >= state.start ? C.sleepStatus(state, yesterday, today) : null;
  const yesterdayBanner = ySleep === 'pending'
    ? `<div class="banner"><div class="txt"><b>Ieri sera</b>A letto entro mezzanotte?</div>
        <div class="act"><button class="yes" data-action="sleep" data-iso="${yesterday}" data-val="1">Sì</button>
        <button class="no" data-action="sleep" data-iso="${yesterday}" data-val="0">No</button>
        <button class="no" data-action="open-day" data-iso="${yesterday}">Ora</button></div></div>`
    : '';

  const heroText = sat
    ? `<div class="countdown" style="color:var(--amber)">Sabato</div><div class="label">Stasera niente vincolo del sonno. Non dimenticare la lettura.</div>`
    : `<div class="countdown" data-countdown>${cd.big}</div><div class="label" data-countdown-label>${cd.label}</div>`;

  return `${headerHtml(eyebrow, 'Oggi', `<span class="chip"><span class="dot"></span>Giorno ${stats.dayNum}/30</span>`)}
    ${installHint}${yesterdayBanner}
    <section class="card hero">
      <div class="hero-rings">
        <svg viewBox="0 0 128 128" width="128" height="128">
          <defs>
            <linearGradient id="gV" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#c4b5fd"/><stop offset="1" stop-color="#7c3aed"/></linearGradient>
            <linearGradient id="gG" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6ee7b7"/><stop offset="1" stop-color="#059669"/></linearGradient>
          </defs>
          ${ring('hero-s', 128, 12, block.sleepDone / block.sleepTarget, 'url(#gV)')}
          <g transform="translate(16 16)">${ring('hero-r', 96, 12, block.readDone / block.readTarget, 'url(#gG)')}</g>
        </svg>
        <div class="center"><div><b>${stats.dayNum}</b><span>di 30</span></div></div>
      </div>
      <div class="hero-text">${heroText}
        <div class="legend"><span><i style="background:var(--violet)"></i>Sonno ${block.sleepDone}/${block.sleepTarget}</span><span><i style="background:var(--green)"></i>Lettura ${block.readDone}/${block.readTarget}</span></div>
      </div>
    </section>
    ${sleepCard(today, { title: sat ? 'Sabato sera' : 'Stanotte' })}
    ${readCard(today, { title: 'Lettura di oggi', withTimer: true })}
    ${weekGoalsCard(stats)}
    <div class="tiles">
      <div class="tile violet"><div class="k">${I.flame.replace('<svg', '<svg width="13" height="13"')} Serie sonno</div><div class="v">${stats.sleepStreak.current}<small>${plural(stats.sleepStreak.current, 'notte', 'notti')}</small></div><div class="s">Record ${stats.sleepStreak.best}</div></div>
      <div class="tile green"><div class="k">${I.flame.replace('<svg', '<svg width="13" height="13"')} Serie lettura</div><div class="v">${stats.readStreak.current}<small>${plural(stats.readStreak.current, 'giorno', 'giorni')}</small></div><div class="s">Record ${stats.readStreak.best}</div></div>
    </div>`;
}

function viewCalendar() {
  if (!state.start) return '';
  const stats = C.computeStats(state, today);
  const legend = `<div class="cal-legend">
    <span><i style="background:var(--violet)"></i>Sonno</span><span><i style="background:var(--green)"></i>Lettura</span>
    <span><i style="background:rgba(255,107,107,.6)"></i>Mancato</span><span><i style="border:1.5px solid var(--amber)"></i>Sabato libero</span></div>`;
  const blocks = stats.blocks.map((b) => {
    const cells = [];
    for (let i = b.from; i <= b.to; i++) {
      const iso = C.addDays(state.start, i);
      const info = C.dayInfo(state, iso, today);
      const d = C.parseISO(iso);
      const sCls = info.sleep === 'done' ? 's-done' : info.sleep === 'missed' ? 'missed' : info.sleep === 'free' ? 'free' : '';
      const rCls = info.read === 'done' ? 'r-done' : info.read === 'missed' ? 'missed' : '';
      const cls = ['day-cell', iso === today ? 'today' : '', info.sleep === 'future' ? 'future' : '', info.perfect ? 'perfect' : ''].join(' ');
      cells.push(`<button class="${cls}" ${info.sleep === 'future' ? 'disabled' : `data-action="open-day" data-iso="${iso}"`} aria-label="Giorno ${i + 1}, ${C.formatDateLong(iso)}">
        <span class="wd">${C.WEEKDAYS_SHORT[d.getDay()]}</span><span class="dn">${d.getDate()}</span>
        <span class="marks"><i class="${sCls}"></i><i class="${rCls}"></i></span></button>`);
    }
    const tag = (ok, cls, done, target, icon) => `<span class="goal-tag ${ok ? `ok ${cls}` : ''}">${icon} ${done}/${target}</span>`;
    return `<section class="card week-block">
      <div class="week-head"><h3>${b.label}</h3><div class="goals">${tag(b.sleepOk, 'v', b.sleepDone, b.sleepTarget, '🌙')}${tag(b.readOk, 'g', b.readDone, b.readTarget, '📖')}</div></div>
      <div class="days-grid">${cells.join('')}</div></section>`;
  });
  return `${headerHtml(`${C.formatDateShort(state.start)} – ${C.formatDateShort(C.endDate(state.start))}`, 'Calendario')}${legend}${blocks.join('')}`;
}

function bedChart() {
  const dates = C.challengeDates(state.start);
  const W = 320, H = 170, L = 38, R = 8, T = 10, B = 22;
  const minOff = -180, maxOff = 120; // 21:00 → 02:00
  const x = (i) => L + (i / (dates.length - 1)) * (W - L - R);
  const y = (off) => T + ((Math.min(maxOff, Math.max(minOff, off)) - minOff) / (maxOff - minOff)) * (H - T - B);
  const pts = dates.map((d, i) => ({ i, d, bed: state.days[d]?.bed })).filter((p) => p.bed && p.d <= today);
  if (!pts.length) return '<div class="chart-empty">Registra l\'orario in cui vai a letto per vedere il grafico.</div>';
  const grid = [-120, -60, 0, 60].map((o) => `<line x1="${L}" x2="${W - R}" y1="${y(o)}" y2="${y(o)}" stroke="${o === 0 ? 'rgba(167,139,250,.55)' : 'rgba(255,255,255,.06)'}" ${o === 0 ? 'stroke-dasharray="4 4"' : ''}/>
    <text class="chart-label" x="${L - 6}" y="${y(o) + 3}" text-anchor="end" ${o === 0 ? 'style="fill:var(--violet)"' : ''}>${C.offsetToTime(o)}</text>`).join('');
  let path = '';
  pts.forEach((p, k) => {
    const prev = pts[k - 1];
    path += `${prev && prev.i === p.i - 1 ? 'L' : 'M'}${x(p.i).toFixed(1)} ${y(C.bedtimeOffset(p.bed)).toFixed(1)} `;
  });
  const dots = pts.map((p) => {
    const ok = C.bedtimeOnTime(p.bed);
    const sat = C.isSaturday(p.d);
    const color = sat ? '#fbbf24' : ok ? '#a78bfa' : '#ff6b6b';
    return `<circle cx="${x(p.i)}" cy="${y(C.bedtimeOffset(p.bed))}" r="3.6" fill="${color}" stroke="#15151c" stroke-width="1.5"/>`;
  }).join('');
  const xl = [0, 7, 14, 21, 29].map((i) => `<text class="chart-label" x="${x(i)}" y="${H - 6}" text-anchor="middle">G${i + 1}</text>`).join('');
  return `<div class="chart-wrap"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Orari di sonno">
    <defs><linearGradient id="bedLine" x1="0" x2="1"><stop offset="0" stop-color="#7c3aed"/><stop offset="1" stop-color="#c4b5fd"/></linearGradient></defs>
    ${grid}<path d="${path}" fill="none" stroke="url(#bedLine)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" opacity=".8"/>${dots}${xl}</svg></div>`;
}

function readChart() {
  const dates = C.challengeDates(state.start);
  const W = 320, H = 150, L = 30, R = 8, T = 10, B = 22;
  const mins = dates.map((d) => state.days[d]?.min || 0);
  if (!mins.some((m) => m > 0)) return '<div class="chart-empty">I minuti di lettura appariranno qui.</div>';
  const maxV = Math.max(30, Math.ceil(Math.max(...mins) / 15) * 15);
  const bw = (W - L - R) / dates.length;
  const y = (v) => T + (1 - v / maxV) * (H - T - B);
  const ticks = [0, maxV / 2, maxV].map((v) => `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="rgba(255,255,255,.06)"/><text class="chart-label" x="${L - 6}" y="${y(v) + 3}" text-anchor="end">${Math.round(v)}</text>`).join('');
  const goal = `<line x1="${L}" x2="${W - R}" y1="${y(C.READ_GOAL_MIN)}" y2="${y(C.READ_GOAL_MIN)}" stroke="rgba(52,211,153,.5)" stroke-dasharray="3 4"/>`;
  const bars = mins.map((m, i) => {
    if (!m) return '';
    const h = Math.max(2, H - B - y(m));
    return `<rect x="${(L + i * bw + bw * 0.18).toFixed(1)}" y="${y(m).toFixed(1)}" width="${(bw * 0.64).toFixed(1)}" height="${h.toFixed(1)}" rx="2" fill="${m >= C.READ_GOAL_MIN ? 'url(#readBar)' : 'rgba(255,255,255,.18)'}"/>`;
  }).join('');
  const xl = [0, 7, 14, 21, 29].map((i) => `<text class="chart-label" x="${L + i * bw + bw / 2}" y="${H - 6}" text-anchor="middle">G${i + 1}</text>`).join('');
  return `<div class="chart-wrap"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Minuti di lettura">
    <defs><linearGradient id="readBar" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6ee7b7"/><stop offset="1" stop-color="#059669"/></linearGradient></defs>
    ${ticks}${goal}${bars}${xl}</svg></div>`;
}

function viewStats() {
  if (!state.start) return '';
  const s = C.computeStats(state, today);
  const weekRows = s.blocks.map((b) => {
    const m = (ok, possible) => {
      if (ok) return `<span class="medal ok">${I.check}</span>`;
      if (b.phase === 'past' || !possible) return `<span class="medal fail">${I.x}</span>`;
      return `<span class="medal">${I.star}</span>`;
    };
    const status = b.phase === 'future' ? 'In arrivo' : b.phase === 'current' ? 'In corso' : b.achieved ? 'Completata' : 'Conclusa';
    return `<div class="week-goal"><div><div class="name">${b.label}</div>
      <div class="sub">${status} · 🌙 ${b.sleepDone}/${b.sleepTarget} · 📖 ${b.readDone}/${b.readTarget}</div></div>
      <div class="badges">${m(b.sleepOk, b.sleepPossible)}${m(b.readOk, b.readPossible)}</div></div>`;
  }).join('');

  const history = C.challengeDates(state.start).filter((d) => d <= today).reverse().map((d) => {
    const info = C.dayInfo(state, d, today);
    const bedCls = info.saturday ? 'dim' : info.sleep === 'done' ? 'v' : info.sleep === 'missed' ? 'bad' : 'dim';
    const bedTxt = info.bed || (info.sleep === 'done' ? '✓' : info.sleep === 'missed' ? '✕' : info.saturday ? 'Libero' : '—');
    const minCls = info.read === 'done' ? 'g' : info.min ? 'bad' : 'dim';
    return `<li data-action="open-day" data-iso="${d}"><div class="d"><b>Giorno ${info.num}</b><span>${cap(C.formatDateShort(d))}${info.perfect ? ' · ⭐ perfetto' : ''}</span></div>
      <div class="val ${bedCls}">🌙 ${bedTxt}</div><div class="val ${minCls}">📖 ${info.min} min</div></li>`;
  }).join('');

  return `${headerHtml(s.finished ? 'Sfida conclusa' : `Giorno ${s.dayNum ?? '—'} di 30`, 'Statistiche')}
    <section class="card">
      <div class="overview">
        <div class="hero-rings" style="width:104px;height:104px">
          <svg viewBox="0 0 104 104" width="104" height="104">
            <defs><linearGradient id="gMix" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#a78bfa"/><stop offset="1" stop-color="#34d399"/></linearGradient></defs>
            ${ring('st-all', 104, 11, s.overallRate / 100, 'url(#gMix)')}
          </svg>
          <div class="center"><div><b style="font-size:22px">${s.perfectDays}</b><span>perfetti</span></div></div>
        </div>
        <div><div class="pct">${s.overallRate}<small>%</small></div><div class="muted small">completamento dei giorni registrati</div></div>
      </div>
      <div class="split">
        <div><b style="color:var(--violet)">${s.sleepRate}%</b><span>Sonno · ${s.sleepDone}/${s.sleepCounted} ${plural(s.sleepCounted, 'notte', 'notti')}</span></div>
        <div><b style="color:var(--green)">${s.readRate}%</b><span>Lettura · ${s.readDone}/${s.readCounted} ${plural(s.readCounted, 'giorno', 'giorni')}</span></div>
      </div>
      <div class="bar-row" style="margin-top:16px"><div class="top"><span>Avanzamento sfida</span><span>${s.challengeProgress}%</span></div>${bar('st-prog', s.challengeProgress / 100, 'violet')}</div>
    </section>

    <div class="tiles">
      <div class="tile violet"><div class="k">Serie sonno</div><div class="v">${s.sleepStreak.current}<small>${plural(s.sleepStreak.current, 'notte', 'notti')}</small></div><div class="s">Migliore: ${s.sleepStreak.best}</div></div>
      <div class="tile green"><div class="k">Serie lettura</div><div class="v">${s.readStreak.current}<small>${plural(s.readStreak.current, 'giorno', 'giorni')}</small></div><div class="s">Migliore: ${s.readStreak.best}</div></div>
      <div class="tile"><div class="k">Giorni perfetti</div><div class="v">${s.perfectDays}</div><div class="s">Serie migliore: ${s.perfectStreak.best}</div></div>
      <div class="tile violet"><div class="k">Ora media a letto</div><div class="v">${s.avgBedTime ?? '—'}</div><div class="s">${s.bedsLogged} ${plural(s.bedsLogged, 'orario registrato', 'orari registrati')}</div></div>
      <div class="tile green"><div class="k">Minuti letti</div><div class="v">${s.totalMin}<small>min</small></div><div class="s">Media ${s.avgMin} min nei giorni di lettura</div></div>
      <div class="tile"><div class="k">Settimane vinte</div><div class="v">${s.blocks.filter((b) => b.achieved).length}<small>/ ${s.blocks.length}</small></div><div class="s">Record di lettura: ${s.maxMin} min</div></div>
    </div>

    <div class="section-label">Obiettivi settimanali</div>
    <section class="card">${weekRows}
      <p class="small muted" style="margin:10px 0 0">Sonno: 4 → 5 → 5 → 6 notti · Lettura: 4 → 5 → 6 → 6 giorni. Il sabato sera è libero.</p></section>

    <div class="section-label">Storico orari di sonno</div>
    <section class="card">${bedChart()}</section>

    <div class="section-label">Storico minuti di lettura</div>
    <section class="card">${readChart()}</section>

    <div class="section-label">Diario</div>
    <section class="card"><ul class="history-list">${history || '<li class="muted">Nessun giorno ancora.</li>'}</ul></section>`;
}

function viewSettings() {
  const swReady = 'serviceWorker' in navigator && navigator.serviceWorker.controller;
  const start = state.start;
  return `${headerHtml('MEZZANOTTE', 'Impostazioni')}
    <div class="section-label" style="margin-top:0">Sfida</div>
    <div class="list">
      <label class="list-item"><span class="lbl">Data di inizio</span><input type="date" value="${start || ''}" data-change="start"></label>
      <div class="list-item"><span class="lbl">Ultimo giorno</span><span class="val">${start ? C.formatDateShort(C.endDate(start)) : '—'}</span></div>
      <button class="list-item" data-action="new-challenge"><span class="lbl">Ricomincia da oggi<small>Archivia i progressi attuali e riparte dal giorno 1</small></span><span class="chev">${I.chev}</span></button>
    </div>

    <div class="section-label">Lettura</div>
    <div class="list">
      <label class="list-item"><span class="lbl">Libro in lettura</span><input type="text" maxlength="120" placeholder="Titolo" value="${esc(state.settings.book)}" data-change="book" enterkeyhint="done"></label>
    </div>

    <div class="section-label">Backup</div>
    <div class="list">
      <button class="list-item" data-action="export"><span class="icon-badge violet">${I.share}</span><span class="lbl">Esporta progressi<small>Salva un file .json in File, iCloud o dove preferisci</small></span><span class="chev">${I.chev}</span></button>
      <button class="list-item" data-action="import"><span class="icon-badge green">${I.download}</span><span class="lbl">Importa da file<small>Ripristina un backup esportato in precedenza</small></span><span class="chev">${I.chev}</span></button>
      <button class="list-item" data-action="import-text"><span class="icon-badge violet">${I.book}</span><span class="lbl">Incolla backup<small>Incolla il testo di un backup</small></span><span class="chev">${I.chev}</span></button>
      <button class="list-item" data-action="copy-backup"><span class="icon-badge green">${I.check}</span><span class="lbl">Copia backup negli appunti</span><span class="chev">${I.chev}</span></button>
    </div>

    <div class="section-label">App</div>
    <div class="list">
      <button class="list-item" data-action="install-help"><span class="lbl">Installa sulla schermata Home</span><span class="val">${isStandalone() ? 'Installata' : ''}</span><span class="chev">${I.chev}</span></button>
      <div class="list-item"><span class="lbl">Funzionamento offline</span><span class="val"><span class="status-dot ${swReady ? '' : 'off'}"></span>${swReady ? 'Pronto' : 'In preparazione'}</span></div>
      <div class="list-item"><span class="lbl">Versione</span><span class="val">${VERSION}</span></div>
    </div>

    <div class="list">
      <button class="list-item danger" data-action="reset"><span class="lbl">Cancella tutti i dati</span></button>
    </div>
    <p class="footnote">Gratuita, senza account e senza server.<br>I tuoi dati restano solo su questo dispositivo: esporta un backup ogni tanto.</p>
    <input type="file" id="import-file" accept="application/json,.json,text/plain" hidden>`;
}

function onboardingHtml() {
  const hint = isIOS() && !isStandalone()
    ? `<p class="install-hint">Per installarla: in Safari tocca ${I.share} <b>Condividi</b>, poi <b>Aggiungi alla schermata Home</b>.</p>`
    : '';
  return `<div class="onboarding" id="onboarding"><div class="inner">
    <img class="ob-logo" src="icons/icon-180.png" alt="">
    <h1 class="ob-title">MEZZANOTTE</h1>
    <p class="ob-sub">30 giorni per dormire meglio e leggere ogni giorno.</p>
    <div class="ob-rules">
      <div class="ob-rule"><span class="icon-badge violet">${I.moon}</span><div><b>A letto entro mezzanotte</b><span>Ogni sera, tranne il sabato: quella notte è libera.</span></div></div>
      <div class="ob-rule"><span class="icon-badge green">${I.book}</span><div><b>Leggi almeno 5 minuti</b><span>Un libro vero, ogni giorno. Puoi usare il timer.</span></div></div>
      <div class="ob-rule"><span class="icon-badge violet">${I.chart}</span><div><b>Obiettivi progressivi</b><span>Sonno 4 → 5 → 5 → 6 notti, lettura 4 → 5 → 6 → 6 giorni a settimana.</span></div></div>
    </div>
    <div class="ob-date"><label for="ob-start">Primo giorno</label><input id="ob-start" type="date" value="${today}"></div>
    <button class="btn btn-primary" data-action="start">Inizia la sfida</button>
    <button class="btn btn-ghost" data-action="import">Ripristina un backup</button>
    ${hint}
    <input type="file" id="import-file" accept="application/json,.json,text/plain" hidden>
  </div></div>`;
}

// ---------- Rendering ----------
const TABS = [
  { id: 'today', label: 'Oggi', icon: I.today, view: viewToday },
  { id: 'calendar', label: 'Calendario', icon: I.cal, view: viewCalendar },
  { id: 'stats', label: 'Statistiche', icon: I.chart, view: viewStats },
  { id: 'settings', label: 'Impostazioni', icon: I.gear, view: viewSettings },
];

function shell() {
  const app = $('#app');
  app.innerHTML = `${TABS.map((t) => `<section class="view" id="view-${t.id}" aria-label="${t.label}"><div class="view-inner"></div></section>`).join('')}
    <nav class="tabbar" role="tablist">${TABS.map((t) => `<button class="tab" role="tab" data-action="goto" data-tab="${t.id}" aria-label="${t.label}">${t.icon}<span>${t.label}</span></button>`).join('')}</nav>`;
}

function render() {
  if (!state.start) {
    if (!$('#onboarding')) document.body.insertAdjacentHTML('beforeend', onboardingHtml());
    return;
  }
  for (const t of TABS) {
    const view = $(`#view-${t.id}`);
    view.classList.toggle('active', t.id === tab);
    $('.view-inner', view).innerHTML = t.view();
  }
  document.querySelectorAll('.tab').forEach((b) => {
    const on = b.dataset.tab === tab;
    b.classList.toggle('active', on);
    b.setAttribute('aria-selected', on);
  });
  if (sheetIso) renderSheet();
  runAnimations();
  tick();
}

function switchTab(id) {
  if (id === tab) {
    $(`#view-${id}`).scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }
  tab = id;
  animateView($(`#view-${id}`));
  render();
}

let animTimer;
function animateView(view) {
  document.querySelectorAll('.view.animate').forEach((v) => v.classList.remove('animate'));
  void view.offsetWidth;
  view.classList.add('animate');
  clearTimeout(animTimer);
  animTimer = setTimeout(() => view.classList.remove('animate'), 800);
}

// ---------- Bottom sheet ----------
function openSheet(iso) {
  sheetIso = iso;
  if (!$('.sheet')) {
    document.body.insertAdjacentHTML('beforeend', '<div class="sheet-backdrop" data-action="close-sheet"></div><div class="sheet" role="dialog" aria-modal="true"><div class="sheet-inner"></div></div>');
    attachSheetDrag($('.sheet'));
  }
  renderSheet();
  requestAnimationFrame(() => requestAnimationFrame(() => {
    $('.sheet-backdrop').classList.add('show');
    $('.sheet').classList.add('show');
  }));
}

function renderSheet() {
  const iso = sheetIso;
  const num = C.dayNumber(state.start, iso);
  $('.sheet-inner').innerHTML = `<div class="grabber"></div>
    <div class="sheet-head"><div><h2>Giorno ${num}</h2><p>${cap(C.formatDateLong(iso))}${iso === today ? ' · oggi' : ''}</p></div>
      <button class="close-btn" data-action="close-sheet" aria-label="Chiudi">${I.x}</button></div>
    ${sleepCard(iso, { title: C.isSaturday(iso) ? 'Sabato sera' : 'La notte' })}
    ${readCard(iso, { title: 'Lettura', withTimer: iso === today })}
    <button class="btn btn-primary" data-action="close-sheet">Fatto</button>`;
}

function closeSheet() {
  const sheet = $('.sheet');
  const bd = $('.sheet-backdrop');
  if (!sheet) return;
  sheetIso = null;
  sheet.style.transform = '';
  sheet.classList.remove('show');
  bd.classList.remove('show');
  setTimeout(() => { sheet.remove(); bd.remove(); }, 450);
}

function attachSheetDrag(sheet) {
  let y0 = null;
  let dy = 0;
  sheet.addEventListener('touchstart', (e) => {
    if (sheet.scrollTop > 0) return;
    y0 = e.touches[0].clientY;
    dy = 0;
    sheet.style.transition = 'none';
  }, { passive: true });
  sheet.addEventListener('touchmove', (e) => {
    if (y0 === null) return;
    dy = Math.max(0, e.touches[0].clientY - y0);
    if (dy > 0) sheet.style.transform = `translateY(${dy}px)`;
  }, { passive: true });
  sheet.addEventListener('touchend', () => {
    if (y0 === null) return;
    sheet.style.transition = '';
    if (dy > 110) closeSheet();
    else sheet.style.transform = '';
    y0 = null;
  });
}

// ---------- Dialog e toast ----------
function dialog({ title, text = '', actions, textarea = false }) {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.className = 'dialog-wrap';
    wrap.innerHTML = `<div class="dialog" role="alertdialog" aria-modal="true"><div class="body"><h3>${esc(title)}</h3>${text ? `<p>${text}</p>` : ''}
      ${textarea ? '<textarea placeholder="Incolla qui il backup…" spellcheck="false"></textarea>' : ''}</div>
      <div class="actions">${actions.map((a, i) => `<button data-i="${i}" class="${a.style || ''}">${esc(a.label)}</button>`).join('')}</div></div>`;
    document.body.appendChild(wrap);
    requestAnimationFrame(() => wrap.classList.add('show'));
    wrap.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-i]');
      if (!b) return;
      const a = actions[Number(b.dataset.i)];
      const val = textarea ? { value: a.value, text: $('textarea', wrap).value } : a.value;
      wrap.classList.remove('show');
      setTimeout(() => wrap.remove(), 260);
      resolve(val);
    });
  });
}

let toastTimer;
function toast(msg, icon = I.check, action) {
  let el = $('.toast');
  if (!el) {
    el = document.createElement('div');
    el.className = 'toast';
    el.setAttribute('role', 'status');
    document.body.appendChild(el);
  }
  el.innerHTML = `<span style="width:18px;height:18px;color:var(--green);display:grid">${icon}</span><span>${esc(msg)}</span>${action ? `<button>${esc(action.label)}</button>` : ''}`;
  if (action) $('button', el).onclick = action.run;
  requestAnimationFrame(() => el.classList.add('show'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), action ? 8000 : 2400);
}

function burst(el, color) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const r = el.getBoundingClientRect();
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;
  const colors = [color, '#a78bfa', '#34d399', '#ffffff'];
  for (let i = 0; i < 18; i++) {
    const p = document.createElement('div');
    p.className = 'burst';
    p.style.background = colors[i % colors.length];
    p.style.left = `${cx}px`;
    p.style.top = `${cy}px`;
    document.body.appendChild(p);
    const a = (Math.PI * 2 * i) / 18 + Math.random() * 0.4;
    const d = 50 + Math.random() * 60;
    p.animate(
      [{ transform: 'translate(-50%,-50%) scale(1)', opacity: 1 }, { transform: `translate(calc(-50% + ${Math.cos(a) * d}px), calc(-50% + ${Math.sin(a) * d}px)) scale(.2)`, opacity: 0 }],
      { duration: 700 + Math.random() * 300, easing: 'cubic-bezier(.2,.7,.3,1)' },
    ).onfinish = () => p.remove();
  }
}

// ---------- Backup ----------
async function exportBackup() {
  const text = C.exportPayload(state);
  const name = `mezzanotte-backup-${C.toISO(new Date())}.json`;
  const file = new File([text], name, { type: 'application/json' });
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: 'Backup MEZZANOTTE' });
      toast('Backup esportato');
      return;
    }
  } catch (err) {
    if (err && err.name === 'AbortError') return;
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  toast('Backup scaricato');
}

async function applyImport(text) {
  let next;
  try {
    next = C.importPayload(text);
  } catch (err) {
    await dialog({ title: 'Importazione non riuscita', text: esc(err.message), actions: [{ label: 'OK', value: true, style: 'strong' }] });
    return;
  }
  const days = Object.keys(next.days).length;
  const ok = !state.start || await dialog({
    title: 'Sostituire i progressi?',
    text: `Il backup contiene ${days} ${plural(days, 'giorno registrato', 'giorni registrati')}${next.start ? ` (sfida iniziata ${C.formatDateShort(next.start)})` : ''}. I dati attuali verranno sostituiti.`,
    actions: [{ label: 'Annulla', value: false }, { label: 'Importa', value: true, style: 'strong' }],
  });
  if (!ok) return;
  state = next;
  save();
  $('#onboarding')?.remove();
  render();
  toast('Progressi importati');
}

// ---------- Azioni ----------
const actions = {
  goto: (el) => switchTab(el.dataset.tab),
  'open-day': (el) => openSheet(el.dataset.iso),
  'close-sheet': () => closeSheet(),
  sleep: (el) => {
    const iso = el.dataset.iso;
    const val = el.dataset.val === '1';
    const cur = state.days[iso]?.sleep;
    update(iso, { sleep: cur === val ? null : val, ...(cur === val ? { bed: null } : {}) }, el);
  },
  'clear-bed': (el) => update(el.dataset.iso, { bed: null }),
  'min-step': (el) => {
    const iso = el.dataset.iso;
    const cur = state.days[iso]?.min || 0;
    const delta = Number(el.dataset.val);
    const next = delta > 0 ? Math.floor(cur / 5) * 5 + 5 : Math.max(0, Math.ceil(cur / 5) * 5 - 5);
    update(iso, { min: next || null }, el);
  },
  'min-add': (el) => {
    const iso = el.dataset.iso;
    update(iso, { min: (state.days[iso]?.min || 0) + Number(el.dataset.val) }, el);
  },
  'timer-start': (el) => {
    setTimer({ iso: el.dataset.iso, startedAt: Date.now() });
    render();
  },
  'timer-stop': (el) => {
    const t = getTimer();
    setTimer(null);
    if (!t) return render();
    const secs = (Date.now() - t.startedAt) / 1000;
    const add = secs < 30 ? 0 : Math.max(1, Math.round(secs / 60));
    if (add) {
      update(t.iso, { min: (state.days[t.iso]?.min || 0) + add }, el);
      toast(`+${add} min di lettura`);
    } else {
      render();
      toast('Sessione troppo breve', I.x);
    }
  },
  start: async () => {
    const v = $('#ob-start')?.value;
    const start = C.isValidISO(v) ? v : today;
    state = { ...state, start, updatedAt: new Date().toISOString() };
    save();
    tab = 'today';
    const ob = $('#onboarding');
    animateView($('#view-today'));
    render();
    if (ob) {
      ob.classList.add('hide');
      setTimeout(() => ob.remove(), 500);
    }
    navigator.storage?.persist?.().catch(() => {});
  },
  'new-challenge': async () => {
    const ok = await dialog({
      title: 'Nuova sfida',
      text: 'I progressi attuali verranno archiviati e una nuova sfida di 30 giorni inizierà oggi.',
      actions: [{ label: 'Annulla', value: false }, { label: 'Inizia', value: true, style: 'strong' }],
    });
    if (!ok) return;
    const archived = state.start ? [...state.archive, { start: state.start, days: state.days, endedAt: new Date().toISOString() }] : state.archive;
    state = { ...state, start: today, days: {}, archive: archived, updatedAt: new Date().toISOString() };
    setTimer(null);
    save();
    animMemory.clear();
    tab = 'today';
    render();
    toast('Nuova sfida iniziata');
  },
  export: () => exportBackup(),
  import: () => $('#import-file')?.click(),
  'import-text': async () => {
    const r = await dialog({ title: 'Incolla backup', textarea: true, actions: [{ label: 'Annulla', value: false }, { label: 'Importa', value: true, style: 'strong' }] });
    if (r && r.value && r.text.trim()) applyImport(r.text);
  },
  'copy-backup': async () => {
    try {
      await navigator.clipboard.writeText(C.exportPayload(state));
      toast('Backup copiato negli appunti');
    } catch {
      toast('Copia non disponibile', I.x);
    }
  },
  'install-help': () => dialog({
    title: isStandalone() ? 'App installata' : 'Installa su iPhone',
    text: isStandalone()
      ? 'Stai già usando MEZZANOTTE dalla schermata Home.'
      : '1. Apri questa pagina in <b>Safari</b>.<br>2. Tocca <b>Condividi</b> (il quadrato con la freccia).<br>3. Scegli <b>Aggiungi alla schermata Home</b> e conferma.<br><br>L\'app si aprirà a schermo intero e funzionerà anche offline.',
    actions: [{ label: 'OK', value: true, style: 'strong' }],
  }),
  'hide-hint': () => {
    try { localStorage.setItem(HINT_KEY, '1'); } catch { /* ignora */ }
    render();
  },
  reset: async () => {
    const ok = await dialog({
      title: 'Cancellare tutto?',
      text: 'Tutti i progressi saranno eliminati da questo dispositivo. L\'operazione non si può annullare.',
      actions: [{ label: 'Annulla', value: false }, { label: 'Cancella', value: true, style: 'destructive' }],
    });
    if (!ok) return;
    state = C.createState(null);
    setTimer(null);
    save();
    animMemory.clear();
    closeSheet();
    tab = 'today';
    render();
  },
};

async function onChange(e) {
  const el = e.target;
  if (el.id === 'import-file') {
    const f = el.files && el.files[0];
    el.value = '';
    if (f) applyImport(await f.text());
    return;
  }
  const kind = el.dataset.change;
  if (!kind) return;
  if (kind === 'bed') {
    const v = el.value;
    if (C.isValidTime(v)) update(el.dataset.iso, { bed: v }, el);
    else if (!v) update(el.dataset.iso, { bed: null });
  } else if (kind === 'book') {
    state = { ...state, settings: { ...state.settings, book: el.value.trim().slice(0, 120) }, updatedAt: new Date().toISOString() };
    save();
    render();
    toast('Libro salvato');
  } else if (kind === 'start') {
    const v = el.value;
    if (!C.isValidISO(v) || v === state.start) return render();
    const ok = await dialog({
      title: 'Cambiare la data di inizio?',
      text: `La sfida andrà dal ${C.formatDateShort(v)} al ${C.formatDateShort(C.endDate(v))}. I giorni già registrati restano salvati.`,
      actions: [{ label: 'Annulla', value: false }, { label: 'Cambia', value: true, style: 'strong' }],
    });
    if (ok) {
      state = { ...state, start: v, updatedAt: new Date().toISOString() };
      save();
      animMemory.clear();
      toast('Data di inizio aggiornata');
    }
    render();
  }
}

// ---------- Orologio ----------
function tick() {
  const now = new Date();
  const lt = C.logicalToday(now);
  if (lt !== today) {
    today = lt;
    render();
    return;
  }
  const cd = countdownText(now);
  document.querySelectorAll('[data-countdown]').forEach((n) => { n.textContent = cd.big; });
  document.querySelectorAll('[data-countdown-label]').forEach((n) => { n.textContent = cd.label; });
  const t = getTimer();
  if (t) {
    const s = Math.max(0, Math.floor((Date.now() - t.startedAt) / 1000));
    const txt = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
    document.querySelectorAll('[data-timer]').forEach((n) => { n.textContent = txt; });
  }
}

// ---------- Service worker ----------
function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('sw.js').then((reg) => {
    const ask = (w) => toast('Nuova versione disponibile', I.star, { label: 'Aggiorna', run: () => w.postMessage('skipWaiting') });
    if (reg.waiting && navigator.serviceWorker.controller) ask(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => {
        if (w.state === 'installed' && navigator.serviceWorker.controller) ask(w);
        if (w.state === 'activated' && tab === 'settings') render();
      });
    });
    setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);
  }).catch(() => {});
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return;
    reloading = true;
    window.location.reload();
  });
}

// ---------- Avvio ----------
async function boot() {
  state = await loadState();
  shell();
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el || el.disabled) return;
    const fn = actions[el.dataset.action];
    if (fn) fn(el, e);
  });
  document.addEventListener('change', onChange);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
  setInterval(tick, 1000);
  animateView($(`#view-${tab}`));
  render();
  if (state.start) navigator.storage?.persist?.().catch(() => {});
  registerSW();
  window.__mezzanotte = { get state() { return state; }, core: C, version: VERSION };
}

boot();
