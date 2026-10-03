// The world-object hover tag (nameplate over hovered ships/rocks/stations), mounted by
// src/ui/worldObjectInteraction.js. ORRERY register: the vitals are compact Arc Gauges (§3.2 a
// quantity is an arc; the Cluster's shield/armor/hull tone convention — phos, hi, phos), every
// colour is a Deckplate token (warm bone at rest, threat red only for hostiles, the Hand for the
// selected), and the tag carries a kit tag-leader: a light drop from the tag's foot to the point
// it names (assets/ui/kit/assets/svg/tapes/tag-leader.svg, read pointing down — the tag tracks
// its object through the cursor, so the geometry is static).
//
// DOM contract (pinned by test/world-object-gesture.test.mjs): root class is exactly `sf-woi`,
// children[1] is the meta line, a `.sf-woi__hint` child exists, and paintHoverTagVitals /
// placeHoverTag keep their shapes. The old `.sf-woi__bar` slots stay mounted as the gauge slots
// (the hud.js mountVitalArc idiom); the `i` scalar inside each stays as the fallback painter for
// environments without SVG construction (headless harnesses).
import { arcGauge } from './instruments.js';
import { injectOrrery } from './tokens.js';

const STYLE_ID = 'sf-orrery-hover-tag';
const SVGNS = 'http://www.w3.org/2000/svg';

const HALO = 'text-shadow:0 0 1px rgb(3 4 7 / .95), 0 0 4px rgb(3 4 7 / .85), 0 0 10px rgb(3 4 7 / .6);';

// The Cluster's own tone mapping (orrery/flightCluster.js): shield and hull read in phosphor,
// armour is the thin hi bone line between them.
const VITAL_TONE = { shield: 'phos', armor: 'hi', hull: 'phos' };

const CSS = `
.sf-woi{position:fixed;left:0;top:0;z-index:12;pointer-events:none;transform:translate(-50%,calc(-100% - 14px));
  text-align:center;${HALO}}
.sf-woi__name{font-family:var(--dp-face-display);font-stretch:118%;font-size:14px;font-weight:700;
  letter-spacing:.06em;color:var(--dp-ink, #e8e2d4);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sf-woi__meta{font-family:var(--dp-face-label);font-stretch:112%;font-weight:600;font-size:12px;
  letter-spacing:.18em;text-transform:uppercase;color:var(--dp-ink-dim, #b7b4a6);margin-top:3px;
  overflow-wrap:anywhere}
.sf-woi__hint{font-family:var(--dp-face-label);font-stretch:112%;font-weight:600;font-size:12px;
  letter-spacing:.14em;text-transform:uppercase;color:var(--dp-ink-dim, #b7b4a6);margin-top:2px;
  overflow-wrap:anywhere}
.sf-woi[data-beam="1"] .sf-woi__hint{color:var(--dp-phos, #dfeeff)}
.sf-woi[data-sling="1"] .sf-woi__hint{color:var(--dp-hand, #f2b950)}
.sf-woi[data-selected="1"] .sf-woi__meta{color:var(--dp-hand, #f2b950)}
/* relations: threat red is the only alarm; allies read in the rest light — the meta line names them */
.sf-woi[data-relation="hostile"] .sf-woi__name{color:var(--dp-danger-hot, #ff8a70)}
.sf-woi[data-relation="hostile"] .sf-woi__meta{color:var(--dp-danger-hot, #ff8a70)}
/* vitals: a row of compact Arc Gauges (the mining-HUD / Cluster convention), one per layer the
   body carries. No bordered bars, no raw hexes — the gauge strokes carry the orrery tones. */
.sf-woi__bars{display:flex;justify-content:center;gap:5px;margin:7px auto 0}
.sf-woi__bars[hidden]{display:none}
.sf-woi__bar{position:relative;width:24px;height:24px}
.sf-woi__bar[hidden]{display:none}
.sf-woi__dial{display:block;width:100%;height:100%;overflow:visible}
.sf-woi__bar>i{display:none}
/* the tag leader: a static light drop from the tag's foot to the named point — core + bloom
   strokes, geometry only (no filters in flight). Rest is bone; the selection hands it amber;
   a hostile marks the drop in threat red. */
.sf-woi__leader{position:absolute;top:100%;left:50%;width:12px;height:14px;margin-left:-6px;
  overflow:visible;color:var(--dp-line-hi, rgb(232 226 212 / .62));pointer-events:none}
.sf-woi__leader .sf-woi__leader-bloom{stroke:currentColor;stroke-width:4;stroke-opacity:.18;fill:none;
  vector-effect:non-scaling-stroke;stroke-linecap:round}
.sf-woi__leader .sf-woi__leader-core{stroke:currentColor;stroke-width:1.25;fill:none;
  vector-effect:non-scaling-stroke;stroke-linecap:round}
.sf-woi__leader .sf-woi__leader-anchor{fill:currentColor}
.sf-woi[data-selected="1"] .sf-woi__leader{color:var(--dp-hand, #f2b950)}
.sf-woi[data-relation="hostile"] .sf-woi__leader{color:var(--dp-danger, #ff5038)}
`;

/** A small SVG element honouring the doc, or null where SVG construction is unavailable
 *  (headless harness stubs) — callers degrade to the text/scalar presentation. */
function svgEl(doc, tag, className) {
  try {
    const node = doc.createElementNS
      ? doc.createElementNS(SVGNS, tag)
      : doc.createElement(tag);
    if (className) node.setAttribute('class', className);
    return node;
  } catch (_) {
    return null;
  }
}

export function createHoverTag(doc = globalThis.document) {
  if (!doc || !doc.head || typeof doc.createElement !== 'function') return null;
  // The dials and leader draw with the orrery library's stroke classes; injection is idempotent.
  try { injectOrrery(doc); } catch (_) { /* tag still names and places without them */ }
  if (!doc.getElementById(STYLE_ID)) {
    const style = doc.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS;
    doc.head.appendChild(style);
  }
  const el = doc.createElement('div');
  el.className = 'sf-woi';
  el.hidden = true;
  el.setAttribute('aria-hidden', 'true');
  const nameEl = doc.createElement('div');
  nameEl.className = 'sf-woi__name';
  const metaEl = doc.createElement('div');
  metaEl.className = 'sf-woi__meta';
  const hintEl = doc.createElement('div');
  hintEl.className = 'sf-woi__hint';
  const barsEl = doc.createElement('div');
  barsEl.className = 'sf-woi__bars';
  barsEl.hidden = true;
  const fills = {};
  for (const layer of ['shield', 'armor', 'hull']) {
    const bar = doc.createElement('div');
    bar.className = 'sf-woi__bar sf-woi__bar--' + layer;
    // Compact Arc Gauge mounted INTO the bar slot (the hud.js mountVitalArc idiom); the `i`
    // fill stays as the hidden scalar of the old scaleX contract and the stub-environment painter.
    const dial = svgEl(doc, 'svg', 'orr-svg sf-woi__dial');
    let gauge = null;
    if (dial) {
      dial.setAttribute('viewBox', '0 0 30 30');
      dial.setAttribute('aria-hidden', 'true');
      try {
        gauge = arcGauge({ cx: 15, cy: 15, r: 11.5, from: -135, to: 135, width: 3, tone: VITAL_TONE[layer], ghost: false, head: true });
        dial.appendChild(gauge.el);
        bar.appendChild(dial);
      } catch (_) { gauge = null; }
    }
    const fill = doc.createElement('i');
    bar.appendChild(fill);
    barsEl.appendChild(bar);
    fills[layer] = { bar, fill, gauge };
  }
  // The tag leader (kit geometry, read pointing down): a static drop from the tag's foot to the
  // point it names — the tag floats exactly 14px above its anchor, so the drop fills that gap.
  // It is built here but appended LAST, after the hint, so the pinned child order
  // (children[0] name, children[1] meta) never moves.
  let leaderEl = null;
  try {
    leaderEl = svgEl(doc, 'svg', 'sf-woi__leader');
    if (leaderEl) {
      leaderEl.setAttribute('viewBox', '0 0 12 14');
      leaderEl.setAttribute('aria-hidden', 'true');
      const bloom = svgEl(doc, 'path', 'sf-woi__leader-bloom');
      const core = svgEl(doc, 'path', 'sf-woi__leader-core');
      const anchor = svgEl(doc, 'circle', 'sf-woi__leader-anchor');
      if (bloom && core && anchor) {
        bloom.setAttribute('d', 'M6 0 L6 9.6');
        core.setAttribute('d', 'M6 0 L6 9.6');
        anchor.setAttribute('cx', '6');
        anchor.setAttribute('cy', '12');
        anchor.setAttribute('r', '1.8');
        leaderEl.appendChild(bloom);
        leaderEl.appendChild(core);
        leaderEl.appendChild(anchor);
      } else {
        leaderEl = null;
      }
    }
  } catch (_) { leaderEl = null; }
  el.appendChild(nameEl);
  el.appendChild(metaEl);
  el.appendChild(barsEl);
  el.appendChild(hintEl);
  if (leaderEl) el.appendChild(leaderEl);
  return { el, nameEl, metaEl, hintEl, barsEl, leaderEl, fills };
}

/**
 * Shield / armor / hull fractions for a damageable body, or null when it carries no hull stat.
 * A layer the body never had (max 0) is reported as null so the tag draws only what exists.
 */
export function hoverTagVitals(entity) {
  if (!entity || !(Number(entity.hullMax) > 0)) return null;
  const frac = (cur, max) => (Number(max) > 0 ? Math.min(1, Math.max(0, (Number(cur) || 0) / Number(max))) : null);
  return {
    shield: frac(entity.shield, entity.shieldMax),
    armor: frac(entity.armorHp, entity.armorMax),
    hull: frac(entity.hull, entity.hullMax),
  };
}

/** Paint vitals into a tag made by createHoverTag. Returns true when the gauges are shown. */
export function paintHoverTagVitals(tag, entity) {
  if (!tag || !tag.barsEl) return false;
  const v = hoverTagVitals(entity);
  const show = !!v;
  if (tag.barsEl.hidden === show) tag.barsEl.hidden = !show;
  if (!show) return false;
  for (const layer of ['shield', 'armor', 'hull']) {
    const slot = tag.fills[layer];
    const f = v[layer];
    const none = f == null;
    if (slot.bar.hidden !== none) slot.bar.hidden = none;
    if (none) continue;
    if (slot.gauge) slot.gauge.set(f, { instant: true });
    else slot.fill.style.transform = 'scaleX(' + f.toFixed(3) + ')';
  }
  return true;
}

export function placeHoverTag(el, x, y, viewW, viewH) {
  if (!el) return;
  const vw = Number.isFinite(viewW) && viewW > 0 ? viewW : 1024;
  const vh = Number.isFinite(viewH) && viewH > 0 ? viewH : 768;
  if (el.hidden) el.hidden = false;
  el.style.maxWidth = Math.max(96, vw - 24) + 'px';
  const fonts = (typeof document !== 'undefined' && document.fonts && document.fonts.status) || '';
  const key = el.textContent + '|' + vw + 'x' + vh + '|' + fonts + '|' + ((el.dataset && el.dataset.bars) || '');
  let size = el.__woiSize;
  if (!size || size.key !== key) {
    size = el.__woiSize = { key, w: el.offsetWidth || 0, h: el.offsetHeight || 0 };
  }
  const w = Math.min(size.w, vw - 24);
  const h = size.h;
  const halfW = Math.max(8, w / 2);
  const minX = halfW + 6;
  const maxX = Math.max(minX, vw - halfW - 6);
  const px = Math.min(Math.max(x, minX), maxX);
  const minY = h + 18;
  const maxY = Math.max(minY, vh - 8);
  const py = Math.min(Math.max(y, minY), maxY);
  el.style.left = px + 'px';
  el.style.top = py + 'px';
}
