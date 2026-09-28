import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ALIEN_SITES,
  DEEP_FILTER_GATE,
  DOMAIN_THRESHOLD,
  LIVE_SPECIMEN_CMDTY,
  WREN_RECOGNITION,
  alienSitesForSector,
  ecologyMissionsForSite,
  pointContaminationAt,
} from '../src/data/alienEcology.js';
import { FAUNA_SPECIES, faunaSpeciesById } from '../src/data/alienFauna.js';
import { MACHINE_SITES, machineSitesForSector } from '../src/data/precursorMachines.js';
import { AUTHORED_PLACE_ZONES } from '../src/data/authoredPlaces.js';
import { SECTORS } from '../src/data/sectors.js';
import { COMMODITIES } from '../src/data/commodities.js';
import { MODULES } from '../src/data/modules.js';
import { createAlienEcologyState, ensureAlienEcologyState } from '../src/data/alienEcologyState.js';
import { mulberry32, hash32 } from '../src/core/rng.js';
import {
  deserializeAlienEcologyState,
  effectiveRevelation,
  handleAlienEcologyEvent,
  materializeAlienEcology,
  serializeAlienEcologyState,
  tickAlienEcology,
} from '../src/systems/alienEcology.js';

function makeState(sectorId = 'sector_sker_haven') {
  return {
    meta: { seed: 47 },
    simTime: 0,
    playerId: 1,
    entities: new Map(),
    entityList: [],
    player: { cargo: { items: {}, usedVolume: 0, usedMass: 0, capVolume: 50, capMass: 50 } },
    world: { currentSectorId: sectorId, sectors: {} },
  };
}

function makeWorld(state, spawnLog, emitLog) {
  return {
    state,
    helpers: {
      mulberry32,
      hash32,
      spawnEntity: (spec) => {
        const e = { ...spec, alive: true, pos: { x: spec.pos.x, z: spec.pos.z } };
        e.id = state.entities.size + 100;
        state.entities.set(e.id, e);
        state.entityList.push(e);
        spawnLog.push(e);
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
}

function fitModules(state, moduleIds) {
  let playerEnt = state.entities.get(state.playerId);
  if (!playerEnt) {
    playerEnt = { id: state.playerId, type: 'player', pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, data: { fittings: [] } };
    state.entities.set(state.playerId, playerEnt);
    state.entityList.push(playerEnt);
  }
  playerEnt.data.fittings = moduleIds;
  return playerEnt;
}

// ── AE-110..113: the deep pocket exists where the roadmap said it must ────────────────
test('harvest deep + converted yards anchor the C4+ pocket in flyable deep sectors', () => {
  const sker = alienSitesForSector('sector_sker_haven');
  assert.ok(sker.some((s) => s.siteId === 'harvest_deep'), 'harvest_deep in sker_haven');
  const ash = alienSitesForSector('sector_ashfall_reach');
  assert.ok(ash.some((s) => s.siteId === 'converted_yards'), 'converted_yards in ashfall');
  assert.ok(ALIEN_SITES.harvest_deep.baseContamination >= 0.6, 'deep pocket reads C4+');
  // Zones + POIs authored — the atlas merge stays append-only.
  assert.ok(AUTHORED_PLACE_ZONES.sector_sker_haven.some((z) => z.id === 'zone_sker_harvest_deep'));
  assert.ok(AUTHORED_PLACE_ZONES.sector_ashfall_reach.some((z) => z.id === 'zone_ashfall_converted_yards'));
  const skerSector = SECTORS.find((s) => s.id === 'sector_sker_haven');
  assert.ok(skerSector.pois.some((p) => p.id === 'poi_sker_harvest_deep'));
  const ashSector = SECTORS.find((s) => s.id === 'sector_ashfall_reach');
  assert.ok(ashSector.pois.some((p) => p.id === 'poi_ashfall_converted_yards'));
});

test('null causeway is a custodian-tended corridor inside the Haven pocket', () => {
  const sites = machineSitesForSector('sector_sker_haven');
  assert.ok(sites.some((s) => s.siteId === 'sker_null_causeway' && s.kind === 'corridor'));
  assert.ok(MACHINE_SITES.sker_null_causeway.suppression.radius > 0);
  assert.equal(MACHINE_SITES.sker_null_causeway.directive, 'HOLD');
});

test('void carrier is a hull-scale migrant that births veil rays on rupture', () => {
  const sp = faunaSpeciesById('void_carrier');
  assert.ok(sp, 'void_carrier species exists');
  assert.ok(sp.radius >= 60, 'hull-scale body');
  assert.equal(sp.carrier.juveniles, 'veil_ray');
  assert.ok(sp.migrates, 'it migrates between structures');
  assert.ok(FAUNA_SPECIES.void_carrier, 'registered in the species table');
});

// ── AE-114/117/119: deep-sector instruments ─────────────────────────────────────────
test('unfiltered hull in a contaminated deep sector earns one route advisory', () => {
  const state = makeState('sector_sker_haven');
  const emitLog = [];
  const world = makeWorld(state, [], emitLog);
  const sector = { id: 'sector_sker_haven' };
  const active = { dressing: [], pois: [] };
  materializeAlienEcology(world, sector, active);
  state.world.sectors.sector_sker_haven = { tier: 3 };
  const player = fitModules(state, []);
  // Stand inside the deep pocket's contamination field.
  player.pos = { x: -1500, z: -1600 };
  tickAlienEcology(world, 0.5);
  const advisories = emitLog.filter((e) => e.type === 'toast' && e.p.text.includes('ROUTE ADVISORY'));
  assert.equal(advisories.length, 1);
  tickAlienEcology(world, 0.5);
  assert.equal(emitLog.filter((e) => e.type === 'toast' && e.p.text.includes('ROUTE ADVISORY')).length, 1);
});

test('a fitted filter stack silences the deep advisory', () => {
  const state = makeState('sector_sker_haven');
  const emitLog = [];
  const world = makeWorld(state, [], emitLog);
  materializeAlienEcology(world, { id: 'sector_sker_haven' }, { dressing: [], pois: [] });
  state.world.sectors.sector_sker_haven = { tier: 3 };
  const player = fitModules(state, ['mod_filter_stack_s']);
  player.pos = { x: -1500, z: -1600 };
  tickAlienEcology(world, 0.5);
  assert.equal(emitLog.filter((e) => e.type === 'toast' && e.p.text.includes('ROUTE ADVISORY')).length, 0);
});

test('domain threshold fires once per sector at C5-class fields', () => {
  const state = makeState('sector_ashfall_reach');
  const emitLog = [];
  const world = makeWorld(state, [], emitLog);
  materializeAlienEcology(world, { id: 'sector_ashfall_reach' }, { dressing: [], pois: [] });
  state.world.sectors.sector_ashfall_reach = { tier: 4 };
  const player = fitModules(state, []);
  // The Converted Yards at full bloom is the densest authored field: 0.72 base + bloom.
  const ae = ensureAlienEcologyState(state);
  ae.sites.converted_yards = { state: 'bloom', siteC: 0, signals: [], beats: {}, deadFauna: {}, offersEmitted: {}, dead: [] };
  player.pos = { x: 800, z: 800 };
  const c = pointContaminationAt(state, 'sector_ashfall_reach', 800, 800);
  assert.ok(c >= DOMAIN_THRESHOLD.minC, `point contamination ${c} >= ${DOMAIN_THRESHOLD.minC}`);
  tickAlienEcology(world, 0.5);
  assert.equal(emitLog.filter((e) => e.type === 'toast' && e.p.text.includes('DOMAIN THRESHOLD')).length, 1);
  tickAlienEcology(world, 0.5);
  assert.equal(emitLog.filter((e) => e.type === 'toast' && e.p.text.includes('DOMAIN THRESHOLD')).length, 1);
});

test("wren's field recognition lands once per save in C0.6+ space", () => {
  const state = makeState('sector_sker_haven');
  const emitLog = [];
  const world = makeWorld(state, [], emitLog);
  materializeAlienEcology(world, { id: 'sector_sker_haven' }, { dressing: [], pois: [] });
  const player = fitModules(state, []);
  player.pos = { x: -1500, z: -1600 };
  tickAlienEcology(world, 0.5);
  tickAlienEcology(world, 0.5);
  const wren = emitLog.filter((e) => e.type === 'comms:log' && e.p.from && e.p.from.includes('Wren'));
  assert.equal(wren.length, 1);
  assert.ok(wren[0].p.text.length > 20);
});

// ── AE-121/122/127: read gear ────────────────────────────────────────────────────────
test('bio-spectral pass resolves biological labels one tier higher', () => {
  const state = makeState();
  ensureAlienEcologyState(state).revelation = 0;
  assert.equal(effectiveRevelation(state), 0);
  fitModules(state, ['mod_bio_spectral_pass_s']);
  assert.equal(effectiveRevelation(state), 1);
  ensureAlienEcologyState(state).revelation = 3;
  assert.equal(effectiveRevelation(state), 3, 'clamped at the top rung');
});

test('coherence meter emits a 1Hz read while inside a live site radius', () => {
  const state = makeState('sector_sker_haven');
  const emitLog = [];
  const world = makeWorld(state, [], emitLog);
  materializeAlienEcology(world, { id: 'sector_sker_haven' }, { dressing: [], pois: [] });
  const player = fitModules(state, ['mod_field_coherence_meter']);
  player.pos = { x: -1500, z: -1600 };
  for (let i = 0; i < 5; i += 1) tickAlienEcology(world, 0.5);
  const reads = emitLog.filter((e) => e.type === 'ecology:coherence');
  assert.ok(reads.length >= 2, `expected ~2 coherence reads, got ${reads.length}`);
  assert.equal(reads[0].p.siteId, 'harvest_deep');
  assert.equal(reads[0].p.coherent, true);
});

// ── AE-124: heat lures ──────────────────────────────────────────────────────────────
test('a dropped lure registers on the sector and burns out after its window', () => {
  const state = makeState('sector_sker_haven');
  const emitLog = [];
  const world = makeWorld(state, [], emitLog);
  materializeAlienEcology(world, { id: 'sector_sker_haven' }, { dressing: [], pois: [] });
  fitModules(state, []);
  handleAlienEcologyEvent(world, 'alienEcology:lureDropped', {
    x: 10, z: 10, sectorId: 'sector_sker_haven', burnS: 60,
  });
  const ae = ensureAlienEcologyState(state);
  assert.equal(ae.lures.length, 1);
  state.simTime = 100; // past burnout
  const player = state.entities.get(state.playerId);
  player.pos = { x: 0, z: 0 };
  tickAlienEcology(world, 0.5);
  assert.equal(ae.lures.length, 0, 'expired lures are dropped');
});

// ── AE-167: cradle capture into live cargo ───────────────────────────────────────────
test('releasing a latched organism under a cradle writes a live specimen lot', () => {
  const state = makeState('sector_sker_haven');
  const emitLog = [];
  const world = makeWorld(state, [], emitLog);
  const active = { dressing: [], pois: [] };
  materializeAlienEcology(world, { id: 'sector_sker_haven' }, active);
  const fauna = state.entityList.find((e) => e.type === 'fauna' && e.data.ecology.speciesId === 'mourning_kite');
  assert.ok(fauna, 'a capturable kite spawned');
  fauna.data.ecology.driveState = 'captured';
  fitModules(state, ['mod_capture_cradle_m']);
  handleAlienEcologyEvent(world, 'tether:released', { targetId: fauna.id });
  assert.equal(state.player.cargo.items[LIVE_SPECIMEN_CMDTY], 1);
  assert.equal(fauna.alive, false, 'the organism left the ecosystem');
  const ae = ensureAlienEcologyState(state);
  assert.equal(ae.sites[fauna.data.ecology.siteId].deadFauna[fauna.data.ecology.faunaKey], true);
  assert.ok(emitLog.some((e) => e.type === 'toast' && e.p.text.includes('Live specimen')));
});

test('no cradle fitted means release leaves the animal drifting, not in cargo', () => {
  const state = makeState('sector_sker_haven');
  const world = makeWorld(state, [], []);
  materializeAlienEcology(world, { id: 'sector_sker_haven' }, { dressing: [], pois: [] });
  const fauna = state.entityList.find((e) => e.type === 'fauna' && e.data.ecology.speciesId === 'mourning_kite');
  fauna.data.ecology.driveState = 'captured';
  fitModules(state, []);
  handleAlienEcologyEvent(world, 'tether:released', { targetId: fauna.id });
  assert.equal(state.player.cargo.items[LIVE_SPECIMEN_CMDTY] || 0, 0);
  assert.notEqual(fauna.alive, false);
});

// ── AE-125: hull purge on dock ───────────────────────────────────────────────────────
test('docking with a purge ring burns hull biofilm to zero', () => {
  const state = makeState();
  const emitLog = [];
  const world = makeWorld(state, [], emitLog);
  const ae = ensureAlienEcologyState(state);
  ae.exposure = 0.9;
  fitModules(state, []);
  handleAlienEcologyEvent(world, 'dock:docked', {});
  assert.equal(ae.exposure, 0.9, 'no ring, no purge');
  fitModules(state, ['mod_hull_purge_ring_m']);
  handleAlienEcologyEvent(world, 'dock:docked', {});
  assert.equal(ae.exposure, 0);
  assert.ok(emitLog.some((e) => e.type === 'toast' && e.p.text.includes('Purge ring')));
});

// ── AE-122: unsealed biohazard cargo breathes on the hull ───────────────────────────
test('unsealed biohazard cargo feeds exposure; a locker seals it', () => {
  const state = makeState('sector_sker_haven');
  const emitLog = [];
  const world = makeWorld(state, [], emitLog);
  materializeAlienEcology(world, { id: 'sector_sker_haven' }, { dressing: [], pois: [] });
  state.world.sectors.sector_sker_haven = { tier: 3 };
  const player = fitModules(state, []);
  player.pos = { x: 3000, z: 3000 }; // clean space — isolate the cargo channel
  state.player.cargo.items.cmdty_filament_sample = 4;
  const ae = ensureAlienEcologyState(state);
  ae.exposure = 0;
  for (let i = 0; i < 20; i += 1) tickAlienEcology(world, 0.5);
  const withCargo = ae.exposure;
  assert.ok(withCargo > 0, `biohazard cargo raised exposure (got ${withCargo})`);
  fitModules(state, ['mod_quarantine_locker_s']);
  ae.exposure = 0;
  for (let i = 0; i < 20; i += 1) tickAlienEcology(world, 0.5);
  assert.ok(ae.exposure <= 0, 'sealed locker stops cargo accrual');
});

// ── AE-130..137: faction desks at sites ──────────────────────────────────────────────
test('a site under several faction desks emits each authored offer once', () => {
  const deep = ALIEN_SITES.harvest_deep;
  const missions = ecologyMissionsForSite(deep.siteId);
  assert.equal(missions.length, 3, 'SCN audit + Reach survey + wave-B run share the deep pocket');
  const state = makeState('sector_sker_haven');
  const emitLog = [];
  const world = makeWorld(state, [], emitLog);
  materializeAlienEcology(world, { id: 'sector_sker_haven' }, { dressing: [], pois: [] });
  state.world.sectors.sector_sker_haven = { tier: 3, stations: [{ id: 'station_sker' }] };
  const player = fitModules(state, []);
  player.pos = { x: -1500, z: -1600 }; // inside the close band
  tickAlienEcology(world, 0.5);
  const offers = emitLog.filter((e) => e.type === 'mission:offered');
  assert.equal(offers.length, 3);
  assert.ok(offers.every((o) => o.p.factionId));
  tickAlienEcology(world, 0.5);
  assert.equal(emitLog.filter((e) => e.type === 'mission:offered').length, 3, 'no repeat offers');
});

// ── AE-116/118: the deep trace ───────────────────────────────────────────────────────
test('closing on the deep writes deep-trace evidence and revelation 3', () => {
  const state = makeState('sector_sker_haven');
  const emitLog = [];
  const world = makeWorld(state, [], emitLog);
  materializeAlienEcology(world, { id: 'sector_sker_haven' }, { dressing: [], pois: [] });
  const player = fitModules(state, []);
  player.pos = { x: -1500, z: -1600 };
  tickAlienEcology(world, 0.5);
  const ae = ensureAlienEcologyState(state);
  assert.equal(ae.sites.harvest_deep.deepTraceDone, true);
  assert.equal(ae.revelation, 3);
});

// ── AE-138/139: faction consequence ledger ───────────────────────────────────────────
test('custody refusals and sealed sales tally under the station faction', () => {
  const state = makeState();
  const world = makeWorld(state, [], []);
  const ae = ensureAlienEcologyState(state);
  handleAlienEcologyEvent(world, 'ecology:factionOutcome', { factionId: 'faction_scn', outcome: 'custody_refused' });
  handleAlienEcologyEvent(world, 'ecology:factionOutcome', { factionId: 'faction_scn', outcome: 'custody_refused' });
  handleAlienEcologyEvent(world, 'ecology:factionOutcome', { factionId: 'faction_mts', outcome: 'sealed_sale' });
  assert.equal(ae.factionConsequences.faction_scn.refused, 2);
  assert.equal(ae.factionConsequences.faction_mts.sealed, 1);
});

// ── Persistence: the new ledgers round-trip ───────────────────────────────────────────
test('cycle-1 ledgers serialize and lures drop', () => {
  const state = makeState();
  const ae = ensureAlienEcologyState(state);
  ae.sectorFlags['sector_sker_haven:advised'] = true;
  ae.wrenRecognized = true;
  ae.factionConsequences.faction_scn = { refused: 1, sold: 0, sealed: 0 };
  ae.lures.push({ x: 1, z: 2, sectorId: 'sector_sker_haven', until: 999 });
  ae.sites.harvest_deep = { state: 'awake', offersEmitted: { em_scn_quarantine_audit_deep: true }, deepTraceDone: true };
  const data = serializeAlienEcologyState(state);
  assert.equal(data.lures, undefined, 'lures are transient');
  const fresh = createAlienEcologyState();
  const state2 = makeState();
  state2.world.alienEcology = fresh;
  deserializeAlienEcologyState(state2, data);
  const ae2 = ensureAlienEcologyState(state2);
  assert.equal(ae2.sectorFlags['sector_sker_haven:advised'], true);
  assert.equal(ae2.wrenRecognized, true);
  assert.equal(ae2.factionConsequences.faction_scn.refused, 1);
  assert.equal(ae2.lures.length, 0);
  assert.equal(ae2.sites.harvest_deep.offersEmitted.em_scn_quarantine_audit_deep, true);
  assert.equal(ae2.sites.harvest_deep.deepTraceDone, true);
});

// ── Module rows exist and stay schema-clean ──────────────────────────────────────────
test('unlock-economy module rows exist with their behavioral mods', () => {
  const ids = new Set(MODULES.map((m) => m.id));
  for (const id of [
    'mod_bio_spectral_pass_s', 'mod_field_coherence_meter', 'mod_quarantine_locker_s',
    'mod_filter_stack_m', 'mod_hull_purge_ring_m', 'mod_heat_lure_s', 'mod_quiet_mask_s',
    'mod_relay_needle_s', 'mod_capture_cradle_m', 'mod_precursor_handshake_s',
    'mod_containment_seal_s',
  ]) {
    assert.ok(ids.has(id), `module ${id} shipped`);
  }
  const live = COMMODITIES.find((c) => c.id === LIVE_SPECIMEN_CMDTY);
  assert.ok(live && live.biohazard === true, 'live specimen is a biohazard lot');
});

test('deep ecology constants stay coherent', () => {
  assert.ok(DEEP_FILTER_GATE.minTier >= 3);
  assert.ok(DOMAIN_THRESHOLD.minC >= 0.7);
  assert.ok(WREN_RECOGNITION.minC >= 0.5);
});
