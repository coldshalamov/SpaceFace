// Deterministic causal-accounting scenarios (Tier-1 counters).
//
// WHY THIS EXISTS
// -------------
// perfCounters.js counts WORK, not time: an integer count means the same thing on an idle host and
// on a workstation running twelve concurrent agents. But a count is only comparable against a
// fixed, reproducible scenario. This module runs the real fixed-step simulation and the real
// presentation ownership path (createSimulationRunner + createPresentationRunner) under a
// synthetic frame pump and a synthetic monotonic clock, with a fixed seed, fixed scripted inputs,
// fixed tick/frame counts, and ambient Math.random replaced by a seeded stream for the duration of
// the run. Two runs of one scenario must produce byte-identical deterministic fields; a counter
// delta between two commits is then a real regression, not noise.
//
// WHAT IT DRIVES
// --------------
// The sim side runs an explicit, proven-deterministic system set (the sf-sim shape: tactical AI
// where a scenario needs hostiles, flight V3 on the rapier-dynamic authority, weapons, physics,
// combat, cargo, economy, missions, story, save). The presentation side runs the real VFX system
// with headless-degraded textures, and the real render-package route: renderPackageLoader decode,
// the assetLoader package blueprint preparation, and partsLibrary package instantiation through
// the same probe entry point the package pilot tests use. No browser, launcher, broker, or GL
// context is involved; GL-level families (shader links, uploads, draws) stay at zero here and keep
// their browser probes.
//
// The byte-identity acceptance lives in test/perf-causal-scenarios.test.mjs.

import * as THREE from 'three';

import { createSimulation } from '../../src/core/sim.js';
import { startLoop } from '../../src/core/loop.js';
import { ensurePerfRuntime } from '../../src/core/perfRuntime.js';
import { CAUSAL_COUNTER_FIELDS } from '../../src/core/perfCounters.js';
import { stableJsonStringify } from '../../src/contracts/renderPackage.js';
import {
  RENDER_PACKAGE_SCHEMA,
  RENDER_PACKAGE_SEMANTIC_EXTRAS_KEY,
  RENDER_PACKAGE_SEMANTIC_EXTRAS_SCHEMA,
  computeRenderPackageContentHash,
  renderPackageContentIdentity,
} from '../../src/contracts/renderPackage.js';
import { createRenderPackageLoader } from '../../src/render/renderPackageLoader.js';
import {
  assembleRenderPackageRecord,
  prepareRenderPackageBlueprint,
} from '../../src/render/assetLoader.js';
import {
  buildAuthoredPlaceProp,
  enqueueBoundaryUpgrade,
  upgradeAuthoredPlaceBoundaryForProbe,
} from '../../src/render/partsLibrary.js';
import { vfx } from '../../src/render/vfx.js';
import { scenarioRuntime } from '../../src/systems/scenarioRuntime.js';
import { presentationOrchestrator } from '../../src/systems/presentationOrchestrator.js';
import { presentationAdapters } from '../../src/systems/presentationAdapters.js';
import { createTacticalAISystem } from '../../src/systems/tacticalAI.js';
import { aiEncounter } from '../../src/systems/aiEncounter.js';
import { aiPorts } from '../../src/systems/aiPorts.js';
import { actions } from '../../src/systems/actions.js';
import { flightV3 } from '../../src/systems/flightV3.js';
import { weapons } from '../../src/systems/weapons.js';
import { physics } from '../../src/core/physics.js';
import { combat } from '../../src/systems/combat.js';
import { cargo } from '../../src/systems/cargo.js';
import { economy } from '../../src/systems/economy.js';
import { missions } from '../../src/systems/missions.js';
import { story } from '../../src/systems/story.js';
import { save } from '../../src/save/saveSystem.js';
import { fittingsFromDefaultModules, makeShipEntitySpec } from '../../src/systems/ships.js';
import { NEW_GAME } from '../../src/data/newGameDefaults.js';

export const PERF_CAUSAL_SCENARIO_SCHEMA = 'spaceface.perfCausalScenario.v1';

const FRAME_MS = 1000 / 60;
// Drain bounds. QUIET is how many consecutive no-new-work rounds prove the frame settled; MAX is
// the cap that turns a runaway async chain into a loud failure instead of a truncated report.
const MICROTASK_DRAIN_QUIET_ROUNDS = 4;
const MICROTASK_DRAIN_MAX_ROUNDS = 96;
const HOSTILE_SHIP_ID = 'ship_wasp';

// -------------------------------------------------------------------------------------------------
// Scenario declarations. Everything a run needs is fixed here: seed, frames, inputs, spawns, and
// the presentation work each frame. bootBoundaryFrame is where the harness calls markBootBoundary.
// -------------------------------------------------------------------------------------------------
export const PERF_CAUSAL_SCENARIOS = Object.freeze([
  Object.freeze({
    id: 'boot',
    seed: 91001,
    frames: 90,
    bootBoundaryFrame: 30,
    tactical: false,
    vfx: false,
    inputForTick: () => ({}),
  }),
  Object.freeze({
    id: 'steady-flight',
    seed: 91002,
    frames: 300,
    bootBoundaryFrame: 30,
    tactical: false,
    vfx: false,
    inputForTick: () => ({ moveZ: 1 }),
  }),
  Object.freeze({
    id: 'turning-flight',
    seed: 91003,
    frames: 300,
    bootBoundaryFrame: 30,
    tactical: false,
    vfx: false,
    inputForTick: (tick) => ({ moveZ: 1, turnIntent: (Math.floor(tick / 60) % 2 === 0 ? 0.6 : -0.6) }),
  }),
  Object.freeze({
    id: 'first-encounter',
    seed: 91004,
    frames: 240,
    bootBoundaryFrame: 30,
    tactical: true,
    vfx: false,
    hostiles: [
      { x: 620, z: -18, rot: Math.PI },
      { x: 700, z: 140, rot: Math.PI },
    ],
    inputForTick: () => ({ moveZ: 1 }),
  }),
  Object.freeze({
    id: 'dense-combat-vfx',
    seed: 91005,
    frames: 240,
    bootBoundaryFrame: 30,
    tactical: true,
    vfx: true,
    hostiles: [
      { x: 160, z: 0, rot: Math.PI },
      { x: -140, z: 90, rot: 0.4 },
      { x: 60, z: -170, rot: 1.8 },
      { x: -60, z: -150, rot: -1.2 },
      { x: 190, z: 120, rot: Math.PI },
      { x: -180, z: -60, rot: 0.9 },
    ],
    inputForTick: (tick) => (tick < 30 ? {} : {
      fire: true,
      aimAngle: (tick % 180) * (Math.PI / 90),
    }),
  }),
  Object.freeze({
    id: 'dense-asteroid-field',
    seed: 91006,
    frames: 240,
    bootBoundaryFrame: 30,
    tactical: false,
    vfx: false,
    asteroidCount: 60,
    inputForTick: () => ({ moveZ: 1 }),
  }),
  Object.freeze({
    id: 'station-approach-docking',
    seed: 91007,
    frames: 180,
    bootBoundaryFrame: 30,
    tactical: false,
    vfx: false,
    station: { x: 900, z: 0 },
    packageAdmissions: [{ frame: 60, placeId: 'place_debris_chunk' }],
    inputForTick: (tick) => (tick < 120 ? { moveZ: 1 } : {}),
  }),
  Object.freeze({
    id: 'sector-transition-admission',
    seed: 91008,
    frames: 240,
    bootBoundaryFrame: 30,
    tactical: false,
    vfx: false,
    admissionBurst: {
      frame: 60,
      // Four place ids that all resolve to an authored place prop. They admit the same fixture
      // package (loadAuthoredPart is injected), so what this burst measures is four concurrent
      // admissions, not four distinct assets. place_dock_interior is deliberately NOT here — it
      // has no authored place prop and buildAuthoredPlaceProp returns null for it.
      placeIds: ['place_debris_chunk', 'place_dead_hulk', 'place_nav_buoy', 'place_conveyor_barge'],
    },
    sectorTransitionFrame: 150,
    inputForTick: () => ({ moveZ: 1 }),
  }),
]);

// -------------------------------------------------------------------------------------------------
// Synthetic clock + frame pump. Timestamps are exact multiples of FRAME_MS so frameDt is a
// constant, host-independent value; every frame therefore advances exactly one fixed sim step.
// -------------------------------------------------------------------------------------------------
function createSyntheticFramePump(startMs = 1000) {
  let now = startMs;
  let nextId = 1;
  const pending = new Map();
  return {
    requestFrame(callback) {
      const id = nextId++;
      pending.set(id, callback);
      return id;
    },
    cancelFrame(id) { pending.delete(id); },
    nowMs: () => now,
    /** Run exactly one queued frame at the next synthetic timestamp. Returns false when idle. */
    pumpOne() {
      const entry = pending.entries().next().value;
      if (!entry) return false;
      pending.delete(entry[0]);
      now += FRAME_MS;
      entry[1](now);
      return true;
    },
    pendingCount: () => pending.size,
  };
}

/** Replace ambient Math.random with a seeded LCG for the run; restores on exit. */
function withSeededAmbientRandom(seed, fn) {
  const original = Math.random;
  let state = (seed >>> 0) || 1;
  Math.random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  try {
    return fn();
  } finally {
    Math.random = original;
  }
}

/**
 * Install the browser globals the shipping render/admission route reads, and return an exact
 * restore closure.
 *
 * `window.SF.state` is the seam partsLibrary already uses (authoredRuntimeState /
 * recordAdmissionSlice), so the package scenarios exercise the real path rather than a stub.
 *
 * TRAP — `window` MUST carry `performance`. Rapier's wasm-bindgen glue probes for `window` first
 * and only falls back to Node's global `performance` when `window` is absent. A bare `{}` window
 * therefore routes rapier into the browser branch and hands Rust an undefined `performance`, which
 * panics the wasm module on the FIRST `world.step()` ("RuntimeError: unreachable"), followed by a
 * cascade of "recursive use of an object" errors from every later call against the poisoned world.
 * The cascade is louder than the cause and leads nowhere. A partial browser global is worse than
 * no browser global: it opts every `typeof window` branch into browser behaviour while withholding
 * what those branches depend on.
 */
function installHarnessGlobals(state, rafPump) {
  const hadWindow = Object.prototype.hasOwnProperty.call(globalThis, 'window');
  const priorWindow = hadWindow ? globalThis.window : undefined;
  const hadRaf = Object.prototype.hasOwnProperty.call(globalThis, 'requestAnimationFrame');
  const priorRaf = hadRaf ? globalThis.requestAnimationFrame : undefined;
  globalThis.window = {
    SF: { state },
    performance: globalThis.performance,
    requestAnimationFrame: rafPump.requestFrame,
    cancelAnimationFrame: rafPump.cancelFrame,
  };
  globalThis.requestAnimationFrame = rafPump.requestFrame;
  return () => {
    if (hadWindow) globalThis.window = priorWindow;
    else delete globalThis.window;
    if (hadRaf) globalThis.requestAnimationFrame = priorRaf;
    else delete globalThis.requestAnimationFrame;
  };
}

/**
 * Settle this frame's async work.
 *
 * A FIXED number of flushes is the classic byte-identity hazard: a chain that needs one more round
 * than the cap gets silently truncated, and the truncation point can differ between runs. Instead
 * drain until the recorded-work signature stops moving for MICROTASK_DRAIN_QUIET_ROUNDS
 * consecutive rounds, and THROW at the cap rather than continuing quietly. A scenario that cannot
 * settle is a harness bug to fix, not a number to publish.
 */
async function drainMicrotasks(probe, scenarioId, frameIndex) {
  let previous = probe();
  let quiet = 0;
  for (let round = 0; round < MICROTASK_DRAIN_MAX_ROUNDS; round++) {
    await new Promise((resolve) => setImmediate(resolve));
    const current = probe();
    quiet = current === previous ? quiet + 1 : 0;
    previous = current;
    if (quiet >= MICROTASK_DRAIN_QUIET_ROUNDS) return;
  }
  throw new Error(
    `causal scenario ${scenarioId}: async work did not settle within ${MICROTASK_DRAIN_MAX_ROUNDS} `
    + `drain rounds at frame ${frameIndex}`,
  );
}

// -------------------------------------------------------------------------------------------------
// Input tape application — mirrors scripts/sf-sim.mjs applyInput semantics.
// -------------------------------------------------------------------------------------------------
function applyScenarioInput(state, input) {
  const aimAngle = Number.isFinite(input.aimAngle) ? input.aimAngle : (state.input.aimAngle || 0);
  const player = state.entities.get(state.playerId);
  const origin = player ? player.pos : { x: 0, z: 0 };
  Object.assign(state.input, {
    moveX: Number.isFinite(input.moveX) ? input.moveX : 0,
    moveZ: Number.isFinite(input.moveZ) ? input.moveZ : 0,
    turnIntent: Number.isFinite(input.turnIntent) ? input.turnIntent : (input.moveX || 0),
    boost: !!input.boost,
    fire: !!input.fire,
    fireGroup: input.fireGroup == null ? null : input.fireGroup,
    aimAngle,
    aimWorld: {
      x: origin.x + Math.cos(aimAngle) * 1000,
      z: origin.z + Math.sin(aimAngle) * 1000,
    },
  });
}

// -------------------------------------------------------------------------------------------------
// The synthetic render-package fixture. A compact but structurally real package: rigid meshes with
// LOD0_ names, a canopy, a non-render collision hull, socket anchors, and one dynamic turret group.
// The fixture is built once per loader (decode count stays observable) and never touches disk.
// -------------------------------------------------------------------------------------------------
const FIXTURE_PILOT = Object.freeze({
  assetId: 'sf.render.causal-fixture',
  runtimeAssetId: 'SF_PLACE_CAUSAL_FIXTURE',
  slot: 'place',
  sourceUrl: 'assets/ships/release/parts/places/place_causal_fixture.glb',
});

const FIXTURE_IDENTITY = Object.freeze([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

function fixtureTriangleGeometry() {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    0, 0, 0,
    2, 0, 0,
    0, 1.5, 0,
  ], 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute([
    0, 0, 1,
    0, 0, 1,
    0, 0, 1,
  ], 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute([
    0, 0,
    1, 0,
    0, 1,
  ], 2));
  geometry.setIndex([0, 1, 2]);
  return geometry;
}

function semanticLocator(rawNodeName, recordIds) {
  return {
    [RENDER_PACKAGE_SEMANTIC_EXTRAS_KEY]: {
      schema: RENDER_PACKAGE_SEMANTIC_EXTRAS_SCHEMA,
      recordIds,
      rawNodeName,
    },
  };
}

function buildFixtureTemplate() {
  const root = new THREE.Group();
  root.name = 'CausalFixtureRoot';
  root.userData.spacefaceAsset = {
    assetId: FIXTURE_PILOT.runtimeAssetId,
    slot: FIXTURE_PILOT.slot,
    forward: '+X',
    up: '+Y',
    starboard: '+Z',
    unit: 'metre',
    // The fixture carries no texture maps at all, so declare the uncompressed source class rather
    // than claiming a KTX2 pipeline it does not have. The blueprint compiler validates this field
    // even for legacy parts.
    textureCompression: 'PNG-source',
  };
  root.userData = {
    ...root.userData,
    ...semanticLocator('CausalFixtureRoot', ['fixture.root']),
  };

  const material = new THREE.MeshStandardMaterial({ color: 0x8a919a, roughness: 0.7, metalness: 0.3 });
  material.name = 'FixtureHull';
  const canopyMaterial = new THREE.MeshStandardMaterial({ color: 0x2a3a4a, roughness: 0.2, metalness: 0.1 });
  canopyMaterial.name = 'FixtureCanopy';

  const hull = new THREE.Mesh(fixtureTriangleGeometry(), material);
  hull.name = 'LOD0_static_Hull';
  hull.userData = semanticLocator('LOD0_static_Hull', ['fixture.mesh.hull']);
  const accent = new THREE.Mesh(fixtureTriangleGeometry(), material);
  accent.name = 'LOD0_static_Accent';
  accent.userData = semanticLocator('LOD0_static_Accent', ['fixture.mesh.accent']);
  const canopy = new THREE.Mesh(fixtureTriangleGeometry(), canopyMaterial);
  canopy.name = 'LOD0_static_Glass_Canopy';
  canopy.userData = semanticLocator('LOD0_static_Glass_Canopy', ['fixture.mesh.canopy']);
  const turret = new THREE.Mesh(fixtureTriangleGeometry(), material);
  turret.name = 'LOD0_dynamic_Turret';
  turret.userData = semanticLocator('LOD0_dynamic_Turret', ['fixture.mesh.turret']);
  const collision = new THREE.Mesh(fixtureTriangleGeometry(), material);
  collision.name = 'COLLISION_HULL';
  collision.userData = {
    nonRender: true,
    ...semanticLocator('COLLISION_HULL', ['fixture.mesh.collision']),
  };
  const socketA = new THREE.Object3D();
  socketA.name = 'SOCKET_Trail_Main';
  socketA.userData = semanticLocator('SOCKET_Trail_Main', ['fixture.anchor.trail']);
  const socketB = new THREE.Object3D();
  socketB.name = 'SOCKET_Utility_Dorsal';
  socketB.userData = semanticLocator('SOCKET_Utility_Dorsal', ['fixture.anchor.utility']);

  root.add(hull, accent, canopy, turret, collision, socketA, socketB);
  return { scene: root, geometry: null, material, canopyMaterial };
}

async function buildFixtureMetadata() {
  const nodeRecord = (id, nodeName, nodePath, role, extra = {}) => ({
    id,
    nodeName,
    nodePath,
    role,
    parentId: 'fixture.root',
    localTransform: [...FIXTURE_IDENTITY],
    worldTransform: [...FIXTURE_IDENTITY],
    materialPipelineKey: 'opaque:front',
    spatialClusterId: 'fixture.body',
    mergeBoundary: nodeName,
    ...extra,
  });
  const metadata = {
    schema: RENDER_PACKAGE_SCHEMA,
    assetId: FIXTURE_PILOT.assetId,
    kind: 'place',
    compiler: { name: 'spaceface-render-package-compiler', version: '1.0.0' },
    contentHash: '0'.repeat(64),
    render: { uri: 'render.glb', sha256: '1'.repeat(64), bytes: 128 },
    provenance: {
      sourceGlb: { uri: 'place_causal_fixture.glb', sha256: '2'.repeat(64), bytes: 256 },
      sourceManifest: null,
      semantics: { sha256: '3'.repeat(64) },
    },
    nodes: [
      {
        id: 'fixture.root',
        nodeName: 'CausalFixtureRoot',
        nodePath: [0],
        role: 'immutable',
        parentId: null,
        localTransform: [...FIXTURE_IDENTITY],
        worldTransform: [...FIXTURE_IDENTITY],
        materialPipelineKey: 'root',
        spatialClusterId: 'fixture.body',
        mergeBoundary: 'asset-root',
      },
      nodeRecord('fixture.mesh.hull', 'LOD0_static_Hull', [0, 0], 'immutable'),
      nodeRecord('fixture.mesh.accent', 'LOD0_static_Accent', [0, 1], 'immutable'),
      nodeRecord('fixture.mesh.canopy', 'LOD0_static_Glass_Canopy', [0, 2], 'immutable'),
      nodeRecord('fixture.mesh.turret', 'LOD0_dynamic_Turret', [0, 3], 'dynamic'),
      nodeRecord('fixture.mesh.collision', 'COLLISION_HULL', [0, 4], 'immutable', {
        materialPipelineKey: 'non-render',
      }),
    ],
    anchors: [
      {
        id: 'fixture.anchor.trail',
        nodeName: 'SOCKET_Trail_Main',
        nodePath: [0, 5],
        kind: 'trail',
        parentNodeId: 'fixture.root',
        localTransform: [...FIXTURE_IDENTITY],
        worldTransform: [...FIXTURE_IDENTITY],
      },
      {
        id: 'fixture.anchor.utility',
        nodeName: 'SOCKET_Utility_Dorsal',
        nodePath: [0, 6],
        kind: 'socket',
        parentNodeId: 'fixture.root',
        localTransform: [...FIXTURE_IDENTITY],
        worldTransform: [...FIXTURE_IDENTITY],
      },
    ],
    dynamicGroups: [{
      id: 'fixture.turret.group',
      nodeId: 'fixture.mesh.turret',
      kind: 'moving-part',
    }],
    geometry: [],
    materials: [],
    lods: [],
    hlods: [],
    collisions: [{
      id: 'fixture.collision',
      nodeId: 'fixture.mesh.collision',
      reference: 'COLLISION_HULL',
    }],
    spatialClusters: [{
      id: 'fixture.body',
      nodeIds: [
        'fixture.root',
        'fixture.mesh.hull',
        'fixture.mesh.accent',
        'fixture.mesh.canopy',
        'fixture.mesh.turret',
        'fixture.mesh.collision',
      ],
      bounds: null,
    }],
  };
  metadata.contentHash = await computeRenderPackageContentHash(metadata);
  return metadata;
}

/** One loader per scenario run so decode counts are attributable to the run. */
function createFixturePackageLoader(tier1, rendererStateOwner) {
  return createRenderPackageLoader({
    counters: tier1,
    loadGlb: async () => buildFixtureTemplate(),
    prepareDecoded(decoded, packageMetadata, renderUrl, plan) {
      return prepareRenderPackageBlueprint(FIXTURE_PILOT, decoded, packageMetadata, {
        renderer: rendererStateOwner,
        plan,
      });
    },
  });
}

/**
 * buildAuthoredPlaceProp returns null for a place id that has no authored prop. Silently admitting
 * null would surface later as "cannot read properties of null (reading 'children')" from inside the
 * upgrade path, which reads like a partsLibrary bug. Fail here, naming the place.
 */
function requireAuthoredPlaceProp(entity) {
  const boundary = buildAuthoredPlaceProp(entity, { releaseMode: true });
  if (!boundary) {
    throw new Error(
      `causal harness: place "${entity.data.placeId}" has no authored place prop; pick a place id `
      + 'that buildAuthoredPlaceProp resolves',
    );
  }
  return boundary;
}

function fixturePlaceEntity(sim, placeId, index) {
  return sim.spawn({
    type: 'fx',
    pos: { x: 40 + index * 30, y: 0, z: -60 - index * 25 },
    radius: 12,
    collides: false,
    data: { placeId, placeScale: 1 },
  });
}

// -------------------------------------------------------------------------------------------------
// Runner.
// -------------------------------------------------------------------------------------------------
export async function runPerfCausalScenario(scenarioId, options = {}) {
  const scenario = PERF_CAUSAL_SCENARIOS.find((entry) => entry.id === scenarioId);
  if (!scenario) throw new Error(`Unknown causal scenario: ${scenarioId}`);
  const log = options.log || null;

  return withSeededAmbientRandom(scenario.seed, () => runScenarioInner(scenario, log));
}

async function runScenarioInner(scenario, log) {
    const systems = scenario.tactical
      ? [
          scenarioRuntime,
          presentationOrchestrator,
          presentationAdapters,
          createTacticalAISystem(),
          aiEncounter,
          actions,
          flightV3,
          aiPorts,
          weapons,
          physics,
          combat,
          cargo,
          economy,
          missions,
          story,
          save,
        ]
      : [
          scenarioRuntime,
          presentationOrchestrator,
          presentationAdapters,
          actions,
          flightV3,
          weapons,
          physics,
          combat,
          cargo,
          economy,
          missions,
          story,
          save,
        ];

    const sim = createSimulation({ seed: scenario.seed, systems });
    const { state, bus } = sim;
    state.settings.gameplay.physicsBackend = 'rapier-dynamic';
    state.settings.gameplay.flightBackend = 'v3';
    state.mode = 'flight';
    state.world.currentSectorId = 'sector_helios_prime';

    // The real VFX system, forked like any sim host system and given a headless scene: canvas
    // texture factories degrade to blank THREE.Texture instances without a DOM (see vfx.js).
    let vfxInstance = null;
    if (scenario.vfx) {
      state.render.scene = new THREE.Scene();
      vfxInstance = Object.create(vfx);
      vfxInstance.init({ state, bus, helpers: sim.helpers, registry: sim.registry });
    }

    // Player ship on the live default controller, matching sf-sim's spawn shape.
    const player = sim.spawn(makeShipEntitySpec(NEW_GAME.shipId, {
      team: 0,
      factionId: 'faction_free',
      isPlayer: true,
      player: state.player,
      fittings: fittingsFromDefaultModules(NEW_GAME.shipId, NEW_GAME.fittedModules || []),
      pos: { x: 0, z: 0 },
      rot: 0,
    }));
    state.playerId = player.id;

    for (const hostile of scenario.hostiles || []) {
      sim.spawn(makeShipEntitySpec(HOSTILE_SHIP_ID, {
        team: 1,
        factionId: 'faction_reavers',
        pos: { x: hostile.x, z: hostile.z },
        rot: hostile.rot,
        ai: { role: 'target_dummy' },
      }));
    }
    if (Number.isSafeInteger(scenario.asteroidCount)) {
      const count = scenario.asteroidCount;
      for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2;
        const ring = 160 + (i % 5) * 45;
        sim.spawn({
          type: 'asteroid',
          pos: { x: Math.cos(angle) * ring, y: 0, z: Math.sin(angle) * ring },
          radius: 8 + (i % 4) * 3,
          mass: 200,
          hull: 40,
          hullMax: 40,
          collides: true,
          data: { typeId: 'ast_metallic', size: 8 },
        });
      }
    }
    if (scenario.station) {
      sim.spawn({
        type: 'station',
        pos: { x: scenario.station.x, y: 0, z: scenario.station.z },
        radius: 72,
        mass: 1e6,
        collides: true,
        data: { stationId: 'station_causal', dockRadius: 120 },
      });
    }

    const econ = sim.registry.get('economy');
    if (econ && typeof econ.newGame === 'function') econ.newGame();
    bus.emit('game:started', { source: 'perf-causal', scenario: scenario.id });
    const physicsSystem = sim.registry.get('physics');
    const physicsReady = await physicsSystem.prepareBackend(state);
    if (!physicsReady) throw new Error(`causal scenario ${scenario.id}: rapier-dynamic backend not ready`);

    // Tier-1 counters: enabled before the first frame so the boot ramp is captured (the positive
    // control that keeps a post-boot zero from being vacuous).
    const tier1 = ensurePerfRuntime(state).tier1;
    tier1.setEnabled(true);

    // Package admission machinery is only constructed for scenarios that use it.
    const wantsPackages = !!(scenario.packageAdmissions || scenario.admissionBurst);
    const packageLoader = wantsPackages ? createFixturePackageLoader(tier1, { state }) : null;
    const packageMetadata = wantsPackages ? await buildFixtureMetadata() : null;
    const packageScene = wantsPackages ? new THREE.Scene() : null;
    const fixtureRenderer = wantsPackages ? { state } : null;
    const loadedPackage = wantsPackages
      ? await packageLoader.load(packageMetadata, { baseUrl: 'https://fixtures.causal/' })
      : null;
    const packageRecord = wantsPackages
      ? assembleRenderPackageRecord(loadedPackage, FIXTURE_PILOT.sourceUrl)
      : null;
    // The rAF pump backs globalThis.requestAnimationFrame for every scenario, package-using or
    // not: the global must have the same shape in all runs so a scenario cannot accidentally
    // inherit the host's real rAF (or a previous scenario's stub) and change its counts.
    const rafPump = createSyntheticFramePump(5000);
    const admissionRuntime = wantsPackages
      ? {
          boundaries: [],
          placeFile: 'places/place_debris_chunk.glb',
          pump: rafPump,
        }
      : null;

    const presentationPump = createSyntheticFramePump(1000);
    const registryFacade = {
      systems: sim.registry.systems,
      ctx: sim.registry.ctx,
      runtimeManifest: sim.registry.runtimeManifest || null,
      get(name) { return sim.registry.get(name); },
      step(dt, tickBoundary) {
        applyScenarioInput(state, scenario.inputForTick(state.tick));
        sim.registry.step(dt);
        if (tickBoundary && typeof tickBoundary.publishInputCommand === 'function') {
          tickBoundary.publishInputCommand(state.input, state.tick);
        }
      },
      renderUpdate(alpha, frameDt) {
        if (vfxInstance) vfxInstance.update(frameDt);
        return true;
      },
    };

    const controller = startLoop(state, registryFacade, {
      requestFrame: presentationPump.requestFrame,
      cancelFrame: presentationPump.cancelFrame,
      nowMs: presentationPump.nowMs,
      visibilityTarget: null,
      lifecyclePort: null,
    });

    const restoreGlobals = installHarnessGlobals(state, rafPump);

    const runFrameHooks = async (frameIndex) => {
      if (frameIndex === scenario.bootBoundaryFrame) tier1.markBootBoundary();
      if (!wantsPackages) return;

      if (scenario.packageAdmissions) {
        for (const admission of scenario.packageAdmissions) {
          if (admission.frame !== frameIndex) continue;
          const entity = fixturePlaceEntity(sim, admission.placeId, 0);
          const boundary = requireAuthoredPlaceProp(entity);
          packageScene.add(boundary);
          await upgradeAuthoredPlaceBoundaryForProbe(
            boundary,
            boundary.children[0],
            entity,
            admissionRuntime.placeFile,
            fixtureRenderer,
            packageScene,
            { releaseMode: true, loadAuthoredPart: async () => packageRecord },
          );
          admissionRuntime.boundaries.push(boundary);
        }
      }

      if (scenario.admissionBurst && frameIndex === scenario.admissionBurst.frame) {
        scenario.admissionBurst.placeIds.forEach((placeId, index) => {
          const entity = fixturePlaceEntity(sim, placeId, index);
          const boundary = requireAuthoredPlaceProp(entity);
          packageScene.add(boundary);
          admissionRuntime.boundaries.push(boundary);
          enqueueBoundaryUpgrade(packageScene, {
            boundary,
            fallbackRoot: boundary.children[0],
            entity,
            renderer: fixtureRenderer,
            scene: packageScene,
            options: { releaseMode: true },
            setActive(next) { boundary.userData.hull = next; },
            run: () => upgradeAuthoredPlaceBoundaryForProbe(
              boundary,
              boundary.children[0],
              entity,
              admissionRuntime.placeFile,
              fixtureRenderer,
              packageScene,
              { releaseMode: true, loadAuthoredPart: async () => packageRecord },
            ),
          });
        });
      }

      // One admission callback per frame: the queue's real cadence under the synthetic pump.
      admissionRuntime.pump.pumpOne();

      if (Number.isSafeInteger(scenario.sectorTransitionFrame)
        && frameIndex === scenario.sectorTransitionFrame) {
        state.world.currentSectorId = 'sector_causal_beta';
        // Sector residency churn: release the package owner, then re-acquire it and admit a
        // boundary in the new sector.
        //
        // The re-acquire is mandatory, not decorative. A released package refuses createInstance
        // ("must be retained before creating an instance"), so reusing the pre-release record here
        // makes the admission fail and the scenario silently measures nothing for the behaviour it
        // is named after. Reload, then rebuild the record from the reacquired package.
        //
        // decode count is the assertion: the reload must hit the decoded-package cache, so
        // packageDecodes stays at 1 across the whole scenario even though residency churned.
        packageLoader.release(loadedPackage.contentHash, 'sector-transition');
        const reacquired = await packageLoader.load(packageMetadata, { baseUrl: 'https://fixtures.causal/' });
        const reacquiredRecord = assembleRenderPackageRecord(reacquired, FIXTURE_PILOT.sourceUrl);
        const entity = fixturePlaceEntity(sim, 'place_debris_chunk', 99);
        const boundary = requireAuthoredPlaceProp(entity);
        packageScene.add(boundary);
        await upgradeAuthoredPlaceBoundaryForProbe(
          boundary,
          boundary.children[0],
          entity,
          admissionRuntime.placeFile,
          fixtureRenderer,
          packageScene,
          { releaseMode: true, loadAuthoredPart: async () => reacquiredRecord },
        );
        admissionRuntime.boundaries.push(boundary);
      }
    };

    // Settle probe: recorded work units plus queued frame callbacks. Both move whenever an async
    // admission chain is still producing, and neither allocates.
    const settleProbe = () => tier1.recordedUnits()
      + presentationPump.pendingCount()
      + rafPump.pendingCount();

    let report;
    try {
      for (let frameIndex = 0; frameIndex < scenario.frames; frameIndex++) {
        const pumped = presentationPump.pumpOne();
        if (!pumped) throw new Error(`causal scenario ${scenario.id}: presentation pump stalled at frame ${frameIndex}`);
        await runFrameHooks(frameIndex);
        await drainMicrotasks(settleProbe, scenario.id, frameIndex);
      }

      const snapshot = tier1.snapshot();
      report = {
        schema: PERF_CAUSAL_SCENARIO_SCHEMA,
        scenarioId: scenario.id,
        seed: scenario.seed,
        frames: scenario.frames,
        ticks: state.tick,
        bootBoundaryFrame: snapshot.bootBoundaryFrame,
        framesObserved: snapshot.framesObserved,
        deterministic: causalDeterministicProjection(snapshot),
      };
    } finally {
      // Teardown must run even when a scenario throws: these globals are process-wide, and a
      // leaked window/rAF stub would silently change the NEXT scenario's counts.
      controller.destroy();
      if (packageLoader) packageLoader.dispose('causal-scenario-complete');
      sim.dispose();
      restoreGlobals();
    }

    if (log) log(`scenario ${scenario.id}: ${scenario.frames} frames, tick=${state.tick}`);
    return report;
}

// -------------------------------------------------------------------------------------------------
// The deterministic projection: exactly the fields two identical runs must agree on, byte-for-byte.
// GL/wall-clock-dependent families are excluded by construction (they are zero in this harness).
// -------------------------------------------------------------------------------------------------
export function causalDeterministicProjection(snapshot) {
  const pick = (bag) => {
    const out = {};
    for (const field of CAUSAL_COUNTER_FIELDS) out[field] = bag[field];
    return out;
  };
  return {
    totals: pick(snapshot.totals),
    postBoot: pick(snapshot.postBoot),
    peakPerFrame: pick(snapshot.peakPerFrame),
    nonZeroFrames: pick(snapshot.nonZeroFrames),
    causes: snapshot.causes,
    stepsPerFrameHistogram: snapshot.stepsPerFrameHistogram,
    events: snapshot.events,
    eventsDropped: snapshot.eventsDropped,
  };
}

export function canonicalCausalReport(report) {
  return stableJsonStringify(report.deterministic);
}

export function diffCausalReports(baseline, candidate) {
  const differences = [];
  const left = causalDeterministicProjection(baseline.deterministic || baseline);
  const right = causalDeterministicProjection(candidate.deterministic || candidate);
  const a = canonicalCausalReport({ deterministic: left });
  const b = canonicalCausalReport({ deterministic: right });
  if (a === b) return differences;
  const fields = new Set(CAUSAL_COUNTER_FIELDS);
  for (const field of fields) {
    if (left.totals[field] !== right.totals[field]) {
      differences.push({ field, left: left.totals[field], right: right.totals[field] });
    }
  }
  if (differences.length === 0) {
    differences.push({ field: '(structure)', left: 'see canonical reports', right: 'see canonical reports' });
  }
  return differences;
}

// Restore-globals plumbing (kept out of the runner's main flow for readability).
// eslint-disable-next-line no-unused-vars
function noopRestore() {}

async function main() {
  const args = process.argv.slice(2);
  const only = args.find((arg) => !arg.startsWith('--'));
  const twice = args.includes('--twice');
  const scenarios = only
    ? PERF_CAUSAL_SCENARIOS.filter((entry) => entry.id === only)
    : PERF_CAUSAL_SCENARIOS;
  if (scenarios.length === 0) {
    console.error(`unknown scenario: ${only}`);
    process.exitCode = 1;
    return;
  }
  for (const scenario of scenarios) {
    const report = await runPerfCausalScenario(scenario.id);
    if (twice) {
      const second = await runPerfCausalScenario(scenario.id);
      const diffs = diffCausalReports(report, second);
      if (diffs.length > 0) {
        console.error(`${scenario.id}: NONDETERMINISTIC ${JSON.stringify(diffs)}`);
        process.exitCode = 1;
        continue;
      }
      console.log(`${scenario.id}: deterministic (byte-identical across 2 runs)`);
    } else {
      console.log(JSON.stringify(report, null, 2));
    }
  }
}

if (process.argv[1] && process.argv[1].endsWith('perfCausalScenarios.mjs')) {
  main().catch((error) => {
    console.error(error?.stack || error);
    process.exitCode = 1;
  });
}
