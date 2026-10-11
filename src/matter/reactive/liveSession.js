// Scores authored scenes through the reactiveMatter system and the SG-02 owner.
// Impulses are queued with queuePhysicsImpulse. Joints are owner.createAttachment.
// This file does not integrate, separate, or solve a hitch spring.

import { createGameState } from '../../core/gameState.js';
import { createBus } from '../../core/eventBus.js';
import { createSg02DynamicBodyOwner } from '../../core/sg02DynamicBodyOwner.js';
import { createFieldKernel } from '../../core/fields/fieldKernel.js';
import { REACTIVE_DT } from '../../data/reactiveMatter/budgets.js';
import { configurationById, REACTIVE_CONFIGURATION_IDS } from '../../data/reactiveMatter/configurations.js';
import { installReactiveEntity, reactiveMatter } from '../../systems/reactiveMatter.js';

function attachmentRecord(hitch) {
  return {
    id: hitch.id,
    ownerId: hitch.ownerId,
    targetId: hitch.targetId,
    restLength: hitch.rest,
    lugLocalX: hitch.lugLocalX || 0,
    lugLocalZ: hitch.lugLocalZ || 0,
    state: 'active',
    defId: 'attachment_massline_s',
  };
}

function boot(spec, opts) {
  const state = createGameState(opts.seed == null ? spec.seed : opts.seed);
  state.mode = 'flight';
  state.seed = opts.seed == null ? spec.seed : opts.seed;
  state.combat.attachments = { byId: {} };
  const kernel = createFieldKernel();
  for (let i = 0; i < spec.fields.length; i++) {
    const field = spec.fields[i];
    kernel.register({
      id: field.id,
      kind: 'well',
      center: { x: field.x, z: field.z },
      radius: field.radius,
      strength: 0,
      thermal: {
        family: 'kilnback',
        kind: 'burn',
        sourceKey: `reactive-${field.id}`,
        heatPerSecond: field.heatPerSec,
        damagePerSecond: 0,
      },
    });
  }
  state.fieldsKernel = kernel;
  for (let i = 0; i < spec.machines.length; i++) {
    const machine = spec.machines[i];
    const entity = installReactiveEntity(state, {
      id: machine.id,
      modelId: 'anchor_bumper',
      x: machine.x,
      z: machine.z,
      radius: 3,
      mass: 80,
      anchored: true,
      role: 'structure',
    });
    delete entity.data.reactiveMatter;
    entity.data.reactiveMachine = {
      strength: machine.strength,
      fieldRadius: machine.fieldRadius,
      polarity: machine.polarity,
      flipEvery: machine.flipEvery || 0,
      enabled: machine.enabled !== false,
    };
  }
  for (let i = 0; i < spec.bodies.length; i++) {
    installReactiveEntity(state, spec.bodies[i]);
  }
  for (let i = 0; i < spec.hitches.length; i++) {
    const hitch = spec.hitches[i];
    state.combat.attachments.byId[hitch.id] = attachmentRecord(hitch);
  }
  const tape = opts.tape === 'idle' ? [] : (opts.segments || spec.tape);
  state.reactiveMatterDemo = { tape };
  const system = Object.create(reactiveMatter);
  system.init({ state, bus: createBus(), helpers: {} });
  return { state, system };
}

async function openOwner(state, dt) {
  const owner = await createSg02DynamicBodyOwner({ fixedDt: dt || REACTIVE_DT, publishTelemetry: false });
  state.physicsOwner = owner;
  owner.syncFromEntities(state.entityList);
  const byId = state.combat.attachments.byId;
  for (const id of Object.keys(byId)) {
    const attachment = byId[id];
    const ship = state.entities.get(attachment.ownerId);
    const target = state.entities.get(attachment.targetId);
    if (!ship || !target) continue;
    owner.createAttachment({
      attachmentId: attachment.id,
      defId: 'attachment_massline_s',
      ownerId: attachment.ownerId,
      targetId: attachment.targetId,
      sourceWorld: ship.pos,
      targetWorld: target.pos,
      targetAnchorLocal: { x: attachment.lugLocalX || 0, y: 0, z: attachment.lugLocalZ || 0 },
      restLength: attachment.restLength,
      spring: { mode: 'legacy_rope' },
      tick: 0,
    });
  }
  return owner;
}

function sampleOf(state, world, reactions) {
  const bodies = [];
  for (let i = 0; i < state.entityList.length; i++) {
    const entity = state.entityList[i];
    const law = world.bodies.get(entity.id);
    bodies.push({
      id: entity.id,
      x: entity.pos.x,
      z: entity.pos.z,
      vx: entity.vel.x,
      vz: entity.vel.z,
      phase: law ? law.phase : (entity.data?.reactiveMatter?.phase || 'intact'),
      heat: law ? law.heat : (entity.heat || 0),
      stored: law ? law.stored : 0,
      radius: entity.radius,
      mass: entity.mass,
      parentId: law ? law.parentId : entity.data?.reactiveMatter?.parentId || null,
      modelId: law ? law.modelId : entity.data?.reactiveMatter?.modelId,
    });
  }
  bodies.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { tick: world.tick, reactions, bodies };
}

function snapshotOf(state, world) {
  const sample = sampleOf(state, world, 0);
  return {
    tick: world.tick,
    simTime: world.simTime,
    bodies: sample.bodies.map((body) => ({ ...body, y: 0 })),
    hitches: [...world.hitches.values()].sort((a, b) => (a.id < b.id ? -1 : 1)).map((hitch) => ({
      id: hitch.id,
      targetId: state.combat.attachments.byId[hitch.id]?.targetId ?? hitch.targetId,
      alive: hitch.alive,
      rest: hitch.rest,
      broken: hitch.broken,
    })),
    machines: [...world.machines.values()].map((machine) => ({
      id: machine.id,
      polarity: machine.polarity,
      x: machine.x,
      z: machine.z,
    })),
    creditsGranted: world.creditsGranted,
    chemicalInjected: world.chemicalInjected,
    reactionCount: world.reactionCount,
  };
}

export async function runConfiguration(id, opts = {}) {
  const spec = configurationById(id);
  const { state, system } = boot(spec, opts);
  const ticks = opts.ticks == null ? spec.ticks : opts.ticks;
  const dt = opts.dt || REACTIVE_DT;
  const owner = await openOwner(state, dt);
  const samples = [];
  const cues = [];
  let lawEvals = 0;
  let maxReactions = 0;
  const peakStored = {};
  try {
    for (let i = 0; i < ticks; i++) {
      const result = system.update(dt, state);
      owner.syncFromEntities(state.entityList);
      owner.step(dt);
      lawEvals += result.lawEvals;
      if (result.reactions.length > maxReactions) maxReactions = result.reactions.length;
      for (let c = 0; c < result.cues.length; c++) cues.push(result.cues[c]);
      const world = state.reactiveMatterWorld;
      for (const body of world.bodies.values()) {
        peakStored[body.id] = Math.max(peakStored[body.id] || 0, body.stored);
      }
      samples.push(sampleOf(state, world, result.reactions.length));
    }
    const world = state.reactiveMatterWorld;
    return {
      id,
      kind: spec.kind,
      crosses: spec.crosses,
      families: spec.families,
      world,
      state,
      samples,
      cues,
      lawEvals,
      maxReactions,
      peakStored,
      creditsGranted: world.creditsGranted,
      chemicalInjected: world.chemicalInjected,
      reactionCount: world.reactionCount,
      snapshot: snapshotOf(state, world),
    };
  } finally {
    system.destroy();
    owner.dispose();
  }
}

export function listConfigurationIds() {
  return REACTIVE_CONFIGURATION_IDS;
}

export function probeSolid(run, x, z) {
  const world = run.world || run;
  const entities = run.state ? run.state.entityList : [];
  let hit = null;
  for (let i = 0; i < entities.length; i++) {
    const entity = entities[i];
    const law = world.bodies?.get(entity.id);
    if (law && (law.phase === 'fractured' || law.solid === false || law.collides === false)) continue;
    if (!entity.collides || !(entity.radius > 0)) continue;
    if (Math.hypot(entity.pos.x - x, entity.pos.z - z) <= entity.radius) hit = entity.id;
  }
  return hit;
}

export async function runLiveBodies(spec) {
  const picture = {
    id: 'live-picture',
    kind: 'playable',
    crosses: [],
    families: [],
    seed: spec.seed,
    ticks: spec.ticks,
    machines: spec.machines,
    fields: spec.fields,
    bodies: spec.bodies,
    hitches: spec.hitches,
    tape: spec.tape,
  };
  const { state, system } = boot(picture, { tape: 'authored', segments: spec.tape, seed: spec.seed });
  const owner = await openOwner(state, spec.dt || REACTIVE_DT);
  const samples = [];
  const cues = [];
  const peakStored = {};
  try {
    for (let i = 0; i < spec.ticks; i++) {
      const result = system.update(spec.dt || 1 / 60, state);
      owner.syncFromEntities(state.entityList);
      owner.step(spec.dt || 1 / 60);
      for (let c = 0; c < result.cues.length; c++) cues.push(result.cues[c]);
      for (const body of state.reactiveMatterWorld.bodies.values()) {
        peakStored[body.id] = Math.max(peakStored[body.id] || 0, body.stored);
      }
      samples.push(sampleOf(state, state.reactiveMatterWorld, result.reactions.length));
    }
    return {
      state,
      world: state.reactiveMatterWorld,
      samples,
      cues,
      peakStored,
      snapshot: snapshotOf(state, state.reactiveMatterWorld),
    };
  } finally {
    system.destroy();
    owner.dispose();
  }
}
