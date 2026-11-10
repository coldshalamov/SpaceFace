// THE BLANK PAGE — the Quiet's one social verb, finally playable.
//
// Every faction in this world asks you for something — the Reach wants your cargo, the Concord
// wants your manifest, the Archive wants your reading. The Quiet's culture is that they want
// nothing written: their grammar's whole contract is `blankNews`, `off_book_unlogged`, and the
// one-line hail "Pass. Say nothing." — but until now that identity lived only in bark copy and a
// doctrine table. No beat ever asked the player to PERFORM it.
//
// This is the performance. An unmarked shadow rides your lane off the Quiet's own market ground
// (Hollow Station / the Mercenary Outpost — the camps their grammar says they keep), and the
// wire runs the only contract the Quiet sells: they pay a registry for a page kept blank.
//
//   Terms on the wire:  sign it and keep the page blank — no scan pulse may reach the hull.
//                       The scanner is the pen: a pulse that covers the ghost is ink.
//   Signed, then read:  the page you inked yourself is priced worst of all (broke_terms).
//   Unsolicited look:   scan it without terms — the fee dies and the shadow leaves (read).
//   A line or a shot:   a tether is a grip and a hit is a statement — it answers (burned).
//   Decline plainly:    an answered "no" is still blank — the Quiet respect a clean refusal.
//   Lapse:              never answered, never looked — nothing moved and nothing was written.
//
// The ledger is the culture: a registry that already inked a page (read/broke/burned) gets NO
// wire next time — the written are watched colder and offered nothing. A registry that kept a
// blank page is trusted with a better one. And in keeping with the grammar: nothing here ever
// publishes to the news wire — a Quiet incident is, by definition, not news.
import { deepFreeze, defineEncounter } from './catalog.js';
import {
  alive, entityById, priorOutcome, settleSituation,
} from '../../systems/crSituationKit.js';
import { ActivityKind, RulesOfEngagement, setEntityDoctrine } from '../../ai/doctrine.js';

export const encounterOrder = 586;
export const trigger = deepFreeze({
  id: 'the_blank_page',
  tier: 'minor',
  deck: 'civilian',
  weight: 0.9,
  zoneTypes: ['outlaw_zone'],
  script: 'selfRegistered',
  fallbackScript: 'whisper',
  pressureCost: 12,
  cooldownS: 2400,
  proximity: true,
  fireWithinWu: 780,
  gates: { sectorIds: ['sector_pallas_drift', 'sector_io_reach'] },
});

export const BLANK_PAGE = Object.freeze({
  windowS: 240,               // the wire's whole reach — the scene never outlives it
  offerS: 45,                 // the contract offer dies this long after the hail
  contractS: 120,             // a signed page must stay blank this long to pay out
  shadowWu: 940,              // the ghost orbits this far off — inside a stock 1200 sweep,
                              // outside the stalker's own lock band and any weak scanner's reach
  leaveSlackWu: 700,          // this far past the zone edge and the wire's reach is over
  readWu: 1200,               // fallback sweep reach when a pulse arrives without its radius
  feeCr: 700,                 // the wire's figure for a first blank page
  trustedMult: 1.4,           // a registry that already kept one blank page is trusted with more
  repBlank: 4,                // a kept page is the only kindness the Quiet records
  repRead: -2,                // an unsolicited look
  repBrokeTerms: -5,          // signed, then wrote on it
  repBurned: -8,              // reached for the shadow
  repGhostDown: -10,          // killed the shadow after opening on it — the Quiet write that in ink
});

const QUIET = 'faction_quiet';

const dist2 = (ax, az, bx, bz) => {
  const dx = ax - bx, dz = az - bz;
  return dx * dx + dz * dz;
};

function tick60(now) { return Math.round(now * 60); }

/** A read is only a read if the sweep physically covers the hull — a scanner too short or too
 * fouled to reach 940 WU cannot write the page no matter how often it is pulsed. */
function pulseCovers(payload, ghost) {
  if (!payload || !payload.pos || !ghost || !ghost.pos) return false;
  const reach = Number.isFinite(payload.radius) && payload.radius > 0
    ? payload.radius : BLANK_PAGE.readWu;
  return dist2(payload.pos.x, payload.pos.z, ghost.pos.x, ghost.pos.z) <= reach * reach;
}

/** The shadow lets go: a pointed burn off the wire's reach — it does not run from you, it leaves
 * the record. The hull is still a real body on its way out; the page is already settled. */
function burnOff(ent, live, now, awayFrom, reason) {
  let dx = (ent.pos && ent.pos.x || 0) - ((awayFrom && awayFrom.x) || 0);
  let dz = (ent.pos && ent.pos.z || 0) - ((awayFrom && awayFrom.z) || 0);
  const len = Math.hypot(dx, dz);
  if (!(len > 1)) { dx = Math.cos(now); dz = Math.sin(now); }
  else { dx /= len; dz /= len; }
  setEntityDoctrine(ent, {
    activity: {
      kind: ActivityKind.TRANSIT,
      reason,
      anchor: { x: ent.pos.x + dx * 4200, z: ent.pos.z + dz * 4200 },
      leashRadius: 5200,
      startedTick: tick60(now),
      encounterId: live.id,
    },
    roe: RulesOfEngagement.HOLD_FIRE,
  });
}

/** The page burned: the shadow stops watching and answers — a mercenary hull, not a martyr. */
function goHot(ent, live, now, reason, targetId) {
  setEntityDoctrine(ent, {
    activity: {
      kind: ActivityKind.ATTACK_RUN,
      reason,
      anchor: live.anchor ? { x: live.anchor.x, z: live.anchor.z } : { x: ent.pos.x, z: ent.pos.z },
      leashRadius: 3200,
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

export const runtime = Object.freeze({
  fire(d, live, state) {
    const center = (live.plan && live.plan.zoneCenter) || live.anchor;
    if (!center || !Number.isFinite(center.x)) return d.abort(live, 'no_zone_anchor');
    const p = d.player();
    if (!p || !p.pos || p.id == null) return d.abort(live, 'no_player');

    const prior = priorOutcome(state, live.shapeId);
    const priorOutcomeId = prior && prior.outcome;
    const priorKind = priorOutcomeId === 'kept_blank' ? 'blank'
      : (priorOutcomeId === 'read' || priorOutcomeId === 'broke_terms' || priorOutcomeId === 'burned')
        ? 'written'
        : null;

    // The wire's figure: a registry that already kept one blank page is trusted with a better one;
    // a registry that already inked one is offered nothing at all.
    const fee = priorKind === 'blank'
      ? Math.max(1, Math.round(BLANK_PAGE.feeCr * BLANK_PAGE.trustedMult))
      : BLANK_PAGE.feeCr;

    // The shadow spawns off the pilot's actual bearing, then rides a long orbit — close enough
    // to read you, far enough that only a deliberate sweep reaches it back.
    const rng = d.stream(live, 'blank_page_layout');
    const a = rng() * Math.PI * 2;
    const ids = d.spawnShips(live, [
      {
        archetype: 'quiet_ghost', level: 7, role: 'ghost', factionId: QUIET, team: 1,
        context: 'zone_hostile', passive: true,
        pos: { x: p.pos.x + Math.cos(a) * BLANK_PAGE.shadowWu, z: p.pos.z + Math.sin(a) * BLANK_PAGE.shadowWu },
        targetId: p.id, preferredRange: BLANK_PAGE.shadowWu,
        scanLabel: 'UNMARKED CONTACT — NO REGISTRY, NO TRANSPONDER NAME',
      },
    ]);
    if (d.aliveCount(live, 'ghost') < 1) return d.abort(live, 'no_bodies');

    const now = d.now();
    live.data.blankPage = {
      ghostId: ids[0],
      terms: false,
      priorKind,
      fee,
      settled: false,
      readAt: null,
      shotAt: null,
      offerEndsAt: priorKind === 'written' ? null : now + BLANK_PAGE.offerS,
      contractEndsAt: null,
      lastPulseSeq: -1,
    };
    live.deadlineAt = now + BLANK_PAGE.windowS;
    live.approach = { signal: 'unmarked_contact_shadowing', contacts: 1, t: now };
    live.vars = { ...(live.vars || {}), amount: fee };

    if (priorKind === 'written') {
      live.phase = 'watching';
      d.say(live, 'alert',
        'UNMARKED CONTACT: your name is already on a page. Nothing rides this wire for you — the written are watched, not paid.',
        null, { primary: true, literal: true });
      return;
    }

    live.phase = 'offer';
    d.say(live, 'alert', priorKind === 'blank'
      ? `UNMARKED CONTACT: the page you kept blank is remembered. The wire pays ${fee} for another — keep your scanner off this hull and the fee is yours. Terms on the wire; it ends when the lane does.`
      : `UNMARKED CONTACT: one offer, once. ${fee} cr rides this wire for the registry that keeps the page blank — keep your scanner off this hull. Take terms, or don't. Either way, nothing gets written.`,
    null, { primary: true, literal: true });
    d.offerChoices(live, ['take_terms', 'fly_low'], 'fly_low', live.data.blankPage.offerEndsAt);
  },

  event(d, live, state, name, payload) {
    const w = live.data && live.data.blankPage;
    if (!w || w.settled || live.phase === 'done') return;

    if (name === 'squadKill' && payload && payload.role === 'ghost') {
      // The page is ash by any hand. A player kill without a recorded shot (an alpha that never
      // tripped the hit event) still reached for the shadow — that is the player's ink. When the
      // shot was already written the Quiet ink it twice: the grip and the kill.
      if (payload.byPlayer) {
        if (w.shotAt == null) d.rep(QUIET, BLANK_PAGE.repBurned, 'the_blank_page_burned');
        else d.rep(QUIET, BLANK_PAGE.repGhostDown, 'the_blank_page_ghost_down');
      }
      return this._settle(d, live, state, 'burned', { killed: true, byPlayer: payload.byPlayer === true });
    }

    if (name === 'playerHitSquad' && payload && payload.targetId === w.ghostId) {
      return this._burned(d, live, state, 'hit');
    }

    if (name === 'tetherAttached' && payload && payload.targetId === w.ghostId) {
      // A line on the shadow is a grip, not a look — but only the player's grip inks the
      // player's page. Some other hand's line is that registry's problem.
      const player = d.player();
      if (player && payload.actorId === player.id) {
        return this._burned(d, live, state, 'tethered');
      }
      return;
    }

    if (name !== 'scanPulse' || !payload || !payload.pos) return;
    if (live.phase === 'conflict') return;   // guns already wrote this record — a sweep is just targeting now
    const player = d.player();
    if (payload.source !== 'player-scanner' || !player || payload.scannerId !== player.id) return;
    if (Number.isFinite(payload.seq)) {
      if (payload.seq <= w.lastPulseSeq) return;
      w.lastPulseSeq = payload.seq;
    }
    const ghost = entityById(state, w.ghostId);
    if (!alive(ghost) || !pulseCovers(payload, ghost)) return;
    w.readAt = d.now();
    if (w.terms) {
      // Signed, then wrote on it — the worst kind of page the wire keeps.
      d.rep(QUIET, BLANK_PAGE.repBrokeTerms, 'the_blank_page_broke_terms');
      ghost.data.scanLabel = 'UNMARKED CONTACT — READ YOU BACK';
      burnOff(ghost, live, w.readAt, player.pos, 'the_blank_page:terms_broken');
      d.say(live, 'alert', 'UNMARKED CONTACT: signed, then wrote on it. The wire prices that one higher.', null, { literal: true });
      return this._settle(d, live, state, 'broke_terms');
    }
    d.rep(QUIET, BLANK_PAGE.repRead, 'the_blank_page_read');
    ghost.data.scanLabel = 'UNMARKED CONTACT — READ YOU BACK';
    burnOff(ghost, live, w.readAt, player.pos, 'the_blank_page:seen');
    d.say(live, 'alert', 'UNMARKED CONTACT: you looked. The fee dies with the page.', null, { literal: true });
    return this._settle(d, live, state, 'read');
  },

  choose(d, live, state, choiceId) {
    const w = live.data && live.data.blankPage;
    if (!w || w.settled || live.phase === 'done' || live.phase !== 'offer') return;
    if (choiceId === 'take_terms') {
      w.terms = true;
      w.contractEndsAt = d.now() + BLANK_PAGE.contractS;
      live.phase = 'contract';
      d.say(live, 'alert', 'UNMARKED CONTACT: terms held. Keep it blank — the wire is watching the page, not you.', null, { literal: true });
      return;
    }
    // 'fly_low' — an answered no is still blank.
    const ghost = entityById(state, w.ghostId);
    if (alive(ghost)) burnOff(ghost, live, d.now(), (d.player() || {}).pos, 'the_blank_page:declined');
    d.say(live, 'alert', 'UNMARKED CONTACT: heard and unanswered. That is also blank.', null, { literal: true });
    return this._settle(d, live, state, 'declined');
  },

  tick(d, live, state, now) {
    const w = live.data && live.data.blankPage;
    if (!w || w.settled || live.phase === 'done') return;
    const player = d.player();

    // The shadow is dead or gone by any hand and the kill event never landed (environment,
    // third party, despawn): the page is ash without a name on it.
    const ghost = entityById(state, w.ghostId);
    if (!alive(ghost)) return this._settle(d, live, state, 'burned', { killed: true, byPlayer: w.shotAt != null });

    if (live.phase === 'conflict') {
      // Fire answered fire — what writes the record is how it ends: the kill lands above, and
      // leaving with the shadow alive still reads burned.
      if (now >= live.deadlineAt || !d.playerNearZone(live, BLANK_PAGE.leaveSlackWu)) {
        return this._settle(d, live, state, 'burned', { leftFighting: true });
      }
      return;
    }

    // The player carried the page out of the wire's reach.
    if (!d.playerNearZone(live, BLANK_PAGE.leaveSlackWu)) {
      if (live.phase === 'contract') return this._pay(d, live, state, 'left_reach');
      if (live.phase === 'watching') return this._settle(d, live, state, 'written_pass');
      return this._settle(d, live, state, 'unwritten');
    }

    if (live.phase === 'contract') {
      if (now >= w.contractEndsAt || now >= live.deadlineAt) return this._pay(d, live, state, 'held');
      return;
    }

    if (live.phase === 'watching') {
      if (now >= live.deadlineAt) {
        burnOff(ghost, live, now, player && player.pos, 'the_blank_page:watch_over');
        return this._settle(d, live, state, 'written_pass');
      }
      return;
    }

    // offer: the wire dies unanswered — a lapse, not a refusal.
    if (now >= w.offerEndsAt || now >= live.deadlineAt) {
      burnOff(ghost, live, now, player && player.pos, 'the_blank_page:offer_lapsed');
      return this._settle(d, live, state, 'unwritten');
    }
  },

  _burned(d, live, state, via) {
    const w = live.data && live.data.blankPage;
    if (!w || w.settled) return;
    if (w.shotAt != null) return;   // already burning
    w.shotAt = d.now();
    w.burnedVia = via;
    live.phase = 'conflict';
    const ghost = entityById(state, w.ghostId);
    if (alive(ghost)) {
      ghost.data.scanLabel = 'UNMARKED CONTACT — MADE IT A BODY';
      goHot(ghost, live, w.shotAt, `the_blank_page:${via}`, state.playerId);
    }
    d.rep(QUIET, BLANK_PAGE.repBurned, 'the_blank_page_burned');
    d.say(live, 'alert', 'UNMARKED CONTACT: you made it a body. The ledger is not blank about that.', null, { literal: true });
    d.emit('encounter:hostileCommitted', { encounterId: live.id, reason: 'blank_page_burned' });
  },

  /** The page came back blank: the wire pays off-book — credits with no posted news, ever. */
  _pay(d, live, state, via) {
    const w = live.data.blankPage;
    d.grant(w.fee, 'the_blank_page:kept_blank');
    d.rep(QUIET, BLANK_PAGE.repBlank, 'the_blank_page_kept_blank');
    const ghost = entityById(state, w.ghostId);
    if (alive(ghost)) {
      ghost.data.scanLabel = 'UNMARKED CONTACT — PAGE RECEIVED BLANK';
      burnOff(ghost, live, d.now(), (d.player() || {}).pos, 'the_blank_page:paid_out');
    }
    d.say(live, 'alert', `UNMARKED CONTACT: page received blank. ${w.fee} is yours. There is no record — there never is.`,
      null, { literal: true });
    return this._settle(d, live, state, 'kept_blank', { via, paidCr: w.fee });
  },

  _settle(d, live, state, outcome, facts = {}) {
    const w = live.data && live.data.blankPage;
    if (!w || w.settled) return;
    w.settled = true;
    // No publishSituationNews — ever. The Quiet's culture is that nothing hits the wire; the
    // durable record (settleSituation) is the ledger, and the ledger was already kept.
    return settleSituation(d, live, state, outcome, {
      terms: w.terms, priorKind: w.priorKind, readAt: w.readAt, shotAt: w.shotAt,
      burnedVia: w.burnedVia || null, ...facts,
    });
  },
});

export default defineEncounter(trigger, {
  shape: { situation: 'trade', place: trigger.zoneTypes, twist: 'logic', actor: 'faction_quiet' },
  factionId: QUIET,
  title: 'THE BLANK PAGE',
  primaryLine: 'UNMARKED CONTACT: one offer, once — the wire pays the registry that keeps this page blank. Keep your scanner off the hull; take terms, or don\'t.',
  verbs: ['sign', 'scan', 'fire', 'fly_on'],
  choices: [
    {
      id: 'take_terms', verb: 'sign',
      label: 'Open the wire — keep this page blank and the fee is yours',
      text: 'Open the wire — keep your scanner off the contact and the fee is yours.',
      playerLine: 'Terms taken. The page stays blank.',
    },
    {
      id: 'fly_low', verb: 'fly_on',
      label: 'Fly on — the page is not yours to keep',
      text: 'Fly on — a plain unanswered no.',
      playerLine: 'Not my page.',
    },
  ],
  timeoutChoice: 'fly_low',
  deadlineS: BLANK_PAGE.windowS,
  receipts: {
    kept_blank: 'KEPT BLANK — the shadow rode beside you unread and the wire paid off-book. No record exists; that was the point.',
    read: 'READ — your scanner wrote the page. The fee died and the contact burned off.',
    broke_terms: 'BROKE TERMS — you signed a blank page and then wrote on it. The Quiet price that one higher than a stranger\'s look.',
    burned: 'BURNED — you reached for a hull that was only watching. The Quiet write that one in ink.',
    declined: 'DECLINED — you heard the offer and answered plainly. Even the Quiet respect a clean no.',
    unwritten: 'UNWRITTEN — the wire lapsed unanswered. Nothing moved, and nothing was written.',
    written_pass: 'WRITTEN — a shadow watched a name it already keeps and let it go. The wire stays shut to the written.',
  },
});
