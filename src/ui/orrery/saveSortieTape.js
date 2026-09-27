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
.orr-tape__stops { position:absolute; left:0; top:0; width:100%; height:100%; pointer-events:none; }
.orr-tape__stop { all:unset; position:absolute; width:22px; height:22px; margin:-11px 0 0 -11px; pointer-events:auto; cursor:pointer; border-radius:50%; }
.orr-tape__stop:focus-visible { outline:none; box-shadow:0 0 0 1.5px rgb(255 217 140 / .75); }
.orr-tape__svg { position:absolute; left:0; top:0; width:100%; height:100%; overflow:visible; display:block; }
.orr-tape__legend { font-family:var(--dp-face-label, "Archivo"); font-size:calc(10.5px * var(--tape-k, 1)); font-weight:650; letter-spacing:.24em; fill:rgb(${BONE} / .72); }
.orr-tape__legend--sub { font-size:calc(10px * var(--tape-k, 1)); letter-spacing:.2em; fill:rgb(${BONE} / .56); }
.orr-tape__base { fill:none; stroke:rgb(${BONE} / .34); stroke-width:1.6; }
.orr-tape__played-bloom { fill:none; stroke:rgb(${BONE} / .13); stroke-linecap:round; }
.orr-tape__played-band { fill:none; stroke:rgb(${BONE} / .3); stroke-linecap:round; }
.orr-tape__played-core { fill:none; stroke:rgb(${BONE} / .78); stroke-width:2.2; stroke-linecap:round; }
.orr-tape__minor { fill:none; stroke:rgb(${BONE} / .38); stroke-width:1.3; }
.orr-tape__major { fill:none; stroke:rgb(${BONE} / .72); stroke-width:2; }
.orr-tape__time { font-family:var(--dp-face-numeral, "Archivo"); font-size:calc(11px * var(--tape-k, 1)); font-weight:560; letter-spacing:.06em; fill:rgb(${BONE} / .7); }
.orr-tape__mark { fill:none; stroke:rgb(${BONE} / .7); stroke-width:2; stroke-linecap:round; }
.orr-tape__dot { fill:rgb(${BONE} / .9); }
.orr-tape__label { font-family:var(--dp-face-label, "Archivo"); font-size:calc(10.5px * var(--tape-k, 1)); font-weight:650; letter-spacing:.14em; fill:rgb(${BONE} / .82);
  paint-order:stroke; stroke:rgb(4 5 8 / .9); stroke-width:4px; stroke-linejoin:round; }
.orr-tape__label.is-at { fill:rgb(250 247 240); }
.orr-tape__label--threat.is-at { fill:#ff9a82; }
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
.orr-tape:focus-within .orr-tape__hand-glow, .orr-tape.is-scrubbing .orr-tape__hand-glow { fill:rgb(255 217 140 / .4); }
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
  if (m > 0) return `${m}m ${sec}s`;
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
  // the tape is a group of stops (the launch, each moment, the loss): a keyboard walks them with the
  // arrows, a controller's d-pad with the shared spatial move, a pointer drags anywhere along it
  host.setAttribute('role', 'group');
  host.setAttribute('aria-label', 'Last sortie: step or drag back through it');
  const stopsLayer = doc.createElement('div');
  stopsLayer.className = 'orr-tape__stops';
  let stopEls = [];
  const layer = svg('svg', { class: 'orr-svg orr-tape__svg', 'aria-hidden': 'true', focusable: 'false' });
  const staticG = svg('g');
  const playedG = svg('g');
  const playedBloom = svg('path', { class: 'orr-tape__played-bloom', d: 'M 0 0' });
  const playedBand = svg('path', { class: 'orr-tape__played-band', d: 'M 0 0' });
  const playedCore = svg('path', { class: 'orr-tape__played-core', d: 'M 0 0' });
  playedG.append(playedBloom, playedBand, playedCore);
  const handG = svg('g');
  layer.append(staticG, playedG, handG);
  const read = doc.createElement('div');
  read.className = 'orr-tape__read';
  read.setAttribute('aria-hidden', 'true');
  const readW = doc.createElement('span');
  readW.className = 'orr-tape__read-w';
  read.append(readW);
  host.append(layer, read, stopsLayer);

  let model = { lengthS: null, events: [], killLabel: '' };
  let geo = null;
  let cursor = 0;
  /** each event's word above the channel, where it had room */
  const labelFor = new Map();
  let litLabel = null;
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
    const mid = bandTop + bandH / 2;
    geo = { W, H, x0, x1, bandTop, bandBot, mid, k };
    staticG.append(
      Object.assign(svg('text', { x: 0, y: bandTop + 4, class: 'orr-tape__legend' }), { textContent: 'LAST SORTIE' }),
      Object.assign(svg('text', { x: 0, y: bandTop + 20, class: 'orr-tape__legend orr-tape__legend--sub' }), { textContent: 'BLACK BOX' }),
    );
    // the ruler: a baseline the length of the sortie; the played length is drawn over it as light
    staticG.appendChild(svg('path', { class: 'orr-tape__base', d: `M ${f(x0)} ${f(mid)} L ${f(x1)} ${f(mid)}` }));
    playedBloom.setAttribute('stroke-width', f(14 * k));
    playedBand.setAttribute('stroke-width', f(6 * k));
    if (empty()) {
      for (const p of [playedBloom, playedBand, playedCore]) p.setAttribute('d', 'M 0 0');
      staticG.appendChild(Object.assign(svg('text', { x: f((x0 + x1) / 2), y: bandTop - 12, 'text-anchor': 'middle', class: 'orr-tape__empty' }),
        { textContent: 'NO FLIGHT RECORD FOR THIS SORTIE' }));
      read.hidden = true;
      host.setAttribute('aria-disabled', 'true');
      stopsLayer.textContent = '';
      stopEls = [];
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
      if (isMajor) majD.push(`M ${xx} ${f(mid)} L ${xx} ${f(bandBot + 11 * k)}`);
      else minD.push(`M ${xx} ${f(mid)} L ${xx} ${f(mid + 7 * k)}`);
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
    labelFor.clear();
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
        const word = Object.assign(svg('text', { x: f(xx), y: top, 'text-anchor': 'middle', class: `orr-tape__label${ev.threat ? ' orr-tape__label--threat' : ''}` }),
          { textContent: String(ev.label).toUpperCase() });
        labelFor.set(ev, word);
        staticG.appendChild(word);
      }
    }
    // the kill: a red blade across the channel at the far end, its word over it
    const kx = f(x1);
    staticG.appendChild(svg('path', { class: 'orr-tape__kill-bloom', d: `M ${kx} ${bandTop - 14} L ${kx} ${bandBot + 12}` }));
    staticG.appendChild(svg('path', { class: 'orr-tape__kill', d: `M ${kx} ${bandTop - 14} L ${kx} ${bandBot + 12}` }));
    staticG.appendChild(Object.assign(svg('text', { x: kx, y: f(bandBot + 26 * k), 'text-anchor': 'end', class: 'orr-tape__kill-word' }),
      { textContent: `LOST · ${fmtSortieTime(L)}` }));
    // the Hand
    // the needle stops above the time row (it never touches LOST or a minute's word)
    const needleBot = f(mid + 10 * k);
    handG.appendChild(svg('path', { class: 'orr-tape__hand-bloom', d: `M 0 ${bandTop - 12} L 0 ${needleBot}` }));
    handG.appendChild(svg('path', { class: 'orr-tape__hand-needle', d: `M 0 ${bandTop - 12} L 0 ${needleBot}` }));
    handG.appendChild(svg('circle', { class: 'orr-tape__hand-glow', cx: 0, cy: bandTop + bandH / 2, r: 12 }));
    const cyb = bandTop + bandH / 2;
    handG.appendChild(svg('path', { class: 'orr-tape__hand-bead', d: `M 0 ${cyb - 7} L 7 ${cyb} L 0 ${cyb + 7} L -7 ${cyb} Z` }));
    buildStops();
    place(false);
  }

  /** One button per stop, seated on the channel at its moment. */
  function buildStops() {
    stopsLayer.textContent = '';
    stopEls = stops().map((t) => {
      const b = doc.createElement('button');
      b.type = 'button';
      b.className = 'orr-tape__stop';
      b.tabIndex = -1;
      b.style.left = `${f(t >= model.lengthS - 0.5 ? geo.x1 - 22 * geo.k : x(t))}px`;
      b.style.top = `${f(geo.mid)}px`;
      const ev = model.events.find((e) => e.t === t);
      const word = t >= model.lengthS - 0.5 ? (model.killLabel || 'the loss') : t === 0 ? 'launch' : ev ? ev.label : '';
      b.setAttribute('aria-label', `${fmtSortieTime(t)}${word ? ', ' + word : ''}`);
      b.__t = t;
      b.addEventListener('focus', () => { if (Math.abs(cursor - t) > 0.01) set(t); });
      b.addEventListener('click', () => { if (Math.abs(cursor - t) > 0.01) set(t); });
      stopsLayer.appendChild(b);
      return b;
    });
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
    const atEnd = cursor >= model.lengthS - 0.5;
    const cx = Math.min(x(cursor), geo.x1 - 22 * geo.k);
    handG.setAttribute('transform', `translate(${f(cx)} 0)`);
    const played = cx - geo.x0 > 2 ? `M ${f(geo.x0)} ${f(geo.mid)} L ${f(cx)} ${f(geo.mid)}` : 'M 0 0';
    for (const p of [playedBloom, playedBand, playedCore]) p.setAttribute('d', played);
    const ev = atEnd ? null : eventAt(cursor);
    // the moment's word shows once: its own word above the channel lights up; only a moment whose word
    // had no room there is named under the Hand
    const above = ev ? labelFor.get(ev) : null;
    if (litLabel && litLabel !== above) litLabel.classList.remove('is-at');
    if (above) above.classList.add('is-at');
    litLabel = above || null;
    readW.textContent = ev && !above ? ev.label : '';
    read.hidden = !(ev && !above);
    readW.classList.toggle('is-threat', !!(ev && ev.threat));
    read.style.top = `${f(geo.bandBot + 32 * geoK)}px`;
    // the readout rides the cursor, held inside the tape
    const rw = read.offsetWidth || 0;
    const half = rw / 2;
    const left = Math.max(geo.x0 + half, Math.min(geo.W - half, cx));
    read.style.left = `${f(left)}px`;
    // roving: the stop at (or just behind) the Hand is the one Tab lands on
    let current = stopEls[0] || null;
    for (const b of stopEls) if (b.__t <= cursor + 0.5) current = b;
    for (const b of stopEls) b.tabIndex = b === current ? 0 : -1;
    if (notify && typeof onScrub === 'function') onScrub(cursor, ev, atEnd);
  }

  function set(t, notify = true) {
    if (empty()) return;
    cursor = Math.max(0, Math.min(model.lengthS, Number(t) || 0));
    place(notify);
  }

  // stops: the launch, every event, the loss
  const stops = () => [0, ...model.events.map((e) => e.t), model.lengthS].sort((a, b) => a - b);
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
  // the arrows walk the stops (focus follows, so the Hand and the ring follow)
  const onClick = () => {};
  const focusStop = (i) => { const b = stopEls[Math.max(0, Math.min(stopEls.length - 1, i))]; if (b) b.focus(); };
  const onKey = (event) => {
    if (empty()) return;
    const at = stopEls.indexOf(doc.activeElement);
    if (at < 0) return;
    if (event.key === 'ArrowRight') { event.preventDefault(); focusStop(at + 1); }
    else if (event.key === 'ArrowLeft') { event.preventDefault(); focusStop(at - 1); }
    else if (event.key === 'Home') { event.preventDefault(); focusStop(0); }
    else if (event.key === 'End') { event.preventDefault(); focusStop(stopEls.length - 1); }
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
      stopsLayer.remove();
    },
  };
}
