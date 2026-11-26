// MEZZANOTTE — medaglie da collezione: materiale e forma propri per ogni traguardo (SVG, nessuna immagine).
import { I } from './icons.js';

// rim: bordo metallico (alto → basso), face: smalto o metallo interno, ink: incisione, ring: filetto interno
export const MATERIALS = {
  bronze: { rim: ['#f6d2a8', '#b9763f', '#6b3a1c'], face: ['#d79a64', '#8a4f28'], ink: '#2e1607', ring: 'rgba(255,224,190,.45)' },
  silver: { rim: ['#ffffff', '#c3c8d1', '#6b717e'], face: ['#eef1f5', '#a2a9b5'], ink: '#222733', ring: 'rgba(255,255,255,.7)' },
  gold: { rim: ['#fff4cf', '#e0b45a', '#8a621d'], face: ['#f8dc96', '#bf8f39'], ink: '#3a2807', ring: 'rgba(255,246,214,.7)' },
  lavender: { rim: ['#ffffff', '#c6cad6', '#6f7585'], face: ['#c3b8ff', '#5644d0'], ink: '#f6f3ff', ring: 'rgba(255,255,255,.55)' },
  emerald: { rim: ['#fff4cf', '#dcae55', '#875f1c'], face: ['#86e6c2', '#13855e'], ink: '#03261a', ring: 'rgba(255,246,214,.6)' },
  copper: { rim: ['#ffd8bf', '#c8734a', '#73311a'], face: ['#e8a17a', '#a1502d'], ink: '#2c1105', ring: 'rgba(255,220,196,.5)' },
  rose: { rim: ['#ffe9e2', '#dba293', '#8b5146'], face: ['#f7cabd', '#bd7a6c'], ink: '#3b1711', ring: 'rgba(255,236,230,.6)' },
  pearl: { rim: ['#ffffff', '#dcd6ea', '#9c94b6'], face: ['#ffffff', '#cfc4e6'], ink: '#4a3e6a', ring: 'rgba(255,255,255,.85)' },
  midnight: { rim: ['#fff4cf', '#dcae55', '#875f1c'], face: ['#353a86', '#0a0c27'], ink: '#efcd86', ring: 'rgba(239,205,134,.55)' },
  steel: { rim: ['#eef3f8', '#8794a6', '#363f4b'], face: ['#b4bfcc', '#4b5767'], ink: '#0c1117', ring: 'rgba(240,246,252,.55)' },
  platinum: { rim: ['#ffffff', '#dbe1e9', '#8a94a3'], face: ['#f6f8fb', '#b9c2ce'], ink: '#28303c', ring: 'rgba(233,196,126,.95)' },
  malachite: { rim: ['#d4f6e4', '#2f9466', '#0d452d'], face: ['#45b885', '#0b553a'], ink: '#ecfff5', ring: 'rgba(212,246,228,.5)' },
  obsidian: { rim: ['#fff4cf', '#dcae55', '#875f1c'], face: ['#34343d', '#040406'], ink: '#efcd86', ring: 'rgba(239,205,134,.5)' },
  aurora: { rim: ['#ffffff', '#cbbdff', '#5fcfa6'], face: ['#ab9fff', '#63d7ab'], ink: '#0b0d15', ring: 'rgba(255,255,255,.65)' },
  locked: { rim: ['#2d3240', '#1d212c', '#141720'], face: ['#1b1f2a', '#121520'], ink: 'rgba(229,232,244,.34)', ring: 'rgba(255,255,255,.06)' },
};

// Definizioni dei gradienti, inserite una sola volta nel documento.
export function medalDefs() {
  return Object.entries(MATERIALS).map(([k, m]) => `
    <linearGradient id="mr-${k}" x1="0.15" y1="0" x2="0.85" y2="1"><stop offset="0" stop-color="${m.rim[0]}"/><stop offset=".48" stop-color="${m.rim[1]}"/><stop offset="1" stop-color="${m.rim[2]}"/></linearGradient>
    <radialGradient id="mf-${k}" cx=".34" cy=".28" r=".85"><stop offset="0" stop-color="${m.face[0]}"/><stop offset="1" stop-color="${m.face[1]}"/></radialGradient>`).join('')
    + `<linearGradient id="m-sheen" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset=".45" stop-color="#fff" stop-opacity="0"/></linearGradient>`;
}

function poly(n, r, rot = 0) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = rot + (Math.PI * 2 * i) / n;
    pts.push(`${(50 + r * Math.cos(a)).toFixed(2)},${(50 + r * Math.sin(a)).toFixed(2)}`);
  }
  return `<polygon points="${pts.join(' ')}"/>`;
}

function scallop(r, bumps = 18, depth = 3.2) {
  let d = '';
  const steps = bumps * 8;
  for (let i = 0; i <= steps; i++) {
    const a = (Math.PI * 2 * i) / steps - Math.PI / 2;
    const rr = r - depth / 2 + (depth / 2) * Math.cos(a * bumps);
    d += `${i ? 'L' : 'M'}${(50 + rr * Math.cos(a)).toFixed(2)} ${(50 + rr * Math.sin(a)).toFixed(2)}`;
  }
  return `<path d="${d}Z"/>`;
}

function shield(scale) {
  const k = scale / 46;
  const p = (x, y) => `${(50 + (x - 50) * k).toFixed(2)} ${(50 + (y - 50) * k).toFixed(2)}`;
  return `<path d="M${p(50, 4)} L${p(90, 18)} C${p(90, 58)} ${p(74, 84)} ${p(50, 96)} C${p(26, 84)} ${p(10, 58)} ${p(10, 18)} Z"/>`;
}

function shapeAt(shape, r) {
  if (shape === 'hexagon') return poly(6, r, -Math.PI / 2);
  if (shape === 'octagon') return poly(8, r, Math.PI / 8);
  if (shape === 'scallop') return scallop(r);
  if (shape === 'shield') return shield(r);
  return `<circle cx="50" cy="50" r="${r}"/>`;
}

// Medaglia: forma, bordo metallico, faccia, filetto, incisione, riflesso. Bloccata: grafite con progresso.
export function medal(a, size = 64, { progress = true } = {}) {
  const on = !!a.unlocked;
  const mat = on ? a.medal.material : 'locked';
  const m = MATERIALS[mat];
  const shape = a.medal.shape;
  const icon = (I[a.icon] || I.spark).replace('<svg ', `<svg x="31" y="31" width="38" height="38" style="color:${m.ink}" `);
  const prog = !on && progress && a.ratio > 0
    ? (() => {
      const r = 48;
      const c = 2 * Math.PI * r;
      return `<circle cx="50" cy="50" r="${r}" fill="none" stroke="rgba(233,196,126,.55)" stroke-width="2.4" stroke-linecap="round" stroke-dasharray="${(c * a.ratio).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 50 50)"/>`;
    })()
    : '';
  return `<span class="medal-art ${on ? 'on' : 'locked'} m-${mat}" style="--s:${size}px" aria-hidden="true">
    <svg viewBox="0 0 100 100" width="${size}" height="${size}">
      ${prog}
      <g fill="url(#mr-${mat})">${shapeAt(shape, on || !prog ? 46 : 42)}</g>
      <g fill="url(#mf-${mat})">${shapeAt(shape, on || !prog ? 37 : 34)}</g>
      <g fill="none" stroke="${m.ring}" stroke-width="1.1">${shapeAt(shape, on || !prog ? 40.5 : 37.5)}</g>
      ${icon}
      ${on ? `<g fill="url(#m-sheen)" opacity=".55">${shapeAt(shape, 37)}</g>` : ''}
    </svg></span>`;
}
