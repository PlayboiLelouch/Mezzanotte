// MEZZANOTTE — schema dei dati, migrazioni versionate e modifiche (funzioni pure).
//
// Schema 1 (app 1.x, chiave "mezzanotte:v1"):
//   { app, version: 1, start, days: { iso: { bed, sleep, min } }, settings: { book }, archive: [{ start, days, endedAt }] }
// Schema 2 (app 3.x, chiave "mezzanotte:v2"):
//   abitudini generiche, registrazioni per abitudine, percorsi, impostazioni, metadati.
//
// Regole: le migrazioni non perdono mai dati, sono idempotenti e verificate dai test.

import * as D from './core.js';

export const APP_ID = 'mezzanotte';
export const SCHEMA_VERSION = 3;
// Inizio ufficiale della sfida: i giorni precedenti erano di prova (schema 3).
export const OFFICIAL_START = '2026-11-30';
export const KEY_V1 = 'mezzanotte:v1';
export const KEY_V2 = 'mezzanotte:v2';
export const KEY_PRE_MIGRATION = 'mezzanotte:backup-pre-3.0';
export const KEY_PRE_31 = 'mezzanotte:backup-pre-3.1';
export const JOURNEY_DAYS = 30;
export const DEFAULT_PLAN = Object.freeze({ sleep: [4, 5, 5, 6], read: [4, 5, 6, 6] });
export const EPOCH = '1970-01-01';
export const HABIT_TYPES = ['bedtime', 'duration', 'check'];
export const HABIT_COLORS = ['sleep', 'read', 'gold', 'sky', 'rose'];
export const HABIT_ICONS = ['moon', 'book', 'run', 'leaf', 'pen', 'drop', 'bolt', 'spark'];

const nowStamp = () => new Date().toISOString();
const isObj = (o) => !!o && typeof o === 'object' && !Array.isArray(o);
const str = (s, max) => (typeof s === 'string' ? s.trim().slice(0, max) : '');
const clampInt = (n, lo, hi) => Math.min(hi, Math.max(lo, Math.round(n)));

// ---------- Abitudini predefinite ----------
export function defaultHabits() {
  return [
    {
      id: 'sleep', type: 'bedtime', name: 'Sonno', icon: 'moon', color: 'sleep', since: EPOCH, archivedAt: null,
      config: { deadline: '00:00', freeWeekdays: [6], wake: '07:00', hoursGoal: 7, routine: true },
    },
    {
      id: 'read', type: 'duration', name: 'Lettura', icon: 'book', color: 'read', since: EPOCH, archivedAt: null,
      config: { goals: [{ from: EPOCH, min: 5 }], book: '' },
    },
  ];
}

export function createState() {
  const now = nowStamp();
  return {
    app: APP_ID,
    version: SCHEMA_VERSION,
    habits: defaultHabits(),
    entries: { sleep: {}, read: {} },
    journeys: [],
    settings: { sound: false, haptics: true, motion: 'system', reminders: { routine: '23:15', reading: '21:30' } },
    meta: {
      seen: { achievements: [], level: 1, phases: [], summaries: [], goals: [], recaps: [], welcome: null },
      lastOpen: null,
      lastExport: null,
      proposals: {},
      v1MirrorAt: null,
    },
    legacy: null,
    trial: null,
    migrations: [],
    createdAt: now,
    updatedAt: now,
  };
}

// ---------- Normalizzazione delle registrazioni ----------
function normSleep(e, deadline = '00:00') {
  if (!isObj(e)) return null;
  const out = {};
  if (typeof e.ok === 'boolean') out.ok = e.ok;
  if (D.isValidTime(e.bed)) {
    out.bed = e.bed;
    out.ok = D.bedtimeOnTime(e.bed, deadline);
  }
  const h = Number(e.hours);
  if (e.hours !== null && e.hours !== undefined && Number.isFinite(h) && h > 0) out.hours = Math.min(16, Math.round(h * 2) / 2);
  return Object.keys(out).length ? out : null;
}

function normDuration(e) {
  if (!isObj(e)) return null;
  const min = Number(e.min);
  if (!Number.isFinite(min) || min <= 0) return null;
  return { min: Math.min(clampInt(min, 1, 1440), 1440) };
}

function normCheck(e) {
  if (!isObj(e) || typeof e.done !== 'boolean') return null;
  return { done: e.done };
}

export function normalizeEntry(habit, e) {
  if (habit.type === 'bedtime') return normSleep(e, habit.config?.deadline);
  if (habit.type === 'duration') return normDuration(e);
  return normCheck(e);
}

function normEntryMap(habit, map) {
  const out = {};
  if (!isObj(map)) return out;
  for (const iso of Object.keys(map).sort()) {
    if (!D.isValidISO(iso)) continue;
    const n = normalizeEntry(habit, map[iso]);
    if (n) out[iso] = n;
  }
  return out;
}

// ---------- Normalizzazione delle abitudini ----------
function normHabit(h, fallback) {
  const base = fallback ? JSON.parse(JSON.stringify(fallback)) : null;
  if (!isObj(h)) return base;
  const id = str(h.id, 40);
  if (!/^[a-z0-9-]+$/.test(id)) return base;
  const type = HABIT_TYPES.includes(h.type) ? h.type : base?.type;
  if (!type) return null;
  const out = {
    id,
    type,
    name: str(h.name, 40) || base?.name || 'Abitudine',
    icon: HABIT_ICONS.includes(h.icon) ? h.icon : base?.icon || 'spark',
    color: HABIT_COLORS.includes(h.color) ? h.color : base?.color || 'gold',
    since: D.isValidISO(h.since) ? h.since : base?.since || EPOCH,
    archivedAt: D.isValidISO(h.archivedAt) ? h.archivedAt : null,
    config: {},
  };
  const c = isObj(h.config) ? h.config : {};
  const bc = base?.config || {};
  if (type === 'bedtime') {
    out.config.deadline = D.isValidTime(c.deadline) ? c.deadline : bc.deadline || '00:00';
    const fw = Array.isArray(c.freeWeekdays) ? c.freeWeekdays : bc.freeWeekdays || [];
    out.config.freeWeekdays = [...new Set(fw.filter((n) => Number.isInteger(n) && n >= 0 && n <= 6))].sort();
    out.config.wake = D.isValidTime(c.wake) ? c.wake : bc.wake || '07:00';
    const hg = Number(c.hoursGoal);
    out.config.hoursGoal = Number.isFinite(hg) && hg >= 5 && hg <= 10 ? Math.round(hg * 2) / 2 : bc.hoursGoal || 7;
    out.config.routine = typeof c.routine === 'boolean' ? c.routine : bc.routine !== false;
  } else if (type === 'duration') {
    const goals = (Array.isArray(c.goals) ? c.goals : bc.goals || [{ from: EPOCH, min: 5 }])
      .filter((g) => isObj(g) && D.isValidISO(g.from) && Number.isFinite(Number(g.min)) && Number(g.min) >= 1)
      .map((g) => ({ from: g.from, min: clampInt(Number(g.min), 1, 240) }))
      .sort((a, b) => (a.from < b.from ? -1 : 1));
    const dedup = [];
    for (const g of goals) {
      if (dedup.length && dedup[dedup.length - 1].from === g.from) dedup[dedup.length - 1] = g;
      else dedup.push(g);
    }
    out.config.goals = dedup.length ? dedup : [{ from: EPOCH, min: 5 }];
    out.config.book = str(c.book ?? bc.book, 120);
  }
  if (type !== 'bedtime') {
    const pw = Number(c.perWeek ?? bc.perWeek);
    if (Number.isFinite(pw)) out.config.perWeek = clampInt(pw, 1, 7);
    else if (id !== 'read') out.config.perWeek = 5;
  }
  return out;
}

function normJourney(j, i) {
  if (!isObj(j) || !D.isValidISO(j.start)) return null;
  const plan = {};
  if (isObj(j.plan)) {
    for (const [hid, arr] of Object.entries(j.plan)) {
      if (Array.isArray(arr) && arr.length === 4 && arr.every((n) => Number.isFinite(Number(n)))) {
        plan[hid] = arr.map((n) => clampInt(Number(n), 1, 7));
      }
    }
  }
  if (!plan.sleep) plan.sleep = [...DEFAULT_PLAN.sleep];
  if (!plan.read) plan.read = [...DEFAULT_PLAN.read];
  const adjust = {};
  if (isObj(j.adjust)) {
    for (const [idx, m] of Object.entries(j.adjust)) {
      if (!/^\d+$/.test(idx) || !isObj(m)) continue;
      const o = {};
      for (const [hid, n] of Object.entries(m)) if (Number.isFinite(Number(n))) o[hid] = clampInt(Number(n), 1, 7);
      if (Object.keys(o).length) adjust[idx] = o;
    }
  }
  return {
    id: Number.isInteger(j.id) && j.id > 0 ? j.id : i + 1,
    start: j.start,
    length: JOURNEY_DAYS,
    plan,
    adjust,
    endedAt: D.isValidISO(j.endedAt) ? j.endedAt : null,
  };
}

function normJourneys(list) {
  const arr = (Array.isArray(list) ? list : []).map(normJourney).filter(Boolean).sort((a, b) => (a.start < b.start ? -1 : 1));
  const out = [];
  for (const j of arr) {
    if (out.length && out[out.length - 1].start === j.start) out[out.length - 1] = j;
    else out.push(j);
  }
  // un percorso termina al più tardi il giorno prima dell'inizio del successivo
  out.forEach((j, i) => {
    j.id = i + 1;
    const next = out[i + 1];
    if (next) {
      const cap = D.addDays(next.start, -1);
      const nominal = D.addDays(j.start, JOURNEY_DAYS - 1);
      if (!j.endedAt || j.endedAt > cap) j.endedAt = nominal > cap ? cap : null;
      if (j.endedAt && j.endedAt >= nominal) j.endedAt = null;
    }
  });
  return out;
}

function normStringList(a, max = 500) {
  return Array.isArray(a) ? [...new Set(a.filter((s) => typeof s === 'string' && s.length < 80))].slice(0, max) : [];
}

// Valida e normalizza uno stato in formato 2 (caricamento e importazione).
export function validateV2(raw) {
  const s = createState();
  // abitudini: sonno e lettura sempre presenti
  const given = Array.isArray(raw.habits) ? raw.habits : [];
  const defs = defaultHabits();
  const habits = defs.map((d) => normHabit(given.find((h) => h && h.id === d.id), d));
  for (const h of given) {
    if (!h || h.id === 'sleep' || h.id === 'read') continue;
    const n = normHabit(h, null);
    if (n && !habits.some((x) => x.id === n.id)) habits.push(n);
  }
  s.habits = habits.slice(0, 12);
  s.entries = {};
  for (const h of s.habits) s.entries[h.id] = normEntryMap(h, raw.entries?.[h.id]);
  s.journeys = normJourneys(raw.journeys);

  const st = isObj(raw.settings) ? raw.settings : {};
  s.settings.sound = st.sound === true;
  s.settings.haptics = st.haptics !== false;
  s.settings.motion = st.motion === 'reduce' ? 'reduce' : 'system';
  const rem = isObj(st.reminders) ? st.reminders : {};
  s.settings.reminders.routine = D.isValidTime(rem.routine) ? rem.routine : '23:15';
  s.settings.reminders.reading = D.isValidTime(rem.reading) ? rem.reading : '21:30';

  const m = isObj(raw.meta) ? raw.meta : {};
  const seen = isObj(m.seen) ? m.seen : {};
  s.meta.seen.achievements = normStringList(seen.achievements);
  s.meta.seen.phases = normStringList(seen.phases);
  s.meta.seen.summaries = normStringList(seen.summaries);
  s.meta.seen.goals = normStringList(seen.goals);
  s.meta.seen.recaps = normStringList(seen.recaps);
  s.meta.seen.level = Number.isInteger(seen.level) && seen.level > 0 ? seen.level : 1;
  s.meta.seen.welcome = typeof seen.welcome === 'string' ? seen.welcome.slice(0, 20) : null;
  s.meta.lastOpen = D.isValidISO(m.lastOpen) ? m.lastOpen : null;
  s.meta.lastExport = typeof m.lastExport === 'string' ? m.lastExport.slice(0, 40) : null;
  s.meta.v1MirrorAt = typeof m.v1MirrorAt === 'string' ? m.v1MirrorAt.slice(0, 40) : null;
  if (isObj(m.proposals)) {
    for (const [k, v] of Object.entries(m.proposals)) {
      if (k.length > 80 || !isObj(v)) continue;
      if (v.decision !== 'accepted' && v.decision !== 'declined') continue;
      s.meta.proposals[k] = { decision: v.decision, at: D.isValidISO(v.at) ? v.at : null };
    }
  }
  s.legacy = isObj(raw.legacy) ? raw.legacy : null;
  s.trial = isObj(raw.trial) && isObj(raw.trial.entries) ? raw.trial : null;
  s.migrations = Array.isArray(raw.migrations)
    ? raw.migrations.filter((x) => isObj(x) && Number.isInteger(x.from) && Number.isInteger(x.to)).map((x) => ({ from: x.from, to: x.to, at: typeof x.at === 'string' ? x.at : null }))
    : [];
  if (typeof raw.createdAt === 'string') s.createdAt = raw.createdAt;
  if (typeof raw.updatedAt === 'string') s.updatedAt = raw.updatedAt;
  return s;
}

// ---------- Schema 1 ----------
function normV1Days(days) {
  const out = {};
  if (!isObj(days)) return out;
  for (const [iso, e] of Object.entries(days)) {
    if (!D.isValidISO(iso) || !isObj(e)) continue;
    const n = {};
    if (D.isValidTime(e.bed)) n.bed = e.bed;
    if (typeof e.sleep === 'boolean') n.sleep = e.sleep;
    if (n.bed) n.sleep = D.bedtimeOnTime(n.bed);
    const min = Number(e.min);
    if (Number.isFinite(min) && min > 0) n.min = Math.min(Math.round(min), 1440);
    if (Object.keys(n).length) out[iso] = n;
  }
  return out;
}

export function validateV1(raw) {
  if (raw.start !== null && raw.start !== undefined && !D.isValidISO(raw.start)) throw new Error('Data di inizio non valida.');
  return {
    app: APP_ID,
    version: 1,
    start: raw.start || null,
    days: normV1Days(raw.days),
    settings: { book: typeof raw.settings?.book === 'string' ? raw.settings.book.slice(0, 120) : '' },
    archive: Array.isArray(raw.archive)
      ? raw.archive.filter((a) => a && D.isValidISO(a.start)).map((a) => ({ start: a.start, days: normV1Days(a.days), endedAt: typeof a.endedAt === 'string' ? a.endedAt : null }))
      : [],
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : null,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : null,
  };
}

function applyV1Days(entries, days) {
  for (const [iso, e] of Object.entries(days)) {
    if (typeof e.sleep === 'boolean' || e.bed) {
      const se = {};
      if (typeof e.sleep === 'boolean') se.ok = e.sleep;
      if (e.bed) se.bed = e.bed;
      const prev = entries.sleep[iso];
      entries.sleep[iso] = prev?.hours ? { ...se, hours: prev.hours } : se;
    }
    if (e.min) entries.read[iso] = { min: e.min };
  }
}

// Migrazione 1 → 2. Nessun dato viene scartato: l'archivio originale resta in legacy.
export function migrateV1(v1raw, at = nowStamp()) {
  const v1 = validateV1(v1raw);
  const s = createState();
  const entries = { sleep: {}, read: {} };
  // prima i giorni archiviati, poi quelli attuali (più recenti, hanno la precedenza)
  for (const a of [...v1.archive].sort((x, y) => (x.start < y.start ? -1 : 1))) applyV1Days(entries, a.days);
  applyV1Days(entries, v1.days);
  const journeys = [];
  for (const a of v1.archive) {
    if (v1.start && a.start >= v1.start) continue;
    const ended = typeof a.endedAt === 'string' ? D.toISO(new Date(a.endedAt)) : null;
    journeys.push({ start: a.start, endedAt: ended && D.isValidISO(ended) ? D.addDays(ended, -1) : null });
  }
  if (v1.start) journeys.push({ start: v1.start, endedAt: null });
  const raw = {
    ...s,
    habits: defaultHabits().map((h) => (h.id === 'read' ? { ...h, config: { ...h.config, book: v1.settings.book } } : h)),
    entries,
    journeys,
    legacy: v1.archive.length ? { v1Archive: v1.archive } : null,
    migrations: [{ from: 1, to: 2, at }],
    createdAt: v1.createdAt || s.createdAt,
    updatedAt: v1.updatedAt || s.updatedAt,
  };
  return validateV2(raw);
}

// Punto d'ingresso unico: accetta dati in qualsiasi formato supportato.
export function migrate(raw, at = nowStamp()) {
  if (!isObj(raw)) throw new Error('File non valido.');
  if (raw.app !== APP_ID) throw new Error('Questo file non è un backup di MEZZANOTTE.');
  if (typeof raw.version !== 'number' || raw.version > SCHEMA_VERSION || raw.version < 1) {
    throw new Error('Versione del backup non supportata.');
  }
  let s = raw.version === 1 ? migrateV1(raw, at) : validateV2(raw);
  if (raw.version < 3) s = migrateOfficialStart(s, at);
  s.version = SCHEMA_VERSION;
  return s;
}

// Migrazione 2 → 3: la sfida ufficiale inizia il 30 novembre 2026.
// Le registrazioni precedenti (giorni di prova), i percorsi di prova e le abitudini create durante la prova
// vengono spostati in "trial": esclusi da percorso, XP e statistiche, ma mai cancellati.
export function migrateOfficialStart(state, at = nowStamp(), start = OFFICIAL_START) {
  const trialEntries = {};
  const entries = {};
  let moved = 0;
  for (const [hid, map] of Object.entries(state.entries)) {
    entries[hid] = {};
    for (const [iso, e] of Object.entries(map)) {
      if (iso < start) {
        (trialEntries[hid] = trialEntries[hid] || {})[iso] = e;
        moved++;
      } else entries[hid][iso] = e;
    }
  }
  const trialHabits = [];
  const habits = state.habits.map((h) => {
    if (h.id === 'sleep' || h.id === 'read' || h.since >= start) return h;
    trialHabits.push(h.id);
    return { ...h, archivedAt: h.archivedAt && h.archivedAt < start ? h.archivedAt : D.addDays(start, -1) };
  });
  const hadData = moved > 0 || state.journeys.length > 0;
  const prevTrial = state.trial && isObj(state.trial.entries) ? state.trial : null;
  if (prevTrial) {
    for (const [hid, map] of Object.entries(prevTrial.entries)) trialEntries[hid] = { ...map, ...(trialEntries[hid] || {}) };
  }
  const trial = hadData || prevTrial
    ? {
        entries: trialEntries,
        journeys: [...(prevTrial?.journeys || []), ...state.journeys.filter((j) => j.start < start)],
        habits: [...new Set([...(prevTrial?.habits || []), ...trialHabits])],
        archivedAt: prevTrial?.archivedAt || at,
      }
    : null;
  const keep = state.journeys.filter((j) => j.start >= start);
  const journeys = keep.length ? keep : (state.journeys.length ? [{ id: 1, start, plan: { ...DEFAULT_PLAN, sleep: [...DEFAULT_PLAN.sleep], read: [...DEFAULT_PLAN.read] }, adjust: {}, endedAt: null }] : []);
  const out = validateV2({
    ...state,
    habits,
    entries,
    journeys: journeys.map((j, i) => ({ ...j, id: i + 1 })),
    trial,
    meta: {
      ...state.meta,
      seen: { achievements: [], level: 1, phases: [], summaries: [], goals: [], recaps: [], welcome: state.journeys.length ? null : state.meta.seen.welcome },
      proposals: {},
      lastOpen: null,
    },
    migrations: [...state.migrations, { from: 2, to: 3, at }],
  });
  out.version = SCHEMA_VERSION;
  return out;
}

export function trialSummary(state) {
  if (!state.trial) return null;
  const days = new Set();
  for (const map of Object.values(state.trial.entries)) for (const iso of Object.keys(map)) days.add(iso);
  const list = [...days].sort();
  return { days: list.length, from: list[0] || null, to: list[list.length - 1] || null };
}

// Copia compatibile con l'app 1.x: permette di tornare alla versione precedente senza perdere i progressi.
export function toV1(state) {
  const days = {};
  for (const [iso, e] of Object.entries(state.entries.sleep || {})) {
    const d = {};
    if (typeof e.ok === 'boolean') d.sleep = e.ok;
    if (e.bed) d.bed = e.bed;
    if (Object.keys(d).length) days[iso] = d;
  }
  for (const [iso, e] of Object.entries(state.entries.read || {})) days[iso] = { ...(days[iso] || {}), min: e.min };
  const cur = state.journeys[state.journeys.length - 1] || null;
  return {
    app: APP_ID,
    version: 1,
    start: cur ? cur.start : null,
    days,
    settings: { book: habitById(state, 'read')?.config.book || '' },
    archive: [],
    createdAt: state.createdAt,
    updatedAt: state.updatedAt,
  };
}

// Se l'app 1.x ha scritto dati dopo l'ultima copia (es. ritorno temporaneo alla versione precedente), li recupera.
export function mergeNewerV1(state, v1raw) {
  if (!isObj(v1raw) || v1raw.app !== APP_ID || v1raw.version !== 1) return { state, merged: false };
  const stamp = typeof v1raw.updatedAt === 'string' ? v1raw.updatedAt : '';
  if (!state.meta.v1MirrorAt || !stamp || stamp <= state.meta.v1MirrorAt) return { state, merged: false };
  let v1;
  try { v1 = validateV1(v1raw); } catch { return { state, merged: false }; }
  const entries = JSON.parse(JSON.stringify(state.entries));
  const from = state.journeys[0]?.start || OFFICIAL_START;
  applyV1Days(entries, Object.fromEntries(Object.entries(v1.days).filter(([iso]) => iso >= from)));
  let next = { ...state, entries };
  const cur = next.journeys[next.journeys.length - 1];
  if (v1.start && v1.start >= from && (!cur || cur.start !== v1.start)) next = setJourneyStart(next, v1.start);
  return { state: validateV2({ ...next, meta: { ...next.meta, v1MirrorAt: stamp } }), merged: true };
}

// ---------- Accesso ----------
export function habitById(state, id) {
  return state.habits.find((h) => h.id === id) || null;
}

export function touch(state) {
  return { ...state, updatedAt: nowStamp() };
}

// ---------- Modifiche ----------
export function setEntry(state, habitId, iso, patch) {
  const habit = habitById(state, habitId);
  if (!habit || !D.isValidISO(iso)) return state;
  const cur = { ...(state.entries[habitId]?.[iso] || {}) };
  for (const [k, v] of Object.entries(patch)) {
    if (v === null || v === undefined) delete cur[k];
    else cur[k] = v;
  }
  // scelta manuale contraria all'orario salvato: l'orario viene rimosso
  if (habit.type === 'bedtime' && 'ok' in patch && !('bed' in patch) && cur.bed && D.bedtimeOnTime(cur.bed, habit.config.deadline) !== cur.ok) {
    delete cur.bed;
  }
  const n = normalizeEntry(habit, cur);
  const map = { ...(state.entries[habitId] || {}) };
  if (n) map[iso] = n;
  else delete map[iso];
  return touch({ ...state, entries: { ...state.entries, [habitId]: map } });
}

export function updateHabit(state, id, fn) {
  const habits = state.habits.map((h) => (h.id === id ? normHabit(fn(JSON.parse(JSON.stringify(h))), h) : h));
  return touch({ ...state, habits });
}

export function addHabit(state, { name, type, icon, color, perWeek, min }, today) {
  const base = str(name, 40) || 'Nuova abitudine';
  let id = base.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'abitudine';
  if (id === 'sleep' || id === 'read') id = `${id}-2`;
  let k = 2;
  const ids = new Set(state.habits.map((h) => h.id));
  const root = id;
  while (ids.has(id)) id = `${root}-${k++}`;
  const t = type === 'duration' ? 'duration' : 'check';
  const habit = normHabit({
    id, type: t, name: base, icon, color, since: today, archivedAt: null,
    config: t === 'duration' ? { goals: [{ from: today, min: clampInt(Number(min) || 10, 1, 240) }], perWeek } : { perWeek },
  }, null);
  return touch({ ...state, habits: [...state.habits, habit], entries: { ...state.entries, [habit.id]: {} } });
}

export function archiveHabit(state, id, today) {
  if (id === 'sleep' || id === 'read') return state;
  return touch({ ...state, habits: state.habits.map((h) => (h.id === id ? { ...h, archivedAt: D.addDays(today, -1) } : h)) });
}

export function setDurationGoal(state, id, min, fromIso) {
  return updateHabit(state, id, (h) => {
    const goals = h.config.goals.filter((g) => g.from < fromIso);
    goals.push({ from: fromIso, min });
    h.config.goals = goals;
    return h;
  });
}

export const setReadGoal = (state, min, fromIso) => setDurationGoal(state, 'read', min, fromIso);

// Ripristina esattamente una registrazione precedente (per "Annulla").
export function restoreEntry(state, habitId, iso, prev) {
  const map = { ...(state.entries[habitId] || {}) };
  if (prev) map[iso] = { ...prev };
  else delete map[iso];
  return touch({ ...state, entries: { ...state.entries, [habitId]: map } });
}

export function setSettings(state, patch) {
  return touch({ ...state, settings: { ...state.settings, ...patch, reminders: { ...state.settings.reminders, ...(patch.reminders || {}) } } });
}

export function setMeta(state, patch) {
  return { ...state, meta: { ...state.meta, ...patch, seen: { ...state.meta.seen, ...(patch.seen || {}) } } };
}

// Avvia un nuovo percorso: quello in corso si chiude, lo storico resta intatto.
export function startJourney(state, start, plan = DEFAULT_PLAN) {
  const journeys = state.journeys.map((j) => ({ ...j }));
  const cur = journeys[journeys.length - 1];
  if (cur && start <= cur.start) {
    // stesso giorno o precedente: sostituisce l'inizio del percorso attuale
    cur.start = start;
    cur.plan = JSON.parse(JSON.stringify(plan));
    cur.adjust = {};
    cur.endedAt = null;
    return touch({ ...state, journeys: normJourneys(journeys) });
  }
  if (cur) {
    const nominal = D.addDays(cur.start, JOURNEY_DAYS - 1);
    const cap = D.addDays(start, -1);
    if (nominal > cap) cur.endedAt = cap;
  }
  journeys.push({ id: journeys.length + 1, start, plan: JSON.parse(JSON.stringify(plan)), adjust: {}, endedAt: null });
  return touch({ ...state, journeys: normJourneys(journeys) });
}

export function setJourneyStart(state, start) {
  if (!state.journeys.length) return startJourney(state, start);
  const journeys = state.journeys.map((j) => ({ ...j }));
  const prev = journeys[journeys.length - 2];
  if (prev && start <= prev.start) return state;
  journeys[journeys.length - 1].start = start;
  if (prev) prev.endedAt = null;
  return touch({ ...state, journeys: normJourneys(journeys) });
}

export function setJourneyAdjust(state, journeyId, blockIdx, habitId, target) {
  const journeys = state.journeys.map((j) => {
    if (j.id !== journeyId) return j;
    const adjust = { ...j.adjust, [blockIdx]: { ...(j.adjust[blockIdx] || {}), [habitId]: target } };
    return { ...j, adjust };
  });
  return touch({ ...state, journeys });
}

export function decideProposal(state, key, decision, today) {
  return touch({ ...state, meta: { ...state.meta, proposals: { ...state.meta.proposals, [key]: { decision, at: today } } } });
}

// ---------- Esportazione / importazione ----------
export function exportPayload(state) {
  return JSON.stringify({ ...state, exportedAt: nowStamp() }, null, 2);
}

export function importPayload(text) {
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('Il file non contiene JSON valido.');
  }
  return migrate(raw);
}

export function countEntries(state) {
  const days = new Set();
  for (const map of Object.values(state.entries)) for (const iso of Object.keys(map)) days.add(iso);
  return days.size;
}
