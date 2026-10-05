// src/ui/orrery/chartHub.js — the Chart's interaction layer (owner direction 2026-10-04: the map is the
// player's whole locational hub, so it should be tight, clean and interactive, with information
// disclosed in stages by different mechanisms).
//
// One mechanism per depth of question, each the quietest thing that answers it:
//
//   - HOVER CARD   "what is this?"      dwell on a mark: who holds it, how safe it is, what it costs to
//                                       reach — before a click commits to anything;
//   - CONTEXT MENU "what can I do?"     right-click a mark or the empty chart: the verbs, with their keys;
//   - PALETTE      "take me to ..."     focus the search (or Ctrl+K): suggestions and actions when it is
//                                       empty, results as you type;
//   - TOOLBAR      "move the view"      zoom, fit, back to the ship, each with its tooltip and key;
//   - WIRE         "what is happening?" one line of the most pressing situation, opening into the full list;
//                                       a row frames its sector.
//
// All of it is the interface's own light and glass: no borders, no boxes, no pills; a vertical segment
// of light marks the chosen row, a tick in the holder's hue marks a card, pools of shade have feathered
// edges, type sits on a 4 px rhythm and never below 12 px. The chart (galaxyMap.js) owns every verb; the
// hub only asks it through the adapter and never forks behaviour.

const STYLE_ID = 'sf-orrery-chart-hub';
const C = 'html body #screens #sf-galaxymap.of-chart';
const BONE = '236 230 216';
const LABEL = 'font-family:var(--dp-face-label, "Archivo"); font-stretch:112%; font-variation-settings:"wdth" 112, "wght" 650; font-weight:650; text-transform:uppercase;';
/** a pool of shade whose edges dissolve (no border, no box) */
const FEATHER = (px = 22) => `-webkit-mask-image:linear-gradient(90deg, transparent, #000 ${px}px calc(100% - ${px}px), transparent), linear-gradient(180deg, transparent, #000 ${px}px calc(100% - ${px}px), transparent);
  -webkit-mask-composite:source-in; mask-image:linear-gradient(90deg, transparent, #000 ${px}px calc(100% - ${px}px), transparent), linear-gradient(180deg, transparent, #000 ${px}px calc(100% - ${px}px), transparent); mask-composite:intersect;`;
/** the chosen row's mark: a short vertical segment of light on its leading edge (never an underline) */
const SEG = (a = 1) => `background:linear-gradient(90deg, rgb(248 244 234 / ${a}) 0 2px, transparent 2px) 0 50% / 2px 70% no-repeat;`;

const CSS = `
/* the hub sits above the canvas and below the chrome's popovers; only its own parts take the pointer */
${C} .gmh { position:absolute; inset:0; z-index:4; pointer-events:none; }
${C} .gmh :is(button, [role="menuitem"]) { appearance:none; -webkit-appearance:none; background:none; border:0; padding:0; margin:0; font:inherit; color:inherit; text-align:left; cursor:pointer; }
${C} .gmh :focus-visible, ${C} .gmh :is(button, [role="menuitem"]):focus-visible, ${C} .gm-search-results :focus-visible { outline:none !important; outline-offset:0 !important; box-shadow:none !important; }
${C} .gmh [hidden] { display:none !important; }

/* ===== the hover card ===== */
${C} .gmh-card { position:absolute; width:256px; padding:14px 22px 14px 22px; pointer-events:none; --hue:236 230 216;
  background:rgb(6 8 12 / .93); ${FEATHER(12)} color:rgb(${BONE}); opacity:0; transform:translateY(5px) scale(.985); transform-origin:0 50%;
  transition:opacity .16s linear, transform .22s var(--dp-ease-out, cubic-bezier(.2, .8, .2, 1)); }
${C} .gmh-card.is-on { opacity:1; transform:none; }
${C} .gmh-card__tick { position:absolute; left:10px; top:16px; bottom:16px; width:2px; background:rgb(var(--hue) / .95); box-shadow:0 0 10px 1px rgb(var(--hue) / .55); }
${C} .gmh-eyebrow { ${LABEL} font-size:12px; line-height:16px; letter-spacing:.16em; color:rgb(${BONE} / .66); }
${C} .gmh-title { margin:4px 0 8px; font-family:var(--dp-face-display, "Archivo"); font-stretch:125%; font-variation-settings:"wdth" 125, "wght" 800; font-weight:800; font-size:20px; line-height:24px; letter-spacing:-.005em; color:rgb(248 244 234); overflow-wrap:anywhere; }
${C} .gmh-rows { display:grid; row-gap:4px; margin:0 0 8px; }
${C} .gmh-row { display:flex; align-items:baseline; justify-content:space-between; gap:16px; }
${C} .gmh-row > span { ${LABEL} font-size:12px; line-height:16px; letter-spacing:.14em; color:rgb(${BONE} / .62); white-space:nowrap; }
${C} .gmh-row > b { font-family:var(--dp-face-read, "Instrument Sans"); font-weight:500; font-size:14px; line-height:16px; color:var(--dp-phos, #dfeeff); text-align:right; font-variant-numeric:tabular-nums; }
${C} .gmh-row.is-hot > b { color:#ff7a68; }
${C} .gmh-row.is-warm > b { color:rgb(248 244 234); }
${C} .gmh-dot { display:inline-block; width:8px; height:8px; margin-right:8px; border-radius:50%; background:rgb(var(--hue)); box-shadow:0 0 8px 1px rgb(var(--hue) / .6); vertical-align:0; }
${C} .gmh-meter { display:inline-flex; gap:3px; vertical-align:-1px; margin-left:8px; }
${C} .gmh-meter i { width:3px; height:12px; background:rgb(${BONE} / .22); }
${C} .gmh-meter i.is-on { background:rgb(248 244 234); box-shadow:0 0 6px rgb(255 240 214 / .5); }
${C} .gmh-meter.is-hot i.is-on { background:#ff5038; box-shadow:0 0 6px rgb(255 80 56 / .6); }
${C} .gmh-hint { ${LABEL} font-size:12px; line-height:16px; letter-spacing:.1em; color:rgb(${BONE} / .6); }
${C} .gmh-hint b { font-weight:800; color:rgb(${BONE} / .92); letter-spacing:.08em; }

/* ===== the context menu ===== */
${C} .gmh-menu { position:absolute; min-width:236px; padding:14px 8px 14px 8px; pointer-events:auto; background:rgb(6 8 12 / .96); ${FEATHER(12)}
  opacity:0; transform:translateY(4px); transition:opacity .12s linear, transform .18s var(--dp-ease-out, cubic-bezier(.2, .8, .2, 1)); }
${C} .gmh-menu.is-on { opacity:1; transform:none; }
${C} .gmh-menu .gmh-eyebrow { padding:2px 16px 6px; }
${C} .gmh-sep { height:1.5px; margin:6px 16px; background:linear-gradient(90deg, rgb(${BONE} / .3), rgb(${BONE} / .04)); }
${C} .gmh-item { position:relative; display:flex; align-items:center; gap:12px; width:100%; min-height:32px; padding:4px 16px 4px 16px; ${LABEL} font-size:12px; letter-spacing:.12em; color:rgb(${BONE} / .86); transition:color .1s linear; }
${C} .gmh-item svg { flex:none; width:16px; height:16px; stroke:currentColor; fill:none; stroke-width:1.5; stroke-linecap:round; stroke-linejoin:round; opacity:.8; }
${C} .gmh-item > span:not(.gmh-key) { flex:1 1 auto; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
${C} .gmh-key { flex:none; font-size:12px; letter-spacing:.1em; color:rgb(${BONE} / .56); }
${C} .gmh-item:is(:hover, :focus-visible, .is-active) { color:rgb(255 252 244); ${SEG()} }
${C} .gmh-item:is(:hover, :focus-visible, .is-active) svg { opacity:1; }
${C} .gmh-item[aria-disabled="true"] { color:rgb(${BONE} / .42); cursor:default; background:none; }
${C} .gmh-item[aria-disabled="true"]:hover { color:rgb(${BONE} / .42); background:none; }

/* ===== the toolbar: one spine, four glyphs, a tooltip each ===== */
${C} .gmh-tools { position:absolute; right:var(--k-margin, 40px); bottom:calc(var(--gm-foot, 150px) + 18px); display:flex; flex-direction:column; align-items:center; gap:2px; padding:6px 0; pointer-events:auto; }
${C} .gmh-tools::before { content:""; position:absolute; top:0; bottom:0; left:50%; width:6px; margin-left:-3px; z-index:0; pointer-events:none;
  background:linear-gradient(90deg, transparent 2px, rgb(${BONE} / .6) 2px 4px, transparent 4px), linear-gradient(90deg, rgb(${BONE} / .26) 0 6px); }
${C} .gmh-tool { position:relative; z-index:1; display:grid; place-items:center; width:44px; height:40px; color:rgb(${BONE} / .94); }
${C} .gmh-tool::before { content:""; position:absolute; inset:-1px 6px; z-index:-1; background:radial-gradient(closest-side, rgb(5 7 10), rgb(5 7 10 / .96) 62%, rgb(5 7 10 / 0)); }
${C} .gmh-tool svg { width:24px; height:24px; stroke:currentColor; fill:none; stroke-width:1.5; stroke-linecap:round; stroke-linejoin:round; }
${C} .gmh-tool:is(:hover, :focus-visible) { color:rgb(255 252 244); }
${C} .gmh-tool:is(:hover, :focus-visible) svg { filter:drop-shadow(0 0 5px rgb(255 240 214 / .55)); }
${C} .gmh-tool[aria-disabled="true"] { color:rgb(${BONE} / .34); cursor:default; }
${C} .gmh-tool[data-tip]::after { content:attr(data-tip); position:absolute; right:calc(100% + 10px); top:50%; transform:translate(6px, -50%); white-space:nowrap; padding:6px 12px; pointer-events:none; opacity:0;
  ${LABEL} font-size:12px; letter-spacing:.12em; color:rgb(248 244 234); background:rgb(6 8 12 / .96); ${FEATHER(8)}
  transition:opacity .12s linear .35s, transform .18s var(--dp-ease-out, cubic-bezier(.2, .8, .2, 1)) .35s; }
${C} .gmh-tool[data-tip]:is(:hover, :focus-visible)::after { opacity:1; transform:translate(0, -50%); }

/* ===== the wire: what is happening ===== */
${C} .gmh-wire { position:absolute; left:50%; top:calc(var(--k-margin, 40px) + 2px); transform:translateX(-50%); width:min(440px, 34vw); pointer-events:auto; z-index:2; }
${C} .gmh-wire__bar { display:flex; align-items:center; gap:12px; width:100%; min-height:32px; padding:4px 22px; background:rgb(6 8 12 / .82); ${FEATHER(14)} ${LABEL} font-size:12px; letter-spacing:.12em; color:rgb(${BONE} / .86); }
${C} .gmh-wire__bar:is(:hover, :focus-visible) { color:rgb(255 252 244); }
${C} .gmh-lamp { flex:none; width:8px; height:8px; border-radius:50%; background:rgb(${BONE} / .7); }
${C} .gmh-wire[data-tone="war"] .gmh-lamp, ${C} .gmh-wire[data-tone="danger"] .gmh-lamp { background:#ff5038; box-shadow:0 0 10px 2px rgb(255 80 56 / .6); }
${C} .gmh-wire[data-tone="tense"] .gmh-lamp { background:rgb(248 244 234); box-shadow:0 0 10px 2px rgb(255 240 214 / .5); }
html:not(.sf-reduce-motion) ${C} .gmh-wire:is([data-tone="war"], [data-tone="danger"]) .gmh-lamp { animation:gmh-lamp 1.6s ease-in-out infinite; }
@keyframes gmh-lamp { 0%, 100% { opacity:1; } 50% { opacity:.35; } }
${C} .gmh-wire__text { flex:1 1 auto; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
${C} .gmh-wire__count { flex:none; color:rgb(${BONE} / .62); }
${C} .gmh-wire__chev { flex:none; width:12px; height:12px; stroke:currentColor; fill:none; stroke-width:1.6; stroke-linecap:round; transition:transform .2s var(--dp-ease-out, ease); }
${C} .gmh-wire.is-open .gmh-wire__chev { transform:rotate(180deg); }
${C} .gmh-wire__list { margin-top:4px; padding:12px 8px 14px; background:rgb(6 8 12 / .95); ${FEATHER(14)}; max-height:min(52vh, 420px); overflow:hidden auto; scrollbar-width:thin; scrollbar-color:rgb(${BONE} / .24) transparent; }
${C} .gmh-wire__grp { ${LABEL} font-size:12px; letter-spacing:.2em; color:rgb(${BONE} / .52); padding:8px 16px 4px; }
${C} .gmh-sit { display:grid; grid-template-columns:12px minmax(0, 1fr); column-gap:12px; align-items:start; width:100%; padding:8px 16px; }
${C} .gmh-sit i { width:8px; height:8px; margin-top:6px; border-radius:50%; background:rgb(${BONE} / .7); }
${C} .gmh-sit[data-tone="war"] i, ${C} .gmh-sit[data-tone="danger"] i { background:#ff5038; box-shadow:0 0 8px 1px rgb(255 80 56 / .55); }
${C} .gmh-sit[data-tone="tense"] i { background:rgb(248 244 234); box-shadow:0 0 8px 1px rgb(255 240 214 / .45); }
${C} .gmh-sit b { display:block; font-family:var(--dp-face-label, "Archivo"); font-stretch:100%; font-weight:650; font-size:14px; line-height:18px; color:rgb(248 244 234); }
${C} .gmh-sit small { display:block; font-family:var(--dp-face-read, "Instrument Sans"); font-size:12px; line-height:16px; color:rgb(${BONE} / .66); }
${C} .gmh-sit:is(:hover, :focus-visible) { ${SEG()} }
${C} .gmh-empty { padding:8px 16px 4px; font-family:var(--dp-face-read, "Instrument Sans"); font-size:13px; line-height:18px; color:rgb(${BONE} / .66); }

/* ===== the palette: the search, opened ===== */
${C} .gm-search-results[data-palette="1"], ${C} .gm-search-results { left:auto !important; right:0 !important; width:max(100%, 440px) !important; padding:8px 4px 12px !important; border-width:0 !important; background:rgb(6 8 12 / .96) !important; ${FEATHER(14)} max-height:min(60vh, 460px); }
${C} .gm-search-results .gmh-pal-group { ${LABEL} font-size:12px; letter-spacing:.2em; color:rgb(${BONE} / .52); padding:10px 16px 4px; }
${C} .gm-search-results .gm-search-item { position:relative; display:flex !important; align-items:baseline; justify-content:space-between; gap:16px; min-height:32px; padding:6px 16px !important; border:0 !important; box-shadow:none !important; background-image:none !important; }
${C} .gm-search-results .gm-search-item.selected { background:linear-gradient(90deg, rgb(248 244 234) 0 2px, transparent 2px) 0 50% / 2px 70% no-repeat !important; color:rgb(255 252 244); }
${C} .gm-search-results .gm-search-item:hover { background:linear-gradient(90deg, rgb(248 244 234 / .7) 0 2px, transparent 2px) 0 50% / 2px 70% no-repeat !important; }
${C} .gm-search-results .gm-search-item-name { flex:0 0 auto; max-width:60%; min-width:0; ${LABEL} font-size:13px; letter-spacing:.08em; color:rgb(248 244 234); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
${C} .gm-search-results .gm-search-item-detail { flex:0 1 55%; min-width:0; font-family:var(--dp-face-read, "Instrument Sans"); font-size:12px; text-align:right; color:rgb(${BONE} / .62); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
${C} .gm-search-results .gmh-pal-key { flex:none; ${LABEL} font-size:12px; letter-spacing:.1em; color:rgb(${BONE} / .56); }

html.sf-reduce-motion ${C} :is(.gmh-card, .gmh-menu, .gmh-tool[data-tip]::after, .gmh-wire__chev) { transition:none; }
@media (max-width:1180px) { ${C} .gmh-wire { display:none; } }
@media (forced-colors:active) { ${C} :is(.gmh-card, .gmh-menu, .gmh-wire__bar, .gmh-wire__list) { background:Canvas; mask:none; -webkit-mask:none; border:1px solid CanvasText; } }
`;

function injectHubStyle(doc) {
  if (!doc || !doc.head || typeof doc.getElementById !== 'function' || typeof doc.createElement !== 'function') return;
  if (doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  doc.head.appendChild(style);
}

// ─── Glyphs: 24 grid, 1.5 stroke, the ORRERY hand ─────────────────────────────────────────────────
const GLYPH = Object.freeze({
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  fit: 'M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5',
  ship: 'M12 3l7 17-7-4-7 4z',
  inspect: 'M12 12m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0M12 4v3M12 17v3M4 12h3M17 12h3',
  route: 'M5 19c4 0 3-6 7-6s3-8 7-8M5 19m-1.5 0a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0M19 5m-1.5 0a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0',
  frame: 'M8 4H4v4M16 4h4v4M20 16v4h-4M8 20H4v-4',
  flag: 'M6 21V4M6 4h11l-3 4 3 4H6',
  layers: 'M12 4l9 5-9 5-9-5zM3 14l9 5 9-5',
  scale: 'M4 7h16M4 12h10M4 17h5',
  step: 'M9 6l6 6-6 6',
  chev: 'M5 8l5 5 5-5',
});
const svgOf = (key, size = 16) => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true"><path d="${GLYPH[key] || GLYPH.step}"/></svg>`;
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const noop = Object.freeze({
  hover() {}, cancelHover() {}, contextMenu() { return false; }, closeAll() {}, escape() { return false; }, key() { return false; }, refresh() {}, dispose() {},
  focusPalette() {}, isOpen() { return false; },
});

/**
 * Mount the hub onto the chart's root. `adapter` is the chart's own verbs (see galaxyMap.js
 * `_hubAdapter`). Returns the hub; a headless or failed mount returns an inert one.
 */
export function mountChartHub(root, adapter, { searchInput = null, searchResults = null } = {}) {
  const doc = root && root.ownerDocument;
  if (!doc || typeof doc.createElement !== 'function' || typeof root.appendChild !== 'function' || !adapter) return noop;
  let layer;
  try {
    injectHubStyle(doc);
    layer = doc.createElement('div');
    layer.className = 'gmh';
    root.appendChild(layer);
  } catch (_) { return noop; }

  const cleanups = [];
  const on = (el, ev, fn, opts) => { if (el && typeof el.addEventListener === 'function') { el.addEventListener(ev, fn, opts); cleanups.push(() => el.removeEventListener(ev, fn, opts)); } };
  const mk = (tag, cls, html) => { const el = doc.createElement(tag); if (cls) el.className = cls; if (html != null) el.innerHTML = html; return el; };
  const rootBox = () => ({ w: root.clientWidth || 1280, h: root.clientHeight || 720 });

  // ── the hover card ──
  const card = mk('div', 'gmh-card');
  card.setAttribute('role', 'tooltip');
  card.hidden = true;
  layer.appendChild(card);
  let hoverTimer = null;
  let hoverId = null;
  let cardShown = false;
  let cardTarget = null;
  const hideCard = () => {
    if (hoverTimer) { clearTimeout(hoverTimer); hoverTimer = null; }
    hoverId = null;
    if (!cardShown) return;
    cardShown = false;
    cardTarget = null;
    card.classList.remove('is-on');
    card.hidden = true;
  };
  const showCard = (target, pt) => {
    let desc = null;
    try { desc = adapter.describe(target); } catch (_) { desc = null; }
    if (!desc) return;
    const rows = (desc.rows || []).map((r) => {
      const meter = r.meter == null ? '' : `<span class="gmh-meter${r.hot ? ' is-hot' : ''}">${[0, 1, 2, 3, 4].map((i) => `<i${i < Math.round(r.meter * 5) ? ' class="is-on"' : ''}></i>`).join('')}</span>`;
      const dot = r.swatch ? '<i class="gmh-dot"></i>' : '';
      return `<div class="gmh-row${r.hot ? ' is-hot' : r.warm ? ' is-warm' : ''}"><span>${esc(r.k)}</span><b>${dot}${esc(r.v)}${meter}</b></div>`;
    }).join('');
    card.innerHTML = `<span class="gmh-card__tick"></span><div class="gmh-eyebrow">${esc(desc.eyebrow)}</div><div class="gmh-title">${esc(desc.title)}</div>${rows ? `<div class="gmh-rows">${rows}</div>` : ''}${desc.sub ? `<div class="gmh-eyebrow" style="text-transform:none;letter-spacing:.02em;margin:0 0 8px;font-weight:500">${esc(desc.sub)}</div>` : ''}<div class="gmh-hint">${desc.hint || '<b>Click</b> inspect · <b>Double-click</b> plot'}</div>`;
    card.style.setProperty('--hue', desc.hue || '236 230 216');
    card.hidden = false;
    // seat: right of the mark, flipped left when the clear field runs out, clamped inside it
    const box = rootBox();
    const field = (adapter.field && adapter.field()) || { x: 8, y: 8, width: box.w - 16, height: box.h - 16 };
    const cw = card.offsetWidth || 280;
    const ch = card.offsetHeight || 150;
    const gap = Math.max(14, (target.radiusPx || 14) + 12);
    // four seats (right, left, below, above); take the one that covers the least of what the chart has
    // drawn (marks and their names), so the card never sits on its own mark's label
    let obstacles = [];
    try { obstacles = (adapter.obstacles && adapter.obstacles()) || []; } catch (_) { obstacles = []; }
    const seats = [
      { x: pt.x + gap, y: pt.y - ch * 0.32 },
      { x: pt.x - gap - cw, y: pt.y - ch * 0.32 },
      { x: pt.x + gap * 0.6, y: pt.y + gap * 0.7 },
      { x: pt.x + gap * 0.6, y: pt.y - gap * 0.7 - ch },
      { x: pt.x - gap * 0.6 - cw, y: pt.y + gap * 0.7 },
      { x: pt.x - gap * 0.6 - cw, y: pt.y - gap * 0.7 - ch },
      { x: pt.x - cw / 2, y: pt.y + gap },
      { x: pt.x - cw / 2, y: pt.y - gap - ch },
    ].map((seat) => {
      const sx = Math.max(8, Math.min(box.w - cw - 8, seat.x));
      const sy = Math.max(field.y, Math.min(field.y + field.height - ch, seat.y));
      let covered = 0;
      for (const o of obstacles) {
        const ox = Math.max(0, Math.min(sx + cw, o.x + o.width) - Math.max(sx, o.x));
        const oy = Math.max(0, Math.min(sy + ch, o.y + o.height) - Math.max(sy, o.y));
        covered += ox * oy;
      }
      // leaving the clear field costs a little, so a card prefers to stay over the open chart
      const outside = (sx < field.x - 4 || sx + cw > field.x + field.width + 4) ? 4000 : 0;
      return { x: sx, y: sy, cost: covered + outside };
    });
    const seat = seats.reduce((best, s) => (s.cost < best.cost ? s : best), seats[0]);
    card.style.left = `${Math.round(seat.x)}px`;
    card.style.top = `${Math.round(seat.y)}px`;
    cardShown = true;
    cardTarget = target;
    // next frame, so the transition runs
    const raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : (fn) => setTimeout(fn, 16);
    raf(() => { if (cardShown) card.classList.add('is-on'); });
  };

  // ── the context menu ──
  const menu = mk('div', 'gmh-menu');
  menu.setAttribute('role', 'menu');
  menu.hidden = true;
  layer.appendChild(menu);
  let menuItems = [];
  let menuIndex = -1;
  const closeMenu = () => {
    if (menu.hidden) return false;
    menu.classList.remove('is-on');
    menu.hidden = true;
    menuItems = [];
    menuIndex = -1;
    return true;
  };
  const setMenuIndex = (i) => {
    const btns = menu.querySelectorAll('.gmh-item');
    menuIndex = i;
    btns.forEach((b, k) => { b.classList.toggle('is-active', k === i); });
    if (btns[i] && typeof btns[i].focus === 'function') btns[i].focus({ preventScroll: true });
  };
  const stepMenu = (dir) => {
    if (!menuItems.length) return;
    let i = menuIndex;
    for (let n = 0; n < menuItems.length; n += 1) {
      i = (i + dir + menuItems.length) % menuItems.length;
      if (!menuItems[i].disabled) { setMenuIndex(i); return; }
    }
  };
  const runMenuItem = (i) => {
    const item = menuItems[i];
    if (!item || item.disabled) return;
    closeMenu();
    try { item.run(); } catch (_) { /* the verb refused; the chart explains it itself */ }
  };
  const openMenu = (clientX, clientY, target) => {
    let spec = null;
    try { spec = adapter.menuFor(target); } catch (_) { spec = null; }
    if (!spec || !spec.items || !spec.items.length) return false;
    hideCard();
    menuItems = spec.items;
    menu.innerHTML = `${spec.title ? `<div class="gmh-eyebrow">${esc(spec.title)}</div>` : ''}${menuItems.map((it, i) => `${it.sepBefore ? '<div class="gmh-sep"></div>' : ''}<button type="button" class="gmh-item" role="menuitem" data-i="${i}"${it.disabled ? ' aria-disabled="true"' : ''}${it.reason ? ` title="${esc(it.reason)}"` : ''}>${svgOf(it.glyph || 'step')}<span>${esc(it.label)}</span>${it.key ? `<span class="gmh-key">${esc(it.key)}</span>` : ''}</button>`).join('')}`;
    menu.hidden = false;
    const rect = typeof root.getBoundingClientRect === 'function' ? root.getBoundingClientRect() : { left: 0, top: 0 };
    const box = rootBox();
    const mw = menu.offsetWidth || 240;
    const mh = menu.offsetHeight || 200;
    menu.style.left = `${Math.round(Math.max(8, Math.min(box.w - mw - 8, clientX - rect.left - 8)))}px`;
    menu.style.top = `${Math.round(Math.max(8, Math.min(box.h - mh - 8, clientY - rect.top - 8)))}px`;
    const raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : (fn) => setTimeout(fn, 16);
    raf(() => { if (!menu.hidden) menu.classList.add('is-on'); });
    const first = menuItems.findIndex((it) => !it.disabled);
    setMenuIndex(first);
    return true;
  };
  on(menu, 'click', (ev) => {
    const btn = ev.target && ev.target.closest ? ev.target.closest('.gmh-item') : null;
    if (btn) runMenuItem(Number(btn.getAttribute('data-i')));
  });
  on(menu, 'pointermove', (ev) => {
    const btn = ev.target && ev.target.closest ? ev.target.closest('.gmh-item') : null;
    if (btn) setMenuIndex(Number(btn.getAttribute('data-i')));
  });
  // a press anywhere else lets the menu go
  on(doc, 'pointerdown', (ev) => {
    if (!menu.hidden && !(menu.contains && menu.contains(ev.target))) closeMenu();
    if (wireOpen && wire && !(wire.contains && wire.contains(ev.target))) setWire(false);
  }, true);

  // ── the toolbar ──
  const tools = mk('div', 'gmh-tools');
  tools.setAttribute('role', 'toolbar');
  tools.setAttribute('aria-label', 'Chart view');
  const TOOLS = [
    { id: 'zoomIn', glyph: 'plus', tip: 'Zoom in  +', label: 'Zoom in' },
    { id: 'zoomOut', glyph: 'minus', tip: 'Zoom out  −', label: 'Zoom out' },
    { id: 'fit', glyph: 'fit', tip: 'Frame ship + destination  0', label: 'Frame ship and destination' },
    { id: 'ship', glyph: 'ship', tip: 'Back to your ship', label: 'Return to ship' },
  ];
  tools.innerHTML = TOOLS.map((t) => `<button type="button" class="gmh-tool" data-tool="${t.id}" data-tip="${esc(t.tip)}" aria-label="${esc(t.label)}">${svgOf(t.glyph, 22)}</button>`).join('');
  layer.appendChild(tools);
  on(tools, 'click', (ev) => {
    const btn = ev.target && ev.target.closest ? ev.target.closest('.gmh-tool') : null;
    if (!btn || btn.getAttribute('aria-disabled') === 'true') return;
    try { adapter.tool(btn.getAttribute('data-tool')); } catch (_) { /* refused */ }
  });

  // ── the wire ──
  const wire = mk('div', 'gmh-wire');
  wire.dataset.tone = 'quiet';
  wire.innerHTML = `<button type="button" class="gmh-wire__bar" aria-expanded="false" aria-label="What is happening across charted space"><span class="gmh-lamp"></span><span class="gmh-wire__text">Reading the wire…</span><span class="gmh-wire__count"></span><svg class="gmh-wire__chev" viewBox="0 0 20 20" aria-hidden="true"><path d="${GLYPH.chev}"/></svg></button><div class="gmh-wire__list" hidden></div>`;
  layer.appendChild(wire);
  const wireBar = wire.querySelector('.gmh-wire__bar');
  const wireText = wire.querySelector('.gmh-wire__text');
  const wireCount = wire.querySelector('.gmh-wire__count');
  const wireList = wire.querySelector('.gmh-wire__list');
  let wireOpen = false;
  let wireKey = null;
  let wireRows = [];
  const setWire = (open) => {
    wireOpen = !!open;
    wire.classList.toggle('is-open', wireOpen);
    wireBar.setAttribute('aria-expanded', wireOpen ? 'true' : 'false');
    wireList.hidden = !wireOpen;
  };
  on(wireBar, 'click', () => setWire(!wireOpen));
  on(wireList, 'click', (ev) => {
    const row = ev.target && ev.target.closest ? ev.target.closest('.gmh-sit') : null;
    if (!row) return;
    const item = wireRows[Number(row.getAttribute('data-i'))];
    setWire(false);
    if (item) { try { adapter.focusSector(item.sectorId); } catch (_) { /* refused */ } }
  });
  const GROUP = { war: 'Fronts at war', tense: 'Tense fronts', danger: 'Danger' };
  const refreshWire = () => {
    let list = [];
    try { list = adapter.situations() || []; } catch (_) { list = []; }
    const key = list.map((s) => `${s.tone}:${s.title}:${s.sub}`).join('|');
    if (key === wireKey) return;
    wireKey = key;
    wireRows = list;
    const lead = list[0];
    wire.dataset.tone = lead ? lead.tone : 'quiet';
    wireText.textContent = lead ? `${lead.label || lead.tone} · ${lead.title}` : 'Quiet · no fronts or hot sectors';
    wireCount.textContent = list.length > 1 ? `+${list.length - 1}` : '';
    if (!list.length) { wireList.innerHTML = '<div class="gmh-empty">Nothing pressing across charted space. Fronts, war and dangerous sectors appear here as they open.</div>'; return; }
    let html = '';
    let lastTone = null;
    list.forEach((s, i) => {
      if (s.tone !== lastTone) { html += `<div class="gmh-wire__grp">${esc(GROUP[s.tone] || 'Notes')}</div>`; lastTone = s.tone; }
      html += `<button type="button" class="gmh-sit" data-tone="${esc(s.tone)}" data-i="${i}"><i></i><span><b>${esc(s.title)}</b><small>${esc(s.sub)}</small></span></button>`;
    });
    wireList.innerHTML = html;
  };

  // ── the palette (the search, opened) ──
  let paletteItems = [];
  let paletteIndex = 0;
  const paletteOpen = () => !!(searchResults && searchResults.dataset && searchResults.dataset.palette === '1' && !searchResults.hidden);
  const closePalette = () => {
    if (!searchResults) return false;
    const was = paletteOpen();
    if (searchResults.dataset) delete searchResults.dataset.palette;
    if (was) { searchResults.hidden = true; searchResults.innerHTML = ''; }
    paletteItems = [];
    return was;
  };
  const markPalette = () => {
    const rows = searchResults.querySelectorAll('.gm-search-item');
    rows.forEach((r, i) => { const on1 = i === paletteIndex; r.classList.toggle('selected', on1); if (on1) r.setAttribute('aria-selected', 'true'); else r.removeAttribute('aria-selected'); });
  };
  const openPalette = () => {
    if (!searchInput || !searchResults) return;
    if (searchInput.value.trim()) return;
    let items = [];
    try { items = adapter.palette() || []; } catch (_) { items = []; }
    if (!items.length) return;
    paletteItems = items;
    paletteIndex = 0;
    let html = '';
    let group = null;
    items.forEach((it, i) => {
      if (it.group !== group) { html += `<div class="gmh-pal-group">${esc(it.group)}</div>`; group = it.group; }
      html += `<div class="gm-search-item k-row" data-pal="${i}"><span class="gm-search-item-name">${esc(it.label)}</span><span class="gm-search-item-detail">${esc(it.sub || '')}</span>${it.key ? `<span class="gmh-pal-key">${esc(it.key)}</span>` : ''}</div>`;
    });
    searchResults.innerHTML = html;
    searchResults.dataset.palette = '1';
    searchResults.hidden = false;
    markPalette();
  };
  const runPalette = (i) => {
    const it = paletteItems[i];
    if (!it) return;
    closePalette();
    if (searchInput && typeof searchInput.blur === 'function') searchInput.blur();
    try { it.run(); } catch (_) { /* refused */ }
  };
  if (searchInput && searchResults) {
    on(searchInput, 'focus', openPalette);
    on(searchInput, 'click', openPalette);
    // typing hands the list to the chart's own results (its handler has already painted them by now);
    // clearing the field brings the suggestions back
    on(searchInput, 'input', () => {
      if (searchInput.value.trim()) { if (searchResults.dataset) delete searchResults.dataset.palette; paletteItems = []; } else openPalette();
    });
    on(searchInput, 'blur', () => { setTimeout(() => { if (paletteOpen() && !(doc.activeElement === searchInput)) closePalette(); }, 160); });
    on(searchInput, 'keydown', (ev) => {
      if (!paletteOpen()) return;
      if (ev.key === 'ArrowDown') { ev.preventDefault(); paletteIndex = (paletteIndex + 1) % paletteItems.length; markPalette(); }
      else if (ev.key === 'ArrowUp') { ev.preventDefault(); paletteIndex = (paletteIndex - 1 + paletteItems.length) % paletteItems.length; markPalette(); }
      else if (ev.key === 'Enter') { ev.preventDefault(); runPalette(paletteIndex); }
    });
    on(searchResults, 'mousedown', (ev) => { if (paletteOpen()) ev.preventDefault(); });
    on(searchResults, 'click', (ev) => {
      if (!paletteOpen()) return;
      const row = ev.target && ev.target.closest ? ev.target.closest('.gm-search-item') : null;
      if (row) runPalette(Number(row.getAttribute('data-pal')));
    });
  }

  // ── the hub ──
  return {
    /** The pointer is over `target` (or nothing) at canvas point `pt`. A dwell opens the card. */
    hover(target, pt) {
      if (!target || !pt || !menu.hidden) { hideCard(); return; }
      const id = target.id == null ? `${target.kind}:${Math.round(target.sx)},${Math.round(target.sy)}` : String(target.id);
      if (id === hoverId) return;
      const wasShown = cardShown;
      hideCard();
      hoverId = id;
      // moving between marks while a card is up is instant (a tooltip never makes you wait twice)
      hoverTimer = setTimeout(() => { hoverTimer = null; if (hoverId === id) showCard(target, { x: target.sx != null ? target.sx : pt.x, y: target.sy != null ? target.sy : pt.y }); }, wasShown ? 60 : 320);
    },
    cancelHover() { hideCard(); },
    /** Right-click: a mark's verbs, or the empty chart's. */
    contextMenu(ev, target) { return openMenu(ev.clientX, ev.clientY, target); },
    closeAll() { hideCard(); closeMenu(); setWire(false); closePalette(); },
    /** First refusal on Escape: the topmost thing open lets go (the chart itself stays). */
    escape() {
      if (closeMenu()) return true;
      if (wireOpen) { setWire(false); return true; }
      if (closePalette()) { if (searchInput && typeof searchInput.blur === 'function') searchInput.blur(); return true; }
      if (cardShown) { hideCard(); return true; }
      return false;
    },
    /** Keys the open menu owns. */
    key(ev) {
      if (menu.hidden) return false;
      const k = ev.key;
      if (k === 'ArrowDown') { stepMenu(1); return true; }
      if (k === 'ArrowUp') { stepMenu(-1); return true; }
      if (k === 'Enter' || k === ' ') { runMenuItem(menuIndex); return true; }
      if (k === 'Tab') { closeMenu(); return false; }
      return false;
    },
    refresh() {
      refreshWire();
      // the wire sits in the header's second row, beside the zoom lever; the toolbar rides just above the
      // foot, wherever the foot's height has settled
      try {
        const rr = root.getBoundingClientRect();
        const lever = root.querySelector('.gm-rail');
        const words = root.querySelector('.gm-scale-buttons');
        if (lever && words) {
          const lv = lever.getBoundingClientRect();
          const wb = words.getBoundingClientRect();
          const ww = wire.offsetWidth || 440;
          const left = Math.max(rr.width / 2 - ww / 2, wb.right - rr.left + 56);
          wire.style.left = `${Math.round(left)}px`;
          wire.style.transform = 'none';
          wire.style.top = `${Math.round(lv.top - rr.top + Math.max(0, (lv.height - 32) / 2))}px`;
        }
      } catch (_) { /* headless */ }
      try {
        const apron = root.querySelector('.gm-apron');
        if (apron && typeof apron.getBoundingClientRect === 'function') {
          const foot = Math.max(0, root.getBoundingClientRect().bottom - apron.getBoundingClientRect().top);
          if (foot > 0) layer.style.setProperty('--gm-foot', `${Math.round(foot)}px`);
        }
      } catch (_) { /* headless */ }
      const state = (() => { try { return adapter.toolState && adapter.toolState(); } catch (_) { return null; } })();
      if (state) {
        tools.querySelectorAll('.gmh-tool').forEach((b) => {
          const off = state[b.getAttribute('data-tool')] === false;
          if (off) b.setAttribute('aria-disabled', 'true'); else b.removeAttribute('aria-disabled');
        });
      }
    },
    focusPalette() { if (searchInput && typeof searchInput.focus === 'function') { searchInput.focus(); if (typeof searchInput.select === 'function') searchInput.select(); } },
    isOpen() { return !menu.hidden || wireOpen || paletteOpen(); },
    dispose() {
      hideCard();
      for (const fn of cleanups.splice(0)) { try { fn(); } catch (_) { /* gone */ } }
      if (layer && layer.parentNode) layer.parentNode.removeChild(layer);
    },
  };
}
