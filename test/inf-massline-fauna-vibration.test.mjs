// Creatures that react to Massline vibration (Lane 2 seed; F5). The tether's drumbeat — a solid
// or crushing whip impact — now carries the same vibration stimulus the mining beam's noise
// always did, and dormant casket worms wake to it. A glance wakes nothing, and the Resonant
// Massline's dead-matter signature keeps its quiet-work contract. Driven through the real
// ecology handler over a dormant seam worm.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  handleAlienEcologyEvent,
  MASSLINE_SLAM_WAKE_SEVERITY,
} from '../src/systems/alienEcology.js';

const SECTOR = 'sector_charon_expanse';

function makeState() {
  const state = {
    meta: { seed: 47 },
    simTime: 0,
    playerId: 1,
    entities: new Map(),
    entityList: [],
    world: { currentSectorId: SECTOR, sectors: {} },
  };
  const worm = {
    id: 'worm-1', type: 'fauna', alive: true, homeSectorId: SECTOR,
    pos: { x: 500, z: -200 },
    data: { ecology: { speciesId: 'casket_worm', siteId: 'cinder_nursery',
      driveState: 'dormant', stim: { vibration: 0 } } },
  };
  const player = { id: 1, pos: { x: worm.pos.x + 5, z: worm.pos.z } };
  state.entities.set(1, player);
  state.entities.set(worm.id, worm);
  state.entityList.push(worm);
  return { state, worm };
}

test('a solid massline slam wakes the dormant seam', () => {
  const { state, worm } = makeState();
  handleAlienEcologyEvent({ state }, 'sectorsim:impulse', {
    kind: 'massline_slam', sectorId: SECTOR, severity: 0.8,
  });
  assert.notEqual(worm.data.ecology.driveState, 'dormant', 'the slam wakes the worm');
  assert.equal(worm.data.ecology.stim.vibration, 1);
});

test('a glance is quiet work: below the floor nothing wakes', () => {
  const { state, worm } = makeState();
  handleAlienEcologyEvent({ state }, 'sectorsim:impulse', {
    kind: 'massline_slam', sectorId: SECTOR, severity: MASSLINE_SLAM_WAKE_SEVERITY - 0.05,
  });
  assert.equal(worm.data.ecology.driveState, 'dormant', 'a soft tether touch stays quiet');
});

test('a slam outside the worm\'s alert reach stays quiet', () => {
  const { state, worm } = makeState();
  state.entities.get(1).pos = { x: worm.pos.x + 40000, z: worm.pos.z };
  handleAlienEcologyEvent({ state }, 'sectorsim:impulse', {
    kind: 'massline_slam', sectorId: SECTOR, severity: 0.9,
  });
  assert.equal(worm.data.ecology.driveState, 'dormant', 'the seam is too far to hear it');
});

test('the resonant module keeps its dead-matter contract', () => {
  const { state, worm } = makeState();
  // fit the real salvaged coil (mod_resonant_massline_m) through the live fittings shape
  const player = state.entities.get(1);
  player.data = { fittings: ['mod_resonant_massline_m'] };
  handleAlienEcologyEvent({ state }, 'sectorsim:impulse', {
    kind: 'massline_slam', sectorId: SECTOR, severity: 0.9,
  });
  assert.equal(worm.data.ecology.driveState, 'dormant', 'the seam does not read the resonant rig');
});

test('mining noise still wakes the seam exactly as before (AE-051 untouched)', () => {
  const { state, worm } = makeState();
  handleAlienEcologyEvent({ state }, 'sectorsim:impulse', {
    kind: 'mining_noise', sectorId: SECTOR,
  });
  assert.notEqual(worm.data.ecology.driveState, 'dormant');
});
