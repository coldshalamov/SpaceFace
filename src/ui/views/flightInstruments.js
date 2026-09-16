// Owned flight presentation. The ACTIVE hull is drawn from the canonical silhouette table.
// Kit gauges/radar are assembled here; no simulation state, event subscriptions or frame loops live here.
import { SHIP_SILHOUETTES } from '../../data/shipSilhouettes.js';
import { escapeMarkup } from './identity.js';
export { speedGaugeMarkup, setKitGauge } from './velocityRail.js';

export const KIT_BAR_SEGS = 10;

export function hullMarkSvg(cls, defId) {
  const body = SHIP_SILHOUETTES[defId] || SHIP_SILHOUETTES.ship_kestrel;
  return `<svg class="sf-sch-ship ${escapeMarkup(cls)}" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" preserveAspectRatio="xMidYMid meet"><g class="sf-sch-hull">${body}</g></svg>`;
}
export { shipConditionMarkup, updateShipCondition } from './hullIntegrity.js';

function kitSegs() {
  let html = '';
  for (let i = 0; i < KIT_BAR_SEGS; i++) html += '<span class="sf-kit-seg" aria-hidden="true"></span>';
  return html;
}

export function hudBarMarkup(label, mod) {
  const modifier = ['energy','boost','heat','fuel'].includes(mod) ? mod : 'energy';
  return `<span class="sf-barrow__label">${escapeMarkup(label)}</span>` +
    `<div class="sf-bar sf-bar--${modifier} sf-kit-bar" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">` +
      `<div class="sf-bar__fill"></div>${kitSegs()}` +
    `</div>` +
    `<span class="sf-barrow__num mono">0</span>`;
}

export function radarKitMarkup() {
  return '<div class="sf-kit-radar__bezel" aria-hidden="true"></div>' +
    '<div class="sf-kit-radar__face" aria-hidden="true"></div>' +
    '<div class="sf-kit-radar__n" aria-hidden="true"></div>';
}

export function mountRadarKit(wrap) {
  if (!wrap) return wrap;
  const already = typeof wrap.querySelector === 'function' && wrap.querySelector('.sf-kit-radar__bezel');
  if (already) return wrap;
  if (wrap.classList && typeof wrap.classList.add === 'function') wrap.classList.add('sf-kit-radar');
  const doc = wrap.ownerDocument || (typeof document !== 'undefined' ? document : null);
  if (!doc || typeof doc.createElement !== 'function') return wrap;
  for (const cls of ['sf-kit-radar__bezel', 'sf-kit-radar__face', 'sf-kit-radar__n']) {
    const layer = doc.createElement('div');
    layer.className = cls;
    layer.setAttribute('aria-hidden', 'true');
    wrap.appendChild(layer);
  }
  return wrap;
}

export function setKitBar(barEl, frac, kind) {
  if (!barEl) return;
  // Seg markup is fixed at mount (KIT_BAR_SEGS spans) — cache the NodeList so the unchanged
  // early-out never pays querySelectorAll, four bars a frame.
  let segs = barEl._sfKitSegs;
  const t = Number(frac);
  const bounded = Number.isFinite(t) ? (t < 0 ? 0 : t > 1 ? 1 : t) : 0;
  const tone = kind === 'hot' || kind === 'cold' ? kind : 'on';
  if (segs) {
    const on = Math.round(bounded * segs.length);
    if (barEl._sfKitOn === on && barEl._sfKitKind === tone) return;
  }
  if (!segs) {
    segs = barEl.querySelectorAll('.sf-kit-seg');
    if (!segs.length) return;
    barEl._sfKitSegs = segs;
  }
  const n = segs.length;
  const on = Math.round(bounded * n);
  if (barEl._sfKitOn === on && barEl._sfKitKind === tone) return;
  barEl._sfKitOn = on;
  barEl._sfKitKind = tone;
  const lit = tone === 'hot' ? 'sf-kit-seg is-on is-hot' : tone === 'cold' ? 'sf-kit-seg is-on is-cold' : 'sf-kit-seg is-on';
  for (let i = 0; i < n; i++) {
    const next = i < on ? lit : 'sf-kit-seg';
    if (segs[i].className !== next) segs[i].className = next;
  }
  const now = String(Math.round(bounded * 100));
  if (barEl.getAttribute('aria-valuenow') !== now) barEl.setAttribute('aria-valuenow', now);
}

