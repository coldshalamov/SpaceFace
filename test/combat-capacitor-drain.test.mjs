import test from 'node:test';
import assert from 'node:assert/strict';

import { combat } from '../src/systems/combat.js';
import { getDerivedStats } from '../src/systems/ships.js';
import { NEW_GAME } from '../src/data/newGameDefaults.js';

// combat.js owns capacitor regeneration. Fitted module energyDraw — summed by
// getDerivedStats into derived.continuousDrain — is the continuous tax the outfitting
// screen forecasts ("Continuous draw exceeds capacitor regeneration"). These tests pin
// the sim to that forecast: net rate = capRegen * multipliers - continuousDrain.

const PLAYER_CAP_REGEN_MULT = 1.15; // WEAPON_CAP_REGEN_MULT in combat.js — the player's pacing gift.

function makeShip({ id = 1, team = 0, cap = 0, capMax = 80, capRegen = 12, drain = 0 } = {}) {
  return {
    id,
    type: 'ship',
    alive: true,
    team,
    pos: { x: 0, y: 0, z: 0 },
    vel: { x: 0, y: 0, z: 0 },
    rot: 0,
    flags: {},
    hull: 100, hullMax: 100,
    armorHp: 0, armorMax: 0,
    shield: 0, shieldMax: 0,
    cap, capMax, capRegen,
    data: { defId: 'ship_kestrel', derived: { continuousDrain: drain } },
  };
}

function makeState(ships, playerId = null) {
  return {
    tick: 0,
    simTime: 0,
    playerId,
    entities: new Map(ships.map((ship) => [ship.id, ship])),
    entityList: ships.slice(),
    // No entityIndex version marker → the quiet latch cannot arm; every update walks.
  };
}

function initCombat(state) {
  const bus = { on() { return () => {}; }, emit() {} };
  combat.init({ state, bus, helpers: {}, registry: { get() { return null; } } });
}

function run(state, seconds, dt = 1 / 60) {
  const ticks = Math.round(seconds / dt);
  for (let i = 0; i < ticks; i += 1) {
    state.tick += 1;
    state.simTime += dt;
    combat.update(dt, state);
  }
}

test('a powered fit recharges the capacitor at regen minus fitted continuous drain', () => {
  // The real new-game fit draws 12/s against the Kestrel's 12/s reactor — the forecast
  // the shipyard shows is a near-saturated line, not flavor text.
  const derived = getDerivedStats(NEW_GAME.shipId, NEW_GAME.fittedModules, null);
  assert.ok(derived.continuousDrain > 0, 'starter fit carries real module draw');
  assert.equal(derived.capRegen, 12);

  const ship = makeShip({ id: 7, cap: 0, capMax: derived.capMax, capRegen: derived.capRegen, drain: derived.continuousDrain });
  const state = makeState([ship], 7);
  initCombat(state);

  run(state, 10);
  const net = derived.capRegen * PLAYER_CAP_REGEN_MULT - derived.continuousDrain;
  assert.ok(net > 0, 'the authored starter fit still nets positive');
  assert.ok(Math.abs(ship.cap - net * 10) < 0.5,
    `expected ~${(net * 10).toFixed(2)} capacitor after 10 s, got ${ship.cap.toFixed(2)}`);
});

test('a power-hungry fit bleeds the capacitor even while nothing fires', () => {
  // drain 30/s vs regen 12*1.15 = 13.8/s — the "exceeds regeneration" warning made real.
  const ship = makeShip({ id: 7, cap: 80, capMax: 80, capRegen: 12, drain: 30 });
  const state = makeState([ship], 7);
  initCombat(state);

  run(state, 2);
  const bled = (30 - 12 * PLAYER_CAP_REGEN_MULT) * 2;
  assert.ok(ship.cap < 80 - bled + 0.5 && ship.cap > 80 - bled - 0.5,
    `capacitor must bleed ~${bled.toFixed(1)} from full, got ${(80 - ship.cap).toFixed(2)}`);

  run(state, 30);
  assert.equal(ship.cap, 0, 'discharge floors at empty instead of going negative');
});

test('a hull with no powered fittings keeps the legacy regen exactly', () => {
  const ship = makeShip({ id: 9, cap: 0, capMax: 80, capRegen: 20, drain: 0 });
  const state = makeState([ship], null);
  initCombat(state);

  run(state, 2);
  assert.ok(Math.abs(ship.cap - 40) < 0.01,
    `NPC hull regens 20/s untouched by module draw, got ${ship.cap.toFixed(2)}`);

  ship.data.derived = null;
  run(state, 1);
  assert.ok(Math.abs(ship.cap - 60) < 0.01,
    `a missing derived block reads as zero draw, got ${ship.cap.toFixed(2)}`);
});

test('continuous draw applies to any fitted hull, without the player regen gift', () => {
  // An NPC that somehow mounts powered modules pays the same law — only the player
  // gets the ×1.15 weapon-capacitor pacing multiplier.
  const npc = makeShip({ id: 9, team: 1, cap: 40, capMax: 80, capRegen: 20, drain: 5 });
  const state = makeState([npc], null);
  initCombat(state);

  run(state, 2);
  assert.ok(Math.abs(npc.cap - (40 + (20 - 5) * 2)) < 0.01,
    `NPC nets 15/s (no ×1.15), got ${npc.cap.toFixed(2)}`);
});

test('an equilibrium-fit capacitor holds at its ceiling without overshooting', () => {
  const ship = makeShip({ id: 7, cap: 79.9, capMax: 80, capRegen: 12, drain: 12 });
  const state = makeState([ship], 7);
  initCombat(state);

  run(state, 2);
  assert.equal(ship.cap, 80, 'net-positive charge clamps at capMax');
});
