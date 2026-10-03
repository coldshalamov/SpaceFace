// src/ui/stuntCallout.js — PQ-146 Phase 3 presentation: the game NAMES what the player just did.
//
// The stunt module (src/systems/stuntGrammar.js, single writer) already detects the tricks, keeps
// the combo state (src/systems/stuntCombo.js) and publishes receipts on the bus:
//   stunt:trickDetected / stunt:trickAmended  — a named physical act (with its modifiers)
//   stunt:styleBanked                          — a settled chain ({ points, multiplier, reason })
//   stunt:bridge                               — a Close Shave / loaded constraint that bought time
// Nothing on screen read them in flight. This module is the Crucible-only presentation layer:
// a short column of named callouts ("RAZOR BOLAS · COLLATERAL ×3", "+460 BANKED · ×2.00") over a
// compact chain readout (the open line's named acts, the raw points, the chain-window scale with
// its bridge notches, and the banked total).
//
// Scope law (PQ-146 non-goal, as amended by FB-012): NO score popups in adventure flight —
// named acts are not score. The Crucible meter (multiplier, raw points, banked, window) gates
// on a LIVE survival run; the named acts speak wherever the flight HUD is up, adventure
// included. Outside flight the layer is hidden and its frame listener is stopped, so menus pay
// nothing.
//
// ORRERY (design/frontend/ORRERY.md): light is the only material. Type carries the callouts (caps
// labels, thin numerals, `--dp-*` tokens via injectOrrery), the chain window is a scale (a ruled
// line that drains, with at most two discrete bridge notches — §4 #8), and the one warm light is
// the bank line and the multiplier — the Hand's job of saying "this one". No borders, no panels:
// the flight floor allows no backdrop-filter and no filters over live flight. Motion is a 340 ms
// rise, cut instantly under settings.video.motionReduce (html.sf-reduce-motion).
//
// Driving: the shared ORRERY frame scheduler (src/ui/orrery/motion.js onFrame) — never a second
// animation loop. The listener runs ONLY while the layer has something on screen and stops
// (returns false) the moment it does not; bus events wake it. Node-safe: without a usable
// document the owner is inert and every builder stays pure and testable.

import { TRICK_DEFINITIONS } from '../combat/stuntRecognition.js';
import { styleMultiplier } from '../systems/stuntCombo.js';
import { injectOrrery } from './orrery/tokens.js';
import { onFrame } from './orrery/motion.js';

/** How long one callout line stays up, in wall ms (presentation clock, like a toast ttl). */
export const CALLOUT_TTL_MS = 2600;
/** How many callout lines remain visible at once (SCORING_AND_COMBO §4.1: at most three names). */
export const MAX_CALLOUT_LINES = 3;
/** How many named acts of the open line the readout shows before it truncates to the newest. */
export const MAX_LINE_NAMES = 3;
/** Style-sheet id for the layer's namespaced sheet. */
export const STUNT_CALLOUT_STYLE_ID = 'sf-stuntcall-css';

const BONE = '236 230 216';

const CSS = `
.sf-stuntcall { position:fixed; left:16px; bottom:32vh; z-index:12; display:flex; flex-direction:column;
  align-items:flex-start; gap:5px; pointer-events:none; }
.sf-stuntcall[hidden] { display:none; }
.sf-stuntcall__line { display:flex; align-items:baseline; gap:10px; white-space:nowrap; }
.sf-stuntcall__lines { display:flex; flex-direction:column; align-items:flex-start; gap:4px; }
.sf-stuntcall__name { font-family:var(--dp-face-label, "Archivo"); font-stretch:112%; font-weight:650;
  font-size:13px; letter-spacing:.18em; text-transform:uppercase; color:rgb(248 244 234 / .92); }
.sf-stuntcall__pts { font-family:var(--dp-face-numeral, "Archivo"); font-stretch:100%; font-weight:250;
  font-size:13px; font-variant-numeric:tabular-nums; letter-spacing:.06em; color:rgb(${BONE} / .66); }
.sf-stuntcall__line.is-bank .sf-stuntcall__name { color:var(--dp-hand, #f2b950); }
.sf-stuntcall__line.is-bank .sf-stuntcall__pts { color:var(--dp-hand, #f2b950); }
.sf-stuntcall__meter { display:flex; flex-direction:column; gap:4px; margin-top:2px; }
.sf-stuntcall__rowtop { display:flex; align-items:baseline; gap:10px; }
.sf-stuntcall__mult { font-family:var(--dp-face-numeral, "Archivo"); font-stretch:100%; font-weight:250;
  font-size:30px; line-height:1; letter-spacing:-.01em; font-variant-numeric:tabular-nums;
  color:rgb(248 244 234 / .95); }
.sf-stuntcall__names { font-family:var(--dp-face-label, "Archivo"); font-stretch:112%; font-weight:650;
  font-size: 12px; letter-spacing:.16em; text-transform:uppercase; color:rgb(${BONE} / .72); }
.sf-stuntcall__scale { position:relative; width:190px; height:3px;
  background:rgb(${BONE} / .22); }
.sf-stuntcall__scale-fill { position:absolute; inset:0; transform-origin:left center;
  transform:scaleX(var(--sf-stuntcall-w, 1)); background:rgb(248 244 234 / .78); }
.sf-stuntcall__scale-notch { position:absolute; top:-3px; width:1px; height:9px;
  background:rgb(${BONE} / .55); }
.sf-stuntcall__rowsub { display:flex; gap:12px; font-family:var(--dp-face-label, "Archivo");
  font-stretch:112%; font-weight:650; font-size: 12px; letter-spacing:.16em; text-transform:uppercase;
  font-variant-numeric:tabular-nums; color:rgb(${BONE} / .58); }
.sf-stuntcall__rise { animation:sf-stuntcall-rise .34s cubic-bezier(.2, .9, .3, 1) both; }
@keyframes sf-stuntcall-rise { from { opacity:0; transform:translateY(7px); } to { opacity:1; transform:none; } }
html.sf-reduce-motion .sf-stuntcall__rise { animation:none; }
.sf-stuntcall__sr { position:absolute; width:1px; height:1px; margin:-1px; padding:0; overflow:hidden;
  clip:rect(0 0 0 0); white-space:nowrap; }
`;

function injectStyle(doc) {
  if (!doc || !doc.head || typeof doc.getElementById !== 'function' || doc.getElementById(STUNT_CALLOUT_STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STUNT_CALLOUT_STYLE_ID;
  style.textContent = CSS;
  doc.head.appendChild(style);
}

/* --- pure builders. Everything the layer says is decided here, DOM-free. --------------------- */

function trickBaseName(trick) {
  if (trick && typeof trick.name === 'string' && trick.name) return trick.name;
  const def = trick && TRICK_DEFINITIONS[trick.trickId];
  if (def && def.name) return def.name;
  if (trick && typeof trick.trickId === 'string' && trick.trickId) {
    const words = trick.trickId.split('_').filter(Boolean);
    if (words.length) {
      return words.map((w) => (w.length === 1 ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1))).join(' ');
    }
  }
  return 'Stunt';
}

/**
 * The one display name for a detected trick or a combo act: the primary act, with its earned
 * modifiers named beside it — "Razor Bolas · Collateral ×3" (SCORING_AND_COMBO §4.1's example,
 * without pretending modifiers are extra steps). Pure; the caller decides the case.
 */
export function trickCalloutName(trick) {
  if (!trick || typeof trick !== 'object') return '';
  const mods = trick.modifiers && typeof trick.modifiers === 'object' ? trick.modifiers : {};
  const parts = [];
  let name = trickBaseName(trick);
  if (mods.razorRelease === 'razor') name = `Razor ${name}`;
  parts.push(name);
  const collateral = Math.floor(Number(mods.collateralCount) || 1);
  if (collateral > 1) parts.push(`Collateral ×${collateral}`);
  if (mods.closeShave === true && trick.trickId !== 'needle_thread') parts.push('Close Shave');
  return parts.join(' · ');
}

const clamp01 = (x) => Math.min(1, Math.max(0, Number(x) || 0));

/**
 * The open chain as the compact readout model, or null when there is nothing to show.
 * Reads a live combo snapshot (state.stunts.combo) plus the current sim tick. Read-only:
 * no clone, no allocation beyond the small result object the DOM layer reuses per render.
 *   active        — an open chain exists (paid acts)
 *   names         — the open line's named acts, oldest first, capped at MAX_LINE_NAMES
 *   points        — pending raw style in the open line (floored once, at display)
 *   multiplier    — what banking would pay now (stuntCombo's own chainFactor, one formula)
 *   windowFrac    — chain-window scale fraction (deadline vs the window the line has earned)
 *   windowLeftS   — seconds of chain window left
 *   bridges       — accepted bridge notches, 0..2
 *   banked        — the run's settled style total
 * When no chain is open, the readout is null (a banked total alone is not a meter); the bank
 * receipt travels as a callout line instead.
 */
export function comboReadout(combo, nowTick) {
  if (!combo || typeof combo !== 'object') return null;
  const acts = Array.isArray(combo.acts) ? combo.acts : [];
  const paid = acts.filter((a) => a && Number(a.points) > 0);
  if (!paid.length) return null;
  const tick = Number.isFinite(Number(nowTick)) ? Number(nowTick) : 0;
  const deadline = Number(combo.deadlineTick);
  const lastTrickTick = Number(combo.lastTrickTick);
  const windowTotal = Number.isFinite(deadline) && Number.isFinite(lastTrickTick)
    ? Math.max(1, deadline - lastTrickTick)
    : 300;
  const left = Number.isFinite(deadline) ? Math.max(0, deadline - tick) : 0;
  const names = paid.slice(-MAX_LINE_NAMES).map((a) => trickCalloutName(a));
  let multiplier = 1;
  try { multiplier = styleMultiplier(combo); } catch { multiplier = 1; }
  return {
    active: true,
    names,
    points: Math.floor(paid.reduce((n, a) => n + Number(a.points), 0)),
    multiplier,
    windowFrac: clamp01(left / windowTotal),
    windowLeftS: left / 60,
    bridges: Math.min(2, Array.isArray(combo.bridges) ? combo.bridges.length : 0),
    banked: Math.max(0, Math.floor(Number(combo.banked) || 0)),
  };
}

/** One line. The number is the existing bonus law, rounded. */
export function selfSlingCalloutText(bonusDv) {
  const whole = Math.round(Number(bonusDv) || 0);
  return `SELF-SLING +${whole}`;
}

/**
 * The words for a settled bank receipt. A quiet/deadline/round_clear bank is a BANK;
 * a hard crash or death settles the open line at ×1 (SCORING_AND_COMBO §4.5) and the line
 * says so — the player lost composition, not the truth of what happened.
 */
export function bankCalloutText(bank) {
  if (!bank || typeof bank !== 'object') return '';
  const points = Math.max(0, Math.floor(Number(bank.points) || 0));
  const crashed = bank.reason === 'hard_crash' || bank.reason === 'death';
  const mult = Number(bank.multiplier);
  const multText = !crashed && Number.isFinite(mult) && mult > 1 ? ` · ×${mult.toFixed(2)}` : '';
  return crashed ? `Crash settle +${points}` : `Banked +${points}${multText}`;
}

/** The plain words the ear gets for a trick (the visually-hidden live region). */
export function trickSpokenText(trick) {
  return trickCalloutName(trick)
    .split(' · ')
    .map((part) => part.replace(/×\s*/g, 'times ').trim())
    .filter(Boolean)
    .join(', ');
}

/* --- the DOM owner. --------------------------------------------------------------------------- */

function usable(doc) {
  return !!(doc && typeof doc.createElement === 'function'
    && doc.body && typeof doc.body.appendChild === 'function');
}

/** The one wall clock for line expiry — performance.now's scale, the same one rAF hands back. */
function wallNow() {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : 0;
}

/** Test seam: the clock the layer's expiries run on, so a driver can pass consistent values. */
export function calloutNow() {
  return wallNow();
}

function mk(doc, tag, className, text) {
  const node = doc.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

// SWARM-03 — kill causes reach the stunt line (SWARM_EXPANSION §10): every physics kill
// already carries its cause word on `swarm:killPopup` (swarmJuice reads the kill-
// presentation receipt); the line quotes the word so SLAMMED/MINED/BANKED/SLUNG stop
// being invisible payouts. Gun kills (SHREDDED/DOWN) stay quiet — guns never needed
// teaching. Repeats inside the TTL roll the count like a pinball display, keyed so the
// three-line budget is spent on kinds, not on spam.
const SWARM_CAUSE_WORDS = new Set(['SLAMMED', 'BANKED', 'SLUNG', 'MINED']);

function collectText(node, acc) {
  if (!node) return acc;
  if (typeof node.textContent === 'string' && node.textContent) acc.push(node.textContent);
  const kids = node.children || [];
  for (const kid of kids) collectText(kid, acc);
  return acc;
}

/**
 * Create the callout owner. Options:
 *   state  — the live GameState (read-only; the layer reads run/mode/ui/tick/stunts each frame)
 *   bus    — the event bus (stunt:trickDetected / trickAmended / styleBanked subscriptions)
 *   host   — where the layer mounts (default doc.body; the layer positions itself)
 *   doc    — the document (injected so tests can mount a fake)
 * Returns { root, update, destroy, active } — `update(nowMs)` is the whole render step, also
 * called by the shared frame listener, so tests drive it deterministically without rAF.
 */
export function createStuntCallout({ state = null, bus = null, host = null, doc = globalThis.document } = {}) {
  const inert = { root: null, update() {}, destroy() {}, active: () => false };
  if (!usable(doc)) return inert;
  injectOrrery(doc);
  injectStyle(doc);

  const root = mk(doc, 'div', 'sf-stuntcall');
  root.setAttribute('aria-hidden', 'true');
  root.hidden = true;
  const lines = mk(doc, 'div', 'sf-stuntcall__lines');
  root.appendChild(lines);
  const meter = mk(doc, 'div', 'sf-stuntcall__meter');
  meter.hidden = true;
  const rowTop = mk(doc, 'div', 'sf-stuntcall__rowtop');
  const mult = mk(doc, 'span', 'sf-stuntcall__mult', '');
  const namesLine = mk(doc, 'span', 'sf-stuntcall__names', '');
  rowTop.appendChild(mult);
  rowTop.appendChild(namesLine);
  const scale = mk(doc, 'div', 'sf-stuntcall__scale');
  const scaleFill = mk(doc, 'div', 'sf-stuntcall__scale-fill');
  scale.appendChild(scaleFill);
  const notches = [mk(doc, 'div', 'sf-stuntcall__scale-notch'), mk(doc, 'div', 'sf-stuntcall__scale-notch')];
  for (const notch of notches) { notch.style.display = 'none'; scale.appendChild(notch); }
  const rowSub = mk(doc, 'div', 'sf-stuntcall__rowsub');
  const ptsCell = mk(doc, 'span', null, '');
  const windowCell = mk(doc, 'span', null, '');
  const bankedCell = mk(doc, 'span', null, '');
  rowSub.appendChild(ptsCell);
  rowSub.appendChild(windowCell);
  rowSub.appendChild(bankedCell);
  meter.appendChild(rowTop);
  meter.appendChild(scale);
  meter.appendChild(rowSub);
  root.appendChild(meter);
  const sr = mk(doc, 'div', 'sf-stuntcall__sr');
  sr.setAttribute('role', 'status');
  sr.setAttribute('aria-live', 'polite');
  root.appendChild(sr);
  (host || doc.body).appendChild(root);

  // One model, written by bus handlers, rendered by update(). The rendered strings are cached so
  // the frame step writes DOM only on change (flight HUD budget).
  const lineNodes = new Map(); // key -> { node, pts, until, order }
  let lineOrder = 0;
  let spoken = '';
  let frameOff = null;
  let destroyed = false;

  const getState = () => state;

  /**
   * FB-012 — a live survival run keeps the full instrument; ADVENTURE now names the act too.
   * The same flight/modal gates hold in both, and the Crucible's score fields (multiplier,
   * points, banked, window — the meter and bank lines) stay Crucible-only: adventure has rep
   * and salvage rights instead of style points. Idle cost is unchanged: with nothing to say the
   * render step returns false and the frame listener drops until a bus event wakes it.
   */
  function calloutScope(st) {
    if (!st || st.mode !== 'flight') return null;
    if (st.ui && ((st.ui.screenStack && st.ui.screenStack.length) || st.ui.docked)) return null;
    const run = st && st.run;
    if (run && run.kind === 'survival' && run.phase !== 'inactive') return { run, adventure: false };
    return { run: null, adventure: true };
  }

  function motionReduced(st) {
    if (st && st.settings && st.settings.video && st.settings.video.motionReduce) return true;
    const html = doc.documentElement;
    return !!(html && html.classList && typeof html.classList.contains === 'function'
      && html.classList.contains('sf-reduce-motion'));
  }

  function pruneLines(now) {
    for (const [key, entry] of [...lineNodes]) {
      if (entry.until > now) continue;
      if (entry.node.parentNode) entry.node.parentNode.removeChild(entry.node);
      lineNodes.delete(key);
    }
    while (lineNodes.size > MAX_CALLOUT_LINES) {
      let oldest = null;
      for (const entry of lineNodes.values()) {
        if (!oldest || entry.order < oldest.order) oldest = entry;
      }
      if (!oldest) break;
      if (oldest.node.parentNode) oldest.node.parentNode.removeChild(oldest.node);
      lineNodes.delete(oldest.key);
    }
  }

  function addLine(key, nameText, ptsText, now, ttl, isBank) {
    const existing = key != null ? lineNodes.get(key) : null;
    if (existing) {
      existing.pts.textContent = ptsText;
      existing.until = now + ttl;
      return;
    }
    const node = mk(doc, 'div', 'sf-stuntcall__line' + (isBank ? ' is-bank' : ''));
    if (!motionReduced(getState())) node.classList.add('sf-stuntcall__rise');
    const name = mk(doc, 'span', 'sf-stuntcall__name', nameText);
    const pts = mk(doc, 'span', 'sf-stuntcall__pts', ptsText);
    node.appendChild(name);
    node.appendChild(pts);
    lines.appendChild(node);
    const storedKey = key ?? `anon-${lineOrder + 1}`;
    lineNodes.set(storedKey, { key: storedKey, node, pts, until: now + ttl, order: ++lineOrder });
    pruneLines(now);
  }

  function onTrick(trick) {
    if (destroyed) return;
    const st = getState();
    if (!calloutScope(st)) return;
    if (!trick || typeof trick !== 'object') return;
    if (st.playerId != null && trick.actorId != null && trick.actorId !== st.playerId) return;
    // Bridges and zero-pay recognitions are not named acts; the meter and the chain carry them.
    const name = trickCalloutName(trick);
    if (!name) return;
    const now = wallNow();
    const key = `ep:${trick.episodeId ?? trick.trickId}`;
    addLine(key, name, '', now, CALLOUT_TTL_MS, false);
    spoken = trickSpokenText(trick);
    sr.textContent = spoken;
    wake();
  }

  function onBank(bank) {
    if (destroyed) return;
    const st = getState();
    const scope = calloutScope(st);
    // FB-012 — the bank IS a score field: it stays Crucible-only. Adventure never says "+N BANKED".
    if (!scope || scope.adventure) return;
    const text = bankCalloutText(bank);
    if (!text) return;
    addLine(`bank:${bank && bank.bankId}`, text, '', wallNow(), CALLOUT_TTL_MS + 600, true);
    spoken = text.replace(/×/g, ' at ').replace(/\+/g, '');
    sr.textContent = spoken;
    wake();
  }

  // ── FB-014 — the four stunt economy events find their consumers here. A minted right is
  // money the player is owed; a claimed right is the confirm; a completed line contract is an
  // earned name; a bridge is the combo tick. All ride the same quiet scope gate and the same
  // three-line column as every other named act.

  function onSalvageRights(p) {
    if (destroyed) return;
    const st = getState();
    if (!calloutScope(st)) return;
    const amount = Math.max(0, Math.floor(Number(p && p.salvageRights) || 0));
    if (amount <= 0) return;
    const name = trickCalloutName(p);
    if (!name) return;
    addLine(`rights:${p && p.episodeId}`, `SALVAGE RIGHT · ${name}`, `+${amount}`,
      calloutNow(), CALLOUT_TTL_MS + 400, true);
    spoken = `Salvage right, ${amount}. ${trickSpokenText(p)}`;
    sr.textContent = spoken;
    wake();
  }

  function onSalvageRightsClaimed(p) {
    if (destroyed) return;
    const st = getState();
    if (!calloutScope(st)) return;
    const amount = Math.max(0, Math.floor(Number(p && p.salvageRights) || 0));
    if (amount <= 0) return;
    addLine('rights-claimed', 'RIGHTS CLAIMED', `+${amount}`, calloutNow(), CALLOUT_TTL_MS, true);
    spoken = `Rights claimed, ${amount}.`;
    sr.textContent = spoken;
    wake();
  }

  function onLineContract(card) {
    if (destroyed) return;
    const st = getState();
    if (!calloutScope(st)) return;
    const name = card && typeof card.name === 'string' ? card.name : '';
    if (!name) return;
    addLine(`contract:${card && card.contractId}`, `LINE CONTRACT · ${name}`, '',
      calloutNow(), CALLOUT_TTL_MS, false);
    spoken = `Line contract, ${name}.`;
    sr.textContent = spoken;
    wake();
  }

  function onBridgeTick(p) {
    if (destroyed) return;
    const st = getState();
    const scope = calloutScope(st);
    if (!scope) return;
    // In a run the meter's notches already carry the bridge; the line is the adventure's read.
    if (!scope.adventure) return;
    const name = p && typeof p.name === 'string' && p.name ? p.name : 'Bridge';
    addLine(`bridge:${p && p.tick}`, `BRIDGE · ${name}`, '', calloutNow(), CALLOUT_TTL_MS, false);
    spoken = `Bridge, ${name}.`;
    sr.textContent = spoken;
    wake();
  }

  function renderMeter(readout) {
    if (!readout) {
      if (!meter.hidden) meter.hidden = true;
      return;
    }
    if (meter.hidden) meter.hidden = false;
    const multText = `×${readout.multiplier.toFixed(2)}`;
    if (mult.textContent !== multText) mult.textContent = multText;
    const namesText = readout.names.join(' → ');
    if (namesLine.textContent !== namesText) namesLine.textContent = namesText;
    if (!Number.isNaN(readout.windowFrac)) scaleFill.style.setProperty('--sf-stuntcall-w', readout.windowFrac.toFixed(3));
    const ptsText = `${readout.points} raw`;
    if (ptsCell.textContent !== ptsText) ptsCell.textContent = ptsText;
    const windowText = `${readout.windowLeftS.toFixed(1)}s window`;
    if (windowCell.textContent !== windowText) windowCell.textContent = windowText;
    const bankedText = `${readout.banked} banked`;
    if (bankedCell.textContent !== bankedText) bankedCell.textContent = bankedText;
    // The two bridge notches sit at the 5 s and 6.5 s marks of the earned window (300/480 ticks).
    const windowTotal = readout.windowLeftS > 0 ? (readout.windowLeftS / readout.windowFrac) : 0;
    for (let i = 0; i < notches.length; i += 1) {
      const at = (5 + 1.5 * (i + 1)) - 1.5; // 5.0 s and 6.5 s
      const show = readout.bridges > i && windowTotal > at && readout.windowFrac > 0;
      const display = show ? '' : 'none';
      if (notches[i].style.display !== display) notches[i].style.display = display;
      if (show) notches[i].style.left = `${Math.min(99, (at / windowTotal) * 100).toFixed(1)}%`;
    }
  }

  /** The whole render step. `now` is wall ms (performance.now scale). Returns true while alive. */
  function update(now) {
    if (destroyed) return false;
    const st = getState();
    const scope = calloutScope(st);
    if (!scope) {
      root.hidden = true;
      return false;
    }
    // FB-012 — the chain meter is Crucible-only; adventure speaks through the callout lines.
    const combo = !scope.adventure && st.stunts && typeof st.stunts === 'object'
      ? st.stunts.combo : null;
    const readout = comboReadout(combo, st.tick);
    pruneLines(Number.isFinite(Number(now)) ? Number(now) : wallNow());
    const hasLines = lineNodes.size > 0;
    root.hidden = !hasLines && !readout;
    if (root.hidden) return false;
    renderMeter(readout);
    return true;
  }

  function wake() {
    if (destroyed || frameOff || typeof requestAnimationFrame !== 'function') return;
    // The ORRERY scheduler drops a listener whose step returns false, so clear the stale handle
    // here — otherwise the layer could never re-arm after its first dark frame.
    frameOff = onFrame((now) => {
      const keep = update(typeof now === 'number' ? now : wallNow());
      if (!keep && frameOff) { frameOff(); frameOff = null; }
      return keep;
    });
  }

  const unsubs = [];
  // word -> { count, until } — the physics-cause counters that ride the same TTL the
  // line does, so "SLAMMED ×4" is four kills inside one beat, not a lifetime total.
  const causeRuns = new Map();
  function onSwarmKill(p) {
    if (destroyed) return;
    const st = getState();
    const scope = calloutScope(st);
    // Runs only: the word stream is swarm-authored, and adventure has no swarm bus events.
    if (!scope || scope.adventure) return;
    const word = p && p.word;
    if (!SWARM_CAUSE_WORDS.has(word)) return;
    const now = calloutNow();
    let rec = causeRuns.get(word);
    if (!rec || rec.until <= now) rec = { count: 0 };
    rec.count += 1;
    rec.until = now + CALLOUT_TTL_MS;
    causeRuns.set(word, rec);
    addLine(`kc:${word}`, word, rec.count > 1 ? `×${rec.count}` : '', now, CALLOUT_TTL_MS, false);
    spoken = rec.count > 1 ? `${word.toLowerCase()}, ${rec.count} in a row` : word.toLowerCase();
    sr.textContent = spoken;
    wake();
  }
  if (bus && typeof bus.on === 'function') {
    unsubs.push(bus.on('stunt:trickDetected', (t) => onTrick(t)));
    unsubs.push(bus.on('stunt:trickAmended', (t) => onTrick(t)));
    unsubs.push(bus.on('stunt:styleBanked', (b) => onBank(b)));
    unsubs.push(bus.on('massline:selfSling', (payload) => {
      if (!calloutScope(getState())) return;
      const whole = payload && payload.selfSlingBonusDv;
      addLine('self-sling', selfSlingCalloutText(whole), '', calloutNow(), CALLOUT_TTL_MS, false);
    }));
    // FB-014 — the minted right, its claim, the completed line contract and the combo bridge
    // tick were emit-only. The callout column is their eye; the ship ledger (FB-014's projector)
    // is their record.
    unsubs.push(bus.on('stunt:salvageRights', (p) => onSalvageRights(p)));
    unsubs.push(bus.on('stunt:salvageRightsClaimed', (p) => onSalvageRightsClaimed(p)));
    unsubs.push(bus.on('stunt:lineContractCompleted', (p) => onLineContract(p)));
    unsubs.push(bus.on('stunt:bridge', (p) => onBridgeTick(p)));
    // SWARM-03 — the physics cause tag, on the lane that already names tricks.
    unsubs.push(bus.on('swarm:killPopup', (p) => onSwarmKill(p)));
  }

  return {
    root,
    update,
    active: () => !destroyed && !root.hidden,
    destroy() {
      destroyed = true;
      if (frameOff) { frameOff(); frameOff = null; }
      for (const off of unsubs) {
        if (typeof off === 'function') off();
      }
      unsubs.length = 0;
      if (root.parentNode) root.parentNode.removeChild(root);
    },
  };
}

/* --- the crucible.js mount. -------------------------------------------------------------------
 * The door mounts the layer before a run starts and the results screen releases it when the run
 * is fully told; both are crucible.js's own surfaces, so the flight HUD stays untouched. Between
 * the two, the layer lives on its own bus subscriptions and hides itself whenever the scope gate
 * (live survival run, flight mode, nothing modal) does not hold. */

let liveCallout = null;

/** Idempotent mount used by the Crucible door and results screens. */
export function ensureStuntCallout(ctx) {
  if (liveCallout) return liveCallout;
  liveCallout = createStuntCallout({
    state: ctx && ctx.state,
    bus: ctx && ctx.bus,
  });
  return liveCallout;
}

/** Release the mount (results screen dispose). Dormant-after-menu sessions re-ensure on next door. */
export function releaseStuntCallout() {
  if (!liveCallout) return;
  liveCallout.destroy();
  liveCallout = null;
}

/** Test seam: collect the layer's visible text in DOM order. */
export function calloutTextFor(root) {
  return collectText(root, []).join(' ');
}
