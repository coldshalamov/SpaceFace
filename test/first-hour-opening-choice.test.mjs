// SFQ-B062 — the opening raid's unpaid endings were speak:false. Help, theft,
// collateral, and flying on each leave a comms line the log already paints.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { runtime, openingRaidConsequence } from '../src/data/encounters/344-opening-hauler-raid.js';

function drive({ hauler, raiders, raiderEscaped = false, now = 10 }) {
  const logs = [];
  const live = {
    phase: 'conflict',
    deadlineAt: 100,
    ids: [1, 2],
    roles: { 1: 'hauler', 2: 'raider' },
    data: { freightCargoCustody: { terminal: true, raiderEscaped } },
    outcome: null,
    resolveOptions: null,
  };
  const calls = { grant: 0, rep: 0, despawn: 0 };
  const d = {
    aliveCount(_live, role) {
      if (role === 'hauler') return hauler;
      if (role === 'raider') return raiders;
      return 0;
    },
    despawnAll() { calls.despawn += 1; },
    resolve(row, outcome, options) {
      row.outcome = outcome;
      row.phase = 'done';
      row.resolveOptions = options;
      return outcome;
    },
    emit(event, payload) { logs.push({ event, payload }); },
    grant() { calls.grant += 1; },
    rep() { calls.rep += 1; },
  };
  const state = { meta: { seed: 4242 }, simTime: now };
  runtime.tick(d, live, state, now);
  return { live, logs, calls, state };
}

function comms(logs) {
  return logs.filter((row) => row.event === 'comms:log').map((row) => row.payload);
}

test('seed 4242: theft, collateral, and refusal each log a different receipt', () => {
  assert.equal(4242, 4242);
  const robbed = drive({ hauler: 0, raiders: 1, raiderEscaped: true });
  assert.equal(robbed.live.outcome, 'robbed');
  assert.deepEqual(robbed.live.resolveOptions, { speak: false });
  assert.deepEqual(comms(robbed.logs), [{
    from: 'MTS HAULER',
    text: openingRaidConsequence('robbed').text,
    kind: 'encounter',
  }]);
  assert.equal(robbed.calls.grant, 0);

  const escaped = drive({ hauler: 1, raiders: 0, raiderEscaped: true });
  assert.equal(escaped.live.outcome, 'robbed');
  assert.equal(comms(escaped.logs)[0].text, 'The thief left with the cells. You did not stop them.');

  const lost = drive({ hauler: 0, raiders: 1, raiderEscaped: false });
  assert.equal(lost.live.outcome, 'hauler_destroyed');
  assert.equal(comms(lost.logs)[0].from, 'LANE CONTROL');
  assert.match(comms(lost.logs)[0].text, /No hazard pay/);
  assert.equal(lost.calls.grant, 0);

  const left = drive({ hauler: 1, raiders: 2, now: 100 });
  assert.equal(left.live.outcome, 'raid_over');
  assert.deepEqual(left.live.resolveOptions, { speak: false });
  assert.deepEqual(left.live.ids, []);
  assert.deepEqual(left.live.roles, {});
  assert.equal(comms(left.logs)[0].text, 'You flew on. The hauler and the raiders are still out here.');
  assert.equal(left.calls.despawn, 0);
});

test('seed 4242: defending the hauler still pays and still thanks', () => {
  const defended = drive({ hauler: 1, raiders: 0, raiderEscaped: false });
  assert.equal(defended.live.outcome, 'defended');
  assert.deepEqual(defended.live.resolveOptions, { speak: true });
  assert.equal(defended.calls.grant, 1);
  assert.equal(defended.calls.rep, 1);
  assert.equal(openingRaidConsequence('defended'), null);
  assert.match(comms(defended.logs)[0].text, /Hazard pay transferred/);
  const floating = readFileSync(new URL('../src/ui/floatingText.js', import.meta.url), 'utf8');
  assert.match(floating, /comms:log/);
});
