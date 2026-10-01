const STYLE_ID = 'sf-orrery-hover-tag';

const HALO = 'text-shadow:0 0 1px rgb(3 4 7 / .95), 0 0 4px rgb(3 4 7 / .85), 0 0 10px rgb(3 4 7 / .6);';

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
.sf-woi__bars{width:132px;margin:6px auto 0;display:grid;gap:2px}
.sf-woi__bars[hidden]{display:none}
.sf-woi__bar{height:4px;background:rgb(3 4 7 / .72);box-shadow:0 0 0 1px rgb(255 255 255 / .16);overflow:hidden}
.sf-woi__bar>i{display:block;height:100%;width:100%;transform-origin:left center}
.sf-woi__bar--shield>i{background:#62d2ff}
.sf-woi__bar--armor>i{background:#ffc24d}
.sf-woi__bar--hull>i{background:#ff5a5c}
.sf-woi[data-relation="friendly"] .sf-woi__bar--hull>i{background:#7dffb0}
`;

export function createHoverTag(doc = globalThis.document) {
  if (!doc || !doc.head || typeof doc.createElement !== 'function') return null;
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
    const fill = doc.createElement('i');
    bar.appendChild(fill);
    barsEl.appendChild(bar);
    fills[layer] = { bar, fill };
  }
  el.appendChild(nameEl);
  el.appendChild(metaEl);
  el.appendChild(barsEl);
  el.appendChild(hintEl);
  return { el, nameEl, metaEl, hintEl, barsEl, fills };
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

/** Paint vitals into a tag made by createHoverTag. Returns true when the bars are shown. */
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
    if (!none) slot.fill.style.transform = 'scaleX(' + f.toFixed(3) + ')';
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
