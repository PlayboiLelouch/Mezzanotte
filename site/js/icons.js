// MEZZANOTTE — iconografia coerente (griglia 24, tratto 1.8, terminali arrotondati).
const s = (body, extra = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"${extra}>${body}</svg>`;
const f = (body) => `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${body}</svg>`;

export const I = {
  // abitudini
  moon: s('<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z"/>'),
  book: s('<path d="M12 6.8C10.4 5.4 8 4.8 4.5 5v12.5c3.5-.2 5.9.4 7.5 1.8 1.6-1.4 4-2 7.5-1.8V5c-3.5-.2-5.9.4-7.5 1.8Z"/><path d="M12 6.8v12.5"/>'),
  run: s('<circle cx="14.5" cy="4.8" r="1.8"/><path d="m8.5 20 2.5-5 3 2.5V22"/><path d="M6 11.5 9 8.5l4 .5 2.5 3.5 3 1"/><path d="m11 15 2-6"/>'),
  leaf: s('<path d="M5 19c0-8 5-13 14-14-1 9-6 14-14 14Z"/><path d="M5 19 13 11"/>'),
  pen: s('<path d="M4 20h4L19 9l-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/>'),
  drop: s('<path d="M12 3.5s6 6.4 6 10.5a6 6 0 0 1-12 0c0-4.1 6-10.5 6-10.5Z"/>'),
  bolt: s('<path d="M13 3 5 13.5h6L10 21l8-10.5h-6L13 3Z"/>'),
  spark: s('<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>'),
  // navigazione
  today: s('<circle cx="12" cy="12" r="8.5"/><path d="m8.5 12.2 2.4 2.4 4.6-4.8"/>'),
  target: s('<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.8"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/>'),
  chart: s('<path d="M5 20V13M10 20V8M15 20v-6M20 20V4"/>'),
  person: s('<circle cx="12" cy="8.5" r="3.8"/><path d="M4.5 20c1.3-3.7 4.1-5.5 7.5-5.5s6.2 1.8 7.5 5.5"/>'),
  // azioni
  check: s('<path d="m5 12.5 4.5 4.5L19 7.5"/>', ' stroke-width="2.6"'),
  x: s('<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>', ' stroke-width="2.2"'),
  plus: s('<path d="M12 5v14M5 12h14"/>', ' stroke-width="2.2"'),
  minus: s('<path d="M5 12h14"/>', ' stroke-width="2.2"'),
  chevR: s('<path d="m9.5 5.5 6.5 6.5-6.5 6.5"/>', ' stroke-width="2.2"'),
  chevL: s('<path d="M14.5 5.5 8 12l6.5 6.5"/>', ' stroke-width="2.2"'),
  play: f('<path d="M8 5.6v12.8c0 .8.9 1.3 1.6.9l10-6.4a1 1 0 0 0 0-1.8l-10-6.4C8.9 4.3 8 4.8 8 5.6Z"/>'),
  pause: f('<rect x="6.5" y="5" width="4" height="14" rx="1.4"/><rect x="13.5" y="5" width="4" height="14" rx="1.4"/>'),
  stop: f('<rect x="6" y="6" width="12" height="12" rx="2.5"/>'),
  share: s('<path d="M12 3.5v11M8 7.5l4-4 4 4"/><path d="M7 11H6a1.5 1.5 0 0 0-1.5 1.5v6A1.5 1.5 0 0 0 6 20h12a1.5 1.5 0 0 0 1.5-1.5v-6A1.5 1.5 0 0 0 18 11h-1"/>'),
  download: s('<path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 20h14"/>'),
  paste: s('<rect x="6" y="4.5" width="12" height="16" rx="2.5"/><path d="M9.5 4.5V3.5h5v1M9 10h6M9 14h4"/>'),
  copy: s('<rect x="8.5" y="8.5" width="11" height="11" rx="2.5"/><path d="M15.5 8.5V6A1.5 1.5 0 0 0 14 4.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5"/>'),
  edit: s('<path d="M4 20h4L19 9l-4-4L4 16v4Z"/>'),
  // stato
  flame: s('<path d="M12 3c.5 3.5-2.5 5-3.8 7.4A6 6 0 1 0 18 13c0-2.4-1.2-4.3-2.6-5.6-.3 1.7-1.2 2.8-2.4 3.3.5-3.2-.1-5.6-1-7.7Z"/>'),
  star: s('<path d="m12 3.5 2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8-4.3-4.1 5.9-.8L12 3.5Z"/>'),
  trophy: s('<path d="M8 4h8v5a4 4 0 0 1-8 0V4Z"/><path d="M8 6H5v1.5A3.5 3.5 0 0 0 8.5 11M16 6h3v1.5a3.5 3.5 0 0 1-3.5 3.5M12 13v4M8.5 20h7M9.5 20l.5-3h4l.5 3"/>'),
  flag: s('<path d="M5 21V4M5 4.5h11l-2 4 2 4H5"/>'),
  heart: s('<path d="M12 19.5s-7.5-4.4-7.5-10A4.2 4.2 0 0 1 12 7a4.2 4.2 0 0 1 7.5 2.5c0 5.6-7.5 10-7.5 10Z"/>'),
  clock: s('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>'),
  trend: s('<path d="M4 16.5 9.5 11l3.5 3.5L20 7.5"/><path d="M15 7.5h5v5"/>'),
  lock: s('<rect x="5.5" y="10.5" width="13" height="9.5" rx="2.5"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>'),
  info: s('<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8h.01"/>'),
  bell: s('<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 1.5h-15L6 16.5Z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>'),
  alarm: s('<circle cx="12" cy="13" r="7"/><path d="M12 9.5V13l2.5 1.5M4.5 5.5l3-2.5M19.5 5.5l-3-2.5"/>'),
  sound: s('<path d="M4.5 9.5v5h3.5l4.5 4v-13l-4.5 4H4.5Z"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11"/>'),
  haptic: s('<rect x="8" y="4" width="8" height="16" rx="2.5"/><path d="M4.5 9v6M19.5 9v6M2.5 10.5v3M21.5 10.5v3"/>'),
  motion: s('<circle cx="12" cy="12" r="3"/><path d="M12 3.5v2M12 18.5v2M3.5 12h2M18.5 12h2M6 6l1.4 1.4M16.6 16.6 18 18M6 18l1.4-1.4M16.6 7.4 18 6"/>'),
  shield: s('<path d="M12 3.5 5 6v5.5c0 4.4 3 7.8 7 9 4-1.2 7-4.6 7-9V6l-7-2.5Z"/><path d="m9 12 2.2 2.2L15.5 10"/>'),
  phone: s('<rect x="7" y="3" width="10" height="18" rx="2.5"/><path d="M11 18h2"/>'),
  calendar: s('<rect x="4" y="5.5" width="16" height="14.5" rx="3"/><path d="M4 10h16M8.5 3.5v3.5M15.5 3.5v3.5"/>'),
  // traguardi
  sun: s('<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"/>'),
  sunrise: s('<path d="M4 18h16M7 18a5 5 0 0 1 10 0M12 4v3M5 9.5l1.6 1.2M19 9.5l-1.6 1.2M2.5 14h2M19.5 14h2"/>'),
  moonStars: s('<path d="M17.5 14.5A7 7 0 0 1 9 5a7 7 0 1 0 8.5 9.5Z"/><path d="M17 3.5v3M15.5 5h3M20 8.5v2M19 9.5h2"/>'),
  moonFull: s('<circle cx="12" cy="12" r="8"/><path d="M9 9.5h.01M14.5 14.5h.01M14 8.5h.01"/>'),
  bookOpen: s('<path d="M3.5 6c3-.6 5.8 0 8.5 2 2.7-2 5.5-2.6 8.5-2v12c-3-.6-5.8 0-8.5 2-2.7-2-5.5-2.6-8.5-2V6Z"/><path d="M12 8v12"/>'),
  hourglass: s('<path d="M7 3.5h10M7 20.5h10M8 3.5c0 4.5 4 5 4 8.5s-4 4-4 8.5M16 3.5c0 4.5-4 5-4 8.5s4 4 4 8.5"/>'),
  restart: s('<path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3"/><path d="M4.5 4.5v4h4"/>'),
  mountain: s('<path d="m3 19 6.5-11 4 6.5 2-3L21 19H3Z"/><path d="m8 10.5 1.5 1.5 1.5-1.5"/>'),
  library: s('<path d="M5 20V5M9 20V5M13.5 20l-1-15M17 20l2-14.5M4 20h16"/>'),
  crown: s('<path d="M4 18.5h16M5 16 3.5 7.5l5 4L12 5l3.5 6.5 5-4L19 16H5Z"/>'),
  medal: s('<circle cx="12" cy="14.5" r="5.5"/><path d="M9 9.5 6.5 3.5h4L12 7M15 9.5l2.5-6h-4L12 7"/>'),
  stars: s('<path d="m9 4 1.4 3 3.1.4-2.3 2.2.6 3.1L9 11.2l-2.8 1.5.6-3.1-2.3-2.2 3.1-.4L9 4Z"/><path d="m17 12 .9 1.8 2 .3-1.4 1.4.3 2-1.8-1-1.8 1 .3-2-1.4-1.4 2-.3L17 12Z"/>'),
};

export const ICON_NAMES = Object.keys(I);
