#!/usr/bin/env node
// Deterministic headless proof: imports and steps the actual economy + combat systems in Node.
// No browser globals, renderer substitutes, DOM shims, inline gameplay formulas, or wall-clock input.

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { combat } from '../src/systems/combat.js';
import { economy } from '../src/systems/economy.js';

const seed = readIntegerArg('--seed', 0x5face);
const ticks = readIntegerArg('--ticks', 720);
if (ticks < 301) throw new RangeError('--ticks must be at least 301 so economy and combat both advance');

const first = runScenario(seed, ticks);
const second = runScenario(seed, ticks);
assert.deepStrictEqual(second, first, 'same seed + inputs must produce identical simulation state');
assert.equal(first.combat.damageEvents, 1, 'real combat path must resolve one hit');
assert.equal(first.combat.killedEvents, 1, 'real combat path must emit one kill');
assert.equal(first.combat.targetPresent, false, 'core lifetime sweep must remove the killed target');
assert.equal(first.player.credits, 1321, 'economy must be the bounty credit writer');
assert.ok(first.economy.ticksElapsed > 0, 'real economy cadence must advance');
assert.equal(first.economy.emittedTicks, first.economy.ticksElapsed, 'economy event count must match its clock');
assert.equal(first.authoritativeGraphOwnsRenderRefs, false, 'authoritative entities must not own mesh/view refs');

const canonical = JSON.stringify(first);
const digest = createHash('sha256').update(canonical).digest('hex');
process.stdout.write(JSON.stringify({ deterministic: true, sha256: digest, state: first }, null, 2) + '\n');

function runScenario(runSeed, runTicks) {
  const sim = createSimulation({ seed: runSeed, systems: [economy, combat] });
  const { state, bus, registry } = sim;
  state.mode = 'flight';
  state.player.credits = 1000;

  const events = { damage: 0, killed: 0, economyTicks: 0 };
  bus.on('combat:damage', () => { events.damage++; });
  bus.on('entity:killed', () => { events.killed++; });
  bus.on('economy:tick', () => { events.economyTicks++; });

  const player = sim.spawn({
    type: 'ship', team: 0, factionId: 'faction_free', pos: { x: 0, z: 0 },
    hull: 100, hullMax: 100, shield: 20, shieldMax: 20,
    cap: 40, capMax: 40, capRegen: 2,
    data: { defId: 'ship_kestrel', shipClass: 'fighter' },
  });
  state.playerId = player.id;

  const target = sim.spawn({
    type: 'ship', team: 1, factionId: 'faction_vael', pos: { x: 25, z: 0 },
    hull: 75, hullMax: 75, armorHp: 15, armorMax: 15, shield: 10, shieldMax: 10,
    data: { bountyCr: 321, shipClass: 'fighter', ai: { lawful: false } },
  });

  const economySystem = registry.get('economy');
  economySystem.newGame();
  const stationId = Object.keys(state.economy.markets).sort()
    .find((id) => Object.keys(state.economy.markets[id] || {}).length > 0);
  const market = stationId && state.economy.markets[stationId];
  const commodityId = market && Object.keys(market).sort()[0];
  if (!stationId || !commodityId) throw new Error('Economy did not construct a headless market');

  // Drive the public event contract used by automation/NPC traders, then let the real 5-second
  // economy cadence settle it. No pricing or drift formula is copied into this script.
  bus.emit('economy:applyTradePressure', { stationId, commodityId, vol: -25 });

  const hitAt = Math.max(1, Math.floor(runTicks / 3));
  sim.runTicks(hitAt, SIM_DT);
  bus.emit('projectile:hit', {
    targetId: target.id,
    ownerId: player.id,
    damage: 200,
    damageType: 'kinetic',
    pos: { x: target.pos.x, z: target.pos.z },
  });
  sim.runTicks(runTicks - hitAt, SIM_DT);

  const entry = state.economy.markets[stationId][commodityId];
  const entityState = state.entityList
    .map((e) => ({ id: e.id, type: e.type, alive: e.alive, hull: round6(e.hull), shield: round6(e.shield) }))
    .sort((a, b) => a.id - b.id);

  const result = {
    seed: runSeed >>> 0,
    ticks: state.tick,
    simTime: round6(state.simTime),
    systems: registry.systems.map((system) => system.name),
    economy: {
      stationId,
      commodityId,
      ticksElapsed: state.economy.econClock.ticksElapsed,
      emittedTicks: events.economyTicks,
      stock: round6(entry.stock),
      buy: entry.lastBuy,
      sell: entry.lastSell,
    },
    combat: {
      damageEvents: events.damage,
      killedEvents: events.killed,
      targetPresent: state.entities.has(target.id),
    },
    player: { id: player.id, credits: state.player.credits },
    entities: entityState,
    authoritativeGraphOwnsRenderRefs: state.entityList.some((e) =>
      Object.prototype.hasOwnProperty.call(e, 'mesh') || Object.prototype.hasOwnProperty.call(e, 'view')),
  };
  sim.dispose();
  return result;
}

function readIntegerArg(name, fallback) {
  const prefix = name + '=';
  const raw = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  if (!raw) return fallback;
  const value = Number(raw.slice(prefix.length));
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError(`${name} must be a non-negative integer`);
  return value;
}

function round6(value) {
  return Math.round(value * 1e6) / 1e6;
}
