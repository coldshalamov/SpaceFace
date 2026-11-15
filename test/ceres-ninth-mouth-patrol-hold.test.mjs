// A lawful proximity patrol must not spawn on a pilot mid-tow in the Ninth Mouth pocket: its hull
// hit the towed lamp (mass 8) and the Line slung it far past seat speed. Real director pump, real
// patrol_scan shape; the beat stays pending unspent and fires once the job resolves or the pilot leaves.
import assert from 'node:assert/strict';
import test from 'node:test';

import { encounterDirector, encounterPacingBlockReason } from '../src/systems/encounterDirector.js';
import { ENCOUNTERS } from '../src/data/encounters.js';
import { CERES_NINTH_MOUTH as CUT } from '../src/data/ceresNinthMouth.js';

function harness(local = { x: 0, z: 0 }) {
  const entities = new Map();
  const pos = { x: CUT.center.x + local.x, z: CUT.center.z + local.z };
  const player = { id: 1, type: 'ship', alive: true, hull: 400, hullMax: 400, shield: 200, shieldMax: 200, pos, vel: { x: 0, z: 0 }, flags: {} };
  entities.set(1, player);
  const state = {
    playerId: 1, entities, simTime: 0, tick: 0,
    player: { flags: {}, credits: 5000, cargo: { items: {} }, bounty: 0, heat: 0 },
    onboarding: { active: false, finished: true }, ui: {},
    world: { currentSectorId: CUT.sectorId }, meta: { seed: 8008 }, story: { beatIndex: 3 },
    npcJobs: { ceresNinthMouth: { objects: { barge: { identity: `${CUT.id}:barge`, spawned: true, lost: false } }, rescue: null } },
  };
  const events = [];
  const dir = Object.create(encounterDirector);
  dir.state = state;
  dir.bus = { emit(name, payload) { events.push({ name, payload }); }, on() {} };
  dir.helpers = { spawnEntity(spec) { const e = { id: entities.size + 10, alive: true, type: 'ship', pos: { ...spec.pos }, data: spec.data || {} }; entities.set(e.id, e); return e; } };
  state.encounterDirector = {
    pending: [], active: {}, live: {}, plannedKey: null,
    pressure: { combat: 200, civilian: 200, patrol: 200 }, noise: { mining: 0 }, window: [], cooldowns: {},
    named: {}, externalNamed: {}, receipts: [], stats: { fired: 0, resolved: 0, fizzled: 0 },
    lastMeaningfulAt: -1e9, lastAmbientAt: -1e9, lastMajorAt: -1e9, lastEndAt: -1e9,
    escalationSeeds: [], _accum: 0, proxStarve: {},
  };
  const item = {
    encounterId: 'cadence:0:1', shapeId: 'patrol_scan', script: 'patrolScan', tier: 'minor', deck: 'combat', squadId: 'cadence:0:1',
    sectorId: CUT.sectorId, zoneId: 'zone_test_patrol', zoneName: 'test lane', zoneCenter: { ...pos }, zoneRadius: 620,
    factionId: 'faction_scn', bark: null, motive: null, engagementTrigger: null, variantKind: 'patrol_scan', levelBand: [2, 4], delay: 0, cadence: true,
    ships: [
      { archetype: 'patrol_lawman', level: 3, pos: { x: pos.x + 400, z: pos.z }, factionId: 'faction_scn', context: 'patrol' },
      { archetype: 'patrol_lawman', level: 3, pos: { x: pos.x + 420, z: pos.z + 30 }, factionId: 'faction_scn', context: 'patrol' },
    ],
    dueAt: 0, defers: 0,
  };
  state.encounterDirector.pending.push(item);
  const pump = (t0, t1) => { for (let t = t0; t <= t1; t += 21) { state.simTime = t; dir._pump(state.encounterDirector, state, t); } };
  const telegraphs = () => events.filter((e) => e.name === 'encounter:telegraph').length;
  return { state, item, pump, telegraphs, job: state.npcJobs.ceresNinthMouth };
}

test('a patrol scan holds unspent while the Ninth Mouth job is live and the pilot is in the pocket', () => {
  const h = harness({ x: -160, z: -45 });
  const shape = ENCOUNTERS.patrol_scan;
  assert.equal(encounterPacingBlockReason(h.state.encounterDirector, h.state, shape, 0), 'pocket_work');
  h.pump(0, 210);
  assert.equal(h.telegraphs(), 0, 'no patrol arrives on a live tow');
  assert.ok(h.state.encounterDirector.pending.includes(h.item), 'the beat stays queued');
  assert.equal(h.item.defers, 0, 'plain defer, never the fizzle counter');
  assert.equal(h.state.encounterDirector.stats.fired, 0);
  assert.equal(h.state.encounterDirector.pressure.combat, 200, 'pressure is not spent');
  assert.equal(encounterPacingBlockReason(h.state.encounterDirector, h.state, ENCOUNTERS.pirate_toll, 0) === 'pocket_work', false, 'only lawful patrols hold');
  h.job.rescue = { receiptId: 'test' };
  h.pump(231, 300);
  assert.equal(h.telegraphs(), 1, 'the patrol fires once the barge is home');
  assert.ok(!h.state.encounterDirector.pending.includes(h.item));
});

test('a patrol scan fires normally outside the pocket or once the barge is lost', () => {
  const far = harness({ x: CUT.hearingRadius + 160, z: 0 });
  assert.notEqual(encounterPacingBlockReason(far.state.encounterDirector, far.state, ENCOUNTERS.patrol_scan, 0), 'pocket_work');
  far.pump(0, 42);
  assert.equal(far.telegraphs(), 1, 'a pilot outside the pocket meets the patrol');

  const lost = harness();
  lost.job.objects.barge.lost = true;
  lost.pump(0, 42);
  assert.equal(lost.telegraphs(), 1, 'a lost barge ends the hold');

  const other = harness();
  other.state.world.currentSectorId = 'sector_helios_prime';
  assert.notEqual(encounterPacingBlockReason(other.state.encounterDirector, other.state, ENCOUNTERS.patrol_scan, 0), 'pocket_work');
});
