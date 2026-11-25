import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../site/js/core.js';

// 2026-11-23 è un lunedì → il sabato del primo blocco è il 2026-11-28 (indice 5)
const START = '2026-11-23';

function stateWith(entries, start = START) {
  let s = C.createState(start);
  for (const [iso, patch] of Object.entries(entries)) s = C.setEntry(s, iso, patch);
  return s;
}

test('date: parse/format, addDays, diffDays, cambio ora legale', () => {
  assert.equal(C.addDays('2026-03-28', 2), '2026-03-30'); // ora legale UE
  assert.equal(C.addDays('2026-10-24', 2), '2026-10-26'); // ora solare UE
  assert.equal(C.diffDays('2026-03-28', '2026-03-30'), 2);
  assert.equal(C.addDays('2024-02-28', 1), '2024-02-29');
  assert.equal(C.addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(C.isSaturday('2026-11-28'), true);
  assert.equal(C.isSaturday('2026-11-29'), false);
  assert.equal(C.isValidISO('2026-02-30'), false);
  assert.equal(C.isValidISO('2026-02-28'), true);
  assert.equal(C.formatDateShort('2026-11-25'), 'Mer 25 nov');
});

test('giorno logico: prima delle 5:00 conta come il giorno precedente', () => {
  assert.equal(C.logicalToday(new Date(2026, 10, 26, 0, 30)), '2026-11-25');
  assert.equal(C.logicalToday(new Date(2026, 10, 26, 4, 59)), '2026-11-25');
  assert.equal(C.logicalToday(new Date(2026, 10, 26, 5, 0)), '2026-11-26');
  assert.equal(C.logicalToday(new Date(2026, 10, 26, 23, 59)), '2026-11-26');
});

test('orario a letto: entro mezzanotte', () => {
  assert.equal(C.bedtimeOnTime('22:15'), true);
  assert.equal(C.bedtimeOnTime('23:59'), true);
  assert.equal(C.bedtimeOnTime('00:00'), true);
  assert.equal(C.bedtimeOnTime('00:01'), false);
  assert.equal(C.bedtimeOnTime('01:30'), false);
  assert.equal(C.bedtimeOffset('23:30'), -30);
  assert.equal(C.bedtimeOffset('00:45'), 45);
  assert.equal(C.offsetToTime(-30), '23:30');
  assert.equal(C.offsetToTime(45), '00:45');
  assert.equal(C.minutesToMidnight(new Date(2026, 10, 25, 22, 0, 0)), 120);
});

test('obiettivi progressivi', () => {
  assert.deepEqual(C.BLOCKS.slice(0, 4).map((b) => b.sleep), [4, 5, 5, 6]);
  assert.deepEqual(C.BLOCKS.slice(0, 4).map((b) => b.read), [4, 5, 6, 6]);
  const covered = C.BLOCKS.reduce((a, b) => a + (b.to - b.from + 1), 0);
  assert.equal(covered, C.CHALLENGE_DAYS);
});

test('setEntry: orario deriva lo stato, scelta manuale contraria rimuove l\'orario', () => {
  let s = stateWith({ '2026-11-23': { bed: '23:40' } });
  assert.equal(s.days['2026-11-23'].sleep, true);
  s = C.setEntry(s, '2026-11-23', { bed: '00:20' });
  assert.equal(s.days['2026-11-23'].sleep, false);
  s = C.setEntry(s, '2026-11-23', { sleep: true });
  assert.equal(s.days['2026-11-23'].bed, undefined);
  assert.equal(s.days['2026-11-23'].sleep, true);
  s = C.setEntry(s, '2026-11-23', { sleep: null });
  assert.equal(s.days['2026-11-23'], undefined);
});

test('sabato sera libero: non conta e non interrompe la serie', () => {
  const today = '2026-11-30'; // lunedì, giorno 8
  const entries = {};
  for (let i = 0; i < 7; i++) {
    const d = C.addDays(START, i);
    if (!C.isSaturday(d)) entries[d] = { sleep: true, min: 10 };
    else entries[d] = { min: 10 }; // sabato: nessun dato sul sonno
  }
  const s = stateWith(entries);
  assert.equal(C.sleepStatus(s, '2026-11-28', today), 'free');
  const st = C.computeStats(s, today);
  assert.equal(st.sleepStreak.current, 6);
  assert.equal(st.sleepDone, 6);
  assert.equal(st.sleepCounted, 6); // sabato escluso
  assert.equal(st.blocks[0].sleepTarget, 4);
  assert.equal(st.blocks[0].achieved, true);
  assert.equal(st.perfectDays, 7); // sabato con lettura = perfetto
  // anche se il sabato è tardi, resta libero
  const s2 = C.setEntry(s, '2026-11-28', { bed: '02:00' });
  assert.equal(C.sleepStatus(s2, '2026-11-28', today), 'free');
  assert.equal(C.computeStats(s2, today).sleepStreak.current, 6);
});

test('stati in sospeso: notte di ieri e lettura di oggi', () => {
  const today = '2026-11-25';
  const s = stateWith({});
  assert.equal(C.sleepStatus(s, '2026-11-24', today), 'pending'); // ieri
  assert.equal(C.sleepStatus(s, '2026-11-23', today), 'missed');
  assert.equal(C.readStatus(s, '2026-11-25', today), 'pending');
  assert.equal(C.readStatus(s, '2026-11-24', today), 'missed');
  assert.equal(C.readStatus(s, '2026-11-26', today), 'future');
  const s2 = C.setEntry(s, '2026-11-24', { min: 4 });
  assert.equal(C.readStatus(s2, '2026-11-24', today), 'missed'); // 4 min < 5
  const s3 = C.setEntry(s, '2026-11-24', { min: 5 });
  assert.equal(C.readStatus(s3, '2026-11-24', today), 'done');
});

test('serie: interruzione e record', () => {
  const today = '2026-12-02';
  const s = stateWith({
    '2026-11-23': { min: 5 }, '2026-11-24': { min: 5 }, '2026-11-25': { min: 5 },
    '2026-11-27': { min: 5 }, '2026-11-28': { min: 5 },
    '2026-11-29': { min: 5 }, '2026-11-30': { min: 5 }, '2026-12-01': { min: 5 },
  });
  const st = C.computeStats(s, today);
  assert.equal(st.readStreak.best, 5); // 27 → 1 dic
  assert.equal(st.readStreak.current, 5); // oggi in sospeso non interrompe
  assert.equal(st.readDone, 8);
  assert.equal(st.readCounted, 9);
  assert.equal(st.readRate, 89);
});

test('obiettivi settimanali: settimana 4 richiede 6 notti su 6', () => {
  const s0 = C.createState(START);
  const b4 = C.BLOCKS[3];
  let s = s0;
  const dates = [];
  for (let i = b4.from; i <= b4.to; i++) dates.push(C.addDays(START, i));
  const weeknights = dates.filter((d) => !C.isSaturday(d));
  assert.equal(weeknights.length, 6);
  weeknights.slice(0, 5).forEach((d) => { s = C.setEntry(s, d, { sleep: true, min: 6 }); });
  const today = C.addDays(START, 29);
  let p = C.blockProgress(s, b4, today);
  assert.equal(p.sleepTarget, 6);
  assert.equal(p.sleepOk, false);
  assert.equal(p.readOk, false); // 5 giorni < 6
  s = C.setEntry(s, weeknights[5], { sleep: true, min: 6 });
  p = C.blockProgress(s, b4, today);
  assert.equal(p.achieved, true);
  assert.equal(p.phase, 'past');
});

test('finale (giorni 29-30): obiettivo sonno = notti valide', () => {
  const s = C.createState(START);
  const p = C.blockProgress(s, C.BLOCKS[4], C.addDays(START, 40));
  const nights = [28, 29].map((i) => C.addDays(START, i)).filter((d) => !C.isSaturday(d)).length;
  assert.equal(p.sleepTarget, nights);
  assert.equal(p.readTarget, 2);
});

test('statistiche complete su una sfida perfetta', () => {
  let s = C.createState(START);
  for (const d of C.challengeDates(START)) s = C.setEntry(s, d, C.isSaturday(d) ? { min: 12 } : { bed: '23:30', min: 12 });
  const st = C.computeStats(s, C.addDays(START, 35));
  assert.equal(st.finished, true);
  assert.equal(st.overallRate, 100);
  assert.equal(st.challengeProgress, 100);
  assert.equal(st.blocks.every((b) => b.achieved), true);
  assert.equal(st.perfectDays, 30);
  assert.equal(st.avgBedTime, '23:30');
  assert.equal(st.totalMin, 360);
  assert.equal(st.readStreak.best, 30);
});

test('esportazione e importazione: andata e ritorno', () => {
  const s = stateWith({ '2026-11-23': { bed: '23:10', min: 15 }, '2026-11-24': { sleep: false, min: 3 } });
  s.settings.book = 'Il nome della rosa';
  const back = C.importPayload(C.exportPayload(s));
  assert.equal(back.start, START);
  assert.deepEqual(back.days, s.days);
  assert.equal(back.settings.book, 'Il nome della rosa');
});

test('importazione: rifiuta file non validi e ripulisce i dati', () => {
  assert.throws(() => C.importPayload('non json'), /JSON/);
  assert.throws(() => C.importPayload('{"app":"altro","version":1}'), /MEZZANOTTE/);
  assert.throws(() => C.importPayload('{"app":"mezzanotte","version":99}'), /Versione/);
  assert.throws(() => C.importPayload('{"app":"mezzanotte","version":1,"start":"ieri"}'), /inizio/);
  const s = C.importPayload(JSON.stringify({
    app: 'mezzanotte', version: 1, start: START,
    days: { '2026-11-23': { bed: '25:99', sleep: true, min: '7' }, 'xx': { min: 5 }, '2026-11-24': { min: -3 } },
  }));
  assert.deepEqual(s.days, { '2026-11-23': { sleep: true, min: 7 } });
});

test('nessuna sfida avviata → statistiche nulle', () => {
  assert.equal(C.computeStats(C.createState(null), '2026-11-25'), null);
});
