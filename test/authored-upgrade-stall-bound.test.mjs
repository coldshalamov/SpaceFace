import assert from 'node:assert/strict';
import test from 'node:test';

import { authoredUpgradePriority, authoredUpgradeStallVerdict } from '../src/render/partsLibrary.js';

const jobAt = (inFlightAtMs, entity = { id: 'ambient', type: 'fx', alive: true }) => ({
  lifecycle: 'in-flight',
  inFlightAtMs,
  entity,
});

test('readable authored admissions use their actual hardware/software stall deadline', () => {
  const readable = { id: 'visible-ship', type: 'ship', alive: true, activity: { presentationTier: 'R0_GLASS' } };
  const hardware = { playerId: 'player', render: { gpu: { tier: 'hardware' } } };
  const software = { playerId: 'player', render: { gpu: { tier: 'software' } } };

  const hardwareAtDeadline = authoredUpgradeStallVerdict(jobAt(0, readable), 30_000, hardware);
  assert.deepEqual(hardwareAtDeadline, { boundMs: 30_000, stalled: true });

  assert.deepEqual(
    authoredUpgradeStallVerdict(jobAt(0, readable), 30_000, software),
    { boundMs: 240_000, stalled: false },
    'software GL keeps the wider decode window',
  );
  assert.deepEqual(
    authoredUpgradeStallVerdict(jobAt(0, readable), 240_000, software),
    { boundMs: 240_000, stalled: true },
  );
});

test('ambient admissions keep the ordinary async deadline', () => {
  const verdict = authoredUpgradeStallVerdict(jobAt(0), 120_000, {
    playerId: 'player', render: { gpu: { tier: 'hardware' } },
  });
  assert.deepEqual(verdict, { boundMs: 120_000, stalled: true });
});

test('runway-skirt bodies do not outrank an explicitly locked target as strict on-glass work', () => {
  const oldWindow = globalThis.window;
  const player = { id: 'player', pos: { x: 0, z: 0 } };
  const target = {
    id: 'locked', type: 'ship', alive: true, team: 2, pos: { x: 250, z: 0 }, radius: 2,
    data: { defId: 'ship_mule' },
  };
  const skirtContact = {
    id: 'skirt', type: 'fx', alive: true, pos: { x: 180, z: 0 }, radius: 2,
    activity: { presentationTier: 'R1_RUNWAY' }, data: { placeId: 'place_nav_buoy' },
  };
  const state = {
    mode: 'flight', playerId: player.id, player: { targetId: target.id },
    entities: new Map([[player.id, player], [target.id, target], [skirtContact.id, skirtContact]]),
    world: { currentSectorId: 'sector-test' },
    camera: { liveZoom: 144 },
    render: { firstPlayableFrameAt: 1, gpu: { tier: 'hardware' } },
  };
  globalThis.window = { SF: { state } };
  try {
    const targetPriority = authoredUpgradePriority({ entity: target, options: {} });
    const skirtPriority = authoredUpgradePriority({ entity: skirtContact, options: {} });
    assert.equal(targetPriority, 2, 'the target keeps its explicit-focus rung');
    assert.ok(skirtPriority > targetPriority,
      `a runway skirt contact is background work (got ${skirtPriority}), not the 1.5 on-glass rung`);
  } finally {
    if (oldWindow === undefined) delete globalThis.window;
    else globalThis.window = oldWindow;
  }
});
