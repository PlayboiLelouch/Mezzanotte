// MEZZANOTTE — messaggi contestuali generati da regole locali sui progressi reali.

import * as D from './core.js';
import { habitById } from './store.js';
import { status, PHASES } from './engine.js';

const NOUN = {
  sleep: { one: 'notte in orario', many: 'notti in orario', short: ['notte', 'notti'] },
  read: { one: 'lettura', many: 'letture', short: ['lettura', 'letture'] },
};
const noun = (id, n, name) => {
  const x = NOUN[id];
  if (!x) return `${n} ${n === 1 ? 'giorno' : 'giorni'} di ${name.toLowerCase()}`;
  return `${n === 1 ? 'una sola' : D.numWord(n)} ${n === 1 ? x.one : x.many}`;
};

function hash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

// Restituisce i messaggi candidati in ordine di priorità.
export function buildMessages(state, c, now = new Date()) {
  const today = c.today;
  const out = [];
  const add = (priority, id, text, icon = 'spark', tone = 'neutral') => out.push({ priority, id, text, icon, tone });
  const cur = c.current;
  const sleep = habitById(state, 'sleep');
  const read = habitById(state, 'read');
  const hour = now.getHours();
  const isEvening = hour >= 21 || hour < D.DAY_CUTOFF_HOUR;
  const sleepToday = sleep ? status(state, sleep, today, today) : null;
  const readToday = read ? status(state, read, today, today) : null;
  const yesterday = D.addDays(today, -1);

  if (c.journeyState === 'upcoming') {
    const n = D.diffDays(today, c.journey.start);
    add(100, 'upcoming', `Il percorso inizia ${n === 1 ? 'domani' : `tra ${n} giorni`}. Puoi già registrare la lettura di oggi.`, 'flag');
    return out;
  }

  if (cur) {
    const name = cur.phase ? PHASES[cur.phase - 1].name : 'Mantenimento';
    // obiettivo settimanale raggiunto proprio oggi
    for (const [hid, hp] of Object.entries(cur.habits)) {
      if (!hp.ok) continue;
      const h = habitById(state, hid);
      const todayDone = status(state, h, today, today) === 'done' || (hid === 'sleep' && status(state, h, yesterday, today) === 'done' && hour < 14);
      if (todayDone && hp.done === hp.target) {
        add(95, `goal-${hid}`, hid === 'sleep'
          ? `Hai raggiunto l'obiettivo settimanale del sonno: ${hp.done} notti su ${hp.target}.`
          : hid === 'read' ? `Hai raggiunto l'obiettivo settimanale di lettura: ${hp.done} su ${hp.target}.`
            : `Obiettivo settimanale raggiunto per ${h.name.toLowerCase()}.`, 'trophy', 'gold');
      }
    }
    if (cur.achieved && Object.keys(cur.habits).length) add(60, 'week-done', `Obiettivi della settimana raggiunti. Da qui in poi ogni giornata è un margine in più.`, 'trophy', 'gold');

    // manca una sola registrazione
    for (const [hid, hp] of Object.entries(cur.habits)) {
      if (hp.ok || !hp.possible) continue;
      const h = habitById(state, hid);
      if (hp.remaining === 1) {
        add(90, `one-left-${hid}`, hid === 'sleep'
          ? 'Ti manca una sola notte in orario per l\'obiettivo della settimana.'
          : hid === 'read' ? 'Ti manca una sola lettura per raggiungere l\'obiettivo settimanale.'
            : `Ti manca un solo giorno di ${h.name.toLowerCase()} per l'obiettivo della settimana.`, 'target', hid);
      } else if (cur.daysLeft <= 2 && cur.daysLeft > 0) {
        add(85, `last-days-${hid}`, `Ultimi ${cur.daysLeft === 1 ? 'giorno' : `${cur.daysLeft} giorni`} della fase ${name}: per l'obiettivo servono ancora ${noun(hid, hp.remaining, h.name)}.`, 'target', hid);
      }
    }

    // inizio di una nuova fase
    if (cur.from === today && cur.phase && cur.phase <= 4) {
      const t = cur.habits;
      add(88, 'phase-start', `Inizia la fase ${name}: questa settimana ${t.sleep ? `${t.sleep.target} notti` : ''}${t.sleep && t.read ? ' e ' : ''}${t.read ? `${t.read.target} letture` : ''}.`, 'flag');
    }

    // obiettivo non più raggiungibile: tono incoraggiante, mai punitivo
    for (const [hid, hp] of Object.entries(cur.habits)) {
      if (hp.ok || hp.possible) continue;
      const pct = c.consistency.week !== null ? Math.round(c.consistency.week * 100) : null;
      add(40, `unreachable-${hid}`, `L'obiettivo ${hid === 'sleep' ? 'del sonno' : hid === 'read' ? 'di lettura' : ''} di questa settimana è fuori portata, ma ogni giorno fatto conta per la costanza${pct !== null ? ` (ora ${pct}%)` : ''}.`, 'heart');
    }

    // minuti di lettura della settimana
    if (cur.habits.read && cur.habits.read.minutes >= 10) {
      add(50, 'week-minutes', `Hai letto ${cur.habits.read.minutes} minuti questa settimana.`, 'book', 'read');
    }
  }

  // serie
  const ss = c.streaks.sleep?.current || 0;
  if (ss >= 3) add(70, 'sleep-streak', `Hai rispettato l'orario per ${D.numWord(ss)} notti consecutive.`, 'flame', 'sleep');
  const rs = c.streaks.read?.current || 0;
  if (rs >= 3) add(65, 'read-streak', `Hai letto per ${D.numWord(rs)} giorni di fila.`, 'flame', 'read');

  // dopo un giorno saltato
  const ySleep = sleep ? status(state, sleep, yesterday, today) : null;
  const yRead = read ? status(state, read, yesterday, today) : null;
  const missedYesterday = ['missed', 'unlogged', 'partial'].includes(yRead) || ySleep === 'missed';
  if (missedYesterday && c.metrics.habitDone > 0) {
    const n = c.metrics.sleepDone;
    const r = c.metrics.readDone;
    add(75, 'after-miss', `Una giornata saltata non annulla quello che hai costruito: ${n} ${D.plural(n, 'notte', 'notti')} in orario e ${r} ${D.plural(r, 'lettura', 'letture')} finora.`, 'heart');
  }

  // sabato
  if (sleep && sleep.config.freeWeekdays.includes(D.weekday(today))) {
    add(72, 'saturday', readToday === 'done' ? 'Sabato sera libero e lettura già fatta: giornata completa.' : 'Stasera il sonno è libero. La lettura conta come sempre.', 'moon', 'sleep');
  }

  // sera: preparazione alla routine
  if (isEvening && sleepToday === 'pending' && hour >= 21 && hour < 23) {
    const m = D.timeToMinutes(state.settings.reminders.routine) - (hour * 60 + now.getMinutes());
    if (m > 0 && m <= 120) add(80, 'routine-soon', `Tra ${D.formatDuration(m)} niente nuovi lavori: è l'inizio della routine serale.`, 'clock', 'sleep');
  }

  // orario medio in miglioramento
  const sleepE = state.entries.sleep || {};
  const lastBeds = (from, to) => D.rangeISO(from, to).map((d) => sleepE[d]?.bed).filter(Boolean).map(D.bedtimeOffset);
  const a = lastBeds(D.addDays(today, -7), yesterday);
  const b = lastBeds(D.addDays(today, -14), D.addDays(today, -8));
  if (a.length >= 3 && b.length >= 3) {
    const diff = Math.round(b.reduce((x, y) => x + y, 0) / b.length - a.reduce((x, y) => x + y, 0) / a.length);
    if (diff >= 10) add(55, 'bed-better', `In media vai a letto ${diff} minuti prima rispetto alla settimana precedente.`, 'trend', 'sleep');
  }

  // livello vicino
  if (c.level.toNext > 0 && c.level.toNext <= 40) {
    add(45, 'level-near', `Ti mancano ${c.level.toNext} XP al livello ${c.level.n + 1}, ${c.level.nextTitle}.`, 'star', 'gold');
  }

  // giornata completa
  if (readToday === 'done' && (sleepToday === 'done' || sleepToday === 'free')) {
    add(30, 'day-complete', 'Giornata completa. Domani si riparte da qui.', 'check', 'read');
  }

  // predefinito: situazione della settimana
  if (cur && cur.habits.sleep && cur.habits.read) {
    const s = cur.habits.sleep;
    const r = cur.habits.read;
    add(10, 'week-status', `Questa settimana: ${s.done} ${D.plural(s.done, 'notte', 'notti')} su ${s.target} e ${r.done} ${D.plural(r.done, 'lettura', 'letture')} su ${r.target}.`, 'chart');
  }

  // ordine: priorità, poi variazione stabile nel giorno tra messaggi di pari peso
  return out.sort((x, y) => y.priority - x.priority || (hash(today + x.id) % 7) - (hash(today + y.id) % 7));
}

export function topMessage(state, c, now = new Date()) {
  return buildMessages(state, c, now)[0] || null;
}
