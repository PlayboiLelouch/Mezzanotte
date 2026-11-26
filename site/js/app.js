// MEZZANOTTE 3 — applicazione: persistenza sicura, azioni, rendering, celebrazioni.
import * as D from './core.js';
import * as S from './store.js';
import * as E from './engine.js';
import * as M from './messages.js';
import * as V from './views.js';
import * as FX from './fx.js';
import { I } from './icons.js';
import { medalDefs } from './medals.js';

const VERSION = '3.1.0';
const TIMER_KEY = 'mezzanotte:timer';
const KEY_BEFORE_RESET = 'mezzanotte:backup-prima-del-reset';

const $ = (sel, root = document) => root.querySelector(sel);
const isStandalone = () => window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const systemReduce = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------- Persistenza: localStorage + copia in IndexedDB ----------
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

const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); return true; } catch { return false; } };

async function keepCopy(key, raw) {
  if (!raw || lsGet(key)) return;
  lsSet(key, raw);
  await idb.set(key, raw);
}

// Ordine di caricamento: formato 2 → copia in IndexedDB → formato 1 (migrazione). Nulla viene cancellato.
async function loadState() {
  const tryParse = (raw) => { try { return S.migrate(JSON.parse(raw)); } catch { return null; } };
  let s = null;
  let source = 'new';
  const v2 = lsGet(S.KEY_V2) || (await idb.get(S.KEY_V2));
  if (v2) {
    s = tryParse(v2);
    if (s) {
      source = 'v2';
      // dati della 3.0 (schema 2): copia intatta prima dell'avvio ufficiale della 3.1
      try { if (JSON.parse(v2).version < 3) await keepCopy(S.KEY_PRE_31, v2); } catch { /* ignora */ }
    }
  }
  const v1 = lsGet(S.KEY_V1) || (await idb.get(S.KEY_V1));
  if (!s && v1) {
    s = tryParse(v1);
    if (s) {
      source = 'v1';
      await keepCopy(S.KEY_PRE_MIGRATION, v1); // punto di ripristino dei dati originali
    }
  }
  if (s && source === 'v2' && v1) {
    try {
      const r = S.mergeNewerV1(s, JSON.parse(v1));
      if (r.merged) s = r.state;
    } catch { /* copia 1.x non leggibile: ignorata */ }
  }
  return { s: s || S.createState(), source };
}

let saveFailed = false;
function save() {
  state = S.setMeta(state, { v1MirrorAt: state.updatedAt });
  const json = JSON.stringify(state);
  const v1 = JSON.stringify(S.toV1(state));
  const ok = lsSet(S.KEY_V2, json) && lsSet(S.KEY_V1, v1);
  if (!ok && !saveFailed) toast('Spazio di archiviazione pieno: esporta un backup', I.info);
  saveFailed = !ok;
  idb.set(S.KEY_V2, json);
  idb.set(S.KEY_V1, v1);
}

// ---------- Timer di lettura (sopravvive alla chiusura dell'app) ----------
function getTimer() {
  try {
    const t = JSON.parse(lsGet(TIMER_KEY) || 'null');
    if (!t || !D.isValidISO(t.iso)) return null;
    if ('startedAt' in t && !('acc' in t)) return { habit: 'read', iso: t.iso, acc: 0, since: t.startedAt }; // formato 1.x
    return { habit: 'read', iso: t.iso, acc: Number(t.acc) || 0, since: t.since ? Number(t.since) : null };
  } catch {
    return null;
  }
}
function setTimer(t) {
  try {
    if (t) localStorage.setItem(TIMER_KEY, JSON.stringify(t));
    else localStorage.removeItem(TIMER_KEY);
  } catch { /* ignora */ }
}
const timerElapsed = (t) => (t ? t.acc + (t.since ? Date.now() - t.since : 0) : 0);

// ---------- Stato ----------
let state = S.createState();
let today = D.logicalToday();
let c = null;
const ui = {
  tab: 'today',
  progressTab: 'overview',
  calMonth: { y: new Date().getFullYear(), m: new Date().getMonth() },
  sheet: null,
  historyLimit: 45,
  away: null,
  draft: null,
  lastXp: null,
  pop: null,
  timerGoalNotified: false,
};

function compute() {
  c = E.compute(state, today);
  return c;
}

function ctx() {
  const now = new Date();
  return {
    state, c, today, now, ui, timer: getTimer(),
    proposals: c ? E.proposals(state, c) : [],
    message: c && state.journeys.length ? M.topMessage(state, c, now) : null,
    standalone: isStandalone(), ios: isIOS(),
    swReady: 'serviceWorker' in navigator && !!navigator.serviceWorker.controller,
    version: VERSION,
    hapticNote: FX.hapticSupported() ? (isIOS() ? 'Su iPhone richiede iOS 18 o successivo' : 'Vibrazione breve dove supportata') : 'Non supportato da questo dispositivo',
    systemReduce: systemReduce(),
  };
}

// ---------- Modifiche con feedback ----------
function commit(next, fb = null) {
  const prev = c;
  const prevState = state;
  state = next;
  save();
  compute();
  if (fb) feedback(prevState, prev, fb);
  render();
  celebrate();
}

function feedback(prevState, prev, { el, habit, iso }) {
  if (!habit || !iso) return;
  const h = S.habitById(state, habit);
  const before = E.status(prevState, h, iso, today);
  const after = E.status(state, h, iso, today);
  if (before !== 'done' && after === 'done') {
    const dayBefore = E.dayInfo(prevState, iso, today).complete;
    const dayAfter = E.dayInfo(state, iso, today).complete;
    const gained = c.xp.total - prev.xp.total;
    ui.pop = `${habit}:${iso}`;
    if (dayAfter && !dayBefore) {
      FX.haptic('success');
      FX.sound('full');
      requestAnimationFrame(() => {
        const target = document.querySelector(`[data-action="habit-check"][data-habit="${habit}"][data-iso="${iso}"]`) || el;
        FX.burst(target);
      });
    } else {
      FX.haptic('light');
      FX.sound('done');
    }
    if (gained > 0) FX.floatText(el, `+${gained} XP`, `t-${h.color}`);
  } else if (before !== after) {
    FX.haptic('light');
  }
}

// ---------- Celebrazioni (traguardi, livelli, fasi) ----------
const overlayQueue = [];
let overlayOpen = false;
const toastQueue = [];
let achToastOpen = false;

function markAllSeen() {
  compute();
  state = S.setMeta(state, {
    seen: {
      achievements: c.achievements.filter((a) => a.unlocked).map((a) => a.id),
      level: Math.max(state.meta.seen.level, c.level.n),
      phases: c.blocks.filter((b) => b.phase && b.achieved && b.timing !== 'future').map((b) => b.key),
      goals: [...goalKeys(), ...E.readingMilestone(c.read.totalMinutes).reached.map((m) => `lettura:${m}`)],
    },
  });
}

function goalKeys() {
  const out = [];
  for (const b of c.blocks) {
    if (b.timing === 'future') continue;
    for (const [hid, hp] of Object.entries(b.habits)) if (hp.ok) out.push(`${b.key}:${hid}`);
  }
  return out;
}

function celebrate() {
  if (!state.journeys.length || !state.meta.seen.welcome) return;
  const seen = state.meta.seen;
  const phases = c.blocks.filter((b) => b.phase && b.achieved && b.timing !== 'future' && !seen.phases.includes(b.key));
  const achs = c.achievements.filter((a) => a.unlocked && !seen.achievements.includes(a.id));
  const levelUp = c.level.n > seen.level ? c.level.n : null;
  const j = c.journey;
  const summary = j && c.journeyState === 'completed' && !seen.summaries.includes(String(j.id));
  const goals = goalKeys().filter((k) => !seen.goals.includes(k));
  const phaseKeys = new Set(phases.map((b) => b.key));
  const milestones = E.readingMilestone(c.read.totalMinutes).reached.filter((m) => !seen.goals.includes(`lettura:${m}`));
  if (!phases.length && !achs.length && !levelUp && !summary && !goals.length && !milestones.length) return;
  state = S.setMeta(state, {
    seen: {
      phases: [...seen.phases, ...phases.map((b) => b.key)],
      achievements: [...seen.achievements, ...achs.map((a) => a.id)],
      level: Math.max(seen.level, c.level.n),
      summaries: summary ? [...seen.summaries, String(j.id)] : seen.summaries,
      goals: [...seen.goals, ...goals, ...milestones.map((m) => `lettura:${m}`)],
    },
  });
  save();
  // obiettivo settimanale di una singola abitudine: animazione dedicata (se la fase intera è completata, c'è già la sua schermata)
  for (const k of goals) {
    const bkey = k.slice(0, k.lastIndexOf(':'));
    const hid = k.slice(k.lastIndexOf(':') + 1);
    if (phaseKeys.has(bkey)) continue;
    const b = c.blocks.find((x) => x.key === bkey);
    const h = S.habitById(state, hid);
    if (b && h) toastQueue.push({ cls: 'goal-toast', html: V.goalToast(h, b.habits[hid]), action: 'open-week', key: bkey });
  }
  for (const m of milestones.slice(-1)) toastQueue.push({ cls: 'goal-toast', html: V.milestoneToast(m) });
  for (const b of phases) overlayQueue.push({ cls: 'ov-phase-wrap', html: V.overlayPhase(state, b), fx: 'full' });
  if (levelUp) overlayQueue.push({ cls: 'ov-level-wrap', html: V.overlayLevel(c, levelUp), fx: 'level' });
  for (const a of achs) toastQueue.push({ html: V.achievementToast(a), action: 'open-achievement', id: a.id });
  if (summary) overlayQueue.push({ sheet: { type: 'summary', journey: j.id } });
  nextOverlay();
  nextAchToast();
}

function nextOverlay() {
  // le celebrazioni a schermo intero non interrompono una scheda aperta: compaiono alla chiusura
  if (overlayOpen || !overlayQueue.length || ui.sheet) return;
  const item = overlayQueue.shift();
  if (item.sheet) {
    openSheet(item.sheet);
    return;
  }
  overlayOpen = true;
  const wrap = document.createElement('div');
  wrap.className = `overlay ${item.cls || ''}`;
  wrap.setAttribute('role', 'dialog');
  wrap.setAttribute('aria-modal', 'true');
  wrap.innerHTML = item.html;
  document.body.appendChild(wrap);
  requestAnimationFrame(() => wrap.classList.add('show'));
  if (item.fx) {
    FX.haptic('success');
    FX.sound(item.fx);
  }
  const close = () => {
    wrap.classList.remove('show');
    setTimeout(() => wrap.remove(), 260);
    overlayOpen = false;
    setTimeout(() => { nextOverlay(); nextAchToast(); }, 160);
  };
  wrap.addEventListener('click', (e) => {
    if (e.target === wrap || e.target.closest('[data-action="ov-close"]')) close();
  });
}

function nextAchToast() {
  if (achToastOpen || overlayOpen || !toastQueue.length) return;
  const t = toastQueue.shift();
  achToastOpen = true;
  const el = document.createElement('button');
  el.className = `ach-toast ${t.cls || ''}`;
  el.setAttribute('role', 'status');
  if (t.action) el.dataset.action = t.action;
  if (t.id) el.dataset.id = t.id;
  if (t.key) el.dataset.key = t.key;
  el.innerHTML = t.html;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  FX.haptic('success');
  FX.sound('level');
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => { el.remove(); achToastOpen = false; nextAchToast(); }, 400);
  }, 3400);
}

// ---------- Rendering ----------
const TABS = [
  { id: 'today', label: 'Oggi', icon: I.today, view: V.viewToday },
  { id: 'goals', label: 'Obiettivi', icon: I.target, view: V.viewGoals },
  { id: 'progress', label: 'Progressi', icon: I.chart, view: V.viewProgress },
  { id: 'profile', label: 'Profilo', icon: I.person, view: V.viewProfile },
];

function shell() {
  $('#app').innerHTML = `${TABS.map((t) => `<section class="view" id="view-${t.id}" aria-label="${t.label}"><div class="view-inner"></div></section>`).join('')}
    <nav class="tabbar" role="tablist">${TABS.map((t) => `<button class="tab" role="tab" data-action="goto" data-tab="${t.id}" aria-label="${t.label}">${t.icon}<span>${t.label}</span></button>`).join('')}</nav>`;
}

function render() {
  if (!state.journeys.length) {
    $('#app').classList.add('hidden');
    if (!$('#onboarding')) document.body.insertAdjacentHTML('beforeend', V.onboarding(ctx()));
    return;
  }
  $('#app').classList.remove('hidden');
  if (!c) compute();
  const x = ctx();
  for (const t of TABS) {
    const view = $(`#view-${t.id}`);
    const on = t.id === ui.tab;
    view.classList.toggle('active', on);
    view.setAttribute('aria-hidden', String(!on));
    if (on) $('.view-inner', view).innerHTML = t.view(x);
  }
  document.querySelectorAll('.tab').forEach((b) => {
    const on = b.dataset.tab === ui.tab;
    b.classList.toggle('active', on);
    b.setAttribute('aria-selected', on);
  });
  if (ui.sheet) renderSheet();
  runAnimations();
  afterRender();
  tick();
}

function afterRender() {
  const xpEl = document.querySelector('#view-today.active [data-xp]');
  if (xpEl && ui.lastXp !== null && ui.lastXp !== c.xp.total) {
    FX.countUp(xpEl, ui.lastXp, c.xp.total, V.nf);
    if (c.xp.total > ui.lastXp && !FX.reducedMotion()) {
      const head = document.querySelector('#view-today .today-head');
      head?.classList.remove('bump');
      void head?.offsetWidth;
      head?.classList.add('bump');
    }
  }
  ui.lastXp = c.xp.total;
  if (ui.pop) {
    const [habit, iso] = ui.pop.split(':');
    document.querySelectorAll(`[data-action="habit-check"][data-habit="${habit}"][data-iso="${iso}"]`).forEach((b) => b.classList.add('pop'));
    ui.pop = null;
  }
}

function runAnimations(root = document) {
  const els = root.querySelectorAll('[data-anim]');
  if (!els.length) return;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    els.forEach((el) => {
      const to = Number(el.dataset.to);
      if (el.dataset.kind === 'width') el.style.width = `${to}%`;
      else el.style.strokeDashoffset = to;
      V.animMemory.set(el.dataset.anim, to);
    });
  }));
}

function switchTab(id, anchor) {
  if (id === ui.tab && !anchor) {
    $(`#view-${id}`).scrollTo({ top: 0, behavior: FX.reducedMotion() ? 'auto' : 'smooth' });
    return;
  }
  ui.tab = id;
  const view = $(`#view-${id}`);
  view.scrollTop = 0;
  document.querySelectorAll('.view.enter').forEach((v) => v.classList.remove('enter'));
  view.classList.add('enter');
  setTimeout(() => view.classList.remove('enter'), 400);
  render();
  if (anchor) requestAnimationFrame(() => document.getElementById(anchor)?.scrollIntoView({ block: 'start', behavior: FX.reducedMotion() ? 'auto' : 'smooth' }));
  FX.haptic('light');
}

// ---------- Bottom sheet ----------
function openSheet(sheet) {
  ui.sheet = sheet;
  if (!$('.sheet')) {
    document.body.insertAdjacentHTML('beforeend', '<div class="sheet-backdrop" data-action="close-sheet"></div><div class="sheet" role="dialog" aria-modal="true"><div class="sheet-inner"></div></div>');
    attachSheetDrag($('.sheet'));
  }
  renderSheet();
  $('.sheet').scrollTop = 0;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    $('.sheet-backdrop')?.classList.add('show');
    $('.sheet')?.classList.add('show');
  }));
}

function renderSheet() {
  const s = ui.sheet;
  const inner = $('.sheet-inner');
  if (!s || !inner) return;
  const x = ctx();
  let html = '';
  if (s.type === 'day') html = V.sheetDay(x, s.iso, s.focus);
  else if (s.type === 'timer') html = V.sheetTimer(x);
  else if (s.type === 'achievement') html = V.sheetAchievement(x, s.id);
  else if (s.type === 'habit') html = V.sheetHabit(x, s.id);
  else if (s.type === 'new-habit') html = V.sheetNewHabit(x);
  else if (s.type === 'reminders') html = V.sheetReminders(x);
  else if (s.type === 'catchup') html = V.sheetCatchup(x);
  else if (s.type === 'install') html = V.sheetInstall(x);
  else if (s.type === 'whats-new') html = V.sheetWhatsNew(x);
  else if (s.type === 'week') html = V.sheetWeek(x, s.key);
  else if (s.type === 'summary') {
    const j = state.journeys.find((y) => y.id === s.journey) || c.journey;
    html = V.sheetSummary(x, E.journeySummary(state, j, today));
  }
  // conserva il focus su un campo di testo durante il rendering
  const active = document.activeElement;
  const keep = active && inner.contains(active) && active.id ? active.id : null;
  inner.innerHTML = html;
  $('.sheet').dataset.type = s.type;
  if (keep) document.getElementById(keep)?.focus();
  runAnimations(inner);
  tick();
}

function closeSheet() {
  const sheet = $('.sheet');
  const bd = $('.sheet-backdrop');
  const wasType = ui.sheet?.type;
  ui.sheet = null;
  if (!sheet) return;
  if (document.activeElement && sheet.contains(document.activeElement)) document.activeElement.blur();
  sheet.style.transform = '';
  sheet.classList.remove('show');
  bd?.classList.remove('show');
  setTimeout(() => { if (!ui.sheet) { sheet.remove(); bd?.remove(); } }, 380);
  if (wasType === 'catchup') ui.away = null;
  render();
  setTimeout(nextOverlay, 400);
}

function attachSheetDrag(sheet) {
  let y0 = null;
  let dy = 0;
  sheet.addEventListener('touchstart', (e) => {
    if (sheet.scrollTop > 0 || e.target.closest('input, textarea')) return;
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
    wrap.innerHTML = `<div class="dialog" role="alertdialog" aria-modal="true"><div class="body"><h3>${V.esc(title)}</h3>${text ? `<p>${text}</p>` : ''}
      ${textarea ? '<textarea placeholder="Incolla qui il backup…" spellcheck="false"></textarea>' : ''}</div>
      <div class="actions">${actions.map((a, i) => `<button data-i="${i}" class="${a.style || ''}">${V.esc(a.label)}</button>`).join('')}</div></div>`;
    document.body.appendChild(wrap);
    requestAnimationFrame(() => wrap.classList.add('show'));
    wrap.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-i]');
      if (!b) return;
      const a = actions[Number(b.dataset.i)];
      const val = textarea ? { value: a.value, text: $('textarea', wrap).value } : a.value;
      wrap.classList.remove('show');
      setTimeout(() => wrap.remove(), 220);
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
  el.innerHTML = `<span class="ti">${icon}</span><span>${V.esc(msg)}</span>${action ? `<button>${V.esc(action.label)}</button>` : ''}`;
  if (action) $('button', el).onclick = () => { el.classList.remove('show'); action.run(); };
  requestAnimationFrame(() => el.classList.add('show'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), action ? 4500 : 2200);
}

// ---------- Registrazioni ----------
function record(habitId, iso, patch, el, { undo = false, label } = {}) {
  const prevEntry = state.entries[habitId]?.[iso] ? { ...state.entries[habitId][iso] } : null;
  commit(S.setEntry(state, habitId, iso, patch), { el, habit: habitId, iso });
  if (undo) {
    toast(label || 'Registrato', I.check, { label: 'Annulla', run: () => commit(S.restoreEntry(state, habitId, iso, prevEntry)) });
  }
}

function checkHabit(habitId, iso, el) {
  const h = S.habitById(state, habitId);
  if (!h) return;
  const st = E.status(state, h, iso, today);
  if (st === 'done') {
    openSheet({ type: 'day', iso, focus: habitId });
    return;
  }
  if (h.type === 'bedtime') {
    const now = new Date();
    const patch = { ok: true };
    let label = 'Sonno registrato: entro mezzanotte';
    if (iso === today && now.getHours() >= 21) {
      patch.bed = D.nowTime(now);
      label = `A letto alle ${patch.bed}: entro mezzanotte`;
    }
    record(habitId, iso, patch, el, { undo: true, label });
  } else if (h.type === 'duration') {
    const cur = state.entries[habitId]?.[iso]?.min || 0;
    const goal = E.goalMinOn(h, iso);
    record(habitId, iso, { min: Math.max(cur, goal) }, el, { undo: true, label: `${h.name}: ${Math.max(cur, goal)} minuti` });
  } else {
    record(habitId, iso, { done: true }, el, { undo: true, label: `${h.name}: fatto` });
  }
}

// ---------- Backup ----------
async function exportBackup() {
  const text = S.exportPayload(state);
  const name = `mezzanotte-backup-${D.toISO(new Date())}.json`;
  const file = new File([text], name, { type: 'application/json' });
  const done = () => {
    state = S.setMeta(state, { lastExport: new Date().toISOString() });
    save();
    render();
  };
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: 'Backup MEZZANOTTE' });
      done();
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
  done();
  toast('Backup scaricato');
}

async function applyImport(text) {
  let next;
  try {
    next = S.importPayload(text);
  } catch (err) {
    await dialog({ title: 'Importazione non riuscita', text: V.esc(err.message), actions: [{ label: 'OK', value: true, style: 'strong' }] });
    return;
  }
  const days = S.countEntries(next);
  const j = next.journeys[next.journeys.length - 1];
  const ok = !state.journeys.length || await dialog({
    title: 'Sostituire i dati attuali?',
    text: `Il backup contiene ${days} ${D.plural(days, 'giorno registrato', 'giorni registrati')}${j ? ` (percorso iniziato ${D.formatDateShort(j.start)})` : ''}. Prima di sostituirli, una copia dei dati attuali viene conservata su questo dispositivo.`,
    actions: [{ label: 'Annulla', value: false }, { label: 'Importa', value: true, style: 'strong' }],
  });
  if (!ok) return;
  if (state.journeys.length) {
    const cur = JSON.stringify(state);
    lsSet(KEY_BEFORE_RESET, cur);
    await idb.set(KEY_BEFORE_RESET, cur);
  }
  state = next;
  state = S.setMeta(state, { seen: { ...state.meta.seen, welcome: VERSION } });
  markAllSeen();
  save();
  $('#onboarding')?.remove();
  compute();
  ui.lastXp = c.xp.total;
  closeSheet();
  render();
  toast('Dati importati');
}

// ---------- Azioni ----------
const goalDialog = (n, unit) => dialog({
  title: `Nuovo minimo: ${n} ${unit}`,
  text: 'Vale da oggi in avanti. I giorni passati, gli XP e i traguardi già ottenuti non cambiano.',
  actions: [{ label: 'Annulla', value: false }, { label: 'Conferma', value: true, style: 'strong' }],
});

const actions = {
  goto: (el) => switchTab(el.dataset.tab, el.dataset.anchor),
  'progress-tab': (el) => { ui.progressTab = el.dataset.id; FX.haptic('light'); render(); },
  'cal-prev': () => { const d = new Date(ui.calMonth.y, ui.calMonth.m - 1, 1); ui.calMonth = { y: d.getFullYear(), m: d.getMonth() }; render(); },
  'cal-next': () => { const d = new Date(ui.calMonth.y, ui.calMonth.m + 1, 1); ui.calMonth = { y: d.getFullYear(), m: d.getMonth() }; render(); },
  'history-more': () => { ui.historyLimit += 60; render(); },
  'open-day': (el) => openSheet({ type: 'day', iso: el.dataset.iso, focus: el.dataset.focus || null }),
  'close-sheet': () => closeSheet(),
  'habit-check': (el) => checkHabit(el.dataset.habit, el.dataset.iso, el),
  'sleep-set': (el) => {
    const iso = el.dataset.iso;
    const val = el.dataset.val === '1';
    const cur = state.entries.sleep[iso]?.ok;
    if (cur === val && ui.sheet) record('sleep', iso, { ok: null, bed: null }, el);
    else record('sleep', iso, { ok: val }, el, { undo: !ui.sheet, label: val ? 'Sonno registrato: entro mezzanotte' : 'Registrato: dopo mezzanotte' });
  },
  'clear-bed': (el) => record('sleep', el.dataset.iso, { bed: null }, el),
  'hours-step': (el) => {
    const iso = el.dataset.iso;
    const goal = S.habitById(state, 'sleep').config.hoursGoal;
    const cur = state.entries.sleep[iso]?.hours || 0;
    const next = cur ? cur + Number(el.dataset.val) : goal;
    record('sleep', iso, { hours: Math.min(12, Math.max(3, next)) }, el);
  },
  'hours-clear': (el) => record('sleep', el.dataset.iso, { hours: null }, el),
  'min-step': (el) => {
    const { habit, iso } = el.dataset;
    const cur = state.entries[habit]?.[iso]?.min || 0;
    const delta = Number(el.dataset.val);
    const next = delta > 0 ? Math.floor(cur / 5) * 5 + 5 : Math.max(0, Math.ceil(cur / 5) * 5 - 5);
    record(habit, iso, { min: next || null }, el);
  },
  'min-add': (el) => {
    const { habit, iso } = el.dataset;
    record(habit, iso, { min: (state.entries[habit]?.[iso]?.min || 0) + Number(el.dataset.val) }, el);
  },
  'check-set': (el) => {
    const { habit, iso } = el.dataset;
    const val = el.dataset.val === '1';
    const cur = state.entries[habit]?.[iso]?.done;
    record(habit, iso, { done: cur === val ? null : val }, el);
  },
  'catchup-read': (el) => {
    const iso = el.dataset.iso;
    const h = S.habitById(state, 'read');
    const cur = state.entries.read[iso]?.min || 0;
    const goal = E.goalMinOn(h, iso);
    record('read', iso, { min: cur >= goal ? null : goal }, el);
  },
  'catchup-done': () => { ui.away = null; closeSheet(); },
  // dopo mezzanotte: l'orario reale viene associato alla notte giusta (il giorno logico, fino alle 5:00)
  'bed-now': (el) => {
    const iso = el.dataset.iso;
    const bed = D.nowTime(new Date());
    record('sleep', iso, { bed }, el, { undo: true, label: `A letto alle ${bed}: registrato sulla notte di ${D.WEEKDAYS_LONG[D.weekday(iso)]}` });
  },
  'open-week': (el) => openSheet({ type: 'week', key: el.dataset.key }),
  'recap-dismiss': (el) => {
    state = S.setMeta(state, { seen: { ...state.meta.seen, recaps: [...state.meta.seen.recaps, el.dataset.key] } });
    save();
    render();
  },
  'open-catchup': () => openSheet({ type: 'catchup' }),
  'away-dismiss': () => { ui.away = null; render(); },
  // timer
  'open-timer': () => openSheet({ type: 'timer' }),
  'timer-start': () => {
    setTimer({ habit: 'read', iso: today, acc: 0, since: Date.now() });
    ui.timerGoalNotified = false;
    FX.haptic('light');
    render();
  },
  'timer-pause': () => {
    const t = getTimer();
    if (t && t.since) setTimer({ ...t, acc: timerElapsed(t), since: null });
    FX.haptic('light');
    render();
  },
  'timer-resume': () => {
    const t = getTimer();
    if (t && !t.since) setTimer({ ...t, since: Date.now() });
    FX.haptic('light');
    render();
  },
  'timer-finish': (el) => {
    const t = getTimer();
    setTimer(null);
    if (!t) return render();
    const ms = timerElapsed(t);
    const add = ms < 30000 ? 0 : Math.max(1, Math.round(ms / 60000));
    if (!add) {
      render();
      toast('Sessione troppo breve per essere salvata', I.info);
      return;
    }
    ui.sheet = null;
    closeSheet();
    record('read', t.iso, { min: (state.entries.read[t.iso]?.min || 0) + add }, el);
    toast(`+${add} min di lettura salvati`, I.book);
  },
  'timer-discard': async () => {
    const t = getTimer();
    if (t && timerElapsed(t) > 60000) {
      const ok = await dialog({ title: 'Annullare la sessione?', text: 'I minuti di questa sessione non verranno salvati.', actions: [{ label: 'No', value: false }, { label: 'Annulla sessione', value: true, style: 'destructive' }] });
      if (!ok) return;
    }
    setTimer(null);
    render();
  },
  'quick-read': (el) => {
    closeSheet();
    checkHabit('read', today, el);
  },
  // proposte (mai applicate senza consenso)
  proposal: async (el) => {
    const key = el.dataset.key;
    const p = E.proposals(state, c).find((x) => x.key === key);
    if (!p) return;
    const yes = el.dataset.val === '1';
    let next = S.decideProposal(state, key, yes ? 'accepted' : 'declined', today);
    if (yes) {
      if (p.type === 'reduce') next = S.setJourneyAdjust(next, p.journeyId, p.blockIdx, p.habitId, p.to);
      if (p.type === 'read-up') next = S.setReadGoal(next, p.to, today);
      if (p.type === 'hours-up') next = S.updateHabit(next, 'sleep', (h) => { h.config.hoursGoal = p.to; return h; });
    }
    commit(next);
    toast(yes ? 'Obiettivo aggiornato' : 'Va bene, il piano resta invariato');
  },
  // percorso
  'open-summary': (el) => openSheet({ type: 'summary', journey: Number(el.dataset.journey) }),
  'start-next': async (el) => {
    const j = c.journey;
    const sum = E.journeySummary(state, j, today);
    const plan = sum.next.id === el.dataset.plan ? sum.next.plan : S.DEFAULT_PLAN;
    const ok = await dialog({ title: 'Iniziare il nuovo percorso oggi?', text: 'Lo storico, gli XP e i traguardi restano. Il nuovo percorso parte dal giorno 1.', actions: [{ label: 'Annulla', value: false }, { label: 'Inizia', value: true, style: 'strong' }] });
    if (!ok) return;
    closeSheet();
    commit(S.startJourney(state, today, plan));
    switchTab('today');
    toast('Nuovo percorso iniziato', I.flag);
  },
  'new-journey': async () => {
    const ok = await dialog({ title: 'Nuovo percorso', text: 'Il percorso attuale si chiude e ne inizia uno nuovo da oggi, con gli obiettivi 4 → 5 → 5 → 6. Lo storico, gli XP e i traguardi restano.', actions: [{ label: 'Annulla', value: false }, { label: 'Inizia', value: true, style: 'strong' }] });
    if (!ok) return;
    commit(S.startJourney(state, today));
    switchTab('today');
    toast('Nuovo percorso iniziato', I.flag);
  },
  // traguardi e abitudini
  'open-achievement': (el) => openSheet({ type: 'achievement', id: el.dataset.id }),
  'open-habit': (el) => openSheet({ type: 'habit', id: el.dataset.id }),
  'new-habit': async () => {
    const ended = ['completed', 'ended'].includes(c.journeyState) || state.journeys.length > 1;
    if (!ended) {
      await dialog({ title: 'Una cosa alla volta', text: 'Le nuove abitudini si sbloccano al termine del primo percorso di 30 giorni. Aggiungerne troppe insieme è la causa più comune di abbandono: prima rendi automatici sonno e lettura.', actions: [{ label: 'Ho capito', value: true, style: 'strong' }] });
      return;
    }
    ui.draft = { name: '', type: 'check', min: 10, perWeek: 4, icon: 'run', color: 'gold' };
    openSheet({ type: 'new-habit' });
  },
  draft: (el) => { ui.draft[el.dataset.k] = el.dataset.v; renderSheet(); },
  'draft-step': (el) => {
    const k = el.dataset.k;
    const lim = k === 'min' ? [5, 120] : [1, 7];
    ui.draft[k] = Math.min(lim[1], Math.max(lim[0], ui.draft[k] + Number(el.dataset.val)));
    renderSheet();
  },
  'create-habit': () => {
    const name = ($('#nh-name')?.value || ui.draft.name || '').trim();
    if (!name) { $('#nh-name')?.focus(); toast('Dai un nome all\'abitudine', I.info); return; }
    commit(S.addHabit(state, { ...ui.draft, name }, today));
    closeSheet();
    toast('Abitudine aggiunta', I.plus);
  },
  'archive-habit': async (el) => {
    const ok = await dialog({ title: 'Archiviare l\'abitudine?', text: 'Non comparirà più da domani. Lo storico, gli XP e i traguardi restano.', actions: [{ label: 'Annulla', value: false }, { label: 'Archivia', value: true, style: 'destructive' }] });
    if (!ok) return;
    closeSheet();
    commit(S.archiveHabit(state, el.dataset.id, D.addDays(today, 1)));
  },
  'goal-step': async (el) => {
    const id = el.dataset.id;
    const h = S.habitById(state, id);
    const cur = E.goalMinOn(h, today);
    const n = Math.min(60, Math.max(5, cur + Number(el.dataset.val)));
    if (n === cur) return;
    if (!(await goalDialog(n, 'minuti al giorno'))) return;
    commit(S.setDurationGoal(state, id, n, today));
  },
  'hours-goal': (el) => {
    commit(S.updateHabit(state, 'sleep', (h) => { h.config.hoursGoal = Math.min(9, Math.max(6, h.config.hoursGoal + Number(el.dataset.val))); return h; }));
  },
  'toggle-routine': () => commit(S.updateHabit(state, 'sleep', (h) => { h.config.routine = !h.config.routine; return h; })),
  'toggle-sound': () => { commit(S.setSettings(state, { sound: !state.settings.sound })); FX.configure(state.settings); FX.sound('done'); },
  'toggle-haptics': () => { commit(S.setSettings(state, { haptics: !state.settings.haptics })); FX.configure(state.settings); FX.haptic('light'); },
  'toggle-motion': () => { commit(S.setSettings(state, { motion: state.settings.motion === 'reduce' ? 'system' : 'reduce' })); FX.configure(state.settings); },
  'open-reminders': () => openSheet({ type: 'reminders' }),
  'install-help': () => openSheet({ type: 'install' }),
  'whats-new': () => openSheet({ type: 'whats-new' }),
  // dati
  export: () => exportBackup(),
  import: () => $('#import-file')?.click(),
  'import-text': async () => {
    const r = await dialog({ title: 'Incolla un backup', textarea: true, actions: [{ label: 'Annulla', value: false }, { label: 'Importa', value: true, style: 'strong' }] });
    if (r && r.value && r.text.trim()) applyImport(r.text);
  },
  'copy-backup': async () => {
    try {
      await navigator.clipboard.writeText(S.exportPayload(state));
      toast('Backup copiato negli appunti');
    } catch {
      toast('Copia non disponibile', I.info);
    }
  },
  reset: async () => {
    const ok = await dialog({
      title: 'Cancellare tutti i dati?',
      text: 'Progressi, XP e traguardi verranno eliminati da questo dispositivo. Esporta prima un backup se vuoi conservarli.',
      actions: [{ label: 'Annulla', value: false }, { label: 'Cancella', value: true, style: 'destructive' }],
    });
    if (!ok) return;
    const again = await dialog({ title: 'Sei sicuro?', text: 'L\'operazione non si può annullare dall\'app.', actions: [{ label: 'No', value: false, style: 'strong' }, { label: 'Sì, cancella', value: true, style: 'destructive' }] });
    if (!again) return;
    const cur = JSON.stringify(state);
    lsSet(KEY_BEFORE_RESET, cur);
    await idb.set(KEY_BEFORE_RESET, cur);
    state = S.createState();
    setTimer(null);
    V.animMemory.clear();
    save();
    compute();
    ui.sheet = null;
    $('.sheet')?.remove();
    $('.sheet-backdrop')?.remove();
    ui.tab = 'today';
    render();
  },
  start: () => {
    const v = $('#ob-start')?.value;
    const start = D.isValidISO(v) ? v : today;
    state = S.startJourney(state, start);
    state = S.setMeta(state, { lastOpen: today, seen: { ...state.meta.seen, welcome: VERSION } });
    save();
    compute();
    ui.lastXp = c.xp.total;
    ui.tab = 'today';
    const ob = $('#onboarding');
    render();
    if (ob) {
      ob.classList.add('hide');
      setTimeout(() => ob.remove(), 450);
    }
    navigator.storage?.persist?.().catch(() => {});
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
    if (D.isValidTime(v)) record('sleep', el.dataset.iso, { bed: v }, el);
    else if (!v) record('sleep', el.dataset.iso, { bed: null }, el);
  } else if (kind === 'min') {
    const n = Math.round(Number(el.value));
    record(el.dataset.habit, el.dataset.iso, { min: Number.isFinite(n) && n > 0 ? Math.min(1440, n) : null }, el);
  } else if (kind === 'book') {
    commit(S.updateHabit(state, 'read', (h) => { h.config.book = el.value.trim().slice(0, 120); return h; }));
    toast('Libro salvato', I.book);
  } else if (kind === 'wake') {
    if (D.isValidTime(el.value)) commit(S.updateHabit(state, 'sleep', (h) => { h.config.wake = el.value; return h; }));
  } else if (kind === 'reading-reminder') {
    if (D.isValidTime(el.value)) commit(S.setSettings(state, { reminders: { reading: el.value } }));
  } else if (kind === 'draft-name') {
    ui.draft.name = el.value;
  } else if (kind === 'journey-start') {
    const v = el.value;
    const j = c.journey;
    if (!D.isValidISO(v) || v === j.start) return render();
    const ok = await dialog({
      title: 'Cambiare la data di inizio?',
      text: `Il percorso andrà dal ${D.formatDateShort(v)} al ${D.formatDateShort(D.addDays(v, 29))}. Le registrazioni restano tutte salvate.`,
      actions: [{ label: 'Annulla', value: false }, { label: 'Cambia', value: true, style: 'strong' }],
    });
    if (ok) {
      V.animMemory.clear();
      commit(S.setJourneyStart(state, v));
      toast('Data di inizio aggiornata');
    } else render();
  }
}

// ---------- Orologio: cambio di giorno, conto alla rovescia, timer ----------
function tick() {
  const now = new Date();
  const lt = D.logicalToday(now);
  if (lt !== today) {
    today = lt;
    state = S.setMeta(state, { lastOpen: today });
    save();
    compute();
    render();
    celebrate();
    return;
  }
  const mins = now.getHours() < D.DAY_CUTOFF_HOUR ? null : D.minutesToMidnight(now);
  document.querySelectorAll('[data-countdown]').forEach((n) => {
    n.textContent = mins === null ? 'Mezzanotte è passata: chiudi tutto e vai a dormire' : `Mancano ${D.formatDuration(mins)} a mezzanotte`;
  });
  document.querySelectorAll('[data-routine]').forEach((n) => { n.textContent = V.routineText(now); });
  document.querySelectorAll('[data-prep-line]').forEach((n) => {
    const txt = V.prepLine(Math.max(0, Math.ceil((Number(n.dataset.prepLine) - now) / 60000)));
    if (n.textContent !== txt) n.textContent = txt;
  });
  document.querySelectorAll('[data-prep]').forEach((n) => {
    const html = V.prepCount(Math.max(0, Math.ceil((Number(n.dataset.prep) - now) / 60000)));
    if (n.innerHTML !== html) n.innerHTML = html;
  });
  const t = getTimer();
  if (t) {
    const ms = timerElapsed(t);
    const s = Math.floor(ms / 1000);
    const txt = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
    document.querySelectorAll('[data-timer]').forEach((n) => { n.textContent = txt; });
    const ringEl = document.querySelector('[data-timer-ring]');
    if (ringEl) {
      const goal = Number(ringEl.dataset.goal);
      const already = Number(ringEl.dataset.already);
      const p = Math.min(1, (already + ms) / goal);
      const circ = Number(ringEl.getAttribute('stroke-dasharray'));
      ringEl.style.strokeDashoffset = String(circ * (1 - p));
      const reached = p >= 1;
      ringEl.closest('.t-ring')?.classList.toggle('reached', reached);
      const lbl = document.querySelector('[data-timer-label]');
      if (lbl) lbl.textContent = !t.since ? 'in pausa' : reached ? 'obiettivo raggiunto' : 'in lettura';
      if (reached && !ui.timerGoalNotified && t.since) {
        ui.timerGoalNotified = true;
        FX.haptic('success');
        FX.sound('soft');
      }
    }
  }
}

// ---------- Service worker: aggiornamenti automatici e sicuri ----------
function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  const hadController = !!navigator.serviceWorker.controller;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return;
    reloading = true;
    save();
    window.location.reload();
  });
  navigator.serviceWorker.register('sw.js').then((reg) => {
    const check = () => reg.update().catch(() => {});
    document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
    setInterval(check, 60 * 60 * 1000);
  }).catch(() => {});
}

// ---------- Avvio ----------
async function boot() {
  const { s, source } = await loadState();
  state = s;
  document.querySelector('#svg-defs defs')?.insertAdjacentHTML('beforeend', medalDefs());
  // un timer avviato prima dell'inizio del percorso non può contare: viene chiuso senza effetti
  const ts = E.trackingStart(state);
  const tmr = getTimer();
  if (tmr && (!ts || tmr.iso < ts)) setTimer(null);
  FX.configure(state.settings);
  shell();
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el || el.disabled) return;
    const fn = actions[el.dataset.action];
    if (fn) fn(el, e);
  });
  document.addEventListener('change', onChange);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
  window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener?.('change', () => FX.configure(state.settings));
  setInterval(tick, 1000);

  if (state.journeys.length) {
    compute();
    // rientro dopo qualche giorno: messaggio positivo e possibilità di recuperare
    const last = state.meta.lastOpen;
    if (last && D.diffDays(last, today) >= 3 && E.journeyState(state.journeys[state.journeys.length - 1], today) !== 'upcoming') {
      const ts = E.trackingStart(state);
      const from = D.maxISO(D.maxISO(last, D.addDays(today, -7)), ts);
      const days = from <= D.addDays(today, -1) ? D.rangeISO(from, D.addDays(today, -1)).filter((d) => {
        const info = E.dayInfo(state, d, today);
        return Object.values(info.status).some((x) => x === 'unlogged' || x === 'pending' || x === 'partial');
      }).reverse() : [];
      if (days.length) ui.away = { days };
    }
    state = S.setMeta(state, { lastOpen: today });
    const firstRun = !state.meta.seen.welcome;
    if (firstRun) {
      markAllSeen();
      state = S.setMeta(state, { seen: { ...state.meta.seen, welcome: VERSION } });
    }
    save();
    compute();
    ui.lastXp = c.xp.total;
    render();
    if (firstRun) overlayQueue.push({ cls: 'ov-welcome-wrap', html: V.overlayWelcome(ctx()) });
    celebrate();
    nextOverlay();
    navigator.storage?.persist?.().catch(() => {});
  } else {
    render();
  }
  registerSW();
  window.__mezzanotte = { get state() { return state; }, get computed() { return c; }, store: S, engine: E, core: D, version: VERSION, source };
}

boot();
