import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuthoritativeRuntime } from '../src/runtime/createAuthoritativeRuntime.js';
import { runNewGameSimBoot } from '../src/core/newGameBoot.js';
import { createTimeEffects } from '../src/core/timeEffects.js';
import { queuePhysicsImpulse } from '../src/core/physicsAuthority.js';
import { snapshotFeatureMaps, restoreFeatureMaps, applyFeatureConfigToMaps } from '../src/data/featureFlags.js';
import { LANTERN_WARD_RECORD_IDS as IDS, LANTERN_WARD_LAMP_SERIAL,
  lanternWardCanonicalAnchor } from '../src/data/lanternWardHardware.js';
import { lanternWardPoint } from '../src/data/lanternWardLayout.js';

const DT = 1 / 60, STORY = 'lw_helios_empty_plinth';
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

// Native integration evidence: normal new-game bootstrap, actual production owners and
// physical arrival/service, followed by the real save envelope restore. No rendered/browser
// route is claimed. The player's bounded impulse uses the same physics command port as the
// focused work tests; no body pose, work phase, finite inventory or credit balance is assigned.
test('full production finite-lamp service pays once through missions/economy and stays paid after restore',
  { timeout: 180000 }, async () => {
  const prior = snapshotFeatureMaps();
  const runtime = createAuthoritativeRuntime({ profileId: 'production', nodeSafeOnly: true, seed: 7404 });
  applyFeatureConfigToMaps(runtime.config.features);
  try {
    const state = runtime.state, registry = { get: name => runtime.getSystem(name) };
    const errors = [], commits = [], grants = [];
    runtime.bus.on('save:error', event => errors.push(event));
    runtime.bus.on('lanternWard:serviceCommitted', event => commits.push({ ...event }));
    runtime.bus.on('economy:grantCredits', event => { if (event.reason === STORY) grants.push({ ...event }); });
    await runNewGameSimBoot({ state, helpers: runtime.getHelpers(), bus: runtime.bus, registry,
      opts: { seed: 7404 }, awaitPhysicsPrep: true });
    state.mode = 'flight'; createTimeEffects(state).clear('runtime:loading'); runtime.bus.emit('game:started', {});
    assert.equal(state.world.currentSectorId, 'sector_helios_prime');
    assert.equal(typeof registry.get('missions').settleLanternWard, 'function');
    assert.equal(typeof registry.get('economy').grantCredits, 'function');
    const find = role => state.entityList.find(entity => entity.alive !== false && entity.data?.worldRecordId === IDS[role]);
    const player = () => state.entities.get(state.playerId);
    for (let i = 0; i < 120; i++) runtime.step(DT);
    const approach = lanternWardPoint(lanternWardCanonicalAnchor(), 'approach');
    runtime.bus.emit('ui:setCourse', { pos: approach, label: 'Lantern Ward Apron', reason: 'map', arrivalRadius: 40, autopilot: true });
    let arrived = false;
    for (let i = 0; i < 9000; i++) {
      runtime.step(DT);
      const mast = find('obstruction'), pilot = player();
      if (mast && distance(pilot.pos, mast.pos) < 200 && Math.hypot(pilot.vel.x, pilot.vel.z) < 8
        && registry.get('physics')._sg02?.records.has(mast.id)) { arrived = true; break; }
    }
    assert.equal(arrived, true, JSON.stringify({ mode: state.mode, player: player()?.pos, course: state.nav?.autopilot }));
    const mast = find('obstruction'), lamp = find('lamp'), life = lamp.occupantGeneration;
    assert.equal(lamp.data.lanternWardSerial, LANTERN_WARD_LAMP_SERIAL);
    assert.equal(commits.length, 0);
    const lines = registry.get('combat').kernel.attachments;
    const line = lines.create({ defId: 'tether_standard', ownerId: player().id, targetId: mast.id,
      sourceWorld: { ...player().pos, y: 0 }, targetWorld: { ...mast.pos, y: 0 } });
    assert.equal(line.ok, true, line.reason);
    runtime.step(DT);
    assert.equal(lines.cut(line.attachment.id, player().id, 'player_released').ok, true);
    queuePhysicsImpulse(mast, { x: mast.mass * 20, z: mast.mass * 6 },
      { tick: state.tick, tag: 'player_test_impulse' });
    let previousPhase = '', balanceAtCommit = null;
    for (let i = 0; i < 18000 && commits.length === 0; i++) {
      const before = state.player.credits;
      runtime.step(DT);
      if (commits.length) balanceAtCommit = { before, after: state.player.credits };
      const phase = registry.get('npcJobsRuntime').lanternWardStatus().phase;
      if (phase !== previousPhase) {
        console.log('LANTERN_PRODUCTION_PHASE', state.tick, phase);
        previousPhase = phase;
      }
    }
    const status = registry.get('npcJobsRuntime').lanternWardStatus();
    const diagnostic = JSON.stringify({ tick: state.tick, status, mode: state.mode,
      bodies: Object.keys(IDS).map(role => ({ role, pos: find(role)?.pos, hull: find(role)?.hull })) });
    assert.equal(commits.length, 1, diagnostic);
    assert.equal(status.phase, 'installed', diagnostic);
    assert.equal(find('lamp'), lamp);
    assert.equal(lamp.occupantGeneration, life);
    assert.equal(lamp.data.lanternWardLit, true);
    assert.equal(lamp.data.lanternWardCustody.holder, 'receiver');
    assert.equal(lamp.data.cargoManifest.totalQty, 1);
    assert.equal(status.history.playerCleared, true);
    assert.equal(state.missions.lanternWardReward?.status, 'settled');
    assert.equal(state.missions.lanternWardReward.credited, 180);
    assert.deepEqual(grants.map(event => event.amount), [180]);
    assert.equal(balanceAtCommit.after - balanceAtCommit.before, 180);
    const settled = structuredClone(state.missions.lanternWardReward), balance = state.player.credits;
    runtime.bus.emit('lanternWard:serviceCommitted', commits[0]);
    runtime.bus.emit('lanternWard:serviceCommitted', commits[0]);
    assert.equal(state.player.credits, balance);
    assert.equal(grants.length, 1);
    const saves = registry.get('save');
    const envelope = JSON.parse(JSON.stringify(saves.serialize('lantern-production-settlement')));
    assert.deepEqual(envelope.data.missions.lanternWardReward, settled);
    assert.equal(saves.loadEnvelope(envelope, 'lantern-production-settlement'), true, JSON.stringify(errors));
    state.mode = 'flight'; state.ui.screenStack = [];
    createTimeEffects(state).clear('runtime:loading');
    assert.equal(await registry.get('physics').prepareBackend(state), true);
    assert.deepEqual(state.missions.lanternWardReward, settled);
    assert.equal(state.player.credits, balance);
    for (let i = 0; i < 180; i++) runtime.step(DT);
    assert.equal(state.entityList.filter(entity => entity.alive !== false && entity.data?.worldRecordId === IDS.lamp).length, 1);
    assert.equal(find('lamp').data.lanternWardSerial, LANTERN_WARD_LAMP_SERIAL);
    assert.equal(find('lamp').data.lanternWardLit, true);
    runtime.bus.emit('lanternWard:serviceCommitted', { receiptId: settled.receiptId });
    assert.equal(state.player.credits, balance);
    assert.equal(grants.length, 1);
    assert.deepEqual(state.missions.lanternWardReward, settled);
    // Loading supersedes the mission-triggered autosave still waiting for its next host hop.
    // saveSystem records that cancellation on save:error; it is not a failed restore/write.
    assert.deepEqual(errors.filter(event => !(event.autosave === true && event.slot === 'auto'
      && event.reason === 'superseded' && event.failure === 'superseded')), []);
    console.log('LANTERN_PRODUCTION_SETTLED', JSON.stringify({ tick: state.tick,
      phase: registry.get('npcJobsRuntime').lanternWardStatus().phase, reward: settled,
      balanceAtCommit, currentBalance: state.player.credits, grants: grants.length,
      supersededAutosaves: errors.length, restoredLamp: find('lamp').id }));
  } finally { runtime.dispose(); restoreFeatureMaps(prior); }
});
