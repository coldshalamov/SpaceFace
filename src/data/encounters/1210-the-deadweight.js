// INF — THE DEADWEIGHT. The tow verb has never had an employer. The line's own winch tugs haul
// the dead (the last tow), the Towline Table hires an NPC tug FOR the pilot, the Orchard receiver
// collects its own pods, and every player-side delivery ends at a fixed point — a berth buoy, a
// jaw's edge, a station anchor. Nobody has ever posted a contract that makes the pilot the tug:
// a heavy hull, a real leg under load, and a live receiver holding a grapple ring at the far end.
//
// This is that job. An MTS line hauler is dead in the water — drive casualty, crew waiting aboard
// a hull too heavy to shrug off. The desk posts a tow fee on the band: set her inside the relief
// tug's grapple ring dead-slow and the fee is wired on custody. The Reach heard the same filing:
// a tether-control blade to cut the tow line mid-haul (the shipped specialist cut — the rope
// itself is contested) and a prize crew that clamps the hulk the moment she drifts unlatched and
// hauls her off under Reach colours.
//
// Every judgement reads the world: the hulk is a real disabled ship the massline drags honestly,
// the grapple ring is the relief tug's own position, custody is the live attachment table, the
// prize crew's clamp accrues only while no line holds her, the receiver is a lawful witness, and
// the desk's rep/credit/news intents ride the director's seams. A filing that lapses leaves the
// hulk truthfully in the water — she stays a derelict anyone can still tow.
import { deepFreeze, defineEncounter } from './catalog.js';
import { ActivityKind, RulesOfEngagement, setEntityDoctrine } from '../../ai/doctrine.js';
import {
  alive, dist, entityById, priorOutcome, publishSituationNews, settleSituation,
} from '../../systems/crSituationKit.js';
import { getCombatKernel } from '../../combat/kernel.js';

export const encounterOrder = 1210;
export const trigger = deepFreeze({
  id: 'the_deadweight',
  tier: 'minor',
  deck: 'combat',
  weight: 1,
  zoneTypes: ['trade_lane', 'patrol_corridor'],
  script: 'selfRegistered',
  fallbackScript: 'whisper',
  pressureCost: 20,
  cooldownS: 2400,
  proximity: true,
  fireWithinWu: 800,
  gates: {
    sectorIds: [
      'sector_helios_prime', 'sector_ceres_belt', 'sector_tethys_junction',
      'sector_vesta_forge', 'sector_io_reach', 'sector_pallas_drift',
    ],
  },
});

export const DEADWEIGHT = Object.freeze({
  windowS: 300,            // the filing's window — the desk re-files after it
  legWu: 1200,             // dead hulk → relief tug's grapple ring: a real haul leg under load
  ringWu: 130,             // inside this of the tug, grapples can take her
  handoffSpeed: 14,        // WU/s — the hulk must arrive dead-slow for the handover
  graceFactor: 1.8,        // past deadline, a latched hulk inside this x the ring still hands off
  prizeStandoffWu: 250,    // the prize crew holds this far off a latched hulk, waiting for the line
  clampGapWu: 26,          // hull gap at which the prize crew's grapples start biting
  clampS: 14,              // unlatched seconds on the hulk before the Reach takes her
  raiderSpawnWu: 1500,     // the wing flies in from the cold side — a race, not an ambush
  egressWu: 2400,          // past this from the player a bolting hull is gone
  boltS: 26,               // a bolting hull despawns this far out
  feeCr: 520,              // the posted tow fee — paid on custody transfer
  repDelivered: 4,
  repTugMurdered: -8,
  repDroveOff: -3,
  repHullBurned: -5,
});

const DESK = Object.freeze({ name: 'MTS Traffic Desk', factionId: 'faction_mts' });

function tick60(now) { return Math.round(now * 60); }

function dist2(a, b) {
  const dx = ((a && a.x) || 0) - ((b && b.x) || 0);
  const dz = ((a && a.z) || 0) - ((b && b.z) || 0);
  return dx * dx + dz * dz;
}

function hullGap(a, b) {
  return dist(a.pos, b.pos) - (Number(a.radius) || 0) - (Number(b.radius) || 0);
}

function speedOf(e) {
  const v = e && e.vel;
  return v && Number.isFinite(v.x) && Number.isFinite(v.z) ? Math.hypot(v.x, v.z) : 0;
}

/** Custody is the live attachment table, not a flag: the player's active line on the hulk,
 *  or null. The tether's own cut/break bookkeeping owns the record — we only read it. */
function playerLineOn(state, hullId) {
  const byId = state && state.combat && state.combat.attachments && state.combat.attachments.byId;
  if (!byId || typeof byId !== 'object') return null;
  const pid = state.playerId;
  for (const att of Object.values(byId)) {
    if (att && att.state === 'active' && att.ownerId === pid && att.targetId === hullId) return att;
  }
  return null;
}

/** The receiver's grapples take the player's line — the same owner-side cut the Towline Table
 *  receiver uses on a witnessed handover (attachments.cut with the line's owner). Where the
 *  physics port is absent the custody transfer still stands; the body leaving the world frees
 *  the rope through the tether system's own sweep. */
function receiverSeversLine(d, state, line) {
  if (!line || line.id == null) return;
  try {
    const kernel = getCombatKernel({ state, bus: d && d.bus });
    const attachments = kernel && kernel.attachments;
    if (attachments && typeof attachments.cut === 'function') {
      attachments.cut(line.id, line.ownerId, 'deadweight_handover');
    }
  } catch (err) { /* the grapple claim stands even where the line can't be severed in place */ }
}

function transitTo(ent, live, now, target, reason, leash = 5200) {
  setEntityDoctrine(ent, {
    activity: {
      kind: ActivityKind.TRANSIT,
      reason,
      anchor: { x: target.x, z: target.z },
      leashRadius: leash,
      startedTick: tick60(now),
      encounterId: live.id,
    },
    roe: RulesOfEngagement.HOLD_FIRE,
  });
}

function loiterAt(ent, live, now, anchor, reason, leash = 160) {
  setEntityDoctrine(ent, {
    activity: {
      kind: ActivityKind.LOITER,
      reason,
      anchor: { x: anchor.x, z: anchor.z },
      leashRadius: leash,
      startedTick: tick60(now),
      encounterId: live.id,
    },
    roe: RulesOfEngagement.HOLD_FIRE,
  });
}

/** The blade's job is the rope: weapons-free on the towing hull through the same doctrine seam
 *  every squad uses — its specialist plan reads the live line and does the cutting itself. */
function sicOnPlayer(ent, live, now, reason, playerId) {
  setEntityDoctrine(ent, {
    activity: {
      kind: ActivityKind.ATTACK_RUN,
      reason,
      anchor: { x: ent.pos.x, z: ent.pos.z },
      leashRadius: 2600,
      startedTick: tick60(now),
      targetId: playerId == null ? null : playerId,
      encounterId: live.id,
    },
    roe: RulesOfEngagement.WEAPONS_FREE,
  });
  const ai = ent.data && ent.data.ai;
  if (ai) ai.passive = false;
}

function boltAway(ent, live, now, awayFrom, reason) {
  let dx = (ent.pos.x || 0) - ((awayFrom && awayFrom.x) || 0);
  let dz = (ent.pos.z || 0) - ((awayFrom && awayFrom.z) || 0);
  const len = Math.hypot(dx, dz);
  if (!(len > 1)) { dx = Math.cos(now); dz = Math.sin(now); }
  else { dx /= len; dz /= len; }
  transitTo(ent, live, now,
    { x: ent.pos.x + dx * DEADWEIGHT.egressWu * 2, z: ent.pos.z + dz * DEADWEIGHT.egressWu * 2 },
    reason);
}

/** The hulk stays in the world past a lapsed filing — a real derelict, not a despawn. Pull it
 *  from the roster before resolve's straggler sweep so the desk's dead ship keeps drifting and
 *  anyone can still tow or strip her. */
function releaseHulk(live, hullId) {
  const i = live.ids.indexOf(hullId);
  if (i >= 0) live.ids.splice(i, 1);
  if (live.roles && live.roles[hullId] !== undefined) delete live.roles[hullId];
}

export const runtime = Object.freeze({
  fire(d, live, state) {
    const center = (live.plan && live.plan.zoneCenter) || live.anchor;
    if (!center || !Number.isFinite(center.x)) return d.abort(live, 'no_zone_anchor');
    const rng = d.stream(live, 'deadweight_layout');
    const a = rng() * Math.PI * 2;
    const u = { x: Math.cos(a), z: Math.sin(a) };           // hulk → ring bearing
    const p = { x: -u.z, z: u.x };
    const at = (along, across) => ({ x: center.x + u.x * along + p.x * across, z: center.z + u.z * along + p.z * across });
    const prior = priorOutcome(state, live.shapeId);
    const priorNote = prior && prior.outcome === 'delivered'
      ? ' Same registry as last filing — the desk remembers a clean handover.'
      : prior && prior.outcome === 'prize_taken'
        ? ' The Reach has been listening for these filings — expect the wing again.'
        : '';

    const ring = at(DEADWEIGHT.legWu, 0);
    const ids = d.spawnShips(live, [
      {
        archetype: 'mule_trader', level: 3, role: 'hauler', factionId: DESK.factionId, team: 2,
        context: 'civilian', passive: true, pos: at(0, 0), hullFrac: 0.55,
        scanLabel: 'MTS LINE HAULER — DRIVE CASUALTY, CREW ABOARD',
      },
      {
        archetype: 'mule_trader', level: 4, role: 'tug', factionId: DESK.factionId, team: 2,
        context: 'civilian', passive: true, pos: at(DEADWEIGHT.legWu, 50),
        scanLabel: 'MTS RELIEF TUG — HOLDING THE GRAPPLE RING',
      },
      {
        archetype: 'tether_control_raider', level: 3, role: 'cutter', factionId: 'faction_reach', team: 1,
        context: 'zone_hostile', passive: false, pos: at(-DEADWEIGHT.raiderSpawnWu, 140),
        scanLabel: 'REACH LINE-CUTTER — HEARD THE FILING',
      },
      {
        archetype: 'reaver_pirate', level: 3, role: 'prize', factionId: 'faction_reach', team: 1,
        context: 'zone_hostile', passive: false, pos: at(-DEADWEIGHT.raiderSpawnWu, -160),
        scanLabel: 'REACH PRIZE CREW — RUNNING FOR THE HULK',
      },
    ]);
    const hauler = d.entsOf(live, 'hauler')[0];
    const tug = d.entsOf(live, 'tug')[0];
    const cutter = d.entsOf(live, 'cutter')[0];
    const prize = d.entsOf(live, 'prize')[0];
    if (!hauler || !tug || !cutter || !prize) return d.abort(live, 'no_cast');

    // The deadweight: a real disabled hull the massline drags honestly. Entity-level disabled,
    // same idiom as the yard tow-out — a dead hauler is scenery that can be towed.
    hauler.disabled = true;
    hauler.data = hauler.data || {};
    hauler.data.driveDead = true;
    hauler.data.intent = { moveZ: 0, moveX: 0, fire: false };
    if (hauler.data.ai) hauler.data.ai.allowPassiveManeuver = false;
    hauler.vel = { x: 0, z: 0 };

    // The receiver is a lawful witness: firing on it is adjudicated the way firing on the
    // last tow's detail was — the desk keeps the registry.
    tug.data = tug.data || {};
    tug.data.lawWitness = true;
    if (tug.data.ai) tug.data.ai.lawful = true;
    loiterAt(tug, live, d.now(), ring, 'the_deadweight:receiver_hold', DEADWEIGHT.ringWu + 60);

    // The grapple ring gets a physical mark so the contract has a place, not a promise.
    const beacon = d.spawnProp(live, {
      pos: at(DEADWEIGHT.legWu, -40), radius: 8, tetherable: false,
      scanLabel: 'HANDOVER BEACON — DELIVER THE HULK DEAD-SLOW INSIDE THE RING',
      storyPropKind: 'cr_deadweight_beacon',
    });

    // The wing's two errands: the blade runs at the towing pilot (its shipped cut plan reads
    // the live rope), the prize crew runs at the hulk and waits for custody to drop.
    sicOnPlayer(cutter, live, d.now(), 'the_deadweight:cutter_inbound', state.playerId);
    transitTo(prize, live, d.now(), hauler.pos, 'the_deadweight:prize_inbound', 5200);

    live.data.deadweight = {
      haulerId: hauler.id, tugId: tug.id, beaconId: beacon ? beacon.id : null,
      cutterId: cutter.id, prizeId: prize.id,
      ring, dir: u,
      latchedOnce: false, hadLine: false,
      clampS: 0, clampAnnounced: false,
      prizeTask: 'close', prizeBolted: false,
      defended: 0, hullByPlayer: false, tugFled: false, tugKilled: false,
      lastT: d.now(),
      settled: false,
    };
    live.deadlineAt = d.now() + DEADWEIGHT.windowS;
    live.phase = 'posted';
    live.approach = { signal: 'tow_contract_posted', contacts: ids.length + 1, t: d.now() };
    live.vars = { ...(live.vars || {}), fee: DEADWEIGHT.feeCr };
    d.say(live, 'alert',
      `MTS DISPATCH: drive casualty on the lane — the desk posted ${DEADWEIGHT.feeCr} cr to whoever sets her inside the relief tug's grapple ring dead-slow. Reach hulls heard the same filing: a line-cutter and a prize crew inbound.${priorNote}`,
      null, { primary: true, literal: true });
  },

  event(d, live, state, name, payload) {
    const w = live.data && live.data.deadweight;
    if (!w || w.settled || live.phase === 'done') return;
    const now = d.now();
    if (name === 'tetherAttached' && payload && payload.targetId === w.haulerId) {
      if (!w.latchedOnce) {
        w.latchedOnce = true;
        d.say(live, 'bark',
          `MTS RELIEF: line reads on her. The ring is ${DEADWEIGHT.legWu} out on my mark — bring her in under ${DEADWEIGHT.handoffSpeed} or the grapples can't take her.`,
          null, { literal: true });
        // The desk marks the ring on the pilot's board — the same course intent the Table uses.
        if (d.bus && typeof d.bus.emit === 'function') {
          d.bus.emit('ui:setCourse', {
            pos: { x: w.ring.x, z: w.ring.z }, sectorId: live.sectorId,
            label: 'MTS relief tug · grapple ring',
          });
        }
      }
      return;
    }
    if (name === 'squadKill' && payload) {
      const role = payload.role;
      if (role === 'tug') {
        if (payload.byPlayer) {
          w.tugKilled = true;
          return this._settle(d, live, state, 'tug_murdered');
        }
        return this._settle(d, live, state, 'contract_void');
      }
      if (role === 'hauler') {
        w.hullByPlayer = payload.byPlayer === true;
        return this._settle(d, live, state, 'hull_lost');
      }
      if ((role === 'prize' || role === 'cutter') && payload.byPlayer) {
        w.defended += 1;
        if (w.defended === 1) {
          d.say(live, 'bark', 'MTS RELIEF: hostile hull down — the desk logs the screen; the fee stands while she floats.', null, { literal: true });
        }
      }
      return;
    }
    if (name === 'playerHitSquad' && payload && payload.targetId != null) {
      const role = live.roles && live.roles[payload.targetId];
      const hit = entityById(state, payload.targetId);
      if (role === 'tug' && !w.tugFled && alive(hit)) {
        // Fire on the receiver voids the filing on the spot — the tug bolts and the desk logs it.
        w.tugFled = true;
        boltAway(hit, live, now, d.player() && d.player().pos, 'the_deadweight:receiver_fled');
        hit.data = hit.data || {};
        hit.data.despawnAt = now + DEADWEIGHT.boltS;
        return this._settle(d, live, state, 'contract_void');
      }
      if (role === 'prize' && !w.prizeBolted && alive(hit)) {
        // Prize crews do not duel — a hit hull cuts the clamp and bolts empty-handed.
        w.prizeBolted = true;
        w.clampS = 0;
        boltAway(hit, live, now, d.player() && d.player().pos, 'the_deadweight:prize_spooked');
        d.say(live, 'bark', 'MTS RELIEF: the prize crew is off her — keep the line on and bring her in.', null, { literal: true });
      }
      return;
    }
  },

  tick(d, live, state, now) {
    const w = live.data && live.data.deadweight;
    if (!w || w.settled || live.phase === 'done') return;
    const dt = Math.max(0, now - w.lastT);
    w.lastT = now;

    const hauler = entityById(state, w.haulerId);
    if (!alive(hauler)) return this._settle(d, live, state, 'hull_lost');
    const tug = entityById(state, w.tugId);
    if (!w.tugFled && !w.tugKilled && !alive(tug)) return this._settle(d, live, state, 'contract_void');
    const line = playerLineOn(state, w.haulerId);

    // The hulk went adrift mid-haul: the rope that was on her is gone — say it once per drop.
    if (w.hadLine && !line && w.latchedOnce) {
      d.say(live, 'bark', 'MTS RELIEF: your line is off her — she is drifting free and the prize crew reads it too.', null, { literal: true });
    }
    w.hadLine = !!line;

    // The prize crew's work loop: hold off a held hulk, close and clamp a free one. The clamp
    // only accrues while no player line holds custody — grapples lose to a live massline.
    const prize = entityById(state, w.prizeId);
    const prizeLive = alive(prize) && !w.prizeBolted;
    if (prizeLive) {
      if (line) {
        w.clampS = 0;
        if (w.prizeTask !== 'hover') {
          w.prizeTask = 'hover';
          const hover = {
            x: hauler.pos.x + (w.ring.x - hauler.pos.x) * (DEADWEIGHT.prizeStandoffWu / Math.max(1, dist(hauler.pos, w.ring))),
            z: hauler.pos.z + (w.ring.z - hauler.pos.z) * (DEADWEIGHT.prizeStandoffWu / Math.max(1, dist(hauler.pos, w.ring))),
          };
          loiterAt(prize, live, now, hover, 'the_deadweight:prize_hover', 300);
        }
      } else {
        if (w.prizeTask !== 'close') {
          w.prizeTask = 'close';
          transitTo(prize, live, now, hauler.pos, 'the_deadweight:prize_close', 5200);
        }
        if (hullGap(hauler, prize) <= DEADWEIGHT.clampGapWu) {
          w.clampS += dt;
          if (!w.clampAnnounced) {
            w.clampAnnounced = true;
            d.say(live, 'bark', 'MTS RELIEF: the prize crew is on her — grapples biting. Get a line on her or get them off.', null, { literal: true });
          }
          if (w.clampS >= DEADWEIGHT.clampS) {
            return this._settle(d, live, state, 'prize_taken');
          }
        }
      }
    } else {
      w.clampS = 0;
    }

    // The handover: hulk inside the grapple ring AND dead-slow. A fast sling earns nothing —
    // the tug's grapples need a settled load. The receiver's grapple takes the player's line
    // through the sanctioned owner cut; the hulk leaves the field in the tug's custody.
    if (alive(tug) && !w.tugFled
      && dist(hauler.pos, tug.pos) <= DEADWEIGHT.ringWu
      && speedOf(hauler) <= DEADWEIGHT.handoffSpeed) {
      receiverSeversLine(d, state, line);
      hauler.data = hauler.data || {};
      hauler.data.scanLabel = 'MTS RELIEF — UNDER TUG GRAPPLES';
      hauler.data.tugCustody = true;
      return this._settle(d, live, state, 'delivered');
    }

    // The filing's clock: lapsed filings leave the hulk honestly in the water. A latched hulk
    // already inside the grace ring gets its last beat to settle the handover.
    if (now >= live.deadlineAt) {
      const graceRing = DEADWEIGHT.ringWu * DEADWEIGHT.graceFactor;
      const inGrace = line && alive(tug) && !w.tugFled
        && dist(hauler.pos, tug.pos) <= graceRing
        && speedOf(hauler) <= DEADWEIGHT.handoffSpeed * DEADWEIGHT.graceFactor;
      if (!inGrace) return this._settle(d, live, state, 'lapsed');
    }
  },

  _settle(d, live, state, outcome) {
    const w = live.data && live.data.deadweight;
    if (!w || w.settled) return;
    w.settled = true;
    const now = d.now();
    if (outcome === 'delivered') {
      d.grant(DEADWEIGHT.feeCr, 'the_deadweight:tow_fee');
      d.rep(DESK.factionId, DEADWEIGHT.repDelivered, 'the_deadweight_delivered');
      // The pair leaves together: the tug burns home and the hulk goes under its custody flag.
      const tug = entityById(state, w.tugId);
      if (alive(tug)) transitTo(tug, live, now, { x: w.ring.x + w.dir.x * DEADWEIGHT.egressWu, z: w.ring.z + w.dir.z * DEADWEIGHT.egressWu }, 'the_deadweight:tug_home', 5200);
      publishSituationNews(d, live, `TOW CONTRACT PAID: a registry hauled the drive-casualty hauler into the relief tug's grapple ring dead-slow and the desk wired ${DEADWEIGHT.feeCr} cr on custody. The hulk is bound for the yard.`);
    } else if (outcome === 'prize_taken') {
      const hauler = entityById(state, w.haulerId);
      if (alive(hauler)) {
        hauler.factionId = 'faction_reach';
        hauler.data = hauler.data || {};
        hauler.data.scanLabel = 'PRIZE HULK — UNDER REACH GRAPPLES';
        hauler.data.despawnAt = now + DEADWEIGHT.boltS;
        const prize = entityById(state, w.prizeId);
        if (alive(prize)) {
          boltAway(prize, live, now, d.player() && d.player().pos, 'the_deadweight:prize_laden');
          prize.data = prize.data || {};
          prize.data.despawnAt = now + DEADWEIGHT.boltS;
        }
      }
      publishSituationNews(d, live, 'HULK TAKEN AS PRIZE: the Reach clamped the dead line hauler while no line held her and hauled her off the filing. The desk logged the registry that let go.');
    } else if (outcome === 'hull_lost') {
      if (w.hullByPlayer) {
        d.rep(DESK.factionId, DEADWEIGHT.repHullBurned, 'the_deadweight_hull_burned');
        publishSituationNews(d, live, 'CONTRACTED HULL BURNED: the posted deadweight was destroyed on a live filing. The desk keeps the registry that shot her.');
      } else {
        publishSituationNews(d, live, 'CONTRACTED HULL LOST: the posted deadweight broke up before the handover. The desk closes the filing.');
      }
    } else if (outcome === 'tug_murdered') {
      d.rep(DESK.factionId, DEADWEIGHT.repTugMurdered, 'the_deadweight_tug_murdered');
      publishSituationNews(d, live, 'RELIEF TUG MURDERED AT THE RING: the desk\'s receiver is dead on the handover mark. The filing keeps the registry that fired on it.');
    } else if (outcome === 'contract_void') {
      if (w.tugFled) {
        d.rep(DESK.factionId, DEADWEIGHT.repDroveOff, 'the_deadweight_receiver_fled');
        publishSituationNews(d, live, 'RECEIVER DRIVEN OFF: the relief tug quit the grapple ring under fire. The desk voids the filing and keeps the registry.');
      } else {
        publishSituationNews(d, live, 'CONTRACT VOID: the relief tug never held the ring — the tow filing is dead and the hulk stays in the water.');
      }
    } else { // lapsed — the window closed; release the hulk so she drifts on as a real derelict
      releaseHulk(live, w.haulerId);
      publishSituationNews(d, live, 'TOW FILING LAPSED: the window closed with the deadweight still in the water. The desk will re-file the haul; the hulk keeps drifting.');
    }
    live.vars = { ...(live.vars || {}), via: w.latchedOnce ? 'line' : 'never_latched' };
    return settleSituation(d, live, state, outcome, {
      defended: w.defended, clampS: Math.round(w.clampS), latched: w.latchedOnce === true,
      tugFled: w.tugFled === true, hullByPlayer: w.hullByPlayer === true,
    });
  },
});

export default defineEncounter(trigger, {
  shape: {
    situation: 'salvage',
    place: trigger.zoneTypes,
    twist: 'logic',
    actor: 'faction_mts',
  },
  factionId: 'faction_mts',
  title: 'THE DEADWEIGHT',
  primaryLine: `MTS DISPATCH: drive casualty on the lane — a posted tow fee to whoever hauls her into the relief tug's grapple ring dead-slow. A Reach line-cutter and a prize crew heard the same filing.`,
  verbs: ['latch', 'tow', 'fire', 'fly_on'],
  choices: [
    { id: 'haul', verb: 'latch', text: 'Latch the deadweight and haul her into the ring, dead-slow.' },
    { id: 'screen', verb: 'fire', text: 'Fight the wing — the cutter wants your line, the prize crew wants the hulk.' },
    { id: 'pass', verb: 'fly_on', text: 'Fly on — the filing lapses or the Reach takes her.' },
  ],
  civilian: { archetypes: ['mule_trader'], size: [2, 2], factionId: 'faction_mts', context: 'civilian', team: 2, passive: true },
  squad: {
    anchorArchetype: 'tether_control_raider', archetypes: ['reaver_pirate'], size: [2, 2],
    factionId: 'faction_reach', context: 'zone_hostile', team: 1, doctrine: 'scavenger', formation: 'loose',
  },
  deadlineS: DEADWEIGHT.windowS,
  receipts: {
    delivered: 'DELIVERED — the relief tug\'s grapples took her in the ring. The tow fee is wired.',
    prize_taken: 'PRIZE TAKEN — the Reach clamped the hulk while she drifted free and hauled her off the filing.',
    hull_lost: 'HULL LOST — the contracted deadweight broke up before the handover. The desk closes the filing.',
    tug_murdered: 'RECEIVER MURDERED — the relief tug is dead on the handover mark. The desk keeps the registry.',
    contract_void: 'CONTRACT VOID — the receiver never held the ring. The filing is dead; the hulk stays in the water.',
    lapsed: 'FILING LAPSED — the window closed with the deadweight still drifting. The desk will re-file the haul.',
  },
});
