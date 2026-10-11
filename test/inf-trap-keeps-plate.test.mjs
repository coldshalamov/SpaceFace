// INF-4 (WF-05): fitting the Repulsion Trap adds a verb instead of replacing the sticky plate.
// A plain throw is still the aimed throw-and-stick plate; throwing while braking lays the trap on
// the wake. The module says so once, naming both verbs on the player's bound keys. Seed 4242.
import assert from 'node:assert/strict';
import test from 'node:test';

import { IMPULSE_CHARGES } from '../src/data/impulseCharges.js';
import { MASSLINE2_FLAGS } from '../src/data/featureFlags.js';
import { impulseCharges } from '../src/systems/impulseCharges.js';
import { onboarding } from '../src/systems/onboarding.js';
import { resolveActionLabel } from '../src/systems/input.js';

const TRAP = 'mod_repulsion_trap_s';

function entity(id, x, z, rot = 0) {
  return {
    id, type: 'ship', alive: true, rot, prevRot: rot, team: 1, radius: 6,
    pos: { x, z }, prevPos: { x, z }, vel: { x: 0, z: 0 }, data: {},
  };
}

function throwWith({ fittings = [], brake = false, moveZ = 0, aim = 0, stock = 3, researched = [] } = {}) {
  const player = entity(99, 0, 0, 0);
  const state = {
    simTime: 20, tick: 1200,
    player: {
      activeShipIndex: 0,
      researchedNodes: researched,
      ownedShips: [{ defId: 'ship_kestrel', fittings: fittings.slice() }],
      cargo: { items: { cmdty_impulse_charge: stock }, usedVolume: 2, usedMass: 1, capVolume: 40, capMass: 60 },
    },
    input: { aimAngle: aim, moveZ, actions: { chargeThrow: true, ...(brake ? { brake: true } : {}) } },
    ui: { screenStack: [] },
    entityList: [player],
    entities: new Map([[player.id, player]]),
  };
  const events = [];
  const system = Object.create(impulseCharges);
  system.state = state;
  system.bus = { emit(name, payload) { events.push({ name, payload }); } };
  system.helpers = {
    spawnEntity(spec) {
      const spawned = { ...spec, id: 500, alive: true, prevPos: { ...spec.pos }, prevRot: spec.rot };
      state.entityList.push(spawned);
      state.entities.set(spawned.id, spawned);
      return spawned;
    },
  };
  const rt = { throwCdT: 0 };
  system._handleThrow(player, rt, state);
  const charge = state.entityList.find((e) => e.type === 'charge') || null;
  return { charge, state, events, rt, stockAfter: state.player.cargo.items.cmdty_impulse_charge };
}

test('trap fitted + plain throw is the standard aimed sticky plate', () => {
  const { charge, rt } = throwWith({ fittings: [TRAP], aim: Math.PI / 2 });
  assert.ok(charge, 'a plain throw still throws');
  assert.equal(charge.data.chargeId, 'charge_standard', 'the sticky plate is not deleted by the trap');
  assert.ok(charge.vel.z > 100 && Math.abs(charge.vel.x) < 1e-6, 'it flies along the aim direction at throw speed');
  assert.ok(charge.pos.z > 0, 'it leaves the nose, not the wake');
  assert.equal(rt.throwCdT, IMPULSE_CHARGES.charge_standard.armTimeS, 'the standard arming gap applies');
  assert.equal(IMPULSE_CHARGES.charge_standard.stickRadius, 6, 'the plate keeps its stick radius');
  assert.equal(charge.data.armed, false, 'a plate arms by sticking');
});

test('trap fitted + brake throw lays the Repulsion Trap behind the hull', () => {
  const { charge } = throwWith({ fittings: [TRAP], brake: true, aim: Math.PI / 2 });
  assert.equal(charge.data.chargeId, 'charge_repulsion_trap');
  assert.ok(charge.pos.x < 0, 'behind the flight path (the hull faces +x)');
  assert.equal(charge.vel.x, 0);
  assert.equal(charge.vel.z, 0);
});

test('trap fitted, braking by reverse thrust also lays the trap', () => {
  assert.equal(throwWith({ fittings: [TRAP], moveZ: 0 }).charge.data.chargeId, 'charge_standard');
  assert.equal(throwWith({ fittings: [TRAP], moveZ: -1 }).charge.data.chargeId, 'charge_repulsion_trap',
    'moveZ < -0.5 reads as braking');
});

test('trap not fitted: unchanged behavior, braking or not', () => {
  const plain = throwWith({ fittings: [], aim: Math.PI / 2 });
  assert.equal(plain.charge.data.chargeId, 'charge_standard');
  assert.ok(plain.charge.vel.z > 100);
  const braked = throwWith({ fittings: [], brake: true, aim: Math.PI / 2 });
  assert.equal(braked.charge.data.chargeId, 'charge_standard', 'brake alone never lays a trap without the module');
  assert.ok(braked.charge.vel.z > 100, 'and does not become an aft drop without propulsion');
});

test('bomb propulsion aft-drop is untouched: brake + throw drops a plate aft, a plain throw aims', () => {
  const previousEnabled = MASSLINE2_FLAGS.enabled;
  const previous = MASSLINE2_FLAGS.bombPropulsion;
  MASSLINE2_FLAGS.enabled = true;
  MASSLINE2_FLAGS.bombPropulsion = true;
  try {
    const fit = { fittings: ['mod_charge_vector_rack'], researched: ['tech_impulse_ballistics'], aim: Math.PI / 2 };
    const aft = throwWith({ ...fit, brake: true });
    assert.equal(aft.charge.data.aftDrop, true, 'brake + throw is the aft drop');
    assert.ok(aft.charge.pos.x < 0, 'dropped behind the hull');
    assert.ok(aft.events.some((e) => e.name === 'charge:aftDropped'));
    const aimed = throwWith(fit);
    assert.equal(aimed.charge.data.aftDrop, false, 'a plain throw still aims');
    assert.ok(aimed.charge.vel.z > 100);
  } finally {
    MASSLINE2_FLAGS.bombPropulsion = previous;
    MASSLINE2_FLAGS.enabled = previousEnabled;
  }
});

test('charge stock debits exactly once per throw, for both verbs', () => {
  for (const brake of [false, true]) {
    const { stockAfter, charge } = throwWith({ fittings: [TRAP], brake, stock: 3 });
    assert.ok(charge);
    assert.equal(stockAfter, 2, `${brake ? 'trap' : 'plate'} throw spends one charge`);
  }
  const empty = throwWith({ fittings: [TRAP], stock: 0 });
  assert.equal(empty.charge, null, 'no stock, no throw — for either verb');
});

test('capacity and arming gap apply identically to both verbs', () => {
  for (const brake of [false, true]) {
    const { rt } = throwWith({ fittings: [TRAP], brake });
    assert.ok(rt.throwCdT > 0, 'an arming gap follows the throw');
  }
  // The arming gap blocks the next press for either verb.
  const first = throwWith({ fittings: [TRAP] });
  const blocked = [];
  const system = Object.create(impulseCharges);
  system.state = first.state;
  system.bus = { emit(name) { blocked.push(name); } };
  first.state.input.actions.chargeThrow = true;
  system._handleThrow(first.state.entityList[0], { throwCdT: 1.2 }, first.state);
  assert.deepEqual(blocked, ['toast'], 'the arming toast speaks instead of throwing');
});

test('the arming gap applied is the one of the charge actually thrown, never the other verb\'s', () => {
  const plate = throwWith({ fittings: [TRAP] });
  const trap = throwWith({ fittings: [TRAP], brake: true });
  assert.equal(plate.rt.throwCdT, IMPULSE_CHARGES.charge_standard.armTimeS, 'a plate arms for its own 6 s');
  assert.equal(trap.rt.throwCdT, IMPULSE_CHARGES.charge_repulsion_trap.armTimeS, 'a trap arms for its own 1.1 s');
  assert.ok(plate.rt.throwCdT > trap.rt.throwCdT);
});

// ── onboarding hint ──────────────────────────────────────────────────────────

class FakeClassList {
  constructor() { this.values = new Set(); }
  add(...values) { values.forEach((value) => this.values.add(value)); }
  remove(...values) { values.forEach((value) => this.values.delete(value)); }
  toggle(value, force) {
    if (force === undefined ? !this.values.has(value) : force) this.values.add(value);
    else this.values.delete(value);
  }
  contains(value) { return this.values.has(value); }
}
class FakeElement {
  constructor(document, tagName) {
    this.ownerDocument = document;
    this.tagName = String(tagName).toUpperCase();
    this.children = [];
    this.attributes = new Map();
    this.classList = new FakeClassList();
    this.className = '';
    this.style = {};
    this.textContent = '';
    this.id = '';
    this.innerHTML = '';
  }
  appendChild(child) { this.children.push(child); return child; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  addEventListener() {}
  removeEventListener() {}
  querySelector() { return null; }
  querySelectorAll() { return []; }
}
class FakeDocument {
  constructor() { this.head = new FakeElement(this, 'head'); this.body = new FakeElement(this, 'body'); }
  createElement(tagName) { return new FakeElement(this, tagName); }
  getElementById() { return null; }
}

function drive() {
  const previousDocument = globalThis.document;
  const previousWindow = globalThis.window;
  globalThis.document = new FakeDocument();
  globalThis.window = { innerWidth: 1280, innerHeight: 720, addEventListener() {}, removeEventListener() {} };
  const handlers = new Map();
  const events = [];
  const state = {
    playerId: 1, tick: 0, simTime: 0,
    entities: new Map([[1, { id: 1, alive: true }]]),
    entityList: [],
    player: { hints: {}, flags: {} },
    settings: {},
  };
  const bus = {
    on(event, fn) {
      if (!handlers.has(event)) handlers.set(event, []);
      handlers.get(event).push(fn);
      return () => {};
    },
    emit(event, payload) { events.push({ event, payload }); },
  };
  const system = Object.create(onboarding);
  system.init({ state, bus, helpers: {} });
  return {
    events, system, state,
    restore() {
      try { system.destroy(); } catch (_) {}
      globalThis.document = previousDocument;
      globalThis.window = previousWindow;
    },
    equip(defId) {
      (handlers.get('module:equipped') || []).forEach((fn) => fn({ shipId: 1, slotIndex: 5, defId }));
    },
    hints() { return events.filter((e) => e.event === 'hud:firstUse'); },
  };
}

test('fitting the Repulsion Trap names both verbs once, on the live bound keys', () => {
  const h = drive();
  try {
    h.equip(TRAP);
    const shown = h.hints();
    assert.equal(shown.length, 1, 'the first fit earns exactly one hint');
    const throwKey = resolveActionLabel(h.state, 'chargeThrow', { empty: 'THROW' });
    const brakeKey = resolveActionLabel(h.state, 'brake', { empty: 'BRAKE' });
    assert.equal(shown[0].payload.text, `Repulsion Trap fitted — ${throwKey} sticks a plate; ${brakeKey} + ${throwKey} drops the trap.`);
    assert.equal(shown[0].payload.verbId, 'repulsionTrapVerbs');
    h.equip(TRAP);
    assert.equal(h.hints().length, 1, 'a refit never repeats — once per profile');
    assert.equal(h.state.player.hints.repulsionTrapVerbs, true);
  } finally { h.restore(); }
});

test('the trap hint never fires for other modules', () => {
  const h = drive();
  try {
    h.equip('mod_charge_rack');
    h.equip('mod_cargo_scanner_s');
    assert.equal(h.hints().length, 0);
    assert.equal(h.state.player.hints.repulsionTrapVerbs, undefined, 'the hint is unspent');
    h.equip(TRAP);
    assert.equal(h.hints().length, 1, 'it still lands at the real fit');
  } finally { h.restore(); }
});
