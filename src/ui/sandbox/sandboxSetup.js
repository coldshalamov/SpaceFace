// src/ui/sandbox/sandboxSetup.js – the "do the thing" logic for the Sandbox testing screen.
//
// DESIGN INTENT (see plan + root AGENTS.md §6 single-writer contract):
//   The sandbox never pokes raw state. It boots the REAL new-game pipeline (game:new), then on
//   game:started drives every change through the canonical system writers: economy.grantCredits,
//   ships.grantModule / ships.fitModule / ships.unlockTech, factions.applyRep, world.enterSector,
//   helpers.spawnEntity, drill.begin. That keeps derived stats, single-writer ownership, and event
//   listeners consistent — so the feature you're testing is the feature that ships.
//
// Flow:
//   1. requestSandboxGame(bus, config) stashes the config, then emits game:new with only a validated
//      own uint32 seed when present; startNewGame builds the real NEW_GAME world before setup.
//   2. installSandboxGameStartedHook(bus, ctx) arms a one-shot game:started listener that reads the
//      stashed config and calls applySandboxSetup. It re-arms itself after each run so the harness
//      survives multiple launches in one session.
//   3. applySandboxSetup(ctx, config) runs the writers in dependency-safe order.

import { WEAPONS } from '../../data/weapons.js';
import { MODULES } from '../../data/modules.js';
import { TECH_NODES } from '../../data/tech.js';
import { SHIPS } from '../../data/ships.js';
import { FACTION_META } from '../../data/factions.js';
import { SECTOR_ZONES } from '../../data/sectorZones.js';
import {
  CERES_ACTIVITY_POCKETS_BY_ID,
  CERES_REFERENCE_ACCEPTANCE_ENTRY,
} from '../../data/sectorActivityPockets.js';
import { ZONE_TETHYS_ANVIL } from '../../data/authoredPlaces.js';
import { PQ019_FACILITIES, PQ019_HEIST_SECTOR_ID } from '../../data/heistFacilities.js';
import { sectorLocalToGlobalForSector } from '../../data/sectorCoordinates.js';
import { makeEnemySpawnSpec } from '../../systems/combat.js';
import { buildSlotList, makeShipEntitySpec } from '../../systems/ships.js';
import { getCombatKernel } from '../../combat/kernel.js';

// Module-scoped staging so the launch button (pure UI) and the game:started hook (pure logic)
// don't need a shared object threaded through ctx. One pending config at a time.
let pendingConfig = null;
let hookInstalled = false;

export const RECOVERY_SCENARIO_IDS = Object.freeze([
  'massline_long_line',
  'massline_short_line',
  'massline_moving_anchor',
  'physics_swarm',
  'ceres_reference_pocket',
  'planet_sling_course',
  'crime_interception',
  'visual_stress_scene',
]);

// R0 exposes the candidates; R1 uses repeatable live play to select the shipping framing. These
// values intentionally use the existing camera controller's public setZoom seam, so the Sandbox
// does not grow a second camera implementation.
export const SANDBOX_CAMERA_CANDIDATES = Object.freeze([
  Object.freeze({ id: 'current', label: 'Current framing (72 WU)', zoom: 72 }),
  Object.freeze({ id: 'medium_wide', label: 'Medium-wide (96 WU)', zoom: 96 }),
  Object.freeze({ id: 'wide_gameplay', label: 'Wide gameplay (120 WU)', zoom: 120 }),
  Object.freeze({ id: 'physics_study', label: 'Physics-speed study (144 WU)', zoom: 144 }),
]);

export const SANDBOX_PHYSICS_LOADOUTS = Object.freeze([
  Object.freeze({ id: 'starter', label: 'Current ship loadout', itemIds: Object.freeze([]) }),
  Object.freeze({
    id: 'impulse',
    label: 'Autocannon + Concussion',
    itemIds: Object.freeze(['wpn_autocannon_m', 'wpn_concussion_cannon_m']),
  }),
  Object.freeze({
    id: 'physics_toolkit',
    label: 'Concussion + force tools',
    itemIds: Object.freeze(['wpn_concussion_cannon_m', 'wpn_gravity_marker_s', 'wpn_momentum_sink_s']),
  }),
]);

const ceresAcceptancePocket = CERES_ACTIVITY_POCKETS_BY_ID[
  CERES_REFERENCE_ACCEPTANCE_ENTRY.pocketId
];
if (!ceresAcceptancePocket?.activityAnchor?.zoneId) {
  throw new Error('Ceres acceptance entry requires a canonical activity-anchor zone');
}

/** Merge optional human-test controls into a preset without mutating the frozen preset record. */
export function buildSandboxLaunchConfig(baseConfig = {}, overrides = {}) {
  const out = { ...baseConfig };
  if (overrides.cameraCandidate) out.cameraCandidate = String(overrides.cameraCandidate);
  if (overrides.physicsLoadout) out.physicsLoadout = String(overrides.physicsLoadout);

  if (Number.isFinite(overrides.enemyCount)) {
    const count = Math.max(0, Math.min(20, Math.trunc(overrides.enemyCount)));
    if (out.physicsSwarm) {
      const authoredMediumCount = Math.max(
        0,
        Math.min(4, Math.trunc(out.physicsSwarm.mediumCount ?? 2)),
      );
      const mediumCount = Math.min(count, authoredMediumCount);
      out.physicsSwarm = {
        ...out.physicsSwarm,
        lightCount: count - mediumCount,
        mediumCount,
      };
    } else {
      out.spawnEnemies = count > 0
        ? [{ type: 'wasp_swarmer', count, distance: 260 }]
        : undefined;
    }
  }

  if (out.masslineRange || overrides.masslineEnabled) {
    out.masslineRange = {
      ...(out.masslineRange || {}),
      ...(Number.isFinite(overrides.lineLength)
        ? { distance: Math.max(60, Math.min(600, overrides.lineLength)) }
        : {}),
      ...(Number.isFinite(overrides.anchorMass)
        ? { mass: Math.max(1, Math.min(1_000_000, overrides.anchorMass)) }
        : {}),
    };
  }
  return out;
}

/** Display names + config for each quick-setup card on the Sandbox screen. */
export const SCENARIO_PRESETS = Object.freeze([
  {
    id: 'drill',
    title: 'Drill Test',
    description: 'Spawn beside an asteroid and open the deep-drill minigame.',
    config: Object.freeze({
      unlockAllTech: true,
      grantAllModules: true,
      drillOnStart: true,
    }),
  },
  {
    id: 'arsenal',
    title: 'Full Arsenal',
    description: 'Every weapon and module, full tech tree, 500k credits, best gun auto-equipped.',
    config: Object.freeze({
      credits: 500_000,
      unlockAllTech: true,
      grantAllModules: true,
      autoEquipBestWeapon: true,
    }),
  },
  {
    id: 'combat',
    title: 'Combat Range',
    description: 'A solid loadout with a flight of hostile swarmers inbound.',
    config: Object.freeze({
      credits: 50_000,
      unlockAllTech: true,
      grantAllModules: true,
      autoEquipBestWeapon: true,
      spawnEnemies: Object.freeze([{ type: 'wasp_swarmer', count: 3, distance: 420 }]),
    }),
  },
  {
    id: 'freeplay',
    title: 'Free Play',
    description: 'Max credits, full tech, all factions friendly. Pick ship and sector below.',
    config: Object.freeze({
      credits: 500_000,
      unlockAllTech: true,
      grantAllModules: true,
      maxReputation: true,
    }),
  },
  {
    id: 'massline_long_line',
    title: 'Massline — Long Line',
    description: 'Start latched to a distant heavy anchor. Check forward+turn yaw at a long radius.',
    config: Object.freeze({
      scenarioId: 'massline_long_line',
      unlockAllTech: true,
      masslineRange: Object.freeze({ distance: 220, mass: 1800, preAttach: true }),
      cameraCandidate: 'wide_gameplay',
    }),
  },
  {
    id: 'massline_short_line',
    title: 'Massline — Short Line',
    description: 'Start latched close to a heavy anchor. Check fast swing yaw and raw-control release.',
    config: Object.freeze({
      scenarioId: 'massline_short_line',
      unlockAllTech: true,
      masslineRange: Object.freeze({ distance: 72, mass: 1800, preAttach: true }),
      cameraCandidate: 'medium_wide',
    }),
  },
  {
    id: 'massline_moving_anchor',
    title: 'Massline — Moving Target',
    description: 'A crossing neutral target tests preview, natural acquisition and moving-body latch.',
    config: Object.freeze({
      scenarioId: 'massline_moving_anchor',
      unlockAllTech: true,
      masslineRange: Object.freeze({ distance: 170, mass: 260, movingTarget: true, preAttach: false }),
      cameraCandidate: 'wide_gameplay',
    }),
  },
  {
    id: 'physics_swarm',
    title: 'Physics Combat Swarm',
    description: 'Ten disposable lights, two mediums and three collision anchors for force-first combat.',
    config: Object.freeze({
      scenarioId: 'physics_swarm',
      shipId: 'ship_hornet',
      credits: 100_000,
      unlockAllTech: true,
      grantAllModules: true,
      physicsLoadout: 'physics_toolkit',
      physicsSwarm: Object.freeze({ lightCount: 10, mediumCount: 2, anchorCount: 3 }),
      cameraCandidate: 'wide_gameplay',
    }),
  },
  {
    id: 'ceres_reference_pocket',
    title: 'Ceres Reference Pocket',
    description: 'Launch beside the refinery working pocket on the real Ceres route and systems.',
    config: Object.freeze({
      scenarioId: 'ceres_reference_pocket',
      sectorId: CERES_REFERENCE_ACCEPTANCE_ENTRY.sectorId,
      spawnAtZoneId: ceresAcceptancePocket.activityAnchor.zoneId,
      spawnAtZoneOffset: CERES_REFERENCE_ACCEPTANCE_ENTRY.entryOffset,
      shipId: CERES_REFERENCE_ACCEPTANCE_ENTRY.shipId,
      seed: CERES_REFERENCE_ACCEPTANCE_ENTRY.fixedSeed,
      unlockAllTech: true,
      physicsLoadout: CERES_REFERENCE_ACCEPTANCE_ENTRY.loadoutId,
      cameraCandidate: 'physics_study',
    }),
  },
  {
    id: 'planet_sling_course',
    title: 'Planet Sling Course',
    description: 'Start off The Anvil with two physical route anchors and the normal Massline controls.',
    config: Object.freeze({
      scenarioId: 'planet_sling_course',
      sectorId: 'sector_tethys_junction',
      planetSlingCourse: Object.freeze({ anchorCount: 2 }),
      cameraCandidate: 'physics_study',
    }),
  },
  {
    id: 'crime_interception',
    title: 'Crime Interception',
    description: 'Stage near the real Tethys launcher before a physical cargo capsule departs.',
    config: Object.freeze({
      scenarioId: 'crime_interception',
      sectorId: PQ019_HEIST_SECTOR_ID,
      crimeInterception: Object.freeze({ launchDelayS: 8 }),
      cameraCandidate: 'wide_gameplay',
    }),
  },
  {
    id: 'visual_stress_scene',
    title: 'Visual Stress Scene',
    description: 'A dense mixed combat cast, inert targets and terrain for ordinary-scale VFX review.',
    config: Object.freeze({
      scenarioId: 'visual_stress_scene',
      shipId: 'ship_hornet',
      credits: 100_000,
      unlockAllTech: true,
      grantAllModules: true,
      physicsLoadout: 'physics_toolkit',
      physicsSwarm: Object.freeze({ lightCount: 12, mediumCount: 2, anchorCount: 3 }),
      targetDrones: Object.freeze({ count: 4, distance: 190 }),
      cameraCandidate: 'physics_study',
    }),
  },
]);

function gameNewOptionsForSandboxConfig(config) {
  if (!config || typeof config !== 'object'
    || !Object.prototype.hasOwnProperty.call(config, 'seed')) return {};
  const seed = config.seed;
  return Number.isSafeInteger(seed) && seed >= 1 && seed <= 0xffffffff
    ? { seed }
    : {};
}

/** Stash config, then trigger the standard new-game pipeline. The real NEW_GAME world boots with
 *  only a validated deterministic seed; applySandboxSetup mutates it on game:started. */
export function requestSandboxGame(bus, config) {
  pendingConfig = config || {};
  bus.emit('game:new', gameNewOptionsForSandboxConfig(config));
}

/** Idempotent installer for the game:started hook. Call once during UI init. Re-arms after each
 *  fire so repeated sandbox launches work without re-installing. Safe no-op if no config pending. */
export function installSandboxGameStartedHook(bus, ctxRef) {
  if (hookInstalled) return;
  hookInstalled = true;
  // ctxRef is a thunk because uiRoot's ctx is enriched after this hook arms; resolve at fire time.
  const resolveCtx = typeof ctxRef === 'function' ? ctxRef : () => ctxRef;
  const handler = () => {
    const cfg = pendingConfig;
    pendingConfig = null;
    if (!cfg) return; // a normal new game, not a sandbox launch
    try {
      applySandboxSetup(resolveCtx(), cfg);
    } catch (err) {
      console.error('[sandbox] setup failed', err);
      bus.emit('toast', { text: 'Sandbox setup failed: ' + (err && err.message), kind: 'error', ttl: 6 });
    }
  };
  bus.on('game:started', handler);
  // A failed transition never reaches game:started. Clear its staged config here so a later
  // ordinary New Game cannot inherit the abandoned Sandbox request. Repeated failures are benign.
  bus.on('game:startFailed', () => { pendingConfig = null; });
}

// --------------------------------------------------------------------------------------------
// Writers. Each helper is defensive: if a system is missing or a call fails, we toast and continue
// rather than abort the whole setup — a partial sandbox is still more useful than a black screen.

function sys(ctx, name) {
  const r = ctx && ctx.registry;
  return (r && typeof r.get === 'function') ? r.get(name) : null;
}

function setCredits(ctx, target) {
  const economy = sys(ctx, 'economy');
  const cur = ctx.state.player.credits || 0;
  const delta = Math.max(0, Math.floor(target) - cur);
  if (delta > 0 && economy && typeof economy.grantCredits === 'function') {
    economy.grantCredits(delta, 'sandbox');
  }
}

function unlockAllTech(ctx) {
  const ships = sys(ctx, 'ships');
  if (!ships || typeof ships.unlockTech !== 'function') return;
  const p = ctx.state.player;
  const researched = new Set(p.researchedNodes || []);
  const remainingNodes = TECH_NODES.filter((node) => !researched.has(node.id));
  const remainingCreditCost = remainingNodes.reduce(
    (sum, node) => sum + ((node.cost && node.cost.credits) || 0),
    0,
  );
  const economy = sys(ctx, 'economy');
  // Provision exactly what the remaining research tree will charge. Because unlockTech routes
  // every charge back through economy, the balance present on entry (including a preset target)
  // is restored after the final unlock without Sandbox ever writing player.credits directly.
  if (remainingCreditCost > 0 && economy && typeof economy.grantCredits === 'function') {
    economy.grantCredits(remainingCreditCost, 'sandbox:tech-budget');
  }

  // unlockTech also enforces RP. RP is ships-owned, so top it up before walking the real tree.
  const totalRpNeeded = TECH_NODES.reduce((sum, n) => sum + ((n.cost && n.cost.rp) || 0), 0);
  if (typeof p.researchPoints === 'number') p.researchPoints += totalRpNeeded + 1000;
  // Loop until stable: prereqs can back-reference, so a single pass may miss leaves whose roots
  // only became available mid-pass. Bounded by node count.
  for (let pass = 0; pass < TECH_NODES.length + 1; pass++) {
    let progressed = false;
    for (const node of TECH_NODES) {
      if (p.researchedNodes.includes(node.id)) continue;
      // The production writer intentionally toasts rejected requests. Skip nodes whose
      // prerequisites are not ready yet so this bounded dependency walk does not surface a
      // false error before a later pass unlocks the same node successfully.
      if (typeof ships.researchable === 'function' && !ships.researchable(node.id)) continue;
      if (ships.unlockTech(node.id)) progressed = true;
    }
    if (!progressed) break;
  }
}

function grantAllModules(ctx) {
  const ships = sys(ctx, 'ships');
  if (!ships || typeof ships.grantModule !== 'function') return;
  const seen = new Set((ctx.state.player.moduleInventory || []).map((m) => m.defId));
  for (const def of [...WEAPONS, ...MODULES]) {
    // Skip uniques/salvage-only defs that aren't meant to sit in inventory.
    if (def.unique || def.salvageOnly || def.purchasable === false) continue;
    if (seen.has(def.id)) continue;
    ships.grantModule({ defId: def.id, reason: 'sandbox' });
    seen.add(def.id);
  }
}

function autoEquipBestWeapon(ctx) {
  const ships = sys(ctx, 'ships');
  if (!ships || typeof ships.fitModule !== 'function') return;
  const owned = ctx.state.player.ownedShips[ctx.state.player.activeShipIndex];
  if (!owned) return;
  const shipDef = SHIPS.find((s) => s.id === owned.defId);
  if (!shipDef) return;
  const slots = buildSlotList(shipDef);
  const firstWeaponIdx = slots.findIndex((s) => s && s.type === 'weapon');
  if (firstWeaponIdx < 0) return;
  // Inventory weapons only (grantModule put them there). Highest DPS first; fitModule re-runs the
  // real fit blocker (slot type/size/budget/tech) so an unsuitable pick is skipped, not forced.
  const inv = ctx.state.player.moduleInventory || [];
  const candidates = inv
    .map((m) => ({ inst: m, def: WEAPONS.find((w) => w.id === m.defId) }))
    .filter((c) => c.def)
    .sort((a, b) => (b.def.dps || 0) - (a.def.dps || 0));
  for (const c of candidates) {
    if (ships.fitModule({ slotIndex: firstWeaponIdx, instanceId: c.inst.instanceId })) return;
  }
}

function maxReputation(ctx) {
  const factions = sys(ctx, 'factions');
  if (!factions || typeof factions.applyRep !== 'function') return;
  for (const f of FACTION_META) {
    const rec = ctx.state.factions && ctx.state.factions[f.id];
    const cur = (rec && typeof rec.rep === 'number') ? rec.rep : 0;
    // Allied tier ceiling; applyRep clamps + applies diminishing returns near the cap.
    const delta = 800 - cur;
    if (delta > 0) factions.applyRep(f.id, delta, 'sandbox');
  }
}

function enterSectorIfSet(ctx, sectorId) {
  if (!sectorId) return;
  const world = sys(ctx, 'world');
  if (!world || typeof world.enterSector !== 'function') return;
  world.enterSector(sectorId);
}

function relocatePlayer(ctx, sectorId, localPos, reason) {
  if (!sectorId || !localPos) return false;
  const world = sys(ctx, 'world');
  if (!world || typeof world.relocatePlayerInSector !== 'function') return false;
  const global = sectorLocalToGlobalForSector(localPos, sectorId);
  return !!world.relocatePlayerInSector({ x: global.x, z: global.z, heading: 0 }, { reason });
}

function relocateToZone(ctx, sectorId, zoneId, offset = {}) {
  const zones = SECTOR_ZONES[sectorId] || [];
  const zone = zones.find((item) => item && item.id === zoneId);
  if (!zone) return false;
  return relocatePlayer(ctx, sectorId, {
    x: zone.center.x + (Number(offset.x) || 0),
    z: zone.center.z + (Number(offset.z) || 0),
  }, `sandbox:${zoneId}`);
}

function applyCameraCandidate(ctx, candidateId) {
  if (!candidateId) return false;
  const candidate = SANDBOX_CAMERA_CANDIDATES.find((item) => item.id === candidateId);
  const camera = ctx.state.render && ctx.state.render.cameraCtrl;
  if (!candidate || !camera || typeof camera.setZoom !== 'function') return false;
  camera.setZoom(candidate.zoom);
  if (typeof camera.snapToPlayer === 'function') camera.snapToPlayer();
  return true;
}

/** Swap the player onto a different hull via the sanctioned buyShip(grant)+setActiveShip path.
 *  setActiveShip re-derives the live player entity onto the new hull (no manual respawn needed). */
function setShip(ctx, defId) {
  if (!defId) return;
  const ships = sys(ctx, 'ships');
  if (!ships || typeof ships.buyShip !== 'function') return;
  const p = ctx.state.player;
  const current = p.ownedShips[p.activeShipIndex];
  if (current && current.defId === defId) return; // already on it
  // grant=true skips credits + tech gate; the sandbox unlocks tech separately when requested, but
  // grant keeps ship choice unconditional for testing.
  ships.buyShip({ defId, setActive: true, grant: true });
}

function spawnEnemies(ctx, specs) {
  if (!specs || !specs.length) return;
  const helpers = ctx.helpers;
  if (!helpers || typeof helpers.spawnEntity !== 'function') return;
  const player = ctx.state.entities.get(ctx.state.playerId);
  const px = (player && player.pos && player.pos.x) || 0;
  const pz = (player && player.pos && player.pos.z) || 0;
  for (const spec of specs) {
    const count = Math.max(1, Math.min(20, spec.count || 1));
    const dist = Math.max(120, spec.distance || 400);
    const enemyType = spec.type || 'wasp_swarmer';
    for (let i = 0; i < count; i++) {
      const a = (Math.PI * 2 * i) / count + (ctx.state.rng ? ctx.state.rng() * 0.5 : 0);
      const x = px + Math.cos(a) * dist;
      const z = pz + Math.sin(a) * dist;
      const entitySpec = makeEnemySpawnSpec(enemyType, 1, { x, z });
      if (entitySpec) {
        // Live-squad lever, verbatim from the encounter director (encounterDirector.js stamps
        // ai.spawnContext = sh.context; encounterScripts.js documents it as the sanctioned way to
        // make a spawned squad engage). Without it these swarmers can NEVER turn hostile — the
        // engagement authority denies fire on anything isHostileToPlayer rejects — so every
        // "hostile swarmers inbound" sandbox card was peacefully neutered.
        entitySpec.data.ai.spawnContext = 'encounter';
        helpers.spawnEntity(entitySpec);
      }
    }
  }
}

function startDrill(ctx) {
  const drillSys = sys(ctx, 'drill');
  const helpers = ctx.helpers;
  const bus = ctx.bus;
  if (!drillSys || typeof drillSys.begin !== 'function' || !helpers || !bus) return;
  // Spawn a drillable asteroid just ahead of the player, then begin + open the screen.
  const player = ctx.state.entities.get(ctx.state.playerId);
  const px = (player && player.pos && player.pos.x) || 0;
  const pz = (player && player.pos && player.pos.z) || 0;
  const asteroid = helpers.spawnEntity({
    type: 'asteroid',
    pos: { x: px + 220, z: pz },
    radius: 14, mass: 600, hull: 280, hullMax: 280,
    data: { typeId: 'ast_rock', oreHP: 280, oreHPMax: 280 },
  });
  if (!asteroid) return;
  drillSys.begin(asteroid.id);
  // Sandbox-only shortcut: production requests a live player tether from ui/input and lets the
  // fixed-tick tether owner settle it. This fixture has no tether, so it only drives uiRoot's
  // presentation handoff after drill.begin() has prepared the sandbox session.
  const attachmentId = `sandbox:drill:${asteroid.id}`;
  bus.emit('drill:approachStarted', { asteroidId: asteroid.id, attachmentId, sandbox: true });
  bus.emit('drill:approachCompleted', { asteroidId: asteroid.id, attachmentId, sandbox: true });
}

// --------------------------------------------------------------------------------------------
// Batch A: specific-item pickers (per-weapon / per-module / per-enemy / target drones)

/** Find the first compatible empty slot index for a def on the active ship, or -1. */
function findEmptySlotFor(ctx, def) {
  const ships = sys(ctx, 'ships');
  const p = ctx.state.player;
  const owned = p.ownedShips[p.activeShipIndex];
  if (!owned || !ships) return -1;
  const shipDef = SHIPS.find((s) => s.id === owned.defId);
  if (!shipDef) return -1;
  const slots = buildSlotList(shipDef);
  for (const s of slots) {
    if (s.type !== def.slotType) continue;
    if (owned.fittings[s.index]) continue; // occupied
    // size check (S fits in M/L; matches moduleFitBlocker's fits() rule)
    const RANK = { S: 1, M: 2, L: 3 };
    if (RANK[s.size] < RANK[def.size]) continue;
    return s.index;
  }
  return -1;
}

/** Grant a specific def into inventory and, if a compatible slot is free, equip it. Returns true if
 *  equipped. Always grants to inventory regardless. Used by the per-weapon / per-module pickers. */
function grantAndEquip(ctx, defId) {
  const ships = sys(ctx, 'ships');
  if (!ships || typeof ships.grantModule !== 'function') return false;
  const def = [...WEAPONS, ...MODULES].find((d) => d.id === defId);
  if (!def) return false;
  // Don't double-grant if already in inventory.
  const inv = ctx.state.player.moduleInventory || [];
  let inst = inv.find((m) => m.defId === defId);
  if (!inst) {
    if (!ships.grantModule({ defId, reason: 'sandbox' })) return false;
    inst = inv.find((m) => m.defId === defId);
  }
  if (!inst) return false;
  const slotIdx = findEmptySlotFor(ctx, def);
  if (slotIdx < 0) return false; // granted to inventory, no free slot
  return !!ships.fitModule({ slotIndex: slotIdx, instanceId: inst.instanceId });
}

/** Apply a named physical-play loadout through ships-owned grant/unfit/fit operations. */
function applyPhysicsLoadout(ctx, loadoutId) {
  const loadout = SANDBOX_PHYSICS_LOADOUTS.find((item) => item.id === loadoutId);
  const ships = sys(ctx, 'ships');
  if (!loadout || !ships || loadout.itemIds.length === 0) return;
  const p = ctx.state.player;
  const owned = p.ownedShips[p.activeShipIndex];
  const shipDef = owned && SHIPS.find((item) => item.id === owned.defId);
  if (!owned || !shipDef) return;
  const slots = buildSlotList(shipDef);
  const RANK = { S: 1, M: 2, L: 3 };

  for (const defId of loadout.itemIds) {
    if (Array.isArray(owned.fittings) && owned.fittings.includes(defId)) continue;
    const def = [...WEAPONS, ...MODULES].find((item) => item.id === defId);
    if (!def) continue;
    const compatible = slots.filter((slot) => (
      slot.type === def.slotType && RANK[slot.size] >= RANK[def.size]
    ));
    if (compatible.length === 0) {
      grantAndEquip(ctx, defId); // inventory-only on this hull remains truthful
      continue;
    }
    const fittings = Array.isArray(owned.fittings) ? owned.fittings : [];
    const target = compatible.find((slot) => !fittings[slot.index]) || compatible[0];
    if (fittings[target.index] && typeof ships.unfitModule === 'function') {
      ships.unfitModule({ slotIndex: target.index });
    }
    grantAndEquip(ctx, defId);
  }
}

/** Spawn N inert target drones (team 2, no AI) — grappleable, shootable, passive. Arranged in a
 *  ring ahead of the player. Returns the spawned entities. */
function spawnTargetDrones(ctx, { count = 3, distance = 350, shipId = 'ship_kestrel' } = {}) {
  const helpers = ctx.helpers;
  if (!helpers || typeof helpers.spawnEntity !== 'function') return [];
  const player = ctx.state.entities.get(ctx.state.playerId);
  const px = (player && player.pos && player.pos.x) || 0;
  const pz = (player && player.pos && player.pos.z) || 0;
  const n = Math.max(1, Math.min(12, count));
  const dist = Math.max(100, distance);
  const spawned = [];
  for (let i = 0; i < n; i++) {
    const a = (Math.PI * 2 * i) / n;
    const spec = makeShipEntitySpec(shipId, {
      team: 2, // neutral/passive — grappleable + shootable, won't fight back
      factionId: 'faction_free',
      pos: { x: px + Math.cos(a) * dist, z: pz + Math.sin(a) * dist },
      // no ai → inert
    });
    const e = helpers.spawnEntity(spec);
    if (e) spawned.push(e);
  }
  return spawned;
}

function spawnCollisionAnchors(ctx, count = 3, distance = 210) {
  const helpers = ctx.helpers;
  const player = ctx.state.entities.get(ctx.state.playerId);
  if (!helpers || typeof helpers.spawnEntity !== 'function' || !player || !player.pos) return [];
  const n = Math.max(1, Math.min(6, Math.trunc(count) || 1));
  const spawned = [];
  for (let i = 0; i < n; i++) {
    const a = -0.72 + (i / Math.max(1, n - 1)) * 1.44;
    const radius = 18 + i * 4;
    const e = helpers.spawnEntity({
      type: 'asteroid',
      pos: {
        x: player.pos.x + Math.cos(a) * (distance + i * 28),
        z: player.pos.z + Math.sin(a) * (distance + i * 28),
      },
      radius,
      mass: 1600 + i * 900,
      hull: 1200,
      hullMax: 1200,
      data: { typeId: i % 2 ? 'ast_common_rock' : 'ast_metallic', sandboxCollisionAnchor: true },
    });
    if (e) spawned.push(e);
  }
  return spawned;
}

function setupPhysicsSwarm(ctx, opts = {}) {
  const lightCount = Math.max(0, Math.min(20, Math.trunc(opts.lightCount ?? 10)));
  const mediumCount = Math.max(0, Math.min(4, Math.trunc(opts.mediumCount ?? 2)));
  if (lightCount > 0) spawnEnemies(ctx, [{ type: 'wasp_swarmer', count: lightCount, distance: 230 }]);
  if (mediumCount > 0) {
    const reavers = Math.ceil(mediumCount / 2);
    const corsairs = Math.floor(mediumCount / 2);
    spawnEnemies(ctx, [
      ...(reavers ? [{ type: 'reaver_pirate', count: reavers, distance: 285 }] : []),
      ...(corsairs ? [{ type: 'corsair_raider', count: corsairs, distance: 315 }] : []),
    ]);
  }
  spawnCollisionAnchors(ctx, opts.anchorCount ?? 3, 175);
}

function setupPlanetSlingCourse(ctx, opts = {}) {
  const sectorId = 'sector_tethys_junction';
  // The real planet runtime owns The Anvil. Start outside its atmosphere and add only two ordinary
  // physical route anchors; no Sandbox-only gravity, guidance, or flight behavior is introduced.
  relocatePlayer(ctx, sectorId, {
    x: ZONE_TETHYS_ANVIL.center.x - ZONE_TETHYS_ANVIL.radius - 210,
    z: ZONE_TETHYS_ANVIL.center.z,
  }, 'sandbox:planet_sling_course');
  spawnCollisionAnchors(ctx, opts.anchorCount ?? 2, 155);
}

function setupCrimeInterception(ctx, opts = {}) {
  const launcher = PQ019_FACILITIES.heist_launcher;
  relocatePlayer(ctx, PQ019_HEIST_SECTOR_ID, {
    x: launcher.localPos.x - 210,
    z: launcher.localPos.z + 65,
  }, 'sandbox:crime_interception');
  const owner = sys(ctx, 'heistFacilities');
  if (!owner) return;
  if (typeof owner.materializeForSector === 'function') owner.materializeForSector(PQ019_HEIST_SECTOR_ID);
  if (typeof owner.requestLaunchSchedule === 'function') {
    const delay = Math.max(1, Math.min(60, Number(opts.launchDelayS) || 8));
    owner.requestLaunchSchedule({
      scheduleId: `sandbox-crime-${ctx.state.tick | 0}`,
      launchAtSimT: (Number(ctx.state.simTime) || 0) + delay,
    });
  }
}

// --------------------------------------------------------------------------------------------
// Batch B: Massline Range — equip a grapple head + spawn a target + pre-attach the tether

const TETHER_DEF_ID = 'tether_standard';

/** Equip a specific massline head module (unfitting any existing head first — one-head limit). */
function equipMasslineHead(ctx, headDefId) {
  const ships = sys(ctx, 'ships');
  if (!ships || typeof ships.fitModule !== 'function') return false;
  const p = ctx.state.player;
  const owned = p.ownedShips[p.activeShipIndex];
  if (!owned) return false;
  // Unfit any existing massline head (moduleFitBlocker enforces one head at a time).
  for (let i = 0; i < owned.fittings.length; i++) {
    const fid = owned.fittings[i];
    if (!fid) continue;
    const fdef = [...WEAPONS, ...MODULES].find((d) => d.id === fid);
    if (fdef && fdef.mods && fdef.mods.masslineHeadId) {
      if (typeof ships.unfitModule === 'function') ships.unfitModule({ slotIndex: i });
    }
  }
  return grantAndEquip(ctx, headDefId);
}

/** Set up a default-Massline range. An advanced head is fitted only when the caller explicitly
 *  requests one; recovery scenarios exercise the shipping base tether rather than hidden tech. */
function setupMasslineRange(ctx, opts = {}) {
  const helpers = ctx.helpers;
  if (!helpers || typeof helpers.spawnEntity !== 'function') return;
  if (opts.headDefId) equipMasslineHead(ctx, opts.headDefId);

  // Spawn a grappleable target ahead of the player. Static ranges use the canonical heavy-rock
  // shape; the moving range uses an ordinary neutral production ship with initial velocity.
  const player = ctx.state.entities.get(ctx.state.playerId);
  const px = (player && player.pos && player.pos.x) || 0;
  const pz = (player && player.pos && player.pos.z) || 0;
  const distance = Math.max(60, opts.distance || 140);
  const mass = Math.max(1, Number(opts.mass) || 400);
  let targetSpec;
  if (opts.movingTarget) {
    targetSpec = makeShipEntitySpec('ship_mule', {
      team: 2,
      factionId: 'faction_dmc',
      pos: { x: px + distance, z: pz - distance * 0.45 },
      rot: Math.PI / 2,
    });
    targetSpec.vel = { x: 0, z: 42 };
    targetSpec.data = { ...targetSpec.data, sandboxMovingTarget: true };
  } else {
    targetSpec = {
      type: 'asteroid',
      pos: { x: px + distance, z: pz },
      radius: 10,
      mass,
      hull: 500,
      hullMax: 500,
      data: { typeId: 'ast_metallic', oreHP: 500, oreHPMax: 500, sandboxMasslineAnchor: true },
    };
  }
  const target = helpers.spawnEntity(targetSpec);
  if (!target) return;

  // 3. Pre-attach the tether via the combat kernel's attachment service — the same API the live
  //    Latch action (tetherGameplay.js) and the lab runner (runScenario.js) use. tetherGameplay's
  //    _adoptExisting picks it up next tick, so the cable/HUD render automatically.
  if (opts.preAttach === false) return;
  try {
    const kernel = getCombatKernel(ctx);
    const attachments = kernel && kernel.attachments;
    if (attachments && typeof attachments.create === 'function') {
      attachments.create({
        defId: TETHER_DEF_ID,
        ownerId: ctx.state.playerId,
        targetId: target.id,
        sourceWorld: { x: px, y: 0, z: pz },
        targetWorld: { x: target.pos.x, y: 0, z: target.pos.z },
      });
    }
  } catch (err) {
    console.error('[sandbox] massline pre-attach failed', err);
  }
}

/** Apply a sandbox config to the just-started game, via real writers, in dependency-safe order. */
export function applySandboxSetup(ctx, config) {
  if (!ctx || !ctx.state || !ctx.state.player) return;
  const cfg = config || {};

  // 1. Credits first (tech unlock + ship/module paths can charge credits).
  if (typeof cfg.credits === 'number') setCredits(ctx, cfg.credits);

  // 2. Tech (must precede grant/fit/ship so requiresTech gates pass; also grants RP unlock-all needs).
  if (cfg.unlockAllTech) unlockAllTech(ctx);

  // 3. Ship swap (after tech so the hull isn't gated; before modules so they land on the new hull).
  setShip(ctx, cfg.shipId);

  // 4. Modules into inventory.
  if (cfg.grantAllModules) grantAllModules(ctx);

  // 5. Auto-equip a primary weapon (after inventory is populated).
  if (cfg.autoEquipBestWeapon) autoEquipBestWeapon(ctx);

  // 5b. Named physical-play loadout. Ships remains the only fitting writer; incompatible items
  //     are granted to inventory rather than forced into an illegal slot.
  if (cfg.physicsLoadout) applyPhysicsLoadout(ctx, cfg.physicsLoadout);

  // 6. Reputation (independent of the above).
  if (cfg.maxReputation) maxReputation(ctx);

  // 7. Sector (materializes a fresh sector; do this before spawning enemies/drill so they land in
  //    the right place and aren't evicted by the sector swap).
  enterSectorIfSet(ctx, cfg.sectorId);

  // 7b. Scenario staging uses world's public same-sector relocation seam. No raw physics pose
  //     mutation and no alternate travel/gameplay path.
  if (cfg.spawnAtZoneId && cfg.sectorId) {
    relocateToZone(ctx, cfg.sectorId, cfg.spawnAtZoneId, cfg.spawnAtZoneOffset);
  }

  // 8. Enemies (placed relative to the player in the now-current sector).
  if (cfg.spawnEnemies) spawnEnemies(ctx, cfg.spawnEnemies);

  // 8b. Recovery scenarios compose existing systems inside the camera-scale test pocket.
  if (cfg.physicsSwarm) setupPhysicsSwarm(ctx, cfg.physicsSwarm);
  if (cfg.planetSlingCourse) setupPlanetSlingCourse(ctx, cfg.planetSlingCourse);
  if (cfg.crimeInterception) setupCrimeInterception(ctx, cfg.crimeInterception);
  if (cfg.targetDrones) spawnTargetDrones(ctx, cfg.targetDrones);

  // 9. Drill (spawns asteroid + begins + opens screen). Last so it isn't disrupted by sector swap.
  if (cfg.drillOnStart) startDrill(ctx);

  // 10. Massline Range (equip head + spawn target + pre-attach tether). After sector swap so the
  //     target lands in the right place; after module grant so the head is in inventory.
  if (cfg.masslineRange) setupMasslineRange(ctx, cfg.masslineRange);

  // 11. Camera selection is presentation-owned and snaps only after any authored relocation.
  if (cfg.cameraCandidate) applyCameraCandidate(ctx, cfg.cameraCandidate);

  const scenario = SCENARIO_PRESETS.find((item) => item.id === cfg.scenarioId);
  ctx.bus.emit('toast', {
    text: scenario ? `Sandbox: ${scenario.title} ready` : 'Sandbox ready',
    kind: 'success',
    ttl: 2,
  });
}

// --------------------------------------------------------------------------------------------
// Live (in-flight) actions — used by the fine-tune panel's "do it now" buttons, which mutate a
// running game directly rather than relaunching. Each is a thin wrapper over the writers above so
// the single-writer contract still holds.

/** Give a specific weapon/module and equip it if a slot is free. For the per-item picker. */
export function giveAndEquipItem(ctx, defId) {
  const ok = grantAndEquip(ctx, defId);
  const def = [...WEAPONS, ...MODULES].find((d) => d.id === defId);
  toast(ctx, ok
    ? 'Equipped ' + ((def && def.name) || defId)
    : 'Granted ' + ((def && def.name) || defId) + ' to inventory (no free slot)');
}

/** Spawn a specific enemy type near the player. For the per-enemy picker. */
export function spawnEnemyNow(ctx, enemyTypeId, count = 1) {
  spawnEnemies(ctx, [{ type: enemyTypeId, count, distance: 400 }]);
  toast(ctx, 'Spawned ' + count + ' × ' + enemyTypeId);
}

/** Spawn inert target drones near the player for weapon/massline practice. */
export function spawnTargetsNow(ctx, count = 3) {
  const spawned = spawnTargetDrones(ctx, { count, distance: 350 });
  toast(ctx, 'Spawned ' + spawned.length + ' target drone' + (spawned.length === 1 ? '' : 's'));
}

function toast(ctx, text) {
  if (ctx && ctx.bus) ctx.bus.emit('toast', { text, kind: 'info', ttl: 2 });
}
