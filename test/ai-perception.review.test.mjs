import test from 'node:test';
import assert from 'node:assert/strict';

import { aggregatePerceivedTelemetry } from '../src/ai/perception.js';

function perceptionWith(contact) {
  return {
    self: { team: 1, disabled: false, hullFraction: 1 },
    contacts: [contact],
    events: [],
  };
}

test('encounter telemetry honors the sensor hostility verdict instead of team mismatch', () => {
  const neutral = perceptionWith({
    id: 'clean-player',
    kind: 'ship',
    team: 0,
    hostile: false,
    threat: 1,
    confidence: 1,
  });
  const hostile = perceptionWith({
    id: 'wanted-player',
    kind: 'ship',
    team: 0,
    hostile: true,
    threat: 0.75,
    confidence: 0.8,
  });

  assert.deepEqual(
    aggregatePerceivedTelemetry([neutral]),
    {
      reports: 1,
      hostileContacts: 0,
      visibleThreat: 0,
      friendlyDisabledFraction: 0,
      friendlyLowHullFraction: 0,
      tetherThreats: 0,
      recentDamage: 0,
      objectiveProgress: 0,
    },
  );
  assert.equal(aggregatePerceivedTelemetry([hostile]).hostileContacts, 1);
  assert.ok(Math.abs(aggregatePerceivedTelemetry([hostile]).visibleThreat - 0.6) < 1e-12);
});
