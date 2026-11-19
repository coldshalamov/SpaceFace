import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createBus } from '../src/core/eventBus.js';
import { SWARM_RULESET } from '../src/data/swarmMode.js';
import { SWARM_DEBRIS_TAG } from '../src/systems/swarmArena.js';
import { ARENA_ROOM_OWNER } from '../src/systems/survivalArena.js';
import { crucibleSetupFor, requestCrucibleRun } from '../src/ui/crucibleLaunch.js';
import { threatCensus } from '../src/ui/survivalHud.js';
import { createSimCommandRing, pushLaneCommand } from '../scripts/lib/simCommandChannel.mjs';
import { createSimHost } from '../scripts/lib/simWorkerHost.mjs';

const scenarioContract = JSON.parse(readFileSync(new URL('../src/data/scenarios/47a.scenario.json', import.meta.url)));

async function launch(opts, visit) {
  const lane = createSimHost();
  try {
    const ready = await lane.init({ profile: 'production', seed: opts.seed, bridgeAll: true, scenarioContract });
    const ring = createSimCommandRing();
    const events = [];
    let ackEnd = ready.initRebuild?.end ?? 0;
    let tick = 0;
    async function send(steps, ...commands) {
      for (const command of commands) pushLaneCommand(ring, command);
      const reply = await lane.tick({ tick: ++tick, steps, ackEnd, commands: structuredClone(ring.drain()) });
      ackEnd = reply.journal?.end ?? reply.rebuild?.end ?? ackEnd;
      events.push(...reply.events);
      return reply;
    }

    async function boot(launchOpts) {
      const reply = await send(0, { kind: 'mode', mode: 'loading' },
        { kind: 'rpc', id: 'census-boot', op: 'newGameBoot', args: { opts: launchOpts } });
      const ack = reply.rpcAcks.find(row => row.id === 'census-boot');
      assert.equal(ack?.result?.ok, true, JSON.stringify(ack));
    }
    await boot(opts);
    await visit({ state: lane.host.state, registry: lane.host.registry, events, send, boot });
  } finally {
    lane.shutdown();
  }
}

function roundThreeOptions() {
  const bus = createBus();
  let opts;
  bus.on('game:new', payload => { opts = structuredClone(payload); });
  const setup = crucibleSetupFor({
    starterId: 'ricochet_runner', arenaId: 'helios_core', ruleset: SWARM_RULESET, seed: 73311, startWave: 3,
  });
  assert.equal(setup.ok, true);
  assert.equal(requestCrucibleRun(bus, setup, SWARM_RULESET), true);
  return opts;
}

test('Swarm round 3 admits only run bodies and run notices', async t => {
  await launch(roundThreeOptions(), async ({ state, registry, events, send }) => {
    assert.equal(state.run.phase, 'draft');
    await send(0, { kind: 'busEmit', emit: 'run:draftPickRequested', payload: { offerId: null } });
    await send(1, { kind: 'mode', mode: 'flight' });
    for (let i = 0; i < 240 && state.run.phase !== 'active'; i++) await send(1);
    assert.equal(state.run.wave, 3);
    assert.equal(state.run.phase, 'active');

    const live = state.entityList.filter(entity => entity.alive !== false);
    const voices = registry.get('voiceArbiter')?.queue;
    const objectives = {
      missions: state.missions.active.map(mission => mission.id),
      tracked: state.ui.trackedMissionId ?? null,
      waypoint: state.nav.waypoint ?? null,
      aftermath: state.combatOutcome?.aftermath ?? null,
    };
    const notices = events.filter(({ t: type, p: payload }) => payload != null && (
      /^(?:comms:|voice:|mission:|story:)|(?:notice|objective|aftermath|prompt)/i.test(type)
      || ['alert', 'toast', 'presentation:caption'].includes(type)));
    const voiceEntries = [voices?.active, ...(voices?.pending ?? [])].filter(Boolean);
    const runVoice = id => typeof id === 'string' && id.startsWith('survival:');
    const runVoiceTexts = new Set(notices.filter(({ t: type, p }) => type === 'voice:say' && runVoice(p.id))
      .map(({ p }) => p.text));
    t.diagnostic(JSON.stringify({
      live: live.map(({ id, type, data }) => ({
        id, type, tag: data?.runCohort ?? data?.roomOwner ?? data?.defId ?? data?.source ?? null,
      })),
      notices, objectives, waveObjective: events.filter(({ t: type }) => type === 'run:waveProgress').at(-1)?.p, voices: voiceEntries,
    }));
    assert.equal(state.world.currentSectorId, 'sector_helios_prime');
    assert.deepEqual(Object.keys(state.world.sectors), ['sector_helios_prime']);
    assert.deepEqual(state.world.discovery, {});
    assert.deepEqual(objectives, { missions: [], tracked: null, waypoint: null, aftermath: null });
    const foreign = live.filter(({ id, data }) => !(id === state.playerId
      || data?.runCohort === 'survival'
      || data?.roomOwner === ARENA_ROOM_OWNER
      || data?.roomOwner === 'survival-floor'
      || data?.[SWARM_DEBRIS_TAG] === true
      || data?.swarmArenaOptic === true
      || data?.swarmGateFlare === true
      || data?.terrainAnchorEncounterIds?.includes('survival-arena-w3')
      || data?.runtimeOwner === 'plants'
      || data?.plantsPl195X === true
      || data?.plantsPl264Light === true));
    assert.deepEqual(foreign.map(({ id, type, data }) => ({ id, type, dataKeys: Object.keys(data ?? {}),
      name: data?.name ?? data?.scanLabel ?? data?.poiId ?? data?.placeId })), []);
    assert.equal(events.filter(({ t: type }) => type === 'swarm:arenaEntered').length, 1);
    assert.ok(!events.some(({ t: type }) => type === 'sector:enter' || type === 'sector:discovered'));
    assert.ok(voices, 'the actual voice owner is installed');
    assert.ok(voiceEntries.every(entry => runVoice(entry.id)));
    assert.deepEqual(notices.filter(({ t: type, p }) => {
      if (type.startsWith('voice:')) return !runVoice(p.id);
      if (type === 'toast') return !p._fromVoice || !runVoiceTexts.has(p.text);
      if (type === 'alert') return !p.key?.startsWith('swarm-');
      return true;
    }), []);
    const waveShips = live.filter(entity => entity.type === 'ship' && entity.data?.runCohort === 'survival');
    assert.ok(waveShips.length > 0);
    assert.equal(threatCensus(state.run).alive, waveShips.length);
  });
});

test('an ordinary Helios start still admits ambient traffic and tracks 47-A', async () => {
  await launch({ seed: 73311 }, async ({ state, registry, send, boot }) => {
    await send(1, { kind: 'mode', mode: 'flight' });
    assert.equal(state.world.currentSectorId, 'sector_helios_prime');
    assert.ok(state.entityList.some(entity => entity.alive !== false && entity.data?.trafficRole),
      'Helios still has live traffic');
    assert.ok(state.missions.active.some(mission => mission.id === state.ui.trackedMissionId
      && mission.storyTag === 'campaign47a:b0:recovery'), '47-A still owns the tracked objective');

    const sectors = Object.keys(state.world.sectors);
    const save = registry.get('save');
    const envelope = save.serialize('census');
    await boot(roundThreeOptions());
    assert.equal(state.world.swarmArenaOnly, true);
    assert.equal(await save.loadEnvelope(envelope, 'census'), true);
    assert.deepEqual(Object.keys(state.world.sectors), sectors);
    assert.equal(state.world.currentSectorId, 'sector_helios_prime');
    assert.ok(state.entityList.some(entity => entity.alive !== false && entity.data?.stationId === 'station_helios'));
  });
});
