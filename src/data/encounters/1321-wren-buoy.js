// SP2-035 — SIGNAL BUOY VHL-4471. Two thousand WU from anything with a name, in the Ashfall
// outer dark, a hand-built marker buoy floats in nothing: transponder VHL-4471-T / TESSERA,
// transmitter off. Wired to it is a paper tag — the only readable surface for 2000 WU in any
// direction: FOR WHOEVER FLIES HER NEXT. SHE PULLS LEFT. SHE IS WORTH IT. — W.
//
// The catalog entry (special500.SP2-035, the director's endgame:chosen receipt) is the
// noticing line; this file is the buoy itself, on the post-ending continuation route. The
// spine end-state gate is the honest read the ending already files: `state.story.endgameChoice`
// is set the moment a disposition resolves (systems/story.js) and persists with the save.
//
// OWNERSHIP (single-writer):
//   * `wren_buoy_found` — written only here, latched before its emit. The permanent record:
//     the shipworks hull-notes row ("she pulls left") reads it.
//   * the buoy prop — encounter-owned dressing re-materialized per watch; the flag is the
//     durable truth, and 'found' is terminal (blockAfterOutcome).
//
// The distance gate is real: the watch only stands where no station is within 2000 WU —
// the tag is the only readable surface for that kind of empty.
import { deepFreeze, defineEncounter } from './catalog.js';
import { settleSituation } from '../../systems/crSituationKit.js';

export const encounterOrder = 1321;
export const trigger = deepFreeze({
  id: 'wren_buoy',
  tier: 'ambient',
  deck: 'civilian',
  weight: 0.7,
  zoneTypes: ['anomaly_deep', 'derelict_field'],
  script: 'selfRegistered',
  pressureCost: 6,
  cooldownS: 600,
  proximity: true,
  rare: true,
  gates: {
    sectorIds: ['sector_ashfall_reach'],
    blockAfterOutcome: 'found',
  },
});

export const BUOY = Object.freeze({
  minStationWu: 2000,   // authored: 2000+ WU from any station
  readWu: 160,          // how close the hull comes before the tag is readable
  windowS: 300,
});

function flagsOf(state) {
  return state && state.story && state.story.flags && typeof state.story.flags === 'object'
    ? state.story.flags : null;
}

function nearestStationDistance(state) {
  const player = state && state.entities && state.entities.get
    ? state.entities.get(state.playerId) : null;
  if (!player || !player.pos) return null;
  let best = Infinity;
  for (const e of state.entityList || []) {
    if (!e || e.alive === false || e.type !== 'station' || !e.pos) continue;
    const dx = e.pos.x - player.pos.x;
    const dz = e.pos.z - player.pos.z;
    const d2 = dx * dx + dz * dz;
    if (d2 < best) best = d2;
  }
  return Number.isFinite(best) ? Math.sqrt(best) : null;
}

function buoyDistance(state, live) {
  const player = state && state.entities && state.entities.get
    ? state.entities.get(state.playerId) : null;
  const buoyId = live.vars && live.vars.buoyId;
  const buoy = buoyId != null && state.entities && state.entities.get
    ? state.entities.get(buoyId) : null;
  if (!player || !player.pos || !buoy || !buoy.pos) return null;
  return Math.hypot(player.pos.x - buoy.pos.x, player.pos.z - buoy.pos.z);
}

export const runtime = Object.freeze({
  // The spine end-state gate: a filed ending (the post-game continuation route) and a buoy
  // nobody has read yet. Without both, the dark stays dark.
  fireReady(state) {
    const story = state && state.story;
    if (!story || story.endgameChoice == null) return false;
    const flags = flagsOf(state);
    return !(flags && flags.wren_buoy_found != null);
  },

  fire(d, live, state) {
    const anchor = live.anchor || (live.plan && live.plan.zoneCenter);
    if (!anchor || !Number.isFinite(anchor.x)) return d.abort(live, 'no_zone_anchor');
    const nearest = nearestStationDistance(state);
    if (nearest != null && nearest < BUOY.minStationWu) {
      return d.abort(live, 'not_far_enough_out');
    }
    const buoy = d.spawnProp(live, {
      type: 'beacon',
      pos: { x: anchor.x + 24, z: anchor.z - 30 },
      radius: 4,
      scanLabel: 'VHL-4471-T / TESSERA \u2014 TRANSMITTER OFF',
      storyPropKind: 'wren_buoy',
    });
    if (!buoy || buoy.id == null) return d.abort(live, 'prop_failed');
    live.vars.buoyId = buoy.id;
    live.vars.startedAt = d.now();
    live.phase = 'watch';
    d.say(live, 'info',
      'A hand-built marker buoy floats in nothing, transponder-labeled VHL-4471-T / TESSERA, '
      + 'transmitter off. Wired to it is a paper tag \u2014 the only readable surface for two '
      + 'thousand WU in any direction.',
      null, { literal: true, primary: true });
    return null;
  },

  tick(d, live, state, now) {
    if (live.phase !== 'watch') return;
    if (now >= (live.vars.startedAt || 0) + BUOY.windowS) return d.abort(live, 'stood_down');
    const dist = buoyDistance(state, live);
    if (dist != null && dist <= BUOY.readWu) {
      const flags = flagsOf(state) || {};
      if (flags.wren_buoy_found == null) {
        if (!state.story) state.story = { flags: {} };
        if (!state.story.flags || typeof state.story.flags !== 'object') state.story.flags = {};
        state.story.flags.wren_buoy_found = Number(state.simTime) || 0;
      }
      d.say(live, 'info',
        'The tag reads, in careful welding-hand: FOR WHOEVER FLIES HER NEXT. SHE PULLS LEFT. '
          + 'SHE IS WORTH IT. \u2014 W. The buoy does not ask for anything. It is a marker: '
          + 'someone was here, and someone will be.',
        null, { literal: true, primary: true });
      return settleSituation(d, live, state, 'found', { tag: 'wren' });
    }
    return null;
  },

  event() {}, // the buoy takes no part in anything; it floats, and it is worth it
});

export default defineEncounter(trigger, {
  shape: {
    situation: 'wreck',
    place: 'anomaly_deep',
    twist: 'named',
    actor: 'faction_free',
  },
  title: 'SIGNAL BUOY VHL-4471',
  factionId: 'faction_free',
  motive: 'a marker left for whoever flies her next',
  choices: [],
});
