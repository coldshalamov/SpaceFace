// Rendered-pixel legibility measurement for `check:ui-layout.mjs --pixels`.
//
// The geometry probe answers "is this text under something". It cannot answer "can this text be
// read against what is drawn behind it" — and that is the defect class the stills keep showing:
// boneset words over a lit hull, a dimmed HUD ghosting through a panel, a caption set on a busy
// render. A DOM-level contrast check is no help either: the background is the 3D picture, not a
// CSS colour, so there is nothing to look up in the computed style.
//
// So this pass looks at the pixels. For every element that owns visible text inside the surface
// root, it samples the screenshot under that element in column tiles and computes the WORST tile's
// WCAG contrast between the text (composited at its own colour and alpha) and that tile's median
// background. Worst-tile rather than average is deliberate: one bright object passing under half a
// word is exactly how these screens fail while the average still looks fine.
//
// Findings are measurements, not verdicts on taste: a row names the surface, the element, the
// ratio and the floor it missed, so it is still a work order.

import { PNG } from 'pngjs';

/** Collected in the page, over the surface root. Kept serialisable (no DOM handles out). */
export const LEGIBILITY_PROBE = function legibilityProbe({ selectors = [], limit = 60 } = {}) {
  const scope = (selectors || [])
    .map((s) => { try { return document.querySelector(s); } catch { return null; } })
    .find(Boolean) || document.body;
  const parse = (css) => {
    const m = /rgba?\(([^)]+)\)/.exec(css || '');
    if (!m) return null;
    const p = m[1].split(',').map((v) => Number(v.trim()));
    return { rgb: [p[0], p[1], p[2]], alpha: p.length > 3 ? p[3] : 1 };
  };
  const readable = (el) => {
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      if (n.getAttribute('aria-hidden') === 'true') return false;
      const cs = getComputedStyle(n);
      if (cs.display === 'none' || cs.visibility === 'hidden') return false;
      const op = Number(cs.opacity);
      if (Number.isFinite(op) && op < 0.5) return false; // designed-dim content is not judged here
    }
    return true;
  };
  const out = [];
  for (const el of scope.querySelectorAll('*')) {
    const own = [...el.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim().length > 1);
    if (!own.length) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width < 10 || rect.height < 6) continue;
    if (rect.bottom <= 0 || rect.right <= 0 || rect.top >= innerHeight || rect.left >= innerWidth) continue;
    if (!readable(el)) continue;
    const cs = getComputedStyle(el);
    const size = Number.parseFloat(cs.fontSize) || 0;
    if (size < 8) continue;
    const color = parse(cs.color);
    // Designed-dim ink (the kit's `k-38`-style levels, alpha 38 %) is owned by the token-level
    // contrast check (`check:wcag-contrast`); this pass measures the BACKGROUND a full-strength
    // word is drawn on, which no token check can see. Half strength is the cut.
    if (!color || color.alpha < 0.5) continue;
    const label = (el.tagName.toLowerCase()
      + (typeof el.className === 'string' && el.className.trim()
        ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.')
        : '')).slice(0, 64);
    out.push({
      label,
      text: own.map((n) => n.textContent.trim()).join(' ').replace(/\s+/g, ' ').slice(0, 32),
      x: rect.left, y: rect.top, w: rect.width, h: rect.height,
      color: color.rgb, alpha: color.alpha, size, weight: Number.parseInt(cs.fontWeight, 10) || 400,
    });
    if (out.length >= limit) break;
  }
  return out;
};

const channel = (v) => {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const luminance = ([r, g, b]) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
const ratio = (a, b) => {
  const la = luminance(a); const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};

/** WCAG floors: 3:1 for large text (>= 24 px, or >= 18.66 px bold), 4.5:1 for everything else. */
export function legibilityFloor(candidate) {
  const large = candidate.size >= 24 || (candidate.size >= 18.66 && candidate.weight >= 700);
  return large ? 3 : 4.5;
}

export function legibilityFindings(pngBuffer, candidates, { tiles = 3 } = {}) {
  const img = PNG.sync.read(pngBuffer);
  const findings = [];
  for (const candidate of candidates) {
    const x0 = Math.max(0, Math.floor(candidate.x));
    const y0 = Math.max(0, Math.floor(candidate.y));
    const x1 = Math.min(img.width, Math.ceil(candidate.x + candidate.w));
    const y1 = Math.min(img.height, Math.ceil(candidate.y + candidate.h));
    if (x1 - x0 < 8 || y1 - y0 < 4) continue;
    const tileWidth = Math.max(8, Math.ceil((x1 - x0) / tiles));
    // How light the ink is once it sits on any ground; used to decide which side of the tile's
    // pixels is background. Large display type fills whole tiles, and a plain median then measures
    // the GLYPH as if it were the ground (that is how a bone word on a black panel first measured
    // 1.86:1). So the background is taken from the tail away from the ink.
    const inkReference = (candidate.alpha * luminance(candidate.color) + (1 - candidate.alpha) * 0.5);
    let worst = Infinity;
    for (let tx = x0; tx < x1; tx += tileWidth) {
      const pixels = [];
      for (let px = tx; px < Math.min(x1, tx + tileWidth); px += 1) {
        for (let py = y0; py < y1; py += 1) {
          const i = (img.width * py + px) << 2;
          const rgb = [img.data[i], img.data[i + 1], img.data[i + 2]];
          pixels.push({ rgb, lum: luminance(rgb) });
        }
      }
      if (!pixels.length) continue;
      pixels.sort((a, b) => a.lum - b.lum);
      const at = (q) => pixels[Math.floor(q * (pixels.length - 1))];
      const mean = pixels.reduce((sum, p) => sum + p.lum, 0) / pixels.length;
      const variance = pixels.reduce((sum, p) => sum + (p.lum - mean) ** 2, 0) / pixels.length;
      // A tile with no spread is solid glyph or solid ground — nothing to measure against. This is
      // the guard that keeps display type (whose box can be one big glyph) from being scored
      // against its own ink.
      if (Math.sqrt(variance) < 0.02) continue;
      const inkIsLight = inkReference >= mean;
      const picked = inkIsLight ? at(0.2) : at(0.8);
      // The ground has to own a real share of the tile, or a stray pixel is being called the
      // background.
      const ground = pixels.filter((p) => (inkIsLight ? p.lum <= picked.lum + 0.01 : p.lum >= picked.lum - 0.01)).length;
      if (ground / pixels.length < 0.05) continue;
      const ink = candidate.color.map((v, k) => candidate.alpha * v + (1 - candidate.alpha) * picked.rgb[k]);
      worst = Math.min(worst, ratio(ink, picked.rgb));
    }
    if (!Number.isFinite(worst)) continue;
    const floor = legibilityFloor(candidate);
    if (worst < floor) {
      findings.push({
        rule: 'text-against-render',
        victim: candidate.label,
        detail: `${candidate.text ? `"${candidate.text}" ` : ''}${worst.toFixed(2)}:1 against the drawn ground (floor ${floor}); ink rgb(${candidate.color.join(' ')}) a=${candidate.alpha} at ${Math.round(candidate.w)}x${Math.round(candidate.h)}`,
      });
    }
  }
  return findings;
}
