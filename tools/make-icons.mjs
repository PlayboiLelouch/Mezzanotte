// Genera icone PNG e splash screen iOS a partire da icons/icon.svg.
// Uso: node tools/make-icons.mjs
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'site');
const svg = await readFile(path.join(root, 'icons', 'icon.svg'), 'utf8');
const svgUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;

// [larghezza CSS, altezza CSS, densità] in verticale
export const SPLASH = [
  [440, 956, 3], [402, 874, 3], [420, 912, 3], [430, 932, 3], [393, 852, 3],
  [428, 926, 3], [390, 844, 3], [375, 812, 3], [414, 896, 3], [414, 896, 2],
  [414, 736, 3], [375, 667, 2], [320, 568, 2],
];

const browser = await chromium.launch();

async function shot(html, w, h, out, scale = 1) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: scale });
  await page.setContent(html, { waitUntil: 'load' });
  await page.screenshot({ path: path.join(root, 'icons', out), omitBackground: false });
  await page.close();
}

const iconHtml = (size, pad = 0) => `<html><body style="margin:0;background:#050507">
<div style="width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;background:#050507">
<img src="${svgUrl}" style="width:${size - pad * 2}px;height:${size - pad * 2}px;${pad ? 'border-radius:22%;' : ''}"></div></body></html>`;

for (const s of [180, 167, 152, 120, 192, 512, 32]) await shot(iconHtml(s), s, s, `icon-${s}.png`);
// Maskable: il disegno deve stare nella zona sicura (80%)
await shot(`<html><body style="margin:0"><div style="width:512px;height:512px;background:#0d0a1c;display:flex;align-items:center;justify-content:center"><img src="${svgUrl}" style="width:410px;height:410px;border-radius:50%"></div></body></html>`, 512, 512, 'icon-maskable-512.png');

const splashHtml = (w, h) => `<html><body style="margin:0;background:#000">
<div style="width:${w}px;height:${h}px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:22px;background:#000;font-family:-apple-system,'SF Pro Display','Helvetica Neue',Arial,sans-serif">
<img src="${svgUrl}" style="width:${Math.round(w * 0.27)}px;height:${Math.round(w * 0.27)}px;border-radius:23%;box-shadow:0 0 0 1px rgba(255,255,255,.06)">
<div style="color:#F5F5F7;font-size:${Math.round(w * 0.052)}px;font-weight:700;letter-spacing:.32em;margin-left:.32em">MEZZANOTTE</div>
</div></body></html>`;

const links = [];
for (const [w, h, d] of SPLASH) {
  const name = `splash-${w * d}x${h * d}.png`;
  await shot(splashHtml(w, h), w, h, name, d);
  links.push(
    `<link rel="apple-touch-startup-image" href="icons/${name}" media="(device-width: ${w}px) and (device-height: ${h}px) and (-webkit-device-pixel-ratio: ${d}) and (orientation: portrait)">`,
  );
}
await writeFile(path.join(root, 'icons', 'splash-links.html'), links.join('\n') + '\n');
await browser.close();
console.log('Icone generate:', links.length, 'splash');
