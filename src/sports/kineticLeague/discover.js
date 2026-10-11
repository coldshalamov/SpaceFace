// Discovery reads the shipped BRACKET record. It does not write bracket memory,
// credits, cargo, or hull. Wiring it into the live scan is the withheld adapter.

import { BRACKET as C } from '../../data/bracket.js';
import { freshLeagueMemory, tierUnlocked } from './memory.js';
import { eventById, EVENTS } from './circuit.js';

export const LEAGUE_GATE = Object.freeze({ dx: 36, dz: 28 });

export function leagueGateWorld() {
  return { x: C.anchor.x + LEAGUE_GATE.dx, z: C.anchor.z + LEAGUE_GATE.dz };
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function validScan(state, info) {
  const player = state.entities?.get?.(state.playerId);
  if (!player || !info) return false;
  if (info.source !== 'player-scanner' || info.scannerId !== player.id) return false;
  if (!Number.isSafeInteger(info.seq) || info.seq < 1) return false;
  if (!info.pos || !Number.isFinite(info.pos.x) || !Number.isFinite(info.pos.z)) return false;
  if (distance(info.pos, player.pos) > 2) return false;
  if (!Number.isFinite(info.radius) || info.radius <= 0) return false;
  if (distance(player.pos, C.anchor) > Math.min(info.radius, C.hailRadius)) return false;
  return true;
}

/**
 * Record that the player has found the league through BRACKET.
 * `via: 'match-finished' | 'match-started'` trusts the existing bracket bus.
 * Any other path must be a real player scan.
 */
export function noteBracketDiscovery(state, info = {}) {
  if (!state) return { ok: false, reason: 'no-state' };
  const bracket = state.bracket;
  if (!bracket || bracket.version !== 1 || bracket.destroyed === true || bracket.met !== true) {
    return { ok: false, reason: 'no-bracket' };
  }
  const via = info.via;
  const busVia = via === 'match-finished' || via === 'match-started';
  if (!busVia && !validScan(state, info)) return { ok: false, reason: 'bad-scan' };
  const memory = state.kineticLeague && state.kineticLeague.version === 1 && state.kineticLeague.records
    ? state.kineticLeague
    : freshLeagueMemory();
  if (!memory.discovered) {
    memory.discovered = true;
    memory.discoveredAt = Number.isFinite(state.simTime) ? state.simTime : 0;
    memory.via = busVia ? via : 'scan';
  }
  state.kineticLeague = memory;
  return { ok: true, discovered: true, tier: 'qualification' };
}

/** True when the player is on the league gate and not on the scrapball keeper. */
export function maybeEnterLeague(state, playerPos) {
  if (!state?.kineticLeague?.discovered) return false;
  if (!playerPos || !Number.isFinite(playerPos.x) || !Number.isFinite(playerPos.z)) return false;
  const gate = leagueGateWorld();
  const keeper = { x: C.anchor.x, z: C.anchor.z };
  const dg = distance(playerPos, gate);
  const dk = distance(playerPos, keeper);
  return dg < 26 && dg + 10 < dk;
}

export function nextUnlockedEvent(memory) {
  if (!memory?.discovered) return null;
  return EVENTS.find((event) => tierUnlocked(memory, event.tier, EVENTS) && memory.solved[event.id] !== true) || null;
}

export function discoveryCopy(memory) {
  const next = memory?.discovered ? nextUnlockedEvent(memory) : null;
  if (!memory?.discovered) {
    return 'BX-9 / BRACKET — the yard is a league gate. Finish a scrapball match and the circuit opens.';
  }
  if (!next) return 'BRACKET: The circuit is complete. The small goal is still defended.';
  const event = eventById(next.id);
  return `BRACKET: Kinetic League ${event.id} ${event.title}. Fly to the amber gate and scan.`;
}
