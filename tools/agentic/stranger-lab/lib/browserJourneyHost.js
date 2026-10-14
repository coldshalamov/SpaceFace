// Chrome tape host. Steps the recorded tape on that journey's systems.
// browserScenarioHost.js stays flight-only and is not called from here.

import { createAuthoritativeRuntime } from '../../../../src/runtime/createAuthoritativeRuntime.js';
import { SIM_DT } from '../../../../src/core/sim.js';
import { createMasslineInputGrammar } from '../../../../src/systems/masslineInputGrammar.js';
import { buildEntitySpawnSpec } from '../../../../src/testing/lab/entityProfiles.js';
import { NEW_GAME } from '../../../../src/data/newGameDefaults.js';
import { systemsForBrowserJourney } from './browserSystems.mjs';
import { getJourney } from './journeys.mjs';
import { applyAction, attachLines, prepareJourney, runCommands, HOME_SECTOR } from './journeyWorld.mjs';
import { createTapeReader, tapeTicks } from './tape.mjs';

export async function replayJourneyTape(request) {
  const journey = getJourney(request && request.journeyId);
  const frames = request && request.tape && Array.isArray(request.tape.frames) ? request.tape.frames : [];
  const seed = (request && request.seed) >>> 0;
  const ticks = tapeTicks({ frames });
  const readTape = createTapeReader({ frames });
  let runtime = null;
  try {
    const systems = systemsForBrowserJourney(journey);
    runtime = createAuthoritativeRuntime({
      profileId: 'production',
      seed,
      systems,
    });
    const state0 = runtime.state;
    state0.mode = 'flight';
    state0.meta = state0.meta || {};
    state0.meta.seed = seed;
    state0.settings = state0.settings || {};
    state0.settings.gameplay = {
      ...(state0.settings.gameplay || {}),
      physicsBackend: 'rapier-dynamic',
      flightBackend: 'v3',
      aiBackend: journey.extras?.includes('tacticalAI') ? 'tactical' : 'legacy',
    };
    if (state0.world) state0.world.currentSectorId = state0.world.currentSectorId || HOME_SECTOR;
    if (state0.player && !(state0.player.credits > 0)) state0.player.credits = NEW_GAME.credits;
    if (journey.id === 'combat-death-retry' && state0.player) {
      state0.player.combatProfile = 'crucible';
    }
    const aliasMap = Object.create(null);
    for (const entity of journey.entities) {
      const built = buildEntitySpawnSpec(entity, state0);
      const spawned = runtime.spawn(built.spec);
      aliasMap[entity.alias] = spawned.id;
      if (built.seedVel) {
        spawned.vel.x = built.seedVel.x || 0;
        spawned.vel.z = built.seedVel.z || 0;
      }
      if (entity.isPlayer) state0.playerId = spawned.id;
    }
    await prepareJourney(runtime, journey, aliasMap);
    const physics = runtime.getSystem('physics');
    if (physics && typeof physics.prepareBackend === 'function') {
      const ready = await physics.prepareBackend(runtime.state, {});
      const sg02 = !!(runtime.state.physicsRuntime && runtime.state.physicsRuntime.diagnostics
        && runtime.state.physicsRuntime.diagnostics.sg02Ready);
      if (ready !== true || !sg02) {
        return { ok: false, status: 'infra', error: 'SG-02 dynamic authority failed to become ready', ticks: 0, evidence: null };
      }
    }
    if (journey.attachments && journey.attachments.length) {
      attachLines(runtime, aliasMap, journey.attachments);
    }
    const built = worldEvidence(runtime.state, systems);
    const grammar = createMasslineInputGrammar();
    const held = { envelope: null };
    for (let tick = 0; tick < ticks; tick++) {
      const frame = readTape(tick);
      applyAction(runtime.state, grammar, frame, SIM_DT);
      await runCommands(runtime, frame.commands, tick, held);
      runtime.step(SIM_DT);
    }
    const stepped = worldEvidence(runtime.state, systems);
    stepped.ticks = ticks;
    stepped.simTime = runtime.state.simTime || 0;
    stepped.builtKinds = built.kinds;
    stepped.builtHostile = built.hostile;
    stepped.builtTetherActive = built.tetherActive;
    return {
      ok: true,
      status: 'stepped',
      ticks,
      evidence: stepped,
    };
  } catch (error) {
    return {
      ok: false,
      status: 'infra',
      error: error && error.message ? String(error.message).slice(0, 500) : String(error),
      ticks: 0,
      evidence: null,
    };
  } finally {
    if (runtime) {
      try { runtime.dispose(); } catch (_) { /* teardown is best-effort */ }
    }
  }
}

function worldEvidence(state, systems) {
  const kinds = {};
  let hostile = 0;
  if (state.entities && typeof state.entities.values === 'function') {
    for (const entity of state.entities.values()) {
      if (!entity) continue;
      const kind = entity.type || 'unknown';
      kinds[kind] = (kinds[kind] || 0) + 1;
      if (entity.id !== state.playerId && entity.team != null && entity.team !== 0) hostile += 1;
    }
  }
  const tether = state.player && state.player.tether;
  const names = [];
  for (const system of systems) {
    if (system && system.name && !names.includes(system.name)) names.push(system.name);
  }
  return {
    systems: names,
    kinds,
    hostile,
    tetherActive: !!(tether && tether.active),
    sectorId: state.world && state.world.currentSectorId || null,
    dockPhase: state.dockingCorridor && state.dockingCorridor.phase || null,
  };
}

export function journeyWorldStepped(journeyId, evidence) {
  if (!evidence || !Array.isArray(evidence.systems)) return false;
  const has = (name) => evidence.systems.includes(name);
  const kinds = evidence.builtKinds || evidence.kinds || {};
  const kind = (name) => (kinds[name] || 0) > 0;
  const tetherActive = evidence.builtTetherActive != null ? evidence.builtTetherActive : evidence.tetherActive;
  const hostile = evidence.builtHostile != null ? evidence.builtHostile : evidence.hostile;
  switch (journeyId) {
    case 'flight':
      return has('flight') && has('physics') && has('actions') && has('weapons');
    case 'launch':
      return has('dockingCorridor') && has('flight') && kind('station');
    case 'tether-attach-cut':
      return has('tetherGameplay') && has('masslineTelemetry') && kind('asteroid');
    case 'heavy-object':
      return has('tetherGameplay') && tetherActive === true;
    case 'mining':
      return has('mining') && kind('asteroid');
    case 'docking':
      return has('dockingCorridor') && kind('station');
    case 'buy-refit':
      return has('economy') && has('cargo') && has('ships');
    case 'scan':
      return has('scanner') && (kind('asteroid') || kind('payload'));
    case 'mission':
      return has('missions');
    case 'combat-death-retry':
      return has('tacticalAI') && has('combat') && has('aiPorts') && hostile >= 1;
    case 'crucible-wave':
      return has('runSession') && has('survivalRun') && has('survivalWave');
    case 'save-continue':
      return has('save') && has('world');
    default:
      return false;
  }
}
