// src/ui/wingmanRadial.js — the wingman command radial (Micro-Loops: "surfacing them as a quick
// radial on the comms key gives the player a taste of fleet control without leaving the cockpit").
//
// A four-key dial that pops at screen-center on the fleet-command key (bindings.fleetCommand / Z),
// issues one batched ui:wingOrder intent and closes. The hub cycles ALL / a selected recipient.
// The keys are four glass arc segments seated in one machined ring; each is a real annular sector
// (clip-path), so hover and click land only on the arc a key names.
//
// Pure DOM + event listeners; reads state for the fleet + target, never mutates sim state (§0.6).
// The radial keeps the player's hands on thrust/trigger — open, pick, gone — matching the cockpit feel.

import { BINDINGS } from './bindings.js';
import { dpIcon } from './deckplate/icons.js';

const STYLE_ID = 'sf-wingman-radial-style';

// N / E / S / W wedges. `order` is the batched ui:wingOrder kind; `key` is the shortcut.
// Glyphs come from the shared drawn icon set (station/icons.js) so the radial speaks the same
// visual language as the rest of the HUD — the old ⛊/✦ Unicode marks rendered at mixed weights
// and ⛊ has no consistent cross-platform glyph.
const OPTIONS = [
  { key: '1', order: 'attack', label: 'Attack Target', icon: 'target', pos: 'top', needsTarget: true },
  { key: '2', order: 'screen', label: 'Screen', icon: 'shield', pos: 'right' },
  { key: '3', order: 'regroup', label: 'Regroup', icon: 'boost', pos: 'bottom' },
  { key: '4', order: 'hold', label: 'Hold', icon: 'clock', pos: 'left' },
];

// The dial's geometry, in its own 400-unit box (the overlay is 400px square).
const DIAL = 400;
const C = DIAL / 2;
const R_IN = 68;
const R_OUT = 150;
const HALF_SPAN = (44 * Math.PI) / 180;   // 88-degree keys, 2-degree hairline seams
const R_FACE = 110;                       // where each key's legend sits
const R_LAMP = 160;                       // the bezel lamps, one per key
const R_RECEIPT = 65;                     // the receipt word, between hub rim and key inner edge
const POS_ANGLE = { top: -Math.PI / 2, right: 0, bottom: Math.PI / 2, left: Math.PI };

function polarX(r, a) { return C + r * Math.cos(a); }
function polarY(r, a) { return C + r * Math.sin(a); }
function pt(r, a) { return `${polarX(r, a).toFixed(2)} ${polarY(r, a).toFixed(2)}`; }
function sectorPath(a) {
  const a0 = a - HALF_SPAN;
  const a1 = a + HALF_SPAN;
  return `M${pt(R_OUT, a0)}A${R_OUT} ${R_OUT} 0 0 1 ${pt(R_OUT, a1)}`
    + `L${pt(R_IN, a1)}A${R_IN} ${R_IN} 0 0 0 ${pt(R_IN, a0)}Z`;
}
// One path for the whole graticule (60 ticks, a long one at each key's bearing): one DOM node.
function graticulePath() {
  let d = '';
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * Math.PI * 2;
    d += `M${pt(i % 15 === 0 ? 166 : 170, a)}L${pt(175, a)}`;
  }
  return d;
}
const DIAL_SVG = '<svg class="sf-wradial__dial" viewBox="0 0 400 400" aria-hidden="true" focusable="false">'
  // The dial is printed (owner, 2026-09-22: no CSS or SVG imitating a material). It used to wear a
  // brushed-steel ring -- a metal gradient, a lit chamfer and a 512px brushed-texture pattern --
  // around smoked-glass wedges. Now: a flat bed, one hairline ring, flat wedges.
  + `<circle class="sf-wradial__bed" cx="${C}" cy="${C}" r="152"/>`
  + `<circle class="sf-wradial__bezel-edge" cx="${C}" cy="${C}" r="${R_LAMP}"/>`
  + `<path class="sf-wradial__graticule" d="${graticulePath()}"/>`
  + '</svg>';

export function createWingmanRadial(ctx) {
  const { bus, state } = ctx;
  injectCss();

  const root = document.getElementById('ui-root');
  const overlay = document.createElement('div');
  overlay.className = 'sf-wradial';
  overlay.id = 'sf-wingman-radial';
  overlay.setAttribute('role', 'menu');
  overlay.setAttribute('aria-label', 'Wingman commands');
  overlay.hidden = true;

  const hub = document.createElement('button');
  hub.type = 'button';
  hub.className = 'sf-wradial__hub';
  hub.setAttribute('aria-label', 'Cycle wingman command scope');
  hub.innerHTML = '<span class="sf-wradial__hub-title">ALL WINGS</span><span class="sf-wradial__hub-pips" aria-hidden="true"></span>'
    + '<span class="sf-wradial__hub-count mono">0</span><span class="sf-wradial__hub-scope mono">TAB</span>';
  overlay.insertAdjacentHTML('beforeend', DIAL_SVG);
  overlay.appendChild(hub);
  const hubTitle = hub.querySelector('.sf-wradial__hub-title');
  const hubCount = hub.querySelector('.sf-wradial__hub-count');
  const hubPips = hub.querySelector('.sf-wradial__hub-pips');
  hub.addEventListener('click', (ev) => { ev.preventDefault(); ev.stopPropagation(); cycleScope(); });

  const wedgeEls = [];
  const receiptEls = {};
  for (const opt of OPTIONS) {
    const wedge = document.createElement('button');
    wedge.type = 'button';
    wedge.className = `sf-wradial__wedge sf-wradial__wedge--${opt.pos}`;
    wedge.setAttribute('role', 'menuitem');
    wedge.setAttribute('aria-keyshortcuts', opt.key);
    const a = POS_ANGLE[opt.pos];
    const d = sectorPath(a);
    wedge.style.clipPath = `path('${d}')`;
    wedge.innerHTML =
      `<svg class="sf-wradial__seg" viewBox="0 0 400 400" aria-hidden="true" focusable="false"><path d="${d}"/></svg>` +
      `<span class="sf-wradial__face" style="left:${polarX(R_FACE, a).toFixed(1)}px;top:${polarY(R_FACE, a).toFixed(1)}px">` +
      `<span class="sf-wradial__glyph">${dpIcon(opt.icon, 24)}</span>` +
      `<span class="sf-wradial__label">${opt.label}</span>` +
      `<span class="sf-wradial__key mono" aria-hidden="true">${opt.key}</span></span>`;
    // The key's lamp is set into the bezel, outside the key's own clip, so it lives on the overlay.
    const lamp = document.createElement('span');
    lamp.className = `sf-wradial__lamp sf-wradial__lamp--${opt.pos}`;
    lamp.setAttribute('aria-hidden', 'true');
    lamp.style.left = `${polarX(R_LAMP, a).toFixed(1)}px`;
    lamp.style.top = `${polarY(R_LAMP, a).toFixed(1)}px`;
    overlay.appendChild(lamp);
    // The order receipt line (FB-138): a real node so a blocked/converted/status event can
    // write its word onto the slot the pilot picked. Appended to the overlay — the wedge's
    // clip-path would cut anything outside the arc — seated between hub rim and key inner edge.
    const receipt = document.createElement('span');
    receipt.className = 'sf-wradial__receipt mono';
    receipt.setAttribute('aria-live', 'polite');
    receipt.style.left = `${polarX(R_RECEIPT, a).toFixed(1)}px`;
    receipt.style.top = `${polarY(R_RECEIPT, a).toFixed(1)}px`;
    overlay.appendChild(receipt);
    receiptEls[opt.order] = receipt;
    wedge.addEventListener('click', (ev) => { ev.preventDefault(); ev.stopPropagation(); issue(opt); });
    overlay.appendChild(wedge);
    wedgeEls.push(wedge);
  }

  root.appendChild(overlay);

  let open = false;
  let scope = 'all';
  let selectedIndex = 0;
  let previousFocus = null;

  // ── Order receipts (FB-138) ──────────────────────────────────────────────────
  // automation.js answers ui:wingOrder with wingOrder:blocked / :converted / :status.
  // The word lands on the slot it names: a blocked order shows the refusal reason,
  // a converted one shows what it became, a partial status shows the count. A
  // receipt on the just-issued order holds the dial open to be read; one that
  // arrives with the dial closed (an attack silently degrading to regroup) flashes
  // the dial non-interactively for the same window.
  const RECEIPT_MS = 2000;
  const REASON_WORDS = {
    recipient_missing: 'NO WING',
    not_deployed: 'NOT DEPLOYED',
    target_missing: 'NO TARGET',
    target_not_hostile: 'NOT HOSTILE',
  };
  let receiptTimer = 0;      // pending end-of-receipt timeout
  let receiptFlash = false;  // overlay is up only to show a receipt (non-interactive)
  let receiptHold = false;   // dial stays open an extra beat so a receipt can be read
  let issuing = false;       // inside issue()'s synchronous emit
  let issueReceipt = false;  // a receipt landed on the order being issued

  function showReceipt(order, word) {
    const el = order != null ? receiptEls[order] : null;
    if (!el || !word) return;
    if (issuing && el.textContent) return; // the blocked reason outranks the status line
    for (const key of Object.keys(receiptEls)) if (receiptEls[key] !== el) receiptEls[key].textContent = '';
    el.textContent = word;
    if (issuing) { issueReceipt = true; return; }  // issue() decides whether to hold
    if (open) { receiptHold = true; scheduleReceiptEnd(); }
    else flashReceipt();
  }

  function flashReceipt() {
    receiptFlash = true;
    overlay.hidden = false;
    overlay.classList.remove('sf-wradial--in'); void overlay.offsetWidth;
    overlay.classList.add('sf-wradial--in', 'sf-wradial--receipt');
    scheduleReceiptEnd();
  }

  function scheduleReceiptEnd() {
    clearTimeout(receiptTimer);
    receiptTimer = setTimeout(endReceipt, RECEIPT_MS);
  }

  function endReceipt() {
    receiptTimer = 0;
    for (const el of Object.values(receiptEls)) el.textContent = '';
    if (receiptHold) { receiptHold = false; close(); }
    if (receiptFlash) {
      receiptFlash = false;
      if (open) return;                       // the pilot opened the dial mid-flash
      overlay.classList.remove('sf-wradial--in', 'sf-wradial--receipt');
      setTimeout(() => { if (!open && !receiptFlash) overlay.hidden = true; }, 160);
    }
  }

  function fleet() {
    return (state.automation && state.automation.fleet) || [];
  }

  function toggle() {
    if (open) { close(); return; }
    if (state.mode !== 'flight' || (state.ui && state.ui.docked)) return;
    const f = fleet();
    if (!f.length) {
      bus.emit('toast', { text: 'No wingmen deployed — assign a fleet at a station', kind: 'info', ttl: 2.5 });
      bus.emit('audio:cue', { id: 'ui_deny' });
      return;
    }
    openRadial(f.length);
  }

  function openRadial(count) {
    open = true;
    receiptFlash = false;
    previousFocus = document.activeElement;
    if (state.ui) state.ui.wingmanRadialOpen = true;
    selectedIndex = Math.min(selectedIndex, Math.max(0, count - 1));
    refreshScope();
    // Grey the Attack wedge when there's no target to focus.
    const hasTarget = state.player && state.player.targetId != null;
    wedgeEls[0].classList.toggle('sf-wradial__wedge--disabled', !hasTarget);
    wedgeEls[0].disabled = !hasTarget;
    wedgeEls[0].setAttribute('aria-disabled', String(!hasTarget));
    overlay.hidden = false;
    overlay.classList.remove('sf-wradial--in'); void overlay.offsetWidth;
    overlay.classList.add('sf-wradial--in');
    document.addEventListener('keydown', onKey, true);
    bus.emit('audio:cue', { id: 'ui_open' });
    focusSafely(wedgeEls.find((wedge) => !wedge.disabled) || hub);
  }

  function close() {
    if (!open) return;
    open = false;
    clearTimeout(receiptTimer);
    receiptTimer = 0;
    receiptHold = false;
    if (state.ui) state.ui.wingmanRadialOpen = false;
    overlay.classList.remove('sf-wradial--in');
    document.removeEventListener('keydown', onKey, true);
    const restore = previousFocus;
    previousFocus = null;
    if (restore && restore.isConnected !== false && !restore.disabled) focusSafely(restore);
    // let the fade-out play before hiding
    setTimeout(() => { if (!open) overlay.hidden = true; }, 160);
  }

  function issue(opt) {
    const f = fleet();
    if (!f.length) { close(); return; }
    if (opt.needsTarget && (!state.player || state.player.targetId == null)) {
      bus.emit('toast', { text: `No target — press Tab to select, then ${BINDINGS.fleetCommand.label}`, kind: 'warn', ttl: 2.5 });
      bus.emit('audio:cue', { id: 'ui_deny' });
      return; // keep the radial open so the player can pick another order
    }
    const selected = f[selectedIndex] || null;
    issuing = true;
    issueReceipt = false;
    bus.emit('ui:wingOrder', {
      order: opt.order,
      scope,
      selectedWingmanId: scope === 'selected' && selected ? selected.id : null,
      targetId: opt.order === 'attack' ? (state.player && state.player.targetId) : null,
    });
    issuing = false;
    // A blocked/partial receipt on the issued slot holds the dial for one beat
    // (FB-138) — the refusal is the thing the pilot needs to read before it closes.
    if (issueReceipt) {
      issueReceipt = false;
      receiptHold = true;
      scheduleReceiptEnd();
      return;
    }
    close();
  }

  function cycleScope() {
    const f = fleet();
    if (!f.length) return;
    if (scope === 'all') {
      scope = 'selected';
      selectedIndex = 0;
    } else if (selectedIndex < f.length - 1) {
      selectedIndex += 1;
    } else {
      scope = 'all';
      selectedIndex = 0;
    }
    refreshScope();
    bus.emit('audio:cue', { id: 'ui_tick' });
  }

  function refreshScope() {
    const f = fleet();
    const selected = f[selectedIndex] || null;
    hubTitle.textContent = scope === 'all' ? 'ALL WINGS' : 'ONE WING';
    // One lamp per wingman (up to eight), lit for every recipient of the next order.
    const shown = Math.min(8, f.length);
    let pips = '';
    for (let i = 0; i < shown; i++) pips += `<i class="${scope === 'all' || i === selectedIndex ? 'is-on' : ''}"></i>`;
    hubPips.innerHTML = pips;
    const who = selected && (selected.name || selected.id);
    hubCount.textContent = scope === 'all'
      ? `${f.length} CRAFT`
      : String(who || `WING ${selectedIndex + 1}`).toUpperCase();
    hub.setAttribute('aria-label', scope === 'all'
      ? `Command all ${f.length} wingmen; activate to select one`
      : `Command selected wingman ${selected && (selected.name || selected.id) || selectedIndex + 1}; activate to cycle`);
  }

  function onKey(ev) {
    if (!open) return;
    if (ev.key === 'Escape') {
      ev.preventDefault(); ev.stopPropagation();
      bus.emit('audio:cue', { id: 'ui_back' });
      close();
      return;
    }
    if (ev.key === 'Tab') {
      ev.preventDefault(); ev.stopPropagation(); cycleScope(); return;
    }
    const opt = OPTIONS.find((o) => o.key === ev.key);
    if (opt) { ev.preventDefault(); ev.stopPropagation(); issue(opt); return; }
    // Re-pressing the fleet-command key while open closes it (tap-tap dismiss).
    if (ev.code === BINDINGS.fleetCommand.code || ev.key === BINDINGS.fleetCommand.key) {
      ev.preventDefault(); ev.stopPropagation(); close();
    }
  }

  bus.on('ui:wingmanRadial', toggle);
  // Close if flight is left (dock / menu / death) so it can't linger over a modal.
  bus.on('mode:changed', () => { if (open && state.mode !== 'flight') close(); });
  bus.on('dock:docked', () => close());

  // FB-138 — the order receipt. The refused slot says why; a converted order shows
  // what it became on the slot that was issued; a partial status shows the count.
  bus.on('wingOrder:blocked', (p) => {
    if (!p || p.order == null) return;
    const reasons = Array.isArray(p.blockedRecipients) ? p.blockedRecipients : [];
    const reason = reasons.length ? reasons[0].reason : null;
    showReceipt(p.order, REASON_WORDS[reason] || String(reason || 'blocked').replace(/_/g, ' ').toUpperCase());
  });
  bus.on('wingOrder:converted', (p) => {
    if (!p || p.to == null) return;
    showReceipt(p.from != null ? p.from : p.to, String(p.to).toUpperCase());
  });
  bus.on('wingOrder:status', (p) => {
    if (!p || p.order == null) return;
    const blocked = Array.isArray(p.blockedRecipients) ? p.blockedRecipients.length : 0;
    const accepted = Array.isArray(p.acceptedRecipientIds) ? p.acceptedRecipientIds.length : 0;
    if (!blocked) return;          // a clean accept already has its voice acknowledgement
    if (accepted) showReceipt(p.order, `EXEC ${accepted}/${accepted + blocked}`);
    else showReceipt(p.order, 'BLOCKED');
  });

  return { toggle, open: openRadial, close, get isOpen() { return open; } };
}

function injectCss() {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = `
  /* Deckplate (FRONTEND_PROGRAM Wave 1, critic pass 2026-09-19): the wingman radial is one dial -
     four smoked-glass arc keys seated in a machined ring, a lamp set into the bezel over each key,
     and a glass hub that names the scope. The selection language is the kit's: the key's lamp
     lights, its legend goes amber, and its inner edge takes an amber rim. Legends are bone. */
  .sf-wradial { position:fixed; left:50%; top:69%; width:400px; height:400px; transform:translate(-50%,-50%);
    z-index:1800; pointer-events:none; opacity:0; transition:opacity .14s ease; --wr-type:12px; }
  .sf-wradial::before { content:""; position:absolute; inset:-60px; border-radius:50%; pointer-events:none;
    background:radial-gradient(circle, rgb(5 7 10 / .55) 0%, rgb(5 7 10 / .35) 50%, transparent 70%);
    -webkit-mask-image:radial-gradient(circle, #000 60%, transparent 100%);
    mask-image:radial-gradient(circle, #000 60%, transparent 100%); }
  .sf-wradial[hidden] { display:none; }
  .sf-wradial.sf-wradial--in { opacity:1; }
  .sf-wradial__dial { position:absolute; inset:0; width:100%; height:100%; overflow:visible; pointer-events:none; }
  .sf-wradial__bed { fill:rgb(8 10 14 / .55); stroke:none; }
  .sf-wradial__bezel-edge { fill:none; stroke:rgb(232 226 212 / .22); stroke-width:1.5; }
  .sf-wradial__graticule { fill:none; stroke:rgb(232 226 212 / .3); stroke-width:1.2; stroke-linecap:round; }

  /* the keys: each button fills the dial box and is clipped to its own arc */
  .sf-wradial__wedge { position:absolute; inset:0; width:400px; height:400px; margin:0; padding:0; border:0;
    background:none; color:var(--dp-ink-dim, #b7b4a6); cursor:pointer; pointer-events:auto;
    font-family:var(--dp-face-etch, sans-serif); transform-origin:200px 200px;
    transform:scale(.9); opacity:0;
    transition:transform .2s cubic-bezier(.2,.9,.3,1.2) var(--wr-delay, 0ms), opacity .14s ease var(--wr-delay, 0ms), color .12s; }
  .sf-wradial__wedge--right { --wr-delay:25ms; }
  .sf-wradial__wedge--bottom { --wr-delay:50ms; }
  .sf-wradial__wedge--left { --wr-delay:75ms; }
  .sf-wradial--in .sf-wradial__wedge { transform:none; opacity:1; }
  .sf-wradial__seg { position:absolute; inset:0; width:100%; height:100%; overflow:visible; pointer-events:none; }
  .sf-wradial__seg path { fill:rgb(12 15 20 / .55); stroke:rgb(232 226 212 / .35); stroke-width:1px; transition:stroke .12s, fill .12s; }
  /* one sheet of glass, one reflection: a crisp-edged plane across the upper dial, so the top key
     catches most of it, the side keys its lower edge, the bottom key none; plus an inner shadow
     where the key seats into the ring */
  .sf-wradial__wedge::after { content:""; position:absolute; inset:0; pointer-events:none;
    background:linear-gradient(168deg, rgb(255 250 240 / .09) 0%, rgb(255 250 240 / .035) 36%, rgb(255 250 240 / 0) 37.5%),
      none; }
  .sf-wradial__face { position:absolute; transform:translate(-50%,-50%); display:flex; flex-direction:column;
    align-items:center; gap:5px; width:112px; pointer-events:none; text-align:center; }
  .sf-wradial__glyph { width:24px; height:24px; display:flex; align-items:center; justify-content:center; color:var(--dp-ink, #e8e2d4); }
  .sf-wradial__glyph svg { display:block; }
  .sf-wradial__glyph .accent { fill:var(--dp-ink-mute, #96948e); }
  .sf-wradial__label { font-variation-settings:"wght" 760, "wdth" 72; font-size:var(--wr-type); letter-spacing:.14em;
    text-transform:uppercase; line-height:1.15; text-shadow:0 1px 0 rgb(0 0 0 / .8); }
  .sf-wradial__key, .sf-wradial__hub-scope { display:inline-grid; place-items:center; min-width:22px; height:22px; padding:0 6px 2px;
    box-sizing:border-box; border-style:solid; border-color:transparent; border-width:3px 4px 5px;
    border-image:none;
    background:var(--dp-metal-3, #232833);
    font-family:var(--dp-face-etch, sans-serif); font-variation-settings:"wght" 800, "wdth" 75; font-size:var(--wr-type);
    line-height:1; letter-spacing:.04em; color:var(--dp-ink, #e8e2d4); }

  /* the bezel lamps: dark lenses at rest, lit over the key under the pilot's hand */
  .sf-wradial__lamp { position:absolute; width:9px; height:9px; margin:-4.5px 0 0 -4.5px; border-radius:50%; pointer-events:none;
    background:linear-gradient(var(--dp-rule-hi) 0 0);
    box-shadow:0 0 8px rgb(242 185 80 / .25), 0 1px 0 1.5px rgb(255 236 204 / .1); }

  /* selection: lamp lit, legend amber, amber inner edge - one language with every deckplate row */
  .sf-wradial__wedge:is(:hover, :focus-visible) { color:var(--dp-lamp-hot, #ffd98c); }
  .sf-wradial__wedge:is(:hover, :focus-visible) .sf-wradial__label {
    color:rgb(255 244 214);
    text-shadow:0 0 12px var(--dp-lamp-bloom, rgb(242 185 80 / .4));
  }
  .sf-wradial__wedge:is(:hover, :focus-visible) .sf-wradial__glyph { color:var(--dp-lamp-hot, #ffd98c); }
  .sf-wradial__wedge:is(:hover, :focus-visible) .sf-wradial__glyph .accent { fill:var(--dp-lamp, #f2b950); }
  .sf-wradial__wedge:is(:hover, :focus-visible) .sf-wradial__key {
    color:var(--dp-phos, rgb(205 222 255));
    font-size:12px;
  }
  .sf-wradial__wedge:is(:hover, :focus-visible) .sf-wradial__seg path {
    stroke:var(--dp-lamp, #f2b950); stroke-width:4; filter:drop-shadow(0 0 6px rgb(242 185 80 / .45)); }
  .sf-wradial:has(.sf-wradial__wedge--top:is(:hover, :focus-visible)) .sf-wradial__lamp--top,
  .sf-wradial:has(.sf-wradial__wedge--right:is(:hover, :focus-visible)) .sf-wradial__lamp--right,
  .sf-wradial:has(.sf-wradial__wedge--bottom:is(:hover, :focus-visible)) .sf-wradial__lamp--bottom,
  .sf-wradial:has(.sf-wradial__wedge--left:is(:hover, :focus-visible)) .sf-wradial__lamp--left {
    background:linear-gradient(var(--dp-lamp) 0 0);
    box-shadow:0 0 7px var(--dp-lamp-bloom, rgb(242 185 80 / .34)), 0 0 16px var(--dp-lamp-bloom-soft, rgb(242 185 80 / .16)), 0 0 8px rgb(242 185 80 / .25); }
  /* the order receipt: a word seated between hub rim and key inner edge on the slot it names */
  .sf-wradial__receipt { position:absolute; transform:translate(-50%,-50%); max-width:120px; pointer-events:none;
    font-family:var(--dp-face-etch, sans-serif); font-variation-settings:"wght" 800, "wdth" 72; font-size:var(--wr-type);
    letter-spacing:.1em; text-transform:uppercase; text-align:center; line-height:1.2; white-space:nowrap;
    color:var(--dp-lamp-hot, #ffd98c); text-shadow:0 1px 0 rgb(0 0 0 / .8), 0 0 9px rgb(242 185 80 / .3); }
  .sf-wradial__receipt:empty { display:none; }
  /* receipt-only flash: visible, but the keys cannot be pressed */
  .sf-wradial--receipt .sf-wradial__wedge, .sf-wradial--receipt .sf-wradial__hub { pointer-events:none; }

  .sf-wradial--in .sf-wradial__wedge--disabled { opacity:.4; cursor:not-allowed; }
  .sf-wradial__wedge--disabled:hover { color:var(--dp-ink-dim, #b7b4a6); }
  .sf-wradial__wedge--disabled:hover .sf-wradial__glyph, .sf-wradial__wedge--disabled:hover .sf-wradial__key { color:var(--dp-ink, #e8e2d4); }
  .sf-wradial__wedge--disabled:hover .sf-wradial__seg path { stroke:rgb(255 236 204 / .13); stroke-width:2; filter:none; }

  /* the hub: glass seated in a machined collar, naming who the order goes to */
  .sf-wradial__hub { position:absolute; left:50%; top:50%; width:124px; height:124px; transform:translate(-50%,-50%) scale(.9);
    display:flex; flex-direction:column; align-items:center; justify-content:center; gap:4px; border-radius:50%;
    border:7px solid transparent; box-sizing:border-box;
    background:radial-gradient(circle at 50% 30%, rgb(255 244 222 / .06), transparent 60%) padding-box,
      radial-gradient(circle, #121925, #0a0e14) padding-box,
      radial-gradient(circle at 38% 30%, #6b7384, #2d333e 55%, #14171d) border-box;
    box-shadow:none;
    transition:transform .16s ease; color:var(--dp-ink, #e8e2d4); cursor:pointer; padding:12px 0 0 0; pointer-events:auto; }
  .sf-wradial--in .sf-wradial__hub { transform:translate(-50%,-50%) scale(1); }
  .sf-wradial__hub:focus-visible { outline:2px solid var(--dp-lamp, #f2b950); outline-offset:3px; }
  .sf-wradial__hub-title { font-family:var(--dp-face-etch, sans-serif); font-variation-settings:"wght" 760, "wdth" 66;
    font-size:var(--wr-type); letter-spacing:.18em; color:var(--dp-ink-dim, #b7b4a6); text-shadow:0 1px 0 rgb(0 0 0 / .8); }
  .sf-wradial__hub-count { font-family:var(--dp-face-etch, sans-serif); font-variation-settings:"wght" 700, "wdth" 70; font-size:var(--wr-type);
    letter-spacing:.12em; line-height:1; max-width:96px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
    font-variant-numeric:tabular-nums; color:var(--dp-ink, #e8e2d4); text-shadow:0 0 10px rgb(205 222 255 / .18); }
  .sf-wradial__hub-pips { display:flex; gap:5px; justify-content:center; min-height:8px; }
  .sf-wradial__hub-pips i { display:block; width:7px; height:7px; border-radius:50%;
    background:linear-gradient(var(--dp-rule-hi) 0 0); box-shadow:none; }
  .sf-wradial__hub-pips i.is-on { background:linear-gradient(var(--dp-ink) 0 0);
    box-shadow:0 0 5px rgb(232 226 212 / .3); }
  .sf-wradial__hub:hover .sf-wradial__hub-scope, .sf-wradial__hub:focus-visible .sf-wradial__hub-scope { color:var(--dp-lamp-hot, #ffd98c); }

  @media (max-width:1400px) {
    .sf-wradial { transform:translate(-50%,-50%) scale(.8); }
  }

  @media (prefers-reduced-motion:reduce) { .sf-wradial, .sf-wradial__hub, .sf-wradial__wedge { transition:none; } }
  html.sf-reduce-motion .sf-wradial, html.sf-reduce-motion .sf-wradial__hub, html.sf-reduce-motion .sf-wradial__wedge { transition:none; }
  html.sf-high-contrast .sf-wradial__wedge:is(:hover, :focus-visible) .sf-wradial__seg path { stroke:#fff; }
  @media (forced-colors:active) {
    .sf-wradial__bed, .sf-wradial__seg path { fill:Canvas; stroke:CanvasText; filter:none; }
    .sf-wradial__bezel-edge, .sf-wradial__graticule { stroke:CanvasText; }
    .sf-wradial__wedge { color:ButtonText; }
    .sf-wradial__wedge:is(:hover, :focus-visible) .sf-wradial__seg path { stroke:Highlight; }
    .sf-wradial__hub { border:1px solid ButtonText; background:ButtonFace; color:ButtonText; box-shadow:none; }
    .sf-wradial__key, .sf-wradial__hub-scope { border-image:none; border:1px solid ButtonText; background:ButtonFace; color:ButtonText; }
    .sf-wradial__lamp { forced-color-adjust:none; background:Canvas; box-shadow:0 0 0 1px CanvasText; }
  }

  @media (prefers-reduced-motion:reduce) { .sf-wradial, .sf-wradial__hub, .sf-wradial__wedge { transition:none; } }
  html.sf-reduce-motion .sf-wradial, html.sf-reduce-motion .sf-wradial__hub, html.sf-reduce-motion .sf-wradial__wedge { transition:none; }
  html.sf-high-contrast .sf-wradial__wedge:is(:hover, :focus-visible) .sf-wradial__seg path { stroke:#fff; }
  @media (forced-colors:active) {
    .sf-wradial__bed, .sf-wradial__seg path { fill:Canvas; stroke:CanvasText; filter:none; }
    .sf-wradial__bezel-edge, .sf-wradial__graticule { stroke:CanvasText; }
    .sf-wradial__wedge { color:ButtonText; }
    .sf-wradial__wedge:is(:hover, :focus-visible) .sf-wradial__seg path { stroke:Highlight; }
    .sf-wradial__hub { border:1px solid ButtonText; background:ButtonFace; color:ButtonText; box-shadow:none; }
    .sf-wradial__key, .sf-wradial__hub-scope { border-image:none; border:1px solid ButtonText; background:ButtonFace; color:ButtonText; }
    .sf-wradial__lamp { forced-color-adjust:none; background:Canvas; box-shadow:0 0 0 1px CanvasText; }
  }
  /* A narrow window scales the whole dial; the legend size compensates so text holds 12px. */
  @media (max-width:760px), (max-height:560px) {
    .sf-wradial { transform:translate(-50%,-50%) scale(.72); --wr-type:16.7px; }
    .sf-wradial__face { width:150px; }
  }
  `;
  document.head.appendChild(s);
}

function focusSafely(element) {
  if (!element || typeof element.focus !== 'function') return false;
  try { element.focus({ preventScroll: true }); }
  catch (_) { try { element.focus(); } catch (_) { return false; } }
  return document.activeElement === element;
}
