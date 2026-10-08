// SFQ-B023 — a failure snap and a deliberate release do not wear the same words.
// Seed 4242. No velocity kick.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import {
  isLineBreakReason,
  masslineHud,
  releaseVerdictCopy,
} from '../src/ui/masslineHud.js';

const SEED = 4242;

test('LINE BROKE is a failure, and a razor release stays a grade', () => {
  assert.equal(releaseVerdictCopy({ broke: true, classification: 'razor' }), 'LINE BROKE');
  const grade = releaseVerdictCopy({
    classification: 'razor', technique: 'swing', releasedAtApex: true,
  });
  assert.equal(grade, 'RAZOR · AT THE APEX');
  assert.doesNotMatch(grade, /BROKE/);
  assert.equal(isLineBreakReason('threshold'), true);
  assert.equal(isLineBreakReason('overload'), true);
  assert.equal(isLineBreakReason('physics_break'), true);
  assert.equal(isLineBreakReason('catastrophic-overload'), true);
  assert.equal(isLineBreakReason('tether_cut'), false);
  assert.equal(isLineBreakReason('accepted'), false);
  assert.equal(isLineBreakReason(undefined), false);
});

test('seed 4242: an overload snap paints LINE BROKE; a deliberate cut does not', () => {
  const rock = {
    id: 7, type: 'asteroid', alive: true, mass: 5200,
    pos: { x: 120, z: 60 }, vel: { x: 0, z: 0 },
  };
  const player = { id: 1, type: 'ship', alive: true, mass: 200, pos: { x: 0, z: 0 } };
  const state = {
    seed: SEED,
    simTime: 4,
    playerId: 1,
    entities: new Map([[1, player], [7, rock]]),
    player: { tether: { active: false } },
    masslineReleaseVerdict: null,
  };
  const bus = createBus();
  const hud = Object.assign({}, masslineHud);
  hud.init({ state, bus, helpers: {} });

  bus.emit('tether:broken', { targetId: rock.id, reason: 'tether_cut', tension: 10 });
  assert.equal(state.masslineReleaseVerdict, null, 'a deliberate cut is not a break');

  bus.emit('tether:broken', { targetId: rock.id, reason: 'accepted' });
  assert.equal(state.masslineReleaseVerdict, null, 'an accepted handoff is not a break');

  bus.emit('tether:releaseRated', {
    targetId: rock.id, classification: 'clean', technique: 'swing', deliberate: true,
  });
  assert.equal(state.masslineReleaseVerdict.classification, 'clean');
  assert.notEqual(state.masslineReleaseVerdict.broke, true);
  assert.doesNotMatch(releaseVerdictCopy(state.masslineReleaseVerdict), /BROKE/);

  bus.emit('tether:broken', { targetId: rock.id, reason: 'threshold', tension: 92 });
  assert.equal(state.masslineReleaseVerdict.broke, true);
  assert.equal(releaseVerdictCopy(state.masslineReleaseVerdict), 'LINE BROKE');
  assert.equal(state.masslineReleaseVerdict.targetId, rock.id);
  assert.equal(state.masslineReleaseVerdict.atX, 120);
  assert.ok(state.masslineReleaseVerdict.untilSimTime > state.simTime);

  bus.emit('tether:releaseRated', {
    targetId: rock.id, classification: 'messy', technique: 'slack',
  });
  assert.equal(state.masslineReleaseVerdict.broke, true,
    'a non-deliberate rating must not erase the break pill');
});
