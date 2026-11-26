// SEED-SW-13 — weapon levels are RETIRED from Swarm (04_SWARM.md §5; release list 2026-11-19:
// "Swarm still adds 12 % fire rate per weapon level"). A level was stat soup: every gun got
// faster the same way, which erased the damage-or-kick trade each gun is built on. The shop no
// longer sells a level row; a level already recorded on a run still reads back (old runs keep
// what they flew), so the reader stays.
// Seed 4242.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { TECH_NODES } from '../src/data/tech.js';
import { weaponLevelOf, swarmWeaponRofScale, SWARM_WEAPON_LEVEL_KIND } from '../src/data/swarmWeaponLevels.js';
import { economy } from '../src/systems/economy.js';
import { runSession } from '../src/systems/runSession.js';
import { ships } from '../src/systems/ships.js';
import { survivalDraft } from '../src/systems/survivalDraft.js';

function shopRound(wave = 5) {
  const state = createGameState(4242);
  const bus = createBus();
  const registry = { get: (name) => ({ ships, economy, survivalDraft })[name] };
  const ctx = { state, bus, registry, helpers: {} };
  economy.init(ctx); ships.init(ctx); economy.newGame(); ships.newGame();
  state.player.researchedNodes = TECH_NODES.map((n) => n.id);
  ships.buyShip({ defId: 'ship_hornet', grant: true, setActive: true });
  runSession.init(ctx); survivalDraft.init(ctx);
  bus.emit('run:beginRequested', { kind: 'survival', ruleset: 'swarm', seed: 4242, arenaId: 'helios_core' });
  let phase = 'loadout';
  for (const next of ['arena_intro', 'wave_intro', 'active', 'cleanup']) {
    bus.emit('run:transitionRequested', { expectedPhase: phase, nextPhase: next }); phase = next;
  }
  state.run.wave = wave;
  bus.emit('run:awardRequested', { credits: 5000, reason: 'round_loot' });
  bus.emit('run:transitionRequested', { expectedPhase: 'cleanup', nextPhase: 'draft' });
  return { state, bus };
}

test('the Swarm shop sells no weapon level — guns keep their trade-off', () => {
  const h = shopRound(5);
  assert.equal(h.state.run.phase, 'draft');
  const offers = survivalDraft.currentOffers();
  assert.ok(offers.length > 0, 'the shop is stocked');
  assert.equal(offers.filter((offer) => offer.service === 'weapon_level').length, 0,
    'no "+fire rate" level row is for sale (release list 2026-11-19)');
});

test('a level already on an old run still reads back, so a resumed run does not change', () => {
  const rows = [{ kind: SWARM_WEAPON_LEVEL_KIND, defId: 'wpn_pulse_laser_s', level: 2 }];
  assert.equal(weaponLevelOf(rows, 'wpn_pulse_laser_s'), 2);
  assert.ok(swarmWeaponRofScale(2) > 1);
});
