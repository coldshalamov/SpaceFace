// SFQ-B120 — one named restitution settles only the standing that cause took.
// Paying it does not charge twice, does not clear heat, and does not pardon a different cause.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation } from '../src/core/sim.js';
import { COMMODITIES } from '../src/data/commodities.js';
import { economy } from '../src/systems/economy.js';
import { factions } from '../src/systems/factions.js';
import { heat } from '../src/systems/heat.js';
import { lawSecurity } from '../src/systems/lawSecurity.js';
import { impoundPayPrompt } from '../src/ui/impoundPayPrompt.js';
import { setPromptDeck } from '../src/ui/promptDeck.js';
import { spawnJettisonedCargoPod } from '../src/systems/lootShards.js';

const SEED = 29420;
const SECTOR = 'sector_tethys_junction';
const IRON = COMMODITIES.find((row) => row.id === 'cmdty_ore_iron');
const IRON_UNIT = Math.max(1, Math.round(Number(IRON && IRON.basePrice) || 0));

function boot(systems = [lawSecurity, factions, economy, heat]) {
  const sim = createSimulation({ seed: SEED, systems });
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
  return {
    sim, state, bus, player,
    law: sim.registry.get('lawSecurity'),
    factions: sim.registry.get('factions'),
  };
}

function witness(run) {
  return run.sim.spawn({
    type: 'ship', team: 2, factionId: 'faction_scn',
    pos: { x: 140, z: 0 }, hull: 80, hullMax: 80, radius: 8,
    data: { ai: { lawful: true } },
  });
}

function hauler(run, { name, cargo, pos }) {
  return run.sim.spawn({
    type: 'ship', team: 2, factionId: 'faction_free',
    pos: { x: pos.x, z: pos.z }, hull: 40, hullMax: 40, radius: 8,
    data: {
      name,
      shipClass: 'fighter',
      cargo,
      ai: { archetype: 'fleeing_trader' },
    },
  });
}

function kill(run, victim) {
  run.bus.emit('entity:killed', {
    id: victim.id,
    killerId: run.state.playerId,
    type: 'ship',
    pos: { x: victim.pos.x, z: victim.pos.z },
    victimClass: 'fighter',
    factionId: victim.factionId,
    factionLawful: false,
    targetHostileToPlayer: false,
    presentation: { cause: 'kinetic', surface: null, playerCaused: true },
  });
}

function standing(run, id, rep) {
  run.factions.applyRep(id, 1, 'seed_record');
  const rec = run.state.factions[id];
  rec.rep = rep;
  rec.aggro = rep <= -150;
  return rec;
}

function bill(run, person) {
  const rows = run.law.composedDisposition().filter((row) => row.kind === 'restitution' && row.forPerson === person);
  assert.equal(rows.length, 1, `one restitution bill for ${person}`);
  return rows[0];
}

function lossFor(run, causeId) {
  const rec = run.state.factions.faction_free;
  const row = (rec.causeLosses || []).find((entry) => entry.causeId === causeId);
  assert.ok(row, `standing loss recorded for ${causeId}`);
  return row;
}

test('paying a named restitution returns only that cause and does not charge twice', () => {
  const run = boot();
  witness(run);
  const rec = standing(run, 'faction_free', -140);
  run.factions.applyRep('faction_choir', 1, 'seed_record');
  const choirBefore = run.state.factions.faction_choir.rep;
  const victim = hauler(run, {
    name: 'Ivo Pell',
    cargo: { cmdty_ore_iron: 10 },
    pos: { x: 80, z: 0 },
  });
  kill(run, victim);

  const owed = bill(run, 'Ivo Pell');
  assert.equal(owed.amountCr, IRON_UNIT * 10);
  assert.equal(owed.status, 'open');
  assert.equal(run.law.restitutionFor(owed.causeId).globalExoneration, false);
  const loss = lossFor(run, owed.causeId);
  assert.equal(loss.applied, -25);
  const repAfterCrime = rec.rep;
  // The kill takes 25. A rival's approval spills one point back onto this faction, and that
  // point is not part of the bill.
  assert.equal(repAfterCrime, -140 + loss.applied - 1);
  assert.equal(rec.aggro, true);
  const heatAfterCrime = run.state.player.heat;
  assert.ok(heatAfterCrime > 0, 'the witnessed kill still heats the sheet');
  const choirAfterCrime = run.state.factions.faction_choir.rep;
  assert.ok(choirAfterCrime > choirBefore, 'a rival still approves the death');

  const paid = run.law.payComposedObligation({ kind: 'restitution', causeId: owed.causeId });
  assert.equal(paid.accepted, true);
  assert.equal(paid.obligation.status, 'paid');
  assert.equal(rec.rep, repAfterCrime - loss.applied);
  assert.equal(rec.aggro, false);
  assert.equal(loss.settled, true);
  assert.equal(run.state.player.credits, 5000 - owed.amountCr);
  assert.equal(run.state.player.heat, heatAfterCrime, 'restitution does not clear heat');
  assert.equal(run.state.paused, undefined);
  assert.ok(run.state.factions.faction_choir.rep > choirBefore, 'rival approval is not refunded');
  assert.ok(run.state.factions.faction_choir.rep >= choirAfterCrime - 8, 'only the spillover fraction moves back');

  const again = run.law.payComposedObligation({ kind: 'restitution', causeId: owed.causeId });
  assert.equal(again.accepted, false);
  assert.equal(again.reason, 'already_paid');
  assert.equal(run.state.player.credits, 5000 - owed.amountCr);
  assert.equal(rec.rep, repAfterCrime - loss.applied);
  run.sim.dispose();
});

test('a second cause, a partial pay, a warrant, and a short account leave the grudge', () => {
  const run = boot();
  witness(run);
  const rec = standing(run, 'faction_free', -140);
  const first = hauler(run, {
    name: 'Ivo Pell',
    cargo: { cmdty_ore_iron: 10 },
    pos: { x: 80, z: 0 },
  });
  const second = hauler(run, {
    name: 'Nia Voss',
    cargo: { cmdty_ore_iron: 5 },
    pos: { x: 90, z: 30 },
  });
  kill(run, first);
  kill(run, second);
  const ivo = bill(run, 'Ivo Pell');
  const nia = bill(run, 'Nia Voss');
  assert.notEqual(ivo.causeId, nia.causeId);
  const afterBoth = rec.rep;
  assert.ok(afterBoth < -165);
  assert.equal(rec.aggro, true);

  const partial = run.law.payComposedObligation({
    kind: 'restitution', causeId: ivo.causeId, amountCr: 40,
  });
  assert.equal(partial.obligation.status, 'open');
  assert.equal(rec.rep, afterBoth, 'a partial payment does not return standing');
  assert.equal(lossFor(run, ivo.causeId).settled, false);

  run.law.noteComposedObligation({
    kind: 'warrant', causeId: 'wanted:desk', amountCr: 80, label: 'local warrant',
  });
  const warrant = run.law.payComposedObligation({ kind: 'warrant', causeId: 'wanted:desk' });
  assert.equal(warrant.obligation.status, 'paid');
  assert.equal(rec.rep, afterBoth, 'a warrant does not return kill standing');
  assert.equal(run.law.restitutionFor(ivo.causeId).globalExoneration, false);

  const credits = run.state.player.credits;
  run.state.player.credits = 10;
  const short = run.law.payComposedObligation({ kind: 'restitution', causeId: ivo.causeId });
  assert.equal(short.accepted, false);
  assert.equal(short.reason, 'short');
  assert.equal(run.state.player.credits, 10);
  assert.equal(rec.rep, afterBoth);
  assert.equal(run.law.restitutionFor(ivo.causeId).status, 'open');

  run.state.player.credits = credits;
  run.law.payComposedObligation({ kind: 'restitution', causeId: ivo.causeId });
  assert.equal(lossFor(run, ivo.causeId).settled, true);
  assert.equal(lossFor(run, nia.causeId).settled, false);
  assert.ok(rec.rep < -140, 'the unpaid cause still holds its standing');
  assert.equal(rec.aggro, true);
  run.sim.dispose();
});

test('the standing loss and the settled flag survive a save', () => {
  const run = boot();
  witness(run);
  const rec = standing(run, 'faction_free', -140);
  const victim = hauler(run, {
    name: 'Ivo Pell',
    cargo: { cmdty_ore_iron: 10 },
    pos: { x: 80, z: 0 },
  });
  kill(run, victim);
  const owed = bill(run, 'Ivo Pell');
  const repAfterCrime = run.state.factions.faction_free.rep;
  const savedOpen = JSON.parse(JSON.stringify(run.factions.serialize()));
  run.factions.deserialize(savedOpen);
  assert.equal(run.state.factions.faction_free.rep, repAfterCrime);
  assert.equal(lossFor(run, owed.causeId).settled, false);

  run.law.payComposedObligation({ kind: 'restitution', causeId: owed.causeId });
  const repAfterPay = repAfterCrime + 25;
  assert.equal(run.state.factions.faction_free.rep, repAfterPay);
  const savedPaid = JSON.parse(JSON.stringify(run.factions.serialize()));
  run.state.factions.faction_free.rep = repAfterCrime;
  run.factions.deserialize(savedPaid);
  const again = run.law.payComposedObligation({ kind: 'restitution', causeId: owed.causeId });
  assert.equal(again.reason, 'already_paid');
  run.bus.emit('law:obligationPaid', {
    kind: 'restitution', causeId: owed.causeId, status: 'paid', remainingCr: 0,
  });
  assert.equal(run.state.factions.faction_free.rep, repAfterPay);
  assert.equal(lossFor(run, owed.causeId).settled, true);
  run.sim.dispose();
});

test('finding the wreck notes the cargo bill once, and paying it returns the discovered standing', () => {
  const run = boot();
  const rec = standing(run, 'faction_free', -140);
  const victim = hauler(run, {
    name: 'Ivo Pell',
    cargo: { cmdty_ore_iron: 10 },
    pos: { x: 5000, z: 0 },
  });
  kill(run, victim);
  const repAfterUnseen = rec.rep;
  assert.equal(run.law.composedDisposition().some((row) => row.kind === 'restitution'), false,
    'nobody saw it, so the bill waits with the wreck');
  assert.ok(repAfterUnseen > -150, 'an unwitnessed kill does not by itself make the faction hostile');
  const pending = run.state.lawSecurity.unreportedKills[`entity:${victim.id}`];
  assert.equal(pending.forPerson, 'Ivo Pell');
  assert.equal(pending.restitutionCr, IRON_UNIT * 10);

  const markerId = 'aft_b120_ivo';
  if (!run.state.aftermathWrecks) run.state.aftermathWrecks = { bySector: {} };
  run.state.aftermathWrecks.bySector[SECTOR] = [{
    markerId, sectorId: SECTOR, victimId: victim.id, killerId: run.state.playerId,
    pos: { x: 5000, z: 0 }, tick: run.state.tick | 0,
  }];
  run.bus.emit('scan:wreckResolved', { wreckId: victim.id, markerId, pos: { x: 5000, z: 0 } });

  const owed = bill(run, 'Ivo Pell');
  assert.equal(owed.amountCr, IRON_UNIT * 10);
  assert.equal(rec.rep, repAfterUnseen - 25);
  assert.equal(rec.aggro, true);
  const heatAfter = run.state.player.heat;
  run.bus.emit('scan:wreckResolved', { wreckId: victim.id, markerId, pos: { x: 5000, z: 0 } });
  assert.equal(bill(run, 'Ivo Pell').amountCr, owed.amountCr, 'the wreck does not stack a second bill');
  assert.equal(rec.rep, repAfterUnseen - 25);

  run.law.payComposedObligation({ kind: 'restitution', causeId: owed.causeId });
  assert.equal(rec.rep, repAfterUnseen);
  assert.equal(rec.aggro, false);
  assert.equal(run.state.player.heat, heatAfter);
  const twice = run.law.payComposedObligation({ kind: 'restitution', causeId: owed.causeId });
  assert.equal(twice.reason, 'already_paid');
  run.sim.dispose();
});

test('the flight card can pay the open bill without pausing', () => {
  const run = boot();
  witness(run);
  const offers = [];
  const resolved = [];
  setPromptDeck({
    offerDecision(spec) { offers.push(spec); return true; },
    resolveDecision(id) { resolved.push(id); },
  });
  const prompt = Object.create(impoundPayPrompt);
  prompt.init({ bus: run.bus, state: run.state });
  try {
    const victim = hauler(run, {
      name: 'Ivo Pell',
      cargo: { cmdty_ore_iron: 10 },
      pos: { x: 80, z: 0 },
    });
    kill(run, victim);
    const repAfterCrime = run.state.factions.faction_free.rep;
    assert.equal(run.state.paused, undefined);
    assert.equal(offers.length, 1);
    assert.equal(offers[0].id, 'restitution-bill');
    assert.equal(offers[0].deadlineAt ?? null, null);
    const pay = offers[0].choices.find((choice) => String(choice.id).startsWith('pay:'));
    assert.ok(pay, 'the card names the open bill');
    offers[0].onChoose(pay.id);
    const owed = bill(run, 'Ivo Pell');
    assert.equal(owed.status, 'paid');
    assert.equal(run.state.player.credits, 5000 - owed.amountCr);
    assert.equal(run.state.factions.faction_free.rep, repAfterCrime + 25);
    assert.ok(resolved.includes('restitution-bill'));
    assert.equal(run.state.paused, undefined);
  } finally {
    prompt.destroy();
    setPromptDeck(null);
    run.sim.dispose();
  }
});

test('scooping a priced pod notes one bill and paying it does not clear the theft heat', () => {
  const run = boot();
  run.state.tick = 40;
  run.sim.spawn({
    type: 'station', team: 2, factionId: 'faction_scn', pos: { x: 0, z: 0 }, radius: 42,
    data: { stationId: 'station_tethys_customs', dockRadius: 72, factionId: 'faction_scn' },
  });
  run.sim.spawn({
    type: 'ship', team: 2, factionId: 'faction_scn', pos: { x: 280, z: 20 },
    radius: 9, hull: 100, hullMax: 100,
    data: { worldRecordId: 'wr_witness_patrol', ai: { lawful: true, archetype: 'patrol_lawman' } },
  });
  const carrier = run.sim.spawn({
    type: 'ship', team: 2, factionId: 'faction_free', pos: { x: 240, z: 0 },
    radius: 16, hull: 120, hullMax: 120,
    data: { displayName: 'Mira Bluepack', ai: { role: 'hauler' } },
  });
  const pod = spawnJettisonedCargoPod(run.state, {
    pos: { x: 240, z: 0 },
    vel: { x: 0, z: 0 },
    radius: 4,
    commodityId: 'cmdty_ore_iron',
    amount: 4,
    unitMass: 0.5,
    ownerId: carrier.id,
    ownerName: 'Mira Bluepack',
    factionId: 'faction_free',
  }, { spawnEntity: (spec) => run.sim.spawn(spec) });
  assert.ok(pod, 'the priced pod spawns');
  const heatBefore = run.state.player.heat;
  run.bus.emit('tether:latched', { targetId: pod.id, type: 'tether' });
  run.bus.emit('pickup:collected', {
    pickupId: pod.id,
    collectorId: run.player.id,
    kind: 'cargo',
    commodityId: 'cmdty_ore_iron',
    amount: 4,
    acceptedAmount: 4,
    pos: { x: pod.pos.x, z: pod.pos.z },
  });
  const owed = bill(run, 'Mira Bluepack');
  assert.equal(owed.amountCr, IRON_UNIT * 4);
  assert.equal(owed.status, 'open');
  assert.equal(run.law.restitutionFor(owed.causeId).globalExoneration, false);
  const heatAfter = run.state.player.heat;
  assert.ok(heatAfter > heatBefore, 'scooping the pod still heats the sheet');
  run.law.payComposedObligation({ kind: 'restitution', causeId: owed.causeId });
  assert.equal(run.state.player.credits, 5000 - owed.amountCr);
  assert.equal(run.state.player.heat, heatAfter, 'paying restitution does not clear theft heat');
  const twice = run.law.payComposedObligation({ kind: 'restitution', causeId: owed.causeId });
  assert.equal(twice.reason, 'already_paid');
  assert.equal(run.state.player.heat, heatAfter);
  assert.equal(run.state.paused, undefined);

  const own = spawnJettisonedCargoPod(run.state, {
    pos: { x: 250, z: 10 },
    vel: { x: 0, z: 0 },
    radius: 4,
    commodityId: 'cmdty_ore_iron',
    amount: 3,
    unitMass: 0.5,
    ownerId: run.player.id,
    ownerName: 'The Pilot',
    factionId: 'faction_free',
  }, { spawnEntity: (spec) => run.sim.spawn(spec) });
  run.bus.emit('pickup:collected', {
    pickupId: own.id,
    collectorId: run.player.id,
    kind: 'cargo',
    commodityId: 'cmdty_ore_iron',
    amount: 3,
    acceptedAmount: 3,
    pos: { x: own.pos.x, z: own.pos.z },
  });
  assert.equal(
    run.law.composedDisposition().filter((row) => row.kind === 'restitution' && row.forPerson === 'The Pilot').length,
    0,
    'scooping your own jettison does not open a bill',
  );
  run.sim.dispose();
});
