// PB-CONS-A — SF-151 + SF-159: witness-validated intake legibility + verdict escalation windows.
//
// SF-151: a witness must actually SEE the act. Radius alone is not sight — a lawful unit or a
// civilian behind a station, a rock, or a hulk cannot testify to what it could not see, and an
// accusation built on a blind observer is a lie the player reads on their record. Only real
// cover occludes: heavy bodies (stations, asteroids, planets, wrecks, debris, sensor-blocking
// structures). Ordinary hulls are NOT cover at the 450-WU law radius — incidental traffic never
// blinds a witness.
//
// SF-159: the verdict reads the event HISTORY, not just the killing blow. An isolated contact —
// a bump, a single thrown hull — stays an accident (reckless tier). Sustained player-caused
// harm inside a bounded window means the pilot kept at it: a collision death in a continued
// attack is an unlawful kill, not a traffic mishap. Hit chips still never convict on their own.
//
// Deterministic: seeded sim, explicit simTime, direct bus events.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation } from '../src/core/sim.js';
import { heat, THRESHOLD as WANTED_THRESHOLD } from '../src/systems/heat.js';
import { lawSecurity } from '../src/systems/lawSecurity.js';
import { insertAsteroidFieldRock } from '../src/world/asteroidField.js';

const SEED = 43117;
const SECTOR = 'sector_tethys_junction';

function boot() {
  const sim = createSimulation({ seed: SEED, systems: [lawSecurity, heat] });
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

  const lawResponses = [];
  const receipts = [];
  const adjudicated = [];
  bus.on('law:response', (p) => lawResponses.push(p));
  bus.on('law:reportIncidentReceipt', (p) => receipts.push(p));
  bus.on('law:killedAdjudicated', (p) => adjudicated.push(p));
  return { sim, state, bus, player, lawResponses, receipts, adjudicated };
}

function lawfulWitness(run, pos = { x: 140, z: 0 }) {
  return run.sim.spawn({
    type: 'ship', team: 2, factionId: 'faction_scn',
    pos: { x: pos.x, z: pos.z }, hull: 80, hullMax: 80, radius: 8,
    data: { ai: { lawful: true } },
  });
}

function civilianVictim(run, pos = { x: 80, z: 0 }) {
  return run.sim.spawn({
    type: 'ship', team: 2, factionId: 'faction_free',
    pos: { x: pos.x, z: pos.z }, hull: 40, hullMax: 40, radius: 8,
    data: { shipClass: 'hauler', ai: { archetype: 'fleeing_trader' } },
  });
}

// A heavy body that is never itself a witness (non-law faction) but physically blocks a sightline.
function occludingStation(run, pos, radius = 24) {
  return run.sim.spawn({
    type: 'station', team: 2, factionId: 'faction_reach',
    pos: { x: pos.x, z: pos.z }, radius,
    data: { stationId: 'station_salvage_rock', factionId: 'faction_reach' },
  });
}

function killPayload(run, victim, overrides = {}) {
  return {
    id: victim ? victim.id : 99999,
    killerId: run.state.playerId,
    type: 'ship',
    pos: victim ? { x: victim.pos.x, z: victim.pos.z } : { x: 80, z: 0 },
    victimClass: (victim && victim.data && victim.data.shipClass) || 'hauler',
    factionId: (victim && victim.factionId) || 'faction_free',
    factionLawful: false,
    targetHostileToPlayer: false,
    ...overrides,
  };
}

function playerHit(run, victim, applied = 5) {
  run.bus.emit('combat:damage', {
    attackerId: run.state.playerId,
    targetId: victim.id,
    factionId: 'faction_free',
    factionLawful: false,
    targetHostileToPlayer: false,
    applied,
  });
}

// ── SF-151: witness validity ─────────────────────────────────────────────────────────────

test('control: a witness with a clear sightline still accuses', () => {
  const run = boot();
  const victim = civilianVictim(run);
  lawfulWitness(run, { x: 140, z: 0 });
  run.bus.emit('entity:killed', killPayload(run, victim));

  assert.equal(run.receipts.length, 1);
  assert.equal(run.receipts[0].kind, 'unlawful_kill');
  assert.ok(run.receipts[0].witnessCount >= 1);
  run.sim.dispose();
});

test('a witness fully occluded by a station cannot see the kill', () => {
  const run = boot();
  const victim = civilianVictim(run); // kill pos (80,0)
  lawfulWitness(run, { x: 140, z: 0 });
  occludingStation(run, { x: 110, z: 0 }, 24); // sits exactly on the sightline

  run.bus.emit('entity:killed', killPayload(run, victim));

  assert.equal(run.receipts.length, 0,
    'a blind observer cannot sign a murder receipt — occlusion must defeat the accusation');
  const unwitnessed = run.lawResponses.find((r) => r.action === 'kill_unwitnessed');
  assert.ok(unwitnessed, 'the law records the no-charge outcome for a kill nobody saw');
  const pending = run.state.lawSecurity && run.state.lawSecurity.unreportedKills;
  assert.ok(pending && Object.keys(pending).length === 1,
    'an occluded kill stays a pending case for later wreck testimony');
  assert.equal(run.state.player.heat, 0, 'no eyes through cover, no heat');
  run.sim.dispose();
});

test('a witness behind a compact field rock is equally blind', () => {
  const run = boot();
  const victim = civilianVictim(run);
  lawfulWitness(run, { x: 140, z: 0 });
  insertAsteroidFieldRock(run.state, { pos: { x: 110, z: 0 }, radius: 26 });

  run.bus.emit('entity:killed', killPayload(run, victim));

  assert.equal(run.receipts.length, 0, 'an asteroid big enough to hide a murder hides a murder');
  assert.equal(run.state.player.heat, 0);
  run.sim.dispose();
});

test('a second unoccluded witness still accuses when the first is blind', () => {
  const run = boot();
  const victim = civilianVictim(run);
  lawfulWitness(run, { x: 140, z: 0 });          // occluded
  lawfulWitness(run, { x: 90, z: 60 });        // clear sightline from off-axis
  occludingStation(run, { x: 110, z: 0 }, 24); // covers the x-axis witness only

  run.bus.emit('entity:killed', killPayload(run, victim));

  assert.equal(run.receipts.length, 1,
    'occlusion is per-witness: the observer who could see still testifies');
  assert.equal(run.receipts[0].kind, 'unlawful_kill');
  run.sim.dispose();
});

test('an observer who is gone cannot testify', () => {
  const run = boot();
  const victim = civilianVictim(run);
  const witness = lawfulWitness(run, { x: 140, z: 0 });
  witness.alive = false; // destroyed before the act

  run.bus.emit('entity:killed', killPayload(run, victim));

  assert.equal(run.receipts.length, 0);
  assert.equal(run.state.player.heat, 0);
  run.sim.dispose();
});

test('destroying a witness after the fact cannot erase a transmitted accusation', () => {
  const run = boot();
  const victim = civilianVictim(run);
  const witness = lawfulWitness(run, { x: 140, z: 0 });
  run.bus.emit('entity:killed', killPayload(run, victim));
  assert.equal(run.receipts.length, 1);
  const heatAfterCharge = run.state.player.heat;
  assert.ok(heatAfterCharge > 0);

  witness.alive = false; // silenced too late
  const stored = run.state.lawSecurity.reportedIncidents[run.receipts[0].reportId];
  assert.ok(stored && stored.accepted === true,
    'the stored accusation survives the witness — evidence already transmitted');
  assert.ok(stored.witnessStableIds.length >= 1);
  assert.equal(run.state.player.heat, heatAfterCharge, 'heat does not unprice a filed case');
  run.sim.dispose();
});

test('a civilian witness is bound by the same occlusion rule', () => {
  const run = boot();
  const victim = civilianVictim(run);
  // Second civilian as the only possible eye, fully occluded.
  const bystander = civilianVictim(run, { x: 140, z: 0 });
  assert.notEqual(bystander.id, victim.id);
  occludingStation(run, { x: 110, z: 0 }, 24);

  run.bus.emit('entity:killed', killPayload(run, victim));

  assert.equal(run.receipts.length, 0,
    'a hauler behind a station did not watch the venting — no charge');
  run.sim.dispose();
});

// ── SF-159: verdict escalation windows ───────────────────────────────────────────────────

test('an isolated collision kill stays a reckless accident', () => {
  const run = boot();
  const victim = civilianVictim(run);
  lawfulWitness(run, { x: 140, z: 0 });
  // One causal event — a thrown enemy, a single bump.
  playerHit(run, victim);
  run.state.simTime += 1;
  run.bus.emit('entity:killed', killPayload(run, victim, { cause: 'ship_collision' }));

  assert.equal(run.receipts.length, 1);
  assert.equal(run.receipts[0].kind, 'reckless_kill',
    'a single contact prices as reckless endangerment, not murder');
  run.sim.dispose();
});

test('sustained ramming escalates a collision death to an unlawful kill', () => {
  const run = boot();
  const victim = civilianVictim(run);
  lawfulWitness(run, { x: 140, z: 0 });
  // A continued attack: five separate damage events over five seconds, then the fatal grind.
  for (let i = 0; i < 5; i++) {
    playerHit(run, victim);
    run.state.simTime += 1;
  }
  run.bus.emit('entity:killed', killPayload(run, victim, { cause: 'ship_collision' }));

  assert.equal(run.receipts.length, 1);
  assert.equal(run.receipts[0].kind, 'unlawful_kill',
    'the pilot kept at it — a collision death inside a continued attack is murder, not a mishap');
  assert.ok(run.state.player.heat >= WANTED_THRESHOLD,
    'a sustained attack prices at the murder tier');
  run.sim.dispose();
});

test('stopping after the warning lets the window close', () => {
  const run = boot();
  const victim = civilianVictim(run);
  lawfulWitness(run, { x: 140, z: 0 });
  // Two early contacts, then a long silence, then one fatal bump.
  playerHit(run, victim);
  run.state.simTime += 1;
  playerHit(run, victim);
  run.state.simTime += 30; // the pilot backed off; history expired
  run.bus.emit('entity:killed', killPayload(run, victim, { cause: 'ship_collision' }));

  assert.equal(run.receipts[0].kind, 'reckless_kill',
    'expired history cannot convict — the escalation window is bounded');
  run.sim.dispose();
});

test('a weapon-grind finished by a bump is still a deliberate attack', () => {
  const run = boot();
  const victim = civilianVictim(run);
  lawfulWitness(run, { x: 140, z: 0 });
  for (let i = 0; i < 4; i++) {
    playerHit(run, victim);
    run.state.simTime += 1;
  }
  // The finishing blow happens to be a collision — the history says attack.
  run.bus.emit('entity:killed', killPayload(run, victim, { cause: 'ship_collision' }));

  assert.equal(run.receipts[0].kind, 'unlawful_kill',
    'the finishing blow does not launder a deliberate attack into an accident');
  run.sim.dispose();
});

test('one causal event cannot receive duplicate penalties on replay', () => {
  const run = boot();
  const victim = civilianVictim(run);
  lawfulWitness(run, { x: 140, z: 0 });
  const payload = killPayload(run, victim, { cause: 'ship_collision' });
  run.bus.emit('entity:killed', payload);
  const heatAfterFirst = run.state.player.heat;
  assert.ok(heatAfterFirst > 0);

  run.bus.emit('entity:killed', payload); // replayed event is an alias, not a new act
  assert.equal(run.state.player.heat, heatAfterFirst,
    'a replayed kill cannot double-price the same causal event');
  assert.equal(run.adjudicated.length, 2,
    'the adjudication republishes the stored truth rather than minting a second case');
  assert.equal(run.adjudicated[1].reportId, run.adjudicated[0].reportId);
  run.sim.dispose();
});
