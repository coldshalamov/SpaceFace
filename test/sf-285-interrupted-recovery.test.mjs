// SF-285 — an interrupted failure leads back to a playable recovery state.
//
// The ordinary route under test: die (or be interrupted during the after-action transition),
// have the world written to a slot while the wreck is down (a manual save IS legal there — the
// defeated wreck serializes on purpose), then load that slot and continue normally. The packet
// demands: one valid controllable end-state, the loss neither duplicated nor erased, and the
// remaining recovery opportunity truthful AND reachable.
//
// (a) the durable defeat receipt must round-trip through the combat save section — the
//     after-action screen's model and combat's re-arm seam both read lastPlayerDefeat;
// (b) save:loaded must re-arm the recovery latch for a still-defeated restored wreck instead of
//     clearing it (an in-session dead→load boundary is exactly where the latch matters most);
// (c) a LIVING restored save still clears a stale pending defeat (the ordinary purpose);
// (d) the restored wreck re-presents the after-action surface through uiRoot's save:loaded
//     handler — the only recovery affordance that exists for a dead hull;
// (e) ironman keeps permadeath: the final screen is owed, the recovery latch is not.
//
// Asserts read authoritative state (entity alive/flags, combat receipt, latch, emitted intents),
// not merely that a callback fired.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { combat } from '../src/systems/combat.js';
import { serializeCombatState, restoreCombatState } from '../src/combat/persistence.js';
import * as gameOverScreen from '../src/ui/screens/gameOver.js';

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

function makeBus() {
  const events = [];
  const listeners = new Map();
  return {
    events,
    on(event, fn) {
      if (!listeners.has(event)) listeners.set(event, []);
      listeners.get(event).push(fn);
      return () => {};
    },
    emit(event, payload) {
      events.push({ event, payload });
      for (const fn of listeners.get(event) || []) fn(payload);
    },
    count(name) { return events.filter((e) => e.event === name).length; },
    last(name) { return events.filter((e) => e.event === name).pop(); },
  };
}

// The save owner's resolver maps durable refs back onto live entities; the only durable kind this
// fixture can produce is the player ref (dead bodies and unpersisted actors carry none).
function resolveEntityRef(state) {
  return (ref) => (ref && ref.kind === 'player' ? state.playerId : null);
}

function killPlayer(state, bus) {
  combat.kill(state.entities.get(state.playerId), 9, {
    origin: { kind: 'weapon', id: 'wpn_autocannon_s' },
    result: {
      dominantLayer: 'hull',
      after: { shield: 0, shieldMax: 55, armor: 0, armorMax: 30, hull: 0, hullMax: 140 },
    },
  });
}

test('(a)+(b) a save written mid-defeat keeps a reachable recovery offer through restore', () => {
  const state = makeState();
  const bus = makeBus();
  combat.init({ state, bus, helpers: {}, registry: { get() { return null; } } });
  const player = state.entities.get(1);

  killPlayer(state, bus);
  assert.equal(player.alive, false, 'precondition: the wreck is down');
  assert.equal(player.flags.defeated, true, 'the durable defeated flag is on the entity');
  assert.ok(state.combat.lastPlayerDefeat, 'the defeat receipt exists before the save');
  assert.equal(bus.count('game:over'), 1, 'one recoverable defeat was published');
  const savedReceipt = state.combat.lastPlayerDefeat;

  // The save boundary: combat's section serializes the durable receipt; the envelope restore
  // rebuilds semantic combat state, then save:loaded settles the boundary.
  const saved = JSON.parse(JSON.stringify(serializeCombatState(state)));
  assert.ok(saved.lastPlayerDefeat && saved.lastPlayerDefeat.schemaVersion,
    'the defeat receipt must be inside the combat save section, not just live state');
  assert.deepEqual(saved.lastPlayerDefeat.recovery, savedReceipt.recovery,
    'the quoted recovery plan survives the write — consequences must not be recomputed twice');

  restoreCombatState(state, saved, resolveEntityRef(state));
  assert.ok(state.combat.lastPlayerDefeat,
    'the restored envelope keeps the durable defeat receipt');
  assert.equal(state.combat.lastPlayerDefeat.killerId, savedReceipt.killerId);

  bus.emit('save:loaded', { slot: 'quick' });

  assert.ok(combat._pendingPlayerRecovery,
    'save:loaded re-arms the recovery latch for the still-defeated restored wreck');
  assert.ok(state.combat.lastPlayerDefeat,
    'save:loaded keeps the restored receipt — clearing it strands the wreck');

  // The ordinary continue: the after-action verb emits the recovery intent exactly once.
  bus.emit('player:recoveryRequested', { source: 'after_action' });
  assert.equal(bus.count('player:respawn'), 1, 'the restored wreck recovers once');
  assert.equal(player.alive, true, 'the player returns to a controllable hull');
  assert.equal(player.flags.defeated !== true, true, 'the defeated flag clears on respawn');
  assert.equal(bus.count('economy:chargeCredits'), 1,
    'the loss is charged exactly once — neither duplicated nor erased');
  assert.equal(state.combat.lastPlayerDefeat, null, 'the settled receipt is consumed');
  assert.equal(bus.count('player:recoveryFailed'), 0);

  // A repeated invocation after success is a clean refusal, never a second consequence.
  bus.emit('player:recoveryRequested', { source: 'duplicate' });
  assert.equal(bus.count('player:respawn'), 1, 'no second respawn');
  assert.equal(bus.count('economy:chargeCredits'), 1, 'no second charge');
  assert.equal(bus.last('player:recoveryFailed').payload.reason, 'no_pending_defeat');
});

test('(c) a LIVING restored save still clears a stale pending defeat', () => {
  const state = makeState();
  const bus = makeBus();
  combat.init({ state, bus, helpers: {}, registry: { get() { return null; } } });
  const player = state.entities.get(1);

  killPlayer(state, bus);
  assert.ok(combat._pendingPlayerRecovery);

  // The loaded slot holds a LIVING player — the in-memory latch and any receipt belong to the
  // outgoing session and must not resurrect a second defeat over the fresh hull.
  player.alive = true;
  delete player.flags.defeated;
  state.combat.lastPlayerDefeat = null;
  bus.emit('save:loaded', { slot: 'alive-save' });

  assert.equal(combat._pendingPlayerRecovery, null, 'a live load never keeps a dead latch');
  bus.emit('player:recoveryRequested', { source: 'after_action' });
  assert.equal(bus.count('player:respawn'), 0, 'no recovery fires for a living player');
  assert.equal(bus.last('player:recoveryFailed').payload.reason, 'no_pending_defeat');
});

test('(d) a restored defeat re-presents the after-action surface; a living load does not', () => {
  const state = makeState();
  const bus = makeBus();
  combat.init({ state, bus, helpers: {}, registry: { get() { return null; } } });
  killPlayer(state, bus);
  const saved = JSON.parse(JSON.stringify(serializeCombatState(state)));
  restoreCombatState(state, saved, resolveEntityRef(state));

  assert.equal(typeof gameOverScreen.restoredDefeatIntent, 'function',
    'gameOver exports the restore-surface intent the ui boundary consults');
  assert.equal(gameOverScreen.restoredDefeatIntent(state), true,
    'a still-defeated restored wreck re-opens the after-action surface');
  assert.equal(gameOverScreen.restoredDefeatIntent({
    ...state,
    entities: new Map([[1, { ...state.entities.get(1), alive: true, flags: {} }]]),
  }), false, 'a living restored player gets the ordinary flight surface');

  const uiRoot = readFileSync(new URL('../src/ui/uiRoot.js', import.meta.url), 'utf8');
  const boundary = [...uiRoot.matchAll(/bus\.on\('save:loaded',[\s\S]*?\}\);/g)]
    .map((m) => m[0])
    .find((src) => src.includes('screenManager.closeAll'));
  assert.ok(boundary, 'uiRoot owns the save:loaded screen-cleanup handler');
  assert.match(boundary, /restoredDefeatIntent/,
    'the save:loaded handler re-presents gameOver for a restored defeat');
  assert.ok(boundary.indexOf('restoredDefeatIntent') > boundary.indexOf('closeAll()'),
    'the re-presentation happens after closeAll, or the same boundary unmounts it');
});

test('(e) ironman keeps permadeath: the final screen is owed, the recovery latch is not', () => {
  const state = makeState();
  state.settings.gameplay.difficulty = 'ironman';
  const bus = makeBus();
  combat.init({ state, bus, helpers: {}, registry: { get() { return null; } } });
  const player = state.entities.get(1);

  killPlayer(state, bus);
  assert.equal(player.alive, false);
  assert.ok(state.combat.lastPlayerDefeat, 'ironman retains its final receipt');
  const saved = JSON.parse(JSON.stringify(serializeCombatState(state)));
  restoreCombatState(state, saved, resolveEntityRef(state));
  bus.emit('save:loaded', { slot: 'quick' });

  assert.equal(combat._pendingPlayerRecovery, null,
    'permadeath never re-arms a recovery latch');
  bus.emit('player:recoveryRequested', { source: 'after_action' });
  assert.equal(bus.count('player:respawn'), 0, 'ironman death stays final');
  assert.equal(gameOverScreen.restoredDefeatIntent(state), true,
    'the final run-over surface is still owed to the restored ironman wreck');
});
