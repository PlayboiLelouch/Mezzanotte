// MEZZANOTTE — utilità di base per date e orari (pure, senza DOM).

export const DAY_CUTOFF_HOUR = 5; // prima delle 5:00 conta ancora come "ieri"

export const WEEKDAYS_SHORT = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];
export const WEEKDAYS_LONG = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
export const WEEKDAYS_INITIAL = ['D', 'L', 'M', 'M', 'G', 'V', 'S'];
export const MONTHS_SHORT = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
export const MONTHS_LONG = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];

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

// b - a, in giorni
export function diffDays(a, b) {
  return Math.round((parseISO(b) - parseISO(a)) / 86400000);
}

export function weekday(iso) {
  return parseISO(iso).getDay();
}

export function isSaturday(iso) {
  return weekday(iso) === 6;
}

export function minISO(a, b) {
  return a <= b ? a : b;
}

export function maxISO(a, b) {
  return a >= b ? a : b;
}

export function rangeISO(from, to) {
  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

// Lunedì della settimana di calendario che contiene iso.
export function mondayOf(iso) {
  return addDays(iso, -((weekday(iso) + 6) % 7));
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

export function formatDayMonth(iso) {
  const d = parseISO(iso);
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
}

export function monthLabel(year, month) {
  return `${MONTHS_LONG[month]} ${year}`;
}

// Griglia di un mese di calendario (settimane da lunedì), con null fuori dal mese.
export function monthGrid(year, month) {
  const first = toISO(new Date(year, month, 1, 12));
  const days = new Date(year, month + 1, 0).getDate();
  const lead = (weekday(first) + 6) % 7;
  const cells = Array(lead).fill(null);
  for (let i = 0; i < days; i++) cells.push(addDays(first, i));
  while (cells.length % 7) cells.push(null);
  return cells;
}

// ---------- Orari ----------
export function isValidTime(t) {
  return typeof t === 'string' && TIME_RE.test(t);
}

export function timeToMinutes(t) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

export function nowTime(now = new Date()) {
  return `${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

// Minuti rispetto alla mezzanotte: 23:30 → -30, 00:00 → 0, 00:45 → 45.
// Orari dalle 12:00 in poi sono "prima" di mezzanotte.
export function bedtimeOffset(t) {
  const m = timeToMinutes(t);
  return m >= 12 * 60 ? m - 1440 : m;
}

export function bedtimeOnTime(t, deadline = '00:00') {
  return bedtimeOffset(t) <= bedtimeOffset(deadline);
}

export function offsetToTime(off) {
  let m = Math.round(off);
  m = ((m % 1440) + 1440) % 1440;
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

// Minuti mancanti alla prossima mezzanotte.
export function minutesToMidnight(now = new Date()) {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
  return Math.max(0, Math.ceil((next - now) / 60000));
}

export function formatDuration(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${pad(m)} min` : `${h} h`;
}

export function formatHours(h) {
  if (h === null || h === undefined) return '—';
  const whole = Math.floor(h);
  const half = Math.round((h - whole) * 60);
  return half ? `${whole} h ${pad(half)}` : `${whole} h`;
}

export const plural = (n, one, many) => (n === 1 ? one : many);

const NUM_WORDS = ['zero', 'una', 'due', 'tre', 'quattro', 'cinque', 'sei', 'sette', 'otto', 'nove', 'dieci'];
export function numWord(n) {
  return n >= 0 && n <= 10 ? NUM_WORDS[n] : String(n);
}
