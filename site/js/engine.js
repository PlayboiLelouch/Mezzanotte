// MEZZANOTTE — motore delle abitudini: stati, percorso, costanza, XP, livelli, traguardi, proposte.
// Tutto è calcolato dai dati reali: nessun valore viene accumulato a parte.

import * as D from './core.js';
import { JOURNEY_DAYS, habitById } from './store.js';

export const XP = Object.freeze({ habit: 20, fullDay: 10, weekGoal: 50 });
export const MIN_TARGET = 3;

export const PHASES = [
  { n: 1, name: 'Inizio', goal: 'Rompi l\'inerzia. Non serve la perfezione: serve cominciare.' },
  { n: 2, name: 'Costanza', goal: 'Rendilo normale: le abitudini diventano parte della settimana.' },
  { n: 3, name: 'Consolidamento', goal: 'Meno sforzo, più automatismo: la routine regge anche nei giorni pieni.' },
  { n: 4, name: 'Disciplina', goal: 'Ogni sera conta. Il piano viene prima dell\'ultima cosa da finire.' },
  { n: 5, name: 'Bilancio', goal: 'Chiudi il percorso e guarda quanta strada hai fatto.' },
];

export const LEVELS = [
  { n: 1, title: 'Inizio', xp: 0 },
  { n: 2, title: 'Costruttore', xp: 150 },
  { n: 3, title: 'Costante', xp: 450 },
  { n: 4, title: 'Disciplinato', xp: 900 },
  { n: 5, title: 'Determinato', xp: 1500 },
  { n: 6, title: 'Inarrestabile', xp: 2300 },
  { n: 7, title: 'Saldo', xp: 3300 },
  { n: 8, title: 'Esemplare', xp: 4500 },
  { n: 9, title: 'Maestro', xp: 6000 },
  { n: 10, title: 'Imperturbabile', xp: 8000 },
];
const LEVEL_STEP_AFTER_MAX = 2500;

// ---------- Abitudini ----------
export function activeHabits(state, iso) {
  return state.habits.filter((h) => habitActiveOn(h, iso));
}

export function visibleHabits(state, today) {
  return state.habits.filter((h) => !h.archivedAt || h.archivedAt >= today);
}

export function habitActiveOn(h, iso) {
  return iso >= h.since && (!h.archivedAt || iso <= h.archivedAt);
}

export function goalMinOn(h, iso) {
  if (h.type !== 'duration') return 0;
  let min = h.config.goals[0]?.min || 5;
  for (const g of h.config.goals) if (g.from <= iso) min = g.min;
  return min;
}

export function isFreeDay(h, iso) {
  return h.type === 'bedtime' && h.config.freeWeekdays.includes(D.weekday(iso));
}

export function trackingStart(state) {
  return state.journeys[0]?.start || null;
}

// 'future' | 'inactive' | 'free' | 'done' | 'missed' | 'partial' | 'pending' | 'unlogged'
export function status(state, h, iso, today) {
  if (iso > today) return 'future';
  if (!habitActiveOn(h, iso)) return 'inactive';
  const e = state.entries[h.id]?.[iso];
  const ts = trackingStart(state);
  // prima dell'inizio del percorso nulla conta: né successi né mancanze
  if (!ts || iso < ts) return 'inactive';
  if (isFreeDay(h, iso)) return 'free';
  let st;
  if (h.type === 'bedtime') {
    if (e && typeof e.ok === 'boolean') st = e.ok ? 'done' : 'missed';
    // la notte di oggi e quella di ieri si possono ancora registrare
    else st = iso >= D.addDays(today, -1) ? 'pending' : 'unlogged';
  } else if (h.type === 'duration') {
    const min = e?.min || 0;
    if (min >= goalMinOn(h, iso)) st = 'done';
    else if (iso === today) st = 'pending';
    else st = min > 0 ? 'partial' : 'unlogged';
  } else {
    if (e && typeof e.done === 'boolean') st = e.done ? 'done' : 'missed';
    else st = iso === today ? 'pending' : 'unlogged';
  }
  return st;
}

const RESOLVED = new Set(['done', 'missed', 'partial', 'unlogged']);
const BREAKS = new Set(['missed', 'partial', 'unlogged']);

// Giornata: completa se tutte le abitudini previste sono fatte (le notti libere non contano).
export function dayInfo(state, iso, today) {
  const habits = activeHabits(state, iso);
  const st = {};
  for (const h of habits) st[h.id] = status(state, h, iso, today);
  const vals = Object.values(st).filter((s) => s !== 'inactive');
  const scheduled = vals.filter((s) => s !== 'free');
  const done = scheduled.filter((s) => s === 'done').length;
  const complete = scheduled.length > 0 && done === scheduled.length;
  let dayState;
  if (iso > today) dayState = 'future';
  else if (complete) dayState = 'complete';
  else if (scheduled.some((s) => BREAKS.has(s))) dayState = 'broken';
  else if (scheduled.length === 0) dayState = 'none';
  else dayState = 'open';
  return { iso, status: st, done, total: scheduled.length, complete, dayState };
}

// ---------- Percorsi e blocchi settimanali ----------
export function journeyEnd(j) {
  return D.addDays(j.start, JOURNEY_DAYS - 1);
}

export function currentJourney(state) {
  return state.journeys[state.journeys.length - 1] || null;
}

export function journeyState(j, today) {
  if (!j) return 'none';
  if (today < j.start) return 'upcoming';
  if (j.endedAt && j.endedAt < journeyEnd(j)) return today > j.endedAt ? 'ended' : 'active';
  return today > journeyEnd(j) ? 'completed' : 'active';
}

export function journeyDay(j, today) {
  if (!j || today < j.start) return null;
  return D.diffDays(j.start, today) + 1;
}

function hardEnd(state, idx) {
  const j = state.journeys[idx];
  const next = state.journeys[idx + 1];
  let end = j.endedAt || null;
  if (next) {
    const cap = D.addDays(next.start, -1);
    if (!end || end > cap) end = cap;
  }
  return end;
}

function eligibleDays(state, h, from, to) {
  let n = 0;
  for (let d = from; d <= to; d = D.addDays(d, 1)) if (habitActiveOn(h, d) && !isFreeDay(h, d)) n++;
  return n;
}

function nominalEligible(h, from, to) {
  let n = 0;
  for (let d = from; d <= to; d = D.addDays(d, 1)) if (!isFreeDay(h, d)) n++;
  return n;
}

function baseTarget(j, h, idx, kind) {
  if (kind === 'final') return null; // tutte le giornate previste
  const plan = j.plan[h.id];
  const k = Math.min(idx, 3);
  if (plan) return plan[k];
  return h.config.perWeek || 5;
}

// Tutti i blocchi (settimane del percorso, finale, mantenimento) dall'inizio del primo percorso.
export function allBlocks(state, today) {
  const blocks = [];
  state.journeys.forEach((j, ji) => {
    const hard = hardEnd(state, ji);
    const isLast = ji === state.journeys.length - 1;
    const limit = hard || (isLast ? D.maxISO(today, journeyEnd(j)) : journeyEnd(j));
    const push = (idx, kind, from, nominalTo, phase) => {
      if (from > limit) return false;
      const to = D.minISO(nominalTo, limit);
      const targets = {};
      const eligible = {};
      for (const h of state.habits) {
        const el = eligibleDays(state, h, from, to);
        if (!el) continue;
        let t = baseTarget(j, h, idx, kind);
        const adj = j.adjust[idx]?.[h.id];
        if (adj) t = adj;
        if (t === null) t = el;
        const full = nominalEligible(h, from, nominalTo);
        if (el < full) t = Math.max(1, Math.round((t * el) / full));
        eligible[h.id] = el;
        targets[h.id] = Math.min(t, el);
      }
      blocks.push({ key: `${j.id}:${idx}`, journeyId: j.id, idx, kind, phase, from, to, nominalTo, partial: to < nominalTo, targets, eligible });
      return true;
    };
    for (let k = 0; k < 4; k++) {
      const from = D.addDays(j.start, k * 7);
      if (!push(k, 'phase', from, D.addDays(from, 6), k + 1)) return;
    }
    if (!push(4, 'final', D.addDays(j.start, 28), D.addDays(j.start, 29), 5)) return;
    let k = 5;
    let from = D.addDays(j.start, 30);
    while (from <= limit && (!isLast || from <= today)) {
      push(k, 'maintenance', from, D.addDays(from, 6), null);
      k++;
      from = D.addDays(from, 7);
    }
  });
  return blocks;
}

export function blockFor(blocks, iso) {
  return blocks.find((b) => iso >= b.from && iso <= b.to) || null;
}

export function blockProgress(state, b, today) {
  const habits = {};
  let achieved = true;
  let num = 0;
  let den = 0;
  for (const h of state.habits) {
    if (!(h.id in b.targets)) continue;
    let done = 0;
    let open = 0;
    let resolved = 0;
    let minutes = 0;
    for (let d = b.from; d <= b.to; d = D.addDays(d, 1)) {
      const s = status(state, h, d, today);
      if (s === 'done') done++;
      if (s === 'pending' || s === 'future') open++;
      if (RESOLVED.has(s)) resolved++;
      if (h.type === 'duration') minutes += state.entries[h.id]?.[d]?.min || 0;
    }
    const target = b.targets[h.id];
    const eligible = b.eligible[h.id];
    const ok = done >= target;
    const expected = target * Math.min(1, resolved / eligible);
    num += Math.min(done, expected);
    den += expected;
    if (!ok) achieved = false;
    habits[h.id] = { done, target, eligible, open, ok, possible: done + open >= target, remaining: Math.max(0, target - done), minutes, expected };
  }
  const timing = today < b.from ? 'future' : today > b.to ? 'past' : 'current';
  const daysLeft = timing === 'current' ? D.diffDays(today, b.to) + 1 : timing === 'future' ? D.diffDays(b.from, b.to) + 1 : 0;
  return { ...b, habits, achieved, timing, daysLeft, consistency: den > 0 ? num / den : null, num, den };
}

// ---------- Serie ----------
function streakOf(seq) {
  let cur = 0;
  let best = 0;
  for (const s of seq) {
    if (s === 'done') {
      cur++;
      best = Math.max(best, cur);
    } else if (BREAKS.has(s)) cur = 0;
  }
  return { current: cur, best };
}

// ---------- Livelli ----------
export function levelFor(xp) {
  let lv = LEVELS[0];
  for (const l of LEVELS) if (xp >= l.xp) lv = l;
  if (lv.n === LEVELS.length) {
    const extra = Math.floor((xp - lv.xp) / LEVEL_STEP_AFTER_MAX);
    const n = lv.n + extra;
    const floor = lv.xp + extra * LEVEL_STEP_AFTER_MAX;
    const next = floor + LEVEL_STEP_AFTER_MAX;
    return { n, title: lv.title, floor, next, nextTitle: lv.title, progress: (xp - floor) / (next - floor), toNext: next - xp };
  }
  const nx = LEVELS[lv.n];
  return { n: lv.n, title: lv.title, floor: lv.xp, next: nx.xp, nextTitle: nx.title, progress: (xp - lv.xp) / (nx.xp - lv.xp), toNext: nx.xp - xp };
}

export function levelTitle(n) {
  return (LEVELS[n - 1] || LEVELS[LEVELS.length - 1]).title;
}

// ---------- Traguardi ----------
// Ogni medaglia ha materiale e forma propri (vedi views.js → medal()).
export const ACHIEVEMENTS = [
  { id: 'primo-passo', title: 'Primo passo', desc: 'Completa un\'abitudine per la prima volta.', icon: 'spark', metric: 'habitDone', target: 1, medal: { material: 'bronze', shape: 'circle' } },
  { id: 'prima-giornata', title: 'Prima giornata completa', desc: 'Tutte le abitudini della giornata completate.', icon: 'sun', metric: 'fullDays', target: 1, medal: { material: 'silver', shape: 'circle' } },
  { id: 'tre-notti', title: '3 notti in orario', desc: 'Tre notti consecutive a letto entro mezzanotte.', icon: 'moonStars', metric: 'sleepBestStreak', target: 3, medal: { material: 'lavender', shape: 'hexagon' } },
  { id: 'sette-letture', title: '7 letture', desc: 'Sette giornate di lettura completate.', icon: 'bookOpen', metric: 'readDone', target: 7, medal: { material: 'emerald', shape: 'hexagon' } },
  { id: 'prima-settimana', title: 'Prima settimana riuscita', desc: 'Tutti gli obiettivi di una settimana raggiunti.', icon: 'flag', metric: 'weeksAchieved', target: 1, medal: { material: 'gold', shape: 'octagon' } },
  { id: 'ora-di-lettura', title: '60 minuti di lettura', desc: 'Un\'ora di lettura in totale.', icon: 'hourglass', metric: 'readMinutes', target: 60, medal: { material: 'copper', shape: 'circle' } },
  { id: 'dieci-giornate', title: '10 giornate complete', desc: 'Dieci giornate con tutte le abitudini fatte.', icon: 'sunrise', metric: 'fullDays', target: 10, medal: { material: 'rose', shape: 'scallop' } },
  { id: 'ripartenza', title: 'Ripartenza', desc: 'Torna alle abitudini dopo almeno tre giorni di pausa.', icon: 'restart', metric: 'restarts', target: 1, medal: { material: 'pearl', shape: 'circle' } },
  { id: 'settimana-sonno', title: 'Settimana del sonno', desc: 'Tutte le notti valide di una settimana in orario.', icon: 'moonFull', metric: 'perfectSleepWeeks', target: 1, medal: { material: 'midnight', shape: 'octagon' } },
  { id: 'quattro-settimane', title: 'Quattro settimane solide', desc: 'Quattro settimane con almeno il 75% di costanza.', icon: 'trend', metric: 'solidWeeks', target: 4, medal: { material: 'steel', shape: 'shield' } },
  { id: 'trenta-giorni', title: '30 giorni di percorso', desc: 'Arriva al trentesimo giorno di un percorso.', icon: 'mountain', metric: 'journeysReached30', target: 1, medal: { material: 'platinum', shape: 'scallop' } },
  { id: 'dieci-ore', title: '10 ore di lettura', desc: 'Seicento minuti di lettura in totale.', icon: 'library', metric: 'readMinutes', target: 600, medal: { material: 'malachite', shape: 'octagon' } },
  { id: 'cinquanta-notti', title: '50 notti in orario', desc: 'Cinquanta notti a letto entro mezzanotte.', icon: 'stars', metric: 'sleepDone', target: 50, medal: { material: 'obsidian', shape: 'scallop' } },
  { id: 'cento-giornate', title: '100 giornate complete', desc: 'Cento giornate con tutte le abitudini fatte: costanza di lungo periodo.', icon: 'crown', metric: 'fullDays', target: 100, medal: { material: 'aurora', shape: 'shield' } },
];

// Piccoli traguardi di lettura: basati solo sui minuti realmente registrati.
export const READING_MILESTONES = [30, 60, 150, 300, 600, 1000, 1500, 3000, 5000];
export function readingMilestone(total) {
  const reached = READING_MILESTONES.filter((m) => total >= m);
  const next = READING_MILESTONES.find((m) => total < m) || null;
  const prev = reached.length ? reached[reached.length - 1] : 0;
  return { reached, next, prev, progress: next ? (total - prev) / (next - prev) : 1 };
}

// ---------- Calcolo completo ----------
export function compute(state, today) {
  const blocks = allBlocks(state, today).map((b) => blockProgress(state, b, today));
  const journey = currentJourney(state);
  const jState = journeyState(journey, today);
  const ts = trackingStart(state);

  // intervallo di date da analizzare
  const first = ts || today;
  const dates = first <= today ? D.rangeISO(first, today) : [];

  const perHabit = {};
  for (const h of state.habits) perHabit[h.id] = { doneTotal: 0, seq: [], resolved: 0 };
  let xpHabits = 0;
  let xpFull = 0;
  let fullDays = 0;
  const fullSeq = [];
  let lastActive = null;
  let restarts = 0;
  const days = [];
  for (const iso of dates) {
    const info = dayInfo(state, iso, today);
    days.push(info);
    let any = false;
    for (const [hid, s] of Object.entries(info.status)) {
      const p = perHabit[hid];
      p.seq.push(s);
      if (s === 'done') {
        p.doneTotal++;
        xpHabits += XP.habit;
        any = true;
      }
      if (RESOLVED.has(s)) p.resolved++;
    }
    if (info.complete) {
      fullDays++;
      xpFull += XP.fullDay;
    }
    fullSeq.push(info.complete ? 'done' : info.dayState === 'broken' ? 'missed' : 'pending');
    if (any) {
      if (lastActive && D.diffDays(lastActive, iso) >= 4) restarts++;
      lastActive = iso;
    }
  }

  let xpWeeks = 0;
  let weeksAchieved = 0;
  let perfectSleepWeeks = 0;
  let solidWeeks = 0;
  for (const b of blocks) {
    if (b.timing === 'future') continue;
    for (const hp of Object.values(b.habits)) if (hp.ok) xpWeeks += XP.weekGoal;
    if (b.achieved && Object.keys(b.habits).length) weeksAchieved++;
    const sp = b.habits.sleep;
    if (sp && !b.partial && b.kind !== 'final' && sp.eligible >= 6 && sp.done >= sp.eligible) perfectSleepWeeks++;
    if (b.timing === 'past' && !b.partial && b.kind !== 'final' && b.consistency !== null && b.consistency >= 0.75) solidWeeks++;
  }

  const streaks = {};
  for (const h of state.habits) streaks[h.id] = streakOf(perHabit[h.id].seq);
  const fullStreak = streakOf(fullSeq);

  // costanza: sui blocchi fino a oggi
  const reached = blocks.filter((b) => b.timing !== 'future');
  const agg = (list) => {
    const num = list.reduce((a, b) => a + b.num, 0);
    const den = list.reduce((a, b) => a + b.den, 0);
    return den > 0 ? num / den : null;
  };
  const current = blockFor(blocks, today);
  const last4 = reached.filter((b) => b.to >= D.addDays(today, -27));

  // sonno
  const sleepH = habitById(state, 'sleep');
  const sleepEntries = state.entries.sleep || {};
  const bedDates = Object.keys(sleepEntries).filter((d) => d <= today && sleepEntries[d].bed).sort();
  const recentBeds = bedDates.filter((d) => d >= D.addDays(today, -29));
  const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
  const avgBedOffset = avg(recentBeds.map((d) => D.bedtimeOffset(sleepEntries[d].bed)));
  const hourDates = Object.keys(sleepEntries).filter((d) => d <= today && sleepEntries[d].hours).sort();
  const recentHours = hourDates.filter((d) => d >= D.addDays(today, -29)).map((d) => sleepEntries[d].hours);
  const hoursGoal = sleepH?.config.hoursGoal || 7;

  // lettura
  const readEntries = state.entries.read || {};
  const readDates = Object.keys(readEntries).filter((d) => d <= today);
  const readMinutes = readDates.reduce((a, d) => a + readEntries[d].min, 0);
  const readDaysWithMin = readDates.filter((d) => readEntries[d].min > 0).length;
  const weekMinutes = current?.habits.read?.minutes ?? 0;

  const reached30 = state.journeys.filter((j, i) => {
    const end = journeyEnd(j);
    const hard = hardEnd(state, i);
    return today >= end && (!hard || hard >= end);
  }).length;

  const xpTotal = xpHabits + xpFull + xpWeeks;
  const level = levelFor(xpTotal);

  const metrics = {
    habitDone: Object.values(perHabit).reduce((a, p) => a + p.doneTotal, 0),
    fullDays,
    sleepBestStreak: streaks.sleep?.best || 0,
    readDone: perHabit.read?.doneTotal || 0,
    sleepDone: perHabit.sleep?.doneTotal || 0,
    weeksAchieved,
    readMinutes,
    restarts,
    perfectSleepWeeks,
    solidWeeks,
    journeysReached30: reached30,
  };
  const achievements = ACHIEVEMENTS.map((a) => {
    const value = metrics[a.metric] || 0;
    return { ...a, value: Math.min(value, a.target), unlocked: value >= a.target, ratio: Math.min(1, value / a.target) };
  });

  const jBlocks = journey ? blocks.filter((b) => b.journeyId === journey.id && b.kind !== 'maintenance') : [];
  const goalsTotal = jBlocks.reduce((a, b) => a + Object.keys(b.habits).length, 0);
  const goalsDone = jBlocks.reduce((a, b) => a + Object.values(b.habits).filter((hp) => hp.ok).length, 0);
  return {
    today,
    journey,
    journeyGoals: { done: goalsDone, total: goalsTotal },
    journeyState: jState,
    journeyDay: journeyDay(journey, today),
    blocks,
    current,
    days,
    perHabit: Object.fromEntries(Object.entries(perHabit).map(([k, v]) => [k, { doneTotal: v.doneTotal, resolved: v.resolved }])),
    streaks,
    fullStreak,
    fullDays,
    consistency: { overall: agg(reached), week: current ? current.consistency : null, month: agg(last4) },
    xp: { total: xpTotal, habits: xpHabits, fullDays: xpFull, weeks: xpWeeks },
    level,
    achievements,
    metrics,
    sleep: {
      avgBedOffset,
      avgBedTime: avgBedOffset === null ? null : D.offsetToTime(avgBedOffset),
      bedsLogged: recentBeds.length,
      avgHours: recentHours.length ? Math.round(avg(recentHours) * 10) / 10 : null,
      hoursLogged: recentHours.length,
      nightsAtGoal: recentHours.filter((h) => h >= hoursGoal).length,
      hoursGoal,
    },
    read: {
      totalMinutes: readMinutes,
      weekMinutes,
      avgPerDay: readDaysWithMin ? Math.round(readMinutes / readDaysWithMin) : 0,
      bestDay: readDates.reduce((a, d) => Math.max(a, readEntries[d].min), 0),
      goal: habitById(state, 'read') ? goalMinOn(habitById(state, 'read'), today) : 5,
    },
  };
}

// XP guadagnati in una singola giornata (per le animazioni e i riepiloghi).
export function xpForDay(state, iso, today) {
  const info = dayInfo(state, iso, today);
  let xp = 0;
  for (const s of Object.values(info.status)) if (s === 'done') xp += XP.habit;
  if (info.complete) xp += XP.fullDay;
  return xp;
}

// XP guadagnati in un blocco (settimana): giornate + obiettivi settimanali.
export function blockXp(state, b, today) {
  let xp = 0;
  for (let d = b.from; d <= b.to && d <= today; d = D.addDays(d, 1)) xp += xpForDay(state, d, today);
  for (const hp of Object.values(b.habits)) if (hp.ok) xp += XP.weekGoal;
  return xp;
}

// ---------- Proposte (mai applicate senza consenso) ----------
export function proposals(state, c) {
  const out = [];
  const today = c.today;
  const cur = c.current;
  const decided = (k) => state.meta.proposals[k];
  const declinedRecently = (k) => {
    const p = decided(k);
    return p && (p.decision === 'accepted' || !p.at || D.diffDays(p.at, today) < 21);
  };
  if (cur && (cur.kind === 'phase' || cur.kind === 'maintenance') && !cur.partial) {
    const i = c.blocks.indexOf(cur);
    const p1 = c.blocks[i - 1];
    const p2 = c.blocks[i - 2];
    const journey = state.journeys.find((j) => j.id === cur.journeyId);
    if (p1 && p2 && p1.timing === 'past' && p2.timing === 'past' && p1.kind !== 'final' && p2.kind !== 'final') {
      for (const h of state.habits) {
        const a = p1.habits[h.id];
        const b = p2.habits[h.id];
        const now = cur.habits[h.id];
        if (!a || !b || !now || a.ok || b.ok || now.ok) continue;
        if (now.target <= MIN_TARGET || journey?.adjust[cur.idx]?.[h.id]) continue;
        const key = `riduci:${cur.key}:${h.id}`;
        if (decided(key)) continue;
        out.push({
          key, type: 'reduce', habitId: h.id, journeyId: cur.journeyId, blockIdx: cur.idx, from: now.target, to: now.target - 1,
          history: [b, a].map((x) => `${x.done}/${x.target}`),
        });
      }
    }
  }
  // lettura: aumento proposto solo quando l'abitudine è consolidata
  const read = habitById(state, 'read');
  if (read) {
    const goal = goalMinOn(read, today);
    const past = c.blocks.filter((b) => b.timing === 'past' && !b.partial && b.kind !== 'final').slice(-2);
    const key = `lettura:${goal}`;
    if (goal < 30 && past.length === 2 && !declinedRecently(key)) {
      const ok = past.every((b) => {
        const r = b.habits.read;
        return r && r.ok && r.done >= 6 && r.minutes / Math.max(1, r.done) >= goal * 2;
      });
      if (ok) out.push({ key, type: 'read-up', habitId: 'read', from: goal, to: goal + 5 });
    }
  }
  // sonno: ore di sonno verso 8, solo se già raggiunte con regolarità
  const sleep = habitById(state, 'sleep');
  if (sleep) {
    const hg = sleep.config.hoursGoal;
    const key = `ore:${hg}`;
    const nights = Object.keys(state.entries.sleep).filter((d) => d <= today && d >= D.addDays(today, -13) && state.entries.sleep[d].hours);
    const hours = nights.map((d) => state.entries.sleep[d].hours);
    if (hg < 8 && hours.length >= 10 && hours.filter((h) => h >= hg).length >= 9 && !declinedRecently(key)) {
      out.push({ key, type: 'hours-up', habitId: 'sleep', from: hg, to: hg + 0.5 });
    }
  }
  return out;
}

// ---------- Riepilogo di fine percorso ----------
export function journeySummary(state, j, today) {
  const c = compute(state, today);
  const jb = c.blocks.filter((b) => b.journeyId === j.id && b.kind !== 'maintenance');
  const end = D.minISO(journeyEnd(j), hardEnd(state, state.journeys.indexOf(j)) || journeyEnd(j));
  const dates = D.rangeISO(j.start, D.minISO(end, today));
  const sleepH = habitById(state, 'sleep');
  const readH = habitById(state, 'read');
  let nights = 0;
  let nightsEligible = 0;
  let readDays = 0;
  let minutes = 0;
  let fullDays = 0;
  for (const d of dates) {
    const s = status(state, sleepH, d, today);
    if (s !== 'free' && s !== 'inactive') nightsEligible++;
    if (s === 'done') nights++;
    if (status(state, readH, d, today) === 'done') readDays++;
    minutes += state.entries.read[d]?.min || 0;
    if (dayInfo(state, d, today).complete) fullDays++;
  }
  const num = jb.reduce((a, b) => a + b.num, 0);
  const den = jb.reduce((a, b) => a + b.den, 0);
  const consistency = den ? num / den : null;
  const rate = (b, id) => (b?.habits[id] ? b.habits[id].done / b.habits[id].eligible : null);
  const w1 = jb.find((b) => b.idx === 0);
  const w4 = jb.find((b) => b.idx === 3);
  const beds = (b) => {
    if (!b) return null;
    const list = D.rangeISO(b.from, b.to).map((d) => state.entries.sleep[d]?.bed).filter(Boolean).map(D.bedtimeOffset);
    return list.length ? list.reduce((a, x) => a + x, 0) / list.length : null;
  };
  const improvements = [];
  const s1 = rate(w1, 'sleep');
  const s4 = rate(w4, 'sleep');
  if (s1 !== null && s4 !== null) improvements.push({ id: 'sleep', label: 'Notti in orario', from: Math.round(s1 * 100), to: Math.round(s4 * 100), unit: '%' });
  const r1 = rate(w1, 'read');
  const r4 = rate(w4, 'read');
  if (r1 !== null && r4 !== null) improvements.push({ id: 'read', label: 'Giorni di lettura', from: Math.round(r1 * 100), to: Math.round(r4 * 100), unit: '%' });
  const b1 = beds(w1);
  const b4 = beds(w4);
  if (b1 !== null && b4 !== null) improvements.push({ id: 'bed', label: 'Ora media a letto', from: D.offsetToTime(b1), to: D.offsetToTime(b4), unit: '', better: b4 <= b1 });
  const builtSleep = nightsEligible ? nights / nightsEligible >= 0.75 : false;
  const builtRead = dates.length ? readDays / dates.length >= 0.75 : false;
  let next;
  if (consistency !== null && consistency >= 0.85) {
    next = { id: 'mantenimento', title: 'Percorso di mantenimento', text: 'Le basi reggono. Mantieni 6 notti su 6 e 6 letture su 7: è il momento giusto per aggiungere una nuova abitudine.', plan: { sleep: [6, 6, 6, 6], read: [6, 6, 6, 6] } };
  } else if (consistency !== null && consistency >= 0.6) {
    next = { id: 'consolida', title: 'Percorso di consolidamento', text: 'Buona base. Ripeti 30 giorni con obiettivi stabili a 5 notti e 5 letture, poi sali.', plan: { sleep: [5, 5, 5, 6], read: [5, 5, 6, 6] } };
  } else {
    next = { id: 'ripartenza', title: 'Percorso di ripartenza', text: 'Riparti con obiettivi più leggeri: 4 notti e 4 letture a settimana per tutto il mese. La costanza viene prima dell\'intensità.', plan: { sleep: [4, 4, 5, 5], read: [4, 4, 5, 5] } };
  }
  return {
    journey: j, from: j.start, to: end, days: dates.length,
    nights, nightsEligible, readDays, minutes, fullDays, consistency,
    weeks: jb, weeksAchieved: jb.filter((b) => b.achieved).length,
    built: [builtSleep && 'sleep', builtRead && 'read'].filter(Boolean),
    improvements, next,
    xp: c.xp.total, level: c.level,
  };
}
