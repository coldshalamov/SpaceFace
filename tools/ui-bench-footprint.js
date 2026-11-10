// ui-bench-footprint.js — a lived-in record for the UI bench's Footprint (F3) shots.
//
// The bench's GameState has no provenance at all, so --shot=footprint could only ever draw the
// "indexing" loading state and the screen was never judged with a record on it. A shot marked
// `footprint: 'wanted' | 'marked' | 'clean'` in scripts/lib/uiBenchCatalog.mjs gets this instead:
// provenance chains in the exact shape src/systems/provenanceLedger.js writes (act -> incident ->
// standing -> consequence, with its edges and open reasons), open incidents keyed to them, the
// player's heat / bounty / search zone as src/systems/heat.js leaves them, and the factions the
// chains name at the standing that makes Bribe honest. Nothing here ticks: the sim is paused while
// Footprint is open (screenManager PAUSING_SCREENS), so the heat clock holds where it was left —
// a probe that wants to see the dial cool advances heatZone.outsideS itself, the way heat.update
// would in flight.
//
// window.__benchFootprint(kind) reseeds a mounted screen ('wanted' | 'marked' | 'clean' | 'empty'
// | 'loading') and refreshes it, for pre-js probes.

import { factions as factionsSystem } from '../src/systems/factions.js';

const SECTOR = 'sector_helios_prime';

function node(k, tick, t, extra = {}) {
  return {
    k, t, tick,
    factionId: null, delta: null, newRep: null, newTier: null, tierChanged: false, reason: null,
    srcFaction: null, stationId: null, targetId: null, aceId: null, bodyId: null, lossId: null,
    outcome: k === 'act' ? 'destroyed' : 'witnessed_only', text: null, sectorId: SECTOR, incidentId: null, cause: null,
    ...extra,
  };
}

/** A piracy kill on a Meridian hauler: witnessed, logged at Helios Station, a bounty posted. */
function chainPiracy({ open = true, bountyPending = true } = {}) {
  return {
    id: 'pv:bench-piracy', t: 3890, tick: 233400, sectorId: SECTOR, rootKind: 'act', outcome: 'destroyed',
    nodes: [
      node('act', 233400, 3890, { factionId: 'faction_mts', targetId: 'ship:hauler-12', outcome: 'destroyed' }),
      node('incident', 233460, 3891, {
        factionId: 'faction_mts', stationId: 'station_helios', incidentId: 'inc:bench-piracy', cause: 'player_piracy',
        targetId: 'ship:hauler-12', text: 'Helios traffic control logged a piracy kill',
      }),
      node('standing', 233470, 3891.2, {
        factionId: 'faction_mts', delta: -60, newRep: -85, newTier: 'Hostile', tierChanged: true, reason: 'kill_faction_ship',
      }),
      node('spillover', 233475, 3891.3, { factionId: 'faction_scn', srcFaction: 'faction_mts', delta: -18, reason: 'spillover:kill_faction_ship' }),
      node('consequence', 233520, 3892, { factionId: 'faction_mts', text: 'Bounty posted on your hull', outcome: 'witnessed_only' }),
    ],
    edges: [[-1, 0, 'stub'], [0, 1, 'caused'], [1, 2, 'caused'], [2, 3, 'spillover'], [2, 4, 'caused']],
    open, settledAt: open ? null : 3990, bountyPending, amendsActive: false,
  };
}

/** A Concord patrol fired on, a named ace in the fight: the Navy hunts on sight. */
function chainAggro() {
  return {
    id: 'pv:bench-aggro', t: 4210, tick: 252600, sectorId: SECTOR, rootKind: 'act', outcome: 'disengaged',
    nodes: [
      node('act', 252600, 4210, { factionId: 'faction_scn', targetId: 'ship:patrol-4', outcome: 'disengaged', aceId: 'ace_yara_no_cut' }),
      node('incident', 252640, 4211, {
        factionId: 'faction_scn', stationId: 'station_coalition', incidentId: 'inc:bench-assault', cause: 'player_attack',
        targetId: 'ship:patrol-4', text: 'Concord patrol reported an unprovoked attack',
      }),
      node('standing', 252660, 4211.5, {
        factionId: 'faction_scn', delta: -45, newRep: -180, newTier: 'Hostile', tierChanged: true, reason: 'kill_faction_ship',
      }),
      node('consequence', 252700, 4212, { factionId: 'faction_scn', text: 'Concord patrols hunt you on sight' }),
    ],
    edges: [[-1, 0, 'stub'], [0, 1, 'caused'], [1, 2, 'caused'], [2, 3, 'caused']],
    open: true, settledAt: null, bountyPending: false, amendsActive: false,
  };
}

/** Contraband found on a customs scan: Meridian asks for amends. */
function chainContraband() {
  return {
    id: 'pv:bench-contraband', t: 2710, tick: 162600, sectorId: SECTOR, rootKind: 'incident', outcome: 'witnessed_only',
    nodes: [
      node('incident', 162600, 2710, {
        factionId: 'faction_mts', stationId: 'station_helios', incidentId: 'inc:bench-contraband', cause: 'contraband',
        text: 'Customs logged a contraband scan', outcome: 'witnessed_only',
      }),
      node('standing', 162610, 2710.2, { factionId: 'faction_mts', delta: -8, newRep: -25, newTier: 'Wary', reason: 'caught_contraband' }),
      node('consequence', 162700, 2712, { factionId: 'faction_mts', text: 'Amends asked: twelve crates of medical supplies' }),
    ],
    edges: [[-1, 0, 'stub'], [0, 1, 'caused'], [1, 2, 'caused']],
    open: true, settledAt: null, bountyPending: false, amendsActive: true,
  };
}

/** A Reach raider brought in alive: settled, and the Frontier approved. */
function chainCustody() {
  return {
    id: 'pv:bench-custody', t: 1620, tick: 97200, sectorId: SECTOR, rootKind: 'act', outcome: 'surrendered_secured',
    nodes: [
      node('act', 97200, 1620, { factionId: 'faction_reach', targetId: 'ship:raider-7', outcome: 'surrendered_secured' }),
      node('standing', 97230, 1620.5, { factionId: 'faction_free', delta: 6, newRep: 46, newTier: 'Friendly', reason: 'kill_faction_enemy_ship' }),
      node('consequence', 97300, 1622, { factionId: 'faction_free', text: 'Custody transferred at Helios Station' }),
    ],
    edges: [[-1, 0, 'stub'], [0, 1, 'caused'], [1, 2, 'caused']],
    open: false, settledAt: 1700, bountyPending: false, amendsActive: false,
  };
}

/** A drifting freighter towed home: settled. */
function chainRescue() {
  return {
    id: 'pv:bench-rescue', t: 820, tick: 49200, sectorId: SECTOR, rootKind: 'act', outcome: 'recovered',
    nodes: [
      node('act', 49200, 820, { factionId: 'faction_dmc', targetId: 'ship:freighter-3', outcome: 'recovered' }),
      node('standing', 49260, 821, { factionId: 'faction_dmc', delta: 5, newRep: 35, newTier: 'Friendly', reason: 'rescue_faction_distress' }),
    ],
    edges: [[-1, 0, 'stub'], [0, 1, 'caused']],
    open: false, settledAt: 900, bountyPending: false, amendsActive: false,
  };
}

function factionRow(rep, aggro) {
  return { rep, aggro, tier: null, bribesPaid: 0 };
}

const FOOTPRINT_KEYS = ['provenance'];

/** What a footprint shot overwrites, so every other shot mounts over the seeded state. */
let baseline = null;

export function seedFootprintShot(state, kind = 'wanted') {
  if (!baseline) {
    baseline = {
      provenance: state.provenance,
      heat: state.player.heat,
      bounty: state.player.bounty,
      heatZone: structuredClone(state.player.heatZone),
      factions: structuredClone(state.factions || {}),
      aceMemory: state.aceMemory,
      titles: state.titles,
      simTime: state.simTime,
    };
  }
  // The run has been going 72 minutes: the receipts below are minutes old, as a live record's would be.
  state.simTime = 4320;
  const player = state.player;
  player.heatZone = { active: false, center: { x: 0, z: 0 }, radius: 0, level: 0, outsideS: 0, clearAfterS: 0 };
  player.heat = 0;
  player.bounty = 0;
  state.factions = {
    ...(state.factions || {}),
    faction_scn: factionRow(kind === 'wanted' ? -180 : 12, kind === 'wanted'),
    faction_mts: factionRow(kind === 'clean' ? 4 : -85, false),
    faction_free: factionRow(46, false),
    faction_dmc: factionRow(35, false),
    faction_reach: factionRow(-120, false),
  };
  // bribeCost() reads the factions module's own state handle, which its init/update sets.
  try { factionsSystem.update(0, state); } catch { /* a bench without the owner shows Bribe gated */ }
  state.aceMemory = {
    schemaVersion: 2,
    ace_yara_no_cut: {
      id: 'ace_yara_no_cut', name: 'Yara No-Cut', crew: 'Red Latch Crew', gimmickTag: 'tether-cutter',
      encounterCount: 2, fleeCount: 1, flungCount: 0, returnTier: 1, returnsBigger: true,
    },
  };
  state.titles = { history: [{ titleId: 'title_thunderchild', holderKey: 'you' }] };

  if (kind === 'loading') { state.provenance = null; return; }
  if (kind === 'empty') {
    state.provenance = { v: 1, chains: [], openIncidents: {}, nextSeq: 0 };
    return;
  }
  if (kind === 'clean') {
    state.provenance = { v: 1, chains: [chainCustody(), chainRescue()], openIncidents: {}, nextSeq: 5 };
    return;
  }
  if (kind === 'marked') {
    player.bounty = 1800;
    const piracy = chainPiracy();
    state.provenance = {
      v: 1,
      chains: [piracy, chainCustody(), chainRescue()],
      openIncidents: {
        'inc:bench-piracy': { tick: 233460, cause: 'player_piracy', stationId: 'station_helios', factionId: 'faction_mts', chainId: piracy.id },
      },
      nextSeq: 5,
    };
    return;
  }
  // wanted: heat 0.46 (T3, nets), the hull outside a 2,300 wu search zone three seconds into the
  // level's seven-second clear, a 4,200 cr bounty, three open chains and two settled.
  player.heat = 0.46;
  player.bounty = 4200;
  player.heatZone = { active: true, center: { x: -2600, z: 900 }, radius: 2300, level: 3, outsideS: 3.1, clearAfterS: 7 };
  const piracy = chainPiracy();
  const aggro = chainAggro();
  const contraband = chainContraband();
  state.provenance = {
    v: 1,
    chains: [aggro, piracy, contraband, chainCustody(), chainRescue()],
    openIncidents: {
      'inc:bench-assault': { tick: 252640, cause: 'player_attack', stationId: 'station_coalition', factionId: 'faction_scn', chainId: aggro.id },
      'inc:bench-piracy': { tick: 233460, cause: 'player_piracy', stationId: 'station_helios', factionId: 'faction_mts', chainId: piracy.id },
    },
    nextSeq: 6,
  };
}

export function unseedFootprintShot(state) {
  if (!baseline) return;
  for (const key of FOOTPRINT_KEYS) state[key] = baseline[key];
  state.player.heat = baseline.heat;
  state.player.bounty = baseline.bounty;
  state.player.heatZone = structuredClone(baseline.heatZone);
  state.factions = structuredClone(baseline.factions);
  state.aceMemory = baseline.aceMemory;
  state.titles = baseline.titles;
  state.simTime = baseline.simTime;
  baseline = null;
}
