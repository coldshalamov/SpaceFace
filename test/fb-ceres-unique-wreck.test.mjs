// FB-038 — the Ceres tender is rumoured, fixed, and resolved on one branch. The D1–D16 list stays sixteen.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createSimulation } from '../src/core/sim.js';
import {
  UNIQUE_WRECKS,
  uniqueWreckById,
  validateUniqueWreckRegistry,
} from '../src/data/uniqueWrecks.js';
import { economy } from '../src/systems/economy.js';
import { factions } from '../src/systems/factions.js';
import { uniqueWrecks } from '../src/systems/uniqueWrecks.js';
import { traffic } from '../src/systems/traffic.js';

const WRECK = 'wreck_dmc_refinery_tender';
const SEED = 4242;

test('the closed reservation stays D1 through D16 and the tender is still a fresh Ceres wreck', () => {
  assert.equal(UNIQUE_WRECKS.length, 16);
  assert.equal(validateUniqueWreckRegistry().ok, true);
  const def = uniqueWreckById(WRECK);
  assert.equal(def.wreckClass, 'fresh');
  assert.equal(def.sectorId, 'sector_ceres_belt');
  assert.equal(def.bearingSourceRef, 'bar.station_ceres.refinery_tender');
  const strip = def.decision.choices.find((choice) => choice.id === 'strip');
  const returned = def.decision.choices.find((choice) => choice.id === 'return_manifest');
  assert.equal(strip.credits, 4200);
  assert.equal(strip.repDelta, 0);
  assert.equal(returned.credits, 0);
  assert.equal(returned.repDelta, 8);
  const script = readFileSync(new URL('../src/systems/uniqueWreckEncounterScripts.js', import.meta.url), 'utf8');
  const body = script.slice(script.indexOf('function chooseCeresRefineryTender'));
  assert.equal(body.includes('grantCredits'), false);
  assert.equal(body.includes('repDelta'), false);
});

test('rumour, a scan, and one choice pay only that branch and change the seam', () => {
  const sim = createSimulation({ seed: SEED, systems: [uniqueWrecks, economy, factions] });
  const { state, bus } = sim;
  state.world.currentSectorId = 'sector_ceres_belt';
  state.player.credits = 1000;
  const grants = [];
  const reps = [];
  bus.on('economy:grantCredits', (payload) => grants.push(payload));
  bus.on('faction:repDelta', (payload) => reps.push(payload));
  bus.emit('uniqueWreck:rumorHeard', {
    wreckId: WRECK,
    sourceRef: 'bar.station_ceres.refinery_tender',
    channelId: 'bar',
    text: 'A refinery tender went dark on the Ceres seam.',
  });
  const rumor = state.player.uniqueWrecks.bearings[WRECK];
  assert.equal(rumor.phase, 'rumored');
  bus.emit('scan:pulse', { pos: rumor.exactPos });
  const fixed = state.player.uniqueWrecks.bearings[WRECK];
  assert.equal(fixed.phase, 'fixed');
  let wreckEntity = null;
  for (const entity of state.entities.values()) {
    if (entity && entity.data && entity.data.uniqueWreckId === WRECK) wreckEntity = entity;
  }
  assert.ok(wreckEntity, 'the scan puts the tender in the sector');
  bus.emit('salvage:completed', { wreckId: wreckEntity.id });
  assert.equal(state.player.uniqueWrecks.bearings[WRECK].phase, 'decision');
  bus.emit('uniqueWreck:choose', { wreckId: WRECK, choiceId: 'strip', source: 'test' });
  assert.equal(state.player.uniqueWrecks.bearings[WRECK].phase, 'salvaged');
  assert.equal(grants.length, 1);
  assert.equal(grants[0].amount, 4200);
  assert.equal(reps.length, 0);
  traffic.state = state;
  traffic._onCeresTenderWreckResolved({ wreckId: WRECK, choiceId: 'strip' });
  assert.equal(state.traffic.ceresPocketEffects.tenderJob, 'quiet');
  assert.ok(state.traffic.ceresPocketEffects.salvorQuietUntil >= state.simTime + 600);
  sim.dispose();
});
