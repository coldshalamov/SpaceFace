// PL-04 Scramble plant (rebuild of reverted ac34b298 — review 2026-11-12-9615eb79).
// Node-only tests per packet: the grab, the fresh-id drop on kill/Shove, the id-recycle
// case, and the hard rule that the plant never emits pickup:collected / dock:* /
// entity:killed. Test payloads use the exact shapes the real producers emit:
//   freight:cargoSpilled  — trafficRoleOps._spillHaulerCargo / encounterScripts
//   combat:hitstunImpulse — publishHitstunImpulse (src/combat/impulseKernel.js)
//   entity:killed         — combat/damage.js fallbackKill
//   pickup:collected      — physics.js emitPickupCollected

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  makeEntity,
  allocateEntityId,
  stampOccupantGeneration,
  occupantGenerationOf,
} from '../src/core/entity.js';
import { spawnJettisonedCargoPod } from '../src/systems/lootShards.js';
import {
  scramblePlant,
  SCRAMBLE_PLANT_ACTIVE_EVENT,
  SCRAMBLE_HAIL_EVENT,
  SCRAMBLE_POD_GRABBED_EVENT,
  SCRAMBLE_POD_DROPPED_EVENT,
  SCRAMBLE_THIEF_SCARED_EVENT,
  SCRAMBLE_OWNER_THANKS_EVENT,
  SCRAMBLE_RESOLVED_EVENT,
  SCRAMBLE_HAIL_LINE,
  SCRAMBLE_THANKS_LINE,
  SCRAMBLE_THIEF_DROP_LINE,
  SCRAMBLE_TUNING,
} from '../src/systems/scramblePlant.js';

function makeBus() {
  const listeners = new Map();
  const emitted = [];
  return {
    emitted,
    on(name, fn) {
      if (!listeners.has(name)) listeners.set(name, []);
      listeners.get(name).push(fn);
      return fn;
    },
    emit(name, payload) {
      emitted.push({ name, payload });
      for (const fn of [...(listeners.get(name) || [])]) fn(payload);
    },
    queue(name, payload) { this.emit(name, payload); },
  };
}

// Minimal harness mirroring the canonical entity lifecycle: helpers.spawnEntity allocates
// the id and stamps the occupant generation; helpers.removeEntity sweeps map+list and
// recycles the id into freeIds, exactly like coreSystem's production pair.
function makeHarness() {
  const bus = makeBus();
  const state = {
    mode: 'flight',
    simTime: 100,
    tick: 6000,
    playerId: 1,
    entities: new Map(),
    entityList: [],
    freeIds: [],
    nextEntityId: 1,
    nextOccupantGeneration: 1,
    world: { currentSectorId: 'sector_test' },
  };
  const said = [];
  const helpers = {
    spawnEntity(spec) {
      const e = makeEntity(spec);
      e.id = allocateEntityId(state);
      stampOccupantGeneration(state, e);
      state.entities.set(e.id, e);
      state.entityList.push(e);
      bus.emit('entity:spawned', { id: e.id, type: e.type, entity: e });
      return e;
    },
    removeEntity(id, opts) {
      const e = state.entities.get(id);
      if (!e) return false;
      e.alive = false;
      if (opts && opts.immediate === true) {
        state.entities.delete(id);
        const i = state.entityList.indexOf(e);
        if (i >= 0) state.entityList.splice(i, 1);
        state.freeIds.push(id);
        bus.emit('entity:destroyed', {
          id: e.id,
          type: e.type,
          pos: { x: e.pos.x, z: e.pos.z },
          entity: e,
          reason: opts && opts.reason,
        });
      }
      return true;
    },
    voice: { say(msg) { said.push(msg); } },
  };
  const sys = Object.create(scramblePlant);
  sys.init({ bus, state, helpers });

  const player = helpers.spawnEntity({
    type: 'ship', team: 0, pos: { x: 9000, z: 9000 }, radius: 4,
    data: { role: 'player' },
  });
  state.playerId = player.id;

  const spawnShip = (pos, name, extra = {}) => helpers.spawnEntity({
    type: 'ship', team: 2, pos, radius: 5,
    data: { role: 'hauler', name, ...extra },
  });
  const spawnPod = (pos, commodityId = 'cmdty_ore_iron', amount = 4, owner = null) =>
    spawnJettisonedCargoPod(state, {
      pos,
      vel: { x: 0, z: 0 },
      radius: 6,
      commodityId,
      amount,
      unitMass: 0.8,
      factionId: 'faction_free',
      ownerId: owner ? owner.id : null,
      ownerName: owner ? owner.data.name : null,
    }, helpers);

  // trafficRoleOps._spillHaulerCargo emits exactly this shape.
  const spillPayload = (carrier, pods, extra = {}) => ({
    carrierId: carrier.id,
    ownerId: carrier.id,
    ownerName: carrier.data.name,
    factionId: 'faction_free',
    attackerId: null,
    entityId: carrier.id,
    manifestId: 'manifest_1',
    cause: 'panic',
    commodityId: 'cmdty_ore_iron',
    qty: pods.reduce((n, p) => n + (p.data.amount || 0), 0),
    podCount: pods.length,
    podIds: pods.map((p) => p.id),
    t: state.simTime,
    ...extra,
  });

  const step = (n = 1) => { for (let i = 0; i < n; i++) sys.update(1 / 60, state); };
  const names = () => bus.emitted.map((e) => e.name);
  const find = (name) => bus.emitted.filter((e) => e.name === name);

  return {
    bus, state, helpers, sys, said, player, spawnShip, spawnPod, spillPayload, step, names, find,
  };
}

test('civilians scramble for a spilled pod: hail, seek, grab carried as data, pod despawned canonically', () => {
  const h = makeHarness();
  const carrier = h.spawnShip({ x: 0, z: 0 }, 'Hauler One');
  const pod = h.spawnPod({ x: 40, z: 0 }, 'cmdty_ore_iron', 4, carrier);
  const civ = h.spawnShip({ x: 55, z: 0 }, 'Civ A'); // 15 WU from pod, inside grab range
  const farCiv = h.spawnShip({ x: 4000, z: 0 }, 'Civ Far'); // outside notice radius

  h.bus.emit('freight:cargoSpilled', h.spillPayload(carrier, [pod]));

  assert.ok(h.find(SCRAMBLE_HAIL_EVENT).length === 1, 'owner hail emitted');
  assert.equal(h.find(SCRAMBLE_HAIL_EVENT)[0].payload.text, SCRAMBLE_HAIL_LINE);
  const active = h.find(SCRAMBLE_PLANT_ACTIVE_EVENT);
  assert.equal(active.length, 1);
  assert.deepEqual(active[0].payload.thiefIds, [civ.id]);
  assert.equal(civ.data.civilianReaction, 'scramble_seeking');
  assert.notEqual(farCiv.data && farCiv.data.civilianReaction, 'scramble_seeking');

  // First reaction tick: the civilian is inside grab range and scoops the pod.
  h.step();

  assert.equal(h.state.entities.get(pod.id), undefined, 'pod despawned from the world');
  assert.ok(h.state.freeIds.includes(pod.id), 'pod id recycled through freeIds');
  const destroyed = h.find('entity:destroyed').filter((e) => e.payload.id === pod.id);
  assert.equal(destroyed.length, 1, 'canonical removal emitted entity:destroyed once');
  assert.equal(destroyed[0].payload.reason, 'scramble_grab');

  assert.deepEqual(
    { commodityId: civ.data.stolenCargo.commodityId, amount: civ.data.stolenCargo.amount },
    { commodityId: 'cmdty_ore_iron', amount: 4 },
    'cargo carried as data on the civilian',
  );
  const grabbed = h.find(SCRAMBLE_POD_GRABBED_EVENT);
  assert.equal(grabbed.length, 1);
  assert.equal(grabbed[0].payload.thiefId, civ.id);
  assert.equal(grabbed[0].payload.podId, pod.id);
  assert.equal(civ.data.civilianReaction, 'scramble_scattering');

  // Scatter intent: leased through trafficReactionLease (ambient hull → data.intent).
  h.step();
  assert.ok(civ.data.intent && civ.data.intent.boost === true, 'thief scatters under boost');

  // Hard rule: the plant never narrates an NPC action with player-owned events.
  assert.equal(h.find('pickup:collected').length, 0, 'no pickup:collected for an NPC grab');
  assert.equal(h.find('entity:killed').length, 0);
  assert.equal(h.names().filter((n) => n.startsWith('dock:')).length, 0);
});

test('killing a carrier drops a FRESH pod with a new id and the carried cargo', () => {
  const h = makeHarness();
  const carrier = h.spawnShip({ x: 0, z: 0 }, 'Hauler One');
  const pod = h.spawnPod({ x: 40, z: 0 }, 'cmdty_ore_iron', 4, carrier);
  const civ = h.spawnShip({ x: 55, z: 0 }, 'Civ A');

  h.bus.emit('freight:cargoSpilled', h.spillPayload(carrier, [pod]));
  h.step(); // grab
  assert.equal(civ.data.stolenCargo.commodityId, 'cmdty_ore_iron');

  // The end-of-step sweep recycled the pod's numeric id: an unrelated entity owns it now.
  const squatter = h.helpers.spawnEntity({
    type: 'asteroid', pos: { x: 500, z: 500 }, radius: 12,
    data: { name: 'Not a pod' },
  });
  assert.equal(squatter.id, pod.id, 'fixture recycles ids LIFO like the real allocator');
  const squatterGen = occupantGenerationOf(squatter);

  civ.pos = { x: 200, z: 50 };
  h.bus.emit('entity:killed', {
    id: civ.id,
    killerId: h.state.playerId,
    type: 'ship',
    pos: { x: civ.pos.x, z: civ.pos.z },
    factionId: 'faction_free',
    victimClass: 'ship',
  });

  const pods = h.state.entityList.filter((e) => e.data && e.data.jettisonedCargo === true);
  assert.equal(pods.length, 1, 'exactly one fresh pod in the world');
  const dropped = pods[0];
  assert.notEqual(dropped.id, pod.id, 'fresh allocation — never the stale id');
  assert.notEqual(dropped.id, civ.id);
  assert.equal(dropped.data.commodityId, 'cmdty_ore_iron');
  assert.equal(dropped.data.amount, 4, 'carried cargo preserved on the drop');
  assert.ok(Math.hypot(dropped.pos.x - 200, dropped.pos.z - 50) < 1e-6, 'dropped at the kill site');

  // The recycled-id squatter is untouched — the review defect stays dead.
  assert.equal(h.state.entities.get(squatter.id), squatter);
  assert.equal(squatter.type, 'asteroid');
  assert.equal(squatter.alive !== false, true);
  assert.equal(occupantGenerationOf(squatter), squatterGen);
  assert.equal(squatter.pos.x, 500);
  assert.equal(squatter.pos.z, 500);

  const dropEvent = h.find(SCRAMBLE_POD_DROPPED_EVENT);
  assert.equal(dropEvent.length, 1);
  assert.equal(dropEvent[0].payload.podId, dropped.id);
  assert.equal(dropEvent[0].payload.cause, 'destroyed');

  // All thieves stopped with cargo back in the world: incident resolves, owner thanks.
  assert.equal(h.find(SCRAMBLE_RESOLVED_EVENT).length, 1);
  const thanks = h.find(SCRAMBLE_OWNER_THANKS_EVENT);
  assert.equal(thanks.length, 1);
  assert.equal(thanks[0].payload.text, SCRAMBLE_THANKS_LINE);
  assert.ok(h.said.some((m) => m.text === SCRAMBLE_THANKS_LINE));

  // Exactly the one manual kill — the plant never emits entity:killed itself.
  assert.equal(h.find('entity:killed').length, 1);
  assert.equal(h.find('pickup:collected').length, 0);
});

test('shoving a carrier makes it drop a fresh pod and flee scared', () => {
  const h = makeHarness();
  const carrier = h.spawnShip({ x: 0, z: 0 }, 'Hauler One');
  const pod = h.spawnPod({ x: 40, z: 0 }, 'cmdty_ore_iron', 4, carrier);
  const civ = h.spawnShip({ x: 55, z: 0 }, 'Civ A');

  h.bus.emit('freight:cargoSpilled', h.spillPayload(carrier, [pod]));
  const stolenGen = occupantGenerationOf(pod);
  h.step(); // grab

  // publishHitstunImpulse's exact payload shape.
  h.bus.emit('combat:hitstunImpulse', {
    schemaVersion: 1,
    source: 'gun',
    victimId: civ.id,
    attackerId: h.state.playerId,
    attackerMass: 16,
    victimMass: 10,
    deltaV: 12,
    dirX: 1,
    dirZ: 0,
    hitSide: 1,
    worldBody: false,
    provenance: null,
    tick: h.state.tick,
  });

  const pods = h.state.entityList.filter((e) => e.data && e.data.jettisonedCargo === true);
  assert.equal(pods.length, 1);
  // The canonical allocator may legitimately recycle the despawned id through freeIds —
  // what must be fresh is the OCCUPANT: a new generation, spawned through helpers.spawnEntity
  // and present in both the map and the list (the reverted build's Map-only insert is dead).
  assert.notEqual(occupantGenerationOf(pods[0]), stolenGen, 'fresh occupant generation');
  assert.equal(h.state.entities.get(pods[0].id), pods[0], 'spawned through canonical lifecycle');
  assert.equal(pods[0].data.amount, 4);

  assert.equal(civ.data.civilianReaction, 'scramble_scared');
  assert.equal(civ.data.stolenCargo, undefined, 'cargo left the hull with the drop');
  const scared = h.find(SCRAMBLE_THIEF_SCARED_EVENT);
  assert.equal(scared.length, 1);
  assert.equal(scared[0].payload.text, SCRAMBLE_THIEF_DROP_LINE);
  assert.ok(h.said.some((m) => m.text === SCRAMBLE_THIEF_DROP_LINE));
  assert.ok(h.find('bark:triggered').length >= 1);

  h.step();
  assert.ok(civ.data.intent && civ.data.intent.boost === true, 'scared thief flees under boost');
  assert.equal(h.find('pickup:collected').length, 0);
  assert.equal(h.find('entity:killed').length, 0);
});

test('a recycled pod id is never trusted: the new occupant is not grabbed', () => {
  const h = makeHarness();
  const carrier = h.spawnShip({ x: 0, z: 0 }, 'Hauler One');
  const pod = h.spawnPod({ x: 300, z: 0 }, 'cmdty_ore_iron', 4, carrier);
  const civ = h.spawnShip({ x: 330, z: 0 }, 'Civ A'); // seeking, 30 WU out (beyond grab)

  h.bus.emit('freight:cargoSpilled', h.spillPayload(carrier, [pod]));
  h.step();
  assert.equal(civ.data.civilianReaction, 'scramble_seeking');

  // Before the thief arrives, the pod is swept and its id lands on a different pod.
  h.helpers.removeEntity(pod.id, { immediate: true, reason: 'swept' });
  const impostor = h.spawnPod({ x: 300, z: 0 }, 'cmdty_gem', 9, null);
  assert.equal(impostor.id, pod.id, 'same numeric id, new occupant');
  const impostorGen = occupantGenerationOf(impostor);

  // Walk the thief onto the impostor — generation mismatch must refuse the grab.
  civ.pos = { x: 305, z: 0 };
  h.step(3);

  assert.equal(h.state.entities.get(impostor.id), impostor, 'impostor pod untouched');
  assert.equal(impostor.data.commodityId, 'cmdty_gem');
  assert.equal(occupantGenerationOf(impostor), impostorGen);
  assert.equal(civ.data.stolenCargo, undefined, 'no cargo carried off a recycled id');
  assert.equal(h.find(SCRAMBLE_POD_GRABBED_EVENT).length, 0);
  // Thief gives up instead of stealing the wrong body.
  assert.equal(h.sys._getScrambleMemory().has(civ.id), false);
});

test('player scooping a claimed pod sends the thief after the next one, then they give up', () => {
  const h = makeHarness();
  const carrier = h.spawnShip({ x: 0, z: 0 }, 'Hauler One');
  const podA = h.spawnPod({ x: 200, z: 0 }, 'cmdty_ore_iron', 4, carrier);
  const podB = h.spawnPod({ x: 300, z: 0 }, 'cmdty_ore_iron', 2, carrier);
  const civ = h.spawnShip({ x: 210, z: 0 }, 'Civ A'); // >24 WU from podA → seeking

  h.bus.emit('freight:cargoSpilled', h.spillPayload(carrier, [podA, podB]));
  assert.equal(h.sys._getScrambleMemory().get(civ.id).targetPodId, podA.id);

  // The player scoops podA first — physics.js emitPickupCollected's shape.
  h.helpers.removeEntity(podA.id, { immediate: true, reason: 'pickup' });
  h.bus.emit('pickup:collected', {
    pickupId: podA.id,
    collectorId: h.state.playerId,
    kind: 'cargo',
    amount: 4,
    commodityId: 'cmdty_ore_iron',
    pos: { x: 200, z: 0 },
  });
  assert.equal(
    h.sys._getScrambleMemory().get(civ.id).targetPodId, podB.id,
    'thief retargets the remaining pod',
  );

  // The player takes that one too: nothing left to steal, the thief gives up.
  h.helpers.removeEntity(podB.id, { immediate: true, reason: 'pickup' });
  h.bus.emit('pickup:collected', {
    pickupId: podB.id,
    collectorId: h.state.playerId,
    kind: 'cargo',
    amount: 2,
    commodityId: 'cmdty_ore_iron',
    pos: { x: 300, z: 0 },
  });
  assert.equal(h.sys._getScrambleMemory().has(civ.id), false);
  assert.notEqual(civ.data.civilianReaction, 'scramble_seeking');
  // Nobody recovered cargo for the owner: resolved without thanks.
  assert.equal(h.find(SCRAMBLE_RESOLVED_EVENT).length, 1);
  assert.equal(h.find(SCRAMBLE_OWNER_THANKS_EVENT).length, 0);
});

test('a thief that gets away resolves the incident without owner thanks', () => {
  const h = makeHarness();
  const carrier = h.spawnShip({ x: 0, z: 0 }, 'Hauler One');
  const pod = h.spawnPod({ x: 40, z: 0 }, 'cmdty_ore_iron', 4, carrier);
  const civ = h.spawnShip({ x: 55, z: 0 }, 'Civ A');

  h.bus.emit('freight:cargoSpilled', h.spillPayload(carrier, [pod]));
  h.step(); // grab

  h.state.simTime += SCRAMBLE_TUNING.scatterDurationS + 1;
  h.step();

  assert.equal(h.sys._getScrambleMemory().has(civ.id), false);
  const resolved = h.find(SCRAMBLE_RESOLVED_EVENT);
  assert.equal(resolved.length, 1);
  assert.equal(resolved[0].payload.escapedCount, 1);
  assert.equal(resolved[0].payload.droppedCount, 0);
  assert.equal(h.find(SCRAMBLE_OWNER_THANKS_EVENT).length, 0, 'no thanks when the haul is gone');
});

test('no scramble when conditions are not met (distance, pods, cooldown, mode)', () => {
  // Far civilians never notice.
  {
    const h = makeHarness();
    const carrier = h.spawnShip({ x: 0, z: 0 }, 'Hauler One');
    const pod = h.spawnPod({ x: 40, z: 0 }, 'cmdty_ore_iron', 4, carrier);
    h.spawnShip({ x: 900, z: 0 }, 'Civ Far');
    h.bus.emit('freight:cargoSpilled', h.spillPayload(carrier, [pod]));
    assert.equal(h.find(SCRAMBLE_HAIL_EVENT).length, 0);
    assert.equal(h.find(SCRAMBLE_PLANT_ACTIVE_EVENT).length, 0);
  }

  // No pods, no scramble.
  {
    const h = makeHarness();
    const carrier = h.spawnShip({ x: 0, z: 0 }, 'Hauler One');
    h.spawnShip({ x: 100, z: 0 }, 'Civ A');
    h.bus.emit('freight:cargoSpilled', h.spillPayload(carrier, []));
    assert.equal(h.find(SCRAMBLE_PLANT_ACTIVE_EVENT).length, 0);
  }

  // Cooldown swallows the next spill.
  {
    const h = makeHarness();
    const carrier = h.spawnShip({ x: 0, z: 0 }, 'Hauler One');
    const pod1 = h.spawnPod({ x: 40, z: 0 }, 'cmdty_ore_iron', 4, carrier);
    h.spawnShip({ x: 55, z: 0 }, 'Civ A');
    h.bus.emit('freight:cargoSpilled', h.spillPayload(carrier, [pod1]));
    assert.equal(h.find(SCRAMBLE_HAIL_EVENT).length, 1);
    const pod2 = h.spawnPod({ x: 45, z: 0 }, 'cmdty_ore_iron', 4, carrier);
    h.bus.emit('freight:cargoSpilled', h.spillPayload(carrier, [pod2]));
    assert.equal(h.find(SCRAMBLE_HAIL_EVENT).length, 1, 'second spill inside cooldown ignored');
    assert.equal(h.find(SCRAMBLE_PLANT_ACTIVE_EVENT).length, 1);
  }

  // Not in flight mode.
  {
    const h = makeHarness();
    h.state.mode = 'docked';
    const carrier = h.spawnShip({ x: 0, z: 0 }, 'Hauler One');
    const pod = h.spawnPod({ x: 40, z: 0 }, 'cmdty_ore_iron', 4, carrier);
    h.spawnShip({ x: 55, z: 0 }, 'Civ A');
    h.bus.emit('freight:cargoSpilled', h.spillPayload(carrier, [pod]));
    assert.equal(h.find(SCRAMBLE_PLANT_ACTIVE_EVENT).length, 0);
  }

  // Law and hostiles are not scramble material.
  {
    const h = makeHarness();
    const carrier = h.spawnShip({ x: 0, z: 0 }, 'Hauler One');
    const pod = h.spawnPod({ x: 40, z: 0 }, 'cmdty_ore_iron', 4, carrier);
    h.helpers.spawnEntity({
      type: 'ship', team: 0, pos: { x: 55, z: 0 }, radius: 5,
      data: { role: 'patrol', name: 'Cop' },
    });
    h.helpers.spawnEntity({
      type: 'ship', team: 1, pos: { x: 60, z: 0 }, radius: 5,
      data: { role: 'pirate', name: 'Pirate', isHostile: true },
    });
    h.bus.emit('freight:cargoSpilled', h.spillPayload(carrier, [pod]));
    assert.equal(h.find(SCRAMBLE_PLANT_ACTIVE_EVENT).length, 0);
  }
});

test('encounterScripts-shaped spill (no podIds) is found by the loose-pod scan', () => {
  const h = makeHarness();
  const carrier = h.spawnShip({ x: 0, z: 0 }, 'Hauler One');
  const pod = h.spawnPod({ x: 60, z: 0 }, 'cmdty_ore_iron', 4, carrier);
  const civ = h.spawnShip({ x: 80, z: 0 }, 'Civ A');
  h.helpers.spawnEntity({ // a non-cargo payload nearby must NOT be grabbed
    type: 'payload', pos: { x: 30, z: 0 }, radius: 8,
    data: { kind: 'payload', payloadType: 'cut_panel' },
  });

  // encounterScripts' real emit: ids/names only, no pos, no podIds.
  h.bus.emit('freight:cargoSpilled', {
    encounterId: 'enc_1',
    custodyId: 'cust_1',
    manifestId: 'manifest_1',
    carrierId: carrier.id,
    cause: 'carrier_destroyed',
    qty: 4,
    podCount: 1,
    t: h.state.simTime,
  });

  const active = h.find(SCRAMBLE_PLANT_ACTIVE_EVENT);
  assert.equal(active.length, 1, 'fallback scan found the loose pod');
  assert.deepEqual(active[0].payload.thiefIds, [civ.id]);
  assert.equal(
    h.sys._getScrambleMemory().get(civ.id).targetPodId, pod.id,
    'claimed the cargo pod, not the cut panel',
  );
});

test('mass-teardown entity:destroyed does not shower pods', () => {
  const h = makeHarness();
  const carrier = h.spawnShip({ x: 0, z: 0 }, 'Hauler One');
  const pod = h.spawnPod({ x: 40, z: 0 }, 'cmdty_ore_iron', 4, carrier);
  const civ = h.spawnShip({ x: 55, z: 0 }, 'Civ A');

  h.bus.emit('freight:cargoSpilled', h.spillPayload(carrier, [pod]));
  h.step(); // grab

  const before = h.state.entityList.filter((e) => e.data && e.data.jettisonedCargo).length;
  h.bus.emit('entity:destroyed', {
    id: civ.id, type: 'ship', pos: { x: civ.pos.x, z: civ.pos.z }, reason: 'save_restore',
  });
  const after = h.state.entityList.filter((e) => e.data && e.data.jettisonedCargo).length;
  assert.equal(after, before, 'no fresh pod spawned during save teardown');
  assert.equal(h.sys._getScrambleMemory().has(civ.id), false, 'stale row still cleaned');
});
