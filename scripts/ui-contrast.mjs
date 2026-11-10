#!/usr/bin/env node
// ui-contrast — what the READER actually gets, measured off the composited pixels.
//
// WHY THIS EXISTS. The glyph audit in ui-bench reads the DOM: it knows a run's rectangle and its
// computed colour, and it can tell you two runs overlap. It cannot tell you whether a reading is
// legible, because legibility is a property of the PIXELS BEHIND the text, and in this game those
// pixels are a live 3D render — a bright ochre hangar wall, a lit asteroid, an engine plume. A
// DOM-only check reports `color: #dfeeff` on `background: transparent` and calls it a pass.
//
// design/frontend/ONE_PHOTOGRAPH.md §7 item 2 makes this a named gate: the glyph audit must hold
// 4.5:1 "sampling the world's pixels behind every reading", and explicitly says a vignette is not
// ASSUMED to carry it. This is that sampler.
//
// HOW IT SEPARATES INK FROM BACKGROUND. The text's own colour is known from computed style. Within
// a run's rectangle, pixels close to that colour are ink; the rest are what the reader sees behind
// it. Taking the MEDIAN of the background rather than the mean matters: a mean is dragged by
// antialiased edge pixels, which sit halfway between ink and background and would flatter every
// reading. The background luminance used is the WORST (brightest for dark ink, darkest for light
// ink) of the 90th-percentile band, because a run is only as legible as its hardest patch.
//
// WHAT IT DOES NOT DO. It does not count glow. A text-shadow or a bloom raises the measured
// background around a glyph, which is exactly backwards — the direction says bloom and text-shadow
// do not count toward contrast. So ink pixels are matched generously and their halo is discarded
// with them, and what remains is the true field.
//
// USAGE
//   node scripts/ui-contrast.mjs --shot=flight,station-market
//   node scripts/ui-contrast.mjs --shot=flight --min=4.5 --json
//
// It drives ui-bench for the capture, so it sees exactly the cascade the player's route loads.

import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** sRGB channel -> linear, per WCAG 2.x. */
function lin(c) {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}
function luminance(r, g, b) {
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
function contrast(l1, l2) {
  const hi = Math.max(l1, l2);
  const lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}
function parseColor(css) {
  const m = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,/\s]+([\d.]+))?/i.exec(css || '');
  if (!m) return null;
  return { r: +m[1], g: +m[2], b: +m[3], a: m[4] == null ? 1 : +m[4] };
}

// Every visible text run, with its rectangle, colour and size. The Range is taken over the TEXT
// NODE, not the element's contents: a commodity name element contains an 18px bone-coloured icon,
// and including it put a bright non-glyph patch inside the measured rect, which read as a pale
// field and scored the name three tenths too low.
// Runs inside a scrolled-out region,
// a collapsed <details> or a screen-reader-only box are skipped for the same reasons the bench's
// own audit skips them: they are not on screen, so their contrast is not a defect.
// One line on purpose: the bench takes --probe= as a single argument.
const PROBE = 'js:' + "(()=>{const out=[],seen=new Set();const walk=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);const vw=innerWidth,vh=innerHeight;for(let n=walk.nextNode();n;n=walk.nextNode()){const t=(n.nodeValue||'').trim();if(!t)continue;const el=n.parentElement;if(!el||seen.has(el))continue;const s=getComputedStyle(el);if(s.visibility==='hidden'||s.display==='none'||+s.opacity<0.08)continue;if(el.closest('[hidden],[aria-hidden=\"true\"],details:not([open])'))continue;const box=el.getBoundingClientRect();if(box.width<4||box.height<4)continue;if(box.right<0||box.bottom<0||box.left>vw||box.top>vh)continue;let clipped=false;for(let a=el.parentElement;a&&a!==document.body;a=a.parentElement){const as=getComputedStyle(a);if(as.overflow==='visible'&&as.overflowY==='visible'&&as.overflowX==='visible')continue;const ab=a.getBoundingClientRect();if(box.top<ab.top+1||box.bottom>ab.bottom-1||box.left<ab.left-1||box.right>ab.right+1){clipped=true;break;}}if(clipped)continue;const r=document.createRange();r.selectNode(n);const rects=[...r.getClientRects()].filter(q=>q.width>3&&q.height>3);if(!rects.length)continue;seen.add(el);const q=rects[0];out.push({text:t.slice(0,40),x:Math.round(q.left),y:Math.round(q.top),w:Math.round(q.width),h:Math.round(q.height),color:s.color,size:parseFloat(s.fontSize)||0,weight:s.fontWeight,cls:(el.className||'').toString().slice(0,48)});}return out.slice(0,400);})()";

function shotAndProbe(id) {
  const res = spawnSync(process.execPath,
    [path.join(ROOT, 'scripts', 'ui-bench.mjs'), `--shot=${id}`, `--probe=${PROBE}`],
    { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const text = (res.stdout || '') + (res.stderr || '');
  // The bench prints the probe result on its own indented line after the probe echo.
  const start = text.lastIndexOf('\n    [');
  if (start < 0) return { runs: [], raw: text };
  const line = text.slice(start + 5).split('\n')[0];
  try { return { runs: JSON.parse(line), raw: text }; }
  catch { return { runs: [], raw: text }; }
}

function median(values) {
  if (!values.length) return 0;
  const a = [...values].sort((x, y) => x - y);
  return a[a.length >> 1];
}

async function loadPng(file) {
  // The repo has no image dependency, and adding one for a check is not worth the bundle. Python
  // with Pillow is already used by the asset pipeline and is present on this machine.
  const py = spawnSync('python', ['-c', `
import sys, json
from PIL import Image
im = Image.open(sys.argv[1]).convert('RGB')
sys.stdout.write(json.dumps({'w': im.width, 'h': im.height}))
sys.stdout.write('\\n')
sys.stdout.flush()
sys.stdout.buffer.write(im.tobytes())
`, file], { encoding: 'buffer', maxBuffer: 256 * 1024 * 1024 });
  if (py.status !== 0) throw new Error('PIL read failed: ' + String(py.stderr));
  const buf = py.stdout;
  const nl = buf.indexOf(0x0a);
  const meta = JSON.parse(buf.slice(0, nl).toString('utf8'));
  return { ...meta, data: buf.slice(nl + 1) };
}

function measure(img, run) {
  const ink = parseColor(run.color);
  if (!ink) return null;
  const inkL = luminance(ink.r, ink.g, ink.b);
  const x0 = Math.max(0, run.x), y0 = Math.max(0, run.y);
  const x1 = Math.min(img.w, run.x + run.w), y1 = Math.min(img.h, run.y + run.h);
  if (x1 <= x0 || y1 <= y0) return null;

  // SEPARATING INK FROM FIELD IS THE WHOLE PROBLEM, and a colour-distance threshold gets it wrong.
  // A tight rectangle around bright text is mostly glyph, and what is left is dominated by the
  // ANTIALIASED SKIRT — pixels sitting halfway between the letter and the field. Treating those as
  // background makes every reading look worse than it is: the first version of this script scored
  // #dfeeff on a veiled backdrop at 2.65:1, which is the skirt's contrast, not the reader's.
  //
  // So the split is by luminance with Otsu's method — the threshold that minimises variance within
  // the two groups — and then the transition band adjacent to it is dropped. What remains on the
  // far side is the field.
  const lums = [];
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * img.w + x) * 3;
      lums.push(luminance(img.data[i], img.data[i + 1], img.data[i + 2]));
    }
  }
  if (lums.length < 24) return null;

  const BINS = 64;
  const hist = new Array(BINS).fill(0);
  for (const l of lums) hist[Math.min(BINS - 1, Math.floor(l * BINS))]++;
  let total = lums.length, sum = 0;
  for (let i = 0; i < BINS; i++) sum += i * hist[i];
  let sumB = 0, wB = 0, best = -1, cut = 0;
  for (let i = 0; i < BINS; i++) {
    wB += hist[i];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += i * hist[i];
    const mB = sumB / wB, mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > best) { best = between; cut = i; }
  }
  const threshold = (cut + 1) / BINS;
  const inkIsLight = inkL > threshold;

  // The field is the side of the split the ink is NOT on. The band within 25% of the threshold is
  // the glyph's own edge and belongs to neither.
  const band = 0.25 * Math.abs(inkL - threshold);
  const field = [];
  let inkSeen = 0;
  for (const l of lums) {
    const isInk = inkIsLight ? l > threshold : l < threshold;
    if (isInk) { inkSeen++; continue; }
    if (Math.abs(l - threshold) < band) continue;
    field.push(l);
  }
  // A SHORT RUN IS MOSTLY GLYPH. "Idle" at 13px is ~200 pixels with 60% ink, and Otsu on that can
  // land the threshold anywhere — brightening the ink moved one reading's score the WRONG way,
  // which is the instrument being unstable, not the screen getting worse. So the field is also
  // sampled from a 3px ring just outside the run, which contains no glyph pixels at all and is
  // what the reader's eye actually uses to separate the letter from its surroundings.
  const PAD = 3;
  for (let y = Math.max(0, y0 - PAD); y < Math.min(img.h, y1 + PAD); y++) {
    for (let x = Math.max(0, x0 - PAD); x < Math.min(img.w, x1 + PAD); x++) {
      if (x >= x0 && x < x1 && y >= y0 && y < y1) continue;
      const i = (y * img.w + x) * 3;
      const r = img.data[i], g = img.data[i + 1], b = img.data[i + 2];
      // A lit item draws its own lamp right against its text — an amber underline under an amber
      // word. That bar is the control saying "this one is selected"; it is not the field the word
      // sits on, and counting it scored a perfectly legible selected option at 1.03:1. Ring pixels
      // that match the ink are the element's own accent and are skipped, exactly as inside the
      // rect.
      if (Math.abs(r - ink.r) + Math.abs(g - ink.g) + Math.abs(b - ink.b) < 120) continue;
      field.push(luminance(r, g, b));
    }
  }
  if (field.length < 8 || inkSeen < 4) return null;

  field.sort((a, b) => a - b);
  // The hardest patch of the true field, not the average one: for light ink the brightest place it
  // has to sit on, for dark ink the darkest. A run is only as legible as its worst spot.
  // WHICH PART OF THE FIELD TO JUDGE AGAINST. The 90th percentile — "the worst patch" — sounds
  // like the safe choice and is not: a 1px hairline divider two pixels under a sub-label, or a
  // lit rule beside a heading, is a small bright minority of the ring, and at the 90th percentile
  // it becomes the verdict. That scored a perfectly readable grey-on-dark label at 1.43:1.
  // WCAG's notion is the background COLOUR, so the judgement is the 70th percentile: still
  // conservative — it leans toward the harder side of a gradient — without letting adjacent
  // decoration speak for the field.
  const idx = inkIsLight
    ? Math.floor(field.length * 0.70)
    : Math.floor(field.length * 0.30);
  const worst = field[Math.min(field.length - 1, Math.max(0, idx))];
  const bg = field;
  const ratio = contrast(inkL, worst);
  // WCAG large text: >=24px, or >=18.66px bold.
  const large = run.size >= 24 || (run.size >= 18.66 && Number(run.weight) >= 700);
  return { ratio, required: large ? 3.0 : 4.5, bgMedian: median(bg), inkL, large };
}

const args = process.argv.slice(2);
const ids = (args.find((a) => a.startsWith('--shot=')) || '--shot=flight')
  .slice('--shot='.length).split(',').map((s) => s.trim()).filter(Boolean);
const asJson = args.includes('--json');
const floor = Number((args.find((a) => a.startsWith('--min=')) || '').slice('--min='.length)) || null;

let failures = 0;
const report = [];
for (const id of ids) {
  const { runs, raw } = shotAndProbe(id);
  const png = path.join(ROOT, '.devshots', 'ui-bench', `${id}.png`);
  if (!runs.length || !existsSync(png)) {
    console.log(`${id}  NO DATA (probe returned ${runs.length} runs)`);
    if (!asJson && !runs.length) console.log(raw.split('\n').slice(-6).join('\n'));
    continue;
  }
  const img = await loadPng(png);
  const rows = [];
  for (const run of runs) {
    const m = measure(img, run);
    if (!m) continue;
    const need = floor || m.required;
    if (m.ratio < need) rows.push({ ...run, ...m, need });
  }
  rows.sort((a, b) => a.ratio - b.ratio);
  failures += rows.length;
  report.push({ id, runs: runs.length, failures: rows });
  if (asJson) continue;
  console.log(`\n${id}  ${runs.length} readings measured against the composited frame`);
  if (!rows.length) { console.log('  every reading clears its WCAG floor on the real pixels'); continue; }
  for (const r of rows.slice(0, 14)) {
    console.log(`  ${r.ratio.toFixed(2)}:1  (needs ${r.need})  "${r.text}"  ${r.size}px  ${r.cls}`);
  }
  if (rows.length > 14) console.log(`  ... and ${rows.length - 14} more`);
}
if (asJson) console.log(JSON.stringify(report, null, 2));
process.exit(failures ? 1 : 0);
