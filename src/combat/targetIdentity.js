// Target identity and sensor truth for the player's SELECTION (packet 02, design/combat-convergence).
//
// Two questions every consumer of `state.player.targetId` has been answering by hand:
//   1. Is the body at that number still the body the player picked? Entity ids recycle through
//      `state.freeIds`, so a bare id can name a different hull one tick later. The recycler stamps
//      a per-occupant token (core/entity.js stampOccupantGeneration, read through
//      ai/perception.js targetIdentityGeneration — the same token weapons.js already matches a
//      missile lock against). This module remembers the token the selection was bound to, so a
//      recycled id retires the bracket and the aim assist instead of silently inheriting them.
//   2. Can the player's sensors honour it? A cloak-hidden hull is in the simulation but not on the
//      player's sensors; cloak.js owns that rule (cloakHidesEntityFrom). Nothing here re-derives it.
//
// The memory is a module WeakMap keyed by GameState — runtime only, never serialized, never a new
// `state.player` field (that would touch the save schema and the 47-A snapshot hash). It reads the
// sim clock (`state.simTime`), so a paused game freezes every expiry and dwell exactly.
//
// Single-writer note: this file never writes `state.player.targetId`. The selection stays
// UI/input-owned (ui/uiRoot.js, simLaneCommands.js); only the lane writer calls `bindSelection`,
// so a deliberate re-pick of a recycled number re-binds to its new occupant.
import { targetIdentityGeneration } from '../ai/perception.js';
import { cloakHidesEntityFrom, cloakTimeS } from '../systems/cloak.js';

/** How long a concealed target's "last known" mark survives, in sim seconds. */
export const LAST_KNOWN_TTL_S = 4;

const memoByState = new WeakMap();

function newMemo() {
  return {
    id: null,           // selection id this memo is bound to
    gen: 0,             // occupant token at bind time; 0 = unprovable (fixture body, ledger row)
    stale: false,       // the id now names a different occupant: the bound body is gone
    seenX: 0, seenZ: 0, seenT: -Infinity, // last position the player's sensors confirmed
    markId: null, markGen: 0, markX: 0, markZ: 0, markT: -Infinity, // last-known mark after concealment
  };
}

function memoFor(state) {
  let m = memoByState.get(state);
  if (!m) { m = newMemo(); memoByState.set(state, m); }
  return m;
}

function selectionIdOf(state) {
  const id = state && state.player ? state.player.targetId : null;
  return id == null ? null : id;
}

function entityOf(state, id) {
  return id != null && state && state.entities && typeof state.entities.get === 'function'
    ? state.entities.get(id) || null
    : null;
}

/** 0 when the body carries no provable token. */
function tokenOf(entity) {
  const g = targetIdentityGeneration(entity);
  return g == null || g === '' ? 0 : g;
}

/** Sim-clock seconds (frozen by pause). */
export function identityClockS(state) {
  return cloakTimeS(state);
}

/**
 * Bind the memory to whoever occupies the selected id RIGHT NOW. Every selection writer calls this
 * (the lane writer in simLaneCommands.js), including a same-value rewrite — that is how a deliberate
 * re-pick of a recycled number takes the new occupant. Readers call `ensureBound`, which only binds
 * when the selection id changed under them (tests and tools that write the field directly).
 */
export function bindSelection(state) {
  if (!state || typeof state !== 'object') return null;
  const m = memoFor(state);
  const id = selectionIdOf(state);
  m.id = id;
  m.stale = false;
  m.seenT = -Infinity;
  if (id == null) { m.gen = 0; return m; }
  const e = entityOf(state, id);
  m.gen = e ? tokenOf(e) : 0;
  // A new selection supersedes any last-known mark of a DIFFERENT body; re-picking the same
  // body keeps its mark (it is simply the same target again).
  if (m.markId != null && m.markId !== id) { m.markId = null; m.markGen = 0; }
  return m;
}

/** Bind lazily: a selection id that changed since the last bind is bound to its current occupant. */
export function ensureBound(state) {
  const m = memoFor(state);
  const id = selectionIdOf(state);
  if (m.id !== id) return bindSelection(state);
  if (id != null && !m.stale) {
    const e = entityOf(state, id);
    if (e && m.gen !== 0) {
      const g = tokenOf(e);
      if (g !== 0 && g !== m.gen) m.stale = true; // the id was recycled to a different occupant
    }
  }
  return m;
}

/**
 * True when `entity` is NOT the body the current selection was bound to (the id was recycled).
 * A body with no provable token is accepted — the same rule as ui/uiRoot explicitObjectSelectionAlive.
 */
export function selectionIsRecycled(state, entity) {
  if (!state || !entity) return false;
  const m = ensureBound(state);
  if (m.id == null || entity.id !== m.id) return false;
  if (m.stale) return true;
  if (m.gen === 0) return false;
  const g = tokenOf(entity);
  return g !== 0 && g !== m.gen;
}

/** The selection's memory says the numeric id now names a different occupant. */
export function selectionRetired(state) {
  if (!state || selectionIdOf(state) == null) return false;
  const m = ensureBound(state);
  return m.stale === true;
}

/**
 * Sensor truth for the player as observer: true when the target is cloak-hidden from the player.
 * This is the one cloak perception gate (systems/cloak.js); targeting reads it, never copies it.
 */
export function concealedFromPlayer(state, entity) {
  if (!state || !entity || entity.id === state.playerId) return false;
  const player = entityOf(state, state.playerId);
  if (!player || !player.pos || !entity.pos) return false;
  return cloakHidesEntityFrom(state, player, entity);
}

/**
 * Record what the player's sensors confirm about the selected body this call: its position while
 * observed, and the expiring last-known mark when it goes dark. Returns the memory.
 */
export function noteSelectionObserved(state, entity, concealed) {
  const m = ensureBound(state);
  if (!entity || !entity.pos || m.id == null || entity.id !== m.id) return m;
  const now = identityClockS(state);
  if (!concealed) {
    m.seenX = entity.pos.x; m.seenZ = entity.pos.z; m.seenT = now;
    if (m.markId === entity.id) { m.markId = null; m.markGen = 0; } // sensors reacquired it
    return m;
  }
  // Newly concealed: freeze the mark at the last confirmed fix (never at the live position —
  // that would be the wallhack the mark exists to refuse).
  if (m.markId !== entity.id && Number.isFinite(m.seenT)) {
    m.markId = entity.id; m.markGen = m.gen;
    m.markX = m.seenX; m.markZ = m.seenZ; m.markT = m.seenT;
  }
  return m;
}

/**
 * One-call per-tick/per-frame observation of the current selection: binds it, notices a recycle,
 * and records the sensor fix or the last-known mark. Safe to call at any cadence; writes only the
 * runtime memory, never GameState.
 */
export function observeSelection(state) {
  const id = selectionIdOf(state);
  if (id == null) { ensureBound(state); return; }
  const m = ensureBound(state);
  if (m.stale) return;
  const e = entityOf(state, id);
  if (!e || e.alive === false) return;
  noteSelectionObserved(state, e, concealedFromPlayer(state, e));
}

/**
 * The expiring last-known mark, or null. `out` is filled in place (the HUD calls this every
 * frame). Positions are global XZ, so a floating-origin rebase never moves the mark.
 */
export function lastKnownMark(state, out) {
  const m = memoFor(state);
  if (m.markId == null) return null;
  const age = identityClockS(state) - m.markT;
  if (!(age <= LAST_KNOWN_TTL_S)) { m.markId = null; m.markGen = 0; return null; }
  const e = entityOf(state, m.markId);
  if (e && (e.alive === false || (m.markGen !== 0 && tokenOf(e) !== 0 && tokenOf(e) !== m.markGen))) {
    m.markId = null; m.markGen = 0; return null; // the hidden body died or its number was recycled
  }
  const o = out || {};
  o.id = m.markId; o.x = m.markX; o.z = m.markZ; o.ageS = age;
  o.expiresInS = Math.max(0, LAST_KNOWN_TTL_S - age);
  return o;
}

/** Drop everything remembered for a state (new game, save restore). */
export function resetSelectionMemory(state) {
  if (state && typeof state === 'object') memoByState.delete(state);
}
