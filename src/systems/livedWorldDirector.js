// Asks the campaign director for one externalOnly lived vignette when the player
// is actually standing in that vignette's kind of place. Never enters planEncounters.
// Occupies dir.live only while the phase machine is unresolved, and refuses to
// start if any other encounter is already live.

import { hash32 } from '../core/rng.js';
import { ENCOUNTERS } from '../data/encounters.js';
import { zoneAt } from '../data/sectorZones.js';
import { globalToSectorLocalForSector } from '../data/sectorCoordinates.js';

const SCAN_S = 6;
const GAP_S = 90;
const AMBIENT_GAP_S = 15;

function seenMap(dir) {
  if (!dir.stats || typeof dir.stats !== 'object') dir.stats = {};
  if (!dir.stats.livedSeen || typeof dir.stats.livedSeen !== 'object' || Array.isArray(dir.stats.livedSeen)) {
    dir.stats.livedSeen = {};
  }
  return dir.stats.livedSeen;
}

/** When a forced ambient fire aborts in the same call, _fire has already stamped
 * lastAmbientAt. Retrying inside that gap refreshes the stamp forever. A refusal
 * that never reached _fire only needs one gap so a full spawn budget is not a hammer. */
export function livedNextAtFor(now, lastAmbientAt, ok) {
  if (ok) return now + GAP_S;
  const stamped = Number.isFinite(lastAmbientAt) && lastAmbientAt >= now - 0.05;
  return stamped ? lastAmbientAt + AMBIENT_GAP_S * 2 : now + AMBIENT_GAP_S;
}

function survivalLive(state) {
  const run = state.run;
  return !!(run && run.kind === 'survival' && run.phase && run.phase !== 'inactive');
}

function playerInLawFight(state) {
  const incidents = state.lawSecurity && state.lawSecurity.incidents;
  const playerId = state.playerId;
  if (!incidents || playerId == null) return false;
  for (const incident of Object.values(incidents)) {
    if (!incident || incident.status === 'resolved') continue;
    if (incident.attackerId === playerId || incident.victimId === playerId) return true;
  }
  return false;
}

function worldAlreadyFighting(state) {
  if (survivalLive(state) || playerInLawFight(state)) return true;
  const playerId = state.playerId;
  const list = state.entityList;
  if (!Array.isArray(list)) return false;
  for (let i = 0; i < list.length; i++) {
    const entity = list[i];
    if (!entity || entity.alive === false || entity.type !== 'ship') continue;
    const data = entity.data;
    if (!data) continue;
    if (data.predationRole === 'raider') return true;
    if (playerId == null || entity.id === playerId) continue;
    const combat = data.combat;
    const locked = combat && (combat.targetId === playerId || combat.lockTarget === playerId);
    if (!locked) continue;
    if (entity.team === 0 || entity.team === 2) continue;
    if (data.ai && data.ai.passive === true) continue;
    return true;
  }
  return false;
}

export function tickLivedVignettes(runtime) {
  const state = runtime && runtime.state;
  if (!state || state.mode !== 'flight') return;
  if (state.ui && state.ui.docked) return;
  if (state.player && state.player.flags && state.player.flags.docked) return;
  if (state.onboarding && state.onboarding.active && !state.onboarding.finished) return;
  if (survivalLive(state)) return;
  const now = Number(state.simTime) || 0;
  if (runtime._livedScanAt != null && now < runtime._livedScanAt) return;
  runtime._livedScanAt = now + SCAN_S;
  const director = runtime.registry && runtime.registry.get && runtime.registry.get('encounterDirector');
  if (!director || typeof director.requestAuthoredEncounter !== 'function') return;
  const dir = state.encounterDirector;
  if (!dir || !dir.live) return;
  if (Object.keys(dir.live).length > 0) return;
  if (dir.stats && dir.stats.livedNextAt > now) return;
  if (worldAlreadyFighting(state)) return;
  const sectorId = state.world && state.world.currentSectorId;
  const player = state.playerId != null && state.entities ? state.entities.get(state.playerId) : null;
  if (!sectorId || !player || player.alive === false || !player.pos) return;
  const local = globalToSectorLocalForSector(player.pos, sectorId);
  if (!local) return;
  const zone = zoneAt(sectorId, local.x, local.z);
  if (!zone || !zone.type) return;
  const seen = seenMap(dir);
  const candidates = [];
  for (const enc of Object.values(ENCOUNTERS)) {
    if (!enc || enc.livedVignette !== true) continue;
    if (seen[enc.id]) continue;
    const zones = enc.zoneTypes || [];
    if (!zones.includes(zone.type)) continue;
    candidates.push(enc);
  }
  if (!candidates.length) return;
  const seed = (state.meta && state.meta.seed) || 1;
  const day = Math.floor(now / 600);
  candidates.sort((a, b) => a.id.localeCompare(b.id));
  const pick = candidates[hash32(seed, sectorId, zone.id || zone.type, day, 'lived-vignette') % candidates.length];
  const ang = (hash32(seed, pick.id, day, 'lived-angle') % 628) / 100;
  const result = director.requestAuthoredEncounter({
    shapeId: pick.id,
    encounterId: `lived:${pick.id}`,
    sectorId,
    anchor: {
      x: player.pos.x + Math.cos(ang) * 720,
      z: player.pos.z + Math.sin(ang) * 720,
    },
    zoneType: zone.type,
    zoneName: zone.name || zone.id,
    force: true,
  });
  if (!dir.stats) dir.stats = {};
  const stampedAt = Number(dir.lastAmbientAt);
  dir.stats.livedNextAt = livedNextAtFor(now, stampedAt, !!(result && result.ok));
}
