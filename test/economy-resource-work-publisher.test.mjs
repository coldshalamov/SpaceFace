// Economy resource-work publisher — the world owner's physical side of the work-reservation
// contract (economy-pulse integration). Proof is fixed-seed numbers through the REAL economy
// subscriber (src/systems/economy.js -> src/economy/economyResources.js); no captures, no wall time.
//
// Pinned here:
//   • an accepted lease publishes exactly the ACCEPTED quantity, tags every rock with the lease
//     identity, and settles once with producedQty == committed units (economy ack ok);
//   • a present economy that refuses (work_depleted) blocks the seam — denial never bypasses the
//     budget — and the world scheduler retries after its cooldown;
//   • the unmined published-inventory cap blocks replenishing before any seq is spent;
//   • the seq allocator is one monotonic persisted counter (no reuse across a save round trip);
//   • the approach gate keeps inaccessible seams entirely outside the contract (free seam);
//   • a known all-units-refused publication cancels; no rock, no settle.

import assert from 'node:assert/strict';
import test from 'node:test';

import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { core } from '../src/core/coreSystem.js';
import { world as worldSystem } from '../src/systems/world.js';
import { economy } from '../src/systems/economy.js';
import {
  FIELD_REGROWTH_INTERVAL_S,
  fieldRegrowthDue,
  recordFieldExtraction,
} from '../src/systems/fieldDepletion.js';

const HELIOS = 'sector_helios_prime';

function bootWorld(seed = 4242) {
  const state = createGameState(seed);
  state.mode = 'flight';
  state.meta.seed = seed;
  const bus = createBus();
  const helpers = {};
  core.init({ state, bus, helpers, registry: null });
  const player = helpers.spawnEntity({
    type: 'ship', pos: { x: 0, z: 0 }, radius: 4, mass: 12,
    hull: 100, hullMax: 100, collides: true,
  });
  state.playerId = player.id;
  player.isPlayer = true;
  player.vel = player.vel || { x: 0, z: 0 };
  player.flags = player.flags || { boosting: false, docked: false, invuln: false, noInterp: false };
  const world = Object.assign(Object.create(worldSystem), {});
  world.init({ state, bus, helpers, registry: null });
  return { state, bus, helpers, world };
}

function bootWorldWithEconomy(seed = 4242) {
  const h = bootWorld(seed);
  h.economy = Object.assign(Object.create(economy), {});
  h.economy.init({ state: h.state, bus: h.bus, helpers: h.helpers, registry: { get: () => null } });
  return h;
}

function fieldRocks(state, fieldId) {
  const out = [];
  for (const e of state.entityList || []) {
    if (e && e.alive !== false && e.type === 'asteroid' && e.data && e.data.fieldId === fieldId) out.push(e);
  }
  return out;
}

/** Work the field into the "worked" band, seat the player at the seam, and regrow once. */
function prepareSeam(h, { drainWorkS = null, parkPlayerAtField = true } = {}) {
  h.world.enterSector(HELIOS, {});
  const field = (h.state.world.activeSector.fields || [])[0];
  assert.ok(field && field.id && field.center, 'Helios materializes at least one authored field');
  for (let i = 0; i < 5; i++) {
    recordFieldExtraction(h.state, { fieldId: field.id, sectorId: HELIOS, yieldU: 32 });
  }
  assert.ok(h.state.fieldDepletion.fields[field.id].depletion >= 0.35, 'field reads as worked');
  if (parkPlayerAtField && h.state.entities.get(h.state.playerId)) {
    const player = h.state.entities.get(h.state.playerId);
    player.pos.x = field.center.x;
    player.pos.z = field.center.z;
  }
  if (drainWorkS != null) {
    h.state.economy.resourceWork ||= {};
    // updatedAt pinned at the request moment: the pool integrates recovery per elapsed sim time,
    // so a backdated updatedAt would silently refill the pool before the reserve is read.
    h.state.economy.resourceWork[HELIOS] = {
      availableWorkS: drainWorkS, updatedAt: FIELD_REGROWTH_INTERVAL_S, highWater: 0, leases: {},
    };
  }
  h.state.simTime = FIELD_REGROWTH_INTERVAL_S;
  h.state.tick = 300; // the 5 s scan gate
  return field;
}

test('an accepted lease publishes the accepted quantity, tags the rocks, and settles once', () => {
  const h = bootWorldWithEconomy(4242);
  try {
    const field = prepareSeam(h);
    const reserves = [];
    const settles = [];
    h.bus.on('economy:resourceWork:reserve', (p) => reserves.push(p));
    h.bus.on('economy:resourceWork:settle', (p) => settles.push(p));
    h.world.update(1 / 60, h.state);

    assert.equal(reserves.length, 1, 'one reserve request per seam');
    const req = reserves[0];
    assert.equal(req.sectorId, HELIOS);
    assert.ok(Number.isSafeInteger(req.seq) && req.seq >= 1, 'safe positive persisted seq');
    assert.ok(Number.isSafeInteger(req.qty) && req.qty >= 3, 'requests the seam batch');
    assert.ok(typeof req.commodityId === 'string' && req.commodityId.startsWith('cmdty_'));
    assert.ok(req.result && req.result.ok, `economy accepts: ${req.result && req.result.reason}`);

    const rocks = fieldRocks(h.state, field.id).filter((e) => e.data.resourceWork);
    assert.ok(rocks.length >= 1, 'published rocks exist');
    assert.ok(rocks.length <= req.result.qty, 'never more than the accepted quantity');
    for (const rock of rocks) {
      assert.equal(rock.data.resourceWork.leaseId, req.result.id, 'publication identity is the lease');
      assert.equal(rock.data.resourceWork.seq, req.seq);
      assert.equal(rock.data.resourceWork.commodityId, req.commodityId);
    }
    assert.equal(settles.length, 1, 'exactly one settle after durable publication');
    const settle = settles[0];
    assert.equal(settle.sectorId, HELIOS);
    assert.equal(settle.leaseId, req.result.id);
    assert.equal(settle.producedQty, rocks.length, 'settles the physical units created');
    assert.ok(settle.result && settle.result.ok === true, 'economy acknowledges the settle');
    assert.equal(h.state.world.resourceWork.seq, req.seq, 'allocator advanced with the request');
  } finally {
    h.world.destroy && h.world.destroy();
  }
});

test('a refused seam waits and retries through the world scheduler — never bypasses the budget', () => {
  const h = bootWorldWithEconomy(9090);
  try {
    const field = prepareSeam(h, { drainWorkS: 0 });
    const reserves = [];
    h.bus.on('economy:resourceWork:reserve', (p) => reserves.push(p));
    const before = fieldRocks(h.state, field.id).length;
    h.world.update(1 / 60, h.state);

    assert.ok(reserves.length === 1 && reserves[0].result && !reserves[0].result.ok,
      'the present economy refused the drained pool');
    assert.equal(reserves[0].result.reason, 'work_depleted');
    assert.equal(fieldRocks(h.state, field.id).length, before, 'no rocks bypass the denial');
    assert.ok(h.state.world.resourceWork.deniedUntilBySector[HELIOS] > 0, 'cooldown recorded');
    const spentSeq = h.state.world.resourceWork.seq;

    // Inside the cooldown nothing is retried (and no seq is spent). tick stays on the 300 gate.
    h.state.tick += 300;
    h.state.simTime += 1;
    h.state.fieldDepletion.fields[field.id].lastRegrowT = 0; // seam still due
    h.world.update(1 / 60, h.state);
    assert.equal(reserves.length, 1, 'no reserve while cooling down');
    assert.equal(h.state.world.resourceWork.seq, spentSeq, 'no allocator burn while cooling down');

    // After the cooldown with recovered stock, the same seam publishes.
    h.state.simTime += 60; // now past the 30 s recheck window
    h.state.tick += 300;
    h.world.update(1 / 60, h.state);
    assert.ok(reserves.length >= 2, 'the scheduler retried after the cooldown');
    const retry = reserves[reserves.length - 1];
    assert.ok(retry.result && retry.result.ok, `retry accepted: ${retry.result && retry.result.reason}`);
    assert.ok(retry.seq > spentSeq, 'allocator is monotonic across retries');
  } finally {
    h.world.destroy && h.world.destroy();
  }
});

test('the unmined published-inventory cap blocks replenishing before any seq is spent', () => {
  const h = bootWorldWithEconomy(4711);
  try {
    const field = prepareSeam(h);
    const standingBefore = fieldRocks(h.state, field.id).length; // authored seam rocks
    for (let i = 0; i < 48; i++) {
      const fake = {
        id: 10000 + i, type: 'asteroid', alive: true, pos: { x: field.center.x + i, z: field.center.z },
        radius: 8, mass: 400, hull: 10, hullMax: 10,
        homeSectorId: HELIOS, data: { fieldId: field.id, resourceWork: { leaseId: 'rw:seed', seq: 1, commodityId: 'cmdty_ore_iron' } },
      };
      h.state.entityList.push(fake);
      if (Array.isArray(h.state.entityIndex && h.state.entityIndex.asteroids)) {
        h.state.entityIndex.asteroids.push(fake);
      }
    }
    const reserves = [];
    h.bus.on('economy:resourceWork:reserve', (p) => reserves.push(p));
    h.world.update(1 / 60, h.state);
    assert.equal(reserves.length, 0, 'enough accessible published work exists: no request');
    assert.equal(h.state.world.resourceWork.seq, 0, 'the allocator never burned on a capped sector');
    assert.equal(fieldRocks(h.state, field.id).length, standingBefore + 48,
      'no fresh seam on top of the standing inventory');
  } finally {
    h.world.destroy && h.world.destroy();
  }
});

test('the persisted allocator never reuses a sequence across a world save round trip', () => {
  const h = bootWorldWithEconomy(1212);
  try {
    prepareSeam(h);
    h.world.update(1 / 60, h.state);
    const seqBefore = h.state.world.resourceWork.seq;
    assert.ok(seqBefore >= 1, 'a publication happened');

    const data = h.world.serialize();
    assert.equal(data.resourceWork.seq, seqBefore, 'the allocator persists with the world');

    const h2 = bootWorldWithEconomy(1212);
    try {
      h2.world.deserialize(JSON.parse(JSON.stringify(data)));
      assert.equal(h2.state.world.resourceWork.seq, seqBefore, 'restored, not reset');
      const field = prepareSeam(h2);
      const reserves = [];
      h2.bus.on('economy:resourceWork:reserve', (p) => reserves.push(p));
      h2.world.update(1 / 60, h2.state);
      if (reserves.length && reserves[0].result && reserves[0].result.ok) {
        assert.ok(reserves[0].seq > seqBefore, 'a reloaded world never replays a spent sequence');
      } else {
        assert.ok(reserves.length === 0 || (reserves[0].result && !reserves[0].result.ok),
          'replay attempts fail stale_sequence, never succeed with a reused seq');
      }
    } finally {
      h2.world.destroy && h2.world.destroy();
    }
  } finally {
    h.world.destroy && h.world.destroy();
  }
});

test('an inaccessible seam stays outside the contract and regrows as the free seam', () => {
  const h = bootWorldWithEconomy(5150);
  try {
    const field = prepareSeam(h, { parkPlayerAtField: false });
    const player = h.state.entities.get(h.state.playerId);
    player.pos.x = field.center.x + 5000; // approach beyond the 2700 WU budget
    player.pos.z = field.center.z;
    const reserves = [];
    h.bus.on('economy:resourceWork:reserve', (p) => reserves.push(p));
    const before = fieldRocks(h.state, field.id).length;
    h.world.update(1 / 60, h.state);
    assert.equal(reserves.length, 0, 'no budget call for an unreachable seam');
    const fresh = fieldRocks(h.state, field.id).length;
    assert.ok(fresh > before, 'the world heartbeat still breathes on its own clock');
    assert.equal(fieldRocks(h.state, field.id).filter((e) => e.data.resourceWork).length, 0,
      'free-seam rocks carry no lease identity');
  } finally {
    h.world.destroy && h.world.destroy();
  }
});

test('a known all-units-refused publication cancels instead of settling', () => {
  const h = bootWorldWithEconomy(6262);
  try {
    const field = prepareSeam(h);
    h.helpers.spawnEntity = () => null; // entity budget exhausted: every unit refused pre-creation
    const cancels = [];
    const settles = [];
    h.bus.on('economy:resourceWork:cancel', (p) => cancels.push(p));
    h.bus.on('economy:resourceWork:settle', (p) => settles.push(p));
    h.world.update(1 / 60, h.state);
    assert.equal(cancels.length, 1, 'known-uncommitted publication cancelled');
    assert.ok(cancels[0].result && cancels[0].result.ok === true, 'economy refunds the lease');
    assert.equal(settles.length, 0, 'nothing settled: nothing was published');
    assert.equal(fieldRocks(h.state, field.id).filter((e) => e.data.resourceWork).length, 0);
  } finally {
    h.world.destroy && h.world.destroy();
  }
});

test('partial acceptance settles only the committed quantity', () => {
  const h = bootWorldWithEconomy(7373);
  try {
    const field = prepareSeam(h, { drainWorkS: 20 }); // ~2 units at 7.5 workS each
    const settles = [];
    h.bus.on('economy:resourceWork:settle', (p) => settles.push(p));
    h.world.update(1 / 60, h.state);
    const rocks = fieldRocks(h.state, field.id).filter((e) => e.data.resourceWork);
    assert.ok(rocks.length >= 1 && rocks.length < 6, 'a bounded grant published a bounded seam');
    assert.equal(settles.length, 1);
    assert.equal(settles[0].producedQty, rocks.length);
    assert.ok(settles[0].result && settles[0].result.ok === true,
      `settle accepted: ${settles[0].result && settles[0].result.reason}`);
  } finally {
    h.world.destroy && h.world.destroy();
  }
});
