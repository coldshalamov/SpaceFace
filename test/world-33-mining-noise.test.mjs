// WORLD-33 — a loud mining operation raises local danger, so noise draws attention.
//
// The mining meter's `danger:miningNoise` crossing is the named report; the paid mark is a
// rate-limited `sectorsim:impulse` that sectorSim folds into the worked sector's danger node,
// and the ordinary kernel decays it back toward the sector's structural danger. Before this the
// meter emitted to nobody — the module risk panel told the player greed gets loud and then made
// it free.
import test from 'node:test';
import assert from 'node:assert/strict';

import { SECTORS, dangerIndex } from '../src/data/sectors.js';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { sectorSim } from '../src/systems/sectorSim.js';
import { mining } from '../src/systems/mining.js';

const SEED = 4242;
const SECTOR = 'sector_ceres_belt';

function makeCtx(seed = SEED, currentSectorId = SECTOR) {
  const state = createGameState(seed);
  state.meta.seed = seed;
  state.world.currentSectorId = currentSectorId;
  for (const s of SECTORS) {
    state.world.sectors[s.id] = { ...s, owner: s.factionId };
  }
  const bus = createBus();
  const registry = {
    get(name) {
      if (name === 'factions') return { addOffscreenTension() {}, contestedSectorFor() { return null; } };
      if (name === 'automation') return { offscreenRiskPass() { return 0; } };
      return null;
    },
  };
  return { state, bus, registry, helpers: {} };
}

test('sectorsim:impulse queues one bounded mining_noise impulse on the worked sector', () => {
  const ctx = makeCtx();
  sectorSim.init(ctx);
  ctx.bus.emit('sectorsim:impulse', { kind: 'mining_noise', sectorId: SECTOR, danger: 0.05 });

  const impulses = ctx.state.sectorSim.impulses;
  assert.equal(impulses.length, 1);
  assert.equal(impulses[0].kind, 'mining_noise');
  assert.equal(impulses[0].sectorId, SECTOR);
  assert.equal(impulses[0].danger, 0.05, 'the paid mark is the authored bounded value');
});

test('the impulse raises the sector danger node once and then decays', () => {
  // sectorSim is a module singleton — drive the noisy run to its observation points first, then
  // rebind to the quiet control run for the identical spans.
  const noisy = makeCtx();
  sectorSim.init(noisy);
  noisy.bus.emit('sectorsim:impulse', { kind: 'mining_noise', sectorId: SECTOR, danger: 0.05 });
  sectorSim._advanceModel(0.25, 'test');
  const raised = noisy.state.sectorSim.field.nodes[SECTOR].danger;
  assert.equal(noisy.state.sectorSim.impulses.length, 0, 'the impulse is consumed once');
  sectorSim._advanceModel(3, 'test');
  const decayed = noisy.state.sectorSim.field.nodes[SECTOR].danger;

  const quiet = makeCtx();
  sectorSim.init(quiet);
  sectorSim._advanceModel(0.25, 'test');
  const control = quiet.state.sectorSim.field.nodes[SECTOR].danger;
  sectorSim._advanceModel(3, 'test');
  const controlLater = quiet.state.sectorSim.field.nodes[SECTOR].danger;

  const paid = raised - control;
  assert.ok(paid > 0.02, `the noisy sector should sit above its quiet twin, paid ${paid}`);
  assert.ok(paid <= 0.05 + 1e-9, `one episode pays at most the authored bound, paid ${paid}`);

  // The kernel reverts elevated danger toward the structural target — the mark decays.
  const laterGap = decayed - controlLater;
  assert.ok(laterGap < paid * 0.7, `the mark should decay toward baseline: ${paid} -> ${laterGap}`);
  assert.ok(laterGap >= -1e-9, 'decay does not push the worked sector below its quiet twin');
});

test('mining reports every crossing but pays the field once per cooldown window', () => {
  const ctx = makeCtx();
  mining.init(ctx);
  const heard = [];
  const paid = [];
  ctx.bus.on('danger:miningNoise', (p) => heard.push(p));
  ctx.bus.on('sectorsim:impulse', (p) => paid.push(p));

  ctx.state.player.miningNoise = 69;
  ctx.state.simTime = 1000;
  mining._updateMiningNoise(true, 0.2, ctx.state); // +1.6 -> 70.6 crosses the threshold
  assert.equal(heard.length, 1);
  assert.equal(heard[0].threshold, 70);
  assert.equal(paid.length, 1);
  assert.equal(paid[0].kind, 'mining_noise');
  assert.equal(paid[0].sectorId, SECTOR);

  // A re-cross inside the 45 s window still reports, but does not pay a second mark.
  ctx.state.player.miningNoise = 65;
  ctx.state.simTime = 1020;
  mining._updateMiningNoise(true, 0.2, ctx.state); // 66.6 — below threshold, no edge
  ctx.state.player.miningNoise = 69;
  mining._updateMiningNoise(true, 0.2, ctx.state); // crosses again, inside cooldown
  assert.equal(heard.length, 2, 'the meter still reports every crossing');
  assert.equal(paid.length, 1, 'the cooldown suppresses a second paid crossing');
});

test('a crossing with no live sector reports but pays nothing', () => {
  const ctx = makeCtx();
  ctx.state.world.currentSectorId = null;
  mining.init(ctx);
  const heard = [];
  const paid = [];
  ctx.bus.on('danger:miningNoise', (p) => heard.push(p));
  ctx.bus.on('sectorsim:impulse', (p) => paid.push(p));

  ctx.state.player.miningNoise = 69;
  ctx.state.simTime = 2000;
  mining._updateMiningNoise(true, 0.2, ctx.state);
  assert.equal(heard.length, 1, 'the meter crossing itself is still reported');
  assert.equal(paid.length, 0, 'no sector means nobody to pay the mark to');
});
