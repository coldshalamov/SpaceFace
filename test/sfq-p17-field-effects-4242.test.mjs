import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/core/gameState.js';
import { hash32, mulberry32 } from '../src/core/rng.js';
import { ALIEN_SITES } from '../src/data/alienEcology.js';
import { FAUNA_SPECIES } from '../src/data/alienFauna.js';
import { ensureAlienEcologyState } from '../src/data/alienEcologyState.js';
import { HEAT_TRIAL_NOTE } from '../src/data/heatProximityTrial.js';
import { LURE_SHOWN } from '../src/data/heatLure.js';
import {
  tickAlienEcology, handleAlienEcologyEvent,
  serializeAlienEcologyState, deserializeAlienEcologyState,
} from '../src/systems/alienEcology.js';

function field(siteId) {
  const site = ALIEN_SITES[siteId];
  const state = createGameState(4242);
  state.mode = 'flight';
  state.simTime = 10;
  state.playerId = 1;
  state.world.currentSectorId = site.sectorId;
  const player = { id: 1, type: 'player', alive: true, radius: 10,
    pos: { ...site.center }, vel: { x: 0, z: 0 }, data: { fittings: [] } };
  state.entities.set(1, player);
  state.entityList.push(player);
  const events = [];
  const world = {
    state, active: { dressing: [], pois: [] },
    _toGlobal: p => ({ ...p }), _toLocal: p => ({ ...p }),
    helpers: { hash32, mulberry32, spawnEntity() { return null; }, removeEntity() {} },
    bus: { emit: (type, payload) => events.push({ type, payload }) },
  };
  const ae = ensureAlienEcologyState(state);
  ae.revelation = 3;
  ae.sites[siteId] = { state: 'awake', relaySevered: false,
    deadFauna: {}, signals: [], beats: { long: true, mid: true, close: true }, offersEmitted: {} };
  function fauna(speciesId, dx = 400) {
    const species = FAUNA_SPECIES[speciesId];
    const body = { id: state.entities.size + 100, type: 'fauna', alive: true,
      pos: { x: site.center.x + dx, z: site.center.z }, vel: { x: 0, z: 0 },
      rot: Math.PI, radius: species.radius, hull: 100, occupantGeneration: 1,
      homeSectorId: site.sectorId,
      data: { ecology: { speciesId, siteId, faunaKey: `fixture:${speciesId}`,
        anchor: { ...site.center }, driveState: species.drives.idle, phase: 0, stim: {}, driveT: 0 } } };
    state.entities.set(body.id, body);
    state.entityList.push(body);
    return body;
  }
  return { site, state, player, world, ae, events, fauna,
    tick(dt = 0.1) { state.simTime += dt; tickAlienEcology(world, dt); },
    scan() { handleAlienEcologyEvent(world, 'scan:completed', { sectorId: site.sectorId }); } };
}

function motion(speciesId, online) {
  const f = field('warm_freighter');
  f.ae.sites.warm_freighter.heatOnline = online;
  const body = f.fauna(speciesId);
  const before = { ...body.pos };
  f.tick();
  return Math.hypot(body.pos.x - before.x, body.pos.z - before.z);
}

test('seed 4242: cutting standby slows cysts, frees eels, and leaves leeches unchanged', () => {
  assert.ok(motion('lantern_cyst', false) < motion('lantern_cyst', true));
  assert.ok(motion('wake_eel', false) > motion('wake_eel', true));
  assert.equal(motion('hull_leech', false), motion('hull_leech', true));
  const f = field('warm_freighter');
  f.scan();
  assert.equal(f.ae.sites.warm_freighter.heatOnline, false);
  const saved = serializeAlienEcologyState(f.state);
  const restored = field('warm_freighter');
  deserializeAlienEcologyState(restored.state, saved);
  assert.equal(restored.state.world.alienEcology.sites.warm_freighter.heatOnline, false);
  restored.scan();
  assert.equal(restored.state.world.alienEcology.sites.warm_freighter.heatOnline, true);
});

function fittedTrial() {
  const f = field('harvest_deep');
  f.ae.heatTrial = { note: HEAT_TRIAL_NOTE };
  f.ae.heatDerivative = { lure: 'cmdty_filament_sample', edge: false };
  return f;
}

test('seed 4242: an empty trial deploys heat without claiming a predator response', () => {
  const f = fittedTrial();
  f.tick();
  assert.equal(f.ae.lures.length, 1, 'the fitted derivative must create a real stimulus');
  assert.notEqual(f.ae.heatDerivative.shown, true);
  assert.equal(f.events.filter(e => e.payload?.text === LURE_SHOWN).length, 0);
  f.tick();
  assert.equal(f.ae.lures.length, 1, 'staying inside cannot pile up lures');
});

test('seed 4242: the derivative moves a live maw toward its decoy and records only that response', () => {
  const f = fittedTrial();
  const maw = f.fauna('furnace_maw', 700);
  const before = { ...maw.pos };
  f.tick();
  const decoy = f.ae.lures[0];
  assert.ok(decoy, 'returning must deploy the fabricated lure');
  assert.notDeepEqual({ x: decoy.x, z: decoy.z }, f.player.pos, 'the decoy draws heat away from the hull');
  assert.deepEqual(maw.data.ecology.lureTarget, { x: decoy.x, z: decoy.z });
  assert.equal(maw.data.ecology.driveState, 'charge');
  assert.ok(Math.hypot(maw.pos.x - decoy.x, maw.pos.z - decoy.z)
    < Math.hypot(before.x - decoy.x, before.z - decoy.z));
  assert.equal(f.ae.heatDerivative.shown, true);
  assert.equal(f.events.filter(e => e.payload?.text === LURE_SHOWN).length, 1);
  f.tick();
  assert.equal(f.events.filter(e => e.payload?.text === LURE_SHOWN).length, 1);
  const restored = field('harvest_deep');
  deserializeAlienEcologyState(restored.state, serializeAlienEcologyState(f.state));
  restored.tick();
  assert.equal(restored.state.world.alienEcology.heatDerivative.shown, true);
  assert.equal(restored.state.world.alienEcology.lures.length, 0);
  assert.equal(restored.events.filter(e => e.payload?.text === LURE_SHOWN).length, 0);
});

test('seed 4242: a foreign-sector lure cannot redirect or certify the local maw', () => {
  const f = fittedTrial();
  f.ae.heatDerivative.edge = true;
  const maw = f.fauna('furnace_maw', 700);
  f.ae.lures = [{ x: maw.pos.x - 100, z: maw.pos.z, until: 100,
    sectorId: 'sector_helios_prime', trialSiteId: f.site.siteId }];
  f.tick();
  assert.equal(maw.data.ecology.lureTarget, null);
  assert.notEqual(f.ae.heatDerivative.shown, true);
});

test('seed 4242: Continue restarts an interrupted trial without charging another specimen', () => {
  const f = fittedTrial();
  f.tick();
  const saved = serializeAlienEcologyState(f.state);
  const restored = field('harvest_deep');
  restored.state.player.cargo.items.cmdty_filament_sample = 2;
  deserializeAlienEcologyState(restored.state, saved);
  restored.fauna('furnace_maw', 700);
  restored.tick();
  const ae = restored.state.world.alienEcology;
  assert.equal(ae.lures.length, 1);
  assert.equal(ae.heatDerivative.shown, true);
  assert.equal(restored.state.player.cargo.items.cmdty_filament_sample, 2);
  assert.equal(restored.events.filter(e => e.payload?.text === LURE_SHOWN).length, 1);
});
