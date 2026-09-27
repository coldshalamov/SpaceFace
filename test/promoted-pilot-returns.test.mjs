// THE PIRATE WHO GOT AWAY — a generic fleeing pirate is minted into a named pilot whose
// return rides the existing aceMemory promoted-return machinery: deterministic callsign and
// epithet from (seed, entity id), a stored grudge, spawn-budgeted return, a "you again" line,
// chronicler fact, and save/load round-trip. Civilians, player-side hulls, scripted entities
// and authored aces are never promoted. Headless; fixed seeds.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { aceMemory } from '../src/systems/aceMemory.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';
import { pirateDisengage } from '../src/systems/pirateDisengage.js';
import { chronicler } from '../src/systems/chronicler.js';
import {
  PROMOTED_PILOT_EXPIRY_S,
  PROMOTED_PILOT_MAX,
  promotedPilotIdFor,
  promotedPilotIdentity,
} from '../src/data/pilotCallsigns.js';
import { ACE_LOYALTY_WORK_AT } from '../src/data/namedAces.js';
import { revealMoralDebt } from '../src/systems/moralMemory.js';

const SEED = 4242;
const SECTOR = 'sector_helios_prime';

function boot(seed = SEED) {
  const sim = createSimulation({
    seed,
    systems: [spawnBudget, aceMemory, pirateDisengage, chronicler],
  });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = SECTOR;
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    radius: 8, mass: 100, hull: 100, hullMax: 100,
    data: { intent: {}, ai: {} },
  });
  state.playerId = player.id;

  const voiceLines = [];
  const aceSystem = sim.registry.get('aceMemory');
  aceSystem.helpers = {
    ...aceSystem.helpers,
    voice: {
      say(payload) {
        voiceLines.push(payload);
        return true;
      },
    },
  };
  const events = [];
  for (const name of [
    'aceMemory:pilotPromoted', 'aceMemory:transition', 'aceMemory:returnSpawned',
    'aceMemory:workOffered', 'aceMemory:voice', 'toast',
  ]) {
    bus.on(name, (payload) => events.push({ name, payload }));
  }
  return { sim, state, bus, player, voiceLines, events, aceSystem };
}

function spawnPirate(t, opts = {}) {
  return t.sim.spawn({
    type: 'ship',
    team: opts.team ?? 1,
    pos: opts.pos || { x: 400, z: 0 },
    vel: { x: 0, z: 0 },
    radius: 6,
    mass: 60,
    hull: opts.hull ?? 100,
    hullMax: opts.hullMax ?? 100,
    data: {
      enemyTypeId: 'corsair_raider',
      level: 4,
      intent: {},
      ai: {
        archetype: 'pirate_raider',
        squadId: opts.squadId || 'sq_test',
        forcePlayerTarget: true,
        hostileTeams: [0],
        ...(opts.ai || {}),
      },
      ...(opts.data || {}),
    },
  });
}

function emitFled(t, entity, extra = {}) {
  t.bus.emit('pirateDisengage:triggered', {
    squadId: (entity.data && entity.data.ai && entity.data.ai.squadId) || 'sq_test',
    patrolId: null,
    memberIds: [entity.id],
    reason: 'damage-retreat',
    outcome: 'fled',
    t: t.state.simTime,
    ...extra,
  });
}

function livePromotedRecords(memory) {
  return Object.entries(memory)
    .filter(([id, rec]) => !/^(schemaVersion|news|activeReturns|cultureIntros|planetChallenges|playerStyle)$/.test(id)
      && rec && rec.promoted === true && rec.expired !== true && rec.defeated !== true)
    .map(([, rec]) => rec);
}

function advanceTo(t, target) {
  if (t.state.simTime < target) t.state.simTime = target;
  t.sim.runTicks(Math.ceil(0.6 / SIM_DT));
}

test('generic fled pirate is promoted into a named pilot with a scheduled return', () => {
  const t = boot();
  const pirate = spawnPirate(t);
  emitFled(t, pirate);

  const pilotId = promotedPilotIdFor(pirate.id);
  const rec = t.state.aceMemory[pilotId];
  assert.ok(rec, 'a promoted record exists under the deterministic pilot id');
  assert.equal(rec.promoted, true);
  assert.equal(rec.fled, true);
  assert.equal(rec.fleeCount, 1);
  assert.equal(rec.returnScheduled, true);
  assert.ok(Number.isFinite(rec.returnAt) && rec.returnAt > 0, 'return is scheduled in the future');
  assert.equal(rec.grudgeKey, 'fled_fire', 'the grudge names what the player did');
  assert.equal(rec.grudgeLabel, 'fled your fire');
  assert.equal(rec.sourceEntityId, pirate.id);

  // Deterministic identity: same (seed, entity id) mints the same callsign/crew.
  const identity = promotedPilotIdentity(SEED, pirate.id);
  assert.equal(rec.name, identity.name, 'callsign matches the deterministic mint');
  assert.equal(rec.crew, identity.crew);
  assert.equal(rec.epithet, identity.epithet);

  // The fleeing hull wears the minted name immediately.
  assert.equal(pirate.data.ai.name, identity.name);
  assert.equal(pirate.data.callsign, identity.name);
  assert.equal(pirate.data.promotedPilot.id, pilotId);

  // The world learns the name: promotion event + a fled transition + a toast beat.
  const promoted = t.events.find((row) => row.name === 'aceMemory:pilotPromoted');
  assert.ok(promoted, 'aceMemory:pilotPromoted fires');
  assert.equal(promoted.payload.aceId, pilotId);
  assert.equal(promoted.payload.aceName, identity.name);
  assert.equal(promoted.payload.grudgeKey, 'fled_fire');
  const fled = t.events.find((row) => row.name === 'aceMemory:transition'
    && row.payload.aceId === pilotId && row.payload.transition === 'fled');
  assert.ok(fled, 'the fled transition fires through the shared ace ledger');
  assert.ok(t.events.some((row) => row.name === 'toast'), 'the escape toast fires');

  // The grudge context persists in the moral-debt ledger.
  const debt = t.state.story.moralMemory.debts[pilotId];
  assert.ok(debt, 'a moral debt records the pilot');
  assert.equal(debt.name, identity.name);
  assert.equal(debt.status, 'pending');

  // The chronicler holds the promotion fact.
  const fact = t.state.chronicler.pending.find((f) => f.stage === 'ace'
    && f.subject && f.subject.id === pilotId);
  assert.ok(fact, 'chronicler captured the promotion');
  assert.equal(fact.details.transition, 'encountered');
});

test('pirateDisengage detects a hurt generic pirate and aceMemory promotes it end-to-end', () => {
  const t = boot();
  const pirate = spawnPirate(t, { hull: 25, hullMax: 100 });
  // Nerve delay is 1 s of sim time; 120 ticks covers it with margin.
  t.sim.runTicks(120);

  const rec = t.state.aceMemory[promotedPilotIdFor(pirate.id)];
  assert.ok(rec && rec.promoted === true,
    'the real pirateDisengage pipeline promotes the fleeing hull');
});

test('repeat escape dedupes by entity id and climbs the return tier', () => {
  const t = boot();
  const pirate = spawnPirate(t);
  emitFled(t, pirate);
  emitFled(t, pirate);

  const promoted = Object.values(t.state.aceMemory)
    .filter((rec) => rec && rec.promoted === true);
  assert.equal(promoted.length, 1, 'same entity id mints one record');
  assert.equal(promoted[0].fleeCount, 2, 'the second escape is counted on the same record');
  assert.equal(promoted[0].returnTier, 2, 'the return climbs a tier');
});

test('civilians, player-side, named and scripted hulls are never promoted', () => {
  const t = boot();
  const civilian = spawnPirate(t, { team: 2, squadId: 'sq_civ' });
  const escort = spawnPirate(t, { team: 0, squadId: 'sq_esc' });
  const named = spawnPirate(t, { squadId: 'sq_named', ai: { name: 'Captain Already' } });
  const scripted = spawnPirate(t, { squadId: 'sq_script', data: { missionTag: 'm_guard' } });
  const boss = spawnPirate(t, { squadId: 'sq_boss', data: { encounterBoss: true } });
  for (const entity of [civilian, escort, named, scripted, boss]) emitFled(t, entity);

  for (const entity of [civilian, escort, named, scripted, boss]) {
    assert.equal(t.state.aceMemory[promotedPilotIdFor(entity.id)], undefined,
      `no promoted record for entity ${entity.id}`);
  }
  assert.equal(
    Object.values(t.state.aceMemory).filter((rec) => rec && rec.promoted === true).length,
    0,
    'nothing was promoted',
  );
});

test('the promoted ledger is capped: the oldest live record is written off at the cap', () => {
  const t = boot();
  const total = PROMOTED_PILOT_MAX + 3;
  for (let i = 0; i < total; i++) {
    const pirate = spawnPirate(t, { squadId: `sq_cap_${i}` });
    t.state.simTime += 1; // distinct fledAt ordering for deterministic eviction
    emitFled(t, pirate);
  }
  const promoted = Object.values(t.state.aceMemory)
    .filter((rec) => rec && rec.promoted === true);
  assert.equal(promoted.length, total, 'every promotion is recorded');
  const live = livePromotedRecords(t.state.aceMemory);
  assert.ok(live.length <= PROMOTED_PILOT_MAX,
    `live promoted records stay bounded at ${PROMOTED_PILOT_MAX}`);
  assert.equal(total - live.length, 3, 'the three oldest are written off');
  for (const rec of promoted.filter((r) => !live.includes(r))) {
    assert.equal(rec.expired, true, 'evicted records are expired, not deleted');
    assert.equal(rec.returnScheduled, false);
  }
});

test('a promoted pilot returns through aceMemory with name, grudge and a spoken line', () => {
  const t = boot();
  const pirate = spawnPirate(t);
  emitFled(t, pirate);
  const pilotId = promotedPilotIdFor(pirate.id);
  const rec = t.state.aceMemory[pilotId];
  const identity = promotedPilotIdentity(SEED, pirate.id);

  advanceTo(t, rec.returnAt + 1);

  // fled_fire is a violent grudge — the pilot comes back hunting, not offering work.
  assert.equal(rec.stance, 'hunts');
  const spawned = t.events.find((row) => row.name === 'aceMemory:returnSpawned'
    && row.payload.aceId === pilotId);
  assert.ok(spawned, 'the promoted return fires through the existing spawn path');
  const boss = t.state.entities.get(spawned.payload.spawnedIds[0]);
  assert.ok(boss && boss.alive !== false, 'the returning pilot is a live body');
  assert.equal(boss.data.aceMemory.aceId, pilotId);
  assert.equal(boss.data.aceMemory.promoted, true);
  assert.equal(boss.data.aceMemory.grudgeKey, 'fled_fire');
  assert.equal(boss.data.aceMemory.grudgeLabel, 'fled your fire');
  assert.equal(boss.data.aceMemory.sourceEntityId, pirate.id);
  assert.equal(boss.data.ai.name, identity.name, 'the boss hull carries the minted name');
  assert.equal(boss.data.callsign, identity.name);
  assert.equal(boss.data.name, identity.name);
  assert.equal(boss.data.ai.forcePlayerTarget, true, 'the grudge return is hostile');

  const voice = t.events.find((row) => row.name === 'aceMemory:voice'
    && row.payload.aceId === pilotId);
  assert.ok(voice, 'the return speaks');
  assert.ok(voice.payload.text.includes(identity.name),
    `the "you again" line names the pilot: ${voice.payload.text}`);
  assert.ok(t.voiceLines.some((p) => p && p.channel === 'bark' && p.text.includes(identity.name)),
    'the line rides the bark channel');

  // The moral debt is revealed by the return, and a second return cannot spawn.
  assert.equal(t.state.story.moralMemory.debts[pilotId].status, 'revealed');
  assert.equal(rec.returned, true);
});

test('a kill settles the promoted pilot; a plain despawn does not', () => {
  const t = boot();
  const pirate = spawnPirate(t);
  emitFled(t, pirate);
  const pilotId = promotedPilotIdFor(pirate.id);
  const rec = t.state.aceMemory[pilotId];

  // Sector despawns must not read as a defeat — the pilot who got away is not dead.
  t.bus.emit('entity:destroyed', { id: pirate.id });
  assert.notEqual(rec.defeated, true, 'despawn leaves the pilot alive in the ledger');
  assert.equal(rec.returnScheduled, true, 'the return survives a sector despawn');

  t.bus.emit('entity:killed', { id: pirate.id, killerId: t.player.id, type: 'ship' });
  assert.equal(rec.defeated, true, 'a real kill settles the record');
  assert.equal(rec.returnScheduled, false);
  assert.equal(rec.returnAt, null);
  assert.equal(t.state.story.moralMemory.debts[pilotId].status, 'revealed');
  const defeated = t.events.find((row) => row.name === 'aceMemory:transition'
    && row.payload.aceId === pilotId && row.payload.transition === 'defeated');
  assert.ok(defeated, 'the defeat is a chronicled transition');
});

test('promoted records round-trip a save/load and still return with the same identity', () => {
  const t = boot();
  const pirate = spawnPirate(t);
  emitFled(t, pirate);
  const pilotId = promotedPilotIdFor(pirate.id);
  const rec = t.state.aceMemory[pilotId];
  const snapshot = JSON.parse(JSON.stringify(t.aceSystem.serialize()));

  const t2 = boot();
  t2.aceSystem.deserialize(snapshot);
  const restored = t2.state.aceMemory[pilotId];
  assert.ok(restored && restored.promoted === true, 'the promoted record survives the load');
  assert.equal(restored.name, rec.name);
  assert.equal(restored.returnAt, rec.returnAt);
  assert.equal(restored.grudgeKey, rec.grudgeKey);
  assert.equal(restored.returnScheduled, true);

  advanceTo(t2, restored.returnAt + 1);
  const spawned = t2.events.find((row) => row.name === 'aceMemory:returnSpawned'
    && row.payload.aceId === pilotId);
  assert.ok(spawned, 'the reloaded pilot still returns');
  const boss = t2.state.entities.get(spawned.payload.spawnedIds[0]);
  assert.ok(boss, 'the return body exists after load');
  assert.equal(boss.data.ai.name, rec.name, 'the same name comes back after load');
  assert.equal(boss.data.aceMemory.grudgeKey, 'fled_fire');
});

test('killing a return escort does not settle the pilot; the pilot hull does', () => {
  const t = boot();
  const pirate = spawnPirate(t);
  emitFled(t, pirate);
  const pilotId = promotedPilotIdFor(pirate.id);
  const rec = t.state.aceMemory[pilotId];

  advanceTo(t, rec.returnAt + 1);
  const spawned = t.events.find((row) => row.name === 'aceMemory:returnSpawned'
    && row.payload.aceId === pilotId);
  assert.ok(spawned, 'the promoted return spawns');
  const [bossId, ...escortIds] = spawned.payload.spawnedIds;
  assert.ok(escortIds.length >= 1, 'the return fields escorts around the pilot hull');
  const escort = t.state.entities.get(escortIds[0]);
  assert.ok(escort, 'the escort is a live body');
  assert.equal(escort.data.aceMemory.role, 'escort');
  assert.equal(escort.data.aceMemory.promoted, true, 'escorts wear the same identification tag');

  t.bus.emit('entity:killed', { id: escort.id, killerId: t.player.id, type: 'ship' });
  assert.notEqual(rec.defeated, true, 'an escort kill must not settle the pilot record');
  assert.ok(!t.events.some((row) => row.name === 'aceMemory:transition'
    && row.payload.aceId === pilotId && row.payload.transition === 'defeated'),
    'no defeated transition off an escort kill');
  assert.equal(t.state.entities.get(bossId).data.aceMemory.role, 'boss',
    'the pilot hull is still standing with the boss tag');

  t.bus.emit('entity:killed', { id: bossId, killerId: t.player.id, type: 'ship' });
  assert.equal(rec.defeated, true, 'killing the hull that carries the pilot settles the record');
  assert.equal(rec.returnScheduled, false);
});

test('after save/load, a recycled entity id cannot settle a promoted pilot', () => {
  const t = boot();
  const pirate = spawnPirate(t);
  emitFled(t, pirate);
  const pilotId = promotedPilotIdFor(pirate.id);
  const rec = t.state.aceMemory[pilotId];
  advanceTo(t, rec.returnAt + 1);
  const spawned = t.events.find((row) => row.name === 'aceMemory:returnSpawned'
    && row.payload.aceId === pilotId);
  assert.ok(spawned, 'the promoted return spawns before the save');
  const crewIds = spawned.payload.spawnedIds.slice();
  assert.ok(Object.keys(t.state.aceMemory.activeReturns).length >= crewIds.length,
    'live crew bindings exist at save time');

  const snapshot = JSON.parse(JSON.stringify(t.aceSystem.serialize()));
  const t2 = boot();
  t2.aceSystem.deserialize(snapshot);
  const restored = t2.state.aceMemory[pilotId];
  assert.ok(restored && restored.promoted === true, 'the promoted record survives the load');
  assert.equal(restored.returned, true, 'the return-of-record survives the load');
  assert.deepEqual(Object.keys(t2.state.aceMemory.activeReturns), [],
    'entity-id bindings from the old sim are dropped at load — those hulls are gone');

  // The fresh sim's allocator reissues low ids: spawn until one reuses a stale crew id.
  let recycled = null;
  for (let i = 0; i < 12 && !recycled; i++) {
    const fresh = spawnPirate(t2, { squadId: `sq_recycle_${i}` });
    if (crewIds.includes(fresh.id)) recycled = fresh;
  }
  assert.ok(recycled, 'the allocator reuses a stale crew id');
  t2.bus.emit('entity:killed', { id: recycled.id, killerId: t2.player.id, type: 'ship' });
  assert.notEqual(restored.defeated, true,
    'a recycled id whose live entity carries no pilot identity fails closed');

  // The pure fallback path — a kill receipt for an id with no live entity — must not
  // settle either: the load dropped the stale bindings it would have resolved through.
  for (const id of crewIds) {
    t2.bus.emit('entity:killed', { id: id + 100000, killerId: t2.player.id, type: 'ship' });
  }
  assert.notEqual(restored.defeated, true, 'no binding, no settle');
});

test('a pilot who returned and fled again can time-expire', () => {
  const t = boot();
  const pirate = spawnPirate(t);
  emitFled(t, pirate);
  const pilotId = promotedPilotIdFor(pirate.id);
  const rec = t.state.aceMemory[pilotId];

  advanceTo(t, rec.returnAt + 1);
  assert.equal(rec.returned, true, 'the first return spawned');
  const firstSpawns = t.events.filter((row) => row.name === 'aceMemory:returnSpawned'
    && row.payload.aceId === pilotId).length;

  // The same hull breaks off again — the re-armed record is a live window, not a settled one.
  emitFled(t, pirate);
  assert.equal(rec.returned, false, 're-arm clears the settled return flag');
  assert.equal(rec.returnedAt, null);
  assert.equal(rec.resolvedVia, null);
  assert.equal(rec.returnScheduled, true);
  assert.equal(rec.fleeCount, 2);

  // Push the clock past the expiry window from the re-flee: the record must lapse instead
  // of standing revived forever on a stale `returned` flag.
  t.state.simTime = rec.fledAt + PROMOTED_PILOT_EXPIRY_S + 1;
  t.sim.runTicks(Math.ceil(0.6 / SIM_DT));
  assert.equal(rec.expired, true, 'the re-armed window can lapse');
  assert.equal(rec.returnScheduled, false);
  const spawns = t.events.filter((row) => row.name === 'aceMemory:returnSpawned'
    && row.payload.aceId === pilotId).length;
  assert.equal(spawns, firstSpawns, 'no second crew fields off a lapsed record');
});

test('a work-offer return without a spawn helper retries instead of resolving', () => {
  const t = boot();
  const pirate = spawnPirate(t);
  emitFled(t, pirate, { reason: 'profit-risk-bad' });
  const pilotId = promotedPilotIdFor(pirate.id);
  const rec = t.state.aceMemory[pilotId];
  // Force the loyal wing stance deterministically rather than fishing for an ally seed.
  rec.loyalty = ACE_LOYALTY_WORK_AT;
  rec.grudge = 0;

  // No spawn helper on aceMemory's helper copy: the offer must stay owed, not resolve.
  const helpers = t.aceSystem.helpers;
  const spawnEntity = helpers.spawnEntity;
  helpers.spawnEntity = null;
  advanceTo(t, rec.returnAt + 1);
  assert.notEqual(rec.returned, true, 'a spawnless offer does not resolve the record');
  assert.equal(rec.returnScheduled, true, 'the return stays scheduled for retry');
  assert.ok(Number.isFinite(rec.nextReturnAttemptAt) && rec.nextReturnAttemptAt > rec.returnAt,
    'a retry is scheduled');
  assert.ok(!t.events.some((row) => row.name === 'aceMemory:workOffered'
    && row.payload.aceId === pilotId), 'no work offer was emitted for an empty spawn');

  helpers.spawnEntity = spawnEntity;
  t.state.simTime = rec.nextReturnAttemptAt + 1;
  t.sim.runTicks(Math.ceil(0.6 / SIM_DT));
  const offered = t.events.find((row) => row.name === 'aceMemory:workOffered'
    && row.payload.aceId === pilotId);
  assert.ok(offered, 'the work offer fires once spawning is possible again');
  assert.ok(offered.payload.spawnedIds.length > 0, 'the retry fields a real crew');
  assert.equal(rec.returned, true);
});

test('a live h7 spared-return window defers the promoted return of the same pilot', () => {
  const t = boot();
  const pirate = spawnPirate(t);
  emitFled(t, pirate);
  const pilotId = promotedPilotIdFor(pirate.id);
  const rec = t.state.aceMemory[pilotId];

  // h7 binds the pilot's debt into live.vars.debt the moment it fires — while the debt is
  // still pending (e1EncounterRuntime settleMoralReturn reveals it only on choice/timeout).
  const debt = t.state.story.moralMemory.debts[pilotId];
  assert.ok(debt && debt.status === 'pending', 'the spared debt is still pending');
  t.state.encounterDirector = {
    live: {
      enc_h7_test: {
        id: 'enc_h7_test',
        shapeId: 'depth_h7_spared_return',
        phase: 'offer',
        vars: { debt: { ...debt } },
      },
    },
  };

  advanceTo(t, rec.returnAt + 1);
  assert.ok(!t.events.some((row) => row.name === 'aceMemory:returnSpawned'
    && row.payload.aceId === pilotId), 'no second crew fields inside the choice window');
  assert.equal(rec.returnScheduled, true, 'the promoted return is deferred, not consumed');
  assert.notEqual(rec.returned, true);

  // The window resolves the way h7 resolves it: the debt reveals and the encounter ends.
  delete t.state.encounterDirector.live.enc_h7_test;
  revealMoralDebt(t.state, pilotId);
  t.state.simTime = (rec.nextReturnAttemptAt || rec.returnAt) + 1;
  t.sim.runTicks(Math.ceil(0.6 / SIM_DT));
  assert.equal(rec.returned, true);
  assert.equal(rec.resolvedVia, 'moralReturn', 'the spared-return encounter owns the comeback');
  assert.equal(rec.returnScheduled, false);
  assert.ok(!t.events.some((row) => row.name === 'aceMemory:returnSpawned'
    && row.payload.aceId === pilotId), 'still no promoted crew — the debt was already answered');
});
