// PIC-26, PIC-27, WORLD-25, NXI-017, NXI-050.
// Seed 4242. One cut, two tracked cores, hazard alert in and out, a partial unload
// that keeps the same load, and a blocked retreat that picks another heading.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createAttachmentService } from '../src/combat/attachments.js';
import { createCombatCatalog, ensureCombatState } from '../src/combat/runtime.js';
import {
  aftermathForSector,
  aftermathWrecks,
  listWreckFieldInhabitants,
  WRECK_ECOLOGY_DAY_S,
} from '../src/systems/aftermathWrecks.js';
import { salvageActions } from '../src/systems/salvageActions.js';
import { world } from '../src/systems/world.js';
import { createAlerts } from '../src/ui/alerts.js';
import { tetherGameplay } from '../src/systems/tetherGameplay.js';
import { ManeuverKind } from '../src/ai/contracts.js';
import { ManeuverPlanner, MANEUVER_SPEED_CAPS } from '../src/ai/maneuver.js';
import { resolveWorldCueReceipt } from '../src/render/vfx/worldCueRecipes.js';
import { zonesForSector } from '../src/data/sectorZones.js';
import { sectorLocalToGlobalForSector } from '../src/data/sectorCoordinates.js';

const SEED = 4242;
const DT = 1 / 60;
const SECTOR_ID = 'sector_helios_prime';

test('PIC-26 seed 4242 wreckEcology:scavenged yields one cut on the wreck at the contact', () => {
  const state = {
    meta: { seed: SEED },
    tick: 60,
    simTime: 0,
    playerId: 1,
    player: { cargo: { items: {}, capVolume: 40, usedVolume: 0, usedMass: 0 }, miningBeam: null },
    world: { currentSectorId: SECTOR_ID },
    entities: new Map(),
    entityList: [],
    rng() { return 0.35; },
  };
  const bus = createBus();
  let nextEntityId = 900;
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
  aftermathWrecks.init({ state, bus, helpers, registry: { get: () => null } });
  const cues = [];
  const scavenged = [];
  bus.on('presentation:cue', (payload) => {
    if (payload && payload.id === 'wreck.scavenge.cut') cues.push(payload);
  });
  bus.on('wreckEcology:scavenged', (payload) => scavenged.push(payload));
  try {
    const zone = zonesForSector(SECTOR_ID)[0];
    const pos = sectorLocalToGlobalForSector(zone.center, SECTOR_ID);
    const victim = {
      id: 42, type: 'ship', alive: false, pos: { ...pos }, vel: { x: 5, z: 2 }, mass: 22,
      factionId: 'faction_reach',
      data: { defId: 'ship_corsair', shipClass: 'corsair_raider', name: 'Red Wake' },
    };
    state.entities.set(victim.id, victim);
    state.entityList.push(victim);
    bus.emit('entity:killed', {
      id: victim.id, killerId: 1, type: 'ship', victimClass: 'corsair_raider',
      pos: { ...pos }, sectorId: SECTOR_ID,
    });
    state.simTime = WRECK_ECOLOGY_DAY_S;
    aftermathWrecks.update(DT, state);
    const wreck = state.entityList.find((entity) => entity.type === 'wreck' && entity.alive !== false);
    const marker = aftermathForSector(state, SECTOR_ID)[0];
    const fieldId = `aft:${SECTOR_ID}:${marker && marker.zoneId}`;
    const scav = listWreckFieldInhabitants(state, fieldId)
      .find((entity) => entity.data && entity.data.wreckEcologyRole === 'scavenger');
    assert.ok(wreck, 'the wreck is the body being cut');
    assert.ok(scav, 'seed 4242 still fields the one scavenger the budget already allowed');
    scav.pos.x = wreck.pos.x + 5;
    scav.pos.z = wreck.pos.z;
    const bodies = state.entityList.length;
    state.simTime += 5;
    aftermathWrecks.update(DT, state);

    assert.equal(scavenged.length, 1, 'one scavenge, one cut');
    assert.equal(cues.length, 1);
    const cue = cues[0];
    assert.equal(cue.sourceEvent, 'wreckEcology:scavenged');
    assert.equal(cue.targetId, wreck.id);
    assert.equal(cue.sourceId, scav.id);
    const dx = scav.pos.x - wreck.pos.x;
    const dz = scav.pos.z - wreck.pos.z;
    const len = Math.hypot(dx, dz) || 1;
    const reach = Math.min(wreck.radius || 0, len);
    const expectX = wreck.pos.x + (dx / len) * reach;
    const expectZ = wreck.pos.z + (dz / len) * reach;
    assert.ok(Math.hypot(cue.position.x - expectX, cue.position.z - expectZ) < 1e-6, 'contact on the wreck');
    assert.ok(Math.hypot(cue.position.x - wreck.pos.x, cue.position.z - wreck.pos.z) <= (wreck.radius || 0) + 1e-6);

    const receipt = resolveWorldCueReceipt(cue, state);
    assert.ok(receipt, 'the cut is on the world-cue whitelist');
    assert.equal(receipt.kind, 'wreck.scavenge.cut');
    assert.ok(Math.hypot(receipt.pos.x - expectX, receipt.pos.z - expectZ) < 1e-6);
    assert.equal(state.entityList.length, bodies, 'the cut did not add a scavenger marker');
  } finally {
    aftermathWrecks.destroy();
  }
});

test('PIC-27 seed 4242 cooker flight and an ejected core each leave one tracked body', () => {
  const state = {
    meta: { seed: SEED },
    simTime: 100,
    tick: 6000,
    playerId: 1,
    entities: new Map(),
    entityList: [],
    player: { tether: null },
  };
  const bus = createBus();
  const sys = Object.create(salvageActions);
  sys.init({
    state, bus, registry: { get: () => null },
    helpers: { voice: { say() {} } },
  });
  const cues = [];
  const ejected = [];
  const detonated = [];
  bus.on('presentation:cue', (payload) => cues.push(payload));
  bus.on('salvage:coreEjected', (payload) => ejected.push(payload));
  bus.on('salvage:coreDetonated', (payload) => detonated.push(payload));

  const wreck = {
    id: 50, type: 'wreck', alive: true, team: -1, radius: 10,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    data: { unstableReactor: { dueAt: 105, damage: 20, vented: false, burst: false, towedClear: false } },
  };
  const miner = {
    id: 60, type: 'ship', alive: true, team: 2, radius: 8,
    pos: { x: 150, z: 0 }, vel: { x: 0, z: 0 },
    data: { ai: { archetype: 'miner' } },
  };
  state.entities.set(wreck.id, wreck);
  state.entities.set(miner.id, miner);
  state.entityList.push(wreck, miner);

  sys.update(DT, state);
  const flight = cues.filter((cue) => cue.sourceEvent === 'salvage:cookerFlight');
  assert.equal(flight.length, 1);
  assert.equal(flight[0].id, 'salvage.cooker.tracked');
  assert.equal(flight[0].trackedBody, true);
  assert.equal(flight[0].targetId, wreck.id);
  const flightReceipt = resolveWorldCueReceipt(flight[0], state);
  assert.equal(flightReceipt.trackedBody, true);
  assert.equal(flightReceipt.attachToTarget, true);
  assert.equal(flightReceipt.targetId, wreck.id);
  assert.ok(Math.hypot(flightReceipt.pos.x - wreck.pos.x, flightReceipt.pos.z - wreck.pos.z) < 1e-6);

  sys.update(DT, state);
  assert.equal(cues.filter((cue) => cue.sourceEvent === 'salvage:cookerFlight').length, 1, 'one shape, not a repeat');

  bus.emit('salvage:ventReactor', { wreckId: wreck.id });
  const coreCues = cues.filter((cue) => cue.sourceEvent === 'salvage:coreEjected');
  assert.equal(coreCues.length, 1);
  assert.equal(ejected.length, 1);
  assert.equal(ejected[0].cooledAt, 125, 'the 25s fuse is unchanged');
  assert.equal(detonated.length, 0);
  assert.equal(coreCues[0].trackedBody, true);
  assert.equal(coreCues[0].trackKey, `vented-core:${wreck.id}`);
  const loose = resolveWorldCueReceipt(coreCues[0], state);
  assert.equal(loose.trackedBody, true);
  assert.ok(Math.hypot(loose.pos.x - coreCues[0].position.x, loose.pos.z - coreCues[0].position.z) < 1e-6);

  const core = {
    id: 80, type: 'pickup', alive: true, radius: 3,
    pos: { x: coreCues[0].position.x + 12, z: coreCues[0].position.z - 4 },
    vel: { x: 1, z: 0 },
    data: { ventedCore: true, trackKey: coreCues[0].trackKey },
  };
  state.entities.set(core.id, core);
  const tracked = resolveWorldCueReceipt(coreCues[0], state);
  assert.equal(tracked.trackedBody, true);
  assert.equal(tracked.attachToTarget, true);
  assert.equal(tracked.targetId, core.id);
  assert.ok(Math.hypot(tracked.pos.x - core.pos.x, tracked.pos.z - core.pos.z) < 1e-6, 'the shape follows the core');
});

function installAlertDom() {
  const byId = new Map();
  function FakeElement(tag) {
    this.tagName = tag;
    this.children = [];
    this.className = '';
    this._text = '';
    this.id = '';
  }
  FakeElement.prototype.appendChild = function appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    if (child.id) byId.set(child.id, child);
    return child;
  };
  FakeElement.prototype.append = function append(...nodes) {
    nodes.forEach((node) => this.appendChild(node));
  };
  FakeElement.prototype.removeChild = function removeChild(child) {
    const index = this.children.indexOf(child);
    if (index >= 0) this.children.splice(index, 1);
    child.parentNode = null;
    return child;
  };
  Object.defineProperty(FakeElement.prototype, 'textContent', {
    get() { return this._text; },
    set(value) { this._text = String(value == null ? '' : value); },
  });
  FakeElement.prototype.setAttribute = function setAttribute() {};
  const root = new FakeElement('div');
  root.id = 'alerts';
  byId.set('alerts', root);
  globalThis.document = {
    getElementById(id) { return byId.get(id) || null; },
    createElement(tag) { return new FakeElement(tag); },
  };
  globalThis.performance = globalThis.performance || { now: () => 1000 };
  return root;
}

function alertTexts(root) {
  const texts = [];
  for (const el of root.children) {
    for (const child of el.children || []) {
      if (String(child.className).includes('sf-alert__text') && child.textContent) texts.push(child.textContent);
    }
  }
  return texts;
}

test('WORLD-25 seed 4242 hazard entry raises one alert and exit clears it', () => {
  const root = installAlertDom();
  const bus = createBus();
  createAlerts({ bus });
  const system = Object.create(world);
  const player = {
    id: 1, type: 'ship', alive: true, pos: { x: 0, z: 0 },
    hull: 40, hullMax: 100, shield: 20, shieldMax: 40, flags: {},
  };
  const state = {
    meta: { seed: SEED },
    playerId: 1,
    simTime: 0,
    tick: 1,
    entities: new Map([[1, player]]),
    world: { activeSector: { hazards: [] } },
  };
  system.state = state;
  system.bus = bus;
  system.registry = null;
  system.helpers = {};
  system._hazardSet = new Set();
  system._hazardNextSet = new Set();

  function run(type) {
    root.children.length = 0;
    system._hazardSet = new Set();
    system._hazardNextSet = new Set();
    player.pos.x = 0;
    player.pos.z = 0;
    player.shield = 20;
    player.hull = 40;
    const changed = [];
    const off = bus.on('hazard:changed', (payload) => changed.push(payload));
    state.world.activeSector.hazards = [{
      id: `${type}-4242`, type, center: { x: 0, z: 0 }, radius: 80, intensity: 0.5,
    }];
    system._tickHazards(0, state);
    assert.equal(changed.length, 1, `${type} entry emits one hazard:changed`);
    assert.equal(changed[0].phase, 'enter');
    assert.equal(changed[0].zoneType, type);
    assert.deepEqual(alertTexts(root), [type === 'radiation' ? 'RADIATION' : 'NEBULA']);
    assert.equal(player.shield, 20, 'the alert tick does not add hazard damage');
    assert.equal(player.hull, 40);

    system._tickHazards(0, state);
    assert.equal(changed.length, 1, 'standing inside does not raise a second alert');
    assert.equal(alertTexts(root).length, 1);

    player.pos.x = 500;
    system._tickHazards(0, state);
    assert.equal(changed.length, 2);
    assert.equal(changed[1].phase, 'exit');
    assert.equal(changed[1].zoneType, type);
    assert.deepEqual(alertTexts(root), []);
    bus.off('hazard:changed', off);
  }

  run('radiation');
  run('nebula');

  const boss = [];
  bus.on('hazard:changed', (payload) => {
    if (payload && payload.reason === 'boss_defeated') boss.push(payload);
  });
  bus.emit('hazard:changed', {
    reason: 'boss_defeated', sectorId: 'sector_helios_prime', type: 'radiation', intensity: 0,
  });
  assert.equal(boss.length, 1);
  assert.deepEqual(alertTexts(root), [], 'a boss intensity change is not a hazard-entry alert');
});

function tetherHarness(payload) {
  const ship = {
    id: 1, type: 'ship', team: 0, alive: true,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0,
    radius: 8, mass: 16, maxSpeed: 218, flags: {},
  };
  const entityList = [ship, payload];
  const state = {
    meta: { seed: SEED },
    mode: 'flight',
    simTime: 1,
    tick: 60,
    playerId: ship.id,
    player: {
      heat: 0,
      targetId: payload.id,
      tether: { active: false, targetId: null, strain: 0, load: 0, attachmentId: null, restLength: 0, phase: 'slack' },
    },
    entities: new Map(entityList.map((entity) => [entity.id, entity])),
    entityList,
    spatialHash: {
      diagnostics: { activeBuckets: 1 },
      queryRadius(x, z, radius, out) {
        for (const entity of entityList) {
          if (!entity || !entity.pos || entity.alive === false) continue;
          const dist = Math.hypot(entity.pos.x - x, entity.pos.z - z);
          if (dist <= radius + (entity.radius || 0)) out.push(entity);
        }
      },
    },
    input: {
      aimWorld: { x: payload.pos.x, z: payload.pos.z },
      aimAngle: 0,
      tetherMode: null,
      actions: { tetherFire: false, tetherCut: false, reelDelta: 0 },
    },
    combat: null,
  };
  ensureCombatState(state);
  const bus = createBus();
  const broke = [];
  bus.on('tether:broke', (row) => broke.push(row));
  const catalog = createCombatCatalog();
  const helpers = {
    combatPhysics: {
      createAttachment(input) {
        return { id: input.attachmentId, attachmentId: input.attachmentId, ownerId: input.ownerId, targetId: input.targetId };
      },
      cutAttachment() { return true; },
      setAttachmentReel() { return true; },
      getAttachmentTelemetry() { return null; },
    },
  };
  const attachments = createAttachmentService({ state, catalog, helpers, bus });
  const kernel = { attachments, catalog: { attachments: catalog.attachments } };
  const system = Object.assign({}, tetherGameplay);
  system.init({
    state, bus, helpers,
    registry: { get(name) { return name === 'actions' || name === 'combat' ? { kernel } : null; } },
  });
  return { state, bus, system, broke, payload, ship };
}

function latchPayload(h) {
  h.state.tick += 6;
  h.state.simTime += DT * 6;
  h.system.update(DT, h.state);
  h.state.tick += 1;
  h.state.simTime += DT;
  h.state.input.actions.tetherFire = true;
  h.system.update(DT, h.state);
  h.state.input.actions.tetherFire = false;
}

test('NXI-017 a partial unload keeps the latched load; a full accept releases it', () => {
  const payload = {
    id: 23, type: 'payload', alive: true,
    pos: { x: 40, z: 0 }, vel: { x: 0, z: 0 }, radius: 6, mass: 180, collides: false,
    data: {
      role: 'world_site_payload',
      worldSiteTargetable: true,
      worldRecordId: 'world_site_test/payload/coil',
      salvagePool: { cmdty_scrap_metal: 4 },
    },
  };
  const h = tetherHarness(payload);
  latchPayload(h);
  assert.equal(h.system._active && h.system._active.targetId, payload.id, 'the load is latched');
  const payloadsBefore = h.state.entityList.filter((entity) => entity.type === 'payload').length;

  h.bus.emit('pickup:collected', {
    pickupId: payload.id, collectorId: h.ship.id, kind: 'cargo',
    commodityId: 'cmdty_scrap_metal', amount: 1, acceptedAmount: 1,
  });
  payload.data.salvagePool = { cmdty_scrap_metal: 3 };
  h.system.update(DT, h.state);
  assert.equal(h.system._active && h.system._active.targetId, payload.id, 'partial acceptance keeps the same target');
  assert.equal(h.state.player.targetId, payload.id);
  assert.equal(payload.data.stableLoadId, 'world_site_test/payload/coil');
  assert.equal(h.state.entityList.filter((entity) => entity.type === 'payload').length, payloadsBefore, 'no replacement pod');
  assert.equal(h.broke.length, 0);

  h.bus.emit('pickup:collected', {
    pickupId: 999, collectorId: h.ship.id, kind: 'cargo',
    commodityId: 'cmdty_scrap_metal', amount: 4, acceptedAmount: 4,
  });
  assert.equal(h.system._active.targetId, payload.id, 'another body unloading does not drop this line');

  h.bus.emit('pickup:collected', {
    pickupId: payload.id, collectorId: h.ship.id, kind: 'cargo',
    commodityId: 'cmdty_scrap_metal', amount: 3, acceptedAmount: 3,
  });
  assert.equal(h.system._active, null, 'full acceptance releases the line');
  assert.equal(h.broke.length, 1);
  assert.equal(h.broke[0].reason, 'accepted');
  assert.equal(h.broke[0].targetId, payload.id);
  assert.equal(h.state.player.targetId, null);
  assert.equal(h.state.player.tether.active, false);
  assert.equal(payload.alive, true, 'the release does not invent a second body or delete the record itself');
  assert.equal(h.state.entityList.filter((entity) => entity.type === 'payload').length, 1);
});

test('NXI-050 a blocked retreat picks a different heading inside the deadlock horizon', () => {
  const horizon = 45;
  const planner = new ManeuverPlanner({
    seed: SEED,
    config: {
      squadFrames: false,
      includeTrajectory: false,
      inputSlewPerTick: 1,
      emergencyInputSlewPerTick: 1,
      torqueSlewPerTick: 1,
      emergencyTorqueSlewPerTick: 1,
    },
  });
  assert.equal(planner.config.retreatSpeed, 120);
  assert.equal(planner.config.retreatSpeed, MANEUVER_SPEED_CAPS.retreatSpeed);
  assert.equal(planner.config.deadlockClearTicks, horizon);
  const rock = {
    id: 90, kind: 'hazard', pos: { x: 70, z: 0 }, vel: { x: 0, z: 0 },
    radius: 30, tags: ['solid'], confidence: 1,
  };
  const self = {
    id: 2, team: 1, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, radius: 12,
    energyFraction: 1, heatFraction: 0, operationalMassBand: 'medium',
  };
  const maneuver = {
    kind: ManeuverKind.RETREAT,
    targetId: null,
    formationSlot: { x: 1000, z: 0 },
    formationVelocity: { x: 0, z: 0 },
    formationBound: 100,
    breakFormation: true,
    reason: 'ordered_reform',
  };
  const directive = {
    squadId: 'patrol',
    formation: { slot: maneuver.formationSlot, velocity: { x: 0, z: 0 }, bound: 100, breakFormation: true },
  };
  const requests = [];
  for (let tick = 1; tick <= horizon; tick += 1) {
    requests.push(planner.plan({
      tick,
      entityId: self.id,
      perception: { tick, self, contacts: [rock] },
      behavior: { maneuver },
      directive,
    }));
  }
  const first = requests[0];
  const held = requests[horizon - 2];
  const turned = requests[horizon - 1];
  assert.equal(first.kind, ManeuverKind.RETREAT);
  assert.equal(held.kind, ManeuverKind.RETREAT, 'the same blocked corridor is held until the horizon');
  assert.ok(Math.cos(first.targetHeading) * Math.cos(held.targetHeading)
    + Math.sin(first.targetHeading) * Math.sin(held.targetHeading) > 0.98);
  assert.equal(turned.kind, ManeuverKind.CLEAR_DEADLOCK);
  assert.equal(turned.reason, 'retreat_corridor_invalid');
  const dot = Math.cos(first.targetHeading) * Math.cos(turned.targetHeading)
    + Math.sin(first.targetHeading) * Math.sin(turned.targetHeading);
  assert.ok(dot < 0.5, `the new heading must leave the blocked corridor, dot ${dot}`);
  assert.equal(planner.config.retreatSpeed, MANEUVER_SPEED_CAPS.retreatSpeed, 'retreat speed was not raised');

  const open = new ManeuverPlanner({
    seed: SEED,
    config: {
      squadFrames: false,
      includeTrajectory: false,
      inputSlewPerTick: 1,
      emergencyInputSlewPerTick: 1,
      torqueSlewPerTick: 1,
      emergencyTorqueSlewPerTick: 1,
    },
  });
  const clear = open.plan({
    tick: 1,
    entityId: 3,
    perception: { tick: 1, self: { ...self, id: 3 }, contacts: [] },
    behavior: { maneuver },
    directive,
  });
  assert.equal(clear.kind, ManeuverKind.RETREAT, 'an open retreat still retreats');
  assert.ok(Math.abs(clear.targetHeading) < 1e-6, 'the open corridor still aims at the slot');
  assert.ok(clear.forceLocal.forward > 0);
  assert.equal(open.config.retreatSpeed, 120);
});
