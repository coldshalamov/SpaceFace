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
//   1. requestSandboxGame(bus, config) stashes the config, then emits game:new (no opts needed —
//      startNewGame builds the real NEW_GAME world; we mutate after).
//   2. installSandboxGameStartedHook(bus, ctx) arms a one-shot game:started listener that reads the
//      stashed config and calls applySandboxSetup. It re-arms itself after each run so the harness
//      survives multiple launches in one session.
//   3. applySandboxSetup(ctx, config) runs the writers in dependency-safe order.

import { WEAPONS } from '../../data/weapons.js';
import { MODULES } from '../../data/modules.js';
import { TECH_NODES } from '../../data/tech.js';
import { SHIPS } from '../../data/ships.js';
import { FACTION_META } from '../../data/factions.js';
import { makeEnemySpawnSpec } from '../../systems/combat.js';
import { buildSlotList, makeShipEntitySpec } from '../../systems/ships.js';
import { getCombatKernel } from '../../combat/kernel.js';

// Module-scoped staging so the launch button (pure UI) and the game:started hook (pure logic)
// don't need a shared object threaded through ctx. One pending config at a time.
let pendingConfig = null;
let hookInstalled = false;

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
    id: 'massline',
    title: 'Massline Range',
    description: 'A grapple target out front with a tractor head equipped, tether pre-attached. ' +
      'Practice latch/reel/orbit/throw instantly.',
    config: Object.freeze({
      unlockAllTech: true,
      grantAllModules: true,
      masslineRange: Object.freeze({ distance: 140, preAttach: true }),
    }),
  },
]);

/** Stash config, then trigger the standard new-game pipeline. The real NEW_GAME world boots;
 *  applySandboxSetup mutates it on game:started. */
export function requestSandboxGame(bus, config) {
  pendingConfig = config || {};
  bus.emit('game:new', {});
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
  // unlockTech enforces prereqs + charges credits/RP. We've already given plenty of credits above,
  // but RP is ships' to spend — top it up generously so the chain doesn't stall on RP costs.
  const p = ctx.state.player;
  const totalRpNeeded = TECH_NODES.reduce((sum, n) => sum + ((n.cost && n.cost.rp) || 0), 0);
  if (typeof p.researchPoints === 'number') p.researchPoints += totalRpNeeded + 1000;
  // Loop until stable: prereqs can back-reference, so a single pass may miss leaves whose roots
  // only became available mid-pass. Bounded by node count.
  for (let pass = 0; pass < TECH_NODES.length + 1; pass++) {
    let progressed = false;
    for (const node of TECH_NODES) {
      if (p.researchedNodes.includes(node.id)) continue;
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
      if (entitySpec) helpers.spawnEntity(entitySpec);
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
  // The drill screen-open path is owned by uiRoot via this event (cinematic fade + push).
  bus.emit('ui:drillFadeStart', { asteroidId: asteroid.id });
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

/** Set up the massline range: equip the tractor head, spawn a target, optionally pre-attach the
 *  tether so the player starts already latched and can reel/orbit/throw immediately. */
function setupMasslineRange(ctx, opts = {}) {
  const helpers = ctx.helpers;
  if (!helpers || typeof helpers.spawnEntity !== 'function') return;
  // 1. Equip the tractor head (the standard grapple). grantAllModules ran earlier so it's in inv.
  equipMasslineHead(ctx, 'mod_tractor_beam_m');

  // 2. Spawn a grappleable target ahead of the player. A heavy asteroid is the canonical lab anchor
  //    (massline-latch-reel.scenario.json uses asteroid.heavy); it's grappleable and survives.
  const player = ctx.state.entities.get(ctx.state.playerId);
  const px = (player && player.pos && player.pos.x) || 0;
  const pz = (player && player.pos && player.pos.z) || 0;
  const distance = Math.max(60, opts.distance || 140);
  const target = helpers.spawnEntity({
    type: 'asteroid',
    pos: { x: px + distance, z: pz },
    radius: 10, mass: 400, hull: 500, hullMax: 500,
    data: { typeId: 'ast_metallic', oreHP: 500, oreHPMax: 500 },
  });
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
        targetWorld: { x: px + distance, y: 0, z: pz },
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

  // 6. Reputation (independent of the above).
  if (cfg.maxReputation) maxReputation(ctx);

  // 7. Sector (materializes a fresh sector; do this before spawning enemies/drill so they land in
  //    the right place and aren't evicted by the sector swap).
  enterSectorIfSet(ctx, cfg.sectorId);

  // 8. Enemies (placed relative to the player in the now-current sector).
  if (cfg.spawnEnemies) spawnEnemies(ctx, cfg.spawnEnemies);

  // 9. Drill (spawns asteroid + begins + opens screen). Last so it isn't disrupted by sector swap.
  if (cfg.drillOnStart) startDrill(ctx);

  // 10. Massline Range (equip head + spawn target + pre-attach tether). After sector swap so the
  //     target lands in the right place; after module grant so the head is in inventory.
  if (cfg.masslineRange) setupMasslineRange(ctx, cfg.masslineRange);

  ctx.bus.emit('toast', { text: 'Sandbox ready', kind: 'success', ttl: 2 });
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
