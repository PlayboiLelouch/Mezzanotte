// MEZZANOTTE — modelli HTML delle schermate (nessuna logica di stato qui).
import * as D from './core.js';
import * as S from './store.js';
import * as E from './engine.js';
import { I } from './icons.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
export const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
export const nf = (n) => Number(n).toLocaleString('it-IT');
const pct = (v) => (v === null || v === undefined ? '—' : `${Math.round(v * 100)}%`);

// ---------- Memoria per animazioni fluide tra un rendering e l'altro ----------
export const animMemory = new Map();

export function ring(id, size, stroke, value, cls, { round = true } = {}) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const to = circ * (1 - Math.min(1, Math.max(0, value)));
  const from = animMemory.has(id) ? animMemory.get(id) : circ;
  return `<circle class="ring-track" cx="${size / 2}" cy="${size / 2}" r="${r}" stroke-width="${stroke}"/>
    <circle class="ring-bar ${cls}" data-anim="${id}" data-to="${to.toFixed(2)}" cx="${size / 2}" cy="${size / 2}" r="${r}" stroke-width="${stroke}"
      stroke-dasharray="${circ.toFixed(2)}" style="stroke-dashoffset:${Number(from).toFixed(2)}" ${round ? 'stroke-linecap="round"' : ''} transform="rotate(-90 ${size / 2} ${size / 2})"/>`;
}

export function bar(id, value, cls) {
  const to = Math.round(Math.min(1, Math.max(0, value)) * 1000) / 10;
  const from = animMemory.has(id) ? animMemory.get(id) : 0;
  return `<div class="bar"><i class="${cls}" data-anim="${id}" data-to="${to}" data-kind="width" style="width:${from}%"></i></div>`;
}

const icon = (name) => I[name] || I.spark;
const phaseName = (b) => (b?.phase ? E.PHASES[b.phase - 1].name : 'Mantenimento');
const blockLabel = (b) => (b.kind === 'phase' ? `Settimana ${b.idx + 1}` : b.kind === 'final' ? 'Bilancio' : `Mantenimento ${b.idx - 4}`);
const shortBlock = (b) => (b.kind === 'phase' ? `S${b.idx + 1}` : b.kind === 'final' ? 'B' : `M${b.idx - 4}`);
const unit = (h, n) => (h.id === 'sleep' ? D.plural(n, 'notte', 'notti') : h.id === 'read' ? D.plural(n, 'lettura', 'letture') : D.plural(n, 'giorno', 'giorni'));

function header(eyebrow, title, right = '') {
  return `<header class="page-head"><div><div class="eyebrow">${eyebrow}</div><h1 class="large-title">${title}</h1></div>${right}</header>`;
}

function levelBadge(c, size = 46) {
  return `<button class="level-badge" data-action="goto" data-tab="profile" aria-label="Livello ${c.level.n}, ${esc(c.level.title)}" style="width:${size}px;height:${size}px">
    <svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">${ring('lv-badge', size, 3.5, c.level.progress, 'gold')}</svg><b>${c.level.n}</b></button>`;
}

// ---------- OGGI ----------
export function sleepNight(ctx) {
  const { state, today, now } = ctx;
  const h = S.habitById(state, 'sleep');
  const y = D.addDays(today, -1);
  const ys = E.status(state, h, y, today);
  if (ys === 'pending' && now.getHours() >= D.DAY_CUTOFF_HOUR && now.getHours() < 15) return y;
  return today;
}

function countdown(now) {
  if (now.getHours() < D.DAY_CUTOFF_HOUR) return 'Mezzanotte è passata: chiudi tutto e vai a dormire';
  return `Mancano ${D.formatDuration(D.minutesToMidnight(now))} a mezzanotte`;
}

const ROUTINE = [
  { t: '23:15', label: 'Niente nuovi lavori' },
  { t: '23:30', label: 'Chiudi i progetti' },
  { t: '23:45', label: 'Preparati' },
  { t: '00:00', label: 'A letto' },
];

export function routineStrip(now) {
  const m = now.getHours() * 60 + now.getMinutes();
  const off = m >= 720 ? m - 1440 : m; // rispetto a mezzanotte
  let active = -1;
  ROUTINE.forEach((s, i) => { if (off >= D.bedtimeOffset(s.t)) active = i; });
  return `<div class="routine" aria-label="Routine serale">${ROUTINE.map((s, i) => `<div class="r-step ${i < active ? 'past' : i === active ? 'now' : ''}"><i></i><b>${s.t}</b><span>${s.label}</span></div>`).join('')}</div>`;
}

export function showRoutine(ctx, h, iso, st) {
  const { now, today } = ctx;
  if (!h.config.routine || iso !== today || st !== 'pending') return false;
  const m = now.getHours() * 60 + now.getMinutes();
  return m >= 22 * 60 + 30 || m < 60;
}

function checkBtn(h, iso, done, label) {
  return `<button class="check ${done ? 'on' : ''}" data-action="habit-check" data-habit="${h.id}" data-iso="${iso}" aria-pressed="${done}" aria-label="${esc(label)}">
    <span class="check-ring"></span><span class="check-mark">${I.check}</span></button>`;
}

function sleepCard(ctx, h) {
  const { state, today, now } = ctx;
  const iso = sleepNight(ctx);
  const st = E.status(state, h, iso, today);
  const e = state.entries.sleep[iso] || {};
  const when = iso === today ? (D.isSaturday(iso) ? 'sabato sera' : 'stanotte') : 'ieri sera';
  let sub;
  if (st === 'free') sub = 'Sera libera: non conta e non interrompe la serie';
  else if (st === 'done') sub = `${e.bed ? `A letto alle ${e.bed}` : 'Entro mezzanotte'}${e.hours ? ` · ${D.formatHours(e.hours)} di sonno` : ''}`;
  else if (st === 'missed') sub = `${e.bed ? `A letto alle ${e.bed}` : 'Dopo mezzanotte'}${e.hours ? ` · ${D.formatHours(e.hours)} di sonno` : ''}`;
  else if (iso !== today) sub = 'Sei andato a letto entro mezzanotte?';
  else if (now.getHours() >= 21 || now.getHours() < D.DAY_CUTOFF_HOUR) sub = `<span data-countdown>${countdown(now)}</span>`;
  else sub = `A letto entro le ${h.config.deadline} · routine dalle 23:15`;

  // notte di ieri ancora da registrare, mostrata nel pomeriggio come promemoria compatto
  const y = D.addDays(today, -1);
  const ys = iso === today ? E.status(state, h, y, today) : null;
  const yRow = ys === 'pending'
    ? `<div class="h-yesterday"><span>Ieri sera?</span><button data-action="sleep-set" data-iso="${y}" data-val="1" class="mini on">Entro mezzanotte</button><button data-action="sleep-set" data-iso="${y}" data-val="0" class="mini">Dopo</button></div>`
    : '';
  const right = st === 'free'
    ? '<span class="free-pill">Libera</span>'
    : checkBtn(h, iso, st === 'done', 'A letto entro mezzanotte');
  const actions = st === 'free'
    ? `<button class="h-act" data-action="open-day" data-iso="${iso}" data-focus="sleep">Registra comunque</button>`
    : `${st === 'pending' ? `<button class="h-act" data-action="sleep-set" data-iso="${iso}" data-val="0">Dopo mezzanotte</button>` : ''}
       <button class="h-act" data-action="open-day" data-iso="${iso}" data-focus="sleep">${st === 'done' || st === 'missed' ? 'Modifica' : 'Orario e ore'}</button>`;
  return `<article class="habit c-sleep ${st === 'done' ? 'is-done' : ''} ${st === 'free' ? 'is-free' : ''}" data-card="sleep" data-status="${st}">
    <div class="h-row">
      <button class="h-main" data-action="open-day" data-iso="${iso}" data-focus="sleep" aria-label="Sonno, dettagli">
        <span class="h-icon">${I.moon}</span>
        <span class="h-text"><span class="h-name">Sonno <em>${when}</em></span><span class="h-sub">${sub}</span></span>
      </button>
      ${right}
    </div>
    ${showRoutine(ctx, h, iso, st) ? routineStrip(now) : ''}
    <div class="h-actions">${actions}</div>
    ${yRow}
  </article>`;
}

function durationCard(ctx, h) {
  const { state, today, timer } = ctx;
  const iso = today;
  const st = E.status(state, h, iso, today);
  const min = state.entries[h.id]?.[iso]?.min || 0;
  const goal = E.goalMinOn(h, iso);
  const book = h.id === 'read' && h.config.book ? ` · <span class="book">${esc(h.config.book)}</span>` : '';
  const total = Object.values(state.entries[h.id] || {}).reduce((a, x) => a + x.min, 0);
  let sub;
  if (st === 'done') sub = `${min} minuti oggi${book}`;
  else if (min > 0) sub = `${min} di ${goal} minuti${book}`;
  else sub = `Almeno ${goal} minuti${book}`;
  const running = timer && timer.habit === h.id;
  const timerBtn = h.id === 'read'
    ? running
      ? `<button class="h-act live" data-action="open-timer"><span class="dot"></span><span data-timer>00:00</span> · in corso</button>`
      : `<button class="h-act" data-action="open-timer">${I.play}Timer</button>`
    : '';
  return `<article class="habit c-${h.color} ${st === 'done' ? 'is-done' : ''}" data-card="${h.id}" data-status="${st}">
    <div class="h-row">
      <button class="h-main" data-action="open-day" data-iso="${iso}" data-focus="${h.id}" aria-label="${esc(h.name)}, dettagli">
        <span class="h-icon">${icon(h.icon)}</span>
        <span class="h-text"><span class="h-name">${esc(h.name)} <em>${h.id === 'read' ? `${nf(total)} min in tutto` : 'oggi'}</em></span><span class="h-sub">${sub}</span></span>
      </button>
      ${checkBtn(h, iso, st === 'done', h.id === 'read' ? `Ho letto ${goal} minuti` : `Fatto: ${h.name}`)}
    </div>
    <div class="h-actions">${timerBtn}<button class="h-act" data-action="open-day" data-iso="${iso}" data-focus="${h.id}">${I.plus}Minuti</button></div>
  </article>`;
}

function checkCard(ctx, h) {
  const { state, today } = ctx;
  const st = E.status(state, h, today, today);
  return `<article class="habit c-${h.color} ${st === 'done' ? 'is-done' : ''}" data-card="${h.id}" data-status="${st}">
    <div class="h-row">
      <button class="h-main" data-action="open-day" data-iso="${today}" data-focus="${h.id}" aria-label="${esc(h.name)}, dettagli">
        <span class="h-icon">${icon(h.icon)}</span>
        <span class="h-text"><span class="h-name">${esc(h.name)} <em>oggi</em></span><span class="h-sub">${st === 'done' ? 'Fatto' : `${h.config.perWeek} volte a settimana`}</span></span>
      </button>
      ${checkBtn(h, today, st === 'done', `Fatto: ${h.name}`)}
    </div>
  </article>`;
}

export function habitCard(ctx, h) {
  if (h.type === 'bedtime') return sleepCard(ctx, h);
  if (h.type === 'duration') return durationCard(ctx, h);
  return checkCard(ctx, h);
}

function weekStrip(ctx, b) {
  const { state, today } = ctx;
  const habits = E.activeHabits(state, today).filter((h) => b.targets[h.id] !== undefined).slice(0, 3);
  const days = D.rangeISO(b.from, b.to).map((d) => {
    const dots = habits.map((h) => {
      const s = E.status(state, h, d, today);
      return `<i class="dot-${h.color} s-${s}"></i>`;
    }).join('');
    const info = E.dayInfo(state, d, today);
    return `<div class="wd ${d === today ? 'today' : ''} ${info.complete ? 'complete' : ''} ${d > today ? 'future' : ''}"><span>${D.WEEKDAYS_INITIAL[D.weekday(d)]}</span><div class="dots">${dots}</div></div>`;
  }).join('');
  return `<div class="week-days" style="--n:${D.diffDays(b.from, b.to) + 1}">${days}</div>`;
}

function weekCard(ctx) {
  const { state, c } = ctx;
  const b = c.current;
  if (!b) return '';
  const rows = Object.entries(b.habits).map(([hid, hp]) => {
    const h = S.habitById(state, hid);
    return `<div class="wk-goal"><span class="lbl"><i class="dot-${h.color}"></i>${cap(unit(h, 2))}</span><span class="num ${hp.ok ? 'ok' : ''}">${hp.done}<small>/${hp.target}</small></span>${bar(`wk-${hid}`, hp.done / hp.target, `fill-${h.color}`)}</div>`;
  }).join('');
  const left = b.daysLeft === 1 ? 'ultimo giorno' : `${b.daysLeft} giorni rimasti`;
  return `<button class="week-card surface" data-action="goto" data-tab="goals" aria-label="Obiettivi della settimana">
    <div class="wk-head"><span><b>${blockLabel(b)}</b> · ${phaseName(b)}</span><span class="muted">${b.achieved ? `<span class="gold-txt">${I.check}Obiettivi raggiunti</span>` : left}</span></div>
    ${weekStrip(ctx, b)}
    <div class="wk-goals">${rows}</div>
  </button>`;
}

function proposalCard(ctx, p) {
  const { state } = ctx;
  const h = S.habitById(state, p.habitId);
  let title;
  let text;
  let yes;
  if (p.type === 'reduce') {
    title = 'Settimana più leggera?';
    text = `Nelle ultime due settimane: ${p.history.join(' e ')} ${h.id === 'sleep' ? 'notti' : 'giorni'}. Per questa settimana puoi puntare a ${p.to} ${unit(h, p.to)} invece di ${p.from}. Dalla prossima torni al piano normale.`;
    yes = `Sì, ${p.to} questa settimana`;
  } else if (p.type === 'read-up') {
    title = 'La lettura è un\'abitudine solida';
    text = `Da due settimane leggi quasi ogni giorno, in media più del doppio dell'obiettivo. Vuoi portare il minimo a ${p.to} minuti al giorno? Puoi sempre tornare indietro.`;
    yes = `Sì, ${p.to} minuti`;
  } else {
    title = 'Più ore di sonno?';
    text = `Nelle ultime due settimane hai dormito con regolarità almeno ${D.formatHours(p.from)}. Vuoi alzare l'obiettivo a ${D.formatHours(p.to)}? La sveglia resta alle ${S.habitById(state, 'sleep').config.wake}.`;
    yes = `Sì, ${D.formatHours(p.to)}`;
  }
  return `<section class="proposal surface" data-proposal="${esc(p.key)}">
    <div class="p-head"><span class="p-icon">${p.type === 'reduce' ? I.heart : I.trend}</span><b>${title}</b></div>
    <p>${text}</p>
    <div class="p-actions"><button class="btn btn-small btn-ghost" data-action="proposal" data-key="${esc(p.key)}" data-val="0">No, mantieni</button><button class="btn btn-small btn-primary" data-action="proposal" data-key="${esc(p.key)}" data-val="1">${yes}</button></div>
  </section>`;
}

function welcomeBack(ctx) {
  const { ui } = ctx;
  if (!ui.away) return '';
  const n = ui.away.days.length;
  return `<section class="welcome-back surface">
    <p>${n === 1 ? 'Un giorno non è stato registrato.' : `${n} giorni non sono stati registrati.`} Puoi recuperare quello che ricordi con certezza, oppure ripartire semplicemente da oggi.</p>
    <div class="p-actions"><button class="btn btn-small btn-ghost" data-action="away-dismiss">Riparti da oggi</button><button class="btn btn-small btn-primary" data-action="open-catchup">Recupera</button></div>
  </section>`;
}

export function viewToday(ctx) {
  const { state, c, today, ui } = ctx;
  // al rientro dopo qualche giorno il messaggio principale è un bentornato positivo
  const message = ui.away
    ? { tone: 'gold', icon: 'sunrise', text: `Bentornato. Quello che hai costruito è ancora qui: ${nf(c.xp.total)} XP e livello ${c.level.n}, ${c.level.title}.` }
    : ctx.message;
  const j = c.journey;
  const eyebrow = cap(D.formatDateLong(today));
  let title;
  if (c.journeyState === 'upcoming') title = `Si parte ${D.diffDays(today, j.start) === 1 ? 'domani' : `tra ${D.diffDays(today, j.start)} giorni`}`;
  else if (c.journeyState === 'active') title = `Giorno ${c.journeyDay} <span class="of">di 30</span>`;
  else title = 'Oggi';
  const habits = E.visibleHabits(state, today).filter((h) => E.habitActiveOn(h, today) || h.type === 'bedtime');
  const doneToday = E.dayInfo(state, today, today);
  const ended = c.journeyState === 'completed' || c.journeyState === 'ended';
  const endCard = ended
    ? `<button class="end-card surface" data-action="open-summary" data-journey="${j.id}"><span class="p-icon gold">${I.mountain}</span><span><b>${c.journeyState === 'completed' ? 'Percorso completato' : 'Percorso concluso'}</b><small>Guarda il bilancio e scegli il prossimo percorso</small></span>${I.chevR}</button>`
    : '';
  const prop = ctx.proposals[0] ? proposalCard(ctx, ctx.proposals[0]) : '';
  return `<header class="today-head">
      <div class="th-row"><div><div class="eyebrow">${eyebrow}</div><h1 class="large-title">${title}</h1></div>${levelBadge(c)}</div>
      <div class="xp-line"><span><b>Livello ${c.level.n}</b> · ${esc(c.level.title)}</span><span class="xp-num"><b data-xp>${nf(c.xp.total)}</b> / ${nf(c.level.next)} XP</span></div>
      ${bar('xp-today', c.level.progress, 'fill-gold')}
    </header>
    ${message ? `<p class="insight t-${message.tone}"><span>${icon(message.icon)}</span>${esc(message.text)}</p>` : ''}
    ${endCard}
    <div class="section-head"><h2>Oggi</h2><span class="${doneToday.complete ? 'gold-txt' : ''}">${doneToday.complete ? `${I.check}Giornata completa` : `${doneToday.done} di ${doneToday.total}`}</span></div>
    <div class="habits">${habits.map((h) => habitCard(ctx, h)).join('')}</div>
    ${welcomeBack(ctx)}${prop}
    ${weekCard(ctx)}`;
}

// ---------- OBIETTIVI ----------
function phaseRow(ctx, b) {
  const { state } = ctx;
  const st = b.timing === 'past' ? (b.achieved ? 'done' : 'closed') : b.timing === 'current' ? 'current' : 'next';
  const goals = Object.entries(b.habits).map(([hid, hp]) => {
    const h = S.habitById(state, hid);
    return `<span class="pg ${hp.ok ? 'ok' : ''}"><i class="dot-${h.color}"></i>${b.timing === 'future' ? '' : `${hp.done}/`}${hp.target} ${unit(h, hp.target)}${hp.ok ? I.check : ''}</span>`;
  }).join('');
  const node = st === 'done' ? `<span class="node done">${I.check}</span>` : st === 'current' ? '<span class="node current"><i></i></span>' : `<span class="node ${st}"></span>`;
  const p = E.PHASES[b.phase - 1];
  const detail = st === 'current'
    ? `<p class="ph-goal">${p.goal}</p>${Object.entries(b.habits).map(([hid, hp]) => {
      const h = S.habitById(state, hid);
      return `<div class="ph-bar"><span>${esc(h.name)}</span><span class="num">${hp.done}/${hp.target}</span>${bar(`ph-${b.key}-${hid}`, hp.done / hp.target, `fill-${h.color}`)}</div>`;
    }).join('')}<p class="ph-left">${b.daysLeft === 1 ? 'Ultimo giorno della fase' : `${b.daysLeft} giorni alla fine della fase`}</p>`
    : '';
  return `<li class="phase ${st}">${node}<div class="ph-body">
    <div class="ph-top"><b>${b.phase <= 4 ? `Fase ${b.phase} · ` : ''}${p.name}</b><span>${D.formatRange(b.from, b.to)}</span></div>
    <div class="ph-goals">${goals}${st === 'done' ? '<span class="pg gold">Completata</span>' : ''}</div>${detail}</div></li>`;
}

function achievementBadge(a, size = 64) {
  return `<span class="badge ${a.unlocked ? 'on' : ''}" style="--s:${size}px">
    ${a.unlocked ? '' : `<svg viewBox="0 0 ${size} ${size}">${ring(`ach-${a.id}`, size, 3, a.ratio, 'dim')}</svg>`}
    <span class="badge-icon">${icon(a.icon)}</span></span>`;
}

export function viewGoals(ctx) {
  const { state, c, today } = ctx;
  const j = c.journey;
  const jb = c.blocks.filter((b) => b.journeyId === j.id && b.kind !== 'maintenance');
  const day = c.journeyState === 'active' ? c.journeyDay : c.journeyState === 'upcoming' ? 0 : 30;
  const statusTxt = { upcoming: `Inizia ${D.formatDateLong(j.start)}`, active: `Giorno ${c.journeyDay} di 30`, completed: 'Completato', ended: 'Concluso' }[c.journeyState];
  const next = c.achievements.filter((a) => !a.unlocked).sort((a, b) => b.ratio - a.ratio || a.target - b.target);
  const nextA = next[0];
  const locked = next.slice(1, 4);
  const ended = c.journeyState === 'completed' || c.journeyState === 'ended';
  const firstDone = state.journeys.length > 1 || ended;
  const habits = E.visibleHabits(state, today);
  return `${header(`Percorso ${j.id}`, 'Obiettivi')}
    <section class="journey surface">
      <div class="j-top"><div><div class="j-title">${statusTxt}</div><div class="muted small">${D.formatRange(j.start, E.journeyEnd(j))}</div></div>
        <div class="j-pct"><b>${Math.round((day / 30) * 100)}</b><small>%</small></div></div>
      ${bar('journey', day / 30, 'fill-gold')}
      ${ended ? `<button class="btn btn-primary" style="margin-top:16px" data-action="open-summary" data-journey="${j.id}">Il tuo bilancio</button>` : ''}
      <ol class="phases">${jb.map((b) => phaseRow(ctx, b)).join('')}</ol>
    </section>
    ${ctx.proposals.map((p) => proposalCard(ctx, p)).join('')}
    ${nextA ? `<div class="section-head"><h2>Prossimo traguardo</h2></div>
    <button class="next-ach surface" data-action="open-achievement" data-id="${nextA.id}">${achievementBadge(nextA, 58)}
      <span class="na-text"><b>${esc(nextA.title)}</b><small>${esc(nextA.desc)}</small>${bar(`na-${nextA.id}`, nextA.ratio, 'fill-gold')}<span class="na-num">${nf(nextA.value)} / ${nf(nextA.target)}</span></span></button>` : ''}
    ${locked.length ? `<div class="section-head"><h2>Da sbloccare</h2><button class="link" data-action="goto" data-tab="profile" data-anchor="achievements">Tutti i traguardi</button></div>
    <div class="ach-row">${locked.map((a) => `<button class="ach-mini" data-action="open-achievement" data-id="${a.id}">${achievementBadge(a, 52)}<span>${esc(a.title)}</span></button>`).join('')}</div>` : ''}
    <div class="section-head"><h2>Abitudini</h2></div>
    <div class="list">
      ${habits.map((h) => `<button class="list-item" data-action="open-habit" data-id="${h.id}"><span class="li-icon c-${h.color}">${icon(h.icon)}</span><span class="lbl">${esc(h.name)}<small>${habitRule(h, today)}</small></span>${I.chevR}</button>`).join('')}
      <button class="list-item" data-action="new-habit"><span class="li-icon ${firstDone ? 'c-gold' : 'c-muted'}">${firstDone ? I.plus : I.lock}</span><span class="lbl">Nuova abitudine<small>${firstDone ? 'Aggiungi un\'abitudine con frequenza e obiettivo personali' : 'Si sblocca al termine del primo percorso: una cosa alla volta'}</small></span>${I.chevR}</button>
    </div>`;
}

export function habitRule(h, today) {
  if (h.type === 'bedtime') return `A letto entro le ${h.config.deadline} · ${h.config.freeWeekdays.includes(6) ? 'sabato libero' : 'tutti i giorni'}`;
  if (h.type === 'duration') return `Almeno ${E.goalMinOn(h, today)} minuti al giorno${h.config.perWeek ? ` · ${h.config.perWeek} giorni a settimana` : ''}`;
  return `${h.config.perWeek} giorni a settimana`;
}

// ---------- PROGRESSI ----------
function bedChart(ctx) {
  const { state, today } = ctx;
  const W = 330, H = 168, L = 40, R = 8, T = 12, B = 22;
  const from = D.addDays(today, -29);
  const dates = D.rangeISO(from, today);
  const minOff = -150, maxOff = 120;
  const x = (i) => L + (i / (dates.length - 1)) * (W - L - R);
  const y = (off) => T + ((Math.min(maxOff, Math.max(minOff, off)) - minOff) / (maxOff - minOff)) * (H - T - B);
  const pts = dates.map((d, i) => ({ i, d, bed: state.entries.sleep[d]?.bed })).filter((p) => p.bed);
  if (pts.length < 2) return '<p class="chart-empty">Registra l\'orario in cui vai a letto (facoltativo) per vedere l\'andamento delle ultime 4 settimane.</p>';
  const grid = [-120, -60, 0, 60].map((o) => `<line x1="${L}" x2="${W - R}" y1="${y(o)}" y2="${y(o)}" class="${o === 0 ? 'mid' : 'grid'}"/>
    <text class="chart-label ${o === 0 ? 'mid' : ''}" x="${L - 7}" y="${y(o) + 3.5}" text-anchor="end">${D.offsetToTime(o)}</text>`).join('');
  let path = '';
  pts.forEach((p, k) => { path += `${k ? 'L' : 'M'}${x(p.i).toFixed(1)} ${y(D.bedtimeOffset(p.bed)).toFixed(1)} `; });
  const dots = pts.map((p) => {
    const ok = D.bedtimeOnTime(p.bed);
    const cls = D.isSaturday(p.d) ? 'sat' : ok ? 'ok' : 'late';
    return `<circle class="pt ${cls}" cx="${x(p.i).toFixed(1)}" cy="${y(D.bedtimeOffset(p.bed)).toFixed(1)}" r="3.6"/>`;
  }).join('');
  const xl = [0, 14, 29].map((i) => `<text class="chart-label" x="${x(i)}" y="${H - 5}" text-anchor="${i === 0 ? 'start' : i === 29 ? 'end' : 'middle'}">${i === 29 ? 'oggi' : D.formatDayMonth(dates[i])}</text>`).join('');
  return `<div class="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Orari a letto, ultime 4 settimane">${grid}<path d="${path}" class="line-sleep"/>${dots}${xl}</svg></div>`;
}

function readChart(ctx) {
  const { state, today } = ctx;
  const h = S.habitById(state, 'read');
  const W = 330, H = 150, L = 30, R = 8, T = 12, B = 22;
  const dates = D.rangeISO(D.addDays(today, -27), today);
  const mins = dates.map((d) => state.entries.read[d]?.min || 0);
  if (!mins.some((m) => m > 0)) return '<p class="chart-empty">I minuti di lettura delle ultime 4 settimane appariranno qui.</p>';
  const maxV = Math.max(20, Math.ceil(Math.max(...mins) / 10) * 10);
  const bw = (W - L - R) / dates.length;
  const y = (v) => T + (1 - v / maxV) * (H - T - B);
  const ticks = [0, maxV / 2, maxV].map((v) => `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" class="grid"/><text class="chart-label" x="${L - 7}" y="${y(v) + 3.5}" text-anchor="end">${Math.round(v)}</text>`).join('');
  const goal = E.goalMinOn(h, today);
  const goalLine = `<line x1="${L}" x2="${W - R}" y1="${y(goal)}" y2="${y(goal)}" class="goal-line"/>`;
  const bars = mins.map((m, i) => {
    if (!m) return '';
    const top = y(m);
    const hgt = Math.max(2, H - B - top);
    const ok = m >= E.goalMinOn(h, dates[i]);
    return `<rect class="${ok ? 'b-read' : 'b-partial'}" x="${(L + i * bw + bw * 0.2).toFixed(1)}" y="${top.toFixed(1)}" width="${(bw * 0.6).toFixed(1)}" height="${hgt.toFixed(1)}" rx="2.5"/>`;
  }).join('');
  const xl = [0, 14, 27].map((i) => `<text class="chart-label" x="${L + i * bw + bw / 2}" y="${H - 5}" text-anchor="${i === 0 ? 'start' : i === 27 ? 'end' : 'middle'}">${i === 27 ? 'oggi' : D.formatDayMonth(dates[i])}</text>`).join('');
  return `<div class="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Minuti di lettura, ultime 4 settimane">${ticks}${goalLine}${bars}${xl}</svg></div>`;
}

function weeksChart(ctx) {
  const { c } = ctx;
  const list = c.blocks.filter((b) => b.timing !== 'future' && b.consistency !== null).slice(-8);
  if (!list.length) return '<p class="chart-empty">La costanza di ogni settimana apparirà qui.</p>';
  const W = 330, H = 132, T = 18, B = 22;
  const n = Math.max(list.length, 4);
  const slot = W / n;
  const y = (v) => T + (1 - v) * (H - T - B);
  const bars = list.map((b, i) => {
    const v = b.consistency;
    const x = i * slot + slot * 0.22;
    const w = slot * 0.56;
    return `<rect class="${b.achieved ? 'b-gold' : b.timing === 'current' ? 'b-current' : 'b-week'}" x="${x.toFixed(1)}" y="${y(v).toFixed(1)}" width="${w.toFixed(1)}" height="${Math.max(3, H - B - y(v)).toFixed(1)}" rx="5"/>
      <text class="chart-val" x="${(x + w / 2).toFixed(1)}" y="${(y(v) - 5).toFixed(1)}" text-anchor="middle">${Math.round(v * 100)}%</text>
      <text class="chart-label" x="${(x + w / 2).toFixed(1)}" y="${H - 5}" text-anchor="middle">${shortBlock(b)}</text>`;
  }).join('');
  return `<div class="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Costanza per settimana">${bars}</svg></div>`;
}

function streakTile(label, s, cls, unitOne, unitMany) {
  return `<div class="tile"><div class="k"><span class="${cls}">${I.flame}</span>${label}</div><div class="v">${s.current}<small>${D.plural(s.current, unitOne, unitMany)}</small></div><div class="s">Migliore: ${s.best}</div></div>`;
}

function overview(ctx) {
  const { state, c } = ctx;
  const cons = c.consistency;
  const sleepP = c.perHabit.sleep;
  const readP = c.perHabit.read;
  const weeks = c.blocks.filter((b) => b.timing === 'past' || b.timing === 'current').reverse();
  const unlogged = c.days.filter((d) => Object.values(d.status).includes('unlogged')).length;
  return `<section class="surface consistency">
      <div class="cons-ring"><svg viewBox="0 0 120 120" width="120" height="120">${ring('cons', 120, 11, cons.overall ?? 0, 'grad-mix')}</svg>
        <div class="center"><b>${cons.overall === null ? '—' : Math.round(cons.overall * 100)}<small>${cons.overall === null ? '' : '%'}</small></b><span>costanza</span></div></div>
      <div class="cons-side">
        <div><span>Questa settimana</span><b>${pct(cons.week)}</b></div>
        <div><span>Ultime 4 settimane</span><b>${pct(cons.month)}</b></div>
        <div><span>Giornate complete</span><b>${c.fullDays}</b></div>
      </div>
      <p class="cons-note">La costanza misura quanto rispetti gli obiettivi realistici di ogni settimana, non la perfezione.${unlogged ? ` ${unlogged} ${D.plural(unlogged, 'giorno non registrato conta', 'giorni non registrati contano')} come non fatti.` : ''}</p>
    </section>
    <div class="section-head"><h2>Costanza settimanale</h2></div>
    <section class="surface">${weeksChart(ctx)}</section>
    <div class="section-head"><h2>Serie</h2></div>
    <div class="tiles three">
      ${streakTile('Sonno', c.streaks.sleep, 'c-sleep-t', 'notte', 'notti')}
      ${streakTile('Lettura', c.streaks.read, 'c-read-t', 'giorno', 'giorni')}
      ${streakTile('Complete', c.fullStreak, 'gold-txt', 'giorno', 'giorni')}
    </div>
    <div class="section-head"><h2>Sonno</h2></div>
    <section class="surface">
      <div class="stat-row">
        <div><b class="c-sleep-t">${c.metrics.sleepDone}</b><span>notti in orario</span></div>
        <div><b>${c.sleep.avgBedTime ?? '—'}</b><span>ora media a letto</span></div>
        <div><b>${c.sleep.avgHours === null ? '—' : D.formatHours(c.sleep.avgHours)}</b><span>sonno medio</span></div>
      </div>
      ${bedChart(ctx)}
      <p class="foot">${c.sleep.hoursLogged ? `${c.sleep.nightsAtGoal} notti su ${c.sleep.hoursLogged} con almeno ${D.formatHours(c.sleep.hoursGoal)} di sonno (ultimi 30 giorni).` : 'Le ore di sonno sono facoltative: aggiungile dalla scheda del giorno.'} Orario e ore sono quelli in cui vai a letto, non quando ti addormenti.</p>
    </section>
    <div class="section-head"><h2>Lettura</h2></div>
    <section class="surface">
      <div class="stat-row">
        <div><b class="c-read-t">${nf(c.read.totalMinutes)}</b><span>minuti in tutto</span></div>
        <div><b>${c.read.weekMinutes}</b><span>questa settimana</span></div>
        <div><b>${c.read.avgPerDay}</b><span>media al giorno</span></div>
      </div>
      ${readChart(ctx)}
      <p class="foot">${readP.doneTotal} ${D.plural(readP.doneTotal, 'giornata', 'giornate')} con almeno ${c.read.goal} minuti · record ${c.read.bestDay} min.</p>
    </section>
    <div class="section-head"><h2>Risultati delle settimane</h2></div>
    <div class="list">${weeks.map((b) => `<div class="list-item week-res"><span class="lbl">${blockLabel(b)}${b.timing === 'current' ? ' · in corso' : ''}<small>${D.formatRange(b.from, b.to)} · ${Object.entries(b.habits).map(([hid, hp]) => `${hp.done}/${hp.target} ${unit(S.habitById(state, hid), hp.target)}`).join(' · ')}</small></span>
      ${b.achieved ? `<span class="medal on">${I.check}</span>` : b.timing === 'current' ? '<span class="medal now"></span>' : '<span class="medal">–</span>'}</div>`).join('') || '<div class="list-item"><span class="lbl muted">Nessuna settimana ancora.</span></div>'}</div>
    ${sleepP ? '' : ''}`;
}

function calendar(ctx) {
  const { state, today, ui } = ctx;
  const { y, m } = ui.calMonth;
  const cells = D.monthGrid(y, m);
  const ts = E.trackingStart(state);
  const habits = state.habits.filter((h) => !h.archivedAt || h.archivedAt >= `${y}-${String(m + 1).padStart(2, '0')}-01`).slice(0, 3);
  const firstMonth = ts ? D.parseISO(ts) : D.parseISO(today);
  const canPrev = y > firstMonth.getFullYear() || (y === firstMonth.getFullYear() && m > firstMonth.getMonth());
  const tDate = D.parseISO(today);
  const canNext = y < tDate.getFullYear() || (y === tDate.getFullYear() && m < tDate.getMonth());
  let nights = 0;
  let reads = 0;
  let minutes = 0;
  const html = cells.map((d) => {
    if (!d) return '<span class="cal-cell empty"></span>';
    const inactive = !ts || d < ts || d > today;
    const info = E.dayInfo(state, d, today);
    if (d <= today) {
      if (state.entries.sleep[d]?.ok && E.status(state, S.habitById(state, 'sleep'), d, today) === 'done') nights++;
      if (E.status(state, S.habitById(state, 'read'), d, today) === 'done') reads++;
      minutes += state.entries.read[d]?.min || 0;
    }
    const dots = habits.map((h) => `<i class="dot-${h.color} s-${E.status(state, h, d, today)}"></i>`).join('');
    return `<button class="cal-cell ${d === today ? 'today' : ''} ${info.complete ? 'complete' : ''} ${inactive ? 'off' : ''}" ${inactive && !(d <= today && Object.keys(info.status).some((k) => state.entries[k]?.[d])) ? 'disabled' : `data-action="open-day" data-iso="${d}"`} aria-label="${cap(D.formatDateLong(d))}">
      <span class="n">${D.parseISO(d).getDate()}</span><span class="dots">${dots}</span></button>`;
  }).join('');
  return `<section class="surface cal">
    <div class="cal-head"><button class="icon-btn" data-action="cal-prev" ${canPrev ? '' : 'disabled'} aria-label="Mese precedente">${I.chevL}</button>
      <b>${cap(D.monthLabel(y, m))}</b><button class="icon-btn" data-action="cal-next" ${canNext ? '' : 'disabled'} aria-label="Mese successivo">${I.chevR}</button></div>
    <div class="cal-grid wk">${['L', 'M', 'M', 'G', 'V', 'S', 'D'].map((x) => `<span>${x}</span>`).join('')}</div>
    <div class="cal-grid">${html}</div>
    <div class="cal-legend"><span><i class="dot-sleep s-done"></i>Sonno</span><span><i class="dot-read s-done"></i>Lettura</span><span><i class="s-free-l"></i>Sera libera</span><span><i class="s-unlogged-l"></i>Non fatto o non registrato</span></div>
  </section>
  <div class="tiles three">
    <div class="tile"><div class="k">Notti in orario</div><div class="v c-sleep-t">${nights}</div></div>
    <div class="tile"><div class="k">Letture</div><div class="v c-read-t">${reads}</div></div>
    <div class="tile"><div class="k">Minuti</div><div class="v">${minutes}</div></div>
  </div>
  <p class="foot center">Tocca un giorno per registrarlo o correggerlo.</p>`;
}

function historyList(ctx) {
  const { state, today, ui } = ctx;
  const ts = E.trackingStart(state);
  if (!ts) return '';
  const all = D.rangeISO(ts, today).reverse();
  const list = all.slice(0, ui.historyLimit);
  const sleepH = S.habitById(state, 'sleep');
  const readH = S.habitById(state, 'read');
  const rows = list.map((d) => {
    const info = E.dayInfo(state, d, today);
    const ss = E.status(state, sleepH, d, today);
    const e = state.entries.sleep[d] || {};
    const sTxt = ss === 'free' ? 'Libera' : e.bed ? e.bed : ss === 'done' ? 'In orario' : ss === 'missed' ? 'Tardi' : ss === 'pending' ? 'Da registrare' : '—';
    const rs = E.status(state, readH, d, today);
    const min = state.entries.read[d]?.min || 0;
    return `<button class="hist" data-action="open-day" data-iso="${d}">
      <span class="d"><b>${cap(D.formatDateShort(d))}</b>${info.complete ? `<i class="gold-txt">${I.star}</i>` : ''}</span>
      <span class="v s-${ss}">${I.moon}${sTxt}</span><span class="v r-${rs}">${I.book}${min} min</span></button>`;
  }).join('');
  return `<section class="surface hist-list">${rows}</section>
    ${all.length > list.length ? '<button class="btn btn-ghost" data-action="history-more">Mostra altri giorni</button>' : ''}`;
}

export function viewProgress(ctx) {
  const { ui, c } = ctx;
  const seg = [['overview', 'Panoramica'], ['calendar', 'Calendario'], ['history', 'Storico']];
  const body = ui.progressTab === 'calendar' ? calendar(ctx) : ui.progressTab === 'history' ? historyList(ctx) : overview(ctx);
  return `${header(c.journeyState === 'active' ? `Giorno ${c.journeyDay} di 30` : 'Il tuo storico', 'Progressi')}
    <div class="segmented" role="tablist">${seg.map(([id, l]) => `<button role="tab" aria-selected="${ui.progressTab === id}" class="${ui.progressTab === id ? 'on' : ''}" data-action="progress-tab" data-id="${id}">${l}</button>`).join('')}</div>
    <div class="seg-body">${body}</div>`;
}

// ---------- PROFILO ----------
function sw(on, action, label, extra = '') {
  return `<button class="switch ${on ? 'on' : ''}" role="switch" aria-checked="${on}" aria-label="${esc(label)}" data-action="${action}" ${extra}><i></i></button>`;
}

export function viewProfile(ctx) {
  const { state, c, today } = ctx;
  const lv = c.level;
  const unlocked = c.achievements.filter((a) => a.unlocked).length;
  const lastExport = state.meta.lastExport ? D.toISO(new Date(state.meta.lastExport)) : null;
  const exportOld = !lastExport || D.diffDays(lastExport, today) > 30;
  const j = c.journey;
  return `${header('Mezzanotte', 'Profilo')}
    <section class="surface level-hero">
      <div class="lh-ring"><svg viewBox="0 0 132 132" width="132" height="132">${ring('lv-hero', 132, 9, lv.progress, 'gold')}</svg><div class="center"><span>Livello</span><b>${lv.n}</b></div></div>
      <div class="lh-text"><h2>${esc(lv.title)}</h2><p><b>${nf(c.xp.total)}</b> XP totali</p><p class="muted small">${nf(lv.toNext)} XP al livello ${lv.n + 1}${lv.nextTitle !== lv.title ? ` · ${esc(lv.nextTitle)}` : ''}</p></div>
    </section>
    <div class="xp-split">
      <div><b>${nf(c.xp.habits)}</b><span>Abitudini</span></div>
      <div><b>${nf(c.xp.fullDays)}</b><span>Giornate complete</span></div>
      <div><b>${nf(c.xp.weeks)}</b><span>Obiettivi settimanali</span></div>
    </div>
    <p class="foot">+20 XP per ogni abitudine, +10 per la giornata completa, +50 per ogni obiettivo settimanale. Calcolati dalle registrazioni: modificarle non li duplica.</p>

    <div class="section-head" id="achievements"><h2>Traguardi</h2><span>${unlocked} di ${c.achievements.length}</span></div>
    <div class="ach-grid">${c.achievements.map((a) => `<button class="ach-cell ${a.unlocked ? 'on' : ''}" data-action="open-achievement" data-id="${a.id}">${achievementBadge(a, 60)}<span>${esc(a.title)}</span></button>`).join('')}</div>

    <div class="section-head"><h2>Abitudini</h2></div>
    <div class="list">
      ${E.visibleHabits(state, today).map((h) => `<button class="list-item" data-action="open-habit" data-id="${h.id}"><span class="li-icon c-${h.color}">${icon(h.icon)}</span><span class="lbl">${esc(h.name)}<small>${habitRule(h, today)}</small></span>${I.chevR}</button>`).join('')}
      <button class="list-item" data-action="open-reminders"><span class="li-icon c-sky">${I.bell}</span><span class="lbl">Promemoria<small>Routine serale alle 23:15 e lettura con sveglie e promemoria di iOS</small></span>${I.chevR}</button>
    </div>

    <div class="section-head"><h2>Percorso</h2></div>
    <div class="list">
      <label class="list-item"><span class="lbl">Inizio del percorso ${j.id}</span><input type="date" value="${j.start}" max="${D.addDays(today, 30)}" data-change="journey-start" aria-label="Data di inizio del percorso"></label>
      <button class="list-item" data-action="new-journey"><span class="lbl">Nuovo percorso<small>Chiude quello attuale: lo storico, gli XP e i traguardi restano</small></span>${I.chevR}</button>
    </div>

    <div class="section-head"><h2>Preferenze</h2></div>
    <div class="list">
      <div class="list-item"><span class="li-icon c-muted">${I.sound}</span><span class="lbl">Suoni<small>Brevi toni al completamento</small></span>${sw(state.settings.sound, 'toggle-sound', 'Suoni')}</div>
      <div class="list-item"><span class="li-icon c-muted">${I.haptic}</span><span class="lbl">Feedback aptico<small>${ctx.hapticNote}</small></span>${sw(state.settings.haptics, 'toggle-haptics', 'Feedback aptico')}</div>
      <div class="list-item"><span class="li-icon c-muted">${I.motion}</span><span class="lbl">Riduci animazioni<small>${ctx.systemReduce ? 'Attivo nelle impostazioni di iOS' : 'Altrimenti segue le impostazioni di iOS'}</small></span>${sw(state.settings.motion === 'reduce', 'toggle-motion', 'Riduci animazioni')}</div>
    </div>

    <div class="section-head"><h2>Dati</h2></div>
    <div class="list">
      <button class="list-item" data-action="export"><span class="li-icon c-sleep">${I.share}</span><span class="lbl">Esporta un backup<small>${lastExport ? `Ultimo: ${D.formatDateShort(lastExport)}` : 'Mai esportato'}${exportOld ? ' · consigliato una volta al mese' : ''}</small></span>${I.chevR}</button>
      <button class="list-item" data-action="import"><span class="li-icon c-read">${I.download}</span><span class="lbl">Importa da file<small>Accetta anche i backup delle versioni precedenti</small></span>${I.chevR}</button>
      <button class="list-item" data-action="import-text"><span class="li-icon c-muted">${I.paste}</span><span class="lbl">Incolla un backup</span>${I.chevR}</button>
      <button class="list-item" data-action="copy-backup"><span class="li-icon c-muted">${I.copy}</span><span class="lbl">Copia il backup negli appunti</span>${I.chevR}</button>
    </div>

    <div class="section-head"><h2>App</h2></div>
    <div class="list">
      <button class="list-item" data-action="install-help"><span class="li-icon c-muted">${I.phone}</span><span class="lbl">Schermata Home</span><span class="val">${ctx.standalone ? 'Installata' : 'Come installare'}</span>${I.chevR}</button>
      <div class="list-item"><span class="li-icon c-muted">${I.shield}</span><span class="lbl">Dati e offline<small>Tutto resta su questo iPhone. Nessun account, nessun server.</small></span><span class="val"><span class="status-dot ${ctx.swReady ? '' : 'off'}"></span>${ctx.swReady ? 'Offline pronto' : 'In preparazione'}</span></div>
      <button class="list-item" data-action="whats-new"><span class="li-icon c-muted">${I.info}</span><span class="lbl">Versione</span><span class="val">${ctx.version}</span>${I.chevR}</button>
    </div>
    <div class="list"><button class="list-item danger" data-action="reset"><span class="lbl">Cancella tutti i dati</span></button></div>
    <input type="file" id="import-file" accept="application/json,.json,text/plain" hidden>`;
}

// ---------- Schede (bottom sheet) ----------
function sheetHead(title, sub) {
  return `<div class="grabber"></div><div class="sheet-head"><div><h2>${title}</h2>${sub ? `<p>${sub}</p>` : ''}</div><button class="close-btn" data-action="close-sheet" aria-label="Chiudi">${I.x}</button></div>`;
}

function stepper(action, attrs, value, unitTxt, label) {
  return `<div class="stepper" aria-label="${esc(label)}">
    <button class="round-btn" data-action="${action}" ${attrs} data-val="-1" aria-label="Diminuisci">${I.minus}</button>
    <div class="st-val"><b>${value}</b><small>${unitTxt}</small></div>
    <button class="round-btn" data-action="${action}" ${attrs} data-val="1" aria-label="Aumenta">${I.plus}</button></div>`;
}

function sleepEditor(ctx, h, iso) {
  const { state, today } = ctx;
  const e = state.entries.sleep[iso] || {};
  const st = E.status(state, h, iso, today);
  const free = st === 'free';
  return `<section class="ed c-sleep" data-editor="sleep">
    <div class="ed-title"><span class="h-icon">${I.moon}</span><b>Sonno</b><span class="muted small">${free ? 'sera libera' : 'la notte di questo giorno'}</span></div>
    ${free ? '<p class="note-free">Il sabato sera è libero: non conta e non interrompe la serie. Puoi comunque annotare orario e ore.</p>' : ''}
    <div class="seg2" role="group" aria-label="A letto entro mezzanotte?">
      <button class="${e.ok === true ? 'on' : ''}" data-action="sleep-set" data-iso="${iso}" data-val="1" aria-pressed="${e.ok === true}">Entro mezzanotte</button>
      <button class="${e.ok === false ? 'on late' : ''}" data-action="sleep-set" data-iso="${iso}" data-val="0" aria-pressed="${e.ok === false}">Dopo mezzanotte</button>
    </div>
    <div class="field"><label for="bed-${iso}">Orario a letto <small>facoltativo · quando vai a letto, non quando ti addormenti</small></label>
      <div class="field-r">${e.bed ? `<button class="link" data-action="clear-bed" data-iso="${iso}">Rimuovi</button>` : ''}<input class="time-input" id="bed-${iso}" type="time" value="${e.bed || ''}" data-change="bed" data-iso="${iso}"></div></div>
    <div class="field"><label>Ore di sonno <small>facoltative · obiettivo ${D.formatHours(h.config.hoursGoal)}</small></label>
      <div class="field-r">${e.hours ? `<button class="link" data-action="hours-clear" data-iso="${iso}">Rimuovi</button>` : ''}
        <div class="mini-step"><button data-action="hours-step" data-iso="${iso}" data-val="-0.5" aria-label="Meno mezz'ora">${I.minus}</button><b>${e.hours ? D.formatHours(e.hours) : '—'}</b><button data-action="hours-step" data-iso="${iso}" data-val="0.5" aria-label="Più mezz'ora">${I.plus}</button></div></div></div>
  </section>`;
}

function durationEditor(ctx, h, iso) {
  const { state, today } = ctx;
  const min = state.entries[h.id]?.[iso]?.min || 0;
  const goal = E.goalMinOn(h, iso);
  return `<section class="ed c-${h.color}" data-editor="${h.id}">
    <div class="ed-title"><span class="h-icon">${icon(h.icon)}</span><b>${esc(h.name)}</b><span class="muted small">obiettivo ${goal} min</span></div>
    <div class="stepper">
      <button class="round-btn" data-action="min-step" data-habit="${h.id}" data-iso="${iso}" data-val="-5" aria-label="Togli 5 minuti">${I.minus}</button>
      <div class="st-val"><b class="${min >= goal ? 'ok' : ''}">${min}</b><small>${min >= goal ? 'minuti · obiettivo raggiunto' : 'minuti'}</small></div>
      <button class="round-btn" data-action="min-step" data-habit="${h.id}" data-iso="${iso}" data-val="5" aria-label="Aggiungi 5 minuti">${I.plus}</button>
    </div>
    <div class="quick">${[5, 10, 15, 30].map((m) => `<button data-action="min-add" data-habit="${h.id}" data-iso="${iso}" data-val="${m}">+${m}</button>`).join('')}</div>
    <div class="field"><label for="min-${h.id}-${iso}">Minuti esatti</label><input class="num-input" id="min-${h.id}-${iso}" type="number" inputmode="numeric" min="0" max="1440" value="${min || ''}" placeholder="0" data-change="min" data-habit="${h.id}" data-iso="${iso}"></div>
    ${h.id === 'read' ? `<div class="field"><label for="book">Libro <small>facoltativo</small></label><input class="text-input" id="book" type="text" maxlength="120" placeholder="Titolo" value="${esc(h.config.book)}" data-change="book" enterkeyhint="done"></div>` : ''}
    ${iso === today && h.id === 'read' ? `<button class="btn btn-read" data-action="open-timer">${I.play}Avvia il timer di lettura</button>` : ''}
  </section>`;
}

function checkEditor(ctx, h, iso) {
  const e = ctx.state.entries[h.id]?.[iso];
  return `<section class="ed c-${h.color}" data-editor="${h.id}">
    <div class="ed-title"><span class="h-icon">${icon(h.icon)}</span><b>${esc(h.name)}</b></div>
    <div class="seg2"><button class="${e?.done === true ? 'on' : ''}" data-action="check-set" data-habit="${h.id}" data-iso="${iso}" data-val="1">Fatto</button><button class="${e?.done === false ? 'on late' : ''}" data-action="check-set" data-habit="${h.id}" data-iso="${iso}" data-val="0">Non fatto</button></div>
  </section>`;
}

export function sheetDay(ctx, iso, focus) {
  const { state, today, c } = ctx;
  const j = state.journeys.find((x) => iso >= x.start && iso <= E.journeyEnd(x));
  const num = j ? D.diffDays(j.start, iso) + 1 : null;
  const habits = E.activeHabits(state, iso);
  const ordered = focus ? [...habits.filter((h) => h.id === focus), ...habits.filter((h) => h.id !== focus)] : habits;
  const xp = E.xpForDay(state, iso, today);
  const info = E.dayInfo(state, iso, today);
  const sub = `${cap(D.formatDateLong(iso))}${iso === today ? ' · oggi' : ''}${num ? ` · giorno ${num}` : ''}`;
  return `${sheetHead(iso === today ? 'Oggi' : iso === D.addDays(today, -1) ? 'Ieri' : cap(D.formatDateShort(iso)), sub)}
    <div class="day-xp ${info.complete ? 'complete' : ''}"><span>${info.complete ? `${I.check}Giornata completa` : `${info.done} di ${info.total} abitudini`}</span><b>+${xp} XP</b></div>
    ${ordered.map((h) => (h.type === 'bedtime' ? sleepEditor(ctx, h, iso) : h.type === 'duration' ? durationEditor(ctx, h, iso) : checkEditor(ctx, h, iso))).join('')}
    <button class="btn btn-primary" data-action="close-sheet">Fatto</button>
    ${c ? '' : ''}`;
}

export function sheetTimer(ctx) {
  const { state, timer, today } = ctx;
  const h = S.habitById(state, 'read');
  const goal = E.goalMinOn(h, today);
  const iso = timer?.iso || today;
  const already = state.entries.read[iso]?.min || 0;
  const running = timer && timer.since;
  const size = 236;
  const r = (size - 14) / 2;
  const circ = 2 * Math.PI * r;
  return `${sheetHead('Lettura', h.config.book ? esc(h.config.book) : `Obiettivo: ${goal} minuti`)}
    <div class="timer">
      <div class="t-ring" style="--circ:${circ.toFixed(2)}"><svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
        <circle class="ring-track" cx="${size / 2}" cy="${size / 2}" r="${r}" stroke-width="10"/>
        <circle class="ring-bar fill-read-s" data-timer-ring data-goal="${goal * 60000}" data-already="${already * 60000}" cx="${size / 2}" cy="${size / 2}" r="${r}" stroke-width="10" stroke-dasharray="${circ.toFixed(2)}" style="stroke-dashoffset:${circ.toFixed(2)}" stroke-linecap="round" transform="rotate(-90 ${size / 2} ${size / 2})"/></svg>
        <div class="center"><b data-timer>00:00</b><span data-timer-label>${timer ? (running ? 'in lettura' : 'in pausa') : 'pronto'}</span></div></div>
      ${already ? `<p class="muted small center">Già registrati oggi: ${already} min</p>` : ''}
      ${timer
        ? `<button class="btn ${running ? 'btn-ghost' : 'btn-read'}" data-action="${running ? 'timer-pause' : 'timer-resume'}">${running ? `${I.pause}Pausa` : `${I.play}Riprendi`}</button>
           <button class="btn btn-read" data-action="timer-finish">${I.check}Termina e salva</button>
           <button class="link center-link" data-action="timer-discard">Annulla la sessione</button>`
        : `<button class="btn btn-read" data-action="timer-start">${I.play}Inizia a leggere</button>
           <button class="btn btn-ghost" data-action="quick-read">${I.check}Ho già letto ${goal} minuti</button>`}
    </div>
    <div class="field"><label for="book">Libro <small>facoltativo</small></label><input class="text-input" id="book" type="text" maxlength="120" placeholder="Titolo" value="${esc(h.config.book)}" data-change="book" enterkeyhint="done"></div>`;
}

export function sheetAchievement(ctx, id) {
  const a = ctx.c.achievements.find((x) => x.id === id);
  if (!a) return '';
  return `${sheetHead('Traguardo', '')}
    <div class="ach-detail ${a.unlocked ? 'on' : ''}">${achievementBadge(a, 104)}
      <h3>${esc(a.title)}</h3><p>${esc(a.desc)}</p>
      ${a.unlocked ? '<span class="pill gold">Sbloccato</span>' : `<div class="ach-prog">${bar(`ad-${a.id}`, a.ratio, 'fill-gold')}<span>${nf(a.value)} / ${nf(a.target)}</span></div>`}
    </div>`;
}

export function sheetHabit(ctx, id) {
  const { state, today } = ctx;
  const h = S.habitById(state, id);
  if (!h) return '';
  if (h.type === 'bedtime') {
    return `${sheetHead('Sonno', 'A letto entro mezzanotte')}
      <div class="list">
        <div class="list-item"><span class="lbl">Obiettivo</span><span class="val">a letto entro le ${h.config.deadline}</span></div>
        <div class="list-item"><span class="lbl">Sera libera</span><span class="val">Sabato</span></div>
        <label class="list-item"><span class="lbl">Sveglia indicativa</span><input type="time" value="${h.config.wake}" data-change="wake" aria-label="Sveglia indicativa"></label>
        <div class="list-item"><span class="lbl">Ore di sonno<small>Obiettivo effettivo, verso 8 ore un passo alla volta</small></span>
          <div class="mini-step"><button data-action="hours-goal" data-val="-0.5" aria-label="Meno">${I.minus}</button><b>${D.formatHours(h.config.hoursGoal)}</b><button data-action="hours-goal" data-val="0.5" aria-label="Più">${I.plus}</button></div></div>
        <div class="list-item"><span class="lbl">Routine serale<small>23:15 niente nuovi lavori · 23:30 chiudi i progetti · 23:45 preparati</small></span>${sw(h.config.routine, 'toggle-routine', 'Routine serale')}</div>
      </div>
      <p class="foot">La routine è una guida, non un obbligo: compare la sera nella scheda del sonno e non assegna né toglie XP.</p>
      <div class="section-head"><h2>Obiettivi settimanali</h2></div>
      <p class="foot left">Settimana 1: 4 notti su 6 · settimana 2: 5 · settimana 3: 5 · settimana 4: 6 su 6. Si modificano solo con il tuo consenso.</p>`;
  }
  if (h.type === 'duration') {
    const goal = E.goalMinOn(h, today);
    const total = Object.values(state.entries[h.id] || {}).reduce((a, x) => a + x.min, 0);
    return `${sheetHead(esc(h.name), `${nf(total)} minuti in tutto`)}
      <div class="list">
        <div class="list-item"><span class="lbl">Minimo giornaliero<small>Cambia solo da oggi in avanti: i giorni passati restano invariati</small></span>
          <div class="mini-step"><button data-action="goal-step" data-id="${h.id}" data-val="-5" aria-label="Meno">${I.minus}</button><b>${goal} min</b><button data-action="goal-step" data-id="${h.id}" data-val="5" aria-label="Più">${I.plus}</button></div></div>
        ${h.id === 'read' ? `<label class="list-item"><span class="lbl">Libro</span><input type="text" maxlength="120" placeholder="Titolo" value="${esc(h.config.book)}" data-change="book" enterkeyhint="done"></label>` : ''}
      </div>
      <p class="foot">${h.id === 'read' ? 'L\'obiettivo non aumenta mai da solo: quando la lettura sarà consolidata, Mezzanotte ti proporrà un passo in più e deciderai tu.' : ''}</p>
      ${h.id !== 'read' ? `<div class="list"><button class="list-item danger" data-action="archive-habit" data-id="${h.id}"><span class="lbl">Archivia l'abitudine<small>Lo storico resta</small></span></button></div>` : ''}`;
  }
  return `${sheetHead(esc(h.name), habitRule(h, today))}
    <div class="list"><button class="list-item danger" data-action="archive-habit" data-id="${h.id}"><span class="lbl">Archivia l'abitudine<small>Lo storico resta</small></span></button></div>`;
}

export function sheetNewHabit(ctx) {
  const d = ctx.ui.draft;
  const icons = S.HABIT_ICONS.filter((x) => x !== 'moon' && x !== 'book');
  const colors = ['gold', 'sky', 'rose', 'read', 'sleep'];
  return `${sheetHead('Nuova abitudine', 'Una alla volta: meglio poche abitudini che reggono')}
    <div class="field"><label for="nh-name">Nome</label><input class="text-input" id="nh-name" type="text" maxlength="40" placeholder="Es. Allenamento" value="${esc(d.name)}" data-change="draft-name"></div>
    <div class="field"><label>Tipo</label><div class="seg2"><button class="${d.type === 'check' ? 'on' : ''}" data-action="draft" data-k="type" data-v="check">Fatto / non fatto</button><button class="${d.type === 'duration' ? 'on' : ''}" data-action="draft" data-k="type" data-v="duration">Minuti</button></div></div>
    ${d.type === 'duration' ? `<div class="field"><label>Minuti al giorno</label><div class="mini-step"><button data-action="draft-step" data-k="min" data-val="-5">${I.minus}</button><b>${d.min} min</b><button data-action="draft-step" data-k="min" data-val="5">${I.plus}</button></div></div>` : ''}
    <div class="field"><label>Giorni a settimana</label><div class="mini-step"><button data-action="draft-step" data-k="perWeek" data-val="-1">${I.minus}</button><b>${d.perWeek} su 7</b><button data-action="draft-step" data-k="perWeek" data-val="1">${I.plus}</button></div></div>
    <div class="field col"><label>Icona</label><div class="pick">${icons.map((i) => `<button class="pick-i ${d.icon === i ? 'on' : ''}" data-action="draft" data-k="icon" data-v="${i}" aria-label="${i}">${icon(i)}</button>`).join('')}</div></div>
    <div class="field col"><label>Colore</label><div class="pick">${colors.map((col) => `<button class="pick-c sw-${col} ${d.color === col ? 'on' : ''}" data-action="draft" data-k="color" data-v="${col}" aria-label="${col}"></button>`).join('')}</div></div>
    <button class="btn btn-primary" data-action="create-habit">Aggiungi</button>`;
}

export function sheetReminders(ctx) {
  const r = ctx.state.settings.reminders;
  const sleep = S.habitById(ctx.state, 'sleep');
  return `${sheetHead('Promemoria', 'Gratuiti, affidabili, nativi di iOS')}
    <p class="note">Su iPhone una web app non può programmare notifiche locali senza un server esterno: Mezzanotte quindi non finge di farlo. Le app di iOS lo fanno meglio, gratis e anche a telefono bloccato. Bastano due minuti.</p>
    <div class="guide">
      <div class="g-step"><span class="g-n">1</span><div><b>Routine serale con l'app Salute</b><p>Salute → Sfoglia → Sonno → Programma completo → orario di andare a letto <b>00:00</b>, sveglia <b>${sleep.config.wake}</b>. Imposta <b>Rilassamento: 45 minuti</b>: alle 23:15 iPhone attiva la modalità Riposo e ti ricorda di chiudere la giornata.</p></div></div>
      <div class="g-step"><span class="g-n">2</span><div><b>In alternativa, una sveglia</b><p>Orologio → Sveglie → + → <b>23:15</b> → Ripeti: tutti i giorni tranne sabato → Etichetta: <i>«Niente nuovi lavori»</i>.</p></div></div>
      <div class="g-step"><span class="g-n">3</span><div><b>Promemoria per la lettura</b><p>Promemoria → Nuovo → <i>«Leggi 5 minuti»</i> → Data e ora → <b>${r.reading}</b> → Ripeti: ogni giorno.</p>
        <label class="inline-time">Orario che preferisci <input type="time" value="${r.reading}" data-change="reading-reminder"></label></div></div>
    </div>
    <p class="foot left">Suggerimento: metti l'icona di Mezzanotte nel Dock o accanto alla sveglia, così aprirla la sera richiede un solo gesto.</p>`;
}

export function sheetCatchup(ctx) {
  const { state, today, ui } = ctx;
  const days = ui.away?.days || [];
  const sleepH = S.habitById(state, 'sleep');
  const readH = S.habitById(state, 'read');
  const rows = days.map((d) => {
    const ss = E.status(state, sleepH, d, today);
    const e = state.entries.sleep[d] || {};
    const rmin = state.entries.read[d]?.min || 0;
    const goal = E.goalMinOn(readH, d);
    return `<div class="cu-row"><b>${cap(D.formatDateShort(d))}</b>
      <div class="cu-acts">${ss === 'free' ? '<span class="free-pill">Libera</span>' : `<button class="mini ${e.ok === true ? 'on' : ''}" data-action="sleep-set" data-iso="${d}" data-val="1">${I.moon}In orario</button><button class="mini ${e.ok === false ? 'on late' : ''}" data-action="sleep-set" data-iso="${d}" data-val="0">Tardi</button>`}
      <button class="mini read ${rmin >= goal ? 'on' : ''}" data-action="catchup-read" data-iso="${d}">${I.book}${rmin >= goal ? `${rmin} min` : 'Letto'}</button></div></div>`;
  }).join('');
  return `${sheetHead('Recupera', 'Registra solo quello che ricordi con certezza')}
    <div class="catchup">${rows || '<p class="muted">Nessun giorno da recuperare.</p>'}</div>
    <button class="btn btn-primary" data-action="catchup-done">Fatto</button>`;
}

export function sheetSummary(ctx, sum) {
  const pctTxt = sum.consistency === null ? '—' : `${Math.round(sum.consistency * 100)}%`;
  const name = { sleep: 'A letto entro mezzanotte', read: 'Lettura quotidiana' };
  return `${sheetHead(`Bilancio del percorso ${sum.journey.id}`, `${D.formatRange(sum.from, sum.to)} · ${sum.days} giorni`)}
    <div class="sum-hero"><div class="sum-ring"><svg viewBox="0 0 132 132" width="132" height="132">${ring('sum', 132, 10, sum.consistency || 0, 'grad-mix')}</svg><div class="center"><b>${pctTxt}</b><span>costanza</span></div></div></div>
    <div class="tiles">
      <div class="tile"><div class="k">Notti in orario</div><div class="v c-sleep-t">${sum.nights}<small>/ ${sum.nightsEligible}</small></div></div>
      <div class="tile"><div class="k">Minuti di lettura</div><div class="v c-read-t">${nf(sum.minutes)}</div></div>
      <div class="tile"><div class="k">Giorni di lettura</div><div class="v">${sum.readDays}<small>/ ${sum.days}</small></div></div>
      <div class="tile"><div class="k">Settimane riuscite</div><div class="v gold-txt">${sum.weeksAchieved}<small>/ ${sum.weeks.length}</small></div></div>
    </div>
    <div class="section-head"><h2>Abitudini costruite</h2></div>
    <div class="list">${['sleep', 'read'].map((id) => `<div class="list-item"><span class="li-icon ${sum.built.includes(id) ? 'c-gold' : 'c-muted'}">${sum.built.includes(id) ? I.check : I.clock}</span><span class="lbl">${name[id]}<small>${sum.built.includes(id) ? 'Costruita: rispettata in almeno 3 giorni su 4' : 'In costruzione: serve ancora un po\' di costanza'}</small></span></div>`).join('')}</div>
    ${sum.improvements.length ? `<div class="section-head"><h2>Dalla prima all'ultima settimana</h2></div>
    <div class="list">${sum.improvements.map((x) => `<div class="list-item"><span class="lbl">${x.label}</span><span class="val">${x.from}${x.unit} → <b>${x.to}${x.unit}</b></span></div>`).join('')}</div>` : ''}
    <div class="section-head"><h2>Prossimo percorso</h2></div>
    <section class="surface next-j"><b>${sum.next.title}</b><p>${sum.next.text}</p>
      <button class="btn btn-primary" data-action="start-next" data-plan="${sum.next.id}">Inizia da oggi</button></section>
    <p class="foot">Lo storico non viene mai cancellato: XP, livello e traguardi restano.</p>`;
}

export function sheetInstall(ctx) {
  return `${sheetHead(ctx.standalone ? 'App installata' : 'Installa su iPhone', '')}
    ${ctx.standalone ? '<p class="note">Stai già usando Mezzanotte dalla schermata Home, a schermo intero e anche offline.</p>' : `<div class="guide">
      <div class="g-step"><span class="g-n">1</span><div><b>Apri questa pagina in Safari</b></div></div>
      <div class="g-step"><span class="g-n">2</span><div><b>Tocca Condividi</b><p>Il quadrato con la freccia in basso.</p></div></div>
      <div class="g-step"><span class="g-n">3</span><div><b>Aggiungi alla schermata Home</b><p>Mezzanotte si aprirà a schermo intero e funzionerà anche senza connessione.</p></div></div></div>`}`;
}

export function sheetWhatsNew(ctx) {
  return `${sheetHead(`Mezzanotte ${ctx.version}`, 'Sistema di crescita personale')}
    <div class="guide">
      <div class="g-step"><span class="g-n">${I.today}</span><div><b>Oggi in 30 secondi</b><p>Sonno e lettura si completano con un tocco. La sera compare la routine.</p></div></div>
      <div class="g-step"><span class="g-n">${I.target}</span><div><b>Percorso in 4 fasi</b><p>Inizio, Costanza, Consolidamento, Disciplina e un bilancio finale.</p></div></div>
      <div class="g-step"><span class="g-n">${I.star}</span><div><b>XP, livelli e traguardi</b><p>Calcolati solo dal comportamento reale. Saltare un giorno non toglie nulla.</p></div></div>
      <div class="g-step"><span class="g-n">${I.shield}</span><div><b>I tuoi dati</b><p>Migrati in sicurezza, sempre sul dispositivo, con una copia compatibile con la versione precedente.</p></div></div>
    </div>`;
}

// ---------- Celebrazioni ----------
export function overlayLevel(c, lv) {
  return `<div class="ov-inner">
    <div class="ov-ring"><svg viewBox="0 0 168 168" width="168" height="168"><circle class="ring-track" cx="84" cy="84" r="76" stroke-width="8"/><circle class="ring-bar gold draw" cx="84" cy="84" r="76" stroke-width="8" stroke-linecap="round" transform="rotate(-90 84 84)" style="--c:${(2 * Math.PI * 76).toFixed(1)}"/></svg><div class="center"><span>Livello</span><b>${lv}</b></div></div>
    <h2>${esc(E.levelTitle(lv))}</h2>
    <p>Hai raggiunto ${nf(c.xp.total)} XP con abitudini reali, un giorno alla volta.</p>
    ${lv < 10 ? `<p class="muted small">Prossimo: livello ${lv + 1} · ${esc(E.levelTitle(lv + 1))}</p>` : ''}
    <button class="btn btn-gold" data-action="ov-close">Continua</button></div>`;
}

export function overlayPhase(state, b) {
  const p = E.PHASES[b.phase - 1];
  const rows = Object.entries(b.habits).map(([hid, hp]) => {
    const h = S.habitById(state, hid);
    return `<span class="pg ok"><i class="dot-${h.color}"></i>${hp.done}/${hp.target} ${unit(h, hp.target)}</span>`;
  }).join('');
  const nextP = b.phase < 5 ? E.PHASES[b.phase] : null;
  return `<div class="ov-inner">
    <div class="ov-phase"><span>${b.phase <= 4 ? b.phase : I.mountain}</span></div>
    <div class="eyebrow gold-txt">${b.phase <= 4 ? `Fase ${b.phase} completata` : 'Percorso completato'}</div>
    <h2>${p.name}</h2>
    <div class="ph-goals center">${rows}</div>
    <p>+${Object.keys(b.habits).length * E.XP.weekGoal} XP per gli obiettivi raggiunti.</p>
    ${nextP ? `<p class="muted small">Prossima fase: ${nextP.name}</p>` : ''}
    <button class="btn btn-gold" data-action="ov-close">Continua</button></div>`;
}

export function overlayWelcome(ctx) {
  const { state, c } = ctx;
  const migrated = state.migrations.some((m) => m.from === 1);
  const days = S.countEntries(state);
  const j = c.journey;
  const unlocked = c.achievements.filter((a) => a.unlocked).length;
  return `<div class="ov-inner welcome">
    <img class="ob-logo" src="icons/icon-180.png" alt="">
    <div class="eyebrow">Novità</div>
    <h2>Mezzanotte 3.0</h2>
    ${migrated ? `<div class="safe"><span>${I.shield}</span><p><b>I tuoi dati sono al sicuro.</b> ${days} ${D.plural(days, 'giorno registrato', 'giorni registrati')}, percorso iniziato ${j ? D.formatDateLong(j.start) : '—'}.</p></div>` : ''}
    <div class="wel-stats"><div><b>${nf(c.xp.total)}</b><span>XP già guadagnati</span></div><div><b>${c.level.n}</b><span>${esc(c.level.title)}</span></div><div><b>${unlocked}</b><span>${D.plural(unlocked, 'traguardo', 'traguardi')}</span></div></div>
    <ul class="wel-list"><li>${I.today}<span>Sonno e lettura con un solo tocco</span></li><li>${I.target}<span>Percorso in 4 fasi con obiettivi realistici</span></li><li>${I.heart}<span>Un giorno saltato non toglie mai nulla</span></li></ul>
    <button class="btn btn-primary" data-action="ov-close">Continua</button></div>`;
}

export function achievementToast(a) {
  return `<span class="at-badge">${icon(a.icon)}</span><span class="at-text"><small>Traguardo sbloccato</small><b>${esc(a.title)}</b></span>`;
}

// ---------- Primo avvio ----------
export function onboarding(ctx) {
  const hint = ctx.ios && !ctx.standalone
    ? `<p class="install-hint">Per installarla: in Safari tocca ${I.share} <b>Condividi</b>, poi <b>Aggiungi alla schermata Home</b>.</p>`
    : '';
  return `<div class="onboarding" id="onboarding"><div class="inner">
    <img class="ob-logo" src="icons/icon-180.png" alt="">
    <h1 class="ob-title">MEZZANOTTE</h1>
    <p class="ob-sub">Un sistema per costruire disciplina, una sera alla volta.</p>
    <div class="ob-rules">
      <div class="ob-rule c-sleep"><span class="h-icon">${I.moon}</span><div><b>A letto entro mezzanotte</b><span>Il sabato sera è libero. Conta quando vai a letto, non quando ti addormenti.</span></div></div>
      <div class="ob-rule c-read"><span class="h-icon">${I.book}</span><div><b>Almeno 5 minuti di lettura</b><span>Un tocco, oppure il timer. L'obiettivo non sale mai senza il tuo consenso.</span></div></div>
      <div class="ob-rule c-gold"><span class="h-icon">${I.target}</span><div><b>30 giorni, 4 fasi</b><span>Obiettivi realistici che crescono: 4 → 5 → 5 → 6 notti, 4 → 5 → 6 → 6 letture.</span></div></div>
    </div>
    <div class="ob-date"><label for="ob-start">Primo giorno</label><input id="ob-start" type="date" value="${ctx.today}"></div>
    <button class="btn btn-primary" data-action="start">Inizia il percorso</button>
    <button class="btn btn-ghost" data-action="import">Ripristina un backup</button>
    ${hint}
    <input type="file" id="import-file" accept="application/json,.json,text/plain" hidden>
  </div></div>`;
}
