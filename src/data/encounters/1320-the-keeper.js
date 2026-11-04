// SP1-080 — THE KEEPER. A lone suit-tender lives aboard the dead station in the Sker Haven
// drift and re-transmits its final broadcast — arrival boards, shift bells, a weather report
// for a sky that no longer exists — word-perfect, every hour, for a town that evacuated
// eleven years ago. The transmitter is dying.
//
// The vignette is the 902-scene precedent carried by a custom runtime (the 1310/1311
// pattern): a self-registered ambient beat that spawns one prop — the dead transmitter mast —
// stands a watch, keeps the broadcast cadence, and offers the donation choice. The choice is
// only offered when the hull actually carries the part (one Machine Control Unit, purchasable
// at any fab or trade-hub berth); the donation moves through the canonical cargo writer
// (removeCargo) and writes the plain-named story flag `keeper_crew_visiting` — the keeper
// reads your hull number into the station log as "crew, visiting".
//
// OWNERSHIP (single-writer):
//   * `keeper_crew_visiting` — written only here, latched before its emit. Persistent.
//   * the mast prop — encounter-owned dressing (live.propIds), re-materialized per watch.
//   * the situation outcome — 'donated' is terminal (blockAfterOutcome); a watch that times
//     out aborts inert and the beat may re-fire on its cooldown.
//
// Deterministic: the broadcast cadence reads state.simTime; the choice gate reads live
// cargo truth; no rng, no wall time.
import { deepFreeze, defineEncounter } from './catalog.js';
import { settleSituation } from '../../systems/crSituationKit.js';
import { removeCargo } from '../../systems/cargo.js';

export const encounterOrder = 1320;
export const trigger = deepFreeze({
  id: 'the_keeper',
  tier: 'ambient',
  deck: 'civilian',
  weight: 0.7,
  zoneTypes: ['outlaw_zone'],
  script: 'selfRegistered',
  pressureCost: 6,
  cooldownS: 900,
  proximity: true,
  rare: true,
  gates: {
    sectorIds: ['sector_sker_haven'],
    blockAfterOutcome: 'donated',
  },
});

// The transmitter part the keeper needs: a Machine Control Unit, category tech, purchasable
// at fab and trade-hub berths ("findable or purchasable").
export const PART_COMMODITY = 'cmdty_control_unit';

export const KEEPER = Object.freeze({
  windowS: 300,          // one watch; the beat re-fires on cooldown until the donation lands
  offerS: 240,           // how long the donation stays open on the wire
  broadcastEveryS: 75,   // the hourly broadcast, compressed to a watch
  mastOffset: Object.freeze({ x: 30, z: -18 }),
});

// Word-perfect, every hour, for a town that evacuated eleven years ago.
const BROADCASTS = Object.freeze([
  'ARRIVAL BOARDS: LANE 2 OPEN. LANE 4 CLOSED FOR RESURFACING. WELCOME HOME.',
  'SHIFT BELL: SECOND WATCH. CREW TO STATIONS. CREW TO STATIONS.',
  'WEATHER: CLEAR SKY, LIGHT GRAVITY WIND OUT OF THE EAST. A GOOD DAY TO BE OUTSIDE.',
  'NOTICE: THE CANTEEN OPENS AT SIX. THE CANTEEN HAS ALWAYS OPENED AT SIX.',
  'ARRIVAL BOARDS: THE 07:10 IS IN. THE 07:10 IS ALWAYS IN.',
]);

function flagsOf(state) {
  return state && state.story && state.story.flags && typeof state.story.flags === 'object'
    ? state.story.flags : null;
}

function heldUnits(state, commodityId) {
  const items = state && state.player && state.player.cargo && state.player.cargo.items;
  return Math.floor(Number(items && items[commodityId]) || 0);
}

function hullPlate(state) {
  const ent = state && state.entities && state.entities.get
    ? state.entities.get(state.playerId) : null;
  const raw = (ent && ent.data && (ent.data.identityKey || ent.data.callsign))
    || (ent && ent.name) || (state && state.playerId) || 'hull unknown';
  return String(raw).slice(0, 48);
}

export const runtime = Object.freeze({
  fire(d, live, state) {
    const anchor = live.anchor || (live.plan && live.plan.zoneCenter);
    if (!anchor || !Number.isFinite(anchor.x)) return d.abort(live, 'no_zone_anchor');
    const flags = flagsOf(state);
    if (flags && flags.keeper_crew_visiting != null) return d.abort(live, 'already_crew');

    const mast = d.spawnProp(live, {
      type: 'beacon',
      pos: { x: anchor.x + KEEPER.mastOffset.x, z: anchor.z + KEEPER.mastOffset.z },
      radius: 7,
      scanLabel: 'DEAD STATION TRANSMITTER — STILL WARM',
      storyPropKind: 'the_keeper_mast',
    });
    if (!mast || mast.id == null) return d.abort(live, 'prop_failed');

    live.vars.startedAt = d.now();
    live.vars.offerEndsAt = d.now() + KEEPER.offerS;
    live.vars.nextBroadcastAt = d.now() + KEEPER.broadcastEveryS;
    live.vars.broadcastIndex = 0;
    live.phase = 'watch';
    d.say(live, 'info',
      'A dead station\u2019s transmitter is still warm. The broadcast is word-perfect, every '
      + 'hour, for a town that evacuated eleven years ago: arrival boards, shift bells, a '
      + 'weather report for a sky that no longer exists.',
      null, { literal: true, primary: true });
    this._offer(d, live, state);
    return null;
  },

  // The donation choice is only on the wire when the hull actually carries the part — an
  // offered button that always fails is not a vignette, it is a taunt.
  _offer(d, live, state) {
    if (live.phase !== 'watch') return;
    const canDonate = heldUnits(state, PART_COMMODITY) >= 1;
    const options = canDonate ? ['donate_part', 'listen', 'leave'] : ['listen', 'leave'];
    d.offerChoices(live, options, 'leave', live.vars.offerEndsAt);
  },

  choose(d, live, state, choiceId) {
    if (live.phase !== 'watch') return;
    const flags = flagsOf(state);
    if (choiceId === 'donate_part') {
      if (heldUnits(state, PART_COMMODITY) < 1) {
        d.say(live, 'bark',
          'THE KEEPER: you came to give a transmitter part and brought the space where one '
          + 'would be. The boards keep reading. No harm filed.',
          null, { literal: true });
        return this._offer(d, live, state);
      }
      if (removeCargo(state, PART_COMMODITY, 1) <= 0) {
        return this._offer(d, live, state); // the hold changed between offer and answer
      }
      if (!state.story) state.story = { flags: {} };
      if (!state.story.flags || typeof state.story.flags !== 'object') state.story.flags = {};
      if (state.story.flags.keeper_crew_visiting == null) {
        state.story.flags.keeper_crew_visiting = Number(state.simTime) || 0;
      }
      d.say(live, 'info',
        `The transmitter stops dying. The keeper opens the station log and writes your hull `
          + `number in by hand \u2014 ${hullPlate(state)} \u2014 filed under "crew, visiting." `
          + `It is the nicest thing anyone does all week.`,
        null, { literal: true, primary: true });
      d.despawnAll(live, 0.5, 'prop');
      return settleSituation(d, live, state, 'donated', { part: PART_COMMODITY });
    }
    if (choiceId === 'listen') {
      this._broadcast(d, live, true);
      return this._offer(d, live, state);
    }
    // 'leave' and the watch going quiet at the deadline: the boards keep reading without you.
    return d.abort(live, 'stood_down');
  },

  _broadcast(d, live, force = false) {
    const vars = live.vars;
    const line = BROADCASTS[vars.broadcastIndex % BROADCASTS.length];
    vars.broadcastIndex = (vars.broadcastIndex | 0) + 1;
    d.say(live, 'info', `THE KEEPER\u2019S STATION \u2014 ${line}`, null, { literal: true });
    return line;
  },

  tick(d, live, state, now) {
    if (live.phase !== 'watch') return;
    const vars = live.vars;
    if (now >= vars.offerEndsAt) return this.choose(d, live, state, 'leave');
    if (now >= (vars.startedAt || 0) + KEEPER.windowS) return d.abort(live, 'stood_down');
    if (now >= (vars.nextBroadcastAt || 0)) {
      vars.nextBroadcastAt = now + KEEPER.broadcastEveryS;
      this._broadcast(d, live);
    }
    return null;
  },

  event() {}, // the mast takes no part in the fight; it keeps the hour afterwards
});

export default defineEncounter(trigger, {
  shape: {
    situation: 'anomaly',
    place: 'outlaw_zone',
    twist: 'named',
    actor: 'faction_free',
  },
  title: 'THE KEEPER',
  factionId: 'faction_free',
  motive: 'the broadcast continues; the transmitter is dying',
  choices: [
    { id: 'donate_part', label: 'Donate the transmitter part.' },
    { id: 'listen', label: 'Stand and listen to the broadcast.' },
    { id: 'leave', label: 'Leave the boards reading.' },
  ],
  timeoutChoice: 'leave',
});
