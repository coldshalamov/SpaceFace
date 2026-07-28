// PQ-019B seam (b) — the heat owner consumes a validated law incident exactly once.
//
// The claim under test: heat is raised for a heist by the LAW's decision, through heat's own private
// mutation path, exactly once — across duplicate deliveries, replays, and a save reload. No mission
// writes heat, because the only door into heat is a receipt a mission cannot sign.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation } from '../src/core/sim.js';
import { heat, INCIDENT_HEAT, heatLevelFor } from '../src/systems/heat.js';
import { lawSecurity } from '../src/systems/lawSecurity.js';

const SEED = 19019;
const SECTOR = 'sector_tethys_junction';
const THEFT_POS = Object.freeze({ x: 240, z: 0 });

function boot() {
  const sim = createSimulation({ seed: SEED, systems: [lawSecurity, heat] });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = SECTOR;
  if (!state.world.sectors) state.world.sectors = {};
  state.world.sectors[SECTOR] = { id: SECTOR, factionId: 'faction_scn', security: 0.9, tier: 0 };
  state.player.heat = 0;

  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 250, z: 10 }, hull: 200, hullMax: 200, radius: 8,
  });
  state.playerId = player.id;
  sim.spawn({
    type: 'station', team: 2, factionId: 'faction_scn', pos: { x: 0, z: 0 }, radius: 42,
    data: { stationId: 'station_tethys_customs', dockRadius: 72, factionId: 'faction_scn' },
  });

  const changes = [];
  bus.on('heat:changed', (p) => changes.push(p));
  return {
    sim, state, bus, player, changes,
    law: sim.registry.get('lawSecurity'),
    heat: sim.registry.get('heat'),
  };
}

function report(overrides = {}) {
  return {
    reportId: 'heist:receipt:xyz:lawIncident',
    kind: 'payload_theft',
    offenderStableId: 'player',
    payloadStableId: 'pq019a_cargo_capsule',
    causalTick: 120,
    pos: { ...THEFT_POS },
    ...overrides,
  };
}

test('a law-accepted incident raises heat once, through heat own mutation path', () => {
  const { state, law, changes } = boot();
  assert.equal(state.player.heat, 0);

  // Reporting to LAW is the only action the mission takes. The bus does the rest.
  const receipt = law.reportIncident(report());
  assert.equal(receipt.accepted, true);

  assert.equal(state.player.heat, INCIDENT_HEAT.byKind.payload_theft);
  assert.ok(heatLevelFor(state.player.heat) > 0, 'the player is now WANTED');
  assert.equal(changes.length, 1);
  assert.match(changes[0].reason, /law incident/);
  assert.equal(state.player.heatZone.active, true, 'the search zone follows from heat own logic');
});

test('duplicate deliveries of the same receipt never double-apply', () => {
  const { state, bus, law } = boot();
  const receipt = law.reportIncident(report());
  const after = state.player.heat;

  for (let i = 0; i < 5; i++) bus.emit('law:reportIncidentReceipt', receipt);
  // ...and a duplicate REPORT, which law answers with the same receipt, re-enters the same listener.
  for (let i = 0; i < 3; i++) law.reportIncident(report());

  assert.equal(state.player.heat, after, 'heat moved exactly once');
  assert.equal(Object.keys(state.player.heatIncidentsApplied).length, 1);
});

test('a direct second call returns already_applied rather than raising again', () => {
  const { state, law, heat: heatSys } = boot();
  const receipt = law.reportIncident(report());
  const after = state.player.heat;
  const again = heatSys.applyIncidentReceipt(receipt);
  assert.equal(again.applied, false);
  assert.equal(again.reason, 'already_applied');
  assert.equal(again.delta, 0);
  assert.equal(state.player.heat, after);
});

test('two DIFFERENT validated incidents each apply once', () => {
  const { state, law } = boot();
  law.reportIncident(report({ reportId: 'r1' }));
  const first = state.player.heat;
  law.reportIncident(report({ reportId: 'r2', causalTick: 140 }));
  assert.ok(state.player.heat > first, 'a genuinely different crime still counts');
  assert.equal(Object.keys(state.player.heatIncidentsApplied).length, 2);
});

test('a denial applies no heat and records nothing', () => {
  const { state, law, changes } = boot();
  const denial = law.reportIncident(report({ pos: { x: 90000, z: 90000 } }));
  assert.equal(denial.accepted, false);
  assert.equal(state.player.heat, 0);
  assert.equal(changes.length, 0);
  assert.equal(state.player.heatIncidentsApplied, undefined,
    'no ledger key may materialize for a crime the law refused');
});

test('heat refuses anything that is not a law-signed accepted receipt', () => {
  const { state, heat: heatSys } = boot();
  const signed = {
    accepted: true, source: 'lawSecurity', validatedWitnessedTheft: true,
    incidentReceiptId: 'law:incident:real', kind: 'payload_theft',
  };
  const forgeries = [
    [null, 'no_receipt'],
    ['law:incident:real', 'no_receipt'],
    [{ ...signed, accepted: false }, 'not_law_validated'],
    [{ ...signed, source: 'missions' }, 'not_law_validated'],
    [{ ...signed, source: undefined }, 'not_law_validated'],
    [{ ...signed, validatedWitnessedTheft: false }, 'not_witnessed'],
    [{ ...signed, incidentReceiptId: '' }, 'invalid_receipt_id'],
    [{ ...signed, incidentReceiptId: 42 }, 'invalid_receipt_id'],
  ];
  for (const [payload, reason] of forgeries) {
    const out = heatSys.applyIncidentReceipt(payload);
    assert.equal(out.applied, false, JSON.stringify(payload));
    assert.equal(out.reason, reason, JSON.stringify(payload));
  }
  assert.equal(state.player.heat, 0);
  assert.equal(state.player.heatIncidentsApplied, undefined);
});

test('an unpriced but validated incident kind still raises the fallback, never nothing', () => {
  const { state, law } = boot();
  const receipt = law.reportIncident(report({ kind: 'some_future_crime' }));
  assert.equal(receipt.accepted, true);
  assert.equal(state.player.heat, INCIDENT_HEAT.fallback);
  assert.equal(INCIDENT_HEAT.byKind.some_future_crime, undefined, 'deliberately unpriced');
});

test('the applied ledger survives a save reload, so a replayed receipt is still refused', () => {
  const { state, law } = boot();
  const receipt = law.reportIncident(report());
  const heatAfter = state.player.heat;

  // The save owner serializes state.player wholesale (clonePlain minus cargo), so a JSON round-trip
  // of the player record is a faithful stand-in for the real save boundary.
  const savedPlayer = JSON.parse(JSON.stringify(state.player));
  assert.deepEqual(Object.keys(savedPlayer.heatIncidentsApplied), [receipt.incidentReceiptId]);

  const reloaded = boot();
  reloaded.state.player.heat = savedPlayer.heat;
  reloaded.state.player.heatIncidentsApplied = savedPlayer.heatIncidentsApplied;

  const replay = reloaded.heat.applyIncidentReceipt(receipt);
  assert.equal(replay.applied, false);
  assert.equal(replay.reason, 'already_applied');
  assert.equal(reloaded.state.player.heat, heatAfter, 'reload + retry must not double-charge');
});

test('the incident path does not disturb heat existing sources or decay', () => {
  const { sim, state, law } = boot();
  law.reportIncident(report());
  const raised = state.player.heat;
  assert.ok(raised > 0);

  // Escape the search zone: heat's own decay must still run untouched.
  const player = state.entities.get(state.playerId);
  player.pos.x = state.player.heatZone.center.x + state.player.heatZone.radius + 5000;
  for (let i = 0; i < 400; i++) sim.step();
  assert.ok(state.player.heat < raised, 'the escape path still lowers heat');

  // ...and the spent incident is still spent: decaying to clean does not re-arm the crime.
  const receipt = law.reportIncident(report());
  const before = state.player.heat;
  assert.equal(receipt.accepted, true);
  assert.equal(state.player.heat, before);
});
