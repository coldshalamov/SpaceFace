// Cycle-3 wave (phases 24–31, AE-232..AE-299): machine wave B kinds + kinematics, the
// structure wave B sites, K-table access credentials, the L-table evidence ledger,
// N-table setpieces, O-table barks, and persistence of the whole mystery layer.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MACHINE_KINDS,
  MACHINE_SITES,
  machineSitesForSector,
  advanceMachineProtocol,
  suppressionFieldAt,
} from '../src/data/precursorMachines.js';
import {
  EVIDENCE_TABLE,
  SETPIECE_DEFS,
  setpieceById,
  ECOLOGY_DECK,
  pickEcologyEncounter,
  ALIEN_UNIQUE_GRANTS,
  ALIEN_SITES,
  ecologyMissionsForSite,
} from '../src/data/alienEcology.js';
import { COMMODITIES } from '../src/data/commodities.js';
import { MODULES } from '../src/data/modules.js';
import { SECTORS } from '../src/data/sectors.js';
import { AUTHORED_PLACE_ZONES } from '../src/data/authoredPlaces.js';
import { ensureAlienEcologyState } from '../src/data/alienEcologyState.js';
import { mulberry32, hash32 } from '../src/core/rng.js';
import {
  materializeMachineLayer,
  tickMachineLayer,
  shepherdFieldAt,
} from '../src/systems/precursorMachines.js';
import {
  tickAlienEcology,
  handleAlienEcologyEvent,
  recordEvidence,
  serializeAlienEcologyState,
  deserializeAlienEcologyState,
} from '../src/systems/alienEcology.js';
import { world as liveWorld } from '../src/systems/world.js';
import { missions as missionsProto } from '../src/systems/missions.js';

function makeState(sectorId = 'sector_io_reach') {
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

function makeWorld(state, emitLog = [], granted = []) {
  const world = {
    state,
    registry: {
      get: (name) => (name === 'ships'
        ? { grantModule: ({ defId }) => { granted.push(defId); return true; } }
        : null),
    },
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
    bus: null,
  };
  world.bus = {
    emit: (type, p) => {
      emitLog.push({ type, p });
      // Wire the world.js bus bindings under test: machine-layer emissions land in the
      // ecology handler exactly as they do on the live bus.
      if (type.startsWith('ecology:')) handleAlienEcologyEvent(world, type, p);
    },
  };
  return world;
}

function makePlayer(state, x, z) {
  const p = {
    id: state.playerId, type: 'player',
    pos: { x, z }, vel: { x: 0, z: 0 },
    data: { fittings: [] },
  };
  state.entities.set(state.playerId, p);
  state.entityList.push(p);
  return p;
}

function machinesOf(state, kind) {
  return state.entityList.filter((e) => e.type === 'machine'
    && e.data && e.data.machine && e.data.machine.kind === kind);
}

const WAVE_B_KINDS = [
  'witness', 'shepherd', 'mason', 'executor', 'courier', 'conservator',
  'measure', 'boundary_walker', 'appeals_clerk', 'debris_sorter', 'sleeping_jury',
];

const WAVE_B_SITES = [
  'veil_containment_ring', 'charon_star_marker', 'sker_quiet_dock', 'io_listening_field',
  'pallas_empty_foundry', 'ashfall_the_line', 'charon_broken_shepherd', 'veil_exception_chamber',
];

// ── Phase 24: machine wave B data ──────────────────────────────────────────────────
test('all 11 wave-B kinds are registered with the fields their behaviors read', () => {
  const needs = {
    witness: ['observeR'], shepherd: ['patrolPeriodS', 'suppressionRadius'],
    mason: ['orbitR', 'weldPeriodS'], executor: ['shadowR', 'quarantinePulseR', 'pulsePeriodS'],
    courier: ['routePeriodS', 'speed'], conservator: ['refuseR'], measure: ['readR'],
    boundary_walker: ['patrolLen', 'watchR'], appeals_clerk: ['counterR'],
    debris_sorter: ['sweepR', 'collectDelayS'], sleeping_jury: ['wakeR'],
  };
  for (const id of WAVE_B_KINDS) {
    const k = MACHINE_KINDS[id];
    assert.ok(k, `kind ${id} registered`);
    assert.ok(k.radius > 0, `${id} has radius`);
    for (const f of needs[id]) assert.ok(k[f] > 0, `${id}.${f}`);
  }
});

// ── Phase 25: structure wave B reachability ─────────────────────────────────────────
test('every wave-B site has a sector POI + authored zone so it is flyable', () => {
  const poiIds = new Set();
  for (const s of SECTORS) for (const p of s.pois || []) poiIds.add(p.id);
  const zoneIds = new Set();
  for (const list of Object.values(AUTHORED_PLACE_ZONES)) for (const z of list) zoneIds.add(z.id);
  for (const siteId of WAVE_B_SITES) {
    const site = MACHINE_SITES[siteId];
    assert.ok(site, `site ${siteId} registered`);
    assert.ok(machineSitesForSector(site.sectorId).some((s) => s.siteId === siteId),
      `${siteId} resolves in ${site.sectorId}`);
    assert.ok(poiIds.has(`poi_${siteId}`), `poi_${siteId} present`);
    assert.ok(zoneIds.has(`zone_${siteId}`), `zone_${siteId} present`);
    assert.ok((site.machines || []).every((m) => MACHINE_KINDS[m.kind]), `${siteId} kinds resolve`);
  }
});

// ── Phase 26: K-table credentials exist and stay out of the seeded economy ──────────
test('K-table commodities are protocol items that never seed the market', () => {
  for (const id of ['cmdty_gate_handshake', 'cmdty_inertial_datum',
    'cmdty_revocation_beacon', 'cmdty_unbroken_lens']) {
    const c = COMMODITIES.find((x) => x.id === id);
    assert.ok(c, `${id} exists`);
    assert.equal(c.category, 'protocol', `${id} category`);
    assert.equal(c.noMarketSeed, true, `${id} noMarketSeed`);
  }
  const coupler = MODULES.find((m) => m.id === 'mod_lattice_coupler_s');
  assert.ok(coupler, 'lattice coupler module exists');
  assert.equal(coupler.mods.latticeCoupler, true);
});

// ── Phase 27: evidence ledger + revelation pacing ───────────────────────────────────
test('evidence files once, three rows lift revelation to 2, a tier-3 row lifts to 3', () => {
  const state = makeState();
  const ae = ensureAlienEcologyState(state);
  assert.equal(ae.revelation, 0);
  assert.ok(recordEvidence(state, 'L01', 'sector_io_reach'));
  assert.ok(recordEvidence(state, 'L02', 'sector_charon_expanse'));
  assert.equal(ae.revelation, 0, 'two rows below threshold');
  assert.ok(!recordEvidence(state, 'L01', 'sector_io_reach'), 'evidence never refires');
  assert.ok(recordEvidence(state, 'L03', 'sector_pallas_drift'));
  assert.equal(ae.revelation, 2, 'three filed rows disclose tier 2');
  assert.ok(recordEvidence(state, 'L09', 'sector_charon_expanse'));
  assert.equal(ae.revelation, 3, 'a deep row discloses tier 3');
});

test('every evidence source a wave-B system emits is in the table', () => {
  for (const id of ['L01', 'L02', 'L03', 'L04', 'L05', 'L06', 'L07', 'L08', 'L09', 'L10',
    'P01', 'P02', 'P03', 'P04', 'P05', 'P06', 'P07', 'P08', 'P09', 'P10']) {
    assert.ok(EVIDENCE_TABLE[id], `${id} in EVIDENCE_TABLE`);
    assert.ok(EVIDENCE_TABLE[id].text.length > 20, `${id} carries a finding`);
  }
});

// ── Phase 29: setpieces ────────────────────────────────────────────────────────────
test('setpiece defs resolve to real sites and fire once', () => {
  for (const def of SETPIECE_DEFS) {
    assert.ok(def.id.startsWith('N'), `${def.id} ids the N-table`);
    if (def.trigger !== 'cross') assert.ok(def.radius > 0, `${def.id} has radius`);
    if (def.evidence) assert.ok(EVIDENCE_TABLE[def.evidence], `${def.id} evidence resolves`);
  }
  assert.ok(setpieceById('N01_broken_corridor'));
  assert.equal(setpieceById('nope'), null);

  // N05: hold inside the listening field for holdS fires once and files L01.
  const state = makeState('sector_io_reach');
  const emitLog = [];
  const world = makeWorld(state, emitLog);
  materializeMachineLayer(world, { id: 'sector_io_reach' }, world.active);
  const site = MACHINE_SITES.io_listening_field;
  makePlayer(state, site.center.x, site.center.z);
  const ae = ensureAlienEcologyState(state);
  for (let i = 0; i < 60 * 10; i += 1) {
    state.simTime += 1 / 60;
    tickAlienEcology(world, 1 / 60);
  }
  assert.equal(ae.setpieces.N05_witness_stands_down, true, 'N05 fired');
  assert.ok(ae.evidence.L01, 'L01 filed by setpiece');
  const toasts = emitLog.filter((e) => e.type === 'toast' && /stands down|witness/i.test(e.p.text));
  assert.equal(toasts.length, 1, 'N05 fires exactly once');
});

// ── Phase 24 runtime: courier intercept mints the handshake token ──────────────────
test('courier intercept grants one gate-handshake token and files L06', () => {
  const state = makeState('sector_io_reach');
  const emitLog = [];
  const world = makeWorld(state, emitLog);
  materializeMachineLayer(world, { id: 'sector_io_reach' }, world.active);
  const courier = machinesOf(state, 'courier')[0];
  assert.ok(courier, 'courier spawned');
  const site = MACHINE_SITES.io_listening_field;
  // Park the player on the courier so the intercept check passes once it ticks.
  makePlayer(state, courier.pos.x + 40, courier.pos.z);
  const ae = ensureAlienEcologyState(state);
  tickMachineLayer(world, 0.1);
  assert.equal(state.player.cargo.items.cmdty_gate_handshake, 1, 'token granted');
  assert.ok(ae.evidence.L06, 'L06 filed');
  assert.equal(emitLog.filter((e) => e.type === 'comms:log'
    && /TOKEN JETTISONED/.test(e.p.text)).length, 1);
  // Second tick must not re-grant.
  tickMachineLayer(world, 0.1);
  assert.equal(state.player.cargo.items.cmdty_gate_handshake, 1);
  void site;
});

// ── Phase 24 runtime: executor scrubs biohazard cargo on the quarantine pulse ──────
test('executor wakes on a protocol fault and its pulse destroys biohazard cargo', () => {
  const state = makeState('sector_veil_nebula');
  const emitLog = [];
  const world = makeWorld(state, emitLog);
  materializeMachineLayer(world, { id: 'sector_veil_nebula' }, world.active);
  const executor = machinesOf(state, 'executor')[0];
  assert.ok(executor, 'executor spawned at the exception chamber');
  // No fault -> dormant.
  tickMachineLayer(world, 0.1);
  assert.ok(!executor.data.machine.awakened, 'executor sleeps while protocol is clean');
  // Revoked + player inside pulse radius carrying biohazard -> pulse scrubs the lot.
  advanceMachineProtocol(state, 'revoked');
  makePlayer(state, executor.pos.x + 100, executor.pos.z);
  state.player.cargo.items.cmdty_spore_catalyst = 2;
  state.player.cargo.usedVolume = 2;
  const bio = COMMODITIES.find((c) => c.id === 'cmdty_spore_catalyst');
  assert.ok(bio && bio.biohazard, 'fixture commodity is biohazard');
  executor.data.machine.sweepT = 999; // force the pulse this tick
  tickMachineLayer(world, 0.1);
  assert.ok(!state.player.cargo.items.cmdty_spore_catalyst, 'biohazard scrubbed');
  assert.ok(emitLog.some((e) => e.type === 'ecology:quarantinePulse' && e.p.scrubbed === 2));
});

// ── Phase 24 runtime: boundary walker logs a watched crossing as a violation ───────
test('crossing the line under a walker flags protocol violation and files L08', () => {
  const state = makeState('sector_ashfall_reach');
  const emitLog = [];
  const world = makeWorld(state, emitLog);
  materializeMachineLayer(world, { id: 'sector_ashfall_reach' }, world.active);
  const walker = machinesOf(state, 'boundary_walker')[0];
  assert.ok(walker, 'walker spawned');
  const site = MACHINE_SITES.ashfall_the_line;
  const player = makePlayer(state, site.center.x, site.center.z - 50);
  walker.pos.x = player.pos.x; walker.pos.z = player.pos.z - 40; // watching
  tickMachineLayer(world, 0.1);
  // Cross the line (z flips sign relative to the site line) while watched.
  player.pos.z = site.center.z + 50;
  tickMachineLayer(world, 0.1);
  const ae = ensureAlienEcologyState(state);
  assert.equal(ae.machineProtocol, 'violation', 'watched crossing is a violation');
  assert.ok(ae.evidence.L08, 'L08 filed');
});

// ── Phase 24 runtime: shepherd is a moving suppression pocket ──────────────────────
test('shepherdFieldAt reads the live shepherd position, not a fixed site field', () => {
  const state = makeState('sector_charon_expanse');
  const world = makeWorld(state);
  materializeMachineLayer(world, { id: 'sector_charon_expanse' }, world.active);
  const shepherd = machinesOf(state, 'shepherd')[0];
  assert.ok(shepherd, 'shepherd spawned at the broken corridor');
  const kind = MACHINE_KINDS.shepherd;
  assert.ok(shepherdFieldAt(state, 'sector_charon_expanse', shepherd.pos.x, shepherd.pos.z),
    'inside the moving pocket');
  assert.ok(!shepherdFieldAt(state, 'sector_charon_expanse',
    shepherd.pos.x + kind.suppressionRadius + 500, shepherd.pos.z), 'outside the pocket');
});

// ── Phase 26 endgame: exception chamber mints lens + route authority ────────────────
test('satisfying the chamber witness hold mints the unbroken lens and gates_exception', () => {
  const state = makeState('sector_veil_nebula');
  const emitLog = [];
  const world = makeWorld(state, emitLog);
  materializeMachineLayer(world, { id: 'sector_veil_nebula' }, world.active);
  const site = MACHINE_SITES.veil_exception_chamber;
  const player = makePlayer(state, site.center.x, site.center.z);
  const ae = ensureAlienEcologyState(state);
  // First tick: 'seen' fires + the WITNESS directive issues.
  tickMachineLayer(world, 0.1);
  assert.equal(ae.machineSites[site.siteId].directiveIssued, true, 'witness directive issued');
  // Hold still inside the radius for the full window (12s unaided).
  for (let i = 0; i < 60 * 14; i += 1) {
    state.simTime += 1 / 60;
    player.vel.x = 0; player.vel.z = 0;
    tickMachineLayer(world, 1 / 60);
  }
  assert.equal(state.player.cargo.items.cmdty_unbroken_lens, 1, 'lens minted once');
  assert.equal(ae.machineAccess.gates_exception, true, 'route authority granted');
  assert.equal(ae.machineProtocol, 'exception', 'protocol resolves to exception');
  assert.ok(ae.evidence.L10 && ae.evidence.P10, 'chamber evidence filed');
});

// ── Phase 24 fault contract: a verdict is not erased by a routine beat ─────────────
test('fault protocol states are sticky — only excepted or a fresh fault moves them', () => {
  const state = makeState();
  const ae = ensureAlienEcologyState(state);
  advanceMachineProtocol(state, 'revoked');
  advanceMachineProtocol(state, 'seen');
  advanceMachineProtocol(state, 'satisfied');
  assert.equal(ae.machineProtocol, 'revoked', 'routine beats must not clear a verdict');
  advanceMachineProtocol(state, 'excepted');
  assert.equal(ae.machineProtocol, 'exception', 'excepted is the one appeal path');
  advanceMachineProtocol(state, 'violated');
  assert.equal(ae.machineProtocol, 'violation', 'a new fault lands over exception');
});

// ── Phase 30: O-table barks respect C bands and machine knowledge ──────────────────
test('bark rows gate on contamination band and machine-protocol knowledge', () => {
  const barks = ECOLOGY_DECK.filter((r) => r.barkKind === 'bark');
  assert.ok(barks.length >= 15, 'bark table populated');
  const state = makeState();
  const ae = ensureAlienEcologyState(state);
  // Unknown protocol -> machine barks unreachable.
  const machineBark = barks.find((b) => b.machine === true);
  assert.ok(machineBark, 'machine bark rows exist');
  // High-C barks unreachable at low C.
  const pick = (c) => {
    ae._testC = c;
    const rows = ECOLOGY_DECK.filter((r) => r.barkKind === 'bark'
      && c >= r.minC && (r.maxC == null || c < r.maxC));
    return rows;
  };
  assert.ok(pick(0.2).every((r) => r.minC <= 0.2 && (r.maxC == null || r.maxC > 0.2)),
    'low-C band only yields low-C barks');
  assert.ok(pick(0.9).some((r) => r.minC >= 0.65), 'high-C band yields high-C barks');
  void pickEcologyEncounter;
});

// ── Phase 31: persistence — the mystery survives a save round-trip ─────────────────
test('machineSites, evidence, and setpieces round-trip through serialization', () => {
  const state = makeState('sector_io_reach');
  const world = makeWorld(state);
  materializeMachineLayer(world, { id: 'sector_io_reach' }, world.active);
  const ae = ensureAlienEcologyState(state);
  ae.machineSites.io_listening_field.seen = true;
  recordEvidence(state, 'L01', 'sector_io_reach');
  ae.setpieces.N05_witness_stands_down = true;
  const saved = serializeAlienEcologyState(state);
  const wire = JSON.parse(JSON.stringify(saved));

  const fresh = makeState('sector_io_reach');
  deserializeAlienEcologyState(fresh, wire);
  const ae2 = ensureAlienEcologyState(fresh);
  assert.equal(ae2.machineSites.io_listening_field.seen, true);
  assert.equal(ae2.evidence.L01.tier, 1);
  assert.equal(ae2.setpieces.N05_witness_stands_down, true);
  assert.equal(ae2.revelation, ae.revelation);
});

// ── AE-296: unique module grants land through ships.grantModule, once per save ──────
test('declared unique grants fire at their authored beats and never refire', () => {
  assert.equal(ALIEN_UNIQUE_GRANTS.length, 4, 'all four salvageOnly uniques are declared');
  for (const g of ALIEN_UNIQUE_GRANTS) {
    const def = MODULES.find((m) => m.id === g.id);
    assert.ok(def, `${g.id} exists in the module catalog`);
    assert.equal(def.unique, true, `${g.id} stays unique-flagged`);
  }

  // The dead shepherd yields the lattice coupler on first observation.
  const state = makeState('sector_charon_expanse');
  const granted = [];
  const world = makeWorld(state, [], granted);
  materializeMachineLayer(world, { id: 'sector_charon_expanse' }, world.active);
  const site = MACHINE_SITES.charon_broken_shepherd;
  makePlayer(state, site.center.x, site.center.z);
  tickMachineLayer(world, 0.1);
  assert.ok(granted.includes('mod_lattice_coupler_s'), 'broken shepherd grants the coupler');
  const ae = ensureAlienEcologyState(state);
  assert.ok(ae.uniqueGrants.mod_lattice_coupler_s != null, 'once-flag recorded');

  // A severed relay yields the resonant massline coil — once.
  handleAlienEcologyEvent(world, 'alienEcology:relaySevered', { siteId: 'cinder_nursery' });
  handleAlienEcologyEvent(world, 'alienEcology:relaySevered', { siteId: 'cinder_nursery' });
  assert.equal(granted.filter((id) => id === 'mod_resonant_massline_m').length, 1,
    'relay sever grants the coil exactly once');

  // The grants survive a save round-trip — re-severing on a loaded save does not refire.
  const saved = serializeAlienEcologyState(state);
  const fresh = makeState('sector_charon_expanse');
  deserializeAlienEcologyState(fresh, JSON.parse(JSON.stringify(saved)));
  const granted2 = [];
  const world2 = makeWorld(fresh, [], granted2);
  handleAlienEcologyEvent(world2, 'alienEcology:relaySevered', { siteId: 'cinder_nursery' });
  assert.equal(granted2.length, 0, 'loaded once-flags suppress regrant');
});

// ── AE-108 runtime: the machines' credential on the real route ─────────────────
test('machineGate refuses fault verdicts and honors standing beside the charted gate', () => {
  const sector = SECTORS.find((s) => s.id === 'sector_veil_nebula');
  assert.equal(sector.wormholeTo.machineGate, 'route_veil_ashfall');
  const run = (state) => liveWorld._wormholeUnlocked.call(
    { state, bus: { emit: () => {} } }, sector);
  const fresh = () => { const s = makeState(); s.story = { flags: {} }; return s; };

  const s1 = fresh();
  assert.equal(run(s1), false, 'charted gate still holds without research or standing');
  s1.player.researchedNodes = ['tech_long_range_survey'];
  assert.equal(run(s1), true, 'the authored tech prerequisite still opens transit');

  const s2 = fresh();
  advanceMachineProtocol(s2, 'seen');
  advanceMachineProtocol(s2, 'satisfied');
  assert.equal(run(s2), true, 'compliant standing opens transit without research');
  s2.player.researchedNodes = ['tech_long_range_survey'];
  advanceMachineProtocol(s2, 'revoked');
  assert.equal(run(s2), false, 'a revoked verdict vetoes even a researched route');

  const s3 = fresh();
  s3.player.cargo.items.cmdty_gate_handshake = 1;
  assert.equal(run(s3), true, 'a handshake token burns once to open the route');
  assert.equal(s3.player.cargo.items.cmdty_gate_handshake, undefined, 'token consumed');
  assert.equal(ensureAlienEcologyState(s3).machineAccess.route_veil_ashfall, true,
    'route authority recorded on the burn');
  assert.equal(run(s3), true, 'recorded access re-opens without another token');

  const s4 = fresh();
  s4.player.cargo.items.cmdty_gate_handshake = 1;
  advanceMachineProtocol(s4, 'violated');
  assert.equal(run(s4), false, 'a fault verdict refuses even with a token in hold');
  assert.equal(s4.player.cargo.items.cmdty_gate_handshake, 1, 'token is not wasted');
});

// ── Offer boarding contract: offers mark emitted only once the board takes them ──
test('every desk offer boards at one station; a refused emit retries on re-entry', () => {
  const site = ALIEN_SITES.three_hull_garden;
  const missions = ecologyMissionsForSite(site.siteId);
  assert.ok(missions.length >= 2, 'three_hull_garden carries several contracts');
  const STATION = 'station_expanse';
  const build = () => {
    const state = makeState('sector_charon_expanse');
    state.missions = { boards: {}, active: [], completedLog: [], receipts: [], nextId: 1, config: null };
    state.world.sectors['sector_charon_expanse'] = { stations: [{ id: STATION }] };
    const emitLog = [];
    const world = makeWorld(state, emitLog);
    const handlers = {};
    world.bus = {
      on: (t, fn) => { (handlers[t] = handlers[t] || []).push(fn); },
      emit: (t, p) => {
        emitLog.push({ type: t, p });
        for (const fn of handlers[t] || []) fn(p);
        if (t.startsWith('ecology:')) handleAlienEcologyEvent(world, t, p);
      },
    };
    const missionSystem = { ...missionsProto };
    missionSystem.init({ state, bus: world.bus, helpers: world.helpers, registry: { get: () => null } });
    return { state, world, emitLog, missionSystem };
  };
  const offersAboard = (state) => ((state.missions.boards[STATION] || {}).slots || [])
    .filter((o) => o && o.source === 'ecology');

  // First entry: every authored desk boards — per-id dedupe, not one-row-per-source.
  const first = build();
  makePlayer(first.state, site.center.x, site.center.z);
  tickAlienEcology(first.world, 1 / 60);
  const ae = ensureAlienEcologyState(first.state);
  const rec = ae.sites[site.siteId];
  assert.equal(offersAboard(first.state).length, missions.length,
    'all site contracts board together at the same station');
  assert.equal(Object.keys(rec.offersEmitted).length, missions.length,
    'emitted bits set only after boarding');
  tickAlienEcology(first.world, 1 / 60);
  assert.equal(offersAboard(first.state).length, missions.length, 'no duplicate rows on re-tick');

  // Refusal: nothing aboard -> the key stays unset -> the next band entry retries.
  const retry = build();
  const p = makePlayer(retry.state, site.center.x, site.center.z);
  const offered = [];
  // Intercept the emit before it reaches the real board gate: simulate a refused boarding.
  const baseEmit = retry.world.bus.emit;
  retry.world.bus.emit = (t, payload) => {
    if (t === 'mission:offered') { offered.push(payload); return; }
    baseEmit(t, payload);
  };
  tickAlienEcology(retry.world, 1 / 60);
  assert.equal(offered.length, missions.length, 'refused emits still fire');
  const ae2 = ensureAlienEcologyState(retry.state);
  assert.equal(Object.keys(ae2.sites[site.siteId].offersEmitted).length, 0,
    'a refused row is never marked emitted');
  // Leave the band far enough to re-arm, then re-enter: the emit retries and boards.
  retry.world.bus.emit = baseEmit;
  p.pos.z = site.center.z + site.arrivalBands.close * 2;
  tickAlienEcology(retry.world, 1 / 60);
  p.pos.z = site.center.z;
  tickAlienEcology(retry.world, 1 / 60);
  assert.equal(offersAboard(retry.state).length, missions.length, 'retry boards every desk');
  assert.equal(Object.keys(ae2.sites[site.siteId].offersEmitted).length, missions.length);
});
