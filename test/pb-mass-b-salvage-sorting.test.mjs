// PB-MASS-B — SF-029 salvage-sorting job through the same combat grammar.
//
// One wreck-side job: the valuable heavy core sits at its wreck under a breakable clamp,
// ringed by light dangerous debris, with a static destination cradle. The pins hold the
// packet's acceptance cases: the core CANNOT be collected while the clamp still holds it
// (no proximity timer), a sheared clamp frees the core and a clean tow pays the salvage bay
// in full through the cargo owner's addSalvage (real custody, not mission credits), a debris
// strike on the tow turns part of the reward into a named repair estimate, and delivery is
// exactly once. Pocket placement is seeded and never draws from the zone's own rng stream.
// Seed 4242.

import assert from 'node:assert/strict';
import test from 'node:test';

import { createAttachmentService } from '../src/combat/attachments.js';
import { createCombatCatalog, ensureCombatState } from '../src/combat/runtime.js';
import { createBus } from '../src/core/eventBus.js';
import { hash32, mulberry32 } from '../src/core/rng.js';
import { salvage } from '../src/systems/salvage.js';

const SEED = 4242;
const DT = 1 / 60;
const COMMODITY = 'cmdty_salvage_electronics';
const ELECTRONICS_BASE_PRICE = 36; // src/data/commodities.js — the repair estimate prices from this

function stubCombatPhysics() {
  // The telemetry source is a closure cell so a test can load honest tension into the kernel's
  // break pass without mutating the (frozen) helpers object after wiring. `booting` simulates
  // the physics port coming up late: createAttachment rejects (null) until setBooting(false).
  let telemetry = null;
  let booting = false;
  return {
    physics: {
      createAttachment(input) {
        if (booting) return null; // the kernel's own physics_create_rejected path
        return {
          id: input.attachmentId,
          attachmentId: input.attachmentId,
          ownerId: input.ownerId,
          targetId: input.targetId,
        };
      },
      cutAttachment() {
        return true;
      },
      setAttachmentReel() { return true; },
      getAttachmentTelemetry() { return telemetry; },
    },
    loadTelemetry(next) { telemetry = next; },
    setBooting(next) { booting = !!next; },
  };
}

function spawn(id, type, pos, extra = {}) {
  return {
    id,
    type,
    team: extra.team ?? null,
    alive: true,
    pos: { x: pos.x, z: pos.z },
    vel: extra.vel ? { x: extra.vel.x, z: extra.vel.z } : { x: 0, z: 0 },
    rot: 0,
    radius: extra.radius ?? 8,
    mass: extra.mass ?? 20,
    collides: extra.collides ?? true,
    hull: extra.hull ?? 100,
    hullMax: extra.hullMax ?? 100,
    flags: {},
    data: extra.data || {},
  };
}

function makeHarness(entityList, extraState = {}) {
  const entities = new Map(entityList.map((entity) => [entity.id, entity]));
  const state = {
    mode: 'flight',
    simTime: 10,
    tick: 600,
    seed: SEED,
    rng: mulberry32(SEED),
    playerId: 1,
    player: {
      tether: { active: false, targetId: null, strain: 0, load: 0, attachmentId: null, restLength: 0, phase: 'slack' },
      cargo: { capVolume: 200 },
    },
    entities,
    entityList,
    input: { actions: {} },
    combat: null,
    ...extraState,
  };
  ensureCombatState(state);
  const bus = createBus();
  const catalog = createCombatCatalog();
  const physics = stubCombatPhysics();
  const attachments = createAttachmentService({
    state,
    catalog,
    helpers: { combatPhysics: physics.physics, catalog },
    bus,
  });
  const system = Object.assign({}, salvage);
  system.init({
    state,
    bus,
    helpers: { hash32, mulberry32, combatPhysics: physics.physics, catalog },
    registry: {
      get(name) {
        if (name === 'actions' || name === 'combat') return { kernel: { attachments } };
        return null;
      },
    },
  });
  return { state, bus, system, attachments, physics };
}

// The authored pocket: wreck at the origin, its heavy drive core seated beside it under the
// clamp, one dangerous debris rock on the east arc, and the static cradle far to the south.
function makePocketEntities() {
  const wreck = spawn(2, 'wreck', { x: 0, z: 0 }, {
    radius: 9, mass: 1800,
    data: { parentType: 'debris', salvagePool: { [COMMODITY]: 5 } },
  });
  const core = spawn(3, 'payload', { x: 16, z: 0 }, {
    radius: 5, mass: 620, collides: false,
    data: { parentType: 'sort_core', role: 'sort_core', salvagePool: { [COMMODITY]: 5 } },
  });
  const cradle = spawn(4, 'wreck', { x: 0, z: 320 }, {
    radius: 14, mass: 1e9, hull: 1e9, hullMax: 1e9,
    data: { parentType: 'sort_cradle', salvagePool: {} },
  });
  const debris = spawn(5, 'wreck', { x: 80, z: 10 }, {
    radius: 4, mass: 45,
    data: { parentType: 'sort_debris', salvagePool: { cmdty_scrap_metal: 1 } },
  });
  return { wreck, core, cradle, debris };
}

function makePocket(pocketId = 'z1:sal0:sort') {
  return {
    id: pocketId,
    schema: 'spaceface.salvageSort.v1',
    sectorId: 'sec_test',
    zoneId: 'z1',
    wreckId: 2,
    coreId: 3,
    cradleId: 4,
    debrisIds: [5],
    commodityId: COMMODITY,
    poolQty: 5,
    gapAngles: [0, Math.PI],
    clampId: null,
    phase: 'held',
    integrity: 1,
    prevCorePos: null,
    contacts: null,
  };
}

function tickSort({ state, system }) {
  state.tick += 1;
  state.simTime += DT;
  system.update(DT, state);
}

test('the core cannot be collected while the clamp still holds it — even sitting in the cradle', () => {
  const parts = makePocketEntities();
  const harness = makeHarness([spawn(1, 'ship', { x: 40, z: 40 }, { team: 0 }), parts.wreck, parts.core, parts.cradle, parts.debris]);
  const { state, system, bus, attachments } = harness;
  // Start the job with the core ALREADY inside the cradle at docked speed — the worst case
  // for a proximity-timer implementation. The clamp is the gate, not geography.
  parts.core.pos = { x: 0, z: 326 };
  parts.core.vel = { x: 0, z: 2 };
  state.salvage.sortPockets = [makePocket()];
  const deliveries = [];
  bus.on('salvage:sortDelivered', (receipt) => deliveries.push(receipt));

  tickSort(harness); // clamp adoption tick
  const clamp = Object.values(state.combat.attachments.byId)
    .find((a) => a.defId === 'attachment_salvage_clamp');
  assert.ok(clamp, 'the pocket holds the core through a real salvage-clamp attachment');
  assert.equal(clamp.state, 'active');
  assert.equal(state.salvage.sortPockets[0].phase, 'held');

  tickSort(harness); // delivery tick — refused
  assert.equal(deliveries.length, 0, 'a clamped core is never collected');
  assert.equal(state.player.salvageBay, undefined, 'the bay stays untouched while clamped');
  assert.equal(state.salvage.sortPockets[0].phase, 'held');
  assert.equal(parts.core.alive, true);

  // And the kernel's own break pass with honest telemetry under the clamp's envelope keeps it
  // held while the load stays under the threshold — the clamp is physical, not a phase flag.
  attachments.updateTelemetryAndBreak();
  assert.equal(clamp.state, 'active');
});

test('a failed clamp adoption on a booting physics port stays held silently, then adopts and proceeds', () => {
  const parts = makePocketEntities();
  const harness = makeHarness([spawn(1, 'ship', { x: 40, z: 40 }, { team: 0 }), parts.wreck, parts.core, parts.cradle, parts.debris]);
  const { state, system, bus, attachments, physics } = harness;
  physics.setBooting(true); // the physics port is not up yet — every createAttachment rejects
  // Worst case for a boot race: the core already sits in the cradle at docked speed.
  parts.core.pos = { x: 0, z: 326 };
  parts.core.vel = { x: 0, z: 2 };
  state.salvage.sortPockets = [makePocket()];
  const events = { separated: [], comms: [], deliveries: [] };
  bus.on('salvage:sortSeparated', (p) => events.separated.push(p));
  bus.on('comms:log', (p) => events.comms.push(p));
  bus.on('salvage:sortDelivered', (receipt) => events.deliveries.push(receipt));

  // First tick: adoption is attempted and rejected. That is a boot race, not a shear.
  tickSort(harness);
  assert.equal(state.salvage.sortPockets[0].phase, 'held', 'a rejected creation never reads as a shear');
  assert.equal(state.salvage.sortPockets[0].clampId, null);
  assert.equal(events.separated.length, 0, 'no salvage:sortSeparated on a failed adoption');
  assert.equal(events.comms.length, 0, 'no comms line on a failed adoption');
  assert.equal(state.player.salvageBay, undefined, 'still not collectible while unadopted');
  assert.equal(parts.core.alive, true);

  // The port keeps booting: the retry stays quiet — no event spam, still held.
  tickSort(harness);
  assert.equal(state.salvage.sortPockets[0].phase, 'held');
  assert.equal(events.separated.length, 0);
  assert.equal(events.comms.length, 0);

  // Port comes up: the same pocket adopts normally on a later tick, stays held, and the
  // clamped-in-cradle acceptance invariant still refuses collection.
  physics.setBooting(false);
  tickSort(harness);
  const pocket = state.salvage.sortPockets[0];
  assert.ok(pocket.clampId, 'the clamp adopts once the port is live');
  assert.equal(pocket.phase, 'held');
  const clamp = attachments.get(pocket.clampId);
  assert.ok(clamp && clamp.state === 'active');
  assert.equal(events.deliveries.length, 0, 'an adopted clamp still refuses collection in the cradle');

  // And the adopted clamp shearing under the kernel's real break pass is the ONLY separation.
  // The core is towed clear of the cradle first so the shear tick itself is not a delivery.
  parts.core.pos = { x: 16, z: 0 };
  parts.core.vel = { x: 0, z: 0 };
  state.tick += 20;
  clamp.createdTick = state.tick - 20;
  physics.loadTelemetry({ tension: 5000, impulse: 0, yank: 0 });
  for (let i = 0; i < 24 && pocket.phase === 'held'; i++) {
    state.tick += 1;
    attachments.updateTelemetryAndBreak();
    system.update(DT, state);
  }
  assert.equal(pocket.phase, 'free', 'the kernel-observed shear frees the core');
  assert.equal(events.separated.length, 1, 'exactly one separation event, from the real break');
  assert.ok(events.comms.some((line) => /CLAMP SHEARED/.test(line.text)),
    'the sheared comms line comes from the shear, never from adoption failure');
  assert.equal(events.deliveries.length, 0, 'a free core away from the cradle is not yet collected');

  // Normal completion from there.
  parts.core.pos = { x: 0, z: 328 };
  parts.core.vel = { x: 0, z: 4 };
  tickSort(harness);
  assert.equal(events.deliveries.length, 1);
  assert.equal(state.player.salvageBay.items[COMMODITY], 5);
});

test('a sheared clamp frees the core and a clean tow pays the salvage bay in full', () => {
  const parts = makePocketEntities();
  const harness = makeHarness([spawn(1, 'ship', { x: 40, z: 40 }, { team: 0 }), parts.wreck, parts.core, parts.cradle, parts.debris]);
  const { state, system, bus, attachments, physics } = harness;
  state.salvage.sortPockets = [makePocket()];
  const events = { separated: 0, deliveries: [] };
  bus.on('salvage:sortSeparated', () => { events.separated += 1; });
  bus.on('salvage:sortDelivered', (receipt) => events.deliveries.push(receipt));

  tickSort(harness); // clamp adopted
  const clamp = Object.values(state.combat.attachments.byId)
    .find((a) => a.defId === 'attachment_salvage_clamp');
  assert.ok(clamp);

  // A deliberate tow loads the clamp past its envelope: the kernel's break pass (real tension
  // telemetry, past the 12-tick grace) first arms the universal 15-tick warning lease, then
  // shears the clamp when the load holds through it. The line's own budget is far higher —
  // the clamp is the end that gives.
  state.tick += 20;
  clamp.createdTick = state.tick - 20;
  physics.loadTelemetry({ tension: 5000, impulse: 0, yank: 0 });
  let brokeAt = -1;
  for (let i = 0; i < 24 && brokeAt < 0; i++) {
    state.tick += 1;
    attachments.updateTelemetryAndBreak();
    if (attachments.get(clamp.id).state === 'broken') brokeAt = i + 1;
  }
  assert.ok(brokeAt > 0, 'the clamp envelope gives under a genuine tow load');
  assert.ok(brokeAt <= 17, 'the shear lands inside the authored warning lease, not immediately');

  tickSort(harness); // the sort read observes the shear
  assert.equal(state.salvage.sortPockets[0].phase, 'free', 'the broken clamp frees the core');
  assert.equal(events.separated, 1, 'separation announces exactly once');

  // Tow: the free core set down inside the cradle at docked speed.
  parts.core.pos = { x: 0, z: 328 };
  parts.core.vel = { x: 0, z: 4 };
  tickSort(harness);
  assert.equal(state.salvage.sortPockets[0].phase, 'delivered');
  assert.equal(events.deliveries.length, 1);
  const receipt = events.deliveries[0];
  assert.equal(receipt.paid, 5, 'full integrity pays the full pool');
  assert.equal(receipt.accepted, 5, 'the bay accepted every unit');
  assert.equal(receipt.lost, 0);
  assert.equal(receipt.repairEstimateCr, 0);
  assert.equal(state.player.salvageBay.items[COMMODITY], 5, 'custody landed in the real salvage bay');
  assert.equal(parts.core.alive, false, 'the cradle took the core body');

  // Exactly once: further ticks never re-deliver.
  parts.core.alive = true; // even a hostile resurrection of the entity id cannot double-pay
  tickSort(harness);
  assert.equal(events.deliveries.length, 1);
  assert.equal(state.player.salvageBay.items[COMMODITY], 5);
});

test('debris scored on the tow turns part of the reward into a named repair estimate', () => {
  const parts = makePocketEntities();
  const harness = makeHarness([spawn(1, 'ship', { x: 40, z: 40 }, { team: 0 }), parts.wreck, parts.core, parts.cradle, parts.debris]);
  const { state, system, bus } = harness;
  const pocket = makePocket();
  state.salvage.sortPockets = [pocket];
  const deliveries = [];
  bus.on('salvage:sortDelivered', (receipt) => deliveries.push(receipt));

  // Free the core without the clamp rig: the wreck that held it is gone (authority broke with it).
  parts.wreck.alive = false;
  tickSort(harness);
  assert.equal(pocket.phase, 'free', 'a lost holding wreck leaves the core loose');
  assert.equal(pocket.integrity, 1);

  // Sweep the core THROUGH the debris rock between ticks: the swept segment read catches the
  // contact a same-position check would miss. One pass costs one integrity step.
  pocket.prevCorePos = { x: 56, z: 10 };
  parts.core.pos = { x: 104, z: 10 };
  tickSort(harness);
  assert.equal(pocket.integrity, 0.85, 'one debris strike costs one integrity step');
  // Resting in contact does not grind: a second tick inside the same contact is not a new strike.
  pocket.prevCorePos = { x: 104, z: 10 };
  parts.core.pos = { x: 106, z: 10 };
  tickSort(harness);
  assert.equal(pocket.integrity, 0.85, 'staying in contact is one strike, not a per-tick drain');

  // Set the scored core down: the bay takes what the geometry left, the rest is named repair work.
  parts.core.pos = { x: 0, z: 328 };
  parts.core.vel = { x: 0, z: 4 };
  tickSort(harness);
  assert.equal(deliveries.length, 1);
  const receipt = deliveries[0];
  assert.equal(receipt.integrity, 0.85);
  assert.equal(receipt.paid, 4, 'floor(pool x integrity) — the scored unit does not pay');
  assert.equal(receipt.accepted, 4);
  assert.equal(receipt.lost, 1);
  assert.equal(receipt.repairEstimateCr, ELECTRONICS_BASE_PRICE, 'the lost unit is priced as core repair');
  assert.equal(state.player.salvageBay.items[COMMODITY], 4);
});

test('pocket placement is seeded, bounded, and never draws from the zone rng stream', () => {
  const parts = makePocketEntities();
  const harness = makeHarness([parts.wreck, parts.core, parts.cradle, parts.debris]);
  const { state } = harness;
  const spawnEntity = (spec) => {
    const ent = spawn(100 + state.entityList.length, spec.type, spec.pos, {
      radius: spec.radius, mass: spec.mass, hull: spec.hull, hullMax: spec.hullMax,
      collides: spec.collides, data: spec.data,
    });
    state.entityList.push(ent);
    state.entities.set(ent.id, ent);
    return ent;
  };
  const zone = { id: 'z1', center: { x: 0, z: 0 }, radius: 400 };
  const wreck = spawn(2, 'wreck', { x: 0, z: 0 }, {
    radius: 9, mass: 1800,
    data: { parentType: 'debris', salvagePool: { [COMMODITY]: 5, cmdty_scrap_metal: 3 } },
  });
  // Same seed, same wreck state → byte-identical pocket geometry.
  const a = system_makePocket(harness.system, state, zone, wreck, spawnEntity);
  const b = system_makePocket(harness.system, state, zone, wreck, spawnEntity);
  assert.ok(a && b, 'the roll lands for this seed');
  assert.deepEqual(
    { core: state.entities.get(a.coreId).pos, cradle: state.entities.get(a.cradleId).pos, gaps: a.gapAngles, integrity: a.integrity, phase: a.phase },
    { core: state.entities.get(b.coreId).pos, cradle: state.entities.get(b.cradleId).pos, gaps: b.gapAngles, integrity: b.integrity, phase: b.phase },
    'two independent plans of the same seed agree exactly',
  );
  // The core spawns seated at the wreck (clampable span), the cradle is reachable but separate,
  // and every debris body keeps off the two authored gap lanes.
  const core = state.entities.get(a.coreId);
  const wreckSpan = Math.hypot(core.pos.x - wreck.pos.x, core.pos.z - wreck.pos.z);
  assert.ok(wreckSpan < 40, 'the core starts seated at its wreck');
  const cradle = state.entities.get(a.cradleId);
  const cradleDist = Math.hypot(cradle.pos.x - wreck.pos.x, cradle.pos.z - wreck.pos.z);
  assert.ok(cradleDist > 200 && cradleDist < 420, 'the cradle is a tow away, not on top of the wreck');
  for (const debrisId of a.debrisIds) {
    const d = state.entities.get(debrisId);
    const ang = Math.atan2(d.pos.z - wreck.pos.z, d.pos.x - wreck.pos.x);
    for (const gap of a.gapAngles) {
      let delta = (ang - gap) % (Math.PI * 2);
      if (delta > Math.PI) delta -= Math.PI * 2;
      if (delta < -Math.PI) delta += Math.PI * 2;
      assert.ok(Math.abs(delta) > 0.5, 'the safe pull lanes are actually clear of debris');
    }
  }
});

function system_makePocket(system, state, zone, wreck, spawnEntity) {
  state.salvage.sortPockets = state.salvage.sortPockets.filter((p) => p.sectorId !== 'sec_test');
  return system._makeSortPocket('sec_test', zone, 'z1:sal0', wreck, SEED, spawnEntity);
}
