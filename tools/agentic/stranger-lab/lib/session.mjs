// Closed-loop stranger session on the authoritative headless runtime.
// Personas observe, the sim steps, and the tape is what replay applies.

import { createHash } from 'node:crypto';
import { SIM_DT } from '../../../../src/core/sim.js';
import { createAuthoritativeRuntime } from '../../../../src/runtime/createAuthoritativeRuntime.js';
import { createMasslineInputGrammar } from '../../../../src/systems/masslineInputGrammar.js';
import { buildEntitySpawnSpec } from '../../../../src/testing/lab/entityProfiles.js';
import { CURRENT_VERSION } from '../../../../src/data/saveVersion.js';
import { NEW_GAME } from '../../../../src/data/newGameDefaults.js';
import { CombatDoctrineId } from '../../../../src/ai/combatDoctrine.js';
import {
  collisionProxyIdForStation,
  resolveBerthWorld,
  resolveCorridorAxisWorld,
  resolveCollisionProxyManifest,
} from '../../../../src/data/collisionProxyManifests.js';
import { systemsForJourney } from './bundles.mjs';
import { detectFailures } from './detectors.mjs';
import { assessJourney, getJourney } from './journeys.mjs';
import { observeState, simDigest } from './observe.mjs';
import { getPersona } from './personas.mjs';
import { stableStringify } from './rng.mjs';
import { redact, redactString } from './redact.mjs';

const HOME_SECTOR = 'sector_helios_prime';
const TOUCH_VIEWPORT = Object.freeze({ width: 390, height: 844, device: 'simulated-touch' });

export async function runSession(options = {}) {
  const journey = getJourney(options.journeyId);
  const persona = getPersona(options.personaId || journey.defaultPersona);
  const seed = options.seed >>> 0;
  const fault = options.fault || null;
  const surface = options.surface === 'simulated-touch' ? 'simulated-touch' : 'keyboard';
  const ticks = options.ticks != null ? options.ticks | 0 : journey.ticks;
  const playback = options.playbackTape || null;
  const wallStart = process.hrtime.bigint();
  const heapStart = process.memoryUsage().heapUsed;
  const consoleCapture = hookConsole();
  let runtime = null;
  try {
    runtime = createAuthoritativeRuntime({
      profileId: 'production',
      seed,
      systems: systemsForJourney(journey),
    });
    const busLog = [];
    const milestones = Object.create(null);
    tapBus(runtime.bus, busLog, milestones);
    let state = runtime.state;
    state.mode = 'flight';
    state.meta = state.meta || {};
    state.meta.seed = seed;
    state.settings = state.settings || {};
    state.settings.gameplay = {
      ...(state.settings.gameplay || {}),
      physicsBackend: 'rapier-dynamic',
      flightBackend: 'v3',
      aiBackend: journey.extras?.includes('tacticalAI') ? 'tactical' : 'legacy',
    };
    if (state.world) state.world.currentSectorId = state.world.currentSectorId || HOME_SECTOR;
    if (state.player && !(state.player.credits > 0)) state.player.credits = NEW_GAME.credits;

    const aliasMap = Object.create(null);
    for (const entity of journey.entities) {
      const built = buildEntitySpawnSpec(entity, state);
      const spawned = runtime.spawn(built.spec);
      aliasMap[entity.alias] = spawned.id;
      if (built.seedVel) {
        spawned.vel.x = built.seedVel.x || 0;
        spawned.vel.z = built.seedVel.z || 0;
      }
      if (entity.isPlayer) state.playerId = spawned.id;
    }
    await prepareJourney(runtime, journey, aliasMap);

    const physics = runtime.getSystem('physics');
    if (physics && typeof physics.prepareBackend === 'function') {
      const ready = await physics.prepareBackend(state, {});
      const sg02 = !!(state.physicsRuntime && state.physicsRuntime.diagnostics
        && state.physicsRuntime.diagnostics.sg02Ready);
      if (ready !== true || !sg02) {
        return finishInfra(journey, persona, seed, fault, surface, 'SG-02 dynamic authority failed to become ready');
      }
    }
    if (journey.attachments && journey.attachments.length) {
      attachLines(runtime, aliasMap, journey.attachments);
    }

    const grammar = createMasslineInputGrammar();
    const frames = [];
    const samples = [];
    const commandNotes = [];
    const held = { envelope: null };
    for (let tick = 0; tick < ticks; tick++) {
      state = runtime.state;
      const obs = observeState(state, { tick, journeyId: journey.id, cue: journey.cue });
      const decided = playback
        ? actionFromTape(playback, tick)
        : persona.decide(obs, { seed, tick, journeyId: journey.id, surface,
          recovered: milestones['player:respawn'] > 0 });
      const applied = materializeAction(decided, fault, surface);
      applied.frame.tick = tick;
      frames.push(applied.frame);
      applyAction(state, grammar, applied.frame, SIM_DT);
      const notes = await runCommands(runtime, applied.frame.commands, tick, held);
      for (const note of notes) commandNotes.push(note);
      runtime.step(SIM_DT);
      state = runtime.state;
      samples.push(observeState(state, { tick, journeyId: journey.id, cue: journey.cue }));
    }

    const finalSample = samples.length ? samples[samples.length - 1] : null;
    if (finalSample && finalSample.dockPhase && finalSample.dockPhase !== 'none') {
      milestones[`docking:${finalSample.dockPhase}`] = 1;
    }
    const detection = detectFailures({
      samples,
      frames,
      commands: commandNotes,
      bus: busLog,
      fault,
      asset: {
        essentialModelCheck: 'not-run',
        reason: 'rendering-detached-headless',
      },
    });
    const digest = sha256(stableStringify(simDigest(samples)));
    const tape = { schema: 'spaceface.strangerTape.v1', frames };
    const tapeHash = sha256(stableStringify(tape));
    const ordered = detection.failures
      .slice()
      .sort((a, b) => a.id.localeCompare(b.id) || a.tick - b.tick);
    const primary = ordered[0] || null;
    const fingerprint = primary
      ? sha256(stableStringify({
        journeyId: journey.id,
        personaId: persona.id,
        seed,
        fault,
        surface,
        failureId: primary.id,
        tick: primary.tick,
        tapeHash,
      }))
      : null;
    const wallMs = Number(process.hrtime.bigint() - wallStart) / 1e6;
    const heapDelta = process.memoryUsage().heapUsed - heapStart;
    const confirmed = detection.confirmed;
    const completion = assessJourney({ journeyId: journey.id, samples, commands: commandNotes, milestones });
    const status = ordered.length ? 'fail' : completion.status === 'complete' ? 'pass' : 'incomplete';
    return {
      schema: 'spaceface.strangerRun.v1',
      ok: status === 'pass',
      status,
      completion,
      evidenceClass: 'focused-fixture',
      host: 'node-headless',
      rendering: 'detached',
      deviceTested: false,
      fpsClaimed: false,
      journeyId: journey.id,
      personaId: persona.id,
      seed,
      fault,
      surface,
      viewport: surface === 'simulated-touch' ? TOUCH_VIEWPORT : { width: 1280, height: 720, device: 'keyboard' },
      ticks,
      digest,
      tapeHash,
      tape,
      fingerprint,
      failures: ordered,
      confirmed,
      closures: detection.closures,
      unmeasured: detection.unmeasured,
      commands: commandNotes,
      final: finalSample,
      milestones,
      capture: {
        screen: { available: false, reason: 'rendering-detached-headless' },
        stack: null,
        console: consoleCapture.lines,
        eventTimeline: busLog,
        simDigest: digest,
        assetStatus: { essentialModelCheck: 'not-run', reason: 'rendering-detached-headless' },
        saveGeneration: commandNotes.some((note) => note.type === 'save') ? CURRENT_VERSION : null,
        resources: {
          wallMs: Math.round(wallMs * 100) / 100,
          heapDeltaBytes: heapDelta,
          ticks,
          simSeconds: Math.round((ticks * SIM_DT) * 1000) / 1000,
          fpsClaimed: false,
        },
      },
    };
  } catch (error) {
    return finishInfra(journey, persona, seed, fault, surface, redactString(error && error.stack || String(error)));
  } finally {
    consoleCapture.restore();
    if (runtime) {
      try { runtime.dispose(); } catch (_) { /* teardown is best-effort */ }
    }
  }
}

function finishInfra(journey, persona, seed, fault, surface, error) {
  return {
    schema: 'spaceface.strangerRun.v1',
    ok: false,
    status: 'infra',
    evidenceClass: 'focused-fixture',
    host: 'node-headless',
    journeyId: journey.id,
    personaId: persona.id,
    seed,
    fault,
    surface,
    ticks: 0,
    digest: null,
    tapeHash: null,
    tape: { schema: 'spaceface.strangerTape.v1', frames: [] },
    fingerprint: null,
    failures: [],
    confirmed: [],
    closures: [],
    commands: [],
    error,
    capture: {
      screen: { available: false, reason: 'rendering-detached-headless' },
      stack: error,
      console: [],
      eventTimeline: [],
      simDigest: null,
      assetStatus: { essentialModelCheck: 'not-run', reason: 'rendering-detached-headless' },
      saveGeneration: null,
      resources: { fpsClaimed: false },
    },
  };
}

function materializeAction(action, fault, surface) {
  const issuedMoveZ = Number(action.moveZ) || 0;
  let moveZ = issuedMoveZ;
  let moveX = Number(action.moveX) || 0;
  let turnIntent = Number(action.turnIntent) || 0;
  if (surface === 'simulated-touch') {
    moveX = Math.round(moveX * 4) / 4;
    moveZ = Math.round(moveZ * 4) / 4;
    turnIntent = Math.round(turnIntent * 4) / 4;
  }
  if (fault === 'drop-thrust') moveZ = 0;
  const commands = Array.isArray(action.commands) ? action.commands.map((command) => ({ ...command })) : [];
  return {
    frame: {
      tick: 0,
      moveX,
      moveZ,
      turnIntent,
      boost: !!action.boost,
      fire: !!action.fire,
      fireGroup: action.fireGroup | 0,
      tether: !!action.tether,
      reel: action.reel < 0 ? -1 : (action.reel > 0 ? 1 : 0),
      scanPulse: !!action.scanPulse,
      brake: !!action.brake,
      tetherNearest: !!action.tetherNearest,
      issuedMoveZ,
      commands,
    },
  };
}

function actionFromTape(tape, tick) {
  const frames = tape.frames || [];
  let current = null;
  for (const frame of frames) {
    const frameTick = frame.tick | 0;
    if (frameTick <= tick) current = frame;
    else break;
  }
  if (!current || (current.tick | 0) !== tick) {
    return {
      moveX: current ? current.moveX : 0,
      moveZ: current ? current.moveZ : 0,
      turnIntent: current ? current.turnIntent : 0,
      boost: current ? current.boost : false,
      fire: current ? current.fire : false,
      fireGroup: current ? current.fireGroup : 0,
      tether: current ? current.tether : false,
      reel: current ? current.reel : 0,
      scanPulse: false,
      brake: current ? current.brake : false,
      tetherNearest: false,
      commands: [],
    };
  }
  const restoreThrust = current.issuedMoveZ > 0.5 && current.moveZ < 0.2;
  return {
    moveX: current.moveX,
    moveZ: restoreThrust ? current.issuedMoveZ : current.moveZ,
    turnIntent: current.turnIntent,
    boost: current.boost,
    fire: current.fire,
    fireGroup: current.fireGroup,
    tether: current.tether,
    reel: current.reel,
    scanPulse: !!current.scanPulse,
    brake: current.brake,
    tetherNearest: !!current.tetherNearest,
    commands: current.commands || [],
  };
}

function applyAction(state, grammar, frame, dt) {
  const player = state.entities.get(state.playerId);
  const rot = player && Number.isFinite(player.rot) ? player.rot : 0;
  const origin = player && player.pos ? player.pos : { x: 0, z: 0 };
  const attached = !!(state.player && state.player.tether && state.player.tether.active);
  state.input = state.input || {};
  state.input.moveX = frame.moveX;
  state.input.moveZ = frame.moveZ;
  state.input.turnIntent = frame.turnIntent;
  state.input.boost = frame.boost;
  state.input.fire = frame.fire;
  state.input.brake = frame.brake;
  state.input.fireGroup = frame.fireGroup;
  state.input.aimAngle = rot;
  state.input.keys = {
    KeyW: frame.moveZ > 0.2,
    KeyS: frame.moveZ < -0.2,
    KeyD: frame.moveX > 0.2,
    KeyA: frame.moveX < -0.2,
    ShiftLeft: frame.boost,
    KeyF: frame.tether,
    KeyQ: frame.reel < 0,
    KeyE: frame.reel > 0,
  };
  state.input.aimWorld = {
    x: origin.x + Math.cos(rot) * 1000,
    z: origin.z + Math.sin(rot) * 1000,
  };
  state.input.actions = state.input.actions || {};
  state.input.actions.reelDelta = frame.reel;
  state.input.actions.scanPulse = frame.scanPulse;
  const packet = grammar.step(dt, {
    held: frame.tether,
    attached,
    lineLength: frame.reel,
    orbitDirection: frame.turnIntent,
  });
  state.input.actions.massline = packet ? { ...packet } : null;
  // The input system is the owner that publishes grammar edges. This host has no DOM
  // keyboard, so it publishes the same edges the input owner writes from that grammar.
  state.input.actions.tetherFire = !!(packet && packet.latch);
  state.input.actions.tetherCut = !!(packet && packet.cut);
  state.input.tetherMode = packet && packet.latch && frame.tetherNearest ? 'nearest' : null;
}

async function runCommands(runtime, commands, tick, held) {
  const notes = [];
  for (const command of commands || []) {
    notes.push(await runCommand(runtime, command, tick, held));
  }
  return notes;
}

async function runCommand(runtime, command, tick, held) {
  const state = runtime.state;
  try {
    if (command.type === 'buy') return buy(runtime, command, tick);
    if (command.type === 'refit') return refit(runtime, command, tick);
    if (command.type === 'accept-mission') return acceptMission(runtime, command, tick);
    if (command.type === 'abandon-mission') return abandonMission(runtime, command, tick);
    if (command.type === 'jump') return requestJump(runtime, command, tick);
    if (command.type === 'save') {
      if (held.saved) return { type: 'save', tick, ok: true, skipped: true };
      const note = saveSlot(runtime, command, tick, held);
      if (note.ok) held.saved = true;
      held.savedTick = tick;
      return note;
    }
    if (command.type === 'continue') {
      if (held.continued) return { type: 'continue', tick, ok: true, skipped: true };
      if (!held.envelope || held.savedTick === tick) {
        return { type: 'continue', tick, ok: false, skipped: true, reason: 'wait-for-save' };
      }
      held.continued = true;
      return continueSlot(runtime, command, tick, held);
    }
    if (command.type === 'begin-run') {
      runtime.bus.emit('run:beginRequested', {
        kind: command.kind || 'survival',
        seed: command.seed,
        arenaId: command.arenaId || null,
      });
      return { type: command.type, tick, ok: !!(state.run && state.run.phase && state.run.phase !== 'inactive') };
    }
    if (command.type === 'run-loadout-ready') {
      if (held.loadoutReady) return { type: command.type, tick, ok: true, skipped: true };
      held.loadoutReady = true;
      runtime.bus.emit('run:loadoutReady', {});
      return { type: command.type, tick, ok: true };
    }
    if (command.type === 'run-continue' && command.event) {
      const run = state.run || {};
      const key = `${run.phase}|${run.wave}|${command.event}`;
      held.continues = held.continues || new Set();
      if (held.continues.has(key)) return { type: command.type, tick, ok: true, skipped: true };
      held.continues.add(key);
      runtime.bus.emit(command.event, {});
      return { type: command.type, tick, ok: true, event: command.event };
    }
    if (command.type === 'recover') {
      const combat = runtime.getSystem('combat');
      const result = combat && typeof combat.recoverPendingPlayer === 'function'
        ? combat.recoverPendingPlayer({})
        : { ok: false, reason: 'no-combat' };
      return { type: command.type, tick, ok: !!(result && result.ok), reason: result && result.reason };
    }
    if (command.type === 'probe-dock') {
      return {
        type: command.type,
        tick,
        ok: true,
        docked: !!(state.ui && state.ui.docked),
      };
    }
    return { type: command.type || 'unknown', tick, ok: false, reason: 'unknown-command' };
  } catch (error) {
    return {
      type: command.type || 'unknown',
      tick,
      ok: false,
      reason: 'threw',
      error: redactString(error && error.message || String(error)),
    };
  }
}

function buy(runtime, command, tick) {
  const economy = runtime.getSystem('economy');
  const state = runtime.state;
  const before = state.player.credits;
  const result = economy.execute(
    command.stationId,
    command.commodityId,
    'buy',
    command.qty || 1,
    { intentId: command.intentId },
  );
  const after = state.player.credits;
  const charged = Number.isFinite(before) && Number.isFinite(after) && after < before - 0.001;
  return {
    type: 'buy',
    tick,
    intentId: command.intentId || null,
    ok: !!(result && result.ok),
    duplicate: !!(result && result.duplicate),
    total: result && Number.isFinite(result.total) ? result.total : 0,
    charged: !!(result && result.ok && charged && !result.duplicate),
    refused: !(result && result.ok),
    reason: result && result.reason || null,
  };
}

function refit(runtime, command, tick) {
  const state = runtime.state;
  const before = state.player.credits;
  runtime.bus.emit('ui:buyModule', { defId: command.defId });
  const after = state.player.credits;
  const charged = Number.isFinite(before) && Number.isFinite(after) && after < before - 0.001;
  return {
    type: 'refit',
    tick,
    intentId: command.intentId || command.defId,
    ok: charged,
    duplicate: false,
    total: charged ? before - after : 0,
    charged,
    refused: !charged,
  };
}

function acceptMission(runtime, command, tick) {
  const missions = runtime.getSystem('missions');
  const ok = !!(missions && missions.acceptMission(command.missionId));
  const active = runtime.state.missions && runtime.state.missions.active
    ? runtime.state.missions.active.find((mission) => mission && mission.status === 'active')
    : null;
  const objectiveMet = !!(active && active.objectiveTarget != null
    && active.objectiveProgress >= active.objectiveTarget);
  return {
    type: 'accept-mission',
    tick,
    missionId: command.missionId,
    ok,
    objectiveMet,
  };
}

function abandonMission(runtime, command, tick) {
  const missions = runtime.getSystem('missions');
  if (missions && typeof missions.abandonMission === 'function') {
    missions.abandonMission(command.missionId);
  } else {
    runtime.bus.emit('ui:abandonMission', { missionId: command.missionId });
  }
  return { type: 'abandon-mission', tick, missionId: command.missionId, ok: true };
}

function requestJump(runtime, command, tick) {
  runtime.bus.emit('world:requestJump', {
    targetSectorId: command.targetSectorId,
    via: command.via || 'gate',
  });
  const jump = runtime.state.jump || {};
  return {
    type: 'jump',
    tick,
    ok: jump.state === 'CHARGING' || jump.state === 'JUMPING',
    jumpState: jump.state || null,
    targetSectorId: jump.targetSectorId || command.targetSectorId,
  };
}

function saveSlot(runtime, command, tick, held) {
  const save = runtime.getSystem('save');
  if (!save || typeof save.serialize !== 'function') {
    return { type: 'save', tick, ok: false, reason: 'no-save-system' };
  }
  const envelope = save.serialize(command.slot || 'stranger');
  held.envelope = envelope;
  return { type: 'save', tick, ok: !!envelope, snapshot: poseSnapshot(runtime.state) };
}

async function continueSlot(runtime, command, tick, held) {
  const save = runtime.getSystem('save');
  if (!save || typeof save.loadEnvelope !== 'function' || !held.envelope) {
    return { type: 'continue', tick, ok: false, reason: held.envelope ? 'no-save-system' : 'no-envelope' };
  }
  await save.loadEnvelope(held.envelope, command.slot || 'stranger');
  return { type: 'continue', tick, ok: true, snapshot: poseSnapshot(runtime.state) };
}

function poseSnapshot(state) {
  const player = state.entities && state.playerId != null ? state.entities.get(state.playerId) : null;
  return {
    sectorId: state.world && state.world.currentSectorId || null,
    credits: state.player && Number.isFinite(state.player.credits) ? state.player.credits : null,
    x: player && player.pos ? player.pos.x : null,
    z: player && player.pos ? player.pos.z : null,
    simTime: state.simTime,
  };
}

async function prepareJourney(runtime, journey, aliasMap) {
  const state = runtime.state;
  if (journey.id === 'combat-death-retry') {
    state.world.currentSectorId = 'sector_ceres_belt';
    // This is an authored combat fixture, not ambient traffic. Supply the same
    // motive, response window and attack activity the live encounter producer owns.
    for (const spec of journey.entities.filter((row) => row.role === 'hostile')) {
      const enemy = state.entities.get(aliasMap[spec.alias]);
      Object.assign(enemy.data.ai, {
        passive: false, roe: 'weapons_free', hostileTeams: [0], huntPlayer: true,
        motive: 'hostile_training_encounter', engagementTrigger: 'player_attack',
        zoneId: 'stranger_combat_fixture', approachTelegraph: 'armed_wasp_approach',
        noFireResponseWindowS: 2, combatDoctrineId: CombatDoctrineId.RANGED_DISENGAGER,
        activity: { kind: 'attack_run', reason: 'stranger_combat_fixture', startedTick: 0,
          targetId: state.playerId, anchor: { ...enemy.pos }, leashRadius: 2000 },
      });
    }
  }
  if (journey.setup === 'station-counter') {
    state.ui = state.ui || {};
    state.ui.docked = true;
    state.ui.dockedStationId = 'station_helios';
    state.player.credits = 25000;
    const economy = runtime.getSystem('economy');
    if (economy && typeof economy.ensureMarket === 'function') {
      economy.ensureMarket('station_helios');
    }
  }
  if (journey.setup === 'mission-board') {
    state.player.credits = Math.max(state.player.credits || 0, 25000);
    const missions = runtime.getSystem('missions');
    if (missions && typeof missions.ensureBoard === 'function') {
      missions.ensureBoard('station_helios');
    }
  }
  if (journey.setup === 'tether-rock' || journey.setup === 'mining') {
    runtime.spawn({
      type: 'asteroid',
      pos: { x: 0, z: 28 },
      vel: { x: 0, z: 0 },
      radius: 8,
      mass: 400,
      collides: true,
      hull: 80,
      hullMax: 80,
      data: { typeId: 'ast_common_rock', oreHP: 40, oreHPMax: 40 },
    });
  }
  if (journey.setup === 'docking') {
    const proxy = collisionProxyIdForStation('station_helios') || 'station_ring_hub';
    const station = runtime.spawn({
      type: 'station',
      factionId: 'faction_scn',
      pos: { x: 0, z: 220 },
      radius: 42,
      mass: 1e6,
      hull: 1e6,
      hullMax: 1e6,
      collides: true,
      alive: true,
      data: {
        stationId: 'station_helios',
        stationTypeId: 'trade_hub',
        dockRadius: 90,
        collisionRadius: 42,
        collisionProxy: proxy,
        corridorBearingDeg: 180,
        services: ['trade', 'shipyard', 'refuel', 'repair', 'missions'],
        name: 'Helios Station',
        size: 'L',
        sectorId: HOME_SECTOR,
      },
    });
    placeOnApproach(state, station);
    aliasMap.station = station.id;
  }
  if (journey.setup === 'sector-home' && state.world) {
    state.world.currentSectorId = HOME_SECTOR;
  }
}

function placeOnApproach(state, station) {
  const player = state.entities.get(state.playerId);
  if (!player) return;
  const manifest = resolveCollisionProxyManifest(station);
  if (!manifest) return;
  const berth = resolveBerthWorld(station, manifest);
  const axis = resolveCorridorAxisWorld(station, manifest);
  player.pos.x = berth.x + axis.x * 40;
  player.pos.z = berth.z + axis.z * 40;
  player.rot = Math.atan2(-axis.z, -axis.x);
}

function attachLines(runtime, aliasMap, attachments) {
  const actions = runtime.getSystem('actions');
  const kernel = actions && actions.kernel;
  if (!kernel || !kernel.attachments) throw new Error('attachment kernel missing');
  const state = runtime.state;
  for (const attachment of attachments) {
    const owner = state.entities.get(aliasMap[attachment.ownerAlias]);
    const target = state.entities.get(aliasMap[attachment.targetAlias]);
    const created = kernel.attachments.create({
      defId: 'tether_standard',
      ownerId: owner.id,
      targetId: target.id,
      sourceWorld: { x: owner.pos.x, y: 0, z: owner.pos.z },
      targetWorld: { x: target.pos.x, y: 0, z: target.pos.z },
    });
    if (!created || !created.ok || !created.attachment) {
      throw new Error(`attachment create failed (${created && created.reason})`);
    }
    if (owner.id === state.playerId) {
      state.player.tether = {
        ...(state.player.tether || {}),
        active: true,
        targetId: target.id,
        attachmentId: created.attachment.id,
        restLength: created.attachment.restLength,
        strain: 0,
        load: 0,
        phase: 'loaded',
      };
    }
  }
}

const MILESTONE_EVENTS = new Set([
  'tether:attached',
  'tether:cut',
  'mining:yield',
  'scan:completed',
  'scan:pulse',
  'jump:arrive',
  'mission:accepted',
  'mission:failed',
  'mission:completed',
  'run:waveCleared',
  'run:waveStarted',
  'projectile:hit',
  'player:death',
  'player:respawn',
  'economy:tradeCompleted',
]);

function tapBus(bus, busLog, milestones) {
  if (!bus || typeof bus.emit !== 'function') return;
  const original = bus.emit.bind(bus);
  bus.emit = (event, payload) => {
    if (typeof event === 'string') {
      if (MILESTONE_EVENTS.has(event) && milestones) {
        milestones[event] = (milestones[event] || 0) + 1;
      }
      if (busLog.length < 200) busLog.push({ event, summary: summarizePayload(payload) });
    }
    return original(event, payload);
  };
}

function summarizePayload(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const summary = {};
  for (const key of ['reason', 'ok', 'missionId', 'phase', 'kind', 'targetSectorId', 'commodityId', 'error', 'wave']) {
    if (payload[key] != null && typeof payload[key] !== 'object') summary[key] = payload[key];
  }
  return redact(summary);
}

function hookConsole() {
  const lines = [];
  const original = { warn: console.warn, error: console.error };
  function push(level, args) {
    if (lines.length >= 40) return;
    const text = args.map((arg) => (arg instanceof Error ? arg.message : String(arg))).join(' ');
    lines.push(redactString(`[${level}] ${text}`).slice(0, 400));
  }
  console.warn = (...args) => { push('warn', args); };
  console.error = (...args) => { push('error', args); };
  return {
    lines,
    restore() {
      console.warn = original.warn;
      console.error = original.error;
    },
  };
}

function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}
