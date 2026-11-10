// Encounter bookkeeping: resolve() must write the durable completion record that
// _gatesPass reads, so requiresCompletedShape chains unlock and uniqueOnce shapes stop
// re-offering; silent resolutions still land receipts; encounter-owned props are retired.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation } from '../src/core/sim.js';
import { encounterDirector } from '../src/systems/encounterDirector.js';

const SECTOR = 'sector_helios_prime';

function boot(seed = 4242) {
  const sim = createSimulation({ seed, systems: [encounterDirector] });
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    radius: 8, mass: 100, hull: 100, hullMax: 100, data: { intent: {}, ai: {} },
  });
  sim.state.playerId = player.id;
  sim.state.mode = 'flight';
  sim.state.world.currentSectorId = SECTOR;
  sim.state.story.beatIndex = 7;
  return { sim, state: sim.state, bus: sim.bus, director: sim.registry.get('encounterDirector') };
}

function fireRaid(t, suffix = 'raid') {
  const r = t.director.requestAuthoredEncounter({
    shapeId: 'opening_hauler_raid', encounterId: `raid:${suffix}`, sectorId: SECTOR,
    anchor: { x: 0, z: 0 }, force: true,
  });
  assert.equal(r.ok, true, `raid fires: ${r.reason}`);
  return t.state.encounterDirector.live[r.encounterId];
}

const askTail = (t, id) => t.director.requestAuthoredEncounter({
  shapeId: 'salvage_tail', encounterId: id, sectorId: SECTOR, anchor: { x: 0, z: 0 }, force: false,
});

test('resolve records completion and unlocks the requiresCompletedShape successor', () => {
  const t = boot();
  const before = askTail(t, 'tail:early');
  assert.equal(before.ok, false);
  assert.equal(before.reason, 'gated', 'chapter two is locked before chapter one');

  const live = fireRaid(t);
  assert.equal(t.state.story.depthProgramEncounters?.completed?.opening_hauler_raid, undefined);
  t.director.resolve(live, 'defended', { speak: false });

  const row = t.state.story.depthProgramEncounters.completed.opening_hauler_raid;
  assert.ok(row, 'completion row exists');
  assert.equal(row.outcome, 'defended');
  assert.equal(row.encounterId, live.id);
  assert.equal(row.visits, 1);
  assert.equal(t.state.story.depthProgramEncounters.history.at(-1).shapeId, 'opening_hauler_raid');

  const after = askTail(t, 'tail:after');
  assert.equal(after.ok, true, `successor unlocks: ${after.reason}`);
});

test('resolve does not flatten a richer row the script already wrote for this encounter', () => {
  const t = boot();
  const live = fireRaid(t);
  t.state.story.depthProgramEncounters = {
    completed: { opening_hauler_raid: { outcome: 'custom', encounterId: live.id, facts: { a: 1 } } },
  };
  t.director.resolve(live, 'defended');
  const row = t.state.story.depthProgramEncounters.completed.opening_hauler_raid;
  assert.equal(row.outcome, 'custom');
  assert.deepEqual(row.facts, { a: 1 });
});

test('uniqueOnce shapes do not re-offer after resolution', () => {
  const t = boot();
  const live = fireRaid(t);
  const shape = { id: 'opening_hauler_raid', gates: { uniqueOnce: true } };
  assert.equal(t.director._gatesPass(shape, t.state), true, 'offerable before it ran');
  t.director.resolve(live, 'escaped');
  assert.equal(t.director._gatesPass(shape, t.state), false, 'never again once completed');
  const blocked = { id: 'opening_hauler_raid', gates: { blockAfterOutcome: 'escaped' } };
  assert.equal(t.director._gatesPass(blocked, t.state), false);
});

test('silent resolve still records the receipt and notifies listeners', () => {
  const t = boot();
  const seen = [];
  t.bus.on('encounter:receipt', (p) => seen.push(p));
  const live = fireRaid(t);
  t.director.resolve(live, 'escaped', { speak: false });
  const dir = t.state.encounterDirector;
  assert.equal(seen.length, 1, 'receipt event emitted');
  assert.equal(seen[0].outcome, 'escaped');
  assert.equal(dir.receipts.at(-1).shape, 'opening_hauler_raid');
});

test('encounter-owned wrecks ride propIds and are released on resolve, not squad', () => {
  const t = boot();
  const live = fireRaid(t);
  const wreck = t.director.spawnWreck(live, { pos: { x: 40, z: 40 } });
  assert.ok(wreck, 'wreck spawned');
  assert.ok(live.propIds.includes(wreck.id), 'wreck is rostered as a prop');
  assert.ok(!live.ids.includes(wreck.id), 'never squad');
  t.director.resolve(live, 'defended', { speak: false });
  assert.ok(wreck.data.despawnAt != null, 'wreck is stamped for release');
});

test('deniable job completed with an unfired clause settles clean', () => {
  const t = boot();
  const settled = [];
  t.director._openDeniableRow = () => ({ hit: true, fired: false });
  t.director._settleDeniable = (row, kind) => settled.push(kind);
  t.director._onDeniableMissionSettled({ missionId: 'm' }, 'completed');
  assert.deepEqual(settled, ['clean']);
});
