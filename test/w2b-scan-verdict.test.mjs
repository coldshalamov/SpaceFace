// W2-B O11 — contracts bust (and "Cargo intact" breaches) on the scan's REAL verdict. Economy
// announces the scan before it applies the verdict, so a bare "scanned with contraband aboard"
// packet used to fail the run even when the detection roll was evaded.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { hash32, mulberry32 } from '../src/core/rng.js';
import { clauseById } from '../src/data/contractClauses.js';
import { contractClausesSystem } from '../src/systems/contractClauses.js';
import { economy as economyProto } from '../src/systems/economy.js';
import { missions as missionsProto } from '../src/systems/missions.js';

const CMDTY = 'cmdty_filament_sample';

function clauseRow(id) {
  const c = clauseById(id);
  return { id: c.id, event: c.event, label: c.label, prose: c.prose, rewardMult: c.rewardMult };
}

function smugglingOffer(clauses = []) {
  return {
    id: 'offer_w2b_smuggle', type: 'smuggling_run', stationId: 'station_helios',
    factionId: 'faction_mts', params: { cmdtyId: CMDTY, qty: 1 }, reward_cr: 1200,
    collateral_cr: 150, riskTier: 3, destStationId: 'station_beltout', destSectorId: 'sector_ceres_belt',
    distance: 1200, title: 'Run the sealed ledger', summary: 'Carry the lot past customs.',
    source: 'careerContract', preloadedCargo: true, clauses,
  };
}

function boot(offer) {
  const state = createGameState(4242);
  state.mode = 'flight';
  state.settings.gameplay.tutorialHints = false;
  state.player.credits = 5000;
  state.world.currentSectorId = 'sector_helios_prime';
  state.factions.faction_mts = { ...state.factions.faction_mts, rep: 500 };
  state.missions.boards = { [offer.stationId]: { refreshEpoch: 0, slots: [offer] } };
  const bus = createBus();
  const log = [];
  for (const name of ['mission:failed', 'mission:completed', 'contract:clauseBroken', 'contraband:scanned',
    'player:scannedByPatrol', 'economy:chargeCredits']) bus.on(name, (p) => log.push({ name, payload: p }));
  const missions = Object.assign({}, missionsProto);
  const clauses = Object.assign({}, contractClausesSystem);
  const economy = Object.create(economyProto);
  const helpers = { hash32, mulberry32, voice: { say: () => true } };
  const slots = { missions, economy };
  const registry = { get: (id) => slots[id] || null };
  const ctx = { state, bus, helpers, registry };
  economy.init(ctx);
  missions.init(ctx);
  clauses.init(ctx);
  bus.emit('ui:acceptMission', { missionId: offer.id });
  assert.equal(state.missions.active.length, 1, 'the run was accepted');
  assert.ok((state.player.cargo.items[CMDTY] || 0) >= 1, 'the contraband lot is aboard');
  const count = (name) => log.filter((e) => e.name === name).length;
  /** Run the REAL scan with the detection roll forced (roll > chance evades). */
  const scan = (roll) => {
    economy._rng = () => roll;
    return economy.runScan({ source: 'test', stationId: 'station_helios', patrolId: 9, factionId: 'faction_scn' });
  };
  return { state, bus, missions, economy, clauses, log, count, scan };
}

test('an evaded scan keeps the smuggling run and the lot', () => {
  const h = boot(smugglingOffer());
  const result = h.scan(0.999999);
  assert.deepEqual({ found: result.found, evaded: result.evaded }, { found: false, evaded: true });
  const scanned = h.log.find((e) => e.name === 'player:scannedByPatrol').payload;
  assert.equal(scanned.hasContraband, true, 'contraband was aboard when the scan ran');
  assert.equal(scanned.detected, false, 'the packet carries the real verdict');
  assert.equal(h.count('mission:failed'), 0, 'an evaded scan is not a bust');
  assert.equal(h.state.missions.active.length, 1);
  assert.equal(h.state.missions.active[0].status, 'active');
  assert.ok(h.state.player.cargo.items[CMDTY] >= 1, 'nothing was confiscated');
  assert.equal(h.count('contraband:scanned'), 0);
  h.clauses.destroy();
});

test('a found scan still busts the run and confiscates the lot', () => {
  const h = boot(smugglingOffer());
  const result = h.scan(0);
  assert.equal(result.found, true);
  assert.equal(h.log.find((e) => e.name === 'player:scannedByPatrol').payload.detected, true);
  assert.equal(h.count('contraband:scanned'), 1);
  assert.equal(h.count('mission:failed'), 1);
  const failed = h.log.find((e) => e.name === 'mission:failed').payload;
  assert.equal(failed.reason, 'busted');
  assert.equal(h.state.player.cargo.items[CMDTY] || 0, 0, 'customs took the lot');
  h.clauses.destroy();
});

test('Cargo intact survives an evaded scan and breaks on a found one', () => {
  const evaded = boot(smugglingOffer([clauseRow('cargo_intact')]));
  evaded.scan(0.999999);
  assert.equal(evaded.count('contract:clauseBroken'), 0, 'an evaded scan leaves the clause standing');
  assert.equal(evaded.count('mission:failed'), 0);
  assert.equal(evaded.state.missions.active.length, 1);
  evaded.clauses.destroy();

  const caught = boot(smugglingOffer([clauseRow('cargo_intact')]));
  caught.scan(0);
  assert.equal(caught.count('contract:clauseBroken'), 1);
  assert.equal(caught.count('mission:failed'), 1);
  assert.equal(caught.log.find((e) => e.name === 'mission:failed').payload.reason, 'clause_broken:cargo_intact');
  caught.clauses.destroy();
});

test('a clause that forbids any scan still breaks on an evaded one', () => {
  const h = boot(smugglingOffer([clauseRow('no_scan')]));
  h.scan(0.999999);
  assert.equal(h.count('contract:clauseBroken'), 1, 'No scans is about being scanned, not being caught');
  assert.equal(h.log.find((e) => e.name === 'mission:failed').payload.reason, 'clause_broken:no_scan');
  h.clauses.destroy();
});

test('a hand-emitted contraband scan packet with no verdict key keeps its old meaning', () => {
  const h = boot(smugglingOffer());
  h.bus.emit('player:scannedByPatrol', { hasContraband: true, patrolId: 9 });
  assert.equal(h.count('mission:failed'), 1);
  h.clauses.destroy();
});
