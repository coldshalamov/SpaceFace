// Twelve exploit-family probes. Lots and credits move only through public writers.
// A missing verb is unavailable. Confirmed loops keep a minimized command list.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cashInSalvage, sellableCargoQuantity } from '../../src/systems/cargo.js';
import { quote } from '../../src/systems/economy.js';
import {
  HOME_FACTION,
  HOME_STATION,
  IRON,
  bayQty,
  bootRedTeam,
  captureLedger,
  custodyUnits,
  holdQty,
  listenCredits,
  repOf,
  stockQty,
} from './runtime.mjs';
import {
  abandonMission,
  acceptMission,
  acceptSealedOffer,
  badQty,
  buy,
  buyModule,
  buyShip,
  completeFactionMissions,
  craft,
  dock,
  firstBoardOffer,
  fitModule,
  freightDelivery,
  leaveDock,
  lootDrop,
  offlineCatchup,
  runKillRecipe,
  saveContinue,
  sell,
  sellShipEvent,
  service,
  setActiveShip,
  shipLoss,
  sourceFit,
  stepTicks,
  tow,
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

export const CONTRABAND_ARTIFACT = new URL('../../.devshots/economic-redteam/contraband-minimized.json', import.meta.url);

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

function fund(sim) {
  return service(sim, 'loan');
}

const CREDIT_PATH = 'economy.quote -> economy.execute trade:buy/trade:sell';

function roundTrip(sim, qty) {
  const before = captureLedger(sim);
  const stationId = before.stationId || HOME_STATION;
  const buyQuote = quote(stationId, IRON, 'buy', qty);
  const ear = listenCredits(sim.bus);
  const bought = buy(sim, IRON, qty);
  const gained = holdQty(sim.state, IRON) - (Number(before.cargo[IRON]) || 0);
  const sellQuote = gained > 0 ? quote(stationId, IRON, 'sell', gained) : null;
  const sold = gained > 0 ? sell(sim, IRON, gained) : null;
  ear.stop();
  const after = captureLedger(sim);
  const creditsDelta = after.credits - before.credits;
  const stockDelta = (after.stock ?? 0) - (before.stock ?? 0);
  const cargoDelta = (Number(after.cargo[IRON]) || 0) - (Number(before.cargo[IRON]) || 0);
  const verdict = closedWashVerdict({ creditsDelta, stockDelta, cargoDelta });
  return {
    qty,
    rep: repOf(sim.state),
    before,
    after,
    credits: ear.rows.slice(),
    bought,
    sold,
    creditsDelta,
    stockDelta,
    cargoDelta,
    verdict,
    buyQuote,
    sellQuote,
    quoteNet: (sellQuote && sellQuote.ok ? Number(sellQuote.total) || 0 : 0)
      - (buyQuote && buyQuote.ok ? Number(buyQuote.total) || 0 : 0),
    reachesCreditPrint: ((sellQuote && sellQuote.ok ? Number(sellQuote.total) || 0 : 0)
      - (buyQuote && buyQuote.ok ? Number(buyQuote.total) || 0 : 0)) > 0,
    creditPath: CREDIT_PATH,
  };
}

function minimizeQty(sim, maxQty) {
  let lo = 1;
  let hi = maxQty;
  let best = null;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (sim.state.player.credits < 3000) fund(sim);
    const cycle = roundTrip(sim, mid);
    if (cycle.bought.ok && cycle.verdict.exploit) {
      best = cycle;
      hi = mid - 1;
    } else {
      lo = mid + 1;
    }
  }
  return best;
}

function ledgerTrace(name, seed, commands, cycle) {
  return {
    name,
    seed,
    commands,
    creditsDelta: cycle ? cycle.creditsDelta : null,
    stockDelta: cycle ? cycle.stockDelta : null,
    cargoDelta: cycle ? cycle.cargoDelta : null,
    before: cycle ? cycle.before : null,
    after: cycle ? cycle.after : null,
    credits: cycle ? cycle.credits : null,
    rep: cycle ? cycle.rep : null,
    qty: cycle ? cycle.qty : null,
  };
}

function probeWash(seed) {
  const sim = bootRedTeam(seed);
  fund(sim);
  const neutral = roundTrip(sim, 5);
  let steps = 0;
  let first = null;
  let stop = null;
  while (steps < 80 && !first) {
    steps += 1;
    if (sim.state.player.credits < 1500) fund(sim);
    const cycle = roundTrip(sim, 8);
    if (!cycle.bought.ok) {
      stop = cycle.bought.reason;
      break;
    }
    if (cycle.verdict.exploit) first = { step: steps, cycle };
  }

  const allied = bootRedTeam(seed + 1);
  const earned = completeFactionMissions(allied, HOME_FACTION);
  if (allied.state.player.credits < 2500) fund(allied);
  const opened = roundTrip(allied, 10);
  const minimal = opened.bought.ok && opened.verdict.exploit ? minimizeQty(allied, 10) : opened;
  const exploit = !!(minimal && minimal.bought && minimal.bought.ok && minimal.verdict.exploit);
  return family(
    'zero_spread_trade_cycles',
    exploit ? 'exploit' : 'tested-not-broken',
    exploit
      ? 'Completed faction missions left standing high enough that a closed iron round trip printed credits.'
      : 'Completed Helios faction missions, then closed an iron round trip. Injected faction:repDelta is not treated as a confirmed exploit. The trip did not print credits.',
    {
      traces: [
        {
          ...ledgerTrace('neutral_rep', seed, ['ui:service loan', 'ui:buy iron 5', 'ui:sell iron 5'], neutral),
          verdict: neutral.verdict.kind,
        },
        {
          name: 'natural_climb',
          seed,
          commands: ['ui:service loan as the wallet allows', 'repeat ui:buy/ui:sell iron'],
          creditsDelta: first ? first.cycle.creditsDelta : null,
          rep: first ? first.cycle.rep : repOf(sim.state),
          steps: first ? first.step : null,
          stop,
        },
        minimal && minimal.bought ? {
          ...ledgerTrace('allied_minimized', seed + 1, [
            `mission:completed ${HOME_FACTION} x ${earned.completed}`,
            'ui:service loan',
            `ui:buy ${IRON} ${minimal.qty}`,
            `ui:sell ${IRON} ${minimal.qty}`,
          ], minimal),
          missionCompletions: earned.completed,
          repBefore: earned.repBefore,
          repAfter: earned.repAfter,
          repFromWriter: earned.repFromWriter,
          alliedBand: earned.alliedBand,
          buyTotal: minimal.buyQuote && minimal.buyQuote.total,
          sellTotal: minimal.sellQuote && minimal.sellQuote.total,
          quoteNet: minimal.quoteNet,
          reachesCreditPrint: minimal.reachesCreditPrint === true,
          creditPath: minimal.creditPath,
        } : {
          name: 'allied_minimized',
          seed: seed + 1,
          commands: [`mission:completed ${HOME_FACTION} x ${earned.completed}`],
          creditsDelta: 0,
          missionCompletions: earned.completed,
          repBefore: earned.repBefore,
          repAfter: earned.repAfter,
        },
      ].filter(Boolean),
      controls: [{
        name: 'neutral_standing_is_not_a_wash',
        pass: neutral.verdict.exploit !== true && neutral.creditsDelta <= 0,
        creditsDelta: neutral.creditsDelta,
      }, {
        name: 'standing_came_from_mission_completion',
        pass: earned.completed > 0 && earned.repAfter > earned.repBefore,
        completed: earned.completed,
        repAfter: earned.repAfter,
      }],
    },
  );
}

function probeUnderflow(seed) {
  const sim = bootRedTeam(seed);
  fund(sim);
  const before = stockQty(sim.state, HOME_STATION, IRON);
  const bought = buy(sim, IRON, 1_000_000);
  const after = stockQty(sim.state, HOME_STATION, IRON);
  const verdict = stockFloorVerdict(after);
  return family(
    'station_stock_underflow',
    verdict.exploit ? 'exploit' : 'clean',
    verdict.exploit
      ? `Helios iron stock left the legal floor (${after}).`
      : 'A max buy, funded by the loan writer, leaves at least 1 unit on the book.',
    {
      traces: [{
        name: 'max_buy',
        seed,
        commands: ['ui:service loan', `ui:buy ${IRON} 1000000`],
        stockBefore: before,
        stockAfter: after,
        bought: bought.ok,
        reason: bought.reason,
      }],
    },
  );
}

function probeCustody(seed) {
  const sim = bootRedTeam(seed);
  const purchased = buyShip(sim, 'ship_kestrel');
  leaveDock(sim);
  lootDrop(sim, { commodityId: IRON, qty: 4, source: 'mining' });
  stepTicks(sim, 20);
  dock(sim, HOME_STATION);
  const before = custodyUnits(sim.state);
  const index = Math.max(0, (sim.state.player.ownedShips || []).length - 1);
  const swapped = purchased.ok ? setActiveShip(sim, index) : null;
  if (purchased.ok) setActiveShip(sim, 0);
  const after = custodyUnits(sim.state);
  const verdict = custodyVerdict(before, after);
  return family(
    'custody_duplication',
    verdict.exploit ? 'exploit' : (purchased.ok ? 'clean' : 'unavailable'),
    verdict.exploit
      ? 'Switching hulls duplicated cargo units.'
      : (purchased.ok
        ? 'A free second Hitch from ui:buyShip, then a parked-hold swap, conserves units.'
        : 'ui:buyShip did not add a second hull, so the swap was not available.'),
    {
      traces: [{
        name: 'hull_swap',
        seed,
        commands: ['ui:buyShip ship_kestrel', 'loot:drop mining iron 4', 'step 20', 'ui:setActiveShip'],
        purchased: purchased.ok,
        before,
        after,
        swapped: swapped && swapped.ok,
      }],
      detail: { verdict },
    },
  );
}

function probeDelivery(seed) {
  const sim = bootRedTeam(seed);
  const accepted = acceptSealedOffer(sim);
  if (accepted.unavailable) {
    return family('delivery_and_resale', 'unavailable', 'No live board offer preloads sealed cargo.', {
      traces: [{ name: 'no_sealed_offer', seed, commands: ['ui:acceptMission sealed'], reason: accepted.reason }],
    });
  }
  const commodityId = IRON;
  const active = (sim.state.missions.active || []).slice(-1)[0];
  const cmdty = active && active.params && active.params.cmdtyId;
  const blocked = sell(sim, cmdty || commodityId, 100);
  const credits0 = sim.state.player.credits;
  dock(sim, (active && active.destStationId) || HOME_STATION);
  const paid = sim.state.player.credits - credits0;
  const again0 = sim.state.player.credits;
  dock(sim, (active && active.destStationId) || HOME_STATION);
  const secondPay = sim.state.player.credits - again0;
  const exploit = blocked.ok === true && paid > 0 || secondPay > 0;
  return family(
    'delivery_and_resale',
    exploit ? 'exploit' : 'clean',
    exploit
      ? 'A sealed offer paid a reward and was also sold, or the same dock paid twice.'
      : 'The sealed offer, if it loaded, cannot be sold through and paid twice.',
    {
      traces: [{
        name: 'seal_then_dock',
        seed,
        commands: ['ui:acceptMission sealed offer', 'ui:sell', 'dock destination', 'dock again'],
        accepted: accepted.ok,
        sellBlocked: blocked.ok !== true,
        sellReason: blocked.reason,
        paid,
        secondPay,
        sellable: cmdty ? sellableCargoQuantity(sim.state, cmdty) : null,
      }],
      controls: [
        { name: 'second_dock_does_not_pay', pass: secondPay <= 0, secondPay },
        { name: 'sale_of_seal_refused', pass: blocked.ok !== true, reason: blocked.reason },
      ],
    },
  );
}

function probeAbandon(seed) {
  const sim = bootRedTeam(seed);
  fund(sim);
  const offer = firstBoardOffer(sim);
  if (!offer) {
    return family('abandoned_contract_payout', 'unavailable', 'Helios boarded no payable offer.', {
      traces: [{ name: 'no_offer', seed, commands: ['read station_helios board'] }],
    });
  }
  const accepted = acceptMission(sim, offer.id);
  const activeId = accepted.detail && accepted.detail.activeId;
  const afterAccept = sim.state.player.credits;
  const abandoned = activeId ? abandonMission(sim, activeId) : null;
  const paidReward = abandoned && abandoned.creditsDelta > 0;
  return family(
    'abandoned_contract_payout',
    !accepted.ok ? 'unavailable' : (paidReward ? 'exploit' : 'clean'),
    !accepted.ok
      ? 'The live wallet could not accept a Helios offer.'
      : (paidReward
        ? `Abandoning ${offer.id} paid credits.`
        : 'Abandoning a live Helios offer does not pay its reward.'),
    {
      traces: [{
        name: 'accept_abandon',
        seed,
        commands: [`ui:acceptMission ${offer.id}`, activeId ? `ui:abandonMission ${activeId}` : 'abandon skipped'],
        offer: { id: offer.id, type: offer.type, reward: Number(offer.reward_cr) || 0 },
        acceptDelta: accepted.creditsDelta,
        abandonDelta: abandoned ? abandoned.creditsDelta : null,
        accepted: accepted.ok,
        creditsAfterAccept: afterAccept,
      }],
      controls: [{ name: 'reward_not_paid_on_abandon', pass: !paidReward }],
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
      controls: [{ name: 'second_window_idempotent', pass: (second.detail && second.detail.credited) === 0 }],
    },
  );
}

function probeRefinery(seed) {
  const sim = bootRedTeam(seed);
  const accepted = acceptSealedOffer(sim);
  if (accepted.unavailable || !accepted.ok) {
    return family(
      'sealed_refinery_inputs',
      'unavailable',
      'No preloaded board offer supplied sealed iron, so the refinery was not fed a forged seal.',
      {
        traces: [{
          name: 'no_sealed_offer',
          seed,
          commands: ['ui:acceptMission sealed offer'],
          reason: accepted.reason,
          accepted: accepted.ok,
        }],
      },
    );
  }
  const active = (sim.state.missions.active || []).slice(-1)[0];
  const cmdty = active && active.params && active.params.cmdtyId;
  leaveDock(sim);
  if (cmdty !== 'cmdty_ore_titanium') {
    lootDrop(sim, { commodityId: 'cmdty_ore_titanium', qty: 1, source: 'mining' });
    stepTicks(sim, 20);
  }
  dock(sim, HOME_STATION);
  const sellable = cmdty ? sellableCargoQuantity(sim.state, cmdty) : null;
  const built = craft(sim, 'bp_refine_metals', HOME_STATION);
  const exploit = built.ok === true && cmdty === IRON && (sellable || 0) <= 0;
  return family(
    'sealed_refinery_inputs',
    exploit ? 'exploit' : 'clean',
    exploit
      ? 'Refine Metals consumed a sealed preload.'
      : 'Refine Metals did not mint metals out of a sealed preload alone.',
    {
      traces: [{
        name: 'refine_sealed',
        seed,
        commands: ['ui:acceptMission sealed offer', 'crafting.build bp_refine_metals'],
        cmdty,
        sellable,
        built: built.ok,
      }],
    },
  );
}

function probeShipping(seed) {
  const sim = bootRedTeam(seed);
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
  return family(
    'shipping_cancellation',
    verdict.exploit ? 'exploit' : 'clean',
    verdict.exploit
      ? 'Replaying one freight receipt moved station stock twice.'
      : 'There is no player shipping-cancel verb. Replaying one freight receipt does not move stock twice.',
    {
      traces: [{
        name: 'freight_replay',
        seed,
        commands: ['economy freight receipt', 'same receipt again'],
        firstDelta,
        secondDelta,
        duplicate: moved.detail.second && moved.detail.second.duplicate === true,
        playerCancel: { unavailable: true, reason: 'no_player_shipping_cancel_verb' },
      }],
    },
  );
}

function probeSave(seed) {
  const sim = bootRedTeam(seed);
  fund(sim);
  const funded = captureLedger(sim);
  leaveDock(sim);
  const drop = lootDrop(sim, { commodityId: IRON, qty: 2, source: 'kill_burst' });
  stepTicks(sim, 48);
  const continued = saveContinue(sim, `ert-save-${seed}`);
  const host = continued.sim;
  const docked = dock(host, HOME_STATION);
  const paidOnce = (docked.detail.reasons || []).includes('salvage:bay_sale');
  const again = saveContinue(host, `ert-save-${seed}-after`);
  const second = dock(again.sim, HOME_STATION);
  const paidTwice = (second.detail.reasons || []).includes('salvage:bay_sale');
  const creditsHeld = continued.result.ok && continued.result.detail.after.credits === funded.credits;
  const exploit = paidTwice;
  const unavailable = !continued.result.ok;
  return family(
    'save_load_first_grant',
    unavailable ? 'unavailable' : (exploit ? 'exploit' : 'clean'),
    unavailable
      ? `Save/Continue did not complete (${continued.result.reason}).`
      : (exploit
        ? 'Continue paid the salvage-bay grant a second time.'
        : 'Continue restored the wallet and cargo. The bay grant paid on the first dock after restore and not on the next Continue.'),
    {
      traces: [{
        name: 'continue_bay_grant',
        seed,
        commands: [
          'ui:service loan',
          'loot:drop kill_burst iron 2',
          'step 48',
          'save.save',
          'save.load Continue',
          'dock:docked station_helios',
          'save.save',
          'save.load Continue',
          'dock:docked station_helios',
        ],
        drop: drop.ok,
        saveOk: continued.result.ok,
        saveReason: continued.result.reason,
        before: continued.result.detail && continued.result.detail.before,
        after: continued.result.detail && continued.result.detail.after,
        paidOnce,
        paidTwice,
        creditsHeld,
        firstDockDelta: docked.creditsDelta,
        secondDockDelta: second.creditsDelta,
      }],
      controls: unavailable ? [] : [
        { name: 'continue_restores_wallet', pass: creditsHeld },
        { name: 'second_continue_does_not_pay_the_grant', pass: !paidTwice },
      ],
    },
  );
}

function probeOverflow(seed) {
  const sim = bootRedTeam(seed);
  const negative = badQty(sim, IRON, -5);
  const nan = badQty(sim, IRON, Number.NaN);
  const zero = badQty(sim, IRON, 0);
  fund(sim);
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
      : 'Negative, NaN, and zero quantities are refused. A huge buy stays finite.',
    {
      traces: [{
        name: 'malformed_qty',
        seed,
        commands: ['execute buy -5', 'execute buy NaN', 'execute buy 0', 'ui:service loan', 'ui:buy 1e9'],
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

function bayPays(seed, qty, ticks) {
  const sim = bootRedTeam(seed);
  leaveDock(sim);
  const drop = lootDrop(sim, { commodityId: 'cmdty_stolen_goods', qty, source: 'kill_burst' });
  if (!drop.ok) return null;
  stepTicks(sim, ticks);
  if (bayQty(sim.state, 'cmdty_stolen_goods') <= 0) return null;
  const cashed = dock(sim, HOME_STATION);
  const reasons = (cashed.detail && cashed.detail.reasons) || [];
  return {
    qty,
    ticks,
    creditsDelta: cashed.creditsDelta,
    reasons,
    inBayBeforeDock: qty,
  };
}

export function minimizeContraband(seed) {
  for (let qty = 1; qty <= 6; qty += 1) {
    let lo = 1;
    let hi = 64;
    let best = null;
    while (lo <= hi) {
      const mid = Math.floor((lo + hi) / 2);
      const hit = bayPays(seed, qty, mid);
      if (hit && hit.reasons.includes('salvage:bay_sale') && hit.creditsDelta > 0) {
        best = hit;
        hi = mid - 1;
      } else {
        lo = mid + 1;
      }
    }
    if (best) return best;
  }
  return null;
}

export function writeContrabandArtifact(minimized, fileUrl = CONTRABAND_ARTIFACT) {
  const commands = minimized && Array.isArray(minimized.commands) ? minimized.commands : (minimized ? [
    'undock',
    `combat:kill recipe ${minimized.recipeId || 'kill-reward'}`,
    `step ${minimized.ticks}`,
    'dock:docked station_helios',
  ] : []);
  const body = {
    family: 'contraband_relabel',
    name: 'bay_stolen_goods',
    minimized: !!minimized,
    commands,
    qty: minimized && minimized.qty,
    ticks: minimized && minimized.ticks,
    creditsDelta: minimized && minimized.creditsDelta,
    reasons: minimized && minimized.reasons,
  };
  const path = fileURLToPath(fileUrl);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(body, null, 2)}\n`);
  return body;
}

function baySnapshot(sim) {
  const items = sim && sim.state && sim.state.player && sim.state.player.salvageBay
    && sim.state.player.salvageBay.items;
  const bay = {};
  if (!items) return bay;
  for (const id of Object.keys(items)) {
    const qty = Math.floor(Number(items[id]) || 0);
    if (qty > 0) bay[id] = qty;
  }
  return bay;
}

function probeContraband(seed) {
  const killed = runKillRecipe(seed + 3);
  const recipeCommodities = killed.commodities || [];
  const unpaid = killed.unpaid || {};
  const illicitInBay = killed.illicit || [];
  const bayShadow = killed.ok && killed.sim && killed.sim.state.player && killed.sim.state.player.salvageBay
    ? structuredClone(killed.sim.state.player.salvageBay) : null;
  const cashPreview = bayShadow
    ? cashInSalvage({
      ...killed.sim.state,
      player: { ...killed.sim.state.player, salvageBay: bayShadow },
    }, { includeIllicit: false })
    : null;
  const cashed = killed.ok ? dock(killed.sim, HOME_STATION) : null;
  const reasons = (cashed && cashed.detail && cashed.detail.reasons) || [];
  const bayAfterDock = killed.ok ? baySnapshot(killed.sim) : {};
  const paidRestricted = illicitInBay.filter((id) => (bayAfterDock[id] || 0) < (unpaid[id] || 0));
  const paidBay = reasons.includes('salvage:bay_sale') && (cashed ? cashed.creditsDelta : 0) > 0;
  const illicitPaid = paidRestricted.length > 0;
  const again = killed.ok ? dock(killed.sim, HOME_STATION) : null;
  const secondDockDelta = again ? again.creditsDelta : null;
  const bayAfterSecondDock = killed.ok ? baySnapshot(killed.sim) : {};
  const legalBay = recipeCommodities.reduce((sum, id) => sum + ((unpaid[id] ? 0 : (killed.bay[id] || 0))), 0);
  const legalVerdict = bayCashVerdict({
    creditsDelta: cashed ? cashed.creditsDelta : 0,
    legality: 'legal',
    fineDelta: 0,
  });
  const commands = [
    'undock',
    `combat:kill ship_drifter recipe ${killed.recipeId || 'none'}`,
    'step 48',
    'dock:docked station_helios',
  ];
  writeContrabandArtifact({
    qty: legalBay,
    ticks: 48,
    creditsDelta: cashed ? cashed.creditsDelta : 0,
    reasons,
    commands,
  });
  const exploit = illicitPaid === true;
  const munitionsStay = (bayAfterSecondDock.cmdty_munitions || 0) > 0
    && bayAfterSecondDock.cmdty_munitions === (unpaid.cmdty_munitions || 0)
    && secondDockDelta === 0;
  return family(
    'contraband_relabel',
    !killed.ok ? 'unavailable' : (exploit ? 'exploit' : 'tested-not-broken'),
    exploit
      ? 'A restricted or contraband hull-recipe line was paid at Helios without a fine.'
      : 'Helios cashed only the legal hull-recipe lines. Restricted munitions stayed in the bay unpaid, and the next dock did not pay them.',
    {
      traces: [{
        name: 'bay_stolen_goods',
        seed: seed + 3,
        commands,
        recipeId: killed.recipeId,
        commodities: recipeCommodities,
        bay: killed.bay,
        unpaid,
        restricted: killed.restricted || [],
        illicit: illicitInBay,
        bayAfterDock,
        bayAfterSecondDock,
        qty: legalBay,
        ticks: 48,
        creditsDelta: cashed ? cashed.creditsDelta : 0,
        reasons,
        secondDockDelta,
        legalCashIn: cashPreview ? { credits: cashPreview.credits, units: cashPreview.units, lots: cashPreview.lots } : null,
        creditPath: 'cashInSalvage legal lines -> economy:grantCredits salvage:bay_sale; restricted lines stay in the bay',
        reachesIllicitPay: illicitPaid === true,
        artifact: '.devshots/economic-redteam/contraband-minimized.json',
      }],
      controls: [
        {
          name: 'legal_scrap_is_allowed',
          pass: killed.ok === true && legalBay > 0 && paidBay && legalVerdict.exploit !== true && illicitPaid !== true,
          creditsDelta: cashed && cashed.creditsDelta,
          legalBay,
        },
        {
          name: 'restricted_munitions_stay_unpaid',
          pass: killed.ok === true && munitionsStay === true && (unpaid.cmdty_munitions || 0) > 0,
          unpaid,
          bayAfterDock,
          bayAfterSecondDock,
          secondDockDelta,
        },
        {
          name: 'recipe_not_a_chosen_kill_burst',
          pass: killed.ok === true && !!killed.recipeId && illicitPaid !== true,
          recipeId: killed.recipeId,
          commodities: recipeCommodities,
        },
        {
          name: 'second_dock_does_not_pay',
          pass: secondDockDelta != null && secondDockDelta <= 0 && munitionsStay === true,
          creditsDelta: secondDockDelta,
        },
      ],
    },
  );
}

function probeShipFit(seed) {
  const sim = bootRedTeam(seed);
  const unitsBefore = custodyUnits(sim.state);
  const capBefore = sim.state.player.cargo.capVolume;
  const bought = buyModule(sim, 'mod_smuggler_hold');
  const fitted = fitModule(sim, 'mod_smuggler_hold');
  const capAfter = sim.state.player.cargo.capVolume;
  const changed = capAfter !== capBefore && fitted.ok === true;
  const verbs = { tow: tow(), sourceFit: sourceFit(), shipLoss: shipLoss(), sellShip: sellShipEvent(sim, 1) };
  return family(
    'ship_fit_capacity',
    changed ? 'clean' : 'unavailable',
    changed
      ? 'A cargo-cap module changed the live hold cap. Unit totals were ledgered across the fit.'
      : 'The live wallet cannot buy a cargo-cap module that fits the Hitch. ui:buyModule and ui:fitModule were attempted. Tow, source-fit, and ship-loss have no player verb.',
    {
      traces: [{
        name: 'fit_cap',
        seed,
        commands: ['ui:buyModule mod_smuggler_hold', 'ui:fitModule mod_smuggler_hold'],
        capBefore,
        capAfter,
        unitsBefore,
        unitsAfter: custodyUnits(sim.state),
        buy: { ok: bought.ok, reason: bought.reason, creditsDelta: bought.creditsDelta },
        fit: fitted.detail,
        unavailableVerbs: {
          tow: verbs.tow.reason,
          source_fit: verbs.sourceFit.reason,
          ship_loss: verbs.shipLoss.reason,
          sell_ship: verbs.sellShip.reason,
        },
      }],
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
