// SP2-172 — THE TETHER MEMORIAL'S NEW LINE. The wall hears the maydays.
//
// The Charon Expanse memorial keeps the intake town's names, one per bunk that did not make
// the last boat. Phase 1 (special500.SP2-172, the director's hull:fractured receipt) was the
// wall starting to listen: a hull broke up in the expanse and the band carried the notice.
// This file is the substance the catalog line promised: when the player then survives a real
// near-death of their own — hull at or below 10% integrity, still alive — the wall takes the
// date and hull down, and on the player's next close pass the line is simply THERE, stenciled
// in the same paint as everyone else's. The memorial becomes a permanent landmark on the
// player's chart, and one warrant hunter buys the drink that mark earns.
//
// OWNERSHIP (single-writer):
//   * special500.SP2-172 flag — written only by special500Director (read here).
//   * The near-death record — no system owns a survival record (deedRecord records deeds of
//     the record's own kinds, hullLosses records lost hulls, not survivals), so this runtime
//     owns two plain-named story flags, written ONLY here: `tether_wall_near_death` (the
//     simTime the hull was read at or below the line, player still alive) and
//     `tether_wall_near_death_hull` (the fraction at that read). Plain flag writes from an
//     encounter runtime are the established pattern (driftAuctionRuntime.finish).
//   * `wall_knows` — the authored payoff flag (consensus), written only here.
//   * Map landmark — the memorial's row in state.world.discovery[sector].pois, the same
//     known-places record world.js persists and the chart reads; this runtime only ever
//     upgrades discovered/identified, never downgrades or rewrites an existing row.
//   * Memorial dressing — the live POI row and entity's scan fields (the same seam
//     playerHullEcho uses for the hull echo readout); the authored plate in sector data
//     is never touched.
//
// Deterministic: reads state.simTime and live hull truth only; no rng, no wall time. The
// special-500 context arrives through the director's flag, never on wall time.
import { deepFreeze, defineEncounter } from './catalog.js';
import { priorOutcome, settleSituation } from '../../systems/crSituationKit.js';
import { resolveWorldPresentationEntity } from '../../world/presentationSources.js';
import { TETHER_MEMORIAL_POI_ID, TETHER_MEMORIAL_WALL_FLAG,
  TETHER_MEMORIAL_SCAN_LABEL as SCAN_LABEL, TETHER_MEMORIAL_SCAN_DESCRIPTION as SCAN_DESCRIPTION,
  tetherMemorialPresentation,
} from '../tetherMemorialPresentation.js';

export const encounterOrder = 1310;
export const trigger = deepFreeze({
  id: 'tether_memorial_line',
  tier: 'ambient',
  deck: 'civilian',
  weight: 0.6,
  zoneTypes: ['derelict_field', 'mining_belt', 'patrol_corridor', 'anomaly_deep',
    'refinery_approach', 'ambush_lane', 'colony'],
  script: 'selfRegistered',
  pressureCost: 6,
  cooldownS: 600,
  proximity: true,
  rare: true,
  gates: { sectorIds: ['sector_charon_expanse'], blockAfterOutcome: 'wall_knows' },
});

export const MEMORIAL = Object.freeze({
  sectorId: 'sector_charon_expanse',
  poiId: TETHER_MEMORIAL_POI_ID,
  // A hull read at or below this fraction, with the player still alive, is the near-death
  // the wall stencils. Authored line: "below 10% integrity".
  nearDeathFrac: 0.10,
  // How close the player must come to the buoy for the wall to show the new line.
  deliveryWu: 180,
  // One watch shift per firing; the beat re-fires on its cooldown until the wall knows.
  watchWindowS: 1200,
  contextFlag: 'special500.SP2-172',
  flagWallKnows: TETHER_MEMORIAL_WALL_FLAG,
  flagNearDeath: 'tether_wall_near_death',
  flagNearDeathHull: 'tether_wall_near_death_hull',
  flagDrink: 'tether_wall_drink',
});

function flagOf(state, key) {
  return state && state.story && state.story.flags ? state.story.flags[key] : undefined;
}

function setFlag(state, key, value) {
  if (!state.story) state.story = { flags: {} };
  if (!state.story.flags || typeof state.story.flags !== 'object') state.story.flags = {};
  state.story.flags[key] = value;
}

function playerHullFraction(state) {
  const ent = state && state.entities && state.entities.get
    ? state.entities.get(state.playerId) : null;
  if (!ent || ent.alive === false) return null;
  const hull = Number(ent.hull);
  const hullMax = Number(ent.hullMax);
  if (!(hullMax > 0) || !(hull > 0)) return null;
  return hull / hullMax;
}

/** The live active-sector POI row for the memorial, with its marker entity if present. */
function memorialRow(state) {
  const active = state && state.world && state.world.activeSector;
  const row = ((active && active.pois) || []).find(
    (poi) => poi && poi.poiId === MEMORIAL.poiId,
  );
  if (!row || !row.pos) return null;
  const entity = resolveWorldPresentationEntity(state, row.id);
  return { row, entity: entity && entity.alive !== false ? entity : null };
}

function memorialDistance(state) {
  const player = state && state.entities && state.entities.get
    ? state.entities.get(state.playerId) : null;
  const site = memorialRow(state);
  if (!player || !player.pos || !site) return null;
  return Math.hypot(player.pos.x - site.row.pos.x, player.pos.z - site.row.pos.z);
}

/** The near-death record the wall keeps: set only by this runtime's watch. */
export function nearDeathRecord(state) {
  const at = flagOf(state, MEMORIAL.flagNearDeath);
  if (at == null) return null;
  const hull = flagOf(state, MEMORIAL.flagNearDeathHull);
  return { at: Number(at) || 0, hull: Number.isFinite(Number(hull)) ? Number(hull) : null };
}

export const runtime = Object.freeze({
  restoreSaved(d, state) {
    // World materialization precedes story restoration; apply the saved earned line once
    // the complete incoming story is published, without firing or delivering the beat again.
    const site = memorialRow(state);
    if (!site) return;
    const presentation = tetherMemorialPresentation(state, MEMORIAL.poiId);
    Object.assign(site.row, presentation);
    if (site.entity?.data) Object.assign(site.entity.data, presentation);
  },
  // The wall listens only where it stands (the expanse) and only after a mayday reached it
  // (the director's hull:fractured receipt set the context flag). Once the line is on the
  // wall the beat is history, on the flag and on the durable situation record both.
  fireReady(state) {
    if (!state || !state.world || state.world.currentSectorId !== MEMORIAL.sectorId) return false;
    if (flagOf(state, MEMORIAL.contextFlag) == null) return false;
    if (flagOf(state, MEMORIAL.flagWallKnows) != null) return false;
    if (priorOutcome(state, trigger.id)) return false;
    return true;
  },

  fire(d, live, state) {
    if (!runtime.fireReady(state)) return d.abort(live, 'wall_not_listening');
    if (nearDeathRecord(state) && (memorialDistance(state) ?? Infinity) <= MEMORIAL.deliveryWu) {
      return deliver(d, live, state);
    }
    // Watch mode: the wall stands its silent shift. No spawn, no line — it listens.
    live.vars.startedAt = d.now();
    return null;
  },

  tick(d, live, state, now) {
    if (live.phase === 'done') return;
    const vars = live.vars;

    // The mayday: one hull read at or below the line, pilot still breathing. The record is
    // written once; the wall keeps the first date and hull it heard.
    if (!nearDeathRecord(state)) {
      const frac = playerHullFraction(state);
      if (frac != null && frac <= MEMORIAL.nearDeathFrac) {
        setFlag(state, MEMORIAL.flagNearDeath, state.simTime || 0);
        setFlag(state, MEMORIAL.flagNearDeathHull, Math.round(frac * 1000) / 1000);
        d.say(live, 'info',
          'Your mayday goes out thin and honest. Somewhere on the Charon wall, fresh paint waits.',
          null, { literal: true });
      }
    }

    // The delivery: bring the recorded near-death back to the buoy.
    if (nearDeathRecord(state) && (memorialDistance(state) ?? Infinity) <= MEMORIAL.deliveryWu) {
      return deliver(d, live, state);
    }

    if ((now - (vars.startedAt || 0)) > MEMORIAL.watchWindowS) {
      return d.abort(live, 'stood_down');
    }
    return null;
  },

  event() {}, // the wall takes no part in the fight; it keeps the date afterwards
});

function deliver(d, live, state) {
  if (live.vars.delivered) return;
  live.vars.delivered = true;
  const record = nearDeathRecord(state);
  const now = state.simTime || 0;

  // The authored payoff flag, written once. A stale save or a duplicate delivery re-reads
  // the same wall: the guard above and fireReady keep this single-writer.
  setFlag(state, MEMORIAL.flagWallKnows, now);
  setFlag(state, MEMORIAL.flagDrink, now);

  // The dressing: the line goes onto the wall the player can actually read — the live POI
  // row and its marker entity's scan fields. The authored plate in sector data is untouched.
  const site = memorialRow(state);
  if (site) {
    site.row.scanDescription = SCAN_DESCRIPTION;
    if (site.entity && site.entity.data) {
      site.entity.data.scanLabel = SCAN_LABEL;
      site.entity.data.scanDescription = SCAN_DESCRIPTION;
    }
    // The permanent landmark: upgrade the memorial's known-places row (discovery is the
    // same durable record the chart reads; identified so the name never blanks again).
    const disc = state.world && state.world.discovery;
    if (disc && disc[MEMORIAL.sectorId]) {
      const sectorDisc = disc[MEMORIAL.sectorId];
      if (!sectorDisc.pois || typeof sectorDisc.pois !== 'object') sectorDisc.pois = {};
      const rec = sectorDisc.pois[MEMORIAL.poiId] || {};
      const wasUndiscovered = rec.discovered !== true;
      sectorDisc.pois[MEMORIAL.poiId] = {
        ...rec,
        discovered: true,
        identified: true,
        type: rec.type || 'beacon',
        name: rec.name || 'Tether Memorial',
        identifiedAt: rec.identifiedAt || now,
      };
      if (wasUndiscovered) {
        d.emit('poi:discovered', { poiId: MEMORIAL.poiId, type: 'beacon', sectorId: MEMORIAL.sectorId });
      }
    }
  }

  d.say(live, 'info',
    'The memorial\u2019s tether wall has a new line: your near-death date and hull, stenciled '
    + 'by no visible hand, in the same paint as everyone else\u2019s. A regular at the expanse '
    + 'bar does not look up: "The wall hears the maydays. If you lived through one, it knows. '
    + 'That is all the memorial has ever done: know."',
    null, { literal: true, primary: true });
  d.say(live, 'info',
    'A warrant hunter keys the band, private-like: "Saw the wall take your line. That is the '
    + 'fun way onto it. Drink\u2019s mine — station_expanse rail, tell them the wall sent you."',
    null, { literal: true });

  settleSituation(d, live, state, 'wall_knows', {
    nearDeathAt: record ? record.at : null,
    nearDeathHull: record ? record.hull : null,
    drinkOwedBy: 'warrant_hunter_charon',
  });
}

export default defineEncounter(trigger, {
  shape: {
    situation: 'wreck',
    place: 'derelict_field',
    twist: 'named',
    actor: 'faction_quiet',
  },
  title: 'THE TETHER MEMORIAL\u2019S NEW LINE',
  factionId: 'faction_quiet',
  motive: 'the wall hears the maydays and keeps the date',
  choices: [],
});
