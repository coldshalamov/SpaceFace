// INF-econ (WF-06) — a site courier pod's handoff is a real delivery, not a teleport.
//
// Found by looking, seed 4242: _sealPodOutcome priced a pod at the destination's live sell
// price and minted the gross through the automation cap while the destination market never
// received a unit — stock unmoved, price unmoved, and any open feedstock bid on that leg
// (NXB-043's world) standing against a shortage the pods claimed to be relieving. Money
// appeared from nowhere; the market board and the site ledger disagreed about the same goods.
//
// The fix: on a committed (non-duplicate) seal the pod's goods land in the destination market
// through the canonical freight fact (cargo:delivered → economy.applyFreightDelivery), so:
//   1. the stock the sale claims to sell actually arrives, and the NEXT pod prices against the
//      market this one fed (real supply feedback — sustained output moves the price it sells at);
//   2. pod freight lifts a starving industry leg across the threshold exactly like a player
//      haul — economy:shortageRelieved fires and the contract board's bid for that leg retires
//      with the shortage it quoted (the site chain and the contract chain now share one fact);
//   3. the payout path is untouched: same pre-intake quote × podSalvageMult gross, same
//      automation creditPassive cap, single settlement per pod receipt;
//   4. counterexamples stay honest: a lost pod lands nothing, a pod with no destination lands
//      nothing, and a duplicate seal re-lands nothing.
//
// Fixed seed 4242 throughout. Belt Outpost (station_beltout) sees Ceres Refinery
// (station_ceres, refinery tier 1 — recipe_refine_iron is a tier-1 leg, a real consumer of
// cmdty_ore_iron and a real market for cmdty_silicate, the site extractor's output).
import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation } from '../src/core/sim.js';
import { economy, starvedIndustryNeedFor } from '../src/systems/economy.js';
import { economyContracts } from '../src/systems/economyContracts.js';
import { missions } from '../src/systems/missions.js';
import { asteroidSites, makeSiteRecord } from '../src/systems/asteroidSites.js';
import { ensureShipment, addToShipment, shipmentQty } from '../src/systems/cargoCustody.js';
import { SITE_BALANCE } from '../src/data/sites.js';
import { COMMODITIES } from '../src/data/commodities.js';

const SEED = 4242;
const CMDTY_BY_ID = new Map(COMMODITIES.map((c) => [c.id, c]));
const BROKER = 'station_beltout';
const YARD = 'station_ceres';
const ORE = 'cmdty_ore_iron';      // the yard's live refine_iron feedstock leg
const SIL = 'cmdty_silicate';      // the site extractor's flagship output (market-traded, no recipe)

function boot({ withBoard = false } = {}) {
  const systems = withBoard ? [economy, missions, economyContracts] : [economy];
  const sim = createSimulation({ seed: SEED, systems });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.simTime = 30; // epoch 0
  state.onboarding = { active: false, finished: true };
  state.player.cargo = { items: {}, usedVolume: 0, usedMass: 0, capVolume: 90, capMass: 90 };

  const econ = sim.registry.get('economy');
  const market = econ.ensureMarket(YARD);
  const passive = [];
  const events = [];
  bus.on('cargo:delivered', (p) => events.push({ name: 'cargo:delivered', payload: p }));
  bus.on('economy:shortageRelieved', (p) => events.push({ name: 'economy:shortageRelieved', payload: p }));
  bus.on('economy:grantCredits', (p) => events.push({ name: 'economy:grantCredits', payload: p }));

  const siteSys = Object.create(asteroidSites);
  siteSys.init({
    state, bus,
    helpers: {},
    registry: {
      get(name) {
        if (name === 'economy') return econ;
        if (name === 'automation') {
          return { creditPassive(gross, source) {
            const credited = gross; // unsaturated cap: credits equal gross, path is still creditPassive
            passive.push({ gross, source, credited });
            return credited;
          } };
        }
        return null;
      },
    },
  });

  const site = makeSiteRecord({
    id: 'site_inf_econ', asteroidId: 4242, sectorId: 'sec_core_alpha', fieldId: 'f1', createdT: 0,
  });
  if (!state.sites || typeof state.sites !== 'object') state.sites = {};
  if (!state.sites.records) state.sites.records = {};
  state.sites.records[site.id] = site;
  return { sim, state, bus, econ, market, siteSys, site, passive, events };
}

function starveLeg(market, cmdtyId, fill = 0.1, baseEq = 120) {
  market[cmdtyId].baseEq = baseEq;
  market[cmdtyId].stock = baseEq * fill;
}

/** A committed mixed pod of `cargo` inbound to YARD, sealed now. */
function sealPod({ siteSys, site, state, cargo, stationId = YARD, lost = false }) {
  const launches = (site.fleet.launches || 0) + 1;
  site.fleet.launches = launches;
  const units = Object.values(cargo).reduce((s, q) => s + q, 0);
  const pod = {
    launchT: state.simTime - 60, arriveT: state.simTime,
    cargo, lost,
    stationId,
    stationName: stationId || 'the freight lane',
    intentId: `site-sale:${site.id}:${launches}`,
    worldRecordId: `site:${site.id}:pod:${launches}`,
  };
  ensureShipment(site);
  addToShipment(site, '_pod', units, 9999);
  const sealed = siteSys._sealPodOutcome(site, pod);
  return { pod, sealed, units };
}

function starvedRows(board) {
  return ((board && board.slots) || []).filter((o) => o
    && o.source === 'economyContract'
    && o.cause && o.cause.tag === 'industry_starved');
}

/** The market's own quote refresh (what a tick or a trade runs), then read the sell price. */
function quotedSell(econ, market, stationId, cmdtyId) {
  econ.recomputeLivePrices(market[cmdtyId], CMDTY_BY_ID.get(cmdtyId), stationId, cmdtyId);
  return econ.priceOf(stationId, cmdtyId, 'sell');
}

// ── 1. The handoff lands the goods it sold ──────────────────────────────────────────────────

test('a sealed pod lands its goods in the market it sold to; the next quote prices the intake', () => {
  const h = boot();
  const { econ, market, siteSys, site, passive } = h;
  starveLeg(market, ORE, 0.1);
  market[SIL].stock = 30;

  // Quote the market AT its starved state (the same refresh a tick or trade runs) — the
  // pre-intake quotes the pod's sale is priced against.
  const ironPriceBefore = quotedSell(econ, market, YARD, ORE);
  const silPriceBefore = quotedSell(econ, market, YARD, SIL);
  const ironBefore = market[ORE].stock;
  const silBefore = market[SIL].stock;

  const { sealed } = sealPod({ siteSys, site, state: h.state, cargo: { [ORE]: 30, [SIL]: 10 } });
  assert.equal(sealed && sealed.ok, true, 'the seal settles');

  // Every unit physically arrived — the sale's own destination now holds the goods.
  assert.equal(market[ORE].stock, ironBefore + 30, 'the ore landed unit for unit');
  assert.equal(market[SIL].stock, silBefore + 10, 'the silicate landed unit for unit');
  assert.equal(shipmentQty(site, '_pod'), 0, 'pod custody was debited by the same seal');

  // Real supply feedback: the quote the NEXT pod reads has moved against the seller.
  assert.ok(quotedSell(econ, market, YARD, ORE) < ironPriceBefore,
    'selling 30u of ore moves the ore price down');
  assert.ok(quotedSell(econ, market, YARD, SIL) < silPriceBefore,
    'selling 10u of silicate moves the silicate price down');

  // Payout unchanged: gross = pre-intake quote × podSalvageMult, settled through creditPassive.
  const rawGross = 30 * ironPriceBefore + 10 * silPriceBefore;
  const expectedGross = Math.round(rawGross * SITE_BALANCE.podSalvageMult);
  assert.equal(sealed.receipt.realisedTotal, expectedGross,
    'the sale still settles at the pre-intake quote times the salvage multiplier');
  assert.equal(passive.length, 1, 'credits still flow only through automation.creditPassive');
  assert.equal(passive[0].source, 'site:courier');
  assert.equal(passive[0].gross, expectedGross);
  assert.equal(site.stats.creditedCr, expectedGross);

  // One canonical freight fact per good, stably receipted off the pod's intent.
  const delivered = h.events.filter((e) => e.name === 'cargo:delivered');
  assert.equal(delivered.length, 2, 'one cargo:delivered per good in the pod');
  for (const fact of delivered) {
    assert.equal(fact.payload.stationId, YARD);
    assert.match(fact.payload.receiptId, /^site-sale:site_inf_econ:1:/,
      'the freight receipt derives from the pod launch intent');
  }
});

// ── 2. Pod freight relieves the real shortage the contract board quoted ─────────────────────

test('pod freight lifts a starving leg across the threshold and retires the board bid for it', () => {
  const h = boot({ withBoard: true });
  const { state, bus, econ, market, siteSys, site } = h;
  starveLeg(market, ORE, 0.1);
  const missionsSys = h.sim.registry.get('missions');

  // The demand leg of the chain: the broker posts the yard's real starvation (NXB-043 world).
  bus.emit('dock:docked', { stationId: BROKER });
  const bid = starvedRows(state.missions.boards[BROKER])
    .find((o) => o.destStationId === YARD && o.params.cmdtyId === ORE);
  assert.ok(bid, 'the starving yard posts a real relief bid for its iron leg');

  // The site's answer: its pod freight lands at the same yard through the same freight fact.
  const deficit = starvedIndustryNeedFor('refinery', 1, market);
  assert.ok(deficit && deficit.inputId === ORE, 'the yard starves for iron before the pod');
  const podLoad = Math.min(40, deficit.deficitUnits + 4); // cross the threshold, plus a little
  sealPod({ siteSys, site, state, cargo: { [ORE]: podLoad } });

  const after = starvedIndustryNeedFor('refinery', 1, market);
  assert.equal(after, null, 'pod freight fed the real hopper — the leg is no longer starving');
  const relieved = h.events.filter((e) => e.name === 'economy:shortageRelieved');
  assert.equal(relieved.length, 1, 'the canonical relief cue fired exactly once for the leg');
  assert.equal(relieved[0].payload.commodityId, ORE);
  assert.equal(relieved[0].payload.stationId, YARD);
  assert.equal(relieved[0].payload.qty, podLoad);

  // The board follows the same fact a player haul satisfies: the bid retires with its shortage.
  missionsSys.ensureBoard(BROKER);
  assert.equal(starvedRows(state.missions.boards[BROKER]).length, 0,
    'the relief bid comes down — the shortage it quoted is actually gone');

  // A fresh epoch re-plans against live needs and posts nothing: no phantom demand remains.
  state.simTime += 700;
  missionsSys.ensureBoard(BROKER);
  bus.emit('dock:docked', { stationId: BROKER });
  assert.equal(starvedRows(state.missions.boards[BROKER]).filter((o) => o.params.cmdtyId === ORE).length, 0,
    'the next epoch does not re-post a bid for the leg the pods are feeding');
  assert.ok(econ.priceOf(YARD, ORE, 'sell') > 0, 'the market stays sane after the intake');
});

// ── 3. Counterexamples: the intake is exactly as honest as the sale ─────────────────────────

test('a lost pod, a destination-less pod, and a duplicate seal each land nothing extra', () => {
  const h = boot();
  const { market, siteSys, site, state } = h;
  starveLeg(market, ORE, 0.1);
  const ironBefore = market[ORE].stock;
  const silBefore = market[SIL].stock;

  // Lost pods never reach the market — the goods are gone, nothing lands, nothing credits.
  const lostPod = sealPod({ siteSys, site, state, cargo: { [ORE]: 30 }, lost: true });
  assert.equal(lostPod.sealed.receipt.realisedTotal, 0, 'a lost pod banks nothing');
  assert.equal(market[ORE].stock, ironBefore, 'a lost pod lands nothing');

  // No destination ("sold to the freight lane") has no market to feed.
  const lanePod = sealPod({ siteSys, site, state, cargo: { [SIL]: 10 }, stationId: null });
  assert.equal(lanePod.sealed.ok, true, 'the lane sale still settles');
  assert.equal(market[SIL].stock, silBefore, 'a destination-less pod lands nothing');

  // A duplicate seal of an already-settled pod is a no-op: same receipt, no second intake.
  const settledBefore = h.passive.length;
  const { pod, sealed } = sealPod({ siteSys, site, state, cargo: { [ORE]: 20 } });
  assert.equal(sealed.ok, true, 'first seal settles');
  assert.equal(h.passive.length, settledBefore + 1, 'one credited settlement for the pod');
  const afterFirst = market[ORE].stock;
  const resealed = siteSys._sealPodOutcome(site, pod);
  assert.equal(resealed.duplicate, true, 'the retry is recognised as the same settlement');
  assert.equal(market[ORE].stock, afterFirst, 'the duplicate lands nothing');
  assert.equal(shipmentQty(site, '_pod'), 0, 'custody stays settled');
  assert.equal(h.passive.length, settledBefore + 1,
    'the duplicate credits nothing — one settlement per pod receipt');
});
