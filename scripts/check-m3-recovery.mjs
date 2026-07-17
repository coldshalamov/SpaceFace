#!/usr/bin/env node
/**
 * W1 M3 recovery settle gate (headless production combat + gameOver path).
 *
 * Proves:
 *  1. Standard defeat freezes until Continue intent
 *  2. player:recoveryRequested → exactly one player:respawn
 *  3. Lawful collision-clear berth beside station_helios (no invuln hack)
 *  4. Game Over dismisses on respawn when top of stack
 *  5. Game Over dismisses when buried under another screen (REAL UI fix)
 *  6. Double Continue does not double-charge / double-respawn
 *
 * Classification: REAL product path (combat + UI). Not SF-injected browser route.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { combat } from '../src/systems/combat.js';
import { gameOverScreen } from '../src/ui/screens/gameOver.js';
import { protectedStationAt } from '../src/ai/engagementAuthority.js';
import { buildDefeatReceipt } from '../src/combat/playerDefeat.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));

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
    pos: vec(40, 20),
    prevPos: vec(40, 20),
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
    input: { fire: true, moveX: 1, moveZ: 1, boost: true, actions: {} },
    player: {
      credits: 5000,
      insurance: { rate: 0.6, deductibleCr: 500, insuredModules: false, lastStationId: 'station_helios' },
      ownedShips: [{ defId: 'ship_kestrel', fittings: ['wpn_pulse_laser_s'] }],
      activeShipIndex: 0,
      cargo: {
        items: { cmdty_ore_iron: 5 },
        usedVolume: 5,
        usedMass: 5,
        capVolume: 40,
        capMass: 100,
      },
    },
    story: { persistentCargo: [] },
    entities: new Map([[1, player], [9, attacker]]),
    entityList: [player, attacker],
    world: {
      currentSectorId: 'sector_helios_prime',
      activeSector: { stations: [{ stationId: 'station_helios', pos: { x: 320, z: -80 } }] },
    },
    ui: { screenStack: ['gameOver'] },
  };
}

function makeBus(events) {
  const listeners = new Map();
  return {
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
}

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
    this.title = '';
    this.className = '';
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

// ── 1. Combat recovery settle ─────────────────────────────────────────────
{
  const state = makeState();
  const events = [];
  const bus = makeBus(events);
  combat.init({ state, bus, helpers: {}, registry: { get() { return null; } } });
  const player = state.entities.get(1);
  const lethal = {
    origin: { kind: 'weapon', id: 'wpn_autocannon_s' },
    packet: { source: { weaponId: 'wpn_autocannon_s' } },
    result: { dominantLayer: 'hull' },
  };

  combat.kill(player, 9, lethal);
  combat.kill(player, 9, lethal);

  assert.equal(events.filter((e) => e.event === 'game:over').length, 1, 'one game:over');
  assert.equal(events.filter((e) => e.event === 'player:respawn').length, 0, 'no auto-respawn');
  assert.equal(player.alive, false);

  bus.emit('player:recoveryRequested', { source: 'after_action' });
  bus.emit('player:recoveryRequested', { source: 'duplicate' });

  assert.equal(events.filter((e) => e.event === 'player:respawn').length, 1, 'exactly one respawn');
  assert.equal(player.alive, true, 'player alive after recovery');
  assert.equal(player.pos.x, 460, 'collision-clear berth x (station 320 + clearance)');
  assert.equal(player.pos.z, -80, 'berth z matches station');
  assert.equal(player.flags.invuln, false, 'no invuln recovery hack');
  assert.equal(protectedStationAt(state, player)?.stationId, 'station_helios');
  assert.equal(state.combat.lastPlayerDefeat, null, 'receipt cleared after settle');
  assert.equal(events.filter((e) => e.event === 'economy:chargeCredits').length, 1);
}

// ── 2. Game Over dismiss when top is gameOver ─────────────────────────────
{
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
    state.ui.screenStack = ['gameOver'];
    const events = [];
    const bus = makeBus(events);
    const stack = state.ui.screenStack;
    const manager = {
      top() { return stack[stack.length - 1] || null; },
      popScreen() { stack.pop(); },
      pushScreen(id) { stack.push(id); },
    };
    const root = document.createElement('div');
    const ctx = {
      state,
      bus,
      screenManager: manager,
      telemetry: { getSessionStats() { return { deathLog: [] }; } },
    };

    gameOverScreen.mount(root, ctx);
    gameOverScreen._retryButton.click();
    assert.equal(events.filter((e) => e.event === 'player:recoveryRequested').length, 1);

    bus.emit('player:respawn', { stationId: 'station_helios' });
    assert.equal(events.filter((e) => e.event === 'game:over:dismissed').length, 1,
      'top gameOver must dismiss on respawn');
    assert.ok(!stack.includes('gameOver'), 'gameOver removed from stack');
  } finally {
    globalThis.document = previousDocument;
  }
}

// ── 3. Game Over dismiss when buried under another screen (REAL fix) ───────
{
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
    state.ui.screenStack = ['gameOver', 'saveLoad'];
    const events = [];
    const bus = makeBus(events);
    const stack = state.ui.screenStack;
    const manager = {
      top() { return stack[stack.length - 1] || null; },
      popScreen() { stack.pop(); },
      pushScreen(id) { stack.push(id); },
    };
    const root = document.createElement('div');
    const ctx = {
      state,
      bus,
      screenManager: manager,
      telemetry: { getSessionStats() { return { deathLog: [] }; } },
    };

    gameOverScreen.mount(root, ctx);
    bus.emit('player:respawn', { stationId: 'station_helios' });
    assert.equal(events.filter((e) => e.event === 'game:over:dismissed').length, 1,
      'buried gameOver must still dismiss on player:respawn (REAL)');
    assert.ok(!stack.includes('gameOver'), 'buried gameOver popped');
    assert.ok(!stack.includes('saveLoad'), 'overlay above gameOver also cleared');
  } finally {
    globalThis.document = previousDocument;
  }
}

// ── 4. Source contract ────────────────────────────────────────────────────
{
  const source = readFileSync(resolve(ROOT, 'src/ui/screens/gameOver.js'), 'utf8');
  assert.match(source, /player:recoveryRequested/);
  assert.match(source, /popAncestorsUntilGameOverResolves/);
  assert.match(source, /Continue from recovery berth/);
  const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8'));
  assert.equal(pkg.scripts['check:m3:recovery'], 'node scripts/check-m3-recovery.mjs');
}

console.log('check:m3:recovery OK — combat settle + GO dismiss (top + buried) green');
