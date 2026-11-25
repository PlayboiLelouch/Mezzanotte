// Test unitari: date, migrazione dei dati, motore delle abitudini, XP, traguardi, proposte, messaggi.
// Eseguiti anche con fusi orari diversi (vedi package.json).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../site/js/core.js';
import * as S from '../site/js/store.js';
import * as E from '../site/js/engine.js';
import * as M from '../site/js/messages.js';

// 2026-11-23 è un lunedì → sabato 2026-11-28 (indice 5 del primo blocco)
const START = '2026-11-23';
const add = D.addDays;

function fresh(start = START) {
  return S.startJourney(S.createState(), start);
}
function log(s, list) {
  for (const [hid, iso, patch] of list) s = S.setEntry(s, hid, iso, patch);
  return s;
}

// ---------- Date ----------
test('date: parse/format, addDays, diffDays, ora legale, griglia del mese', () => {
  assert.equal(D.addDays('2026-03-28', 2), '2026-03-30');
  assert.equal(D.addDays('2026-10-24', 2), '2026-10-26');
  assert.equal(D.diffDays('2026-03-28', '2026-03-30'), 2);
  assert.equal(D.diffDays('2026-10-24', '2026-10-26'), 2);
  assert.equal(D.addDays('2024-02-28', 1), '2024-02-29');
  assert.equal(D.addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(D.isSaturday('2026-11-28'), true);
  assert.equal(D.isValidISO('2026-02-30'), false);
  assert.equal(D.formatDateShort('2026-11-25'), 'Mer 25 nov');
  assert.equal(D.mondayOf('2026-11-29'), '2026-11-23');
  const g = D.monthGrid(2026, 10); // novembre 2026: inizia di domenica
  assert.equal(g.length % 7, 0);
  assert.equal(g[6], '2026-11-01');
  assert.equal(g.filter(Boolean).length, 30);
  assert.equal(D.rangeISO('2026-03-28', '2026-03-31').length, 4);
});

test('giorno logico: prima delle 5:00 conta come il giorno precedente (anche al cambio di mese/anno)', () => {
  assert.equal(D.logicalToday(new Date(2026, 10, 26, 0, 30)), '2026-11-25');
  assert.equal(D.logicalToday(new Date(2026, 10, 26, 4, 59)), '2026-11-25');
  assert.equal(D.logicalToday(new Date(2026, 10, 26, 5, 0)), '2026-11-26');
  assert.equal(D.logicalToday(new Date(2027, 0, 1, 1, 0)), '2026-12-31');
  assert.equal(D.logicalToday(new Date(2026, 2, 29, 3, 30)), '2026-03-28'); // notte del cambio d'ora
});

test('orario a letto rispetto a mezzanotte', () => {
  assert.equal(D.bedtimeOnTime('23:59'), true);
  assert.equal(D.bedtimeOnTime('00:00'), true);
  assert.equal(D.bedtimeOnTime('00:01'), false);
  assert.equal(D.bedtimeOffset('23:30'), -30);
  assert.equal(D.offsetToTime(45), '00:45');
  assert.equal(D.minutesToMidnight(new Date(2026, 10, 25, 22, 0, 0)), 120);
  assert.equal(D.formatDuration(135), '2 h 15 min');
  assert.equal(D.formatHours(7.5), '7 h 30');
});

// ---------- Migrazione ----------
const V1 = {
  app: 'mezzanotte',
  version: 1,
  start: '2026-11-22',
  days: {
    '2026-11-22': { bed: '23:20', sleep: true, min: 5 },
    '2026-11-23': { bed: '00:40', sleep: false, min: 15 },
    '2026-11-24': { sleep: true, min: 20 },
    '2026-11-25': { sleep: true, min: 17 },
  },
  settings: { book: 'Se una notte d\'inverno un viaggiatore' },
  archive: [{ start: '2026-10-01', days: { '2026-10-02': { sleep: true, min: 8 }, '2026-11-22': { min: 99 } }, endedAt: '2026-11-22T09:00:00.000Z' }],
  createdAt: '2026-10-01T08:00:00.000Z',
  updatedAt: '2026-11-25T21:00:00.000Z',
};

test('migrazione 1 → 2: nessun dato perso', () => {
  const s = S.migrate(structuredClone(V1));
  assert.equal(s.version, 2);
  assert.equal(s.entries.sleep['2026-11-22'].bed, '23:20');
  assert.equal(s.entries.sleep['2026-11-22'].ok, true);
  assert.deepEqual(s.entries.sleep['2026-11-23'], { ok: false, bed: '00:40' });
  assert.deepEqual(s.entries.sleep['2026-11-24'], { ok: true });
  assert.equal(s.entries.read['2026-11-25'].min, 17);
  // giorni archiviati recuperati; i dati attuali hanno la precedenza
  assert.equal(s.entries.read['2026-10-02'].min, 8);
  assert.equal(s.entries.sleep['2026-10-02'].ok, true);
  assert.equal(s.entries.read['2026-11-22'].min, 5);
  // percorsi: archivio + attuale, data iniziale conservata
  assert.equal(s.journeys.length, 2);
  assert.equal(s.journeys[1].start, '2026-11-22');
  assert.equal(s.journeys[0].start, '2026-10-01');
  assert.equal(s.journeys[0].endedAt, null); // completato: 30 giorni prima del nuovo inizio
  assert.equal(S.habitById(s, 'read').config.book, 'Se una notte d\'inverno un viaggiatore');
  assert.equal(s.createdAt, V1.createdAt);
  assert.deepEqual(s.legacy.v1Archive[0].days['2026-10-02'], { sleep: true, min: 8 });
  assert.equal(s.migrations[0].from, 1);
  assert.equal(s.meta.seen.welcome, null);
  // ogni registrazione originale è presente nel nuovo formato
  for (const [iso, d] of Object.entries(V1.days)) {
    assert.equal(s.entries.sleep[iso].ok, d.sleep, iso);
    assert.equal(s.entries.read[iso].min, d.min, iso);
  }
});

test('migrazione idempotente e stabile dopo serializzazione', () => {
  const a = S.migrate(structuredClone(V1));
  const b = S.migrate(JSON.parse(JSON.stringify(a)));
  const c = S.migrate(JSON.parse(JSON.stringify(b)));
  assert.deepEqual(b, a);
  assert.deepEqual(c, a);
});

test('migrazione di dati 1.x minimi o vuoti', () => {
  const empty = S.migrate({ app: 'mezzanotte', version: 1, start: null, days: {}, settings: {}, archive: [] });
  assert.equal(empty.journeys.length, 0);
  const odd = S.migrate({ app: 'mezzanotte', version: 1, start: '2026-11-01', days: { '2026-11-02': { bed: '23:00' }, bad: {}, '2026-02-30': { min: 4 }, '2026-11-03': { min: -3 } } });
  assert.deepEqual(Object.keys(odd.entries.sleep), ['2026-11-02']);
  assert.equal(odd.entries.sleep['2026-11-02'].ok, true);
  assert.deepEqual(odd.entries.read, {});
});

test('importazione: compatibile con backup 1.x e 2, errori chiari', () => {
  const fromV1 = S.importPayload(JSON.stringify(V1));
  assert.equal(fromV1.entries.read['2026-11-24'].min, 20);
  const roundTrip = S.importPayload(S.exportPayload(fromV1));
  assert.deepEqual(roundTrip.entries, fromV1.entries);
  assert.deepEqual(roundTrip.journeys, fromV1.journeys);
  assert.throws(() => S.importPayload('nope'), /JSON valido/);
  assert.throws(() => S.importPayload('{"ciao":1}'), /non è un backup/);
  assert.throws(() => S.importPayload('{"app":"mezzanotte","version":9}'), /non supportata/);
});

test('copia compatibile 1.x e recupero di dati scritti dalla versione precedente', () => {
  let s = S.migrate(structuredClone(V1));
  s = S.setEntry(s, 'read', '2026-11-26', { min: 9 });
  const v1 = S.toV1(s);
  assert.equal(v1.version, 1);
  assert.equal(v1.start, '2026-11-22');
  assert.deepEqual(v1.days['2026-11-23'], { sleep: false, bed: '00:40', min: 15 });
  assert.equal(v1.days['2026-11-26'].min, 9);
  // la copia è leggibile come 1.x e rimigra agli stessi dati
  const back = S.migrate(JSON.parse(JSON.stringify(v1)));
  assert.deepEqual(back.entries.read['2026-11-26'], { min: 9 });
  // se la 1.x scrive dopo la copia, i nuovi dati vengono uniti
  s = S.setMeta(s, { v1MirrorAt: v1.updatedAt });
  const newer = { ...v1, days: { ...v1.days, '2026-11-27': { sleep: true, min: 6 } }, updatedAt: '2099-01-01T00:00:00.000Z' };
  const r = S.mergeNewerV1(s, newer);
  assert.equal(r.merged, true);
  assert.equal(r.state.entries.read['2026-11-27'].min, 6);
  assert.equal(r.state.entries.sleep['2026-11-27'].ok, true);
  // copia non più recente: nessuna modifica
  assert.equal(S.mergeNewerV1(r.state, newer).merged, false);
});

// ---------- Registrazioni ----------
test('sonno: orario deriva lo stato, scelta manuale contraria rimuove l\'orario, ore facoltative', () => {
  let s = fresh();
  s = S.setEntry(s, 'sleep', START, { bed: '23:40' });
  assert.equal(s.entries.sleep[START].ok, true);
  s = S.setEntry(s, 'sleep', START, { bed: '00:20' });
  assert.equal(s.entries.sleep[START].ok, false);
  s = S.setEntry(s, 'sleep', START, { ok: true });
  assert.equal(s.entries.sleep[START].bed, undefined);
  s = S.setEntry(s, 'sleep', START, { hours: 7.26 });
  assert.equal(s.entries.sleep[START].hours, 7.5);
  s = S.setEntry(s, 'sleep', START, { ok: null, hours: null });
  assert.equal(s.entries.sleep[START], undefined);
});

// ---------- Stati ----------
test('stati: sabato libero, notti da registrare, giorni non registrati, futuro', () => {
  const s = fresh();
  const h = S.habitById(s, 'sleep');
  const r = S.habitById(s, 'read');
  const today = '2026-11-26';
  assert.equal(E.status(s, h, '2026-11-28', '2026-11-28'), 'free');
  assert.equal(E.status(s, h, today, today), 'pending');
  assert.equal(E.status(s, h, '2026-11-25', today), 'pending'); // ieri: ancora registrabile
  assert.equal(E.status(s, h, '2026-11-24', today), 'unlogged');
  assert.equal(E.status(s, h, '2026-11-27', today), 'future');
  assert.equal(E.status(s, h, '2026-11-20', today), 'inactive'); // prima del percorso
  assert.equal(E.status(s, r, today, today), 'pending');
  const s2 = S.setEntry(s, 'read', '2026-11-24', { min: 3 });
  assert.equal(E.status(s2, r, '2026-11-24', today), 'partial');
  assert.equal(E.status(s2, r, '2026-11-25', today), 'unlogged');
});

// ---------- Percorso ----------
test('percorso: 4 fasi settimanali, bilancio di 2 giorni, poi mantenimento', () => {
  const s = fresh();
  const blocks = E.allBlocks(s, add(START, 40));
  assert.deepEqual(blocks.slice(0, 4).map((b) => b.targets.sleep), [4, 5, 5, 6]);
  assert.deepEqual(blocks.slice(0, 4).map((b) => b.targets.read), [4, 5, 6, 6]);
  assert.deepEqual(blocks.slice(0, 4).map((b) => b.eligible.sleep), [6, 6, 6, 6]);
  const fin = blocks[4];
  assert.equal(fin.kind, 'final');
  assert.equal(fin.from, add(START, 28));
  assert.equal(fin.to, add(START, 29));
  assert.equal(fin.targets.read, 2);
  assert.equal(blocks[5].kind, 'maintenance');
  assert.equal(blocks[5].targets.sleep, 6);
  const days = blocks.slice(0, 5).reduce((a, b) => a + D.diffDays(b.from, b.to) + 1, 0);
  assert.equal(days, 30);
});

test('nuovo percorso: lo storico resta, il precedente si chiude, blocchi parziali ridotti in proporzione', () => {
  let s = fresh();
  s = log(s, [['read', START, { min: 10 }], ['sleep', START, { ok: true }]]);
  const next = add(START, 10);
  s = S.startJourney(s, next);
  assert.equal(s.journeys.length, 2);
  assert.equal(s.journeys[0].endedAt, add(START, 9));
  assert.equal(s.entries.read[START].min, 10);
  const b = E.allBlocks(s, add(next, 3));
  const partial = b.find((x) => x.journeyId === 1 && x.idx === 1);
  assert.equal(partial.to, add(START, 9));
  assert.equal(partial.partial, true);
  assert.ok(partial.targets.read < 5 && partial.targets.read >= 1);
  assert.equal(b.filter((x) => x.journeyId === 2)[0].from, next);
});

// ---------- XP, livelli, traguardi ----------
function perfectWeek(s, from = START) {
  const list = [];
  for (let i = 0; i < 7; i++) {
    const d = add(from, i);
    if (!D.isSaturday(d)) list.push(['sleep', d, { ok: true }]);
    list.push(['read', d, { min: 10 }]);
  }
  return log(s, list);
}

test('XP: valori dai dati reali, bonus giornata completa e obiettivi settimanali', () => {
  let s = fresh();
  s = log(s, [['sleep', START, { ok: true }]]);
  let c = E.compute(s, START);
  assert.equal(c.xp.total, 20);
  s = log(s, [['read', START, { min: 5 }]]);
  c = E.compute(s, START);
  assert.equal(c.xp.total, 50); // 20 + 20 + 10
  s = perfectWeek(fresh());
  c = E.compute(s, add(START, 6));
  // 6 notti + 7 letture = 13 × 20; 7 giornate complete (sabato: basta la lettura) × 10; 2 obiettivi × 50
  assert.equal(c.xp.habits, 260);
  assert.equal(c.xp.fullDays, 70);
  assert.equal(c.xp.weeks, 100);
  assert.equal(c.xp.total, 430);
});

test('XP: nessuna duplicazione modificando ripetutamente una registrazione', () => {
  let s = fresh();
  for (let i = 0; i < 25; i++) {
    s = S.setEntry(s, 'sleep', START, { ok: true });
    s = S.setEntry(s, 'sleep', START, { ok: false });
    s = S.setEntry(s, 'sleep', START, { ok: true });
    s = S.setEntry(s, 'read', START, { min: 5 + i });
  }
  const c = E.compute(s, START);
  assert.equal(c.xp.total, 50);
  s = S.setEntry(s, 'read', START, { min: null });
  assert.equal(E.compute(s, START).xp.total, 20);
});

test('XP e livelli non si perdono saltando giorni', () => {
  let s = perfectWeek(fresh());
  const before = E.compute(s, add(START, 6)).xp.total;
  const later = E.compute(s, add(START, 20));
  assert.equal(later.xp.total, before);
  assert.equal(later.level.n, E.levelFor(before).n);
  assert.equal(later.streaks.read.current, 0);
  assert.equal(later.streaks.read.best, 7);
});

test('livelli: soglie crescenti, titoli richiesti, progressione oltre il massimo', () => {
  assert.deepEqual(E.LEVELS.slice(0, 6).map((l) => l.title), ['Inizio', 'Costruttore', 'Costante', 'Disciplinato', 'Determinato', 'Inarrestabile']);
  for (let i = 1; i < E.LEVELS.length; i++) assert.ok(E.LEVELS[i].xp > E.LEVELS[i - 1].xp);
  assert.equal(E.levelFor(0).n, 1);
  assert.equal(E.levelFor(149).n, 1);
  assert.equal(E.levelFor(150).n, 2);
  assert.equal(E.levelFor(150).toNext, 300);
  assert.equal(E.levelFor(8000).n, 10);
  assert.equal(E.levelFor(10500).n, 11);
  assert.ok(E.levelFor(500).progress > 0 && E.levelFor(500).progress < 1);
});

test('serie: il sabato libero non interrompe la serie del sonno; serie e costanza separate', () => {
  let s = fresh();
  // lun–ven in orario, sabato libero, domenica in orario → serie 6
  s = log(s, [0, 1, 2, 3, 4, 6].map((i) => ['sleep', add(START, i), { ok: true }]));
  let c = E.compute(s, add(START, 6));
  assert.equal(c.streaks.sleep.current, 6);
  // lunedì successivo saltato: la serie si azzera, gli XP restano
  s = S.setEntry(s, 'sleep', add(START, 7), { ok: false });
  c = E.compute(s, add(START, 7));
  assert.equal(c.streaks.sleep.current, 0);
  assert.equal(c.streaks.sleep.best, 6);
  assert.equal(c.metrics.sleepDone, 6);
});

test('costanza basata sugli obiettivi realistici della settimana', () => {
  let s = fresh();
  // primi 2 giorni della settimana: entrambe le abitudini fatte
  s = log(s, [['sleep', START, { ok: true }], ['read', START, { min: 5 }], ['sleep', add(START, 1), { ok: true }], ['read', add(START, 1), { min: 5 }]]);
  let c = E.compute(s, add(START, 2));
  assert.equal(c.consistency.week, 1);
  // settimana conclusa con 4/6 notti e 4/7 letture = obiettivi pieni → 100%
  s = log(s, [2, 3].flatMap((i) => [['sleep', add(START, i), { ok: true }], ['read', add(START, i), { min: 5 }]]));
  c = E.compute(s, add(START, 7));
  assert.equal(c.blocks[0].consistency, 1);
  assert.equal(c.blocks[0].achieved, true);
  // settimana vuota → 0%, nessuna percentuale inventata per le settimane future
  c = E.compute(fresh(), add(START, 7));
  assert.equal(c.blocks[0].consistency, 0);
  assert.equal(c.blocks[2].timing, 'future');
  assert.equal(c.blocks[2].consistency, null);
  assert.equal(E.compute(fresh(), START).consistency.overall, null);
});

test('traguardi calcolati dal comportamento reale', () => {
  let s = perfectWeek(fresh());
  const c = E.compute(s, add(START, 6));
  const got = Object.fromEntries(c.achievements.map((a) => [a.id, a.unlocked]));
  assert.equal(got['primo-passo'], true);
  assert.equal(got['prima-giornata'], true);
  assert.equal(got['tre-notti'], true);
  assert.equal(got['sette-letture'], true);
  assert.equal(got['prima-settimana'], true);
  assert.equal(got['ora-di-lettura'], true);
  assert.equal(got['settimana-sonno'], true);
  assert.equal(got['dieci-giornate'], false);
  assert.equal(got['trenta-giorni'], false);
  assert.equal(got.ripartenza, false);
  // ripartenza dopo almeno 3 giorni di pausa
  s = S.setEntry(s, 'read', add(START, 11), { min: 5 });
  assert.equal(E.compute(s, add(START, 11)).achievements.find((a) => a.id === 'ripartenza').unlocked, true);
  // 30 giorni di percorso
  assert.equal(E.compute(fresh(), add(START, 29)).achievements.find((a) => a.id === 'trenta-giorni').unlocked, true);
  assert.equal(E.ACHIEVEMENTS.length, 12);
});

// ---------- Proposte ----------
test('due settimane sotto obiettivo → proposta di riduzione, mai applicata senza consenso', () => {
  let s = fresh();
  s = log(s, [0, 1, 7, 8].map((i) => ['sleep', add(START, i), { ok: true }]));
  s = log(s, [0, 1, 2, 3, 7, 8, 9, 10, 11].map((i) => ['read', add(START, i), { min: 5 }]));
  const today = add(START, 15);
  let c = E.compute(s, today);
  const p = E.proposals(s, c);
  const red = p.find((x) => x.type === 'reduce' && x.habitId === 'sleep');
  assert.ok(red, 'proposta presente');
  assert.equal(red.from, 5);
  assert.equal(red.to, 4);
  assert.equal(p.some((x) => x.type === 'reduce' && x.habitId === 'read'), false); // lettura riuscita in settimana 1
  assert.equal(c.current.targets.sleep, 5); // non cambia da sola
  // accettata → solo la settimana corrente diventa più leggera
  let s2 = S.setJourneyAdjust(s, red.journeyId, red.blockIdx, 'sleep', red.to);
  s2 = S.decideProposal(s2, red.key, 'accepted', today);
  c = E.compute(s2, today);
  assert.equal(c.current.targets.sleep, 4);
  assert.equal(E.allBlocks(s2, add(START, 22))[3].targets.sleep, 6);
  assert.equal(E.proposals(s2, c).some((x) => x.key === red.key), false);
  // rifiutata → non viene riproposta
  const s3 = S.decideProposal(s, red.key, 'declined', today);
  assert.equal(E.proposals(s3, E.compute(s3, today)).some((x) => x.key === red.key), false);
  assert.equal(E.compute(s3, today).current.targets.sleep, 5);
});

test('lettura: aumento proposto solo con abitudine consolidata, obiettivo modificabile solo dal giorno scelto', () => {
  let s = fresh();
  const list = [];
  for (let i = 0; i < 14; i++) list.push(['read', add(START, i), { min: 15 }]);
  s = log(s, list);
  const today = add(START, 15);
  const p = E.proposals(s, E.compute(s, today)).find((x) => x.type === 'read-up');
  assert.ok(p);
  assert.equal(p.to, 10);
  const xpBefore = E.compute(s, today).xp.total;
  s = S.setReadGoal(s, 10, today);
  const r = S.habitById(s, 'read');
  assert.equal(E.goalMinOn(r, add(START, 3)), 5);
  assert.equal(E.goalMinOn(r, today), 10);
  assert.equal(E.compute(s, today).xp.total, xpBefore); // il passato non cambia
  // con poca lettura nessuna proposta
  const weak = log(fresh(), [['read', START, { min: 5 }]]);
  assert.equal(E.proposals(weak, E.compute(weak, today)).some((x) => x.type === 'read-up'), false);
});

// ---------- Riepilogo ----------
test('riepilogo di fine percorso: dati reali e proposta per il prossimo percorso', () => {
  let s = fresh();
  for (let w = 0; w < 4; w++) s = perfectWeek(s, add(START, w * 7));
  s = log(s, [['read', add(START, 28), { min: 6 }], ['read', add(START, 29), { min: 7 }], ['sleep', add(START, 28), { ok: true }], ['sleep', add(START, 29), { ok: true }]]);
  const sum = E.journeySummary(s, s.journeys[0], add(START, 30));
  assert.equal(sum.days, 30);
  assert.equal(sum.readDays, 30);
  assert.equal(sum.nights, sum.nightsEligible);
  assert.equal(sum.minutes, 4 * 70 + 13);
  assert.equal(sum.weeksAchieved, 5);
  assert.deepEqual(sum.built, ['sleep', 'read']);
  assert.equal(sum.next.id, 'mantenimento');
  assert.ok(sum.consistency > 0.99);
});

// ---------- Abitudini generiche ----------
test('sistema generico: una nuova abitudine si aggiunge senza toccare il motore', () => {
  let s = fresh();
  s = S.addHabit(s, { name: 'Allenamento', type: 'check', icon: 'run', color: 'sky', perWeek: 3 }, add(START, 7));
  const h = s.habits[2];
  assert.equal(h.id, 'allenamento');
  assert.equal(h.since, add(START, 7));
  s = log(s, [['allenamento', add(START, 7), { done: true }], ['allenamento', add(START, 8), { done: true }]]);
  const c = E.compute(s, add(START, 9));
  assert.equal(c.current.targets.allenamento, 3);
  assert.equal(c.current.habits.allenamento.done, 2);
  assert.equal(E.status(s, h, add(START, 3), add(START, 9)), 'inactive');
  assert.equal(c.metrics.habitDone, 2);
  s = S.archiveHabit(s, 'allenamento', add(START, 12));
  assert.equal(E.visibleHabits(s, add(START, 12)).length, 2);
  assert.equal(s.entries.allenamento[add(START, 7)].done, true); // storico conservato
  const again = S.migrate(JSON.parse(JSON.stringify(s)));
  assert.equal(again.habits.length, 3);
});

// ---------- Messaggi ----------
test('messaggi contestuali basati sui progressi reali', () => {
  let s = fresh();
  s = log(s, [0, 1, 2].map((i) => ['sleep', add(START, i), { ok: true }]));
  s = log(s, [0, 1, 2].map((i) => ['read', add(START, i), { min: 12 }]));
  const today = add(START, 3);
  const c = E.compute(s, today);
  const msgs = M.buildMessages(s, c, new Date(2026, 10, 26, 18, 0));
  const ids = msgs.map((m) => m.id);
  assert.ok(ids.includes('one-left-sleep'));
  assert.ok(msgs.find((m) => m.id === 'one-left-read').text.includes('una sola lettura'));
  assert.ok(msgs.find((m) => m.id === 'sleep-streak').text.includes('tre notti consecutive'));
  assert.ok(msgs.find((m) => m.id === 'week-minutes').text.includes('36 minuti'));
  // dopo un giorno saltato: messaggio non colpevolizzante con i progressi reali
  const later = E.compute(s, add(START, 5));
  const m2 = M.buildMessages(s, later, new Date(2026, 10, 28, 10, 0)).find((m) => m.id === 'after-miss');
  assert.ok(m2.text.startsWith('Una giornata saltata non annulla'));
  assert.ok(m2.text.includes('3 notti'));
  // sabato
  assert.ok(M.buildMessages(s, later, new Date(2026, 10, 28, 10, 0)).some((m) => m.id === 'saturday'));
  // ordine stabile nello stesso giorno
  assert.deepEqual(M.buildMessages(s, c, new Date(2026, 10, 26, 18, 0)).map((m) => m.id), ids);
});
