// SF-133 — build identity that does not overclaim hidden fittings.
//
// The packet's promise: the scanned-craft badge shows only what observation actually
// verified, gets more precise after a legitimate look, never borrows a sibling hull's
// read, and clears itself when the read goes stale instead of quietly retargeting.
//
// Asserted end-to-end against the live seam:
//   data/scanReveal.js     the reveal itself — band-gated fields, the dated `confirmed`
//                          memory block, and the stale window that drops it
//   systems/buildIdentity.js  the classifier — live fittings on a resolving read, the
//                          remembered fittings while they are still fresh, role fallback
//                          only when nothing verified remains
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildShipScanReveal,
  sameScanReveal,
  scanRevealFingerprint,
  SCAN_REVEAL_CONFIRMED_STALE_S,
} from '../src/data/scanReveal.js';
import { buildIdentity, classifyBuildIdentity } from '../src/systems/buildIdentity.js';

const RAMMER_MODULES = ['mod_ram_plate', 'mod_cargo_pod_m'];
const SURVEY_MODULES = ['mod_survey_suite', 'mod_cargo_scanner_s'];

function scanState(simTime = 0) {
  const player = { id: 'player', type: 'ship', data: { fittings: [] } };
  return { playerId: 'player', entities: new Map([[player.id, player]]), simTime };
}

function craft(id, { x = 800, defId = 'ship_drifter', role = 'freighter', fittings = RAMMER_MODULES } = {}) {
  return {
    id, type: 'ship', alive: true, team: 2,
    pos: { x, z: 0 }, vel: { x: 0, y: 0, z: 0 }, rot: 0,
    radius: 10, mass: 48, hull: 80, hullMax: 80, factionId: 'faction_free',
    data: { defId, role, fittings: fittings.slice(), weapons: [] },
  };
}

function pulse(entity, state, now) {
  // Mirror the system's write path: build the reveal, keep the stamp if the claim is
  // unchanged, and return what the entity now remembers.
  const previous = entity.data.scanRevealed || null;
  const reveal = buildShipScanReveal(entity, state, { origin: { x: 0, z: 0 }, now, previous });
  if (!reveal) { entity.data.scanRevealed = null; return null; }
  entity.data.scanRevealed = sameScanReveal(previous, reveal)
    ? { ...reveal, revealedAt: previous.revealedAt }
    : reveal;
  return entity.data.scanRevealed;
}

test('an unknown craft has no badge at all — nothing is claimed before any scan', () => {
  const entity = craft(20);
  const entities = new Map([[entity.id, entity]]);
  const system = Object.create(buildIdentity);
  system.state = { entities };
  system.bus = { emit() {}, on() {}, off() {} };
  system._restampVisible();
  assert.equal(entity.data.buildIdentity, undefined, 'unscanned craft keeps no invented badge');
});

test('a far silhouette names the hull role and nothing else — hidden fittings stay hidden', () => {
  const entity = craft(20, { x: 1700 });
  const state = scanState();
  const reveal = pulse(entity, state, 10);
  assert.equal(reveal.quality, 'class');
  assert.equal(reveal.confirmed, null, 'no deep read, no confirmed knowledge');
  assert.deepEqual(reveal.loadout, []);
  const identity = classifyBuildIdentity(entity, { reveal });
  assert.equal(identity.confidence, 'role_fallback', 'a silhouette cannot claim a build');
  assert.deepEqual(identity.basis.modules, [], 'the module basis is empty at class range');
  assert.equal(identity.synergies.length, 0, 'no synergy is advertised from unseen fittings');
  // The same hull wearing a smuggling hold still does not leak it at class range.
  const ghost = craft(21, { x: 1700 });
  ghost.data.fittings = ['mod_smuggler_hold', ...RAMMER_MODULES];
  const ghostReveal = pulse(ghost, scanState(), 10);
  const ghostIdentity = classifyBuildIdentity(ghost, { reveal: ghostReveal });
  assert.notEqual(ghostIdentity.id, 'ghost_hauler', 'the hidden hold is not claimed from a silhouette');
  assert.deepEqual(ghostIdentity.basis.modules, []);
});

test('a resolving read discloses the fit and the badge becomes precise', () => {
  const entity = craft(20, { x: 800 });
  const reveal = pulse(entity, scanState(), 10);
  assert.equal(reveal.quality, 'full');
  assert.ok(reveal.confirmed, 'the read records what it verified');
  assert.deepEqual(reveal.confirmed.fittings, ['mod_cargo_pod_m', 'mod_ram_plate']);
  assert.equal(reveal.confirmed.at, 10, 'the confirmation carries its date');
  const identity = classifyBuildIdentity(entity, { reveal });
  assert.equal(identity.id, 'rammer_truck');
  assert.equal(identity.confirmedAt, 10);
  assert.equal(identity.synergies.length, 1);
  assert.equal(identity.synergies[0].id, 'rammer_truck');
});

test('sliding back to silhouette keeps the dated memory — then the stale window clears it', () => {
  const entity = craft(20, { x: 800 });
  const state = scanState();
  const deep = pulse(entity, state, 10);
  assert.equal(classifyBuildIdentity(entity, { reveal: deep }).id, 'rammer_truck');
  // The contact slides out of the resolve band: silhouette quality, but the verified
  // read still rides as dated confirmed knowledge — the badge must not amnesia.
  entity.pos = { x: 1700, z: 0 };
  const weak = pulse(entity, state, 40);
  assert.equal(weak.quality, 'class');
  assert.ok(weak.confirmed, 'the confirmed read is carried, not erased');
  assert.equal(weak.confirmed.at, 10, 'the memory keeps the verification date');
  const remembered = classifyBuildIdentity(entity, { reveal: weak });
  assert.equal(remembered.id, 'rammer_truck', 'the badge reads the dated memory');
  assert.equal(remembered.confirmedAt, 10, 'and it says how old that read is');
  // Past the stale window the claim clears itself — no silent retarget, no zombie badge.
  const stale = pulse(entity, state, 10 + SCAN_REVEAL_CONFIRMED_STALE_S + 5);
  assert.equal(stale.confirmed, null);
  const cleared = classifyBuildIdentity(entity, { reveal: stale });
  assert.equal(cleared.confidence, 'role_fallback', 'stale knowledge falls back to role honestly');
  assert.deepEqual(cleared.basis.modules, []);
});

test('the memory tracks re-verification time, not the first sighting', () => {
  const entity = craft(20, { x: 800 });
  const state = scanState();
  pulse(entity, state, 10);
  entity.pos = { x: 1700, z: 0 };
  pulse(entity, state, 40);
  // Come back inside the band and re-verify: the confirmation clock restarts from NOW.
  entity.pos = { x: 800, z: 0 };
  const fresh = pulse(entity, state, 100);
  assert.equal(fresh.confirmed.at, 100, 'a new deep read re-dates the knowledge');
  entity.pos = { x: 1700, z: 0 };
  const stillFresh = pulse(entity, state, 100 + SCAN_REVEAL_CONFIRMED_STALE_S - 30);
  assert.ok(stillFresh.confirmed, 're-verification genuinely extended the memory');
  const identity = classifyBuildIdentity(entity, { reveal: stillFresh });
  assert.equal(identity.id, 'rammer_truck');
});

test('a legitimate refit is a new claim: the next deep read replaces the badge honestly', () => {
  const entity = craft(20, { x: 800 });
  const state = scanState();
  pulse(entity, state, 10);
  // The hauler bolts on survey gear; the player only knows after looking again.
  entity.data.fittings = SURVEY_MODULES;
  // Before the re-scan the dated memory still says rammer-truck — honest, dated.
  entity.pos = { x: 1700, z: 0 };
  const carried = pulse(entity, state, 30);
  assert.equal(classifyBuildIdentity(entity, { reveal: carried }).id, 'rammer_truck',
    'unobserved changes cannot rewrite the claim early');
  // Re-scan at resolve range: the read says what the hull carries NOW.
  entity.pos = { x: 800, z: 0 };
  const updated = pulse(entity, state, 60);
  assert.deepEqual(updated.confirmed.fittings, SURVEY_MODULES.slice().sort());
  const identity = classifyBuildIdentity(entity, { reveal: updated });
  assert.equal(identity.id, 'control_scout', 'the badge follows the legitimate observation');
  assert.equal(identity.confirmedAt, 60);
});

test('a reload keeps the read exactly — serialized memory classifies identically', () => {
  const entity = craft(20, { x: 800 });
  const state = scanState();
  const reveal = pulse(entity, state, 10);
  entity.pos = { x: 1700, z: 0 };
  const carried = pulse(entity, state, 40);
  const restored = JSON.parse(JSON.stringify(carried));
  assert.equal(scanRevealFingerprint(restored), scanRevealFingerprint(carried),
    'the saved read is the same claim');
  const identity = classifyBuildIdentity(entity, { reveal: restored });
  assert.equal(identity.id, 'rammer_truck');
  assert.equal(identity.confirmedAt, 10);
  assert.equal(reveal.confirmed.at, 10);
});

test('similar hulls never borrow each other\'s scan state', () => {
  const state = scanState();
  const rammer = craft(30, { x: 800 });
  const surveyor = craft(31, { x: 800, fittings: SURVEY_MODULES });
  const twin = craft(32, { x: 800 }); // same hull, same fittings — separate entity
  pulse(rammer, state, 10);
  pulse(surveyor, state, 10);
  // No pulse for the twin: it must not inherit rammer's read through hull similarity.
  assert.equal(twin.data.scanRevealed, undefined);
  assert.equal(classifyBuildIdentity(rammer, { reveal: rammer.data.scanRevealed }).id, 'rammer_truck');
  assert.equal(classifyBuildIdentity(surveyor, { reveal: surveyor.data.scanRevealed }).id, 'control_scout');
  const naive = classifyBuildIdentity(twin, { reveal: pulse(twin, state, 20) });
  assert.equal(naive.id, 'rammer_truck', 'the twin is read on its OWN scan, not the sibling\'s');
  assert.ok(naive.basis.modules.includes('mod_ram_plate'));
  // Each reveal is keyed to its entity — a reveal addressed to one id cannot stamp another.
  const system = Object.create(buildIdentity);
  const entities = new Map([[rammer.id, rammer], [surveyor.id, surveyor]]);
  system.state = { entities };
  system.bus = { emit() {}, on() {}, off() {} };
  const misaddressed = { entityId: 31, quality: 'full', confirmed: { at: 1, fittings: RAMMER_MODULES } };
  system._stampReveal(misaddressed, { emit: false });
  assert.equal(surveyor.data.buildIdentity.id, 'control_scout', 'the stamp lands on the addressed entity only');
});

test('re-verifying an unchanged read stays silent — the claim, not the clock, drives events', () => {
  const entity = craft(20, { x: 800 });
  const state = scanState();
  const first = pulse(entity, state, 10);
  const firstStamp = first.revealedAt;
  const again = pulse(entity, state, 20);
  assert.equal(entity.data.scanRevealed.revealedAt, firstStamp,
    'an identical claim keeps its original stamp');
  assert.equal(again.confirmed.at, 20, 'while the verification clock still advances');
});
