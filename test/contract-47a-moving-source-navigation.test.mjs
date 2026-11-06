import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createSimHost } from '../scripts/lib/simWorkerHost.mjs';
import { createSimCommandRing, pushLaneCommand } from '../scripts/lib/simCommandChannel.mjs';
import { missionMapAction, mapActionButtonAttrs, mapOpenIntentFromButton } from '../src/ui/screens/missionLog.js';
import { normalizeMapOpenIntent } from '../src/ui/mapAuthority.js';
import { resolveMapOpenTarget, resolveGalaxyMapPrimaryAction, commitCoursePayload } from '../src/ui/galaxyMap.js';
import { resolveAutopilotTarget } from '../src/core/flight/flightPresentationReads.js';
import { resolveWaypointPresentationPosition } from '../src/ui/navigationWaypoint.js';
import { createGameState } from '../src/core/gameState.js';
import { createSimLaneJournal } from '../src/core/simLaneJournal.js';
import { createSimLaneRuntime } from '../src/core/simLaneMain.js';
import { createBus } from '../src/core/eventBus.js';
import { createReadModel, applySpawnInfos, applyEntityVitals, applyFacadePose, applyDomainPathUpdate } from '../scripts/lib/simReadModel.mjs';

function buttonIntent(action, missionId) {
  const attrs = mapActionButtonAttrs(action, missionId);
  const values = Object.fromEntries([...attrs.matchAll(/(?:^|\s)(data-[\w-]+)="([^"]*)"/g)]
    .map(([, key, value]) => [key, value]));
  return normalizeMapOpenIntent(mapOpenIntentFromButton({ getAttribute: name => values[name] ?? null }));
}

test('production 47-A chart Track follows the bound moving asteroid and rejects stale source identity', async () => {
  const host = createSimHost();
  try {
    const main = createGameState(4242), readModel = createReadModel(), journal = createSimLaneJournal();
    main.entities = readModel.entities;
    const domains = new Map(Object.entries(main));
    const mirror = reply => {
      const msg = structuredClone(reply);
      applySpawnInfos(readModel, msg.initRebuild?.spawnInfos || []);
      applySpawnInfos(readModel, msg.spawnInfos || []);
      applyEntityVitals(readModel, msg.entityVitals);
      const rebuild = msg.initRebuild || (msg.journalFullRebuild
        ? { start: msg.journalStart, end: msg.journalEnd, pack: msg.pack } : null);
      if (rebuild?.pack) journal.applyRebuildPack(rebuild);
      else if (msg.pack) journal.applyPack(msg.pack);
      const pack = rebuild?.pack || msg.pack;
      if (pack) journal.visitRange(pack.start, pack.end, {}, record => {
        if (record.kind === 'transform') applyFacadePose(readModel, record.entityId, record);
      });
      for (const update of msg.domainUpdates || []) {
        const segs = update.segs.length === 1 && update.segs[0].includes('.') ? update.segs[0].split('.') : update.segs;
        applyDomainPathUpdate(domains, { ...update, segs }, new Set());
        main[segs[0]] = domains.get(segs[0]);
      }
      main.entityList = [...main.entities.values()];
    };
    mirror(await host.init({ profile: 'production', seed: 4242,
      scenarioContract: JSON.parse(readFileSync(new URL('../src/data/scenarios/47a.scenario.json', import.meta.url), 'utf8')) }));
    const { state, registry, runtime } = host.host;
    state.mode = 'flight';
    registry.get('world').enterSector('sector_helios_prime');
    const player = runtime.spawn({ type: 'ship', isPlayer: true, pos: { x: 0, z: 0 },
      vel: { x: 0, z: 0 }, hull: 100, hullMax: 100, collides: false, physicsBody: false,
      data: { defId: 'ship_kestrel', fittings: [], intent: {}, ai: {} } });
    state.playerId = player.id;
    state.onboarding = { active: false, finished: true };
    const owner = registry.get('missions');
    owner._installContract47aColdStart();
    const mission = state.missions.active.find(m => m.storyTag === 'campaign47a:b0:recovery');
    let source = owner._resolveContract47aSampleSource(mission);
    assert.equal(source.type, 'asteroid', 'the production world supplies the actual mineable source');
    const savedFix = { ...mission.params.samplePos };
    const manual = { kind: 'local', label: 'Player course', pos: { x: 37, z: 91 } };
    state.nav.waypoint = manual;
    // Fixture motion represents the observed freely moving native rock; no player-route pose writes.
    source.pos.x += 300; source.pos.z -= 400;
    source.vel.x = 23; source.vel.z = -28;
    owner._refreshNavigation({ silent: true });
    assert.equal(state.nav.waypoint, manual, 'reading the recovery job preserves a manual course');
    host.host.journal.recordTransform(state.tick, source);
    mirror(await host.tick({ tick: 1, steps: 0, commands: [] }));
    const mirroredMission = main.missions.active.find(m => m.id === mission.id);
    assert.notEqual(main.entities.get(source.id), source, 'main UI uses transported entity facades');
    assert.equal(main.entities.get(source.id)?.occupantGeneration, source.occupantGeneration);
    const action = missionMapAction(main, mirroredMission, true);
    assert.deepEqual(action.pos, { x: source.pos.x, z: source.pos.z }, 'live source beats its saved initial fix');
    const selected = resolveMapOpenTarget(main, buttonIntent(action, mission.id));
    const payload = resolveGalaxyMapPrimaryAction(main, selected).coursePayload;
    assert.equal(payload.targetEntityId, source.id, 'Track retains the actual source identity');
    assert.ok(payload.stable, 'the UI command carries its captured occupant witness');
    assert.deepEqual(mission.params.samplePos, savedFix, 'navigation never rewrites the resource anchor');
    assert.equal(state.nav.waypoint, manual, 'inspecting Track does not arm a course');

    const ring = createSimCommandRing();
    pushLaneCommand(ring, { kind: 'busEmit', emit: 'ui:setCourse', payload });
    mirror(await host.tick({ tick: 2, steps: 0, commands: structuredClone(ring.drain()) }));
    let autopilot = state.nav.autopilot;
    assert.equal(autopilot.targetEntityId, source.id);
    assert.equal(state.nav.waypoint.missionId, mission.id);
    assert.deepEqual(autopilot.stable, payload.stable, 'World preserves the UI witness instead of recapturing an ID');
    source.pos.x += 137; source.pos.z -= 91;
    assert.deepEqual(resolveWaypointPresentationPosition(state, state.nav.waypoint), source.pos,
      'the HUD/chart goal follows the same moving body');
    let followed = resolveAutopilotTarget(state, autopilot);
    assert.equal(followed.entity, source);
    assert.deepEqual({ x: followed.x, z: followed.z }, { x: source.pos.x, z: source.pos.z },
      'the existing flight target reader pursues the current body position');
    const sourceId = source.id, oldGeneration = source.occupantGeneration, oldField = source.data.fieldId;
    source.occupantGeneration = oldGeneration + 1;
    assert.equal(commitCoursePayload(state, selected), null, 'a stale chart cannot capture a recycled same-ID occupant');
    assert.equal(resolveAutopilotTarget(state, autopilot), null, 'recycling stops source pursuit instead of chasing an old coordinate');
    source.occupantGeneration = oldGeneration;
    source.data.fieldId = 'another-field';
    assert.equal(resolveAutopilotTarget(state, autopilot), null, 'an asteroid from a different field cannot inherit the course');
    assert.equal(registry.get('world')._onSetCourse(payload), null, 'the authoritative command owner rejects a changed source');
    source.data.fieldId = oldField;
    assert.equal(resolveAutopilotTarget(state, autopilot).entity.id, sourceId);
    const saver = registry.get('save');
    const savedNav = structuredClone(saver._serializeNav());
    assert.equal(savedNav.autopilot.targetEntityId, null, 'save drops the transient asteroid ID');
    assert.equal(savedNav.autopilot.stable, undefined);
    // Restore rematerializes the SAME canonical resource as a real new entity/occupant, so the
    // production spawn channel (rather than an in-place test generation edit) publishes its life.
    const previousSource = source;
    previousSource.alive = false;
    source = runtime.spawn({ type: 'asteroid', pos: { x: previousSource.pos.x + 80, z: previousSource.pos.z },
      vel: { ...previousSource.vel }, radius: previousSource.radius, mass: previousSource.mass,
      hull: previousSource.hull, hullMax: previousSource.hullMax, homeSectorId: previousSource.homeSectorId,
      collides: false, physicsBody: false, data: structuredClone(previousSource.data) });
    saver._restoreNav(savedNav);
    owner._restoreNavigationAfterLoad();
    autopilot = state.nav.autopilot;
    assert.equal(autopilot.active, true, 'Continue resumes only the previously active recovery burn');
    assert.equal(autopilot.stable.stamp.occupantGeneration, source.occupantGeneration);
    assert.equal(resolveAutopilotTarget(state, autopilot).entity, source, 'restore re-proves the durable field/slot');
    const inactiveNav = structuredClone(saver._serializeNav());
    inactiveNav.autopilot.active = false;
    saver._restoreNav(inactiveNav); owner._restoreNavigationAfterLoad();
    assert.equal(state.nav.autopilot.active, false, 'Continue never arms an inactive course');
    source.alive = false;
    saver._restoreNav(savedNav); owner._restoreNavigationAfterLoad();
    assert.equal(state.nav.autopilot.active, false, 'a missing bound resource stops the restored burn');
    assert.equal(state.nav.autopilot.target, null, 'missing source cannot become a stale coordinate chase');
    source.alive = true;
    saver._restoreNav(savedNav); owner._restoreNavigationAfterLoad();
    autopilot = state.nav.autopilot;
    host.host.journal.recordTransform(state.tick, source);
    mirror(await host.tick({ tick: 3, steps: 0, commands: [] }));
    const restoredMission = main.missions.active.find(m => m.id === mission.id);
    const restoredSelected = resolveMapOpenTarget(main, buttonIntent(missionMapAction(main, restoredMission, true), mission.id));
    assert.equal(restoredSelected.stable.stamp.occupantGeneration, source.occupantGeneration,
      'the restored UI receives the fresh source generation');
    const restoredPayload = commitCoursePayload(state, restoredSelected);
    assert.ok(restoredPayload);
    state.world.currentSectorId = 'sector_ceres_belt';
    assert.equal(resolveAutopilotTarget(state, autopilot), null, 'a Helios source does not remain a local Ceres course');
    state.world.currentSectorId = 'sector_helios_prime';
    mission.params.sampleRecovered = true;
    assert.equal(commitCoursePayload(state, selected), null, 'accepted assay invalidates the old recovery chart action');
    assert.equal(resolveAutopilotTarget(state, autopilot), null, 'the recovery phase cannot keep chasing the mined source');
    assert.equal(registry.get('world')._onSetCourse(restoredPayload), null, 'queued pre-assay Track is rejected after phase change');
    assert.equal(state.player.cargo.items.cmdty_47a_assay_sample, undefined, 'navigation earns no assay');
  } finally { host.shutdown(); }
});

test('a restored 47-A Track replays through the actual main bridge without echoing into the worker', async () => {
  const worker = createSimHost(), main = createGameState(4242), bus = createBus(), posts = [];
  let receive, initRequest, tick = 0;
  const lane = createSimLaneRuntime({ state: main, bus, registry: {}, helpers: {},
    flags: { lane: 'worker', sab: false, warnings: [] }, clockMode: 'worker-local',
    channelFactory: () => ({ onMessage(fn) { receive = fn; },
      post(msg) { posts.push(msg); if (msg.kind === 'init') initRequest = msg; }, terminate() {} }) });
  try {
    const init = await worker.init({ ...initRequest,
      scenarioContract: JSON.parse(readFileSync(new URL('../src/data/scenarios/47a.scenario.json', import.meta.url), 'utf8')) });
    receive(structuredClone({ kind: 'ready', seq: initRequest.seq, ...init }));
    await lane.readyPromise;
    const { state, registry, runtime } = worker.host;
    state.mode = 'flight';
    registry.get('world').enterSector('sector_helios_prime');
    const player = runtime.spawn({ type: 'ship', isPlayer: true, pos: { x: 0, z: 0 },
      vel: { x: 0, z: 0 }, hull: 100, collides: false, physicsBody: false, data: { defId: 'ship_kestrel' } });
    state.playerId = player.id; state.onboarding = { active: false, finished: true };
    const owner = registry.get('missions');
    owner._installContract47aColdStart();
    const mission = state.missions.active.find(m => m.storyTag === 'campaign47a:b0:recovery');
    const source = owner._resolveContract47aSampleSource(mission);
    const deliver = async () => {
      const reply = await worker.tick({ tick: ++tick, steps: 0, commands: [] });
      receive(structuredClone({ kind: 'clockTick', ...reply })); return reply;
    };
    await deliver();
    const target = resolveMapOpenTarget(main, missionMapAction(main, main.missions.active.find(m => m.id === mission.id), true));
    const course = commitCoursePayload(main, target);
    registry.get('world')._onSetCourse(course);
    const saver = registry.get('save');
    const saved = saver._serializeNav();
    await deliver();
    const replayed = [], before = lane.getDiagnostics().suppressedEchoes;
    bus.on('ui:setCourse', payload => replayed.push(payload));
    saver._restoreNav(saved); owner._restoreNavigationAfterLoad();
    const reply = await deliver();
    assert.equal(reply.events.filter(event => event.t === 'ui:setCourse').length, 1);
    assert.equal(replayed.length, 1, 'the restored course reaches the real main-side UI bus once');
    assert.ok(lane.getDiagnostics().suppressedEchoes > before, 'main replay suppresses its return echo');
    assert.equal(main.nav.autopilot.targetEntityId, source.id);
    const start = posts.length;
    lane.runner.prepareWithoutAdvance();
    assert.equal(posts.slice(start).some(msg => JSON.stringify(msg).includes('ui:setCourse')), false,
      'the restored course is not queued back into the worker');
  } finally { lane.close(); worker.shutdown(); }
});
