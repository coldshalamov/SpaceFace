import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSimHost } from '../scripts/lib/simWorkerHost.mjs';
import { applyDomainPathUpdate } from '../scripts/lib/simReadModel.mjs';
import { createGameState } from '../src/core/gameState.js';
import { missionMapAction, mapActionButtonAttrs, mapOpenIntentFromButton } from '../src/ui/screens/missionLog.js';
import { resolveMapOpenTarget } from '../src/ui/galaxyMap.js';
import { pauseStatusLines } from '../src/ui/screens/pause.js';

test('worker publishes the actual 47-A recovery fix, then the berth after the accepted yield', async () => {
  const host = createSimHost();
  const main = createGameState(4242);
  const domains = new Map(Object.entries(main));
  let tick = 0;
  const apply = (reply) => {
    for (const update of reply.domainUpdates || []) {
      const segs = update.segs.length === 1 && update.segs[0].includes('.') ? update.segs[0].split('.') : update.segs;
      applyDomainPathUpdate(domains, { ...update, segs }, new Set());
      main[segs[0]] = domains.get(segs[0]);
    }
  };
  const publish = async () => apply(structuredClone(await host.tick({ tick: ++tick, steps: 0, commands: [] })));
  try {
    apply(structuredClone(await host.init({ profile: 'production', seed: 4242,
      scenarioContract: JSON.parse(readFileSync(new URL('../src/data/scenarios/47a.scenario.json', import.meta.url), 'utf8')) })));
    const { state, registry, runtime, bus } = host.host;
    state.mode = 'flight';
    registry.get('world').enterSector('sector_helios_prime');
    const player = runtime.spawn({ type: 'ship', isPlayer: true, team: 0, pos: { x: 0, z: 0 },
      vel: { x: 0, z: 0 }, hull: 100, hullMax: 100, collides: false, physicsBody: false,
      data: { defId: 'ship_kestrel', fittings: [], intent: {}, ai: {} } });
    state.playerId = player.id;
    state.player.cargo = { items: {}, usedVolume: 0, usedMass: 0, capVolume: 40, capMass: 200 };
    state.onboarding = { active: true, finished: false, currentBeat: 0 };
    const owner = registry.get('missions');
    owner._installContract47aColdStart();
    const mission = state.missions.active.find(m => m.storyTag === 'campaign47a:b0:recovery');
    // The ordinary quick-save made on the Ceres-to-Helios route carries this old unbound Ceres fix.
    mission.params.samplePos = { x: -12960.599947088484, z: 8615.2890039627 };
    await publish(); // The facade has already seen the active contract before the fix exists.
    owner._refreshNavigation({ silent: true });
    const source = owner._resolveContract47aSampleSource(mission);
    assert.ok(source && source.type === 'asteroid', 'normal Helios world has an actual recovery body');
    assert.equal(source.homeSectorId || source.data?.homeSectorId || source.data?.sectorId,
      'sector_helios_prime', 'the corrected fix belongs to the actual Helios field');
    const marked = { x: source.pos.x, z: source.pos.z };
    const sourceIdentity = structuredClone(mission.params.sampleSource);
    assert.ok(sourceIdentity?.fieldId && sourceIdentity?.slotId, 'the actual world slot supplies durable identity');
    assert.deepEqual(owner.serialize().active.find(m => m.id === mission.id).params.samplePos, marked,
      'the existing mission save owns the recovery fix');
    await publish();
    let mirrored = main.missions.active.find(m => m.id === mission.id);
    assert.deepEqual(main.nav.waypoint.pos, { x: source.pos.x, z: source.pos.z });
    let action = missionMapAction(main, mirrored, true);
    assert.equal(action.stationId, null);
    assert.deepEqual(action.pos, { x: source.pos.x, z: source.pos.z });
    const attrs = mapActionButtonAttrs(action, mission.id);
    const values = Object.fromEntries([...attrs.matchAll(/(?:^|\s)(data-[\w-]+)="([^"]*)"/g)].map(([, k, v]) => [k, v]));
    const intent = mapOpenIntentFromButton({ getAttribute: name => values[name] ?? null });
    assert.equal(resolveMapOpenTarget(main, intent).kind, 'waypoint');
    assert.match(pauseStatusLines(main).next, /recover.*47-A Recovery Site/i);

    const manual = { kind: 'local', label: 'Player course', pos: { x: 37, z: 91 } };
    state.nav.waypoint = manual;
    owner._refreshNavigation({ silent: true });
    assert.equal(state.nav.waypoint, manual, 'mission refresh leaves a chosen local course alone');
    await publish();
    mirrored = main.missions.active.find(m => m.id === mission.id);
    const manualAction = missionMapAction(main, mirrored, true);
    assert.equal(manualAction.selectionTarget, '47a-recovery-fix');
    assert.deepEqual(manualAction.pos, { x: source.pos.x, z: source.pos.z });
    assert.equal(resolveMapOpenTarget(main, manualAction).kind, 'waypoint');
    assert.equal(resolveMapOpenTarget(main, { ...manualAction, pos: { x: source.pos.x + 10, z: source.pos.z } }).kind, 'sector');
    assert.equal(main.nav.waypoint.label, 'Player course');
    state.nav.waypoint = null;
    owner._refreshNavigation({ silent: true });

    state.world.currentSectorId = 'sector_ceres';
    delete mission.params.samplePos;
    assert.equal(owner._resolveContract47aSampleSource(mission), null,
      'a legacy save without a fix cannot choose a rock in another sector');
    mission.params.samplePos = { ...marked };
    bus.emit('mining:yield', { commodityId: 'cmdty_ore_iron', qty: 1, minerId: player.id, pos: { ...source.pos } });
    assert.equal(mission.params.sampleRecovered, false, 'same coordinates in another sector are not the sample');
    state.world.currentSectorId = 'sector_helios_prime';
    const actualSlot = source.data.asteroidSlotId;
    source.data.asteroidSlotId = 'recycled-other-slot';
    bus.emit('mining:yield', { commodityId: 'cmdty_ore_iron', qty: 1, minerId: player.id, pos: { ...source.pos } });
    assert.equal(mission.params.sampleRecovered, false, 'a recycled body in the same place is not the saved world slot');
    source.data.asteroidSlotId = actualSlot;
    delete mission.params.sampleSource;
    mission.params.samplePos = { x: 1e8, z: 1e8 };
    bus.emit('mining:yield', { commodityId: 'cmdty_ore_iron', qty: 1, minerId: player.id, pos: { ...mission.params.samplePos } });
    assert.equal(mission.params.sampleRecovered, false, 'an unloaded or missing marked body cannot grant the assay');
    assert.deepEqual(mission.params.samplePos, { x: 1e8, z: 1e8 }, 'the owner never moves a missing fix to an unrelated rock');
    mission.params.samplePos = { ...marked };
    mission.params.sampleSource = sourceIdentity;

    bus.emit('mining:yield', { commodityId: 'cmdty_ore_iron', qty: 1, minerId: player.id,
      pos: { x: source.pos.x + 500, z: source.pos.z } });
    assert.equal(mission.params.sampleRecovered, false, 'an unrelated rock cannot earn the sample');
    bus.emit('mining:yield', { commodityId: 'cmdty_ore_iron', qty: 1, minerId: player.id,
      pos: { x: source.pos.x + 10, z: source.pos.z } });
    assert.equal(mission.params.sampleRecovered, false, 'another nearby rock is not the marked body');
    const produced = [];
    bus.on('mining:yield', p => { if (p.minerId === player.id) produced.push({ ...p, sourceAlive: source.alive }); });
    const mining = registry.get('mining');
    const released = mining.applyMining(source.id, (source.data.oreHPMax || source.hullMax || 100) * 3, 1, player.id);
    assert.ok(released > 0, 'the actual mining owner released real ore');
    assert.ok(produced.length && produced.every(p => p.sourceAlive !== false), 'the final yield is emitted before source death');
    assert.deepEqual(produced[0].pos, { x: source.pos.x, z: source.pos.z }, 'the producer reports the rock center');
    assert.equal(mission.params.sampleRecovered, true);
    assert.equal(state.player.cargo.items.cmdty_47a_assay_sample, 1);
    await publish();
    mirrored = main.missions.active.find(m => m.id === mission.id);
    action = missionMapAction(main, mirrored, true);
    assert.equal(action.stationId, 'station_helios', JSON.stringify({ action, recovered: mirrored.params.sampleRecovered, wp: main.nav.waypoint }));
    assert.match(pauseStatusLines(main).next, /deliver.*Helios Station/i);
  } finally { host.shutdown(); }
});
