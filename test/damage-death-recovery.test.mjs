import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  buildDamageReadout,
  buildDefeatReceipt,
  buildRecoveryPlan,
  formatDefeatCause,
} from '../src/combat/playerDefeat.js';
import { combat } from '../src/systems/combat.js';
import { gameOverScreen } from '../src/ui/screens/gameOver.js';

function vec(x, z) {
  return {
    x, y: 0, z,
    copy(other) { this.x = other.x; this.y = other.y || 0; this.z = other.z; return this; },
  };
}

function makePlayer() {
  return {
    id: 1,
    type: 'ship',
    alive: true,
    team: 0,
    pos: vec(0, 0),
    prevPos: vec(0, 0),
    vel: vec(12, -4),
    rot: 0,
    flags: {},
    data: { defId: 'ship_kestrel' },
    hull: 0,
    hullMax: 140,
    armorHp: 0,
    armorMax: 30,
    shield: 0,
    shieldMax: 55,
    cap: 0,
    capMax: 80,
  };
}

function makeState() {
  const player = makePlayer();
  const attacker = {
    id: 9,
    type: 'ship',
    alive: true,
    team: 1,
    factionId: 'faction_reach',
    pos: vec(0, 80),
    data: { defId: 'ship_drifter', lootTableId: 'reaver_pirate', shipClass: 'gunship' },
  };
  return {
    tick: 300,
    simTime: 5,
    playerId: 1,
    meta: { seed: 47 },
    settings: { gameplay: { difficulty: 'standard' } },
    content: {},
    input: { fire: true, moveX: 1, moveZ: 1, boost: true, actions: { tetherFire: true } },
    player: {
      credits: 5000,
      insurance: { rate: 0.6, deductibleCr: 500, insuredModules: false, lastStationId: 'station_helios' },
      ownedShips: [{ defId: 'ship_kestrel', fittings: ['wpn_pulse_laser_s'] }],
      activeShipIndex: 0,
      cargo: {
        items: { cmdty_ore_iron: 5, story_sample_47a: 1 },
        usedVolume: 5,
        usedMass: 6,
        capVolume: 40,
        capMass: 100,
      },
    },
    story: { persistentCargo: ['story_sample_47a'] },
    entities: new Map([[1, player], [9, attacker]]),
    entityList: [player, attacker],
    world: {
      currentSectorId: 'sector_helios_prime',
      activeSector: { stations: [{ stationId: 'station_helios', pos: { x: 320, z: -80 } }] },
    },
  };
}

test('damage readout names direction, attacker, weapon, layer, subsystem, and resulting vitals', () => {
  const state = makeState();
  const readout = buildDamageReadout(state, {
    targetId: 1,
    attackerId: 9,
    weaponId: 'wpn_autocannon_s',
    dominantLayer: 'armor',
    subsystemId: 'drive',
    after: { shield: 0, shieldMax: 55, armor: 18, armorMax: 30, hull: 112, hullMax: 140 },
  });

  assert.deepEqual(readout, {
    direction: 'STARBOARD',
    attacker: 'Reaver Pirate',
    weapon: 'Autocannon S',
    layer: 'ARMOR',
    subsystem: 'DRIVE',
    shieldPct: 0,
    armorPct: 60,
    hullPct: 80,
    text: 'STARBOARD · Reaver Pirate · Autocannon S · ARMOR · DRIVE',
  });
});

test('live combat damage carries maxima required for truthful percentages', () => {
  const state = makeState();
  const player = state.entities.get(1);
  player.hull = 100;
  player.shield = 20;
  player.armorHp = 30;
  const events = [];
  const bus = {
    on() { return () => {}; },
    emit(event, payload) { events.push({ event, payload }); },
  };
  combat.init({ state, bus, helpers: {}, registry: { get() { return null; } } });
  combat.onHit({
    targetId: 1,
    ownerId: 9,
    damage: 4,
    damageType: 'kinetic',
    weaponId: 'wpn_autocannon_s',
    pos: { x: 0, z: 0 },
  });
  const damage = events.find((entry) => entry.event === 'combat:damage').payload;
  assert.equal(damage.after.shieldMax, 55);
  assert.equal(damage.after.armorMax, 30);
  assert.equal(damage.after.hullMax, 140);
  assert.equal(damage.weaponId, 'wpn_autocannon_s');
});

test('recovery plan returns to last lawful dock with a starter-safe deductible and persistent cargo protection', () => {
  const state = makeState();
  const plan = buildRecoveryPlan(state, state.entities.get(1));

  assert.equal(plan.stationId, 'station_helios');
  assert.equal(plan.stationName, 'Helios Station');
  assert.equal(plan.costCr, 500);
  assert.equal(plan.insuranceStatus, 'STARTER RECOVERY · 500 CR DEDUCTIBLE');
  assert.deepEqual(plan.cargoLosses, [{ commodityId: 'cmdty_ore_iron', qty: 2 }]);
  assert.equal(plan.cargoLostQty, 2);
  assert.equal(plan.persistentCargoProtected, 1);
});

test('lethal cause identifies attacker, weapon, layer, and context without generic unknown loss', () => {
  const state = makeState();
  const cause = formatDefeatCause(state, {
    killerId: 9,
    weaponId: 'wpn_autocannon_s',
    dominantLayer: 'hull',
    context: 'projectile',
  });
  assert.equal(cause, 'Reaver Pirate · Autocannon S · hull breach · projectile');
});

test('defeat receipt preserves final direction, subsystem, and truthful layer percentages', () => {
  const state = makeState();
  const receipt = buildDefeatReceipt(state, state.entities.get(1), 9, {
    origin: { kind: 'weapon', id: 'wpn_autocannon_s' },
    result: {
      dominantLayer: 'hull',
      subsystemId: 'drive',
      after: { shield: 0, shieldMax: 55, armor: 0, armorMax: 30, hull: 0, hullMax: 140 },
    },
  });
  assert.equal(receipt.direction, 'STARBOARD');
  assert.equal(receipt.subsystemId, 'drive');
  assert.deepEqual(receipt.vitalsPct, { shield: 0, armor: 0, hull: 0 });
});

test('environmental loss does not fabricate an unknown weapon', () => {
  const state = makeState();
  assert.equal(
    formatDefeatCause(state, { killerId: null, dominantLayer: 'hull', context: 'collision' }),
    'Environmental hazard · hull breach · collision',
  );
});

test('recovery quote never claims a larger charge than the economy can collect', () => {
  const state = makeState();
  state.player.credits = 125;
  const plan = buildRecoveryPlan(state, state.entities.get(1));
  assert.equal(plan.quotedCostCr, 500);
  assert.equal(plan.costCr, 125);
  assert.equal(plan.hardshipCoveredCr, 375);
});

test('standard death freezes once, emits one recoverable defeat, and applies consequences only after retry intent', () => {
  const state = makeState();
  const events = [];
  const listeners = new Map();
  const bus = {
    on(event, fn) {
      if (!listeners.has(event)) listeners.set(event, []);
      listeners.get(event).push(fn);
      return () => {};
    },
    emit(event, payload) {
      events.push({ event, payload });
      for (const fn of listeners.get(event) || []) fn(payload);
    },
  };
  combat.init({ state, bus, helpers: {}, registry: { get() { return null; } } });
  const player = state.entities.get(1);
  const lethal = {
    origin: { kind: 'weapon', id: 'wpn_autocannon_s' },
    packet: { source: { weaponId: 'wpn_autocannon_s' } },
    result: { dominantLayer: 'hull' },
  };

  combat.kill(player, 9, lethal);
  combat.kill(player, 9, lethal);

  assert.equal(events.filter((e) => e.event === 'player:death').length, 1);
  assert.equal(events.filter((e) => e.event === 'game:over').length, 1);
  assert.equal(events.filter((e) => e.event === 'player:respawn').length, 0);
  assert.equal(player.alive, false);
  assert.equal(player.vel.x, 0);
  assert.equal(player.vel.z, 0);
  assert.equal(events.find((e) => e.event === 'game:over').payload.recoverable, true);

  bus.emit('player:recoveryRequested', { source: 'after_action' });
  bus.emit('player:recoveryRequested', { source: 'duplicate' });

  assert.equal(events.filter((e) => e.event === 'player:respawn').length, 1);
  assert.equal(events.filter((e) => e.event === 'economy:chargeCredits').length, 1);
  assert.equal(player.alive, true);
  assert.equal(player.pos.x, 320);
  assert.equal(player.pos.z, -80);
  assert.equal(player.hull, player.hullMax);
  assert.equal(player.armorHp, player.armorMax);
  assert.equal(state.player.cargo.items.cmdty_ore_iron, 3);
  assert.equal(state.player.cargo.items.story_sample_47a, 1);
  assert.equal(state.combat.lastPlayerDefeat, null);
});

test('every recoverable difficulty waits for explicit recovery before respawning', () => {
  for (const difficulty of ['casual', 'standard', 'veteran']) {
    const state = makeState();
    state.settings.gameplay.difficulty = difficulty;
    const events = [];
    const listeners = new Map();
    const bus = {
      on(event, fn) {
        if (!listeners.has(event)) listeners.set(event, []);
        listeners.get(event).push(fn);
        return () => {};
      },
      emit(event, payload) {
        events.push({ event, payload });
        for (const fn of listeners.get(event) || []) fn(payload);
      },
    };
    combat.init({ state, bus, helpers: {}, registry: { get() { return null; } } });
    const player = state.entities.get(1);

    combat.kill(player, 9, { origin: { kind: 'weapon', id: 'wpn_autocannon_s' } });
    assert.equal(events.filter((entry) => entry.event === 'player:respawn').length, 0,
      `${difficulty} defeat waits for player choice`);
    assert.equal(events.find((entry) => entry.event === 'game:over').payload.recoverable, true);
    assert.equal(player.alive, false);

    bus.emit('player:recoveryRequested', { source: 'after_action' });
    assert.equal(events.filter((entry) => entry.event === 'player:respawn').length, 1,
      `${difficulty} recovery choice respawns exactly once`);
    assert.equal(player.alive, true);
  }
});

test('Ironman remains final and idempotent', () => {
  const state = makeState();
  state.settings.gameplay.difficulty = 'ironman';
  state.combat = {};
  const events = [];
  const listeners = new Map();
  const bus = {
    on(event, fn) {
      if (!listeners.has(event)) listeners.set(event, []);
      listeners.get(event).push(fn);
      return () => {};
    },
    emit(event, payload) {
      events.push({ event, payload });
      for (const fn of listeners.get(event) || []) fn(payload);
    },
  };
  combat.init({ state, bus, helpers: {}, registry: { get() { return null; } } });
  const player = state.entities.get(1);
  combat.kill(player, 9, { origin: { kind: 'weapon', id: 'wpn_autocannon_s' } });
  combat.kill(player, 9, { origin: { kind: 'weapon', id: 'wpn_autocannon_s' } });
  bus.emit('player:recoveryRequested', {});

  assert.equal(events.filter((entry) => entry.event === 'player:death').length, 1);
  assert.equal(events.filter((entry) => entry.event === 'game:over').length, 1);
  assert.equal(events.filter((entry) => entry.event === 'player:respawn').length, 0);
  const gameOver = events.find((entry) => entry.event === 'game:over').payload;
  assert.equal(gameOver.recoverable, false);
  assert.equal(state.combat.lastPlayerDefeat.schemaVersion, 1);
  assert.equal(state.combat.lastPlayerDefeat.killerId, 9);
  assert.deepEqual(state.combat.lastPlayerDefeat, gameOver.receipt,
    'Ironman retains the exact final defeat receipt consumed by the run-over screen');
  assert.equal(player.alive, false);
});

test('new-game recovery without a remembered station still chooses the lawful Helios dock', () => {
  const state = makeState();
  state.player.insurance.lastStationId = null;
  const plan = buildRecoveryPlan(state, state.entities.get(1));
  assert.equal(plan.stationId, 'station_helios');
  assert.equal(plan.stationName, 'Helios Station');
});

test('cross-sector recovery asks the world owner to enter the last lawful dock sector before placement', () => {
  const state = makeState();
  state.player.insurance.lastStationId = 'station_ceres';
  let entered = null;
  const world = {
    enterSector(sectorId, options) {
      entered = { sectorId, options };
      state.world.currentSectorId = sectorId;
      state.world.activeSector = {
        stations: [{ stationId: 'station_ceres', pos: { x: -900, z: 240 } }],
      };
    },
  };
  combat.state = state;
  combat.registry = { get(name) { return name === 'world' ? world : null; } };
  combat.bus = { emit() {} };
  const plan = buildRecoveryPlan(state, state.entities.get(1));

  assert.equal(plan.sectorId, 'sector_ceres_belt');
  combat.restorePlayerAtRecoveryDock(state.entities.get(1), plan);
  assert.equal(entered.sectorId, 'sector_ceres_belt');
  assert.equal(entered.options.via, 'recovery');
  assert.equal(state.entities.get(1).pos.x, -900);
  assert.equal(state.entities.get(1).pos.z, 240);
});

test('persistent command strip wires armor and a named, anchored impact receipt', () => {
  const source = readFileSync(new URL('../src/ui/commandBar.js', import.meta.url), 'utf8');
  assert.match(source, /data-k="armor"/);
  assert.match(source, /data-k="impact"/);
  assert.match(source, /buildDamageReadout/);
  assert.match(source, /role="status"/);
  assert.doesNotMatch(source, /aria-live="assertive"/);
});

test('after-action screen offers retry-from-dock and load routes with pointer and focus semantics', () => {
  const source = readFileSync(new URL('../src/ui/screens/gameOver.js', import.meta.url), 'utf8');
  assert.match(source, /Retry from dock/);
  assert.match(source, /player:recoveryRequested/);
  assert.match(source, /Load save/);
  assert.match(source, /receipt\.cause/);
  assert.match(source, /_defaultButton/);
  assert.match(source, /data:\s*\{\s*locked:\s*true\s*\}/);
});

test('after-action DOM locks focus, emits retry intent, and only closes on successful respawn', () => {
  const previousDocument = globalThis.document;
  const document = new FakeDocument();
  globalThis.document = document;
  try {
    const state = makeState();
    state.combat = {
      lastPlayerDefeat: buildDefeatReceipt(state, state.entities.get(1), 9, {
        origin: { kind: 'weapon', id: 'wpn_autocannon_s' },
        result: {
          dominantLayer: 'hull', subsystemId: 'drive',
          after: { shield: 0, shieldMax: 55, armor: 0, armorMax: 30, hull: 0, hullMax: 140 },
        },
      }),
    };
    const events = [];
    const listeners = new Map();
    const bus = {
      on(event, fn) {
        if (!listeners.has(event)) listeners.set(event, []);
        listeners.get(event).push(fn);
        return () => {};
      },
      emit(event, payload) {
        events.push({ event, payload });
        for (const fn of listeners.get(event) || []) fn(payload);
      },
    };
    let popped = 0;
    const pushed = [];
    const manager = {
      top() { return 'gameOver'; },
      popScreen() { popped++; },
      pushScreen(id) { pushed.push(id); },
    };
    const root = document.createElement('div');
    const ctx = {
      state, bus, screenManager: manager,
      telemetry: { getSessionStats() { return { deathLog: [] }; } },
    };

    gameOverScreen.mount(root, ctx);
    gameOverScreen.onShow(ctx);
    assert.equal(root.getAttribute('role'), 'dialog');
    assert.equal(root.getAttribute('aria-modal'), 'true');
    assert.equal(document.activeElement, gameOverScreen._retryButton);

    gameOverScreen._retryButton.click();
    assert.equal(events.filter((entry) => entry.event === 'player:recoveryRequested').length, 1);
    assert.equal(popped, 0, 'retry intent cannot dismiss the locked modal before combat confirms success');

    bus.emit('player:respawn', { stationId: 'station_helios' });
    assert.equal(popped, 1);
    assert.equal(events.filter((entry) => entry.event === 'game:over:dismissed').length, 1);

    gameOverScreen._loadButton.click();
    assert.deepEqual(pushed, ['saveLoad']);
  } finally {
    globalThis.document = previousDocument;
  }
});

test('loading or starting a run clears the death autosave gate', () => {
  const source = readFileSync(new URL('../src/save/saveSystem.js', import.meta.url), 'utf8');
  assert.match(source, /bus\.on\('save:loaded',\s*clearPlayerDeathGate\)/);
  assert.match(source, /bus\.on\('game:started',\s*clearPlayerDeathGate\)/);
});

class FakeClassList {
  constructor() { this.values = new Set(); }
  add(...values) { values.forEach((value) => this.values.add(value)); }
  remove(...values) { values.forEach((value) => this.values.delete(value)); }
}

class FakeElement {
  constructor(document, tagName) {
    this.ownerDocument = document;
    this.tagName = String(tagName).toUpperCase();
    this.children = [];
    this.attributes = new Map();
    this.listeners = new Map();
    this.classList = new FakeClassList();
    this.style = {};
    this.hidden = false;
    this.textContent = '';
    this.innerHTML = '';
    this.id = '';
  }
  appendChild(child) { this.children.push(child); return child; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  addEventListener(event, fn) { this.listeners.set(event, fn); }
  click() { const fn = this.listeners.get('click'); if (fn) fn({ currentTarget: this }); }
  focus() { this.ownerDocument.activeElement = this; }
}

class FakeDocument {
  constructor() {
    this.activeElement = null;
    this.head = new FakeElement(this, 'head');
  }
  createElement(tagName) { return new FakeElement(this, tagName); }
  getElementById(id) {
    const stack = [...this.head.children];
    while (stack.length) {
      const item = stack.pop();
      if (item.id === id) return item;
      stack.push(...item.children);
    }
    return null;
  }
}
