// Spill vultures — a violence-spilled freight pod is a contest, not free loot on the
// floor. Scavenger skiffs converge from outside work range on the sim clock, take pods
// through the ordinary physics contact seam (titled pods refused), race the player with
// one bounded warning pass, and fly out with the take; a laden vulture killed spills its
// stolen hold through the ordinary kill-cargo schema.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  spillVulturesSpillReceipt,
  spillVulturesPickupReceipt,
  spillVulturesDestroyed,
  stepSpillVultures,
  releaseSpillVultures,
  ownsSpillVultureHull,
} from '../src/world/spillVultures.js';
import { rollKillRewardItems } from '../src/data/killRewards.js';
import { sectorGlobalOrigin } from '../src/data/sectorCoordinates.js';

const SECTOR_ID = 'sector_helios_prime';
const ORIGIN = sectorGlobalOrigin(SECTOR_ID);

class Bus {
  constructor() { this.handlers = new Map(); this.log = []; }
  on(name, fn) {
    const list = this.handlers.get(name) || [];
    list.push(fn);
    this.handlers.set(name, list);
  }
  off(name, fn) {
    this.handlers.set(name, (this.handlers.get(name) || []).filter((entry) => entry !== fn));
  }
  emit(name, payload) {
    this.log.push({ name, payload });
    for (const fn of [...(this.handlers.get(name) || [])]) fn(payload);
  }
}

function entries(bus, name) {
  return bus.log.filter((entry) => entry.name === name);
}

function boot(seed = 90210) {
  const state = {
    meta: { seed },
    tick: 0,
    simTime: 100,
    playerId: 1,
    world: { currentSectorId: SECTOR_ID },
    entities: new Map(),
    entityList: [],
    rng() { return 0.5; },
  };
  const bus = new Bus();
  let nextEntityId = 500;
  const helpers = {
    spawnEntity(spec) {
      const entity = {
        ...spec,
        id: nextEntityId++,
        alive: true,
        pos: { ...(spec.pos || { x: 0, z: 0 }) },
        vel: { ...(spec.vel || { x: 0, z: 0 }) },
        rot: spec.rot || 0,
        data: spec.data ? JSON.parse(JSON.stringify(spec.data)) : {},
      };
      state.entities.set(entity.id, entity);
      state.entityList.push(entity);
      return entity;
    },
  };
  const o = { state, bus, helpers };
  return { state, bus, helpers, o };
}

function spawnPod(state, id, x, z, extraData = {}) {
  const pod = {
    id,
    type: 'pickup',
    alive: true,
    pos: { x, z },
    data: { commodityId: 'cmdty_ore_iron', amount: 4, ownerId: 42, ownerName: 'Hauler', ...extraData },
  };
  state.entities.set(id, pod);
  return pod;
}

function spillPayload(podIds, qty, cause = 'combat_fire') {
  return {
    carrierId: 42,
    podIds,
    commodityId: 'cmdty_ore_iron',
    qty,
    cause,
    ownerId: 42,
    ownerName: 'Hauler',
    t: 100,
  };
}

test('violence spill registers and dispatches a converging scavenger skiff', () => {
  const { state, bus, o } = boot();
  const pod = spawnPod(state, 700, ORIGIN.x, ORIGIN.z);
  assert.equal(spillVulturesSpillReceipt(o, spillPayload([pod.id], 3, 'combat_fire')), true);

  // The convergence waits on the seeded clock, then dispatches — bounded, once.
  stepSpillVultures(o);
  assert.equal(entries(bus, 'vultures:dispatch').length, 0, 'no instant teleport dispatch');
  state.simTime += 12;
  stepSpillVultures(o);
  const dispatches = entries(bus, 'vultures:dispatch');
  assert.equal(dispatches.length, 1, 'one vulture for a thin spill');
  const vulture = state.entities.get(dispatches[0].payload.entityId);
  assert.ok(vulture, 'vulture hull exists');
  assert.equal(vulture.data.role, 'scavenger');
  assert.equal(vulture.data.ai.passive, true, 'never opens fire on its own');
  assert.deepEqual(vulture.data.cargo, { items: {} }, 'kill-spill hold schema');
  assert.equal(ownsSpillVultureHull(state, vulture), true);
  assert.ok(vulture.data.spillVulture.exitAngle != null, 'getaway heading pre-computed');

  // It spawns from outside work range and flies in — never on top of the pods.
  const dist = Math.hypot(vulture.pos.x - pod.pos.x, vulture.pos.z - pod.pos.z);
  assert.ok(dist > 300, `arrives from a ring, not on the pods (dist ${dist})`);

  stepSpillVultures(o);
  assert.equal(entries(bus, 'vultures:dispatch').length, 1, 'no duplicate dispatch');
});

test('panic jettison never draws vultures', () => {
  const { state, bus, o } = boot();
  const pod = spawnPod(state, 701, ORIGIN.x, ORIGIN.z);
  assert.equal(spillVulturesSpillReceipt(o, spillPayload([pod.id], 3, 'panic_jettison')), false);
  state.simTime += 20;
  stepSpillVultures(o);
  assert.equal(entries(bus, 'vultures:dispatch').length, 0);
});

test('a rich spill draws a rival: two vultures jostle for one convergence', () => {
  const { state, bus, o } = boot();
  const pod = spawnPod(state, 702, ORIGIN.x, ORIGIN.z);
  spillVulturesSpillReceipt(o, spillPayload([pod.id], 9, 'combat_damage'));
  state.simTime += 12;
  stepSpillVultures(o);
  const dispatches = entries(bus, 'vultures:dispatch');
  assert.equal(dispatches.length, 2, 'claimant plus rival');
  assert.equal(dispatches[0].payload.rivals, 2);
  assert.notEqual(dispatches[0].payload.entityId, dispatches[1].payload.entityId);
});

test('vulture takes an ordinary spilled pod through the contact receipt; titled pods are refused', () => {
  const { state, bus, o } = boot();
  const free = spawnPod(state, 703, ORIGIN.x, ORIGIN.z);
  const titled = spawnPod(state, 704, ORIGIN.x + 5, ORIGIN.z, { freightCustodyPod: { qty: 4 } });
  spillVulturesSpillReceipt(o, spillPayload([free.id, titled.id], 8, 'combat_fire'));
  state.simTime += 12;
  stepSpillVultures(o);
  const vulture = state.entities.get(entries(bus, 'vultures:dispatch')[0].payload.entityId);

  // The take is explicit acceptance through the one synchronous seam.
  const payload = { collectorId: vulture.id, pickupId: titled.id, commodityId: 'cmdty_ore_iron', amount: 4 };
  assert.equal(spillVulturesPickupReceipt(o, payload), false, 'custody pod refused');
  assert.equal(payload.acceptedAmount, undefined, 'no acceptance written on a titled pod');

  const take = { collectorId: vulture.id, pickupId: free.id, commodityId: 'cmdty_ore_iron', amount: 4 };
  assert.equal(spillVulturesPickupReceipt(o, take), true);
  assert.equal(take.acceptedAmount, 4);
  assert.equal(take.rejectedAmount, 0);
  assert.equal(vulture.data.cargo.items.cmdty_ore_iron, 4, 'stolen hold stamped on the hull');
  assert.equal(vulture.data.spillVulture.holdQty, 4);
  assert.equal(entries(bus, 'vultures:claimed').length, 1);
});

test('the player scooping first earns one bounded warning pass, never a second', () => {
  const { state, bus, o } = boot();
  const pod = spawnPod(state, 705, ORIGIN.x, ORIGIN.z);
  spillVulturesSpillReceipt(o, spillPayload([pod.id], 3));
  state.simTime += 12;
  stepSpillVultures(o);
  const vulture = state.entities.get(entries(bus, 'vultures:dispatch')[0].payload.entityId);

  const playerTake = { collectorId: state.playerId, pickupId: pod.id, commodityId: 'cmdty_ore_iron', amount: 4 };
  assert.equal(spillVulturesPickupReceipt(o, playerTake), true);
  assert.equal(entries(bus, 'vultures:race').length, 1);
  assert.equal(vulture.data.spillVulture.state, 'harry');

  const second = { collectorId: state.playerId, pickupId: pod.id, commodityId: 'cmdty_ore_iron', amount: 1 };
  spillVulturesPickupReceipt(o, second);
  assert.equal(entries(bus, 'vultures:race').length, 1, 'one warning pass per convergence');

  state.simTime += 5;
  stepSpillVultures(o);
  assert.notEqual(vulture.data.spillVulture.state, 'harry', 'the pass ends on the clock');
});

test('a laden vulture turns outward, names its take, and exits before despawning', () => {
  const { state, bus, o } = boot();
  const pod = spawnPod(state, 706, ORIGIN.x, ORIGIN.z);
  spillVulturesSpillReceipt(o, spillPayload([pod.id], 3));
  state.simTime += 12;
  stepSpillVultures(o);
  const vulture = state.entities.get(entries(bus, 'vultures:dispatch')[0].payload.entityId);
  const take = { collectorId: vulture.id, pickupId: pod.id, commodityId: 'cmdty_ore_iron', amount: 4 };
  spillVulturesPickupReceipt(o, take);

  pod.alive = false; // the field is swept
  state.simTime += 0.5;
  stepSpillVultures(o);
  assert.equal(vulture.data.spillVulture.state, 'depart', 'turns outward once nothing is left');
  const departed = entries(bus, 'vultures:departed');
  assert.equal(departed.length, 1, 'getaway line lands on the turn, hull still alive');
  assert.equal(vulture.alive, true);
  assert.equal(departed[0].payload.holdQty, 4);
  assert.deepEqual(departed[0].payload.hold, { cmdty_ore_iron: 4 });

  // It actually leaves: after flying the ring distance it despawns.
  for (let i = 0; i < 400 && vulture.alive !== false; i++) {
    state.simTime += 0.5;
    stepSpillVultures(o);
  }
  assert.equal(vulture.alive, false, 'departs the sector volume instead of loitering');
});

test('a convergence wiped by the player refills at most once', () => {
  const { state, bus, o } = boot();
  const pod = spawnPod(state, 707, ORIGIN.x, ORIGIN.z);
  spillVulturesSpillReceipt(o, spillPayload([pod.id], 3));
  state.simTime += 12;
  stepSpillVultures(o);
  const first = state.entities.get(entries(bus, 'vultures:dispatch')[0].payload.entityId);

  spillVulturesDestroyed(o, { entity: first, reason: 'killed' });
  assert.equal(entries(bus, 'vultures:dispatch').length, 1);
  state.simTime += 17;
  stepSpillVultures(o);
  assert.equal(entries(bus, 'vultures:dispatch').length, 1, 'replacement wave waits out its delay');
  state.simTime += 4;
  stepSpillVultures(o);
  assert.equal(entries(bus, 'vultures:dispatch').length, 2, 'one replacement wave arrives');
  const secondId = entries(bus, 'vultures:dispatch')[1].payload.entityId;
  spillVulturesDestroyed(o, { entity: state.entities.get(secondId), reason: 'killed' });
  state.simTime += 40;
  stepSpillVultures(o);
  assert.equal(entries(bus, 'vultures:dispatch').length, 2, 'a twice-wiped spill stays wiped');
});

test('the convergence is bounded: a third spill folds the oldest', () => {
  const { state, bus, o } = boot();
  for (let i = 0; i < 3; i++) {
    const pod = spawnPod(state, 710 + i, ORIGIN.x + i * 5000, ORIGIN.z + i * 5000);
    spillVulturesSpillReceipt(o, spillPayload([pod.id], 3 + i));
  }
  state.simTime += 12;
  stepSpillVultures(o);
  const dispatches = entries(bus, 'vultures:dispatch');
  assert.ok(dispatches.length <= 2, `at most two live convergences dispatch (${dispatches.length})`);
});

test('a hard sector exit folds every vulture and clears the book', () => {
  const { state, bus, o } = boot();
  const pod = spawnPod(state, 720, ORIGIN.x, ORIGIN.z);
  spillVulturesSpillReceipt(o, spillPayload([pod.id], 3));
  state.simTime += 12;
  stepSpillVultures(o);
  const vulture = state.entities.get(entries(bus, 'vultures:dispatch')[0].payload.entityId);
  assert.equal(releaseSpillVultures(o), true);
  assert.equal(vulture.alive, false);
  stepSpillVultures(o);
  assert.equal(entries(bus, 'vultures:dispatch').length, 1, 'no ghost dispatch after release');
});

test('a killed laden vulture spills its stolen hold through the ordinary kill-cargo path', () => {
  const { state, bus, o } = boot();
  const pod = spawnPod(state, 730, ORIGIN.x, ORIGIN.z);
  spillVulturesSpillReceipt(o, spillPayload([pod.id], 3));
  state.simTime += 12;
  stepSpillVultures(o);
  const vulture = state.entities.get(entries(bus, 'vultures:dispatch')[0].payload.entityId);
  const take = { collectorId: vulture.id, pickupId: pod.id, commodityId: 'cmdty_ore_iron', amount: 4 };
  spillVulturesPickupReceipt(o, take);

  // Deterministic victim-local stream, exactly as the kill-reward seam feeds it.
  let s = 7;
  const rng = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
  const items = rollKillRewardItems(rng, vulture);
  const iron = items.filter((item) => item.commodityId === 'cmdty_ore_iron');
  assert.ok(iron.length >= 1, 'the stolen hold scatters back into the sky as kill loot');
});
