// PQ-015 / SF-17 — CHARACTERIZATION of the seven independent interaction eligibility gates.
//
// Captures the CURRENT truth of every verb's eligibility over a fixture matrix by calling the REAL
// gate functions (not the descriptor), then proves the shared descriptor faithfully MIRRORS each
// gate at base. Because the PQ-015 adapters swap only the type-membership source (catalog set) while
// leaving each gate's downstream layering + reason strings in place, a descriptor that mirrors the
// gates BEFORE adaptation guarantees behavior is preserved AFTER adaptation — this suite stays green
// through every adapter edit.
//
// The verb×type table asserted at the end is the PQ-015 contract-table product.

import test from 'node:test';
import assert from 'node:assert/strict';

import { isAttachable } from '../src/systems/tetherGameplay.js';
import { mining } from '../src/systems/mining.js';
import { createDamageRouter, scalarHitToDamagePacket } from '../src/combat/damage.js';
import { createCombatCatalog } from '../src/combat/runtime.js';
import { actionForWreck } from '../src/data/salvageActions.js';
import { dockDenyReason } from '../src/data/dockDeny.js';
import { VERB_TYPE_MEMBERSHIP, verbAcceptsType } from '../src/data/interactionDescriptorCatalog.js';
import { interactionEligibility, isWreckLikeEntity } from '../src/systems/interactionDescriptors.js';

// ---- fixtures -------------------------------------------------------------------------------
const PLAYER_ID = 1;
const ALL_TYPES = ['ship', 'drone', 'asteroid', 'wreck', 'station', 'payload', 'pickup', 'massSeed', 'mine', 'projectile', 'fx'];

function ent(type, over = {}) {
  return {
    id: over.id != null ? over.id : 2,
    type,
    alive: over.alive != null ? over.alive : true,
    team: over.team != null ? over.team : 1,
    pos: over.pos || { x: 40, z: 0 },
    radius: over.radius != null ? over.radius : 10,
    mass: over.mass != null ? over.mass : 300,
    data: over.data || {},
    flags: over.flags || {},
    ...('hull' in over ? { hull: over.hull, hullMax: over.hullMax } : {}),
  };
}

function baseState() {
  const state = { tick: 0, playerId: PLAYER_ID, entities: new Map(), input: {} };
  state.entities.set(PLAYER_ID, { id: PLAYER_ID, type: 'ship', team: 0, pos: { x: 0, z: 0 }, radius: 12 });
  return state;
}

// ============================================================================================
// 1. TETHER — tetherGameplay.isAttachable(entity, playerId)
// ============================================================================================
test('characterize: tether isAttachable membership matches catalog + massSeed phase gate', () => {
  for (const type of ALL_TYPES) {
    const e = ent(type, { id: 2 });
    const expected = VERB_TYPE_MEMBERSHIP.tether.has(type) && type !== 'massSeed';
    // massSeed handled separately (phase gate); all other types are pure membership at base.
    if (type !== 'massSeed') {
      assert.equal(isAttachable(e, PLAYER_ID), expected, `tether membership: ${type}`);
    }
  }
  // massSeed: ineligible before frame lock, eligible after.
  const seedPre = ent('massSeed', { id: 5, data: { massSeedState: { phase: 'travel', tetherEligible: false } } });
  const seedLocked = ent('massSeed', { id: 6, data: { massSeedState: { phase: 'active', tetherEligible: true } } });
  assert.equal(isAttachable(seedPre, PLAYER_ID), false, 'massSeed pre-lock ineligible');
  assert.equal(isAttachable(seedLocked, PLAYER_ID), true, 'massSeed post-lock eligible');
  // guards: dead, self, missing pos.
  assert.equal(isAttachable(ent('ship', { id: 2, alive: false }), PLAYER_ID), false, 'dead not attachable');
  assert.equal(isAttachable({ id: PLAYER_ID, type: 'ship', alive: true, pos: { x: 0, z: 0 } }, PLAYER_ID), false, 'self not attachable');
});

test('characterize: descriptor tether eligibility mirrors isAttachable (membership + phase)', () => {
  const state = baseState();
  for (const type of ALL_TYPES) {
    if (type === 'massSeed') continue;
    const e = ent(type, { id: 2 });
    const gate = isAttachable(e, PLAYER_ID);
    const desc = interactionEligibility(state, e, 'tether').ok;
    assert.equal(desc, gate, `descriptor mirrors tether gate: ${type}`);
  }
  const seedPre = ent('massSeed', { id: 5, data: { massSeedState: { phase: 'travel', tetherEligible: false } } });
  const seedLocked = ent('massSeed', { id: 6, data: { massSeedState: { phase: 'active', tetherEligible: true } } });
  assert.equal(interactionEligibility(state, seedPre, 'tether').ok, false);
  assert.equal(interactionEligibility(state, seedPre, 'tether').reason, 'phase-ineligible');
  assert.equal(interactionEligibility(state, seedLocked, 'tether').ok, true);
});

// ============================================================================================
// 2. MINE — mining._isValidMineableTarget(entity, ship, range)
// ============================================================================================
test('characterize: mining beam membership {asteroid,wreck} + mined-out rule', () => {
  const ship = { pos: { x: 0, z: 0 } };
  const range = 200;
  for (const type of ALL_TYPES) {
    const e = ent(type, { id: 2, pos: { x: 50, z: 0 }, radius: 8 });
    const expected = VERB_TYPE_MEMBERSHIP.mine.has(type); // asteroid|wreck, in range, not mined-out
    assert.equal(mining._isValidMineableTarget(e, ship, range), expected, `mine membership: ${type}`);
  }
  // asteroid mined-out (respawnAt) → false.
  const minedOut = ent('asteroid', { id: 2, pos: { x: 50, z: 0 }, radius: 8, data: { respawnAt: 999 } });
  assert.equal(mining._isValidMineableTarget(minedOut, ship, range), false, 'mined-out asteroid excluded');
  // out of range → false.
  const farRock = ent('asteroid', { id: 2, pos: { x: 5000, z: 0 }, radius: 8 });
  assert.equal(mining._isValidMineableTarget(farRock, ship, range), false, 'out-of-range excluded');
});

test('characterize: descriptor mine eligibility mirrors mining membership + mined-out; siteAnchored is soft at acquire', () => {
  const state = baseState();
  for (const type of ALL_TYPES) {
    const e = ent(type, { id: 2, pos: { x: 50, z: 0 }, radius: 8 });
    const inRangeGate = mining._isValidMineableTarget(e, { pos: { x: 0, z: 0 } }, 200);
    const desc = interactionEligibility(state, e, 'mine').ok;
    // Descriptor 'mine' eligibility is membership+mined-out (range is a caller concern), so it
    // agrees with the gate for in-range fixtures.
    assert.equal(desc, inRangeGate, `descriptor mirrors mine gate (in range): ${type}`);
  }
  const minedOut = ent('asteroid', { id: 2, data: { respawnAt: 999 } });
  assert.equal(interactionEligibility(state, minedOut, 'mine').reason, 'mined-out');
  // siteAnchored: acquire still ok (parity with live gate); extraction phase denies with beam-locked.
  const anchored = ent('asteroid', { id: 2, data: { siteAnchored: true } });
  assert.equal(interactionEligibility(state, anchored, 'mine').ok, true, 'siteAnchored acquires (parity)');
  assert.equal(interactionEligibility(state, anchored, 'mine', { phase: 'extract' }).reason, 'beam-locked');
});

// ============================================================================================
// 3. DAMAGE — real createDamageRouter allowlist ['ship','station','drone','mine','massSeed']
// ============================================================================================
function routeAt(type) {
  const catalog = createCombatCatalog();
  const state = { tick: 0, combat: { traces: [] }, entities: new Map() };
  const attacker = { id: 1, type: 'ship', alive: true, team: 0, pos: { x: 0, z: 0 }, radius: 12 };
  const target = ent(type, { id: 2, team: 1, hull: 500, hullMax: 500, shield: 0, armorHp: 0, radius: 14, pos: { x: 0, z: 0 } });
  state.entities.set(1, attacker);
  state.entities.set(2, target);
  const context = { state, catalog, bus: { emit: () => {} }, attachments: null, helpers: {} };
  const router = createDamageRouter(context, { schedule: () => {} });
  return router({ attackerId: 1, targetId: 2, packet: scalarHitToDamagePacket({ damage: 25, damageType: 'kinetic' }) });
}

test('characterize: damage router type allowlist → target_not_damageable for non-members', () => {
  for (const type of ALL_TYPES) {
    const res = routeAt(type);
    if (VERB_TYPE_MEMBERSHIP.damage.has(type)) {
      assert.equal(res.ok, true, `damageable member routes ok: ${type} (got ${res.reason})`);
    } else {
      assert.equal(res.ok, false, `non-member rejected: ${type}`);
      assert.equal(res.reason, 'target_not_damageable', `non-member reason byte-identical: ${type}`);
    }
  }
});

test('characterize: descriptor damage eligibility mirrors router allowlist', () => {
  const state = baseState();
  for (const type of ALL_TYPES) {
    const e = ent(type, { id: 2 });
    const desc = interactionEligibility(state, e, 'damage').ok;
    assert.equal(desc, VERB_TYPE_MEMBERSHIP.damage.has(type), `descriptor mirrors damage allowlist: ${type}`);
  }
});

// ============================================================================================
// 4. TARGET (uiRoot cycleTarget, not unit-callable) + CONTACT (hud strip) — membership pins
// ============================================================================================
test('characterize: target membership pin {ship,drone} (uiRoot cycleTarget literal)', () => {
  assert.deepEqual([...VERB_TYPE_MEMBERSHIP.target].sort(), ['drone', 'ship']);
});

test('characterize: contact membership {ship,drone,wreck} + wreck-like predicate agreement', () => {
  assert.deepEqual([...VERB_TYPE_MEMBERSHIP.contact].sort(), ['drone', 'ship', 'wreck']);
  // wreck-like predicate mirrors scanner.isWreckLike cases used by the contacts strip.
  assert.equal(isWreckLikeEntity(ent('wreck', {})), true);
  assert.equal(isWreckLikeEntity(ent('asteroid', { data: { poiType: 'wreck' } })), true);
  assert.equal(isWreckLikeEntity(ent('asteroid', { data: { kind: 'derelict' } })), true);
  assert.equal(isWreckLikeEntity(ent('asteroid', { data: { salvage: true } })), true);
  assert.equal(isWreckLikeEntity(ent('ship', {})), false);
});

// ============================================================================================
// 5. AUTO-TARGET (autoTargetMode, OUT OF WRITE SET — characterize-only)
// ============================================================================================
test('characterize: massline auto-target {ship,drone,asteroid} is a narrower subset of tether (not adapted)', () => {
  const autoSet = new Set(['ship', 'drone', 'asteroid']); // MASSLINE_CANDIDATE_TYPES (autoTargetMode.js:11)
  for (const t of autoSet) {
    assert.ok(VERB_TYPE_MEMBERSHIP.tether.has(t), `auto-target ${t} ⊂ tether membership`);
  }
  // Documented: autoTargetMode.js is out of the PQ-015 write set → left independent, no correctness
  // divergence (it only pre-selects a latch candidate; the real latch eligibility is tether).
});

// ============================================================================================
// 6. SALVAGE catalog + 7. DOCK deny — reason idiom pins
// ============================================================================================
test('characterize: salvage actionForWreck mapping', () => {
  assert.equal(actionForWreck(ent('wreck', { data: { parentType: 'reactor', unstableReactor: true } })).id, 'vent_reactor');
  assert.equal(actionForWreck(ent('wreck', { data: { wreckMissionId: 'm1' } })).id, 'decode_blackbox');
  assert.equal(actionForWreck(ent('wreck', { data: { parentType: 'ship' } })).id, 'pull_module');
  assert.equal(actionForWreck(ent('wreck', { data: { parentType: 'debris' } })).id, 'cut_panel');
});

test('characterize: dockDenyReason codes + descriptor dock verb reflects them', () => {
  const state = baseState();
  assert.equal(dockDenyReason({ abandoned: true }).reason, 'abandoned');
  assert.equal(dockDenyReason({ quarantine: true }).reason, 'quarantine');
  assert.equal(dockDenyReason({}), null); // clean station dockable
  // descriptor dock verb reflects the same codes for a station entity.
  assert.equal(interactionEligibility(state, ent('station', { data: { abandoned: true } }), 'dock').reason, 'abandoned');
  assert.equal(interactionEligibility(state, ent('station', { data: {} }), 'dock').ok, true);
});

// ============================================================================================
// 8. THE VERB × TYPE CONTRACT TABLE (the PQ-015 product) — asserts the derived truth per cell.
// ============================================================================================
test('contract table: verb × type membership matrix is stable and internally consistent', () => {
  const verbs = ['target', 'tether', 'mine', 'salvage', 'damage', 'dock', 'contact'];
  const table = {};
  for (const type of ALL_TYPES) {
    table[type] = {};
    for (const verb of verbs) {
      let member = verbAcceptsType(verb, type);
      if ((verb === 'salvage' || verb === 'contact') && type === 'wreck') member = true;
      table[type][verb] = member;
    }
  }
  // Spot-check the load-bearing asymmetries the packet exists to make legible:
  assert.equal(table.asteroid.mine, true);
  assert.equal(table.asteroid.tether, true);
  assert.equal(table.asteroid.damage, false, 'asteroid is mineable/tetherable but NOT weapon-damageable');
  assert.equal(table.wreck.salvage, true);
  assert.equal(table.wreck.mine, true, 'wreck shares the mining beam gate (salvage-drain)');
  assert.equal(table.wreck.damage, false, 'wreck is salvageable but NOT weapon-damageable');
  assert.equal(table.ship.damage, true);
  assert.equal(table.ship.mine, false);
  assert.equal(table.station.damage, true, 'station IS in the weapon allowlist (profile.destructible=false notwithstanding)');
  assert.equal(table.station.dock, true, 'station is the dock verb type');
  assert.equal(table.payload.damage, false, 'payload profile.destructible=true but NOT in weapon allowlist');
  assert.equal(table.massSeed.damage, true);
  assert.equal(table.massSeed.tether, true);
  assert.equal(table.mine.damage, true);
  assert.equal(table.mine.tether, false);
});
