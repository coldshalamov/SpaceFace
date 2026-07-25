// Test-only live-route stepping bridge (Phase 4 §8).
//
// MUST be installed only behind SF_DEBUG_ONLY in main.js so production dropLabels
// strips both the installer call and (via dynamic import) this module from build/web.
//
// Allowed surface:
//   pauseAutomaticLoop, resumeAutomaticLoop, loadCompiledScenario, applyRawControlEvents,
//   stepTicks, snapshot, checkpoint, renderOnce, destroyScenario
//
// Forbidden (intentionally absent):
//   eval, arbitrary module import, arbitrary state writes, teleport helpers,
//   direct gameplay event synthesis, direct success-state mutation.

import { SIM_DT } from '../../core/sim.js';
import { createTimeEffects } from '../../core/timeEffects.js';
import { buildDeterministicSurface } from './deterministicSurface.js';
import { createInputTapeDriver } from './inputTape.js';
import { transitionFlightKeyState } from '../../systems/input.js';

/** Dedicated time-effects source for lab pause — never write timeScale directly. */
export const LAB_LIVE_ROUTE_TIME_SOURCE = 'lab:live-route';

export const LIVE_ROUTE_BRIDGE_API = Object.freeze([
  'pauseAutomaticLoop',
  'resumeAutomaticLoop',
  'loadCompiledScenario',
  'applyRawControlEvents',
  'stepTicks',
  'snapshot',
  'checkpoint',
  'renderOnce',
  'destroyScenario',
]);

/** Symbols that must never appear on the bridge. */
export const LIVE_ROUTE_BRIDGE_FORBIDDEN = Object.freeze([
  'eval',
  'importModule',
  'writeState',
  'teleport',
  'emitGameplayEvent',
  'forceWin',
  'setCredits',
  'mutateSuccess',
]);

/**
 * Live-route bridge V1 supports player-only flight setups. Scenarios that author
 * non-player entities or attachments require full spawn/attachment setup that this
 * bridge does not perform — reject them rather than silently skipping.
 * @param {object} canonical
 * @returns {{ ok: true } | { ok: false, reason: string, status: string }}
 */
export function assertLiveRouteScenarioSupported(canonical) {
  if (!canonical || typeof canonical !== 'object') {
    return { ok: false, status: 'unsupported', reason: 'canonical-required' };
  }
  const entities = Array.isArray(canonical.entities) ? canonical.entities : [];
  const nonPlayer = entities.filter((ent) => ent && !ent.isPlayer);
  if (nonPlayer.length > 0) {
    const aliases = nonPlayer.map((e) => e.alias || e.role || 'entity').slice(0, 8);
    return {
      ok: false,
      status: 'unsupported',
      reason: `live-route bridge does not spawn non-player entities (${aliases.join(', ')}); use Node lab runner`,
    };
  }
  const attachments = Array.isArray(canonical.attachments) ? canonical.attachments : [];
  if (attachments.length > 0) {
    return {
      ok: false,
      status: 'unsupported',
      reason: 'live-route bridge does not create attachments; use Node lab runner',
    };
  }
  const relations = Array.isArray(canonical.relations) ? canonical.relations : [];
  if (relations.length > 0) {
    return {
      ok: false,
      status: 'unsupported',
      reason: 'live-route bridge does not create relations; use Node lab runner',
    };
  }
  return { ok: true };
}

/**
 * Install a frozen lab bridge onto the live SF debug handle.
 * @param {{ state: object, bus?: object, registry: object, helpers?: object, timeEffects?: object }} sf
 */
export function installLiveRouteBridge(sf) {
  if (!sf || !sf.state || !sf.registry) {
    throw new Error('installLiveRouteBridge requires { state, registry }');
  }

  // Prefer the live SF timeEffects owner; fall back to the singleton for this state.
  const timeEffects = sf.timeEffects || createTimeEffects(sf.state);
  let paused = false;
  let scenario = null; // { canonical, aliasMap, inputDriver, meta }
  let destroyed = false;

  const bridge = {
    pauseAutomaticLoop() {
      assertAlive();
      if (!paused) {
        // Single-writer: only timeEffects mutates state.timeScale.
        timeEffects.set(LAB_LIVE_ROUTE_TIME_SOURCE, { scale: 0 });
        paused = true;
      }
      return { ok: true, timeScale: sf.state.timeScale, paused: true };
    },

    resumeAutomaticLoop() {
      assertAlive();
      timeEffects.clear(LAB_LIVE_ROUTE_TIME_SOURCE);
      paused = false;
      return { ok: true, timeScale: sf.state.timeScale, paused: false };
    },

    /**
     * Load a precompiled canonical scenario into the live state (setup only).
     * Does not synthesize combat outcomes or success flags.
     * @param {object} canonical compiled scenario artifact
     */
    loadCompiledScenario(canonical) {
      assertAlive();
      if (!canonical || typeof canonical !== 'object') {
        return { ok: false, reason: 'canonical-required' };
      }
      const support = assertLiveRouteScenarioSupported(canonical);
      if (!support.ok) {
        return {
          ok: false,
          status: support.status,
          reason: support.reason,
          scenarioId: canonical.id || null,
        };
      }
      destroyScenarioInternal();

      const state = sf.state;
      state.mode = canonical.world?.mode || 'flight';
      state.settings = state.settings || {};
      state.settings.gameplay = state.settings.gameplay || {};
      if (canonical.world?.physicsBackend) {
        state.settings.gameplay.physicsBackend = canonical.world.physicsBackend;
      }
      if (canonical.world?.flightBackend) {
        state.settings.gameplay.flightBackend = canonical.world.flightBackend;
      }
      if (canonical.world?.sectorId && state.world) {
        state.world.currentSectorId = canonical.world.sectorId;
      }
      if (Number.isFinite(canonical.world?.credits) && state.player) {
        state.player.credits = canonical.world.credits;
      }

      // Seed is recorded for diagnostics only — do not reseed mid-run (entropy claim).
      const aliasMap = Object.create(null);
      const entities = Array.isArray(canonical.entities) ? canonical.entities : [];
      const playerEnt = entities.find((ent) => ent && ent.isPlayer) || null;
      if (playerEnt) {
        // Player already exists on live route; map alias only + pose alignment.
        aliasMap[playerEnt.alias || 'player'] = state.playerId;
        const player = state.entities.get(state.playerId);
        if (player && playerEnt.pos) {
          // Pose alignment for scenario start — not free teleport API (scenario load only).
          player.pos.x = playerEnt.pos.x || 0;
          player.pos.z = playerEnt.pos.z || 0;
          if (player.prevPos) {
            player.prevPos.x = player.pos.x;
            player.prevPos.z = player.pos.z;
          }
          if (playerEnt.vel) {
            player.vel.x = playerEnt.vel.x || 0;
            player.vel.z = playerEnt.vel.z || 0;
          }
          if (Number.isFinite(playerEnt.heading)) {
            player.rot = playerEnt.heading;
            player.prevRot = playerEnt.heading;
          }
          if (player.physicsBody) {
            player.physicsBody.revision = (player.physicsBody.revision | 0) + 1;
          }
        }
      } else {
        aliasMap.player = state.playerId;
      }

      // L3: consume canonical.inputTape exclusively — no raw-field fallback.
      if (!canonical.inputTape || typeof canonical.inputTape !== 'object') {
        throw new Error('liveRouteBridge: canonical.inputTape is required');
      }
      const inputDriver = createInputTapeDriver(canonical.inputTape);

      scenario = {
        canonical,
        aliasMap,
        inputDriver,
        meta: {
          scenarioDigest: canonical.scenarioDigest || null,
          inputDigest: canonical.inputDigest || null,
          dt: canonical.dt || SIM_DT,
        },
        loadedAtTick: state.tick | 0,
      };

      // Auto-pause for deterministic stepping.
      bridge.pauseAutomaticLoop();
      return {
        ok: true,
        scenarioId: canonical.id || null,
        playerId: state.playerId,
        paused: true,
      };
    },

    /**
     * Apply raw keyboard control events through the production flight key grammar.
     * @param {Array<{ code: string, pressed: boolean }>} events
     */
    applyRawControlEvents(events) {
      assertAlive();
      if (!Array.isArray(events)) return { ok: false, reason: 'events-array-required' };
      const state = sf.state;
      let keys = state.input?.keys ? { ...state.input.keys } : Object.create(null);
      for (const ev of events) {
        if (!ev || typeof ev.code !== 'string') continue;
        keys = transitionFlightKeyState(state, keys, {
          code: ev.code,
          pressed: !!ev.pressed,
          blocked: false,
        });
      }
      // Reflect held keys into axes via a one-tick tape-less derivation.
      state.input = state.input || {};
      state.input.keys = { ...keys };
      const derived = deriveAxesFromKeys(keys);
      state.input.moveX = derived.moveX;
      state.input.moveZ = derived.moveZ;
      state.input.turnIntent = derived.turnIntent;
      state.input.boost = derived.boost;
      return {
        ok: true,
        input: snapshotInput(state),
      };
    },

    /**
     * Step the live registry N fixed ticks while automatic loop is paused.
     * Applies scenario tape input for the relative tick when a scenario is loaded.
     * @param {number} n
     */
    stepTicks(n) {
      assertAlive();
      const count = Math.max(0, Math.min(10_000, n | 0));
      if (!paused) {
        bridge.pauseAutomaticLoop();
      }
      const state = sf.state;
      const dt = scenario?.meta?.dt || SIM_DT;
      const startTick = state.tick | 0;
      for (let i = 0; i < count; i++) {
        if (scenario && scenario.inputDriver) {
          const relTick = ((state.tick | 0) - (scenario.loadedAtTick | 0));
          const host = state.entities.get(state.playerId);
          const tetherAttached = !!(state.player?.tether?.active);
          scenario.inputDriver.apply(state, Math.max(0, relTick), dt, {
            playerEntity: host,
            tetherAttached,
          });
        }
        sf.registry.step(dt);
      }
      return {
        ok: true,
        steps: count,
        tick: state.tick | 0,
        startedAtTick: startTick,
      };
    },

    snapshot() {
      assertAlive();
      const state = sf.state;
      const player = state.entities.get(state.playerId);
      return {
        ok: true,
        tick: state.tick | 0,
        simTime: state.simTime,
        mode: state.mode,
        timeScale: state.timeScale,
        paused,
        input: snapshotInput(state),
        player: player ? {
          id: player.id,
          pos: player.pos ? { x: player.pos.x, z: player.pos.z } : null,
          vel: player.vel ? { x: player.vel.x, z: player.vel.z } : null,
          rot: player.rot,
          alive: !!player.alive,
          hull: player.hull,
        } : null,
        scenarioId: scenario?.canonical?.id || null,
      };
    },

    checkpoint() {
      assertAlive();
      const meta = scenario?.meta || {};
      const surface = buildDeterministicSurface(sf.state, meta);
      return {
        ok: true,
        hashKind: 'deterministic-covered-surface',
        coverageVersion: 'lab-checkpoint-v1',
        exactWithin: {
          sameBuild: true,
          sameRuntimeKind: true,
          sameEngineBinary: true,
          crossRuntime: false,
        },
        tick: sf.state.tick | 0,
        surface,
      };
    },

    renderOnce() {
      assertAlive();
      if (typeof sf.registry.renderUpdate === 'function') {
        sf.registry.renderUpdate(0, 0);
      }
      return { ok: true };
    },

    destroyScenario() {
      assertAlive();
      destroyScenarioInternal();
      return { ok: true, scenario: null };
    },
  };

  function destroyScenarioInternal() {
    scenario = null;
  }

  function assertAlive() {
    if (destroyed) throw new Error('liveRouteBridge destroyed');
  }

  // Freeze API; no prototype pollution / extra methods.
  const frozen = Object.freeze({ ...bridge });
  // Guard: ensure forbidden names are absent.
  for (const name of LIVE_ROUTE_BRIDGE_FORBIDDEN) {
    if (name in frozen) throw new Error(`forbidden bridge method leaked: ${name}`);
  }
  return frozen;
}

function snapshotInput(state) {
  const inp = state.input || {};
  const keys = inp.keys
    ? Object.keys(inp.keys).filter((k) => inp.keys[k]).sort()
    : [];
  return {
    moveX: inp.moveX || 0,
    moveZ: inp.moveZ || 0,
    turnIntent: inp.turnIntent || 0,
    boost: !!inp.boost,
    keys,
  };
}

function deriveAxesFromKeys(keys) {
  const forward = !!(keys.KeyW || keys.ArrowUp);
  const reverse = !!(keys.KeyS || keys.ArrowDown);
  const left = !!(keys.KeyA || keys.ArrowLeft);
  const right = !!(keys.KeyD || keys.ArrowRight);
  return {
    moveX: (right ? 1 : 0) + (left ? -1 : 0),
    moveZ: (forward ? 1 : 0) + (reverse ? -1 : 0),
    turnIntent: (right ? 1 : 0) + (left ? -1 : 0),
    boost: !!(keys.ShiftLeft || keys.ShiftRight),
  };
}
