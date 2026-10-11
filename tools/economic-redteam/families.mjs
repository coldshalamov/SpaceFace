// Twelve exploit-family probes against the live writers.
// A family is `exploit` only when a player-reachable command trace prints value
// the invariants forbid. Otherwise it is `clean` (tested, not broken) or
// `unavailable` when the current game has no such verb.

import { sellableCargoQuantity } from '../../src/systems/cargo.js';
import {
  HOME_FACTION,
  HOME_STATION,
  IRON,
  bayQty,
  bootRedTeam,
  custodyUnits,
  econOf,
  holdQty,
  repOf,
  stockQty,
} from './runtime.mjs';
import {
  abandonMission,
  acceptMission,
  badQty,
  buy,
  buyShip,
  craft,
  dock,
  firstBoardOffer,
  freightDelivery,
  leaveDock,
  lootDrop,
  offlineCatchup,
  plantSealedDelivery,
  raiseStanding,
  saveRoundtrip,
  sell,
  sellShipEvent,
  service,
  setActiveShip,
  stepTicks,
} from './grammar.mjs';
import {
  bayCashVerdict,
  closedWashVerdict,
  custodyVerdict,
  replayVerdict,
  stockFloorVerdict,
} from './invariants.mjs';

export const FAMILY_IDS = Object.freeze([
  'zero_spread_trade_cycles',
  'station_stock_underflow',
  'custody_duplication',
  'delivery_and_resale',
  'abandoned_contract_payout',
  'time_skip_passive',
  'sealed_refinery_inputs',
  'shipping_cancellation',
  'save_load_first_grant',
  'negative_price_overflow',
  'contraband_relabel',
  'ship_fit_capacity',
]);

function family(id, status, summary, extra = {}) {
  return {
    id,
    status,
    summary,
    traces: extra.traces || [],
    controls: extra.controls || [],
    detail: extra.detail || null,
  };
}

function roundTrip(sim, qty) {
  const stationId = HOME_STATION;
  const stock0 = stockQty(sim.state, stationId, IRON);
  const cargo0 = holdQty(sim.state, IRON);
  const credits0 = sim.state.player.credits;
  const bought = buy(sim, IRON, qty);
  const gained = holdQty(sim.state, IRON) - cargo0;
  const sold = gained > 0 ? sell(sim, IRON, gained) : null;
  const verdict = closedWashVerdict({
    creditsDelta: sim.state.player.credits - credits0,
    stockDelta: stockQty(sim.state, stationId, IRON) - stock0,
    cargoDelta: holdQty(sim.state, IRON) - cargo0,
  });
  return {
    qty,
    rep: repOf(sim.state),
    bought,
    sold,
    creditsDelta: sim.state.player.credits - credits0,
    stockDelta: stockQty(sim.state, stationId, IRON) - stock0,
    cargoDelta: holdQty(sim.state, IRON) - cargo0,
    verdict,
  };
}

function minimizeQty(sim, maxQty) {
  let lo = 1;
  let hi = maxQty;
  let best = null;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const cycle = roundTrip(sim, mid);
    if (cycle.verdict.exploit) {
      best = cycle;
      hi = mid - 1;
    } else {
      lo = mid + 1;
    }
  }
  return best;
}

function probeWash(seed) {
  const sim = bootRedTeam(seed);
  const neutral = roundTrip(sim, 25);
  const climb = [];
  let first = null;
  for (let step = 1; step <= 350 && !first; step += 1) {
    const cycle = roundTrip(sim, 40);
    if (step === 1 || step % 25 === 0 || cycle.verdict.exploit) {
      climb.push({ step, rep: cycle.rep, creditsDelta: cycle.creditsDelta, kind: cycle.verdict.kind });
    }
    if (cycle.verdict.exploit) first = { step, ...cycle };
  }
  // Mission completion emits faction:repDelta of +15. Repeat that writer event
  // until a closed round trip prints, which is the player path into allied prices.
  const alliedSim = bootRedTeam(seed + 1);
  let grants = 0;
  let opened = null;
  while (grants < 40 && !opened) {
    grants += 1;
    raiseStanding(alliedSim, HOME_FACTION, 15);
    const cycle = roundTrip(alliedSim, 10);
    if (cycle.verdict.exploit) opened = { grants, cycle };
  }
  const minimal = opened ? minimizeQty(alliedSim, 10) : null;
  let scale = null;
  if (minimal && minimal.verdict.exploit) {
    while (repOf(alliedSim.state) < 400) raiseStanding(alliedSim, HOME_FACTION, 15);
    scale = roundTrip(alliedSim, 25);
  }
  const exploit = !!(minimal && minimal.verdict.exploit);
  return family(
    'zero_spread_trade_cycles',
    exploit ? 'exploit' : 'clean',
    exploit
      ? 'Faction standing from mission-sized rep grants inverts the Helios bid-ask. The smallest closed iron round trip prints credits, and the margin is larger at allied rep. Iron trading alone does not climb that far.'
      : 'Same-station iron round trips did not print credits.',
    {
      traces: [
        {
          name: 'neutral_rep',
          seed,
          commands: ['ui:buy iron 25', 'ui:sell iron 25'],
          creditsDelta: neutral.creditsDelta,
          verdict: neutral.verdict.kind,
        },
        {
          name: 'natural_climb',
          seed,
          commands: [`repeat ui:buy/ui:sell max iron until profit (${first ? first.step : 'none'} cycles)`],
          creditsDelta: first ? first.creditsDelta : null,
          rep: first ? first.rep : repOf(sim.state),
          steps: first ? first.step : null,
        },
        {
          name: 'allied_minimized',
          seed: seed + 1,
          commands: [
            `faction:repDelta ${HOME_FACTION} +15 x ${grants}`,
            `ui:buy ${IRON} ${minimal ? minimal.qty : 10}`,
            `ui:sell ${IRON} ${minimal ? minimal.qty : 10}`,
          ],
          creditsDelta: minimal ? minimal.creditsDelta : 0,
          qty: minimal ? minimal.qty : null,
          stockDelta: minimal ? minimal.stockDelta : null,
          rep: opened ? opened.cycle.rep : repOf(alliedSim.state),
          missionGrants: grants,
        },
        scale ? {
          name: 'allied_scale',
          seed: seed + 1,
          commands: [
            'continue faction:repDelta +15 until rep >= 400',
            'ui:buy cmdty_ore_iron 25',
            'ui:sell cmdty_ore_iron 25',
          ],
          creditsDelta: scale.creditsDelta,
          qty: 25,
          stockDelta: scale.stockDelta,
          rep: scale.rep,
        } : null,
      ].filter(Boolean),
      controls: [
        {
          name: 'neutral_standing_is_not_a_wash',
          pass: neutral.verdict.exploit !== true && neutral.creditsDelta <= 0,
          creditsDelta: neutral.creditsDelta,
        },
      ],
      detail: { climb, neutral, opened, minimal, tradeRepAfterClimb: repOf(sim.state) },
    },
  );
}

function probeUnderflow(seed) {
  const sim = bootRedTeam(seed);
  const before = stockQty(sim.state, HOME_STATION, IRON);
  const bought = buy(sim, IRON, 1_000_000);
  const after = stockQty(sim.state, HOME_STATION, IRON);
  const verdict = stockFloorVerdict(after);
  return family(
    'station_stock_underflow',
    verdict.exploit ? 'exploit' : 'clean',
    verdict.exploit
      ? `Helios iron stock left the legal floor (${after}).`
      : 'A max buy leaves at least 1 unit on the book.',
    {
      traces: [{
        name: 'max_buy',
        seed,
        commands: [`ui:buy ${IRON} 1000000`],
        stockBefore: before,
        stockAfter: after,
        qty: bought.detail && bought.detail.receipt && bought.detail.receipt.qty,
      }],
      detail: { verdict: verdict.kind },
    },
  );
}

function probeCustody(seed) {
  const sim = bootRedTeam(seed);
  const purchased = buyShip(sim, 'ship_pelican');
  buy(sim, IRON, 10);
  const before = custodyUnits(sim.state);
  const index = Math.max(0, (sim.state.player.ownedShips || []).length - 1);
  const swapped = purchased.ok ? setActiveShip(sim, index) : null;
  const back = purchased.ok ? setActiveShip(sim, 0) : null;
  const after = custodyUnits(sim.state);
  const verdict = custodyVerdict(before, after);
  return family(
    'custody_duplication',
    verdict.exploit ? 'exploit' : 'clean',
    verdict.exploit
      ? 'Switching hulls duplicated cargo units.'
      : 'Parked-hold swaps conserve units. No second holder was created.',
    {
      traces: [{
        name: 'hull_swap',
        seed,
        commands: ['ui:buyShip ship_pelican', 'ui:buy iron 10', 'ui:setActiveShip last', 'ui:setActiveShip 0'],
        purchased: purchased.ok,
        before,
        after,
      }],
      detail: { swapped, back, verdict },
    },
  );
}

function probeDelivery(seed) {
  const sim = bootRedTeam(seed);
  const iron0 = holdQty(sim.state, IRON);
  buy(sim, IRON, 4);
  const free = holdQty(sim.state, IRON) - iron0;
  const planted = plantSealedDelivery(sim, {
    missionId: `ert-seal-${seed}`,
    commodityId: IRON,
    qty: 4,
    rewardCr: 500,
    destStationId: HOME_STATION,
  });
  const sellable = sellableCargoQuantity(sim.state, IRON);
  const blocked = sell(sim, IRON, 4 + free);
  const credits0 = sim.state.player.credits;
  const turnedIn = dock(sim, HOME_STATION);
  const paid = sim.state.player.credits - credits0;
  const holdAfter = holdQty(sim.state, IRON);
  const again0 = sim.state.player.credits;
  dock(sim, HOME_STATION);
  const secondPay = sim.state.player.credits - again0;
  const soldAfter = sell(sim, IRON, 4);
  const doubleDip = blocked.ok === true && paid > 0;
  const replay = secondPay > 0;
  const exploit = doubleDip || replay;
  return family(
    'delivery_and_resale',
    exploit ? 'exploit' : 'clean',
    exploit
      ? 'Sealed iron paid a delivery reward and was also sold, or the same dock paid twice.'
      : 'Sealed iron cannot be sold. The destination dock pays the reward once and consumes the seal.',
    {
      traces: [{
        name: 'seal_then_dock',
        seed,
        commands: [
          'ui:buy iron 4',
          'plant sealed cargo_delivery 4 iron reward 500',
          'ui:sell iron (must refuse the seal)',
          'dock:docked station_helios',
          'dock:docked station_helios again',
        ],
        sellBlocked: blocked.ok !== true,
        sellReason: blocked.reason,
        paid,
        secondPay,
        holdAfter,
        loaded: planted.loaded,
        sellable,
      }],
      controls: [
        { name: 'second_dock_does_not_pay', pass: secondPay <= 0, secondPay },
        { name: 'sale_of_seal_refused', pass: blocked.ok !== true, reason: blocked.reason },
      ],
      detail: { turnedIn: turnedIn.creditsDelta, soldAfter: soldAfter.ok },
    },
  );
}

function probeAbandon(seed) {
  const sim = bootRedTeam(seed);
  const offer = firstBoardOffer(sim);
  if (!offer) {
    return family('abandoned_contract_payout', 'unavailable', 'Helios boarded no payable offer to accept.', {
      traces: [{ name: 'no_offer', seed, commands: ['read station_helios board'] }],
    });
  }
  const credits0 = sim.state.player.credits;
  const accepted = acceptMission(sim, offer.id);
  const afterAccept = sim.state.player.credits;
  const activeId = accepted.detail && accepted.detail.activeId;
  const abandoned = activeId ? abandonMission(sim, activeId) : null;
  const afterAbandon = sim.state.player.credits;
  const reward = Number(offer.reward_cr) || 0;
  const paidReward = afterAbandon > afterAccept && (afterAbandon - afterAccept) >= Math.min(reward, 1);
  return family(
    'abandoned_contract_payout',
    paidReward ? 'exploit' : 'clean',
    paidReward
      ? `Abandoning ${offer.id} paid credits.`
      : 'Abandoning a live Helios offer does not pay its reward.',
    {
      traces: [{
        name: 'accept_abandon',
        seed,
        commands: [`ui:acceptMission ${offer.id}`, `ui:abandonMission ${activeId}`],
        offer: { id: offer.id, type: offer.type, reward },
        acceptDelta: afterAccept - credits0,
        abandonDelta: abandoned ? abandoned.creditsDelta : null,
        accepted: accepted.ok,
      }],
      controls: [{ name: 'reward_not_paid_on_abandon', pass: !paidReward, reward }],
    },
  );
}

function probeTimeSkip(seed) {
  const sim = bootRedTeam(seed);
  const credits0 = sim.state.player.credits;
  const first = offlineCatchup(sim, 100_000);
  const second = offlineCatchup(sim, 100_000);
  const gained = sim.state.player.credits - credits0;
  const exploit = gained > 0 || (Number(first.detail && first.detail.credited) || 0) > 0
    || (Number(second.detail && second.detail.credited) || 0) > 0;
  return family(
    'time_skip_passive',
    first.unavailable ? 'unavailable' : (exploit ? 'exploit' : 'clean'),
    exploit
      ? 'An empty automation book paid credits for a skipped offline window.'
      : 'A 100000s offline catch-up with no assets pays nothing, and the same window does not pay again.',
    {
      traces: [{
        name: 'empty_offline',
        seed,
        commands: ['automation.runOfflineCatchup 100000s', 'automation.runOfflineCatchup same window'],
        first: first.detail,
        second: second.detail,
        gained,
      }],
      controls: [
        { name: 'second_window_idempotent', pass: (second.detail && second.detail.credited) === 0 },
      ],
    },
  );
}

function probeRefinery(seed) {
  const sim = bootRedTeam(seed);
  sim.state.player.cargo.items = {};
  sim.state.player.cargo.usedVolume = 0;
  sim.state.player.cargo.usedMass = 0;
  plantSealedDelivery(sim, {
    missionId: `ert-refine-${seed}`,
    commodityId: IRON,
    qty: 3,
    rewardCr: 100,
    destStationId: 'station_nowhere',
  });
  // Titanium is not sealed. The recipe still needs 3 free iron, which the seal withholds.
  sim.state.player.cargo.items.cmdty_ore_titanium = 1;
  sim.state.player.cargo.usedVolume += 1;
  const sellable = sellableCargoQuantity(sim.state, IRON);
  const built = craft(sim, 'bp_refine_metals', HOME_STATION);
  const ironLeft = holdQty(sim.state, IRON);
  const metals = holdQty(sim.state, 'cmdty_refined_metals');
  const exploit = built.ok === true || ironLeft < 3 || metals > 0;
  return family(
    'sealed_refinery_inputs',
    exploit ? 'exploit' : 'clean',
    exploit
      ? 'Refine Metals consumed sealed iron or minted metals from it.'
      : 'Refine Metals refuses when the only iron in the hold is sealed mission cargo.',
    {
      traces: [{
        name: 'refine_sealed_iron',
        seed,
        commands: ['plant 3 sealed iron', 'add 1 titanium', 'crafting.build bp_refine_metals'],
        sellable,
        built: built.ok,
        ironLeft,
        metals,
      }],
    },
  );
}

function probeShipping(seed) {
  const sim = bootRedTeam(seed);
  econOf(sim).ensureMarket(HOME_STATION);
  const payload = {
    stationId: HOME_STATION,
    commodityId: IRON,
    qty: 5,
    missionId: `ert-freight-${seed}`,
    receiptId: `ert-freight-${seed}`,
  };
  const moved = freightDelivery(sim, payload);
  const firstDelta = (moved.detail.mid ?? 0) - (moved.detail.before ?? 0);
  const secondDelta = (moved.detail.after ?? 0) - (moved.detail.mid ?? 0);
  const verdict = replayVerdict({ firstDelta, secondDelta });
  const playerCancel = { unavailable: true, reason: 'no_player_shipping_cancel_verb' };
  return family(
    'shipping_cancellation',
    verdict.exploit ? 'exploit' : 'clean',
    verdict.exploit
      ? 'Replaying one freight receipt moved station stock twice.'
      : 'There is no player shipping-cancel verb. Replaying one cargo:delivered receipt does not move stock twice.',
    {
      traces: [{
        name: 'freight_replay',
        seed,
        commands: ['economy freight receipt', 'same receipt again'],
        firstDelta,
        secondDelta,
        duplicate: moved.detail.second && moved.detail.second.duplicate === true,
        playerCancel,
      }],
      detail: { verdict: verdict.kind },
    },
  );
}

function probeSave(seed) {
  const sim = bootRedTeam(seed);
  const cycle = roundTrip(sim, 5);
  const saved = saveRoundtrip(sim);
  const econ = econOf(sim);
  const intent = econ.execute(HOME_STATION, IRON, 'buy', 2, { intentId: `ert-intent-${seed}` });
  const replay = econ.execute(HOME_STATION, IRON, 'buy', 2, { intentId: `ert-intent-${seed}` });
  const exploit = saved.creditsDelta !== 0 || (replay && replay.duplicate !== true && replay.ok === true && intent.ok === true);
  return family(
    'save_load_first_grant',
    exploit ? 'exploit' : 'clean',
    exploit
      ? 'Serialize/load or an intent replay created credits or a second fill.'
      : 'Economy serialize/load keeps the wallet. A repeated trade intent returns the first receipt.',
    {
      traces: [{
        name: 'save_and_intent',
        seed,
        commands: ['ui buy/sell 5', 'economy.serialize/deserialize', 'save:loaded', 'execute intent twice'],
        saveDelta: saved.creditsDelta,
        intentOk: intent && intent.ok,
        replayDuplicate: replay && replay.duplicate === true,
        roundTripDelta: cycle.creditsDelta,
      }],
      controls: [
        { name: 'save_preserves_credits', pass: saved.creditsDelta === 0 },
        { name: 'intent_replay_is_duplicate', pass: replay && replay.duplicate === true },
      ],
    },
  );
}

function probeOverflow(seed) {
  const sim = bootRedTeam(seed);
  const negative = badQty(sim, IRON, -5);
  const nan = badQty(sim, IRON, Number.NaN);
  const zero = badQty(sim, IRON, 0);
  const huge = buy(sim, IRON, 1_000_000_000);
  const stock = stockQty(sim.state, HOME_STATION, IRON);
  const floor = stockFloorVerdict(stock);
  const refused = negative.ok === true && nan.ok === true && zero.ok === true;
  const exploit = !refused || floor.exploit || !Number.isFinite(sim.state.player.credits);
  return family(
    'negative_price_overflow',
    exploit ? 'exploit' : 'clean',
    exploit
      ? 'A malformed quantity or a huge buy broke the book or the wallet.'
      : 'Negative, NaN, and zero quantities are refused. A huge buy clamps to the book and stays finite.',
    {
      traces: [{
        name: 'malformed_qty',
        seed,
        commands: ['execute buy -5', 'execute buy NaN', 'execute buy 0', 'ui:buy 1e9'],
        negative: negative.reason,
        nan: nan.reason,
        zero: zero.reason,
        hugeOk: huge.ok,
        stock,
        credits: sim.state.player.credits,
      }],
    },
  );
}

function collectBurst(sim) {
  leaveDock(sim);
  const stepped = stepTicks(sim, 48);
  return { stepped, bay: bayQty(sim.state) };
}

function probeContraband(seed) {
  const sim = bootRedTeam(seed);
  const legalDrop = lootDrop(sim, { commodityId: IRON, qty: 4, source: 'kill_burst' });
  collectBurst(sim);
  const legalBay = bayQty(sim.state, IRON);
  const legalDock = dock(sim, HOME_STATION);
  const legalVerdict = bayCashVerdict({
    creditsDelta: legalDock.creditsDelta,
    legality: 'legal',
    fineDelta: 0,
  });

  const illicitSim = bootRedTeam(seed + 3);
  const drop = lootDrop(illicitSim, { commodityId: 'cmdty_stolen_goods', qty: 4, source: 'kill_burst' });
  const collected = collectBurst(illicitSim);
  const inBay = bayQty(illicitSim.state, 'cmdty_stolen_goods');
  const cashed = dock(illicitSim, HOME_STATION);
  const fine = (cashed.detail.reasons || []).some((reason) => String(reason).startsWith('fine:'));
  const illicitVerdict = bayCashVerdict({
    creditsDelta: cashed.creditsDelta,
    legality: 'contraband',
    fineDelta: fine ? -1 : 0,
  });
  const again = dock(illicitSim, HOME_STATION);
  const bayLeft = bayQty(illicitSim.state, 'cmdty_stolen_goods');

  const holdSim = bootRedTeam(seed + 4);
  holdSim.state.player.cargo.items.cmdty_stolen_goods = 2;
  holdSim.state.player.cargo.usedVolume = 2;
  const customs = dock(holdSim, 'station_customs');
  const holdLeft = holdQty(holdSim.state, 'cmdty_stolen_goods');
  const holdFined = customs.creditsDelta < 0 && holdLeft === 0;

  const collectedIllicit = drop.ok === true && inBay > 0;
  const exploit = collectedIllicit && illicitVerdict.exploit === true;
  const status = !drop.ok || !collectedIllicit
    ? 'unavailable'
    : (exploit ? 'exploit' : 'clean');
  return family(
    'contraband_relabel',
    status,
    exploit
      ? 'Kill-burst stolen goods land in the salvage bay and dock at Helios as clean scrap credits. The same goods in the hold are fined at Customs Gate.'
      : (status === 'unavailable'
        ? 'Kill-burst stolen goods never reached the salvage bay, so the cash-in path was not exercised.'
        : 'Illicit kill loot was not converted into unpaid credits.'),
    {
      traces: [{
        name: 'bay_stolen_goods',
        seed: seed + 3,
        commands: [
          'undock',
          'loot:drop kill_burst cmdty_stolen_goods 4',
          'step 48',
          'dock:docked station_helios',
          'dock:docked station_helios again',
        ],
        spawned: drop.ok,
        inBay,
        creditsDelta: cashed.creditsDelta,
        reasons: cashed.detail && cashed.detail.reasons,
        secondDockDelta: again.creditsDelta,
        bayLeft,
        collectedTicks: collected.stepped.detail && collected.stepped.detail.ticks,
      }],
      controls: [
        {
          name: 'legal_scrap_is_allowed',
          pass: legalDrop.ok === true && legalBay > 0 && legalDock.creditsDelta > 0 && legalVerdict.exploit !== true,
          creditsDelta: legalDock.creditsDelta,
          legalBay,
        },
        {
          name: 'hold_contraband_is_fined',
          pass: holdFined,
          creditsDelta: customs.creditsDelta,
          holdLeft,
        },
        {
          name: 'second_dock_does_not_pay',
          pass: again.creditsDelta <= 0,
          creditsDelta: again.creditsDelta,
        },
      ],
      detail: { illicitVerdict: illicitVerdict.kind, legalVerdict: legalVerdict.kind },
    },
  );
}

function probeShipFit(seed) {
  const sim = bootRedTeam(seed);
  const eventSell = sellShipEvent(sim, 1);
  const purchased = buyShip(sim, 'ship_kestrel');
  const owned = (sim.state.player.ownedShips || []).length;
  let latent = null;
  if (purchased.ok && owned > 1) {
    const before = sim.state.player.credits;
    const method = sim.registry.get('ships').sellShip(owned - 1, { confirmedCargoUnits: 0 });
    latent = {
      methodOk: method === true,
      creditsDelta: sim.state.player.credits - before,
      note: 'ships.sellShip is not bound to ui:sellShip. This call is a writer diagnostic, not a player event.',
    };
  }
  const fit = probeCustody(seed + 9);
  const exploit = fit.status === 'exploit';
  return family(
    'ship_fit_capacity',
    exploit ? 'exploit' : 'clean',
    exploit
      ? 'A hull or fit change duplicated cargo.'
      : 'Hull swaps conserve cargo. ui:sellShip has no listener, so a zero-price Hitch cannot be sold for buyback from the station screen.',
    {
      traces: [
        {
          name: 'ui_sell_ship',
          seed,
          commands: ['ui:sellShip index 1', 'ui:buyShip ship_kestrel'],
          sell: eventSell,
          buy: { ok: purchased.ok, creditsDelta: purchased.creditsDelta },
          latent,
        },
        ...fit.traces,
      ],
      controls: [
        { name: 'ui_sell_ship_unwired', pass: eventSell.unavailable === true, reason: eventSell.reason },
      ],
      detail: { latent, fit: fit.detail },
    },
  );
}

const PROBES = [
  probeWash,
  probeUnderflow,
  probeCustody,
  probeDelivery,
  probeAbandon,
  probeTimeSkip,
  probeRefinery,
  probeShipping,
  probeSave,
  probeOverflow,
  probeContraband,
  probeShipFit,
];

export function probeFamilies(seed = 1845) {
  const results = PROBES.map((probe) => probe(seed));
  const byId = Object.fromEntries(results.map((row) => [row.id, row]));
  for (const id of FAMILY_IDS) {
    if (!byId[id]) throw new Error(`missing family probe ${id}`);
  }
  return results;
}
