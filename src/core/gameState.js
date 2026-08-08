// createGameState() — the single flat state tree (ARCHITECTURE §3). Every field has one
// owning system. Systems populate their own subtrees in init()/newGame(); here we provide
// safe empty defaults so any system can read any field at boot without hitting `undefined`.
import { mulberry32 } from './rng.js';
import { SpatialHash } from './spatialHash.js';
import { CURRENT_VERSION } from '../data/saveVersion.js';
import { AI_CONTRACT_VERSION } from '../ai/contracts.js';
import { AUDIO_DEFAULT_MUTE_VERSION } from './graphicsProfileBootstrap.js';

function defaultSettings() {
  return {
    uiScale: 1,
    showDamageNumbers: true,
    keybinds: {},
    audio: {
      master: 0.55,
      sfx: 0.7,
      music: 0.32,
      muted: true,
      defaultMuteVersion: AUDIO_DEFAULT_MUTE_VERSION,
    },
    // renderScale/shadows raised from 0.85/false after a matched A/B on the 60fps target hardware
    // (Intel iGPU, ANGLE/D3D11, 1920x1080, 20s warmup so authored admission had settled): baseline
    // p95 16.80ms max 17.20ms vs full-res+shadows p95 16.80ms max 17.00ms. Identical — the frame is
    // vsync-locked with headroom at 44-108 draw calls, so 85% resolution was quality given away for
    // perf that was never needed. Evidence: .devshots/gfx/ab2-a-base.json vs ab2-b-quality.json.
    video: { renderScale: 1.0, bloom: true, bloomStrength: 0.35, bloomThreshold: 1.0, vsync: true, fov: 50, particleQuality: 'medium', engineTrails: true, pixelRatioCap: 2, motionReduce: false, shadows: true, energyMaterials: true, renderGraph: false, dynamicResolution: false, chaseClose: false },
    gameplay: {
      autosaveIntervalS: 120,
      tutorialHints: true,
      difficulty: 'standard',
      physicsBackend: 'rapier-dynamic',
      aiBackend: 'sg06-tactical',
      flightBackend: 'v3',
      // Explicit runtime profile (Phase 2). Never inferred from host environment.
      runtimeProfile: 'production',
      controlScheme: 'pilot',
      controlSchemeV2: true,
      orbitAssistStrength: 'standard',
      masslineReleaseAssist: 'arm',
    },
    controls: {
      bindings: null,       // null = use input.js DEFAULT_BINDINGS; populated on first rebind
      masslineBindingProfile: 'space-v1', // new profiles: Space primary + persistent F alias
      flightMode: 'assisted',
      gamepad: { enabled: true, deadzone: 0.12, invertY: false },
    },
    // Accessibility (V2 §9/§12). motionReduce lives under video (feel/vfx read it there); uiScale is the
    // root field above. These are the net-new a11y fields driven by src/ui/accessibility.js.
    accessibility: {
      colorblindMode: 'none', highContrast: false, flashReduce: false, dyslexiaFont: false,
      motionPreference: 'system', captions: true, captionSize: 'medium', captionBackground: true,
    },
  };
}

function defaultPlayer() {
  return {
    credits: 0, debt: 0, bounty: 0,
    // WANTED heat (V2 §20b / cut-list #15): 0..1 scalar that rises with piracy/contraband/unprovoked
    // attacks and decays slowly over clean time. Drives bounty-hunter spawn pressure + the lawful
    // "playerWanted" AI flag so patrol_lawman enemies actually hunt a criminal player. Decoupled
    // from per-faction aggro so "the law is after me" is one legible number, not eight.
    heat: 0,
    heatZone: { active: false, center: { x: 0, z: 0 }, radius: 0, level: 0, outsideS: 0, clearAfterS: 0 },
    ownedShips: [], activeShipIndex: 0,
    moduleInventory: [], researchedNodes: [],
    droneTierCap: 1,
    efficiencyMods: { miningYieldMult: 1, shieldRegenMult: 1, energyRegenMult: 1, cargoCapMult: 1, tradeFeeMult: 1 },
    researchPoints: 0,
    cargo: { items: {}, usedVolume: 0, usedMass: 0, capVolume: 40, capMass: 60 },
    targetId: null,
    fireGroups: { 1: [], 2: [] },
    boostActive: false,
    insurance: { rate: 0.6, deductibleCr: 500, insuredModules: false, lastStationId: null },
    magnetRange: 250,
    miningBeam: { tierId: 'beam_mk1', range: 220, dps: 18, directToCargo: true },
    stats: { lifetimeProfit: 0, tradesCount: 0, biggestSingleProfit: 0, smuggledValue: 0, kills: 0, missionsDone: 0, totalPassiveEarnedLifetime: 0 },
    // Contextual first-time hints (onboarding.js). Each flag starts false and flips to true once
    // the hint has been shown; persisted across saves so returning players aren't re-taught.
    hints: { firstFlight: false, firstCombat: false, firstShieldDrop: false, firstStation: false, firstGate: false, firstCargoFull: false },
    // PQ-011 anchor Mass Seed: the deploy cooldown (simTime seconds). Persisted so save/Continue
    // cannot launder it; the seed ENTITY itself is temporary and never serializes (normalize-away
    // policy in src/systems/massSeed.js). Old saves merge over this default (0 = ready).
    massSeed: { cooldownUntil: 0 },
  };
}

function defaultAutomation() {
  return {
    drones: [], traders: [], outposts: [], fleet: [],
    fleetCap: 0,
    balance: { activeRefByTier: [250, 600, 1400, 3200, 7000], passiveCapFrac: 0.45, overflowEff: 0.25, offlineEff: 0.6, offlineCapSec: 14400, distressGraceSec: 120 },
    accumulators: { creditBuffer: 0, upkeepDebt: 0 },
    meta: { lastTickTime: 0, totalPassiveEarnedLifetime: 0, lostAssetsLog: [], rngSeed: 0 },
  };
}

export function createGameState(seed) {
  seed = (seed >>> 0) || 1;
  return {
    meta: { version: CURRENT_VERSION, seed, playtimeS: 0, createdAt: '', lastSavedAt: '' },
    settings: defaultSettings(),
    mode: 'menu',          // 'menu' | 'flight' | 'paused'
    timeScale: 1,          // transient derived scalar; only core/timeEffects.js mutates after init

    // --- core sim runtime ---
    entities: new Map(),
    entityList: [],
    nextEntityId: 1,
    freeIds: [],
    playerId: 0,
    spatialHash: new SpatialHash(64),
    accumulator: 0,
    simTime: 0,
    tick: 0,
    days: 0,
    rng: mulberry32(seed),
    input: { moveX: 0, moveZ: 0, turnIntent: 0, boost: false, brake: false, fire: false, fireGroup: null, autoFire: false, deployCountermeasure: false, aimWorld: { x: 0, z: 0 }, aimAngle: 0, mouseNdc: { x: 0, y: 0 }, pointerScreen: { x: 0, y: 0, active: false }, autoTargetVector: { active: false, screenX: 0, screenY: 0, worldX: 0, worldZ: 0, magnitude: 0 }, autoTargetPath: { active: false, drawing: false, cursorX: 0, cursorY: 0, pointIndex: 1, points: [] } },
    flight: { mode: 'manual', previousMode: 'manual', modeReason: 'boot', modeChangedTick: 0 },
    camera: { obj: null, tilt: 60, zoom: 144, trauma: 0, shakeOffset: null, focus: null, lerp: 6.0, lookAhead: 26 },
    bounds: { radius: 2600, hardRadius: 3000, center: { x: 0, z: 0 } },

    // --- meta records ---
    player: defaultPlayer(),

    // --- subsystem trees (owners populate) ---
    combat: { beams: [], threatTables: new Map() },
    economy: { markets: {}, econEvents: [], econClock: { accumulator: 0, lastTickT: 0, ticksElapsed: 0 }, marketIntel: {} },
    factions: {},
    conflicts: {},
    missions: { boards: {}, active: [], completedLog: [], receipts: [], nextId: 1, config: null },
    careers: { origins: {} },
    scenario: {
      schemaVersion: 1,
      active: null,
      facts: {},
      actorBindings: {},
      unresolvedActorIds: [],
      enteredBeatIds: [],
    },
    // story: beatIndex/branch/flags/chainProgress are owned by missions.js; the narrative overlay
    // fields (phase/seenComms/ambientQueue/graffiti/endgame) are owned by story.js. Both systems
    // co-own state.story; safe empty defaults here so either can read at boot (§3).
    story: { beatIndex: 0, branch: null, flags: {}, chainProgress: 0,
             phase: 1, seenComms: {}, ambientQueue: [], ambientTimerS: 0, graffitiShown: {},
             endgameChoice: null, endgameOffered: false, endgameDeclined: [], persistentCargo: [] },
    crafting: { queues: {} },
    aiEncounter: { schemaVersion: AI_CONTRACT_VERSION, nextSeq: 1, commands: [] },
    world: {
      sectors: {}, currentSectorId: null,
      activeSector: { stations: [], fields: [], hazards: [], pois: [], gates: [] },
      discovery: {}, scanPings: {}, frontierRumors: { schemaVersion: 1, byId: {}, receipts: [] },
      entryPoint: { x: 0, z: 0, heading: 0 },
      coordinateSchema: 'global_v1', frameOrigin: { x: 0, z: 0 }, frameOriginSeq: 0,
    },
    jump: { state: 'IDLE', targetSectorId: null, via: null, chargeT: 0, chargeNeeded: 0, cooldownT: 0 },
    fuel: { current: 100, max: 100 },
    nav: { route: null, autoTravel: false, waypoint: null, autopilot: { active: false, target: null, targetEntityId: null, label: '', arrivalRadius: 36, status: 'idle' } },
    automation: defaultAutomation(),
    // Offscreen statistical simulation (ADR-0002 / V2 §33). Owned solely by systems/sectorSim.js.
    // `sectors[id] = { drift:{security,enemyDensity}|null, lastEnterSimT, lastDay }` is the per-sector
    // drift overlay + away-clock; `meta` carries the seeded-RNG continuation seed + offline baseline.
    sectorSim: { sectors: {}, meta: { rngSeed: 0, lastTickSimT: 0, lastWallT: 0, lossLog: [] } },
    // PQ-014/SF-15/W06 - live NPC job runtime. Owned SOLELY by systems/npcJobsRuntime.js, which
    // drives the pure src/systems/npcJobs.js kernel. `byId[jobId] = { job, kind, sectorId,
    // worldRecordId, entityId, lastAdvanceSimT }`: the kernel record plus the runtime-only sidecar
    // meta the kernel does not carry (restoreJob reconstructs only kernel fields). Empty bag = no
    // live jobs; the whole feature is a strict no-op when no producer has assigned one.
    npcJobs: { byId: {} },
    interventions: [],
    interventionMeta: { rngSeed: 0 },
    drill: null,
    claims: { bodies: [] },
    traffic: { freighters: [] },
    ui: {
      screenStack: [], docked: false, activeStationTab: 'market', radarRange: 4000, toasts: [], alerts: [],
      trackedMissionId: null, starmapView: { cx: 0, cy: 0, zoom: 1 },
      // One-shot map-authority open payload (mapAuthority.js → galaxyMap.onShow). Not gameplay-critical;
      // cleared on consume. Defaults null so saves without the field hydrate cleanly.
      mapOpenIntent: null,
    },

    // --- static catalogs (filled from src/data/* at boot; NOT serialized) ---
    content: {},

    // --- transient runtime (NEVER serialized) ---
    render: {}, vfx: {}, audioRuntime: {}, perfRuntime: null,
    save: { lastAutosaveAt: 0, dirty: false, currentSlot: null },
  };
}
