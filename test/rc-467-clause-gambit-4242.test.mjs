// RC-467 — Clause Gambit: one posted job gains ONE named alternative that adds the canonical
// Cargo intact clause. Accepting either version consumes the pair atomically; the premium is
// enforced by the shipped clause observer, paid exactly once by the shipped settlement, itemized in
// the shipped payday popup, and reconstructed from the live base offer at accept so a saved or
// tampered alternative can never invent payment or freight.
//
// Deterministic Node checks only (seed 4242). No browser/Electron/GPU probe is involved.
import test from 'node:test';
import assert from 'node:assert/strict';

import { hash32, mulberry32 } from '../src/core/rng.js';
import { MISSION_TUNING } from '../src/data/missions.js';
import { CONTRACT_CLAUSES, settleContractClauses } from '../src/data/contractClauses.js';
import {
  buildClauseGambitOffer,
  clauseGambitMeta,
  reconstructClauseGambitOffer,
  CLAUSE_GAMBIT_SOURCE,
  contractClausesSystem,
} from '../src/systems/contractClauses.js';
import { missions } from '../src/systems/missions.js';

const SEED = 4242;
const STATION_ID = 'station_tethys';
const DEST_ID = 'station_beltout';
const DEST_SECTOR_ID = 'sector_ceres_belt';
const CMDTY = 'cmdty_salvage_electronics';
const BASE_ID = 'mo_station_tethys_0_3';
const GAMBIT_ID = `${BASE_ID}:gambit:cargo_intact`;
const CANONICAL = CONTRACT_CLAUSES.cargo_intact;

class Bus {
  constructor() {
    this.handlers = new Map();
    this.log = [];
  }
  on(name, fn) {
    const rows = this.handlers.get(name) || [];
    rows.push(fn);
    this.handlers.set(name, rows);
    return () => this.off(name, fn);
  }
  off(name, fn) {
    this.handlers.set(name, (this.handlers.get(name) || []).filter((entry) => entry !== fn));
  }
  emit(name, payload) {
    this.log.push({ name, payload });
    for (const fn of [...(this.handlers.get(name) || [])]) fn(payload);
  }
}

// ── fixtures ──────────────────────────────────────────────────────────────────────────────────

/** An ordinary procedural cargo offer: no `source`, procedural economy terms, no terms attached. */
function gambitBase(overrides = {}) {
  return {
    id: BASE_ID,
    type: 'cargo_delivery',
    stationId: STATION_ID,
    factionId: 'faction_mts',
    reward_cr: 1000,
    time_limit_s: 900,
    duration_s: 900,
    collateral_cr: 150,
    riskTier: 1,
    economyTerms: { rewardCr: 1000, collateralCr: 150, deadlineS: 900, tier: 1 },
    destStationId: DEST_ID,
    destSectorId: DEST_SECTOR_ID,
    distance: 1200,
    params: { cmdtyId: CMDTY, qty: 2, cargoValue: 300, fValue: 1.04, taskTime: 30 },
    title: 'Electronics relief run',
    brief: 'Haul 2u of salvage electronics.',
    summary: 'Ordinary board work.',
    expiresAtEpoch: 4,
    storyTag: null,
    preloadedCargo: true,
    ...overrides,
  };
}

function baseState({ offers = [], active = [], credits = 5000, cargoItems = {}, cargo = {}, config = {} } = {}) {
  const boards = {};
  if (offers.length) {
    boards[offers[0].stationId || STATION_ID] = { refreshEpoch: 0, slots: offers.slice() };
  }
  const items = { ...cargoItems };
  const used = Object.values(items).reduce((sum, qty) => sum + (Number(qty) || 0), 0);
  const state = {
    meta: { seed: SEED, playtimeS: 0 },
    seed: SEED,
    tick: 0,
    simTime: 20,
    mode: 'flight',
    playerId: 1,
    player: {
      credits,
      researchPoints: 0,
      cargo: { items, capVolume: 20, capMass: 20, usedVolume: used, usedMass: used, ...cargo },
      stats: {},
    },
    missions: {
      boards,
      active: active.slice(),
      completedLog: [],
      receipts: [],
      nextId: 1,
      config: { ...JSON.parse(JSON.stringify(MISSION_TUNING)), ...config },
    },
    story: { beatIndex: 0, branch: null, flags: {}, chainProgress: 0 },
    factions: { faction_mts: { rep: 500 } },
    world: { currentSectorId: 'sector_helios_prime', activeSector: { stations: [] } },
    entities: new Map(),
    entityList: [],
    ui: { docked: false, dockedStationId: null, trackedMissionId: null },
    nav: {},
    settings: { gameplay: { tutorialHints: false } },
  };
  // Count draws from the seed-4242 stream: the gambit path must never consume it.
  const rng = mulberry32(SEED);
  state.rngDraws = 0;
  state.rng = () => { state.rngDraws += 1; return rng(); };
  return state;
}

function initWorld(options = {}) {
  const state = baseState(options);
  const bus = new Bus();
  const missionSystem = { ...missions };
  const clauseSystem = { ...contractClausesSystem };
  const helpers = { hash32, mulberry32, voice: { say: () => true } };
  const registry = {
    get: (id) => ((id === 'missions' || id === 'missionsSystem') ? missionSystem : null),
  };
  missionSystem.init({ state, bus, helpers, registry });
  clauseSystem.init({ state, bus, helpers, registry });
  return { state, bus, missionSystem, clauseSystem };
}

const boardSlots = (state, stationId = STATION_ID) => (
  state.missions.boards && state.missions.boards[stationId]
    ? (state.missions.boards[stationId].slots || []) : []
);
const boardIds = (state) => Object.values(state.missions.boards || {})
  .flatMap((board) => (board && Array.isArray(board.slots) ? board.slots : []))
  .map((offer) => offer && offer.id);
const allOffers = (state) => Object.values(state.missions.boards || {})
  .flatMap((board) => (board && Array.isArray(board.slots) ? board.slots : []));
const gambitRows = (state) => allOffers(state).filter((offer) => offer && offer.source === CLAUSE_GAMBIT_SOURCE);
const findOnBoard = (state, id) => allOffers(state).find((offer) => offer && offer.id === id) || null;

const count = (bus, name, predicate = () => true) => (
  bus.log.filter((entry) => entry.name === name && predicate(entry.payload || {})).length
);
const missionGrants = (bus) => bus.log
  .filter((entry) => entry.name === 'economy:grantCredits'
    && /^mission:/.test(String(entry.payload && entry.payload.reason || '')))
  .map((entry) => entry.payload);
const collateralRefunds = (bus) => bus.log
  .filter((entry) => entry.name === 'economy:grantCredits'
    && /^collateral_refund:/.test(String(entry.payload && entry.payload.reason || '')))
  .map((entry) => entry.payload);
const completionPopup = (bus) => bus.log
  .filter((entry) => entry.name === 'comms:popup')
  .map((entry) => entry.payload)
  .find((payload) => payload && typeof payload.note === 'string' && payload.note.startsWith('Paid ')) || null;

/** Accept through the public UI intent seam, the way the Contracts screen does. */
function accept(world, missionId) {
  world.bus.emit('ui:acceptMission', { missionId });
}

function completeDelivery(world) {
  world.bus.emit('dock:docked', { stationId: DEST_ID });
}

// ── 1. generated-board reachability ───────────────────────────────────────────────────────────

const GENERATED_BOARD_STATIONS = [
  'station_tethys', 'station_ceres', 'station_beltout', 'station_forge',
  'station_reach', 'station_sker', 'station_veil', 'station_io_merc',
];

function generateLiveBoards() {
  const world = initWorld({});
  const landed = [];
  for (const stationId of GENERATED_BOARD_STATIONS) {
    const board = world.missionSystem.ensureBoard(stationId);
    if (!board || !Array.isArray(board.slots) || !board.slots.length) continue;
    landed.push(stationId);
    if (gambitRows(world.state).length) break;
  }
  return { ...world, landed };
}

test('a live generated board gains its Clause Gambit alternative automatically', () => {
  const world = generateLiveBoards();
  const rows = gambitRows(world.state);
  assert.ok(rows.length >= 1, `a seed-4242 board posts an alternative (boards: ${world.landed.join(', ')})`);
  assert.equal(rows.length, 1, 'at most one alternative per board');

  const alt = rows[0];
  const meta = clauseGambitMeta(alt);
  assert.equal(alt.source, CLAUSE_GAMBIT_SOURCE);
  assert.equal(meta.version, 1);
  assert.equal(meta.clauseId, 'cargo_intact');
  assert.equal(alt.id, `${meta.baseOfferId}:gambit:cargo_intact`);

  const base = findOnBoard(world.state, meta.baseOfferId);
  assert.ok(base, 'the standard offer is still on the board');
  assert.equal(base.source == null, true, 'the base offer keeps its ordinary procedural shape');
  assert.equal(Array.isArray(base.clauses) ? base.clauses.length : 0, 0);

  // Both choices are visible board data, and the alternative discloses its premium + consequence.
  assert.ok(boardIds(world.state).includes(base.id));
  assert.ok(boardIds(world.state).includes(alt.id));
  const quote = settleContractClauses({ reward_cr: alt.reward_cr, clauses: alt.clauses });
  assert.ok(base.reward_cr > 0, 'a rolled cargo job pays something');
  assert.ok(alt.summary.includes(`${quote.rewardCr.toLocaleString('en-US')} cr`),
    `summary quotes the settled clean payout (${alt.summary})`);
  assert.ok(alt.summary.includes(`${quote.baseRewardCr.toLocaleString('en-US')} cr`),
    'summary names the standard payout it replaces');
  assert.match(alt.summary, /confiscation breaks the contract/);
  assert.equal(alt.reward_cr, base.reward_cr, 'reward_cr stays the BASE payment');
  assert.equal(alt.collateral_cr, base.collateral_cr);
  assert.deepEqual(alt.params.qty, base.params.qty);
  assert.equal(alt.destStationId, base.destStationId);
  assert.equal(alt.duration_s, base.duration_s);
  assert.equal(alt.expiresAtEpoch, base.expiresAtEpoch);
  assert.match(alt.title, /— Cargo intact$/);
});

// ── 2. determinism / idempotence ─────────────────────────────────────────────────────────────

test('two seed-4242 worlds agree, and repeated invalidation or save:loaded never duplicates', () => {
  const a = generateLiveBoards();
  const b = generateLiveBoards();
  assert.deepEqual(
    gambitRows(a.state).map((offer) => JSON.parse(JSON.stringify(offer))),
    gambitRows(b.state).map((offer) => JSON.parse(JSON.stringify(offer))),
    'the same seed builds byte-identical alternatives',
  );

  const before = JSON.stringify(a.state.missions.boards);
  const drawsBefore = a.state.rngDraws;
  for (let i = 0; i < 5; i++) {
    a.bus.emit('mission:updated', { missionId: null });
    a.bus.emit('save:loaded', {});
  }
  assert.equal(gambitRows(a.state).length, 1, 'repeated publication never duplicates the alternative');
  assert.equal(JSON.stringify(a.state.missions.boards), before, 'the boards are untouched by re-sync');
  assert.equal(a.state.rngDraws, drawsBefore, 'no state.rng draw is spent keeping the board in sync');
});

// ── 3. eligibility ───────────────────────────────────────────────────────────────────────────

test('eligibility is a whitelist: authored, trapped, term-carrying and foreign jobs get nothing', () => {
  const ineligible = {
    'helios teaching board': { stationId: 'station_helios' },
    'authored story job': { storyTag: 'campaign47a:B1' },
    'story branch job': { storyBranch: 'patrol' },
    'story contract id': { storyContractId: 'contract_47a_b1' },
    'campaign beat': { campaign47aBeat: 3 },
    'moral trap': { trap: { kind: 'lie', revealAt: 'dock' } },
    'set-piece cause': { cause: { tag: 'setPiece', chainId: 'c1' } },
    'rolled terms already attached': { clauses: [{ conditionId: 'steady_hands', id: 'steady_hands' }] },
    'already a gambit': { params: { cmdtyId: CMDTY, qty: 2, clauseGambit: { version: 1, baseOfferId: 'x', clauseId: 'cargo_intact' } } },
    'malformed existing gambit': { params: { clauseGambit: 'legacy' } },
    'authored set piece source': { source: 'authoredSetPiece' },
    'economy contract source': { source: 'economyContract' },
    'posted board row': { source: 'postedBoardOffer' },
    'poi behavior row': { source: 'poiBehavior' },
    'custody recovery row': { source: 'custodyRecovery' },
    'no procedural economy terms': { economyTerms: undefined },
    'bounty (unsupported type)': { type: 'bounty_hunt' },
    'heist (unsupported type)': { type: 'heist_intercept' },
    'passenger transport': { type: 'passenger_transport' },
    'salvage retrieval': { type: 'salvage_retrieval' },
    'bulk trade': { type: 'bulk_trade' },
    'mission mutation successor': { source: 'missionMutation' },
    'onboarding choice': { source: 'onboardingChoice' },
  };
  for (const [label, overrides] of Object.entries(ineligible)) {
    assert.equal(buildClauseGambitOffer(gambitBase(overrides)), null, `${label} must not gain a gambit`);
  }
  // The one supported smuggler lane is eligible.
  assert.ok(buildClauseGambitOffer(gambitBase({ type: 'smuggling_run' })), 'smuggling_run is eligible');

  // And the live sync posts nothing on a board that only carries authored/Helios work.
  const world = initWorld({ offers: [gambitBase({ stationId: 'station_helios' })] });
  assert.equal(gambitRows(world.state).length, 0, 'the 47-A teaching board gains no gambit');
});

// ── 4. exact quote + purity ─────────────────────────────────────────────────────────────────

test('a 1,000 cr base quotes 1,100 cr clean and leaves its input untouched', () => {
  const base = gambitBase();
  const snapshot = JSON.parse(JSON.stringify(base));
  const alt = buildClauseGambitOffer(base);

  assert.ok(alt, 'the ordinary cargo offer is eligible');
  assert.deepEqual(base, snapshot, 'the builder never mutates the offer it reads');
  assert.notEqual(alt.params, base.params, 'params are a deep-independent copy');

  assert.equal(alt.reward_cr, 1000, 'base payment stays the offer reward');
  assert.equal(alt.collateral_cr, 150);
  assert.equal(alt.duration_s, 900);
  assert.equal(alt.destStationId, DEST_ID);
  assert.equal(alt.destSectorId, DEST_SECTOR_ID);
  assert.equal(alt.expiresAtEpoch, 4);
  assert.equal(alt.params.qty, 2);
  assert.deepEqual(alt.economyTerms, base.economyTerms);

  assert.equal(alt.clauses.length, 1);
  assert.deepEqual(alt.clauses[0], {
    id: CANONICAL.id,
    event: CANONICAL.event,
    label: CANONICAL.label,
    prose: CANONICAL.prose,
    rewardMult: CANONICAL.rewardMult,
  });
  assert.equal(alt.params.clauseGambit.version, 1);
  assert.equal(alt.params.clauseGambit.baseOfferId, BASE_ID);
  assert.equal(alt.params.clauseGambit.clauseId, 'cargo_intact');

  const quote = settleContractClauses({ reward_cr: alt.reward_cr, clauses: alt.clauses });
  assert.equal(quote.baseRewardCr, 1000);
  assert.equal(quote.rewardMult, CANONICAL.rewardMult);
  assert.equal(quote.rewardCr, 1100, 'the shipped settlement applies the premium exactly once');
  assert.deepEqual(quote.honored.map((row) => row.id), ['cargo_intact']);

  assert.equal(alt.title, 'Electronics relief run — Cargo intact');
  assert.equal(alt.summary,
    'Clause Gambit: add Cargo intact. Clean payout 1,100 cr instead of 1,000 cr;'
    + ' customs confiscation breaks the contract.');

  // Deep independence in the other direction too.
  alt.params.qty = 99;
  assert.equal(base.params.qty, 2, 'mutating the alternative cannot reach back into the base');
});

// ── 5. premium acceptance ───────────────────────────────────────────────────────────────────

test('accepting the alternative creates one live premium mission and consumes both rows', () => {
  const world = initWorld({ offers: [gambitBase()] });
  const alt = gambitRows(world.state)[0];
  assert.ok(alt, 'the alternative is posted for the fixture board');

  let idsAtAccepted = null;
  world.bus.on('mission:accepted', () => { idsAtAccepted = boardIds(world.state); });
  accept(world, alt.id);

  assert.deepEqual(idsAtAccepted, [], 'both versions are off the board before mission:accepted listeners run');
  assert.equal(world.state.missions.active.length, 1);
  const mission = world.state.missions.active[0];
  assert.equal(mission.source, CLAUSE_GAMBIT_SOURCE);
  assert.equal(mission.sourceOfferId, GAMBIT_ID);
  assert.equal(mission.reward_cr, 1000, 'the instance keeps the base payment');
  assert.equal(mission.collateral_cr, 150);
  assert.equal(mission.params.qty, 2);
  assert.equal(mission.clauses.length, 1, 'exactly one canonical clause rides the contract');
  assert.equal(mission.clauses[0].id, 'cargo_intact');
  assert.equal(mission.clauses[0].rewardMult, CANONICAL.rewardMult);
  assert.equal(mission.params.clauseGambit.baseOfferId, BASE_ID);
  assert.equal(count(world.bus, 'economy:chargeCredits', (p) => /^collateral:/.test(p.reason || '')), 1);
});

// ── 6. standard acceptance ──────────────────────────────────────────────────────────────────

test('taking the standard version consumes the pair, adds no clause and keeps the base payment', () => {
  const world = initWorld({ offers: [gambitBase()] });
  accept(world, BASE_ID);

  assert.equal(world.state.missions.active.length, 1);
  const mission = world.state.missions.active[0];
  assert.equal(mission.source, null);
  assert.equal(mission.clauses, undefined, 'the ordinary version carries no term');
  assert.equal(mission.reward_cr, 1000);
  assert.equal(gambitRows(world.state).length, 0, 'the alternative is withdrawn with its base');
  assert.equal(boardIds(world.state).includes(BASE_ID), false);

  completeDelivery(world);
  const grants = missionGrants(world.bus);
  assert.equal(grants.length, 1);
  assert.equal(grants[0].amount, 1000, 'the standard payout is untouched by the gambit');
  assert.equal(count(world.bus, 'contract:clauseHonored'), 0);
  assert.equal(completionPopup(world.bus).note, 'Paid 1,000 cr.');
});

// ── 7. duplicate actions ───────────────────────────────────────────────────────────────────

test('re-clicking either consumed id produces no mission, no charge and no cargo load', () => {
  const world = initWorld({ offers: [gambitBase()] });
  const alt = gambitRows(world.state)[0];
  accept(world, alt.id);

  const chargesBefore = count(world.bus, 'economy:chargeCredits');
  const cargoBefore = world.state.player.cargo.items[CMDTY] || 0;
  const activeBefore = world.state.missions.active.length;

  accept(world, alt.id);
  accept(world, BASE_ID);

  assert.equal(world.state.missions.active.length, activeBefore, 'no second mission is minted');
  assert.equal(count(world.bus, 'economy:chargeCredits'), chargesBefore, 'no second deposit is taken');
  assert.equal(world.state.player.cargo.items[CMDTY] || 0, cargoBefore, 'no second cargo load');
  assert.equal(gambitRows(world.state).length, 0);
});

// ── 8. failed acceptance ──────────────────────────────────────────────────────────────────

test('funds, active capacity and an unusable hold all leave both choices intact', () => {
  // (a) not enough credits for the deposit
  const broke = initWorld({ offers: [gambitBase()], credits: 100 });
  accept(broke, GAMBIT_ID);
  assert.equal(broke.state.missions.active.length, 0);
  assert.equal(count(broke.bus, 'economy:chargeCredits'), 0);
  assert.deepEqual(boardIds(broke.state).sort(), [BASE_ID, GAMBIT_ID].sort());

  // (b) active capacity already full
  const busy = initWorld({
    offers: [gambitBase()],
    active: [{ id: 'm_99', type: 'cargo_delivery', status: 'active', stationId: STATION_ID, params: {} }],
    config: { maxActive: 1 },
  });
  accept(busy, GAMBIT_ID);
  assert.equal(busy.state.missions.active.length, 1, 'the existing contract is the only active mission');
  assert.equal(count(busy.bus, 'economy:chargeCredits'), 0);
  assert.deepEqual(boardIds(busy.state).sort(), [BASE_ID, GAMBIT_ID].sort());

  const full = initWorld({ offers: [gambitBase()], cargo: { capVolume: 1, capMass: 1 } });
  accept(full, GAMBIT_ID);
  assert.equal(full.state.missions.active.length, 0);
  assert.equal(count(full.bus, 'economy:chargeCredits'), 0);
  assert.equal(full.state.player.cargo.items[CMDTY], undefined);
  assert.deepEqual(boardIds(full.state).sort(), [BASE_ID, GAMBIT_ID].sort());

  // (c) the hold caches cannot answer (usedVolume is not a number): preflight passes, the sealed
  // manifest cannot land, and the pair is restored where the player saw it.
  const muddled = initWorld({ offers: [gambitBase()], cargo: { usedVolume: Number.NaN } });
  const orderBefore = boardSlots(muddled.state).map((offer) => offer.id);
  accept(muddled, GAMBIT_ID);
  assert.equal(muddled.state.missions.active.length, 0);
  assert.equal(count(muddled.bus, 'economy:chargeCredits'), 0);
  assert.deepEqual(boardSlots(muddled.state).map((offer) => offer.id), orderBefore,
    'both rows come back in their original positions');
  assert.equal(muddled.state.player.cargo.items[CMDTY], undefined, 'no partial cargo load');
});

// ── 9. canonical validation ─────────────────────────────────────────────────────────────────

test('orphaned, expired, unsupported and tampered alternatives cannot invent payment or freight', () => {
  // (a) orphan — the base left the board
  const orphan = initWorld({ offers: [gambitBase()] });
  const orphanAlt = gambitRows(orphan.state)[0];
  orphan.state.missions.boards[STATION_ID].slots = boardSlots(orphan.state)
    .filter((offer) => offer.id !== BASE_ID);
  assert.equal(orphan.missionSystem.acceptMission(orphanAlt.id), false);
  assert.equal(orphan.state.missions.active.length, 0);
  assert.equal(count(orphan.bus, 'economy:chargeCredits'), 0);
  assert.equal(
    count(orphan.bus, 'toast', (p) => /no longer available/.test(p.text || '')), 1,
    'the player is told the terms are gone',
  );
  assert.equal(gambitRows(orphan.state).length, 0, 'the dead row is retired in place');
  // The sync sweep removes an orphan that never got clicked too.
  const swept = initWorld({ offers: [gambitBase()] });
  swept.state.missions.boards[STATION_ID].slots = boardSlots(swept.state)
    .filter((offer) => offer.id !== BASE_ID);
  swept.bus.emit('mission:updated', { missionId: null });
  assert.equal(gambitRows(swept.state).length, 0, 'the orphan sweep clears it on the next board publish');

  // (b) expired base (the alternative itself is still inside its own window)
  const expired = initWorld({ offers: [gambitBase()] });
  const expiredAlt = gambitRows(expired.state)[0];
  const expiredBase = findOnBoard(expired.state, BASE_ID);
  expiredBase.expiresAtEpoch = 0;
  expiredAlt.expiresAtEpoch = 5;
  assert.equal(expired.missionSystem.acceptMission(expiredAlt.id), false);
  assert.equal(expired.state.missions.active.length, 0);
  assert.equal(count(expired.bus, 'economy:chargeCredits'), 0);

  // (c) unsupported metadata version
  const future = initWorld({ offers: [gambitBase()] });
  const futureAlt = gambitRows(future.state)[0];
  futureAlt.params.clauseGambit.version = 2;
  assert.equal(future.missionSystem.acceptMission(futureAlt.id), false);
  assert.equal(future.state.missions.active.length, 0);

  // (d) tampered row — the instance is rebuilt from the live base, not from the saved numbers
  const tampered = initWorld({ offers: [gambitBase()] });
  const tamperedAlt = gambitRows(tampered.state)[0];
  tamperedAlt.reward_cr = 999999;
  tamperedAlt.collateral_cr = 0;
  tamperedAlt.params.qty = 99;
  tamperedAlt.destStationId = 'station_helios';
  tamperedAlt.storyDisposition = 'invented_choice';
  tamperedAlt.clauses[0].rewardMult = 99;
  tamperedAlt.params.clauseGambit.missing = true;
  assert.equal(tampered.missionSystem.acceptMission(tamperedAlt.id), true);
  const mission = tampered.state.missions.active[0];
  assert.equal(mission.reward_cr, 1000, 'the invented reward is discarded');
  assert.equal(mission.params.qty, 2, 'the altered freight is discarded');
  assert.equal(mission.destStationId, DEST_ID, 'the altered destination is discarded');
  assert.equal(mission.clauses[0].rewardMult, CANONICAL.rewardMult);
  assert.equal(count(tampered.bus, 'ui:endgameChoose'), 0, 'saved fields cannot divert acceptance');
  assert.equal(mission.collateral_cr, 150, 'the altered deposit is discarded');
  assert.equal(
    count(tampered.bus, 'economy:chargeCredits', (p) => /^collateral:/.test(p.reason || '')), 1);
  assert.equal(
    count(tampered.bus, 'economy:chargeCredits', (p) => /^collateral:/.test(p.reason || '')
      && p.amount === 150), 1);
});

// ── 10. clean settlement ───────────────────────────────────────────────────────────────────

test('a clean premium run pays 1,100 cr once, returns the 150 cr deposit and itemizes the payday', () => {
  const world = initWorld({ offers: [gambitBase()] });
  const alt = gambitRows(world.state)[0];
  accept(world, alt.id);
  const mission = world.state.missions.active[0];

  completeDelivery(world);

  assert.equal(world.state.missions.active.length, 0);
  assert.equal(count(world.bus, 'mission:completed'), 1);

  const grants = missionGrants(world.bus);
  assert.equal(grants.length, 1, 'exactly one mission payment');
  assert.equal(grants[0].amount, 1100);
  assert.equal(grants[0].reason, `mission:${mission.id}`);

  const refunds = collateralRefunds(world.bus);
  assert.equal(refunds.length, 1, 'exactly one deposit refund');
  assert.equal(refunds[0].amount, 150);

  assert.equal(
    count(world.bus, 'contract:clauseHonored', (p) => p.clauseId === 'cargo_intact'), 1,
    'one clause honor for the clean run',
  );

  const popups = world.bus.log.filter((entry) => entry.name === 'comms:popup');
  assert.equal(popups.length, 1, 'one completion popup');
  assert.equal(popups[0].payload.note,
    'Paid 1,100 cr — base 1,000 cr + Cargo intact 100 cr. Deposit returned: 150 cr.');

  const receipt = world.state.missions.receipts.find((row) => row.missionId === mission.id);
  assert.equal(receipt.outcome, 'completed');
  assert.equal(receipt.rewardCr, 1100);
  assert.equal(receipt.collateralRefundCr, 150);
});

// ── 11. enforcement ───────────────────────────────────────────────────────────────────────

test('a clean scan is fine; a contraband scan fails the contract once and forfeits the deposit once', () => {
  const world = initWorld({ offers: [gambitBase()] });
  const alt = gambitRows(world.state)[0];
  accept(world, alt.id);
  const mission = world.state.missions.active[0];

  world.bus.emit('player:scannedByPatrol', { hasContraband: false, patrolId: 7 });
  assert.equal(world.state.missions.active.length, 1, 'a clean scan does not breach Cargo intact');
  assert.equal(count(world.bus, 'contract:clauseBroken'), 0);

  world.bus.emit('player:scannedByPatrol', { hasContraband: true, patrolId: 7 });
  assert.equal(count(world.bus, 'contract:clauseBroken', (p) => p.clauseId === 'cargo_intact'), 1);
  assert.equal(count(world.bus, 'mission:failed'), 1);
  assert.equal(count(world.bus, 'mission:completed'), 0, 'no success reward on a breach');
  assert.equal(missionGrants(world.bus).length, 0);
  assert.equal(collateralRefunds(world.bus).length, 0, 'the deposit is forfeited, not returned');

  const receipt = world.state.missions.receipts.find((row) => row.missionId === mission.id);
  assert.equal(receipt.outcome, 'failed');
  assert.equal(receipt.reason, 'clause_broken:cargo_intact');
  assert.equal(receipt.collateralLostCr, 150);

  // Shipped restitution behavior: a broken cargo_intact may refile as a follow-up job.
  const successor = world.state.missions.active.find((m) => m && m.mutatedFromMissionId === mission.id);
  assert.ok(successor, 'the existing restitution successor remains live');
  assert.equal(successor.mutationTag, 'restitution');
  assert.equal(successor.collateral_cr, 0, 'the successor cannot charge the forfeited deposit again');

  // A duplicate scan cannot settle the same contract twice.
  world.bus.emit('player:scannedByPatrol', { hasContraband: true, patrolId: 7 });
  assert.equal(count(world.bus, 'mission:failed'), 1);
  assert.equal(count(world.bus, 'contract:clauseBroken'), 1);
  assert.equal(world.state.missions.receipts.filter((row) => row.missionId === mission.id).length, 1);
});

// ── 12. persistence ──────────────────────────────────────────────────────────────────────

test('a pending pair and an accepted premium survive a save round trip without duplicating', () => {
  // Pending pair.
  const w1 = initWorld({ offers: [gambitBase()] });
  assert.equal(gambitRows(w1.state).length, 1);
  const snapshot = JSON.parse(JSON.stringify(w1.missionSystem.serialize()));

  const w2 = initWorld({});
  w2.missionSystem.deserialize(snapshot);
  w2.bus.emit('save:loaded', {});
  assert.equal(gambitRows(w2.state).length, 1, 'reload posts nothing on top of the saved alternative');
  const restoredAlt = gambitRows(w2.state)[0];
  assert.equal(restoredAlt.id, GAMBIT_ID);
  assert.equal(restoredAlt.params.clauseGambit.baseOfferId, BASE_ID);
  assert.equal(restoredAlt.params.clauseGambit.version, 1);
  assert.equal(findOnBoard(w2.state, BASE_ID) !== null, true, 'the standard version survives too');

  // The restored pair is still takeable, and enforcement still answers to the live base.
  accept(w2, restoredAlt.id);
  assert.equal(w2.state.missions.active.length, 1);
  assert.equal(w2.state.missions.active[0].clauses[0].id, 'cargo_intact');

  // Accepted premium, restored with its manifest, still pays once and enforces once.
  const w3 = initWorld({ offers: [gambitBase()] });
  accept(w3, GAMBIT_ID);
  const activeSnapshot = JSON.parse(JSON.stringify(w3.missionSystem.serialize()));
  assert.equal(activeSnapshot.active[0].params.clauseGambit.baseOfferId, BASE_ID);

  const w4 = initWorld({ cargoItems: { [CMDTY]: 2 } });
  w4.missionSystem.deserialize(activeSnapshot);
  w4.bus.emit('save:loaded', {});
  assert.equal(w4.state.missions.active.length, 1);
  assert.equal(w4.state.missions.active[0].clauses[0].id, 'cargo_intact');
  assert.equal(gambitRows(w4.state).length, 0, 'no alternative is re-minted for a taken pair');

  const restoredMission = w4.state.missions.active[0];
  completeDelivery(w4);
  const grants = missionGrants(w4.bus);
  assert.equal(grants.length, 1, 'one eventual payment');
  assert.equal(grants[0].amount, 1100);
  assert.equal(collateralRefunds(w4.bus).length, 1);
  assert.equal(w4.bus.log.filter((entry) => entry.name === 'comms:popup'
    && /^Paid 1,100 cr — base 1,000 cr/.test(String(entry.payload && entry.payload.note || ''))).length, 1);
  assert.equal(restoredMission.params.clauseGambit.clauseId, 'cargo_intact');
});

test('a legacy snapshot without gambit metadata loads and behaves normally', () => {
  const legacy = initWorld({ offers: [gambitBase({ clauses: [{ conditionId: 'steady_hands', id: 'steady_hands' }] })] });
  // An offer with pre-existing terms never gains an alternative — exactly the legacy board shape.
  assert.equal(gambitRows(legacy.state).length, 0);
  const snapshot = JSON.parse(JSON.stringify(legacy.missionSystem.serialize()));
  const restored = initWorld({});
  restored.missionSystem.deserialize(snapshot);
  restored.bus.emit('save:loaded', {});
  assert.equal(gambitRows(restored.state).length, 0, 'nothing is invented for a legacy board');
  assert.equal(findOnBoard(restored.state, BASE_ID) !== null, true);
  accept(restored, BASE_ID);
  assert.equal(restored.state.missions.active.length, 1);
  assert.equal(restored.state.missions.active[0].params.clauseGambit, undefined);
});

// ── support: the pure helpers answer the same question the sync and accept do ───────────────

test('reconstruction and the sync agree on what a live gambit alternative is', () => {
  const world = initWorld({ offers: [gambitBase()] });
  const alt = gambitRows(world.state)[0];
  const rebuilt = reconstructClauseGambitOffer(alt, world.state.missions.boards, 0);
  assert.ok(rebuilt);
  assert.equal(rebuilt.id, alt.id);
  assert.deepEqual(rebuilt.clauses, alt.clauses);
  assert.equal(reconstructClauseGambitOffer(alt, world.state.missions.boards, 99), null,
    'a base outside the current epoch no longer answers');
  assert.equal(reconstructClauseGambitOffer({ id: 'x', params: {} }, world.state.missions.boards, 0), null);
});

test('validation and sync reject moved, expired, and unsupported alternatives', () => {
  for (const invalidate of [
    (world, alt) => {
      world.state.missions.boards[STATION_ID].slots = [alt];
      world.state.missions.boards[DEST_ID] = { refreshEpoch: 0, slots: [gambitBase()] };
    },
    (_world, alt) => { alt.expiresAtEpoch = 0; },
    (_world, alt) => { alt.params.clauseGambit.clauseId = 'invented'; },
    (_world, alt) => { alt.id = 'invented_alternative'; },
    (_world, alt) => { alt.params.clauseGambit.version = 99; },
  ]) {
    for (const viaSync of [false, true]) {
      const world = initWorld({ offers: [gambitBase()] });
      const alt = gambitRows(world.state)[0];
      invalidate(world, alt);
      if (viaSync) {
        world.bus.emit('save:loaded', {});
        assert.equal(allOffers(world.state).includes(alt), false, 'the invalid row is pruned');
      } else {
        assert.equal(world.missionSystem.acceptMission(alt.id), false);
        assert.equal(count(world.bus, 'toast', (p) => /no longer available/.test(p.text || '')), 1);
        assert.equal(world.state.missions.active.length, 0);
        assert.equal(count(world.bus, 'economy:chargeCredits'), 0);
        assert.equal(world.state.player.cargo.items[CMDTY], undefined);
      }
    }
  }
});

test('pair withdrawal precedes synchronous charges and restores positions across boards', () => {
  for (const selectedId of [BASE_ID, GAMBIT_ID]) {
    const world = initWorld({ offers: [gambitBase()] });
    const alt = gambitRows(world.state)[0];
    world.state.missions.boards[DEST_ID] = {
      refreshEpoch: 0, slots: [{ id: 'unrelated' }, JSON.parse(JSON.stringify(alt))],
    };
    world.bus.on('economy:chargeCredits', () => {
      assert.equal(boardIds(world.state).includes(BASE_ID), false);
      assert.equal(boardIds(world.state).includes(GAMBIT_ID), false);
      assert.equal(world.missionSystem.acceptMission(BASE_ID), false);
      assert.equal(world.missionSystem.acceptMission(GAMBIT_ID), false);
    });
    assert.equal(world.missionSystem.acceptMission(selectedId), true);
    assert.equal(world.state.missions.active.length, 1);
    assert.equal(count(world.bus, 'economy:chargeCredits'), 1);
    assert.equal(world.state.player.cargo.items[CMDTY], 2);
  }

  const failed = initWorld({ offers: [gambitBase()], cargo: { usedVolume: Number.NaN } });
  const alt = gambitRows(failed.state)[0];
  failed.state.missions.boards[DEST_ID] = {
    refreshEpoch: 0, slots: [{ id: 'unrelated' }, JSON.parse(JSON.stringify(alt))],
  };
  const before = JSON.stringify(failed.state.missions.boards);
  assert.equal(failed.missionSystem.acceptMission(GAMBIT_ID), false);
  assert.equal(JSON.stringify(failed.state.missions.boards), before, 'every row regains its position');
});

test('reloaded premium enforcement and zero-deposit payday retain their existing owners', () => {
  const original = initWorld({ offers: [gambitBase()] });
  accept(original, GAMBIT_ID);
  const snapshot = JSON.parse(JSON.stringify(original.missionSystem.serialize()));
  const restored = initWorld({ cargoItems: { [CMDTY]: 2 } });
  restored.missionSystem.deserialize(snapshot);
  restored.bus.emit('save:loaded', {});
  restored.bus.emit('player:scannedByPatrol', { hasContraband: false });
  assert.equal(restored.state.missions.active[0].status, 'active');
  restored.bus.emit('player:scannedByPatrol', { hasContraband: true });
  restored.bus.emit('player:scannedByPatrol', { hasContraband: true });
  assert.equal(count(restored.bus, 'mission:failed'), 1);
  assert.equal(count(restored.bus, 'contract:clauseBroken'), 1);
  assert.equal(missionGrants(restored.bus).length, 0);

  const free = initWorld({ offers: [gambitBase({ collateral_cr: 0 })] });
  accept(free, GAMBIT_ID);
  completeDelivery(free);
  assert.equal(completionPopup(free.bus).note,
    'Paid 1,100 cr — base 1,000 cr + Cargo intact 100 cr.');
  assert.equal(collateralRefunds(free.bus).length, 0);
});
