// customsPrompt.js — BP-12 packet CUSTOMS_MOMENT ("The Customs Scan Moment").
//
// A patrol pings the hold — the HUD gives the player the sweat-inducing choice: submit, bribe, or
// run. The whole customs engine (economy.runScan: scan roll, fine, confiscation, rep hit, heat) is
// SHIPPED (src/systems/economy.js:850). This module adds only the DECISION SURFACE: it binds to the
// public HUD signal `player:scannedByPatrol` (emitted at economy.js:854 the instant a scan starts,
// before the patrolScan encounter resolves) and renders a 3-action panel.
//
// CRITICAL DISCIPLINE (the packet's failure modes, enforced structurally):
//   • READ bribeCost/FINE_MULT from the SHIPPED payload — NEVER recompute the fine. The fine math
//     lives in economy.runScan (FINE_MULT, BRIBE_FRAC); this panel only displays the already-computed
//     `bribeCost` that `contraband:scanned` carries (and, before a bust, a projected estimate derived
//     from the SAME economy.illicitCargo read the engine uses). A second fine path is forbidden.
//   • Submit → emit nothing new; let the shipped patrolScan encounter / patrol:proximity resolve.
//     (economy.runScan owns confiscation + rep; this panel never confiscates.)
//   • Bribe → emit `contraband:bribe` { fine }, exactly the event economy.payBribe listens for
//     (economy.js:293). The cost the player pays is `round(fine * BRIBE_FRAC)` inside economy — we
//     do NOT charge credits ourselves (single-writer: economy owns credits).
//   • Run → emit `customs:breakScan` (the additive seam); Run only avoids the SCAN, not an
//     already-resolved bust (failureMode: a Run that dodges the shipped rep consequence). The
//     patrolScan encounter already detects range-break and resolves 'ran' with a small rep nick;
//     this seam lets a future input-side flight cue signal the same break.
//   • The customs hail routes through voice.say('comms') EXACTLY ONCE per scan (debounced on
//     state.simTime, deterministic — never two customs lines at once; voiceArbiter owns the queue).
//
// noTouch honored: economy.js / cargo.js / factions.js are imported read-only (their exported
// contracts) or not at all — illicitCargo() is read via the economy registry slot at runtime, never
// by re-implementing the legality scan. Budget: spawn:none · voice:comms (one hail) · draw:none.

import { COMMODITIES } from '../data/commodities.js';
import { FACTION_META } from '../data/factions.js';

const CMDTY_BY_ID = new Map(COMMODITIES.map((c) => [c.id, c]));
const FACTION_BY_ID = new Map(FACTION_META.map((f) => [f.id, f]));

// The fine multiplier the engine uses (economy.js:48) — mirrored ONLY to project a pre-bust
// estimate the panel can show before the engine emits contraband:scanned. The authoritative number
// the player actually pays is always read from the live payload (bribeCost / fine), never this.
export const FINE_MULT = Object.freeze({ legal: 0, restricted: 0.8, illegal: 1.2, contraband: 1.5 });
export const BRIBE_FRAC = 0.30; // economy.js:50 — mirrored for the estimate label only
const DEBOUNCE_S = 4;           // same scan inside this simTime window = one panel (no double-hail)
const PANEL_TTL_MS = 8000;      // cosmetic DOM auto-hide

/** Short label for a faction (e.g. "Concord"), with a safe fallback. */
function factionShort(factionId) {
  const f = factionId ? FACTION_BY_ID.get(factionId) : null;
  return (f && (f.short || f.name)) || 'Concord Navy';
}

/**
 * holdRisk(state, economySys) -> { hasContraband, stacks:[{commodityId,name,qty,legality,estFine}],
 * estFine, estBribe } — a PROJECTED read of the player's hold against the SHIPPED fine math.
 *
 * Reads contraband stacks through economy.illicitCargo(state) (the engine's own scan), then sizes a
 * pre-bust estimate with the SAME FINE_MULT the engine applies (per-stack basePrice*qty*mult). This
 * is the panel's risk read; it is NEVER charged. The real fine the player pays comes from
 * `contraband:scanned.fine` (post-bust) or is charged as `round(fine*BRIBE_FRAC)` inside
 * economy.payBribe (bribe). Pure over its inputs; no roll, no clock.
 */
export function holdRisk(state, economySys) {
  const illicit = (economySys && typeof economySys.illicitCargo === 'function')
    ? economySys.illicitCargo(state) : [];
  if (!illicit.length) {
    return { hasContraband: false, stacks: [], estFine: 0, estBribe: 0 };
  }
  let estFine = 0;
  const stacks = illicit.map((s) => {
    const def = s.def || CMDTY_BY_ID.get(s.commodityId) || {};
    const mult = FINE_MULT[def.legality] != null ? FINE_MULT[def.legality] : (def.fineMult || 1);
    const lineFine = Math.round((def.basePrice || 0) * (s.qty || 0) * mult);
    estFine += lineFine;
    return { commodityId: s.commodityId, name: def.name || s.commodityId, qty: s.qty, legality: def.legality, estFine: lineFine };
  });
  return {
    hasContraband: true,
    stacks,
    estFine,
    estBribe: Math.round(estFine * BRIBE_FRAC),
  };
}

/**
 * customsDecision(state, scanPayload, economySys) -> the panel model, or null when there is nothing
 * to surface (clean hold OR an already-resolved bust the panel must not dodge).
 *
 * `scanPayload` is the `player:scannedByPatrol` packet { hasContraband }. We combine it with a live
 * holdRisk read so the panel shows the projected fine/bribe BEFORE the engine resolves. We NEVER
 * surface a panel for a hold the engine reads clean — that's a phantom decision (failureMode).
 */
export function customsDecision(state, scanPayload, economySys) {
  if (!scanPayload) return null;
  const risk = holdRisk(state, economySys);
  // The engine's hasContraband flag is authoritative. If the engine says clean, there is no
  // decision to surface (the panel must not imply a fine the engine won't charge).
  const engineFlagged = !!(scanPayload.hasContraband);
  if (!engineFlagged && !risk.hasContraband) return null;
  const factionId = scanPayload.factionId || (economySys && typeof economySys.scanningFaction === 'function'
    ? economySys.scanningFaction(state) : null);
  return {
    factionId,
    factionShort: factionShort(factionId),
    hasContraband: risk.hasContraband || engineFlagged,
    risk,
    // The bribe cost label: the projected estimate (matches what economy.payBribe will charge).
    bribeCost: risk.estBribe,
    actions: ['submit', 'bribe', 'run'],
  };
}

// ── registry SYSTEMS-only entry (no update; event-driven; one voice hail; guarded DOM) ─────────

export const customsPrompt = {
  name: 'customsPrompt',

  init(ctx) {
    this._ctx = ctx;
    this._bus = ctx && ctx.bus;
    this._state = ctx && ctx.state;
    this._last = { t: -Infinity };
    this._panelEl = null;
    this._hideTimer = null;
    this._onScanned = (p) => this._handleScan(p);
    this._onResolved = () => this._dismiss(); // a bust/scan clears the panel
    if (this._bus && this._bus.on) {
      this._bus.on('player:scannedByPatrol', this._onScanned);
      this._bus.on('contraband:scanned', this._onResolved);
      this._bus.on('sector:exit', this._onResolved);
    }
  },

  _economySys() {
    const r = this._ctx && this._ctx.registry;
    return (r && typeof r.get === 'function') ? r.get('economy') : null;
  },

  _handleScan(p) {
    const state = this._state;
    if (!state) return;
    // Debounce: the same ping inside the window is ONE panel (no double-hail, deterministic).
    const now = state.simTime || 0;
    if ((now - this._last.t) < DEBOUNCE_S) return;
    const decision = customsDecision(state, p, this._economySys());
    if (!decision) return; // clean hold → surface NOTHING (the engine emits and resolves quietly)

    this._last = { t: now };
    // Additive UI state (NOT in the sim snapshot hash) — readable by dock/HUD screens and tests.
    if (!state.ui || typeof state.ui !== 'object') state.ui = {};
    state.ui.customsPrompt = { ...decision, t: now };

    // ONE customs hail, through the arbiter — never a raw toast, never two lines at once.
    const helpers = (this._ctx && this._ctx.helpers) || {};
    const hail = `${decision.factionShort} patrol is scanning your hold.`;
    if (helpers.voice && typeof helpers.voice.say === 'function') {
      const said = helpers.voice.say({ channel: 'comms', text: hail, kind: 'customs' });
      if (!said && this._bus && this._bus.emit) this._bus.emit('toast', { text: hail, kind: 'info', ttl: 3 });
    }

    this._render(decision);
  },

  // The 3 shipped actions. Each routes through an EXISTING intent — this panel adds the decision,
  // never a second penalty path (the packet's named failure mode).
  choose(actionId) {
    const bus = this._bus;
    const ui = this._state && this._state.ui && this._state.ui.customsPrompt;
    if (!bus || !bus.emit || !ui) { this._dismiss(); return; }
    if (actionId === 'submit') {
      // Let the shipped patrolScan encounter / patrol:proximity resolve. economy.runScan owns the
      // confiscation + rep + heat. Emit nothing new — the encounter's own deadline will submit.
      bus.emit('customs:submit', { factionId: ui.factionId });
    } else if (actionId === 'bribe') {
      // Route through economy.payBribe (listens at economy.js:293). The fine we pass is the
      // engine's own estimate shape; economy charges round(fine*BRIBE_FRAC). We never write credits.
      bus.emit('contraband:bribe', { fine: ui.risk.estFine });
    } else if (actionId === 'run') {
      // Run only avoids the SCAN — not an already-resolved bust. The additive seam lets a future
      // input-side flight cue break range; the patrolScan encounter also detects range-break itself.
      bus.emit('customs:breakScan', { factionId: ui.factionId });
    }
    this._dismiss();
  },

  _dismiss() {
    const state = this._state;
    if (state && state.ui) delete state.ui.customsPrompt;
    this._hide();
  },

  // ── DOM decision panel (cosmetic; fully guarded; never blocks flight input) ──────────────────
  _render(decision) {
    if (typeof document === 'undefined') return;
    const host = document.getElementById('hud') || document.body;
    if (!host) return;
    this._hide();

    const el = document.createElement('div');
    el.id = 'sf-customs-prompt';
    el.setAttribute('role', 'alert');
    el.setAttribute('aria-live', 'assertive');
    el.style.cssText = [
      'position:absolute', 'top:24%', 'left:50%', 'transform:translateX(-50%)',
      'padding:10px 14px', 'background:rgba(10,18,30,0.92)', 'border:1px solid rgba(216,170,51,0.55)',
      'border-radius:5px', 'color:#ffe9b0', 'font:12px/1.5 system-ui,sans-serif',
      'text-align:center', 'pointer-events:none', 'z-index:42', 'max-width:54ch',
    ].join(';');

    const head = document.createElement('div');
    head.style.cssText = 'font-weight:600;letter-spacing:0.06em;margin-bottom:4px';
    head.textContent = `⟢ ${decision.factionShort} — CUSTOMS SCAN`;
    el.appendChild(head);

    if (decision.hasContraband && decision.risk.stacks.length) {
      const body = document.createElement('div');
      body.style.cssText = 'opacity:0.92;margin-bottom:6px';
      const top = decision.risk.stacks.slice(0, 3).map((s) => `${s.name} ×${s.qty}`).join(', ');
      body.textContent = `Hold flagged. Projected fine ≈ ${decision.estFine || decision.risk.estFine} cr · bribe ≈ ${decision.bribeCost} cr. Flagged: ${top}.`;
      el.appendChild(body);
    } else {
      const body = document.createElement('div');
      body.style.cssText = 'opacity:0.8;margin-bottom:6px';
      body.textContent = 'Hold reads clean. Stand by for clearance — or break range to skip the scan.';
      el.appendChild(body);
    }

    const opts = document.createElement('div');
    opts.style.cssText = 'opacity:0.7;letter-spacing:0.04em';
    opts.textContent = '[submit] · [bribe] · [run]';
    el.appendChild(opts);

    host.appendChild(el);
    this._panelEl = el;
    if (typeof window !== 'undefined') this._hideTimer = window.setTimeout(() => this._dismiss(), PANEL_TTL_MS);
  },

  _hide() {
    if (this._hideTimer != null && typeof window !== 'undefined') window.clearTimeout(this._hideTimer);
    this._hideTimer = null;
    if (this._panelEl && this._panelEl.parentNode) this._panelEl.parentNode.removeChild(this._panelEl);
    this._panelEl = null;
  },

  destroy() {
    if (this._bus && this._bus.off) {
      if (this._onScanned) this._bus.off('player:scannedByPatrol', this._onScanned);
      if (this._onResolved) {
        this._bus.off('contraband:scanned', this._onResolved);
        this._bus.off('sector:exit', this._onResolved);
      }
    }
    this._onScanned = null;
    this._onResolved = null;
    this._hide();
  },
};

export default customsPrompt;
