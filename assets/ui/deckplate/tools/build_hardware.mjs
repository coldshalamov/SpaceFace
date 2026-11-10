// build_hardware — the deckplate's physical parts, authored as SVG (assets/ui/deckplate/hw/).
//
// Each part is LIGHTING over a textured metal the consuming CSS supplies (brushed + scratches +
// grain from bake_textures.py): semi-transparent key-light catches on the top/left faces, shade on
// bottom/right, a dark rebate where metal steps down into glass, and hex-socket fasteners. The key
// light is top-left and warm everywhere (tokens.js --dp-key), so every part answers the same lamp.
//
//   node assets/ui/deckplate/tools/build_hardware.mjs
//
// 9-slice metrics the CSS relies on (hardware.js): bezel 120 box / slice 30 / ring 14;
// bezel-thin 48 / slice 12 / ring 5; keycap 48x36 / slice 10 10 12 10.

import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const OUT = fileURLToPath(new URL('../hw/', import.meta.url));
mkdirSync(OUT, { recursive: true });
const f = (n) => Number(n.toFixed(2));

function hexSocket(cx, cy, r) {
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i + Math.PI / 6;
    pts.push(`${f(cx + r * Math.cos(a))},${f(cy + r * Math.sin(a))}`);
  }
  return `<polygon points="${pts.join(' ')}" fill="#05070a"/>`;
}

function screw(cx, cy, r = 3.5) {
  return `<g>`
    + `<circle cx="${cx}" cy="${cy}" r="${f(r + 1)}" fill="#000" fill-opacity=".55"/>`
    + `<circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#screw)" stroke="#030405" stroke-width=".7"/>`
    + hexSocket(cx, cy, r * 0.44)
    + `<path d="M${f(cx - r * 0.74)} ${f(cy - r * 0.18)} A${f(r * 0.8)} ${f(r * 0.8)} 0 0 1 ${f(cx + r * 0.12)} ${f(cy - r * 0.78)}" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width=".7"/>`
    + `</g>`;
}

const SCREW_GRAD = '<radialGradient id="screw" cx=".36" cy=".3" r=".8"><stop offset="0" stop-color="#c3cad8"/><stop offset=".4" stop-color="#5a6272"/><stop offset="1" stop-color="#14171d"/></radialGradient>';
const faceGrad = (id, top, mid, bot) =>
  `<linearGradient id="${id}" x1="0" y1="0" x2=".3" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="${top}"/><stop offset=".45" stop-color="#fff" stop-opacity="${mid}"/><stop offset="1" stop-color="#000" stop-opacity="${bot}"/></linearGradient>`;

const parts = {};

// The instrument bezel: 120 box, 14 px ring, four fasteners, a machined rebate into the glass.
parts['bezel.svg'] = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120">
<defs>${faceGrad('face', 0.16, 0.02, 0.42)}${SCREW_GRAD}</defs>
<path fill="url(#face)" fill-rule="evenodd" d="M4 .5H116A3.5 3.5 0 0 1 119.5 4V116A3.5 3.5 0 0 1 116 119.5H4A3.5 3.5 0 0 1 .5 116V4A3.5 3.5 0 0 1 4 .5ZM15 14H105A1 1 0 0 1 106 15V105A1 1 0 0 1 105 106H15A1 1 0 0 1 14 105V15A1 1 0 0 1 15 14Z"/>
<rect x=".5" y=".5" width="119" height="119" rx="3.5" fill="none" stroke="#050608" stroke-opacity=".92"/>
<path d="M4 1.6H116" stroke="#ffeccc" stroke-opacity=".46"/>
<path d="M1.6 4V116" stroke="#ffeccc" stroke-opacity=".2"/>
<path d="M4 118.4H116" stroke="#000" stroke-opacity=".55"/>
<path d="M118.4 4V116" stroke="#000" stroke-opacity=".45"/>
<path d="M15 11.6H105" stroke="#000" stroke-opacity=".38"/>
<rect x="13" y="13" width="94" height="94" rx="1.6" fill="none" stroke="#030405" stroke-width="2"/>
<path d="M15 107.4H105" stroke="#ffe8c0" stroke-opacity=".2"/>
<path d="M107.4 15V105" stroke="#ffe8c0" stroke-opacity=".09"/>
${screw(7, 7)}${screw(113, 7)}${screw(7, 113)}${screw(113, 113)}
</svg>`;

// Secondary displays and hardware rails: a thin ring, no fasteners.
parts['bezel-thin.svg'] = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
<defs>${faceGrad('face', 0.14, 0.02, 0.4)}</defs>
<path fill="url(#face)" fill-rule="evenodd" d="M3 .5H45A2.5 2.5 0 0 1 47.5 3V45A2.5 2.5 0 0 1 45 47.5H3A2.5 2.5 0 0 1 .5 45V3A2.5 2.5 0 0 1 3 .5ZM6 5H42A1 1 0 0 1 43 6V42A1 1 0 0 1 42 43H6A1 1 0 0 1 5 42V6A1 1 0 0 1 6 5Z"/>
<rect x=".5" y=".5" width="47" height="47" rx="2.5" fill="none" stroke="#050608" stroke-opacity=".9"/>
<path d="M3 1.6H45" stroke="#ffeccc" stroke-opacity=".38"/>
<path d="M1.6 3V45" stroke="#ffeccc" stroke-opacity=".16"/>
<path d="M3 46.4H45" stroke="#000" stroke-opacity=".5"/>
<rect x="4.5" y="4.5" width="39" height="39" rx="1.2" fill="none" stroke="#030405" stroke-width="1.4"/>
<path d="M6 43.6H42" stroke="#ffe8c0" stroke-opacity=".16"/>
</svg>`;

// A raised key and its pressed state. The skirt (the key's front face) lives in the bottom slice.
const key = (pressed) => `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="36" viewBox="0 0 48 36">
<defs>${faceGrad('face', pressed ? 0.04 : 0.2, pressed ? 0 : 0.04, pressed ? 0.2 : 0.18)}</defs>
<rect x=".5" y=".5" width="47" height="35" rx="3" fill="#000" fill-opacity=".28" stroke="#030405"/>
<rect x="1.5" y="${pressed ? 2.5 : 1.5}" width="45" height="${pressed ? 31 : 28}" rx="2.4" fill="url(#face)"/>
<path d="M4 ${pressed ? 3.1 : 2.1}H44" stroke="#ffeccc" stroke-opacity="${pressed ? 0.14 : 0.5}"/>
<path d="M2.1 ${pressed ? 5 : 4}V${pressed ? 31 : 27}" stroke="#ffeccc" stroke-opacity="${pressed ? 0.06 : 0.18}"/>
${pressed ? '' : '<path d="M2 29.5H46" stroke="#000" stroke-opacity=".7"/><rect x="1.5" y="30" width="45" height="4.5" rx="1.5" fill="#000" fill-opacity=".38"/>'}
<path d="M3 ${pressed ? 33.6 : 34.6}H45" stroke="#ffe8c0" stroke-opacity=".1"/>
</svg>`;
parts['keycap.svg'] = key(false);
parts['keycap-pressed.svg'] = key(true);

// The end of an etched groove: a countersunk screw.
parts['rule-cap.svg'] = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 12 12"><defs>${SCREW_GRAD}</defs>${screw(6, 6, 3.2)}</svg>`;

for (const [name, svg] of Object.entries(parts)) {
  writeFileSync(OUT + name, svg.replace(/\n/g, ''));
  console.log(name.padEnd(20), svg.length, 'bytes');
}
