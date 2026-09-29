// jumpNotice.js — the jump verb answers when the world refuses it (WF-14).
//
// `world:requestJump` validates synchronously on the bus: an accepted request answers with
// `jump:chargeStart`, a refusal with `jump:chargeAbort {reason, ...numbers}`. Until now no UI
// file read a single reason string — a refused jump was VFX-only, and the chart kept its
// success toast either way. This module is the refusal's one voice: the reason plus the world's
// own numbers become one receipt line (a fact/result rides the receipt lane per
// design/HUD_FLIGHT_ATTENTION.md; the alarm floor stays with alerts.js).
//
// Pure and DOM-free, house style of wantedReason.js / fuelReserveWarning.js. The Choice-C
// unfiled charge is deliberately excluded at the binder — that door's staged prompt owns its
// own moment.

export const JUMP_ABORT_TTL_S = 3.5;

/** One sim window in which repeated aborts of the same shape collapse to one line. */
const DEDUPE_WINDOW_S = 2;

const ABORT_LINE = Object.freeze({
  docked: 'Undock to jump',
  unknown_target: 'No such destination on the chart',
  busy: 'Drive is already charging',
  combat_lock: 'Jump held — break contact first',
  no_drive: 'No travel drive fitted',
  wormhole_locked: 'The wormhole is sealed',
  not_a_neighbor: 'No direct lane there — plot a course instead',
});

/** Reason + the world's numbers → one player sentence. Empty when there is nothing to say. */
export function jumpAbortText(payload) {
  const reason = String((payload && payload.reason) || '').trim();
  if (!reason) return '';
  if (reason === 'low_fuel') {
    const needed = Number(payload && payload.fuelNeeded);
    const held = Number(payload && payload.fuelHeld);
    if (Number.isFinite(needed) && needed > 0 && Number.isFinite(held)) {
      return `Jump needs ${needed} fuel — tank holds ${held}`;
    }
    if (Number.isFinite(held)) return `Jump needs more fuel — tank holds ${held}`;
    return 'Not enough fuel to make that jump';
  }
  if (reason === 'credits') {
    const needed = Number(payload && payload.creditsNeeded);
    const held = Number(payload && payload.creditsHeld);
    if (Number.isFinite(needed) && needed > 0 && Number.isFinite(held)) {
      return `Gate toll ${needed} cr — purse holds ${held} cr`;
    }
    return 'Not enough credits for the gate toll';
  }
  if (reason === 'cooldown') {
    const s = Number(payload && payload.cooldownS);
    return Number.isFinite(s) && s > 0 ? `Drive cooling — ${Math.ceil(s)}s` : 'Drive still cooling';
  }
  if (ABORT_LINE[reason]) return ABORT_LINE[reason];
  return `Jump refused — ${reason.replace(/_/g, ' ')}`;
}

/** The receipt shape the toast lane takes. Null when the payload says nothing. */
export function jumpAbortNotice(payload) {
  const text = jumpAbortText(payload);
  if (!text) return null;
  return { text, kind: 'warn', ttl: JUMP_ABORT_TTL_S };
}

/**
 * Dedupe: the same abort shape inside one sim window is ONE refusal, not a stutter — the bus is
 * synchronous, so a chart press and a route-follower handoff can refuse together. Same cap
 * discipline as stuntDetectionReceipt (hudAttention.js).
 */
export function jumpAbortReceipt(seen, state, payload) {
  const notice = jumpAbortNotice(payload);
  if (!notice) return null;
  if (!seen || typeof seen.add !== 'function') return notice;
  const now = Number(state && state.simTime);
  const bucket = Number.isFinite(now) ? Math.floor(now / DEDUPE_WINDOW_S) : 0;
  const key = `${(payload && payload.reason) || ''}:${bucket}`;
  if (seen.has(key)) return null;
  seen.add(key);
  if (seen.size > 32) seen.delete(seen.values().next().value);
  return notice;
}
