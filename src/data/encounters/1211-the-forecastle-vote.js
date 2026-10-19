// THE FORECASTLE VOTE — a crew's internal break, put in front of the pilot as a decision.
//
// Crew in this world are weather, not people: traffic hulls carry "a crew" the way a wreck
// carries a cargo manifest, and the only crew politics the player ever hears is the whisper
// source "a mutineers' dead-drop" — a buoy with nobody attached. Nobody ever made the pilot
// arbitrate one. This is the arbitration: a Drift Miners ore freighter hove-to mid-lane while
// her deck crew cracks the manifest locker, and her skipper — voted off the board three legs
// unpaid — sits in the ship's gig two hundred metres astern hailing anybody on the band.
//
//   The skipper's offer:   the desk's mutiny bounty — stop her by shot or line, he comes
//                          back aboard, the hands get a tribunal not a grave.
//   The bosun's counter:   close the channel and the crew cuts a share of the manifest loose
//                          — real freight, real stolen goods, no questions.
//   The clean verb:        fly on. The vote resolves without you; the skipper drifts.
//   The dark verb:         shoot a man in a boat, or burn a crew over a pay dispute. The
//                          ledger keeps both, and neither cause ever spawns a return.
//
// Every judgement reads the world: the hauler is a live ship the crew can bolt in, the gig is
// a live hull that must physically cross to her before the skipper is back aboard, the share
// is a real jettisoned cargo pod under the ordinary pickup contract, and a yielded crew only
// stays held the way they were stopped — a line holds while it's on, a shot holds because the
// gun is still in the sky.
import { deepFreeze, defineEncounter } from './catalog.js';
import {
  alive, dist, entityById, priorOutcome, publishSituationNews, settleSituation,
} from '../../systems/crSituationKit.js';
import { ActivityKind, RulesOfEngagement, setEntityDoctrine } from '../../ai/doctrine.js';
import { promotedPilotIdentity } from '../pilotCallsigns.js';

export const encounterOrder = 1211;
export const trigger = deepFreeze({
  id: 'the_forecastle_vote',
  tier: 'minor',
  deck: 'civilian',
  weight: 0.9,
  zoneTypes: ['mining_belt', 'refinery_approach'],
  script: 'selfRegistered',
  fallbackScript: 'whisper',
  pressureCost: 12,
  cooldownS: 2400,
  proximity: true,
  fireWithinWu: 780,
  gates: { sectorIds: ['sector_ceres_belt', 'sector_vesta_forge', 'sector_charon_expanse'] },
});

export const FORECASTLE_VOTE = Object.freeze({
  windowS: 300,               // the band keeps the encounter this long, then the stand is over
  offerS: 55,                 // both sides hold their offers on the wire this long
  crackS: 110,                // seconds the crew needs to crack the manifest locker, then they bolt
  counterS: 5,                // the bosun's counter-hail lands this long after the skipper's
  gigAsternWu: 320,           // the gig was put off this far behind the freighter
  egressWu: 2600,             // a bolting crew runs this far for the fence before they're gone
  goneWu: 2900,               // or this far from the scene by any heading
  dockWu: 120,                // gig→freighter: close enough to put the skipper back aboard
  interceptReissueS: 1.5,     // the gig's intercept anchor re-points on this cadence
  boltGraceS: 1.0,            // a line-held crew re-bolts this long after the rope drops
  bountyCr: 560,              // the desk's mutiny bounty, wired on a live re-boarding
  shareQty: 6,                // the bosun's cut — units of the stolen manifest, adrift
  repBacked: -3,              // the hands remember the registry that held the line on them
  repHands: 3,                // the hands remember the registry that closed the channel
  repCrewBurned: -8,          // burned a crew over a pay dispute
  repSkipperMurdered: -10,    // shot a man in a boat
});

const CREW_FACTION = 'faction_dmc';
const SHARE_COMMODITY = 'cmdty_stolen_goods';

function tick60(now) { return Math.round(now * 60); }

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

function holdAt(ent, live, now, reason) {
  setEntityDoctrine(ent, {
    activity: {
      kind: ActivityKind.LOITER,
      reason,
      anchor: { x: ent.pos.x, z: ent.pos.z },
      leashRadius: 160,
      startedTick: tick60(now),
      encounterId: live.id,
    },
    roe: RulesOfEngagement.HOLD_FIRE,
  });
}

/** A scared hull burns off on its own vector — the gig fleeing a shot, or the skipper
 *  leaving the registry that butchered his crew. */
function boltAway(ent, live, now, awayFrom, reason) {
  let dx = (ent.pos.x || 0) - ((awayFrom && awayFrom.x) || 0);
  let dz = (ent.pos.z || 0) - ((awayFrom && awayFrom.z) || 0);
  const len = Math.hypot(dx, dz);
  if (!(len > 1)) { dx = Math.cos(now); dz = Math.sin(now); }
  else { dx /= len; dz /= len; }
  transitTo(ent, live, now,
    { x: ent.pos.x + dx * 5200, z: ent.pos.z + dz * 5200 },
    reason);
  ent.data = ent.data || {};
  ent.data.despawnAt = now + 30;
}

/** The live player line on a hull — the tether system's own attachment table, read not flagged. */
function playerLineOn(state, hullId) {
  const byId = state && state.combat && state.combat.attachments && state.combat.attachments.byId;
  if (!byId || typeof byId !== 'object') return null;
  const pid = state.playerId;
  for (const att of Object.values(byId)) {
    if (att && att.state === 'active' && att.ownerId === pid && att.targetId === hullId) return att;
  }
  return null;
}

/** A hull leaving the roster keeps living in the world past the resolve sweep — a real drifter. */
function release(live, hullId) {
  const i = live.ids.indexOf(hullId);
  if (i >= 0) live.ids.splice(i, 1);
  if (live.roles && live.roles[hullId] !== undefined) delete live.roles[hullId];
}

export const runtime = Object.freeze({
  fire(d, live, state) {
    const center = (live.plan && live.plan.zoneCenter) || live.anchor;
    if (!center || !Number.isFinite(center.x)) return d.abort(live, 'no_zone_anchor');
    const p = d.player();
    if (!p || !p.pos || p.id == null) return d.abort(live, 'no_player');
    const rng = d.stream(live, 'forecastle_layout');
    const bearing = rng() * Math.PI * 2;
    const away = { x: Math.cos(bearing), z: Math.sin(bearing) };
    const astern = { x: -away.x, z: -away.z };
    const egress = { x: center.x + away.x * FORECASTLE_VOTE.egressWu, z: center.z + away.z * FORECASTLE_VOTE.egressWu };

    const prior = priorOutcome(state, live.shapeId);
    const priorId = prior && prior.outcome;
    const priorKind = priorId === 'captain_backed' ? 'backed'
      : priorId === 'took_share' ? 'fed'
      : (priorId === 'crew_burned' || priorId === 'skipper_murdered') ? 'blood' : null;
    // A registry that already burned one forecastle walks into a shorter locker — the crew
    // knows the transponder and the crack is already half done.
    const crackS = priorKind === 'blood' ? Math.round(FORECASTLE_VOTE.crackS * 0.55) : FORECASTLE_VOTE.crackS;

    const ids = d.spawnShips(live, [
      {
        archetype: 'mule_trader', level: 4, role: 'hauler', factionId: CREW_FACTION, team: 2,
        context: 'civilian', passive: true, pos: { x: center.x, z: center.z },
        scanLabel: 'DMC ORE FREIGHTER — HELM UNDER DECK CREW, VOTE ON THE BOARD',
      },
      {
        archetype: 'wasp_swarmer', level: 1, role: 'skipper', factionId: CREW_FACTION, team: 2,
        context: 'civilian', passive: true,
        pos: { x: center.x + astern.x * FORECASTLE_VOTE.gigAsternWu, z: center.z + astern.z * FORECASTLE_VOTE.gigAsternWu },
        scanLabel: "SHIP'S GIG — THE SKIPPER, VOTED OFF",
      },
    ]);
    const hauler = d.entsOf(live, 'hauler')[0];
    const gig = d.entsOf(live, 'skipper')[0];
    if (!hauler || !gig) return d.abort(live, 'no_cast');

    const seed = (state.meta && state.meta.seed) || 1;
    const skipper = promotedPilotIdentity(seed, `${live.id}:skipper`);
    const bosun = promotedPilotIdentity(seed, `${live.id}:bosun`);

    const now = d.now();
    live.data.vote = {
      haulerId: hauler.id, gigId: gig.id,
      skipperName: skipper.name, bosunName: bosun.name,
      scene: { x: center.x, z: center.z }, egress,
      firedAt: now, offerEndsAt: now + FORECASTLE_VOTE.offerS, crackAt: now + crackS,
      priorKind,
      settled: false, countered: false,
      yieldVia: null,           // 'shot' | 'line'
      backed: false, declined: false, shareCut: false,
      reboltAt: null, lastInterceptAt: -99, lastT: now,
      yieldAnnounced: false, gigSpooked: false,
      gigAboard: false, sharePodId: null,
    };
    live.deadlineAt = now + FORECASTLE_VOTE.windowS;
    live.phase = 'vote';
    live.approach = { signal: 'hull_hove_to_off_lane', contacts: ids.length, t: now };
    live.vars = { ...(live.vars || {}), bounty: FORECASTLE_VOTE.bountyCr };

    // The crew holds station while they crack the locker; the gig drifts where they put it off.
    holdAt(hauler, live, now, 'the_forecastle_vote:cracking_manifest');
    holdAt(gig, live, now, 'the_forecastle_vote:gig_adrift');

    const priorNote = priorKind === 'backed'
      ? ' You put me back aboard once, registry — the desk pays the same bounty again.'
      : priorKind === 'blood'
        ? ' I know your transponder, and so does my crew — they are cracking faster for it.'
        : '';
    d.say(live, 'alert',
      `SKIPPER ${skipper.name.toUpperCase()}, DMC register — put off my own freighter in her gig, three legs unpaid, the crew took the forecastle vote. They are freight hands, not gunners: a burst across her bow or a line on her hull and she heaves to. Hold her and I come back aboard — the desk's mutiny bounty pays ${FORECASTLE_VOTE.bountyCr} cr to the registry that stops her.${priorNote}`,
      null, { primary: true, literal: true });
    d.offerChoices(live, ['back_the_desk', 'take_the_share', 'fly_on'], 'fly_on', now + FORECASTLE_VOTE.offerS);
  },

  event(d, live, state, name, payload) {
    const w = live.data && live.data.vote;
    if (!w || w.settled || live.phase === 'done') return;
    const now = d.now();

    if (name === 'squadKill' && payload) {
      if (payload.role === 'skipper') {
        if (payload.byPlayer) {
          // A man in a boat. The crew saw a killer — they bolt now, the desk writes the name.
          const hauler = entityById(state, w.haulerId);
          if (alive(hauler)) this._bolt(d, live, state, hauler, 'skipper_murdered');
          d.rep(CREW_FACTION, FORECASTLE_VOTE.repSkipperMurdered, 'the_forecastle_vote_skipper_murdered');
          this._moral(d, live, state, w, 'skipper');
          d.say(live, 'bark', `BOSUN ${w.bosunName.toUpperCase()}: he's DEAD. The registry killed a man in a boat — burn for the fence, now.`, null, { literal: true });
          return this._settle(d, live, state, 'skipper_murdered');
        }
        return this._settle(d, live, state, 'skipper_lost');
      }
      if (payload.role === 'hauler') {
        if (payload.byPlayer) {
          d.rep(CREW_FACTION, FORECASTLE_VOTE.repCrewBurned, 'the_forecastle_vote_crew_burned');
          this._moral(d, live, state, w, 'crew');
          const gig = entityById(state, w.gigId);
          if (alive(gig)) {
            gig.data = gig.data || {};
            gig.data.scanLabel = "SHIP'S GIG — THE SKIPPER, WATCHING HIS CREW DIE";
            boltAway(gig, live, now, (d.player() || {}).pos, 'the_forecastle_vote:skipper_fled_butchery');
            d.say(live, 'bark', `SKIPPER ${w.skipperName.toUpperCase()}: ...that was my crew. My CREW. The desk does not pay butchers — get off my band.`, null, { literal: true });
          }
        }
        return this._settle(d, live, state, 'crew_burned', { byPlayer: payload.byPlayer === true });
      }
      return;
    }

    if (name === 'playerHitSquad' && payload && payload.targetId != null) {
      const role = live.roles && live.roles[payload.targetId];
      const hit = entityById(state, payload.targetId);
      if (role === 'skipper' && alive(hit)) {
        // A shot across a man in a boat is not a warning he survives twice — he runs the gig.
        if (!w.gigSpooked) {
          w.gigSpooked = true;
          boltAway(hit, live, now, (d.player() || {}).pos, 'the_forecastle_vote:gig_driven_off');
          d.say(live, 'bark', `SKIPPER ${w.skipperName.toUpperCase()}: firing on a boat with a man in it! The desk hears this, registry — the desk hears ALL of it.`, null, { literal: true });
        }
        return;
      }
      if (role === 'hauler' && alive(hit)) {
        // The crew's whole argument is a locker and a head start — a live gun ends both.
        return this._yield(d, live, state, hit, 'shot');
      }
      return;
    }

    if (name === 'tetherAttached' && payload && payload.targetId === w.haulerId) {
      const player = d.player();
      if (player && (payload.actorId === player.id || payload.byPlayer === true)) {
        const hauler = entityById(state, w.haulerId);
        if (alive(hauler)) return this._yield(d, live, state, hauler, 'line');
      }
      return;
    }
  },

  choose(d, live, state, choiceId) {
    const w = live.data && live.data.vote;
    if (!w || w.settled || live.phase === 'done' || live.phase !== 'vote') return;
    const now = d.now();
    if (choiceId === 'back_the_desk') {
      w.backed = true;
      d.say(live, 'bark', `SKIPPER ${w.skipperName.toUpperCase()}: then make her hold still, registry — shot or line, I am coming aboard when she stops.`, null, { literal: true });
      return;
    }
    if (choiceId === 'take_the_share') {
      return this._cutShare(d, live, state);
    }
    // fly_on — a clean pass. The crew keeps cracking; the band goes quiet.
    w.declined = true;
    d.say(live, 'bark', `SKIPPER ${w.skipperName.toUpperCase()}: ...then the band thanks you for nothing, registry. ${w.bosunName}, you win the day — my ship and my shares both.`, null, { literal: true });
  },

  tick(d, live, state, now) {
    const w = live.data && live.data.vote;
    if (!w || w.settled || live.phase === 'done') return;
    w.lastT = now;

    const hauler = entityById(state, w.haulerId);
    const gig = entityById(state, w.gigId);
    if (!alive(hauler)) return this._settle(d, live, state, 'crew_burned', { byPlayer: false });
    if (!alive(gig)) return this._settle(d, live, state, 'skipper_lost');

    // The bosun's counter lands after the skipper's plea is on the band.
    if (!w.countered && now >= w.firedAt + FORECASTLE_VOTE.counterS) {
      w.countered = true;
      const line = w.priorKind === 'fed'
        ? `BOSUN ${w.bosunName.toUpperCase()}: the registry that ate our share once already. Close the channel again and the manifest cuts you a second cut — ${w.skipperName} is off the board, not your skipper.`
        : `BOSUN ${w.bosunName.toUpperCase()}: registry, hold your fire and your channel. Three legs unpaid, shares skimmed at every weigh — we take the hold to the fence and split honest. Close the channel and we cut you a share of the manifest; open it for him and you carry a company's rifle.`;
      d.say(live, 'bark', line, null, { literal: true });
    }

    // An unanswered wire closes: nobody took the bounty, nobody took the share.
    if (!w.declined && !w.backed && !w.shareCut && now >= w.offerEndsAt) {
      w.declined = true;
    }

    if (live.phase === 'bolting') {
      // Gone is gone: reached the fence bearing or outran the scene.
      if (dist(hauler.pos, w.egress) <= 200 || dist(hauler.pos, w.scene) >= FORECASTLE_VOTE.goneWu) {
        return this._settle(d, live, state, 'vote_stood');
      }
    } else if (live.phase === 'held') {
      // A line-held crew stays only while the rope is on — drop it and they go.
      if (w.yieldVia === 'line' && !playerLineOn(state, w.haulerId)) {
        if (w.reboltAt == null) {
          w.reboltAt = now + FORECASTLE_VOTE.boltGraceS;
          d.say(live, 'bark', `BOSUN ${w.bosunName.toUpperCase()}: LINE'S OFF — GO, GO, GO.`, null, { literal: true });
        } else if (now >= w.reboltAt) {
          return this._bolt(d, live, state, hauler, 'line_dropped');
        }
      } else {
        w.reboltAt = null;
      }
      // The skipper's run: he must physically cross to her before he's aboard.
      if (!w.gigAboard && alive(gig)) {
        if (now - w.lastInterceptAt >= FORECASTLE_VOTE.interceptReissueS) {
          w.lastInterceptAt = now;
          transitTo(gig, live, now, hauler.pos, 'the_forecastle_vote:skipper_returning', 4000);
        }
        if (dist(gig.pos, hauler.pos) <= FORECASTLE_VOTE.dockWu) {
          w.gigAboard = true;
          return this._aboard(d, live, state, hauler, gig);
        }
      }
    } else { // phase 'vote' — the locker is still cracking
      if (now >= w.crackAt) {
        d.say(live, 'bark', `BOSUN ${w.bosunName.toUpperCase()}: manifest's open. Hands, helm — we are FOR THE FENCE.`, null, { literal: true });
        return this._bolt(d, live, state, hauler, 'manifest_cracked');
      }
    }

    // The pilot carried the band out of reach: the vote plays out unwitnessed.
    if (!d.playerNearZone(live, 700)) {
      release(live, w.haulerId);
      release(live, w.gigId);
      return this._settle(d, live, state, 'faded');
    }

    // The window itself: a held-but-never-boarded stand still ends — the desk re-crews her.
    if (now >= live.deadlineAt) {
      release(live, w.haulerId);
      release(live, w.gigId);
      return this._settle(d, live, state, 'faded');
    }
  },

  /** The crew yields the helm: hove-to, hands up, the gig cleared to cross. 'shot' yields hold
   *  because the gun is still in the sky; a 'line' yield holds only while the line is on. */
  _yield(d, live, state, hauler, via) {
    const w = live.data.vote;
    if (w.settled || live.phase === 'held') {
      if (live.phase === 'held' && via === 'line') w.yieldVia = 'line';
      return;
    }
    if (live.phase === 'vote') live.phase = 'held';
    else if (live.phase === 'bolting') live.phase = 'held';
    w.yieldVia = w.yieldVia === 'line' ? 'line' : via;
    w.reboltAt = null;
    holdAt(hauler, live, d.now(), `the_forecastle_vote:yielded_${via}`);
    hauler.data = hauler.data || {};
    hauler.data.scanLabel = 'DMC ORE FREIGHTER — HOVE TO, HANDS OFF THE HELM';
    if (!w.yieldAnnounced) {
      w.yieldAnnounced = true;
      d.say(live, 'bark', `BOSUN ${w.bosunName.toUpperCase()}: easy — EASY. The gun reads, the line reads, the helm is YOURS. We wanted our shares, not a burning. She's stopped.`, null, { literal: true });
      const gig = entityById(state, w.gigId);
      if (alive(gig)) {
        d.say(live, 'bark', `SKIPPER ${w.skipperName.toUpperCase()}: holding course for her — put me back on my bridge and the bounty is yours.`, null, { literal: true });
        // The run starts the moment she hoves to — the intercept re-points every tick after.
        w.lastInterceptAt = d.now();
        transitTo(gig, live, d.now(), hauler.pos, 'the_forecastle_vote:skipper_returning', 4000);
      }
    }
  },

  /** The crew commits: crack done or the deal closed — they run the fence bearing. */
  _bolt(d, live, state, hauler, reason) {
    const w = live.data.vote;
    live.phase = 'bolting';
    hauler.data = hauler.data || {};
    hauler.data.scanLabel = 'DMC ORE FREIGHTER — UNDER CREW HANDS, RUNNING FOR THE FENCE';
    transitTo(hauler, live, d.now(), w.egress, `the_forecastle_vote:${reason}`, 5200);
  },

  /** The deal: the bosun cuts a share of the manifest loose — real freight, real stolen goods. */
  _cutShare(d, live, state) {
    const w = live.data.vote;
    w.shareCut = true;
    const hauler = entityById(state, w.haulerId);
    if (alive(hauler)) {
      const pod = d.spawnCargoPod(live, {
        commodityId: SHARE_COMMODITY,
        amount: FORECASTLE_VOTE.shareQty,
        pos: { x: hauler.pos.x - 30, z: hauler.pos.z - 30 },
        vel: { x: (hauler.vel && hauler.vel.x) || 0, z: (hauler.vel && hauler.vel.z) || 0 },
        ownerId: hauler.id,
        ownerName: `Bosun ${w.bosunName}`,
        originId: 'forecastle_share',
      });
      w.sharePodId = pod && pod.id != null ? pod.id : null;
    }
    d.say(live, 'bark', `BOSUN ${w.bosunName.toUpperCase()}: a wise channel. Your cut's adrift — spend it quiet. We're for the fence.`, null, { literal: true });
    if (alive(hauler)) this._bolt(d, live, state, hauler, 'share_paid');
    return this._settle(d, live, state, 'took_share');
  },

  /** The skipper is back on his own bridge: the desk wires the bounty, the stand is over. */
  _aboard(d, live, state, hauler, gig) {
    const w = live.data.vote;
    d.grant(FORECASTLE_VOTE.bountyCr, 'the_forecastle_vote:bounty');
    d.rep(CREW_FACTION, FORECASTLE_VOTE.repBacked, 'the_forecastle_vote_held_the_line');
    gig.data = gig.data || {};
    gig.data.despawnAt = d.now() + 8;
    hauler.data.scanLabel = 'DMC ORE FREIGHTER — SKIPPER BACK ABOARD, CREW UNDER ARREST';
    transitTo(hauler, live, d.now(), w.egress, 'the_forecastle_vote:homeward_under_skipper', 5200);
    d.say(live, 'bark', `SKIPPER ${w.skipperName.toUpperCase()}: aboard, and the helm is mine. ${FORECASTLE_VOTE.bountyCr} cr wired on the desk's honour — my hands get a tribunal, not a grave.`, null, { literal: true });
    return this._settle(d, live, state, 'captain_backed');
  },

  _moral(d, live, state, w, who) {
    if (!d.bus || typeof d.bus.emit !== 'function') return;
    if (who === 'skipper') {
      d.bus.emit('moralMemory:remember', {
        id: `forecastle-skipper:${live.id}`,
        name: `Skipper ${w.skipperName}`,
        cause: 'captain_murdered',          // ledger-only cause — never a nemesis return
        factionId: CREW_FACTION, archetype: 'wasp_swarmer',
      });
    } else {
      d.bus.emit('moralMemory:remember', {
        id: `forecastle-crew:${live.id}`,
        name: `the ${w.bosunName} forecastle`,
        cause: 'mutineers_burned',          // ledger-only cause — never a nemesis return
        factionId: CREW_FACTION, archetype: 'mule_trader',
      });
    }
  },

  _settle(d, live, state, outcome, facts = {}) {
    const w = live.data && live.data.vote;
    if (!w || w.settled) return;
    w.settled = true;
    if (outcome === 'took_share') {
      d.rep(CREW_FACTION, FORECASTLE_VOTE.repHands, 'the_forecastle_vote_closed_channel');
      publishSituationNews(d, live, `MANIFEST SHARE PAID: a DMC deck crew voted their skipper off and cut a registry a share of the hold for a closed channel. The goods are hot; the hands remember.`);
    } else if (outcome === 'captain_backed') {
      publishSituationNews(d, live, `MUTINY BOUNTY PAID: a registry hove-to a DMC freighter mid-vote and put her skipper back aboard. The desk wired ${FORECASTLE_VOTE.bountyCr} cr; the crew goes to a tribunal.`);
    } else if (outcome === 'vote_stood') {
      // The skipper stays honestly adrift — a real drifter left in the world.
      release(live, w.gigId);
      publishSituationNews(d, live, `FORECASTLE VOTE STOOD: a DMC deck crew cracked the manifest and ran the fence. The skipper drifts in her gig; the desk logs a bounty nobody claimed.`);
    } else if (outcome === 'skipper_murdered') {
      publishSituationNews(d, live, `MAN KILLED IN A BOAT: a skipper voted off his own freighter died in the ship's gig. The crew saw a killer and ran; the desk keeps the registry's name.`);
    } else if (outcome === 'skipper_lost') {
      publishSituationNews(d, live, `SKIPPER LOST: a man voted off his own freighter died in the ship's gig before the band answered. The crew made the fence regardless.`);
    } else if (outcome === 'crew_burned') {
      publishSituationNews(d, live, facts.byPlayer === false
        ? `MUTINY ENDED IN FIRE: the forecastle vote's freighter broke up before her crew's shares were ever counted.`
        : `CREW BURNED OVER A PAY DISPUTE: a registry fired on a mutinied DMC freighter and killed her deck crew. The skipper watched; the desk keeps the name.`);
    }
    // faded publishes nothing — an unwitnessed vote keeps no registry.
    return settleSituation(d, live, state, outcome, {
      backed: w.backed === true, declined: w.declined === true, shareCut: w.shareCut === true,
      yieldVia: w.yieldVia || null, skipper: w.skipperName, bosun: w.bosunName,
      priorKind: w.priorKind || null, ...facts,
    });
  },
});

export default defineEncounter(trigger, {
  shape: {
    situation: 'distress',
    place: trigger.zoneTypes,
    twist: 'logic',
    actor: 'faction_dmc',
  },
  factionId: CREW_FACTION,
  title: 'THE FORECASTLE VOTE',
  primaryLine: `SKIPPER, DMC register — put off my own freighter in her gig. My deck crew is cracking the manifest locker: stop her by shot or line, put me back aboard, the desk's mutiny bounty is yours.`,
  verbs: ['fire', 'latch', 'sign', 'fly_on'],
  choices: [
    {
      id: 'back_the_desk', verb: 'sign',
      label: 'Take the desk\'s bounty — stop her and put the skipper back aboard',
      text: 'Take the desk\'s mutiny bounty — stop the freighter by shot or line.',
      playerLine: 'Bounty logged. Hold her still; the skipper comes aboard.',
    },
    {
      id: 'take_the_share', verb: 'sign',
      label: 'Close the channel — the crew cuts you a share of the manifest',
      text: 'Close the channel and the deck crew cuts a share of the manifest loose — hot goods, no questions.',
      playerLine: 'Channel closed. Cut my share loose and go.',
    },
    {
      id: 'fly_on', verb: 'fly_on',
      label: 'Fly on — not my crew, not my vote',
      text: 'Fly on — the forecastle settles its own vote.',
      playerLine: 'Not my crew, not my vote.',
    },
  ],
  timeoutChoice: 'fly_on',
  deadlineS: FORECASTLE_VOTE.windowS,
  receipts: {
    captain_backed: 'SKIPPER BACK ABOARD — the freighter hove to and the gig put her captain back on the bridge. The desk\'s mutiny bounty is wired; the hands get a tribunal.',
    took_share: 'SHARE PAID — the deck crew cut a third of the manifest loose and ran the fence. The channel stayed closed; the goods are hot.',
    vote_stood: 'VOTE STOOD — the crew cracked the locker and made the fence. The skipper drifts in his gig; the desk logs a bounty nobody claimed.',
    faded: 'FADED — you left the vote to itself. Whatever the hands settled, they settled off your band.',
    crew_burned: 'CREW BURNED — the mutineers died over a pay dispute. The skipper watched his crew die; the desk keeps the registry that fired.',
    skipper_murdered: 'SKIPPER MURDERED — a man voted off his own ship died in his gig. The crew saw a killer and ran; the ledger keeps your name.',
    skipper_lost: 'SKIPPER LOST — the man in the gig died before the band answered. The vote stood without him.',
  },
});
