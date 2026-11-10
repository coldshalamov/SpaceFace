// test/wf13-sector-arrival-identity.test.mjs — WF-13 sector arrival identity family.
//
// THE VISION SENTENCE THESE ASSERTIONS SERVE (design/VISION.md Part II, "Every place needs a reason
// to exist" — the same sentence test/sector-identity.test.mjs serves for the eye):
//
//   "A player recognises Ceres from thirty seconds of activity and Helios from thirty seconds of
//    different activity — not from a colour grade."
//
// The audio lane's share of that sentence is the arrival: the one moment the game itself points at
// the place. Before this family, every sector announced itself with ONE shared voice (and its
// sample body was the lane-lock recording pitched down) — and worse, the travel-audio floor claim
// ate the identity receipt entirely, because both arrival cues carried the same sourceEvent. These
// assertions pin the whole chain end to end, on the real orchestrator + adapter + bus, no
// AudioContext needed (pure routing characterization, house style of audio-ceres-cue.test.mjs):
//
//   sector:enter -> presentationOrchestrator ('travel.arrival.sector_identity', targetId=sector)
//                -> presentationAdapters (SECTOR_ARRIVAL_CUES[sectorId], first_visit/return gain)
//                -> audio:cue with a live sfx_arrival_<sector> recipe id
//
// Seed: the routing below is deterministic (fixed tick numbers, no rng on the path); the state uses
// the repo default proof seed 4242.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { RECIPES, SAMPLE_BINDINGS, SECTOR_ARRIVAL_CUES } from '../src/data/audioRecipes.js';
import { resolveAudioCueRecipeId, AUDIO_CUE_TO_RECIPE } from '../src/audio/audioSystem.js';
import { SAMPLE_MANIFEST, resolveSampleBinding } from '../src/audio/sampleLibrary.js';
import { SECTOR_BEDS, resolveSectorBed } from '../src/audio/themeMatrix.js';
import { SECTORS } from '../src/data/sectors.js';
import { presentationOrchestrator } from '../src/systems/presentationOrchestrator.js';
import { presentationAdapters } from '../src/systems/presentationAdapters.js';
import { createBus } from '../src/core/eventBus.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SEED = 4242;

const ARRIVAL_IDS = Object.values(SECTOR_ARRIVAL_CUES);

// ── 1. The family as data ─────────────────────────────────────────────────────────────────────────

test('every live sector has exactly one arrival voice, and the table names only live sectors', () => {
  const liveSectorIds = SECTORS.map((sector) => sector.id);
  for (const sectorId of liveSectorIds) {
    assert.ok(SECTOR_ARRIVAL_CUES[sectorId], `live sector "${sectorId}" has no arrival voice`);
  }
  assert.deepEqual(
    Object.keys(SECTOR_ARRIVAL_CUES).sort(),
    [...liveSectorIds].sort(),
    'SECTOR_ARRIVAL_CUES must cover exactly the live map — no dead knob, no orphan voice',
  );
});

test('every arrival voice is a live engine-bus recipe that resolves without touching the cue map', () => {
  const recipeIds = new Set(RECIPES.map((recipe) => recipe.id));
  for (const id of ARRIVAL_IDS) {
    assert.ok(recipeIds.has(id), `${id} is not a live RECIPES id`);
    const recipe = RECIPES.find((entry) => entry.id === id);
    assert.equal(recipe.category, 'engine', `${id} rides the engine bus with the travel family`);
    assert.ok(recipe.gainEnvelope && Number.isFinite(recipe.gainEnvelope.release),
      `${id} has a finite one-shot envelope`);
    // The cue id IS the recipe id, so it resolves through AUDIO_RECIPE_BY_ID directly — the unit
    // never needed an AUDIO_CUE_TO_RECIPE entry (that table is not this unit's to edit).
    assert.equal(resolveAudioCueRecipeId(id), id, `${id} resolves as its own recipe`);
    assert.ok(!AUDIO_CUE_TO_RECIPE[id], `${id} must not depend on the audio system's cue map`);
  }
});

test('each arrival recipe is rooted on its sector bed tone, so the stinger melts into the bed', () => {
  for (const [sectorId, recipeId] of Object.entries(SECTOR_ARRIVAL_CUES)) {
    // resolveSectorBed is the authority for BOTH kinds of bed: the authored SECTOR_BEDS rows and
    // the deterministic hashed bed every frontier sector gets. Rooting the arrival chord on this
    // exact tone is what makes the stinger melt into the bed that is already playing.
    const bed = resolveSectorBed(sectorId);
    assert.ok(bed, `${sectorId} has no sector bed to root on`);
    const recipe = RECIPES.find((entry) => entry.id === recipeId);
    const ratio = recipe.baseFreq / bed.hzA;
    const near = (value) => Math.abs(ratio - value) < 0.06;
    assert.ok(near(1) || near(1.5) || near(2),
      `${recipeId} root ${recipe.baseFreq}Hz is unrelated to the ${sectorId} bed root ${bed.hzA}Hz ` +
      `(ratio ${ratio.toFixed(2)}) — the arrival chord must land on the bed's own tone`);
  }
});

test('ten sectors, ten different voices — synth signatures and designed bodies all distinct', () => {
  const signature = (recipe) => JSON.stringify([
    recipe.wave, recipe.baseFreq, recipe.freqSweep, recipe.filterType, recipe.filterFreq,
    recipe.lfoRate || 0, recipe.gainEnvelope.release,
  ]);
  const synthSignatures = new Set();
  const sampleIds = new Set();
  for (const recipeId of ARRIVAL_IDS) {
    const recipe = RECIPES.find((entry) => entry.id === recipeId);
    synthSignatures.add(signature(recipe));
    const binding = resolveSampleBinding(recipeId);
    assert.ok(binding, `${recipeId} has no designed sample body`);
    assert.ok(SAMPLE_MANIFEST.has(binding.sampleId), `${recipeId} body "${binding.sampleId}" is not in the manifest`);
    assert.ok(existsSync(path.join(ROOT, binding.file)),
      `${recipeId} body file is missing on disk: ${binding.file}`);
    sampleIds.add(binding.sampleId);
  }
  assert.equal(synthSignatures.size, ARRIVAL_IDS.length,
    'two sectors share a synth voice — the arrival chord no longer names the place');
  assert.equal(sampleIds.size, ARRIVAL_IDS.length,
    'two sectors share one recording — the designed bodies must be per-sector');
});

test('every arrival binding names a live recipe and a manifest sample (house sync law)', () => {
  const recipeIds = new Set(RECIPES.map((recipe) => recipe.id));
  for (const [recipeId, binding] of Object.entries(SAMPLE_BINDINGS)) {
    if (!recipeId.startsWith('sfx_arrival_')) continue;
    assert.ok(recipeIds.has(recipeId), `binding names unknown recipe "${recipeId}"`);
    assert.ok(SAMPLE_MANIFEST.has(binding.id), `binding "${recipeId}" names unknown sample "${binding.id}"`);
  }
});

// ── 2. The family on the live route ───────────────────────────────────────────────────────────────

function createHarness() {
  const state = {
    tick: 1000,
    simTime: 1000 / 60,
    mode: 'flight',
    playerId: 1,
    player: { heat: 0 },
    settings: { video: {}, accessibility: {} },
    world: { currentSectorId: 'sector_helios_prime' },
    entities: new Map(),
    entityList: [],
  };
  const bus = createBus();
  return { state, bus, seed: SEED };
}

function wire(h) {
  const presenter = Object.create(presentationOrchestrator);
  const adapters = Object.create(presentationAdapters);
  const seen = { audio: [] };
  h.bus.on('audio:cue', (p) => seen.audio.push(p));
  presenter.init({ state: h.state, bus: h.bus });
  adapters.init({ state: h.state, bus: h.bus });
  return { presenter, adapters, seen };
}

function enterSector(h, sectorId, { firstVisit = false, continuous = true } = {}) {
  h.bus.emit('sector:enter', {
    sectorId,
    sector: SECTORS.find((sector) => sector.id === sectorId) || null,
    entryPoint: { x: 0, z: 0 },
    firstVisit,
    continuous,
  });
  h.bus.flush();
}

test('a first gate jump into Ceres announces Ceres — arrival AND identity both audible', () => {
  const h = createHarness();
  const { presenter, adapters, seen } = wire(h);
  try {
    // The gate-jump route: charge, commit, then land in the sector (non-continuous entry). The
    // tunnel lasts JUMPING_DURATION = 1.2 s (world.js), so the arrival lands many ticks AFTER the
    // jump receipts — the same-tick audio lane budget must not be part of this scenario, exactly
    // as on the live route.
    h.bus.emit('jump:chargeStart', { targetSectorId: 'sector_ceres_belt', via: 'gate' });
    h.bus.emit('jump:start', { from: 'sector_helios_prime', to: 'sector_ceres_belt', via: 'gate' });
    h.bus.flush();
    h.state.tick += Math.ceil(1.2 * 60) + 1; // the tunnel
    h.state.simTime = h.state.tick / 60;
    h.bus.emit('sector:enter', {
      sectorId: 'sector_ceres_belt',
      sector: SECTORS.find((sector) => sector.id === 'sector_ceres_belt'),
      entryPoint: { x: 0, z: 0 },
      firstVisit: true,
      continuous: false,
    });
    h.bus.flush();
    const ids = seen.audio.map((cue) => cue.id);
    assert.ok(ids.includes('presentation.travel.arrival'),
      'the oriented arrival landing still speaks (the shared floor claim must not eat it)');
    assert.ok(ids.includes('sfx_arrival_ceres_belt'),
      `Ceres' own arrival voice must reach the speakers (got [${ids.join(', ')}])`);
    const identity = seen.audio.find((cue) => cue.id === 'sfx_arrival_ceres_belt');
    assert.ok(identity.gain > 0.7, `a FIRST visit announces fuller, got gain ${identity.gain}`);
  } finally {
    presenter.dispose();
    adapters.dispose();
  }
});

test('a return visit to the same sector is a quieter nod on the same sector voice', () => {
  const h = createHarness();
  const { presenter, adapters, seen } = wire(h);
  try {
    enterSector(h, 'sector_ceres_belt', { firstVisit: false });
    const identity = seen.audio.find((cue) => cue.id === 'sfx_arrival_ceres_belt');
    assert.ok(identity, 'the return visit still names the place');
    assert.ok(identity.gain < 0.6 && identity.gain > 0.4,
      `a return is a nod, not a fanfare, got gain ${identity.gain}`);
  } finally {
    presenter.dispose();
    adapters.dispose();
  }
});

test('corridor entries, gate jumps, first visits and returns all carry the sector voice', () => {
  const h = createHarness();
  const { presenter, adapters, seen } = wire(h);
  try {
    let expected = [];
    for (const sectorId of Object.keys(SECTOR_ARRIVAL_CUES)) {
      h.state.tick += 7;
      enterSector(h, sectorId, { firstVisit: true, continuous: true });
      expected.push(SECTOR_ARRIVAL_CUES[sectorId]);
    }
    const identities = seen.audio.filter((cue) => cue.id.startsWith('sfx_arrival_'));
    assert.deepEqual(
      identities.map((cue) => cue.id),
      expected,
      'ten sectors must arrive as ten different places, in order, every one of them audible',
    );
  } finally {
    presenter.dispose();
    adapters.dispose();
  }
});

test('an unknown sector falls back to the shared identity voice — the honest default', () => {
  const h = createHarness();
  const { presenter, adapters, seen } = wire(h);
  try {
    enterSector(h, 'sector_nowhere', { firstVisit: true });
    const ids = seen.audio.map((cue) => cue.id);
    assert.ok(ids.includes('presentation.travel.sector_identity'),
      `unknown sector must keep the shared identity voice (got [${ids.join(', ')}])`);
    assert.ok(!ids.some((id) => id.startsWith('sfx_arrival_')),
      'no sector voice may fire for a sector that has none');
  } finally {
    presenter.dispose();
    adapters.dispose();
  }
});

test('a non-arrival travel cue still maps through the static table (no regression)', () => {
  const h = createHarness();
  const { presenter, adapters, seen } = wire(h);
  try {
    h.state.tick += 3;
    h.bus.emit('jump:chargeStart', { targetSectorId: 'sector_veil_nebula', via: 'gate' });
    h.bus.flush();
    const ids = seen.audio.map((cue) => cue.id);
    assert.ok(ids.includes('presentation.travel.gate_align'),
      `jump alignment still speaks through the static map (got [${ids.join(', ')}])`);
    assert.ok(!ids.some((id) => id.startsWith('sfx_arrival_')),
      'charging at a gate must not pre-announce the destination');
  } finally {
    presenter.dispose();
    adapters.dispose();
  }
});
