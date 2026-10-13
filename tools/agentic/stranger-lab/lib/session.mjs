// Closed-loop stranger session on the authoritative headless runtime.
// Personas observe, the sim steps, and the tape is what replay applies.

import { createHash } from 'node:crypto';
import { SIM_DT } from '../../../../src/core/sim.js';
import { createAuthoritativeRuntime } from '../../../../src/runtime/createAuthoritativeRuntime.js';
import { createMasslineInputGrammar } from '../../../../src/systems/masslineInputGrammar.js';
import { buildEntitySpawnSpec } from '../../../../src/testing/lab/entityProfiles.js';
import { CURRENT_VERSION } from '../../../../src/data/saveVersion.js';
import { NEW_GAME } from '../../../../src/data/newGameDefaults.js';
import { checkEssentialBodies } from './assets.mjs';
import { HOME_SECTOR, applyAction, attachLines, prepareJourney, runCommands } from './journeyWorld.mjs';
import { systemsForJourney } from './bundles.mjs';
import { compareDigests, detectFailures } from './detectors.mjs';
import { assessJourney, getJourney, routeCommandIssued } from './journeys.mjs';
import { observeState, simDigest } from './observe.mjs';
import { getPersona } from './personas.mjs';
import { stableStringify } from './rng.mjs';
import { redact, redactString } from './redact.mjs';
import { createTouchSession, projectSimulatedTouch, TOUCH_VIEWPORT } from './touchSurface.mjs';

export async function runSession(options = {}) {
  const journey = getJourney(options.journeyId);
  const persona = getPersona(options.personaId || journey.defaultPersona);
  const seed = options.seed >>> 0;
  const fault = options.fault || null;
  const surface = options.surface === 'simulated-touch' ? 'simulated-touch' : 'keyboard';
  const ticks = options.ticks != null ? options.ticks | 0 : journey.ticks;
  const playback = options.playbackTape || null;
  const touchSession = !playback && surface === 'simulated-touch' ? createTouchSession() : null;
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

    if (journey.id === 'combat-death-retry' && state.player) {
      // Adventure's 3x shield cushion is the career opener. This route is a combat death,
      // which the derived-stats owner already treats as the crucible profile.
      state.player.combatProfile = 'crucible';
    }
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
      const applied = materializeAction(decided, playback ? null : fault, playback ? 'keyboard' : surface, touchSession);
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
    const asset = checkEssentialBodies(journey);
    const digest = sha256(stableStringify(simDigest(samples)));
    const detection = detectFailures({
      samples,
      frames,
      commands: commandNotes,
      bus: busLog,
      asset,
    });
    if (options.referenceDigest && options.referenceDigest !== digest) {
      const drift = compareDigests(options.referenceDigest, digest);
      detection.failures.push(drift);
      detection.confirmed.push(drift);
    }
    const tape = { schema: 'spaceface.strangerTape.v1', frames };
    const tapeHash = sha256(stableStringify(tape));
    const ordered = detection.failures
      .slice()
      .sort((a, b) => a.id.localeCompare(b.id) || a.tick - b.tick);
    const primary = ordered[0] || null;
    const recordedFault = frames.find((frame) => frame.injectedFault)?.injectedFault || null;
    const fingerprint = primary
      ? sha256(stableStringify({
        journeyId: journey.id,
        personaId: persona.id,
        seed,
        fault: recordedFault,
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
    const attempted = routeCommandIssued(journey.id, commandNotes);
    const status = ordered.length ? 'fail'
      : completion.status === 'complete' ? 'pass'
        : attempted ? 'incomplete'
          : 'fail';
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
        assetStatus: asset,
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

function materializeAction(action, fault, surface, touchSession) {
  const playback = action.playback === true;
  let moveX = Number(action.moveX) || 0;
  let moveZ = Number(action.moveZ) || 0;
  let turnIntent = Number(action.turnIntent) || 0;
  let boost = !!action.boost;
  let fire = !!action.fire;
  let fireGroup = action.fireGroup | 0;
  let brake = !!action.brake;
  let tether = !!action.tether;
  let reel = action.reel < 0 ? -1 : (action.reel > 0 ? 1 : 0);
  let issuedMoveZ = playback && Number.isFinite(action.issuedMoveZ) ? action.issuedMoveZ : moveZ;
  let injectedFault = playback ? (action.injectedFault || null) : null;
  if (!playback && surface === 'simulated-touch' && touchSession) {
    const touched = projectSimulatedTouch(touchSession, action);
    moveX = touched.moveX;
    moveZ = touched.moveZ;
    turnIntent = touched.turnIntent;
    boost = touched.boost;
    fire = touched.fire;
    fireGroup = touched.fireGroup;
    brake = touched.brake;
    tether = touched.tether;
    reel = touched.reel;
    issuedMoveZ = moveZ;
  }
  if (!playback && fault === 'drop-thrust') {
    moveZ = 0;
    injectedFault = 'drop-thrust';
  }
  const commands = Array.isArray(action.commands) ? action.commands.map((command) => ({ ...command })) : [];
  return {
    frame: {
      tick: 0,
      moveX,
      moveZ,
      turnIntent,
      boost,
      fire,
      fireGroup,
      tether,
      reel,
      scanPulse: !!action.scanPulse,
      brake,
      tetherNearest: !!action.tetherNearest,
      issuedMoveZ,
      injectedFault,
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
  const held = current;
  if (!held || (held.tick | 0) !== tick) {
    return {
      playback: true,
      moveX: held ? held.moveX : 0,
      moveZ: held ? held.moveZ : 0,
      issuedMoveZ: held && Number.isFinite(held.issuedMoveZ) ? held.issuedMoveZ : (held ? held.moveZ : 0),
      injectedFault: held ? held.injectedFault || null : null,
      turnIntent: held ? held.turnIntent : 0,
      boost: held ? held.boost : false,
      fire: held ? held.fire : false,
      fireGroup: held ? held.fireGroup : 0,
      tether: held ? held.tether : false,
      reel: held ? held.reel : 0,
      scanPulse: false,
      brake: held ? held.brake : false,
      tetherNearest: false,
      commands: [],
    };
  }
  return {
    playback: true,
    moveX: held.moveX,
    moveZ: held.moveZ,
    issuedMoveZ: Number.isFinite(held.issuedMoveZ) ? held.issuedMoveZ : held.moveZ,
    injectedFault: held.injectedFault || null,
    turnIntent: held.turnIntent,
    boost: held.boost,
    fire: held.fire,
    fireGroup: held.fireGroup,
    tether: held.tether,
    reel: held.reel,
    scanPulse: !!held.scanPulse,
    brake: held.brake,
    tetherNearest: !!held.tetherNearest,
    commands: held.commands || [],
  };
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
