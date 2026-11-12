// AL-LG-11 — three real rams earn ONE Scarred Ram Plate, and only the hull that earned it can
// fit it. build-map row 401 · design/program/agentic-run-oct20/out/R401/plan.md §6 (seed 4242).
//
// Every assertion below serves one sentence of `design/VISION.md` Part II: a hull that has done
// something carries the evidence of it — and an identical twin cannot borrow the reward, because
// the plate is a physical keepsake with a history, not a catalogue part with a price.
//
//   node --test test/al-long-3-scarred-ram-plate-4242.test.mjs
import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { COMBAT_FLAGS } from '../src/data/featureFlags.js';
import { MODULES } from '../src/data/modules.js';
import { SHIPS } from '../src/data/ships.js';
import { save } from '../src/save/saveSystem.js';
import { createCombatCatalog } from '../src/combat/runtime.js';
import {
  buildSlotList,
  fits,
  getDerivedStats,
  normalizeRamPlateHistory,
  ships as shipsProto,
} from '../src/systems/ships.js';
import { collisionConsequences, playerRamPlateImpact } from '../src/systems/collisionConsequences.js';
import { instanceIdentityText } from '../src/systems/shipLedger.js';
import { shipCarriesModule } from '../src/data/starterJobs.js';
import { swarmSellPrice } from '../src/data/survivalDraft.js';

const SEED = 4242;
const KESTREL = 'ship_kestrel';
const SCARRED = 'mod_ram_plate_scarred';
const BASE_PLATE = 'mod_ram_plate';
const PLAYER_ID = 1;
const RAM_TARGET_ID = 2;
const SAVE_LABEL = 'al-long-3-scarred-ram-plate-4242';

const SHIP_BY_ID = new Map(SHIPS.map((def) => [def.id, def]));
const MODULE_BY_ID = new Map(MODULES.map((def) => [def.id, def]));
const KESTREL_SLOTS = buildSlotList(SHIP_BY_ID.get(KESTREL));
const UTILITY_SLOT = KESTREL_SLOTS.findIndex((slot) => slot.type === 'utility' && slot.size === 'S');

// ── fixtures ─────────────────────────────────────────────────────────────────────────────────

function hullRecord() {
  return {
    defId: KESTREL,
    fittings: new Array(KESTREL_SLOTS.length).fill(null),
    fittedInstances: {},
  };
}

/** The flying hull. `data.derived` starts empty on purpose: a bare-hull ram is `direct_contact`,
 *  and only a fitted plate moves the receipt onto `ram_plate`. */
function playerEntity() {
  return {
    id: PLAYER_ID,
    type: 'ship',
    alive: true,
    team: 0,
    factionId: 'faction_free',
    radius: 12,
    mass: 60,
    rot: 0,
    pos: { x: -80, z: 0 },
    vel: { x: 0, z: 0 },
    hull: 480,
    hullMax: 480,
    armorHp: 0,
    armorMax: 0,
    armorFlat: 0,
    shield: 0,
    shieldMax: 0,
    cap: 100,
    capMax: 100,
    capRegen: 5,
    lastDamageT: -1e9,
    flags: {},
    data: { defId: KESTREL, fittings: [], derived: {}, combatProfileId: 'combat_profile_standard_ship' },
  };
}

/** The struck hull: a real hostile ship (team 1, declared hostile to team 0) that can take the
 *  consequence without dying, so one fixture can deliver four rams. */
function ramTarget() {
  return {
    id: RAM_TARGET_ID,
    type: 'ship',
    alive: true,
    team: 1,
    factionId: 'faction_test_raid',
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    rot: 0,
    angVel: 0,
    radius: 10,
    mass: 20,
    hull: 500,
    hullMax: 500,
    armorHp: 0,
    armorMax: 0,
    armorFlat: 0,
    shield: 0,
    shieldMax: 0,
    cap: 100,
    capMax: 100,
    capRegen: 5,
    lastDamageT: -1e9,
    flags: {},
    data: {
      defId: 'ship_wasp',
      derived: { damageReductionMult: 1 },
      combatProfileId: 'combat_profile_standard_ship',
      // `isHostileToPlayer` reads the declared hostile teams; `combat.targetId` names the player so
      // the target is hostile for a reason a player could point at, not because of a bare team id.
      ai: { hostileTeams: [0] },
      combat: { targetId: PLAYER_ID },
    },
  };
}

/** One live world: two owned copies of the SAME hull definition, the player flying berth 0. */
function world({ seed = SEED } = {}) {
  const state = createGameState(seed);
  state.mode = 'flight';
  state.playerId = PLAYER_ID;
  state.player.credits = 100_000;
  state.player.moduleInventory = [];
  state.player.loadoutPresets = [];
  state.player.ownedShips = [hullRecord(), hullRecord()];
  state.player.activeShipIndex = 0;
  state.ui.docked = true;
  state.ui.dockedStationId = 'station_helios';
  const player = playerEntity();
  const target = ramTarget();
  state.entities.set(player.id, player);
  state.entities.set(target.id, target);
  state.entityList.push(player, target);

  const bus = createBus();
  const toasts = [];
  const events = { refusals: [], equipped: [], applied: [], rejected: [], granted: [], refusedCredits: [] };
  bus.on('toast', (payload) => toasts.push(payload));
  bus.on('module:fitRefused', (payload) => events.refusals.push(payload));
  bus.on('module:equipped', (payload) => events.equipped.push(payload));
  bus.on('module:granted', (payload) => events.granted.push(payload));
  bus.on('ship:loadoutPresetApplied', (payload) => events.applied.push(payload));
  bus.on('ship:loadoutPresetApplyRejected', (payload) => events.rejected.push(payload));
  bus.on('economy:chargeCredits', (payload) => events.refusedCredits.push(payload));

  const ships = Object.create(shipsProto);
  ships.init({ state, bus, helpers: {} });
  return { state, bus, ships, player, target, toasts, events };
}

/** The LIVE collision owner — the only sanctioned producer of ram evidence. */
function attachCollision(w) {
  const receipts = [];
  const routed = [];
  w.bus.on('combat:collisionConsequence', (payload) => receipts.push(payload));
  const kernel = {
    routeDamage(input) {
      routed.push(input);
      return { ok: true, totalApplied: input.packet.channels.kinetic };
    },
    statuses: { schedule() { return { ok: true }; } },
    catalog: createCombatCatalog(),
  };
  const registry = { get: (name) => (name === 'combat' ? { kernel } : null) };
  const collision = Object.create(collisionConsequences);
  collision.init({ state: w.state, bus: w.bus, registry, helpers: {} });
  return { collision, receipts, routed };
}

function enableImpulseConsequences(t) {
  const previous = COMBAT_FLAGS.weaponImpulseConsequences;
  COMBAT_FLAGS.weaponImpulseConsequences = true;
  t.after(() => { COMBAT_FLAGS.weaponImpulseConsequences = previous; });
}

function ramImpact({ tick, aId = PLAYER_ID, bId = RAM_TARGET_ID, causalActorId = PLAYER_ID, impulse = 800 }) {
  return {
    aId,
    bId,
    dp: impulse,
    impulse,
    tick,
    pos: { x: 6, z: 0 },
    normal: { x: -1, z: 0 },
    consequenceKernelVersion: 1,
    backend: 'rapier-dynamic',
    causalActorId,
  };
}

/**
 * Drive one real player ram through the physics contact seam. `stranded` reproduces a deferred
 * contact whose queued resolve never ran: the end-of-step sweep picks it up one tick late, with
 * the ORIGINAL receipt tick — the bounded window this slice must credit (plan §7.3).
 */
function deliverRam(rig, w, { tick, stranded = false, ...overrides } = {}) {
  w.state.tick = tick;
  w.state.simTime = tick / 60;
  w.bus.emit('physics:impact', ramImpact({ tick, ...overrides }));
  if (stranded) {
    w.state.tick = tick + 1;
    rig.collision.update(1 / 60, w.state);
    return;
  }
  rig.collision.update(1 / 60, w.state);
  w.bus.flush();
}

function ramReceipt(tick, { targetId = RAM_TARGET_ID, stateTick = tick } = {}) {
  return {
    stateTick,
    receipt: {
      tick,
      targetId,
      otherId: PLAYER_ID,
      targetType: 'ship',
      targetHostile: true,
      damageApplied: true,
      impactDamage: 24,
      provenance: { actorId: PLAYER_ID, weaponId: null, tag: 'direct_contact', appliedTick: tick },
    },
  };
}

/** Deliver one committed ram receipt through the canonical channel (no private method call). */
function recordRam(w, tick, options = {}) {
  const { stateTick, receipt } = ramReceipt(tick, options);
  w.state.tick = stateTick;
  w.bus.emit('combat:collisionConsequence', receipt);
  return receipt;
}

/** Earn one plate on the active hull and return the earned instance ID. */
function earnPlate(w, { from = 600, targetId = RAM_TARGET_ID } = {}) {
  for (let i = 0; i < 3; i += 1) recordRam(w, from + i * 6, { targetId });
  const owned = w.state.player.ownedShips[w.state.player.activeShipIndex];
  const history = normalizeRamPlateHistory(owned && owned.ramPlateHistory);
  return history && history.rewardInstanceId ? history.rewardInstanceId : null;
}

function scarredRecords(state) {
  return (state.player.moduleInventory || []).filter((item) => item && item.defId === SCARRED);
}

function earnedToasts(toasts) {
  return toasts.filter((toast) => /^Scarred Ram Plate earned/.test(String(toast && toast.text)));
}

function presetFittings() {
  const fittings = new Array(KESTREL_SLOTS.length).fill(null);
  fittings[UTILITY_SLOT] = SCARRED;
  return fittings;
}

function persist(w) {
  w.state.meta.createdAt = SAVE_LABEL;
  const writer = Object.create(save);
  writer.init({ state: w.state, bus: w.bus, helpers: {}, registry: { get() { return null; } } });
  return JSON.parse(JSON.stringify(writer.serializeData()));
}

/** Boot a fresh world from a serialized player record and run the real Continue path. */
function continueWorld(data) {
  const state = createGameState(SEED);
  state.mode = 'flight';
  state.playerId = PLAYER_ID;
  state.meta.createdAt = SAVE_LABEL;
  const player = playerEntity();
  state.entities.set(player.id, player);
  state.entityList.push(player);
  const bus = createBus();
  const toasts = [];
  bus.on('toast', (payload) => toasts.push(payload));
  const ships = Object.create(shipsProto);
  ships.init({ state, bus, helpers: {} });
  const loader = Object.create(save);
  loader.init({ state, bus, helpers: {}, registry: { get() { return null; } } });
  loader._restorePlayer(data.player);
  bus.emit('save:loaded', { slot: SAVE_LABEL });
  return { state, bus, ships, toasts };
}

// ── 1. threshold and idempotence ─────────────────────────────────────────────────────────────

test('three qualifying rams earn exactly one plate; replays and later rams add none', (t) => {
  enableImpulseConsequences(t);
  const w = world();
  const rig = attachCollision(w);
  const hull = w.ships.ownedShip();

  deliverRam(rig, w, { tick: 60 });
  deliverRam(rig, w, { tick: 120 });
  assert.equal(normalizeRamPlateHistory(hull.ramPlateHistory).hits.length, 2);
  assert.equal(scarredRecords(w.state).length, 0, 'two rams are not the earn');
  assert.equal(earnedToasts(w.toasts).length, 0);

  deliverRam(rig, w, { tick: 180 });
  const history = normalizeRamPlateHistory(hull.ramPlateHistory);
  assert.equal(history.hits.length, 3);
  const reward = scarredRecords(w.state);
  assert.equal(reward.length, 1, 'the third ram earns exactly one plate');
  assert.equal(reward[0].instanceId, history.rewardInstanceId, 'the hull history names that one instance');
  assert.equal(reward[0].condition, 'scarred');
  assert.equal(earnedToasts(w.toasts).length, 1);
  assert.equal(earnedToasts(w.toasts)[0].text,
    'Scarred Ram Plate earned — fit it to this hull at Shipworks.',
    'the player is told what happened and where to go');

  // Replaying the recorded third receipt is the same ram, not a fourth.
  const third = rig.receipts[rig.receipts.length - 1];
  w.state.tick = third.tick;
  w.bus.emit('combat:collisionConsequence', third);
  assert.equal(hull.ramPlateHistory.hits.length, 3, 'a duplicate receipt is the same ram');

  // A genuinely new ram after the earn still cannot mint a second plate.
  deliverRam(rig, w, { tick: 240 });
  assert.equal(scarredRecords(w.state).length, 1, 'one hull, one plate');
  assert.equal(earnedToasts(w.toasts).length, 1, 'and the earned toast is never repeated');
  assert.equal(hull.ramPlateHistory.rewardInstanceId, reward[0].instanceId);
  assert.equal(hull.ramPlateHistory.hits.length, 3, 'the record stops at three');
  assert.ok(rig.receipts.length >= 4, 'the live collision owner did emit every contact');
});

// ── 2. the live producer is the only evidence ───────────────────────────────────────────────

test('the live collision owner is the producer: three real rams at 120/180/240 earn the plate', (t) => {
  enableImpulseConsequences(t);
  const w = world();
  const rig = attachCollision(w);

  deliverRam(rig, w, { tick: 120 });
  deliverRam(rig, w, { tick: 180 });
  assert.equal(scarredRecords(w.state).length, 0);

  // The third ram arrives through the deferred end-of-step sweep one tick late, carrying the tick
  // it actually happened — the bounded window (§7.3/§8.4) must still credit it.
  deliverRam(rig, w, { tick: 240, stranded: true });
  assert.equal(w.state.tick, 241);

  const rams = rig.receipts.filter((receipt) => receipt.targetType === 'ship'
    && receipt.otherId === PLAYER_ID && receipt.targetId === RAM_TARGET_ID);
  assert.equal(rams.length, 3, 'three committed, player-caused ship contacts');
  assert.deepEqual(rams.map((receipt) => receipt.tick), [120, 180, 240]);
  assert.equal(rams.every((receipt) => receipt.damageApplied === true && receipt.impactDamage > 0), true,
    'only applied damage is a ram');
  assert.equal(rams.every((receipt) => receipt.targetHostile === true), true,
    'only a hostile hull is a ram');
  assert.equal(rams.every((receipt) => receipt.provenance.actorId === PLAYER_ID), true,
    'the player is the causal body');
  assert.equal(rams.every((receipt) => receipt.provenance.tag === 'direct_contact'
    || receipt.provenance.tag === 'ram_plate'), true);

  const history = normalizeRamPlateHistory(w.ships.ownedShip().ramPlateHistory);
  assert.deepEqual(history.hits, ['120:2', '180:2', '240:2'],
    'the receipts themselves wrote the history — no direct method call did');
  assert.equal(scarredRecords(w.state).length, 1);
  assert.equal(scarredRecords(w.state)[0].instanceId, history.rewardInstanceId);
});

// ── 3. rejected evidence ────────────────────────────────────────────────────────────────────

test('rejected evidence never becomes a ram', () => {
  const w = world();
  const hull = w.ships.ownedShip();
  const base = {
    tick: 300,
    targetId: RAM_TARGET_ID,
    otherId: PLAYER_ID,
    targetType: 'ship',
    targetHostile: true,
    damageApplied: true,
    impactDamage: 24,
    provenance: { actorId: PLAYER_ID, weaponId: null, tag: 'direct_contact', appliedTick: 300 },
  };
  const emit = (receipt) => w.bus.emit('combat:collisionConsequence', receipt);

  w.state.tick = 300;
  emit(base);
  assert.equal(hull.ramPlateHistory.hits.length, 1, 'the control receipt is a real ram');

  // The window is bounded, not open: three ticks late is the deferred-contact allowance...
  w.state.tick = 399;
  emit({ ...base, tick: 396, provenance: { ...base.provenance, appliedTick: 396 } });
  assert.equal(hull.ramPlateHistory.hits.length, 2, 'a receipt three ticks late still counts');

  const rows = [
    {
      label: 'stale tick (one past the window)',
      at: 400,
      patch: { tick: 396, provenance: { ...base.provenance, appliedTick: 396 } },
    },
    { label: 'duplicate receipt', at: 300, patch: {} },
    {
      label: 'wrong actor',
      at: 401,
      patch: { tick: 401, provenance: { ...base.provenance, actorId: 99, appliedTick: 401 } },
    },
    { label: 'incoming contact (player is the hit body)', at: 402, patch: { tick: 402, otherId: 99 } },
    { label: 'friendly target', at: 403, patch: { tick: 403, targetHostile: false } },
    { label: 'non-ship target', at: 404, patch: { tick: 404, targetType: 'drone' } },
    { label: 'zero impact damage', at: 405, patch: { tick: 405, impactDamage: 0 } },
    { label: 'damage not applied', at: 406, patch: { tick: 406, damageApplied: false } },
    {
      label: 'weapon provenance',
      at: 407,
      patch: {
        tick: 407,
        provenance: { ...base.provenance, tag: 'weapon_hit', weaponId: 'wpn_railgun_m', appliedTick: 407 },
      },
    },
    {
      label: 'massline provenance',
      at: 408,
      patch: {
        tick: 408,
        provenance: { ...base.provenance, tag: 'massline', weaponId: 'massline', appliedTick: 408 },
      },
    },
    {
      label: 'flail provenance',
      at: 409,
      patch: {
        tick: 409,
        provenance: { ...base.provenance, tag: 'tow_flail', weaponId: 'mod_mass_flail_rig', appliedTick: 409 },
      },
    },
    { label: 'missing provenance', at: 410, patch: { tick: 410, provenance: null } },
    { label: 'missing tick', at: 411, patch: { tick: undefined } },
    { label: 'missing target', at: 412, patch: { tick: 412, targetId: null } },
    { label: 'player as target', at: 413, patch: { tick: 413, targetId: PLAYER_ID, otherId: RAM_TARGET_ID } },
  ];

  for (const row of rows) {
    const before = JSON.stringify(hull.ramPlateHistory);
    const held = w.state.player.moduleInventory.length;
    w.state.tick = row.at;
    emit({ ...base, ...row.patch });
    assert.equal(JSON.stringify(hull.ramPlateHistory), before, `${row.label}: no history written`);
    assert.equal(w.state.player.moduleInventory.length, held, `${row.label}: no item minted`);
  }
  assert.equal(hull.ramPlateHistory.hits.length, 2, 'only the two admitted rams are on record');
  assert.equal(scarredRecords(w.state).length, 0);
});

// ── 4. hull-specific eligibility ───────────────────────────────────────────────────────────

test('an untouched twin cannot fit the plate by UI intent, direct call, or preset', () => {
  const w = world();
  const aId = earnPlate(w, { from: 600 });
  const [hullA, hullB] = w.state.player.ownedShips;
  const plate = scarredRecords(w.state).find((item) => item.instanceId === aId);
  assert.ok(plate);
  const credits = w.state.player.credits;

  // — the station intent (a forged packet cannot name a hull that never earned it) —
  w.state.player.activeShipIndex = 1;
  w.bus.emit('ui:fitModule', { shipIndex: 1, slotIndex: UTILITY_SLOT, instanceId: aId });
  assert.equal(hullB.fittings[UTILITY_SLOT], null);
  assert.deepEqual(hullB.fittedInstances, {});
  assert.equal(w.events.equipped.length, 0, 'nothing was mounted');
  assert.equal(w.events.refusals.at(-1).reason, 'hull_history_required');
  assert.ok(w.toasts.some((toast) => toast.text === 'This hull has not earned a Scarred Ram Plate.'),
    'the refusal says why, in the player\'s words');
  assert.equal(scarredRecords(w.state).length, 1, 'the plate stayed in the hold');
  assert.equal(w.state.player.credits, credits, 'a refused fit never spends');

  // — the direct owner call —
  assert.equal(w.ships.fitModule({ shipIndex: 1, slotIndex: UTILITY_SLOT, instanceId: aId }), false);
  assert.equal(w.events.refusals.at(-1).reason, 'hull_history_required');
  assert.equal(hullB.fittings[UTILITY_SLOT], null);

  // — a saved build that names the plate: the twin simply does not have it in stock —
  w.state.player.loadoutPresets = [{
    id: 'preset_ram_a', hullDefId: KESTREL, fittings: presetFittings(), labelKey: 'role', createdAt: 0,
  }];
  assert.equal(w.ships.applyLoadoutPreset({ shipIndex: 1, presetId: 'preset_ram_a' }), false);
  assert.equal(w.events.rejected.length, 1);
  assert.equal(w.events.rejected[0].reason, 'missing_modules',
    'the plate is held out of the twin\'s stock count, so the apply fails before it commits');
  assert.equal(hullB.fittings[UTILITY_SLOT], null);
  assert.equal(scarredRecords(w.state).length, 1);
  assert.equal(w.state.player.credits, credits);

  // — the earning hull can fit, unfit and refit the SAME instance —
  w.state.player.activeShipIndex = 0;
  w.bus.emit('ui:fitModule', { shipIndex: 0, slotIndex: UTILITY_SLOT, instanceId: aId });
  assert.equal(hullA.fittings[UTILITY_SLOT], SCARRED);
  assert.equal(hullA.fittedInstances[UTILITY_SLOT].instanceId, aId);
  assert.equal(hullA.fittedInstances[UTILITY_SLOT].condition, 'scarred');
  assert.equal(scarredRecords(w.state).length, 0);

  assert.equal(w.ships.unfitModule({ shipIndex: 0, slotIndex: UTILITY_SLOT }), true);
  const held = scarredRecords(w.state);
  assert.equal(held.length, 1);
  assert.equal(held[0].instanceId, aId, 'unfitting returns the identity, never a fresh mint');

  assert.equal(w.ships.fitModule({ shipIndex: 0, slotIndex: UTILITY_SLOT, instanceId: aId }), true);
  assert.equal(hullA.fittedInstances[UTILITY_SLOT].instanceId, aId);
});

// ── 5. two earning twins ───────────────────────────────────────────────────────────────────

test('two identical hulls earn different plates; each accepts only its own', () => {
  const w = world();
  const aId = earnPlate(w, { from: 600 });
  w.state.player.activeShipIndex = 1;
  const bId = earnPlate(w, { from: 900 });
  assert.equal(typeof aId, 'string');
  assert.equal(typeof bId, 'string');
  assert.notEqual(aId, bId, 'two earns are two physical plates');

  const [hullA, hullB] = w.state.player.ownedShips;
  assert.equal(hullA.ramPlateHistory.rewardInstanceId, aId);
  assert.equal(hullB.ramPlateHistory.rewardInstanceId, bId);
  assert.equal(scarredRecords(w.state).length, 2);
  const credits = w.state.player.credits;

  // Neither hull will take the other's plate.
  assert.equal(w.ships.fitModule({ shipIndex: 0, slotIndex: UTILITY_SLOT, instanceId: bId }), false);
  assert.equal(w.ships.fitModule({ shipIndex: 1, slotIndex: UTILITY_SLOT, instanceId: aId }), false);
  assert.equal(hullA.fittings[UTILITY_SLOT], null);
  assert.equal(hullB.fittings[UTILITY_SLOT], null);
  assert.equal(scarredRecords(w.state).length, 2, 'both plates are still in the hold');
  assert.equal(w.state.player.credits, credits);

  // Each takes its own.
  assert.equal(w.ships.fitModule({ shipIndex: 0, slotIndex: UTILITY_SLOT, instanceId: aId }), true);
  assert.equal(w.ships.fitModule({ shipIndex: 1, slotIndex: UTILITY_SLOT, instanceId: bId }), true);
  assert.equal(hullA.fittedInstances[UTILITY_SLOT].instanceId, aId);
  assert.equal(hullB.fittedInstances[UTILITY_SLOT].instanceId, bId);
  assert.equal(w.ships.unfitModule({ shipIndex: 0, slotIndex: UTILITY_SLOT }), true);
  assert.equal(w.ships.unfitModule({ shipIndex: 1, slotIndex: UTILITY_SLOT }), true);
  assert.equal(scarredRecords(w.state).length, 2);

  // Both plates sit in the SAME hold: the preset must seat the flown hull's own instance.
  w.state.player.loadoutPresets = [{
    id: 'preset_twin', hullDefId: KESTREL, fittings: presetFittings(), labelKey: 'role', createdAt: 0,
  }];
  assert.equal(w.ships.applyLoadoutPreset({ shipIndex: 0, presetId: 'preset_twin' }), true);
  assert.equal(hullA.fittedInstances[UTILITY_SLOT].instanceId, aId, 'A seats its own earned instance');
  const stillHeld = scarredRecords(w.state);
  assert.equal(stillHeld.length, 1);
  assert.equal(stillHeld[0].instanceId, bId, 'B\'s plate was held out of the apply, not borrowed');

  assert.equal(w.ships.applyLoadoutPreset({ shipIndex: 1, presetId: 'preset_twin' }), true);
  assert.equal(hullB.fittedInstances[UTILITY_SLOT].instanceId, bId, 'B seats its own earned instance');
  assert.equal(hullA.fittedInstances[UTILITY_SLOT].instanceId, aId, 'and A keeps its own');
  assert.equal(scarredRecords(w.state).length, 0);
});

// ── 6. no mint bypass ─────────────────────────────────────────────────────────────────────

test('no purchase, generic grant, or defId-only fit can mint a second plate', () => {
  const w = world();
  const aId = earnPlate(w, { from: 600 });
  const credits = w.state.player.credits;
  const before = scarredRecords(w.state).length;
  assert.equal(before, 1);
  assert.equal(w.events.granted.filter((row) => row.defId === SCARRED).length, 1,
    'the earn is the only mint announced so far');

  w.bus.emit('ui:buyModule', { defId: SCARRED, shipIndex: 0, fitSlotIndex: UTILITY_SLOT });
  assert.equal(w.ships.buyModule({ defId: SCARRED }), false);
  assert.equal(w.ships.buyModule({ defId: SCARRED, shipIndex: 0, fitSlotIndex: UTILITY_SLOT }), false);
  w.bus.emit('ships:grantModule', { defId: SCARRED, reason: 'mission_reward' });
  assert.equal(w.ships.grantModule({ defId: SCARRED, reason: 'salvage_reward' }), false);
  assert.equal(w.ships.fitModule({ shipIndex: 0, slotIndex: UTILITY_SLOT, defId: SCARRED }), false,
    'a defId-only fit would mint a fresh earned copy');

  assert.equal(scarredRecords(w.state).length, before, 'no extra copy');
  assert.equal(w.events.granted.filter((row) => row.defId === SCARRED).length, 1, 'no extra mint receipt');
  assert.equal(w.events.refusedCredits.length, 0, 'a refused purchase charges nothing');
  assert.equal(w.state.player.credits, credits);
  assert.equal(w.state.player.ownedShips[0].fittings[UTILITY_SLOT], null);
  assert.equal(w.events.refusals.at(-1).reason, 'hull_history_required');

  // The ONE sanctioned second door (PLAN-GATE §8, NG+ keepsake crash path): a keepsake mint is a
  // souvenir — scarred, named, and permanently unfittable, exactly like a sold hull's orphan.
  assert.equal(w.ships.grantModule({ defId: SCARRED, reason: 'new-game-plus:ending_reach' }), true);
  const keepsake = scarredRecords(w.state).find((item) => item.instanceId !== aId);
  assert.ok(keepsake);
  assert.equal(keepsake.condition, 'scarred');
  assert.equal(keepsake.provenance.source, 'new-game-plus');
  assert.equal(w.ships.fitModule({ shipIndex: 0, slotIndex: UTILITY_SLOT, instanceId: keepsake.instanceId }), false,
    'a souvenir is not a hull history');
  assert.equal(w.state.player.ownedShips[0].fittings[UTILITY_SLOT], null);
  assert.equal(w.state.player.credits, credits);
});

// ── 7. save continuation ───────────────────────────────────────────────────────────────────

test('the earn, the binding and the label survive Continue; loading never mints', () => {
  const w = world();
  const hull = w.ships.ownedShip();
  recordRam(w, 60);
  recordRam(w, 120);
  assert.equal(hull.ramPlateHistory.hits.length, 2);

  const continued = continueWorld(persist(w));
  assert.equal(continued.state.player.ownedShips[0].ramPlateHistory.hits.length, 2,
    'the two rams came back');
  assert.equal(scarredRecords(continued.state).length, 0, 'loading mints nothing');
  assert.equal(earnedToasts(continued.toasts).length, 0, 'and says nothing');

  recordRam(continued, 180);
  const earned = scarredRecords(continued.state);
  assert.equal(earned.length, 1, 'the third ram after Continue earns once');
  const earnedId = earned[0].instanceId;
  assert.equal(continued.state.player.ownedShips[0].ramPlateHistory.rewardInstanceId, earnedId);

  // Fitted: the slot keeps its exact identity across Continue, and the plate still answers.
  assert.equal(continued.ships.fitModule({ shipIndex: 0, slotIndex: UTILITY_SLOT, instanceId: earnedId }), true);
  const fitted = continueWorld(persist(continued));
  assert.equal(fitted.state.player.ownedShips[0].fittedInstances[UTILITY_SLOT].instanceId, earnedId,
    'the bound instance is still in the slot');
  assert.equal(fitted.state.player.ownedShips[0].ramPlateHistory.rewardInstanceId, earnedId);
  assert.equal(scarredRecords(fitted.state).length, 0, 'no duplicate on load');
  assert.equal(earnedToasts(fitted.toasts).length, 0, 'Continue never re-announces the earn');
  assert.equal(fitted.ships.unfitModule({ shipIndex: 0, slotIndex: UTILITY_SLOT }), true);
  assert.equal(fitted.ships.fitModule({ shipIndex: 0, slotIndex: UTILITY_SLOT, instanceId: earnedId }), true);

  // Unfitted: the hold record keeps its identity, condition and provenance.
  const held = continueWorld(persist(fitted));
  const heldRecords = scarredRecords(held.state);
  assert.equal(heldRecords.length, 0, 'the fitted leg came back fitted');
  assert.equal(held.ships.unfitModule({ shipIndex: 0, slotIndex: UTILITY_SLOT }), true);
  const refitted = continueWorld(persist(held));
  const carried = scarredRecords(refitted.state);
  assert.equal(carried.length, 1);
  assert.equal(carried[0].instanceId, earnedId);
  assert.equal(carried[0].condition, 'scarred');
  assert.match(String(carried[0].provenance && carried[0].provenance.label), /Tessera/,
    'the hull history still says which ship earned it');
  assert.equal(refitted.state.player.ownedShips[0].ramPlateHistory.rewardInstanceId, earnedId);
  assert.equal(earnedToasts(refitted.toasts).length, 0);
});

// ── 8. legacy / malformed defaults ─────────────────────────────────────────────────────────

test('absent history stays absent, forged history earns nothing, an illegal fitting returns to the hold', () => {
  const w = world();
  const [hullA, hullB] = w.state.player.ownedShips;
  assert.equal(Object.hasOwn(hullB, 'ramPlateHistory'), false);

  w.bus.emit('save:loaded', { slot: 'legacy' });
  assert.equal(Object.hasOwn(hullB, 'ramPlateHistory'), false, 'Continue does not invent a history');
  assert.deepEqual(hullB.fittings, hullA.fittings, 'a legacy hull is otherwise untouched');

  hullB.ramPlateHistory = { version: 1, hits: ['nonsense', '12:2', '12:2'] };
  w.bus.emit('save:loaded', { slot: 'malformed' });
  assert.equal(Object.hasOwn(hullB, 'ramPlateHistory'), false, 'a malformed record is dropped, not repaired');
  assert.equal(scarredRecords(w.state).length, 0, 'a forged record grants nothing');

  hullB.ramPlateHistory = { version: 1, hits: ['1:2', '2:2', '3:2'] };
  w.bus.emit('save:loaded', { slot: 'unrewarded' });
  assert.equal(scarredRecords(w.state).length, 0, 'restoration never awards a plate');

  hullB.ramPlateHistory = { version: 1, hits: ['1:2', '2:2', '3:2', '4:2'] };
  w.bus.emit('save:loaded', { slot: 'oversized' });
  assert.equal(Object.hasOwn(hullB, 'ramPlateHistory'), false, 'an oversized record cannot smuggle a hit in');

  // A save that left an unearned scarred fitting on the twin: the EXACT record goes to the hold.
  hullB.fittings[UTILITY_SLOT] = SCARRED;
  hullB.fittedInstances = {
    [UTILITY_SLOT]: {
      instanceId: 'mi_9_1', defId: SCARRED, condition: 'scarred',
      provenance: { label: 'forged fitting', source: 'test' },
    },
  };
  w.bus.emit('save:loaded', { slot: 'illegal-fit' });
  assert.equal(hullB.fittings[UTILITY_SLOT], null);
  assert.equal(Object.hasOwn(hullB.fittedInstances, UTILITY_SLOT), false);
  const returned = scarredRecords(w.state);
  assert.equal(returned.length, 1);
  assert.equal(returned[0].instanceId, 'mi_9_1', 'the original instance, not a fresh mint');
  assert.equal(returned[0].provenance.label, 'forged fitting');
});

// ── 9. gameplay and presentation ──────────────────────────────────────────────────────────

test('the scarred plate plays exactly like the ram plate and names its hull', () => {
  const w = world();
  const aId = earnPlate(w, { from: 600 });
  const slot = KESTREL_SLOTS[UTILITY_SLOT];
  assert.ok(slot, 'the Kestrel has a utility slot');
  assert.equal(slot.type, 'utility');
  assert.equal(fits(slot, MODULE_BY_ID.get(SCARRED)), true, 'it fits an existing utility slot');

  const baseFittings = new Array(KESTREL_SLOTS.length).fill(null);
  baseFittings[UTILITY_SLOT] = BASE_PLATE;
  const scarredFittings = new Array(KESTREL_SLOTS.length).fill(null);
  scarredFittings[UTILITY_SLOT] = SCARRED;
  const base = getDerivedStats(KESTREL, baseFittings, w.state.player);
  const scarred = getDerivedStats(KESTREL, scarredFittings, w.state.player);
  assert.deepEqual(scarred, base, 'the same plate, not a second damage tier');
  assert.equal(scarred.ramDamageDealtMult, 1.80);

  const provenance = { actorId: PLAYER_ID, weaponId: null, tag: 'direct_contact', appliedTick: 120 };
  const baseImpact = playerRamPlateImpact(
    { id: PLAYER_ID, type: 'ship', alive: true, data: { derived: base } },
    PLAYER_ID, 120, provenance, w.state,
  );
  const scarredImpact = playerRamPlateImpact(
    { id: PLAYER_ID, type: 'ship', alive: true, data: { derived: scarred } },
    PLAYER_ID, 120, provenance, w.state,
  );
  assert.deepEqual(scarredImpact, baseImpact, 'the ram consequence is identical');
  assert.equal(scarredImpact.damageMultiplier, 1.80);

  const plate = scarredRecords(w.state).find((item) => item.instanceId === aId);
  const text = instanceIdentityText(plate);
  assert.match(text, /Tessera/, 'the label names the hull that earned it');
  assert.match(text, /scarred/, 'and the condition reads scarred');
});

// ── 10. the sold hull leaves a souvenir (deferred to AL-LG-10 resale) ────────────────────────

test('selling the earning hull leaves a permanently unfittable souvenir', () => {
  const w = world();
  const aId = earnPlate(w, { from: 600 });
  assert.equal(w.ships.fitModule({ shipIndex: 0, slotIndex: UTILITY_SLOT, instanceId: aId }), true);

  // Park the earning hull and sell it: the sale routes the EXACT instance back to the hold.
  w.state.player.activeShipIndex = 1;
  assert.equal(w.ships.sellShip(0), true);
  assert.equal(w.state.player.ownedShips.length, 1, 'the earning hull is gone');
  const returned = scarredRecords(w.state);
  assert.equal(returned.length, 1);
  assert.equal(returned[0].instanceId, aId, 'the sale returns the same instance, never a fresh mint');
  assert.equal(returned[0].condition, 'scarred');

  // The hull that earned it no longer exists, so the souvenir can never be fitted again.
  const survivor = w.state.player.ownedShips[0];
  assert.equal(Object.hasOwn(survivor, 'ramPlateHistory'), false);
  assert.equal(w.ships.fitModule({ shipIndex: 0, slotIndex: UTILITY_SLOT, instanceId: aId }), false);
  assert.equal(w.events.refusals.at(-1).reason, 'hull_history_required');
  assert.equal(survivor.fittings[UTILITY_SLOT], null);
  assert.equal(scarredRecords(w.state).length, 1, 'the souvenir stays in the hold, never deleted');
});

// ── 11. the impound carry (defensive, not a live path today) ───────────────────────────────

test('an impound lot that carries a ram history hands it to the hull the pilot buys', () => {
  const w = world();
  // A LIVE impound lot never carries one — `postImpoundListing` skips the player's own hull —
  // so this pins the defensive carry, not a reachable player path.
  w.state.lossLedger = {
    impound: {
      listingId: 'impound:test',
      lossId: 'loss:test',
      defId: 'ship_wasp',
      price: 1000,
      ramPlateHistory: { version: 1, hits: ['10:2', '20:2', '30:2'], rewardInstanceId: 'mi_10_1' },
    },
  };
  assert.equal(w.ships.buyImpound({ listingId: 'impound:test' }), true);
  const bought = w.state.player.ownedShips[w.state.player.ownedShips.length - 1];
  assert.deepEqual(bought.ramPlateHistory, {
    version: 1,
    hits: ['10:2', '20:2', '30:2'],
    rewardInstanceId: 'mi_10_1',
  }, 'the bought hull remembers the rams it carried');

  // A malformed carried record grants nothing and is not copied across.
  w.state.lossLedger = {
    impound: {
      listingId: 'impound:test2',
      lossId: 'loss:test2',
      defId: 'ship_wasp',
      price: 1000,
      ramPlateHistory: { version: 1, hits: ['nonsense'] },
    },
  };
  assert.equal(w.ships.buyImpound({ listingId: 'impound:test2' }), true);
  const second = w.state.player.ownedShips[w.state.player.ownedShips.length - 1];
  assert.equal(Object.hasOwn(second, 'ramPlateHistory'), false, 'a malformed record is not carried');
});

// ── 12. two hulls named the same keep separately selectable plates ──────────────────────────

test('identically named hulls mint distinguishable plates the chooser cannot merge', () => {
  const w = world();
  // Both owned hulls carry the same owner-given name — the exact collision the Shipworks
  // hold-grouping key (`defId + '|' + instanceIdentityText`) used to merge into one ×2 row
  // whose Fit button only carried the first instance.
  for (const hull of w.state.player.ownedShips) hull.name = 'Tessera';

  const aId = earnPlate(w, { from: 600 });
  w.state.player.activeShipIndex = 1;
  const bId = earnPlate(w, { from: 700 });
  assert.notEqual(aId, bId);
  assert.equal(scarredRecords(w.state).length, 2, 'each hull minted its own plate');

  const [plateA, plateB] = scarredRecords(w.state);
  assert.notEqual(plateA.provenance.label, plateB.provenance.label,
    'two Tesseras cannot produce identical identity text');
  assert.notEqual(instanceIdentityText(plateA), instanceIdentityText(plateB),
    'the chooser grouping key stays distinct — each hull-bound plate keeps its own row');

  // And the binding still holds: hull B's plate refuses on hull A, fits only on hull B,
  // while hull A's own plate still fits hull A.
  assert.equal(w.ships.fitModule({ shipIndex: 0, slotIndex: UTILITY_SLOT, instanceId: bId }), false);
  assert.equal(w.ships.fitModule({ shipIndex: 1, slotIndex: UTILITY_SLOT, instanceId: bId }), true);
  assert.equal(w.ships.fitModule({ shipIndex: 0, slotIndex: UTILITY_SLOT, instanceId: aId }), true);
});

test('AL-LG-11: the scarred plate still counts as ram hardware, and the armory cannot buy it', () => {
  // The Wasp writ's carry gate (missions.js via shipCarriesModule) must see the earned
  // plate as a ram plate — swapping the defId must not silently close the open bounty.
  const hull = { fittings: ['mod_ram_plate_scarred'] };
  assert.equal(shipCarriesModule(hull, 'mod_ram_plate'), true, 'scarred plate satisfies the ram-plate carry gate');
  assert.equal(shipCarriesModule({ fittings: ['mod_ram_plate'] }, 'mod_ram_plate'), true);
  assert.equal(shipCarriesModule({ fittings: [] }, 'mod_ram_plate'), false);
  // A souvenir in the swarm run's shared hold must never be sellable for crumbs — a
  // sale would destroy the keepsake while the hull's rewardInstanceId stayed set.
  assert.equal(swarmSellPrice('mod_ram_plate_scarred'), null, 'armory never prices the keepsake');
  assert.equal(swarmSellPrice('mod_ram_plate') > 0, true, 'ordinary plates still price');
});
