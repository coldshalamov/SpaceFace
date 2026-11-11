import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuthoritativeRuntime } from '../src/runtime/createAuthoritativeRuntime.js';
import { createGameState } from '../src/core/gameState.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';
import { queuePhysicsImpulse } from '../src/core/physicsAuthority.js';
import { snapshotFeatureMaps, applyFeatureConfigToMaps, restoreFeatureMaps } from '../src/data/featureFlags.js';
import { CERES_SHIPBREAK_MANIFEST as SITE } from '../src/data/ceresShipbreak.js';
import { CERES_WORKFLEET_CONTRACT as C } from '../src/data/ceresWorkfleet.js';
import { stepCeresWorkfleet, reconcileCeresWorkfleetPresentation } from '../src/systems/ceresWorkfleet.js';
import { ceresWorkfleetYardCall, stepCeresWorkfleetStagecraft } from '../src/systems/ceresWorkfleetStagecraft.js';
import { generateContacts, getChoices, buildReply } from '../src/ui/station/barContacts.js';

const DT = 1 / 60;
const copy = value => JSON.parse(JSON.stringify(value));
function deskReply(record) {
  const state = createGameState(48);
  Object.assign(state.ui, { docked: true, dockedStationId: 'station_helios' });
  state.sites = { worldById: { [SITE.id]: record } };
  const contact = generateContacts('station_helios', state).find(c => c.canonicalKey === 'kessler');
  assert.ok(contact, 'ordinary Helios Bar exposes the canonical Kessler');
  assert.ok(getChoices(contact.role, contact).some(c => c.id === 'ceres_second_measure_shift'));
  return buildReply(contact.role, 'ceres_second_measure_shift', { state }, 'station_helios', contact).text;
}

// The real production factory supplies the owners and full save envelope. Beam-hold
// and movement setup are explicit fixtures, not a rendered public-route assertion.
async function fixture() {
  const runtime = createAuthoritativeRuntime({ profileId: 'production', nodeSafeOnly: true, seed: 48 });
  const flags = snapshotFeatureMaps(); applyFeatureConfigToMaps(runtime.config.features);
  const state = runtime.state; state.mode = 'flight';
  const player = runtime.spawn(makeShipEntitySpec('ship_kestrel', { isPlayer: true, player: state.player,
    pos: { x: 0, z: 0 }, fittings: [] })); state.playerId = player.id;
  const world = runtime.getSystem('world'); world.enterSector(C.sectorId);
  world.relocatePlayerInSector(SITE.mapAnnotation.coursePos, { reason: 'ceres-consequence-fixture' });
  const sites = runtime.getSystem('asteroidSites'); sites._syncWorldSites(C.sectorId);
  const physics = runtime.getSystem('physics'); assert.equal(await physics.prepareBackend(state), true);
  reconcileCeresWorkfleetPresentation({ state });
  const mining = runtime.getSystem('mining'), jobs = runtime.getSystem('npcJobsRuntime');
  const events = []; runtime.bus.on('comms:message', message => {
    if (message.sender === 'SECOND MEASURE YARD') events.push(message);
  });
  const component = id => [...state.entities.values()].find(entity => entity.alive !== false
    && entity.data?.worldSiteId === SITE.id && entity.data?.worldSiteComponentId === id);
  function beam(id, ticks) {
    const player = state.entities.get(state.playerId);
    const target = component(id); assert.ok(target, id);
    // Same clear work approach used by the existing ordinary-owner shipbreak route.
    player.pos.set(target.pos.x, 0, target.pos.z - 90); player.vel.set(0, 0, 0);
    state.ui.docked = false; state.ui.beamMode = 'auto'; state.ui.componentSelection = null;
    state.player.targetId = target.id; state.input.actions = { mine: true, siteBeam: true };
    state.input.fireGroup = 2;
    mining._stopBeam();
    for (let n = 0; n < ticks; n++) {
      state.tick++; state.simTime += DT;
      mining.update(DT, state);
    }
    mining._stopBeam(); state.input.actions = {}; state.input.fireGroup = 0;
  }
  return { runtime, state, get player() { return state.entities.get(state.playerId); }, sites, physics, jobs, events, component, beam,
    record: () => sites.getWorldSite(SITE.id),
    close() { runtime.dispose(); restoreFeatureMaps(flags); } };
}

test('cutting before bracing leaves the real free original and explains the lost job across full save restore', async () => {
  const h = await fixture();
  try {
    let original = h.component('long_plate'); const beforeCredits = h.state.player.credits;
    h.beam('long_plate', 181);
    assert.ok(h.record().completedOperations.cut_long_plate_seam);
    assert.equal(original.physicsBody.dynamic, true);
    h.beam('long_plate_clamp', 100);
    assert.equal(h.record().completedOperations.brace_long_plate, undefined);
    assert.equal(h.state.player.credits, beforeCredits, 'no completed brace means no wage');
    stepCeresWorkfleet(h.jobs, DT);
    assert.equal(h.state.npcJobs.ceresWorkfleet, undefined, 'a warning cannot start an impossible lift');
    assert.match(h.events.at(-1).text, /cut before the brace.*cannot catch.*cannot start/i);
    assert.match(deskReply(h.record()), /paid brace job is no longer available/i);
    h.physics.update(DT, h.state);
    const before = { x: original.pos.x, z: original.pos.z };
    queuePhysicsImpulse(original, { x: 0, z: -original.mass * 12 }, { source: 'ceres-consequence-fixture' });
    for (let n = 0; n < 120; n++) { h.state.tick++; h.state.simTime += DT; h.physics.update(DT, h.state); }
    assert.ok(original.pos.z < before.z - 10, 'the unsupported original moves under native impulse');
    const expected = { x: original.pos.x, z: original.pos.z, vx: original.vel.x, vz: original.vel.z };
    const saver = h.runtime.getSystem('save'), envelope = copy(saver.serialize('ceres-cut-consequence'));
    assert.equal(saver.loadEnvelope(envelope, 'ceres-cut-consequence'), true);
    h.state.mode = 'flight'; h.state.ui.docked = false; h.state.ui.screenStack = [];
    h.sites._syncWorldSites(C.sectorId);
    assert.equal(await h.physics.prepareBackend(h.state), true);
    const restored = h.component('long_plate'); assert.ok(restored);
    assert.equal(restored.data.worldRecordId, C.identities.payload);
    assert.equal(restored.physicsBody.dynamic, true);
    assert.equal(restored.mass, 1800);
    assert.ok(Math.hypot(restored.pos.x - expected.x, restored.pos.z - expected.z) < 1e-5);
    assert.ok(Math.hypot(restored.vel.x - expected.vx, restored.vel.z - expected.vz) < 1e-5);
    assert.equal(ceresWorkfleetYardCall(h.record(), h.state.npcJobs.ceresWorkfleet), 'unbraced_cut');
    assert.match(deskReply(h.record()), /paid brace job is no longer available/i);
    assert.equal(h.state.player.credits, beforeCredits);
    assert.equal([...h.state.entities.values()].filter(e => e.alive && e.data?.worldRecordId === C.identities.payload).length, 1);
  } finally { h.close(); }
});

test('brace then cut explains the remaining clamp, and release starts the existing original tow preparation', async () => {
  const h = await fixture();
  try {
    let original = h.component('long_plate'); const beforeCredits = h.state.player.credits;
    h.beam('long_plate_clamp', 81); stepCeresWorkfleet(h.jobs, DT);
    assert.ok(h.record().completedOperations.brace_long_plate);
    assert.equal(h.state.player.credits, beforeCredits + 400);
    h.beam('long_plate', 181);
    assert.equal(original.physicsBody.dynamic, false, 'the real brace carries the cut original');
    assert.equal(ceresWorkfleetYardCall(h.record(), h.state.npcJobs.ceresWorkfleet), 'awaiting_release');
    h.state.simTime += 9; stepCeresWorkfleetStagecraft(h.jobs, h.record());
    assert.match(h.events.at(-1).text, /seam is cut.*clamp still holds.*release.*original plate/i);
    const saver = h.runtime.getSystem('save'), originalLife = original.occupantGeneration;
    assert.equal(saver.loadEnvelope(copy(saver.serialize('ceres-supported-cut')), 'ceres-supported-cut'), true);
    h.state.mode = 'flight'; h.state.ui.docked = false; h.state.ui.screenStack = [];
    h.sites._syncWorldSites(C.sectorId); assert.equal(await h.physics.prepareBackend(h.state), true);
    original = h.component('long_plate');
    assert.notEqual(original.occupantGeneration, originalLife);
    assert.equal(original.data.worldRecordId, C.identities.payload);
    assert.equal(original.physicsBody.dynamic, false, 'Continue retains the actual support');
    assert.equal(ceresWorkfleetYardCall(h.record(), h.state.npcJobs.ceresWorkfleet), 'awaiting_release');
    assert.equal(h.state.player.credits, beforeCredits + 400, 'Continue does not repay the brace');
    h.beam('long_plate_clamp', 61);
    assert.equal(original.physicsBody.dynamic, true);
    assert.ok(h.record().completedOperations.release_long_plate_clamp);
    assert.strictEqual(h.component('long_plate'), original);
    assert.equal(h.state.player.credits, beforeCredits + 400, 'cut and release do not repeat the wage');
    assert.match(deskReply(h.record()), /do not have a completed lift/i);
    const seen = new Set();
    // Public production tick with a clear observation position; no phase/attachment injection.
    h.player.pos.set(C.sitePlacement.pos.x - 600, 0, C.sitePlacement.pos.z - 160);
    for (let n = 0; n < 900; n++) {
      h.runtime.step(DT); seen.add(h.state.npcJobs.ceresWorkfleet?.phase);
      if (seen.has('extract')) break;
    }
    const job = h.state.npcJobs.ceresWorkfleet;
    assert.ok(seen.has('extract'), JSON.stringify({ phase: job.phase, reason: job.blockedReason }));
    const line = h.runtime.getSystem('combat').kernel.attachments.get(job.towId);
    assert.equal(line.state, 'active'); assert.equal(line.targetId, original.id);
    assert.equal(h.record().payloads.long_plate.retained, undefined, 'a real tow is not a cradle receipt');
  } finally { h.close(); }
});

test('current destruction outranks old secured state; docking and repeat calls stay quiet', () => {
  const record = { completedOperations: { cut_long_plate_seam: {} }, payloads: { long_plate: {} } };
  const player = { id: 1, alive: true, pos: { ...SITE.mapAnnotation.coursePos }, flags: {} };
  const state = { mode: 'flight', simTime: 0, playerId: 1, entities: new Map([[1, player]]),
    world: { currentSectorId: C.sectorId }, ui: { docked: true }, npcJobs: {} };
  const calls = [], owner = { state, bus: { emit: (name, message) => calls.push(message) } };
  stepCeresWorkfleetStagecraft(owner, record); assert.equal(calls.length, 0);
  state.ui.docked = false; stepCeresWorkfleetStagecraft(owner, record); assert.equal(calls.length, 1);
  for (let n = 0; n < 10; n++) { state.simTime += 10; stepCeresWorkfleetStagecraft(owner, record); }
  assert.equal(calls.length, 1);
  record.payloads.long_plate.destroyed = true;
  state.npcJobs.ceresWorkfleet = { phase: 'secured' };
  assert.equal(ceresWorkfleetYardCall(record, state.npcJobs.ceresWorkfleet), 'destroyed');
  stepCeresWorkfleetStagecraft(owner, record); assert.equal(calls.length, 2);
  assert.match(calls.at(-1).text, /plate is gone/i);
  assert.match(deskReply(record), /plate is gone/i);
});
