// SP2-151 — THE HAUMEA TOOL LEDGER. The extraction mast sits on the seam with its lanyard
// snapped, the loose wrench still ropeable from a careful hull. Return it to the Rift
// Observatory's claim office and the physical ledger files the first return in eleven
// entries: 1 TOOL RETURNED BY [CALLSIGN]. 1 TOOL STILL OUT. THE RIFT KEEPS SCORE.
//
// OWNERSHIP (single-writer):
//   * the loose wrench — a ropeable payload prop spawned beside the seated mast (the live
//     poi_haumea_fissure row is the mast's only true position); the player's own massline
//     is the only thing that moves it (the 902 prop precedent: 'payload' lands in the
//     acquisition index's attachable buckets).
//   * `tool_returned` — plain-named story flag, written only here, latched before its emit.
//     Readers: the claim office's own procedural skip (data/landmarkMissions.js questReady —
//     "they return tools"), the standing tick (faction:repDelta through the factions owner),
//     and the shipworks margin notes if a later leg adopts it.
//   * the situation outcome — 'returned' is terminal (blockAfterOutcome).
//
// Deterministic: canonical attachment custody, the original body's pose, and the existing
// committed-dock receipt decide delivery. The original wrench and a bounded coordinator row
// use the normal persistent-entity/story save. No rng or wall time; a missing mast aborts inert.
import { deepFreeze, defineEncounter } from './catalog.js';
import { settleSituation } from '../../systems/crSituationKit.js';
import { occupantGenerationOf } from '../../core/entity.js';
import { dockIntentStatus } from '../../core/dockIntent.js';

const OWNER = 'toolLedger';
function visitOf(state) { return state.story?.depthProgramEncounters?.toolLedger; }
function writeVisit(state, visit) {
  const story = state.story || (state.story = {});
  const memory = story.depthProgramEncounters || (story.depthProgramEncounters = {});
  memory.toolLedger = visit;
}
function saveTask(live, state) {
  writeVisit(state, { status: 'active', encounterId: live.id, sectorId: live.sectorId,
    zoneId: live.zoneId, zoneName: live.zoneName, zoneType: live.zoneType,
    anchor: { ...live.anchor }, zoneRadius: live.zoneRadius,
    stableId: live.vars.toolStableId, startedAt: live.vars.startedAt,
    toolWasTowed: live.vars.toolWasTowed === true });
}
function bindTool(live, wrench, saved) {
  live.vars.wrenchId = wrench.id;
  live.vars.wrenchGeneration = occupantGenerationOf(wrench);
  live.vars.toolStableId = saved.stableId;
  live.vars.startedAt = saved.startedAt;
  live.vars.toolWasTowed = saved.toolWasTowed === true;
  live.propIds ||= [];
  if (!live.propIds.includes(wrench.id)) live.propIds.push(wrench.id);
  live.phase = 'watch';
}
function savedTool(state, saved) {
  const matches = state.entityList.filter(e => e.alive && e.type === 'payload'
    && e.data?.persistenceOwner === OWNER && e.data.toolLedgerVisitId === saved.encounterId
    && e.data.stableId === saved.stableId);
  return matches.length === 1 ? matches[0] : null;
}
function releaseTool(state, live) {
  const wrench = wrenchEnt(state, live);
  if (!wrench) return;
  delete wrench.flags.persistent;
  delete wrench.data.persistenceOwner;
}

export const encounterOrder = 1323;
export const trigger = deepFreeze({
  id: 'the_tool_ledger',
  tier: 'ambient',
  deck: 'civilian',
  weight: 0.7,
  zoneTypes: ['anomaly_deep', 'mining_belt'],
  script: 'selfRegistered',
  pressureCost: 6,
  cooldownS: 600,
  proximity: true,
  rare: true,
  gates: {
    sectorIds: ['sector_haumea_rift'],
    blockAfterOutcome: 'returned',
  },
});

export const TOOL_LEDGER = Object.freeze({
  mastPoiId: 'poi_haumea_fissure',
  claimStationId: 'station_haumea_rift',   // the Rift Observatory's claim office
  claimFactionId: 'faction_free',          // the observatory files the ledger; its standing moves
  standingDelta: 3,                        // Haumea standing +3
  towRadiusWu: 600,                        // the wrench on the line behind the docked hull
  windowS: 600,
});

function flagsOf(state) {
  return state && state.story && state.story.flags && typeof state.story.flags === 'object'
    ? state.story.flags : null;
}

function mastRow(state) {
  const active = state && state.world && (state.world.activeSector || state.world.active);
  return ((active && active.pois) || []).find(
    (poi) => poi && poi.poiId === TOOL_LEDGER.mastPoiId && poi.pos,
  ) || null;
}

function callsignOf(state) {
  const ent = state && state.entities && state.entities.get
    ? state.entities.get(state.playerId) : null;
  const raw = (ent && ent.data && (ent.data.callsign || ent.data.identityKey))
    || (ent && ent.name) || 'hull unknown';
  return String(raw).slice(0, 48);
}

function wrenchEnt(state, live) {
  const id = live.vars && live.vars.wrenchId;
  const ent = id != null && state.entities && state.entities.get
    ? state.entities.get(id) : null;
  return ent && ent.alive !== false && ent.type === 'payload'
    && occupantGenerationOf(ent) === live.vars.wrenchGeneration
    && ent.data?.stableId === live.vars.toolStableId
    && ent.data?.persistenceOwner === OWNER && ent.data.toolLedgerVisitId === live.id ? ent : null;
}

function wrenchTowed(state, live) {
  const wrench = wrenchEnt(state, live);
  if (!wrench) return false;
  if (!live.vars.toolWasTowed) return false;
  const player = state.entities && state.entities.get
    ? state.entities.get(state.playerId) : null;
  if (!player || !player.pos || !wrench.pos) return false;
  const d = Math.hypot(player.pos.x - wrench.pos.x, player.pos.z - wrench.pos.z);
  return d <= TOOL_LEDGER.towRadiusWu; // on the line behind the docked hull
}

export const runtime = Object.freeze({
  fireReady(state) {
    return flagsOf(state)?.tool_returned == null && visitOf(state)?.status !== 'active';
  },

  restoreSaved(d, state) {
    const saved = visitOf(state);
    if (saved?.status !== 'active' || flagsOf(state)?.tool_returned != null) return null;
    const existing = state.encounterDirector.live[saved.encounterId];
    if (existing) return existing;
    const wrench = savedTool(state, saved);
    if (!wrench) { writeVisit(state, { ...saved, status: 'closed', reason: 'wrench_lost' }); return null; }
    const live = d.restoreEncounterRecord({ encounterId: saved.encounterId, shapeId: trigger.id,
      sectorId: saved.sectorId, zoneId: saved.zoneId, zoneName: saved.zoneName,
      zoneType: saved.zoneType, zoneCenter: saved.anchor, zoneRadius: saved.zoneRadius, ships: [] });
    if (!live) return null;
    bindTool(live, wrench, saved);
    if (d.now() >= saved.startedAt + TOOL_LEDGER.windowS) { d.abort(live, 'stood_down'); return null; }
    // Continue can restore an already committed dock. Consume its durable UI record here;
    // full-tick simulation correctly remains frozen behind the station surface.
    this._atDock(d, live, state);
    return live.phase === 'done' ? null : live;
  },

  captureSave(d, live, state) { if (live.phase === 'watch' && !live.vars.returning) saveTask(live, state); },

  retire(d, live, state, reason) {
    if (reason === 'save_loaded' || live.vars.wrenchGeneration == null) return;
    const saved = visitOf(state);
    if (saved?.encounterId === live.id) writeVisit(state, { ...saved, status: 'closed' });
    if (!wrenchEnt(state, live)) live.propIds = (live.propIds || []).filter(id => id !== live.vars.wrenchId);
    releaseTool(state, live);
  },

  fire(d, live, state) {
    const flags = flagsOf(state);
    if (flags && flags.tool_returned != null) return d.abort(live, 'already_returned');
    const saved = visitOf(state);
    if (saved?.status === 'active') {
      const wrench = savedTool(state, saved);
      // A same-id day replan may replace the coordinator, never the original physical tool.
      if (saved.encounterId === live.id && wrench) { bindTool(live, wrench, saved); return; }
      return d.abort(live, 'already_working');
    }
    const mast = mastRow(state);
    if (!mast || !mast.pos) return d.abort(live, 'no_mast_row');
    const wrench = d.spawnProp(live, {
      type: 'payload',
      pos: { x: mast.pos.x + 14, z: mast.pos.z - 9 },
      radius: 4,
      mass: 8,
      scanLabel: 'LOOSE WRENCH \u2014 LANYARD SNAPPED',
      storyPropKind: 'haumea_loose_wrench',
      tetherable: true,
    });
    if (!wrench || wrench.id == null) return d.abort(live, 'prop_failed');
    if (wrench.data) wrench.data.masslineTetherable = true;
    wrench.flags = { ...wrench.flags, persistent: true };
    wrench.data.persistenceOwner = OWNER;
    wrench.data.toolLedgerVisitId = live.id;
    wrench.data.stableId = `tool-ledger:${live.id}`;
    bindTool(live, wrench, { stableId: wrench.data.stableId, startedAt: d.now(), toolWasTowed: false });
    saveTask(live, state);
    d.say(live, 'info',
      'The extraction mast sits on the seam with its lanyard snapped, the loose wrench still '
      + 'ropeable from a careful hull. The claim office\u2019s ledger has run for years: 0 '
      + 'TOOLS RETURNED. 1 TOOL STILL OUT. THE RIFT KEEPS SCORE.',
      null, { literal: true, primary: true });
    return null;
  },

  tick(d, live, state, now) {
    if (live.phase !== 'watch') return;
    if (now >= (live.vars.startedAt || 0) + TOOL_LEDGER.windowS) return d.abort(live, 'stood_down');
    if (!wrenchEnt(state, live)) return d.abort(live, 'wrench_lost');
    return null;
  },

  _atDock(d, live, state) {
    if (live.phase !== 'watch' || live.vars.returning
      || flagsOf(state)?.tool_returned != null || d.now() >= live.vars.startedAt + TOOL_LEDGER.windowS) return;
    if (!state.ui || !state.ui.docked || state.ui.dockedStationId !== TOOL_LEDGER.claimStationId) {
      return null;
    }
    const player = state.entities.get(state.playerId);
    if (!player?.alive || !(player.hull > 0) || state.world.currentSectorId !== live.sectorId) return;
    const station = state.entityList.find(e => e.alive && e.type === 'station'
      && e.data?.stationId === TOOL_LEDGER.claimStationId && state.entities.get(e.id) === e);
    if (!station) return;
    if (!wrenchTowed(state, live)) return null;
    return this._returnTool(d, live, state);
  },

  _returnTool(d, live, state) {
    if (live.vars.returning || flagsOf(state)?.tool_returned != null) return;
    live.vars.returning = true;
    const flags = flagsOf(state) || {};
    if (flags.tool_returned == null) {
      if (!state.story) state.story = { flags: {} };
      if (!state.story.flags || typeof state.story.flags !== 'object') state.story.flags = {};
      state.story.flags.tool_returned = Number(state.simTime) || 0;
    }
    const wrench = wrenchEnt(state, live);
    wrench.data.despawnAt = d.now() + .5;
    wrench.data.despawnBy = live.id;
    // Close before consequence intents: a save inside a standing subscriber cannot replay it.
    const saved = visitOf(state);
    writeVisit(state, { ...saved, status: 'closed' });
    releaseTool(state, live);
    d.rep(TOOL_LEDGER.claimFactionId, TOOL_LEDGER.standingDelta, 'the_tool_ledger_returned');
    d.say(live, 'info',
      `The claim office files it in the physical ledger, one hand-line: 1 TOOL RETURNED BY `
        + `${callsignOf(state)}. 1 TOOL STILL OUT. THE RIFT KEEPS SCORE. You are the first `
        + `return in eleven entries. The clerk does not make a speech; the clerk just reads `
        + `your name off the next form without checking it.`,
      null, { literal: true });
    return settleSituation(d, live, state, 'returned', { tool: 'wrench' });
  },

  event(d, live, state, name, payload) {
    if (live.phase !== 'watch') return;
    if (name === 'tetherAttached') {
      const wrench = wrenchEnt(state, live);
      const attachment = state.combat?.attachments?.byId?.[payload?.attachmentId];
      const player = state.entities.get(state.playerId);
      if (wrench && attachment?.state === 'active' && attachment.ownerId === state.playerId
        && attachment.targetId === wrench.id && attachment.ownerGeneration === occupantGenerationOf(player)
        && attachment.targetGeneration === occupantGenerationOf(wrench)) {
        live.vars.toolWasTowed = true;
        saveTask(live, state);
      }
      return;
    }
    if (name !== 'dockCommitted' || payload?.stationId !== TOOL_LEDGER.claimStationId
      || payload.shipId !== state.playerId || payload.shipGeneration !== occupantGenerationOf(state.entities.get(state.playerId))
      || dockIntentStatus(state, payload) === 'stale') return;
    // Worker transport receives the already-validated UI receipt after its FIFO input folds;
    // the private main-side intent token intentionally does not cross the JSON boundary.
    return this._atDock(d, live, state);
  },
});

export default defineEncounter(trigger, {
  shape: {
    situation: 'wreck',
    place: 'anomaly_deep',
    twist: 'named',
    actor: 'faction_free',
  },
  title: 'THE HAUMEA TOOL LEDGER',
  factionId: 'faction_free',
  motive: 'the rift keeps score; you would be the first return',
  choices: [],
});
