#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createSimulation } from '../src/core/sim.js';
import { SECTORS } from '../src/data/sectors.js';
import { economy } from '../src/systems/economy.js';
import { cargo } from '../src/systems/cargo.js';
import { missions } from '../src/systems/missions.js';
import {
  BULK_HAUL_MIN_U,
  bulkHaulPayoutForChunk,
  mining,
} from '../src/systems/mining.js';
import {
  BULK_HAUL_TAG_KIND,
  BULK_HAUL_TAG_PREFIX,
  bulkHaulMassU,
  bulkHaulTag,
  buildBulkHaulTag,
  isBulkHaulTagArmed,
  nearestRefineryRouteHint,
} from '../src/ui/prompts/bulkHaulTag.js';

function installWorld(state, currentSectorId = 'sector_ceres_belt') {
  state.world.currentSectorId = currentSectorId;
  state.world.sectors = Object.fromEntries(SECTORS.map((sector) => [sector.id, sector]));
}

function spawnPlayer(sim) {
  const player = sim.spawn({
    type: 'ship',
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    radius: 6,
    hull: 100,
    hullMax: 100,
    collides: true,
    data: { fittings: [] },
  });
  sim.state.playerId = player.id;
  sim.state.player.cargo = { items: {}, usedVolume: 0, usedMass: 0, capVolume: 200, capMass: 400 };
  return player;
}

function spawnChunk(sim, overrides = {}) {
  const massU = overrides.massU == null ? BULK_HAUL_MIN_U + 5 : overrides.massU;
  return sim.spawn({
    type: 'asteroid',
    pos: overrides.pos || { x: 40, z: 0 },
    radius: 12,
    mass: massU,
    hull: 20,
    hullMax: 20,
    collides: true,
    data: {
      isChunk: true,
      bulkMassU: massU,
      yieldU: massU,
      commodityId: 'cmdty_ore_iron',
      basePrice: 28,
      typeId: 'ast_metallic',
      oreHP: 20,
      oreHPMax: 20,
      ...overrides.data,
    },
  });
}

function boot(systems = [bulkHaulTag, mining, cargo], seed = 8317) {
  const sim = createSimulation({ seed, systems });
  sim.state.mode = 'flight';
  sim.state.simTime = 10;
  installWorld(sim.state);
  spawnPlayer(sim);
  return sim;
}

function assertPureThreshold() {
  const sim = boot([bulkHaulTag, mining, cargo], 8317);
  const small = spawnChunk(sim, { massU: BULK_HAUL_MIN_U });
  const big = spawnChunk(sim, { massU: BULK_HAUL_MIN_U + 1 });

  assert.equal(bulkHaulMassU(big), BULK_HAUL_MIN_U + 1, 'mass helper reads chunk bulkMassU');
  assert.equal(isBulkHaulTagArmed(small), false, 'tag must not arm at the threshold');
  assert.equal(isBulkHaulTagArmed(big), true, 'tag arms only when chunk mass is greater than BULK_HAUL_MIN_U');
  assert.equal(buildBulkHaulTag(small, sim.state), null, 'small chunks never build a tag');

  const tag = buildBulkHaulTag(big, sim.state);
  assert.equal(tag.kind, BULK_HAUL_TAG_KIND, 'tag kind is stable for future HUD/map consumers');
  assert.equal(tag.text, `${BULK_HAUL_TAG_PREFIX} \u00b7 ${BULK_HAUL_MIN_U + 1}u`,
    'tag text tells the player to tether the oversized chunk');
  assert.equal(tag.routeHint.stationId, 'station_ceres', 'current-sector refinery is the route target');
  assert.equal(tag.routeHint.local, true, 'route hint marks same-sector refineries as local');
}

function assertMiningEventArmsTagOnce() {
  const sim = boot();
  const chunk = spawnChunk(sim, { massU: 25 });
  const seen = [];
  sim.bus.on('ui:bulkHaulTag', (p) => seen.push(p));

  const released = sim.registry.get('mining').applyMining(chunk.id, 100, 1, sim.state.playerId);
  assert.equal(released, 0, 'oversized chunks cannot be beamed into normal ore');
  assert.equal(seen.length, 1, 'first mining:bulkRequiresTether surfaces exactly one UI tag');
  assert.equal(seen[0].chunkId, chunk.id);
  assert.equal(seen[0].massU, 25);
  assert.equal(seen[0].text, 'TETHER TO HAUL \u00b7 25u');
  assert.equal(sim.state.ui.bulkHaulTag.chunkId, chunk.id, 'active prompt mirrors into state.ui.bulkHaulTag');

  sim.registry.get('mining').applyMining(chunk.id, 100, 1, sim.state.playerId);
  sim.registry.get('mining').applyMining(chunk.id, 100, 1, sim.state.playerId);
  assert.equal(seen.length, 1, 'holding the beam on the same chunk must not spam tag events every tick');
}

function assertTetherAndDeliveryLifecycle() {
  const sim = boot([bulkHaulTag, economy, missions, mining, cargo], 9317);
  const state = sim.state;
  state.player.credits = 1000;
  const chunk = spawnChunk(sim, { massU: 25 });
  sim.spawn({
    type: 'station',
    pos: { x: 80, z: 0 },
    radius: 18,
    collides: true,
    data: { stationId: 'station_ceres', stationTypeId: 'refinery', name: 'Ceres Refinery' },
  });

  const updates = [];
  const clears = [];
  const completed = [];
  sim.bus.on('ui:bulkHaulTag', (p) => updates.push(p));
  sim.bus.on('ui:bulkHaulTagCleared', (p) => clears.push(p));
  sim.bus.on('mission:completed', (p) => completed.push(p));

  sim.registry.get('mining').applyMining(chunk.id, 100, 1, state.playerId);
  sim.bus.emit('tether:latched', { targetId: chunk.id });
  assert.equal(updates.length, 2, 'tethering the tagged chunk updates the prompt once');
  assert.equal(state.ui.bulkHaulTag.phase, 'hauling', 'tag switches to hauling phase after tether latch');
  assert.equal(state.ui.bulkHaulTag.text, 'HAUL TO REFINERY \u00b7 25u');
  assert.match(state.ui.bulkHaulTag.routeHint.text, /Ceres Refinery/, 'hauling tag carries the refinery hint');

  state.player.tether = { targetId: chunk.id };
  state.missions.active.push({
    id: 'm_bulk_guidance',
    type: 'bulk_haul',
    stationId: 'station_beltout',
    factionId: 'faction_dmc',
    params: { massU: 25, cmdtyId: 'cmdty_ore_iron' },
    objectiveProgress: 0,
    objectiveTarget: 25,
    acceptedAt_s: 0,
    deadline_s: 9999,
    reward_cr: 0,
    collateral_cr: 0,
    riskTier: 1,
    destStationId: 'station_ceres',
    destSectorId: 'sector_ceres_belt',
    distance: 600,
    targetEntityIds: [],
    needsTargets: false,
    status: 'active',
    title: 'Bulk Guidance Check',
  });

  const expected = bulkHaulPayoutForChunk(chunk).credits;
  sim.bus.emit('dock:docked', { stationId: 'station_ceres' });
  assert.equal(state.player.credits, 1000 + expected, 'refinery delivery still pays through mining/economy');
  assert.equal(completed.length, 1, 'bulk-haul delivery still completes the contract');
  assert.equal(completed[0].type, 'bulk_haul');
  assert.equal(state.ui.bulkHaulTag, null, 'delivery clears the active tag');
  assert.deepEqual(clears.map((p) => p.reason), ['delivered'], 'delivery clear carries a reason for consumers');
}

function assertNoDomRequiredAndFallbackRoute() {
  assert.equal(typeof document, 'undefined', 'check runs headless');
  const sim = boot([bulkHaulTag, mining, cargo], 7317);
  sim.state.world.sectors = {};
  const hint = nearestRefineryRouteHint(sim.state);
  assert.equal(hint.text, 'Find a refinery dock.', 'missing world data gives a non-lying route fallback');
  const chunk = spawnChunk(sim, { massU: 30 });
  sim.registry.get('mining').applyMining(chunk.id, 100, 1, sim.state.playerId);
  assert.equal(sim.state.ui.bulkHaulTag.routeHint.text, 'Find a refinery dock.');
}

function assertSourceContracts() {
  const registrySource = readFileSync(new URL('../src/core/registry.js', import.meta.url), 'utf8');
  const promptSource = readFileSync(new URL('../src/ui/prompts/bulkHaulTag.js', import.meta.url), 'utf8');
  const packageSource = readFileSync(new URL('../package.json', import.meta.url), 'utf8');

  assert.match(packageSource, /"check:mining:bulk-guidance": "node scripts\/check-mining-bulk-guidance\.mjs"/,
    'package.json must expose the named T3-17 gate');
  assert.match(registrySource, /import \{ bulkHaulTag \} from '\.\.\/ui\/prompts\/bulkHaulTag\.js';/,
    'bulkHaulTag must be imported by the live registry');
  assert.match(registrySource, /hazardHints,\s*bulkHaulTag,\s*dangerGradient/,
    'bulkHaulTag must be a SYSTEMS-only additive registration near other prompt surfaces');
  assert.doesNotMatch(registrySource, /UPDATE_ORDER = \[[^\]]*bulkHaulTag/s,
    'bulkHaulTag must not enter the fixed-timestep update order');
  assert.doesNotMatch(promptSource, /Math\.random|Date\.now|setTimeout|setInterval/,
    'prompt surface must not use RNG, wall-clock time, or timers');
  assert.match(promptSource, /mining:bulkRequiresTether/,
    'prompt must consume the shipped mining guidance event');
  assert.match(promptSource, /BULK_HAUL_MIN_U/,
    'prompt threshold must come from mining.js, not a private duplicate');
}

assertPureThreshold();
assertMiningEventArmsTagOnce();
assertTetherAndDeliveryLifecycle();
assertNoDomRequiredAndFallbackRoute();
assertSourceContracts();

console.log('Mining bulk-haul guidance checks OK');
