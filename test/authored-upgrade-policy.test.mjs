import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AUTHORED_UPGRADE_OPENING_LIMIT,
  AUTHORED_UPGRADE_SETTLE_MS,
  AUTHORED_UPGRADE_STEADY_LIMIT,
  COMBATANT_ADMISSION_PRIORITY,
  authoredUpgradeConcurrencyLimit,
  combatantAdmissionPriority,
  survivalDefersArenaDressingJob,
} from '../src/render/authoredUpgradePolicy.js';
import { CAMERA_DIRECTOR_COMBAT_MAX_ZOOM } from '../src/render/cameraDirector.js';

test('steady flight stays serial; only loading and opening may overlap two jobs', () => {
  assert.equal(authoredUpgradeConcurrencyLimit({ mode: 'flight' }), AUTHORED_UPGRADE_STEADY_LIMIT);
  assert.equal(authoredUpgradeConcurrencyLimit({ mode: 'loading' }), AUTHORED_UPGRADE_OPENING_LIMIT);
  assert.equal(authoredUpgradeConcurrencyLimit({
    mode: 'flight',
    deferNoncriticalMeshStreaming: true,
  }), AUTHORED_UPGRADE_OPENING_LIMIT);
  assert.equal(authoredUpgradeConcurrencyLimit({
    mode: 'flight',
    firstPlayableFrameAt: 1000,
    nowMs: 1400,
  }), AUTHORED_UPGRADE_STEADY_LIMIT);
  assert.equal(AUTHORED_UPGRADE_SETTLE_MS, 0);
});

test('a hostile ship inside the fight-fit envelope takes the combatant rung', () => {
  const player = { id: 'player', team: 0, pos: { x: 0, z: 0 } };
  const live = { playerId: player.id, entities: new Map([[player.id, player]]) };
  const hostile = { id: 'hostile', type: 'ship', team: 1, alive: true, pos: { x: 200, z: 0 } };

  assert.equal(combatantAdmissionPriority(hostile, live), COMBATANT_ADMISSION_PRIORITY);
  assert.ok(COMBATANT_ADMISSION_PRIORITY > 0 && COMBATANT_ADMISSION_PRIORITY < 1,
    'the rung must sit between the player hull (0) and the critical starting hub (1)');

  assert.equal(combatantAdmissionPriority(
    { ...hostile, pos: { x: CAMERA_DIRECTOR_COMBAT_MAX_ZOOM, z: 0 } }, live,
  ), COMBATANT_ADMISSION_PRIORITY, 'the envelope edge still counts');
  assert.equal(combatantAdmissionPriority(
    { ...hostile, pos: { x: CAMERA_DIRECTOR_COMBAT_MAX_ZOOM + 1, z: 0 } }, live,
  ), null, 'beyond the envelope the job is ordinary background work');

  // Allied, law and same-team ships never take the rung — only genuinely hostile factions do.
  assert.equal(combatantAdmissionPriority({ ...hostile, team: 0 }, live), null);
  assert.equal(combatantAdmissionPriority({ ...hostile, team: 2 }, live), null);
  assert.equal(combatantAdmissionPriority(
    { ...hostile, team: 1 },
    { playerId: 'p', entities: new Map([['p', { id: 'p', team: 1, pos: { x: 0, z: 0 } }]]) },
  ), null, 'same team as the player is not hostile');

  // Non-ships, dead ships and the player himself never take the rung.
  assert.equal(combatantAdmissionPriority({ ...hostile, type: 'station' }, live), null);
  assert.equal(combatantAdmissionPriority({ ...hostile, alive: false }, live), null);
  assert.equal(combatantAdmissionPriority({ ...hostile, isPlayer: true }, live), null);

  // Unknown range or missing live state cannot promote.
  assert.equal(combatantAdmissionPriority({ ...hostile, pos: null }, live), null);
  assert.equal(combatantAdmissionPriority(hostile, { entities: new Map() }), null);
  assert.equal(combatantAdmissionPriority(hostile, null), null);
});

test('a live survival run defers far dressing; near dressing and every ship stay queued', () => {
  const player = { id: 'player', team: 0, pos: { x: 0, z: 0 } };
  const live = {
    playerId: player.id,
    entities: new Map([[player.id, player]]),
    run: { kind: 'survival', phase: 'wave' },
  };
  const far = CAMERA_DIRECTOR_COMBAT_MAX_ZOOM + 100;

  for (const type of ['station', 'asteroid', 'fx', 'place']) {
    assert.equal(
      survivalDefersArenaDressingJob({ id: `${type}-far`, type, pos: { x: far, z: 0 } }, live),
      true, `far ${type} defers while the run holds the arena`,
    );
    assert.equal(
      survivalDefersArenaDressingJob({ id: `${type}-near`, type, pos: { x: 100, z: 0 } }, live),
      false, `near ${type} is on the arena glass and still admits`,
    );
  }

  // Ships and wrecks are fight-relevant bodies — never deferred no matter the range.
  assert.equal(survivalDefersArenaDressingJob(
    { id: 'hostile', type: 'ship', team: 1, pos: { x: far, z: 0 } }, live,
  ), false);
  assert.equal(survivalDefersArenaDressingJob(
    { id: 'wreck', type: 'wreck', pos: { x: far, z: 0 } }, live,
  ), false);

  // No live survival run — nothing defers.
  assert.equal(survivalDefersArenaDressingJob(
    { id: 'station', type: 'station', pos: { x: far, z: 0 } },
    { ...live, run: { kind: 'survival', phase: 'inactive' } },
  ), false);
  assert.equal(survivalDefersArenaDressingJob(
    { id: 'station', type: 'station', pos: { x: far, z: 0 } },
    { ...live, run: null },
  ), false);
  assert.equal(survivalDefersArenaDressingJob(
    { id: 'station', type: 'station', pos: { x: far, z: 0 } },
    { ...live, run: { kind: 'adventure', phase: 'active' } },
  ), false);
});
