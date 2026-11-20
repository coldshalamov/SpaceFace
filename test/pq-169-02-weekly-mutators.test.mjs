// PQ-169.02 — Weekly mutators.
//
// Seed 16920. Four weekly Crucible twists must each change the top strategy.
// The week key is a UTC calendar week, not Date.now() inside the sim.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createSimHost } from '../scripts/lib/simWorkerHost.mjs';
import { createSimCommandRing, pushLaneCommand } from '../scripts/lib/simCommandChannel.mjs';
import { createGameState } from '../src/core/gameState.js';

import { CRUCIBLE_WEEKLY_ROTATION } from '../src/data/survivalMutators.js';
import { SWARM_FLOOR_PAD_KIND } from '../src/data/swarmFloor.js';
import {
  applyWeaponsColdLoadout,
  clearQueuedChallenge,
  compileChallenge,
  offerDraftForChallenge,
  weeklyTelemetry,
} from '../src/systems/survivalMutators.js';
import {
  resetCrucibleMetaForTests,
  utcWeekKeyFromIso,
  useCrucibleMetaClock,
  useCrucibleMetaStorage,
  weeklyMutatorForNow,
  weeklyMutatorForWeekKey,
} from '../src/systems/survivalRecords.js';
import { SURVIVAL_WAVE_INTRO_TICKS } from '../src/systems/survivalRun.js';
import { clearCrucibleSetup } from '../src/ui/crucibleLaunch.js';
import { crucibleResultsScreen, crucibleScreen } from '../src/ui/screens/crucible.js';
import { mountScreen, textLines } from './helpers/fake-dom.mjs';

const SEED = 16920;
const WAVE = 1;

function resetMeta() {
  resetCrucibleMetaForTests();
  clearQueuedChallenge();
}

function strategySignature(row) {
  return JSON.stringify({
    wellCount: row.wellCount,
    heavyCount: row.heavyCount,
    fodder: row.fodder,
    physicsOnly: row.physicsOnly,
    skipDraft: row.skipDraft,
    weaponLock: row.weaponLock,
    reefLayoutId: row.reefLayoutId,
  });
}

test('same UTC week, two clocks yield the same weekly mutator id', () => {
  resetMeta();
  useCrucibleMetaClock(() => '2026-08-31T00:00:00.000Z');
  const keyA = utcWeekKeyFromIso('2026-08-31T00:00:00.000Z');
  const idA = weeklyMutatorForNow();

  useCrucibleMetaClock(() => '2026-09-06T23:59:59.000Z');
  const keyB = utcWeekKeyFromIso('2026-09-06T23:59:59.000Z');
  const idB = weeklyMutatorForNow();

  assert.equal(keyA, '2026-W36');
  assert.equal(keyB, '2026-W36');
  assert.equal(idA, idB);
  assert.equal(idA, 'gravity_slalom');
  assert.equal(weeklyMutatorForWeekKey('2026-W36'), 'gravity_slalom');
  console.log(`WEEKLY_MATCH=1 WEEK=${keyA} ID=${idA}`);
});

test('four consecutive UTC weeks are a permutation of the four weekly mutators', () => {
  resetMeta();
  const starts = [
    '2026-08-31T12:00:00.000Z',
    '2026-09-07T12:00:00.000Z',
    '2026-09-14T12:00:00.000Z',
    '2026-09-21T12:00:00.000Z',
  ];
  const ids = [];
  for (const iso of starts) {
    useCrucibleMetaClock(() => iso);
    ids.push(weeklyMutatorForNow());
  }
  assert.deepEqual(ids, CRUCIBLE_WEEKLY_ROTATION.slice());
  assert.equal(new Set(ids).size, 4);
  console.log(`ROTATION=${ids.join(',')}`);
});

test('weeklyTelemetry on seed 16920 wave 1: four mutators, four strategies', () => {
  resetMeta();
  const before = weeklyTelemetry('', SEED, WAVE);
  assert.equal(before.wellCount, 0);
  assert.equal(before.physicsOnly, false);
  assert.equal(before.skipDraft, false);
  assert.equal(before.reefLayoutId, null);
  assert.equal(before.heavyCount, 0);
  assert.equal(before.fodder, 10);

  const rows = {};
  for (const id of CRUCIBLE_WEEKLY_ROTATION) {
    rows[id] = weeklyTelemetry(id, SEED, WAVE);
  }
  const slalom = rows.gravity_slalom;
  const heavies = rows.heavies_only;
  const cold = rows.weapons_cold;
  const reef = rows.reef;

  assert.equal(slalom.wellCount, 3);
  assert.notEqual(slalom.wellCount, before.wellCount);

  assert.equal(heavies.heavyCount, 10);
  assert.equal(heavies.fodder, 0);
  assert.notEqual(heavies.heavyCount, before.heavyCount);
  assert.notEqual(heavies.fodder, before.fodder);
  for (const role of heavies.roles) {
    assert.ok(role === 'anchor' || role === 'elite', role);
  }

  assert.equal(cold.physicsOnly, true);
  assert.equal(cold.skipDraft, true);
  assert.equal(cold.weaponLock, 'starting');
  const coldChallenge = compileChallenge(SEED, ['weapons_cold'], 'swarm');
  assert.deepEqual(offerDraftForChallenge({
    seed: SEED,
    wave: WAVE,
    pickCount: 0,
    hullId: 'ship_kestrel',
    fittings: ['wpn_pulse_laser_s', null, null, null, null, null],
  }, coldChallenge).offers, []);
  assert.deepEqual(applyWeaponsColdLoadout([
    { slotIndex: 0, defId: 'wpn_concussion_cannon_m' },
    { slotIndex: 1, defId: 'wpn_gravity_marker_s' },
    { slotIndex: 7, defId: 'mod_elastic_whip_m' },
  ]).map((slot) => slot.defId), ['mod_elastic_whip_m']);

  assert.equal(reef.reefLayoutId, 'crucible_reef');
  assert.notEqual(reef.reefLayoutId, before.reefLayoutId);

  const signatures = CRUCIBLE_WEEKLY_ROTATION.map((id) => strategySignature(rows[id]));
  assert.equal(new Set(signatures).size, 4);
  assert.equal(signatures.includes(strategySignature(before)), false);

  console.log(
    'TELEMETRY_16920 '
    + `gravity_slalom wellCount=${slalom.wellCount}`
    + ` | heavies_only heavyCount=${heavies.heavyCount} fodder=${heavies.fodder}`
    + ` | weapons_cold physicsOnly=${cold.physicsOnly} skipDraft=${cold.skipDraft}`
    + ` | reef arena=${reef.reefLayoutId}`,
  );
});

test('Weapons cold skips the actual armory and stays on the result and same-seed Retry', async () => {
  resetMeta();
  clearCrucibleSetup();
  const saved = new Map();
  useCrucibleMetaStorage({ getItem: key => saved.get(key) ?? null, setItem: (key, value) => saved.set(key, value) });
  let now = '2026-09-20T23:59:59Z';
  useCrucibleMetaClock(() => now);
  const lane = createSimHost();
  const door = Object.create(crucibleScreen);
  const debrief = Object.create(crucibleResultsScreen);
  const oldDocument = globalThis.document;
  const click = (mounted, match) => {
    const button = mounted.buttons.find(match);
    assert.ok(button, 'the public control must be mounted');
    globalThis.document = mounted.doc;
    try { button.listeners.click[0](); } finally { globalThis.document = oldDocument; }
  };
  const launchRequest = (mounted) => {
    const event = mounted.emitted.find(e => e.event === 'game:new');
    assert.ok(event, 'launch uses the ordinary New Game request');
    return structuredClone(event.payload);
  };
  try {
    const match = mountScreen(door, { ctx: { state: createGameState(SEED) } });
    click(match, b => b.className.split(' ').includes('sf-crd-weekly'));
    assert.match(textLines(match.root).join(' '), /Weapons cold\. Guns stay in the rack/);
    click(match, b => b.textContent === 'Play Weapons cold');
    const original = launchRequest(match);
    const { seed } = original.crucibleSetup.survivalSetup;
    const scenarioContract = JSON.parse(readFileSync(new URL('../src/data/scenarios/47a.scenario.json', import.meta.url)));
    const init = await lane.init({ profile: 'production', seed, scenarioContract });
    const { state, registry } = lane.host;
    let tick = 0;
    let ackEnd = init.initRebuild?.end ?? 0;
    async function send(commands, steps = 0) {
      const ring = createSimCommandRing();
      for (const command of commands) pushLaneCommand(ring, command);
      const reply = await lane.tick({ tick: ++tick, steps, ackEnd, commands: ring.drain() });
      ackEnd = reply.rebuild?.end ?? ackEnd;
      return reply;
    }
    async function flyAndLose(opts) {
      clearQueuedChallenge(); // The worker never sees the page's queued mutator.
      const reply = await send([{ kind: 'mode', mode: 'loading' },
        { kind: 'rpc', id: 'weekly-boot', op: 'newGameBoot', args: { opts } }]);
      assert.equal(reply.rpcAcks.find(r => r.id === 'weekly-boot')?.ok, true);
      const offers = registry.get('survivalDraft').currentOffers();
      assert.equal(offers.length, 0, `Weapons cold must have no armory shelf, got ${offers.length} offers`);
      assert.deepEqual(state.run.arenaMutators, ['weapons_cold']);
      assert.equal(state.run.seed, seed);
      const hull = state.player.ownedShips[state.player.activeShipIndex];
      assert.ok(hull.fittings.every(defId => !defId?.startsWith('wpn_')));
      await send([{ kind: 'mode', mode: 'flight' }], SURVIVAL_WAVE_INTRO_TICKS + 2);
      assert.equal(state.run.phase, 'active', 'draftless run enters flight without a missing armory click');
      assert.equal(state.run.wave, 1);
      const floorKinds = state.entityList.filter(e => e.alive !== false && e.data?.kind === SWARM_FLOOR_PAD_KIND)
        .map(e => e.data.swarmFloorPad.kind);
      assert.deepEqual(floorKinds.sort(), ['tap', 'tap'], 'the floor opens both Taps without selling guns');
      registry.get('combat').kill(state.entities.get(state.playerId), null, { context: 'collision_terrain' });
      const owner = registry.get('survivalResults');
      assert.equal(owner.lastResult().stopReason, 'player_death');
      assert.deepEqual(owner.lastResult().mutators, ['weapons_cold']);
      return owner;
    }
    const owner = await flyAndLose(original);
    now = '2026-09-21T00:00:01Z';
    assert.equal(weeklyMutatorForNow(), 'reef');
    const result = mountScreen(debrief, { ctx: { state }, registryGet: name => name === 'survivalResults' ? owner : null });
    click(result, b => b.textContent === 'Run it again — same seed');
    await flyAndLose(launchRequest(result));
  } finally {
    lane.shutdown();
    door.dispose();
    debrief.dispose();
    clearCrucibleSetup();
    resetMeta();
  }
});
