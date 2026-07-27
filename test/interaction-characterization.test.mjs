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
import { masslineOwnsGuns } from '../src/combat/tetherFireControl.js';

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
// THE TETHER GATE IS NO LONGER A CATALOG ALLOWLIST — re-expressed, not weakened.
//
// This test used to read `VERB_TYPE_MEMBERSHIP.tether.has(type)` as the oracle for isAttachable,
// which was correct when the catalog set was transcribed byte-for-byte from tetherGameplay's
// ATTACHABLE_TYPES at base f85d54c8. Commit 4d00867e ("feat(controls): restore direct flight
// intent") intentionally inverted that gate: the allowlist became the DENYLIST
// TRANSIENT_NON_TETHERABLE_TYPES = {projectile, fx}, under the header comment at
// src/systems/tetherGameplay.js:1177-1178 — "Massline is a physical command, not a catalog verb.
// New world-object types do not need a separate eligibility-list edit before a player can
// deliberately attach to them." A tether gate that grows a new false every time the world grows a
// new noun is exactly the failure that change removed.
//
// So the oracle here is the gate's OWN contract, asserted directly and exhaustively. That is
// strictly more specific than deferring to a set: it pins the denylist, the two opt-out/opt-in data
// flags, the phase gate and the guards, so any of them silently moving is caught. The catalog's
// stale tether column is not this test's problem — it is the descriptor-mirror test's, below.
const TETHER_DENIED_TYPES = new Set(['projectile', 'fx']);

test('characterize: tether isAttachable is a physical denylist + massSeed phase gate (not a catalog set)', () => {
  for (const type of ALL_TYPES) {
    // massSeed handled separately (phase gate); every other type is decided by the denylist alone.
    if (type === 'massSeed') continue;
    const e = ent(type, { id: 2 });
    const expected = !TETHER_DENIED_TYPES.has(type);
    assert.equal(isAttachable(e, PLAYER_ID), expected, `tether denylist: ${type}`);
  }
  // The two transient types are the whole denylist, and an explicit opt-in overrides it (a scripted
  // set-piece may hand the player a grabbable "projectile").
  assert.equal(isAttachable(ent('projectile', { id: 2 }), PLAYER_ID), false, 'projectile denied');
  assert.equal(isAttachable(ent('fx', { id: 2 }), PLAYER_ID), false, 'fx denied');
  assert.equal(isAttachable(ent('projectile', { id: 2, data: { masslineTetherable: true } }), PLAYER_ID), true,
    'explicit data opt-in overrides the denylist');
  assert.equal(isAttachable(ent('fx', { id: 2, flags: { masslineTetherable: true } }), PLAYER_ID), true,
    'explicit flag opt-in overrides the denylist');
  // …and an explicit opt-OUT beats membership for any type (authored props that must not be grabbed).
  assert.equal(isAttachable(ent('asteroid', { id: 2, data: { masslineTetherable: false } }), PLAYER_ID), false,
    'explicit data opt-out denies an otherwise-eligible body');
  assert.equal(isAttachable(ent('ship', { id: 2, flags: { masslineTetherable: false } }), PLAYER_ID), false,
    'explicit flag opt-out denies an otherwise-eligible body');
  // A mine is tetherable, and deliberately so: picking up a mine and throwing it at something is the
  // game's thesis verb, not an exception to it.
  assert.equal(isAttachable(ent('mine', { id: 2 }), PLAYER_ID), true, 'mine is tetherable');
  // massSeed: ineligible before frame lock, eligible after.
  const seedPre = ent('massSeed', { id: 5, data: { massSeedState: { phase: 'travel', tetherEligible: false } } });
  const seedLocked = ent('massSeed', { id: 6, data: { massSeedState: { phase: 'active', tetherEligible: true } } });
  assert.equal(isAttachable(seedPre, PLAYER_ID), false, 'massSeed pre-lock ineligible');
  assert.equal(isAttachable(seedLocked, PLAYER_ID), true, 'massSeed post-lock eligible');
  // guards: dead, self, missing/non-finite pos.
  assert.equal(isAttachable(ent('ship', { id: 2, alive: false }), PLAYER_ID), false, 'dead not attachable');
  assert.equal(isAttachable({ id: PLAYER_ID, type: 'ship', alive: true, pos: { x: 0, z: 0 } }, PLAYER_ID), false, 'self not attachable');
  assert.equal(isAttachable({ id: 2, type: 'ship', alive: true }, PLAYER_ID), false, 'no pos not attachable');
  assert.equal(isAttachable({ id: 2, type: 'ship', alive: true, pos: { x: NaN, z: 0 } }, PLAYER_ID), false, 'non-finite pos not attachable');
});

// KNOWN RED — this is a live divergence, not a stale expectation. Do not relax it.
//
// interactionEligibility() gates every verb on VERB_TYPE_MEMBERSHIP first
// (src/systems/interactionDescriptors.js:155-158). For 'tether' that set is the pre-4d00867e
// transcription (src/data/interactionDescriptorCatalog.js:56) and it is missing 'mine', so the
// descriptor answers WRONG_TYPE for a body the live latch will happily attach to. The catalog
// itself names the gate as the owner of this verb (VERB_OWNERS.tether =
// 'src/systems/tetherGameplay.js isAttachable'), so the catalog is what has to follow.
//
// FIX (outside this task's write set): make the catalog's tether membership express the gate's
// denylist rather than an allowlist — the minimal form is adding 'mine' to the set at
// interactionDescriptorCatalog.js:56; the durable form is a tether-specific denylist so the next
// new world-object type does not reintroduce the same lie. Until then a mine shows no tether
// affordance in the HUD and can still be tethered, which is precisely the class of bug this suite
// exists to catch.
test('characterize: descriptor tether eligibility mirrors isAttachable (membership + phase)', () => {
  const state = baseState();
  for (const type of ALL_TYPES) {
    if (type === 'massSeed') continue;
    const e = ent(type, { id: 2 });
    const gate = isAttachable(e, PLAYER_ID);
    const result = interactionEligibility(state, e, 'tether');
    assert.equal(result.ok, gate,
      `descriptor mirrors tether gate: ${type} (gate=${gate}, descriptor=${result.ok}/${result.reason})`);
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
// 5. MASSLINE → GUNS (tetherFireControl.masslineOwnsGuns) — a NARROWER subset of tether
// ============================================================================================
// This cell used to characterize MASSLINE_CANDIDATE_TYPES in autoTargetMode.js — the candidate set
// of pickMasslineAutoTarget(), a massline-aware picker that wrote the GUN variable
// (state.player.targetId) from a LATCH decision and was never called from src/. That function and
// its constant were deleted; scored latch acquisition is owned by the tether itself now.
//
// What replaced it is the opposite direction of the same edge — not "the guns pick the latch" but
// "the latch claims the guns" — so this cell characterizes that rule instead, keeping the original
// point: the massline→gun set is a strict, deliberate SUBSET of tether eligibility.
test('characterize: massline gun claim {hostile ship,drone} is a narrower subset of tether eligibility', () => {
  const tether = (targetId) => ({ active: true, targetId });
  const claims = (type, { hostile = true, alive = true, id = 2 } = {}) =>
    masslineOwnsGuns(tether(id), ent(type, { id, alive }), hostile);

  // Claims the guns: a hostile ship or drone on the line IS the firing solution.
  assert.equal(claims('ship'), true, 'hostile ship on the line claims the guns');
  assert.equal(claims('drone'), true, 'hostile drone on the line claims the guns');
  // Does NOT claim: while you are swinging a rock you must still be able to shoot what you are
  // swinging it into. Same for anything you tethered that is not a hostile combatant.
  for (const type of ALL_TYPES) {
    if (type === 'ship' || type === 'drone') continue;
    assert.equal(claims(type), false, `non-combatant on the line does not claim the guns: ${type}`);
  }
  assert.equal(claims('ship', { hostile: false }), false, 'a towed friendly does not claim the guns');
  assert.equal(claims('ship', { alive: false }), false, 'a dead hull does not claim the guns');
  assert.equal(masslineOwnsGuns({ active: false, targetId: 2 }, ent('ship'), true), false, 'no line, no claim');
  assert.equal(masslineOwnsGuns({ active: true, targetId: null }, ent('ship'), true), false, 'no target, no claim');
  assert.equal(masslineOwnsGuns(tether(2), ent('ship', { id: 3 }), true), false, 'entity must BE the tethered id');

  // Subset property: every type that can claim the guns must be tether-eligible in the first place.
  for (const type of ['ship', 'drone']) {
    assert.equal(isAttachable(ent(type, { id: 2 }), PLAYER_ID), true, `gun-claim ${type} ⊂ tether eligibility`);
  }
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
  assert.equal(table.mine.damage, true);

  // TETHER cells are asserted against the GATE, not against the catalog column. Per §1, commit
  // 4d00867e made this verb a physical denylist and VERB_TYPE_MEMBERSHIP.tether is a transcription
  // that has since gone stale (it still says a mine is not tetherable, and the live latch attaches
  // one). Pinning the stale column here would have made the catalog fix — the one the descriptor
  // mirror test above is waiting on — arrive as a spurious red in this cell.
  assert.equal(isAttachable(ent('asteroid', { id: 2 }), PLAYER_ID), true,
    'asteroid is mineable AND tetherable — the two-verb rock is the mining/tether loop-lock');
  assert.equal(isAttachable(ent('mine', { id: 2 }), PLAYER_ID), true,
    'a mine is damageable AND tetherable — shoot it, or pick it up and throw it');
  assert.equal(isAttachable(ent('station', { id: 2 }), PLAYER_ID), true,
    'station is dockable AND tetherable — anchoring to an immovable body is core play');
  assert.equal(isAttachable(ent('massSeed', { id: 2, data: { massSeedState: { phase: 'active', tetherEligible: true } } }), PLAYER_ID), true,
    'a locked Mass Seed is damageable AND tetherable — anchoring to your own seed is the feature');
  assert.equal(isAttachable(ent('projectile', { id: 2 }), PLAYER_ID), false,
    'projectile is the transient exception: nothing in flight is grabbable');
});
