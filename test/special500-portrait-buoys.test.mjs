// special-500 Phase 2 — SP1-193 "The Portrait Buoys" (vendor leg).
//
// The corridor line is permanent world furniture rebuilt from authored data plus the record
// that is true now. These proofs pin: the authored buoy positions are clear of every live
// station bubble, gate approach, asteroid field cluster and hostile-zone spawn center (so a
// sector-table edit can never strand a buoy inside a berth), the corridor matches the catalog
// entry's sectors, a sector entry spawns the line through the standard story-prop contract
// with the painter's captions and the shared weather, fame reads from the deed record in
// weight order with the player's own hull always the newest frame, a sector leave despawns
// the line, the same sector never double-spawns, and the commission (payment in a story)
// settles through the deed record and the plain flag — once, and only with a story to take.
import test from 'node:test';
import assert from 'node:assert/strict';

import { SECTORS } from '../src/data/sectors.js';
import { zonesForSector } from '../src/data/sectorZones.js';
import { SPECIAL500_ALL } from '../src/data/special500/index.js';
import {
  PORTRAIT_BUOY_KIND,
  PORTRAIT_BUOY_SECTORS,
  PORTRAIT_PAINTER,
  shroudWeather,
} from '../src/data/special500/portraitBuoyLine.js';
import { special500PortraitBuoys, composeShroudLine } from '../src/systems/special500PortraitBuoys.js';
import { recordDeed } from '../src/systems/deedRecord.js';

const CAL_DAY_S = 600;

function stubBus() {
  const listeners = new Map();
  const events = [];
  return {
    events,
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
    of: (name) => events.filter((e) => e.name === name),
  };
}

function fixtureState({ simTime = 2 * CAL_DAY_S, sectorId = null, flags = {}, deeds = [], ui = {} } = {}) {
  const state = {
    simTime,
    tick: Math.floor(simTime * 60),
    meta: { seed: 20261104 },
    story: { flags: { ...flags } },
    world: { currentSectorId: sectorId },
    player: { sectorId },
    ui,
    entities: new Map(),
  };
  for (const deed of deeds) recordDeed(state, deed);
  return state;
}

/** Recording helpers: the entity lifecycle the claim-beacon owner consumes. */
function stubHelpers() {
  const helpers = {
    spawned: [],
    removed: [],
    state: null,
    spawnEntity(spec) {
      const ent = { id: helpers._nextId++, ...spec };
      helpers.spawned.push(ent);
      helpers.state.entities.set(ent.id, ent);
      return ent;
    },
    removeEntity(id) {
      helpers.removed.push(id);
      helpers.state.entities.delete(id);
    },
    _nextId: 1,
  };
  return helpers;
}

function boot(bus, state, helpers) {
  helpers.state = state;
  const system = Object.create(special500PortraitBuoys);
  system.init({ bus, state, helpers });
  return system;
}

test('the authored buoy positions are clear of the live world tables', () => {
  const entry = SPECIAL500_ALL.find((e) => e.id === 'SP1-193');
  assert.ok(entry, 'the catalog entry exists');
  for (const row of PORTRAIT_BUOY_SECTORS) {
    const sector = SECTORS.find((s) => s.id === row.sectorId);
    assert.ok(sector, `${row.sectorId} exists in the live sector graph`);
    assert.ok(entry.sectors.includes(row.sectorId), `${row.sectorId} is the entry's sector`);
    const zones = zonesForSector(row.sectorId);
    assert.ok(row.buoys.length >= 3, `${row.sectorId} hangs at least three frames`);
    for (const b of row.buoys) {
      const dSt = Math.min(...(sector.stations || []).map((st) => Math.hypot(st.pos.x - b.x, st.pos.z - b.z)));
      assert.ok(dSt >= 1200, `${row.sectorId} buoy ${b.x},${b.z} is ${Math.round(dSt)} WU from the nearest berth (>= 1200)`);
      const dGt = (sector.gates || []).length
        ? Math.min(...sector.gates.map((g) => Math.hypot(g.pos.x - b.x, g.pos.z - b.z)))
        : Infinity;
      assert.ok(dGt >= 600, `${row.sectorId} buoy clears gate approaches`);
      const dFd = (sector.fields || []).length
        ? Math.min(...sector.fields.map((f) => Math.hypot(f.center.x - b.x, f.center.z - b.z) - (f.clusterRadius || 0)))
        : Infinity;
      assert.ok(dFd >= 450, `${row.sectorId} buoy clears asteroid field clusters`);
      const znHit = zones.filter((z) => Math.hypot(z.center.x - b.x, z.center.z - b.z) < 200);
      assert.equal(znHit.length, 0, `${row.sectorId} buoy is not on a hostile-zone spawn center`);
    }
  }
  assert.equal(PORTRAIT_PAINTER.stationId, 'station_reach', 'the painter is findable at a real berth');
  const reach = SECTORS.find((s) => s.id === 'sector_io_reach').stations.find((st) => st.id === 'station_reach');
  assert.ok(reach, 'Reach Station exists in Io Reach');
});

test('a corridor sector entry spawns the line through the story-prop contract, with the painter\'s captions', () => {
  const bus = stubBus();
  const helpers = stubHelpers();
  const state = fixtureState({ sectorId: null });
  const system = boot(bus, state, helpers);
  state.world.currentSectorId = 'sector_helios_prime';
  system.update(0.5, state);
  assert.equal(helpers.spawned.length, 3, 'two authored frames plus your own: the line hangs');
  for (const ent of helpers.spawned) {
    assert.equal(ent.type, 'beacon', 'the renderer\'s story-prop buoy body');
    assert.equal(ent.data.storyPropKind, PORTRAIT_BUOY_KIND);
    assert.equal(ent.data.parentType, 'story_prop');
    assert.equal(ent.data.masslineTetherable, true, 'tetherable like every story buoy');
    assert.ok(ent.data.scanLabel.startsWith('SHROUD — '), 'the painter\'s caption is the scan read');
    assert.ok(ent.data.scanLabel.includes(shroudWeather(2)), 'the shared weather reads on the frame');
  }
  assert.ok(helpers.spawned[helpers.spawned.length - 1].data.scanLabel.includes('your hull, half-finished'),
    'the newest frame is your hull, paint wet');
  // The same sector again: no double spawn.
  system.update(0.5, state);
  assert.equal(helpers.spawned.length, 3, 'the line does not re-hang on an unchanged sector');
  // Leaving despawns the whole line.
  state.world.currentSectorId = 'sector_vesta_forge';
  system.update(0.5, state);
  assert.equal(helpers.removed.length, 3, 'the helios line came down whole');
  assert.equal(helpers.spawned.length, 6, 'vesta hangs its own line');
});

test('fame reads from the deed record: sector deeds hang in weight order, your hull still the newest frame', () => {
  const state = fixtureState({
    sectorId: 'sector_charon_expanse',
    simTime: 3 * CAL_DAY_S,
    deeds: [
      { kind: 'pod_rescued', id: 'deed_small', weight: 2, sectorId: 'sector_charon_expanse', subject: 'the tow that held' },
      { kind: 'ace_defeated', id: 'deed_big', weight: 4, sectorId: 'sector_charon_expanse', subject: 'the ace that fell' },
      { kind: 'ore_flood', id: 'deed_other_sector', weight: 9, sectorId: 'sector_vesta_forge' },
    ],
  });
  const line = composeShroudLine(state, 'sector_charon_expanse');
  assert.equal(line.length, 5, 'two authored frames, two famous hulls, your own');
  assert.equal(line[0].kind, 'base');
  assert.equal(line[1].kind, 'base');
  assert.equal(line[2].kind, 'deed');
  assert.equal(line[2].deedId, 'deed_big', 'the loudest deed hangs first — fame order');
  assert.equal(line[3].deedId, 'deed_small');
  assert.equal(line[4].kind, 'own', 'your hull is always the newest frame');
  assert.equal(line[4].commissioned, false);
  assert.ok(line[4].caption.includes('half-finished'));
});

test('the commission settles once through the record and the plain flag, and only with a story to take', () => {
  const bus = stubBus();
  const helpers = stubHelpers();
  const state = fixtureState({
    sectorId: 'sector_io_reach',
    ui: { docked: true, dockedStationId: 'station_reach' },
    deeds: [{ kind: 'pod_rescued', id: 'deed_story', weight: 3, sectorId: 'sector_io_reach', subject: 'the pod that made it' }],
  });
  const system = boot(bus, state, helpers);
  // Wrong berth: nothing settles.
  assert.equal(system._onTalkContact({ canonicalKey: 'painter', stationId: 'station_tethys', choiceId: 'commission' }), null);
  // Right berth, right verb: the painter takes the story.
  const result = system._onTalkContact({ canonicalKey: 'painter', stationId: 'station_reach', choiceId: 'commission' });
  assert.equal(result.outcome, 'settled');
  assert.equal(result.deedId, 'deed_story', 'the story taken is the record\'s best');
  assert.equal(state.story.record.deeds.find((d) => d.id === 'deed_story').told, 1, 'the deed is told to the painter');
  assert.equal(state.story.flags.portrait_commissioned > 0, true, 'the commission flag is written');
  assert.equal(bus.of('special500:portraitCommission').length, 1, 'one receipt');
  assert.equal(bus.of('comms:log').some((e) => e.payload.from === 'Vesper'), true, 'the painter signs the log, not the canvas');
  // One commission per game.
  const again = system._onTalkContact({ canonicalKey: 'painter', stationId: 'station_reach', choiceId: 'commission' });
  assert.equal(again.outcome, 'already');
  assert.equal(bus.of('special500:portraitCommission').length, 2);
  assert.equal(state.story.record.deeds.find((d) => d.id === 'deed_story').told, 1, 'the story was not taken twice');
  // The finished frame reads on the next rebuild.
  const line = composeShroudLine(state, 'sector_io_reach');
  assert.equal(line[line.length - 1].commissioned, true);
  assert.ok(line[line.length - 1].caption.includes('finished'), 'the newest frame is done');
});

test('a pilot with no record cannot buy the commission: the painter refuses intentions', () => {
  const bus = stubBus();
  const helpers = stubHelpers();
  const state = fixtureState({
    sectorId: null,
    ui: { docked: true, dockedStationId: 'station_reach' },
  });
  const system = boot(bus, state, helpers);
  const result = system._onTalkContact({ canonicalKey: 'painter', stationId: 'station_reach', choiceId: 'commission' });
  assert.equal(result.outcome, 'no_story', 'nothing worth the canvas yet');
  assert.equal(state.story.flags.portrait_commissioned, undefined, 'no flag without a story');
  assert.equal(bus.of('comms:log').length, 0, 'no signed log line for an empty record');
});

test('a load into a corridor sector hangs the line fresh, and the record is re-read each visit', () => {
  const bus = stubBus();
  const helpers = stubHelpers();
  // Continue: the state boots already inside Ashfall.
  const state = fixtureState({ sectorId: 'sector_ashfall_reach', simTime: 9 * CAL_DAY_S });
  const system = boot(bus, state, helpers);
  system.update(0.5, state);
  assert.equal(helpers.spawned.length, 3, 'the line re-hangs on load: two authored frames and yours');
  assert.ok(helpers.spawned[helpers.spawned.length - 1].data.scanLabel.includes('your hull, half-finished'));
  // New fame between visits changes the line without touching the authored frames.
  recordDeed(state, { kind: 'pod_rescued', id: 'deed_late', weight: 3, sectorId: 'sector_ashfall_reach' });
  state.world.currentSectorId = 'sector_helios_prime';
  system.update(0.5, state);
  state.world.currentSectorId = 'sector_ashfall_reach';
  system.update(0.5, state);
  const ashfall = helpers.spawned.slice(3).filter((e) => e.data.portraitSectorId === 'sector_ashfall_reach');
  assert.equal(ashfall.length, 4, 'the famous hull joined the line');
});
