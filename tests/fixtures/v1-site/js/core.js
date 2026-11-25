// MEZZANOTTE — logica pura della sfida (nessuna dipendenza dal DOM).
// Usata dall'app e dai test automatici.

export const APP_ID = 'mezzanotte';
export const SCHEMA_VERSION = 1;
export const CHALLENGE_DAYS = 30;
export const READ_GOAL_MIN = 5;
export const DAY_CUTOFF_HOUR = 5; // prima delle 5:00 conta ancora come "ieri"

// Obiettivi progressivi: 4 settimane da 7 giorni + finale di 2 giorni.
export const BLOCKS = [
  { n: 1, label: 'Settimana 1', from: 0, to: 6, sleep: 4, read: 4 },
  { n: 2, label: 'Settimana 2', from: 7, to: 13, sleep: 5, read: 5 },
  { n: 3, label: 'Settimana 3', from: 14, to: 20, sleep: 5, read: 6 },
  { n: 4, label: 'Settimana 4', from: 21, to: 27, sleep: 6, read: 6 },
  { n: 5, label: 'Finale', from: 28, to: 29, sleep: null, read: 2 }, // sonno: tutte le notti valide
];

export const WEEKDAYS_SHORT = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];
export const WEEKDAYS_LONG = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
export const MONTHS_SHORT = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
export const MONTHS_LONG = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];

// ---------- Date ----------
const pad = (n) => String(n).padStart(2, '0');
const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function toISO(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Mezzogiorno locale: evita problemi con il cambio dell'ora legale.
export function parseISO(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

export function isValidISO(iso) {
  if (typeof iso !== 'string' || !ISO_RE.test(iso)) return false;
  return toISO(parseISO(iso)) === iso;
}

export function addDays(iso, n) {
  const d = parseISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

export function diffDays(a, b) {
  // b - a, in giorni
  return Math.round((parseISO(b) - parseISO(a)) / 86400000);
}

export function weekday(iso) {
  return parseISO(iso).getDay();
}

export function isSaturday(iso) {
  return weekday(iso) === 6;
}

export function logicalToday(now = new Date(), cutoffHour = DAY_CUTOFF_HOUR) {
  const d = new Date(now.getTime());
  if (d.getHours() < cutoffHour) d.setDate(d.getDate() - 1);
  return toISO(d);
}

export function formatDateShort(iso) {
  const d = parseISO(iso);
  return `${WEEKDAYS_SHORT[d.getDay()]} ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
}

export function formatDateLong(iso) {
  const d = parseISO(iso);
  return `${WEEKDAYS_LONG[d.getDay()]} ${d.getDate()} ${MONTHS_LONG[d.getMonth()]}`;
}

// ---------- Orari ----------
export function isValidTime(t) {
  return typeof t === 'string' && TIME_RE.test(t);
}

export function timeToMinutes(t) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

// Minuti rispetto alla mezzanotte: 23:30 → -30, 00:00 → 0, 00:45 → 45.
// Orari dalle 12:00 in poi sono "prima" di mezzanotte.
export function bedtimeOffset(t) {
  const m = timeToMinutes(t);
  return m >= 12 * 60 ? m - 1440 : m;
}

export function bedtimeOnTime(t) {
  return bedtimeOffset(t) <= 0;
}

export function offsetToTime(off) {
  let m = Math.round(off);
  m = ((m % 1440) + 1440) % 1440;
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

// ---------- Stato ----------
export function createState(start = null) {
  const now = new Date().toISOString();
  return {
    app: APP_ID,
    version: SCHEMA_VERSION,
    start,
    days: {},
    settings: { book: '' },
    archive: [],
    createdAt: now,
    updatedAt: now,
  };
}

function normalizeEntry(e) {
  if (!e || typeof e !== 'object') return null;
  const out = {};
  if (isValidTime(e.bed)) out.bed = e.bed;
  if (typeof e.sleep === 'boolean') out.sleep = e.sleep;
  if (out.bed) out.sleep = bedtimeOnTime(out.bed);
  const min = Number(e.min);
  if (Number.isFinite(min) && min > 0) out.min = Math.min(Math.round(min), 1440);
  return Object.keys(out).length ? out : null;
}

function normalizeDays(days) {
  const out = {};
  if (days && typeof days === 'object') {
    for (const [iso, e] of Object.entries(days)) {
      if (!isValidISO(iso)) continue;
      const n = normalizeEntry(e);
      if (n) out[iso] = n;
    }
  }
  return out;
}

// Valida e normalizza uno stato (per caricamento e importazione).
export function validateState(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('File non valido.');
  if (raw.app !== APP_ID) throw new Error('Questo file non è un backup di MEZZANOTTE.');
  if (typeof raw.version !== 'number' || raw.version > SCHEMA_VERSION) {
    throw new Error('Versione del backup non supportata.');
  }
  if (raw.start !== null && raw.start !== undefined && !isValidISO(raw.start)) {
    throw new Error('Data di inizio non valida.');
  }
  const base = createState(raw.start || null);
  base.days = normalizeDays(raw.days);
  base.settings.book = typeof raw.settings?.book === 'string' ? raw.settings.book.slice(0, 120) : '';
  base.archive = Array.isArray(raw.archive)
    ? raw.archive
        .filter((a) => a && isValidISO(a.start))
        .map((a) => ({ start: a.start, days: normalizeDays(a.days), endedAt: typeof a.endedAt === 'string' ? a.endedAt : null }))
    : [];
  if (typeof raw.createdAt === 'string') base.createdAt = raw.createdAt;
  if (typeof raw.updatedAt === 'string') base.updatedAt = raw.updatedAt;
  return base;
}

export function setEntry(state, iso, patch) {
  const cur = { ...(state.days[iso] || {}) };
  for (const [k, v] of Object.entries(patch)) {
    if (v === null || v === undefined) delete cur[k];
    else cur[k] = v;
  }
  if ('sleep' in patch && !('bed' in patch)) {
    // scelta manuale: se contraddice l'orario salvato, l'orario viene rimosso
    if (cur.bed && bedtimeOnTime(cur.bed) !== cur.sleep) delete cur.bed;
  }
  const n = normalizeEntry(cur);
  const days = { ...state.days };
  if (n) days[iso] = n;
  else delete days[iso];
  return { ...state, days, updatedAt: new Date().toISOString() };
}

// ---------- Sfida ----------
export function challengeDates(start) {
  return Array.from({ length: CHALLENGE_DAYS }, (_, i) => addDays(start, i));
}

export function endDate(start) {
  return addDays(start, CHALLENGE_DAYS - 1);
}

export function dayNumber(start, iso) {
  const i = diffDays(start, iso);
  return i >= 0 && i < CHALLENGE_DAYS ? i + 1 : null;
}

export function blockForIndex(i) {
  return BLOCKS.find((b) => i >= b.from && i <= b.to) || null;
}

// 'free' | 'done' | 'missed' | 'pending' | 'future'
export function sleepStatus(state, iso, today) {
  if (iso > today) return 'future';
  if (isSaturday(iso)) return 'free';
  const e = state.days[iso];
  if (e && typeof e.sleep === 'boolean') return e.sleep ? 'done' : 'missed';
  // la notte di oggi e quella di ieri si possono ancora registrare
  return iso >= addDays(today, -1) ? 'pending' : 'missed';
}

export function readStatus(state, iso, today) {
  if (iso > today) return 'future';
  const min = state.days[iso]?.min || 0;
  if (min >= READ_GOAL_MIN) return 'done';
  return iso === today ? 'pending' : 'missed';
}

export function dayInfo(state, iso, today) {
  const s = sleepStatus(state, iso, today);
  const r = readStatus(state, iso, today);
  const e = state.days[iso] || {};
  return {
    iso,
    num: state.start ? dayNumber(state.start, iso) : null,
    saturday: isSaturday(iso),
    sleep: s,
    read: r,
    bed: e.bed || null,
    min: e.min || 0,
    perfect: r === 'done' && (s === 'done' || s === 'free'),
  };
}

function streaks(statuses) {
  // statuses: array in ordine cronologico; 'free' è neutro, 'pending' non interrompe
  let cur = 0;
  let best = 0;
  for (const st of statuses) {
    if (st === 'done') {
      cur += 1;
      best = Math.max(best, cur);
    } else if (st === 'missed') {
      cur = 0;
    }
  }
  return { current: cur, best };
}

export function blockProgress(state, block, today) {
  const dates = [];
  for (let i = block.from; i <= block.to; i++) dates.push(addDays(state.start, i));
  const eligible = dates.filter((d) => !isSaturday(d));
  const sleepTarget = block.sleep ?? eligible.length;
  const readTarget = block.read;
  let sleepDone = 0;
  let readDone = 0;
  let sleepOpen = 0;
  let readOpen = 0;
  for (const d of dates) {
    const s = sleepStatus(state, d, today);
    const r = readStatus(state, d, today);
    if (s === 'done') sleepDone++;
    if (s === 'pending' || s === 'future') sleepOpen++;
    if (r === 'done') readDone++;
    if (r === 'pending' || r === 'future') readOpen++;
  }
  const first = dates[0];
  const last = dates[dates.length - 1];
  const phase = today < first ? 'future' : today > last ? 'past' : 'current';
  const sleepOk = sleepDone >= sleepTarget;
  const readOk = readDone >= readTarget;
  return {
    ...block,
    first,
    last,
    phase,
    sleepDone,
    readDone,
    sleepTarget,
    readTarget,
    sleepOk,
    readOk,
    sleepPossible: sleepDone + sleepOpen >= sleepTarget,
    readPossible: readDone + readOpen >= readTarget,
    achieved: sleepOk && readOk,
  };
}

export function computeStats(state, today) {
  if (!state.start) return null;
  const dates = challengeDates(state.start);
  const elapsed = dates.filter((d) => d <= today);
  const infos = elapsed.map((d) => dayInfo(state, d, today));

  const sleepCounted = infos.filter((i) => i.sleep === 'done' || i.sleep === 'missed');
  const readCounted = infos.filter((i) => i.read === 'done' || i.read === 'missed');
  const sleepDone = sleepCounted.filter((i) => i.sleep === 'done').length;
  const readDone = readCounted.filter((i) => i.read === 'done').length;

  // percentuale sull'intera sfida (obiettivo: tutte le notti valide e tutti i giorni)
  const sleepEligibleTotal = dates.filter((d) => !isSaturday(d)).length;
  const pct = (a, b) => (b > 0 ? Math.round((a / b) * 100) : 0);

  const sleepStreak = streaks(infos.map((i) => i.sleep));
  const readStreak = streaks(infos.map((i) => i.read));
  const perfectStreak = streaks(
    infos.map((i) => {
      if (i.perfect) return 'done';
      if (i.read === 'missed' || i.sleep === 'missed') return 'missed';
      return 'pending';
    }),
  );

  const beds = dates.map((d) => state.days[d]?.bed).filter(Boolean);
  const avgBedOffset = beds.length ? beds.reduce((a, t) => a + bedtimeOffset(t), 0) / beds.length : null;
  const minutes = dates.map((d) => state.days[d]?.min || 0);
  const totalMin = minutes.reduce((a, b) => a + b, 0);
  const readDays = minutes.filter((m) => m > 0).length;

  const blocks = BLOCKS.map((b) => blockProgress(state, b, today));
  const dayNum = dayNumber(state.start, today);

  return {
    dayNum,
    started: today >= state.start,
    finished: today > endDate(state.start),
    elapsedDays: elapsed.length,
    sleepDone,
    readDone,
    sleepCounted: sleepCounted.length,
    readCounted: readCounted.length,
    sleepRate: pct(sleepDone, sleepCounted.length),
    readRate: pct(readDone, readCounted.length),
    overallRate: pct(sleepDone + readDone, sleepCounted.length + readCounted.length),
    sleepProgress: pct(sleepDone, sleepEligibleTotal),
    readProgress: pct(readDone, CHALLENGE_DAYS),
    challengeProgress: pct(sleepDone + readDone, sleepEligibleTotal + CHALLENGE_DAYS),
    perfectDays: infos.filter((i) => i.perfect).length,
    sleepStreak,
    readStreak,
    perfectStreak,
    avgBedOffset,
    avgBedTime: avgBedOffset === null ? null : offsetToTime(avgBedOffset),
    bedsLogged: beds.length,
    totalMin,
    avgMin: readDays ? Math.round(totalMin / readDays) : 0,
    maxMin: Math.max(0, ...minutes),
    blocks,
    weeksAchieved: blocks.filter((b) => b.phase === 'past' && b.achieved).length,
  };
}

// Minuti mancanti alla prossima mezzanotte.
export function minutesToMidnight(now = new Date()) {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
  return Math.max(0, Math.ceil((next - now) / 60000));
}

export function exportPayload(state) {
  return JSON.stringify({ ...state, exportedAt: new Date().toISOString() }, null, 2);
}

export function importPayload(text) {
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('Il file non contiene JSON valido.');
  }
  return validateState(raw);
}
