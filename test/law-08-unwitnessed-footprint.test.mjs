// LAW-08 — an incident nobody saw is recorded as unwitnessed in your footprint. lawSecurity
// already adjudicates every player kill and broadcasts `law:killedAdjudicated` with the
// evidence class, but only factions' rep gate consumed it — the provenance record the player
// reads wrote every kill as a bare `destroyed` act, so a silent murder and a witnessed one
// were indistinguishable where the fiction promises they differ. The ledger now caches the
// law's verdict (consume-once, tick-fresh — entity ids recycle), stamps the act row, and the
// footprint prints the mark. No witness invented, no radius changed.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation } from '../src/core/sim.js';
import { heat } from '../src/systems/heat.js';
import { lawSecurity } from '../src/systems/lawSecurity.js';
import { provenanceLedger } from '../src/systems/provenanceLedger.js';
import { nodeWhy, actEvidenceLabel } from '../src/ui/screens/footprint.js';

const SEED = 4242;
const SECTOR = 'sector_tethys_junction';

function boot() {
  const sim = createSimulation({ seed: SEED, systems: [lawSecurity, provenanceLedger, heat] });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = SECTOR;
  if (!state.world.sectors) state.world.sectors = {};
  state.world.sectors[SECTOR] = { id: SECTOR, factionId: 'faction_scn', security: 0.9, tier: 0 };
  state.player.heat = 0;
  state.player.credits = 5000;
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 250, z: 10 }, hull: 200, hullMax: 200, radius: 8,
  });
  state.playerId = player.id;
  const emitted = [];
  bus.on('law:killedAdjudicated', (p) => emitted.push({ evt: 'law:killedAdjudicated', payload: p }));
  bus.on('law:reportIncidentReceipt', (p) => emitted.push({ evt: 'law:reportIncidentReceipt', payload: p }));
  return { sim, state, bus, player, emitted };
}

function civilianVictim(sim, pos = { x: 80, z: 0 }) {
  return sim.spawn({
    type: 'ship', team: 2, factionId: 'faction_free',
    pos: { x: pos.x, z: pos.z }, hull: 40, hullMax: 40, radius: 8,
    data: { shipClass: 'hauler', ai: { archetype: 'fleeing_trader' } },
  });
}

function lawfulWitness(sim, pos = { x: 120, z: 0 }) {
  return sim.spawn({
    type: 'ship', team: 2, factionId: 'faction_scn',
    pos: { x: pos.x, z: pos.z }, hull: 80, hullMax: 80, radius: 8,
    data: { shipClass: 'patrol', ai: { archetype: 'patrol' }, lawfulAuthority: true },
  });
}

function killPayload(state, victim, overrides = {}) {
  return {
    id: victim ? victim.id : 99999,
    killerId: state.playerId,
    type: 'ship',
    pos: victim ? { x: victim.pos.x, z: victim.pos.z } : { x: 80, z: 0 },
    victimClass: (victim && victim.data && victim.data.shipClass) || 'hauler',
    factionId: (victim && victim.factionId) || 'faction_free',
    factionLawful: false,
    targetHostileToPlayer: false,
    ...overrides,
  };
}

function actNodeFor(state, victimId) {
  // The act row is keyed by the law's stable victim id ('entity:N' for plain hulls).
  const keys = new Set([String(victimId), `entity:${victimId}`]);
  const chains = (state.provenance && state.provenance.chains) || [];
  for (const chain of chains) {
    const node = chain.nodes.find((n) => n.k === 'act' && keys.has(String(n.targetId)));
    if (node) return node;
  }
  return null;
}

test('a kill with no witness inside 450 WU stamps the act row unwitnessed and mints no warrant', () => {
  const run = boot();
  const victim = civilianVictim(run.sim);
  run.bus.emit('entity:killed', killPayload(run.state, victim));

  const verdict = run.emitted.find((e) => e.evt === 'law:killedAdjudicated');
  assert.ok(verdict, 'the law adjudicates the kill');
  assert.equal(verdict.payload.evidenceClass, 'unwitnessed');
  assert.equal(verdict.payload.outcome, 'unwitnessed');
  assert.equal(run.emitted.filter((e) => e.evt === 'law:reportIncidentReceipt').length, 0,
    'no signed receipt — an unseen crime cannot be charged');
  assert.equal(run.state.player.heat, 0, 'no warrant: unwitnessed kills mint no heat');

  const node = actNodeFor(run.state, victim.id);
  assert.ok(node, 'the act lands on the provenance record');
  assert.equal(node.evidenceClass, 'unwitnessed', 'the record keeps the law\'s verdict');
  assert.equal(actEvidenceLabel(node), 'unwitnessed');
  assert.ok(nodeWhy(node).includes('unwitnessed'), 'the footprint row reads unwitnessed');
  run.sim.dispose();
});

test('a witnessed kill stamps direct evidence and keeps the unwitnessed mark off the row', () => {
  const run = boot();
  const victim = civilianVictim(run.sim);
  lawfulWitness(run.sim, { x: 140, z: 0 });
  run.bus.emit('entity:killed', killPayload(run.state, victim));

  const verdict = run.emitted.find((e) => e.evt === 'law:killedAdjudicated');
  assert.ok(verdict);
  assert.equal(verdict.payload.evidenceClass, 'direct', 'eyes on the kill is direct evidence');
  const node = actNodeFor(run.state, victim.id);
  assert.ok(node);
  assert.equal(node.evidenceClass, 'direct');
  assert.ok(!nodeWhy(node).includes('unwitnessed'), 'a witnessed kill is not mislabeled');
  run.sim.dispose();
});

test('the evidence class survives the save round-trip', () => {
  const run = boot();
  const victim = civilianVictim(run.sim);
  run.bus.emit('entity:killed', killPayload(run.state, victim));

  const ledger = run.sim.registry.get('provenanceLedger');
  const saved = ledger.serialize();
  const state2 = {
    meta: { seed: SEED }, simTime: 0, tick: 0,
    playerId: 'player', player: {}, entities: new Map(),
    world: { currentSectorId: SECTOR },
  };
  const ledger2 = Object.create(provenanceLedger);
  ledger2.state = state2;
  ledger2.deserialize(saved);
  const node = actNodeFor(state2, victim.id);
  assert.ok(node, 'the chain deserializes');
  assert.equal(node.evidenceClass, 'unwitnessed', 'the mark crosses the save boundary');
  run.sim.dispose();
});

// Unit harness — the ledger alone, events in any order.

function makeBus() {
  const handlers = new Map();
  const log = [];
  return {
    emitLog: log,
    on(evt, fn) {
      if (!handlers.has(evt)) handlers.set(evt, []);
      handlers.get(evt).push(fn);
    },
    off(evt, fn) {
      handlers.set(evt, (handlers.get(evt) || []).filter((h) => h !== fn));
    },
    emit(evt, payload) {
      log.push({ evt, payload });
      for (const fn of handlers.get(evt) || []) fn(payload);
      return true;
    },
  };
}

function makeLedgerState() {
  return {
    meta: { seed: SEED },
    simTime: 50,
    tick: 100,
    mode: 'flight',
    playerId: 'player',
    player: {},
    entities: new Map(),
    world: { currentSectorId: SECTOR },
  };
}

function killTruth(victimId, extra = {}) {
  return {
    outcome: 'unwitnessed', victimEntityId: victimId, factionId: 'faction_free',
    witnessed: false, witnessCount: 0, evidenceClass: 'unwitnessed', kind: null, tick: 100,
    ...extra,
  };
}

test('a verdict arriving after the act row still stamps it', () => {
  const state = makeLedgerState();
  const bus = makeBus();
  const ledger = Object.create(provenanceLedger);
  ledger.init({ state, bus, helpers: {}, registry: { get() { return null; } } });
  bus.emit('entity:killed', killPayload(state, { id: 42, pos: { x: 1, z: 1 }, factionId: 'faction_free' }));
  assert.equal(actNodeFor(state, 42).evidenceClass, null, 'no verdict yet — bare row');
  bus.emit('law:killedAdjudicated', killTruth(42));
  assert.equal(actNodeFor(state, 42).evidenceClass, 'unwitnessed', 'late truth retro-stamps');
  ledger.destroy();
});

test('a stale-tick verdict never blesses a stranger\'s corpse', () => {
  const state = makeLedgerState();
  const bus = makeBus();
  const ledger = Object.create(provenanceLedger);
  ledger.init({ state, bus, helpers: {}, registry: { get() { return null; } } });
  bus.emit('law:killedAdjudicated', killTruth(43, { tick: 999 }));
  bus.emit('entity:killed', killPayload(state, { id: 43, pos: { x: 1, z: 1 }, factionId: 'faction_free' }));
  assert.equal(actNodeFor(state, 43).evidenceClass, null,
    'entity ids recycle — a verdict from another tick is not this kill\'s');
  ledger.destroy();
});

test('wreck testimony upgrades the mark, and destroy removes both listeners', () => {
  const state = makeLedgerState();
  const bus = makeBus();
  const ledger = Object.create(provenanceLedger);
  ledger.init({ state, bus, helpers: {}, registry: { get() { return null; } } });
  bus.emit('entity:killed', killPayload(state, { id: 44, pos: { x: 1, z: 1 }, factionId: 'faction_free' }));
  bus.emit('law:killedAdjudicated', killTruth(44));
  assert.equal(actNodeFor(state, 44).evidenceClass, 'unwitnessed');
  // The wreck talks later — the provenance relay republishes the same victim as discovered.
  bus.emit('law:killedAdjudicated', killTruth(44, { outcome: 'discovered', evidenceClass: 'discovered', tick: 101 }));
  state.tick = 101;
  assert.equal(actNodeFor(state, 44).evidenceClass, 'discovered', 'late evidence upgrades the mark');
  assert.equal(actEvidenceLabel(actNodeFor(state, 44)), 'wreck testified');
  ledger.destroy();
  bus.emit('law:killedAdjudicated', killTruth(45, { tick: 101 }));
  bus.emit('entity:killed', killPayload(state, { id: 45, pos: { x: 1, z: 1 }, factionId: 'faction_free' }));
  assert.equal(actNodeFor(state, 45), null, 'no listener survives destroy');
});
