// Cycle-2 wave (phases 16–23, AE-160..AE-231): field-language fauna behaviors, wave-C
// sites, the field-instrument module wave, harvest economy, and the vignette deck.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ALIEN_SITES,
  FIELD_LANGUAGE,
  FAUNA_DROPS,
  RIPENING,
  planInfestationModules,
  pointContaminationAt,
} from '../src/data/alienEcology.js';
import { FAUNA_SPECIES } from '../src/data/alienFauna.js';
import { COMMODITIES } from '../src/data/commodities.js';
import { MODULES } from '../src/data/modules.js';
import { ensureAlienEcologyState } from '../src/data/alienEcologyState.js';
import { suppressionFieldAt } from '../src/data/precursorMachines.js';
import { mulberry32, hash32 } from '../src/core/rng.js';
import {
  handleAlienEcologyEvent,
  materializeAlienEcology,
  tickAlienEcology,
} from '../src/systems/alienEcology.js';

function makeState(sectorId = 'sector_charon_expanse') {
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

function materializeSite(state, world, site, recordState = 'awake') {
  materializeAlienEcology(world, { id: site.sectorId }, { dressing: [], pois: [] });
  const ae = ensureAlienEcologyState(state);
  const rec = ae.sites[site.siteId];
  assert.ok(rec, `site record for ${site.siteId}`);
  rec.state = recordState;
  return rec;
}

function faunaOf(state, speciesId) {
  return state.entityList.filter((e) => e.type === 'fauna'
    && e.data && e.data.ecology && e.data.ecology.speciesId === speciesId);
}

// ── Phase 16 fauna cast coverage ─────────────────────────────────────────────────────
test('every phase-16 species is cast by at least one site (no dead species)', () => {
  const cast = new Set();
  for (const site of Object.values(ALIEN_SITES)) {
    for (const id of Object.keys(site.faunaCast || {})) cast.add(id);
  }
  for (const id of ['cold_bell', 'suture_mite', 'black_sail', 'stone_lung', 'pilgrim_spine']) {
    assert.ok(cast.has(id), `${id} cast somewhere`);
    assert.ok(FAUNA_SPECIES[id], `${id} defined`);
    assert.ok(FAUNA_DROPS[id] || FAUNA_DROPS.default, `${id} harvestable`);
  }
});

// ── AE-175/176: morphology fingerprint + severed decay palette ───────────────────────
test('severed sites draw only the dead palette', () => {
  const rng = mulberry32(hash32(47, 'dead-palette'));
  const site = ALIEN_SITES.three_hull_garden;
  const rows = planInfestationModules(site, rng, 'severed');
  assert.ok(rows.length > 0);
  const dead = new Set(['dead_crown', 'silt_root', 'mineral_root', 'calcified_collar']);
  for (const r of rows) assert.ok(dead.has(r.moduleId), `severed module ${r.moduleId} is dead-palette`);
  const live = planInfestationModules(site, mulberry32(hash32(47, 'live-palette')), 'awake');
  assert.ok(live.some((r) => !dead.has(r.moduleId)), 'live site keeps glowing tissue');
});

// ── AE-162: black sail debris disguise resolves on completed scan ────────────────────
test('disguised fauna spawn as debris and reveal on scan:completed', () => {
  const state = makeState('sector_charon_expanse');
  const emitLog = []; const spawnLog = [];
  const world = makeWorld(state, spawnLog, emitLog);
  materializeSite(state, world, ALIEN_SITES.empty_skin, 'awake');
  const sails = faunaOf(state, 'black_sail');
  assert.ok(sails.length >= 1, 'black sails spawned');
  assert.equal(sails[0].data.ecology.disguised, true);
  assert.equal(sails[0].data.scannerSignalKind, 'debris');
  handleAlienEcologyEvent(world, 'scan:completed',
    { targetId: sails[0].id, sectorId: 'sector_charon_expanse', found: true });
  assert.equal(sails[0].data.ecology.disguised, false, 'scan peeled the disguise');
});

// ── AE-167/199: flee wave — a kill pulses same-species panic ─────────────────────────
test('killing fauna sets a site flee wave that same-species neighbors obey', () => {
  const state = makeState('sector_ashfall_reach');
  const emitLog = []; const spawnLog = [];
  const world = makeWorld(state, spawnLog, emitLog);
  const rec = materializeSite(state, world, ALIEN_SITES.towed_moonlet, 'awake');
  state.world.sectors.sector_ashfall_reach = { tier: 4 };
  const prey = faunaOf(state, 'needle_swarm')
    .filter((f) => f.data.ecology.siteId === 'towed_moonlet');
  assert.ok(prey.length >= 2, 'a flock to panic on the moonlet');
  fitModules(state, []);
  const player = state.entities.get(state.playerId);
  player.pos = { x: -200, z: -1500 };
  // Kill one inside the wave window; the wave is stamped on the site record.
  handleAlienEcologyEvent(world, 'entity:killed', { id: prey[0].id });
  assert.ok(rec.fleeWave, 'flee wave stamped on the site record');
  assert.ok(rec.fleeWave.until > state.simTime, 'wave is live');
  // Simulate enough ticks that the delay elapses and drives switch to flee.
  state.simTime += FIELD_LANGUAGE.fleeWaveDelayS + 0.1;
  for (let i = 0; i < 10; i += 1) tickAlienEcology(world, 0.5);
  const fled = faunaOf(state, 'needle_swarm').filter((f) => f.data.ecology.driveState === 'flee');
  assert.ok(fled.length >= 1, 'same-species survivors are fleeing');
});

// ── AE-226..229: harvest loop drops ──────────────────────────────────────────────────
test('killed fauna drop their authored bio-resource pickup', () => {
  const state = makeState('sector_sker_haven');
  const emitLog = []; const spawnLog = [];
  const world = makeWorld(state, spawnLog, emitLog);
  materializeSite(state, world, ALIEN_SITES.red_snow, 'awake');
  // Kill outside any machine suppression pocket — inside, the drop table swaps (AE-227).
  const crab = state.entityList.find((e) => e.type === 'fauna'
    && !suppressionFieldAt(e.homeSectorId, e.pos.x, e.pos.z));
  assert.ok(crab, 'a killable organism outside suppression');
  handleAlienEcologyEvent(world, 'entity:killed', { id: crab.id });
  const drop = spawnLog.find((e) => e.type === 'pickup' && e.data && e.data.commodityId);
  assert.ok(drop, 'a harvest pickup spawned');
  const species = crab.data.ecology.speciesId;
  const expected = (FAUNA_DROPS[species] || FAUNA_DROPS.default).commodityId;
  assert.equal(drop.data.commodityId, expected);
  assert.ok(COMMODITIES.find((c) => c.id === expected).biohazard, 'the drop is biohazard-flagged');
});

// ── AE-230: field ripening — biohazard cargo matures at high contamination ───────────
test('biohazard cargo ripens through the chain inside a high-contamination field', () => {
  const state = makeState('sector_ashfall_reach');
  const emitLog = []; const spawnLog = [];
  const world = makeWorld(state, spawnLog, emitLog);
  materializeSite(state, world, ALIEN_SITES.towed_moonlet, 'bloom');
  const player = fitModules(state, []);
  player.pos = { x: -200, z: -1500 }; // towed_moonlet center — sectorC well over minC
  state.player.cargo.items.cmdty_filament_sample = 2;
  const ae = ensureAlienEcologyState(state);
  ae._ripenT = RIPENING.periodS; // due this tick
  tickAlienEcology(world, 0.5);
  assert.equal(state.player.cargo.items.cmdty_cyst_resin, 1, 'one unit ripened per period');
  assert.equal(state.player.cargo.items.cmdty_filament_sample, 1);
  assert.ok(emitLog.some((e) => e.type === 'toast'), 'ripening toasted the log');
});

// ── AE-215: spore catalyst purges exposure on sale ──────────────────────────────────
test('selling spore catalyst purges exposure', () => {
  const state = makeState('sector_ceres_belt');
  const emitLog = []; const spawnLog = [];
  const world = makeWorld(state, spawnLog, emitLog);
  const ae = ensureAlienEcologyState(state);
  ae.exposure = 0.9;
  ae.exposureFlags = { heat: true };
  handleAlienEcologyEvent(world, 'economy:tradeCompleted',
    { stationId: 'station_x', commodityId: 'cmdty_spore_catalyst', side: 'sell', qty: 1 });
  assert.equal(ae.exposure, 0, 'exposure purged');
});

// ── AE-195: the sterile zone caps contamination regardless of record state ──────────
test('the sterile zone caps contamination at the floor', () => {
  const state = makeState('sector_ashfall_reach');
  const emitLog = []; const spawnLog = [];
  const world = makeWorld(state, spawnLog, emitLog);
  const rec = materializeSite(state, world, ALIEN_SITES.sterile_zone, 'bloom');
  rec.siteC = 1;
  const c = pointContaminationAt(state, 'sector_ashfall_reach',
    ALIEN_SITES.sterile_zone.center.x, ALIEN_SITES.sterile_zone.center.z);
  assert.ok(c <= 0.03, `sterile site holds at the floor (got ${c})`);
});

// ── AE-160/D08: cold bells toll ahead of the front ──────────────────────────────────
test('cold bells toll when a radiation sector fronts', () => {
  const state = makeState('sector_charon_expanse'); // carries a radiation hazard
  const emitLog = []; const spawnLog = [];
  const world = makeWorld(state, spawnLog, emitLog);
  materializeSite(state, world, ALIEN_SITES.preserved_cockpit, 'awake');
  state.world.sectors.sector_charon_expanse = { tier: 2, hazards: [{ type: 'radiation' }] };
  fitModules(state, []);
  const ae = ensureAlienEcologyState(state);
  ae._tollT = FIELD_LANGUAGE.weatherFrontPeriodS; // due this tick
  tickAlienEcology(world, 0.5);
  assert.ok(emitLog.some((e) => e.type === 'comms:log' && /intercept|toll|bell/i.test(String(e.p && e.p.text || e.p))),
    'a band-intercept toll reached the log');
});

// ── AE-170/G05: relay pulse + echo recorder log ──────────────────────────────────────
test('relay pulses fire and the echo recorder keeps a rolling log', () => {
  const state = makeState('sector_charon_expanse');
  const emitLog = []; const spawnLog = [];
  const world = makeWorld(state, spawnLog, emitLog);
  materializeSite(state, world, ALIEN_SITES.preserved_cockpit, 'awake');
  fitModules(state, ['mod_echo_recorder_s']);
  const ae = ensureAlienEcologyState(state);
  ae._pulseT = FIELD_LANGUAGE.relayPulsePeriodS;
  tickAlienEcology(world, 0.5);
  assert.ok(emitLog.some((e) => e.type === 'ecology:relayPulse'), 'pulse emitted');
  assert.ok(Array.isArray(ae.echoLog) && ae.echoLog.length >= 1, 'recorder logged the pulse');
});

// ── AE-164/D04: pilgrim spine chain-follow ───────────────────────────────────────────
test('pilgrim spines chain behind a migrating leader', () => {
  const state = makeState('sector_io_reach');
  const emitLog = []; const spawnLog = [];
  const world = makeWorld(state, spawnLog, emitLog);
  materializeSite(state, world, ALIEN_SITES.shepherds_ring, 'awake');
  fitModules(state, []);
  const player = state.entities.get(state.playerId);
  player.pos = { x: 30000, z: 30000 }; // far away — pure migration, no stimulus
  for (let i = 0; i < 20; i += 1) tickAlienEcology(world, 0.5);
  const spines = faunaOf(state, 'pilgrim_spine');
  assert.ok(spines.length >= 2, 'the ring casts a procession');
  const chained = spines.filter((f) => f.data.ecology.chainTo);
  assert.ok(chained.length >= 1, 'followers linked to a leader');
});

// ── AE-163/D07: stone lung venting ───────────────────────────────────────────────────
test('stone lungs vent on their exhale period', () => {
  const state = makeState('sector_veil_nebula');
  const emitLog = []; const spawnLog = [];
  const world = makeWorld(state, spawnLog, emitLog);
  const rec = materializeSite(state, world, ALIEN_SITES.black_orchard, 'awake');
  fitModules(state, []);
  const player = state.entities.get(state.playerId);
  player.pos = { x: 30000, z: 30000 };
  const lungs = faunaOf(state, 'stone_lung');
  assert.ok(lungs.length >= 1, 'lungs spawned');
  const lung = lungs[0];
  lung.data.ecology.nextVentAt = -1; // due now (0 is falsy and re-arms)
  const before = rec.siteC;
  tickAlienEcology(world, 0.5);
  assert.ok(rec.siteC > before, 'venting fed the site budget');
  assert.ok(emitLog.some((e) => e.type === 'alienEcology:vented'), 'vent event emitted');
});

// ── AE-170 module rows exist and are fittable ────────────────────────────────────────
test('the phase-17 instrument row exists in the module table', () => {
  for (const id of ['mod_filament_contrast_s', 'mod_host_cartography_s', 'mod_echo_recorder_s',
    'mod_resonant_massline_m', 'mod_quiet_equation_s']) {
    assert.ok(MODULES.some((m) => m.id === id), `${id} exists`);
  }
});
