// INFERENCE VERB-10 — chaff answers the missile that is actually in the air.
//
// Done-check: "A countermeasure deployed under missile threat diverts the live round even when
// its shooter holds no lock — the launch already consumed it (weapons.js: 'each missile needs a
// fresh lock') or the shooter is dead. Before this pass the puff fired, the cooldown ran, and
// the missile flew straight through the countermeasure."
//
// The lineage anchors on the live round itself when no live-lock shooter is selectable; a
// deploy still claims `brokenLockShipId` only when it truly broke a held lock, and a second
// shooter's seeker keeps its own solution (the one-lineage law, unchanged).
//
// Seed 4242, real rng: divertPct 0.85, first roll 0.5467 — the standard chaff dispenser always
// answers its selected lineage on this seed. Nothing here hand-forces the divert.
//
// Run: node --test test/inference-verb-10-chaff-answers-live-round.test.mjs

import assert from 'node:assert/strict';
import test from 'node:test';

import { hash32, mulberry32 } from '../src/core/rng.js';
import { countermeasures } from '../src/systems/countermeasures.js';

const DT = 1 / 60;
const SEED = 4242;

function makeBus() {
  const events = [];
  const handlers = {};
  return {
    events,
    on(name, fn) { (handlers[name] || (handlers[name] = [])).push(fn); },
    emit(name, payload) {
      events.push({ name, payload });
      for (const fn of handlers[name] || []) fn(payload);
    },
  };
}

function ship(id, x, fittings, data = {}, extra = {}) {
  return {
    id, type: 'ship', alive: extra.alive !== false, team: extra.team ?? 0,
    pos: { x, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, radius: 8,
    flags: {},
    data: { fittings, weapons: [], combat: { lockTarget: null, lockProgress: 0 }, ...data },
  };
}

function missile(id, ownerId, targetId, lockGeneration, x) {
  return {
    id, type: 'projectile', alive: true, ownerId,
    pos: { x, z: 0 }, vel: { x: -90, z: 0 }, rot: Math.PI, radius: 1,
    data: {
      kind: 'missile', targetId, ownerId, turnRate: 2.8, projSpeed: 90,
      lockGeneration, targetGeneration: 7,
    },
  };
}

// Post-launch shooter state: weapons.js consumed the lock at fire time (progress 0) — the
// NORMAL state of a live inbound missile's shooter. `released` models a shooter who also let
// go of the target after the launch (dodging, switching, dying next tick).
function spentLockShooter(id, x, targetId, generation) {
  return ship(id, x, [], {
    combat: { lockTarget: targetId, lockProgress: 0, lockGeneration: generation },
  });
}

function releasedShooter(id, x, generation) {
  return ship(id, x, [], {
    combat: { lockTarget: null, lockProgress: 0, lockGeneration: generation },
  });
}

function boot({ ships, missiles, shooterStates = {} }) {
  const player = ship(1, 0, ['mod_chaff_dispenser_m'], {});
  const others = ships.map((s) => {
    const e = s.factory();
    if (shooterStates[e.id]) Object.assign(e.data, shooterStates[e.id]);
    return e;
  });
  const rounds = missiles.map((m) => m.factory());
  const entities = new Map([[1, player], ...others.map((e) => [e.id, e]), ...rounds.map((e) => [e.id, e])]);
  const entityList = [player, ...others, ...rounds];
  const state = {
    mode: 'flight',
    playerId: 1,
    tick: 120,
    simTime: 2,
    meta: { seed: SEED },
    rng: mulberry32(SEED),
    player: {},
    input: { fire: false, deployCountermeasure: true, actions: {} },
    combat: { beams: [] },
    entities,
    entityList,
    entityIndex: {
      __spacefaceEntityIndexV1: true,
      ships: [player, ...others.filter((e) => e.alive !== false)],
      projectiles: rounds,
    },
  };
  const bus = makeBus();
  const helpers = { getEntity: (id) => state.entities.get(id), spawnEntity() { return null; } };
  const cm = Object.create(countermeasures);
  cm.init({ state, bus, helpers });
  return { state, cm, player, bus, others: Object.fromEntries(others.map((e) => [e.id, e])), rounds: Object.fromEntries(rounds.map((e) => [e.id, e])) };
}

function deployedEvents(bus) {
  return bus.events.filter((e) => e.name === 'countermeasure:deployed').map((e) => e.payload);
}

test('seed 4242: chaff answers the live round of a shooter whose lock the launch spent', () => {
  const t = boot({
    // Both shooters are post-launch (progress 0, still holding the victim); each has a
    // seeker in the air. Before this pass the deploy answered NOTHING here.
    ships: [
      { factory: () => spentLockShooter(2, 400, 1, 4) },
      { factory: () => spentLockShooter(3, 420, 1, 6) },
    ],
    missiles: [
      { factory: () => missile('m2', 2, 1, 4, 220) },
      { factory: () => missile('m3', 3, 1, 6, -240) },
    ],
  });

  assert.equal(t.cm._tryDeploy(t.player), true, 'the deploy is accepted under missile threat');
  const deployed = deployedEvents(t.bus);
  assert.equal(deployed.length, 1);
  assert.equal(deployed[0].brokenLockShipId, 2,
    'the held (regrowing) lock behind the inbound round is broken for real');

  const lineage = t.player.data.cm.effect.lineage;
  assert.ok(lineage, 'the deploy answers a lineage even with no lock progress in the fight');
  assert.equal(lineage.missileId, 'm2', 'the lineage anchors on the live round (stable lowest id)');
  assert.equal(lineage.shooterId, 2);
  assert.equal(lineage.generation, 4);
  assert.equal(t.others[2].data.combat.lockSuppressTargetId, 1,
    'the spent lock is pinned against instant reacquisition');

  t.cm.update(DT, t.state);
  assert.equal(t.rounds.m2.data.diverted, true,
    'the missile that triggered the chaff is the missile the chaff answers');
  assert.equal(String(t.rounds.m2.data.targetId).startsWith('cm_decoy_'), true,
    'the answered round steers onto the decoy point, not the ship');
  assert.equal(t.rounds.m3.data.diverted, undefined,
    'the second shooter keeps its own solution — one deploy, one lineage');
  assert.equal(t.others[3].data.combat.lockTarget, 1,
    'the second shooter holds his target');
});

test('seed 4242: a shooter who released the target still gets his round answered', () => {
  const t = boot({
    ships: [
      { factory: () => releasedShooter(2, 400, 4) },
      { factory: () => releasedShooter(3, 420, 6) },
    ],
    missiles: [
      { factory: () => missile('m2', 2, 1, 4, 220) },
      { factory: () => missile('m3', 3, 1, 6, -240) },
    ],
  });

  assert.equal(t.cm._tryDeploy(t.player), true);
  assert.equal(deployedEvents(t.bus)[0].brokenLockShipId, null,
    'no lock was held to break — the receipt must not claim one');
  assert.equal(t.player.data.cm.effect.lineage.missileId, 'm2',
    'the lineage anchors on the live round');

  t.cm.update(DT, t.state);
  assert.equal(t.rounds.m2.data.diverted, true,
    'the round is diverted instead of flying through the countermeasure');
  assert.equal(t.rounds.m3.data.diverted, undefined,
    'the second released shooter keeps his solution');
});

test('seed 4242: a dead shooter does not make his live missile unanswerable', () => {
  const t = boot({
    ships: [
      { factory: () => spentLockShooter(2, 400, 1, 4) },
    ],
    missiles: [
      { factory: () => missile('m2', 2, 1, 4, 260) },
    ],
    shooterStates: { 2: {} },
  });
  // The shooter died after the launch: not alive, and gone from the ships index.
  t.others[2].alive = false;
  t.state.entityIndex.ships = t.state.entityIndex.ships.filter((e) => e.alive !== false);

  assert.equal(t.cm._tryDeploy(t.player), true);
  assert.equal(deployedEvents(t.bus)[0].brokenLockShipId, null);
  assert.equal(t.player.data.cm.effect.lineage.shooterId, 2,
    'the round in the air still names its lineage');

  t.cm.update(DT, t.state);
  assert.equal(t.rounds.m2.data.diverted, true,
    'the orphaned seeker is diverted instead of flying through the countermeasure');
});

test('seed 4242: with a live lock the deploy still claims the break it makes', () => {
  const t = boot({
    ships: [
      {
        factory: () => ship(2, 400, [], {
          combat: { lockTarget: 1, lockProgress: 1, lockGeneration: 4, lockTargetGeneration: 7 },
          perceptionContacts: [{ id: 1, kind: 'ship', visible: true, ageTicks: 0, targetGeneration: 7 }],
        }),
      },
    ],
    missiles: [
      { factory: () => missile('m2', 2, 1, 4, 260) },
    ],
  });

  assert.equal(t.cm._tryDeploy(t.player), true);
  assert.equal(deployedEvents(t.bus)[0].brokenLockShipId, 2,
    'a held lock was broken — the receipt names the shooter');
  assert.equal(t.others[2].data.combat.lockSuppressTargetId, 1,
    'the broken lineage is pinned against instant reacquisition');

  t.cm.update(DT, t.state);
  assert.equal(t.rounds.m2.data.diverted, true);
});
