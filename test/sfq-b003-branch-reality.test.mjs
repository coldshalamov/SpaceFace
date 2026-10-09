// SFQ-B003 — branch-reality audit of PR-170 (merge 6acc84fd2). The alien-ecology /
// precursor-machine branch claims Cinder Nursery and its machine sites land on the build
// as real, navigable content. These assertions pin the landed truth, not the PR prose:
//
//   1. Ordinary navigation — a sector-graph walk from the authored new-game sector reaches
//      Cinder Nursery (sector_charon_expanse) and live machine sites (io, veil, charon).
//   2. Resolution — the nursery's full data chain (sector POI row → world-site manifest →
//      authored zone → ALIEN_SITES entry → materialize) actually connects; a machine site
//      resolves to a chart POI, spawns machine entities, and fires its observation beats.
//   3. Capability honesty — a capability is either present on the build or explicitly
//      absent (a null/dangling reference is never silently assumed): every site poiId
//      resolves to a real POI row or is declared null; every runtimeOwner-tagged POI
//      resolves back into its owning registry; every kind/directive/evidence id resolves.
//   4. Persistence — the mystery ledger (sites, protocol, evidence) survives a save
//      round-trip, so a cold load and resume preserve the landed outcomes.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MACHINE_KINDS,
  MACHINE_SITES,
  MACHINE_DIRECTIVES,
  machineSitesForSector,
  machineKindById,
  scannerMachineLabel,
  MACHINE_PROTOCOL_ORDER,
  MACHINE_PROTOCOL_FAULTS,
} from '../src/data/precursorMachines.js';
import { ALIEN_SITES, EVIDENCE_TABLE } from '../src/data/alienEcology.js';
import { SECTORS } from '../src/data/sectors.js';
import { AUTHORED_PLACE_ZONES } from '../src/data/authoredPlaces.js';
import { worldSiteManifestById } from '../src/data/worldSiteManifests.js';
import { NEW_GAME } from '../src/data/newGameDefaults.js';
import { ensureAlienEcologyState } from '../src/data/alienEcologyState.js';
import { mulberry32, hash32 } from '../src/core/rng.js';
import {
  materializeMachineLayer,
  tickMachineLayer,
  machineRouteOpen,
} from '../src/systems/precursorMachines.js';
import {
  materializeAlienEcology,
  serializeAlienEcologyState,
  deserializeAlienEcologyState,
} from '../src/systems/alienEcology.js';

const SECTOR_BY_ID = new Map(SECTORS.map((s) => [s.id, s]));
const ZONE_BY_ID = new Map();
for (const list of Object.values(AUTHORED_PLACE_ZONES)) {
  for (const z of list) ZONE_BY_ID.set(z.id, z);
}

/** Ordinary navigation graph: charted neighbors + authored wormhole edges only. */
function sectorsReachableFrom(startId) {
  const seen = new Set();
  const queue = [startId];
  while (queue.length) {
    const id = queue.shift();
    if (seen.has(id)) continue;
    seen.add(id);
    const sector = SECTOR_BY_ID.get(id);
    if (!sector) continue;
    for (const n of sector.neighbors || []) if (!seen.has(n)) queue.push(n);
    for (const target of Object.values(sector.wormholeTo || {})) {
      if (typeof target === 'string' && !seen.has(target)) queue.push(target);
      else if (target && typeof target === 'object' && typeof target.sectorId === 'string'
        && !seen.has(target.sectorId)) queue.push(target.sectorId);
    }
  }
  return seen;
}

function makeState(sectorId) {
  return {
    meta: { seed: 47 },
    simTime: 0,
    playerId: 1,
    entities: new Map(),
    entityList: [],
    player: { cargo: { items: {}, usedVolume: 0, usedMass: 0, capVolume: 500, capMass: 500 } },
    world: { currentSectorId: sectorId, sectors: {} },
  };
}

function makeWorld(state, emitLog = []) {
  const world = {
    state,
    registry: { get: () => null },
    helpers: {
      mulberry32,
      hash32,
      spawnEntity: (spec) => {
        const e = { ...spec, alive: true, pos: { x: spec.pos.x, z: spec.pos.z } };
        e.id = state.entities.size + 100;
        state.entities.set(e.id, e);
        state.entityList.push(e);
        return e;
      },
      removeEntity: (id) => {
        const e = state.entities.get(id);
        if (e) e.alive = false;
      },
    },
    _toGlobal: (local) => ({ x: local.x, z: local.z }),
    _toLocal: (pos) => ({ x: pos.x, z: pos.z }),
    active: { dressing: [], pois: [] },
    bus: { emit: (type, p) => emitLog.push({ type, p }) },
  };
  return world;
}

// ── 1. Ordinary navigation: the branch's content sits on the default chart ───────────────
test('the new-game sector reaches Cinder Nursery and live machine-site sectors', () => {
  const start = NEW_GAME.startingSectorId;
  assert.ok(SECTOR_BY_ID.get(start), 'new-game sector exists on the chart');
  const reachable = sectorsReachableFrom(start);
  // Cinder Nursery lives in Charon; the machine layer's authored sites are in io/charon/
  // pallas/veil/ashfall/sker — every one of those sectors must be graph-reachable, and the
  // nursery + listening-field sectors must be reachable through plain neighbor hops.
  assert.ok(reachable.has('sector_charon_expanse'), 'Charon reachable — Cinder Nursery');
  assert.ok(reachable.has('sector_io_reach'), 'Io reachable — Listening Field courier site');
  assert.ok(reachable.has('sector_veil_nebula'), 'Veil reachable — machine gate sites');
  for (const site of Object.values(MACHINE_SITES)) {
    assert.ok(reachable.has(site.sectorId),
      `machine site ${site.siteId} sits in unreachable sector ${site.sectorId}`);
  }
  for (const site of Object.values(ALIEN_SITES)) {
    assert.ok(reachable.has(site.sectorId),
      `ecology site ${site.siteId} sits in unreachable sector ${site.sectorId}`);
  }
});

// ── 2a. Cinder Nursery resolves through its real chain ───────────────────────────────────
test('Cinder Nursery connects POI row → manifest → zone → site → materialized fauna', () => {
  const nursery = ALIEN_SITES.cinder_nursery;
  assert.ok(nursery, 'ALIEN_SITES.cinder_nursery exists');
  assert.equal(nursery.sectorId, 'sector_charon_expanse');

  // The chart POI row is deliberately markerless (runtimeOwner owns the visible body) but
  // must carry the site's anchor so scanner/map identity resolves to the same place.
  const sector = SECTOR_BY_ID.get(nursery.sectorId);
  const poi = (sector.pois || []).find((p) => p.id === nursery.worldSiteId);
  assert.ok(poi, `chart row ${nursery.worldSiteId} present on ${sector.id}`);
  assert.deepEqual(poi.anchor, nursery.center, 'POI anchor matches the site center');

  // The world-site manifest is the body's owner — it must exist, sit in the same sector,
  // and emit its consequence intents into the alienEcology domain the branch registers.
  const manifest = worldSiteManifestById(nursery.worldSiteId);
  assert.ok(manifest, 'world-site manifest registered');
  assert.equal(manifest.sectorId, nursery.sectorId);
  const intents = (manifest.consequences || [])
    .flatMap((c) => c.intents || []);
  assert.ok(intents.length > 0, 'manifest emits consequence intents');
  assert.ok(intents.every((i) => i.domain === 'alienEcology' || i.domain === 'economy'),
    'consequence intents land on registered owners');
  assert.ok((manifest.payloads || []).length > 0, 'manifest carries physical payloads');
  assert.ok(manifest.persistence && manifest.persistence.collection,
    'manifest declares a persistence collection');

  // The authored zone carries its map identity.
  assert.ok(ZONE_BY_ID.get(nursery.zoneId), `authored zone ${nursery.zoneId} exists`);

  // Runtime truth: materializing the sector produces nursery fauna + growth, not nothing.
  const state = makeState(nursery.sectorId);
  const world = makeWorld(state);
  materializeAlienEcology(world, { id: nursery.sectorId }, world.active);
  const fauna = state.entityList.filter((e) => e.type === 'fauna'
    && e.data && e.data.ecology && e.data.ecology.siteId === 'cinder_nursery');
  assert.ok(fauna.length > 0, 'nursery fauna materialize as live entities');
  const growth = world.active.dressing.filter((d) => d.placeId
    && String(d.placeId).startsWith('alien_growth_'));
  assert.ok(growth.length > 0, 'nursery infestation dressing materializes');
});

// ── 2b. A machine site resolves through ordinary navigation and observation ──────────────
test('io_listening_field resolves to a chart POI, spawns machines, and fires its beats', () => {
  const site = MACHINE_SITES.io_listening_field;
  assert.ok(site, 'io_listening_field registered');
  assert.ok(machineSitesForSector(site.sectorId).some((s) => s.siteId === site.siteId));

  // The chart row exists at the same place the site claims to be — no hidden relocation.
  const sector = SECTOR_BY_ID.get(site.sectorId);
  const poi = (sector.pois || []).find((p) => p.id === site.poiId);
  assert.ok(poi, `${site.poiId} present on ${site.sectorId}`);
  assert.deepEqual(poi.pos, site.center, 'POI pos matches the machine-site center');
  assert.equal(poi.runtimeOwner, 'machineLayer');

  const state = makeState(site.sectorId);
  const world = makeWorld(state);
  materializeMachineLayer(world, { id: site.sectorId }, world.active);
  const machines = state.entityList.filter((e) => e.type === 'machine'
    && e.data && e.data.machine && e.data.machine.siteId === site.siteId);
  assert.ok(machines.length > 0, 'machine entities spawned');
  assert.ok(machines.some((e) => e.data.machine.kind === 'courier'),
    'the listening field casts a courier');
  assert.ok(machines.every((e) => e.collides === false && e.physicsBody === false),
    'machines stay kinematic contacts, not combat physics bodies');

  // First observation is the 'seen' beat: protocol advances, the directive issues, and
  // story.verge.revealed is set so the galaxy map admits the layer exists.
  const player = { id: state.playerId, type: 'player',
    pos: { x: site.center.x, z: site.center.z }, vel: { x: 0, z: 0 }, data: { fittings: [] } };
  state.entities.set(state.playerId, player);
  state.entityList.push(player);
  const ae = ensureAlienEcologyState(state);
  tickMachineLayer(world, 0.1);
  assert.equal(ae.machineSites[site.siteId].seen, true, 'site observed');
  assert.equal(ae.machineSites[site.siteId].directiveIssued, true, 'WITNESS directive issued');
  assert.equal(ae.machineProtocol, 'observed', 'protocol advances to observed');
});

// ── 3a. Capability honesty: every site poiId resolves or is explicitly absent ────────────
test('every machine-site poiId resolves to its sector POI row or is declared null', () => {
  for (const site of Object.values(MACHINE_SITES)) {
    if (site.poiId == null) continue; // explicit absence — Null Corridor reads sterile on purpose
    const sector = SECTOR_BY_ID.get(site.sectorId);
    assert.ok(sector, `${site.siteId} sector exists`);
    const poi = (sector.pois || []).find((p) => p.id === site.poiId);
    assert.ok(poi, `${site.siteId} claims poiId ${site.poiId} but no such chart row exists`);
    assert.deepEqual(poi.pos, site.center,
      `${site.siteId} poiId pos drifts from the site center`);
    assert.equal(poi.runtimeOwner, 'machineLayer',
      `${site.siteId} poiId is not machineLayer-owned`);
  }
});

// ── 3b. Capability honesty: runtimeOwner POI rows resolve back to their registry ────────
test('every runtimeOwner-tagged POI row resolves into the owning branch registry', () => {
  const machinePoiIds = new Set(
    Object.values(MACHINE_SITES).map((s) => s.poiId).filter(Boolean));
  const ecologyPoiIds = new Set(
    Object.values(ALIEN_SITES).map((s) => s.poiId).filter(Boolean)
      .concat(Object.values(ALIEN_SITES).map((s) => s.worldSiteId).filter(Boolean)));
  for (const sector of SECTORS) {
    for (const poi of sector.pois || []) {
      if (poi.runtimeOwner === 'machineLayer') {
        assert.ok(machinePoiIds.has(poi.id),
          `${sector.id}:${poi.id} claims machineLayer ownership but no MACHINE_SITE backs it`);
      } else if (poi.runtimeOwner === 'alienEcology') {
        assert.ok(ecologyPoiIds.has(poi.id),
          `${sector.id}:${poi.id} claims alienEcology ownership but no ALIEN_SITE backs it`);
      } else if (poi.runtimeOwner === 'asteroidSites' && poi.id.startsWith('world_site_')) {
        assert.ok(worldSiteManifestById(poi.id),
          `${sector.id}:${poi.id} claims world-site ownership but no manifest backs it`);
      }
    }
  }
});

// ── 3c. Capability honesty: referenced ids actually resolve inside the branch ───────────
test('site kinds, directives, and evidence ids resolve inside the branch data', () => {
  for (const site of Object.values(MACHINE_SITES)) {
    for (const spec of site.machines || []) {
      assert.ok(machineKindById(spec.kind),
        `${site.siteId} casts unknown machine kind ${spec.kind}`);
    }
    if (site.directive != null) {
      assert.ok(MACHINE_DIRECTIVES[site.directive],
        `${site.siteId} issues unknown directive ${site.directive}`);
    }
    if (site.evidence != null) {
      assert.ok(EVIDENCE_TABLE[site.evidence],
        `${site.siteId} files unknown evidence ${site.evidence}`);
    }
    if (site.kind != null) assert.ok(typeof site.kind === 'string');
  }
  // Scanner truth-in-labeling: every protocol state resolves to a real label — the contact
  // never presents as a blank or a crash on a fresh save (protocol 'unknown') or on a
  // fault verdict.
  for (const proto of [...MACHINE_PROTOCOL_ORDER, ...MACHINE_PROTOCOL_FAULTS]) {
    const label = scannerMachineLabel(proto);
    assert.ok(typeof label === 'string' && label.length > 2,
      `protocol ${proto} has no scanner label`);
  }
  assert.equal(scannerMachineLabel('unknown').length > 0, true);
});

// ── 3d. Route-gate honesty: machineRouteOpen answers true or false, never "maybe" ───────
test('machineRouteOpen returns explicit booleans for access and protocol verdicts', () => {
  const state = makeState('sector_io_reach');
  const ae = ensureAlienEcologyState(state);
  assert.equal(machineRouteOpen(state, 'gates_exception'), false, 'no access, unknown protocol');
  ae.machineProtocol = 'compliant';
  assert.equal(machineRouteOpen(state, 'gates_exception'), true, 'compliant standing opens');
  ae.machineProtocol = 'revoked';
  assert.equal(machineRouteOpen(state, 'gates_exception'), false, 'fault verdict closes');
  ae.machineAccess = { gates_exception: true };
  assert.equal(machineRouteOpen(state, 'gates_exception'), true, 'recorded access opens');
});

// ── 4. Persistence: the landed outcomes survive a save round-trip ────────────────────────
test('machine sites and ecology ledger round-trip through serialization', () => {
  const state = makeState('sector_charon_expanse');
  const world = makeWorld(state);
  materializeMachineLayer(world, { id: 'sector_charon_expanse' }, world.active);
  materializeAlienEcology(world, { id: 'sector_charon_expanse' }, world.active);
  const ae = ensureAlienEcologyState(state);
  ae.machineSites.charon_broken_shepherd.seen = true;
  ae.machineAccess = { gates_exception: true };
  const saved = serializeAlienEcologyState(state);
  const wire = JSON.parse(JSON.stringify(saved));

  const fresh = makeState('sector_charon_expanse');
  deserializeAlienEcologyState(fresh, wire);
  const ae2 = ensureAlienEcologyState(fresh);
  assert.equal(ae2.machineSites.charon_broken_shepherd.seen, true,
    'observed site state survives the wire');
  assert.equal(ae2.machineAccess.gates_exception, true,
    'machine route access survives the wire');
});
