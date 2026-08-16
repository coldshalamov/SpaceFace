import assert from 'node:assert/strict';
import test from 'node:test';

import TETHER_CUTTER_ENCOUNTER from '../src/data/encounters/334-tether-control-raider-ambush.js';
import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { physics } from '../src/core/physics.js';
import { planEncounterShape } from '../src/systems/encounterDirector.js';
import { zonesForSector } from '../src/data/sectorZones.js';
import { actions } from '../src/systems/actions.js';
import { aiPorts } from '../src/systems/aiPorts.js';
import { AUDIO_CUE_TO_RECIPE } from '../src/audio/audioSystem.js';
import { combat, makeEnemySpawnSpec } from '../src/systems/combat.js';
import { tetherGameplay } from '../src/systems/tetherGameplay.js';
import { createTacticalAISystem } from '../src/systems/tacticalAI.js';
import { weapons } from '../src/systems/weapons.js';
import { createVisualFactory } from '../src/render/visualFactory.js';
import { installVisualOverrides } from '../src/render/visualOverrides.js';
import { vfx } from '../src/render/vfx.js';

function canvasStub() {
  const context = {
    createImageData(width, height) { return { data: new Uint8ClampedArray(width * height * 4), width, height }; },
    putImageData() {}, fillRect() {}, strokeRect() {}, clearRect() {}, drawImage() {}, fillText() {},
    save() {}, restore() {}, translate() {}, rotate() {}, scale() {}, setTransform() {},
    beginPath() {}, closePath() {}, moveTo() {}, lineTo() {}, arc() {}, rect() {}, fill() {}, stroke() {}, clip() {},
    quadraticCurveTo() {}, bezierCurveTo() {}, measureText() { return { width: 10 }; },
    createLinearGradient() { return { addColorStop() {} }; },
    createRadialGradient() { return { addColorStop() {} }; },
  };
  return { width: 256, height: 256, getContext: () => context };
}

globalThis.document ||= { createElement: () => canvasStub() };
globalThis.__SF_VISUAL_FACTORY_THROW__ = true;

test('ordinary encounter 334 admits the authored cutter and its canonical mounted shear rig', (t) => {
  const zone = zonesForSector('sector_ceres_belt')
    .find((candidate) => TETHER_CUTTER_ENCOUNTER.zoneTypes.includes(candidate.type));
  assert.ok(zone, 'a production sector offers the ordinary rare-specialist route');
  const planned = planEncounterShape(TETHER_CUTTER_ENCOUNTER, zone, zone.sectorId, 0, 334, () => 0.25);
  const anchor = planned.ships.find((ship) => ship.compositionRole === 'identity_anchor');
  assert.equal(anchor?.archetype, 'tether_control_raider');

  const entity = entityFromSpec(334, makeEnemySpawnSpec(anchor.archetype, anchor.level, anchor.pos, {
    factionId: anchor.factionId,
  }));
  const factory = installVisualOverrides(createVisualFactory(), {
    authoredShips: true,
    directAuthoredMount: true,
  });
  const visual = factory.build(entity);
  assert.equal(visual.userData.authoredAssetState, 'designed-procedural-settled');
  assert.equal(visual.userData.specialistPresentationId, 'tether_control_raider');
  assert.equal(visual.visible, true);
  assert.deepEqual(visual.userData.tetherCutterWorldTell, {
    cue: 'glowing_shear_rig_and_charge_whine',
    geometry: 'rooted_twin_hinge_carbide_shear_with_copper_induction_rails',
    cameraFacing: false,
    animatedOpacity: false,
  });
  const rig = visual.getObjectByName('TetherCutterShearRig');
  assert.ok(rig, 'the canonical direct-authored mount retains the rooted factory rig');
  assert.equal(rig.getObjectByName('TetherCutterCarbideShearBlade')?.isMesh, true);
  let forbidden = 0;
  rig.traverse((child) => {
    if (child.isSprite || child.isPoints || child.material?.transparent) forbidden++;
  });
  assert.equal(forbidden, 0, 'the charge read contains no sprite, point, transparent card, or opacity tell');

  t.mock.method(globalThis.performance, 'now', () => 900_000);
  const state = {
    tick: 240,
    simTime: 3,
    settings: { video: {}, accessibility: {} },
    entities: new Map([[entity.id, entity]]),
    render: { meshes: new Map([[entity.id, visual]]) },
  };
  const bridge = Object.create(vfx);
  bridge.state = state;
  bridge._isReduced = () => false;
  assert.equal(bridge._onTetherCutterCharge({
    actorId: entity.id, kind: 'line_cut', durationTicks: 60,
  }), true);
  assert.equal(visual.userData.tetherCutterPresentationState.start, 900,
    'the event bridge seeds the renderer clock, not the unrelated sim-time value');
  visual.userData.updateRuntimeState(entity, 900.5);
  const port = rig.getObjectByName('TetherCutterPortJaw');
  assert.ok(Math.abs(port.rotation.y) > 0.2,
    'halfway through the unchanged-clock response window, the jaw is visibly mid-open');
  assert.equal(AUDIO_CUE_TO_RECIPE['presentation.massline.counter_tether.cut'], 'sfx_doctrine_tether_spool');
});

test('ignoring the charged warning lets SG-06 execute SG-03 action_cut on the live player Massline', async (t) => {
  const h = await bootRoute(t, 0x1500_0001);
  const warning = runUntil(h, () => h.warnings.length > 0, 180);
  assert.equal(warning, true, routeDump(h));
  const warnedAt = h.warnings[0].tick;
  assert.equal(h.warnings[0].kind, 'line_cut');
  assert.equal(h.warnings[0].durationTicks, 60);
  assert.equal(h.line.state, 'active', 'the response window is real counterplay time');

  const cut = runUntil(h, () => h.line.state === 'broken', 180);
  assert.equal(cut, true, routeDump(h));
  const receipt = h.breaks.find((entry) => entry.attachmentId === h.line.id);
  assert.ok(receipt);
  assert.ok(h.state.tick >= warnedAt + 60, 'the specialist cannot cut before the warned response edge');
  assert.equal(receipt.actorId, h.cutter.id, 'the charged cutter is the physical break actor');
  assert.equal(receipt.ownerId, h.player.id, 'the receipt retains the original player owner');
  assert.equal(receipt.targetId, h.rock.id, 'the receipt retains the original Massline endpoint');
  assert.equal(receipt.reason, 'action_cut');
  assert.equal(h.state.player.tether.active, false, 'tetherGameplay drops the ordinary HUD/control mirror');
  assert.equal(h.broke.some((entry) => entry.targetId === h.rock.id), true,
    'ignoring the tell produces the normal player-visible Massline failure semantic');
});

test('a generic enemy cannot spoof the cutter objective to sever a foreign player line', async (t) => {
  const h = await bootRoute(t, 0x1500_0004);
  const ordinary = h.sim.spawn(makeEnemySpawnSpec('reaver_pirate', 6, { x: 150, z: -20 }));
  const requested = h.kernel.actions.requestAction({
    actorId: ordinary.id,
    actionId: 'action_cut',
    attachmentId: h.line.id,
    source: { kind: 'ai', controllerId: 'sg06' },
    metadata: {
      objective: 'counter_tether_cut',
      objectiveReason: 'specialist_player_line_shear',
    },
  });
  assert.equal(requested.ok, true);
  h.sim.step(SIM_DT);
  assert.equal(h.line.state, 'active');
  const rejection = h.state.combat.trace.events.find((entry) => entry.kind === 'action.rejected'
    && entry.requestId === requested.requestId);
  assert.equal(rejection?.reason, 'not_attachment_owner');
});

test('killing the specialist inside its charge window preserves the same live Massline', async (t) => {
  const h = await bootRoute(t, 0x1500_0002);
  assert.equal(runUntil(h, () => h.warnings.length > 0, 180), true, routeDump(h));
  h.cutter.shield = 0;
  h.cutter.armorHp = 0;
  h.cutter.hull = 1;
  h.player.rot = Math.atan2(h.cutter.pos.z - h.player.pos.z, h.cutter.pos.x - h.player.pos.x);
  h.state.player.targetId = h.cutter.id;
  h.state.input.aimAngle = h.player.rot;
  h.state.input.autoAim = { targetId: h.cutter.id };
  h.state.input.fire = true;
  assert.equal(runUntil(h, () => h.cutter.alive === false, 45), true, routeDump(h));
  h.state.input.fire = false;
  assert.equal(h.fires.some((entry) => entry.ownerId === h.player.id), true,
    'the counter begins at the ordinary player Weapons owner');
  assert.equal(h.hits.some((entry) => entry.ownerId === h.player.id && entry.targetId === h.cutter.id), true,
    'a real projectile/physics contact reaches the specialist before the response edge');
  h.sim.runTicks(90);
  assert.equal(h.line.state, 'active', 'the dead actor cannot consume its queued response-window action');
  assert.equal(h.state.player.tether.active, true);
  assert.equal(h.breaks.some((entry) => entry.attachmentId === h.line.id), false);
});

test('baiting the warned cut and re-latching through ordinary player input succeeds', async (t) => {
  const h = await bootRoute(t, 0x1500_0003);
  assert.equal(runUntil(h, () => h.warnings.length > 0, 180), true, routeDump(h));
  const oldId = h.line.id;

  h.state.input.actions.massline = { cut: true };
  h.sim.step(SIM_DT);
  h.state.input.actions.massline = null;
  assert.equal(h.line.state, 'broken');
  assert.equal(h.line.breakReason, 'tether_cut', 'the pilot baits the charged action with the ordinary cut verb');
  assert.equal(h.state.player.tether.active, false);

  h.sim.runTicks(18);
  h.state.input.tetherMode = 'nearest';
  h.state.input.actions.tetherFire = true;
  h.sim.step(SIM_DT);
  h.state.input.actions.tetherFire = false;
  h.sim.step(SIM_DT);
  const newLine = Object.values(h.state.combat.attachments.byId)
    .find((attachment) => attachment.state === 'active' && attachment.ownerId === h.player.id);
  assert.ok(newLine, routeDump(h));
  assert.notEqual(newLine.id, oldId);
  assert.equal(newLine.targetId, h.rock.id);
  assert.equal(h.state.player.tether.active, true,
    'the ordinary Massline input route regains control after its established relatch cooldown');
});

async function bootRoute(t, seed) {
  const tactical = createTacticalAISystem({ config: { trace: { enabled: false } } });
  const sim = createSimulation({
    seed,
    systems: [physics, combat, actions, aiPorts, tactical, weapons, tetherGameplay],
    updateOrder: [tactical, actions, aiPorts, weapons, physics, combat, tetherGameplay],
  });
  const { state, bus } = sim;
  const physicsSystem = sim.registry.get('physics');
  t.after(() => {
    physicsSystem._disableSg02DynamicAuthority?.();
    sim.dispose();
  });
  state.mode = 'flight';
  state.world.currentSectorId = 'sector_ceres_belt';
  state.settings.gameplay.difficulty = 'standard';
  state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  state.input.actions = state.input.actions || {};
  const player = sim.spawn(playerSpec());
  state.playerId = player.id;
  state.player.targetId = null;
  const rock = sim.spawn(rockSpec());
  const cutter = sim.spawn(makeEnemySpawnSpec('tether_control_raider', 6, { x: 115, z: 18 }));
  cutter.data.encounter = true;
  cutter.data.ai.squadId = `plan15-cutter-${seed}`;
  cutter.data.ai.activity = { ...cutter.data.ai.activity, targetId: player.id };
  assert.equal(await physicsSystem.prepareBackend(state, { reset: true }), true);

  const kernel = sim.registry.get('combat').ensureKernel();
  const created = kernel.attachments.create({
    defId: 'tether_standard', ownerId: player.id, targetId: rock.id,
    controlMode: 'player_massline', actionInstanceId: `plan15-line-${seed}`,
  });
  assert.equal(created.ok, true, created.reason);
  const warnings = [];
  const breaks = [];
  const broke = [];
  const fires = [];
  const hits = [];
  bus.on('ai:counterTether', (payload) => warnings.push(structuredClone(payload)));
  bus.on('tether:broken', (payload) => breaks.push(structuredClone(payload)));
  bus.on('tether:broke', (payload) => broke.push(structuredClone(payload)));
  bus.on('combat:fire', (payload) => fires.push(structuredClone(payload)));
  bus.on('projectile:hit', (payload) => hits.push(structuredClone(payload)));
  sim.step(SIM_DT);
  assert.equal(state.player.tether.active, true, 'the real tetherGameplay route adopts the SG-02 line');
  return {
    sim, state, bus, player, rock, cutter, kernel, line: created.attachment,
    warnings, breaks, broke, fires, hits,
  };
}

function runUntil(h, predicate, maxTicks) {
  for (let i = 0; i < maxTicks && !predicate(); i++) h.sim.step(SIM_DT);
  return predicate();
}

function routeDump(h) {
  return JSON.stringify({
    tick: h.state.tick,
    line: h.line,
    warnings: h.warnings,
    breaks: h.breaks,
    ai: h.sim.helpers.inspectAI?.({ entityId: h.cutter.id }),
  });
}

function playerSpec() {
  return {
    type: 'ship', alive: true, collides: true, team: 0, factionId: 'faction_free',
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0,
    radius: 12, mass: 24, hull: 1_000, hullMax: 1_000,
    armorHp: 0, armorMax: 0, armorFlat: 0, shield: 0, shieldMax: 0,
    cap: 1_000, capMax: 1_000, capRegen: 100,
    physicsBody: {
      schemaVersion: 1, radius: 12, mass: 24, inertiaY: 1_728,
      dynamic: true, ccd: true, material: 'ship', revision: 0,
    },
    data: {
      defId: 'ship_kestrel', driveId: 'drive_reaction_s', intent: {}, combat: {},
      derived: { mass: 24, operationalMass: 24 },
      weapons: [{ defId: 'wpn_pulse_laser_s', projSpeed: 420 }],
    },
  };
}

function rockSpec() {
  return {
    type: 'asteroid', alive: true, collides: true,
    pos: { x: 42, z: -35 }, vel: { x: 0, z: 0 }, rot: 0,
    radius: 10, mass: 900, hull: 5_000, hullMax: 5_000,
    physicsBody: {
      schemaVersion: 1, radius: 10, mass: 900, inertiaY: 45_000,
      dynamic: false, ccd: false, material: 'rock', revision: 0,
    },
    data: { asteroidType: 'asteroid_metallic' },
  };
}

function entityFromSpec(id, spec) {
  return {
    ...spec, id, alive: true, collides: true, radius: spec.radius || 18,
    vel: { x: 0, z: 0 }, flags: {},
    data: structuredClone(spec.data),
  };
}
