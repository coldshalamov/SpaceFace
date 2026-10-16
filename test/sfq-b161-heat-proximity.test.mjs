import test from 'node:test';
import assert from 'node:assert/strict';
import { FAUNA_SPECIES } from '../src/data/alienFauna.js';
import { resolveFaunaApproachDrive } from '../src/data/faunaMotionRead.js';
import { HEAT_TRIAL_NOTE, noteHeatTrial } from '../src/data/heatProximityTrial.js';
import { ALIEN_SITES } from '../src/data/alienEcology.js';
import { ensureAlienEcologyState } from '../src/data/alienEcologyState.js';
import {
  handleAlienEcologyEvent,
  tickAlienEcology,
  serializeAlienEcologyState,
  deserializeAlienEcologyState,
} from '../src/systems/alienEcology.js';
import { mulberry32, hash32 } from '../src/core/rng.js';

const maw = FAUNA_SPECIES.furnace_maw;
const grazer = FAUNA_SPECIES.glassback;
const RANGE = maw.threatenR + 30;

function approach(species, extra = {}) {
  return resolveFaunaApproachDrive(species, {
    playerD: RANGE,
    awake: true,
    heatSaturated: false,
    reacted: true,
    silenced: false,
    currentDrive: 'drift',
    ...extra,
  });
}

test('the same range shadows a cold maw and charges a hot one', () => {
  const cold = approach(maw);
  const hot = approach(maw, { heatSaturated: true });
  assert.equal(cold, 'shadow');
  assert.equal(hot, 'charge');
  assert.equal(approach(grazer), 'defend');
  assert.equal(approach(maw, { playerD: maw.threatenR - 10, heatSaturated: false }), 'charge');
});

test('the notebook names heat, and a repeated scan does not pay', () => {
  let book = noteHeatTrial(null, { heat: false, drive: 'shadow', geometryKey: 4 });
  book = noteHeatTrial(book, { kind: 'scan' });
  book = noteHeatTrial(book, { kind: 'scan' });
  assert.equal(book.note, null);
  assert.equal(book.scans, 2);
  book = noteHeatTrial(book, { heat: true, drive: 'charge', geometryKey: 4 });
  assert.equal(book.note, HEAT_TRIAL_NOTE);
  const again = noteHeatTrial(book, { kind: 'scan' });
  assert.equal(again.note, HEAT_TRIAL_NOTE);
  assert.equal(again.scans, 3);
  const mismatch = noteHeatTrial(null, { heat: true, drive: 'charge', geometryKey: 9 });
  assert.equal(noteHeatTrial(mismatch, { heat: false, drive: 'shadow', geometryKey: 4 }).note, null);
});

function fixture() {
  const site = ALIEN_SITES.warm_freighter;
  const state = {
    meta: { seed: 4242 }, simTime: 0, playerId: 1, entities: new Map(), entityList: [],
    rng: () => 0,
    player: { researchPoints: 4, cargo: { items: {}, capVolume: 100, capMass: 100, usedMass: 0, usedVolume: 0 } },
    world: { currentSectorId: site.sectorId, sectors: {} },
  };
  const events = [];
  let next = 100;
  const world = {
    state,
    registry: { get: () => null },
    active: { dressing: [], pois: [] },
    _toGlobal: (p) => ({ ...p }),
    _toLocal: (p) => ({ ...p }),
    bus: { emit: (type, payload) => events.push({ type, payload }) },
    helpers: {
      mulberry32,
      hash32,
      spawnEntity(spec) {
        const e = {
          ...spec, id: next++, alive: true, occupantGeneration: 1,
          pos: { ...spec.pos }, vel: spec.vel || { x: 0, z: 0 },
        };
        state.entities.set(e.id, e);
        state.entityList.push(e);
        return e;
      },
      removeEntity(id) { state.entities.get(id).alive = false; },
    },
  };
  const player = {
    id: 1, type: 'player', alive: true, occupantGeneration: 1, radius: 10,
    pos: { x: site.center.x + 10000, z: site.center.z }, vel: { x: 0, z: 0 }, rot: 0, data: { fittings: [] },
  };
  state.entities.set(1, player);
  state.entityList.push(player);
  const ae = ensureAlienEcologyState(state);
  ae.revelation = 3;
  ae.sites[site.siteId] = {
    state: 'awake', relaySevered: false, deadFauna: {}, signals: [],
    beats: { long: true, mid: true, close: true }, offersEmitted: {},
  };
  const species = FAUNA_SPECIES.furnace_maw;
  const hunter = world.helpers.spawnEntity({
    type: 'fauna',
    pos: { x: site.center.x + RANGE, z: site.center.z },
    radius: species.radius,
    rot: 0,
    hull: 100,
    homeSectorId: site.sectorId,
    data: {
      ecology: {
        speciesId: 'furnace_maw', siteId: site.siteId, faunaKey: 'fixture:maw',
        anchor: { ...site.center }, driveState: species.drives.idle, phase: 0, stim: {}, driveT: 0,
      },
    },
  });
  function tick(dt = 0.1) {
    state.simTime += dt;
    tickAlienEcology(world, dt);
  }
  return { state, world, site, player, hunter, events, tick };
}

test('a live cold pass holds shadow and the same place, once hot, charges and files one note', () => {
  const f = fixture();
  f.player.pos = { x: f.hunter.pos.x + RANGE, z: f.hunter.pos.z };
  const home = { x: f.hunter.pos.x, z: f.hunter.pos.z };
  f.tick();
  assert.equal(f.hunter.data.ecology.driveState, 'shadow');
  f.hunter.pos.x = home.x;
  f.hunter.pos.z = home.z;
  f.player.vel.x = 90;
  for (let i = 0; i < 50; i++) {
    f.tick();
    f.hunter.pos.x = home.x;
    f.hunter.pos.z = home.z;
  }
  assert.ok(f.hunter.data.ecology.heatSat > 3);
  assert.equal(f.hunter.data.ecology.driveState, 'charge');
  const trial = ensureAlienEcologyState(f.state).heatTrial;
  assert.equal(trial.note, HEAT_TRIAL_NOTE);
  assert.equal(f.events.filter((e) => e.type === 'comms:log' && e.payload && e.payload.text === HEAT_TRIAL_NOTE).length, 1);
  for (let i = 0; i < 4; i++) {
    handleAlienEcologyEvent(f.world, 'scan:completed', { sectorId: f.site.sectorId });
  }
  assert.equal(f.state.player.researchPoints, 4);
  assert.equal(ensureAlienEcologyState(f.state).heatTrial.scans, 4);
  assert.equal(ensureAlienEcologyState(f.state).heatTrial.note, HEAT_TRIAL_NOTE);
  const saved = serializeAlienEcologyState(f.state);
  const restored = { world: {} };
  deserializeAlienEcologyState(restored, JSON.parse(JSON.stringify(saved)));
  assert.equal(restored.world.alienEcology.heatTrial.note, HEAT_TRIAL_NOTE);
  assert.equal(maw.speed, 26);
  assert.equal(maw.alertR, 1100);
  assert.equal(maw.stimuli.heat, 1);
});
