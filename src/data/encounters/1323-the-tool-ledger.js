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
// Deterministic: the watch reads live tether truth and the dock receipt the UI already
// publishes on state.ui; no rng, no wall time. A missing fissure row aborts inert.
import { deepFreeze, defineEncounter } from './catalog.js';
import { settleSituation } from '../../systems/crSituationKit.js';

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
  return ent && ent.alive !== false ? ent : null;
}

function wrenchTowed(state, live) {
  const wrench = wrenchEnt(state, live);
  if (!wrench) return false;
  const tether = state.player && state.player.tether;
  if (tether && tether.active && tether.targetId === wrench.id) return true;
  const player = state.entities && state.entities.get
    ? state.entities.get(state.playerId) : null;
  if (!player || !player.pos || !wrench.pos) return false;
  const d = Math.hypot(player.pos.x - wrench.pos.x, player.pos.z - wrench.pos.z);
  return d <= TOOL_LEDGER.towRadiusWu; // on the line behind the docked hull
}

export const runtime = Object.freeze({
  fire(d, live, state) {
    const flags = flagsOf(state);
    if (flags && flags.tool_returned != null) return d.abort(live, 'already_returned');
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
    live.vars.wrenchId = wrench.id;
    live.vars.startedAt = d.now();
    live.phase = 'watch';
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
    // The claim office is the dock: the UI's own docked record is the dock receipt the
    // observatory reads (the same seam special500Sommelier reads).
    if (!state.ui || !state.ui.docked || state.ui.dockedStationId !== TOOL_LEDGER.claimStationId) {
      return null;
    }
    if (!wrenchTowed(state, live)) return null;
    return this._returnTool(d, live, state);
  },

  _returnTool(d, live, state) {
    const flags = flagsOf(state) || {};
    if (flags.tool_returned == null) {
      if (!state.story) state.story = { flags: {} };
      if (!state.story.flags || typeof state.story.flags !== 'object') state.story.flags = {};
      state.story.flags.tool_returned = Number(state.simTime) || 0;
    }
    d.despawnAll(live, 0.5, 'prop');
    d.rep(TOOL_LEDGER.claimFactionId, TOOL_LEDGER.standingDelta, 'the_tool_ledger_returned');
    d.say(live, 'info',
      `The claim office files it in the physical ledger, one hand-line: 1 TOOL RETURNED BY `
        + `${callsignOf(state)}. 1 TOOL STILL OUT. THE RIFT KEEPS SCORE. You are the first `
        + `return in eleven entries. The clerk does not make a speech; the clerk just reads `
        + `your name off the next form without checking it.`,
      null, { literal: true, primary: true });
    return settleSituation(d, live, state, 'returned', { tool: 'wrench' });
  },

  event() {}, // the rope is the player's; the ledger only reads outcomes
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
