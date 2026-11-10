import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { missions } from '../src/systems/missions.js';
import { sectorMembershipAtGlobal } from '../src/data/sectorCoordinates.js';

test('the earned legacy Ceres fix is corrected only when a real Helios source exists', () => {
  const state = createGameState(4242);
  state.world.currentSectorId = 'sector_helios_prime';
  state.onboarding = { active: true, finished: false, currentBeat: 0 };
  state.playerId = 1;
  state.entities.set(1, { id: 1, type: 'ship', alive: true, pos: { x: 0, z: 0 } });
  const bus = createBus(), updates = [], toasts = [];
  bus.on('mission:updated', p => updates.push(p));
  bus.on('toast', p => toasts.push(p));
  const owner = Object.create(missions);
  owner.init({ state, bus, helpers: {}, registry: { get: () => null } });
  owner._installContract47aColdStart();
  const mission = state.missions.active.find(m => m.storyTag === 'campaign47a:b0:recovery');
  const earnedFix = { x: -12960.599947088484, z: 8615.2890039627 };
  assert.equal(sectorMembershipAtGlobal(earnedFix), 'sector_ceres_belt');
  mission.params.samplePos = { ...earnedFix };
  const manual = { kind: 'local', label: 'Player course', pos: { x: 42, z: 99 } };
  state.nav.waypoint = manual;
  const noSource = owner._resolveContract47aSampleSource(mission);
  assert.equal(noSource.type, 'sample_site');
  assert.deepEqual(mission.params.samplePos, earnedFix, 'no eligible body means no fabricated correction');
  assert.equal(mission.params.sampleSource, undefined);
  const source = { id: 902, type: 'asteroid', alive: true, homeSectorId: 'sector_helios_prime',
    pos: { x: 720, z: -260 }, data: { fieldId: 'f_helios_starter', asteroidSlotId: '19', oreHP: 30 } };
  state.entities.set(source.id, source); state.entityList.push(source);
  owner._refreshTrackedMissionNav(mission);
  assert.equal(state.nav.waypoint, manual, 'the player-selected course survives');
  assert.deepEqual(mission.params.samplePos, source.pos);
  assert.deepEqual(mission.params.sampleSource, { sectorId: 'sector_helios_prime',
    fieldId: 'f_helios_starter', slotId: '19', resourceSlotId: '19' });
  assert.equal(mission.params.sampleRecovered, false);
  assert.equal(state.player.cargo.items.cmdty_47a_assay_sample, undefined);
  assert.ok(updates.some(p => p.missionId === mission.id && p.sourceFix === true));
  assert.equal(toasts.filter(p => /Recovery site corrected/.test(p.text)).length, 1);
  owner._refreshTrackedMissionNav(mission);
  assert.equal(toasts.filter(p => /Recovery site corrected/.test(p.text)).length, 1);

  delete mission.params.sampleSource;
  const localUnresolved = { x: 1000, z: 1000 };
  mission.params.samplePos = { ...localUnresolved };
  assert.equal(owner._resolveContract47aSampleSource(mission).type, 'sample_site');
  assert.deepEqual(mission.params.samplePos, localUnresolved, 'an unresolved legitimate Helios fix is preserved');
});
