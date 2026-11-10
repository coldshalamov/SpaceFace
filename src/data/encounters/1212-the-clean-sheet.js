// INF — THE CLEAN SHEET. The law's paper has one door a wanted pilot can never reach: every
// off-ramp out of WANTED (run the search zone, pay the posted bounty, answer a lawful mayday,
// break the nets checkpoint, steal the hull back) is either flight or lawful credit — and the
// one criminal door, the fixer's scrub, exists only as a bar stool at six fence stations. A hot
// registry in open water has nothing to buy. This is the missing door, sold in the place it is
// needed: a Quiet field desk — a decommissioned customs hull with its plates painted over —
// parked off the lane running a stolen desk band through a burner buoy.
//
// The scrub is the fixer's own service, not a new mechanic: the same `heat:scrubRequested` intent
// the fence desk emits at the bar, answered by the same heat owner under the same law — ONE level,
// once per desk per hour, never under impound, never below the nets floor. The field desk pays the
// Quiet's own book (`fenceScrubCostCr`) plus a field markup; a registry the desk already wrote down
// once pays the returner's figure.
//
// The band is hot: opening the wire is what the sweep hears. Two SCN interceptors are inbound on
// the ping bearing the moment the desk hails — real lawful hulls on their own `lawful_wanted_only`
// posture — and the desk packs the moment they close. Pay and be gone before the sweep lands, or
// let the window die: the desk does not wait to be read. Every refusal the heat owner can return
// is quoted to the player in words, not swallowed.
//
//   The honest verb:  pay — credits through the economy's own charge, heat through the heat
//                     owner's own writer, the desk running before the sweep lands.
//   The clean verb:   fly on. The paper keeps either way.
//   The dark verb:    shoot the desk. Inside the sweep's witness radius the law prices it as a
//                     murder of a protected civilian; outside it, the Quiet still knows — the
//                     wire refuses that registry for good.
import { deepFreeze, defineEncounter } from './catalog.js';
import {
  alive, entityById, priorOutcome, publishSituationNews, settleSituation,
} from '../../systems/crSituationKit.js';
import { ActivityKind, RulesOfEngagement, setEntityDoctrine } from '../../ai/doctrine.js';
import { heatLevelFor, wantedTierFor } from '../../systems/heat.js';
import { fenceScrubCostCr } from '../fences.js';

export const encounterOrder = 1212;
export const trigger = deepFreeze({
  id: 'the_clean_sheet',
  tier: 'minor',
  deck: 'civilian',
  weight: 1,
  zoneTypes: ['ambush_lane', 'outlaw_zone', 'derelict_field'],
  script: 'selfRegistered',
  fallbackScript: 'whisper',
  pressureCost: 14,
  cooldownS: 3600,
  proximity: true,
  fireWithinWu: 620,
  gates: {},
});

export const CLEAN_SHEET = Object.freeze({
  windowS: 200,             // hard deadline behind everything — the field is not a berth
  offerS: 70,               // the desk does not hold the band open past the sweep's run
  sweepDistWu: 4200,        // the pair burns in from this far on the ping bearing
  sweepCloseWu: 600,        // desk reads the sweep this close = the window is over
  relayWu: 30,              // the burner buoy hangs this far off the desk hull
  packUpS: 8,               // a sold desk folds the wire and runs on this clock
  refusedHoldS: 9,          // a refused desk still has to burn the channel before it moves
  egressWu: 1500,           // clerk past this from the player is off the field
  leaveSlackWu: 900,        // player this far past the zone answered by leaving
  fieldMarkup: 1.6,         // the field book over the bar price — the desk came to you
  returnerMarkup: 1.3,      // the desk's own figure for a registry it already wrote down
  quietRepSale: 2,          // the Quiet writes a paying name
  shotRep: -10,             // firing on the desk — the Quiet keeps the shot on the wire
});

/** The scrub ledger key: the field desk is one book, sharing the owner's per-desk hour law. */
const DESK_LEDGER_ID = 'the_clean_sheet';

function tick60(now) { return Math.round(now * 60); }

function dist2(a, b) {
  const dx = ((a && a.x) || 0) - ((b && b.x) || 0);
  const dz = ((a && a.z) || 0) - ((b && b.z) || 0);
  return dx * dx + dz * dz;
}

/** The desk is a paper hull: it holds the lane, it does not fight over it. */
function holdDesk(ent, live, now, reason) {
  setEntityDoctrine(ent, {
    activity: {
      kind: ActivityKind.LOITER,
      reason,
      anchor: live.anchor ? { x: live.anchor.x, z: live.anchor.z } : { x: ent.pos.x, z: ent.pos.z },
      leashRadius: 120,
      startedTick: tick60(now),
      encounterId: live.id,
    },
    roe: RulesOfEngagement.HOLD_FIRE,
  });
}

/** The wire burned: the desk is gone on a pointed leg away from whatever it read last. */
function deskBolts(ent, live, now, awayFrom, reason) {
  let dx = (ent.pos.x || 0) - ((awayFrom && awayFrom.x) || 0);
  let dz = (ent.pos.z || 0) - ((awayFrom && awayFrom.z) || 0);
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

/** The sweep's own posture: a patrol route onto the ping, the law's wanted-only teeth. */
function sweepInbound(ent, live, now, anchor) {
  setEntityDoctrine(ent, {
    activity: {
      kind: ActivityKind.PATROL_ROUTE,
      reason: 'the_clean_sheet:sweep_on_the_ping',
      anchor: { x: anchor.x, z: anchor.z },
      leashRadius: 3200,
      startedTick: tick60(now),
      encounterId: live.id,
    },
    roe: RulesOfEngagement.LAWFUL_WANTED_ONLY,
  });
}

/** The refusal reasons the heat owner returns, said in the desk's own words. */
function refusalLine(reason) {
  switch (reason) {
    case 'clean': return 'Your sheet reads clean. The desk doesn\'t sell to the unwritten.';
    case 'impound': return 'That\'s a hull at the pound, not a paper problem. Nothing here moves that.';
    case 'nets_floor': return 'The nets band is posted on a checkpoint. Break the gate — paper won\'t move it.';
    case 'cooldown': return 'This desk wrote your registry once already. The band needs to cool before it can carry you again.';
    case 'sealed': return 'The run is sealed. Nothing on this wire moves.';
    default: return 'The wire came back dead. Nothing was charged.';
  }
}

export const runtime = Object.freeze({
  // The desk only opens the wire for a registry the law is actually hunting — a clean sheet
  // has nothing to buy. Holds the due slot while the player is clean; fire() still aborts
  // honestly when the hold lapses on a cold ledger.
  fireReady(state) {
    const player = state && state.player;
    return heatLevelFor(player && player.heat) >= 1;
  },

  fire(d, live, state) {
    const center = (live.plan && live.plan.zoneCenter) || live.anchor;
    if (!center || !Number.isFinite(center.x)) return d.abort(live, 'no_zone_anchor');
    live.anchor = { x: center.x, z: center.z };
    // WANTED heat lives on the player record (`state.player`), not the hull entity.
    const heat = Number(state.player && state.player.heat) || 0;
    const level = heatLevelFor(heat);
    if (level < 1) return d.abort(live, 'clean_ledger');

    const rng = d.stream(live, 'clean_sheet_layout');
    const a = rng() * Math.PI * 2;
    const u = { x: Math.cos(a), z: Math.sin(a) };
    const p = { x: -u.z, z: u.x };
    const at = (along, across) => ({
      x: center.x + u.x * along + p.x * across,
      z: center.z + u.z * along + p.z * across,
    });
    const prior = priorOutcome(state, live.shapeId);
    const priorOutcomeId = prior && prior.outcome;
    // The Quiet's wire keeps two dead letters: a registry that shot a desk, and one the desk
    // already refused. Both stay refused.
    const burned = priorOutcomeId === 'shot_the_desk' || priorOutcomeId === 'wire_refused';
    const returner = priorOutcomeId === 'sheet_bought';
    const priceCr = Math.max(1, Math.round(
      fenceScrubCostCr(level, 0) * (returner ? CLEAN_SHEET.returnerMarkup : CLEAN_SHEET.fieldMarkup)));

    // The desk: a customs hull with the plates painted over, parked off the lane on the Quiet's
    // book. Team 2 and a civilian read — the law's own adjudication prices her as a protected
    // body when the sweep is close enough to see the shot.
    const ids = d.spawnShips(live, [
      {
        archetype: 'customs_cutter', level: 5, role: 'clerk', factionId: 'faction_quiet', team: 2,
        context: 'civilian', passive: true, pos: at(0, 0),
        scanLabel: 'QUIET DESK HULL — PLATES PAINTED OVER',
      },
    ]);
    const clerk = d.entsOf(live, 'clerk')[0];
    if (!clerk) return d.abort(live, 'no_bodies');
    clerk.data.trafficRole = 'fixer';
    holdDesk(clerk, live, d.now(), 'the_clean_sheet:desk_hold');

    // The burner buoy the band rides — a real body on the field, tetherable like any prop.
    const relay = d.spawnProp(live, {
      pos: at(10, CLEAN_SHEET.relayWu),
      radius: 4,
      scanLabel: 'BURNER RELAY — STOLEN DESK BAND',
      storyPropKind: 'cr_clean_sheet_relay',
    });
    if (relay && relay.id != null) {
      live.ids.push(relay.id);
      live.roles[relay.id] = 'relay';
    }

    // The ping's own answer: two interceptors inbound on the bearing, on the law's own
    // wanted-only posture — a clean sheet reads clean to them too.
    const sweepBearing = a + Math.PI * (0.75 + rng() * 0.5);
    const sx = Math.cos(sweepBearing);
    const sz = Math.sin(sweepBearing);
    const sweepIds = d.spawnShips(live, [
      {
        archetype: 'patrol_lawman', level: 6, role: 'sweep', factionId: 'faction_scn', team: 2,
        context: 'patrol', passive: false,
        pos: { x: center.x + sx * CLEAN_SHEET.sweepDistWu, z: center.z + sz * CLEAN_SHEET.sweepDistWu },
        scanLabel: 'SCN SWEEP — ANSWERING A BURNER PING',
      },
      {
        archetype: 'patrol_lawman', level: 5, role: 'sweep', factionId: 'faction_scn', team: 2,
        context: 'patrol', passive: false,
        pos: { x: center.x + sx * (CLEAN_SHEET.sweepDistWu + 160), z: center.z + sz * (CLEAN_SHEET.sweepDistWu + 160) + 90 },
        scanLabel: 'SCN SWEEP — ANSWERING A BURNER PING',
      },
    ]);
    for (const e of d.entsOf(live, 'sweep')) {
      e.data.ai.lawful = true;
      e.data.lawWitness = true;                       // the sweep is the law's eyes on the field
      sweepInbound(e, live, d.now(), center);
    }

    const now = d.now();
    live.data.cleanSheet = {
      clerkId: clerk.id,
      relayId: relay && relay.id != null ? relay.id : null,
      sweepIds: sweepIds.slice(),
      priceCr,
      levelAtFire: level,
      offerEndsAt: burned ? null : now + CLEAN_SHEET.offerS,
      packedAt: null,
      boltAt: null,
      shotAt: null,
      prior: priorOutcomeId || null,
      burned,
      settled: false,
    };
    live.deadlineAt = now + CLEAN_SHEET.windowS;
    live.approach = {
      signal: 'painted_desk_and_an_answering_sweep',
      contacts: ids.length + sweepIds.length + (relay ? 1 : 0),
      t: now,
    };
    live.vars = { ...(live.vars || {}), amount: priceCr };

    if (burned) {
      live.phase = 'refused';
      live.data.cleanSheet.boltAt = now + CLEAN_SHEET.refusedHoldS;
      d.say(live, 'alert',
        'QUIET DESK: your registry is a dead letter on this wire — the Quiet buries its clerks and keeps the names of the hands that did it. Fly on. The wire stays dark for you.',
        null, { primary: true, literal: true });
      return;
    }

    live.phase = 'offer';
    d.say(live, 'alert', returner
      ? `QUIET DESK: the book knows this registry — field price is the returner's figure, ${priceCr} cr, one line off the sheet on the same wire the bar uses. Answer quick: the band lit the moment I opened it, and the sweep answering the ping is already inbound on the bearing.`
      : `QUIET DESK: hot registry, this is the Quiet's field desk — one line off your sheet, ${priceCr} cr, the same scrub the bar sells, sold where the bar can't reach. Say it fast: this band is lit, and the sweep answering my ping is inbound on the bearing.`,
    null, { primary: true, literal: true });
    d.offerChoices(live, ['buy', 'walk'], 'walk', live.data.cleanSheet.offerEndsAt);
  },

  event(d, live, state, name, payload) {
    const w = live.data && live.data.cleanSheet;
    if (!w || w.settled || live.phase === 'done') return;
    const now = d.now();
    if (name === 'playerHitSquad' && payload && payload.targetId != null) {
      const role = live.roles && live.roles[payload.targetId];
      if (role === 'sweep' && live.phase !== 'conflict') {
        // Shooting at the law on a paper channel: the desk doesn't adjudicate it — the law's
        // own witness machinery prices the shot — the desk just stops being here.
        this._deskGone(d, live, state, 'went_loud', 'the desk reads muzzle flash on the law\'s bearing');
        return;
      }
      if (role === 'clerk' || role === 'relay') this._deskShot(d, live, state);
      return;
    }
    if (name === 'squadKill' && payload) {
      const role = payload.role;
      if (role === 'clerk') {
        if (payload.byPlayer) return this._settle(d, live, state, 'shot_the_desk');
        // Somebody else's guns took the desk — the field is done either way.
        return this._deskGone(d, live, state, 'went_quiet', 'the desk went dark mid-hail');
      }
      if (role === 'relay') {
        // The buoy was the wire. Shooting it is shooting the desk's desk.
        if (payload.byPlayer) return this._deskShot(d, live, state);
        return this._deskGone(d, live, state, 'went_quiet', 'the burner buoy died');
      }
      if (role === 'sweep' && live.phase !== 'sold' && live.phase !== 'conflict') {
        this._deskGone(d, live, state, 'went_loud', 'the desk does not deal over a dead lawman');
      }
      return;
    }
  },

  choose(d, live, state, choiceId) {
    const w = live.data && live.data.cleanSheet;
    if (!w || w.settled || live.phase === 'done') return;
    const now = d.now();
    if (live.phase !== 'offer') return;

    if (choiceId === 'buy') {
      const credits = Math.round(Number(state.player && state.player.credits) || 0);
      // Money up front through the economy's own verified charge — the desk is not a charity.
      const charge = {
        amount: w.priceCr, reason: 'the_clean_sheet:field_scrub', requireFull: true,
        expectedCredits: credits, commit: () => true, result: false,
      };
      d.emit('economy:chargeCredits', charge);
      if (charge.result !== true) {
        d.say(live, 'alert', 'QUIET DESK: the wire came back short. The desk doesn\'t do credit.',
          null, { literal: true });
        return this._settle(d, live, state, 'desk_refused', { refusal: 'short', priceCr: w.priceCr });
      }
      // The fixer's own door, verbatim: the heat owner decides whether (and how much) the sheet
      // cools. A refusal refunds the charge through the economy's own grant — the ledger stays
      // honest in both directions.
      const request = {
        schemaVersion: 1, fenceId: DESK_LEDGER_ID,
        sectorId: live.sectorId || (state.world && state.world.currentSectorId) || null,
        costCr: w.priceCr, result: null,
      };
      d.emit('heat:scrubRequested', request);
      const res = request.result;
      if (!res || res.ok !== true) {
        d.grant(w.priceCr, 'the_clean_sheet:refund');
        const reason = (res && res.reason) || 'refused';
        d.say(live, 'alert', `QUIET DESK: ${refusalLine(reason)} Refunded on the same wire.`, null, { literal: true });
        return this._settle(d, live, state, 'desk_refused', { refusal: reason, priceCr: w.priceCr });
      }
      w.soldAt = now;
      w.cooled = res.cooled;
      w.boltAt = now + CLEAN_SHEET.packUpS;
      live.phase = 'sold';
      d.rep('faction_quiet', CLEAN_SHEET.quietRepSale, 'the_clean_sheet_bought');
      d.say(live, 'alert', res.after > 0
        ? 'QUIET DESK: wire\'s clean — your sheet reads a line lighter. The buoy is already burning; don\'t be standing on it when the sweep lands.'
        : 'QUIET DESK: wire\'s clean — the sheet reads blank. The buoy is already burning; the sweep will find a cold relay and nothing else.',
      null, { literal: true });
      publishSituationNews(d, live,
        'A REGISTRY WENT QUIET OFF THE LANE: a wanted hull bought paper where no bar could reach it, and a burner buoy burned itself out behind the deal. The Quiet\'s field desk was already gone.');
      return;
    }

    // 'walk' — no answer is an answer; the desk keeps its count either way.
    d.say(live, 'bark', 'QUIET DESK: the paper keeps. Be elsewhere when the sweep lands — the ping is already out.',
      null, { literal: true });
    return this._settle(d, live, state, 'walked_away', { priceCr: w.priceCr });
  },

  tick(d, live, state, now) {
    const w = live.data && live.data.cleanSheet;
    if (!w || w.settled || live.phase === 'done') return;
    const anchor = live.anchor || (live.plan && live.plan.zoneCenter);

    const clerk = entityById(state, w.clerkId);
    if (!clerk || clerk.alive === false) {
      // The desk died by a hand the squad ledger didn't pin on the player — still the record.
      return this._settle(d, live, state, w.shotAt ? 'shot_the_desk' : 'went_quiet');
    }

    if (live.phase === 'sold') {
      // The sold desk runs the pack-up clock, then physically bolts — the sweep lands on a
      // burning buoy and a cooling lane.
      if (w.boltAt != null && now >= w.boltAt) {
        w.boltAt = null;
        deskBolts(clerk, live, now, d.player() && d.player().pos, 'the_clean_sheet:wire_burned');
        const relay = w.relayId != null && entityById(state, w.relayId);
        if (relay && relay.data) relay.data.despawnAt = now + 2; // a burner buoy burns
        d.say(live, 'bark', 'QUIET DESK: wire\'s folded. We were never here.', null, { literal: true });
      }
      const gone = w.boltAt == null
        && d.player() && d.player().pos
        && dist2(clerk.pos, d.player().pos) > CLEAN_SHEET.egressWu * CLEAN_SHEET.egressWu;
      if (gone || (w.soldAt != null && now >= w.soldAt + 30)) {
        return this._settle(d, live, state, 'sheet_bought', {
          priceCr: w.priceCr, cooled: w.cooled,
          tier: wantedTierFor(state.player && state.player.heat),
        });
      }
      return;
    }

    if (live.phase === 'refused') {
      if (w.boltAt != null && now >= w.boltAt) {
        w.boltAt = null;
        deskBolts(clerk, live, now, d.player() && d.player().pos, 'the_clean_sheet:dead_letter');
      }
      if (w.boltAt == null) return this._settle(d, live, state, 'wire_refused');
      return;
    }

    if (live.phase === 'conflict') {
      // The clerk either dies by the player's hand (caught above by squadKill) or runs the shot
      // out of the wire's reach — the record reads the shot either way.
      const playerPos = d.player() && d.player().pos;
      if (!playerPos
        || dist2(clerk.pos, playerPos) > CLEAN_SHEET.egressWu * CLEAN_SHEET.egressWu
        || now >= live.deadlineAt) {
        return this._settle(d, live, state, 'shot_the_desk');
      }
      return;
    }

    // phase 'offer': the window is the sweep's flight time, nothing else.
    let sweepClose = false;
    if (anchor) {
      for (const e of d.entsOf(live, 'sweep')) {
        if (dist2(e.pos, anchor) <= CLEAN_SHEET.sweepCloseWu * CLEAN_SHEET.sweepCloseWu) {
          sweepClose = true;
          break;
        }
      }
    }
    if (sweepClose || now >= w.offerEndsAt) {
      // 'alert' — the offer's own closing notice must land even inside the bark gap.
      d.say(live, 'alert', sweepClose
        ? 'QUIET DESK: the sweep is on the ping — desk is dark. This window is closed.'
        : 'QUIET DESK: too slow. The desk doesn\'t hold a lit band for a maybe — the wire is closed.',
      null, { literal: true });
      deskBolts(clerk, live, now, d.player() && d.player().pos, 'the_clean_sheet:sweep_landed');
      const relay = w.relayId != null && entityById(state, w.relayId);
      if (relay && relay.data) relay.data.despawnAt = now + 2;
      return this._settle(d, live, state, 'window_closed', { sweepClose });
    }

    if (now >= live.deadlineAt || !d.playerNearZone(live, CLEAN_SHEET.leaveSlackWu)) {
      return this._settle(d, live, state, 'went_quiet');
    }
  },

  _deskShot(d, live, state) {
    const w = live.data.cleanSheet;
    if (w.shotAt != null) return;
    w.shotAt = d.now();
    live.phase = 'conflict';
    const clerk = entityById(state, w.clerkId);
    if (clerk && alive(clerk)) {
      deskBolts(clerk, live, w.shotAt, d.player() && d.player().pos, 'the_clean_sheet:shot_at');
    }
    d.rep('faction_quiet', CLEAN_SHEET.shotRep, 'the_clean_sheet_shot_the_desk');
    d.say(live, 'alert',
      'QUIET DESK: the desk reads muzzle flash. The Quiet buries its clerks — it doesn\'t bill the hand that shot them. Your registry is a dead letter now.',
      null, { literal: true });
    publishSituationNews(d, live,
      'A FIELD DESK WENT DARK UNDER FIRE: somebody shot the Quiet\'s paper boat on the lane. The wire keeps names, and it just wrote one in the dead-letter book.');
  },

  _deskGone(d, live, state, outcome, reason) {
    const w = live.data.cleanSheet;
    const clerk = entityById(state, w.clerkId);
    if (clerk && alive(clerk)) {
      deskBolts(clerk, live, d.now(), d.player() && d.player().pos, `the_clean_sheet:${outcome}`);
    }
    return this._settle(d, live, state, outcome, { why: reason });
  },

  _settle(d, live, state, outcome, facts = {}) {
    const w = live.data && live.data.cleanSheet;
    if (!w || w.settled) return;
    w.settled = true;
    // A field desk never lingers on a lit band: whatever wrote the record, the hull is running
    // on the way out — the resolve's own straggler sweep retires it after the leg.
    const clerk = entityById(state, w.clerkId);
    if (clerk && alive(clerk) && clerk.data && clerk.data.despawnAt == null) {
      deskBolts(clerk, live, d.now(), d.player() && d.player().pos, `the_clean_sheet:${outcome}`);
    }
    return settleSituation(d, live, state, outcome, {
      levelAtFire: w.levelAtFire, priceCr: w.priceCr, prior: w.prior, ...facts,
    });
  },
});

export default defineEncounter(trigger, {
  shape: { situation: 'trade', place: trigger.zoneTypes, twist: 'named', actor: 'faction_quiet' },
  factionId: 'faction_quiet',
  title: 'THE CLEAN SHEET',
  primaryLine: 'QUIET DESK: hot registry, this is the Quiet\'s field desk — one line off your sheet, sold where the bar can\'t reach. The band is lit and the sweep answering my ping is already inbound.',
  verbs: ['pay', 'fly_on', 'fire'],
  choices: [
    { id: 'buy', verb: 'pay', label: 'Buy the scrub — one line off the sheet, field price.', playerLine: 'Run it. Here is the wire.', needs: 'credits' },
    { id: 'walk', verb: 'fly_on', label: 'Fly on — let the desk burn its own buoy.', playerLine: 'Not today. The paper keeps.' },
  ],
  timeoutChoice: 'walk',
  civilian: { archetypes: ['customs_cutter'], size: [1, 1], factionId: 'faction_quiet', context: 'civilian', team: 2, passive: true },
  deadlineS: CLEAN_SHEET.windowS,
  receipts: {
    sheet_bought: 'SHEET SCRUBBED — the field desk wrote your registry down a line and burned its own buoy. The sweep found a cold relay and a clean sheet.',
    walked_away: 'WALKED — the desk kept its paper and you kept your credits. The ping is still out; you weren\'t.',
    window_closed: 'WINDOW CLOSED — the sweep answered the ping before you answered the desk. The Quiet was already gone.',
    desk_refused: 'REFUSED — the wire answered honestly: nothing moved, nothing was kept. The field desk knows its own law.',
    wire_refused: 'DEAD LETTER — the desk read your registry and closed. The Quiet buries its clerks and keeps the names.',
    shot_the_desk: 'SHOT THE DESK — the paper boat ran or died under your guns. The law saw what the sweep could see; the Quiet saw all of it.',
    went_loud: 'WENT LOUD — guns on a paper channel. The desk was gone before the second shot.',
    went_quiet: 'WENT QUIET — the lane kept moving and the desk kept its count. The buoy burned out on its own clock.',
  },
});
