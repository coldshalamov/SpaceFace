// WF — THE FIRE SALE. Every credit-for-cargo exchange in this world happens behind a station
// market screen; no hull has ever sold a lot on the lane. This is that missing verb.
//
// A Meridian line hauler is mid-burn when its manifest dies: the receiving berth's board glutted
// on the commodity while it was in the lane, and the yard voided the paper rather than pay for
// freight it no longer needs. The glut is REAL — the encounter reads the berth's live market for a
// consume-role good (and when the board is honest-but-not-yet-glutted, injects the actual `boom`
// market event through the economy owner's own mission:forceEvent route). Dock there and the chart
// shows exactly what the hail claimed.
//
// Dead paper means hauling the lot home is a loss, so the hauler sells it off the hatch: cash on
// the wire at a fire-sale figure under the healthy mid, the custody pod kicked loose clean. The
// player's margin is the real market spread — buy the lot here, sell it where the board still
// pays. Beat the price down and the line's desk files a squeeze. Shoot the hauler and it kicks
// the lot marked loose while it runs. Or pass and let it burn home with dead freight.
import { deepFreeze, defineEncounter } from './catalog.js';
import {
  alive, entityById, priorOutcome, publishSituationNews, settleSituation,
} from '../../systems/crSituationKit.js';
import { ActivityKind, RulesOfEngagement, setEntityDoctrine } from '../../ai/doctrine.js';
import { COMMODITIES } from '../commodities.js';

export const encounterOrder = 1206;
export const trigger = deepFreeze({
  id: 'the_fire_sale',
  tier: 'minor',
  deck: 'civilian',
  weight: 1.1,
  zoneTypes: ['trade_lane'],
  script: 'selfRegistered',
  fallbackScript: 'whisper',
  pressureCost: 14,
  cooldownS: 2400,
  proximity: true,
  fireWithinWu: 520,
  gates: { sectorIds: ['sector_tethys_junction', 'sector_helios_prime'] },
});

const CMDTY_BY_ID = new Map(COMMODITIES.map((c) => [c.id, c]));

export const FIRE_SALE = Object.freeze({
  windowS: 420,               // scene lifetime — the lot's own pickup TTL outlives it
  offerS: 60,                 // how long the wire stays open before the hauler hauls home
  podTtlS: 540,               // the dropped lot is a real body; it drifts this long
  glutS: 480,                 // the injected boom's market duration
  glutFill: 1.15,             // stock/baseEq at or above this already reads as a real glut
  askTargetCr: 380,           // lot sizing aims the ask near this
  askDiscount: 0.55,          // of catalog base price — below every healthy mid
  squeezeMult: 0.62,          // the beaten-down figure, of the ask
  qtyMin: 4,
  qtyMax: 24,                 // stays inside a starter hold (40 vol / 60 mass)
  maxVolPerU: 34,             // lot volume ceiling when sizing
  maxMassPerU: 48,            // lot mass ceiling when sizing
  aboardWu: 160,              // pod left the field this close to the player = aboard
  leaveSlackWu: 700,          // player this far past the zone with no pod = walked from it
  haulerFleeWu: 3600,         // outbound transit anchor when the deal is refused or forced
  repBuy: 1,                  // a straight wire, remembered
  repSqueeze: -2,             // the desk files a squeeze
  repRob: -6,                 // a lane kill on a selling hull
  repShotAfterSale: -4,       // paid for the lot, then fired on the hauler anyway
  priceFloor: 8, priceCeil: 240, // the lot is a haulable commodity, not a gem lotto
});

const dist2 = (ax, az, bx, bz) => {
  const dx = ax - bx, dz = az - bz;
  return dx * dx + dz * dz;
};

export const runtime = Object.freeze({
  fire(d, live, state) {
    const center = (live.plan && live.plan.zoneCenter) || live.anchor;
    if (!center || !Number.isFinite(center.x)) return d.abort(live, 'no_zone_anchor');
    const pick = this._pickLot(d, live, state);
    if (!pick) return d.abort(live, 'no_market');

    const prior = priorOutcome(state, live.shapeId);
    const rng = d.stream(live, 'fire_sale_layout');
    const a = rng() * Math.PI * 2;
    const u = { x: Math.cos(a), z: Math.sin(a) };
    const haulerPos = { x: center.x + u.x * 60, z: center.z + u.z * 60 };

    const ids = d.spawnShips(live, [
      { archetype: 'mule_trader', level: 3, role: 'hauler', factionId: 'faction_mts', team: 2,
        context: 'civilian', passive: true, pos: haulerPos,
        scanLabel: `LINE HAULER — MANIFEST DEAD — ${pick.commodityName.toUpperCase()} LOT` },
    ]);
    const haulerId = ids[0];
    if (haulerId == null || d.aliveCount(live, 'hauler') < 1) return d.abort(live, 'no_bodies');

    // The glut that voided the manifest is a real market event on the named berth — unless the
    // board already shows the surplus, in which case the world authored the cause itself.
    let eventId = null;
    if (!pick.gluttedAlready) {
      const ev = { type: 'boom', stationId: pick.stationId, commodityId: pick.commodityId, duration: FIRE_SALE.glutS };
      d.emit('mission:forceEvent', ev);
      eventId = 'injected';
    }

    live.data.fireSale = {
      haulerId,
      podId: null,
      podLastPos: null,
      podMarked: false,
      lotState: 'held',          // held | dropped | aboard | loose | gone
      paidBy: null,              // 'buy' | 'squeeze' | null (forced drop)
      paidCr: 0,
      stationId: pick.stationId,
      stationName: pick.stationName,
      commodityId: pick.commodityId,
      commodityName: pick.commodityName,
      qty: pick.qty,
      ask: pick.ask,
      squeezeAsk: pick.squeezeAsk,
      gluttedAlready: pick.gluttedAlready,
      marketEventId: eventId,
      prior: prior ? prior.outcome : null,
      settled: false,
      haulerShot: false,
      haulerDead: false,
      haulerFled: false,
      offerEndsAt: d.now() + FIRE_SALE.offerS,
    };

    live.vars = {
      ...(live.vars || {}),
      amount: pick.ask,
      crew: 'line hauler',
      stationName: pick.stationName,
    };
    live.deadlineAt = d.now() + FIRE_SALE.windowS;
    live.phase = 'offer';
    live.approach = {
      signal: 'hauler_holding_dead_manifest',
      contacts: 1,
      t: d.now(),
    };
    d.say(live, 'alert',
      `MTS LANE WIRE: hauler holds a dead manifest — ${pick.stationName} glutted on ${pick.commodityName} mid-burn and the yard voided the paper. `
      + `The lot goes out the hatch for ${pick.ask} cr on the wire — under every honest mid — or it burns home as a loss. Check the ${pick.stationName} board if you doubt it.`,
      null, { primary: true, literal: true });
    d.offerChoices(live, live.shape.choices.map((c) => c.id), 'pass', live.data.fireSale.offerEndsAt);
  },

  event(d, live, state, name, payload) {
    const w = live.data && live.data.fireSale;
    if (!w || w.settled) return;
    if (name === 'playerHitSquad' && payload && payload.targetId === w.haulerId) {
      w.haulerShot = true;
      this._fleeHauler(d, live, 'fire_sale:shot_at');
      // A selling hull under fire kicks the lot loose to run light — now it is marked freight,
      // not a deal: the pod reads stolen no matter who walks it away. A pod that already went
      // out paid stays paid; only the squeeze on its seller changes.
      if (w.lotState === 'held' && this._dropLot(d, live, state, { marked: true })) {
        w.lotState = 'loose';
        live.phase = 'lot_out';      // nobody sells under fire — the floating pod decides the ending
        d.say(live, 'bark',
          'LINE HAULER: taking the freight and sparing the hull — the lot is kicked loose, the manifest reads stolen. Desk has your registry.',
          null, { literal: true });
      }
      return;
    }
    if (name === 'squadKill' && payload && payload.role === 'hauler' && payload.byPlayer) {
      w.haulerDead = true;
      w.haulerShot = true;
      if (w.lotState === 'held') this._dropLot(d, live, state, { marked: true });
      if (w.paidBy) {
        // Paid clean, then shot the seller anyway — the desk keeps both records.
        d.rep('faction_mts', FIRE_SALE.repShotAfterSale, 'the_fire_sale_shot_after_sale');
        publishSituationNews(d, live,
          `PAID AND MURDERED: a hull bought a dead-manifest lot off the lane and then fired on the selling freighter. The Syndicate files both halves of the wire.`);
      } else {
        d.rep('faction_mts', FIRE_SALE.repRob, 'the_fire_sale_robbed');
        publishSituationNews(d, live,
          `LINE HULL LOOTED ON THE LANE: an MTS freighter was killed over a voided manifest and its lot drifted out marked. The Syndicate keeps the manifest.`);
      }
      return this._settle(d, live, state, 'robbed');
    }
  },

  choose(d, live, state, choiceId) {
    const w = live.data && live.data.fireSale;
    if (!w || w.settled || live.phase === 'done') return;
    if (live.phase !== 'offer') return;
    if (choiceId === 'buy' || choiceId === 'squeeze') {
      const price = choiceId === 'squeeze' ? w.squeezeAsk : w.ask;
      const credits = state.player && Math.round(Number(state.player.credits) || 0) || 0;
      // Exact-payment request through the sole credits writer — a stale balance between the offer
      // and the answer settles nothing and moves no freight.
      const req = {
        amount: price, reason: `the_fire_sale:${choiceId}`, requireFull: true,
        expectedCredits: credits, commit: () => true, result: false,
      };
      d.emit('economy:chargeCredits', req);
      if (req.result !== true) {
        d.say(live, 'bark', 'LINE HAULER: the wire came back short. No paper, no pod — I burn home.', null, { literal: true });
        this._sendOff(d, live);
        return this._settle(d, live, state, 'hauled_off');
      }
      w.paidBy = choiceId;
      w.paidCr = price;
      this._dropLot(d, live, state, { marked: false });
      if (choiceId === 'squeeze') {
        d.rep('faction_mts', FIRE_SALE.repSqueeze, 'the_fire_sale_squeezed');
        d.say(live, 'bark',
          `LINE HAULER: ${w.squeezeAsk} and my desk files your name for the squeeze. The pod is loose — it's yours, take it.`,
          null, { literal: true });
      } else {
        d.rep('faction_mts', FIRE_SALE.repBuy, 'the_fire_sale_bought');
        d.say(live, 'bark',
          `LINE HAULER: wire's clean and the custody reads paid. Lot is out the hatch — scoop it before the lane reads it loose.`,
          null, { literal: true });
      }
      publishSituationNews(d, live,
        `DEAD MANIFEST SOLD OFF THE LANE: an MTS hauler kicked a ${w.commodityName} lot to a pilot on the wire — ${w.stationName}'s board never saw the freight land.`);
      live.phase = 'lot_out';
      return;
    }
    // 'pass' (and the wire going quiet at the deadline): the lot rides home as dead freight.
    this._sendOff(d, live);
    return this._settle(d, live, state, 'hauled_off');
  },

  tick(d, live, state, now) {
    const w = live.data && live.data.fireSale;
    if (!w || w.settled || live.phase === 'done') return;

    if (live.phase === 'offer') {
      if (now >= w.offerEndsAt) return this.choose(d, live, state, 'pass');
      if (now >= live.deadlineAt) return this.choose(d, live, state, 'pass');
      return;
    }

    // lot_out — the pod's physical truth decides the receipt.
    if (w.lotState === 'dropped' || w.lotState === 'loose') {
      const pod = entityById(state, w.podId);
      if (pod && pod.alive !== false && pod.pos) {
        w.podLastPos = { x: pod.pos.x, z: pod.pos.z };
      } else {
        // The pod left the field: aboard the player if she was standing on it, else loose.
        const p = d.player();
        const aboard = !!(p && p.pos && w.podLastPos
          && dist2(p.pos.x, p.pos.z, w.podLastPos.x, w.podLastPos.z) <= FIRE_SALE.aboardWu * FIRE_SALE.aboardWu);
        w.lotState = aboard ? 'aboard' : 'gone';
      }
    }

    if (w.lotState === 'aboard') {
      if (w.paidBy === 'squeeze') return this._settle(d, live, state, 'squeezed');
      if (w.paidBy === 'buy') return this._settle(d, live, state, 'bought');
      return this._settle(d, live, state, 'robbed');   // marked freight walked off anyway
    }

    // Paid for it and left it floating — custody says paid; the lane keeps the pod.
    if (w.paidBy && !d.playerNearZone(live, FIRE_SALE.leaveSlackWu)) {
      return this._settle(d, live, state, 'paid_loose');
    }
    if (w.lotState === 'gone') {
      return this._settle(d, live, state, w.paidBy ? 'paid_loose' : 'lot_loose');
    }
    if (w.haulerDead || w.lotState === 'loose') {
      // Robbed-and-left / kicked-loose-and-lost: the pod is still physically there but the
      // scene's question is answered once the player walks away or the window runs out.
      if (!d.playerNearZone(live, FIRE_SALE.leaveSlackWu)) {
        return this._settle(d, live, state, w.paidBy ? 'paid_loose' : 'robbed');
      }
    }
    if (now >= live.deadlineAt) {
      if (w.paidBy) return this._settle(d, live, state, w.paidBy === 'squeeze' ? 'squeezed' : 'bought');
      return this._settle(d, live, state, w.haulerShot ? 'robbed' : 'went_quiet');
    }
  },

  /** The lot becomes a real custody pod kicked out beside the hauler. Clean sales read paid;
   *  forced drops read marked — the pod's own custody line carries which it is. */
  _dropLot(d, live, state, opts) {
    const w = live.data.fireSale;
    const hauler = entityById(state, w.haulerId);
    const at = (hauler && hauler.pos) || live.anchor || (live.plan && live.plan.zoneCenter);
    if (!at) return null;
    const rng = d.stream(live, 'fire_sale_pod');
    const a = rng() * Math.PI * 2;
    const pod = d.spawnFreightPickup(live, {
      pos: { x: at.x + Math.cos(a) * 30, z: at.z + Math.sin(a) * 30 },
      commodityId: w.commodityId,
      qty: w.qty,
      ttlS: FIRE_SALE.podTtlS,
      custody: {
        ownerName: opts && opts.marked
          ? `VOID-MANIFEST FREIGHT — ${w.commodityName.toUpperCase()} — MTS LINE`
          : `PAID LOT — ${w.commodityName.toUpperCase()} — SOLD OFF THE LANE`,
        encounterId: live.id,
      },
    });
    if (!pod) return null;
    w.podId = pod.id;
    w.lotState = 'dropped';
    w.podMarked = !!(opts && opts.marked);
    w.podLastPos = { x: pod.pos.x, z: pod.pos.z };
    return pod;
  },

  _sendOff(d, live) {
    const w = live.data.fireSale;
    if (w.haulerFled) return;
    this._fleeHauler(d, live, 'fire_sale:hauled_home');
    d.say(live, 'bark',
      `LINE HAULER: no wire. The lot rides home as a loss — ${w.stationName} can weigh dead paper.`,
      null, { literal: true });
  },

  _fleeHauler(d, live, reason) {
    const w = live.data.fireSale;
    if (w.haulerFled) return;
    const hauler = entityById(d.state, w.haulerId);
    if (!hauler || hauler.alive === false) return;
    w.haulerFled = true;
    const p = d.player();
    const ax = (p && p.pos) ? p.pos.x : live.anchor.x;
    const az = (p && p.pos) ? p.pos.z : live.anchor.z;
    const dx = hauler.pos.x - ax, dz = hauler.pos.z - az;
    const l = Math.hypot(dx, dz) || 1;
    setEntityDoctrine(hauler, {
      activity: {
        kind: ActivityKind.TRANSIT,
        reason,
        anchor: { x: hauler.pos.x + (dx / l) * FIRE_SALE.haulerFleeWu, z: hauler.pos.z + (dz / l) * FIRE_SALE.haulerFleeWu },
        leashRadius: FIRE_SALE.haulerFleeWu * 2,
        startedTick: Math.round(d.now() * 60),
        encounterId: live.id,
      },
      roe: RulesOfEngagement.HOLD_FIRE,
    });
  },

  _pickLot(d, live, state) {
    const econ = d.registry && typeof d.registry.get === 'function' ? d.registry.get('economy') : null;
    const stations = d.stationsInSector();
    if (!econ || !stations.length) return null;
    const rng = d.stream(live, 'fire_sale_pick');
    const order = stations.slice();
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const t = order[i]; order[i] = order[j]; order[j] = t;
    }
    const candidates = [];
    for (const st of order) {
      const market = state.economy && state.economy.markets
        ? (state.economy.markets[st.id] || econ.ensureStationMarkets(st.id))
        : null;
      if (!market) continue;
      for (const cid of Object.keys(market)) {
        const entry = market[cid];
        const def = CMDTY_BY_ID.get(cid);
        if (!entry || !def) continue;
        if (entry.role !== 'consume' || def.legality !== 'legal' || def.noMarketSeed === true) continue;
        if (!(def.basePrice >= FIRE_SALE.priceFloor && def.basePrice <= FIRE_SALE.priceCeil)) continue;
        const fill = entry.baseEq > 0 ? entry.stock / entry.baseEq : 1;
        candidates.push({ stationId: st.id, stationName: st.name || st.id, commodityId: cid, def, fill });
      }
      if (candidates.length) break;   // first station in seeded order supplies the story's berth
    }
    if (!candidates.length) return null;
    // The most-glutted board writes the voided manifest; the stream picks inside the honest top.
    candidates.sort((x, y) => y.fill - x.fill);
    const pick = candidates[Math.floor(rng() * Math.min(3, candidates.length))];
    const def = pick.def;
    let qty = Math.round(FIRE_SALE.askTargetCr / (def.basePrice * FIRE_SALE.askDiscount));
    qty = Math.min(qty, FIRE_SALE.qtyMax);
    qty = Math.min(qty, Math.max(FIRE_SALE.qtyMin,
      Math.floor(FIRE_SALE.maxVolPerU / Math.max(0.4, Number(def.volPerU) || 1)),
      Math.floor(FIRE_SALE.maxMassPerU / Math.max(0.3, Number(def.massPerU) || 0.5))));
    qty = Math.max(FIRE_SALE.qtyMin, qty);
    const ask = Math.max(1, Math.round(qty * def.basePrice * FIRE_SALE.askDiscount));
    const squeezeAsk = Math.max(1, Math.round(ask * FIRE_SALE.squeezeMult));
    return {
      stationId: pick.stationId,
      stationName: pick.stationName,
      commodityId: pick.commodityId,
      commodityName: def.name || pick.commodityId,
      qty,
      ask,
      squeezeAsk,
      gluttedAlready: pick.fill >= FIRE_SALE.glutFill,
    };
  },

  _settle(d, live, state, outcome, facts = {}) {
    const w = live.data && live.data.fireSale;
    if (!w || w.settled) return;
    w.settled = true;
    live.vars = { ...(live.vars || {}), via: w.paidBy || (w.haulerShot ? 'fire' : 'wire') };
    return settleSituation(d, live, state, outcome, {
      via: w.paidBy || (w.haulerShot ? 'fire' : 'wire'),
      commodityId: w.commodityId,
      qty: w.qty,
      paidCr: w.paidCr,
      stationId: w.stationId,
      gluttedAlready: w.gluttedAlready,
      podMarked: w.podMarked,
      haulerShot: w.haulerShot,
      ...facts,
    });
  },
});

export default defineEncounter(trigger, {
  shape: { situation: 'trade', place: trigger.zoneTypes, twist: 'named', actor: 'faction_mts' },
  factionId: 'faction_mts',
  title: 'THE FIRE SALE',
  motive: 'a dead manifest, a real glut on the board, and a lot priced to leave the hold',
  primaryLine: 'MTS LANE WIRE: hauler holds a dead manifest — the berth glutted mid-burn and the yard voided the paper. The lot goes out the hatch for a fire-sale wire, or it burns home as a loss.',
  verbs: ['buy', 'haggle', 'scoop', 'fire', 'fly_on'],
  choices: [
    { id: 'buy', label: 'Wire the ask — the lot kicks out clean', needs: 'credits',
      playerLine: 'Wire it. The lot is mine — kick it loose.' },
    { id: 'squeeze', label: 'Beat the price down — the desk files your name', needs: 'credits',
      playerLine: 'Read your note back: it is dead paper either way. Lower.' },
    { id: 'pass', label: 'Let it burn home with the lot',
      playerLine: 'Not my buy. Haul it home.' },
  ],
  timeoutChoice: 'pass',
  civilian: {
    archetypes: ['mule_trader'], size: [1, 1], factionId: 'faction_mts',
    context: 'civilian', team: 2, passive: true,
  },
  bark: null,
  deadlineS: FIRE_SALE.windowS,
  receipts: {
    bought: 'BOUGHT OFF THE HATCH — the lot rode your hold clean. Sell it where the board still pays; the spread is yours.',
    squeezed: 'SQUEEZED — you paid less and the desk filed your name. The freight is real either way.',
    paid_loose: 'PAID AND LEFT — you wired for the lot and left it floating. Custody says yours; the lane says loose.',
    robbed: 'ROBBED ON THE WIRE — the hauler is dead and its marked lot floats. The Syndicate keeps the manifest.',
    lot_loose: 'LOT LOOSE — the freight left the field with no clean custody. The lane has it now.',
    hauled_off: 'HAULED OFF — the lot rode home as dead freight. The board still shows the glut that killed it.',
    went_quiet: 'The wire went quiet. Somewhere a hauler is still burning with freight nobody priced.',
  },
});
