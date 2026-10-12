// Compile a foundry scene into spaceface.simScenario.v1 for the existing lab runner.

import { validateSimScenario } from '../../src/contracts/simScenarioSchema.js';
import { resolveEntityProfile } from '../../src/testing/lab/entityProfiles.js';
import { screenScene } from './factoryBridge.js';

const PLAYER_RADIUS = 14;

export function compileScene(scene, options = {}) {
  const tape = options.tape || scene.primary || {};
  const dropBody = options.dropBody || null;
  const dropAttachment = options.dropAttachment === true || (options.tape && options.tape.dropAttachment === true);
  const dropSave = options.dropSave === true;
  const screen = screenScene(scene);
  if (!screen.ok) {
    const error = new Error(`factory rejected ${scene && scene.id}: ${screen.issues.map((item) => item.message).join('; ')}`);
    error.issues = screen.issues;
    throw error;
  }

  const bodies = (scene.bodies || []).filter((body) => body.alias !== dropBody);
  for (const body of bodies) {
    try {
      resolveEntityProfile(body.profile);
    } catch (err) {
      const error = new Error(`impossible-profile:${body.profile}`);
      error.cause = err;
      throw error;
    }
  }
  resolveEntityProfile('ship.starter');

  const attachment = !dropAttachment && scene.attachment ? scene.attachment : null;
  const saveAt = !dropSave && Number.isInteger(scene.saveAt) ? scene.saveAt : null;
  const systems = systemsFor(scene, { attachment, saveAt });
  const fixture = scene.orbit ? 'massline-orbit' : (attachment ? 'massline' : (scene.fixture || 'flight'));
  const input = buildInput(tape);
  const doc = {
    schema: 'spaceface.simScenario.v1',
    id: scene.id,
    version: 1,
    title: scene.title || scene.id,
    description: scene.summary || scene.id,
    evidenceClass: 'focused-fixture',
    runtimeProfile: 'focused-lab',
    seed: scene.seed,
    ticks: scene.ticks,
    world: {
      fixtureProfile: fixture,
      sectorId: 'sector_helios_prime',
      mode: 'flight',
      physicsBackend: 'rapier-dynamic',
      flightBackend: 'v3',
      aiBackend: 'legacy',
      credits: 5000,
    },
    entities: [playerEntity(scene.player || {}), ...bodies.map(bodyEntity)],
    frames: input.frames,
    systems,
    policies: [{ id: attachment ? 'massline.baseline' : 'none', version: 1 }],
    metrics: [
      { name: 'invariant.finiteState', version: 1, threshold: { op: '==', value: 1 } },
    ],
    assertions: [
      { kind: 'holds', signal: 'playerAlive', holdsTicks: 20 },
    ],
    trace: { signals: traceSignals(!!attachment), sampleEvery: 1 },
    observer: { enabled: false },
  };
  if (input.events.length) doc.inputEvents = input.events;
  if (attachment) {
    doc.attachments = [{
      defId: attachment.defId || 'tether_standard',
      ownerAlias: 'player',
      targetAlias: attachment.target,
      ...(Number.isFinite(attachment.restLength) ? { restLength: attachment.restLength } : {}),
    }];
  }
  if (saveAt != null) {
    doc.checkpoints = [{ tick: saveAt, kind: 'save-load', label: 'mid' }];
  }
  const validation = validateSimScenario(doc);
  if (!validation.ok) {
    const error = new Error(`scenario ${scene.id} failed schema: ${JSON.stringify(validation.issues)}`);
    error.issues = validation.issues;
    throw error;
  }
  return doc;
}

export function geometryOf(scene, options = {}) {
  const dropBody = options.dropBody || null;
  const player = scene.player || {};
  const points = [{
    alias: 'player',
    x: player.x || 0,
    z: player.z || 0,
    radius: PLAYER_RADIUS,
  }];
  for (const body of scene.bodies || []) {
    if (body.alias === dropBody) continue;
    points.push({
      alias: body.alias,
      x: body.x || 0,
      z: body.z || 0,
      radius: Number.isFinite(body.radius) ? body.radius : (body.profile === 'wasp_swarmer' ? 12 : 6),
    });
  }
  let minSeparation = Infinity;
  let overlap = false;
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const dist = Math.hypot(points[i].x - points[j].x, points[i].z - points[j].z);
      if (dist < minSeparation) minSeparation = dist;
      if (dist < points[i].radius + points[j].radius - 0.5) overlap = true;
    }
  }
  if (points.length < 2) minSeparation = Infinity;
  return { points, minSeparation, overlap, entityCount: points.length };
}

function systemsFor(scene, { attachment, saveAt }) {
  const list = ['actions', 'flightV3'];
  if (attachment) list.push('masslineLabController');
  list.push('weapons', 'physics');
  const wantsCombat = !!attachment || (scene.mechanics || []).includes('weapons.fire');
  if (wantsCombat) list.push('combat');
  if (attachment) list.push('tetherGameplay', 'masslineTelemetry');
  if (saveAt != null) list.push('save');
  return list;
}

function playerEntity(player) {
  return {
    alias: 'player',
    profile: 'ship.starter',
    role: 'player',
    team: 0,
    factionId: 'faction_free',
    isPlayer: true,
    pos: { x: player.x || 0, z: player.z || 0 },
    vel: { x: player.vx || 0, z: player.vz || 0 },
    heading: player.heading || 0,
    persistent: true,
  };
}

function bodyEntity(body) {
  const row = {
    alias: body.alias,
    profile: body.profile,
    role: body.role || body.alias,
    team: body.team != null ? body.team : 2,
    pos: { x: body.x || 0, z: body.z || 0 },
    vel: { x: body.vx || 0, z: body.vz || 0 },
    persistent: true,
  };
  if (body.factionId) row.factionId = body.factionId;
  if (Number.isFinite(body.heading)) row.heading = body.heading;
  const overrides = {};
  if (Number.isFinite(body.mass)) overrides.mass = body.mass;
  if (Number.isFinite(body.radius)) overrides.radius = body.radius;
  if (body.dynamic === false) overrides.dynamic = false;
  if (Object.keys(overrides).length) row.overrides = overrides;
  return row;
}

function buildInput(tape) {
  const events = [];
  let sequence = 0;
  const pushKey = (tick, code, pressed) => {
    events.push({ tick, device: 'keyboard', code, pressed, sequence: sequence++ });
  };
  if (tape.hold) pushKey(tape.holdFrom ?? 0, 'KeyF', true);
  if (tape.releaseAt != null) pushKey(tape.releaseAt, 'KeyF', false);
  if (tape.tap != null) {
    pushKey(tape.tap, 'KeyF', true);
    pushKey(tape.tap + 4, 'KeyF', false);
  }
  if (tape.reelFrom != null) pushKey(tape.reelFrom, 'KeyQ', true);
  if (tape.payoutFrom != null) pushKey(tape.payoutFrom, 'KeyE', true);

  const frame0 = axes(tape);
  const frames = [{ tick: 0, input: frame0 }];
  if (tape.thenAt != null && tape.then) {
    frames.push({
      tick: tape.thenAt,
      input: axes({ ...tape, ...tape.then }),
    });
  }
  return { events, frames };
}

function axes(tape) {
  const input = {
    moveX: tape.moveX ?? 0,
    moveZ: tape.moveZ ?? 0,
    turnIntent: tape.turnIntent ?? 0,
    boost: !!tape.boost,
  };
  if (tape.fire != null) input.fire = !!tape.fire;
  if (tape.aimAngle != null) input.aimAngle = tape.aimAngle;
  return input;
}

function traceSignals(attached) {
  const signals = ['playerX', 'playerZ', 'playerVelX', 'playerVelZ', 'playerRot', 'playerAlive', 'hull'];
  if (attached) {
    signals.push('distance', 'restLength', 'tension', 'attachmentActive', 'radialSpeed', 'angularSpeed');
  }
  return signals;
}
