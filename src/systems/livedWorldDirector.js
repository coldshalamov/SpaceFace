// Asks the campaign director for one externalOnly lived vignette when the player
// is actually standing in that vignette's kind of place. Never enters planEncounters.
// Occupies dir.live only while the phase machine is unresolved, and refuses to
// start if any other encounter is already live.

import { hash32 } from '../core/rng.js';
import { ENCOUNTERS } from '../data/encounters.js';
import { livedOverlayFor } from '../data/livedSectorOverlays.js';
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

function ambientLastAtMap(dir) {
  if (!dir.stats || typeof dir.stats !== 'object') dir.stats = {};
  if (!dir.stats.ambientLastAt || typeof dir.stats.ambientLastAt !== 'object' || Array.isArray(dir.stats.ambientLastAt)) {
    dir.stats.ambientLastAt = {};
  }
  return dir.stats.ambientLastAt;
}

/** When a forced ambient fire aborts in the same call, _fire has already stamped
 * lastAmbientAt. Retrying inside that gap refreshes the stamp forever. A refusal
 * that never reached _fire only needs one gap so a full spawn budget is not a hammer. */
export function livedNextAtFor(now, lastAmbientAt, ok) {
  if (ok) return now + GAP_S;
  const stamped = Number.isFinite(lastAmbientAt) && lastAmbientAt >= now - 0.05;
  return stamped ? lastAmbientAt + AMBIENT_GAP_S * 2 : now + AMBIENT_GAP_S;
}

export function pickLivedVignette({
  candidates, overlay, seed, sectorId, zoneKey, day, now = 0, ambientLastAt = {},
}) {
  if (!Array.isArray(candidates) || !candidates.length) return null;
  const ambient = candidates
    .filter((enc) => enc && enc.ambientScene === true
      && Array.isArray(enc.sectorIds)
      && enc.sectorIds.includes(sectorId)
      && now - (ambientLastAt[enc.id] ?? -Infinity) >= 1200)
    .sort((a, b) => a.id.localeCompare(b.id));
  const ambientBucket = hash32(seed, sectorId, zoneKey, day, Math.floor(now / SCAN_S), 'lived-ambient');
  if (ambient.length && ambientBucket % 3 === 0) {
    return ambient[ambientBucket % ambient.length];
  }
  const ordered = candidates
    .filter((enc) => enc && enc.ambientScene !== true)
    .sort((a, b) => a.id.localeCompare(b.id));
  if (!ordered.length) return null;
  const authored = ordered.filter((enc) => !String(enc.id).startsWith('lived_'));
  const bucket = hash32(seed, sectorId, zoneKey, day, 'lived-vignette');
  const pool = authored.length && (bucket % 5) !== 0 ? authored : ordered;
  const preferred = overlay && Array.isArray(overlay.situations)
    ? ordered.filter((enc) => overlay.situations.includes(enc.shape && enc.shape.situation))
    : [];
  if (preferred.length && (bucket % 3) !== 0) {
    const preferredPool = preferred.filter((enc) => pool.includes(enc));
    const choicePool = preferredPool.length ? preferredPool : preferred;
    return choicePool[bucket % choicePool.length];
  }
  return pool[bucket % pool.length] || null;
}

export function livedScenePlacement(player, seed, sectorId, zoneKey, day, encounterId) {
  const vx = Number(player.vel && player.vel.x) || 0;
  const vz = Number(player.vel && player.vel.z) || 0;
  const speed = Math.hypot(vx, vz);
  const heading = speed > 5
    ? { x: vx / speed, z: vz / speed }
    : { x: Math.cos(player.rot || 0), z: Math.sin(player.rot || 0) };
  const sign = (hash32(seed, sectorId, zoneKey, day, encounterId, 'lived-ambient-axis') & 1) ? -1 : 1;
  const axis = { ux: -heading.z * sign, uz: heading.x * sign };
  const centre = {
    x: player.pos.x + heading.x * 200,
    z: player.pos.z + heading.z * 200,
  };
  return {
    centre,
    axis,
    anchor: {
      x: centre.x - axis.ux * 320,
      z: centre.z - axis.uz * 320,
    },
  };
}

export function livedSceneRequestData({ ambient, overlay, seed, encounterId, day, axis }) {
  const data = {};
  if (overlay && !ambient) {
    data.livedOverlay = {
      sectorId: overlay.sectorId,
      crew: overlay.crew,
      line: overlay.lines[hash32(seed, encounterId, day, 'lived-line') % overlay.lines.length],
    };
  }
  if (axis) data.sceneAxis = axis;
  return Object.keys(data).length ? data : undefined;
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
  const overlay = livedOverlayFor(sectorId);
  const player = state.playerId != null && state.entities ? state.entities.get(state.playerId) : null;
  if (!sectorId || !player || player.alive === false || !player.pos) return;
  const local = globalToSectorLocalForSector(player.pos, sectorId);
  if (!local) return;
  const zone = zoneAt(sectorId, local.x, local.z);
  if (!zone || !zone.type) return;
  const seen = seenMap(dir);
  const ambientLastAt = ambientLastAtMap(dir);
  const candidates = [];
  for (const enc of Object.values(ENCOUNTERS)) {
    if (!enc || enc.livedVignette !== true) continue;
    if (enc.ambientScene === true) {
      candidates.push(enc);
      continue;
    }
    if (seen[enc.id]) continue;
    const zones = enc.zoneTypes || [];
    if (!zones.includes(zone.type)) continue;
    candidates.push(enc);
  }
  if (!candidates.length) return;
  const seed = (state.meta && state.meta.seed) || 1;
  const day = Math.floor(now / 600);
  const zoneKey = zone.id || zone.type;
  const pick = pickLivedVignette({ candidates, overlay, seed, sectorId, zoneKey, day, now, ambientLastAt });
  if (!pick) return;
  const ambient = pick.ambientScene === true;
  const placement = ambient
    ? livedScenePlacement(player, seed, sectorId, zoneKey, day, pick.id)
    : null;
  const ang = ambient ? 0 : (hash32(seed, pick.id, day, 'lived-angle') % 628) / 100;
  const data = livedSceneRequestData({
    ambient,
    overlay,
    seed,
    encounterId: pick.id,
    day,
    axis: placement && placement.axis,
  });
  const result = director.requestAuthoredEncounter({
    shapeId: pick.id,
    encounterId: `lived:${pick.id}`,
    sectorId,
    anchor: placement ? placement.anchor : {
      x: player.pos.x + Math.cos(ang) * 720,
      z: player.pos.z + Math.sin(ang) * 720,
    },
    zoneType: zone.type,
    zoneName: zone.name || zone.id,
    data,
    force: true,
  });
  if (!dir.stats) dir.stats = {};
  const stampedAt = Number(dir.lastAmbientAt);
  dir.stats.livedNextAt = livedNextAtFor(now, stampedAt, !!(result && result.ok));
  if (ambient && result && result.ok) ambientLastAt[pick.id] = now;
}
