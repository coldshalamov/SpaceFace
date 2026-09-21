// src/ui/powerRail.js — J06 The Power Rail (build_map §11.12).
//
// The permanent bottom-centre 1–9 rank, with a dedicated bomb bay socket. This is the direct answer to the
// owner's complaint that they "can't look at the HUD and see the big game": today `Digit4`–`Digit8`
// fire five real physics powers (mass seed, well, repulsor, clearing cone, skim collector) and two
// of them have ZERO references anywhere in `src/ui/`. The powers shipped; the shelf to put them on
// never did. Nothing here invents a new verb — it surfaces the ones already wired.
//
// THE BANDS ARE A PROMISE ABOUT CONSEQUENCE, not a grouping of convenience:
//   ORDNANCE  (1–3) instantaneous; leaves nothing behind.
//   FIELDWORK (4–6) spawns a persistent bounded object you must later live with.
//   RIG       (7–8) ship-attached sustained toggle; it is on until you turn it off.
//   BAY       (9)   released drifting ordnance; shows actual deployed count and selected readiness.
// A verb that breaks its band's promise belongs in a different band.
//
// ── Two design rules that are load-bearing ──────────────────────────────────────────────────────
//
// 1. NO rAF, EVER. `check:ui-frame-sleep` asserts the UI stops doing frame work at rest, and a
//    nine-slot rail redrawing cooldown sweeps every frame is exactly the kind of thing that keeps a
//    tab awake forever. The radial sweep is an SVG `stroke-dashoffset` CSS animation whose duration
//    is written ONCE when the cooldown starts; the compositor runs it and JS never ticks. When
//    nothing is cooling, this module does no work at all.
//
// 2. KEY LABELS COME FROM THE BINDING TABLE. Every flight verb here is rebindable
//    (`src/systems/input.js`), so a hardcoded "4" would lie the moment a player remapped it. Slots
//    render the label their action actually resolves to, and an unbound action renders as an empty
//    socket rather than a phantom key.
//
// ── The slot-claim contract ─────────────────────────────────────────────────────────────────────
// Modal prompts need the number row (`Digit1`–`3` are already prompt answers). Rather than have
// prompts and the rail race for the same keys, a prompt CLAIMS the slots it needs:
//
//   hud:slotClaim  { claimId, slots:[1..9], answers:[label], expiresAt, mode:'SINGLE'|'PARTIAL'|'FULL' }
//   hud:slotRelease{ claimId }
//
//   SINGLE  — one slot is borrowed; the rest stay live.
//   PARTIAL — the listed slots are borrowed; unlisted slots stay live.
//   FULL    — the whole rail is borrowed; every slot shows the prompt's answers or goes inert.
//
// Claims stack; the most recent claim owns a contested slot, and releasing it restores whatever was
// underneath. A claim with a past `expiresAt` is dropped on the next render rather than trusted, so
// a prompt that dies without releasing cannot wedge the rail permanently.

import { BOMB_DRIFT, bombDef } from '../data/bombs.js';
import { fhGlyph } from './views/fhGlyphs.js';
import { repulsionTrapFitted } from '../systems/impulseCharges.js';
import { indexedTypeScan } from '../world/livingWorldViews.js';

export const BAND_ORDNANCE = 'ORDNANCE';
export const BAND_FIELDWORK = 'FIELDWORK';
export const BAND_RIG = 'RIG';
export const BAND_BAY = 'BAY';

export const CLAIM_SINGLE = 'SINGLE';
export const CLAIM_PARTIAL = 'PARTIAL';
export const CLAIM_FULL = 'FULL';

/** Slot states, most severe last — `worstState` uses this order to resolve conflicts. */
export const SLOT_STATES = ['ready', 'armed', 'cooling', 'unaffordable', 'locked', 'empty'];

// The rank. `action` names an entry in the input binding table; `null` is an authored empty socket
// (a slot the design reserves but nothing fills yet) — deliberately visible, because a gap the
// player can SEE reads as "this fills in later", while a hidden gap reads as "there is nothing".
// Glyphs name the kit's produced filled family (`src/ui/views/fhGlyphs.js`, drawn from
// `assets/ui/kit/icons/24/`). That family carries a mark for every verb here — seed, well, repel,
// cone, skim and line exist nowhere else in the game — because it was drawn for these sockets. The
// old values borrowed generic menu line-icons (`danger` twice, `target` for Seed, `boost` for
// Repel); two slots wearing the same outline is precisely what made the rail unreadable at a glance.
export const RAIL_SLOTS = Object.freeze([
  // Reserved sockets 1–3 stay nameless under their band pill: the band label twelve pixels above
  // already says ORDNANCE, and three stacked "Ordnance" micro-labels truncated to "ORD_" junk.
  { index: 1, band: BAND_ORDNANCE, action: 'chargeThrow', name: 'Charge', glyph: 'munitions' },
  { index: 2, band: BAND_ORDNANCE, action: 'chargeDetonate', name: 'Blast', glyph: 'blast' },
  { index: 3, band: BAND_ORDNANCE, action: 'tether', name: 'Line', glyph: 'tether' },
  { index: 4, band: BAND_FIELDWORK, action: 'deployMassSeed', name: 'Seed', glyph: 'seed' },
  { index: 5, band: BAND_FIELDWORK, action: 'deployWell', name: 'Well', glyph: 'well' },
  // Display name shortened to fit the slot's 38px label row untruncated; the verb family
  // (deployRepulsor, help text) keeps the full "Repulsor" name.
  { index: 6, band: BAND_FIELDWORK, action: 'deployRepulsor', name: 'Repel', glyph: 'repel' },
  { index: 7, band: BAND_RIG, action: 'toggleClearingCone', name: 'Cone', glyph: 'cone' },
  { index: 8, band: BAND_RIG, action: 'toggleSkimCollector', name: 'Skim', glyph: 'skim' },
  { index: 9, band: BAND_BAY, action: 'dropBomb', name: 'Bomb', glyph: 'weapon' },
]);

const BANDS = [BAND_ORDNANCE, BAND_FIELDWORK, BAND_RIG, BAND_BAY];

// Sweep ring geometry. r=13 in a 32-box leaves room for the 1.6 stroke without clipping.
//
// SWEEP_CIRCUMFERENCE is duplicated in the `@keyframes sf-pslot-sweep` rule in uiRoot.js, because
// CSS keyframes cannot read a JS constant. If the two drift apart the sweep silently stops at the
// wrong angle — a cooldown that looks finished while the slot is still cooling. `power-rail.test`
// reads the stylesheet and pins them together rather than trusting the comment.
export const SWEEP_R = 13;
export const SWEEP_CIRCUMFERENCE = 2 * Math.PI * SWEEP_R;

/**
 * Turn a KeyboardEvent `code` into the label a player recognises. `Digit4` is "4", not "Digit4",
 * and a chord like `Shift+O` survives intact.
 */
export function codeToLabel(code) {
  const raw = String(code == null ? '' : code);
  if (!raw) return '';
  const digit = /^Digit(\d)$/.exec(raw);
  if (digit) return digit[1];
  const numpad = /^Numpad(\d)$/.exec(raw);
  if (numpad) return `Num${numpad[1]}`;
  if (raw === 'Comma') return ',';
  if (raw === 'Period') return '.';
  const letter = /^Key([A-Z])$/.exec(raw);
  if (letter) return letter[1];
  return raw;
}

/**
 * Resolve each slot's live key label from a binding table shaped like input.js's
 * `{ actionName: ['Digit4', ...] }`. An action with no binding returns '' so the slot can render as
 * an empty socket instead of claiming a key that does nothing.
 */
export function resolveSlotLabels(bindings) {
  const table = bindings || {};
  const out = {};
  for (const slot of RAIL_SLOTS) {
    if (!slot.action) { out[slot.index] = ''; continue; }
    const codes = table[slot.action];
    const code = Array.isArray(codes) ? codes[0] : codes;
    out[slot.index] = codeToLabel(code);
  }
  return out;
}

/** Most severe of two states, per SLOT_STATES order. */
export function worstState(a, b) {
  const ia = SLOT_STATES.indexOf(a);
  const ib = SLOT_STATES.indexOf(b);
  if (ia < 0) return b;
  if (ib < 0) return a;
  return ia >= ib ? a : b;
}

/**
 * Fold the active claims over the base slot model.
 *
 * Exported and pure so the contract can be tested without a DOM: claim precedence is the part most
 * likely to break subtly, and a headless test beats driving nine buttons through a browser.
 */
export function applyClaims(slotState, claims, now) {
  const live = (claims || [])
    .filter((c) => c && c.claimId)
    // A claim whose deadline has passed is dropped rather than honoured: a prompt that dies without
    // releasing must not be able to hold the rail hostage.
    .filter((c) => !(Number.isFinite(c.expiresAt) && c.expiresAt <= now));
  if (!live.length) return { slots: slotState, claimed: false, mode: null };

  const out = slotState.map((s) => ({ ...s }));
  let mode = null;
  // Later claims win a contested slot, so a prompt opened on top of a prompt owns the keys.
  for (const claim of live) {
    mode = claim.mode || CLAIM_PARTIAL;
    const answers = Array.isArray(claim.answers) ? claim.answers : [];
    const targets = claim.mode === CLAIM_FULL
      ? out.map((s) => s.index)
      : (Array.isArray(claim.slots) ? claim.slots : []);
    targets.forEach((slotIndex, i) => {
      const slot = out.find((s) => s.index === slotIndex);
      if (!slot) return;
      slot.claimedBy = claim.claimId;
      slot.answer = answers[i] != null ? answers[i] : null;
      // A FULL claim blanks anything it has no answer for, so the rail cannot show a live power
      // beside a prompt answer and imply both keys do something.
      slot.state = slot.answer != null ? 'ready' : (claim.mode === CLAIM_FULL ? 'empty' : slot.state);
    });
  }
  return { slots: out, claimed: true, mode };
}

/**
 * Read the live slot model out of game state.
 *
 * Pure and exported so the rail's honesty is testable without a running sim — this function is the
 * one place where "what the HUD claims" and "what the systems actually own" have to agree, and each
 * field below is read from that system's real writer, not from a HUD-local mirror:
 *
 *   4 seed      state.player.massSeed.cooldownUntil   (massSeed.js, seconds)
 *   5 well      state.fields.cooldowns.well           (fields.js, seconds, runtime-only)
 *   6 repulsor  state.fields.cooldowns.repulsor       (fields.js, seconds, runtime-only)
 *   7 cone      state.fields.coneActive               (fields.js, boolean latch)
 *   8 skim      per-site rec.collectorOn              (planetRuntime.js)
 *
 * The skim collector is deliberately `locked` away from a planet rather than `ready`: it is
 * site-scoped state, and a rail that showed it ready in open space would be advertising a key that
 * does nothing. `nowS` is sim seconds, matching the cooldown clocks.
 */
export function readRailModel(state, nowS) {
  const s = state || {};
  const player = s.player || {};
  const fields = s.fields || {};
  const cooldowns = fields.cooldowns || {};
  const now = Number.isFinite(nowS) ? nowS : 0;

  const cooling = (until) => {
    const readyAt = Number(until);
    if (!Number.isFinite(readyAt) || readyAt <= now) return null;
    return { state: 'cooling', cooldownMs: Math.max(0, (readyAt - now) * 1000) };
  };

  const seedCd = cooling(player.massSeed && player.massSeed.cooldownUntil);
  const wellCd = cooling(cooldowns.well);
  const repCd = cooling(cooldowns.repulsor);
  const hull = s.entities?.get?.(s.playerId);
  const charges = player.cargo?.items?.cmdty_impulse_charge || 0;
  const throwCd = Math.max(0, hull?.data?.impulseCharges?.throwCdT || 0);
  // Typed `charges` bucket, not the fat entityList (rocks/FX/wrecks all live there). The per-entity
  // predicate stays because the index-less fallback path returns the fat list.
  const armed = indexedTypeScan(s, 'charges').some(e => e.alive && e.type === 'charge'
    && e.data?.ownerId === s.playerId && e.data?.armed);

  const bay = readBombBayModel(s, now);
  return {
    1: { name: `${repulsionTrapFitted(s) ? 'Trap' : 'Charge'} ${charges}`,
      state: charges <= 0 ? 'empty' : throwCd > 0 ? 'cooling' : 'ready', cooldownMs: throwCd * 1000 },
    2: { state: armed || bay.armedCount > 0 ? 'armed' : 'empty',
      description: 'Detonate your armed bombs and the armed charge network. Active bomb fields finish normally.' },
    3: { state: player.tether?.active ? 'armed' : 'ready' },
    4: seedCd || { state: 'ready' },
    5: wellCd || { state: 'ready' },
    6: repCd || { state: 'ready' },
    7: { state: fields.coneActive ? 'armed' : 'ready' },
    8: skimSlotState(s),
    9: bay,
  };
}

/** Derived only: this HUD never owns ammo, readiness, selection or countdown clocks.
 * PQ-205.03: the socket shows the LOADED rack only. A bag with no `rack` (hand-built
 * fixtures that predate the fitted rack) reads exactly as it did before. */
export function readBombBayModel(state, nowS) {
  const rt = state.bombs || {};
  const cells = rt.rack && Array.isArray(rt.rack.cells) ? rt.rack.cells : null;
  const loaded = cells ? cells.filter((c) => c && c.count > 0) : null;
  const cell = loaded ? loaded.find((c) => c.id === rt.selectedId) || loaded[0] : null;
  const def = cells ? (cell ? bombDef(cell.id) : null) : bombDef(rt.selectedId);
  let deployed = 0, armedCount = 0, fields = 0, worldCount = 0;
  const index = state.entityIndex;
  const source = index?.__spacefaceEntityIndexV1 && index.ready === true && Array.isArray(index.bombs)
    ? index.bombs : state.entityList || [];
  for (const e of source) {
    if (!e?.alive || e.type !== 'bomb') continue;
    worldCount++;
    if (e.data?.ownerId !== state.playerId) continue;
    deployed++;
    if (e.data.phase === 'field') fields++;
    if (e.data.phase === 'drift' && nowS >= e.data.armedAt) armedCount++;
  }
  const until = def ? Math.max(rt.cooldownUntil || 0, rt.cooldowns?.[def.id] || 0) : 0;
  const full = deployed >= BOMB_DRIFT.maxActive || worldCount >= BOMB_DRIFT.maxWorldActive;
  const owner = state.entities?.get?.(state.playerId);
  const locked = !owner?.alive || owner.flags?.docked || state.mode !== 'flight';
  if (cells && !def) {
    return {
      name: 'Bay', glyph: 'weapon',
      state: locked ? 'locked' : 'empty',
      cooldownMs: 0, deployed, armedCount, fields,
      badge: 'RACK EMPTY',
      description: `Bomb rack empty — re-arm at a station shipworks. ${armedCount} armed; ${fields} active fields.`,
    };
  }
  return {
    name: def.shortName, glyph: def.field?.kind === 'singularity' ? 'well' : 'weapon',
    state: locked || full ? 'locked' : until > nowS ? 'cooling' : 'ready',
    cooldownMs: Math.max(0, until - nowS) * 1000, deployed, armedCount, fields,
    badge: `BAY ${deployed}/${BOMB_DRIFT.maxActive}`,
    // Rack honesty: the loaded magazine count rides the description, never the name.
    description: `${def.name}${cell ? ` ×${cell.count} loaded` : ''}. ${def.sentence} ${armedCount} armed; ${fields} active fields. Friendly fire applies.`,
  };
}

function skimSlotState(state) {
  const rt = state.planetRuntime || state.planet || null;
  if (!rt) return { state: 'locked' };
  const rec = rt.record || rt.current || rt;
  if (!rec || typeof rec.collectorOn === 'undefined') return { state: 'locked' };
  return { state: rec.collectorOn ? 'armed' : 'ready' };
}

function sweepSvg() {
  return `<svg class="sf-pslot__sweep" viewBox="0 0 32 32" aria-hidden="true" focusable="false">`
    + `<circle cx="16" cy="16" r="${SWEEP_R}" `
    + `stroke-dasharray="${SWEEP_CIRCUMFERENCE.toFixed(2)}" `
    + `stroke-dashoffset="0"/></svg>`;
}

function escapeRailText(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('\"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

/** A key cap is two or three characters wide: long key names print short (the accessible name keeps
 *  the full one). SPACE touched the socket's glyph. */
const KEY_CAP_SHORT = Object.freeze({ SPACE: 'SPC', SHIFT: 'SHF', 'L-SHIFT': 'LSH', 'R-SHIFT': 'RSH', CTRL: 'CTL', ENTER: 'ENT', ESCAPE: 'ESC', BACKSPACE: 'BSP', DELETE: 'DEL', CAPSLOCK: 'CAP' });
function capLabel(label) {
  const text = String(label || '');
  if (text.length <= 3) return text;
  const upper = text.toUpperCase();
  if (KEY_CAP_SHORT[upper]) return KEY_CAP_SHORT[upper];
  // Numpad rebinds print `Num4` (4 chars): keeping the digit beats truncating every pad key to NUM.
  const numpad = /^NUM(\d)$/.exec(upper);
  if (numpad) return 'N' + numpad[1];
  return upper.slice(0, 3);
}

function slotMarkup(slot, label) {
  const name = slot.answer != null ? slot.answer : slot.name;
  // A claimed socket is answering a prompt, so it shows the answer word and no verb mark: a glyph
  // under a borrowed key would advertise a power the press will not fire.
  const art = slot.answer != null ? '' : fhGlyph(slot.glyph, 24);
  const described = name
    ? `${name}${label ? `, key ${label}` : ''}, ${slot.state}`
    : `${label ? `key ${label}` : 'unbound socket'}, ${slot.state}`;
  return `<button type="button" class="sf-pslot" data-slot="${slot.index}" data-state="${slot.state}"`
    + ` data-band="${slot.band}" tabindex="-1" aria-label="${escapeRailText(described + (slot.description ? '. ' + slot.description : ''))}" title="${escapeRailText(slot.description || described)}">`
    + `<span class="sf-pslot__key" aria-hidden="true">${capLabel(label) || '·'}</span>`
    + `<span class="sf-pslot__art" aria-hidden="true">${art}</span>`
    + sweepSvg()
    + (name ? `<span class="sf-pslot__name">${name}</span>` : '')
    + `</button>`;
}

/**
 * Build the rail. Returns a controller; the caller owns mounting `el` and calling `update`.
 *
 * `update` is idempotent and does no work when nothing changed, so parking the game on a menu costs
 * nothing. It is safe to call every frame, but it does not need to be called every frame.
 */
export function createPowerRail(options = {}) {
  const doc = options.document || (typeof document !== 'undefined' ? document : null);
  if (!doc) throw new Error('createPowerRail needs a document');

  const el = doc.createElement('div');
  el.className = 'sf-prail';
  el.setAttribute('role', 'group');
  el.setAttribute('aria-label', 'Power rail');

  let labels = resolveSlotLabels(options.bindings);
  let cycleLabel = codeToLabel(options.bindings?.cycleBomb?.[0]) || 'unbound';
  let claims = [];
  let lastSignature = '';
  const slotNodes = new Map();

  function baseSlots(model) {
    const byIndex = model || {};
    return RAIL_SLOTS.map((slot) => {
      const given = byIndex[slot.index] || {};
      // No binding means no key to press, so the socket is empty regardless of what the sim thinks.
      const bound = Boolean(slot.action) && Boolean(labels[slot.index]);
      return {
        index: slot.index,
        band: slot.band,
        name: given.name || slot.name,
        glyph: given.glyph || slot.glyph,
        badge: given.badge || '',
        description: (given.description || '') + (slot.index === 9 ? ` Cycle: ${cycleLabel}. Detonate: ${labels[2] || 'unbound'}.` : ''),
        state: bound ? (given.state || 'ready') : 'empty',
        cooldownMs: Number(given.cooldownMs) || 0,
        answer: null,
        claimedBy: null,
      };
    });
  }

  function render(model, now) {
    const resolved = applyClaims(baseSlots(model), claims, now);
    // Signature covers everything that changes pixels EXCEPT cooldown remaining — that animates in
    // CSS, so letting it into the signature would rebuild the DOM every frame and defeat the point.
    const signature = resolved.slots
      .map((s) => `${s.index}:${s.state}:${s.answer == null ? s.name : `=${s.answer}`}:${labels[s.index]}:${s.glyph}:${s.badge}:${s.description}`)
      .join('|');
    if (signature === lastSignature) return;
    lastSignature = signature;

    // REMOVE the attribute when nothing is claimed. Setting it to '' still leaves `data-claimed=""`
    // in the DOM, which matches the `[data-claimed]` selector — so every slot name rendered in the
    // "prompt is borrowing this key" amber even on an idle rail.
    if (resolved.claimed) el.dataset.claimed = String(resolved.mode);
    else delete el.dataset.claimed;
    el.innerHTML = BANDS.map((band) => {
      const inBand = resolved.slots.filter((s) => s.band === band);
      return `<div class="sf-prail__band" data-band="${band}">`
        + `<span class="sf-prail__label">${band === BAND_BAY ? escapeRailText(inBand[0]?.badge || 'BAY') : band}</span>`
        + `<div class="sf-prail__slots">${inBand.map((s) => slotMarkup(s, labels[s.index])).join('')}</div>`
        + `</div>`;
    }).join('');

    slotNodes.clear();
    for (const node of el.querySelectorAll('[data-slot]')) {
      slotNodes.set(Number(node.getAttribute('data-slot')), node);
    }
    for (const slot of resolved.slots) startSweep(slot);
  }

  // Hand the cooldown to CSS. Writing `animation-duration` once and letting the compositor run the
  // dash sweep is what keeps this module off the frame loop entirely.
  function startSweep(slot) {
    const node = slotNodes.get(slot.index);
    if (!node) return;
    const ring = node.querySelector('.sf-pslot__sweep circle');
    if (!ring) return;
    if (slot.state === 'cooling' && slot.cooldownMs > 0) {
      ring.style.animation = 'none';
      void ring.getBoundingClientRect();
      ring.style.animation = `sf-pslot-sweep ${slot.cooldownMs}ms linear forwards`;
    } else {
      ring.style.animation = 'none';
    }
  }

  return {
    el,
    /** Refresh key labels after a rebind. */
    setBindings(bindings) { labels = resolveSlotLabels(bindings); cycleLabel = codeToLabel(bindings?.cycleBomb?.[0]) || 'unbound'; lastSignature = ''; },
    /** `model` is `{ [slotIndex]: { state, name, glyph, cooldownMs } }`. */
    update(model, now = 0) { render(model, now); },
    claim(payload) {
      if (!payload || !payload.claimId) return;
      claims = claims.filter((c) => c.claimId !== payload.claimId).concat([payload]);
      lastSignature = '';
    },
    release(claimId) {
      claims = claims.filter((c) => c.claimId !== claimId);
      lastSignature = '';
    },
    /** Test seam: the claims the rail currently believes are live. */
    activeClaims() { return claims.slice(); },
    destroy() { claims = []; slotNodes.clear(); el.remove(); },
  };
}
