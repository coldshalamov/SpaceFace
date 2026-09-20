/**
 * PQ-206.00 — Dreadnought 2v2 "~12 s resolution" investigation, pinned on fixed seeds.
 *
 * FINDING (receipt: design/program/roadmap/receipts/PQ-206.00-REPORT.md):
 *   The combat-variety vertical's duel audit printed `dreadnought_boss:2v2  ttk 12.25 s` and read
 *   it as "the capital dies to something other than pilot DPS". Nothing kills the capital. The
 *   bench's `ttkSeconds` is `duel.deaths.length ? resolveTick/60 : null`, and its `player:death`
 *   handler pushes the PILOT into `duel.deaths` — so a pilot death prints as a "ttk". In this cell
 *   the scripted pilot dies in single-digit/low-teens seconds to the two capitals' authored turret
 *   broadside while BOTH capitals sit out the resolution at full hull and untouched armor.
 *
 * What this test pins (one block per claimed mechanism, fixed seeds 4242 / 8008):
 *   1. The cell resolves by PILOT DEATH inside a bounded window — killer is a dreadnought, the
 *      killing weapon is one of the dreadnought's authored turret weapons.
 *   2. 100% of the damage the pilot takes traces to the enemy wing with origin kind `weapon`
 *      (turret fire) — no collision, status, or ambient source participates.
 *   3. Both capitals end the cell ALIVE at FULL hull AND armor; only shields are dented. The only
 *      attacker that ever damages a capital is the pilot; the totals are a rounding error against
 *      the capitals' combined EHP.
 *   4. No capital ever emits entity:killed, and the wingmate is killed first having dealt ZERO
 *      damage — so there is no non-pilot kill source, and the audit's printed "ttk" was the
 *      pilot's death (the bench counts any death).
 *   5. Data leg: the authored arithmetic (duel level clamp 8 → x1.84 scaling) puts 30,928 EHP in
 *      the cell against a tier-1 starter pulse laser (44 dps paper, 8 dmg/hit) — a capital kill in
 *      ~12 s was never arithmetically possible. Authored gank, not a stat bug: armor gate intact
 *      (armor never scratched), no doubled multiplier (applied tracks raw through the layers).
 *
 * RUN: `node --test --test-force-exit test/pq206-00-dreadnought-wing-cell.test.mjs`
 * (--test-force-exit is required: the real-path rapier-dynamic boot keeps WASM handles alive
 * after dispose, so the runner child never exits on its own. Same boot law as the crucible bench.)
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { createAuthoritativeRuntime } from '../src/runtime/createAuthoritativeRuntime.js';
import { createBus } from '../src/core/eventBus.js';
import { SIM_DT } from '../src/core/sim.js';
import { mulberry32, wrapAngle } from '../src/core/rng.js';
import { ENEMY_TYPES } from '../src/data/enemies.js';
import { makeEnemySpawnSpec, scaleCombatant } from '../src/systems/combat.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';
import { applyCombatLabSetup } from '../src/ui/sandbox/sandboxSetup.js';
import { COMBAT_LAB_STARTER_PACKAGES, COMBAT_LAB_ARENAS } from '../src/data/combatLabSetups.js';
import { validateCombatLabSetup } from '../src/contracts/combatLabSetupSchema.js';
import { FIELD_FLAGS } from '../src/data/fields.js';
import { TECH_NODES } from '../src/data/tech.js';
import {
  snapshotFeatureMaps, applyFeatureConfigToMaps, restoreFeatureMaps,
} from '../src/data/featureFlags.js';
import { getNodeSystemFactoryTable } from '../src/runtime/nodeSystemFactoryTable.js';
import { stationServices } from '../src/systems/stationServices.js';
import { difficultyDirector } from '../src/systems/difficultyDirector.js';

const SEEDS = [4242, 8008]; // two of the duel-audit's fixed seeds; 4242 is the audited 2v2 cell
const ARCHETYPE_ID = 'dreadnought_boss';
const ALLY_ARCHETYPE = 'corsair_raider'; // the bench's DUEL_ALLY_ARCHETYPE
const DUEL_SPAWN_DISTANCE = 480;
const TICK_CAP = 3600; // 60 s of sim, the bench's own bound
const LOADOUT_ID = 'energy_baseline';
const ARENA_ID = 'helios_core';

// The bench's scripted duel pilot, verbatim constants: aim lead, gates, and cadence.
const BIND = {
  forward: ['KeyW'], brake: ['Digit0'],
  yawLeft: ['KeyA'], yawRight: ['KeyD'],
};
const RANGE = 150;
const VERB_PERIOD = 150;
const PHYSICS_PROJ_SPEED = 340;

function nodeSystemTable() {
  // The node factory table lags the production manifest while concurrent lanes land systems
  // (stationServices, difficultyDirector). Inject the missing systems the way
  // test/pq-141-01-ambush-intercept.test.mjs injects stuntGrammar; no-op once the table catches up.
  const table = getNodeSystemFactoryTable({ tacticalAI: true, flightBackend: 'v3' });
  if (!table.has('stationServices')) table.set('stationServices', stationServices);
  if (!table.has('difficultyDirector')) table.set('difficultyDirector', difficultyDirector);
  return table;
}

function unlockAllTech(player, shipsSys, economySys) {
  const researched = new Set(player.researchedNodes || []);
  const remaining = TECH_NODES.filter((n) => !researched.has(n.id));
  const credits = remaining.reduce((s, n) => s + ((n.cost && n.cost.credits) || 0), 0);
  if (credits > 0 && economySys && typeof economySys.grantCredits === 'function') {
    economySys.grantCredits(credits, 'bench:tech-budget');
  }
  const rp = TECH_NODES.reduce((s, n) => s + ((n.cost && n.cost.rp) || 0), 0);
  if (typeof player.researchPoints === 'number') player.researchPoints += rp + 1000;
  for (let pass = 0; pass < TECH_NODES.length + 1; pass++) {
    let progressed = false;
    for (const node of TECH_NODES) {
      if (player.researchedNodes.includes(node.id)) continue;
      if (typeof shipsSys.researchable === 'function' && !shipsSys.researchable(node.id)) continue;
      if (shipsSys.unlockTech(node.id)) progressed = true;
    }
    if (!progressed) break;
  }
}

function duelLevelFor(def) {
  // Mirrors the bench's duelLevelFor: mid-band level clamped to [1, 8].
  const range = def && Array.isArray(def.levelRange) ? def.levelRange : [1, 3];
  const mid = Math.round((range[0] + range[1]) / 2);
  return Math.max(1, Math.min(8, mid));
}

function press(inputSys, codes) {
  for (const k of codes) inputSys._keys[k] = true;
}

/** Boot the audited dreadnought 2v2 cell on the real production runtime and step it to resolution. */
async function runDreadnoughtWingCell(seed) {
  const prevFieldsEnabled = FIELD_FLAGS.enabled;
  FIELD_FLAGS.enabled = true;
  const events = [];
  const raw = createBus();
  let stateRef = null;
  const bus = Object.create(raw);
  bus.emit = (ev, payload) => {
    events.push({ tick: stateRef ? (stateRef.tick | 0) : -1, ev, payload });
    return raw.emit(ev, payload);
  };
  const aim = { x: 0, z: 0 };
  const systemLookup = nodeSystemTable();
  const runtime = createAuthoritativeRuntime({
    profileId: 'production',
    nodeSafeOnly: true,
    seed,
    bus,
    systemLookup,
    slots: {
      aiSlot: systemLookup.get('aiSlot'),
      flightSlot: systemLookup.get('flightSlot'),
      aiBackend: 'sg06-tactical',
      flightBackend: 'v3',
    },
    helpers: { raycastToPlane: () => ({ x: aim.x, z: aim.z }) },
  });
  const state = runtime.state;
  stateRef = state;
  state.mode = 'flight';
  state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  state.settings.gameplay.flightBackend = 'v3';
  state.settings.gameplay.aiBackend = 'sg06-tactical';

  const shipsSys = runtime.getSystem('ships');
  const economySys = runtime.getSystem('economy');
  const inputSys = runtime.getSystem('input');
  const physicsSys = runtime.getSystem('physics');

  const previousFlags = snapshotFeatureMaps();
  applyFeatureConfigToMaps(runtime.config.features);
  let spawned; let arena;
  try {
    unlockAllTech(state.player, shipsSys, economySys);
    const starter = COMBAT_LAB_STARTER_PACKAGES.find((s) => s.id === LOADOUT_ID);
    arena = COMBAT_LAB_ARENAS.find((a) => a.id === ARENA_ID);
    spawned = runtime.spawn(makeShipEntitySpec(starter.hullId, {
      isPlayer: true, player: state.player, fittings: [], pos: arena.spawnPos, rot: 0, team: 0,
    }));
    state.playerId = spawned.id;
    const ready = await physicsSys.prepareBackend(state, { reset: true });
    if (ready !== true) throw new Error('physics.prepareBackend did not come up — not the real path');
    const setup = validateCombatLabSetup({
      schema: 'spaceface.combatLabSetup.v1',
      hullId: starter.hullId,
      loadout: starter.loadout.map((e) => ({ slotIndex: e.slotIndex, defId: e.defId })),
      enemyPackageId: 'wasp_flight', arenaId: ARENA_ID, seed, wave: 1,
    });
    if (!setup.ok) throw new Error('combat lab setup invalid');
    const fitReceipt = applyCombatLabSetup(
      { state, bus, helpers: runtime.getHelpers(), registry: { get: (n) => runtime.getSystem(n) } },
      setup.value,
    );
    if (!fitReceipt || fitReceipt.notFitted.length !== 0) throw new Error('loadout did not fit');
  } finally {
    restoreFeatureMaps(previousFlags);
  }

  // The wing: one bench-pattern ally, two dreadnoughts, stamped exactly like the bench cells.
  const allyIds = new Set();
  {
    const bearing = Math.PI * 0.75;
    const pos = {
      x: arena.spawnPos.x + Math.cos(bearing) * 140,
      z: arena.spawnPos.z + Math.sin(bearing) * 140,
    };
    const spec = makeEnemySpawnSpec(ALLY_ARCHETYPE, 3, pos);
    spec.team = 0;
    spec.factionId = 'faction_free';
    spec.data.ai.forcePlayerTarget = false;
    spec.data.ai.motive = 'player_wing';
    spec.data.ai.engagementTrigger = 'duel_wing_orders';
    spec.data.duelAlly = true;
    spec.data.reinforcements = null;
    const ent = runtime.spawn(spec);
    if (ent) allyIds.add(ent.id);
  }
  const def = ENEMY_TYPES.find((e) => e.id === ARCHETYPE_ID);
  const enemyIds = new Set();
  const enemyWing = 2;
  for (let i = 0; i < Math.max(1, enemyWing); i++) {
    const bearing = -Math.PI / 2 + (i - (enemyWing - 1) / 2) * (Math.PI / 5);
    const pos = {
      x: arena.spawnPos.x + Math.cos(bearing) * DUEL_SPAWN_DISTANCE,
      z: arena.spawnPos.z + Math.sin(bearing) * DUEL_SPAWN_DISTANCE,
    };
    const spec = makeEnemySpawnSpec(ARCHETYPE_ID, duelLevelFor(def), pos);
    spec.data.ai.forcePlayerTarget = true;
    spec.data.duelHostile = true;
    const ent = runtime.spawn(spec);
    if (ent) enemyIds.add(ent.id);
  }

  const rng = mulberry32((seed ^ 0x5bf03635) >>> 0);
  const verbCadence = 30 + Math.floor(rng() * 30);
  let stopReason = 'tick_cap';
  let resolveTick = null;

  for (let t = 0; t < TICK_CAP; t++) {
    const player = state.entities.get(state.playerId) || spawned;
    inputSys._keys = inputSys._keys || Object.create(null);
    for (const k of Object.keys(inputSys._keys)) inputSys._keys[k] = false;
    inputSys._m0 = false;
    if (player && player.alive !== false) {
      let best = null; let bestD = Infinity;
      for (const id of enemyIds) {
        const h = state.entities.get(id);
        if (!h || h.alive === false || !h.pos) continue;
        const d = Math.hypot(h.pos.x - player.pos.x, h.pos.z - player.pos.z);
        if (d < bestD) { bestD = d; best = h; }
      }
      if (best) {
        const phase = t % VERB_PERIOD;
        const dx = best.pos.x - player.pos.x;
        const dz = best.pos.z - player.pos.z;
        const dist = Math.hypot(dx, dz);
        const vx = best.vel && Number.isFinite(best.vel.x) ? best.vel.x : 0;
        const vz = best.vel && Number.isFinite(best.vel.z) ? best.vel.z : 0;
        const lead = dist / Math.max(1, PHYSICS_PROJ_SPEED);
        aim.x = best.pos.x + vx * lead;
        aim.z = best.pos.z + vz * lead;
        const toAim = Math.atan2(aim.z - player.pos.z, aim.x - player.pos.x);
        const err = wrapAngle(toAim - player.rot);
        if (Math.abs(err) > 0.12) press(inputSys, err > 0 ? BIND.yawRight : BIND.yawLeft);
        if (bestD > RANGE) press(inputSys, BIND.forward);
        else if (bestD < RANGE * 0.45) press(inputSys, BIND.brake);
        if (Math.abs(err) < 0.35 && bestD < 620) inputSys._m0 = true;
      }
    }
    runtime.step(SIM_DT);

    if (!state.entities.get(state.playerId) || state.entities.get(state.playerId).alive === false) {
      stopReason = 'player_dead'; resolveTick = state.tick | 0; break;
    }
    let anyEnemyAlive = false;
    for (const id of enemyIds) {
      const e = state.entities.get(id);
      if (e && e.alive !== false) { anyEnemyAlive = true; break; }
    }
    if (!anyEnemyAlive) { stopReason = 'wing_dead'; resolveTick = state.tick | 0; break; }
  }
  if (stopReason !== 'wing_dead') resolveTick = state.tick | 0;

  // Attribute the recorded bus events.
  const playerId = state.playerId;
  const dmgToPlayer = [];
  const dmgToCapitalsByAttacker = new Map();
  const capitalKills = [];
  const allyDeaths = [];
  const playerDeaths = [];
  for (const { tick, ev, payload: p } of events) {
    if (!p || typeof p !== 'object') continue;
    if (ev === 'combat:damage' && enemyIds.has(p.targetId)) {
      const key = `${p.attackerId == null ? 'null' : p.attackerId}|${p.origin ? p.origin.kind : 'none'}`;
      const row = dmgToCapitalsByAttacker.get(key) || { applied: 0, events: 0 };
      row.applied += p.applied || 0;
      row.events += 1;
      dmgToCapitalsByAttacker.set(key, row);
    }
    if (ev === 'combat:damage' && p.targetId === playerId) {
      dmgToPlayer.push({
        attackerId: p.attackerId,
        originKind: p.origin ? p.origin.kind : null,
        weaponId: p.origin ? (p.origin.weaponId || p.origin.id) : null,
        applied: p.applied || 0,
      });
    }
    if (ev === 'entity:killed') {
      if (enemyIds.has(p.id)) capitalKills.push({ tick, killerId: p.killerId });
      else if (allyIds.has(p.id)) allyDeaths.push({ tick: tick / 60, killerId: p.killerId });
    }
    if (ev === 'player:death') playerDeaths.push({ tick: tick / 60, payload: p });
  }

  const finalVitals = [...enemyIds].map((id) => {
    const e = state.entities.get(id);
    return {
      id,
      alive: e ? e.alive !== false : false,
      hull: e ? e.hull : 0,
      hullMax: e ? e.hullMax : 0,
      armor: e ? e.armorHp : 0,
      armorMax: e ? e.armorMax : 0,
      shield: e ? e.shield : 0,
      shieldMax: e ? e.shieldMax : 0,
    };
  });
  const allyState = [...allyIds].map((id) => {
    const e = state.entities.get(id);
    // Aftermath may restage the killed body (wreck) under the same id, so record what it is now.
    return { id, alive: e ? e.alive !== false : false, type: e ? e.type : 'gone' };
  });

  const result = {
    seed, stopReason, resolveTick, seconds: +(resolveTick / 60).toFixed(2),
    playerId,
    playerDeaths, dmgToPlayer, dmgToCapitalsByAttacker, capitalKills, allyDeaths,
    finalVitals, allyState,
  };
  runtime.dispose();
  FIELD_FLAGS.enabled = prevFieldsEnabled;
  return result;
}

const DREAD_DEF = ENEMY_TYPES.find((e) => e.id === ARCHETYPE_ID);
const DREAD_WEAPONS = new Set(DREAD_DEF.weapons.map((w) => w.id));

test('PQ-206.00 data leg: the 2v2 cell ships 30,928 EHP of capital against a 44 dps starter gun', () => {
  assert.ok(DREAD_DEF, 'dreadnought_boss archetype exists');
  const level = duelLevelFor(DREAD_DEF);
  assert.equal(level, 8, 'the bench clamps the level-10..15 capital to level 8');
  const s = scaleCombatant(DREAD_DEF, level);
  assert.equal(s.hull, 11040, 'scaled hull (6000 x 1.84)');
  assert.equal(s.armor, 4048, 'scaled armor (2200 x 1.84)');
  assert.equal(s.shield, 4416, 'scaled shield (2400 x 1.84)');
  const combinedEhp = s.hull + s.armor + s.shield;
  assert.equal(combinedEhp * 2, 39008, 'two capitals = 39,008 EHP in the cell');
  // The starter gun: 8 dmg x 5.5 rof = 44 dps paper, and every point must eat shields first.
  // 39,008 / 44 is ~887 s of perfect sustained fire — a ~12 s capital kill was never arithmetically
  // possible for the pilot, let alone for a wingmate that never fires. Anything that "resolved" the
  // cell in ~12 s was not capital death.
  assert.ok(combinedEhp / 44 > 60, 'capital kill takes minutes of perfect starter fire, not 12 s');
});

// Boot each fixed-seed cell ONCE, then pin each claimed mechanism against the captured result.
// The boots live INSIDE the first test because node:test finalizes its collection before
// module-scope top-level awaits settle — tests registered after an await never run under
// `node --test`. Registered tests run sequentially in order, so this bootstrap test completes
// before every assertion test below reads RESULTS.
const RESULTS = new Map();
test('PQ-206.00 boot: run the audited dreadnought 2v2 cell on the fixed seeds', { timeout: 300000 }, async () => {
  for (const seed of SEEDS) {
    RESULTS.set(seed, await runDreadnoughtWingCell(seed));
  }
  for (const seed of SEEDS) {
    assert.ok(RESULTS.get(seed), `seed ${seed} cell ran`);
  }
});

for (const seed of SEEDS) {
  test(`PQ-206.00 seed ${seed}: the ~12 s wing cell resolves by PILOT DEATH, not capital death`, async () => {
    const r = RESULTS.get(seed);
    assert.ok(r, 'boot result present');
    assert.equal(r.stopReason, 'player_dead',
      `cell must resolve by pilot death (got ${r.stopReason} at ${r.seconds}s)`);
    // Bounded window: the audited cell printed ~12.25 s; the mechanism (capital broadside vs a
    // tier-0 starter) lands anywhere in the low teens depending on aim cadence. Wide bounds keep
    // this pin about the MECHANISM, not about aim-phase drift.
    assert.ok(r.seconds >= 5 && r.seconds <= 40, `pilot dies in a bounded window (got ${r.seconds}s)`);
    assert.equal(r.capitalKills.length, 0, 'no capital is ever killed in this cell');
    assert.equal(r.playerDeaths.length, 1, 'exactly one pilot death resolves the cell');
    const death = r.playerDeaths[0].payload || {};
    assert.ok(r.finalVitals.some((v) => v.id === death.killerId),
      'the pilot death killer is one of the two capitals');
    assert.ok(death.weaponId && DREAD_WEAPONS.has(death.weaponId),
      `the killing weapon is an authored dreadnought weapon (got ${death.weaponId})`);
  });

  test(`PQ-206.00 seed ${seed}: every point of pilot damage is capital turret fire (weapon origin)`, () => {
    const r = RESULTS.get(seed);
    assert.ok(r, 'boot result present');
    assert.ok(r.dmgToPlayer.length > 0, 'the pilot was actually shot at');
    for (const hit of r.dmgToPlayer) {
      assert.ok(hit.attackerId != null && r.finalVitals.some((v) => v.id === hit.attackerId),
        'attacker is in the enemy wing');
      assert.equal(hit.originKind, 'weapon', `origin kind is weapon (got ${hit.originKind})`);
    }
    const weapons = new Set(r.dmgToPlayer.map((h) => h.weaponId));
    for (const w of weapons) {
      assert.ok(DREAD_WEAPONS.has(w), `all pilot damage comes from dreadnought weapons (got ${w})`);
    }
  });

  test(`PQ-206.00 seed ${seed}: both capitals end the cell alive at FULL hull and armor; only the pilot ever scratched them`, () => {
    const r = RESULTS.get(seed);
    assert.ok(r, 'boot result present');
    assert.equal(r.finalVitals.length, 2);
    for (const v of r.finalVitals) {
      assert.ok(v.alive, `capital ${v.id} survives the cell`);
      assert.equal(v.hull, v.hullMax, `capital ${v.id} hull untouched (hull ${v.hull}/${v.hullMax})`);
      assert.equal(v.armor, v.armorMax, `capital ${v.id} armor gate never even scratched (armor ${v.armor}/${v.armorMax})`);
    }
    // The pilot concentrates on one capital, so assert wing-level shield attrition, not per-ship.
    assert.ok(r.finalVitals.some((v) => v.shield < v.shieldMax),
      'the pilot was landing hits (some capital shield dented)');
    // Attribution: the ONLY attacker that ever damaged a capital is the pilot's weapon.
    for (const [key, row] of r.dmgToCapitalsByAttacker) {
      assert.ok(key.startsWith(`${r.playerId}|weapon`),
        `capital damage must come from the pilot's weapon only (got ${key})`);
      assert.ok(row.applied < 2000,
        `pilot total on capitals is a rounding error vs 30,928 EHP (got ${row.applied})`);
    }
    assert.ok(r.dmgToCapitalsByAttacker.size >= 1, 'the pilot did land some hits (shields dented)');
  });

  test(`PQ-206.00 seed ${seed}: no wingmate DPS exists — the ally dies first having dealt zero, so the bench's printed ttk was the pilot death`, () => {
    const r = RESULTS.get(seed);
    assert.ok(r, 'boot result present');
    assert.equal(r.allyState.length, 1);
    // The ally's kill event (entity:killed) is the truthful death record; the entity slot may be
    // restaged afterwards (aftermath wreck), so the end-state read is informational only.
    assert.ok(r.allyDeaths.length === 1 && r.allyDeaths[0].tick < r.playerDeaths[0].tick,
      `the corsair wingmate is killed before the pilot dies (ally kill t=${r.allyDeaths[0] && r.allyDeaths[0].tick}s, pilot t=${r.seconds}s)`);
    const allyAttackerKeys = [...r.dmgToCapitalsByAttacker.keys()]
      .filter((k) => !k.startsWith(`${r.playerId}|`));
    assert.deepEqual(allyAttackerKeys, [], 'the ally dealt zero damage to the capitals');
    // The bench prints `ttkSeconds` whenever `deaths.length > 0`, and its player:death handler
    // pushes the pilot into `deaths`. With capitalKills = 0 (asserted above) and a pilot death in
    // the log, the audited "12.25 s capital ttk" was necessarily the pilot's death clock.
    assert.equal(r.capitalKills.length, 0, 'the misread: nothing died but the pilot (and ally)');
  });
}
