// VERB-32 — a module on the fit screen says what the sim already does with it.
//
// The sentences are the words airSentenceForId prints. The numbers under them are the
// live module record and the live ping law, not a copy of the sentence table.

import test from 'node:test';
import assert from 'node:assert/strict';

import { MODULES } from '../src/data/modules.js';
import { mulberry32, hash32 } from '../src/core/rng.js';
import { materializeAlienEcology, tickAlienEcology } from '../src/systems/alienEcology.js';
import { effectiveAnomalyRequiredPings } from '../src/systems/scanner.js';
import { airSentenceForId } from '../src/ui/ship/fitReadout.js';

function mod(id) {
  return MODULES.find((row) => row.id === id);
}

test('seed 4242 every module says what it already does', () => {
  const missing = MODULES.filter((row) => typeof row.sentence !== 'string' || !row.sentence.trim() || row.sentence.includes('\n'));
  assert.deepEqual(missing.map((row) => row.id), []);

  const small = mod('mod_filter_stack_s');
  const heavy = mod('mod_filter_stack_m');
  assert.equal(small.mods.bioFilterMult, 0.35);
  assert.equal(heavy.mods.bioFilterMult, 0.20);
  assert.match(airSentenceForId(small.id), /fouls the hull more slowly/);
  assert.match(airSentenceForId(heavy.id), /much more slowly/);

  const notch = mod('unique_first_notch_marker');
  const suite = mod('mod_triangulation_suite_s');
  assert.equal(notch.mods.anomalyPingReduction, 2);
  assert.equal(suite.mods.anomalyPingReduction, 1);
  assert.equal(effectiveAnomalyRequiredPings(undefined, notch.mods.anomalyPingReduction), 2);
  assert.equal(
    effectiveAnomalyRequiredPings(undefined, notch.mods.anomalyPingReduction),
    effectiveAnomalyRequiredPings(undefined, suite.mods.anomalyPingReduction),
  );
  const notchLine = airSentenceForId(notch.id);
  assert.match(notchLine, /two scans/);
  assert.equal(/one scan/i.test(notchLine), false);

  const mask = mod('unique_double_entry_mask');
  const scrambler = mod('mod_sensor_scrambler_m');
  assert.ok(mask.mods.scannerCloak > scrambler.mods.scannerCloak);
  assert.ok(mask.mods.scanRangeMult > 1);
  assert.match(airSentenceForId(mask.id), /quieter than a stock scrambler/);

  assert.equal(mod('mod_quarantine_locker_s').mods.quarantineLocker, true);
  assert.match(airSentenceForId('mod_quarantine_locker_s'), /does not foul the hull/);
  assert.equal(mod('mod_precursor_handshake_s').mods.precursorHandshake, true);
  assert.match(airSentenceForId('mod_precursor_handshake_s'), /half the time/);
});

function ecologyWorld(sectorId, moduleId, pos) {
  const state = {
    meta: { seed: 4242 },
    simTime: 0,
    playerId: 1,
    entities: new Map(),
    entityList: [],
    player: { cargo: { items: {}, usedVolume: 0, usedMass: 0, capVolume: 50, capMass: 50 } },
    world: { currentSectorId: sectorId, sectors: {} },
  };
  const player = {
    id: 1, type: 'player', pos: { x: pos.x, z: pos.z }, vel: { x: 0, z: 0 },
    data: { fittings: moduleId ? [moduleId] : [] },
  };
  state.entities.set(1, player);
  state.entityList.push(player);
  const log = [];
  const active = { dressing: [], pois: [] };
  const world = {
    state,
    helpers: {
      mulberry32,
      hash32,
      spawnEntity: (spec) => {
        const e = { ...spec, alive: true, pos: { x: spec.pos.x, z: spec.pos.z } };
        e.id = state.entities.size + 100;
        state.entities.set(e.id, e);
        state.entityList.push(e);
        return e;
      },
      removeEntity: (id) => {
        const e = state.entities.get(id);
        if (e) e.alive = false;
      },
    },
    _toGlobal: (local) => ({ x: local.x, z: local.z }),
    _toLocal: (p) => ({ x: p.x, z: p.z }),
    active,
    bus: { emit: (type, payload) => log.push({ type, payload }) },
  };
  return { state, world, active, log, player };
}

test('seed 4242 the three field instruments say what the field actually shows', () => {
  const marked = ecologyWorld('sector_charon_expanse', 'mod_filament_contrast_s', { x: 0, z: 0 });
  materializeAlienEcology(marked.world, { id: 'sector_charon_expanse' }, marked.active);
  const markedNames = marked.active.pois.filter((poi) => poi && poi.phantom).map((poi) => poi.name);
  assert.ok(markedNames.includes('UNRESOLVED SIGNAL ?'), markedNames.join(' | '));
  const plain = ecologyWorld('sector_charon_expanse', null, { x: 0, z: 0 });
  materializeAlienEcology(plain.world, { id: 'sector_charon_expanse' }, plain.active);
  const plainNames = plain.active.pois.filter((poi) => poi && poi.phantom).map((poi) => poi.name);
  assert.ok(plainNames.includes('UNRESOLVED SIGNAL'));
  assert.equal(plainNames.some((name) => String(name).includes('?')), false);
  const contrastLine = airSentenceForId('mod_filament_contrast_s');
  assert.match(contrastLine, /question mark/);
  assert.equal(/mirror|clean return/i.test(contrastLine), false);

  const mapped = ecologyWorld('sector_sker_haven', 'mod_host_cartography_s', { x: -1500, z: -1600 });
  tickAlienEcology(mapped.world, 0.5);
  const hostToast = mapped.log.find((row) => row.type === 'toast' && row.payload && String(row.payload.text).includes('host under the growth'));
  assert.ok(hostToast, mapped.log.map((row) => row.type).join(','));
  assert.match(hostToast.payload.text, /The Harvest Deep/);
  const hostLine = airSentenceForId('mod_host_cartography_s');
  assert.match(hostLine, /names the hull under the growth/);
  assert.equal(/chart/i.test(hostLine), false);

  const metered = ecologyWorld('sector_sker_haven', 'mod_field_coherence_meter', { x: -1500, z: -1600 });
  tickAlienEcology(metered.world, 1);
  const note = metered.log.find((row) => row.type === 'comms:log' && row.payload && row.payload.from === 'Coherence meter');
  assert.ok(note, metered.log.map((row) => `${row.type}:${row.payload && row.payload.from}`).join(','));
  assert.match(note.payload.text, /The Harvest Deep is still coherent/);
  const meterLine = airSentenceForId('mod_field_coherence_meter');
  assert.match(meterLine, /flight log/);
  assert.match(meterLine, /still coherent/);
  assert.equal(/chart|HUD/i.test(meterLine), false);
  tickAlienEcology(metered.world, 1);
  const notes = metered.log.filter((row) => row.type === 'comms:log' && row.payload && row.payload.from === 'Coherence meter');
  assert.equal(notes.length, 1);
});
