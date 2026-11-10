import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSimHost } from '../scripts/lib/simWorkerHost.mjs';
import { applyDomainPathUpdate } from '../scripts/lib/simReadModel.mjs';
import { createGameState } from '../src/core/gameState.js';
import { missions } from '../src/systems/missions.js';

test('a new 47-A fix skips beam-locked and depleted bodies without moving an old binding', () => {
  const state = createGameState(47);
  state.world.currentSectorId = 'sector_helios_prime';
  state.playerId = 1;
  state.entities.set(1, { id: 1, pos: { x: 0, z: 0 } });
  const rock = (id, x, data) => ({ id, type: 'asteroid', alive: true, pos: { x, z: 0 },
    data: { fieldId: 'field', asteroidSlotId: String(id), ...data } });
  const anchored = rock(2, 1, { siteAnchored: true });
  const dormant = rock(3, 2, { respawnAt: 100 });
  const depleted = rock(4, 3, { depleted: true });
  const destroyed = rock(5, 4, { destroyed: true });
  const empty = rock(6, 5, { oreHP: 0 });
  const mineable = rock(7, 10, { oreHP: 1 });
  state.entityList.push(anchored, dormant, depleted, destroyed, empty, mineable);
  const owner = Object.create(missions);
  owner.state = state;
  owner.bus = { emit() {} };
  const mission = { id: '47', storyTag: 'campaign47a:b0:recovery',
    destSectorId: 'sector_helios_prime', params: {} };
  assert.equal(owner._resolveContract47aSampleSource(mission), mineable);
  assert.equal(mission.params.sampleSource.slotId, '7');
  mission.params.sampleSource = { sectorId: 'sector_helios_prime', fieldId: 'field', slotId: '2' };
  mission.params.samplePos = { ...anchored.pos };
  assert.equal(owner._resolveContract47aSampleSource(mission), anchored,
    'existing binding is not silently replaced without owner-proven depletion');
  delete mission.params.sampleSource;
  assert.equal(owner._resolveContract47aSampleSource(mission).type, 'sample_site',
    'legacy saved fix is retained when its original site is no longer eligible');
});

test('an ambient-depleted 47-A slot re-marks a live exposure in the same field and still needs player mining', async () => {
  const host = createSimHost();
  try {
    const main = createGameState(4242), domains = new Map(Object.entries(main));
    const apply = reply => {
      for (const update of structuredClone(reply).domainUpdates || []) {
        const segs = update.segs.length === 1 && update.segs[0].includes('.') ? update.segs[0].split('.') : update.segs;
        applyDomainPathUpdate(domains, { ...update, segs }, new Set());
        main[segs[0]] = domains.get(segs[0]);
      }
    };
    apply(await host.init({ profile: 'production', seed: 4242,
      scenarioContract: JSON.parse(readFileSync(new URL('../src/data/scenarios/47a.scenario.json', import.meta.url), 'utf8')) }));
    const { state, registry, runtime, bus } = host.host;
    state.mode = 'flight';
    registry.get('world').enterSector('sector_helios_prime');
    const player = runtime.spawn({ type: 'ship', isPlayer: true, pos: { x: 0, z: 0 },
      vel: { x: 0, z: 0 }, hull: 100, hullMax: 100, collides: false, physicsBody: false,
      data: { defId: 'ship_kestrel', fittings: [], intent: {}, ai: {} } });
    state.playerId = player.id;
    state.player.cargo = { items: {}, usedVolume: 0, usedMass: 0, capVolume: 40, capMass: 200 };
    const missions = registry.get('missions');
    missions._installContract47aColdStart();
    const mission = state.missions.active.find(m => m.storyTag === 'campaign47a:b0:recovery');
    const source = missions._resolveContract47aSampleSource(mission);
    const original = structuredClone(mission.params.sampleSource);
    assert.ok(original.resourceSlotId);
    apply(await host.tick({ tick: 1, steps: 0, commands: [] }));
    const npc = runtime.spawn({ type: 'ship', pos: { ...source.pos }, vel: { x: 0, z: 0 },
      collides: false, physicsBody: false, data: {} });
    const mining = registry.get('mining');
    mining.applyMining(source.id, (source.data.oreHPMax || 100) * 3, 1, npc.id);
    assert.equal(source.alive, false);
    assert.equal(mission.params.sampleRecovered, false, 'NPC mining never grants the assay');
    const records = Object.values(state.world.resourceBodies.byId);
    assert.ok(records.some(r => r.sectorId === original.sectorId && r.fieldId === original.fieldId
      && r.slotId === original.resourceSlotId && r.outcome === 'depleted'));
    const notices = [];
    bus.on('mission:updated', p => notices.push(p));
    const replacement = missions._resolveContract47aSampleSource(mission);
    assert.equal(replacement.type, 'asteroid');
    assert.notEqual(replacement.id, source.id);
    assert.equal(replacement.data.fieldId, original.fieldId);
    assert.equal(replacement.homeSectorId, original.sectorId);
    assert.deepEqual(mission.params.samplePos, { x: replacement.pos.x, z: replacement.pos.z });
    assert.ok(notices.some(p => p.missionId === mission.id && p.sourceFix === true));
    assert.equal(mission.params.sampleRecovered, false, 'a new marker grants no cargo');
    apply(await host.tick({ tick: 2, steps: 0, commands: [] }));
    assert.deepEqual(main.missions.active.find(m => m.id === mission.id).params.samplePos,
      mission.params.samplePos, 'the worker publishes the changed fix to the main reader');
    mining.applyMining(replacement.id, (replacement.data.oreHPMax || 100) * 3, 1, player.id);
    assert.equal(mission.params.sampleRecovered, true);
    assert.equal(state.player.cargo.items.cmdty_47a_assay_sample, 1);
  } finally { host.shutdown(); }
});

test('absence, unproven depletion and other-field rocks cannot move an existing fix', async () => {
  const host = createSimHost();
  try {
    await host.init({ profile: 'production', seed: 4242,
      scenarioContract: JSON.parse(readFileSync(new URL('../src/data/scenarios/47a.scenario.json', import.meta.url), 'utf8')) });
    const { state, registry, runtime } = host.host;
    state.mode = 'flight';
    registry.get('world').enterSector('sector_helios_prime');
    const player = runtime.spawn({ type: 'ship', isPlayer: true, pos: { x: 0, z: 0 }, data: {} });
    state.playerId = player.id;
    const missions = registry.get('missions');
    missions._installContract47aColdStart();
    const mission = state.missions.active.find(m => m.storyTag === 'campaign47a:b0:recovery');
    const source = missions._resolveContract47aSampleSource(mission);
    const fix = structuredClone(mission.params.samplePos);
    const binding = structuredClone(mission.params.sampleSource);
    source.alive = false;
    assert.equal(missions._resolveContract47aSampleSource(mission).type, 'sample_site');
    assert.deepEqual(mission.params.sampleSource, binding);
    assert.deepEqual(mission.params.samplePos, fix);
    // A false receipt from another field cannot authorize substitution.
    state.world.resourceBodies = { byId: { other: { sectorId: binding.sectorId, fieldId: 'wrong-field',
      slotId: binding.resourceSlotId, outcome: 'depleted' } } };
    assert.equal(missions._resolveContract47aSampleSource(mission).type, 'sample_site');
    assert.deepEqual(mission.params.sampleSource, binding);
    assert.deepEqual(mission.params.samplePos, fix);
    for (const entity of state.entityList) {
      if (entity.type === 'asteroid' && entity.data?.fieldId === binding.fieldId) entity.alive = false;
    }
    state.world.resourceBodies = { byId: { depleted: { sectorId: binding.sectorId, fieldId: binding.fieldId,
      slotId: binding.resourceSlotId, outcome: 'depleted' } } };
    assert.equal(missions._resolveContract47aSampleSource(mission).type, 'sample_site',
      'proven depletion alone cannot select an unloaded or other-field rock');
    assert.deepEqual(mission.params.sampleSource, binding);
    assert.deepEqual(mission.params.samplePos, fix);
  } finally { host.shutdown(); }
});
