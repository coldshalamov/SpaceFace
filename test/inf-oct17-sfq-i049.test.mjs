// SFQ-I049: a sector scan must leave a still-disguised Black Sail reading as debris,
// and a fitted bio-scan head counts when fauna names refresh. Seed 4242.
// Positive: the targeted sail resolves, and R2 (earned plus the head) prints species names.
// Quiet: an untargeted scan keeps the debris read, and R0/R1 never print a species name.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ALIEN_SITES, scannerBiologyLabel } from '../src/data/alienEcology.js';
import { faunaSpeciesById } from '../src/data/alienFauna.js';
import { ensureAlienEcologyState } from '../src/data/alienEcologyState.js';
import { mulberry32, hash32 } from '../src/core/rng.js';
import {
  effectiveRevelation,
  handleAlienEcologyEvent,
  materializeAlienEcology,
  refreshAlienLabels,
  setRevelation,
} from '../src/systems/alienEcology.js';

const SEED = 4242;
const SECTOR = 'sector_charon_expanse';

function makeState() {
  return {
    meta: { seed: SEED },
    simTime: 0,
    rng: mulberry32(SEED),
    playerId: 1,
    entities: new Map(),
    entityList: [],
    player: { cargo: { items: {}, usedVolume: 0, usedMass: 0, capVolume: 50, capMass: 50 } },
    world: { currentSectorId: SECTOR, sectors: {}, rng: mulberry32(SEED) },
  };
}

function makeWorld(state) {
  return {
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
    _toLocal: (pos) => ({ x: pos.x, z: pos.z }),
    active: { dressing: [], pois: [] },
    bus: { emit: () => {} },
  };
}

function fitModules(state, moduleIds) {
  let playerEnt = state.entities.get(state.playerId);
  if (!playerEnt) {
    playerEnt = {
      id: state.playerId, type: 'player', pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
      data: { fittings: [] },
    };
    state.entities.set(state.playerId, playerEnt);
    state.entityList.push(playerEnt);
  }
  playerEnt.data.fittings = moduleIds;
  return playerEnt;
}

function faunaOf(state, speciesId) {
  return state.entityList.filter((e) => e.alive !== false && e.type === 'fauna'
    && e.data && e.data.ecology && e.data.ecology.speciesId === speciesId);
}

function materialize(world, site) {
  materializeAlienEcology(world, { id: site.sectorId }, { dressing: [], pois: [] }, [site]);
}

test('seed 4242: a sector scan leaves a disguised Black Sail reading as debris', () => {
  const state = makeState();
  const world = makeWorld(state);
  materialize(world, ALIEN_SITES.empty_skin);
  const sails = faunaOf(state, 'black_sail');
  assert.ok(sails.length >= 2, 'the Empty Skin casts two black sails');
  for (const sail of sails) {
    assert.equal(sail.data.ecology.disguised, true);
    assert.equal(sail.data.scanLabel, 'debris');
    assert.equal(sail.data.name, 'Debris field fragment');
    assert.equal(sail.data.scannerSignalKind, 'debris');
  }

  refreshAlienLabels(world);
  for (const sail of sails) {
    assert.equal(sail.data.scanLabel, 'debris', 'a label refresh must not overwrite a disguise');
    assert.equal(sail.data.name, 'Debris field fragment');
    assert.equal(sail.data.ecology.disguised, true);
  }

  const rec = ensureAlienEcologyState(state).sites.empty_skin;
  assert.ok(rec, 'the site record exists');
  rec.state = 'awake';
  handleAlienEcologyEvent(world, 'scan:completed', { sectorId: SECTOR, found: true });
  assert.equal(ensureAlienEcologyState(state).revelation, 1, 'the sector scan taught one rung');
  for (const sail of sails) {
    assert.equal(sail.data.ecology.disguised, true, 'an untargeted scan does not peel the disguise');
    assert.equal(sail.data.scanLabel, 'debris');
    assert.equal(sail.data.name, 'Debris field fragment');
    assert.equal(sail.data.scannerSignalKind, 'debris');
    assert.notEqual(sail.data.name, 'Black Sail');
  }

  const target = sails[0];
  handleAlienEcologyEvent(world, 'scan:completed', {
    sectorId: SECTOR, targetId: target.id, found: true,
  });
  assert.equal(target.data.ecology.disguised, false);
  assert.equal(target.data.scanLabel, scannerBiologyLabel(1, 'fauna'));
  assert.equal(target.data.name, scannerBiologyLabel(1, 'fauna'));
  assert.notEqual(target.data.name, 'Black Sail');
  assert.equal(sails[1].data.ecology.disguised, true);
  assert.equal(sails[1].data.scanLabel, 'debris');
  assert.equal(sails[1].data.name, 'Debris field fragment');
});

test('seed 4242: a fitted bio-scan head refreshes fauna and rupture-juvenile names', () => {
  const state = makeState();
  const world = makeWorld(state);
  materialize(world, ALIEN_SITES.warm_freighter);
  const eelSpecies = faunaSpeciesById('wake_eel');
  const swarmSpecies = faunaSpeciesById('needle_swarm');
  const eel = faunaOf(state, 'wake_eel')[0];
  assert.ok(eel, 'a wake eel is on the board');
  const r0 = scannerBiologyLabel(0, eelSpecies.signature);
  const r1 = scannerBiologyLabel(1, eelSpecies.signature);
  const r2 = scannerBiologyLabel(2, eelSpecies.signature);

  refreshAlienLabels(world);
  assert.equal(effectiveRevelation(state), 0);
  assert.equal(eel.data.scanLabel, r0);
  assert.equal(eel.data.name, r0);
  assert.notEqual(eel.data.name, eelSpecies.name);

  fitModules(state, ['mod_bio_spectral_pass_s']);
  assert.equal(effectiveRevelation(state), 1);
  refreshAlienLabels(world);
  assert.equal(eel.data.scanLabel, r1);
  assert.equal(eel.data.name, r1, 'R1 follows the fitted head and does not print the species');
  assert.notEqual(eel.data.name, eelSpecies.name);

  const cyst = faunaOf(state, 'lantern_cyst')[0];
  assert.ok(cyst, 'a carrier is on the board');
  handleAlienEcologyEvent(world, 'entity:killed', { id: cyst.id, pos: { x: cyst.pos.x, z: cyst.pos.z } });
  const juveniles = faunaOf(state, 'needle_swarm').filter((e) => e.data.ecology.juvenile === true);
  assert.ok(juveniles.length >= 1, 'the rupture released juveniles');
  refreshAlienLabels(world);
  const juvR1 = scannerBiologyLabel(1, swarmSpecies.signature);
  const juvR2 = scannerBiologyLabel(2, swarmSpecies.signature);
  for (const juv of juveniles) {
    assert.equal(juv.data.scanLabel, juvR1);
    assert.equal(juv.data.name, `${juvR1} (juvenile)`);
    assert.notEqual(juv.data.name, swarmSpecies.name);
  }

  setRevelation(state, 1);
  assert.equal(effectiveRevelation(state), 2, 'earned R1 plus the head reads as R2');
  refreshAlienLabels(world);
  assert.equal(eel.data.scanLabel, r2);
  assert.equal(eel.data.name, eelSpecies.name);
  for (const juv of juveniles) {
    assert.equal(juv.data.scanLabel, juvR2);
    assert.equal(juv.data.name, swarmSpecies.name);
  }
});
