import assert from 'node:assert/strict';
import test from 'node:test';

import {
  readControlLossPresentation,
  resolveForceNeonScale,
  resolveMasslineFeelPunch,
  resolveTumbleBodyLanguage,
  resolveTumbleRecoverPose,
  TUMBLE_STATUS_ID,
} from '../src/render/masslinePresentation.js';
import { updateShipPitchPresentation } from '../src/render/shipPitchPresentation.js';

test('tumble body language is multi-axis and thrash-then-failing', () => {
  const early = resolveTumbleBodyLanguage({
    mode: 'tumbling',
    angVel: 4.2,
    spin: 4.2,
    simTime: 1.0,
    elapsedS: 0.2,
    remainS: 3.5,
  });
  const late = resolveTumbleBodyLanguage({
    mode: 'tumbling',
    angVel: 1.2,
    spin: 1.2,
    simTime: 4.0,
    elapsedS: 3.2,
    remainS: 0.3,
  });
  assert.equal(early.mode, 'tumbling');
  assert.ok(Math.abs(early.bank) > 0.02 || Math.abs(early.pitch) > 0.02,
    'tumbling ships must leave the flat plane on bank/pitch');
  assert.ok(early.rcsThrash > late.rcsThrash,
    'RCS thrash must fall as the tumble ages / spin bleeds');
  assert.ok(early.spinRibbon > 0.2, 'spin ribbons active during thrash');
  assert.ok(early.muzzleScatter > 0.3, 'muzzle scatter while tumbling');
  assert.ok(early.thrashCadenceHz >= 6, 'thrash cadence is continuous, not one-shot');

  const drift = resolveTumbleBodyLanguage({
    mode: 'drifting',
    angVel: 0.4,
    simTime: 2,
    elapsedS: 1,
    remainS: 0,
  });
  assert.equal(drift.deadThruster, 1, 'drive-disabled drift kills thruster look');
  assert.ok(drift.rcsThrash < early.rcsThrash, 'drift thrash quieter than active tumble');

  const idle = resolveTumbleBodyLanguage({ mode: 'idle', flightBank: 0.1, flightPitch: -0.05 });
  assert.equal(idle.poseIntensity, 0);
  assert.equal(idle.rcsThrash, 0);
  assert.equal(idle.bank, 0.1);
  assert.equal(idle.pitch, -0.05);

  const reduced = resolveTumbleBodyLanguage({
    mode: 'tumbling', angVel: 5, simTime: 1, elapsedS: 0, remainS: 3, motionReduce: true,
  });
  assert.equal(reduced.poseIntensity, 0, 'motionReduce suppresses thrash pose');
});

test('recover pose eases thrash toward flight lean', () => {
  const mid = resolveTumbleRecoverPose({
    ageS: 0.175,
    windowS: 0.35,
    fromBank: 0.4,
    fromPitch: -0.3,
    flightBank: 0,
    flightPitch: -0.05,
  });
  assert.equal(mid.mode, 'recovering');
  assert.ok(mid.recovering);
  assert.ok(mid.bank < 0.4 && mid.bank > 0, 'bank settles toward flight');
  const done = resolveTumbleRecoverPose({
    ageS: 0.4,
    windowS: 0.35,
    fromBank: 0.4,
    fromPitch: -0.3,
    flightBank: 0,
    flightPitch: -0.05,
  });
  assert.equal(done.mode, 'idle');
  assert.equal(done.recovering, false);
  assert.ok(Math.abs(done.pitch - (-0.05)) < 1e-9);
});

test('force neon scales force cues above hull-neutral baseline', () => {
  const hull = 1.0;
  const tautLow = resolveForceNeonScale('taut', { load: 0.1 });
  const tautHigh = resolveForceNeonScale('taut', { load: 0.95 });
  assert.ok(tautHigh.energy > tautLow.energy, 'taut neon tracks load');
  assert.ok(tautHigh.brighterThanHull && tautHigh.energy > hull);

  for (const kind of ['throw', 'whip', 'tumble', 'impulse', 'tumble.continuous']) {
    const neon = resolveForceNeonScale(kind, {
      severity: 0.9,
      rating: kind === 'whip' ? 'crushing' : undefined,
      rcsThrash: 0.8,
    });
    assert.ok(neon.energy > hull + 0.05, `${kind} must read brighter than grey hulls`);
    assert.equal(neon.brighterThanHull, true);
    assert.ok(neon.lightPeak > 1, `${kind} light peak elevated`);
  }

  const whipCrush = resolveForceNeonScale('whip', { rating: 'crushing' });
  const whipGlance = resolveForceNeonScale('whip', { rating: 'glance' });
  assert.ok(whipCrush.energy > whipGlance.energy, 'whip severity tiers scale neon');

  const reduced = resolveForceNeonScale('throw', { motionReduce: true });
  const full = resolveForceNeonScale('throw', {});
  assert.ok(reduced.energy < full.energy, 'reduced motion damps neon amplitude');
});

test('feel punches select clean/razor, important tumble, and whip tiers; motionReduce nulls', () => {
  assert.equal(resolveMasslineFeelPunch({ type: 'tether.release.razor' }, { motionReduce: true }), null);
  assert.equal(resolveMasslineFeelPunch({ type: 'tether.release.messy' }), null);

  const razor = resolveMasslineFeelPunch({ type: 'tether.release.razor' }, { mode: 'flight' });
  const clean = resolveMasslineFeelPunch({ type: 'tether.release.clean' }, { mode: 'flight' });
  assert.ok(razor && clean);
  assert.equal(razor.id, 'release.razor');
  assert.ok(razor.trauma > clean.trauma, 'razor punches harder than clean');
  assert.ok(razor.fov > clean.fov);

  const named = resolveMasslineFeelPunch({ type: 'massline.tumbled', important: true }, { mode: 'flight' });
  const ordinary = resolveMasslineFeelPunch({ type: 'massline.tumbled' }, { mode: 'flight' });
  assert.equal(named.hsDur, 0, 'massline feel never requests sim timeScale hit-stop');
  assert.ok(named.fov > ordinary.fov && named.trauma > ordinary.trauma,
    'important tumble punches harder than ordinary');

  const crush = resolveMasslineFeelPunch({ type: 'tether.whip_impact', rating: 'crushing' }, { mode: 'flight' });
  const solid = resolveMasslineFeelPunch({ type: 'tether.whip_impact', rating: 'solid' }, { mode: 'flight' });
  const glance = resolveMasslineFeelPunch({ type: 'tether.whip_impact', rating: 'glance' }, { mode: 'flight' });
  assert.ok(crush.trauma > solid.trauma && solid.trauma > glance.trauma);
  assert.ok(crush.fov > solid.fov);
  assert.equal(crush.hsDur, 0);

  const recover = resolveMasslineFeelPunch({ type: 'massline.tumbleEnd' }, { mode: 'flight' });
  assert.ok(recover && recover.hsDur === 0 && recover.fov > 0);
});

test('readControlLossPresentation never tumbles the player; ships get status/drifting', () => {
  const player = { id: 1, type: 'ship', angVel: 3 };
  const foe = { id: 2, type: 'ship', angVel: 3 };
  const state = {
    playerId: 1,
    simTime: 10,
    combat: {
      entities: {
        1: { statuses: { [TUMBLE_STATUS_ID]: { id: TUMBLE_STATUS_ID, data: { kind: 'massline_tumble', startedAt: 9, until: 14, spin: 3 } } } },
        2: {
          statuses: { [TUMBLE_STATUS_ID]: { id: TUMBLE_STATUS_ID, data: { kind: 'massline_tumble', startedAt: 9, until: 14, spin: 3 } } },
          capabilities: { drive: false },
        },
      },
    },
  };
  const p = readControlLossPresentation(state, player);
  const f = readControlLossPresentation(state, foe);
  assert.equal(p.mode, 'idle', 'player immunity in presentation');
  assert.equal(f.mode, 'tumbling');
  assert.equal(f.drifting, true);
});

test('updateShipPitchPresentation owns bank/pitch while tumbling and clears thrash on idle', () => {
  const tumbling = {
    id: 7,
    alive: true,
    type: 'ship',
    flags: { docked: false },
    vel: { x: 0, z: 0 },
    rot: 0,
    angVel: 3.5,
    maxSpeed: 100,
    pitch: 0,
    bank: 0,
  };
  const state = {
    playerId: 1,
    simTime: 5,
    entityList: [tumbling],
    combat: {
      entities: {
        7: {
          statuses: {
            [TUMBLE_STATUS_ID]: {
              id: TUMBLE_STATUS_ID,
              data: { kind: 'massline_tumble', startedAt: 4, until: 9, spin: 3.5 },
            },
          },
        },
      },
    },
  };
  assert.equal(updateShipPitchPresentation(state, 1 / 60), 1);
  assert.ok(Math.abs(tumbling.bank) > 0.01 || Math.abs(tumbling.pitch) > 0.01,
    'sustained thrash pose applied');
  assert.ok(tumbling.presentation && tumbling.presentation.tumble);
  assert.equal(tumbling.presentation.tumble.mode, 'tumbling');
  assert.ok(tumbling.presentation.tumble.rcsThrash > 0);

  // Clear status → recover settle starts
  delete state.combat.entities[7].statuses[TUMBLE_STATUS_ID];
  state.simTime = 5.02;
  updateShipPitchPresentation(state, 1 / 60);
  assert.ok(tumbling.presentation.tumbleRecover || tumbling.presentation.tumble.mode === 'recovering'
    || tumbling.presentation.tumble.mode === 'idle');
});
