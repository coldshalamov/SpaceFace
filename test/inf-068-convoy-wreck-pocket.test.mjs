// INF-068 — one salvage job's complication with two physical answers. The convoy-wreck
// successor materializes a real pocket: one drifting wreck holding the contract cargo with
// its core armed. Tow it clear / vent it (safe answers) or race its burst timer (fast
// answer) — all through existing salvage mechanics — and both end in the canonical
// credit-plus-dock settlement. The burst takes the cargo, so the tradeoff is real.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  convoyWreckPocket,
  CONVOY_WRECK_RING_WU,
  CONVOY_WRECK_DRIFT_WU_S,
} from '../src/systems/missions.js';
import { actionById, actionForWreck } from '../src/data/salvageActions.js';

const successor = {
  id: 'm_9',
  type: 'salvage_retrieval',
  status: 'active',
  mutationTag: 'salvage',
  objectiveProgress: 0,
  objectiveTarget: 4,
  params: {
    cmdtyId: 'cmdty_scrap_metal',
    qty: 4,
    lostSectorId: 'sector_vesta',
    lostWreckPos: { x: 1000, z: -500 },
  },
};

const opts = { nowS: 500, ringAngle: 0, driftAngle: Math.PI / 2, currentSectorId: 'sector_vesta' };

test('the pocket is a drifting wreck holding the contract cargo with its core armed', () => {
  const pocket = convoyWreckPocket(successor, opts);
  assert.ok(pocket, 'a pocket authors for the successor');
  assert.equal(pocket.sectorId, 'sector_vesta', 'the pocket sits in the loss sector');
  assert.equal(pocket.spec.type, 'wreck', 'a real wreck body, not a rumor');
  assert.deepEqual(
    pocket.spec.data.authoredSalvagePool,
    { cmdty_scrap_metal: 4 },
    'the desired cargo rides in the authored pool at full contract qty',
  );
  const reactor = pocket.spec.data.unstableReactor;
  assert.ok(reactor && typeof reactor === 'object', 'the core is armed');
  assert.equal(reactor.vented, false, 'unvented on arrival');
  assert.equal(reactor.burst, false, 'unburst on arrival');
  assert.equal(reactor.towedClear, false, 'not cleared on arrival');
  const catalog = actionById('vent_reactor');
  assert.equal(pocket.dueAt, 500 + catalog.timerS, 'the clock is the live catalog timer');
  assert.equal(reactor.dueAt, pocket.dueAt, 'the armed core and the pocket agree on the clock');
  const drift = Math.hypot(pocket.spec.vel.x, pocket.spec.vel.z);
  assert.equal(drift, CONVOY_WRECK_DRIFT_WU_S, 'the wreck moves — station-keeping is work');
  const ring = Math.hypot(
    pocket.spec.pos.x - 1000,
    pocket.spec.pos.z - (-500),
  );
  assert.equal(ring, CONVOY_WRECK_RING_WU, 'the pocket rings the loss site, not the player');
});

test('the armed pocket answers the salvage catalog with vent-or-tow play', () => {
  const pocket = convoyWreckPocket(successor, opts);
  const action = actionForWreck({ type: 'wreck', data: pocket.spec.data });
  assert.equal(action.id, 'vent_reactor', 'the catalog offers the timed-opening play');
  assert.deepEqual(action.counterplay, ['vent', 'tether-away'], 'both physical answers are named');
});

test('the clock persists across spawns and the pocket refuses off-type work', () => {
  const relaunch = convoyWreckPocket(
    { ...successor, params: { ...successor.params, convoyWreckDueAt: 420 } },
    { ...opts, nowS: 900 },
  );
  assert.equal(relaunch.dueAt, 420, 're-entry keeps the armed clock — leaving never resets it');
  assert.equal(convoyWreckPocket({ ...successor, type: 'cargo_delivery' }, opts), null, 'no pocket off-type');
  assert.equal(convoyWreckPocket({ ...successor, mutationTag: null }, opts), null, 'no pocket off-tag');
  assert.equal(
    convoyWreckPocket({ ...successor, params: { cmdtyId: 'cmdty_scrap_metal', qty: 4 } }, opts),
    null,
    'no pocket without a loss site',
  );
  assert.equal(
    convoyWreckPocket({ ...successor, params: { ...successor.params, cmdtyId: null } }, opts),
    null,
    'no pocket without a contract commodity',
  );
  const again = convoyWreckPocket(successor, opts);
  assert.deepEqual(again, convoyWreckPocket(successor, opts), 'same inputs author the same pocket');
});

test('the wiring spawns the pocket on sector entry and briefs both answers', () => {
  const source = readFileSync(new URL('../src/systems/missions.js', import.meta.url), 'utf8');
  assert.match(
    source,
    /m\.type === 'salvage_retrieval' && isMutationRecovery\(m\)\) \{/,
    'the spawn flow owns a salvage-successor branch',
  );
  assert.match(
    source,
    /convoyWreckPocket\(m, \{/,
    'the branch authors through the shared helper, not a copy',
  );
  assert.match(
    source,
    /if \(isMutationRecovery\(successor\)\) successor\.needsTargets = true;/,
    'the successor enters the ordinary spawn flow',
  );
  assert.match(
    source,
    /tow it clear, vent it, or strip it before it bursts/,
    'the brief names both answers, not flavor',
  );
});
