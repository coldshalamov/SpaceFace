// test/dust-exposure-telemetry.test.mjs
// DUST P1c — encounter exposure telemetry: per-authored-module presentation counters fed by the
// `encounter:telegraph` presentation seam, surfaced in the session report as an `exposure` section.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createTelemetry, EXPOSURE_ID_CAP } from '../src/systems/telemetry.js';

test('exposure counts per-module presentations from encounter:telegraph', () => {
  const bus = createBus();
  const state = createGameState(4711);
  state.playerId = 1;
  const telemetry = createTelemetry(bus, state);

  try {
    bus.emit('game:started', {});

    // Two firings of the same authored module (distinct live instance ids) + one other module.
    bus.emit('encounter:telegraph', { encounterId: 'live_1', kind: 'breakaway_freight', tier: 'minor', deck: 'civilian' });
    bus.emit('encounter:telegraph', { encounterId: 'live_2', kind: 'breakaway_freight', tier: 'minor', deck: 'civilian' });
    bus.emit('encounter:telegraph', { encounterId: 'live_3', kind: 'the_nest', tier: 'major', deck: 'combat' });

    const s = telemetry.getSessionStats();
    assert.equal(s.exposure.presentations, 3, 'every telegraph counts as one presentation');
    assert.equal(s.exposure.distinctCount, 2, 'authored module ids are deduped, not instance ids');
    assert.equal(s.exposure.byEncounter.breakaway_freight, 2);
    assert.equal(s.exposure.byEncounter.the_nest, 1);
    assert.equal(s.exposure.byTier.minor, 2);
    assert.equal(s.exposure.byTier.major, 1);
    assert.equal(s.exposure.overflow, 0);
  } finally {
    telemetry.dispose();
  }
});

test('exposure folds payloads without kind/tier into unknown buckets', () => {
  const bus = createBus();
  const state = createGameState(4712);
  state.playerId = 1;
  const telemetry = createTelemetry(bus, state);

  try {
    // survivalArena emits encounter:telegraph cover geometry without a tier.
    bus.emit('encounter:telegraph', { encounterId: 'survival-arena-w0', kind: 'survival_arena', pos: { x: 0, z: 0 } });
    bus.emit('encounter:telegraph', { encounterId: 'x' });

    const s = telemetry.getSessionStats();
    assert.equal(s.exposure.presentations, 2);
    assert.equal(s.exposure.byEncounter.survival_arena, 1);
    assert.equal(s.exposure.byEncounter.unknown, 1);
    assert.equal(s.exposure.byTier.unknown, 2);
  } finally {
    telemetry.dispose();
  }
});

test('exposure caps distinct ids and counts overflow without losing tracked ids', () => {
  const bus = createBus();
  const state = createGameState(4713);
  state.playerId = 1;
  const telemetry = createTelemetry(bus, state);

  try {
    bus.emit('game:started', {});

    for (let i = 0; i < EXPOSURE_ID_CAP; i++) {
      bus.emit('encounter:telegraph', { encounterId: 'live_' + i, kind: 'mod_' + i, tier: 'ambient' });
    }
    // One novel id beyond the cap: counted as overflow, not itemized.
    bus.emit('encounter:telegraph', { encounterId: 'live_over', kind: 'mod_overflow', tier: 'ambient' });
    // A repeat of an already-tracked id still increments its counter, not overflow.
    bus.emit('encounter:telegraph', { encounterId: 'live_0_again', kind: 'mod_0', tier: 'ambient' });

    const s = telemetry.getSessionStats();
    assert.equal(s.exposure.presentations, EXPOSURE_ID_CAP + 2);
    assert.equal(s.exposure.distinctCount, EXPOSURE_ID_CAP);
    assert.equal(Object.keys(s.exposure.byEncounter).length, EXPOSURE_ID_CAP, 'id map stays bounded');
    assert.equal(s.exposure.byEncounter.mod_overflow, undefined, 'overflow id is not itemized');
    assert.equal(s.exposure.byEncounter.mod_0, 2, 'tracked ids keep counting after the cap');
    assert.equal(s.exposure.overflow, 1);
    assert.equal(s.exposure.byTier.ambient, EXPOSURE_ID_CAP + 2);
  } finally {
    telemetry.dispose();
  }
});

test('session report carries an exposure section with sorted top ids', () => {
  const bus = createBus();
  const state = createGameState(4714);
  state.playerId = 1;
  const telemetry = createTelemetry(bus, state);

  try {
    bus.emit('game:started', {});
    bus.emit('encounter:telegraph', { kind: 'mod_a', tier: 'ambient' });
    bus.emit('encounter:telegraph', { kind: 'mod_a', tier: 'ambient' });
    bus.emit('encounter:telegraph', { kind: 'mod_a', tier: 'ambient' });
    bus.emit('encounter:telegraph', { kind: 'mod_b', tier: 'minor' });
    bus.emit('encounter:telegraph', { kind: 'mod_b', tier: 'minor' });
    bus.emit('encounter:telegraph', { kind: 'mod_c', tier: 'major' });

    const report = telemetry.getSessionReport();
    assert.ok(report.json.exposure, 'report json includes the exposure section');
    assert.equal(report.json.exposure.presentationsTotal, 6);
    assert.equal(report.json.exposure.distinctCount, 3);
    assert.equal(report.json.exposure.overflow, 0);
    assert.deepEqual(report.json.exposure.byTier, { ambient: 3, minor: 2, major: 1 });
    assert.deepEqual(
      report.json.exposure.topIds.map((row) => [row.id, row.count]),
      [['mod_a', 3], ['mod_b', 2], ['mod_c', 1]],
      'top ids are ordered by count descending',
    );
    assert.ok(report.markdown.includes('Encounter Exposure'), 'markdown surfaces the exposure line');
  } finally {
    telemetry.dispose();
  }
});
