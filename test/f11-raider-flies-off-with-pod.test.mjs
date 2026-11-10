// §22 F11 — the winner flies off with the pod.
// The opening hauler raid (015) runs the shared freight-custody stack through plan.predation:
// a raider who wins the fight physically collects the spilled pods and flies a finite in-sector
// escape, pod aboard. Killing that raider respills the cargo; a player who scoops first leaves
// the raiders empty-handed — they never grow a replacement pod.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation } from '../src/core/sim.js';
import { actions } from '../src/systems/actions.js';
import { cargo } from '../src/systems/cargo.js';
import { combat } from '../src/systems/combat.js';
import { encounterDirector } from '../src/systems/encounterDirector.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';
import { surrenderRecovery } from '../src/systems/surrenderRecovery.js';

const SECTOR_ID = 'sector_helios_prime';
const ANCHOR = Object.freeze({ x: 1400, z: -900 });

function boot(seed = 91111) {
  // Production listener order: combat registers before the director so the kill event reaches
  // squadKill through the same path a live raid takes.
  const systems = [combat, surrenderRecovery, cargo, spawnBudget, encounterDirector];
  const sim = createSimulation({ seed, helpers: { voice: { say: () => true } }, systems });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = SECTOR_ID;
  state.world.activeSector = {
    stations: [{ id: 'station_helios', pos: { x: ANCHOR.x + 2400, z: ANCHOR.z }, name: 'Helios Station' }],
  };
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: ANCHOR.x - 700, z: ANCHOR.z },
    vel: { x: 0, z: 0 }, radius: 8, hull: 200, hullMax: 200,
    data: { intent: {}, ai: {} },
  });
  state.playerId = player.id;
  const events = [];
  for (const name of ['freight:cargoSpilled', 'freight:raiderEscaped', 'freight:custodyChanged', 'encounter:resolved']) {
    bus.on(name, (p) => events.push({ name, payload: structuredClone(p) }));
  }
  return { sim, state, bus, player, events, director: sim.registry.get('encounterDirector') };
}

function fire(h) {
  const encounterId = 'f11:opening-raid';
  assert.deepEqual(h.director.requestAuthoredEncounter({
    shapeId: 'opening_hauler_raid', encounterId, sectorId: SECTOR_ID,
    anchor: { ...ANCHOR }, zoneType: 'trade_lane', zoneRadius: 800, force: true,
  }), { ok: true, encounterId });
  const live = h.state.encounterDirector.live[encounterId];
  assert.ok(live, 'raid live record');
  return live;
}

function carrierOf(h, live) {
  return h.state.entities.get(live.data.predationTargetId);
}
function raiderOf(h, live) {
  return h.state.entities.get(live.data.predationRaiderId);
}
function pods(h, live) {
  return live.ids
    .filter((id) => live.roles[id] === 'freight_pod')
    .map((id) => h.state.entities.get(id))
    .filter(Boolean);
}

function collectBy(h, live, pod, collectorId) {
  const payload = {
    pickupId: pod.id,
    collectorId,
    kind: pod.data.kind,
    amount: pod.data.amount,
    commodityId: pod.data.commodityId,
    pos: { x: pod.pos.x, z: pod.pos.z },
  };
  h.bus.emit('pickup:collected', payload);
  if (payload.rejectedAmount <= 0) pod.alive = false;
  else if (payload.acceptedAmount > 0) pod.data.amount = payload.rejectedAmount;
  return payload;
}

test('a winning raider takes the pod, flies a finite in-sector point, and spills it when killed', () => {
  const h = boot(91101);
  const live = fire(h);

  // The custody plan armed at fire time: the hauler is the manifest carrier and one raider is
  // the designated thief under the freight stack.
  const carrier = carrierOf(h, live);
  const raider = raiderOf(h, live);
  assert.ok(carrier, 'predation carrier bound');
  assert.ok(raider, 'predation raider bound');
  assert.equal(carrier.data.freightRewardOwner, 'manifest_custody');
  assert.equal(carrier.data.cargoManifest.lines[0].commodityId, 'cmdty_fuel_cells');
  assert.equal(live.data.predationStatus, 'active', 'hot start: the thief is already working');

  // The rest of the squad is not stood down — the raid keeps burning while the thief works.
  const others = h.director.entsOf(live, 'raider').filter((e) => e.id !== raider.id);
  h.sim.runTicks(61);
  for (const other of others) {
    assert.notEqual(other.data.ai.passive, true, 'non-designated raider stays in the fight');
    assert.equal(other.data.ai.predationStatus, undefined);
  }

  // The raiders win: the hauler dies and its hold spills as custody pods.
  h.sim.registry.get('combat').kill(carrier, raider.id);
  const record = live.data.freightCargoCustody;
  assert.ok(record, 'custody ledger opened on carrier death');
  const spilled = pods(h, live);
  assert.ok(spilled.length > 0, 'carrier death spills physical pods');
  assert.equal(live.phase, 'conflict', 'encounter stays live while cargo is in play');

  // The thief picks them up — every live pod moves to raider custody, hosted on that ship.
  for (const pod of spilled) collectBy(h, live, pod, raider.id);
  assert.equal(record.raiderId, raider.id, "the pod's host is the fleeing raider");
  assert.ok(record.raiderSecuredQty > 0);
  assert.equal(record.pods.every((pod) => pod.status !== 'live'), true);

  // Next director beat the escape arms: a finite in-sector point, and the raider's doctrine is FLEE.
  h.sim.runTicks(61);
  const target = record.escapeTarget;
  assert.ok(target && Number.isFinite(target.x) && Number.isFinite(target.z), 'finite escape point');
  const escapeLeg = Math.hypot(target.x - record.escapeOrigin.x, target.z - record.escapeOrigin.z);
  assert.ok(escapeLeg > 0 && escapeLeg <= record.escapeRadius * 1.25 + 1,
    'destination is a bounded in-sector point, not a map edge');
  assert.equal(raider.data.ai.activity.kind, 'flee');
  assert.equal(record.raiderEscaped, false, 'the raider still has to actually fly the leg');

  // Catching them works: killing the carrier ship spills its secured cargo back into the world.
  h.sim.registry.get('combat').kill(raider, h.player.id);
  assert.ok(record.raiderSecuredQty === 0, 'secured cargo leaves the dead raider');
  const respilled = record.pods.filter((pod) => pod.status === 'live');
  assert.ok(respilled.length > 0, 'the pod is back in the world as loose bodies');
});

test('a player who scoops the spill first leaves the raiders nothing to grow back', () => {
  const h = boot(91102);
  const live = fire(h);
  const carrier = carrierOf(h, live);
  const raider = raiderOf(h, live);

  h.sim.registry.get('combat').kill(carrier, raider.id);
  const record = live.data.freightCargoCustody;
  const spilled = pods(h, live);
  assert.ok(spilled.length > 0);

  for (const pod of spilled) collectBy(h, live, pod, h.state.playerId);
  assert.equal(record.raiderSecuredQty, 0, 'nothing reaches the raider');
  assert.equal(record.playerCollectedQty, record.initialQty - record.lostQty - record.carrierQty);

  // Let the custody beat run: no new pods materialize for the raider and no escape ever arms.
  h.sim.runTicks(120);
  assert.equal(record.raiderSecuredQty, 0);
  assert.equal(record.escapeStartedAt, null);
  assert.equal(record.pods.some((pod) => pod.status === 'raider_secured'), false,
    'raiders do not grow a replacement pod');
});
