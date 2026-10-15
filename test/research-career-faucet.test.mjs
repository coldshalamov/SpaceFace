// Career RP faucet: completed bounty_hunt and mining_quota contracts pay research points through
// the missions sole-writer seam, scaled by risk tier, capped per sim-day, and only once the pilot
// already owns the first node of that path (the stranding guard).
//   node --test test/research-career-faucet.test.mjs
import assert from 'node:assert/strict';
import test from 'node:test';

import { hash32, mulberry32 } from '../src/core/rng.js';
import { createGameState } from '../src/core/gameState.js';
import { MISSION_TUNING } from '../src/data/missions.js';
import { RESEARCH_GRANTS } from '../src/data/researchGrants.js';
import { TECH_NODES } from '../src/data/tech.js';
import { assertCommittedLadder, CAREER_FAUCET_ROWS } from '../src/data/techVerbLadder.js';
import { missions } from '../src/systems/missions.js';
import { save } from '../src/save/saveSystem.js';

const BOUNTY = RESEARCH_GRANTS['research:bounty'];
const MINING = RESEARCH_GRANTS['research:mining'];
const DAY_S = 86400;

class Bus {
  constructor() {
    this.handlers = new Map();
    this.log = [];
  }
  on(name, fn) {
    const rows = this.handlers.get(name) || [];
    rows.push(fn);
    this.handlers.set(name, rows);
    return () => {};
  }
  off() {}
  emit(name, payload) {
    this.log.push({ name, payload });
    for (const fn of [...(this.handlers.get(name) || [])]) fn(payload);
  }
}

function makeState() {
  return {
    meta: { seed: 4242, playtimeS: 0 },
    seed: 4242,
    tick: 0,
    simTime: 100,
    mode: 'flight',
    playerId: 1,
    player: {
      credits: 5000,
      researchPoints: 0,
      researchedNodes: [],
      cargo: { items: {}, capVolume: 20, capMass: 20, usedVolume: 0, usedMass: 0 },
      stats: {},
    },
    missions: {
      boards: {},
      active: [],
      completedLog: [],
      receipts: [],
      nextId: 1,
      config: JSON.parse(JSON.stringify(MISSION_TUNING)),
    },
    story: { beatIndex: 0, branch: null, flags: {}, chainProgress: 0 },
    factions: {},
    world: { currentSectorId: 'sector_helios_prime', activeSector: { stations: [] } },
    entities: new Map(),
    entityList: [],
    ui: { docked: false, dockedStationId: null, trackedMissionId: null },
    nav: {},
    settings: { gameplay: { tutorialHints: false } },
  };
}

function boot(state = makeState()) {
  const bus = new Bus();
  const missionSystem = { ...missions };
  missionSystem.init({ state, bus, helpers: { hash32, mulberry32, voice: { say: () => true } } });
  return { state, bus, missionSystem };
}

function complete(harness, type, riskTier = 0) {
  const mission = {
    id: `m-${harness.state.missions.nextId++}`,
    status: 'active',
    type,
    riskTier,
    reward_cr: 100,
    collateral_cr: 0,
    title: 'Hold the line',
    summary: 'x',
  };
  harness.state.missions.active.push(mission);
  harness.missionSystem._completeMission(mission, harness.state.missions.active.length - 1);
  return mission;
}

function faucetEvents(bus, source) {
  return bus.log.filter((entry) => entry.name === 'research:pointsChanged'
    && entry.payload && entry.payload.source === source);
}

function lastReceipt(harness) {
  return harness.state.missions.receipts[0]; // newest first
}

function lastToast(bus) {
  const toasts = bus.log.filter((entry) => entry.name === 'toast');
  return toasts[toasts.length - 1].payload.text;
}

test('the rows are repeatable, never subscribed as firsts, and gated on a zero-RP entry node', () => {
  for (const [key, spec] of [['research:bounty', BOUNTY], ['research:mining', MINING]]) {
    assert.equal(spec.repeatable, true, `${key} is a settlement faucet, not a first`);
    assert.ok(spec.dailyCap > 0 && spec.rp > 0);
    const entry = TECH_NODES.find((node) => node.id === spec.requiresNode);
    assert.ok(entry, `${key} names a real node`);
    assert.equal(entry.cost.rp, 0, `${key} entry node costs no RP, so the faucet can start`);
    assert.deepEqual(entry.prereqs, [], `${key} entry node is a path entry`);
  }
  assert.deepEqual(BOUNTY.types, ['bounty_hunt']);
  assert.deepEqual(MINING.types, ['mining_quota']);
  assert.equal(BOUNTY.requiresNode, 'tech_combat_basics');
  assert.equal(MINING.requiresNode, 'tech_industrial_mining');
  assert.deepEqual(CAREER_FAUCET_ROWS.map((row) => row.key).sort(), ['research:bounty', 'research:mining']);
  const ladder = assertCommittedLadder();
  assert.deepEqual(ladder.errors, [], 'the ladder invariants stay consistent with the faucet rows');

  // Emitting a faucet key on the bus must not mint a first or an RP.
  const { state, bus } = boot();
  bus.emit('research:bounty', { missionId: 'm-x' });
  bus.emit('research:mining', { missionId: 'm-x' });
  assert.equal(state.player.researchPoints, 0);
  assert.equal(state.player.researchFirsts, undefined);
});

test('case 1: no RP before the pilot owns the path entry node', () => {
  const harness = boot();
  const { state, bus } = harness;
  complete(harness, 'bounty_hunt', 2);
  complete(harness, 'mining_quota', 0);
  assert.equal(state.player.researchPoints, 0, 'neither contract pays before the entry node');
  assert.equal(faucetEvents(bus, 'research:bounty').length, 0);
  assert.equal(faucetEvents(bus, 'research:mining').length, 0);
  assert.equal(state.player.researchGrantDays, undefined, 'a guarded completion leaves no ledger');
  assert.equal(lastReceipt(harness).researchPoints, 0);
  assert.doesNotMatch(lastToast(bus), /RP/);

  // The guard is per path: Combat Basics does not open the miner's faucet, nor the reverse.
  state.player.researchedNodes = ['tech_combat_basics'];
  complete(harness, 'mining_quota', 0);
  assert.equal(state.player.researchPoints, 0, 'Combat Basics does not open the mining faucet');
  state.player.researchedNodes = ['tech_industrial_mining'];
  complete(harness, 'bounty_hunt', 2);
  assert.equal(state.player.researchPoints, 0, 'Industrial Mining does not open the bounty faucet');
});

test('case 2: once the entry node is owned, a settled contract pays its risk-scaled RP and says so', () => {
  const harness = boot();
  const { state, bus } = harness;
  state.player.researchedNodes = ['tech_combat_basics', 'tech_industrial_mining'];

  complete(harness, 'bounty_hunt', 2);
  const bountyRp = BOUNTY.rp + BOUNTY.perRiskTier * 2;
  assert.equal(state.player.researchPoints, bountyRp);
  const bountyEvent = faucetEvents(bus, 'research:bounty');
  assert.equal(bountyEvent.length, 1);
  assert.equal(bountyEvent[0].payload.granted, bountyRp);
  assert.equal(bountyEvent[0].payload.dailyCount, 1);
  assert.equal(bountyEvent[0].payload.dailyCap, BOUNTY.dailyCap);
  assert.equal(lastReceipt(harness).researchPoints, bountyRp, 'the settlement receipt carries the RP');
  assert.match(lastToast(bus), new RegExp(`\\+100 cr \\+${bountyRp} RP$`));
  assert.doesNotMatch(lastToast(bus), /research_|research:|bounty_hunt/, 'no raw ids in player text');

  complete(harness, 'bounty_hunt', 1);
  assert.equal(state.player.researchPoints, bountyRp + BOUNTY.rp + BOUNTY.perRiskTier, 'a lower tier pays less');

  const before = state.player.researchPoints;
  complete(harness, 'mining_quota', 0);
  assert.equal(state.player.researchPoints - before, MINING.rp, 'a tier-0 quota pays the base on its own');
  assert.equal(faucetEvents(bus, 'research:mining').length, 1);
  complete(harness, 'mining_quota', 3);
  assert.equal(state.player.researchPoints - before, MINING.rp + MINING.rp + MINING.perRiskTier * 3);

  // Other contract types stay on their own rows.
  const other = state.player.researchPoints;
  complete(harness, 'cargo_delivery', 2);
  assert.equal(state.player.researchPoints, other, 'a freight contract pays no career RP');
});

test('case 3: the per-sim-day cap holds per row, resets the next day, and rows do not share a cap', () => {
  const harness = boot();
  const { state, bus } = harness;
  state.player.researchedNodes = ['tech_combat_basics', 'tech_industrial_mining'];

  for (let i = 0; i < BOUNTY.dailyCap; i += 1) complete(harness, 'bounty_hunt', 2);
  const perBounty = BOUNTY.rp + BOUNTY.perRiskTier * 2;
  assert.equal(state.player.researchPoints, BOUNTY.dailyCap * perBounty);
  assert.equal(faucetEvents(bus, 'research:bounty').length, BOUNTY.dailyCap);

  const atCap = state.player.researchPoints;
  const mission = complete(harness, 'bounty_hunt', 3);
  assert.equal(state.player.researchPoints, atCap, 'the next bounty the same day pays nothing');
  assert.equal(faucetEvents(bus, 'research:bounty').length, BOUNTY.dailyCap);
  assert.equal(lastReceipt(harness).researchPoints, 0);
  assert.ok(mission, 'the capped contract still settles and pays credits');

  // The mining row has its own counter: a spent bounty cap does not starve it.
  complete(harness, 'mining_quota', 0);
  assert.equal(state.player.researchPoints, atCap + MINING.rp, 'mining still pays while bounty is capped');
  for (let i = 1; i < MINING.dailyCap; i += 1) complete(harness, 'mining_quota', 0);
  const miningAtCap = state.player.researchPoints;
  assert.equal(miningAtCap, atCap + MINING.dailyCap * MINING.rp);
  complete(harness, 'mining_quota', 4);
  assert.equal(state.player.researchPoints, miningAtCap, 'the mining cap holds too');

  // A new sim-day reopens both rows.
  state.simTime += DAY_S;
  complete(harness, 'bounty_hunt', 2);
  complete(harness, 'mining_quota', 0);
  assert.equal(state.player.researchPoints, miningAtCap + perBounty + MINING.rp);
  const days = state.player.researchGrantDays;
  assert.equal(days['research:bounty'].count, 1);
  assert.equal(days['research:mining'].count, 1);
  assert.notEqual(days['research:bounty'].dayKey, undefined);
});

test('case 4: the cap record survives the real save path and a reload', () => {
  const harness = boot();
  const { state } = harness;
  state.player.researchedNodes = ['tech_combat_basics', 'tech_industrial_mining'];
  for (let i = 0; i < BOUNTY.dailyCap; i += 1) complete(harness, 'bounty_hunt', 1);
  complete(harness, 'mining_quota', 0);
  const ledgerBefore = JSON.parse(JSON.stringify(state.player.researchGrantDays));
  assert.equal(ledgerBefore['research:bounty'].count, BOUNTY.dailyCap);
  assert.equal(ledgerBefore['research:mining'].count, 1);

  // The player record the save system writes carries the ledger.
  const live = createGameState(4242);
  live.mode = 'flight';
  live.simTime = state.simTime;
  live.player.researchedNodes = state.player.researchedNodes.slice();
  live.player.researchPoints = state.player.researchPoints;
  live.player.researchGrantDays = state.player.researchGrantDays;
  save.init({ state: live, bus: new Bus(), helpers: {}, registry: { get: () => null } });
  const data = save.serializeData();
  assert.deepEqual(data.player.researchGrantDays, ledgerBefore, 'serializeData keeps the cap record');
  assert.equal(data.player.researchPoints, state.player.researchPoints);

  // Reload: a fresh game state fed the serialized player record still honors the cap, then reopens
  // on the next sim-day.
  const reloaded = makeState();
  const wire = JSON.parse(JSON.stringify(data.player));
  reloaded.simTime = state.simTime;
  reloaded.player.researchedNodes = wire.researchedNodes;
  reloaded.player.researchPoints = wire.researchPoints;
  reloaded.player.researchGrantDays = wire.researchGrantDays;
  const after = boot(reloaded);
  const rpBefore = reloaded.player.researchPoints;
  complete(after, 'bounty_hunt', 2);
  assert.equal(reloaded.player.researchPoints, rpBefore, 'the reloaded save is still at the bounty cap');
  complete(after, 'mining_quota', 0);
  assert.equal(reloaded.player.researchPoints, rpBefore + MINING.rp, 'the reloaded mining count continues');
  assert.equal(reloaded.player.researchGrantDays['research:mining'].count, 2);
  reloaded.simTime += DAY_S;
  complete(after, 'bounty_hunt', 2);
  assert.equal(reloaded.player.researchPoints, rpBefore + MINING.rp + BOUNTY.rp + BOUNTY.perRiskTier * 2);

  // A malformed ledger on an old or crafted save never throws and never widens the cap.
  for (const junk of ['x', 7, [], { 'research:bounty': 'x' }, { 'research:bounty': { dayKey: 3, count: 'y' } }]) {
    const odd = makeState();
    odd.player.researchedNodes = ['tech_combat_basics'];
    odd.player.researchGrantDays = junk;
    const h = boot(odd);
    complete(h, 'bounty_hunt', 2);
    assert.equal(odd.player.researchPoints, BOUNTY.rp + BOUNTY.perRiskTier * 2, `malformed ledger ${JSON.stringify(junk)} restarts the count`);
  }
});
