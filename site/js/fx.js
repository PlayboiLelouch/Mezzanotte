// MEZZANOTTE — feedback: aptica (solo dove supportata), suoni opzionali, microanimazioni.

let settings = { haptics: true, sound: false, motion: 'system' };
export function configure(s) {
  settings = { ...settings, ...s };
  document.documentElement.classList.toggle('reduce-motion', reducedMotion());
}

export function reducedMotion() {
  return settings.motion === 'reduce' || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

// iOS (Safari 18+) produce un feedback aptico reale quando si attiva un interruttore nativo:
// è l'unico meccanismo disponibile per le web app. Altrove si usa navigator.vibrate se esiste.
let switchEl = null;
function iosTick() {
  if (!switchEl) {
    const label = document.createElement('label');
    label.setAttribute('aria-hidden', 'true');
    label.style.cssText = 'position:fixed;left:-100px;top:0;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.setAttribute('switch', '');
    input.tabIndex = -1;
    label.appendChild(input);
    document.body.appendChild(label);
    switchEl = label;
  }
  switchEl.click();
}

export function hapticSupported() {
  return typeof navigator.vibrate === 'function' || isIOS();
}

export function haptic(kind = 'light') {
  if (!settings.haptics) return;
  // solo in risposta a un gesto reale (es. non all'avvio dell'app)
  if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
  try {
    if (typeof navigator.vibrate === 'function') {
      navigator.vibrate(kind === 'success' ? [14, 60, 22] : kind === 'heavy' ? 26 : 10);
    } else if (isIOS()) {
      iosTick();
      if (kind === 'success') setTimeout(iosTick, 120);
    }
  } catch { /* non supportato */ }
}

// Suoni generati localmente (nessun file audio), disattivati per impostazione predefinita.
let audio = null;
export function sound(kind = 'done') {
  if (!settings.sound) return;
  if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') audio.resume();
    const notes = { done: [660, 880], full: [523, 659, 784, 1047], level: [392, 523, 659, 784, 1047], soft: [520] }[kind] || [660];
    const t0 = audio.currentTime + 0.01;
    notes.forEach((freq, i) => {
      const o = audio.createOscillator();
      const g = audio.createGain();
      o.type = 'sine';
      o.frequency.value = freq;
      const t = t0 + i * 0.09;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.12, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
      o.connect(g).connect(audio.destination);
      o.start(t);
      o.stop(t + 0.5);
    });
  } catch { /* audio non disponibile */ }
}

// "+20 XP" che sale dal punto del tocco.
export function floatText(el, text, cls = '') {
  if (!el || reducedMotion()) return;
  const r = el.getBoundingClientRect();
  const n = document.createElement('div');
  n.className = `float-xp ${cls}`;
  n.textContent = text;
  n.style.left = `${r.left + r.width / 2}px`;
  n.style.top = `${r.top}px`;
  document.body.appendChild(n);
  n.animate(
    [{ transform: 'translate(-50%, 0) scale(.8)', opacity: 0 }, { transform: 'translate(-50%, -18px) scale(1)', opacity: 1, offset: 0.25 }, { transform: 'translate(-50%, -46px) scale(1)', opacity: 0 }],
    { duration: 1100, easing: 'cubic-bezier(.2,.7,.3,1)' },
  ).onfinish = () => n.remove();
}

// Conteggio animato di un numero.
export function countUp(el, from, to, fmt = (v) => String(v)) {
  if (!el) return;
  if (reducedMotion() || from === to) {
    el.textContent = fmt(to);
    return;
  }
  const t0 = performance.now();
  const dur = Math.min(900, 300 + Math.abs(to - from) * 6);
  const step = (t) => {
    const k = Math.min(1, (t - t0) / dur);
    const e = 1 - (1 - k) ** 3;
    el.textContent = fmt(Math.round(from + (to - from) * e));
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// Piccola celebrazione: particelle morbide attorno a un elemento.
export function burst(el, colors = ['#b3a6ff', '#6fd9b0', '#e8c37d'], count = 14) {
  if (!el || reducedMotion()) return;
  const r = el.getBoundingClientRect();
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;
  for (let i = 0; i < count; i++) {
    const p = document.createElement('div');
    p.className = 'burst';
    p.style.background = colors[i % colors.length];
    p.style.left = `${cx}px`;
    p.style.top = `${cy}px`;
    document.body.appendChild(p);
    const a = (Math.PI * 2 * i) / count + Math.random() * 0.3;
    const d = 34 + Math.random() * 34;
    p.animate(
      [{ transform: 'translate(-50%,-50%) scale(1)', opacity: 0.95 }, { transform: `translate(calc(-50% + ${Math.cos(a) * d}px), calc(-50% + ${Math.sin(a) * d}px)) scale(.3)`, opacity: 0 }],
      { duration: 620 + Math.random() * 260, easing: 'cubic-bezier(.2,.7,.3,1)' },
    ).onfinish = () => p.remove();
  }
}
