// Bounded production reset contract: run/Swarm owners plus the world/encounter
// dependencies exercised by retained Retry. This is deliberately not a blanket
// reset of every system, presentation cache, or intentionally persistent session ledger.
import test from 'node:test';
import assert from 'node:assert/strict';
import { FRESH_RUN_SYSTEMS } from '../src/core/runReset.js';
import { getNodeSystemFactoryTable } from '../src/runtime/nodeSystemFactoryTable.js';
import { createAuthoritativeRuntime } from '../src/runtime/createAuthoritativeRuntime.js';
import { SYSTEM_CAPABILITIES } from '../src/runtime/authoritativeSystemManifest.js';

const RELATED = new Set(['terrainAnchors', 'travelLanes', 'bountyHunt', 'aftermathWrecks',
  'fields', 'environmentalMachinery', 'encounterDirector', 'ships']);
const EVENT_OWNED = Object.freeze({
  survivalAnnounce: { event: 'run:started', method: '_reset', reason: 'Per-run announcement state resets on the accepted run start; boss-defeat deduplication intentionally remains session-scoped.' },
  survivalRun: { event: 'run:started', method: '_resetMachine', reason: 'The accepted run start owns phase-clock and launch setup.' },
  swarmArena: { event: 'run:ended', method: '_release', reason: 'The terminal receipt releases arena objects/capacity; wave one resets pressure before materialization.' },
  swarmSupply: { event: 'run:ended', method: '_reset', reason: 'The terminal receipt resets supply cadence and drop ownership.' },
  swarmChain: { event: 'run:ended', method: '_reset', reason: 'The terminal receipt publishes the best chain, then clears it.' },
  swarmJuice: { event: 'run:started', method: '_reset', reason: 'The production arcade detector resets its run-local receipts and hit-stop lease on both accepted run start and terminal run end.' },
  aftermathWrecks: { event: 'game:newGame', method: 'newGame', reason: 'Existing post-state-reset lifecycle subscription owns its marker/identity stores.' },
  fields: { event: 'game:new', method: '_clearAll', reason: 'The public New Game request releases field instances before scene teardown.' },
  environmentalMachinery: { event: 'game:new', method: '_clear', reason: 'The public New Game request releases machinery/field ownership before scene teardown.' },
  encounterDirector: { event: 'game:new', method: 'newGame', reason: 'The existing public New Game subscription clears encounters and custody.' },
});

test('production swarmJuice resets through both retained run-boundary subscriptions', () => {
  const runtime = createAuthoritativeRuntime({ profileId: 'production', nodeSafeOnly: true, seed: 4242 });
  try {
    const owner = runtime.getSystem('swarmJuice');
    const subscriptions = owner._unsubs.slice();
    const original = owner._reset;
    let resets = 0;
    owner._reset = function (...args) {
      resets++;
      return original.apply(this, args);
    };
    for (const event of ['run:started', 'run:ended']) {
      owner._recent.push({ t: 1, cause: 'old-run' });
      owner._bestChain = 17;
      const before = resets;
      runtime.bus.emit(event, { seed: 4242 });
      runtime.bus.flush();
      assert.ok(resets > before, `swarmJuice did not receive ${event}`);
      assert.deepEqual(owner._recent, [], `${event} must clear old run receipts`);
      assert.equal(owner._bestChain, 0, `${event} must clear the prior chain high-water mark`);
      assert.deepEqual(owner._unsubs, subscriptions, `${event} must retain the existing subscriptions`);
    }
  } finally {
    runtime.dispose();
  }
});
const MAIN_OWNED = Object.freeze({
  ships: 'main.startNewGame explicitly calls ships.newGame after canonical state/system reset and before applying the starter and building the player.',
});

function relevant(id) {
  return (/^(run|survival|swarm)/.test(id) || RELATED.has(id))
    && SYSTEM_CAPABILITIES[id]?.capability !== 'hud';
}

test('relevant production newGame owners require canonical registration or an explicit lifecycle exception', () => {
  const table = getNodeSystemFactoryTable({ tacticalAI: true, flightBackend: 'v3' });
  assert.equal(new Set(FRESH_RUN_SYSTEMS).size, FRESH_RUN_SYSTEMS.length,
    'canonical reset must not invoke the same owner twice');
  for (const id of FRESH_RUN_SYSTEMS) {
    assert.equal(typeof table.get(id)?.newGame, 'function',
      `${id} canonical registration must resolve to a real production newGame method`);
  }
  const seen = new Set();
  for (const [id, system] of table) {
    if (!relevant(id) || typeof system?.newGame !== 'function') continue;
    seen.add(id);
    const canonical = FRESH_RUN_SYSTEMS.includes(id);
    const exception = EVENT_OWNED[id] || MAIN_OWNED[id];
    assert.ok(canonical || exception, `${id}.newGame has no declared fresh-run owner`);
    assert.ok(!(canonical && exception), `${id} must not silently gain a second reset owner`);
  }
  for (const id of [...RELATED, 'runSession', 'survivalWave', 'survivalArena']) {
    assert.ok(seen.has(id), `${id} must remain represented by the production factory table`);
  }
  for (const id of [...Object.keys(EVENT_OWNED), ...Object.keys(MAIN_OWNED)]) {
    assert.ok(seen.has(id), `${id} exception must not become an unverified stale allowlist entry`);
  }
});

test('declared event-owned reset exceptions are actually wired on the retained production runtime', () => {
  const runtime = createAuthoritativeRuntime({ profileId: 'production', nodeSafeOnly: true, seed: 4242 });
  try {
    const seen = new Map();
    for (const [id, policy] of Object.entries(EVENT_OWNED)) {
      const owner = runtime.getSystem(id);
      assert.equal(typeof owner?.[policy.method], 'function', `${id}: ${policy.reason}`);
      const original = owner[policy.method];
      owner[policy.method] = function (...args) {
        seen.set(id, (seen.get(id) || 0) + 1);
        return original.apply(this, args);
      };
    }
    const announce = runtime.getSystem('survivalAnnounce');
    announce._bossDefeatedKeys.add('session-owned-boss-receipt');
    for (const event of new Set(Object.values(EVENT_OWNED).map(p => p.event))) {
      runtime.bus.emit(event, { seed: 4242 });
      runtime.bus.flush();
    }
    for (const [id, policy] of Object.entries(EVENT_OWNED)) {
      assert.ok(seen.get(id) > 0, `${id} did not receive ${policy.event}: ${policy.reason}`);
    }
    assert.ok(announce._bossDefeatedKeys.has('session-owned-boss-receipt'),
      'intentional session-scoped boss deduplication must not be reset with per-run announcements');
  } finally {
    runtime.dispose();
  }
});
