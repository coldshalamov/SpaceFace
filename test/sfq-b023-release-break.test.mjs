// SFQ-B023 — a failure snap and a deliberate release do not wear the same words.
// Seed 4242. No velocity kick.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import {
  isLineBreakReason,
  isLineSeverReason,
  lineBreakInvolvesPlayer,
  masslineHud,
  masslineHudInputsUnchanged,
  releaseVerdictCopy,
} from '../src/ui/masslineHud.js';

const SEED = 4242;

test('LINE BROKE is a failure, and a razor release stays a grade', () => {
  assert.equal(releaseVerdictCopy({ broke: true, classification: 'razor' }), 'LINE BROKE');
  assert.equal(releaseVerdictCopy({ severed: true, classification: 'razor' }), 'LINE CUT');
  assert.doesNotMatch(releaseVerdictCopy({ severed: true }), /BROKE/);
  const grade = releaseVerdictCopy({
    classification: 'razor', technique: 'swing', releasedAtApex: true,
  });
  assert.equal(grade, 'RAZOR · AT THE APEX');
  assert.doesNotMatch(grade, /BROKE/);
  assert.equal(isLineBreakReason('threshold'), true);
  assert.equal(isLineBreakReason('overload'), true);
  assert.equal(isLineBreakReason('physics_break'), true);
  assert.equal(isLineBreakReason('catastrophic-overload'), true);
  assert.equal(isLineBreakReason('sustained-overload'), true);
  assert.equal(isLineBreakReason('integrity-failure'), true);
  assert.equal(isLineSeverReason('monofilament_sweep'), true);
  assert.equal(isLineSeverReason('specialist_cut'), true);
  assert.equal(isLineSeverReason('ace_cut'), true);
  assert.equal(isLineSeverReason('threshold'), false);
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

  bus.emit('tether:broken', { actorId: 9, targetId: 8, reason: 'threshold', tension: 40 });
  assert.equal(state.masslineReleaseVerdict.classification, 'clean',
    'another hull\'s snap does not replace the player\'s grade');
  assert.notEqual(state.masslineReleaseVerdict.broke, true);

  bus.emit('tether:broken', { targetId: rock.id, reason: 'threshold', tension: 92 });
  assert.equal(state.masslineReleaseVerdict.classification, 'clean',
    'a snap with no player on it does not clear the grade');
  assert.notEqual(state.masslineReleaseVerdict.broke, true);

  bus.emit('tether:broken', { actorId: 1, targetId: rock.id, reason: 'threshold', tension: 92 });
  assert.equal(state.masslineReleaseVerdict.broke, true);
  assert.equal(releaseVerdictCopy(state.masslineReleaseVerdict), 'LINE BROKE');
  assert.equal(state.masslineReleaseVerdict.targetId, rock.id);
  assert.equal(state.masslineReleaseVerdict.atX, 120);
  assert.ok(state.masslineReleaseVerdict.untilSimTime > state.simTime);

  bus.emit('tether:broken', { actorId: 4, targetId: 8, reason: 'integrity-failure' });
  assert.equal(state.masslineReleaseVerdict.targetId, rock.id, 'a foreign integrity failure does not clobber');

  bus.emit('tether:broken', { actorId: 4, targetId: 1, reason: 'integrity-failure' });
  assert.equal(state.masslineReleaseVerdict.broke, true);
  assert.equal(state.masslineReleaseVerdict.targetId, 1, 'the player as the load still hears the snap');

  bus.emit('tether:releaseRated', {
    targetId: rock.id, classification: 'messy', technique: 'slack',
  });
  assert.equal(state.masslineReleaseVerdict.broke, true,
    'a non-deliberate rating must not erase the break pill');

  bus.emit('tether:broken', {
    actorId: 9, ownerId: 4, targetId: rock.id, reason: 'monofilament_sweep',
  });
  assert.equal(state.masslineReleaseVerdict.broke, true,
    'a hostile cut of someone else\'s line stays off this glass');

  bus.emit('tether:broken', {
    actorId: 1, ownerId: 4, targetId: rock.id, reason: 'monofilament_sweep',
  });
  assert.equal(state.masslineReleaseVerdict.broke, true,
    'the player being the cutter of an NPC line is not their snap');

  bus.emit('tether:broken', {
    actorId: 9, ownerId: 1, controllerId: null, targetId: rock.id, reason: 'monofilament_sweep',
  });
  assert.equal(state.masslineReleaseVerdict.severed, true);
  assert.equal(state.masslineReleaseVerdict.broke, false);
  assert.equal(releaseVerdictCopy(state.masslineReleaseVerdict), 'LINE CUT');
  assert.equal(state.masslineReleaseVerdict.targetId, rock.id);

  bus.emit('massline:bridleEnded', { attachmentId: 3, reason: 'player_cut' });
  assert.equal(releaseVerdictCopy(state.masslineReleaseVerdict), 'LINE CUT',
    'a deliberate bridle end does not wear the failure pill');

  bus.emit('massline:bridleEnded', {
    attachmentId: 3, sourceId: 4, targetId: rock.id, reason: 'line_broken',
  });
  assert.equal(state.masslineReleaseVerdict.broke, true);
  assert.equal(state.masslineReleaseVerdict.targetId, rock.id,
    'a bridle snap anchors on the body, not the other endpoint');
  assert.equal(releaseVerdictCopy(state.masslineReleaseVerdict), 'LINE BROKE');

  assert.equal(lineBreakInvolvesPlayer(state, { actorId: 1 }), true);
  assert.equal(lineBreakInvolvesPlayer(state, { targetId: 1 }), true);
  assert.equal(lineBreakInvolvesPlayer(state, { actorId: 9, targetId: 8 }), false);
  assert.equal(lineBreakInvolvesPlayer(state, {
    actorId: 9, ownerId: 1, targetId: 7, reason: 'monofilament_sweep',
  }), true);
  assert.equal(lineBreakInvolvesPlayer(state, {
    actorId: 1, ownerId: 4, targetId: 7, reason: 'monofilament_sweep',
  }), false);
});

test('seed 4242: LINE CUT repaints over LINE BROKE on the same body', () => {
  const player = { id: 1, type: 'ship', alive: true, mass: 200, pos: { x: 0, z: 0 } };
  const state = {
    seed: SEED,
    simTime: 4,
    playerId: 1,
    mode: 'flight',
    entities: new Map([[1, player]]),
    player: { tether: { active: false } },
    masslineReleaseVerdict: {
      broke: true,
      severed: false,
      classification: null,
      technique: null,
      releasedAtApex: false,
      targetId: 7,
      untilSimTime: 10,
    },
  };
  assert.equal(masslineHudInputsUnchanged(state, player), false);
  assert.equal(masslineHudInputsUnchanged(state, player), true, 'the snap pill is already on the glass');
  state.masslineReleaseVerdict = {
    broke: false,
    severed: true,
    classification: null,
    technique: null,
    releasedAtApex: false,
    targetId: 7,
    untilSimTime: 10,
  };
  assert.equal(masslineHudInputsUnchanged(state, player), false,
    'LINE CUT must replace LINE BROKE even when the grade, body, and timer bucket do not change');
});
