import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createRegistry } from '../src/core/registry.js';
import { sectorSim } from '../src/systems/sectorSim.js';

let consequenceModule = null;
try {
  consequenceModule = await import('../src/systems/custodyConsequences.js');
} catch {
  // First TDD run: the system intentionally does not exist yet.
}
const custodyConsequences = consequenceModule?.custodyConsequences || consequenceModule?.default || null;

test('custody consequences exists as a deterministic simulation system', () => {
  assert.ok(custodyConsequences, 'src/systems/custodyConsequences.js must exist');
  assert.equal(custodyConsequences.name, 'custodyConsequences');
});

function boot(seed = 4901, { withSectorSim = false } = {}) {
  const voices = [];
  const sim = createSimulation({
    seed,
    systems: withSectorSim ? [custodyConsequences, sectorSim] : [custodyConsequences],
    helpers: { voice: { say(payload) { voices.push(structuredClone(payload)); return true; } } },
  });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = 'sector_tethys_junction';
  const player = sim.spawn({ type: 'ship', team: 0, pos: { x: 0, z: 0 }, hull: 200, hullMax: 200 });
  state.playerId = player.id;
  const events = { recorded: [], impulses: [], headlines: [], counterIntel: [], credits: [], rep: [], acknowledged: [] };
  for (const [event, key] of [
    ['custody:recorded', 'recorded'],
    ['sectorsim:impulse', 'impulses'],
    ['news:headline', 'headlines'],
    ['pirateRumor:counterIntel', 'counterIntel'],
    ['economy:grantCredits', 'credits'],
    ['faction:repDelta', 'rep'],
    ['law:custodyAcknowledged', 'acknowledged'],
  ]) bus.on(event, (payload) => events[key].push(structuredClone(payload)));
  return { sim, state, bus, player, events, voices };
}

function spawnOffender(t, {
  factionId = 'faction_reach',
  archetype = 'pirate_raider',
  shipClass = 'fighter',
  lootTableId = 'reaver_pirate',
  bountyCr = 300,
  data = {},
} = {}) {
  return t.sim.spawn({
    type: 'ship',
    team: 1,
    factionId,
    pos: { x: 100, z: 0 },
    hull: 12,
    hullMax: 100,
    data: {
      name: 'Reach Cutter',
      bountyCr,
      shipClass,
      lootTableId,
      ...data,
      ai: { archetype, fsm: 'surrender', passive: true, ...(data.ai || {}) },
    },
  });
}

function transfer(t, entity, overrides = {}) {
  t.bus.emit('law:custodyTransfer', {
    id: `surrender-custody:${entity.id}`,
    shape: 'surrender_custody',
    outcome: 'custody',
    entityId: entity.id,
    factionId: entity.factionId,
    authorityFactionId: 'faction_scn',
    stationId: 'station_custody_test',
    credits: 180,
    t: t.state.simTime,
    ...overrides,
  });
}

test('normal play registers custody consequences after surrender recovery', () => {
  const state = createGameState(4900);
  const registry = createRegistry({ state, bus: createBus(), helpers: {} });
  const names = registry.systems.map((system) => system.name);
  assert.ok(names.includes('custodyConsequences'));
  assert.ok(names.indexOf('custodyConsequences') > names.indexOf('surrenderRecovery'));
});

test('custody creates one durable captured-ship record and one lawful world impulse', { skip: !custodyConsequences }, () => {
  const t = boot();
  const offender = spawnOffender(t);
  transfer(t, offender);
  transfer(t, offender);

  const ledger = t.state.player.custodyLedger;
  assert.equal(ledger.captures.length, 1, 'duplicate custody receipt is idempotent');
  assert.equal(ledger.totalCaptured, 1);
  assert.equal(ledger.captures[0].entityId, offender.id);
  assert.equal(ledger.captures[0].archetype, 'pirate_raider');
  assert.equal(ledger.captures[0].shipClass, 'fighter');
  assert.equal(ledger.captures[0].bountyCr, 300);
  assert.equal(ledger.captures[0].stationId, 'station_custody_test');
  assert.equal(ledger.captures[0].sectorId, 'sector_tethys_junction');
  assert.equal(ledger.captures[0].repeatIndex, 1);
  assert.equal(t.events.recorded.length, 1);
  assert.equal(t.events.impulses.length, 1);
  assert.equal(t.events.impulses[0].kind, 'custody_transfer');
  assert.equal(t.events.impulses[0].sectorId, 'sector_tethys_junction');
  assert.ok(t.events.impulses[0].danger < 0, 'custody lowers modeled lane danger');
  assert.equal(t.events.impulses[0].factionId, 'faction_scn');
  assert.ok(t.events.impulses[0].influenceDelta > 0, 'custody strengthens lawful presence');
  assert.equal(t.events.acknowledged.length, 1);
  assert.equal(t.voices.length, 1);
  assert.equal(t.events.credits.length, 0, 'consequence system never duplicates custody payout');
  assert.equal(t.events.rep.length, 0, 'consequence system never duplicates custody reputation');
});

test('repeat captures mature into one named counter-intelligence reaction on the next world day', { skip: !custodyConsequences }, () => {
  const t = boot(4902);
  const first = spawnOffender(t);
  transfer(t, first);
  const second = spawnOffender(t);
  transfer(t, second);

  const ledger = t.state.player.custodyLedger;
  const profile = ledger.profiles['faction_reach:reaver_pirate'];
  assert.ok(profile);
  assert.equal(profile.captureCount, 2);
  assert.equal(profile.lastStationId, 'station_custody_test');
  assert.equal(ledger.captures.at(-1).repeatIndex, 2);
  assert.equal(profile.pendingIntelMilestone, 2);
  assert.equal(t.events.headlines.length, 0, 'custody interviews do not resolve instantly');
  assert.equal(t.events.counterIntel.length, 0);
  assert.equal(t.events.impulses.length, 2);

  t.bus.emit('day:tick', { days: 1, elapsed: 1 });
  assert.equal(t.events.headlines.length, 1, 'next-day intelligence owns one headline');
  assert.match(t.events.headlines[0].headline, /repeat|linked|profile/i);
  assert.equal(t.events.headlines[0].kind, 'custody-intelligence');
  assert.equal(t.events.counterIntel.length, 1);
  assert.equal(t.events.counterIntel[0].milestone, 2);
  assert.match(t.events.counterIntel[0].networkName, /Network|Crew|Ring|Syndicate/);
  assert.equal(t.events.impulses.length, 3);
  assert.equal(t.events.impulses[2].kind, 'custody_intelligence');
  assert.ok(t.events.impulses[2].danger < 0, 'matured intelligence lowers future piracy pressure');
  assert.equal(profile.appliedIntelMilestone, 2);
  assert.equal(profile.pendingIntelMilestone, null);

  t.bus.emit('day:tick', { days: 2, elapsed: 1 });
  assert.equal(t.events.headlines.length, 1, 'repeat day ticks do not replay the same intelligence');
  assert.equal(t.events.counterIntel.length, 1);
  assert.equal(t.events.impulses.length, 3);
});

test('offender intelligence advances only at deterministic 2, 4, and 7 capture milestones', { skip: !custodyConsequences }, () => {
  const t = boot(4910);
  const capture = () => {
    const offender = spawnOffender(t);
    transfer(t, offender);
  };
  capture();
  assert.equal(t.state.player.custodyLedger.profiles['faction_reach:reaver_pirate'].pendingIntelMilestone, null);
  capture();
  t.bus.emit('day:tick', { days: 1, elapsed: 1 });
  assert.equal(t.events.counterIntel.length, 1);
  capture();
  t.bus.emit('day:tick', { days: 2, elapsed: 1 });
  assert.equal(t.events.counterIntel.length, 1, 'third capture is below the next threshold');
  capture();
  t.bus.emit('day:tick', { days: 3, elapsed: 1 });
  assert.equal(t.events.counterIntel.length, 2);
  assert.deepEqual(t.events.counterIntel.map((event) => event.milestone), [2, 4]);
  capture(); capture();
  t.bus.emit('day:tick', { days: 4, elapsed: 1 });
  assert.equal(t.events.counterIntel.length, 2, 'six captures remain below the final bounded milestone');
  capture();
  t.bus.emit('day:tick', { days: 5, elapsed: 1 });
  assert.deepEqual(t.events.counterIntel.map((event) => event.milestone), [2, 4, 7]);
});

test('matured custody intelligence is consumed by the real sector field', { skip: !custodyConsequences }, () => {
  const control = boot(4911, { withSectorSim: true });
  control.bus.emit('day:tick', { days: 1, elapsed: 1 });
  const controlDanger = control.state.sectorSim.field.nodes.sector_tethys_junction.danger;

  const t = boot(4911, { withSectorSim: true });
  const fieldNode = () => t.state.sectorSim.field.nodes.sector_tethys_junction;
  const first = spawnOffender(t);
  transfer(t, first);
  const second = spawnOffender(t);
  transfer(t, second);
  assert.equal(t.state.sectorSim.impulses.length, 2, 'two immediate capture impulses await model consumption');

  t.bus.emit('day:tick', { days: 1, elapsed: 1 });
  assert.equal(t.events.counterIntel.length, 1);
  assert.equal(t.state.sectorSim.impulses.length, 0, 'real sectorSim consumed capture plus matured-intel impulses');
  assert.ok(fieldNode().danger < controlDanger,
    'with identical seed/day, custody intelligence lowers the live danger node versus control');
});

test('pre-feature repeat profiles migrate into one future intelligence milestone', { skip: !custodyConsequences }, () => {
  const state = createGameState(4912);
  state.mode = 'flight';
  state.player.custodyLedger = {
    totalCaptured: 2,
    captures: [],
    settledIds: [],
    profiles: {
      'faction_reach:reaver_pirate': {
        profileId: 'faction_reach:reaver_pirate',
        factionId: 'faction_reach',
        offenderType: 'reaver_pirate',
        archetype: 'pirate_raider',
        shipClass: 'fighter',
        captureCount: 2,
        totalBountyCr: 600,
        lastSectorId: 'sector_tethys_junction',
        lastStationId: 'station_custody_test',
        lastAuthorityFactionId: 'faction_scn',
      },
    },
  };
  const bus = createBus();
  const counterIntel = [];
  bus.on('pirateRumor:counterIntel', (payload) => counterIntel.push(structuredClone(payload)));
  createSimulation({ state, bus, systems: [custodyConsequences] });
  const profile = state.player.custodyLedger.profiles['faction_reach:reaver_pirate'];
  assert.equal(profile.pendingIntelMilestone, 2);
  bus.emit('day:tick', { days: 1, elapsed: 1 });
  bus.emit('day:tick', { days: 2, elapsed: 1 });
  assert.equal(counterIntel.length, 1);
  assert.equal(profile.appliedIntelMilestone, 2);
});

test('captured-ship history is bounded without losing aggregate profiles', { skip: !custodyConsequences }, () => {
  const t = boot(4903);
  for (let i = 0; i < 40; i++) {
    const offender = spawnOffender(t, { lootTableId: `crew_${i}`, archetype: `raider_${i}` });
    transfer(t, offender);
  }
  assert.equal(t.state.player.custodyLedger.captures.length, 24);
  assert.equal(t.state.player.custodyLedger.totalCaptured, 40);
  assert.equal(Object.keys(t.state.player.custodyLedger.profiles).length, 40);
});

test('recycled entity ids do not erase a later legitimate custody transfer', { skip: !custodyConsequences }, () => {
  const t = boot(4906);
  const first = spawnOffender(t);
  transfer(t, first);
  const recycledId = first.id;
  first.alive = false;
  t.sim.step();
  const later = spawnOffender(t);
  assert.equal(later.id, recycledId, 'core fixture reuses the released id');
  transfer(t, later);
  assert.equal(t.state.player.custodyLedger.totalCaptured, 2);
  assert.equal(t.events.impulses.length, 2);
});

test('boss and ace payloads fail closed even if a custody event is forged', { skip: !custodyConsequences }, () => {
  for (const data of [
    { isBoss: true },
    { encounterBoss: true },
    { aceMemory: { aceId: 'ace_vanta' } },
    { aiArchetype: 'miniboss_capital' },
  ]) {
    const t = boot(4904);
    const offender = spawnOffender(t, { data });
    transfer(t, offender);
    assert.equal(t.state.player.custodyLedger?.totalCaptured || 0, 0);
    assert.equal(t.events.impulses.length, 0);
  }
});

test('same event tape produces the same captured ledger and sector impulses', { skip: !custodyConsequences }, () => {
  function run() {
    const t = boot(4905);
    const first = spawnOffender(t);
    transfer(t, first);
    const second = spawnOffender(t);
    transfer(t, second);
    return {
      ledger: structuredClone(t.state.player.custodyLedger),
      impulses: t.events.impulses,
      headlines: t.events.headlines,
      counterIntel: t.events.counterIntel,
    };
  }
  assert.deepEqual(run(), run());
});
