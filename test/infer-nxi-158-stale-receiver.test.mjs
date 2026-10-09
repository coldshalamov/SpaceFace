// NXI-158 — a gone receiver cannot take the cargo, and nothing is spawned to replace it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { handoverCargoToReceiver } from '../src/systems/encounterScripts.js';

test('a departed or destroyed receiver leaves the ledger alone', () => {
  const gone = handoverCargoToReceiver({ alive: false, id: 'rx', data: {} }, { qty: 4 });
  const departed = handoverCargoToReceiver({ alive: true, id: 'rx', data: { departed: true } }, { qty: 4 });
  const missing = handoverCargoToReceiver(null, { qty: 4 });
  for (const result of [gone, departed, missing]) {
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'receiver-gone');
    assert.equal(result.consumed, 0);
    assert.equal(result.spawned, false);
    assert.equal(result.ledgerUnchanged, true);
  }
  const live = handoverCargoToReceiver({ alive: true, id: 'rx', data: {} }, { qty: 4 });
  assert.equal(live.ok, true);
  assert.equal(live.spawned, false);
});
