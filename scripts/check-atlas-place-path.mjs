#!/usr/bin/env node
// check-atlas-place-path — the END-TO-END proof for one authored place.
//
// `check-atlas-integrity` proves the atlas is coherent. This proves a place a human authored is
// actually USABLE: that it charts in the right frame, resolves a representation, can be selected and
// inspected, yields a valid course payload, reports honest discovery state, and keeps its identity
// across a save. Those are separate jobs, which is why this is a separate script rather than more
// assertions bolted onto the integrity gate.
//
// The subject is the worked example from src/data/PLACE_REGISTRATION.md: `zone_tethys_driftmark`, a
// zone in sector_tethys_junction (global origin 12288, 8192). The nonzero origin is the entire point
// — in Helios Prime the sector-local and global frames are numerically identical, so a place there
// cannot distinguish a correct conversion from a missing one.
//
// SCOPE, STATED HONESTLY. Every assertion here runs headlessly against the real production modules.
// What it does NOT do is drive a live browser: boot-to-flight currently exceeds every harness budget
// in this repo (see design/program/atlas/03_LEDGER.md), so a flight-gated assertion would time out
// for reasons unrelated to this content. The live in-scene render of a proxy is therefore NOT
// claimed by this check and is recorded as deferred rather than quietly asserted.
//
// Exit codes: 0 all sections passed · 1 an assertion failed.

import assert from 'node:assert/strict';

import { buildAtlasIndex } from '../src/core/atlasIndex.js';
import {
  resolveAtlasProxy, PROXY_TIER, MAP_PROXY_TRIANGLE_CAP, generateProxyGeometry,
} from '../src/core/atlasProxy.js';
import { checkAtlasIntegrity } from './check-atlas-integrity.mjs';
import { buildSystemModel, buildGalaxyModel, resolveCourseTarget } from '../src/ui/galaxyMap.js';
import { ZONE_TETHYS_DRIFTMARK, appendAuthoredZones } from '../src/data/authoredPlaces.js';
import { zonesForSector } from '../src/data/sectorZones.js';
import { SECTORS } from '../src/data/sectors.js';
import { sectorGlobalOrigin, sectorLocalToGlobalForSector } from '../src/data/sectorCoordinates.js';

const SAMPLE_ID = 'zone_tethys_driftmark';
const SECTOR_ID = 'sector_tethys_junction';

let passed = 0;
function ok(label) {
  passed++;
  console.log(`  PASS ${label}`);
}

function section(title) {
  console.log(`\n${title}`);
}

/** Minimal headless state, same shape check-map-frames.mjs uses. */
function stateFixture(currentSectorId, playerLocal = { x: 0, z: 0 }) {
  const entityList = [];
  if (playerLocal) {
    const g = sectorLocalToGlobalForSector(playerLocal, currentSectorId);
    entityList.push({
      id: 1, type: 'ship', alive: true, pos: { x: g.x, z: g.z }, rot: 0,
      homeSectorId: currentSectorId, data: { homeSectorId: currentSectorId },
    });
  }
  return {
    world: { currentSectorId, sectors: {} },
    entities: new Map(entityList.map((e) => [e.id, e])),
    entityList,
    playerId: playerLocal ? 1 : null,
  };
}

// ── A. Identity and coordinate frame ────────────────────────────────────────────────────────────
function testIdentityAndFrame() {
  section('A. Atlas identity and coordinate frame');
  const atlas = buildAtlasIndex();
  const node = atlas.getNode(SAMPLE_ID);
  assert.ok(node, `${SAMPLE_ID} must exist in the derived atlas`);
  ok('the authored place appears as an atlas node');

  assert.equal(node.kind, 'zone');
  assert.equal(node.sectorId, SECTOR_ID);
  assert.equal(node.name, 'Driftmark Survey');
  assert.equal(node.placeType, 'anomaly_deep');
  assert.equal(node.radiusWU, 480);
  ok('node carries kind, parent sector, name, type and extent');

  // The load-bearing frame assertion: global == origin + authored local, EXACTLY.
  const origin = sectorGlobalOrigin(SECTOR_ID);
  const local = ZONE_TETHYS_DRIFTMARK.center;
  assert.ok(origin.x !== 0 || origin.z !== 0,
    'the sample must live in a nonzero-origin sector or it proves nothing about frames');
  assert.deepEqual(
    { x: node.globalPos.x, z: node.globalPos.z },
    { x: origin.x + local.x, z: origin.z + local.z },
    'atlas globalPos must be the authored sector-local anchor composed through the sector origin',
  );
  ok(`sector-local (${local.x}, ${local.z}) composes to global `
    + `(${node.globalPos.x}, ${node.globalPos.z}) through origin (${origin.x}, ${origin.z})`);

  // And the two frames must be distinguishable, or the assertion above is vacuous.
  const separation = Math.hypot(node.globalPos.x - local.x, node.globalPos.z - local.z);
  assert.ok(separation > 10000,
    `the two frames must be far apart for this test to have teeth (got ${separation})`);
  ok(`draw and nav frames are ${Math.round(separation)} WU apart — a frame mix-up cannot hide`);

  // The append seam must extend, never replace.
  const zones = zonesForSector(SECTOR_ID);
  assert.ok(zones.length >= 5, `Tethys must keep its authored zones plus the new one (got ${zones.length})`);
  for (const preexisting of ['zone_tethys_hub', 'zone_tethys_lane', 'zone_tethys_checkpoint', 'zone_tethys_blackmkt']) {
    assert.ok(zones.some((z) => z.id === preexisting), `append must not drop ${preexisting}`);
  }
  ok('additive registration appended without replacing the four pre-existing Tethys zones');

  // Prove the append helper's documented hazard: a spread would have destroyed them.
  const spread = { ...{ [SECTOR_ID]: [{ id: 'a' }, { id: 'b' }] }, ...{ [SECTOR_ID]: [{ id: 'c' }] } };
  assert.equal(spread[SECTOR_ID].length, 1, 'control: an object spread replaces the list');
  const appended = appendAuthoredZones({ [SECTOR_ID]: [{ id: 'a' }, { id: 'b' }] }, { [SECTOR_ID]: [{ id: 'c' }] });
  assert.equal(appended[SECTOR_ID].length, 3, 'appendAuthoredZones must extend the list');
  ok('appendAuthoredZones extends where a spread would replace (both directions proven)');
}

// ── B. Semantic zoom ────────────────────────────────────────────────────────────────────────────
function testSemanticZoom() {
  section('B. Presence across semantic zoom levels');
  const state = stateFixture(SECTOR_ID);

  const system = buildSystemModel(state, SECTOR_ID);
  const zone = system.zones.find((z) => z.id === SAMPLE_ID);
  assert.ok(zone, 'the place must appear in the SYSTEM model');
  assert.equal(zone.name, 'Driftmark Survey');
  assert.ok(Number.isFinite(zone.radius) && zone.radius > 0, 'system model must carry its extent');
  ok('appears at SYSTEM scale with name and extent');

  // Zones draw in the sector-local frame (D2.1). Asserting the value, not just presence.
  assert.deepEqual({ x: zone.x, z: zone.z },
    { x: ZONE_TETHYS_DRIFTMARK.center.x, z: ZONE_TETHYS_DRIFTMARK.center.z },
    'system-model zones draw in the sector-local frame');
  ok('drawn in the sector-local frame, matching the authored anchor exactly');

  // At GALAXY scale a zone is represented by its parent system — D3's concentric scales, not a miss.
  // Asserting the parent is present is the honest form of "visible at galaxy scale".
  const galaxy = buildGalaxyModel(state);
  const parent = (galaxy.nodes || []).find((n) => n.id === SECTOR_ID);
  assert.ok(parent, 'the parent system must be present at GALAXY scale');
  ok('represented at GALAXY scale through its parent system (concentric scales, D3)');

  // The label a screen reader / decluttering solver would receive must be non-empty at every scale.
  assert.ok(zone.name && zone.name.trim(), 'zone must carry a non-empty label');
  assert.ok(zone.typeLabel && zone.typeLabel.trim(), 'zone must carry a readable type label');
  ok(`carries a human label at every scale ("${zone.name}" / "${zone.typeLabel}")`);
}

// ── C. Selection, inspection and proxy ──────────────────────────────────────────────────────────
function testSelectionAndProxy() {
  section('C. Selection, inspection and holographic proxy');
  const atlas = buildAtlasIndex();
  const node = atlas.getNode(SAMPLE_ID);
  const proxy = resolveAtlasProxy(node);

  assert.ok(proxy, 'a proxy descriptor must always be returned');
  assert.equal(proxy.tier, PROXY_TIER.PROCEDURAL,
    'ordinary content must land on the free procedural tier, NOT require bespoke art');
  ok('resolves to the procedural tier — no bespoke asset required');

  assert.equal(proxy.source, null, 'a procedural proxy must not reference a gameplay asset');
  ok('loads no gameplay art to represent a chart mark');

  const g = proxy.geometry;
  assert.ok(g && g.segments > 0, 'procedural proxy must generate geometry');
  assert.equal(g.vertices.length, g.segments * 2, 'vertex buffer must match the segment count');
  assert.ok(g.vertices.every(Number.isFinite), 'geometry must contain no non-finite coordinate');
  ok(`generates ${g.segments}-segment outline geometry (${g.vertices.length} coordinates), all finite`);

  assert.ok(proxy.budget.triangles <= MAP_PROXY_TRIANGLE_CAP,
    `proxy must stay within the ${MAP_PROXY_TRIANGLE_CAP}-triangle cap`);
  ok(`within budget: ${proxy.budget.triangles} triangles / ${g.lineCount} lines `
    + `against a ${MAP_PROXY_TRIANGLE_CAP} cap`);

  // Determinism: the same node must yield byte-identical geometry every time.
  const again = resolveAtlasProxy(node);
  assert.deepEqual(again.geometry.vertices, g.vertices, 'proxy geometry must be deterministic');
  ok('proxy generation is deterministic across calls');

  assert.ok(proxy.accessibleText && proxy.accessibleText.trim().length > 20,
    'must carry a substantive accessible description');
  assert.ok(proxy.accessibleText.includes('Driftmark Survey'), 'description must name the place');
  assert.ok(proxy.accessibleText.includes('charted'), 'description must state survey state');
  ok(`accessible description is complete: "${proxy.accessibleText}"`);

  assert.ok(proxy.inspector.length >= 5, 'inspector must offer substantive rows');
  const keys = proxy.inspector.map((r) => r.key);
  for (const required of ['kind', 'sector', 'faction', 'position', 'discovery']) {
    assert.ok(keys.includes(required), `inspector must expose '${required}'`);
  }
  ok(`inspector exposes ${proxy.inspector.length} rows including ${keys.join(', ')}`);

  // The floor tier must be genuinely unfailable — the guarantee ordinary content rests on.
  const orphan = { id: 'zone_orphan', kind: 'zone', sectorId: SECTOR_ID, name: 'Orphan',
    globalPos: null, hasPosition: false, discoveryTier: 'uncharted' };
  const fallback = resolveAtlasProxy(orphan);
  assert.equal(fallback.tier, PROXY_TIER.GLYPH, 'an unsurveyed place must fall back to a glyph');
  assert.ok(fallback.glyph && fallback.accessibleText.includes('not surveyed'),
    'the glyph fallback must state its uncertainty honestly');
  ok('unsurveyed places degrade to an honest uncertainty glyph rather than a fabricated point');

  const malformed = resolveAtlasProxy(null);
  assert.ok(malformed && malformed.tier === PROXY_TIER.GLYPH,
    'even a malformed node must resolve rather than throw or return null');
  ok('the fallback tier cannot fail — malformed input still resolves');
}

// ── D. Route and mission contribution ───────────────────────────────────────────────────────────
function testRouteContribution() {
  section('D. Course plotting and route contribution');
  const atlas = buildAtlasIndex();
  const node = atlas.getNode(SAMPLE_ID);
  const state = stateFixture(SECTOR_ID);
  const system = buildSystemModel(state, SECTOR_ID);
  const zone = system.zones.find((z) => z.id === SAMPLE_ID);

  // Reproduce the production click path exactly: galaxyMap.js:5862 converts the sector-local zone
  // centre UP to global before building the click target, because world.js `_onSetCourse` stores
  // `state.nav.autopilot.target` in the global frame. Passing the raw sector-local centre here
  // instead would plot a course a whole lattice offset short of the zone the player clicked —
  // which is precisely the RC-6 defect class, so this reproduction is the assertion that matters.
  const zoneNav = sectorLocalToGlobalForSector({ x: zone.x, z: zone.z }, system.sectorId);
  const target = {
    kind: 'zone', id: zone.id, name: zone.name, radius: zone.radius,
    x: zoneNav.x, z: zoneNav.z,
  };
  const course = resolveCourseTarget(target);

  assert.ok(course && course.pos, 'the place must yield a course payload');
  assert.deepEqual({ x: course.pos.x, z: course.pos.z },
    { x: node.globalPos.x, z: node.globalPos.z },
    'the course payload must be GLOBAL and land on the atlas position');
  ok(`course payload is global (${course.pos.x}, ${course.pos.z}) and matches the atlas node exactly`);

  assert.ok(Number.isFinite(course.arrivalRadius) && course.arrivalRadius > 0,
    'an arrival radius is required arrival metadata');
  assert.ok(course.label && course.label.trim(), 'course must carry a label for the itinerary');
  assert.equal(course.autopilot, true, 'the place must be a valid autopilot destination');
  ok(`carries arrival metadata: radius ${course.arrivalRadius}, label "${course.label}", autopilot ${course.autopilot}`);

  // Negative control: the un-converted sector-local centre must NOT match, or the assertion above
  // would pass for a broken implementation too.
  const wrong = resolveCourseTarget({ ...target, x: zone.x, z: zone.z });
  assert.notDeepEqual({ x: wrong.pos.x, z: wrong.pos.z },
    { x: node.globalPos.x, z: node.globalPos.z },
    'control: the sector-local centre must NOT satisfy the global assertion');
  ok('negative control: an unconverted sector-local course payload is provably rejected');

  // Route leg: the place must be reachable from its own system's atlas node with a real distance.
  const sectorNode = atlas.getNode(SECTOR_ID);
  const legWU = Math.hypot(node.globalPos.x - sectorNode.globalPos.x, node.globalPos.z - sectorNode.globalPos.z);
  assert.ok(legWU > 0 && Number.isFinite(legWU), 'a route leg to the place must have a real length');
  ok(`contributes a routable leg: ${Math.round(legWU)} WU from its system centre`);
}

// ── E. Discovery behaviour ──────────────────────────────────────────────────────────────────────
function testDiscovery() {
  section('E. Discovery behaviour');
  const atlas = buildAtlasIndex();
  const node = atlas.getNode(SAMPLE_ID);
  const sector = SECTORS.find((s) => s.id === SECTOR_ID);

  assert.equal(node.discoveryTier, 'charted',
    'a place in an authored-charted sector inherits the charted baseline');
  assert.equal(sector.charted, true, 'control: the parent sector is authored charted');
  ok('inherits the authored discovery baseline from its parent sector (charted)');

  // Drive the real derivation with an uncharted parent and a hidden flag to prove the tier is
  // computed, not a constant.
  const syntheticSector = { ...sector, id: SECTOR_ID, charted: false };
  const uncharted = buildAtlasIndex({
    sectors: [syntheticSector],
    zonesForSector: (id) => (id === SECTOR_ID ? [ZONE_TETHYS_DRIFTMARK] : []),
  }).getNode(SAMPLE_ID);
  assert.equal(uncharted.discoveryTier, 'uncharted',
    'an uncharted parent must yield an uncharted tier');
  ok('an uncharted parent sector yields an uncharted tier (derivation, not a constant)');

  const hidden = buildAtlasIndex({
    sectors: [{ ...sector, id: SECTOR_ID, charted: true }],
    zonesForSector: (id) => (id === SECTOR_ID ? [{ ...ZONE_TETHYS_DRIFTMARK, hidden: true }] : []),
  }).getNode(SAMPLE_ID);
  assert.equal(hidden.discoveryTier, 'hidden', 'an authored hidden flag must override the baseline');
  ok('an authored hidden flag overrides the sector baseline');

  // The atlas must NOT own runtime discovery state (D2). Proven by construction: the same node id
  // resolves identically regardless of any per-save state, because none is consulted.
  const rebuilt = buildAtlasIndex().getNode(SAMPLE_ID);
  assert.deepEqual(rebuilt, node, 'the atlas node must be a pure derivation, stable across builds');
  ok('atlas node is a pure derivation — it owns no per-save discovery state (D2)');
}

// ── F. Save/load identity ───────────────────────────────────────────────────────────────────────
function testSaveIdentity() {
  section('F. Save/load identity');
  const atlas = buildAtlasIndex();
  const node = atlas.getNode(SAMPLE_ID);

  // Discovery state is per-save and keyed by stable id (state.world.discovery). Round-trip a save
  // shaped the way the game writes one and prove the key survives and still resolves.
  const save = { world: { currentSectorId: SECTOR_ID, discovery: { [SAMPLE_ID]: { seen: true, epochDay: 12 } } } };
  const reloaded = JSON.parse(JSON.stringify(save));
  assert.deepEqual(reloaded.world.discovery[SAMPLE_ID], { seen: true, epochDay: 12 },
    'per-save discovery keyed by the stable id must survive serialization');
  ok('per-save discovery keyed by the place id survives a save/load round trip');

  const afterReload = buildAtlasIndex().getNode(Object.keys(reloaded.world.discovery)[0]);
  assert.ok(afterReload, 'the saved key must still resolve to a live atlas node after reload');
  assert.equal(afterReload.id, node.id);
  assert.deepEqual(afterReload.globalPos, node.globalPos,
    'position must be identical after reload — identity is stable, not re-derived differently');
  ok('the saved key resolves to the same node with an identical position after reload');

  // Id stability is the contract saves depend on; assert the shape a migration would have to honour.
  assert.match(SAMPLE_ID, /^zone_[a-z0-9_]+$/, 'stable ids must remain machine-safe');
  ok(`stable id "${SAMPLE_ID}" matches the persisted-id shape`);
}

// ── G. The gate bites ───────────────────────────────────────────────────────────────────────────
// A validator nobody has watched fail is not a validator. Each mutation below drives DELIBERATELY
// broken content through the real checkAtlasIntegrity and asserts the specific assertion that must
// catch it. Feeding synthetic sources through the production function (rather than asserting against
// a reimplementation) is what makes this evidence rather than decoration.
function testGateBites() {
  section('G. New validators fail loudly on broken content');
  const sector = SECTORS.find((s) => s.id === SECTOR_ID);
  const origins = { [SECTOR_ID]: sectorGlobalOrigin(SECTOR_ID) };

  const runWith = (zones, sectorOverride = {}) => checkAtlasIntegrity({
    sectors: [{ ...sector, gates: [], stations: sectorOverride.stations || [], pois: [], ...sectorOverride }],
    zonesForSector: () => zones,
    origins,
  });

  const named = (result, name) => result.checks.find((c) => c.name === name);

  // Control: the same harness with GOOD content must pass the assertions under test, or a mutation
  // "failing" would prove nothing about the mutation.
  const control = runWith([ZONE_TETHYS_DRIFTMARK]);
  assert.equal(named(control, 'authoredReferencesResolve').pass, true, 'control content must pass');
  assert.equal(named(control, 'everyNodeHasMapRepresentation').pass, true, 'control content must pass');
  ok('control: unmutated content passes every assertion under test');

  const cases = [
    ['unknown faction', 'authoredReferencesResolve',
      [{ ...ZONE_TETHYS_DRIFTMARK, factionId: 'faction_does_not_exist' }], {}],
    ['unknown zone type', 'authoredReferencesResolve',
      [{ ...ZONE_TETHYS_DRIFTMARK, type: 'type_does_not_exist' }], {}],
    ['duplicate stable id', 'uniqueNodeIds',
      [ZONE_TETHYS_DRIFTMARK, { ...ZONE_TETHYS_DRIFTMARK, name: 'Impostor' }], {}],
    ['zone outside its sector', 'zonesInsideSector',
      [{ ...ZONE_TETHYS_DRIFTMARK, center: { x: 99000, z: 99000 } }], {}],
  ];

  for (const [label, assertionName, zones, override] of cases) {
    const result = runWith(zones, override);
    const check = named(result, assertionName);
    assert.ok(check, `${label}: assertion '${assertionName}' must exist`);
    assert.equal(check.pass, false, `${label}: '${assertionName}' must FAIL on broken content`);
    assert.ok(check.details && check.details.length,
      `${label}: the failure must name the offender, not just report false`);
    assert.ok(check.details.some((d) => String(d).includes(SAMPLE_ID)),
      `${label}: the message must name the offending id`);
    ok(`${label} -> ${assertionName} FAILS naming the id: "${check.details[0]}"`);
  }

  // Unknown service, via a station rather than a zone.
  const badService = runWith([], {
    stations: [{ id: 'station_probe', name: 'Probe', type: 'trade_hub', factionId: 'faction_scn',
      services: ['reful'], pos: { x: 10, z: 10 } }],
  });
  const svc = named(badService, 'authoredReferencesResolve');
  assert.equal(svc.pass, false, 'an unknown service must fail');
  assert.ok(svc.details.some((d) => String(d).includes('reful') && String(d).includes('station_probe')),
    'the message must name both the station and the bad service');
  ok(`unknown service -> authoredReferencesResolve FAILS: "${svc.details[0]}"`);

  // Unknown parent sector.
  const badParent = checkAtlasIntegrity({
    sectors: [{ ...sector, id: 'sector_not_in_the_origin_table', gates: [], stations: [], pois: [] }],
    zonesForSector: () => [ZONE_TETHYS_DRIFTMARK],
    origins,
  });
  const parent = named(badParent, 'nodeSectorResolves');
  assert.equal(parent.pass, false, 'an unknown parent sector must fail');
  ok(`unknown parent sector -> nodeSectorResolves FAILS: "${parent.details[0]}"`);

  // Proxy budget cap is enforced, not decorative.
  const huge = generateProxyGeometry('disc-outline', { radiusWU: 100000 });
  assert.ok(huge.lineCount <= MAP_PROXY_TRIANGLE_CAP,
    'even an absurd radius must not exceed the proxy budget — segments are bounded by construction');
  ok(`proxy segment count stays bounded (${huge.lineCount}) even at a 100,000 WU radius`);
}

function run() {
  console.log('Atlas place-path gate');
  console.log('=====================');
  console.log(`Subject: ${SAMPLE_ID} in ${SECTOR_ID} (nonzero origin)`);
  try {
    testIdentityAndFrame();
    testSemanticZoom();
    testSelectionAndProxy();
    testRouteContribution();
    testDiscovery();
    testSaveIdentity();
    testGateBites();
  } catch (err) {
    console.error(`\nFAIL ${err && err.message ? err.message : err}`);
    if (err && err.stack) console.error(err.stack.split('\n').slice(1, 4).join('\n'));
    process.exit(1);
  }
  console.log(`\nResult: PASS — ${passed} assertions across 7 sections`);
  console.log('NOT claimed by this check: live in-scene proxy rendering (boot-to-flight exceeds every');
  console.log('browser-harness budget in this repo — see design/program/atlas/03_LEDGER.md).');
}

run();
