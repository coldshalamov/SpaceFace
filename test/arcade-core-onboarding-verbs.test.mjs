import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { makeEntity } from '../src/core/entity.js';
import {
  ARCADE_VERB_BEATS,
  ARCADE_VERB_ORDER,
  arcadeVerbStatus,
  createArcadeVerbProgress,
} from '../src/data/onboardingVerbs.js';
import { onboarding } from '../src/systems/onboarding.js';

function harness() {
  const bus = createBus();
  const player = makeEntity({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0,
    radius: 8, mass: 45, hull: 100, hullMax: 100,
    data: { weapons: [{ defId: 'wpn_pulse_laser_s', _heat: 0, heatMax: 100 }], combat: {}, ai: {} },
  });
  player.id = 1;
  const state = {
    meta: { seed: 55 }, tick: 200, simTime: 30, mode: 'flight',
    settings: { gameplay: { tutorialHints: true } },
    playerId: player.id,
    player: { targetId: null, hints: {}, cargo: { capVolume: 100, usedVolume: 0, usedMass: 0, items: {} } },
    entities: new Map([[player.id, player]]), entityList: [player], nextEntityId: 10,
    nav: { waypoint: { kind: 'mission', label: 'Prior job', pos: { x: -20, z: 4 } } },
    world: { currentSectorId: 'sector_helios_prime', activeSector: { stations: [], gates: [] } },
    story: { beatIndex: 0 },
    fields: { active: [], telemetry: { affected: 0 }, cooldowns: { well: 9 } },
  };
  const spawned = [];
  const helpers = {
    spawnEntity(spec) {
      const entity = makeEntity(spec);
      entity.id = state.nextEntityId++;
      state.entities.set(entity.id, entity);
      state.entityList.push(entity);
      spawned.push(entity);
      return entity;
    },
    removeEntity(id) {
      const entity = state.entities.get(id);
      if (entity) entity.alive = false;
    },
  };
  const system = Object.create(onboarding);
  system.init({ state, bus, helpers, registry: null });
  state.onboarding = {
    active: false,
    finished: true,
    arcadeVerbs: createArcadeVerbProgress(),
  };
  return { bus, state, player, system, helpers, spawned };
}

test('Plan 55 owns one stable, key-free Codex reference for each ordered verb', () => {
  assert.deepEqual(ARCADE_VERB_ORDER, ['shove', 'inhale', 'swing', 'well', 'burn_line']);
  assert.deepEqual(ARCADE_VERB_BEATS.map((beat) => beat.id), ARCADE_VERB_ORDER);
  for (const beat of ARCADE_VERB_BEATS) {
    assert.ok(beat.objective.length > 0 && beat.reference.length > 40);
    assert.doesNotMatch(beat.objective, /\b(?:Key[A-Z]|LMB|RMB|Space|Shift|[WASDFG])\b/);
  }
  assert.equal(arcadeVerbStatus({ onboarding: { arcadeVerbs: createArcadeVerbProgress({ skipped: true }) } }, 'well'), 'VETERAN REFERENCE');
});

test('the flyby completion yields the existing first-hour rail to shove first', () => {
  const h = harness();
  h.state.onboarding.active = true;
  h.state.onboarding.finished = false;
  h.state.onboarding.beatDoneAt = {};
  h.system._beatDone({ key: 'focus' });
  assert.equal(h.state.onboarding.arcadeVerbs.active, true);
  assert.equal(h.state.onboarding.arcadeVerbs.currentIndex, 0);
  assert.equal(h.state.onboarding.arcadeVerbs.runtime.droneId != null, true);
  assert.equal(h.state.onboarding.arcadeVerbs.runtime.rockId != null, true);
});

test('fresh production receipts log shove, inhale, swing, well, and burn-line true once in order', () => {
  const h = harness();
  h.state.onboarding.finished = false;
  h.state.onboarding.active = true;
  const completed = [];
  h.bus.on('tutorial:verbCompleted', (payload) => completed.push(structuredClone(payload)));
  assert.equal(h.system._armArcadeVerbTraining(), true);

  let progress = h.state.onboarding.arcadeVerbs;
  assert.equal(ARCADE_VERB_BEATS[progress.currentIndex].id, 'shove');
  const shove = progress.runtime;
  assert.ok(shove.droneId && shove.rockId);
  assert.ok(h.player.data.weapons.some((weapon) => weapon.onboardingVerbGift === true));
  h.bus.emit('physics:impact', { aId: shove.droneId, bId: shove.rockId, impulse: 500, pos: { x: 140, z: 0 } });
  assert.equal(progress.metrics.shove, false, 'a collision without the real concussion hit is not the shove');
  h.bus.emit('projectile:hit', { ownerId: h.player.id, targetId: shove.droneId, weaponId: 'wpn_pulse_laser_s' });
  assert.equal(progress.metrics.shove, false, 'the wrong weapon cannot claim the metric');
  h.bus.emit('projectile:hit', { ownerId: h.player.id, targetId: shove.droneId, weaponId: 'wpn_concussion_cannon_m' });
  h.bus.emit('physics:impact', { aId: shove.droneId, bId: shove.rockId, impulse: 500, pos: { x: 140, z: 0 } });
  assert.equal(progress.metrics.shove, true);
  assert.equal(h.player.data.weapons.some((weapon) => weapon.onboardingVerbGift === true), false);

  assert.equal(ARCADE_VERB_BEATS[progress.currentIndex].id, 'inhale');
  const inhaleIds = progress.runtime.pickupIds.slice();
  h.bus.emit('pickup:collected', { pickupId: 99999, collectorId: h.player.id, kind: 'cargo', commodityId: 'cmdty_salvage_electronics', amount: 1 });
  assert.equal(progress.metrics.inhale, false);
  for (const pickupId of inhaleIds.slice(0, 3)) {
    h.bus.emit('pickup:collected', { pickupId, collectorId: h.player.id, kind: 'cargo', commodityId: 'cmdty_salvage_electronics', amount: 1 });
  }
  assert.equal(progress.metrics.inhale, true);

  assert.equal(ARCADE_VERB_BEATS[progress.currentIndex].id, 'swing');
  const swing = progress.runtime;
  const anchor = h.state.entities.get(swing.anchorId);
  const ring = h.state.entities.get(swing.ringId);
  h.bus.emit('tether:latched', { targetId: swing.anchorId });
  h.player.pos.x = anchor.pos.x - 92;
  h.player.pos.z = anchor.pos.z;
  h.player.vel.x = 0;
  h.player.vel.z = 60;
  ring.pos.x = h.player.pos.x;
  ring.pos.z = h.player.pos.z + 190;
  h.bus.emit('tether:released', { targetId: swing.anchorId });
  assert.equal(progress.metrics.swing, false, 'release qualifies but the physical ring still matters');
  assert.equal(h.state.onboarding.finished, false);
  h.player.pos.x = ring.pos.x;
  h.player.pos.z = ring.pos.z;
  h.system.update(0.25, h.state);
  assert.equal(progress.metrics.swing, true);

  assert.equal(ARCADE_VERB_BEATS[progress.currentIndex].id, 'well');
  assert.equal(progress.active, false, 'the signature swing replaces the old tether row, then yields to the main rail');
  assert.equal(progress.waitingForMainRail, true);
  assert.ok(h.state.onboarding.beatDoneAt.tether != null);
  h.state.onboarding.finished = true;
  assert.equal(h.system._armArcadeVerbTraining(), true, 'finishing the ordinary rail releases the midgame well lesson');
  assert.equal(progress.entered, false, 'the well waits for a production mission to advance the story into midgame');
  h.state.story.beatIndex = 2;
  h.bus.emit('story:beatAdvanced', { fromIndex: 1, toIndex: 2 });
  const well = progress.runtime;
  assert.equal(well.giftedWellCharge, true);
  assert.equal(h.state.fields.cooldowns.well, 0);
  const emitter = h.helpers.spawnEntity({
    type: 'fieldEmitter', pos: { ...well.center }, radius: 6,
    data: { ownerId: h.player.id, fieldKind: 'well' },
  });
  h.bus.emit('fields:deployed', {
    fieldId: 'field_well_training', kind: 'well', sourceId: emitter.id,
    center: { ...well.center }, radius: 190,
  });
  h.state.fields.active = [{ id: 'field_well_training', engaged: true }];
  h.state.fields.telemetry.affected = 1;
  h.system.update(0.25, h.state);
  h.bus.emit('entity:killed', {
    id: well.droneId, killerId: h.player.id, pos: { ...well.center },
    presentation: { style: { id: 'well_collapse' } },
  });
  const cloudIds = progress.runtime.pickupIds.slice();
  assert.equal(cloudIds.length, 3);
  for (const pickupId of cloudIds) {
    h.bus.emit('pickup:collected', { pickupId, collectorId: h.player.id, kind: 'cargo', commodityId: 'cmdty_salvage_electronics', amount: 1 });
  }
  assert.equal(progress.metrics.well, true);

  assert.equal(ARCADE_VERB_BEATS[progress.currentIndex].id, 'burn_line');
  assert.equal(progress.entered, false, 'the last beat waits for a real registered planet');
  const planetEntity = h.helpers.spawnEntity({
    type: 'planet', pos: { x: 5000, z: 5000 }, radius: 470,
    data: { planetSite: { bands: { reentry: 800, danger: 880, skim: 1040, sling: 1450, influence: 2600 } } },
  });
  h.state.planet = {
    active: true, entityId: planetEntity.id, siteId: 'planet_tethys_anvil',
    center: { x: 5000, z: 5000 },
  };
  h.bus.emit('planet:registered', { siteId: 'planet_tethys_anvil', entityId: planetEntity.id });
  const burnId = progress.runtime.derelictId;
  assert.ok(burnId);
  h.bus.emit('planet:plungeStage', { id: 123456, stage: 'aftermath', siteId: 'planet_tethys_anvil' });
  assert.equal(progress.metrics.burn_line, false);
  h.bus.emit('planet:plungeStage', { id: burnId, stage: 'commit', siteId: 'planet_tethys_anvil' });
  h.bus.emit('planet:plungeStage', { id: burnId, stage: 'aftermath', siteId: 'planet_tethys_anvil' });
  assert.equal(progress.metrics.burn_line, true);
  assert.equal(progress.complete, true);
  assert.equal(progress.active, false);
  assert.deepEqual(progress.completedOrder, ARCADE_VERB_ORDER);
  assert.deepEqual(completed.map((entry) => entry.verbId), ARCADE_VERB_ORDER);
  assert.ok(completed.every((entry) => entry.metric === true));
  assert.equal(h.state.nav.waypoint.label, 'Prior job', 'the prior production route returns after training');
});

test('veteran replay checkbox reaches the run boundary without hiding Codex verbs', () => {
  const newGame = readFileSync(new URL('../src/ui/screens/newGame.js', import.meta.url), 'utf8');
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  const codex = readFileSync(new URL('../src/ui/screens/codex.js', import.meta.url), 'utf8');
  assert.match(newGame, /id = 'sf-ng-skip-verb-drills'/);
  assert.match(newGame, /skipArcadeVerbOnboarding: skipVerbDrills\.checked/);
  assert.match(main, /opts\.skipArcadeVerbOnboarding === true[\s\S]*state\.meta\.skipArcadeVerbOnboarding = true/);
  assert.match(codex, /case 'Verbs':[\s\S]*_renderVerbs/);

  const skipped = createArcadeVerbProgress({ skipped: true });
  assert.equal(skipped.complete, true);
  assert.equal(skipped.active, false);
  assert.deepEqual(Object.values(skipped.metrics), [false, false, false, false, false]);
});
