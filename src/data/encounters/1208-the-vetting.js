// WF-03 sector identity — THE VETTING. Sker Haven's own ledger says the Bazaar is a market, not
// a kill box: "the door vets standing, the deep picket does not." The berth record enforces it
// (station_sker is repGated — floor +1), the rank table names the rungs (Mark / Crew / Blade /
// Name), and the Crimson Reach starts every pilot at -50 — but until now nothing in the sector
// played the door. The first sight of Sker was anonymous raiders; the dock refusal only ever met
// a hull that had already burned the whole leg in.
//
// This is the door, in space: a Reach vetting chord holds the Bazaar approach inside Skerris
// Deep — one corsair reading registries under two guns on the line. It hails instead of shooting
// because that IS the vetting. Its answer is mechanical, not cosmetic:
//
//   Vouched (rep >= the Bazaar's own floor): the door reads your name and opens — small standing.
//   Stranger (rep -29..0):  pay the cover (credits -> +standing), leave a taste (cargo tithe ->
//   +standing), or turn around. Paid enough, the hail says the door itself will read you.
//   Mark (rep <= -30):      the wire sells the mark back through the standing bribe contract
//   (faction:bribe -> bribeStanding, the same floor lift the desk sells) — or you turn around.
//   Fire on the chord and the door answers like a door: the count goes hostile and the sector
//   keeps the shot on the same wire it would have kept the cover.
//
// The wire remembers: a payer gets the cheaper book and the warm hail; a hull that shot the door
// pays the marked figure on the next pass. Every consequence moves through the standing owners —
// credits through economy:chargeCredits, freight through the director's own tithe, standing
// through faction:repDelta / faction:bribe, and the settlement through settleSituation's durable
// record.
import { deepFreeze, defineEncounter } from './catalog.js';
import {
  alive, entityById, priorOutcome, publishSituationNews, settleSituation,
} from '../../systems/crSituationKit.js';
import { bribeCost } from '../../systems/factions.js';

export const encounterOrder = 1208;
export const trigger = deepFreeze({
  id: 'the_vetting',
  tier: 'minor',
  deck: 'civilian',
  weight: 1.2,
  zoneTypes: ['outlaw_zone'],
  script: 'selfRegistered',
  fallbackScript: 'whisper',
  pressureCost: 16,
  cooldownS: 1800,
  proximity: true,
  fireWithinWu: 640,
  gates: { sectorIds: ['sector_sker_haven'] },
});

export const VETTING = Object.freeze({
  windowS: 300,               // the chord does not hold a stranger all day
  offerS: 90,                 // the wire stays open this long before "no answer" is an answer
  waveS: 8,                   // a vouched hull gets the wave, then the record
  chordWu: 260,               // the picket parks this far ahead on the Bazaar bearing
  gunFlankWu: 140,            // the two guns hold the count line across the chord
  leaveSlackWu: 900,          // player this far past the zone answered by leaving
  coverCr: 550,               // the stranger's cover — the door's own figure
  coverRep: 12,               // a paid cover climbs the vouch ladder
  tasteRep: 8,                // freight answers softer than paper
  waveRep: 2,                 // the door remembering a name is worth a line
  shotRep: -8,                // firing on the vetting chord
  brokenRep: -14,             // killing the chord outright
  payerDiscount: 0.8,         // the chord's book for a remembered payer
  hostileMarkup: 1.35,        // the count for a hull that shot the door
});

const STATION_ID = 'station_sker';
const DOOR_FLOOR_REP = 1;         // station_sker is repGated — its dock floor is positive standing
const MARK_REP = -30;             // factions.js dockAccess/repGated vocabulary: below this is a Mark
const NEUTRAL_FLOOR = -29;        // bribeStanding lifts a buyable mark to exactly this floor

const dist2 = (ax, az, bx, bz) => {
  const dx = ax - bx, dz = az - bz;
  return dx * dx + dz * dz;
};

function reachRep(state) {
  const rec = state && state.factions && state.factions.faction_reach;
  return rec && Number.isFinite(rec.rep) ? rec.rep : null;
}

function standingClass(rep) {
  if (rep == null) return 'stranger';                    // no ledger: the door reads a stranger
  if (rep >= DOOR_FLOOR_REP) return 'vouched';
  if (rep <= MARK_REP) return 'mark';
  return 'stranger';
}

/** The Bazaar's live position: the door's direction, when the sector is carrying it. */
function bazaarPos(d) {
  const stations = typeof d.stationsInSector === 'function' ? d.stationsInSector() : [];
  const found = (stations || []).find((s) => s && s.id === STATION_ID && s.pos);
  return found ? { x: found.pos.x, z: found.pos.z } : null;
}

export const runtime = Object.freeze({
  fire(d, live, state) {
    const center = (live.plan && live.plan.zoneCenter) || live.anchor;
    if (!center || !Number.isFinite(center.x)) return d.abort(live, 'no_zone_anchor');
    const p = d.player();
    if (!p || !p.pos) return d.abort(live, 'no_player');

    // The chord parks on the bearing the pilot is actually flying — toward the Bazaar when the
    // sector can prove the door's position, otherwise off the zone anchor on a seeded bearing.
    const rng = d.stream(live, 'vetting_layout');
    const door = bazaarPos(d);
    let ux = 0, uz = 0;
    if (door) {
      const dx = door.x - p.pos.x, dz = door.z - p.pos.z;
      const l = Math.hypot(dx, dz) || 1;
      ux = dx / l; uz = dz / l;
    } else {
      const a = rng() * Math.PI * 2;
      ux = Math.cos(a); uz = Math.sin(a);
    }
    const px = -uz, pz = ux;
    const chord = {
      x: p.pos.x + ux * VETTING.chordWu,
      z: p.pos.z + uz * VETTING.chordWu,
    };

    const rep = reachRep(state);
    const cls = standingClass(rep);
    const prior = priorOutcome(state, live.shapeId);
    const priorOutcomeId = prior && prior.outcome;
    const priorKind = (priorOutcomeId === 'covered' || priorOutcomeId === 'tasted'
      || priorOutcomeId === 'waved_in' || priorOutcomeId === 'unmarked') ? 'payer'
      : (priorOutcomeId === 'shot_the_door' || priorOutcomeId === 'door_broken') ? 'hostile'
        : null;

    // The door's figures: a remembered payer gets the better book, a hull that shot the door
    // pays the marked count. A Mark's wire price is the standing bribe's own number.
    let coverCr = VETTING.coverCr;
    if (priorKind === 'payer') coverCr = Math.max(1, Math.round(coverCr * VETTING.payerDiscount));
    if (priorKind === 'hostile') coverCr = Math.round(coverCr * VETTING.hostileMarkup);
    // Price the mark without paying it: the same contract the choice will invoke (bribeCost is
    // factions' own quote — Infinity when the mark is too deep to buy back, 0 when no ledger
    // is live, in which case the formula below mirrors its published arithmetic).
    let unmarkCr = cls === 'mark' ? bribeCost('faction_reach') : NaN;
    if ((!Number.isFinite(unmarkCr) || unmarkCr <= 0) && rep != null && rep <= MARK_REP && rep > -400) {
      unmarkCr = Math.round((Math.abs(rep) - 29) * 8);
    }
    const unbribeable = cls === 'mark' && !Number.isFinite(unmarkCr);

    const ids = d.spawnShips(live, [
      { archetype: 'corsair_raider', level: 8, role: 'vetter', factionId: 'faction_reach', team: 1,
        context: 'zone_hostile', passive: true, cultureId: 'drift-kings', pos: chord,
        scanLabel: 'SKER VETTING CHORD — REGISTRY READ' },
      { archetype: 'reaver_pirate', level: 7, role: 'chord', factionId: 'faction_reach', team: 1,
        context: 'zone_hostile', passive: true, cultureId: 'drift-kings',
        pos: { x: chord.x + px * VETTING.gunFlankWu, z: chord.z + pz * VETTING.gunFlankWu },
        scanLabel: 'CHORD GUN — HOLDING THE COUNT' },
      { archetype: 'reaver_pirate', level: 7, role: 'chord', factionId: 'faction_reach', team: 1,
        context: 'zone_hostile', passive: true, cultureId: 'drift-kings',
        pos: { x: chord.x - px * VETTING.gunFlankWu, z: chord.z - pz * VETTING.gunFlankWu },
        scanLabel: 'CHORD GUN — HOLDING THE COUNT' },
    ]);
    if (d.aliveCount(live, 'vetter') < 1 || d.aliveCount(live, 'chord') < 2) {
      return d.abort(live, 'no_bodies');
    }

    live.data.vetting = {
      vetterId: ids[0],
      repAtFire: rep,
      cls,
      priorKind,
      coverCr,
      unmarkCr,
      unbribeable,
      wavedAt: cls === 'vouched' ? d.now() + VETTING.waveS : null,
      offerEndsAt: cls === 'vouched' ? null : d.now() + VETTING.offerS,
      settled: false,
      shotAt: null,
    };
    live.deadlineAt = d.now() + VETTING.windowS;
    live.approach = { signal: 'vetting_chord_on_door_bearing', contacts: 3, t: d.now() };
    live.vars = { ...(live.vars || {}), stationName: 'Sker Bazaar' };

    if (cls === 'vouched') {
      live.phase = 'waved';
      d.say(live, 'alert', priorKind === 'payer'
        ? 'SKER VETTING CHORD: the door reads your name, and the count remembers your paper. Chord holds — you\'re through.'
        : 'SKER VETTING CHORD: registry reads vouched. The door knows your name — chord holds, you\'re through.',
      null, { primary: true, literal: true });
      return;
    }

    live.phase = 'offer';
    if (cls === 'mark') {
      live.vars.amount = Number.isFinite(unmarkCr) ? unmarkCr : 0;
      d.say(live, 'alert', unbribeable
        ? 'SKER VETTING CHORD: registry reads MARK too deep to buy back — you\'re cargo in this deep. Turn around, or be answered.'
        : `SKER VETTING CHORD: registry reads MARK — you're cargo in this deep, and the Bazaar's door doesn't open for cargo. The wire sells the mark back for ${unmarkCr} — or turn around before the Deep reads you worse.`,
      null, { primary: true, literal: true });
      const idsOffered = unbribeable ? ['turn_back'] : ['unmark', 'turn_back'];
      d.offerChoices(live, idsOffered, 'turn_back', live.data.vetting.offerEndsAt);
      return;
    }

    // stranger
    live.vars.amount = coverCr;
    d.say(live, 'alert', priorKind === 'payer'
      ? `SKER VETTING CHORD: the count remembers a payer — your name's already half written. The cover is ${coverCr} on the wire, or a taste worth the same off your hold. Or turn around; the door keeps.`
      : priorKind === 'hostile'
        ? `SKER VETTING CHORD: the door keeps your shot on the wire, so the count is higher — ${coverCr}, or a taste worth the same off your hold. Or turn around and stay unwritten.`
        : `SKER VETTING CHORD: registry reads a stranger. The Bazaar docks on names, not hulls — the cover is ${coverCr} on the wire, or a taste worth the same off your hold. Or turn around; the door keeps.`,
    null, { primary: true, literal: true });
    d.offerChoices(live, ['cover', 'taste', 'turn_back'], 'turn_back', live.data.vetting.offerEndsAt);
  },

  event(d, live, state, name, payload) {
    const w = live.data && live.data.vetting;
    if (!w || w.settled || live.phase === 'done') return;
    if (name === 'playerHitSquad' && payload) {
      const target = entityById(state, payload.targetId);
      if (!target || !live.ids.includes(target.id)) return;
      return this._doorShot(d, live, state);
    }
    if (name === 'squadKill' && payload && payload.byPlayer
      && (payload.role === 'vetter' || payload.role === 'chord')) {
      // A kill on the vetting chord is the door being shot, whether or not a hit event landed.
      this._doorShot(d, live, state);
      // The count survives a dead man; it does not survive a dead chord.
      if (d.aliveCount(live) === 0) return this._settle(d, live, state, 'door_broken');
    }
  },

  // The offers are single-shot (offerConsumed is the director's contract) — an answer that cannot
  // be taken is still an answer: the wire goes quiet, and the deadline, the leaving, or the guns
  // write the record.
  _refuse(d, live, line) {
    d.say(live, 'alert', `VETTING CHORD: ${line}`, null, { literal: true });
  },

  choose(d, live, state, choiceId) {
    const w = live.data && live.data.vetting;
    if (!w || w.settled || live.phase === 'done' || live.phase !== 'offer') return;
    if (choiceId === 'cover') {
      const credits = state.player && Math.round(Number(state.player.credits) || 0) || 0;
      const req = {
        amount: w.coverCr, reason: 'the_vetting:cover', requireFull: true,
        expectedCredits: credits, commit: () => true, result: false,
      };
      d.emit('economy:chargeCredits', req);
      if (req.result !== true) {
        return this._refuse(d, live, 'the wire came back short. The door doesn\'t do credit.');
      }
      d.rep('faction_reach', VETTING.coverRep, 'the_vetting_covered');
      const after = reachRep(state);
      const doorOpen = after != null && after >= DOOR_FLOOR_REP;
      // Transactional lines ride 'alert' — the wire's answer must land even inside the bark gap.
      d.say(live, 'alert', doorOpen
        ? 'VETTING CHORD: wire\'s clean — and the count crossed. The Bazaar reads your name now; dock like you\'re vouched, because you are.'
        : 'VETTING CHORD: wire\'s clean — the chord writes your name up a line. The door keeps count.',
      null, { literal: true });
      publishSituationNews(d, live,
        'COVER PAID ON THE SKER CHORD: a hull bought its name onto the Bazaar\'s book mid-lane. The Reach counts everything twice — once at the door, once at the desk.');
      return this._settle(d, live, state, 'covered', { paidCr: w.coverCr, repAfter: after, doorOpen });
    }
    if (choiceId === 'taste') {
      const tithe = typeof d.takeTithe === 'function' ? d.takeTithe(w.coverCr) : { taken: [], value: 0, label: 'nothing' };
      if (!tithe || !tithe.value) {
        return this._refuse(d, live, 'your hold reads empty. Paper or the lane home — the door takes one.');
      }
      d.rep('faction_reach', VETTING.tasteRep, 'the_vetting_tasted');
      const after = reachRep(state);
      const doorOpen = after != null && after >= DOOR_FLOOR_REP;
      d.say(live, 'alert', doorOpen
        ? `VETTING CHORD: freight answers where paper won't — ${tithe.label} across the scale. The Bazaar reads your name now.`
        : `VETTING CHORD: ${tithe.label} across the scale — the count remembers a taste. The door keeps the rest of the arithmetic.`,
      null, { literal: true });
      publishSituationNews(d, live,
        'A TASTE OFF THE HOLD: a stranger bought its way up the Bazaar book in freight. The Reach fence keeps two ledgers and both of them remember.');
      return this._settle(d, live, state, 'tasted', {
        taken: tithe.taken, tasteValue: tithe.value, repAfter: after, doorOpen,
      });
    }
    if (choiceId === 'unmark') {
      const req = { factionId: 'faction_reach', result: null };
      d.emit('faction:bribe', req);
      const res = req.result;
      if (!res || res.ok !== true) {
        return this._refuse(d, live, res && res.reason === 'short'
          ? 'the wire came back short. The mark stays on.'
          : 'that mark is too deep for the wire to sell back. Turn around.');
      }
      d.say(live, 'alert',
        `VETTING CHORD: the mark's off the wire for ${res.cost}. You're a stranger now — strangers pay the cover like everyone else.`,
        null, { literal: true });
      publishSituationNews(d, live,
        'A MARK SOLD BACK ON THE CHORD: the Reach un-wrote a registry at the Bazaar\'s door for cash on the wire. Everything in Sker is for sale, starting with your name.');
      return this._settle(d, live, state, 'unmarked', { cost: res.cost, repAfter: reachRep(state) });
    }
    // turn_back / timeout / unknown — no answer is an answer; the door keeps its count.
    return this._turnBack(d, live, state);
  },

  tick(d, live, state, now) {
    const w = live.data && live.data.vetting;
    if (!w || w.settled || live.phase === 'done') return;

    // The chord is dead in the water by any hand — the Bazaar heard all of it.
    if (d.aliveCount(live) === 0) {
      return this._settle(d, live, state, 'door_broken', { silent: !w.shotAt });
    }

    if (live.phase === 'waved') {
      if (now >= w.wavedAt) return this._settle(d, live, state, 'waved_in');
      return;
    }

    if (live.phase === 'conflict') {
      // The door answered; what writes the record is how the fight ends. Leaving while the
      // chord lives is a shot the sector keeps; killing it outright is caught above.
      if (now >= live.deadlineAt || !d.playerNearZone(live, VETTING.leaveSlackWu)) {
        return this._settle(d, live, state, 'shot_the_door');
      }
      return;
    }

    // offer: the window, the wire's patience, or simply leaving — all three read the same.
    if (now >= live.deadlineAt || now >= w.offerEndsAt || !d.playerNearZone(live, VETTING.leaveSlackWu)) {
      return this._turnBack(d, live, state, { unanswered: true });
    }
  },

  _turnBack(d, live, state, facts = {}) {
    const w = live.data.vetting;
    d.say(live, 'bark', 'VETTING CHORD: smart hull. The door keeps.', null, { literal: true });
    return this._settle(d, live, state, 'turned_back', facts);
  },

  _doorShot(d, live, state) {
    const w = live.data.vetting;
    if (w.doorAnswered) return;
    w.doorAnswered = true;
    w.shotAt = d.now();
    live.phase = 'conflict';
    // 'alert' — exempt from the 4 s bark gap, and the one line that must always land.
    d.say(live, 'alert', 'VETTING CHORD: the door answers.', null, { literal: true });
    d.setPassive(live, false);
    d.rep('faction_reach', VETTING.shotRep, 'the_vetting_shot_the_door');
    publishSituationNews(d, live,
      'THE DOOR ANSWERED: a hull opened fire on the Bazaar\'s vetting chord. The Reach writes that in the same book it writes the cover.');
  },

  _settle(d, live, state, outcome, facts = {}) {
    const w = live.data && live.data.vetting;
    if (!w || w.settled) return;
    w.settled = true;
    if (outcome === 'waved_in') {
      d.rep('faction_reach', VETTING.waveRep, 'the_vetting_waved_in');
    } else if (outcome === 'door_broken') {
      // Standing moves only when the player fired on the chord — a crew other hands killed
      // still writes the record, but the count is not the player's to carry.
      if (w.shotAt) d.rep('faction_reach', VETTING.brokenRep, 'the_vetting_door_broken');
      publishSituationNews(d, live,
        'VETTING CHORD DOWN: the Bazaar\'s door crew is dead in the water off the approach. The Reach does not forget a registry that shoots its doors.');
    }
    return settleSituation(d, live, state, outcome, {
      cls: w.cls, priorKind: w.priorKind, repAtFire: w.repAtFire, ...facts,
    });
  },
});

export default defineEncounter(trigger, {
  shape: { situation: 'toll', place: trigger.zoneTypes, twist: 'named', actor: 'faction_reach' },
  factionId: 'faction_reach',
  title: 'THE VETTING',
  primaryLine: 'SKER VETTING CHORD: registry reads a stranger. The Bazaar docks on names, not hulls — pay the cover, leave a taste off your hold, or turn around. The door keeps.',
  verbs: ['pay', 'jettison', 'turn_back', 'fire', 'fly_on'],
  choices: [
    { id: 'cover', verb: 'pay', text: 'Wire the cover — the chord writes your name up a line.', needs: 'credits' },
    { id: 'taste', verb: 'jettison', text: 'Leave a taste — freight worth the cover comes off your hold.', needs: 'cargo' },
    { id: 'unmark', verb: 'pay', text: 'Buy the mark off the wire.', needs: 'credits' },
    { id: 'turn_back', verb: 'fly_on', text: 'Turn around. The Bazaar is for the vouched.' },
  ],
  timeoutChoice: 'turn_back',
  deadlineS: VETTING.windowS,
  receipts: {
    waved_in: 'VOUCHED — the chord read your name and opened. The Bazaar\'s door is a desk, not a wall.',
    covered: 'COVERED — the wire cleared and the chord wrote your name up. Reach standing follows the count.',
    tasted: 'TASTED — freight off your hold bought the chord\'s memory. The door keeps count either way.',
    unmarked: 'UNMARKED — you bought the mark back for cash on the wire. The Bazaar still vets at the door.',
    turned_back: 'TURNED BACK — the chord watched you leave. The door keeps its count.',
    shot_the_door: 'SHOT THE DOOR — you answered the vetting with fire. The Reach writes it in the same book.',
    door_broken: 'DOOR BROKEN — the vetting chord is dead in the water. Sker Bazaar heard all of it.',
  },
});
