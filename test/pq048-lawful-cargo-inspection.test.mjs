import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { createBus } from '../src/core/eventBus.js';
import { cargo } from '../src/systems/cargo.js';
import { economy } from '../src/systems/economy.js';
import { factions } from '../src/systems/factions.js';
import { heat } from '../src/systems/heat.js';
import { lawSecurity } from '../src/systems/lawSecurity.js';
import { customsPrompt } from '../src/ui/customsPrompt.js';
import { createLawfulInspectionPrompt } from '../src/ui/lawfulInspectionPrompt.js';
import { lawfulInspectionStatusText } from '../src/ui/targetPanel.js';

const HELIOS = 'sector_helios_prime';
const SCN = 'faction_scn';

function boot({
  sectorId = HELIOS,
  playerPos = { x: 0, z: 0 },
  patrolPos = { x: 180, z: 0 },
  cargoItems = {},
  customsHotUntil = null,
  patrolWorldRecordId = 'world:convoy:helios:patrol:01',
  patrolFactionId = SCN,
  patrolLawful = true,
  patrolRole = 'patrol',
  patrolHomeSectorId = HELIOS,
} = {}) {
  const sim = createSimulation({
    seed: 4806,
    systems: [lawSecurity, cargo, economy, factions, heat, customsPrompt],
  });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = sectorId;
  state.world.sectors[sectorId] = {
    id: sectorId,
    factionId: sectorId === HELIOS ? SCN : 'faction_reach',
    security: sectorId === HELIOS ? 0.98 : 0.35,
    tier: 0,
  };
  state.player.credits = 5000;
  state.player.heat = 0;
  state.player.cargo.items = { ...cargoItems };
  state.player.cargo.usedVolume = 0;
  state.player.cargo.usedMass = 0;
  state.player.cargo.capVolume = 80;
  state.player.cargo.capMass = 80;
  if (customsHotUntil) state.player.customsHotUntil = { ...customsHotUntil };

  const player = sim.spawn({
    type: 'ship', team: 0, factionId: null, pos: { ...playerPos },
    hull: 200, hullMax: 200, radius: 8,
    data: { intent: {}, combat: {} },
  });
  state.playerId = player.id;
  const station = sim.spawn({
    type: 'station', team: 2, factionId: SCN, pos: { x: 0, z: 0 }, radius: 42,
    data: { stationId: 'station_helios', factionId: SCN, dockRadius: 72 },
  });
  const patrol = sim.spawn({
    type: 'ship', team: 2, factionId: patrolFactionId, pos: { ...patrolPos },
    hull: 140, hullMax: 140, radius: 7,
    data: {
      trafficRole: patrolRole,
      worldRecordId: patrolWorldRecordId,
      homeSectorId: patrolHomeSectorId,
      sectorId: patrolHomeSectorId,
      durable: true,
      ai: { lawful: patrolLawful, spawnContext: 'patrol', passive: false },
      intent: {}, combat: {},
    },
  });
  const cargoSystem = sim.registry.get('cargo');
  cargoSystem.recompute();
  return { sim, state, bus, player, station, patrol };
}

function eventLog(bus, names) {
  const log = Object.fromEntries(names.map((name) => [name, []]));
  for (const name of names) bus.on(name, (payload) => log[name].push(clone(payload)));
  return log;
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function offer(sim) {
  sim.step();
  return (sim.state.player.lawfulInspection && sim.state.player.lawfulInspection.active) || null;
}

function choose(bus, active, source = 'test') {
  bus.emit('lawfulInspection:choose', { caseId: active.id, choice: 'comply', source });
}

function removeFixtureEntity(state, entity) {
  state.entities.delete(entity.id);
  const index = state.entityList.indexOf(entity);
  if (index >= 0) state.entityList.splice(index, 1);
}

function spawnHeliosPatrol(sim, worldRecordId, pos) {
  return sim.spawn({
    type: 'ship', team: 2, factionId: SCN, pos: { ...pos }, hull: 140, hullMax: 140, radius: 7,
    data: {
      trafficRole: 'patrol', worldRecordId, homeSectorId: HELIOS, sectorId: HELIOS, durable: true,
      ai: { lawful: true, spawnContext: 'patrol', passive: false }, intent: {}, combat: {},
    },
  });
}

test('PQ-048.06 offers only a durable SCN Helios traffic patrol inside the lawful ring', () => {
  const valid = boot({ cargoItems: { cmdty_narcotics: 2 } });
  const log = eventLog(valid.bus, ['lawfulInspection:offered']);
  const active = offer(valid.sim);
  assert.ok(active);
  assert.equal(active.stationId, 'station_helios');
  assert.equal(active.factionId, SCN);
  assert.equal(active.patrolWorldRecordId, valid.patrol.data.worldRecordId);
  assert.match(active.id, /^lawful-inspection:world:convoy:helios:patrol:01:1$/);
  assert.equal(Object.hasOwn(active, 'patrolId'), false, 'runtime numeric ids never enter durable case state');
  assert.equal(Object.hasOwn(active, 'entityId'), false, 'runtime numeric ids never enter durable case state');
  assert.equal(log['lawfulInspection:offered'].length, 1);

  const offRing = boot({
    playerPos: { x: 1450, z: 0 },
    cargoItems: { cmdty_narcotics: 2 },
  });
  assert.equal(offer(offRing.sim), null, 'the player must be in Helios lawful jurisdiction');
  assert.equal(offRing.state.player.lawfulInspection, undefined);

  const numericOnly = boot({
    cargoItems: { cmdty_narcotics: 2 },
    patrolWorldRecordId: null,
  });
  assert.equal(offer(numericOnly.sim), null, 'a numeric runtime actor is never a durable inspection target');

  const ceres = boot({ sectorId: 'sector_ceres_belt', cargoItems: { cmdty_narcotics: 2 } });
  assert.equal(offer(ceres.sim), null, 'the Ceres NPC patrol chain is not this player route');
});

test('compliance uses the economy scan seam, suppresses only the legacy customs overlay, and clears by stable case id', () => {
  const fixture = boot({ customsHotUntil: { [SCN]: 80 } });
  const log = eventLog(fixture.bus, [
    'player:scannedByPatrol', 'patrol:proximity', 'lawfulInspection:resolved', 'faction:repDelta',
  ]);
  const active = offer(fixture.sim);
  assert.ok(active);
  choose(fixture.bus, active);

  assert.equal(fixture.state.player.lawfulInspection.active, null);
  assert.equal(fixture.state.player.lawfulInspection.last.outcome, 'cleared');
  assert.equal(log['patrol:proximity'].length, 1);
  assert.equal(log['patrol:proximity'][0].lawfulInspectionCaseId, active.id);
  assert.equal(log['player:scannedByPatrol'][0].lawfulInspectionCaseId, active.id);
  assert.equal(fixture.state.ui.customsPrompt, undefined, 'correlated scan does not expose the inert legacy choices');
  assert.deepEqual(log['faction:repDelta'].at(-1), {
    factionId: SCN, delta: 1, reason: 'lawful_inspection_clear',
  });
  assert.equal(lawfulInspectionStatusText(fixture.patrol, fixture.state), 'LAW · HOLD CLEAR');
});

test('contraband discovery is correlated but confiscated, fined, struck, and heated only by existing owners', () => {
  const fixture = boot({ cargoItems: { cmdty_narcotics: 3 } });
  const log = eventLog(fixture.bus, ['contraband:scanned', 'lawfulInspection:resolved']);
  const active = offer(fixture.sim);
  assert.ok(active);
  const economySystem = fixture.sim.registry.get('economy');
  economySystem._rng = () => 0; // deterministic caught branch; the system still owns all effects.
  const creditsBefore = fixture.state.player.credits;
  choose(fixture.bus, active);

  const [scan] = log['contraband:scanned'];
  assert.ok(scan && scan.found);
  assert.equal(scan.lawfulInspectionCaseId, active.id);
  assert.equal(fixture.state.player.lawfulInspection.last.outcome, 'contraband_discovered');
  assert.equal(fixture.state.player.cargo.items.cmdty_narcotics, undefined);
  assert.ok(fixture.state.player.credits < creditsBefore);
  assert.equal(fixture.state.factions[SCN].knownContrabandStrikes, 1);
  assert.ok(fixture.state.player.heat > 0, 'heat consumed the existing contraband:scanned receipt');
  assert.equal(lawfulInspectionStatusText(fixture.patrol, fixture.state), 'LAW · CONTRABAND SEIZED');
});

test('escape is actual range separation, not a synthetic flee action', () => {
  const fixture = boot({ cargoItems: { cmdty_narcotics: 2 } });
  const log = eventLog(fixture.bus, ['contraband:scanned', 'patrol:proximity', 'faction:repDelta']);
  const active = offer(fixture.sim);
  assert.ok(active);
  fixture.player.pos.x = 1000;
  fixture.sim.runTicks(Math.ceil(2.1 / SIM_DT));

  assert.equal(fixture.state.player.lawfulInspection.last.outcome, 'escaped');
  assert.deepEqual(log['faction:repDelta'].at(-1), {
    factionId: SCN, delta: -3, reason: 'lawful_inspection_escape',
  });
  assert.equal(log['patrol:proximity'].length, 0);
  assert.equal(log['contraband:scanned'].length, 0);
  assert.equal(fixture.state.player.cargo.items.cmdty_narcotics, 2);
  assert.equal(fixture.state.player.heat, 0);
  assert.equal(lawfulInspectionStatusText(fixture.patrol, fixture.state), 'LAW · ESCAPED');
});

test('settled durable patrol history filters every prior patrol before nearest selection', () => {
  const fixture = boot({ customsHotUntil: { [SCN]: 80 } });
  const patrolA = fixture.patrol;
  const patrolB = spawnHeliosPatrol(fixture.sim, 'world:convoy:helios:patrol:02', { x: 260, z: 0 });
  const log = eventLog(fixture.bus, ['lawfulInspection:offered']);

  const first = offer(fixture.sim);
  assert.equal(first.patrolWorldRecordId, patrolA.data.worldRecordId);
  choose(fixture.bus, first, 'settle-a');

  // A remains physically nearest, but its durable record is settled, so the next valid patrol wins.
  fixture.sim.runTicks(30);
  const second = fixture.state.player.lawfulInspection.active;
  assert.ok(second);
  assert.equal(second.patrolWorldRecordId, patrolB.data.worldRecordId);
  choose(fixture.bus, second, 'settle-b');
  assert.deepEqual(fixture.state.player.lawfulInspection.settledPatrolIds, [
    patrolA.data.worldRecordId,
    patrolB.data.worldRecordId,
  ]);

  fixture.sim.runTicks(30);
  assert.equal(fixture.state.player.lawfulInspection.active, null, 'neither settled patrol reoffers');
  assert.deepEqual(log['lawfulInspection:offered'].map((entry) => entry.patrolWorldRecordId), [
    patrolA.data.worldRecordId,
    patrolB.data.worldRecordId,
  ]);

  const patrolC = spawnHeliosPatrol(fixture.sim, 'world:convoy:helios:patrol:03', { x: 340, z: 0 });
  fixture.sim.runTicks(30);
  assert.equal(fixture.state.player.lawfulInspection.active.patrolWorldRecordId, patrolC.data.worldRecordId,
    'a new durable patrol remains eligible after A and B settle');
});

test('Continue normalizes legacy settled identity and fails closed on a malformed history container', () => {
  const legacy = boot({ customsHotUntil: { [SCN]: 80 } });
  legacy.state.player.lawfulInspection = {
    sequence: 1,
    active: null,
    last: { patrolWorldRecordId: legacy.patrol.data.worldRecordId, outcome: 'cleared' },
  };
  legacy.bus.emit('save:loaded', { slot: 'continue' });
  legacy.sim.step();
  assert.deepEqual(legacy.state.player.lawfulInspection.settledPatrolIds, [legacy.patrol.data.worldRecordId]);
  assert.equal(legacy.state.player.lawfulInspection.active, null, 'legacy last receipt blocks the same patrol');

  const malformed = boot({ customsHotUntil: { [SCN]: 80 } });
  malformed.state.player.lawfulInspection = {
    sequence: 1,
    active: null,
    last: null,
    settledPatrolIds: { numericRuntimeId: malformed.patrol.id },
  };
  malformed.bus.emit('save:loaded', { slot: 'continue' });
  malformed.sim.step();
  assert.equal(malformed.state.player.lawfulInspection.active, null,
    'an unreadable persisted history never authorizes a new inspection');
});

test('collateral and lifecycle interruptions settle the case without a second law report', () => {
  const collateral = boot({ cargoItems: { cmdty_narcotics: 1 } });
  const log = eventLog(collateral.bus, ['law:incidentOpened', 'law:reportIncident', 'lawfulInspection:resolved']);
  assert.ok(offer(collateral.sim));
  collateral.bus.emit('combat:damage', {
    attackerId: collateral.player.id, targetId: collateral.patrol.id, applied: 12, amount: 12,
  });
  assert.equal(collateral.state.player.lawfulInspection.last.outcome, 'collateral_assault');
  assert.equal(log['law:incidentOpened'].length, 1, 'existing jurisdiction enforcement remains authoritative');
  assert.equal(log['law:reportIncident'].length, 0, 'inspection never duplicates a witness incident');
  assert.ok(collateral.state.player.heat > 0, 'existing combat/heat listener observed the assault');

  const lifecycle = boot({ cargoItems: { cmdty_narcotics: 1 } });
  assert.ok(offer(lifecycle.sim));
  lifecycle.bus.emit('sector:exit', { sectorId: HELIOS, continuous: true, noTeleport: true });
  assert.ok(lifecycle.state.player.lawfulInspection.active, 'continuous membership preserves the durable case');
  lifecycle.bus.emit('sector:exit', { sectorId: HELIOS, continuous: false, noTeleport: false });
  assert.equal(lifecycle.state.player.lawfulInspection.last.outcome, 'interrupted_sector_exit');

  const death = boot({ cargoItems: { cmdty_narcotics: 1 } });
  assert.ok(offer(death.sim));
  death.bus.emit('player:death', { recoverable: true });
  assert.equal(death.state.player.lawfulInspection.last.outcome, 'interrupted_player_death');
});

test('Continue rebinds the active case by worldRecordId after a numeric patrol replacement', () => {
  const fixture = boot({ customsHotUntil: { [SCN]: 80 } });
  const active = offer(fixture.sim);
  assert.ok(active);
  const savedCase = clone(fixture.state.player.lawfulInspection);
  const oldNumericId = fixture.patrol.id;
  removeFixtureEntity(fixture.state, fixture.patrol);
  const rematerialized = fixture.sim.spawn({
    type: 'ship', team: 2, factionId: SCN, pos: { x: 180, z: 0 }, hull: 140, hullMax: 140, radius: 7,
    data: {
      trafficRole: 'patrol', worldRecordId: active.patrolWorldRecordId,
      homeSectorId: HELIOS, sectorId: HELIOS, durable: true,
      ai: { lawful: true, spawnContext: 'patrol', passive: false }, intent: {}, combat: {},
    },
  });
  assert.notEqual(rematerialized.id, oldNumericId);
  fixture.state.player.lawfulInspection = savedCase;
  fixture.bus.emit('save:restoring', {});
  fixture.bus.emit('save:loaded', {});
  fixture.sim.step();
  assert.equal(fixture.state.player.lawfulInspection.active.patrolWorldRecordId, active.patrolWorldRecordId);
  assert.equal(Object.hasOwn(fixture.state.player.lawfulInspection.active, 'patrolId'), false);
  choose(fixture.bus, fixture.state.player.lawfulInspection.active, 'continue');
  assert.equal(fixture.state.player.lawfulInspection.last.outcome, 'cleared');
});

test('the accessible inspection prompt owns only Digit1 and never offers a fake flee action', () => {
  const document = new FakeDocument();
  const bus = createBus();
  const state = { mode: 'flight', simTime: 10, ui: {} };
  const chosen = [];
  bus.on('lawfulInspection:choose', (payload) => chosen.push(payload));
  const prompt = createLawfulInspectionPrompt({ state, bus, document, mount: document.uiRoot });
  const offerPayload = {
    id: 'lawful-inspection:world:patrol:1', patrolWorldRecordId: 'world:patrol',
    deadlineAt: 20, phase: 'offered', stationId: 'station_helios', factionId: SCN,
  };
  bus.emit('lawfulInspection:offered', offerPayload);
  assert.equal(prompt.el.hidden, false);
  assert.equal(prompt.el.getAttribute('role'), 'dialog');
  assert.equal(prompt.button.tagName, 'BUTTON');
  assert.match(prompt.button.textContent, /COMPLY/i);
  assert.doesNotMatch(prompt.el.children[3].textContent, /flee/i);
  const event = keyEvent('1', 'Digit1');
  document.dispatchEvent(event);
  assert.equal(event.prevented, true);
  assert.equal(event.stopped, true);
  assert.deepEqual(chosen, [{ caseId: offerPayload.id, choice: 'comply', source: 'keyboard' }]);
  bus.emit('lawfulInspection:resolved', { ...offerPayload, outcome: 'cleared', resolvedAt: 10 });
  assert.match(prompt.el.children[2].textContent, /HOLD CLEAR/i);
  state.simTime = 14;
  prompt.tick();
  assert.equal(prompt.el.hidden, true);
  prompt.destroy();
});

class FakeDocument {
  constructor() {
    this.byId = new Map();
    this.head = new FakeElement('head', this);
    this.body = new FakeElement('body', this);
    this.uiRoot = new FakeElement('div', this);
    this.uiRoot.id = 'ui-root';
    this.body.appendChild(this.uiRoot);
    this.listeners = new Map();
  }
  createElement(tagName) { return new FakeElement(tagName, this); }
  getElementById(id) { return this.byId.get(id) || null; }
  addEventListener(name, fn) {
    const listeners = this.listeners.get(name) || new Set();
    listeners.add(fn);
    this.listeners.set(name, listeners);
  }
  removeEventListener(name, fn) { this.listeners.get(name)?.delete(fn); }
  dispatchEvent(event) { for (const listener of this.listeners.get(event.type) || []) listener(event); }
}

class FakeElement {
  constructor(tagName, ownerDocument) {
    this.tagName = String(tagName).toUpperCase();
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.attributes = new Map();
    this.dataset = {};
    this.hidden = false;
    this.disabled = false;
    this.textContent = '';
    this.className = '';
    this.listeners = new Map();
    this.parentNode = null;
    this.style = {};
    this._id = '';
  }
  set id(value) {
    if (this._id) this.ownerDocument.byId.delete(this._id);
    this._id = String(value || '');
    if (this._id) this.ownerDocument.byId.set(this._id, this);
  }
  get id() { return this._id; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  appendChild(child) { child.parentNode = this; this.children.push(child); return child; }
  replaceChildren(...children) {
    for (const child of this.children) child.parentNode = null;
    this.children = [];
    for (const child of children) this.appendChild(child);
  }
  addEventListener(name, fn) { this.listeners.set(name, fn); }
  removeEventListener(name, fn) { if (this.listeners.get(name) === fn) this.listeners.delete(name); }
  remove() {
    if (this.parentNode) this.parentNode.children = this.parentNode.children.filter((child) => child !== this);
    this.parentNode = null;
    if (this.id) this.ownerDocument.byId.delete(this.id);
  }
}

function keyEvent(key, code) {
  return {
    type: 'keydown', key, code, ctrlKey: false, altKey: false, metaKey: false,
    prevented: false, stopped: false,
    preventDefault() { this.prevented = true; },
    stopImmediatePropagation() { this.stopped = true; },
  };
}
