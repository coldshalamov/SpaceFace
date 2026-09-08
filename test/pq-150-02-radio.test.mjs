// PQ-150.02 — Radio that reacts.
// Characterization first: if eight distinct live classes already fire from
// existing events and captions already show, prove it on seed 15002 and stop.
// Headless. No second radio.

import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { BARK_SITUATIONS } from '../src/data/barks.js';
import { BAND_EVENT_KEYS, eligibleBandLines } from '../src/data/bandRadio.js';
import { bandRadio } from '../src/systems/bandRadio.js';
import { barkDirector } from '../src/systems/barkDirector.js';
import { voiceArbiter } from '../src/ui/voiceArbiter.js';

const SEED = 15002;

const EIGHT_CLASSES = Object.freeze([
  'scan',
  'warn',
  'demand-cargo',
  'attack',
  'flee',
  'reinforce',
  'taunt',
  'patrol-greeting',
]);

function boot(seed = SEED) {
  const sim = createSimulation({
    seed,
    systems: [barkDirector, bandRadio, voiceArbiter],
  });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.ui = { docked: false };
  state.world.currentSectorId = 'sector_helios_prime';
  state.world.sectors = {
    ...(state.world.sectors || {}),
    sector_helios_prime: {
      id: 'sector_helios_prime',
      factionId: 'faction_scn',
      tier: 0,
      security: 0.98,
      stations: [{ id: 'station_helios_prime', factionId: 'faction_scn' }],
    },
  };
  state.factions = { ...(state.factions || {}), faction_reach: { rep: 0 } };
  if (!state.settings) state.settings = {};
  if (!state.settings.accessibility) state.settings.accessibility = {};
  state.settings.accessibility.captions = true;

  const player = sim.spawn({
    type: 'ship',
    team: 0,
    pos: { x: 0, z: 0 },
    hull: 20,
    hullMax: 100,
    radius: 10,
    data: { defId: 'ship_kestrel' },
  });
  state.playerId = player.id;

  const voices = [];
  const surfaces = [];
  const captions = [];
  bus.on('barkDirector:voice', (payload) => voices.push({ ...payload }));
  bus.on('voice:surface', (payload) => surfaces.push({ ...payload }));
  bus.on('presentation:caption', (payload) => captions.push({ ...payload }));

  return { sim, state, bus, player, voices, surfaces, captions };
}

function spawnNpc(sim, spec) {
  return sim.spawn({
    type: 'ship',
    team: spec.team ?? 2,
    factionId: spec.factionId || 'faction_free',
    pos: spec.pos || { x: 80, z: 0 },
    hull: 80,
    hullMax: 80,
    radius: 8,
    data: {
      ai: {
        archetype: spec.archetype || 'patrol_lawman',
        fsm: spec.fsm || 'patrol',
        ...(spec.ai || {}),
      },
      combat: spec.combat || {},
      intent: spec.intent || { fire: false },
      ...(spec.data || {}),
    },
  });
}

function step(sim, seconds = SIM_DT) {
  sim.runTicks(Math.max(1, Math.ceil(seconds / SIM_DT)));
}

function classFromVoice(payload) {
  if (payload && payload.situation) return payload.situation;
  if (payload && payload.kind === 'cargoSpill') return 'cargo-spill';
  if (payload && payload.kind === 'band') return 'station-report';
  return null;
}

test('PQ-150.02 seed 15002: eight live chatter classes already fire; captions on', () => {
  const h = boot(SEED);
  const { sim, state, bus, player } = h;
  assert.deepEqual(BARK_SITUATIONS, EIGHT_CLASSES);
  assert.equal(state.settings.accessibility.captions, true, 'gameplay captions default on');
  assert.equal(state.meta.seed, SEED);

  const scan = spawnNpc(sim, {
    factionId: 'faction_scn',
    fsm: 'scan',
    pos: { x: 40, z: 0 },
    ai: { lawful: true },
    combat: { targetId: player.id },
  });
  const warn = spawnNpc(sim, {
    factionId: 'faction_scn',
    fsm: 'warn',
    pos: { x: 60, z: 0 },
    ai: { warning: true },
  });
  const pirate = spawnNpc(sim, {
    factionId: 'faction_reach',
    fsm: 'challenge',
    pos: { x: 80, z: 0 },
    team: 1,
    ai: { demandCargo: true },
  });
  const attacker = spawnNpc(sim, {
    factionId: 'faction_reach',
    fsm: 'attack',
    pos: { x: 100, z: 0 },
    team: 1,
    combat: { targetId: player.id },
    intent: { fire: true },
  });
  const taunter = spawnNpc(sim, {
    factionId: 'faction_reach',
    fsm: 'engage',
    pos: { x: 120, z: 0 },
    team: 1,
    ai: { taunting: true },
  });
  const runner = spawnNpc(sim, {
    factionId: 'faction_dmc',
    fsm: 'patrol',
    pos: { x: 140, z: 0 },
    data: { displayName: 'Lane Hauler' },
  });
  const caller = spawnNpc(sim, {
    factionId: 'faction_scn',
    fsm: 'patrol',
    pos: { x: 160, z: 0 },
  });
  spawnNpc(sim, {
    factionId: 'faction_free',
    fsm: 'patrol',
    pos: { x: 180, z: 0 },
    data: { barkSituation: 'patrol-greeting' },
  });

  step(sim);
  bus.emit('ai:flee', { entityId: runner.id });
  bus.emit('ai:reinforcementScheduled', { entityId: caller.id });
  bus.emit('freight:cargoSpilled', {
    carrierId: runner.id,
    ownerId: 'lane_mira_bluepack',
    ownerName: 'Mira Bluepack',
    originId: 'station_ceres',
    destinationId: 'station_helios_prime',
    cause: 'drive_disabled',
    role: 'hauler',
    isCivilian: true,
  });
  bus.emit('freight:loss', { killerId: player.id, freighterId: runner.id });
  bus.emit('mission:completed', { type: 'patrol_clear' });
  bus.emit('mission:completed', {
    source: 'economyContract',
    type: 'cargo_delivery',
    causeTag: 'infrastructure_disruption',
  });
  bus.emit('dock:docked', {});
  step(sim);

  const barkClasses = new Set(
    h.voices.map(classFromVoice).filter((name) => EIGHT_CLASSES.includes(name)),
  );

  bus.emit('band:tune', { channelId: 'the_margin' });
  const radio = sim.registry.get('bandRadio');
  state.bandRadio.identPending = false;
  state.bandRadio.nextLineAtS = 0;
  const bandTexts = [];
  for (let i = 0; i < 24; i += 1) {
    state.simTime += 20;
    state.bandRadio.nextLineAtS = 0;
    radio.update(0, state);
    step(sim, 0);
  }
  for (const row of h.surfaces) {
    if (row.channel === 'band' && row.text) bandTexts.push(row.text);
  }

  const eventKeys = state.bandRadio.eventKeys || {};
  const liveEventKeys = BAND_EVENT_KEYS.filter((key) => eventKeys[key]);
  const eventLines = eligibleBandLines('the_margin', { eventKeys, reachRep: 0 })
    .filter((line) => line.eventKey && eventKeys[line.eventKey]);
  const spokenEventLines = eventLines.filter((line) => bandTexts.some((text) => text === line.text));

  const allClasses = new Set(barkClasses);
  if (h.voices.some((row) => row.kind === 'cargoSpill' || row.reaction)) allClasses.add('cargo-spill');
  for (const key of liveEventKeys) allClasses.add(key);
  if (spokenEventLines.length) allClasses.add('station-report');

  const captionOn = state.settings.accessibility.captions === true;
  const captionedSurfaces = h.surfaces.filter((row) => row && row.text);
  const barkOnFloor = captionedSurfaces.some((row) => row.channel === 'bark');
  const bandOnFloor = captionedSurfaces.some((row) => row.channel === 'band');

  console.log(`PQ-150.02 SEED ${SEED}`);
  console.log(`EIGHT_CLASS_NAMES ${EIGHT_CLASSES.join(',')}`);
  console.log(`BARK_CLASSES_LIVE ${[...barkClasses].sort().join(',') || '(none)'}`);
  console.log(`BARK_CLASS_COUNT ${barkClasses.size}`);
  console.log(`BAND_EVENT_KEYS_LATCHED ${liveEventKeys.join(',') || '(none)'}`);
  console.log(`BAND_EVENT_LINES_SPOKEN ${spokenEventLines.map((line) => line.id).join(',') || '(none)'}`);
  console.log(`ALL_LIVE_CLASSES ${[...allClasses].sort().join(',')}`);
  console.log(`ALL_LIVE_COUNT ${allClasses.size}`);
  console.log(`CAPTIONS_SETTING ${captionOn}`);
  console.log(`VOICE_SURFACES ${captionedSurfaces.length}`);
  console.log(`PRESENTATION_CAPTIONS ${h.captions.length}`);
  console.log(`FLOOR_BARK ${barkOnFloor} FLOOR_BAND ${bandOnFloor}`);

  assert.ok(
    scan.id && warn.id && pirate.id && attacker.id && taunter.id,
    'contact ships spawned',
  );
  assert.equal(barkClasses.size, 8, `expected 8 bark classes, got ${barkClasses.size}: ${[...barkClasses]}`);
  for (const name of EIGHT_CLASSES) {
    assert.ok(barkClasses.has(name), `missing live class ${name}`);
  }
  assert.equal(liveEventKeys.length, 4, 'four Band deed keys latch from existing events');
  assert.equal(spokenEventLines.length, 4, 'Band speaks the four deed-keyed station reports');
  assert.ok(captionOn, 'captions setting on');
  assert.ok(captionedSurfaces.length >= 8, 'voice:surface is the existing caption floor');
  assert.ok(barkOnFloor && bandOnFloor, 'bark and Band both caption on the one-voice floor');
  assert.equal(
    h.captions.length,
    0,
    'radio stays on the one-voice floor; presentation:caption is a second surface',
  );
});
