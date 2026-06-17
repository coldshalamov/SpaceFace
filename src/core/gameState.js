// createGameState() — the single flat state tree (ARCHITECTURE §3). Every field has one
// owning system. Systems populate their own subtrees in init()/newGame(); here we provide
// safe empty defaults so any system can read any field at boot without hitting `undefined`.
import { mulberry32 } from './rng.js';
import { SpatialHash } from './spatialHash.js';
import { CURRENT_VERSION } from '../data/saveVersion.js';

function defaultSettings() {
  return {
    uiScale: 1,
    showDamageNumbers: true,
    keybinds: {},
    audio: { master: 0.55, sfx: 0.7, music: 0.32, muted: false },
    video: { renderScale: 1, bloom: true, bloomStrength: 0.9, bloomThreshold: 0.65, vsync: true, fov: 50, particleQuality: 'high', pixelRatioCap: 2 },
    gameplay: { autosaveIntervalS: 120, tutorialHints: true, difficulty: 'standard' },
  };
}

function defaultPlayer() {
  return {
    credits: 0, debt: 0, bounty: 0,
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
    magnetRange: 90,
    miningBeam: { tierId: 'beam_mk1', range: 220, dps: 18, heat: 0, heatRate: 0, coolRate: 0, overheated: false, directToCargo: true },
    stats: { lifetimeProfit: 0, tradesCount: 0, biggestSingleProfit: 0, smuggledValue: 0, kills: 0, missionsDone: 0, totalPassiveEarnedLifetime: 0 },
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
    timeScale: 1,          // 0 = paused (sim frozen), 1 = normal, >1 fast-forward

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
    input: { moveX: 0, moveZ: 0, turnIntent: 0, boost: false, fire: false, fireGroup: null, autoFire: false, aimWorld: { x: 0, z: 0 }, aimAngle: 0, mouseNdc: { x: 0, y: 0 } },
    camera: { obj: null, tilt: 60, zoom: 70, trauma: 0, shakeOffset: null, focus: null, lerp: 6.0, lookAhead: 18 },
    bounds: { radius: 2600, hardRadius: 3000, center: { x: 0, z: 0 } },

    // --- meta records ---
    player: defaultPlayer(),

    // --- subsystem trees (owners populate) ---
    combat: { beams: [], threatTables: new Map() },
    economy: { markets: {}, econEvents: [], econClock: { accumulator: 0, lastTickT: 0, ticksElapsed: 0 }, marketIntel: {} },
    factions: {},
    conflicts: {},
    missions: { boards: {}, active: [], completedLog: [], nextId: 1, config: null },
    story: { beatIndex: 0, branch: null, flags: {}, chainProgress: 0 },
    world: { sectors: {}, currentSectorId: null, activeSector: { stations: [], fields: [], hazards: [], pois: [], gates: [] }, discovery: {}, entryPoint: { x: 0, z: 0, heading: 0 } },
    jump: { state: 'IDLE', targetSectorId: null, via: null, chargeT: 0, chargeNeeded: 0, cooldownT: 0 },
    fuel: { current: 100, max: 100 },
    nav: { route: null, autoTravel: false },
    automation: defaultAutomation(),
    ui: { screenStack: [], docked: false, activeStationTab: 'market', radarRange: 4000, toasts: [], alerts: [], trackedMissionId: null, starmapView: { cx: 0, cy: 0, zoom: 1 } },

    // --- static catalogs (filled from src/data/* at boot; NOT serialized) ---
    content: {},

    // --- transient runtime (NEVER serialized) ---
    render: {}, vfx: {}, audioRuntime: {},
    save: { lastAutosaveAt: 0, dirty: false, currentSlot: null },
  };
}
