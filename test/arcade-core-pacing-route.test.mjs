import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ARCADE_CORE_PACING_ROUTE_SCHEMA,
  measureArcadeCorePacingRoute,
} from '../src/testing/metrics/arcadeCorePacingRoute.js';

test('Arcade Core pacing route measures three real wings through the production owners', async () => {
  const receipt = await measureArcadeCorePacingRoute({ seeds: [0xac0901] });
  assert.equal(receipt.schema, ARCADE_CORE_PACING_ROUTE_SCHEMA);
  assert.equal(receipt.cells.length, 1);

  const { contact, bot } = receipt.cells[0];
  assert.equal(contact.usedNormalZoneEntry, true);
  assert.ok(contact.timeToFirstContactS >= 6 && contact.timeToFirstContactS <= 12,
    `normal island admission should occur in its authored 6-12s window, got ${contact.timeToFirstContactS}`);
  assert.ok(contact.timeToFirstHostileFireS >= contact.timeToFirstContactS);
  assert.equal(contact.admittedCount, 1);

  assert.equal(bot.wingCount, 3);
  assert.equal(bot.completedWings, 3);
  assert.equal(bot.kills, 9);
  assert.equal(bot.survived, true);
  assert.equal(bot.playerDeaths, 0);
  assert.ok(bot.projectileFires > 0, 'scripted trigger drives the production weapons owner');
  assert.ok(bot.projectileHits >= bot.kills * 2, 'physical projectiles repeatedly hit the live Wasp hulls');
  assert.ok(bot.hostileProjectileFires > 0, 'the three hostile wings return fire through Tactical AI');
  assert.ok(bot.inputReceipt.fireHeldTicks > 0);
  assert.ok(bot.inputReceipt.steeringTicks > 0);
  assert.ok(bot.credits > 0, 'physical credit chips settle through pickup and economy owners');
  assert.ok(bot.creditEvents.some((event) => String(event.reason).startsWith('kill:credit_chip:')),
    'at least one physical credit chip is flown down and settled through the economy owner');
  assert.ok(bot.physicalCreditChipCollections > 0);
  assert.ok(bot.physicalCreditChipCredits > 0);
  assert.ok(bot.killsPerMinute > 0);
  assert.ok(bot.creditsPerMinute > 0);
  assert.ok(bot.systemIds.includes('weapons'));
  assert.ok(bot.systemIds.includes('physics'));
  assert.ok(bot.systemIds.includes('combat'));
  assert.ok(bot.systemIds.includes('economy'));
});

test('identical pacing seed and input tape reproduce byte-for-byte metrics', async () => {
  const first = await measureArcadeCorePacingRoute({ seeds: [0xac0902] });
  const repeat = await measureArcadeCorePacingRoute({ seeds: [0xac0902] });
  assert.deepEqual(repeat, first);
});
