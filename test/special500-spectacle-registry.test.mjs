// special-500 Phase 2: the spectacle leg family. The director emits one
// 'special500:spectacle' per spectacle-channel firing; the registered
// special500Spectacle system resolves the id against the presentation registry
// (src/data/special500/spectacleLegs.js) and plays the authored moment through the
// existing owner seams (presentation:vfxCue / news:publish). These proofs pin: the
// registry validates clean against the live catalog, the manifest rows, the director's
// exactly-once emission (refire + yearly re-arm), both pilot rows mapping to their
// templates with params through the owner contract, the Echo Wreck's simTime-modulo
// loop with its dark half, unknown-id degradation, and reduced-motion riding the cue
// payload (the owner seam decides the reduced variant — no bypass here). The batch-5
// rows add the bellVoice template (existing audio recipes through the audio owner's
// audio:cue admission) and pin its contract, station-anchor gating, the Slow Kiss's
// one-time impact minute, Ring Rain's surge cadence, the Quiet Night's center-minute
// duck, the 40-Day Chord's stacked house keys, and All the Bells' toll cadence.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSimHost } from '../scripts/lib/simWorkerHost.mjs';

import {
  PRODUCTION_INIT_ORDER,
  PRODUCTION_UPDATE_ORDER,
  getDeclaredSystemClock,
  validateSystemClockDeclarations,
} from '../src/runtime/authoritativeSystemManifest.js';
import { getNodeSystemFactoryTable } from '../src/runtime/nodeSystemFactoryTable.js';
import { createRegistry } from '../src/core/registry.js';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { SPECIAL500_ALL } from '../src/data/special500/index.js';
import { SPECTACLE_LEGS, SPECTACLE_TEMPLATE_IDS, validateSpectacleLegs } from '../src/data/special500/spectacleLegs.js';
import { special500Director } from '../src/systems/special500Director.js';
import { special500Spectacle } from '../src/systems/special500Spectacle.js';
import { zonesForSector } from '../src/data/sectorZones.js';
import { SECTORS } from '../src/data/sectors.js';
import { RECIPES } from '../src/data/audioRecipes.js';

const CAL_DAY_S = 600;
const CAL_YEAR_S = 40 * CAL_DAY_S; // worldCalendar: a 40-day year
// SP1-101 fires on dayOfYear 13 inside windowS [240, 255]; 245 is mid-window, year 0.
const GHOST_AT = 13 * CAL_DAY_S + 245;
const CHARON = 'sector_charon_expanse';
const IO_REACH = 'sector_io_reach';

// Recording stub bus: same on/emit shape the registry hands systems, with the real
// bus's synchronous dispatch — an emit reaches subscribers inline and is recorded.
function stubBus() {
  const listeners = new Map();
  const events = [];
  return {
    events,
    listeners,
    emit(name, payload) {
      events.push({ name, payload });
      for (const fn of listeners.get(name) || []) fn(payload);
    },
    on(name, fn) {
      if (!listeners.has(name)) listeners.set(name, []);
      listeners.get(name).push(fn);
      return () => {
        const rows = listeners.get(name) || [];
        const i = rows.indexOf(fn);
        if (i >= 0) rows.splice(i, 1);
      };
    },
    deliver(name, payload) { for (const fn of listeners.get(name) || []) fn(payload); },
    of: (name) => events.filter((e) => e.name === name),
  };
}

function fixtureState({ simTime = 0, sectorId = null, settings = null } = {}) {
  return {
    simTime,
    tick: Math.floor(simTime * 60),
    meta: { seed: 20261104 },
    story: { flags: {} },
    world: {
      currentSectorId: sectorId,
      activeSector: { stations: [], pois: [], fields: [], hazards: [], gates: [] },
    },
    player: { sectorId },
    entities: new Map(),
    settings: settings || { video: {}, accessibility: {} },
  };
}

function spectaclesFor(bus, id) {
  return bus.of('special500:spectacle').filter((e) => e.payload && e.payload.id === id);
}

test('the spectacle registry validates clean against the live catalog', () => {
  assert.deepEqual(validateSpectacleLegs(SPECIAL500_ALL), []);
  // The two pilot rows exist and name known templates only.
  assert.ok(SPECTACLE_LEGS['SP1-101'], 'The Scheduled Ghost has a row');
  assert.ok(SPECTACLE_LEGS['SP3-127'], 'The Echo Wreck has a row');
  for (const row of Object.values(SPECTACLE_LEGS)) {
    for (const step of row.steps) {
      assert.ok(SPECTACLE_TEMPLATE_IDS.includes(step.template), `template ${step.template} is documented`);
    }
  }
  // Anchors are real authored places: zone anchors resolve in their sector's zone data,
  // station anchors in the sector's authored station rows (both static data, checked here
  // so a typo'd id can never pass validation silently).
  for (const [id, row] of Object.entries(SPECTACLE_LEGS)) {
    const a = row.anchor;
    if (a.zoneId) {
      const zone = zonesForSector(a.sectorId).find((z) => z.id === a.zoneId);
      assert.ok(zone, `${id} anchor zone ${a.zoneId} resolves in ${a.sectorId}`);
    } else if (a.stationId) {
      const sector = SECTORS.find((s) => s.id === a.sectorId);
      const station = sector && (sector.stations || []).find((st) => st.id === a.stationId);
      assert.ok(station, `${id} anchor station ${a.stationId} resolves in ${a.sectorId}`);
    } else {
      assert.fail(`${id} anchor names neither a zone nor a station`);
    }
  }
  // Every bellVoice step voices a recipe the audio owner actually ships.
  const recipeIds = new Set(RECIPES.map((r) => r.id));
  for (const [id, row] of Object.entries(SPECTACLE_LEGS)) {
    for (const step of row.steps) {
      if (step.template === 'bellVoice') {
        assert.ok(recipeIds.has(step.params.recipe), `${id} bellVoice recipe ${step.params.recipe} is live`);
      }
    }
  }
});

test('the manifest registers the spectacle system once on the calendar clock beside the director', () => {
  const once = (list, id) => list.filter((x) => x === id).length;
  assert.equal(once(PRODUCTION_INIT_ORDER, 'special500Spectacle'), 1);
  assert.equal(once(PRODUCTION_UPDATE_ORDER, 'special500Spectacle'), 1);
  assert.equal(getDeclaredSystemClock('special500Spectacle'), 'calendar');
  assert.deepEqual(validateSystemClockDeclarations(), []);
  // Init after the director (the subscription exists before the sweep that emits),
  // update after the sweep on the same tick so atS:0 beats land with the noticing line.
  assert.ok(PRODUCTION_INIT_ORDER.indexOf('special500Spectacle') > PRODUCTION_INIT_ORDER.indexOf('special500'));
  assert.ok(PRODUCTION_UPDATE_ORDER.indexOf('special500Spectacle') > PRODUCTION_UPDATE_ORDER.indexOf('special500'));
  assert.ok(PRODUCTION_UPDATE_ORDER.indexOf('special500Spectacle') < PRODUCTION_UPDATE_ORDER.indexOf('voiceArbiter'));
  // Both lookup tables resolve it.
  assert.equal(getNodeSystemFactoryTable().get('special500Spectacle')?.name, 'special500Spectacle');
  const registry = createRegistry({ state: createGameState(11), bus: createBus(), helpers: {}, applyRuntimeFeatures: false });
  assert.equal(registry.get('special500Spectacle')?.name, 'special500Spectacle');
});

test('the director emits special500:spectacle exactly once for a spectacle firing, and not for other channels', () => {
  const bus = stubBus();
  const state = fixtureState({ simTime: GHOST_AT, sectorId: CHARON });
  special500Director.init({ bus });
  special500Director.update(0.5, state);
  // The ghost fired: one identity emission carrying id + sector, plus the unchanged
  // comms:log noticing line (from the entry's authored payload).
  const ghosts = spectaclesFor(bus, 'SP1-101');
  assert.equal(ghosts.length, 1, 'exactly one spectacle emission for the firing');
  assert.deepEqual(ghosts[0].payload, { id: 'SP1-101', sectorId: CHARON });
  const ghostText = SPECIAL500_ALL.find((e) => e.id === 'SP1-101').payload.text;
  const logs = bus.of('comms:log').filter((e) => e.payload && e.payload.text === ghostText);
  assert.equal(logs.length, 1, 'the comms:log tell still fires alongside (other entries may share the sweep)');
  // Refire in the same window: the fired-flag gate blocks a second emission.
  special500Director.update(0.5, state);
  special500Director.update(0.5, state);
  assert.equal(spectaclesFor(bus, 'SP1-101').length, 1, 'no refire inside the same calendar year');
  // Yearly re-arm: the next year's same minute fires once more.
  state.simTime = GHOST_AT + CAL_YEAR_S;
  state.tick = Math.floor(state.simTime * 60);
  special500Director.update(0.5, state);
  assert.equal(spectaclesFor(bus, 'SP1-101').length, 2, 'the recurring ghost fires again the next year, once');
  // A non-spectacle channel never emits the identity event.
  const commsEntry = SPECIAL500_ALL.find((e) => e.channel === 'comms' && !e.dormant);
  assert.ok(commsEntry, 'the catalog has a comms entry');
  bus.events.length = 0;
  special500Director.fire(commsEntry, state, { lastSectorId: CHARON }, 0);
  assert.equal(bus.of('special500:spectacle').length, 0, 'direct fire of a comms entry emits no spectacle identity');
});

test('the Scheduled Ghost row plays through the owner seams: echo ring, running lights, and a logged advisory', () => {
  const bus = stubBus();
  special500Spectacle.init({ bus });
  const state = fixtureState({ simTime: GHOST_AT, sectorId: CHARON });
  bus.emit('special500:spectacle', { id: 'SP1-101', sectorId: CHARON });
  // The firing drains into an activation this tick; the authored beats then play as
  // simTime advances through the row's eight-second window.
  special500Spectacle.update(1 / 60, state);
  for (let t = 0.25; t <= 8; t += 0.25) {
    state.simTime = GHOST_AT + t;
    state.tick = Math.floor(state.simTime * 60);
    special500Spectacle.update(1 / 60, state);
  }

  const zone = zonesForSector(CHARON).find((z) => z.id === 'zone_charon_refinery');
  // Sensor painting: one delayed echo ring in the fields system's thermal-mark contract.
  const rings = bus.of('presentation:vfxCue').filter((e) => e.payload && e.payload.id === 'thermal.mark');
  assert.equal(rings.length, 1, 'one echo ring (the sensors paint)');
  const ring = rings[0].payload;
  assert.equal(ring.kind, 'thermalMark');
  assert.equal(ring.color, '#8fe0a8');
  assert.equal(ring.radius, 90);
  assert.equal(ring.life, 2.2);
  assert.equal(ring.particles, 0);
  assert.equal(ring.lights, 0);
  assert.ok(Math.hypot(ring.position.x - zone.center.x, ring.position.z - zone.center.z) < 1e-9,
    'the echo rings the authored anchor');
  // Running lights: three cue-light points walking the lane (row bearing), lights only.
  const lights = bus.of('presentation:vfxCue').filter((e) => e.payload && e.payload.id === 'special500.light');
  assert.equal(lights.length, 3, 'three running-light beats for the line-ahead convoy');
  for (const cue of lights) {
    assert.equal(cue.payload.lights, 1);
    assert.equal(cue.payload.particles, 0);
    assert.equal(cue.payload.lane, 'special500');
    assert.equal(cue.payload.flashReduced, false, 'default settings ride the cue as unreduced');
  }
  // Project each light back onto the row bearing: the authored lane offsets fall out exactly.
  const bearing = SPECTACLE_LEGS['SP1-101'].bearingRad;
  const offsets = lights.map((e) => {
    const dx = e.payload.position.x - zone.center.x;
    const dz = e.payload.position.z - zone.center.z;
    return Math.round(dx * Math.cos(bearing) + dz * Math.sin(bearing));
  });
  assert.deepEqual(offsets.sort((a, b) => a - b), [-36, 0, 36], 'the lights walk the lane on the row bearing');
  // The advisory board logs the arrival it cannot see — on the news wire, with provenance.
  const advisories = bus.of('news:publish');
  assert.equal(advisories.length, 1, 'one traffic advisory');
  const advisory = advisories[0].payload;
  assert.match(advisory.text, /nine-hull convoy/);
  assert.match(advisory.text, /never been late/);
  assert.equal(advisory.source, 'charon-traffic');
  assert.equal(advisory.sourceRef, 'special500:SP1-101');
  // No double-play: later ticks replay nothing (play-once row, retired after the span).
  const before = bus.events.length;
  state.simTime = GHOST_AT + 9;
  special500Spectacle.update(1 / 60, state);
  state.simTime = GHOST_AT + 10;
  special500Spectacle.update(1 / 60, state);
  assert.equal(bus.events.length, before, 'each beat plays once per firing');
});

test('the Echo Wreck loop replays on pure simTime modulo and holds dark forty seconds', () => {
  const bus = stubBus();
  special500Spectacle.init({ bus });
  const firedAt = 100000;
  const state = fixtureState({ simTime: firedAt, sectorId: IO_REACH });
  bus.emit('special500:spectacle', { id: 'SP3-127', sectorId: IO_REACH });
  special500Spectacle.update(1 / 60, state); // the firing drains into an activation here
  const countLights = () => bus.of('presentation:vfxCue').filter((e) => e.payload && e.payload.id === 'special500.light').length;
  const countRings = () => bus.of('presentation:vfxCue').filter((e) => e.payload && e.payload.id === 'thermal.mark').length;

  const step = (simTime) => {
    state.simTime = simTime;
    state.tick = Math.floor(simTime * 60);
    special500Spectacle.update(1 / 60, state);
  };
  // Cycle 1: the scan sweep rings once inside the first seconds...
  step(firedAt + 0.8);
  assert.equal(countRings(), 1, 'the scan sweep paints once');
  step(firedAt + 9.8);
  assert.equal(countLights(), 4, 'the panic of strobes plays four beats');
  step(firedAt + 17);
  assert.equal(countLights(), 8, 'the blackout cascade walks four more beats bow to stern');
  // ...then the hull holds dark for the remainder of the sixty-second cycle.
  step(firedAt + 30);
  step(firedAt + 45);
  step(firedAt + 59.9);
  assert.equal(countRings(), 1, 'dark hold: no second sweep inside the cycle');
  assert.equal(countLights(), 8, 'dark hold: no further light inside the cycle');
  // Cycle 2 begins on the pure simTime modulo — the same beats, once each.
  step(firedAt + 60.8);
  assert.equal(countRings(), 2, 'the echo replays on the sixty-second cycle');
  step(firedAt + 69.8);
  assert.equal(countLights(), 12, 'the strobes replay, once per cycle');
  // Leaving the sector ends the echo; nothing survives the place it belongs to.
  state.world.currentSectorId = 'sector_helios_prime';
  step(firedAt + 130);
  step(firedAt + 200);
  assert.equal(countRings(), 2, 'the echo does not follow the pilot out of the sector');
});

test('unknown ids degrade to a log-free no-op and duplicate firings stay bounded', () => {
  const bus = stubBus();
  special500Spectacle.init({ bus });
  const state = fixtureState({ simTime: GHOST_AT, sectorId: CHARON });
  bus.emit('special500:spectacle', { id: 'SPX-NOPE', sectorId: CHARON });
  bus.emit('special500:spectacle', undefined);
  special500Spectacle.update(1 / 60, state);
  assert.equal(bus.of('presentation:vfxCue').length, 0, 'an unknown id emits nothing');
  assert.equal(bus.of('news:publish').length, 0, 'an unknown id wires nothing');
  // Duplicate deliveries in one drain window collapse to one activation — one moment,
  // bounded, no crash (the director's fired-flag gate makes this unreachable in play).
  const wreckState = fixtureState({ simTime: GHOST_AT, sectorId: IO_REACH });
  bus.emit('special500:spectacle', { id: 'SP3-127', sectorId: IO_REACH });
  bus.emit('special500:spectacle', { id: 'SP3-127', sectorId: IO_REACH });
  special500Spectacle.update(1 / 60, wreckState);
  wreckState.simTime = GHOST_AT + 0.8;
  special500Spectacle.update(1 / 60, wreckState);
  assert.equal(bus.of('presentation:vfxCue').filter((e) => e.payload.id === 'thermal.mark').length, 1,
    'duplicate firings collapse to one moment');
  // A state with no world at all skips cleanly (no throw); the static zone anchor
  // still resolves because it is authored data, not world state.
  const bare = fixtureState({ simTime: GHOST_AT, sectorId: CHARON });
  delete bare.world;
  bus.emit('special500:spectacle', { id: 'SP1-101', sectorId: CHARON });
  special500Spectacle.update(1 / 60, bare);
  bare.simTime = GHOST_AT + 7;
  special500Spectacle.update(1 / 60, bare);
  assert.equal(bus.of('news:publish').length, 1, 'zone anchors survive even a worldless state');
});

test('reduced-motion settings ride the cue payload through the owner seam, which decides the variant', () => {
  const bus = stubBus();
  special500Spectacle.init({ bus });
  const reduced = fixtureState({
    simTime: GHOST_AT,
    sectorId: IO_REACH,
    settings: { video: {}, accessibility: { flashReduce: true } },
  });
  bus.emit('special500:spectacle', { id: 'SP3-127', sectorId: IO_REACH });
  special500Spectacle.update(1 / 60, reduced);
  for (let t = 0.5; t <= 18; t += 0.5) {
    reduced.simTime = GHOST_AT + t;
    special500Spectacle.update(1 / 60, reduced);
  }
  const lights = bus.of('presentation:vfxCue').filter((e) => e.payload && e.payload.id === 'special500.light');
  assert.ok(lights.length > 0, 'the wreck still plays under reduced motion');
  for (const cue of lights) {
    assert.equal(cue.payload.flashReduced, true, 'the accessibility flag rides the cue');
  }
  // The echo ring keeps the fields system's mark contract: no light, no particles — the
  // shape the vfx owner renders identically under reduced motion (no bypass, no second path).
  const ring = bus.of('presentation:vfxCue').find((e) => e.payload && e.payload.id === 'thermal.mark');
  assert.equal(ring.payload.lights, 0);
  assert.equal(ring.payload.particles, 0);
  // The video-level flag is honored by the same two-gate read.
  const bus2 = stubBus();
  special500Spectacle.init({ bus: bus2 });
  const videoReduced = fixtureState({
    simTime: GHOST_AT,
    sectorId: IO_REACH,
    settings: { video: { motionReduce: true }, accessibility: {} },
  });
  bus2.emit('special500:spectacle', { id: 'SP3-127', sectorId: IO_REACH });
  special500Spectacle.update(1 / 60, videoReduced);
  for (let t = 0.5; t <= 18; t += 0.5) {
    videoReduced.simTime = GHOST_AT + t;
    special500Spectacle.update(1 / 60, videoReduced);
  }
  for (const cue of bus2.of('presentation:vfxCue').filter((e) => e.payload && e.payload.id === 'special500.light')) {
    assert.equal(cue.payload.flashReduced, true, 'video motion-reduce rides the same gate');
  }
});

// ---- batch 5 (the spectacle family, 14 rows) ----

const HELIOS = 'sector_helios_prime';
const TETHYS = 'sector_tethys_junction';
const VESTA = 'sector_vesta_forge';

// A station anchor is load-bearing: it resolves from the loaded sector's materialized
// stations, so the moment plays only where its berth stands.
function withStation(state, stationId, pos) {
  state.world.activeSector.stations.push({ id: `ent_${stationId}`, stationId, pos });
  return state;
}

test('the Time Signal voices its four notes through the audio cue seam, and only where the station stands', () => {
  const bus = stubBus();
  special500Spectacle.init({ bus });
  const firedAt = 1 * CAL_DAY_S + 100; // dayOfYear 1, inside the shift-turn window
  const state = withStation(
    fixtureState({ simTime: firedAt, sectorId: HELIOS }), 'station_helios', { x: 500, z: -300 });
  bus.emit('special500:spectacle', { id: 'SP3-144', sectorId: HELIOS });
  special500Spectacle.update(1 / 60, state);
  for (let t = 0.5; t <= 8; t += 0.25) {
    state.simTime = firedAt + t;
    state.tick = Math.floor(state.simTime * 60);
    special500Spectacle.update(1 / 60, state);
  }
  const notes = bus.of('audio:cue');
  assert.equal(notes.length, 4, 'the four notes play — the same four every time');
  const rates = notes.map((e) => e.payload.rate);
  assert.equal(rates[0], 0.841, 'the figure opens on the house transposition');
  assert.ok(rates.every((r, i) => i === 0 || r > rates[i - 1]), 'the figure ascends');
  for (const note of notes) {
    assert.equal(note.payload.id, 'ambient_station_shift_bell', 'an existing recipe, not a new synth');
    assert.equal(note.payload.position.x, 500, 'the chime comes from the station direction in space');
    assert.equal(note.payload.duck, undefined, 'a time signal does not duck the mix');
  }
  // The anchor is the place: away from the berth, nothing plays and nothing misplaces.
  const bus2 = stubBus();
  special500Spectacle.init({ bus: bus2 });
  const elsewhere = fixtureState({ simTime: firedAt, sectorId: 'sector_ceres_belt' });
  bus2.emit('special500:spectacle', { id: 'SP3-144', sectorId: 'sector_ceres_belt' });
  special500Spectacle.update(1 / 60, elsewhere);
  elsewhere.simTime = firedAt + 6;
  special500Spectacle.update(1 / 60, elsewhere);
  assert.equal(bus2.of('audio:cue').length, 0, 'no station, no voice');
  assert.equal(bus2.of('presentation:vfxCue').length, 0, 'no light plays without its place either');
});

test('the Slow Kiss lands its predicted minute: the flash rolls both keels and the wire reads the obituary', () => {
  const bus = stubBus();
  special500Spectacle.init({ bus });
  const firedAt = 4170; // the entry's simWindow opens one week into the save
  const state = fixtureState({ simTime: firedAt, sectorId: 'sector_ashfall_reach' });
  bus.emit('special500:spectacle', { id: 'SP3-081', sectorId: 'sector_ashfall_reach' });
  special500Spectacle.update(1 / 60, state);
  for (let t = 0.5; t <= 12; t += 0.25) {
    state.simTime = firedAt + t;
    state.tick = Math.floor(state.simTime * 60);
    special500Spectacle.update(1 / 60, state);
  }
  const zone = zonesForSector('sector_ashfall_reach').find((z) => z.id === 'zone_ashfall_approach');
  const flashes = bus.of('presentation:vfxCue').filter((e) => e.payload.id === 'special500.light');
  assert.equal(flashes.length, 3, 'one deep flash per keel, then the afterglow');
  assert.ok(flashes[0].payload.magnitude > 4, 'the contact reads as an impact, not a lamp');
  for (const flash of flashes) {
    assert.ok(Math.hypot(flash.payload.position.x - zone.center.x, flash.payload.position.z - zone.center.z) < 60,
      'the kiss lands near the redoubt shoulder');
  }
  const blossom = bus.of('presentation:vfxCue').filter((e) => e.payload.id === 'thermal.mark');
  assert.equal(blossom.length, 1, 'one silent blossom');
  assert.equal(blossom[0].payload.radius, 160, 'the blossom is the widest thing the seam renders');
  const obituary = bus.of('news:publish');
  assert.equal(obituary.length, 1, 'the wire reads the obituary');
  assert.match(obituary[0].payload.text, /Marnie's Pride/);
  assert.equal(obituary[0].payload.sourceRef, 'special500:SP3-081');
  // Play-once: the collision happens exactly once; later ticks replay nothing.
  const before = bus.events.length;
  state.simTime = firedAt + 20;
  special500Spectacle.update(1 / 60, state);
  assert.equal(bus.events.length, before, 'one collision per seed');
});

test('Ring Rain files fall on their surge cadence and hold the gap dark', () => {
  const bus = stubBus();
  special500Spectacle.init({ bus });
  const firedAt = 16 * CAL_DAY_S + 30; // dayOfYear 16, the shower-season tell
  const state = fixtureState({ simTime: firedAt, sectorId: TETHYS });
  bus.emit('special500:spectacle', { id: 'SP3-024', sectorId: TETHYS });
  special500Spectacle.update(1 / 60, state);
  const countLights = () => bus.of('presentation:vfxCue').filter((e) => e.payload.id === 'special500.light').length;
  const step = (t) => {
    state.simTime = firedAt + t;
    state.tick = Math.floor(state.simTime * 60);
    special500Spectacle.update(1 / 60, state);
  };
  step(15);
  assert.equal(countLights(), 5, 'the first file peels off in five beats');
  step(26.5);
  assert.equal(countLights(), 9, 'the second file follows');
  step(43.9);
  assert.equal(countLights(), 9, 'the surge gap holds dark');
  step(44 + 15);
  assert.equal(countLights(), 14, 'the next surge falls on the same cadence');
  // Leaving the Junction ends the rain; the weather belongs to the Anvil.
  state.world.currentSectorId = HELIOS;
  step(44 * 3);
  assert.equal(countLights(), 14, 'the rain does not follow the pilot out of the sector');
});

test('the Quiet Night keeps its voice down: floor-gain lamps, a quiet wire, and the center-minute duck', () => {
  const bus = stubBus();
  special500Spectacle.init({ bus });
  const firedAt = 21 * CAL_DAY_S + 1; // The Quiet Night, dayOfYear 21
  const state = withStation(
    fixtureState({ simTime: firedAt, sectorId: 'sector_pallas_drift' }), 'station_smuggler', { x: -800, z: 200 });
  bus.emit('special500:spectacle', { id: 'SP3-106', sectorId: 'sector_pallas_drift' });
  special500Spectacle.update(1 / 60, state);
  const step = (t) => {
    state.simTime = firedAt + t;
    state.tick = Math.floor(state.simTime * 60);
    special500Spectacle.update(1 / 60, state);
  };
  step(6);
  const lamps = bus.of('presentation:vfxCue').filter((e) => e.payload.id === 'special500.light');
  assert.equal(lamps.length, 3, 'the window rows at half: three low beats');
  for (const lamp of lamps) {
    assert.ok(lamp.payload.magnitude <= 0.2, 'floor gain: the lowest the cue light burns');
  }
  const quiet = bus.of('news:publish');
  assert.equal(quiet.length, 1, 'the wire keeps its voice down');
  assert.equal(quiet[0].payload.kind, 'notices');
  step(299);
  assert.equal(bus.of('audio:cue').length, 0, 'the first half of the night holds quiet');
  step(301);
  const ducks = bus.of('audio:cue');
  assert.equal(ducks.length, 1, 'one low bell at the night center');
  assert.equal(ducks[0].payload.duck, true, "the duck rides the audio owner's own seam");
  assert.equal(ducks[0].payload.duckSeconds, 60, 'the hold is the authored minute');
  assert.ok(ducks[0].payload.gain <= 0.1, 'nine ticks deeper: barely a voice');
});

test('the 40-Day Chord stacks every station voice at once and reads the year under it', () => {
  const bus = stubBus();
  special500Spectacle.init({ bus });
  const firedAt = 39 * CAL_DAY_S + 570; // the year's last-minute window [540, 600]
  const state = withStation(
    fixtureState({ simTime: firedAt, sectorId: HELIOS }), 'station_helios', { x: 500, z: -300 });
  bus.emit('special500:spectacle', { id: 'SP3-151', sectorId: HELIOS });
  special500Spectacle.update(1 / 60, state);
  const step = (t) => {
    state.simTime = firedAt + t;
    state.tick = Math.floor(state.simTime * 60);
    special500Spectacle.update(1 / 60, state);
  };
  step(3);
  const chord = bus.of('audio:cue');
  assert.equal(chord.length, 8, 'six house keys in the chord plus the swelling round');
  const distinctKeys = new Set(chord.map((e) => e.payload.rate));
  assert.equal(distinctKeys.size, 6, 'every house key is its own voice');
  for (const note of chord) {
    assert.equal(note.payload.id, 'ambient_station_shift_bell');
    assert.ok(note.payload.rate >= 0.5 && note.payload.rate <= 2, 'a house transposition, not a new sound');
  }
  const yearWire = bus.of('news:publish');
  assert.equal(yearWire.length, 1, 'the wire reads the year in numbers, exactly once');
  assert.match(yearWire[0].payload.text, /YEAR'S END WIRE/);
  // The remainder is the silence the new year begins in: no further voices.
  const before = bus.events.length;
  step(13.9);
  assert.equal(bus.events.length, before, 'the new year begins in the silence after it');
});

test('All the Bells tolls on cadence: the wave flashes two seconds behind and the yard bells answer an octave down', () => {
  const bus = stubBus();
  special500Spectacle.init({ bus });
  const firedAt = 26 * CAL_DAY_S + 200; // Forge Due, the shift-turn window
  const state = fixtureState({ simTime: firedAt, sectorId: VESTA });
  bus.emit('special500:spectacle', { id: 'SP3-085', sectorId: VESTA });
  special500Spectacle.update(1 / 60, state);
  const step = (t) => {
    state.simTime = firedAt + t;
    state.tick = Math.floor(state.simTime * 60);
    special500Spectacle.update(1 / 60, state);
  };
  step(1);
  const tolls = bus.of('audio:cue').filter((e) => e.payload.id === 'sfx_eighth_bell_toll');
  assert.equal(tolls.length, 1, 'the Eighth Bell tolls on the shipped recipe');
  assert.equal(tolls[0].payload.rate, 1, 'the toll at written pitch');
  step(7);
  const wave = bus.of('presentation:vfxCue').filter((e) => e.payload.id === 'special500.light');
  assert.equal(wave.length, 5, 'the window rows flash once in a traveling wave');
  step(11);
  const answers = bus.of('audio:cue').filter((e) => e.payload.id === 'sfx_core_bell');
  assert.equal(answers.length, 2, 'the yard bells answer');
  for (const answer of answers) {
    assert.equal(answer.payload.rate, 0.5, 'one octave down');
  }
  step(44.9);
  assert.equal(bus.of('audio:cue').length, 3, 'the cadence holds between bells');
  step(45.5);
  assert.equal(bus.of('audio:cue').length, 4, 'the next toll falls on the cadence');
});


test('production director loop resumes through worker cues on sector return and real Continue without refiring', async () => {
  const lane = createSimHost();
  try {
    const init = await lane.init({profile:'production',seed:4242,
      scenarioContract:JSON.parse(readFileSync(new URL('../src/data/scenarios/47a.scenario.json', import.meta.url),'utf8'))});
    const {state,registry,runtime} = lane.host;
    const player=runtime.spawn({type:'ship',isPlayer:true,team:0,pos:{x:0,z:0},vel:{x:0,z:0},
      hull:100,hullMax:100,collides:false,physicsBody:false,data:{defId:'ship_kestrel',fittings:[],intent:{},ai:{}}});
    state.playerId=player.id;
    const director=registry.get('special500'), spectacle=registry.get('special500Spectacle');
    const save=registry.get('save');
    state.mode='flight'; state.world.currentSectorId=IO_REACH;
    const send=async t => {
      state.simTime=t; state.tick=Math.floor(t*60);
      director.update(1/60,state); spectacle.update(1/60,state);
      return lane.tick({tick:state.tick,steps:0,commands:[],ackEnd:init.initRebuild?.end ?? 0});
    };
    await send(10);
    assert.equal(state.story.flags['special500.SP3-127'],10);
    const visits=state.story.depthProgramEncounters?.completed?.['special500.SP3-127']?.visits;
    assert.equal(visits,1);
    const one=await send(10.8);
    assert.ok(one.events.some(e=>e.t==='presentation:vfxCue' && e.p?.id==='thermal.mark'));
    state.world.currentSectorId=CHARON;
    await send(12);
    state.world.currentSectorId=IO_REACH;
    const onReturn=await send(70.2);
    assert.ok(!onReturn.events.some(e=>e.t==='presentation:vfxCue' && e.p?.id==='thermal.mark'), 'no backlog burst');
    const replay=await send(70.8);
    assert.ok(replay.events.some(e=>e.t==='presentation:vfxCue' && e.p?.id==='thermal.mark'));
    assert.equal(state.story.flags['special500.SP3-127'],10);
    assert.equal(state.story.depthProgramEncounters?.completed?.['special500.SP3-127']?.visits,visits);
    const envelope=save.serialize('spectacle-return');
    lane.shutdown();
    const cold=createSimHost();
    try {
      const coldInit=await cold.init({profile:'production',seed:4242,
        scenarioContract:JSON.parse(readFileSync(new URL('../src/data/scenarios/47a.scenario.json', import.meta.url),'utf8'))});
      const restored=cold.host.state, coldRegistry=cold.host.registry;
      assert.equal(coldRegistry.get('save').loadEnvelope(envelope,'spectacle-return'),true);
      assert.equal(restored.story.flags['special500.SP3-127'],10);
      restored.world.currentSectorId=IO_REACH;
      const coldSend=async t => {
        restored.simTime=t; restored.tick=Math.floor(t*60);
        coldRegistry.get('special500').update(1/60,restored);
        coldRegistry.get('special500Spectacle').update(1/60,restored);
        return cold.tick({tick:restored.tick,steps:0,commands:[],ackEnd:coldInit.initRebuild?.end ?? 0});
      };
      const onContinue=await coldSend(130.2);
      assert.ok(!onContinue.events.some(e=>e.t==='presentation:vfxCue' && e.p?.id==='thermal.mark'));
      const afterContinue=await coldSend(130.8);
      assert.ok(afterContinue.events.some(e=>e.t==='presentation:vfxCue' && e.p?.id==='thermal.mark'));
      assert.equal(restored.story.flags['special500.SP3-127'],10);
      assert.equal(restored.story.depthProgramEncounters?.completed?.['special500.SP3-127']?.visits,visits);
    } finally { cold.shutdown(); }
  } finally { lane.shutdown(); }
});
