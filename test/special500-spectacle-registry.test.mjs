// special-500 Phase 2: the spectacle leg family. The director emits one
// 'special500:spectacle' per spectacle-channel firing; the registered
// special500Spectacle system resolves the id against the presentation registry
// (src/data/special500/spectacleLegs.js) and plays the authored moment through the
// existing owner seams (presentation:vfxCue / news:publish). These proofs pin: the
// registry validates clean against the live catalog, the manifest rows, the director's
// exactly-once emission (refire + yearly re-arm), both pilot rows mapping to their
// templates with params through the owner contract, the Echo Wreck's simTime-modulo
// loop with its dark half, unknown-id degradation, and reduced-motion riding the cue
// payload (the owner seam decides the reduced variant — no bypass here).
import test from 'node:test';
import assert from 'node:assert/strict';

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
  // Anchor zones are real authored zones in their sectors.
  for (const [id, row] of Object.entries(SPECTACLE_LEGS)) {
    const zone = zonesForSector(row.anchor.sectorId).find((z) => z.id === row.anchor.zoneId);
    assert.ok(zone, `${id} anchor zone ${row.anchor.zoneId} resolves in ${row.anchor.sectorId}`);
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
