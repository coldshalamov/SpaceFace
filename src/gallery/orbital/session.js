// Playable gallery session on the authoritative runtime.
// Flight V3 writes thrust. Rapier solves contacts. Fields queue their own impulses.
// This module only spawns authored bodies, latches existing Massline defs, and reads the result.

import { SIM_DT } from '../../core/sim.js';
import { getCombatKernel } from '../../combat/kernel.js';
import { fields } from '../../systems/fields.js';
import { bootRealPath, OPEN_SPACE_BOUNDS } from '../../../scripts/lib/bench/realPath.mjs';
import { assetForKind } from './assets.js';
import { judgeGallery, noteImpact, signatureOf } from './judge.js';
import { orbitalGallery } from './system.js';
import { createLedger, recordScore, scoreRun } from './score.js';
import { getScenario } from './catalog.js';
import { validateScenario } from './validate.js';

const PLAYER_HULL = 'ship_kestrel';

export function sessionInput(options = {}, strategy = {}) {
  if (options.exhibit !== true && options.tape === undefined) {
    return { source: 'live', tape: null };
  }
  const tape = options.tape !== undefined ? options.tape : (strategy && strategy.tape) || null;
  return { source: tape ? 'exhibit' : 'live', tape };
}

export async function openSession(scenarioId, options = {}) {
  const scenario = options.scenario || getScenario(scenarioId);
  if (!scenario) throw new Error(`orbital gallery: unknown scenario ${scenarioId}`);
  const issues = validateScenario(scenario);
  if (issues.length) throw new Error(`orbital gallery: ${scenario.id} ${issues.join('; ')}`);
  const strategyId = options.strategyId || (scenario.strategies[0] && scenario.strategies[0].id);
  const strategy = scenario.strategies.find((row) => row.id === strategyId) || scenario.strategies[0];
  const ledger = options.ledger || createLedger();
  const input = sessionInput(options, strategy);

  const host = await bootRealPath({
    seed: scenario.seed,
    systems: [orbitalGallery, fields, 'flightV3', 'physics'],
    bounds: OPEN_SPACE_BOUNDS,
    hulls: [{
      hullId: PLAYER_HULL,
      pos: { x: scenario.player.x, z: scenario.player.z },
      rot: scenario.player.rot || 0,
      isPlayer: true,
      factionId: 'faction_free',
    }],
  });

  const state = host.state;
  const creditsAtOpen = state.player.credits;
  const roles = Object.create(null);
  roles.pilot = host.player.id;
  host.player.data = host.player.data || {};
  host.player.data.galleryRole = 'pilot';
  host.player.data.galleryAsset = assetForKind('pilot');
  host.player.data.gallerySpawnX = host.player.pos.x;
  host.player.data.gallerySpawnZ = host.player.pos.z;

  for (const body of scenario.bodies) {
    const entity = spawnBody(host, body);
    roles[body.role] = entity.id;
  }

  const fieldsSys = host.runtime.getSystem('fields');
  for (const field of scenario.fields || []) {
    const planted = host.withFeatures(() => fieldsSys.plantField(state, {
      id: field.id,
      defKey: field.defKey,
      center: { x: field.x, z: field.z },
      radius: field.radius,
      strength: field.strength,
      damping: field.damping,
      emitter: false,
      tag: 'environmental',
    }));
    if (!planted) throw new Error(`orbital gallery: field ${field.id} did not plant`);
  }

  // One seeded draw. Motors and pockets stay authored; the chip is score-only.
  const styleChip = state.rng();
  if (!(styleChip >= 0 && styleChip < 1)) {
    throw new Error('orbital gallery: state.rng did not return a unit sample');
  }

  const gallery = {
    source: input.source,
    phase: 'setup',
    scenarioId: scenario.id,
    family: scenario.family,
    inference: scenario.inference,
    limitTicks: scenario.limitTicks,
    roles,
    pockets: scenario.pockets,
    hazards: scenario.hazards || [],
    spoils: scenario.spoils || [],
    spoiled: Object.create(null),
    plantedFields: (scenario.fields || []).map((field) => ({ ...field })),
    fieldPlanted: (scenario.fields || []).length > 0,
    tetherLatched: false,
    tape: input.tape,
    strategyId: strategy.id,
    liveInput: null,
    kernel: null,
    playStartTick: null,
    boostTicks: 0,
    brakeTicks: 0,
    cuts: 0,
    contacts: 0,
    playerContactRoles: Object.create(null),
    approachSide: null,
    lastCutMark: null,
    styleChip,
    result: null,
    creditsAtOpen,
    trace: options.trace ? [] : null,
  };
  state.orbitalGallery = gallery;
  host.bus.on('physics:impact', (payload) => noteImpact(state, payload));

  host.step(1, { before() {} });
  const watched = [host.player, ...scenario.bodies.map((body) => state.entities.get(roles[body.role]))];
  host.assertBodies(watched, scenario.id);

  const kernel = getCombatKernel({
    state,
    bus: host.bus,
    helpers: host.runtime.getHelpers(),
  });
  gallery.kernel = kernel;
  for (const line of scenario.lines || []) {
    const owner = state.entities.get(roles[line.owner]);
    const target = state.entities.get(roles[line.target]);
    const made = kernel.attachments.create({
      defId: line.defId,
      ownerId: owner.id,
      targetId: target.id,
      restLength: line.restLength,
      sourceWorld: { x: owner.pos.x, y: 0, z: owner.pos.z },
      targetWorld: { x: target.pos.x, y: 0, z: target.pos.z },
    });
    if (!made.ok) {
      throw new Error(`orbital gallery: line ${line.owner}->${line.target} ${made.reason}`);
    }
    gallery.tetherLatched = true;
  }

  gallery.phase = 'live';

  const session = {
    scenario,
    strategyId: strategy.id,
    host,
    state,
    ledger,
    get result() { return state.orbitalGallery && state.orbitalGallery.result; },
    get styleChip() { return styleChip; },
    proof() { return host.proof(); },
    control(input) {
      state.orbitalGallery.liveInput = input;
    },
    step(ticks = 1) {
      const n = ticks | 0;
      for (let i = 0; i < n; i++) {
        if (state.orbitalGallery.result) break;
        host.step(1);
        judgeGallery(state);
        if (state.orbitalGallery.trace && state.tick % 15 === 0) {
          state.orbitalGallery.trace.push(session.snapshot().positions);
        }
      }
      return settle(session);
    },
    async play() {
      while (!state.orbitalGallery.result && state.tick <= scenario.limitTicks + 2) {
        session.step(1);
      }
      if (!state.orbitalGallery.result) {
        state.orbitalGallery.result = { won: false, reason: 'clock', tick: state.tick };
        state.orbitalGallery.phase = 'settled';
      }
      return settle(session);
    },
    snapshot() {
      const positions = {};
      for (const role of Object.keys(roles)) {
        const entity = state.entities.get(roles[role]);
        if (!entity) continue;
        positions[role] = {
          x: round(entity.pos.x),
          z: round(entity.pos.z),
          speed: round(Math.hypot(entity.vel.x, entity.vel.z)),
        };
      }
      return {
        tick: state.tick,
        simTime: round(state.simTime),
        credits: state.player.credits,
        positions,
        result: state.orbitalGallery.result,
        signature: signatureOf(state.orbitalGallery, state.orbitalGallery.result),
        styleChip,
      };
    },
    dispose() {
      gallerySaveStrip(state);
      host.dispose();
    },
  };
  return session;
}

export async function resetSession(session) {
  const { scenario, ledger } = session;
  const strategyId = session.strategyId;
  session.dispose();
  return openSession(scenario.id, { ledger, strategyId, scenario, exhibit: true });
}

export function gallerySaveStrip(state) {
  if (state && Object.prototype.hasOwnProperty.call(state, 'orbitalGallery')) {
    delete state.orbitalGallery;
  }
  return state;
}

function settle(session) {
  const gallery = session.state.orbitalGallery;
  const result = gallery.result;
  if (!result) return null;
  if (session.state.player.credits !== gallery.creditsAtOpen) {
    result.creditsMutated = true;
  }
  if (result.won && !result.scored) {
    result.score = scoreRun({
      winTick: result.tick,
      limitTicks: gallery.limitTicks,
      boostTicks: gallery.boostTicks,
      contacts: gallery.contacts,
      cuts: gallery.cuts,
      styleChip: gallery.styleChip,
    });
    result.signature = signatureOf(gallery, result);
    recordScore(session.ledger, session.scenario.id, result.score);
    result.scored = true;
  } else if (!result.signature) {
    result.signature = signatureOf(gallery, result);
    result.score = scoreRun({
      winTick: null,
      limitTicks: gallery.limitTicks,
      boostTicks: gallery.boostTicks,
      contacts: gallery.contacts,
      cuts: gallery.cuts,
      styleChip: gallery.styleChip,
    });
  }
  return result;
}

function spawnBody(host, body) {
  const asset = assetForKind(body.kind || 'mass');
  const data = {
    galleryRole: body.role,
    galleryAsset: asset,
    gallerySpawnX: body.x,
    gallerySpawnZ: body.z,
    galleryMotor: body.motor || null,
    benchRealPath: 'orbital-gallery',
  };
  if (body.kind === 'bumper' || body.kind === 'anchor') {
    // Static colliders spawned after prepareBackend never receive a Rapier body.
    // A very heavy dynamic body is the same bumper: contacts are real, drift is not.
    return host.spawnObstacle({
      pos: { x: body.x, z: body.z },
      radius: body.radius,
      mass: body.mass,
      inertiaY: body.mass * body.radius * body.radius * 0.4,
      dynamic: true,
      hull: body.hull || 8000,
      vel: { x: body.vx || 0, z: body.vz || 0 },
      data,
    });
  }
  return host.runtime.spawn({
    type: 'payload',
    pos: { x: body.x, z: body.z },
    vel: { x: body.vx || 0, z: body.vz || 0 },
    radius: body.radius,
    mass: body.mass,
    collides: true,
    hull: body.hull || 240,
    hullMax: body.hull || 240,
    physicsBody: {
      schemaVersion: 1,
      shape: 'ball',
      radius: body.radius,
      mass: body.mass,
      inertiaY: body.mass * body.radius * body.radius * 0.4,
      dynamic: true,
      ccd: true,
      material: body.material || 'debris',
    },
    data,
  });
}

function round(n) {
  return Math.round(n * 1000) / 1000;
}

export { SIM_DT };
