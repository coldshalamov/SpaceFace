// INF-066 — a failed escort becomes a playable aftermath. The escortee-loss stamp routes the
// salvage successor to the true wreck (not the old destination), the marker covers the
// recovery leg, real salvage work moves progress, and docking short settles once at a
// proportional price. Success, partial, and abandonment each settle exactly once: the
// successor carries no faction hook and no collateral, so the original failure's penalty is
// never re-applied.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  escortLossSite,
  mutationWreckRouting,
  mutationPartialSettlement,
  isMutationRecovery,
} from '../src/systems/missions.js';

test('the loss site stamps sector and wreck pos, and rejects garbage', () => {
  assert.deepEqual(
    escortLossSite({ x: 120, z: -40 }, 'sector_vesta'),
    { sectorId: 'sector_vesta', wreckPos: { x: 120, z: -40 } },
    'destroy payload pos plus current sector is the stamp',
  );
  assert.equal(escortLossSite(null, 'sector_vesta'), null, 'no pos means no stamp');
  assert.equal(escortLossSite({ x: 1, z: 2 }, null), null, 'no sector means no stamp');
});

test('routing prefers the stamp, then the successor params, then legacy fallbacks', () => {
  const stamped = {
    destSectorId: 'sector_old_dest',
    _escorteeSectorId: 'sector_true_loss',
    _escorteeWreckPos: { x: 1, z: 2 },
  };
  assert.deepEqual(
    mutationWreckRouting(stamped, 'sector_now'),
    { sectorId: 'sector_true_loss', wreckPos: { x: 1, z: 2 } },
    'the stamp beats the old destination',
  );
  const successor = {
    destSectorId: 'sector_true_loss',
    params: { lostSectorId: 'sector_true_loss', lostWreckPos: { x: 1, z: 2 } },
  };
  assert.deepEqual(
    mutationWreckRouting(successor, 'sector_now'),
    { sectorId: 'sector_true_loss', wreckPos: { x: 1, z: 2 } },
    'the successor reads its carried params — both sides agree on the wreck',
  );
  assert.deepEqual(
    mutationWreckRouting({ destSectorId: 'sector_d' }, 'sector_now'),
    { sectorId: 'sector_d', wreckPos: null },
    'legacy fallback chain survives when nothing was stamped',
  );
});

test('partial settlement pays proportionally on the successor stake, and never on empty', () => {
  assert.deepEqual(
    mutationPartialSettlement(3, 4, 1000),
    { deliverQty: 3, partial: true, payCr: 750 },
    'short delivery settles once at a proportional price',
  );
  const full = mutationPartialSettlement(4, 4, 1000);
  assert.equal(full.partial, false, 'full delivery is not partial');
  assert.equal(full.payCr, 1000, 'full delivery keeps the whole stake');
  assert.equal(mutationPartialSettlement(0, 4, 1000), null, 'empty hold keeps the legacy path');
  assert.equal(isMutationRecovery({ mutationTag: 'salvage' }), true, 'salvage tag has a recovery leg');
  assert.equal(isMutationRecovery({ mutationTag: 'recovery' }), true, 'recovery tag has a recovery leg');
  assert.equal(isMutationRecovery({ mutationTag: 'cooked' }), true, 'cooked tag has a recovery leg');
  assert.equal(isMutationRecovery({}), false, 'ordinary missions have no recovery leg');
});

test('the wiring binds stamp, marker, salvage credit, and partial dock to the live seams', () => {
  const source = readFileSync(new URL('../src/systems/missions.js', import.meta.url), 'utf8');
  assert.match(
    source,
    /_escorteeSectorId = site\.sectorId;[\s\S]*?_escorteeWreckPos = site\.wreckPos;[\s\S]*?_failMission\(m, i, 'escortee_lost'\)/,
    'the escort loss stamps the site before the failure runs',
  );
  assert.match(
    source,
    /mutationWreckRouting\(m, state\.world && state\.world\.currentSectorId\)/,
    'the offer builder routes through the shared helper',
  );
  assert.match(
    source,
    /Recover the convoy wreck, then deliver to/,
    'the recovery leg marks the wreck with both legs in words',
  );
  assert.match(
    source,
    /salvageRecovered: true/,
    'real salvage work moves successor progress',
  );
  assert.match(
    source,
    /completionMethod = 'partial_recovery'/,
    'a short dock completes as a partial recovery',
  );
});
