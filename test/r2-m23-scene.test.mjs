import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation } from '../src/core/sim.js';
import { ENCOUNTERS } from '../src/data/encounters/index.generated.js';
import { ADHESIVE } from '../src/data/reactiveMatter/adhesive.js';
import { zonesForSector } from '../src/data/sectorZones.js';
import { encounterDirector, planEncounters } from '../src/systems/encounterDirector.js';
import { economy } from '../src/systems/economy.js';
import { reactiveMatter } from '../src/systems/reactiveMatter.js';

const SEED = 4242;
const SECTOR = 'sector_vesta_forge';
const SHAPE = 'glue_meet_mass';
const PAY = 280;

function assertPlain(text) {
  assert.equal(typeof text, 'string', text);
  assert.ok(text.length > 8, text);
  assert.equal(/[a-z]+_[a-z0-9_]+/.test(text), false, text);
  assert.equal(/[a-z][A-Z]/.test(text), false, text);
}

function boot() {
  const sim = createSimulation({
    seed: SEED,
    systems: [economy, encounterDirector, reactiveMatter],
    updateOrder: [encounterDirector, reactiveMatter],
  });
  const player = sim.spawn({
    type: 'ship', team: 0, isPlayer: true,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    radius: 8, mass: 16, hull: 100, hullMax: 100,
    data: { intent: {}, ai: {} },
  });
  sim.state.playerId = player.id;
  sim.state.mode = 'flight';
  sim.state.timeScale = 1;
  sim.state.run = { kind: 'adventure' };
  sim.state.world.currentSectorId = SECTOR;
  const grants = [];
  const voices = [];
  const receipts = [];
  const choices = [];
  sim.bus.on('economy:grantCredits', (payload) => grants.push(payload));
  sim.bus.on('encounter:voice', (payload) => voices.push(payload));
  sim.bus.on('encounter:receipt', (payload) => receipts.push(payload));
  sim.bus.on('encounter:choiceOffered', (payload) => choices.push(payload));
  return {
    sim,
    state: sim.state,
    player,
    grants,
    voices,
    receipts,
    choices,
    director: sim.registry.get('encounterDirector'),
  };
}

function force(t, suffix) {
  t.state.world.currentSectorId = SECTOR;
  const encounterId = `debug:glue:${suffix}`;
  const result = t.director.requestAuthoredEncounter({
    shapeId: SHAPE,
    encounterId,
    sectorId: SECTOR,
    anchor: { x: 0, z: 0 },
    force: true,
  });
  assert.equal(result.ok, true, `${suffix}: ${JSON.stringify(result)}`);
  return encounterId;
}

function live(t, encounterId) {
  return t.state.encounterDirector.live[encounterId];
}

function choose(t, encounterId, choiceId) {
  t.sim.bus.emit('encounter:choose', { encounterId, choiceId });
}

function polymers(state) {
  return state.player.cargo.items[ADHESIVE.polymerId] || 0;
}

function credits(state) {
  return state.player.credits | 0;
}

function entity(t, id) {
  return id == null ? null : t.state.entities.get(id);
}

function coatOf(state, body) {
  const key = body && body.data && body.data.reactiveMatter && body.data.reactiveMatter.key;
  const row = key && state.reactiveMatterWorld && state.reactiveMatterWorld.adhesive
    && state.reactiveMatterWorld.adhesive.coatings.get(key);
  return row ? row.integrity : 0;
}

function liveBridge(state, a, b) {
  const bridges = state.reactiveMatterWorld && state.reactiveMatterWorld.adhesive
    && state.reactiveMatterWorld.adhesive.bridges;
  if (!bridges) return null;
  for (const bridge of bridges.values()) {
    if (!bridge.alive) continue;
    if ((bridge.aId === a && bridge.bId === b) || (bridge.aId === b && bridge.bId === a)) return bridge;
  }
  return null;
}

function bump(sim, player, target, closing) {
  sim.bus.emit('physics:impact', {
    aId: player.id,
    bId: target.id,
    normal: { x: 1, z: 0 },
    preSolveClosingSpeed: closing,
    tick: sim.state.tick | 0,
  });
}

function accept(t, suffix) {
  const id = force(t, suffix);
  const offered = live(t, id);
  assert.equal(offered.phase, 'offer');
  assert.equal(polymers(t.state), 0);
  assert.equal(credits(t.state), 0);
  assert.equal(t.grants.length, 0);
  choose(t, id, 'fit');
  const trial = live(t, id);
  assert.ok(trial, 'the fitting must leave the trial running');
  assert.equal(trial.phase, 'trial');
  assert.equal(polymers(t.state), 4);
  return { id, trial };
}

test('the field trial is on the Vesta derelict plan and stays out of other sectors', () => {
  const shape = ENCOUNTERS[SHAPE];
  assert.ok(shape, 'catalog must contain the encounter');
  assert.equal(shape.script, 'selfRegistered');
  const home = planEncounters(SEED, SECTOR, 0, zonesForSector(SECTOR));
  assert.ok(home.some((row) => row.shapeId === SHAPE), 'day 0 on the Forge derelict must offer the trial');
  const away = planEncounters(SEED, 'sector_helios_prime', 0, zonesForSector('sector_helios_prime'));
  assert.equal(away.some((row) => row.shapeId === SHAPE), false);
});

test('the offer moves nothing, and declining leaves the hold and the wallet alone', () => {
  const t = boot();
  const id = force(t, 'decline');
  const rec = live(t, id);
  assert.equal(rec.phase, 'offer');
  assert.equal(rec.ids.length, 0, 'the field is not built before the fitting');
  const offer = t.choices.at(-1);
  assert.ok(offer.options.some((row) => row.id === 'decline' && row.available !== false));
  for (const row of offer.options) assertPlain(row.label);
  assertPlain(t.voices.at(-1).text);
  assert.match(t.voices.at(-1).text, /hold/i);
  assert.match(t.voices.at(-1).text, /polymer/i);
  assert.equal(polymers(t.state), 0);
  assert.equal(credits(t.state), 0);
  choose(t, id, 'decline');
  assert.equal(live(t, id), undefined);
  assert.equal(polymers(t.state), 0);
  assert.equal(credits(t.state), 0);
  assert.equal(t.grants.length, 0);
  assertPlain(t.receipts.at(-1).text);
  assert.match(t.receipts.at(-1).text, /unchanged/i);
  t.sim.dispose();
});

test('a full hold refuses the fitting without loading polymers or paying', () => {
  const t = boot();
  const id = force(t, 'full');
  t.state.player.cargo.usedVolume = t.state.player.cargo.capVolume;
  choose(t, id, 'fit');
  assert.equal(live(t, id), undefined);
  assert.equal(polymers(t.state), 0);
  assert.equal(credits(t.state), 0);
  assert.equal(t.grants.length, 0);
  assertPlain(t.receipts.at(-1).text);
  assert.match(t.receipts.at(-1).text, /hold/i);
  t.sim.dispose();
});

test('a missed spray leaves the hull bare and spends nothing', () => {
  const t = boot();
  const { id, trial } = accept(t, 'miss');
  const light = entity(t, trial.vars.lightId);
  assert.ok(light);
  t.player.pos.x = light.pos.x;
  t.player.pos.z = light.pos.z;
  bump(t.sim, t.player, light, 48);
  t.sim.runTicks(2);
  assert.equal(coatOf(t.state, light), 0);
  assert.equal(light.data.status, undefined);
  assert.equal(polymers(t.state), 4);
  assert.equal(live(t, id).phase, 'trial');
  assert.equal(t.grants.length, 0);
  assert.equal(credits(t.state), 0);
  t.sim.dispose();
});

test('bridging the light hull to the wreck and shoving pays once', () => {
  const t = boot();
  const { id, trial } = accept(t, 'shove');
  const light = entity(t, trial.vars.lightId);
  const wreck = entity(t, trial.vars.wreckId);
  const rock = entity(t, trial.vars.rockId);
  assert.ok(light && wreck && rock);
  assert.ok(light.mass < wreck.mass && wreck.mass < rock.mass, `${light.mass} ${wreck.mass} ${rock.mass}`);
  assert.equal(rock.data.reactiveMatter.anchored, true);
  assert.equal(light.team, 1);
  assert.ok(light.hull > 0);
  const pair = Math.hypot(wreck.pos.x - light.pos.x, wreck.pos.z - light.pos.z);
  const pairReach = light.radius + wreck.radius + ADHESIVE.bridgeGap;
  assert.ok(pair <= pairReach, `light and wreck must be able to bridge, dist ${pair} reach ${pairReach}`);
  const rockDist = Math.hypot(rock.pos.x - light.pos.x, rock.pos.z - light.pos.z);
  assert.ok(rockDist > light.radius + rock.radius + ADHESIVE.bridgeGap, 'the rock stays off the gun line');
  t.player.pos.x = (light.pos.x + wreck.pos.x) / 2;
  t.player.pos.z = light.pos.z;
  bump(t.sim, t.player, light, 6);
  bump(t.sim, t.player, wreck, 6);
  t.sim.runTicks(2);
  const lightKey = light.data.reactiveMatter.key;
  const wreckKey = wreck.data.reactiveMatter.key;
  assert.ok(coatOf(t.state, light) > 0.9);
  assert.ok(coatOf(t.state, wreck) > 0.9);
  assert.ok(liveBridge(t.state, lightKey, wreckKey), 'the real film must bridge the pair');
  assert.equal(polymers(t.state), 2);
  light.vel.x = 6;
  light.vel.z = 0;
  wreck.vel.x = 6;
  wreck.vel.z = 0;
  t.sim.runTicks(70);
  assert.equal(t.state.story.depthProgramEncounters.completed[SHAPE].outcome, 'shoved');
  assert.equal(credits(t.state), PAY);
  assert.equal(t.grants.length, 1);
  assert.equal(t.grants[0].amount, PAY);
  assertPlain(t.receipts.at(-1).text);
  assert.match(t.receipts.at(-1).text, /film held/i);
  t.sim.runTicks(70);
  assert.equal(credits(t.state), PAY);
  assert.equal(t.grants.length, 1);
  const again = t.director.requestAuthoredEncounter({
    shapeId: SHAPE,
    encounterId: 'debug:glue:shove-again',
    sectorId: SECTOR,
    anchor: { x: 0, z: 0 },
  });
  assert.equal(again.ok, false);
  assert.equal(credits(t.state), PAY);
  assert.equal(live(t, id), undefined);
  t.sim.dispose();
});

test('coating the hull and disabling it pays once, and a bare kill does not', () => {
  const bare = boot();
  const first = accept(bare, 'bare');
  const bareHull = entity(bare, first.trial.vars.lightId);
  bareHull.hull = 0;
  bareHull.alive = false;
  bare.sim.runTicks(70);
  assert.equal(bare.state.story.depthProgramEncounters?.completed?.[SHAPE], undefined);
  assert.equal(credits(bare.state), 0);
  assert.equal(bare.grants.length, 0);
  assertPlain(bare.receipts.at(-1).text);
  assert.match(bare.receipts.at(-1).text, /bare/i);
  const secondId = force(bare, 'coated');
  assert.equal(polymers(bare.state), 4);
  choose(bare, secondId, 'fit');
  const secondTrial = live(bare, secondId);
  assert.equal(secondTrial.phase, 'trial');
  assert.equal(polymers(bare.state), 4, 'a failed trial does not mint another polymer load');
  const light = entity(bare, secondTrial.vars.lightId);
  bare.player.pos.x = light.pos.x;
  bare.player.pos.z = light.pos.z;
  bump(bare.sim, bare.player, light, 6);
  bare.sim.runTicks(2);
  assert.ok(coatOf(bare.state, light) > 0.9);
  assert.equal(light.data.status, undefined);
  light.hull = 0;
  light.alive = false;
  bare.sim.runTicks(70);
  assert.equal(bare.state.story.depthProgramEncounters.completed[SHAPE].outcome, 'coated');
  assert.equal(credits(bare.state), PAY);
  assert.equal(bare.grants.length, 1);
  assertPlain(bare.receipts.at(-1).text);
  assert.match(bare.receipts.at(-1).text, /coated hull/i);
  bare.sim.runTicks(70);
  assert.equal(bare.grants.length, 1);
  assert.equal(credits(bare.state), PAY);
  bare.sim.dispose();
});
