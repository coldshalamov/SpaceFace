// WF-08 — THE WITNESSED PRICE. The law's one-way mirror cracks: every lawful adjudication in the
// sim prices what the PLAYER did, while a pirate who vents a hauler in front of witnesses just
// flies home. This beat is the desk answering in-world: the dead ship's line posts a field price
// on the killer's hull before the wreck is even cold, and any registry that drops the marked hull
// collects — the "declared bounty work" branch of lawful kill adjudication, finally reachable
// from a lane the player actually flies.
//
// The scene is a fresh kill on the Helios freight spine: an MTS hauler dead-drift, its freight in
// the water still stamped to the estate, the Reach mark circling the corpse it made, one wing
// covering it, and an SCN customs cutter parked at witness standoff with the picture already
// sent. The desk broadcasts the posted price the moment the player is on the scene.
//
// Every judgement reads the world: the mark is a real hostile hull the law clears (zone_hostile,
// weapons-free context — killing it is lawful bounty work, not a charge), the pods are real
// owner-stamped freight (lawSecurity's stolen-cargo path prices a witnessed grab itself), the
// cutter is a real lawful witness (ai.lawful + lawWitness — killing it is a lawful_kill the
// witness ledger adjudicates honestly), and credits/rep/news run through the director's intents.
// The mark holds its loot posture only until the player closes, shoots, or touches the dead's
// freight — then it fights. Given time unchallenged it finishes the strip and bolts; past the
// egress reach the desk's live window is gone and the price lapses.
import { deepFreeze, defineEncounter } from './catalog.js';
import { ActivityKind, RulesOfEngagement, setEntityDoctrine } from '../../ai/doctrine.js';
import {
  alive, entityById, priorOutcome, publishSituationNews, settleSituation,
} from '../../systems/crSituationKit.js';

export const encounterOrder = 1207;
export const trigger = deepFreeze({
  id: 'the_witnessed_price',
  tier: 'minor',
  deck: 'combat',
  weight: 1,
  zoneTypes: ['trade_lane', 'patrol_corridor'],
  script: 'selfRegistered',
  fallbackScript: 'whisper',
  pressureCost: 22,
  cooldownS: 2400,
  proximity: true,
  fireWithinWu: 560,
  gates: { sectorIds: ['sector_helios_prime'] },
});

export const WITNESSED_PRICE = Object.freeze({
  windowS: 300,             // hard deadline: the desk's live window closes
  postedCr: 1400,           // the field price — posted on the wire, paid on the kill receipt
  fleeAfterS: 80,           // unchallenged, the mark finishes the strip and bolts
  fleeHullFrac: 0.35,       // wounded past this it runs mid-fight instead of dying posted
  engageWu: 220,            // closing inside this reads as the claim run — the mark answers
  egressWu: 1600,           // past this from the player the mark is off the wire
  witnessStandoffWu: 280,   // stays inside the 450 WU kill-witness radius even at the mark's
                            // widest loiter leg — the cutter is real eyes, not dressing
  podCount: 3,
});

const VICTIM = Object.freeze({
  name: 'Gallant Line',
  factionId: 'faction_mts',
  ownerId: 'victim:mts_gallant_line',
});

function tick60(now) { return Math.round(now * 60); }

/** The mark's loot posture: a real orbit over the corpse, guns deliberately cold. Not passive —
 * `zone_hostile` + a live doctrine keeps it a lawful hostile on the books, so the player who
 * drops it collects a posted price instead of a charge. */
function holdOverWreck(ent, live, now, reason) {
  setEntityDoctrine(ent, {
    activity: {
      kind: ActivityKind.LOITER,
      reason,
      anchor: live.anchor ? { x: live.anchor.x, z: live.anchor.z } : { x: ent.pos.x, z: ent.pos.z },
      leashRadius: 140,
      startedTick: tick60(now),
      encounterId: live.id,
    },
    roe: RulesOfEngagement.HOLD_FIRE,
  });
}

/** The claim run answered: the mark goes weapons-free on the player through the same doctrine
 * seam the picket uses — a real fight, not an execution the player administers. */
function goHot(ent, live, now, reason, targetId) {
  setEntityDoctrine(ent, {
    activity: {
      kind: ActivityKind.ATTACK_RUN,
      reason,
      anchor: live.anchor ? { x: live.anchor.x, z: live.anchor.z } : { x: ent.pos.x, z: ent.pos.z },
      leashRadius: 2400,
      startedTick: tick60(now),
      targetId: targetId == null ? null : targetId,
      encounterId: live.id,
    },
    roe: RulesOfEngagement.WEAPONS_FREE,
  });
  const ai = ent.data && ent.data.ai;
  if (ai) ai.passive = false;
  const intent = ent.data && ent.data.intent;
  if (intent) { intent.fire = false; intent.fireGroup = null; }
}

/** The mark's exit: a pointed bolt away from the claimant, still a lawful target while it flies. */
function goEgress(ent, live, now, awayFrom, reason) {
  let dx = (ent.pos.x || 0) - ((awayFrom && awayFrom.x) || 0);
  let dz = (ent.pos.z || 0) - ((awayFrom && awayFrom.z) || 0);
  const len = Math.hypot(dx, dz);
  if (!(len > 1)) { dx = Math.cos(now); dz = Math.sin(now); }
  else { dx /= len; dz /= len; }
  setEntityDoctrine(ent, {
    activity: {
      kind: ActivityKind.TRANSIT,
      reason,
      anchor: { x: ent.pos.x + dx * 4000, z: ent.pos.z + dz * 4000 },
      leashRadius: 5200,
      startedTick: tick60(now),
      encounterId: live.id,
    },
    roe: RulesOfEngagement.HOLD_FIRE,
  });
}

function dist2(a, b) {
  const dx = ((a && a.x) || 0) - ((b && b.x) || 0);
  const dz = ((a && a.z) || 0) - ((b && b.z) || 0);
  return dx * dx + dz * dz;
}

export const runtime = Object.freeze({
  fire(d, live, state) {
    const center = (live.plan && live.plan.zoneCenter) || live.anchor;
    if (!center || !Number.isFinite(center.x)) return d.abort(live, 'no_zone_anchor');
    const rng = d.stream(live, 'witnessed_price_layout');
    const a = rng() * Math.PI * 2;
    const u = { x: Math.cos(a), z: Math.sin(a) };
    const p = { x: -u.z, z: u.x };
    const at = (along, across) => ({
      x: center.x + u.x * along + p.x * across,
      z: center.z + u.z * along + p.z * across,
    });
    const prior = priorOutcome(state, live.shapeId);
    const priorClaimed = prior && prior.outcome === 'price_claimed';

    // The victim: an MTS hauler minutes dead, its line's freight already in the water.
    const wreck = d.spawnWreck(live, {
      pos: { x: center.x, z: center.z },
      pool: { cmdty_consumer_goods: 4, cmdty_refined_metals: 3, cmdty_scrap_metal: 6 },
      scanLabel: 'MTS HAULER GALLANT LINE — VENTED MINUTES AGO',
      storyPropKind: 'cr_witnessed_price_hauler',
    });
    if (!wreck) return d.abort(live, 'no_bodies');
    wreck.factionId = VICTIM.factionId;
    wreck.data.factionId = VICTIM.factionId;
    wreck.data.trafficRole = 'hauler';

    // The estate's freight: owner-stamped pods, so scooping them under the cutter's eyes is the
    // same witnessed-theft door a jettisoned pod opens anywhere else — the law's own machinery
    // prices it where a jurisdiction reaches, and the desk's rep answer lands either way.
    const podIds = [];
    const podSpecs = [
      { commodityId: 'cmdty_consumer_goods', amount: 10 },
      { commodityId: 'cmdty_refined_metals', amount: 7 },
      { commodityId: 'cmdty_electronics', amount: 4 },
    ];
    for (let i = 0; i < podSpecs.length && i < WITNESSED_PRICE.podCount; i++) {
      const side = i % 2 ? 1 : -1;
      const pod = d.spawnCargoPod(live, {
        pos: at(24 + i * 34, side * (38 + i * 16)), vel: { x: 0, z: 0 },
        commodityId: podSpecs[i].commodityId, amount: podSpecs[i].amount,
        unitMass: 0.5, radius: 5,
        ownerId: VICTIM.ownerId, ownerName: `the ${VICTIM.name}`, factionId: VICTIM.factionId,
      });
      if (!pod) continue;
      pod.data.scanLabel = `GALLANT LINE FREIGHT — ESTATE MANIFEST`;
      pod.data.encounterId = live.id;
      live.ids.push(pod.id);
      live.roles[pod.id] = 'estate_freight';
      podIds.push(pod.id);
    }
    if (podIds.length < WITNESSED_PRICE.podCount) return d.abort(live, 'no_bodies');

    // The cast: the mark and its wing still working the corpse; the cutter parked at standoff
    // with the picture already on the wire.
    const ids = d.spawnShips(live, [
      {
        archetype: 'reaver_pirate', level: 6, role: 'mark', factionId: 'faction_reach', team: 1,
        context: 'zone_hostile', passive: false, pos: at(46, 30),
        scanLabel: 'MARKED KILLER — FIELD PRICE POSTED',
      },
      {
        archetype: 'wasp_swarmer', level: 4, role: 'wing', factionId: 'faction_reach', team: 1,
        context: 'zone_hostile', passive: false, pos: at(-58, -44),
        scanLabel: 'REACH WING — COVERING THE MARK',
      },
      {
        archetype: 'customs_cutter', level: 5, role: 'witness', factionId: 'faction_scn', team: 2,
        context: 'patrol', passive: true, pos: at(-WITNESSED_PRICE.witnessStandoffWu, 70),
        scanLabel: 'SCN CUSTOMS — WITNESS HOLD',
      },
    ]);
    const mark = d.entsOf(live, 'mark')[0];
    const wing = d.entsOf(live, 'wing')[0];
    const witness = d.entsOf(live, 'witness')[0];
    if (!mark || !witness) return d.abort(live, 'no_cast');

    for (const e of [mark, wing]) {
      if (!e) continue;
      e.data.wantedTier = 'bounty';                       // the scanner reads the posted hull
      e.data.fieldPriceCr = WITNESSED_PRICE.postedCr;
      holdOverWreck(e, live, d.now(), 'the_witnessed_price:loot_hold');
    }
    if (witness) {
      // The desk's eyes: a lawful hull and an explicit witness marker, so every act on this
      // field — the claim, the robbery, a murder of the witness itself — is honestly seen.
      witness.data.ai = witness.data.ai || {};
      witness.data.ai.lawful = true;
      witness.data.lawWitness = true;
      holdOverWreck(witness, live, d.now(), 'the_witnessed_price:witness_hold');
    }

    live.data.witnessedPrice = {
      wreckId: wreck.id,
      markId: mark.id,
      wingIds: wing ? [wing.id] : [],
      witnessId: witness ? witness.id : null,
      podIds,
      hotAt: null,                 // set when the mark goes weapons-free
      fleeingAt: null,             // set when the mark bolts
      markGoneAt: null,
      robbed: 0,                   // estate pods taken under the cutter's eyes
      witnessDown: false,
      witnessFled: false,
      prior: prior ? prior.outcome : null,
      settled: false,
    };
    live.deadlineAt = d.now() + WITNESSED_PRICE.windowS;
    live.phase = 'posted';
    live.approach = {
      signal: 'marked_hull_over_the_dead',
      contacts: ids.length + 1 + podIds.length,
      t: d.now(),
    };
    live.vars = { ...(live.vars || {}), victim: VICTIM.name, price: WITNESSED_PRICE.postedCr };
    d.say(live, 'alert', priorClaimed
      ? `MTS FREIGHT DESK: another one. A Reach hull vented the ${VICTIM.name} on this lane and the line posts ${WITNESSED_PRICE.postedCr} cr on the killer, live now — your registry collected before, the desk remembers. The customs cutter holds the picture.`
      : `MTS FREIGHT DESK: witnessed kill on the ${VICTIM.name} — the line posts ${WITNESSED_PRICE.postedCr} cr on the killer's hull, live now. Any registry that drops the marked hull collects. The customs cutter is holding the picture; the dead's freight is still in the water.`,
    null, { primary: true, literal: true });
  },

  event(d, live, state, name, payload) {
    const w = live.data && live.data.witnessedPrice;
    if (!w || w.settled || live.phase === 'done') return;
    const now = d.now();
    if (name === 'squadKill' && payload) {
      const role = payload.role;
      if (role === 'mark') {
        if (payload.byPlayer) return this._settle(d, live, state, 'price_claimed');
        w.markGoneAt = now; // down to something that was not the claimant — the price lapses
        return;
      }
      if (role === 'wing' && payload.byPlayer) {
        w.wingDown = true;
        return;
      }
      if (role === 'witness' && payload.byPlayer && !w.witnessDown) {
        // The desk's eyes are a lawful hull: the kill ledger adjudicates the charge itself,
        // and the desk still pays the posted price — a dead witness cancels eyes, not the wire.
        w.witnessDown = true;
        d.rep('faction_scn', -6, 'the_witnessed_price_witness_down');
        d.say(live, 'bark', 'MTS FREIGHT DESK: the witness feed is dark. That registry has a second charge waiting wherever a desk can reach.', null, { literal: true });
        return;
      }
      return;
    }
    if (name === 'playerHitSquad' && payload && payload.targetId != null) {
      const role = live.roles && live.roles[payload.targetId];
      if (role === 'mark' || role === 'wing') this._goHot(d, live, 'answered_fire');
      if (role === 'witness' && !w.witnessDown && !w.witnessFled) {
        w.witnessFled = true;
        const witness = entityById(state, w.witnessId);
        if (witness && alive(witness)) goEgress(witness, live, now, d.player() && d.player().pos, 'the_witnessed_price:witness_bolt');
        d.say(live, 'bark', 'SCN CUSTOMS: the witness is under fire — burning for the gate. The picture is already on the wire.', null, { literal: true });
      }
      return;
    }
    if (name === 'tetherAttached' && payload && w.podIds.includes(payload.targetId)) {
      this._noteRobbery(d, live);
    }
  },

  tick(d, live, state, now) {
    const w = live.data && live.data.witnessedPrice;
    if (!w || w.settled || live.phase === 'done') return;
    const player = d.player();

    // The estate's freight is a live read: a pod out of the world (scooped) or riding the
    // player's line is the dead being robbed under a witness.
    for (const podId of w.podIds) {
      const pod = entityById(state, podId);
      if (!pod || pod.alive === false) {
        w.podIds = w.podIds.filter((id) => id !== podId);
        this._noteRobbery(d, live);
      }
    }

    const mark = entityById(state, w.markId);
    if (!mark || mark.alive === false) {
      // Dead without a player claim (environment, a third party, despawned mid-flee) — no
      // claimant, no payout. If the estate's freight walked off anyway, that is the outcome.
      return this._settle(d, live, state, w.robbed > 0 ? 'robbed_the_dead' : 'went_cold');
    }

    const playerPos = player && player.pos;
    const near = playerPos && dist2(mark.pos, playerPos) <= WITNESSED_PRICE.engageWu * WITNESSED_PRICE.engageWu;

    // The mark reads the approach: close aboard, touched, or its loot taken — it answers.
    if (w.hotAt == null && near) {
      this._goHot(d, live, 'claim_run_close');
      d.say(live, 'bark', 'MARKED HULL: I know what that vector means. Come and serve it, then.', null, { literal: true });
    }

    // The exit legs: unchallenged it finishes the strip and bolts on schedule; wounded deep
    // enough mid-fight it runs posted rather than dying for the price.
    const hullFrac = Number.isFinite(mark.hull) && mark.hullMax > 0 ? mark.hull / mark.hullMax : 1;
    if (w.fleeingAt == null
      && ((w.hotAt == null && now >= live.approach.t + WITNESSED_PRICE.fleeAfterS)
        || (w.hotAt != null && hullFrac <= WITNESSED_PRICE.fleeHullFrac))) {
      w.fleeingAt = now;
      goEgress(mark, live, now, playerPos, 'the_witnessed_price:mark_bolt');
      d.say(live, 'bark', 'MTS FREIGHT DESK: the mark is bolting — the posted price goes cold when it clears the relay reach.', null, { literal: true });
    }

    // Past the relay reach the live window is over: the desk keeps the price on the books,
    // but nobody is paying a claim called in from out here.
    if (w.fleeingAt != null && playerPos
      && dist2(mark.pos, playerPos) > WITNESSED_PRICE.egressWu * WITNESSED_PRICE.egressWu) {
      mark.data = mark.data || {};
      mark.data.despawnAt = now + 3;
      return this._settle(d, live, state, w.robbed > 0 ? 'robbed_the_dead' : 'went_cold');
    }

    if (now >= live.deadlineAt) {
      return this._settle(d, live, state, w.robbed > 0 ? 'robbed_the_dead' : 'went_cold');
    }
  },

  _goHot(d, live, reason) {
    const w = live.data && live.data.witnessedPrice;
    if (!w || w.hotAt != null) return;
    w.hotAt = d.now();
    const playerId = d.state && d.state.playerId;
    const mark = entityById(d.state, w.markId);
    if (mark && alive(mark)) goHot(mark, live, w.hotAt, `the_witnessed_price:${reason}`, playerId);
    for (const id of w.wingIds || []) {
      const wing = entityById(d.state, id);
      if (wing && alive(wing)) goHot(wing, live, w.hotAt, `the_witnessed_price:${reason}`, playerId);
    }
  },

  _noteRobbery(d, live) {
    const w = live.data && live.data.witnessedPrice;
    if (!w || w.settled) return;
    w.robbed += 1;
    // Robbing the estate is also the mark's loot the player is taking — it answers the same
    // way it answers a claim run.
    this._goHot(d, live, 'estate_robbed');
    if (w.robbed === 1) {
      d.say(live, 'bark', 'SCN CUSTOMS: the estate freight is logging handlers. The desk notes which registry the pods walked off with.', null, { literal: true });
    }
  },

  _settle(d, live, state, outcome) {
    const w = live.data && live.data.witnessedPrice;
    if (!w || w.settled) return;
    w.settled = true;
    const robbed = w.robbed > 0;
    const via = w.hotAt != null ? 'guns' : (w.fleeingAt != null ? 'chased' : 'stood_off');
    if (outcome === 'price_claimed') {
      d.grant(WITNESSED_PRICE.postedCr, 'the_witnessed_price:claim');
      d.rep('faction_mts', 4, 'the_witnessed_price_claimed');
      d.rep('faction_scn', 2, 'the_witnessed_price_lawful_work');
      if (robbed) d.rep('faction_mts', -4, 'the_witnessed_price_robbed_estate');
      publishSituationNews(d, live, robbed
        ? `FIELD PRICE PAID: the ${VICTIM.name}'s killer was dropped on the freight spine and the desk wired the claim — the same registry walked off with the dead's freight. The line pays and remembers both.`
        : `FIELD PRICE PAID: the ${VICTIM.name}'s killer was dropped on the freight spine by a claimant. The desk wired the posted price to the registry that took the shot.`);
    } else if (outcome === 'robbed_the_dead') {
      d.rep('faction_mts', -4, 'the_witnessed_price_robbed_estate');
      publishSituationNews(d, live, `ROBBED OVER THE DEAD: the ${VICTIM.name}'s estate freight walked off under a customs witness while the mark that vented her got clear. The line keeps the registry.`);
    } else { // went_cold
      if (robbed) d.rep('faction_mts', -4, 'the_witnessed_price_robbed_estate');
      publishSituationNews(d, live, w.witnessDown
        ? `PRICE GONE COLD, WITNESS DOWN: the ${VICTIM.name}'s killer cleared the relay reach and the desk's eyes are dead. The posting stays on the books; so does the registry.`
        : `PRICE GONE COLD: the ${VICTIM.name}'s killer cleared the relay reach unclaimed. The desk keeps the posting open — the wire remembers a hull that size.`);
    }
    live.vars = { ...(live.vars || {}), via };
    return settleSituation(d, live, state, outcome, {
      via, robbed, witnessDown: w.witnessDown === true, wingDown: w.wingDown === true,
    });
  },
});

export default defineEncounter(trigger, {
  shape: {
    situation: 'hunt',
    place: trigger.zoneTypes,
    twist: 'named',
    actor: 'faction_mts',
  },
  factionId: 'faction_mts',
  title: 'THE WITNESSED PRICE',
  primaryLine: `MTS FREIGHT DESK: witnessed kill on the ${VICTIM.name} — the line posts a field price on the killer's hull, live now. Any registry that drops the marked hull collects.`,
  verbs: ['fire', 'salvage', 'fly_on'],
  choices: [
    { id: 'claim', verb: 'fire', text: 'Drop the marked hull and collect the posted price.' },
    { id: 'rob', verb: 'salvage', text: 'Take the dead\'s estate freight under the cutter\'s eyes.' },
    { id: 'pass', verb: 'fly_on', text: 'Fly on — let the mark finish the strip and leave.' },
  ],
  civilian: { archetypes: ['customs_cutter'], size: [1, 1], factionId: 'faction_scn', context: 'patrol', team: 2, passive: true },
  squad: {
    archetypes: ['wasp_swarmer'], anchorArchetype: 'reaver_pirate', size: [2, 2],
    factionId: 'faction_reach', context: 'zone_hostile', team: 1, doctrine: 'scavenger', formation: 'loose',
  },
  deadlineS: WITNESSED_PRICE.windowS,
  receipts: {
    price_claimed: 'PRICE CLAIMED — the marked hull is down and the desk wired the posted price to your registry. Lawful work, on the record.',
    robbed_the_dead: 'ROBBED THE DEAD — the estate freight walked off with your registry under a witness. The mark got clear while the line logged you.',
    went_cold: 'GONE COLD — the mark cleared the relay reach and the live window closed. The desk keeps the posting on the books.',
  },
});
