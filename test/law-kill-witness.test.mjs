// The kill seam, witnessed: entity:killed → law adjudication → signed receipt → heat → pursuit.
//
// The design contract under test — the explicit design call this file pins:
//
//   * A CLEARLY HOSTILE target is a lawful kill wherever it happens. Self-defense and declared
//     bounty work are legal force; the law clears the shooter on the record when it could see.
//   * A target that only turned hostile because the player shot first is NOT a clear hostile —
//     retaliation cannot launder a murder into self-defense (frozen first-hit truth).
//   * A non-hostile kill is a crime ONLY when the law can see it: inside a lawful station's
//     protection ring, under a lawful/marked witness, under a protected civilian's eyes, or when
//     the victim itself belonged to the law network (the law always records its own dead).
//   * An unseen crime cannot be charged — unwitnessed kills mint no heat.
//   * Heat reaches heat ONLY through the law-signed receipt. Nothing else writes player.heat.
//   * SCAN/BOUNTY clear lawfully at a lawful dock: real credits through the economy owner, then
//     heat:clear. NETS/IMPOUND never pay their way out.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation } from '../src/core/sim.js';
import { heat, heatLevelFor, THRESHOLD as WANTED_THRESHOLD } from '../src/systems/heat.js';
import { lawSecurity } from '../src/systems/lawSecurity.js';
import { combat } from '../src/systems/combat.js';

const SEED = 43117;
const SECTOR = 'sector_tethys_junction';

function boot({ withStation = true } = {}) {
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

  let station = null;
  if (withStation) {
    station = sim.spawn({
      type: 'station', team: 2, factionId: 'faction_scn', pos: { x: 0, z: 0 }, radius: 42,
      data: { stationId: 'station_tethys_customs', dockRadius: 72, factionId: 'faction_scn' },
    });
  }

  const lawResponses = [];
  const receipts = [];
  const charges = [];
  const clears = [];
  const dispatches = [];
  bus.on('law:response', (p) => lawResponses.push(p));
  bus.on('law:reportIncidentReceipt', (p) => receipts.push(p));
  bus.on('economy:chargeCredits', (p) => charges.push(p));
  bus.on('heat:clear', (p) => clears.push(p));
  bus.on('law:dispatchStarted', (p) => dispatches.push(p));
  return { sim, state, bus, player, station, lawResponses, receipts, charges, clears, dispatches };
}

function lawfulWitness(run, pos = { x: 120, z: 0 }) {
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

test('an unwitnessed non-hostile kill is charged as nothing', () => {
  const run = boot({ withStation: false });
  const victim = civilianVictim(run);
  run.bus.emit('entity:killed', killPayload(run, victim));

  assert.equal(run.state.player.heat, 0, 'no eyes, no charge — the witness gate holds');
  assert.equal(run.receipts.length, 0);
  const unwitnessed = run.lawResponses.find((r) => r.action === 'kill_unwitnessed');
  assert.ok(unwitnessed, 'the law records the no-charge outcome explicitly');
  assert.equal(unwitnessed.outcome, 'no_charge');
  run.sim.dispose();
});

test('a witnessed civilian kill validates a crime and crosses WANTED', () => {
  const run = boot({ withStation: false });
  const victim = civilianVictim(run);
  lawfulWitness(run, { x: 140, z: 0 });
  run.bus.emit('entity:killed', killPayload(run, victim));

  assert.equal(run.receipts.length, 1);
  assert.equal(run.receipts[0].accepted, true);
  assert.equal(run.receipts[0].validatedCrime, true);
  assert.ok(run.receipts[0].witnessCount >= 1);
  assert.ok(run.state.player.heat >= WANTED_THRESHOLD,
    `witnessed murder heat ${run.state.player.heat} must cross WANTED`);
  const validated = run.lawResponses.find((r) => r.action === 'crime_validated');
  assert.ok(validated, 'the canonical law response records the validated crime');
  run.sim.dispose();
});

test('a lawful defensive kill is cleared on the record and mints zero heat', () => {
  const run = boot({ withStation: false });
  const victim = civilianVictim(run);
  lawfulWitness(run, { x: 140, z: 0 });
  // Declared hostile: the frozen first-hit truth says the player was attacked or hunting bounty.
  run.bus.emit('entity:killed', killPayload(run, victim, { targetHostileToPlayer: true }));

  assert.equal(run.state.player.heat, 0, 'legal force must never mint heat');
  assert.equal(run.receipts.length, 0, 'a clean kill signs no crime receipt');
  const cleared = run.lawResponses.find((r) => r.action === 'kill_adjudicated');
  assert.ok(cleared, 'the law clears the shooter on the record where it could see');
  assert.equal(cleared.outcome, 'lawful');
  run.sim.dispose();
});

test('a civilian who only fought back is still a murder victim, not a hostile', () => {
  const run = boot({ withStation: false });
  const victim = civilianVictim(run);
  // The legacy path: no frozen flag, and the victim's live hostility exists ONLY because it
  // retaliated to the player's first shot. isHostileToPlayer alone would call this hostile —
  // the provoked-retaliation guard is the whole design call.
  victim.data.ai.retaliationTargetId = run.state.playerId;
  lawfulWitness(run, { x: 140, z: 0 });
  const payload = killPayload(run, victim);
  delete payload.targetHostileToPlayer;
  run.bus.emit('entity:killed', payload);

  assert.ok(run.state.player.heat >= WANTED_THRESHOLD,
    'retaliation cannot launder first-shot murder into self-defense');
  assert.equal(run.receipts[0].kind, 'unlawful_kill');
  run.sim.dispose();
});

test('a lawful-network victim is always visible to the law, even with no eyes present', () => {
  const run = boot({ withStation: false });
  const victim = lawfulWitness(run, { x: 80, z: 0 }); // a patrol hull — the law's own
  victim.pos.x = 4000; victim.pos.z = 4000; // drag the scene far from every other actor
  run.bus.emit('entity:killed', killPayload(run, victim, {
    pos: { x: 4000, z: 4000 }, factionLawful: true,
  }));

  assert.ok(run.state.player.heat >= WANTED_THRESHOLD,
    'the law network records its own dead — murdering a patrol needs no bystander');
  assert.equal(run.receipts[0].kind, 'lawful_kill');
  run.sim.dispose();
});

test('a witnessed murder inside a protection ring opens a real pursuit', () => {
  const run = boot({ withStation: true });
  const victim = civilianVictim(run);
  lawfulWitness(run, { x: 140, z: 0 });
  // Kill inside the station ring: pos near the station at origin.
  run.bus.emit('entity:killed', killPayload(run, victim, {
    pos: { x: 100, z: 0 },
  }));

  // Dispatch runs on the incident cadence, not in the kill's emit cascade.
  for (let i = 0; i < 240 && run.dispatches.length === 0; i++) run.sim.step();

  assert.ok(run.dispatches.length >= 1, 'law:dispatchStarted fires for the pursuit');
  const patrol = run.lawResponses.find((r) => r.action === 'patrol_dispatched');
  assert.ok(patrol, 'canonical law response names the dispatched patrol');
  assert.ok(Array.isArray(patrol.responderIds) && patrol.responderIds.length >= 1,
    'a real responder hull is assigned, not a phantom');
  run.sim.dispose();
});

test('manifest pod theft reports a witnessed crime — but never double-prices the murder', () => {
  const run = boot({ withStation: true });
  const victim = civilianVictim(run);
  lawfulWitness(run, { x: 140, z: 0 });

  // The pod is the victim's spilled cargo manifest.
  const pod = run.sim.spawn({
    type: 'payload', pos: { x: 84, z: 0 }, radius: 4,
    data: {
      payloadType: 'civilian_manifest',
      ownerId: victim.id,
      salvagePool: { cmdty_ore: 4 },
    },
  });

  // First the murder, witnessed and validated.
  run.bus.emit('entity:killed', killPayload(run, victim));
  const killReceipts = run.receipts.length;
  assert.ok(killReceipts >= 1);
  const heatAfterKill = run.state.player.heat;

  // Scooping the victim's own manifest pod must not charge the scene twice.
  run.bus.emit('pickup:collected', {
    pickupId: pod.id, collectorId: run.state.playerId, kind: 'cargo', amount: 4,
  });
  assert.equal(run.receipts.length, killReceipts,
    'the murder receipt already priced the scene — the pod adds no second crime');
  assert.equal(run.state.player.heat, heatAfterKill);
  run.sim.dispose();
});

test('a manifest pod collected with NO validated kill still reports the theft', () => {
  const run = boot({ withStation: true });
  const victim = civilianVictim(run);
  lawfulWitness(run, { x: 140, z: 0 });

  const pod = run.sim.spawn({
    type: 'payload', pos: { x: 84, z: 0 }, radius: 4,
    data: {
      payloadType: 'civilian_manifest',
      ownerId: victim.id,
      salvagePool: { cmdty_ore: 4 },
    },
  });

  // The victim died to something else (or the kill went unseen) — taking the pod is its own crime.
  run.bus.emit('pickup:collected', {
    pickupId: pod.id, collectorId: run.state.playerId, kind: 'cargo', amount: 4,
  });
  assert.equal(run.receipts.length, 1);
  assert.equal(run.receipts[0].kind, 'payload_theft');
  assert.ok(run.state.player.heat > 0, 'witnessed cargo theft raises heat through the same door');
  run.sim.dispose();
});

test('docking at a lawful station clears scan-tier heat for a real fine', () => {
  const run = boot({ withStation: true });
  run.state.player.heat = 0.2; // SCAN tier (level 1)
  const before = run.state.player.credits;

  run.bus.emit('dock:docked', { stationId: 'station_tethys_customs' });

  assert.equal(run.charges.length, 1, 'the economy owner is asked for the fine');
  const fine = run.charges[0].amount;
  assert.equal(fine, 150 + 100 * 1, 'level-1 fine = base + per-level');
  assert.equal(run.clears.length, 1, 'the heat owner is asked to clear');
  const paid = run.lawResponses.find((r) => r.action === 'fine_paid');
  assert.ok(paid, 'the canonical response records the paid clearance');
  assert.equal(paid.fineCr, fine);
  assert.ok(before >= fine, 'the pilot could actually pay');
  run.sim.dispose();
});

test('nets-tier heat does not pay its way out at a dock', () => {
  const run = boot({ withStation: true });
  run.state.player.heat = 0.65; // NETS band (level 3+)

  run.bus.emit('dock:docked', { stationId: 'station_tethys_customs' });

  assert.equal(run.charges.length, 0, 'no fine is assessed above the escapable tiers');
  assert.equal(run.clears.length, 0, 'heat stands — nobody pays to walk out of a net');
  run.sim.dispose();
});

test('an unpaid fine keeps the heat', () => {
  const run = boot({ withStation: true });
  run.state.player.heat = 0.2;
  run.state.player.credits = 10; // cannot cover the assessed fine

  run.bus.emit('dock:docked', { stationId: 'station_tethys_customs' });

  assert.equal(run.charges.length, 0, 'economy is never asked for credits the pilot lacks');
  assert.equal(run.clears.length, 0, 'the sheet stands — escaping consequences is never free');
  const denied = run.lawResponses.find((r) => r.action === 'fine_unpaid');
  assert.ok(denied);
  assert.ok(denied.shortfallCr > 0);
  run.sim.dispose();
});

test('unprovoked hit chips alone can never convict', () => {
  const run = boot({ withStation: false });
  const victim = civilianVictim(run);
  for (let i = 0; i < 60; i++) {
    run.bus.emit('combat:damage', {
      attackerId: run.state.playerId,
      targetId: victim.id,
      factionId: 'faction_free',
      factionLawful: false,
      targetHostileToPlayer: false,
      applied: 3,
    });
  }
  assert.ok(run.state.player.heat < WANTED_THRESHOLD,
    `suspicion caps below WANTED (${run.state.player.heat}) — a validated receipt must convict`);
  run.sim.dispose();
});

test('production combat: hostile encounter kill is clean even in front of the law', () => {
  const sim = createSimulation({ seed: SEED, systems: [lawSecurity, combat, heat] });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.player.heat = 0;
  const player = sim.spawn({
    type: 'ship', team: 0, factionId: 'faction_free', pos: { x: 0, z: 0 },
    hull: 200, hullMax: 200, radius: 8,
  });
  state.playerId = player.id;
  state.factions.faction_reach = { rep: -50, aggro: false };
  const hostile = sim.spawn({
    type: 'ship', team: 1, factionId: 'faction_reach', pos: { x: 80, z: 0 },
    hull: 20, hullMax: 20, shield: 0, shieldMax: 0, armorHp: 0, armorMax: 0,
    data: { shipClass: 'fighter', ai: { lawful: false, spawnContext: 'encounter', hostileTeams: [0] } },
  });
  const lawResponses = [];
  bus.on('law:response', (p) => lawResponses.push(p));

  const combatSys = sim.registry.get('combat');
  combatSys.onHit({
    targetId: hostile.id, ownerId: player.id, damage: 1000,
    damageType: 'kinetic', pos: { x: hostile.pos.x, z: hostile.pos.z },
    weaponId: 'wpn_pulse_laser_s',
  });

  assert.equal(state.player.heat, 0, 'a declared-hostile kill is lawful force — zero heat');
  sim.dispose();
});
