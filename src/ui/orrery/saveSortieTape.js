// ORRERY sortie tape: the lost hull's last sortie as a black box you drag back through
// (design/frontend/ORRERY.md §4 #8 Scale, #2 the Hand; §6 Meta, Game over).
//
// A lit channel runs from the launch (0) to the loss: minute ticks under it, what happened on the
// sortie marked above it (docked, jumped, a kill, a trade, a contract; threats in red), and the kill
// itself a red blade at the far end. The amber Hand is a cursor you drag along the channel (or step
// with the arrow keys, or press to advance event by event from a controller); the stretch behind it
// fills with light, a readout under it names the moment, and the screen answers through `onScrub`
// (Game Over turns a bead round the ring's red arc and reads the time at the hub).
//
// It builds its own DOM inside `host` (one SVG and a readout), draws only on paint and resize, and
// moves only the cursor group while scrubbed. Reduced motion changes nothing here: nothing animates
// on its own. No SVG (the node tests' document): it stands down.
import { svg } from './svg.js';
import { injectOrrery } from './tokens.js';

const STYLE_ID = 'sf-orrery-sortie-tape-style';
const BONE = '236 230 216';

const CSS = `
.orr-tape { position:relative; display:block; outline:none; touch-action:none; user-select:none; cursor:ew-resize; }
.orr-tape[aria-disabled="true"] { cursor:default; }
.orr-tape__svg { position:absolute; left:0; top:0; width:100%; height:100%; overflow:visible; display:block; }
.orr-tape__legend { font-family:var(--dp-face-label, "Archivo"); font-size:calc(10.5px * var(--tape-k, 1)); font-weight:650; letter-spacing:.24em; fill:rgb(${BONE} / .72); }
.orr-tape__legend--sub { font-size:calc(10px * var(--tape-k, 1)); letter-spacing:.2em; fill:rgb(${BONE} / .56); }
.orr-tape__band { fill:rgb(${BONE} / .1); }
.orr-tape__fill { fill:rgb(${BONE} / .26); }
.orr-tape__core { fill:none; stroke:rgb(${BONE} / .72); stroke-width:2; }
.orr-tape__bloom { fill:none; stroke:rgb(${BONE} / .12); stroke-width:10; }
.orr-tape__minor { fill:none; stroke:rgb(${BONE} / .38); stroke-width:1.3; }
.orr-tape__major { fill:none; stroke:rgb(${BONE} / .72); stroke-width:2; }
.orr-tape__time { font-family:var(--dp-face-numeral, "Archivo"); font-size:calc(11px * var(--tape-k, 1)); font-weight:560; letter-spacing:.06em; fill:rgb(${BONE} / .7); }
.orr-tape__mark { fill:none; stroke:rgb(${BONE} / .7); stroke-width:2; stroke-linecap:round; }
.orr-tape__dot { fill:rgb(${BONE} / .9); }
.orr-tape__label { font-family:var(--dp-face-label, "Archivo"); font-size:calc(10.5px * var(--tape-k, 1)); font-weight:650; letter-spacing:.14em; fill:rgb(${BONE} / .82);
  paint-order:stroke; stroke:rgb(4 5 8 / .9); stroke-width:4px; stroke-linejoin:round; }
.orr-tape__mark--threat { stroke:var(--dp-danger, #ff5038); }
.orr-tape__dot--threat { fill:var(--dp-danger, #ff5038); }
.orr-tape__label--threat { fill:var(--dp-danger-hot, #ff7a5c); }
.orr-tape__kill { fill:none; stroke:var(--dp-danger, #ff5038); stroke-width:3.4; stroke-linecap:round; }
.orr-tape__kill-bloom { fill:none; stroke:rgb(255 80 56 / .3); stroke-width:14; stroke-linecap:round; }
.orr-tape__kill-word { font-family:var(--dp-face-label, "Archivo"); font-size:calc(10.5px * var(--tape-k, 1)); font-weight:700; letter-spacing:.24em; fill:var(--dp-danger-hot, #ff7a5c); }
.orr-tape__hand-needle { fill:none; stroke:var(--dp-hand, #f2b950); stroke-width:2.4; stroke-linecap:round; }
.orr-tape__hand-bloom { fill:none; stroke:rgb(242 185 80 / .26); stroke-width:10; stroke-linecap:round; }
.orr-tape__hand-bead { fill:var(--dp-hand-hot, #ffd98c); }
.orr-tape__hand-glow { fill:rgb(255 217 140 / .22); }
.orr-tape:focus-visible .orr-tape__hand-glow, .orr-tape.is-scrubbing .orr-tape__hand-glow { fill:rgb(255 217 140 / .4); }
.orr-tape__read { position:absolute; top:0; left:0; transform:translateX(-50%); white-space:nowrap; pointer-events:none;
  display:flex; align-items:baseline; gap:12px; }
.orr-tape__read-t { font-family:var(--dp-face-numeral, "Archivo"); font-weight:300; font-size:calc(22px * var(--tape-k, 1)); line-height:1; letter-spacing:-.01em; color:var(--dp-phos, rgb(223 238 255));
  font-variant-numeric:tabular-nums; }
.orr-tape__read-w { font-family:var(--dp-face-label, "Archivo"); font-stretch:112%; font-weight:650; font-size:calc(11px * var(--tape-k, 1)); letter-spacing:.16em; text-transform:uppercase; color:rgb(${BONE} / .82); }
.orr-tape__read-w.is-threat { color:var(--dp-danger-hot, #ff7a5c); }
.orr-tape__empty { font-family:var(--dp-face-label, "Archivo"); font-size:calc(10.5px * var(--tape-k, 1)); font-weight:650; letter-spacing:.24em; fill:rgb(${BONE} / .62); }
@media (forced-colors: active) { .orr-tape__svg { forced-color-adjust:auto; } }
`;

function injectStyle(doc) {
  if (!doc || !doc.head || doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  doc.head.appendChild(style);
}

const f = (n) => Math.round(n * 10) / 10;

/** "21m 0s", "1h 4m", "45s" -- the screen's own duration voice. */
export function fmtSortieTime(s) {
  const t = Math.max(0, Math.floor(Number(s) || 0));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const sec = t % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${String(sec).padStart(2, '0')}s`;
  return `${sec}s`;
}

const INERT = Object.freeze({ paint() {}, set() {}, layout() {}, dispose() {} });

/**
 * @param {object} o
 * @param {HTMLElement} o.host  an empty box the tape fills (its height is the sheet's)
 * @param {(t: number, event: object|null, atEnd: boolean) => void} [o.onScrub]
 * @returns {{ paint(model: {lengthS:number|null, events:Array<{t:number,label:string,threat?:boolean}>, killLabel?:string}): void, set(t:number): void, layout(): void, dispose(): void }}
 */
export function createSortieTape({ host, onScrub = null } = {}) {
  const doc = (host && host.ownerDocument) || globalThis.document;
  if (!host || !doc || typeof doc.createElementNS !== 'function' || typeof host.getBoundingClientRect !== 'function') return INERT;
  injectOrrery(doc);
  injectStyle(doc);
  host.classList.add('orr-tape');
  host.setAttribute('role', 'slider');
  host.setAttribute('aria-label', 'Last sortie: drag back through it');
  host.tabIndex = 0;
  const layer = svg('svg', { class: 'orr-svg orr-tape__svg', 'aria-hidden': 'true', focusable: 'false' });
  const staticG = svg('g');
  const fillRect = svg('rect', { class: 'orr-tape__fill', x: 0, y: 0, width: 0, height: 0 });
  const handG = svg('g');
  layer.append(fillRect, staticG, handG);
  const read = doc.createElement('div');
  read.className = 'orr-tape__read';
  read.setAttribute('aria-hidden', 'true');
  const readT = doc.createElement('span');
  readT.className = 'orr-tape__read-t';
  const readW = doc.createElement('span');
  readW.className = 'orr-tape__read-w';
  read.append(readT, readW);
  host.append(layer, read);

  let model = { lengthS: null, events: [], killLabel: '' };
  let geo = null;
  let cursor = 0;
  let geoK = 1;

  const empty = () => !(model.lengthS > 0);

  function x(t) { return geo ? geo.x0 + (geo.x1 - geo.x0) * Math.max(0, Math.min(1, t / model.lengthS)) : 0; }
  function tAt(px) { return geo ? Math.max(0, Math.min(model.lengthS, ((px - geo.x0) / (geo.x1 - geo.x0)) * model.lengthS)) : 0; }

  function draw() {
    staticG.textContent = '';
    handG.textContent = '';
    const r = host.getBoundingClientRect();
    const W = r.width;
    const H = r.height;
    if (!(W > 0) || !(H > 0)) { geo = null; return; }
    layer.setAttribute('viewBox', `0 0 ${f(W)} ${f(H)}`);
    // rows (px): event labels, band, ticks and times, the readout under the cursor
    const legendW = Math.min(170, Math.max(120, W * 0.09));
    const x0 = legendW;
    const x1 = W - 34;
    const bandTop = Math.round(H * 0.4);
    const k = Math.max(1, Math.min(1.45, H / 150));
    if (host.style && typeof host.style.setProperty === 'function') host.style.setProperty('--tape-k', k.toFixed(3));
    geoK = k;
    const bandH = Math.round(14 * k);
    const bandBot = bandTop + bandH;
    geo = { W, H, x0, x1, bandTop, bandBot };
    staticG.append(
      Object.assign(svg('text', { x: 0, y: bandTop + 4, class: 'orr-tape__legend' }), { textContent: 'LAST SORTIE' }),
      Object.assign(svg('text', { x: 0, y: bandTop + 20, class: 'orr-tape__legend orr-tape__legend--sub' }), { textContent: 'BLACK BOX' }),
    );
    // the channel: a lit band with a core under it and a bloom
    staticG.appendChild(svg('rect', { class: 'orr-tape__band', x: f(x0), y: bandTop, width: f(x1 - x0), height: bandH }));
    staticG.appendChild(svg('path', { class: 'orr-tape__bloom', d: `M ${f(x0)} ${bandBot} L ${f(x1)} ${bandBot}` }));
    staticG.appendChild(svg('path', { class: 'orr-tape__core', d: `M ${f(x0)} ${bandBot} L ${f(x1)} ${bandBot}` }));
    if (empty()) {
      staticG.appendChild(Object.assign(svg('text', { x: f((x0 + x1) / 2), y: bandTop - 12, 'text-anchor': 'middle', class: 'orr-tape__empty' }),
        { textContent: 'NO FLIGHT RECORD FOR THIS SORTIE' }));
      fillRect.setAttribute('width', 0);
      read.hidden = true;
      host.setAttribute('aria-disabled', 'true');
      host.setAttribute('aria-valuetext', 'No flight record');
      return;
    }
    host.removeAttribute('aria-disabled');
    read.hidden = false;
    // ticks: a major every minute that leaves ~70px between labels, minors between
    const L = model.lengthS;
    const steps = [10, 30, 60, 120, 300, 600, 900, 1800, 3600];
    const px = (x1 - x0) / L;
    const major = steps.find((s) => s * px >= 104 * k) || steps[steps.length - 1];
    // a tick's time in the scale's own voice: whole minutes read "13m"
    const tickTime = (t) => (t % 60 === 0 && t >= 60 ? (t >= 3600 ? fmtSortieTime(t) : `${Math.round(t / 60)}m`) : fmtSortieTime(t));
    const minor = major / (major >= 60 ? 6 : 5);
    // the kill's word stands under the channel's far end, in the time row
    const killW = ((`LOST · ${fmtSortieTime(L)}`).length * 7.6 + 12) * k;
    const minD = [];
    const majD = [];
    for (let t = 0; t <= L + 1e-6; t += minor) {
      const isMajor = Math.abs(t / major - Math.round(t / major)) < 1e-6;
      const xx = f(x(t));
      if (isMajor) majD.push(`M ${xx} ${bandBot} L ${xx} ${bandBot + 11 * k}`);
      else minD.push(`M ${xx} ${bandBot} L ${xx} ${bandBot + 5 * k}`);
      if (isMajor && x1 - x(t) > killW + 14 && (t === 0 || x(t) - x0 > 96 * k)) {
        staticG.appendChild(Object.assign(svg('text', { x: xx, y: f(bandBot + 26 * k), 'text-anchor': t === 0 ? 'start' : 'middle', class: 'orr-tape__time' }),
          { textContent: t === 0 ? 'LAUNCH' : tickTime(t) }));
      }
    }
    staticG.appendChild(svg('path', { class: 'orr-tape__minor', d: minD.join(' ') }));
    staticG.appendChild(svg('path', { class: 'orr-tape__major', d: majD.join(' ') }));
    // what happened on the sortie: a mark above the channel, its word placed where it has room
    // each word takes the lowest row where it touches no word and no taller mark runs through it,
    // and where its own mark runs through no word below it
    const rows = [[], []];
    const marks = [];
    const placed = [];
    for (const ev of model.events) {
      const xx = x(ev.t);
      if (x1 - xx < 40) continue; // the kill owns the far end
      const w = (String(ev.label).length * 7.4 + 8) * k;
      const lo = xx - w / 2;
      const hi = xx + w / 2;
      let row = -1;
      for (let r = 0; r < rows.length && row < 0; r += 1) {
        const clearWords = rows[r].every(([p, q]) => hi < p - 10 || lo > q + 10);
        const clearMarks = marks.every((m) => m.row <= r || m.x < lo - 4 || m.x > hi + 4);
        let clearBelow = true;
        for (let j = 0; j < r; j += 1) if (rows[j].some(([p, q]) => xx > p - 4 && xx < q + 4)) clearBelow = false;
        if (clearWords && clearMarks && clearBelow) row = r;
      }
      marks.push({ x: xx, row });
      const top = row < 0 ? bandTop - 8 : f(bandTop - 22 * k - row * 16 * k);
      staticG.appendChild(svg('path', { class: `orr-tape__mark${ev.threat ? ' orr-tape__mark--threat' : ''}`, d: `M ${f(xx)} ${top + 4} L ${f(xx)} ${bandTop + bandH / 2}` }));
      staticG.appendChild(svg('circle', { class: `orr-tape__dot${ev.threat ? ' orr-tape__dot--threat' : ''}`, cx: f(xx), cy: bandTop + bandH / 2, r: 3.2 }));
      if (row >= 0) {
        rows[row].push([xx - w / 2, xx + w / 2]);
        placed.push(ev);
        staticG.appendChild(Object.assign(svg('text', { x: f(xx), y: top, 'text-anchor': 'middle', class: `orr-tape__label${ev.threat ? ' orr-tape__label--threat' : ''}` }),
          { textContent: String(ev.label).toUpperCase() }));
      }
    }
    // the kill: a red blade across the channel at the far end, its word over it
    const kx = f(x1);
    staticG.appendChild(svg('path', { class: 'orr-tape__kill-bloom', d: `M ${kx} ${bandTop - 14} L ${kx} ${bandBot + 12}` }));
    staticG.appendChild(svg('path', { class: 'orr-tape__kill', d: `M ${kx} ${bandTop - 14} L ${kx} ${bandBot + 12}` }));
    staticG.appendChild(Object.assign(svg('text', { x: kx, y: f(bandBot + 26 * k), 'text-anchor': 'end', class: 'orr-tape__kill-word' }),
      { textContent: `LOST · ${fmtSortieTime(L)}` }));
    // the Hand
    handG.appendChild(svg('path', { class: 'orr-tape__hand-bloom', d: `M 0 ${bandTop - 12} L 0 ${bandBot + 18}` }));
    handG.appendChild(svg('path', { class: 'orr-tape__hand-needle', d: `M 0 ${bandTop - 12} L 0 ${bandBot + 18}` }));
    handG.appendChild(svg('circle', { class: 'orr-tape__hand-glow', cx: 0, cy: bandTop + bandH / 2, r: 12 }));
    const cyb = bandTop + bandH / 2;
    handG.appendChild(svg('path', { class: 'orr-tape__hand-bead', d: `M 0 ${cyb - 7} L 7 ${cyb} L 0 ${cyb + 7} L -7 ${cyb} Z` }));
    fillRect.setAttribute('y', bandTop);
    fillRect.setAttribute('height', bandH);
    fillRect.setAttribute('x', f(x0));
    place(false);
  }

  /** The event the cursor sits on (within 1.2% of the tape), else null. */
  function eventAt(t) {
    const span = model.lengthS * 0.012;
    let best = null;
    let bestD = Infinity;
    for (const ev of model.events) {
      const d = Math.abs(ev.t - t);
      if (d <= span && d < bestD) { best = ev; bestD = d; }
    }
    return best;
  }

  function place(notify = true) {
    if (!geo || empty()) return;
    const cx = x(cursor);
    handG.setAttribute('transform', `translate(${f(cx)} 0)`);
    fillRect.setAttribute('width', f(Math.max(0, cx - geo.x0)));
    const atEnd = cursor >= model.lengthS - 0.5;
    const ev = atEnd ? null : eventAt(cursor);
    readT.textContent = fmtSortieTime(cursor);
    readW.textContent = atEnd ? (model.killLabel || 'The loss') : ev ? ev.label : '';
    readW.classList.toggle('is-threat', atEnd || !!(ev && ev.threat));
    read.style.top = `${f(geo.bandBot + 36 * geoK)}px`;
    // the readout rides the cursor, held inside the tape
    const rw = read.offsetWidth || 0;
    const half = rw / 2;
    const left = Math.max(geo.x0 + half, Math.min(geo.W - half, cx));
    read.style.left = `${f(left)}px`;
    host.setAttribute('aria-valuemin', '0');
    host.setAttribute('aria-valuemax', String(Math.round(model.lengthS)));
    host.setAttribute('aria-valuenow', String(Math.round(cursor)));
    host.setAttribute('aria-valuetext', `${fmtSortieTime(cursor)}${readW.textContent ? ', ' + readW.textContent : ''}`);
    if (notify && typeof onScrub === 'function') onScrub(cursor, ev, atEnd);
  }

  function set(t, notify = true) {
    if (empty()) return;
    cursor = Math.max(0, Math.min(model.lengthS, Number(t) || 0));
    place(notify);
  }

  // stops: the launch, every event, the loss
  const stops = () => [0, ...model.events.map((e) => e.t), model.lengthS].sort((a, b) => a - b);
  function step(dir) {
    const list = stops();
    const next = dir > 0 ? list.find((s) => s > cursor + 0.5) : [...list].reverse().find((s) => s < cursor - 0.5);
    set(next == null ? (dir > 0 ? list[0] : model.lengthS) : next);
  }

  let press = null;
  const hostX = (event) => event.clientX - host.getBoundingClientRect().left;
  const onDown = (event) => {
    if (empty() || event.button !== 0) return;
    press = { id: event.pointerId, moved: false };
    host.classList.add('is-scrubbing');
    try { host.setPointerCapture(event.pointerId); } catch (_) { /* capture is a nicety */ }
    set(tAt(hostX(event)));
  };
  const onMove = (event) => {
    if (!press || press.id !== event.pointerId) return;
    press.moved = true;
    set(tAt(hostX(event)));
  };
  const onUp = (event) => {
    if (!press || press.id !== event.pointerId) return;
    press = null;
    host.classList.remove('is-scrubbing');
    try { host.releasePointerCapture(event.pointerId); } catch (_) { /* not captured */ }
  };
  // a click with no pointer (Enter/Space on a focused tape, a controller's A) steps to the next moment
  const onClick = (event) => { if (!empty() && event.detail === 0) step(1); };
  const onKey = (event) => {
    if (empty()) return;
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') { event.preventDefault(); step(1); }
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') { event.preventDefault(); step(-1); }
    else if (event.key === 'Home') { event.preventDefault(); set(0); }
    else if (event.key === 'End') { event.preventDefault(); set(model.lengthS); }
  };
  host.addEventListener('pointerdown', onDown);
  host.addEventListener('pointermove', onMove);
  host.addEventListener('pointerup', onUp);
  host.addEventListener('pointercancel', onUp);
  host.addEventListener('click', onClick);
  host.addEventListener('keydown', onKey);
  let ro = null;
  if (typeof ResizeObserver === 'function') { ro = new ResizeObserver(() => draw()); ro.observe(host); }

  return {
    paint(next) {
      model = {
        lengthS: Number(next && next.lengthS) > 0 ? Number(next.lengthS) : null,
        events: Array.isArray(next && next.events) ? next.events.filter((e) => e && Number.isFinite(e.t)).sort((a, b) => a.t - b.t) : [],
        killLabel: (next && next.killLabel) || '',
      };
      cursor = model.lengthS || 0;
      draw();
    },
    set,
    layout: draw,
    dispose() {
      if (ro) ro.disconnect();
      host.removeEventListener('pointerdown', onDown);
      host.removeEventListener('pointermove', onMove);
      host.removeEventListener('pointerup', onUp);
      host.removeEventListener('pointercancel', onUp);
      host.removeEventListener('click', onClick);
      host.removeEventListener('keydown', onKey);
      layer.remove();
      read.remove();
    },
  };
}
