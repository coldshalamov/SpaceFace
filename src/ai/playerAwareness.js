// Where do the enemies think the player is? One answer for every brain (pack, cohort, tactical).
//
// The cloak (src/systems/cloak.js) owns the one perception gate, cloakHidesEntityFrom: a cloaked
// player is invisible to an observer outside the live detection ring, and a scan-pulse burn
// opens the window. This module turns that gate into the standard modern "last known position"
// model, shared by the whole enemy side the way squads in current games share a sighting:
//
//   * While anyone can see the player, the shared fix is the player's true pose.
//   * When the player goes dark, a hull that was tracking keeps the true pose for a short
//     REACTION window (it takes a moment to realise the target is gone), then flies to the last
//     known position and searches there (the pack brain spreads and sweeps around it).
//   * Revealed again by: a scan-pulse burn (the gate itself), the player firing (the cloak also
//     drops), using a power, a collision involving the player hull, or — in Swarm only — the
//     arena's awareness closing in after SWARM_CLOAK_ESCAPE_S of continuous dark (ruling R15:
//     Swarm awareness is arena-wide, so a cloak there is a short escape, not invisibility).
//     A reveal holds the fix live for REVEAL_HOLD_S.
//
// Deterministic: state.simTime only. The runtime lives on state.aiAwareness and is never saved
// (a reload starts from "seen", which is what a freshly loaded fight should be).

import { cloakHidesEntityFrom, cloakRuntimeFor } from '../systems/cloak.js';

export const AWARENESS_REACTION_S = 0.4;
export const AWARENESS_REVEAL_HOLD_S = 1.0;
export const SWARM_CLOAK_ESCAPE_S = 4.0;
/** How long a search runs around the last known position before the hull widens its sweep. */
export const AWARENESS_SEARCH_S = 6.0;

const POWER_ACTIONS = Object.freeze(['deployWell', 'deployRepulsor', 'deployMassSeed', 'dropBomb',
  'chargeThrow', 'chargeDetonate', 'toggleClearingCone']);

function now(state) {
  if (state && Number.isFinite(state.simTime)) return state.simTime;
  return state && Number.isInteger(state.tick) ? state.tick / 60 : 0;
}

function runtimeFor(state) {
  let rt = state.aiAwareness;
  if (!rt || typeof rt !== 'object') {
    rt = state.aiAwareness = {
      fixX: 0, fixZ: 0, fixVX: 0, fixVZ: 0, fixAt: -Infinity, hasFix: false,
      cloakOnAt: null, revealUntil: -Infinity, lastTick: -1,
    };
  }
  return rt;
}

function isSwarm(state) {
  const run = state && state.run;
  return !!(run && run.kind === 'survival' && run.phase !== 'inactive');
}

/** A world event revealed the player for a moment (shot, power, collision). */
export function revealPlayer(state, holdS = AWARENESS_REVEAL_HOLD_S) {
  if (!state || !state.aiAwareness) return; // nothing is hidden, so there is nothing to reveal
  const rt = runtimeFor(state);
  rt.revealUntil = Math.max(rt.revealUntil, now(state) + holdS);
}

/**
 * Once per tick, before any brain reads the fix: track the cloak's on-edge (for the Swarm
 * timeout), read the player's power presses (a power used is a reveal) and refresh the shared
 * fix while the player is not cloaked at all.
 */
export function updatePlayerAwareness(state) {
  if (!state) return null;
  const player = state.entities && state.entities.get && state.entities.get(state.playerId);
  if (!state.aiAwareness) {
    const c = player && cloakRuntimeFor(state, player);
    if (!(c && c.active === true && c.radius > 0)) return null;
  }
  const rt = runtimeFor(state);
  const tick = Number.isInteger(state.tick) ? state.tick : -1;
  if (rt.lastTick === tick) return rt;
  rt.lastTick = tick;
  if (!player || player.alive === false || !player.pos) return rt;
  const cloak = cloakRuntimeFor(state, player);
  const cloaked = !!(cloak && cloak.active === true && cloak.radius > 0);
  // An uncloaked fight writes nothing: the runtime only exists once the player has gone dark,
  // so a run that never cloaks keeps byte-identical state.
  if (!cloaked && !state.aiAwareness) return null;
  const t = now(state);
  if (cloaked && rt.cloakOnAt == null) rt.cloakOnAt = t;
  if (!cloaked) rt.cloakOnAt = null;
  const actions = state.input && state.input.actions;
  if (cloaked && actions) {
    for (let i = 0; i < POWER_ACTIONS.length; i++) {
      if (actions[POWER_ACTIONS[i]]) { revealPlayer(state); break; }
    }
  }
  if (!cloaked || t < rt.revealUntil || swarmEscapeOver(state, rt, t)) seePlayer(rt, player, t);
  return rt;
}

function swarmEscapeOver(state, rt, t) {
  return rt.cloakOnAt != null && isSwarm(state) && t - rt.cloakOnAt >= SWARM_CLOAK_ESCAPE_S;
}

function seePlayer(rt, player, t) {
  rt.fixX = player.pos.x; rt.fixZ = player.pos.z;
  rt.fixVX = player.vel ? player.vel.x : 0; rt.fixVZ = player.vel ? player.vel.z : 0;
  rt.fixAt = t; rt.hasFix = true;
}

/**
 * What `observer` knows about the player now. `out` is caller-owned scratch:
 *   seen     — true: chase the real player (x/z/vx/vz are its live pose)
 *   false: the player is hidden from this observer; x/z is the last known position, vx/vz 0,
 *   lostFor  — seconds since the shared fix was last refreshed (drives the search sweep)
 */
export function playerFixFor(state, observer, out) {
  const o = out || {};
  const player = state && state.entities && state.entities.get && state.entities.get(state.playerId);
  if (!player || !player.pos) { o.seen = false; o.x = 0; o.z = 0; o.vx = 0; o.vz = 0; o.lostFor = Infinity; return o; }
  const gateHides = cloakHidesEntityFrom(state, observer, player);
  if (!gateHides && !state.aiAwareness) {
    o.seen = true; o.x = player.pos.x; o.z = player.pos.z;
    o.vx = player.vel ? player.vel.x : 0; o.vz = player.vel ? player.vel.z : 0; o.lostFor = 0;
    return o;
  }
  const rt = runtimeFor(state);
  const t = now(state);
  const hidden = gateHides
    && !(t < rt.revealUntil)
    && !swarmEscapeOver(state, rt, t)
    && !(rt.cloakOnAt != null && t - rt.cloakOnAt < AWARENESS_REACTION_S);
  if (!hidden) {
    seePlayer(rt, player, t);
    o.seen = true; o.x = player.pos.x; o.z = player.pos.z;
    o.vx = player.vel ? player.vel.x : 0; o.vz = player.vel ? player.vel.z : 0; o.lostFor = 0;
    return o;
  }
  o.seen = false;
  if (rt.hasFix) { o.x = rt.fixX; o.z = rt.fixZ; } else { o.x = player.pos.x; o.z = player.pos.z; }
  o.vx = 0; o.vz = 0;
  o.lostFor = Number.isFinite(rt.fixAt) ? Math.max(0, t - rt.fixAt) : 0;
  return o;
}

/** Bus hooks: a shot from the player or a collision on the player hull reveals it. */
export function bindPlayerAwareness(bus, stateProvider) {
  if (!bus || typeof bus.on !== 'function') return [];
  const offs = [];
  const on = (event, fn) => {
    const off = bus.on(event, fn);
    if (typeof off === 'function') offs.push(off);
  };
  on('combat:fire', (p) => {
    const state = stateProvider();
    if (state && p && p.ownerId != null && p.ownerId === state.playerId) revealPlayer(state);
  });
  on('physics:impact', (p) => {
    const state = stateProvider();
    if (state && p && p.playerInvolved === true) revealPlayer(state);
  });
  return offs;
}
