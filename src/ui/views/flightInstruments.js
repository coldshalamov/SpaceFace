// Owned flight presentation. The ACTIVE hull is drawn from the canonical silhouette table.
// Kit gauges/radar are assembled here; no simulation state, event subscriptions or frame loops live here.
import { SHIP_SILHOUETTES } from '../../data/shipSilhouettes.js';
import { escapeMarkup } from './identity.js';

export const KIT_BAR_SEGS = 10;
export const KIT_GAUGE_MIN_DEG = -110;
export const KIT_GAUGE_SPAN_DEG = 220;

export function hullMarkSvg(cls, defId) {
  const body = SHIP_SILHOUETTES[defId] || SHIP_SILHOUETTES.ship_kestrel;
  return `<svg class="sf-sch-ship ${escapeMarkup(cls)}" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" preserveAspectRatio="xMidYMid meet"><g class="sf-sch-hull">${body}</g></svg>`;
}
export function shipConditionMarkup(defId) {
  return '<svg class="sf-sch-ring" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
    '<circle class="sf-sch-track" cx="50" cy="50" r="46"/>' +
    '<circle class="sf-sch-shield" cx="50" cy="50" r="46" transform="rotate(-90 50 50)"/></svg>' +
    '<div class="sf-sch-ship-wrap">' + hullMarkSvg('sf-sch-ship--empty', defId) +
    '<div class="sf-sch-ship-fill-crop">' + hullMarkSvg('sf-sch-ship--fill', defId) +
    '</div><div class="sf-sch-fill-line"></div></div>';
}

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

export function speedGaugeMarkup() {
  return '<div class="sf-kit-gauge sf-stat--info" role="meter" aria-label="Speed" aria-valuemin="0" aria-valuemax="1" aria-valuenow="0">' +
    '<div class="sf-kit-gauge__arc" aria-hidden="true"></div>' +
    '<svg class="sf-kit-gauge__needle" viewBox="-12 -80 24 100" aria-hidden="true" focusable="false">' +
      '<path fill="currentColor" d="M-3.2,0 L-1.1,-74 L1.1,-74 L3.2,0 Z"/>' +
      '<circle cx="0" cy="0" r="6.2" fill="currentColor"/>' +
      '<circle class="sf-kit-gauge__hub" cx="0" cy="0" r="2.4"/>' +
    '</svg>' +
    '<div class="sf-kit-gauge__face">' +
      '<span class="sf-kit-gauge__num mono" data-k="speed">0</span>' +
    '</div>' +
    '<div class="sf-tip" data-tip="speed"></div>' +
  '</div>';
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
  const segs = barEl.querySelectorAll('.sf-kit-seg');
  if (!segs.length) return;
  const n = segs.length;
  const t = Number(frac);
  const bounded = Number.isFinite(t) ? (t < 0 ? 0 : t > 1 ? 1 : t) : 0;
  const on = Math.round(bounded * n);
  const tone = kind === 'hot' || kind === 'cold' ? kind : 'on';
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

export function setKitGauge(el, value, max) {
  if (!el) return;
  const vmax = Number(max) > 0 ? Number(max) : 1;
  const raw = Number(value);
  const speed = Number.isFinite(raw) ? (raw < 0 ? 0 : raw) : 0;
  const t = speed / vmax;
  const bounded = t < 0 ? 0 : t > 1 ? 1 : t;
  const deg = KIT_GAUGE_MIN_DEG + bounded * KIT_GAUGE_SPAN_DEG;
  const degKey = Math.round(deg * 10);
  const valKey = Math.round(speed);
  if (el._sfGaugeDeg === degKey && el._sfGaugeVal === valKey && el._sfGaugeMax === vmax) return;
  el._sfGaugeDeg = degKey;
  el._sfGaugeVal = valKey;
  el._sfGaugeMax = vmax;
  const degText = deg.toFixed(1) + 'deg';
  const arcText = (bounded * KIT_GAUGE_SPAN_DEG).toFixed(1) + 'deg';
  if (el.style && typeof el.style.setProperty === 'function') {
    el.style.setProperty('--sf-gauge-deg', degText);
    el.style.setProperty('--sf-gauge-arc', arcText);
  }
  const needle = el.querySelector('.sf-kit-gauge__needle');
  if (needle && needle.style && needle.style.transform !== `rotate(${degText})`) {
    needle.style.transform = `rotate(${degText})`;
  }
  const now = String(valKey);
  const maxText = String(Math.round(vmax));
  if (el.getAttribute('aria-valuenow') !== now) el.setAttribute('aria-valuenow', now);
  if (el.getAttribute('aria-valuemax') !== maxText) el.setAttribute('aria-valuemax', maxText);
}
