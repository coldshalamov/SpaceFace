import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { hash32, mulberry32 } from '../src/core/rng.js';
import { missions as prototype } from '../src/systems/missions.js';
import { createAttachmentService } from '../src/combat/attachments.js';
import { createCombatCatalog, ensureCombatState } from '../src/combat/runtime.js';
import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';
import { readLifeLedger } from '../src/story/endings/lifeLedger.js';
import { queuePhysicsImpulse } from '../src/core/physicsAuthority.js';

const clone = value => JSON.parse(JSON.stringify(value));
function fixture(facts = {}) {
  const state = createGameState(4242), bus = createBus();
  state.mode = 'flight'; state.simTime = 80; state.playerId = 1;
  state.settings.gameplay.tutorialHints = false;
  state.onboarding = { active: false, finished: true };
  let nextId = 40, attachments = null;
  const player = { id: 1, type: 'ship', team: 0, alive: true, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 } };
  state.entities.set(1, player);
  const helpers = { hash32, mulberry32, player: () => player, voice: { say: () => true },
    spawnEntity(spec) {
      const e = { ...spec, id: nextId++, alive: true, pos: { ...spec.pos }, vel: { ...(spec.vel || { x: 0, z: 0 }) } };
      state.entities.set(e.id, e); state.entityList.push(e); return e;
    } };
  const registry = { get: id => id === 'combat' ? { kernel: { attachments } } : null };
  const missions = Object.assign({}, prototype); missions.init({ state, bus, helpers, registry }); missions.newGame();
  state.missions.active = []; state.story.beatIndex = 7; state.story.branch = 'traders';
  Object.assign(state.story.flags, { embodied_route: 'rescue', empire_seed_complete: true,
    proving_ground_complete: true, empire_seed_asset_id: 'seed-2' });
  missions._syncCampaignSidecarAfterAdvance();
  state.story.campaign47a.flags.spine = { v: 1, solved: facts.solved || {} };
  if (facts.pods != null) state.story.flags.reckoning_b2_saved_pods = facts.pods;
  const offer = missions.ensureBoard('station_ashcache').slots.find(row => String(row.storyTag || '').startsWith('campaign47a:b7:'));
  assert.ok(offer); assert.equal(missions.acceptMission(offer.id), true);
  const mission = state.missions.active.find(row => row.storyTag === offer.storyTag);
  state.world.currentSectorId = mission.destSectorId; missions._ensureMissionTargets(mission);
  return { state, bus, missions, mission, offer, setAttachments: value => { attachments = value; } };
}
const pieces = h => h.state.entityList.filter(e => e.alive !== false && e.data?.reckoningKey);

test('four one-fact saves produce four named physical B7 boards without mutating the spine', () => {
  const variants = [
    { solved: { 1: { method: 'cut_down' } } },
    { pods: 2 },
    { solved: { 3: { method: 'tow_in' } } },
    { solved: { 6: { asset: 'trader' } } },
  ].map(fixture);
  assert.equal(new Set(variants.map(h => h.offer.title)).size, 4);
  for (const h of variants) {
    assert.ok(h.offer.title.split(/\s+/).length <= 12);
    assert.ok(pieces(h).length > 0);
    assert.deepEqual(h.state.story.campaign47a.flags.spine.solved,
      variants.indexOf(h) === 0 ? { 1: { method: 'cut_down' } } : variants.indexOf(h) === 2
        ? { 3: { method: 'tow_in' } } : variants.indexOf(h) === 3 ? { 6: { asset: 'trader' } } : {});
  }
  const towed = fixture({ solved: { 3: { method: 'tow_in' } } });
  const slung = fixture({ solved: { 3: { method: 'sling_in' } } });
  assert.equal(pieces(towed)[0].mass, 48); assert.equal(pieces(slung)[0].mass, 96);
  assert.ok(pieces(towed)[0].data.tetherable);
  assert.ok(pieces(slung)[0].physicsBody.dynamic);
  assert.equal(pieces(fixture({ pods: 0 })).length, 0);
});

test('rescued B2 crew holds a real native line; masses move and losses survive Continue', async () => {
  const h = fixture({ pods: 2, solved: { 3: { method: 'sling_in' } } });
  const physics = await createSg02DynamicBodyOwner({ publishTelemetry: false, fixedDt: 1 / 60 });
  try {
    ensureCombatState(h.state);
    physics.syncFromEntities(pieces(h));
    const service = createAttachmentService({ state: h.state, catalog: createCombatCatalog(), helpers: { combatPhysics: physics }, bus: h.bus });
    h.setAttachments(service); h.missions._ensureMissionTargets(h.mission);
    const line = service.get(h.mission.params.reckoning.crewLineId);
    assert.equal(line?.state, 'active', h.mission.params.reckoning.crewLineBlockedReason);
    const tug = h.state.entities.get(line.ownerId);
    assert.equal(tug.data.defId, 'ship_hawser');
    assert.equal(h.state.player.tether?.active || false, false, 'NPC line never steals player control');
    const core = pieces(h).find(e => e.data.reckoningKey === 'b3_sling_in');
    const start = core.pos.x;
    queuePhysicsImpulse(core, { x: core.mass * 40, z: 0 }, { source: 'reckoning-mass-test' });
    for (let tick = 0; tick < 60; tick++) physics.step(1 / 60);
    assert.ok(core.pos.x - start > 15, 'the earlier core is usable native throwing mass');
    const liveSave = clone(h.missions.serialize());
    const continued = fixture(); continued.missions.deserialize(liveSave);
    continued.state.world.currentSectorId = 'sector_ashfall_reach';
    continued.state.entityList = []; continued.state.entities = new Map();
    const continuedMission = continued.state.missions.active.find(m => m.storyTag === h.mission.storyTag);
    continued.missions._ensureMissionTargets(continuedMission);
    const continuedPhysics = await createSg02DynamicBodyOwner({ publishTelemetry: false, fixedDt: 1 / 60 });
    try {
      ensureCombatState(continued.state); continuedPhysics.syncFromEntities(pieces(continued));
      const continuedService = createAttachmentService({ state: continued.state, catalog: createCombatCatalog(), helpers: { combatPhysics: continuedPhysics }, bus: continued.bus });
      continued.setAttachments(continuedService); continued.missions._ensureMissionTargets(continuedMission);
      assert.equal(continuedService.get(continuedMission.params.reckoning.crewLineId)?.state, 'active', 'Continue rematerializes the saved active crew line');
      continued.missions._ensureMissionTargets(continuedMission);
      assert.equal(Object.values(continued.state.combat.attachments.byId).filter(a => a.state === 'active').length, 1);
    } finally { continuedPhysics.dispose(); }
    const ballast = h.state.entities.get(line.targetId); ballast.hull = 0;
    h.bus.emit('entity:killed', { id: ballast.id, killerId: 999, physicalRole: ballast.data.physicalRole });
    ballast.alive = false;
    const saved = clone(h.missions.serialize());
    const restored = fixture(); restored.missions.deserialize(saved);
    restored.state.world.currentSectorId = 'sector_ashfall_reach';
    restored.state.entityList = []; restored.state.entities = new Map();
    const active = restored.state.missions.active.find(m => m.storyTag === h.mission.storyTag);
    restored.missions._ensureMissionTargets(active);
    const after = pieces(restored).find(e => e.data.reckoningKey === core.data.reckoningKey);
    assert.deepEqual(after.pos, core.pos); assert.deepEqual(after.vel, core.vel);
    assert.equal(pieces(restored).some(e => e.data.reckoningKey === ballast.data.reckoningKey), false);
    const count = pieces(restored).length;
    restored.missions._ensureMissionTargets(active); assert.equal(pieces(restored).length, count);
    assert.equal(readLifeLedger(restored.state).b2SavedPods, 2);
  } finally { physics.dispose(); }
});

test('a run without callbacks still wins the actual B7 demolition route', () => {
  const h = fixture();
  assert.equal(pieces(h).length, 0);
  const tower = h.mission.targetEntityIds.map(id => h.state.entities.get(id))
    .find(e => e?.data?.physicalRole === 'demolition_tower');
  assert.ok(tower);
  h.bus.emit('tether:whipImpact', { victimId: tower.id, targetId: h.state.playerId, rating: 'solid', relSpeed: 80 });
  assert.equal(h.state.story.flags.deep_reach_operation_complete, true);
  assert.equal(h.state.story.flags.endgame, true);
});

test('the legacy B2 settlement records its surviving cohort, not ambient pod rescues', () => {
  for (const lost of [0, 1]) {
    const h = fixture(); h.missions.newGame(); h.state.missions.active = [];
    h.state.story.beatIndex = 2; h.state.world.currentSectorId = 'sector_tethys_junction';
    h.missions._syncCampaignSidecarAfterAdvance();
    // Book 2 now posts cinder -> compost -> nest -> the register writ. The old
    // pod-rescue survives as an in-flight instance from a pre-list save, as in
    // campaign47a-b2-rescue-experience.test.mjs; it is no longer departure work.
    const m = h.missions._instanceFromOffer({
      id: 'b2_pod_rescue_legacy', type: 'rescue_under_fire',
      storyTag: 'campaign47a:b2:elroy', storyContractId: 'campaign47a:b2:elroy', campaign47aBeat: 2,
      title: 'Pull the pods under fire',
      brief: 'Tow a pod to Expanse, or clear both Wasp escorts and reel a pod from stand-off.',
      factionId: 'faction_scn', stationId: 'station_tethys',
      destStationId: 'station_expanse', destSectorId: 'sector_charon_expanse',
      reward_cr: 800, collateral_cr: 0, riskTier: 2, minRep: -149,
      source: 'campaign47a.embodied', distance: 3000,
      params: {
        physicalVerb: 'pull', completionMethods: ['stage_tow', 'corridor_pull'],
        authoredSetPieceId: 'pod_rescue', podCount: 2, escortCount: 2,
        escortsDown: 0, podsLost: 0, targetStrength: 1.3, fValue: 1.3, taskTime: 70,
      },
    });
    h.state.missions.active.push(m);
    h.missions.trackMission(m.id, { silent: true });
    h.state.world.currentSectorId = m.destSectorId; h.missions._ensureMissionTargets(m);
    const targets = m.targetEntityIds.map(id => h.state.entities.get(id));
    const pods = targets.filter(e => e.data?.physicalRole === 'life_pod');
    assert.equal(pods.length, 2);
    for (const escort of targets.filter(e => e.data?.physicalRole === 'rescue_escort')) {
      escort.alive = false; h.bus.emit('entity:killed', { id: escort.id, killerId: h.state.playerId });
    }
    if (lost) {
      pods[0].alive = false;
      h.bus.emit('entity:killed', { id: pods[0].id, killerId: 999 });
    }
    h.bus.emit('tether:reel', { targetId: pods.at(-1).id, actorId: h.state.playerId });
    assert.equal(h.state.story.flags.reckoning_b2_saved_pods, 2 - lost);
    assert.equal(readLifeLedger({ data: { player: h.state.player, missions: h.missions.serialize() } }).b2SavedPods, 2 - lost);
  }
});
