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
// duck, the 40-Day Chord's stacked house keys, and All the Bells' toll cadence. The
// batch-6 rows pin the Pour's gate-by-gate walk with its afterglow fade, the Glint
// Hour's two-second sparkle waves and both posted minutes, the 600-second day-clock
// rows (Boulder Binary close pass, Last Ferry tow line, Pigeon Day keeper lamp), the
// Avalanche's three widening calving surges, the Fireball's eight-second crossing and
// its place-gated skip, the Last Tow's honors at tow speed, the Arrival Stencil's
// lane board, the Comet's anti-sunward tail, the Ashcache count's audio-only strokes,
// the Berth Queue's light-code grant, the Choir's same-breath pulse, and the Dark
// Lantern's escalation-and-hold. The batch-7 rows pin the Range Note's red fleck
// loop and its roost-gated skip, the Shoal Toast's unison crowd and floor-gain dim,
// the Clearing's wipe-and-exhale at the weather eye, the Full Burn's simultaneous
// light-off with its held re-strikes and the cut, the Broadside's flashbulb string
// with the band's respectful silence, the Moonrise's four-minute rim walk, the
// Merger's lights-to-lights leads, the Farmers' strike line and capacitor bang, the
// unscheduled Eighth Bell note, the Frequency's three-note phrase loop, and the
// Tender's note with its harmony answers.
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
  // station anchors in the sector's authored station rows, POI anchors in the sector's
  // authored poi rows (all static data, checked here so a typo'd id can never pass
  // validation silently).
  for (const [id, row] of Object.entries(SPECTACLE_LEGS)) {
    const a = row.anchor;
    if (a.zoneId) {
      const zone = zonesForSector(a.sectorId).find((z) => z.id === a.zoneId);
      assert.ok(zone, `${id} anchor zone ${a.zoneId} resolves in ${a.sectorId}`);
    } else if (a.stationId) {
      const sector = SECTORS.find((s) => s.id === a.sectorId);
      const station = sector && (sector.stations || []).find((st) => st.id === a.stationId);
      assert.ok(station, `${id} anchor station ${a.stationId} resolves in ${a.sectorId}`);
    } else if (a.poiId) {
      const sector = SECTORS.find((s) => s.id === a.sectorId);
      const poi = sector && (sector.pois || []).find((p) => p.id === a.poiId);
      assert.ok(poi, `${id} anchor poi ${a.poiId} resolves in ${a.sectorId}`);
    } else {
      assert.fail(`${id} anchor names neither a zone, a station, nor a poi`);
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

// ---- batch 6 (the spectacle family) ----

const PALLAS = 'sector_pallas_drift';
const HYPERION = 'sector_hyperion_cut';
const CERES = 'sector_ceres_belt';
const VEIL = 'sector_veil_nebula';
const ASHFALL = 'sector_ashfall_reach';

// A poi anchor is load-bearing: it resolves from the loaded sector's materialized
// pois (the same shape world.js pushes for runtime-owned and plain poi rows).
function withPoi(state, poiId, pos) {
  state.world.activeSector.pois.push({ poiId, pos });
  return state;
}

// Project a cue position back onto the row bearing: the authored offsets fall out.
// (+0 normalizes the negative zero Math.round can hand back for an offset of 0.)
function bearingOffset(payload, origin, bearingRad) {
  const dx = payload.position.x - origin.x;
  const dz = payload.position.z - origin.z;
  return Math.round(dx * Math.cos(bearingRad) + dz * Math.sin(bearingRad)) + 0;
}

test('the Pour walks the spine gate by gate, flashes the final mould once, and dims the afterglow out', () => {
  const bus = stubBus();
  special500Spectacle.init({ bus });
  const firedAt = 9 * CAL_DAY_S + 300; // dayOfYear 9, mid-window, the shift midpoint
  const state = fixtureState({ simTime: firedAt, sectorId: VESTA });
  bus.emit('special500:spectacle', { id: 'SP3-083', sectorId: VESTA });
  special500Spectacle.update(1 / 60, state);
  const step = (t) => {
    state.simTime = firedAt + t;
    state.tick = Math.floor(state.simTime * 60);
    special500Spectacle.update(1 / 60, state);
  };
  const zone = zonesForSector(VESTA).find((z) => z.id === 'zone_vesta_forge');
  const bearing = SPECTACLE_LEGS['SP3-083'].bearingRad;
  const lights = () => bus.of('presentation:vfxCue').filter((e) => e.payload.id === 'special500.light');
  step(33);
  const walked = lights();
  assert.equal(walked.length, 7, 'the glow walks six gates and the final mould flashes');
  assert.equal(walked[6].payload.magnitude, 6, 'the final mould is the brightest thing on the floor');
  const gateOffsets = walked.slice(0, 6).map((e) => bearingOffset(e.payload, zone.center, bearing));
  assert.deepEqual(gateOffsets, [-100, -60, -20, 20, 60, 100], 'the pour runs the spine gate by gate');
  const bloom = bus.of('presentation:vfxCue').filter((e) => e.payload.id === 'thermal.mark');
  assert.equal(bloom.length, 1, 'one melt bloom opens the pour');
  assert.equal(bloom[0].payload.color, '#ffd9a0', 'white-orange: the ring contract carries the melt identity the cue light cannot');
  const motor = bus.of('audio:cue');
  assert.equal(motor.length, 1, 'the floor wakes once');
  step(88);
  const afterglow = lights().slice(7).map((e) => e.payload.magnitude);
  assert.deepEqual(afterglow, [2, 1.2, 0.6, 0.3], 'the annealing afterglow dims out across the minute');
  const before = bus.events.length;
  step(130);
  assert.equal(bus.events.length, before, 'the pour is put away: nothing replays');
});

test('the Glint Hour flares the field inside one two-second wave, then the debris arc walks a beat later, and the wire posts both minutes', () => {
  const bus = stubBus();
  special500Spectacle.init({ bus });
  const firedAt = 5 * CAL_DAY_S + 420; // dayOfYear 5, inside the glint window
  const apron = { x: 400, z: 0 };
  const state = withStation(fixtureState({ simTime: firedAt, sectorId: HELIOS }), 'station_helios', apron);
  bus.emit('special500:spectacle', { id: 'SP3-001', sectorId: HELIOS });
  special500Spectacle.update(1 / 60, state);
  const step = (t) => {
    state.simTime = firedAt + t;
    state.tick = Math.floor(state.simTime * 60);
    special500Spectacle.update(1 / 60, state);
  };
  const bearing = SPECTACLE_LEGS['SP3-001'].bearingRad;
  const lights = () => bus.of('presentation:vfxCue').filter((e) => e.payload.id === 'special500.light');
  step(3);
  const wave1 = lights();
  assert.equal(wave1.length, 6, 'the parked field flares inside the same two seconds');
  assert.deepEqual(wave1.map((e) => bearingOffset(e.payload, apron, bearing)),
    [-90, -54, -18, 18, 54, 90], 'the sparkle wave crosses the apron as one sweep');
  step(10);
  const wave2 = lights().slice(6);
  assert.equal(wave2.length, 5, 'the debris arc takes its walk a beat later');
  assert.deepEqual(wave2.map((e) => bearingOffset(e.payload, apron, bearing)),
    [-160, -80, 0, 80, 160], 'the arc runs deeper off the lane');
  const wire = bus.of('news:publish');
  assert.equal(wire.length, 1, 'the wire posts the minutes, once');
  assert.match(wire[0].payload.text, /GLINT HOUR/);
  assert.match(wire[0].payload.text, /debris arc/);
  assert.equal(wire[0].payload.source, 'helios-watch');
  assert.equal(bus.of('audio:cue').length, 0, 'a glint makes no sound — nothing is added to the scene');
});

test('the Boulder Binary runs its close pass once per 600-second day and keeps the time in silence between', () => {
  const bus = stubBus();
  special500Spectacle.init({ bus });
  const stake = { x: -260, z: -560 }; // the Faith Filing Ninth stake, the reef approach
  const firedAt = 500;
  const state = withPoi(fixtureState({ simTime: firedAt, sectorId: PALLAS }), 'poi_pallas_faith_stake', stake);
  bus.emit('special500:spectacle', { id: 'SP3-065', sectorId: PALLAS });
  special500Spectacle.update(1 / 60, state);
  const step = (t) => {
    state.simTime = firedAt + t;
    state.tick = Math.floor(state.simTime * 60);
    special500Spectacle.update(1 / 60, state);
  };
  const bearing = SPECTACLE_LEGS['SP3-065'].bearingRad;
  const lights = () => bus.of('presentation:vfxCue').filter((e) => e.payload.id === 'special500.light');
  step(6);
  const pass = lights();
  assert.equal(pass.length, 3, 'two matched lights and one spark on the tangent');
  assert.deepEqual(pass.map((e) => bearingOffset(e.payload, stake, bearing)), [-10, 10, 0],
    'the pair hangs a ship-length apart with the spark between');
  const haze = bus.of('presentation:vfxCue').filter((e) => e.payload.id === 'thermal.mark');
  assert.equal(haze.length, 1, 'the abraded dust haze catches the pass');
  assert.equal(haze[0].payload.color, '#b8ac90');
  step(300);
  step(599);
  assert.equal(lights().length, 3, 'the pair keeps the time in silence for the rest of the day');
  step(606);
  assert.equal(lights().length, 6, 'the close pass replays on the 600-second day, once');
  state.world.currentSectorId = HELIOS;
  step(1300);
  assert.equal(lights().length, 6, 'the clock does not follow the pilot out of the sector');
});

test('the Last Ferry crosses with its lights down and the Pigeon Day re-strikes the keeper lamp on the sector-day modulo', () => {
  const bus = stubBus();
  special500Spectacle.init({ bus });
  // The Last Ferry: the tow line in file — older hull, shared lamp, younger hull.
  const lane = { x: -720, z: 940 };
  const firedAt = 2 * CAL_DAY_S + 200;
  const ferry = fixtureState({ simTime: firedAt, sectorId: IO_REACH });
  bus.emit('special500:spectacle', { id: 'SPX-A-08', sectorId: IO_REACH });
  special500Spectacle.update(1 / 60, ferry);
  const stepF = (t) => {
    ferry.simTime = firedAt + t;
    ferry.tick = Math.floor(ferry.simTime * 60);
    special500Spectacle.update(1 / 60, ferry);
  };
  const bearingF = SPECTACLE_LEGS['SPX-A-08'].bearingRad;
  const ferryLights = () => bus.of('presentation:vfxCue').filter((e) => e.payload.id === 'special500.light');
  stepF(35);
  assert.equal(ferryLights().length, 5, 'the lead, the tow line of three, and the far-edge hold');
  const mags = ferryLights().map((e) => e.payload.magnitude);
  assert.ok(mags.every((m) => m <= 1), 'working lights: nothing on this hull burns bright');
  assert.deepEqual(ferryLights().slice(1, 4).map((e) => bearingOffset(e.payload, lane, bearingF)),
    [-12, 0, 12], 'the lamp hangs between the two hulls');
  assert.equal(bus.of('news:publish').length, 0, 'the wire never mentions them');
  stepF(635);
  assert.equal(ferryLights().length, 10, 'the crossing replays once per sector-day');

  // The Pigeon Day: release, the tight line crossing, the landing, the lamp.
  const bus2 = stubBus();
  special500Spectacle.init({ bus: bus2 });
  const loft = { x: 500, z: -650 }; // Three-Lamp Corner, the old welded-shut loft
  const pigeonAt = 3 * CAL_DAY_S + 100;
  const pigeon = withPoi(fixtureState({ simTime: pigeonAt, sectorId: CERES }), 'poi_ceres_three_lamp', loft);
  bus2.emit('special500:spectacle', { id: 'SPX-C-05', sectorId: CERES });
  special500Spectacle.update(1 / 60, pigeon);
  const stepP = (t) => {
    pigeon.simTime = pigeonAt + t;
    pigeon.tick = Math.floor(pigeon.simTime * 60);
    special500Spectacle.update(1 / 60, pigeon);
  };
  stepP(21);
  const release = bus2.of('audio:cue');
  assert.equal(release.length, 1, 'the twelve racers go on the shipped migrant voice');
  assert.equal(release[0].payload.id, 'ambient_fauna_migrant');
  const flight = bus2.of('presentation:vfxCue').filter((e) => e.payload.id === 'special500.light');
  assert.equal(flight.length, 6, 'the tight line crosses, lands, and the lamp burns');
  assert.equal(flight[5].payload.magnitude, 0.25, 'the keeper lamp is the smallest light on the field');
  assert.equal(bus2.of('news:publish').length, 0, 'the log is the keeper\'s, not the wire\'s');
  stepP(621);
  assert.equal(bus2.of('presentation:vfxCue').filter((e) => e.payload.id === 'special500.light').length, 12,
    'the market-day flight replays on the day modulo');
  assert.equal(bus2.of('audio:cue').length, 2, 'the release voice with it');
});

test('Avalanche lets go in three widening surges with the rock calving on each', () => {
  const bus = stubBus();
  special500Spectacle.init({ bus });
  const shaft = { x: 240, z: -1180 }; // the Caved Shaft, the pile's authored marker
  const firedAt = 1000;
  const state = withPoi(fixtureState({ simTime: firedAt, sectorId: HYPERION }), 'poi_hyperion_driller', shaft);
  bus.emit('special500:spectacle', { id: 'SP3-076', sectorId: HYPERION });
  special500Spectacle.update(1 / 60, state);
  const step = (t) => {
    state.simTime = firedAt + t;
    state.tick = Math.floor(state.simTime * 60);
    special500Spectacle.update(1 / 60, state);
  };
  const bearing = SPECTACLE_LEGS['SP3-076'].bearingRad;
  const lights = () => bus.of('presentation:vfxCue').filter((e) => e.payload.id === 'special500.light');
  step(1.5);
  const rig = lights();
  assert.equal(rig.length, 2, 'the drill rig blinks twice before the pile lets go');
  assert.ok(rig.every((e) => bearingOffset(e.payload, shaft, bearing) === 0), 'the blink sits at the rig');
  step(9);
  const surge1 = lights().slice(2).map((e) => bearingOffset(e.payload, shaft, bearing));
  assert.deepEqual(surge1, [-60, -20, 20, 60], 'the first front walks downslope');
  step(28);
  assert.equal(lights().length, 15, 'three surges of four, plus the blink pair and the settle');
  const calves = bus.of('audio:cue');
  assert.equal(calves.length, 3, 'the rock speaks on each surge');
  assert.deepEqual(calves.map((e) => e.payload.rate), [1, 0.92, 0.85], 'each surge settles lower than the last');
  const front3 = lights().slice(10, 14).map((e) => Math.abs(bearingOffset(e.payload, shaft, bearing)));
  assert.ok(Math.max(...front3) > Math.max(...surge1.map(Math.abs)), 'the third front runs wider than the first');
  const before = bus.events.length;
  step(90);
  assert.equal(bus.events.length, before, 'one slide per receipt: the terrain memory is the mechanic leg\'s business');
});

test('the Fireball crosses in eight seconds, lands hard, and the fog watch names the bearing — but nothing plays where the buoy does not stand', () => {
  const bus = stubBus();
  special500Spectacle.init({ bus });
  const buoy = { x: -340, z: 580 }; // the Murmur Buoy, the fog watch post in the Blind Nebula fog
  const firedAt = 2000;
  const state = withPoi(fixtureState({ simTime: firedAt, sectorId: VEIL }), 'poi_veil_murmur_buoy', buoy);
  bus.emit('special500:spectacle', { id: 'SP3-044', sectorId: VEIL });
  special500Spectacle.update(1 / 60, state);
  const step = (t) => {
    state.simTime = firedAt + t;
    state.tick = Math.floor(state.simTime * 60);
    special500Spectacle.update(1 / 60, state);
  };
  const bearing = SPECTACLE_LEGS['SP3-044'].bearingRad;
  const lights = () => bus.of('presentation:vfxCue').filter((e) => e.payload.id === 'special500.light');
  step(7);
  const crossing = lights();
  assert.equal(crossing.length, 5, 'successive pulses beat across the field');
  assert.deepEqual(crossing.map((e) => bearingOffset(e.payload, buoy, bearing)),
    [-1200, -600, 0, 600, 1200], 'the track runs the whole sector in file');
  assert.ok(crossing.every((e) => e.payload.magnitude >= 5), 'brighter than anything else in the sky');
  step(9);
  const landing = lights()[5];
  assert.equal(landing.payload.magnitude, 6, 'the landing is the hardest beat of the minute');
  const bloom = bus.of('presentation:vfxCue').filter((e) => e.payload.id === 'thermal.mark');
  assert.equal(bloom.length, 1, 'the crater opens as one wide bloom');
  assert.equal(bloom[0].payload.color, '#e89060');
  const boom = bus.of('audio:cue');
  assert.equal(boom.length, 1, 'the boom arrives late through the fog');
  step(11);
  const wire = bus.of('news:publish');
  assert.equal(wire.length, 1, 'the fog watch names the bearing');
  assert.match(wire[0].payload.text, /bearing two-one-two/);
  // The surge fires in either storm-lane sector; over the Forge the buoy does not
  // stand, so the beats skip rather than misplace — the moment needs its place.
  const bus2 = stubBus();
  special500Spectacle.init({ bus: bus2 });
  const forgeState = fixtureState({ simTime: firedAt, sectorId: VESTA });
  bus2.emit('special500:spectacle', { id: 'SP3-044', sectorId: VESTA });
  special500Spectacle.update(1 / 60, forgeState);
  forgeState.simTime = firedAt + 12;
  special500Spectacle.update(1 / 60, forgeState);
  assert.equal(bus2.of('presentation:vfxCue').length, 0, 'no light without its place');
  assert.equal(bus2.of('news:publish').length, 0, 'no wire without its place');
  assert.equal(bus2.of('audio:cue').length, 0, 'no boom without its place');
});

test('the Last Tow walks the procession at tow speed, reads the log over the band, and closes the jaw', () => {
  const bus = stubBus();
  special500Spectacle.init({ bus });
  const yard = { x: -500, z: 1600 }; // Second Measure Shipbreak
  const firedAt = 16 * CAL_DAY_S + 100; // dayOfYear 16, the yard retirement
  const state = withPoi(fixtureState({ simTime: firedAt, sectorId: CERES }), 'world_site_ceres_second_measure', yard);
  bus.emit('special500:spectacle', { id: 'SP1-183', sectorId: CERES });
  special500Spectacle.update(1 / 60, state);
  const step = (t) => {
    state.simTime = firedAt + t;
    state.tick = Math.floor(state.simTime * 60);
    special500Spectacle.update(1 / 60, state);
  };
  const audio = () => bus.of('audio:cue').map((e) => e.payload.id);
  const lights = () => bus.of('presentation:vfxCue').filter((e) => e.payload.id === 'special500.light');
  step(4);
  assert.deepEqual(audio(), ['sfx_hauler_foghorn'], 'the yard horn opens the ceremony');
  assert.equal(lights().length, 3, 'the rest lamps hold and the bow lamp rides lead');
  step(25);
  assert.deepEqual(audio(), ['sfx_hauler_foghorn', 'sfx_bark_radio'], 'the log goes out over the band');
  assert.equal(lights().length, 7, 'the procession walks the route');
  step(47);
  assert.equal(lights().length, 9, 'the unmanned tow carries her at tow speed');
  step(56);
  assert.deepEqual(audio(), ['sfx_hauler_foghorn', 'sfx_bark_radio', 'sfx_salvage_hydraulic'], 'the jaw closes on her');
  assert.equal(lights().length, 10, 'one last work light at the mouth');
  const before = bus.events.length;
  step(200);
  assert.equal(bus.events.length, before, 'the honors are paid once; the naming is the encounter leg\'s business');
});

test('the Arrival Stencil posts the lane board verbatim while the dockhands renew the paint', () => {
  const bus = stubBus();
  special500Spectacle.init({ bus });
  const firedAt = 40; // first hour, first pass down the starter lane
  const state = withStation(fixtureState({ simTime: firedAt, sectorId: HELIOS }), 'station_helios', { x: 400, z: 0 });
  bus.emit('special500:spectacle', { id: 'SPX-B-01', sectorId: HELIOS });
  special500Spectacle.update(1 / 60, state);
  const step = (t) => {
    state.simTime = firedAt + t;
    state.tick = Math.floor(state.simTime * 60);
    special500Spectacle.update(1 / 60, state);
  };
  step(7);
  const board = bus.of('news:publish');
  assert.equal(board.length, 1, 'the lane board carries the stencil');
  assert.match(board[0].payload.text, /WELCOME TO THE LANE\. MIND THE TANKERS\./);
  assert.match(board[0].payload.text, /scan ring is NOT a suggestion/, 'the correction is a real hint');
  assert.equal(board[0].payload.kind, 'notices');
  assert.equal(board[0].payload.source, 'lane board');
  const lights = bus.of('presentation:vfxCue').filter((e) => e.payload.id === 'special500.light');
  assert.equal(lights.length, 4, 'three renewal lamps walking the face, then the correction\'s fresh mark');
  assert.equal(bus.of('audio:cue').length, 0, 'paint dries in silence');
});

test('Comet Perihelion arrives hard, streams the tail anti-sunward, and rings the shed haze', () => {
  const bus = stubBus();
  special500Spectacle.init({ bus });
  const core = { x: 400, z: 0 };
  const firedAt = 15 * CAL_DAY_S + 300; // dayOfYear 15, the perihelion window
  const state = fixtureState({ simTime: firedAt, sectorId: HELIOS });
  bus.emit('special500:spectacle', { id: 'SP3-005', sectorId: HELIOS });
  special500Spectacle.update(1 / 60, state);
  const step = (t) => {
    state.simTime = firedAt + t;
    state.tick = Math.floor(state.simTime * 60);
    special500Spectacle.update(1 / 60, state);
  };
  const bearing = SPECTACLE_LEGS['SP3-005'].bearingRad;
  const lights = () => bus.of('presentation:vfxCue').filter((e) => e.payload.id === 'special500.light');
  step(1);
  const arrival = lights();
  assert.equal(arrival.length, 1, 'the near-plane point comes hard onto the field');
  assert.equal(arrival[0].payload.magnitude, 5.5);
  assert.equal(bearingOffset(arrival[0].payload, core, bearing), 0, 'the comet hangs at the anchor bearing');
  step(13);
  const tail = lights().slice(1).map((e) => bearingOffset(e.payload, core, bearing));
  assert.deepEqual(tail, [-160, -80, 0, 80, 160], 'the tail streams anti-sunward as a slow file');
  step(15);
  const haze = bus.of('presentation:vfxCue').filter((e) => e.payload.id === 'thermal.mark');
  assert.equal(haze.length, 1, 'the shed haze the stones fall through');
  assert.equal(haze[0].payload.color, '#cfe8f0');
  assert.equal(bus.of('audio:cue').length, 0, 'the comet keeps its own counsel');
  const before = bus.events.length;
  step(60);
  assert.equal(bus.events.length, before, 'one arrival per year; the stones are the weather leg\'s business');
});

test('the Ashcache count lands as two dry strokes and not one light moves', () => {
  const bus = stubBus();
  special500Spectacle.init({ bus });
  const mark = { x: 700, z: -220 }; // Kurtz's Mark
  const firedAt = 900;
  const state = withPoi(fixtureState({ simTime: firedAt, sectorId: ASHFALL }), 'poi_ashfall_kurtz_mark', mark);
  bus.emit('special500:spectacle', { id: 'SP2-160', sectorId: ASHFALL });
  special500Spectacle.update(1 / 60, state);
  const step = (t) => {
    state.simTime = firedAt + t;
    state.tick = Math.floor(state.simTime * 60);
    special500Spectacle.update(1 / 60, state);
  };
  step(3);
  const strokes = bus.of('audio:cue');
  assert.equal(strokes.length, 2, 'forty-one, forty-two: two strokes, no more');
  assert.deepEqual(strokes.map((e) => e.payload.rate), [1.0, 0.94], 'the second settles half a tone, the way a count closes');
  assert.ok(strokes[1].payload.gain < strokes[0].payload.gain, 'the count fades, it does not repeat');
  assert.equal(bus.of('presentation:vfxCue').length, 0, 'no light plays — the wind here moves nothing else');
  assert.equal(bus.of('news:publish').length, 0, 'the count is Kurtz\'s, not the wire\'s');
});

test('the Berth Queue walks six hulls in the holding pattern while the tug grants a berth in light code', () => {
  const bus = stubBus();
  special500Spectacle.init({ bus });
  const spine = { x: 400, z: 0 };
  const firedAt = 3 * CAL_DAY_S + 450; // peak shift
  const state = withStation(fixtureState({ simTime: firedAt, sectorId: HELIOS }), 'station_helios', spine);
  bus.emit('special500:spectacle', { id: 'SP1-047', sectorId: HELIOS });
  special500Spectacle.update(1 / 60, state);
  const step = (t) => {
    state.simTime = firedAt + t;
    state.tick = Math.floor(state.simTime * 60);
    special500Spectacle.update(1 / 60, state);
  };
  const bearing = SPECTACLE_LEGS['SP1-047'].bearingRad;
  const lights = () => bus.of('presentation:vfxCue').filter((e) => e.payload.id === 'special500.light');
  step(2);
  const code = lights();
  assert.equal(code.length, 3, 'two shorts and a long: the berth grant');
  assert.ok(code.every((e) => bearingOffset(e.payload, spine, bearing) === -8),
    'the signal comes from one position — a signal, not a searchlight');
  assert.deepEqual(code.map((e) => e.payload.magnitude), [0.4, 0.4, 1.4], 'short, short, long');
  step(17);
  const queue = lights().slice(3).map((e) => bearingOffset(e.payload, spine, bearing));
  assert.deepEqual(queue, [-80, -48, -16, 16, 48, 80], 'six hulls walk the holding pattern');
  const before = bus.events.length;
  step(40);
  assert.equal(bus.events.length, before, 'the queue holds once per firing; the controller\'s memory is the encounter leg\'s business');
});

test('the Choir’s hundredth is said aloud once and every ribbons light fires in the same breath', () => {
  const bus = stubBus();
  special500Spectacle.init({ bus });
  const gate = { x: 100, z: 100 };
  const firedAt = 8 * CAL_DAY_S + 200;
  const state = withStation(fixtureState({ simTime: firedAt, sectorId: VESTA }), 'station_depot3', gate);
  bus.emit('special500:spectacle', { id: 'SP2-100', sectorId: VESTA });
  special500Spectacle.update(1 / 60, state);
  const step = (t) => {
    state.simTime = firedAt + t;
    state.tick = Math.floor(state.simTime * 60);
    special500Spectacle.update(1 / 60, state);
  };
  const bearing = SPECTACLE_LEGS['SP2-100'].bearingRad;
  step(2.9);
  assert.equal(bus.of('audio:cue').length, 1, 'the bell says the number so nobody has to guess');
  assert.equal(bus.of('presentation:vfxCue').length, 0, 'nothing pulses early');
  step(3.1);
  const ribbons = bus.of('presentation:vfxCue').filter((e) => e.payload.id === 'special500.light');
  assert.equal(ribbons.length, 4, 'every Choir hull in range lights its ribbons');
  assert.deepEqual(ribbons.map((e) => bearingOffset(e.payload, gate, bearing)), [-80, -40, 40, 80],
    'the ribbons ring the field, symmetric about the gate');
  const pulse = bus.of('presentation:vfxCue').filter((e) => e.payload.id === 'thermal.mark');
  assert.equal(pulse.length, 1, 'one wide pulse rolls out of cadence');
  assert.equal(pulse[0].payload.color, '#c8d8e8');
  step(8);
  const bells = bus.of('audio:cue');
  assert.equal(bells.length, 2, 'the cadence resumes, quietly');
  assert.ok(bells[1].payload.gain < bells[0].payload.gain, 'the resume is softer than the saying');
  const before = bus.events.length;
  step(30);
  assert.equal(bus.events.length, before, 'one pulse, once, deliberately');
});

test('Solstice’s lantern escalates, rings its reach once, and holds steady while the grid stays down', () => {
  const bus = stubBus();
  special500Spectacle.init({ bus });
  const lantern = { x: -840, z: -760 }; // the Star Lantern, Solstice's anchor
  const firedAt = 27 * CAL_DAY_S + 450; // dayOfYear 27, inside the dark-lantern window
  const state = withPoi(fixtureState({ simTime: firedAt, sectorId: CERES }), 'poi_solstice_lantern', lantern);
  bus.emit('special500:spectacle', { id: 'SP2-121', sectorId: CERES });
  special500Spectacle.update(1 / 60, state);
  const step = (t) => {
    state.simTime = firedAt + t;
    state.tick = Math.floor(state.simTime * 60);
    special500Spectacle.update(1 / 60, state);
  };
  const bearing = SPECTACLE_LEGS['SP2-121'].bearingRad;
  const lights = () => bus.of('presentation:vfxCue').filter((e) => e.payload.id === 'special500.light');
  step(1.6);
  const chime = bus.of('audio:cue');
  assert.equal(chime.length, 1, 'Solstice\'s own chime steadies the night');
  assert.equal(chime[0].payload.id, 'sfx_solstice_chime');
  step(7);
  const rise = lights().map((e) => e.payload.magnitude);
  assert.deepEqual(rise, [1.5, 2.5, 3.5], 'the lantern escalates hard');
  step(12);
  const reach = bus.of('presentation:vfxCue').filter((e) => e.payload.id === 'thermal.mark');
  assert.equal(reach.length, 1, 'the reach rings once across the field');
  assert.equal(reach[0].payload.color, '#e8c880');
  const faces = lights().slice(3).map((e) => [bearingOffset(e.payload, lantern, bearing), e.payload.magnitude]);
  assert.deepEqual(faces, [[-120, 0.4], [140, 0.4]], 'the nearest wrecks\' faces catch it, dim');
  step(101);
  const hold = lights().slice(5).map((e) => e.payload.magnitude);
  assert.deepEqual(hold, [2.8, 2.5, 2.2], 'the lantern holds through the night, easing as it wears');
  assert.equal(lights().length, 8, 'three rising, two faces, three holding — nothing else burns');
  const before = bus.events.length;
  step(700);
  assert.equal(bus.events.length, before, 'one night per game: the grid comes back and the row keeps its dark');
});

// ---- batch 7 (the spectacle family) ----

const NEREID = 'sector_nereid_shoal';

test('the Range Note loop snaps three red flecks per cycle and skips where the lattice does not stand', () => {
  const bus = stubBus();
  special500Spectacle.init({ bus });
  const lattice = { x: 2400, z: 600 }; // the Unidentified Lattice, the Expanse roost
  const firedAt = 3000;
  const state = withPoi(fixtureState({ simTime: firedAt, sectorId: CHARON }), 'poi_charon_pylon_field', lattice);
  bus.emit('special500:spectacle', { id: 'SP1-115', sectorId: CHARON });
  special500Spectacle.update(1 / 60, state);
  const step = (t) => {
    state.simTime = firedAt + t;
    state.tick = Math.floor(state.simTime * 60);
    special500Spectacle.update(1 / 60, state);
  };
  const flecks = () => bus.of('presentation:vfxCue').filter((e) => e.payload.id === 'thermal.mark');
  step(7);
  const first = flecks();
  assert.equal(first.length, 3, 'three flecks inside the first cycle');
  for (const f of first) {
    assert.equal(f.payload.color, '#d0483a', 'red: a ranging fleck, not a lamp');
    assert.ok(f.payload.radius <= 12, 'small: brief, precise');
    assert.ok(f.payload.life <= 0.5, 'gone before the eye can answer it');
  }
  assert.equal(bus.of('news:publish').length, 0, 'the sniper files nothing');
  assert.equal(bus.of('audio:cue').length, 0, 'a fleck from nowhere makes no sound');
  step(52);
  assert.equal(flecks().length, 6, 'the reminder recurs on its cadence while the day lasts');
  state.world.currentSectorId = HELIOS;
  step(100);
  assert.equal(flecks().length, 6, 'leaving ends the flecks where they belong');
  // The ace has no fixed perch and the entry fires in any sector: where the roost
  // does not stand, the beats skip rather than misplace (the SP3-044 precedent).
  const bus2 = stubBus();
  special500Spectacle.init({ bus: bus2 });
  const elsewhere = fixtureState({ simTime: firedAt, sectorId: HELIOS });
  bus2.emit('special500:spectacle', { id: 'SP1-115', sectorId: HELIOS });
  special500Spectacle.update(1 / 60, elsewhere);
  elsewhere.simTime = firedAt + 8;
  special500Spectacle.update(1 / 60, elsewhere);
  assert.equal(bus2.of('presentation:vfxCue').length, 0, 'no fleck without its roost');
  assert.equal(bus2.of('news:publish').length, 0, 'and no wire either');
});

test('the Shoal Toast raises the bar in unison and dims the lights on cue', () => {
  const bus = stubBus();
  special500Spectacle.init({ bus });
  const firedAt = 18 * CAL_DAY_S + 200; // bloom day, dayOfYear 18
  const state = withStation(
    fixtureState({ simTime: firedAt, sectorId: NEREID }), 'station_nereid', { x: 960, z: -380 });
  bus.emit('special500:spectacle', { id: 'SP2-076', sectorId: NEREID });
  special500Spectacle.update(1 / 60, state);
  const step = (t) => {
    state.simTime = firedAt + t;
    state.tick = Math.floor(state.simTime * 60);
    special500Spectacle.update(1 / 60, state);
  };
  step(2);
  const toast = bus.of('audio:cue');
  assert.equal(toast.length, 1, 'one toast, one word, every glass at once');
  assert.equal(toast[0].payload.id, 'ambient_station_crowd', 'the shipped crowd voice');
  assert.equal(toast[0].payload.position.x, 960, 'the toast comes from the station direction');
  step(20);
  const bloom = bus.of('presentation:vfxCue').filter((e) => e.payload.id === 'special500.light');
  assert.equal(bloom.length, 5, 'the bloom passes the glass like slow fireworks');
  step(26);
  const all = bus.of('presentation:vfxCue').filter((e) => e.payload.id === 'special500.light');
  assert.equal(all.length, 7, 'the bloom and the dim pair together');
  const dims = all.slice(5);
  assert.equal(dims.length, 2, "the bar's lights dim on cue");
  assert.ok(dims.every((e) => e.payload.magnitude <= 0.15), 'floor gain: additive cannot darken, so the dim is the lowest the cue light burns');
  assert.equal(bus.of('news:publish').length, 0, 'the toast is the bar\'s, not the board\'s');
  const before = bus.events.length;
  step(60);
  assert.equal(bus.events.length, before, 'one bloom day per year');
});

test('the Clearing wipes the sky in one sweep and the sector exhales at the weather eye', () => {
  const bus = stubBus();
  special500Spectacle.init({ bus });
  const buoy = { x: -340, z: 580 }; // the Murmur Buoy — the Weather eye's post
  const firedAt = 500;
  const state = withPoi(fixtureState({ simTime: firedAt, sectorId: VEIL }), 'poi_veil_murmur_buoy', buoy);
  bus.emit('special500:spectacle', { id: 'SP3-060', sectorId: VEIL });
  special500Spectacle.update(1 / 60, state);
  const step = (t) => {
    state.simTime = firedAt + t;
    state.tick = Math.floor(state.simTime * 60);
    special500Spectacle.update(1 / 60, state);
  };
  step(7);
  const wipe = bus.of('presentation:vfxCue').filter((e) => e.payload.id === 'thermal.mark');
  assert.equal(wipe.length, 1, 'the curtain-light collapses anti-sunward as one wide ring');
  assert.equal(wipe[0].payload.color, '#bfe8f0');
  assert.equal(wipe[0].payload.radius, 160);
  const lights = bus.of('presentation:vfxCue').filter((e) => e.payload.id === 'special500.light');
  assert.equal(lights.length, 7, 'two hard star points and every hull rim light coming back');
  const exhale = bus.of('audio:cue');
  assert.equal(exhale.length, 1, 'the sector audibly relaxes');
  assert.equal(exhale[0].payload.id, 'bolus_breath', 'the shipped breath voice');
  assert.equal(exhale[0].payload.rate, 0.5, 'one low exhale under the mix');
  // The hash-daily firing lands in any sector; where the weather eye does not stand,
  // the beats skip rather than misplace — the wipe stays the compositor leg's business.
  const bus2 = stubBus();
  special500Spectacle.init({ bus: bus2 });
  const forgeSide = fixtureState({ simTime: firedAt, sectorId: VESTA });
  bus2.emit('special500:spectacle', { id: 'SP3-060', sectorId: VESTA });
  special500Spectacle.update(1 / 60, forgeSide);
  forgeSide.simTime = firedAt + 8;
  special500Spectacle.update(1 / 60, forgeSide);
  assert.equal(bus2.of('presentation:vfxCue').length, 0, 'no wipe without its post');
  assert.equal(bus2.of('audio:cue').length, 0, 'no exhale without its post');
});

test('the Full Burn lights every hull off on one tick, holds, and cuts together', () => {
  const bus = stubBus();
  special500Spectacle.init({ bus });
  const firedAt = 10 * CAL_DAY_S + 150; // dayOfYear 10, inside the drill window
  const state = withStation(fixtureState({ simTime: firedAt, sectorId: HELIOS }), 'station_helios', { x: 400, z: 0 });
  bus.emit('special500:spectacle', { id: 'SP1-153', sectorId: HELIOS });
  special500Spectacle.update(1 / 60, state);
  const step = (t) => {
    state.simTime = firedAt + t;
    state.tick = Math.floor(state.simTime * 60);
    special500Spectacle.update(1 / 60, state);
  };
  const bearing = SPECTACLE_LEGS['SP1-153'].bearingRad;
  const lights = () => bus.of('presentation:vfxCue').filter((e) => e.payload.id === 'special500.light');
  step(0.9);
  assert.equal(bus.of('news:publish').length, 1, 'the drill, announced');
  assert.equal(bus.of('news:publish')[0].payload.kind, 'notices');
  assert.equal(lights().length, 0, 'nothing burns before the hour turns');
  step(2);
  const ignition = lights();
  assert.equal(ignition.length, 6, 'every operational hull lights off — tugs, barges, patrol, the lot');
  assert.deepEqual(ignition.map((e) => bearingOffset(e.payload, { x: 400, z: 0 }, bearing)).sort((a, b) => a - b),
    [-100, -60, -20, 20, 60, 100], 'the formation ring reads symmetric about the spine');
  assert.ok(ignition.every((e) => e.payload.magnitude === 1.2), 'one light-off, one brightness: together or not at all');
  assert.equal(bus.of('audio:cue')[0].payload.id, 'sfx_engine_thrust', 'the burn has the shipped fleet voice');
  step(8);
  const hold = lights().slice(6).map((e) => e.payload.magnitude);
  assert.deepEqual(hold, [0.5, 0.45], 'the burn holds ten — dim re-strikes, the honest way to keep it visible');
  step(12);
  assert.equal(lights().length, 9, 'the cut is the last flicker');
  assert.equal(lights()[8].payload.magnitude, 0.3, 'and then every engine is dead on the same tick');
  const before = bus.events.length;
  step(40);
  assert.equal(bus.events.length, before, 'the drill runs once; the grading is the vignette leg\'s business');
});

test('the Broadside stitches flashbulbs across the moon\'s face while the band goes respectfully silent', () => {
  const bus = stubBus();
  special500Spectacle.init({ bus });
  const moonlet = { x: -200, z: -1500 }; // the Towed Moonlet, the moon on a chain
  const firedAt = 31 * CAL_DAY_S + 200; // dayOfYear 31, the shower window
  const state = withPoi(fixtureState({ simTime: firedAt, sectorId: ASHFALL }), 'poi_ashfall_towed_moonlet', moonlet);
  bus.emit('special500:spectacle', { id: 'SP1-155', sectorId: ASHFALL });
  special500Spectacle.update(1 / 60, state);
  const step = (t) => {
    state.simTime = firedAt + t;
    state.tick = Math.floor(state.simTime * 60);
    special500Spectacle.update(1 / 60, state);
  };
  const lights = () => bus.of('presentation:vfxCue').filter((e) => e.payload.id === 'special500.light');
  const plumes = () => bus.of('presentation:vfxCue').filter((e) => e.payload.id === 'thermal.mark');
  step(29);
  assert.equal(lights().length, 11, 'two files of the string so far');
  assert.equal(plumes().length, 2, 'the plumes you can pick out from the lane');
  step(42);
  assert.equal(lights().length, 15, 'the slow string of flashbulbs, end to end');
  assert.equal(plumes().length, 3, 'each impact opens a plume wide and dim');
  assert.ok(plumes().every((e) => e.payload.radius >= 90), 'the plumes read from the lane');
  assert.equal(bus.of('audio:cue').length, 0, 'the band goes uncharacteristically respectful — the row says nothing');
  assert.equal(bus.of('news:publish').length, 0, 'and files nothing');
  const before = bus.events.length;
  step(90);
  assert.equal(bus.events.length, before, 'one broadside per year; the real iron is the debris leg\'s business');
});

test('the Frost Line reads for one breath, the traffic wears frost, and the comms crackle', () => {
  const bus = stubBus();
  special500Spectacle.init({ bus });
  const firedAt = 1200;
  const state = fixtureState({ simTime: firedAt, sectorId: CHARON }); // sectorEntry, first crossing
  bus.emit('special500:spectacle', { id: 'SP1-151', sectorId: CHARON });
  special500Spectacle.update(1 / 60, state);
  const step = (t) => {
    state.simTime = firedAt + t;
    state.tick = Math.floor(state.simTime * 60);
    special500Spectacle.update(1 / 60, state);
  };
  step(11);
  const line = bus.of('presentation:vfxCue').filter((e) => e.payload.id === 'thermal.mark');
  assert.equal(line.length, 1, 'the invisible boundary reads for one breath');
  assert.equal(line[0].payload.color, '#eaf4f8', 'ice-white');
  const frost = bus.of('presentation:vfxCue').filter((e) => e.payload.id === 'special500.light');
  assert.equal(frost.length, 6, 'the frosted traffic walks the sunward side, and your nose whitens');
  step(13);
  const crackle = bus.of('audio:cue');
  assert.equal(crackle.length, 1, 'comms acquire a crackle');
  assert.equal(crackle[0].payload.id, 'sfx_comms_squelch_tail', 'the shipped squelch tail');
  const before = bus.events.length;
  step(40);
  assert.equal(bus.events.length, before, 'the first crossing only; every crossing after is the crossing-check leg\'s business');
});

test('the Ashfall Skim walks the barges starward with their fields on lines behind them', () => {
  const bus = stubBus();
  special500Spectacle.init({ bus });
  const firedAt = 8 * CAL_DAY_S + 350; // dayOfYear 8, inside the skim window
  const state = fixtureState({ simTime: firedAt, sectorId: ASHFALL });
  bus.emit('special500:spectacle', { id: 'SP1-150', sectorId: ASHFALL });
  special500Spectacle.update(1 / 60, state);
  const step = (t) => {
    state.simTime = firedAt + t;
    state.tick = Math.floor(state.simTime * 60);
    special500Spectacle.update(1 / 60, state);
  };
  const zone = zonesForSector(ASHFALL).find((z) => z.id === 'zone_ashfall_belt');
  const bearing = SPECTACLE_LEGS['SP1-150'].bearingRad;
  step(15);
  const barges = bus.of('presentation:vfxCue').filter((e) => e.payload.id === 'special500.light');
  assert.equal(barges.length, 5, 'the file in line-ahead, dipping starward');
  assert.deepEqual(barges.map((e) => bearingOffset(e.payload, zone.center, bearing)),
    [-120, -60, 0, 60, 120], 'the run crosses the seams they feed');
  const fields = bus.of('presentation:vfxCue').filter((e) => e.payload.id === 'thermal.mark');
  assert.equal(fields.length, 2, 'the collector fields drag behind on lines');
  assert.ok(fields.every((e) => ['#e8a060', '#d89050'].includes(e.payload.color)), 'flare-lit');
  const band = bus.of('audio:cue');
  assert.equal(band.length, 2, 'the crew\'s voices, with the calm of people who do this twice a shift');
  assert.deepEqual(band.map((e) => e.payload.rate), [1, 0.95]);
  step(21);
  const wake = bus.of('presentation:vfxCue').filter((e) => e.payload.id === 'special500.light')[5];
  assert.ok(wake.payload.magnitude < 1, 'the sheared wake reads as one brief lane behind the last barge');
  const before = bus.events.length;
  step(60);
  assert.equal(bus.events.length, before, 'one skim per year; the speed lane is the machinery leg\'s business');
});

test('the Lightning Farmers run strikes down the line and the capacitor bank bangs', () => {
  const bus = stubBus();
  special500Spectacle.init({ bus });
  const orchard = { x: -220, z: 700 };
  const firedAt = 700;
  const state = withPoi(fixtureState({ simTime: firedAt, sectorId: VEIL }), 'poi_veil_black_orchard', orchard);
  bus.emit('special500:spectacle', { id: 'SP1-157', sectorId: VEIL });
  special500Spectacle.update(1 / 60, state);
  const step = (t) => {
    state.simTime = firedAt + t;
    state.tick = Math.floor(state.simTime * 60);
    special500Spectacle.update(1 / 60, state);
  };
  const bearing = SPECTACLE_LEGS['SP1-157'].bearingRad;
  const lights = () => bus.of('presentation:vfxCue').filter((e) => e.payload.id === 'special500.light');
  step(6);
  const strike = lights();
  assert.equal(strike.length, 6, 'the cell grounds, the strike runs the line, the bank takes it');
  const run = lights().slice(1, 5).map((e) => bearingOffset(e.payload, orchard, bearing));
  assert.deepEqual(run, [-60, -20, 20, 60], 'the strike walks the collector line rock to rock');
  assert.ok(lights()[0].payload.magnitude > 1, 'the grounding is the hard beat');
  let bangs = bus.of('audio:cue').filter((e) => e.payload.id === 'sfx_mining_seismic_pulse');
  assert.equal(bangs.length, 1, 'a bang you feel in your teeth');
  step(21);
  bangs = bus.of('audio:cue').filter((e) => e.payload.id === 'sfx_mining_seismic_pulse');
  assert.equal(bangs.length, 2, 'the second strike harvests too');
  assert.ok(bangs[1].payload.rate < bangs[0].payload.rate, 'the bank settles lower than the last');
  const chatter = bus.of('audio:cue').filter((e) => e.payload.id === 'sfx_bark_radio');
  assert.equal(chatter.length, 2, 'the farmers talk weather because the weather is the whole conversation');
  const before = bus.events.length;
  step(60);
  assert.equal(bus.events.length, before, 'one harvest per firing; the vendor is the vendor leg\'s business');
});

test('the Merger Convoy meets lights-to-lights, reads the register, and walks on as one column', () => {
  const bus = stubBus();
  special500Spectacle.init({ bus });
  const beacon = { x: 3040, z: -920 }; // the Throughline weigh beacon, the junction
  const firedAt = 900;
  const state = withPoi(fixtureState({ simTime: firedAt, sectorId: CERES }), 'poi_ceres_throughline', beacon);
  bus.emit('special500:spectacle', { id: 'SP1-052', sectorId: CERES });
  special500Spectacle.update(1 / 60, state);
  const step = (t) => {
    state.simTime = firedAt + t;
    state.tick = Math.floor(state.simTime * 60);
    special500Spectacle.update(1 / 60, state);
  };
  const bearing = SPECTACLE_LEGS['SP1-052'].bearingRad;
  const lights = () => bus.of('presentation:vfxCue').filter((e) => e.payload.id === 'special500.light');
  step(3);
  const leads = lights();
  assert.equal(leads.length, 2, 'two convoys, one junction');
  assert.deepEqual(leads.map((e) => bearingOffset(e.payload, beacon, bearing)), [-40, 40],
    'lights-to-lights: the leads meet on the lane bearing');
  step(7);
  const register = bus.of('audio:cue');
  assert.equal(register.length, 2, 'the manifest exchange, voice and answer');
  assert.deepEqual(register.map((e) => e.payload.rate), [1, 0.95], 'read like a marriage register: one voice, then the other');
  step(10);
  assert.deepEqual(lights().slice(2).map((e) => bearingOffset(e.payload, beacon, bearing)), [-8, 8],
    'the old leads fall in side by side');
  step(21);
  assert.equal(lights().length, 9, 'one column walking on');
  assert.equal(bus.of('news:publish').length, 0, 'the register rides the band, not the wire');
  const before = bus.events.length;
  step(60);
  assert.equal(bus.events.length, before, 'one merger per seed; the raid math is the convoy script\'s business');
});

test('the Ocean Glint Walk slides the bead across the band and pinches out at the limb, in silence', () => {
  const bus = stubBus();
  special500Spectacle.init({ bus });
  const firedAt = 6 * CAL_DAY_S + 435; // dayOfYear 6, inside the authored window
  const state = fixtureState({ simTime: firedAt, sectorId: TETHYS });
  bus.emit('special500:spectacle', { id: 'SP3-036', sectorId: TETHYS });
  special500Spectacle.update(1 / 60, state);
  const step = (t) => {
    state.simTime = firedAt + t;
    state.tick = Math.floor(state.simTime * 60);
    special500Spectacle.update(1 / 60, state);
  };
  const zone = zonesForSector(TETHYS).find((z) => z.id === 'zone_tethys_anvil');
  const bearing = SPECTACLE_LEGS['SP3-036'].bearingRad;
  const lights = () => bus.of('presentation:vfxCue').filter((e) => e.payload.id === 'special500.light');
  step(2);
  const bead = lights();
  assert.equal(bead.length, 1, 'a single burning point of reflected sun');
  assert.equal(bearingOffset(bead[0].payload, zone.center, bearing), -150, 'it arrives at the limb');
  step(27);
  const walk = lights().map((e) => bearingOffset(e.payload, zone.center, bearing));
  assert.deepEqual(walk, [-150, -150, -90, -30, 30, 90, 150], 'the bead slides across the ocean band');
  step(31);
  const road = bus.of('presentation:vfxCue').filter((e) => e.payload.id === 'thermal.mark');
  assert.equal(road.length, 1, 'the golden road of specular glint widens');
  assert.equal(road[0].payload.color, '#e8c860');
  step(36);
  const last = lights()[7];
  assert.equal(bearingOffset(last.payload, zone.center, bearing), 160, 'the pinch out at the limb');
  assert.ok(last.payload.magnitude < 1, 'and the light dies small');
  assert.equal(bus.of('audio:cue').length, 0, 'sun-angle geometry makes no sound');
  const before = bus.events.length;
  step(60);
  assert.equal(bus.events.length, before, 'once a day, exactly as long as the geometry takes');
});

test('Moonrise walks the lit rim across the Anvil over four minutes and keeps the coin dark', () => {
  const bus = stubBus();
  special500Spectacle.init({ bus });
  const firedAt = 30 * CAL_DAY_S + 150; // dayOfYear 30, inside the crossing window
  const state = fixtureState({ simTime: firedAt, sectorId: TETHYS });
  bus.emit('special500:spectacle', { id: 'SP3-028', sectorId: TETHYS });
  special500Spectacle.update(1 / 60, state);
  const step = (t) => {
    state.simTime = firedAt + t;
    state.tick = Math.floor(state.simTime * 60);
    special500Spectacle.update(1 / 60, state);
  };
  const zone = zonesForSector(TETHYS).find((z) => z.id === 'zone_tethys_anvil');
  const bearing = SPECTACLE_LEGS['SP3-028'].bearingRad;
  const lights = () => bus.of('presentation:vfxCue').filter((e) => e.payload.id === 'special500.light');
  const rims = () => bus.of('presentation:vfxCue').filter((e) => e.payload.id === 'thermal.mark');
  step(5);
  assert.equal(rims().length, 1, 'first contact: the leading rim reads against the disc');
  step(111);
  assert.equal(lights().length, 3, 'the rim walks the chord sparse as a clock hand');
  assert.ok(rims().length === 1, 'no second ring mid-crossing');
  step(225);
  assert.equal(lights().length, 5, 'the rim\'s whole chord');
  assert.equal(rims().length, 2, 'last contact: the rim pinches off the limb');
  assert.deepEqual(lights().map((e) => bearingOffset(e.payload, zone.center, bearing)),
    [-80, -40, 0, 40, 80], 'the crossing runs the face, not the belt');
  assert.equal(bus.of('audio:cue').length, 0, 'a moonrise is signed, not announced');
  assert.equal(bus.of('news:publish').length, 0, 'and posted nowhere');
  const before = bus.events.length;
  step(300);
  assert.equal(bus.events.length, before, 'one moonrise per year — no eclipse in it, no omen');
});

test('the Eighth Bell rings once with nothing driving it, and the silence after is the answer', () => {
  const bus = stubBus();
  special500Spectacle.init({ bus });
  const firedAt = 4 * CAL_DAY_S + 100; // a clean pulse receipt, mid-shift
  const state = fixtureState({ simTime: firedAt, sectorId: VESTA });
  bus.emit('special500:spectacle', { id: 'SP2-124', sectorId: VESTA });
  special500Spectacle.update(1 / 60, state);
  const step = (t) => {
    state.simTime = firedAt + t;
    state.tick = Math.floor(state.simTime * 60);
    special500Spectacle.update(1 / 60, state);
  };
  step(3);
  const note = bus.of('audio:cue');
  assert.equal(note.length, 1, 'one unscheduled note');
  assert.equal(note[0].payload.id, 'sfx_eighth_bell_strike', 'the shipped strike voice');
  assert.equal(note[0].payload.rate, 1, 'at written pitch — it is the timing that is unscheduled');
  const ring = bus.of('presentation:vfxCue').filter((e) => e.payload.id === 'thermal.mark');
  assert.equal(ring.length, 1, 'one ring rolling out with no pulse behind it');
  assert.equal(ring[0].payload.color, '#c8d8e8');
  assert.equal(bus.of('news:publish').length, 0, 'the Choir\'s channel is not the news wire');
  const before = bus.events.length;
  step(20);
  assert.equal(bus.events.length, before, 'it does not do that. It has never done that.');
});

test('the Frequency Nobody Owns plays the Vesper phrase two octaves down and stops mid-phrase when the murk breaks', () => {
  const bus = stubBus();
  special500Spectacle.init({ bus });
  const firedAt = 300;
  const state = fixtureState({ simTime: firedAt, sectorId: VEIL }); // sectorEntry into the murk
  bus.emit('special500:spectacle', { id: 'SP2-026', sectorId: VEIL });
  special500Spectacle.update(1 / 60, state);
  const step = (t) => {
    state.simTime = firedAt + t;
    state.tick = Math.floor(state.simTime * 60);
    special500Spectacle.update(1 / 60, state);
  };
  step(8);
  const phrase = bus.of('audio:cue');
  assert.equal(phrase.length, 3, 'LOW HIGH MIDDLE: the whole phrase, nothing else');
  assert.deepEqual(phrase.map((e) => e.payload.rate), [0.5, 0.75, 0.6], 'the Vesper phrase, two octaves down');
  for (const note of phrase) {
    assert.equal(note.payload.id, 'sfx_vesper_resonator_0', 'one voice — and it is not Vesper\'s three');
    assert.equal(note.payload.gain, 0.15, 'lullaby-grade');
  }
  assert.equal(bus.of('presentation:vfxCue').length, 0, 'nothing to see: the murk keeps its own counsel');
  assert.equal(bus.of('news:publish').length, 0, 'nobody owns the frequency, so nobody posts it');
  step(38);
  assert.equal(bus.of('audio:cue').length, 6, 'the phrase recurs while the murk holds the pilot');
  state.world.currentSectorId = CHARON;
  step(45);
  assert.equal(bus.of('audio:cue').length, 6, 'the murk breaks the phrase between cycles — the loop dies where it stands, like a door closed gently from the other side');
  step(80);
  assert.equal(bus.of('audio:cue').length, 6, 'and nothing plays again');
});

test('the Choir Tender’s bell rings one note and every hull that answers arrives in harmony', () => {
  const bus = stubBus();
  special500Spectacle.init({ bus });
  const tender = { x: 120, z: -520 }; // the Relief-Freighter Choir-Tender, the hospital wreck
  const firedAt = 5 * CAL_DAY_S + 90; // the scheduled hymn window
  const state = withPoi(fixtureState({ simTime: firedAt, sectorId: HELIOS }), 'poi_helios_choir_tender', tender);
  bus.emit('special500:spectacle', { id: 'SP2-176', sectorId: HELIOS });
  special500Spectacle.update(1 / 60, state);
  const step = (t) => {
    state.simTime = firedAt + t;
    state.tick = Math.floor(state.simTime * 60);
    special500Spectacle.update(1 / 60, state);
  };
  step(4);
  const notes = bus.of('audio:cue');
  assert.equal(notes.length, 4, 'the note, and the answers');
  assert.equal(notes[0].payload.id, 'sfx_morrow_bell_0', 'the dead tender\'s own bell');
  assert.equal(notes[0].payload.rate, 0.84, 'the lullaby\'s first note, low and soft');
  assert.deepEqual(notes.slice(1).map((e) => e.payload.rate), [1.26, 1.68, 0.84],
    'the harmony: the fifth, the octave, the unison under');
  assert.ok(notes.slice(1).every((e) => e.payload.gain < notes[0].payload.gain),
    'mid-shift: the answers carry, they do not lead');
  assert.equal(bus.of('presentation:vfxCue').length, 0, 'no light is filed either');
  assert.equal(bus.of('news:publish').length, 0, 'no explanation filed');
  const before = bus.events.length;
  step(30);
  assert.equal(bus.events.length, before, 'one note a day; the codex page is its own leg\'s business');
});
