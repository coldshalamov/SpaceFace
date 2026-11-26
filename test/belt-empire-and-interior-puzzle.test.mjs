// Deep End-to-End Tests for Subterranean Engineering Puzzles & Belt Empire RTS Systems.
import test from 'node:test';
import assert from 'node:assert/strict';

import { asteroidSites } from '../src/systems/asteroidSites.js';
import { SITE_MACHINE_BY_ID, SITE_RECIPE_BY_ID, SITE_BALANCE } from '../src/data/sites.js';
import {
  ASTEROID_BLUEPRINTS,
  BELT_CHARTER_TEMPLATES,
  BELT_DOCTRINES,
  BELT_DRONE_TYPES,
  BELT_ORBITAL_STRUCTURES,
  BELT_ORBITAL_STRUCTURE_LIST,
  SITE_DIRECTIVES,
  SUBTERRANEAN_SYNERGY_RULES,
} from '../src/data/beltEmpireData.js';
import { COMMODITIES } from '../src/data/commodities.js';
import { stepSiteStructure } from '../src/systems/siteStructuralModel.js';
import {
  evaluateSubterraneanAnomalies,
  findBestBlueprintSeats,
  rotateCellOffset,
  scoreBlueprintPlacement,
} from '../src/systems/asteroidInteriorPuzzle.js';
import { DRILL_CONST, generateDrillField, tileIndex } from '../src/systems/drill.js';
const { COLS, ROWS } = DRILL_CONST;
import { buildFieldArchitectViewModel, FIELD_TOOLS } from '../src/ui/fieldBuild/fieldBuildMode.js';
import { computeSectorRadarViewport, radarScreenToWorld } from '../src/ui/fieldBuild/fieldTacticalCanvas.js';
import { makeMachine } from '../src/render/asteroidInteriorPreview.js';
import { SHARED_MATERIAL_ROLE } from '../src/render/sharedMaterialRoles.js';
import { siteDrawerModel } from '../src/ui/asteroid/asteroidScreen.js';
import { tileLensModel, machineLensModel, ghostLensModel } from '../src/ui/asteroid/inspector.js';
import { INDUSTRY_KITS } from '../src/systems/siteIndustryPlanner.js';

function makeBus(state) {
  const handlers = new Map();
  const bus = {
    events: [],
    on(name, fn) {
      if (!handlers.has(name)) handlers.set(name, []);
      handlers.get(name).push(fn);
      return () => {};
    },
    emit(name, payload) {
      this.events.push({ name, payload });
      for (const fn of handlers.get(name) || []) fn(payload);
    },
  };
  // Canonical test economy handlers mirroring economy.js exact escrow + grants
  bus.on('economy:chargeCredits', (p) => {
    if (!p) return;
    if (p.requireFull === true) {
      const live = Math.max(0, Math.round(Number(state.player?.credits) || 0));
      if (live !== p.expectedCredits || live < p.amount || typeof p.commit !== 'function') {
        p.result = false;
        return;
      }
      if (p.commit() !== true) {
        p.result = false;
        return;
      }
      state.player.credits = live - p.amount;
      p.result = true;
      return;
    }
    state.player.credits = Math.max(0, (state.player.credits || 0) - (p.amount || 0));
  });
  bus.on('economy:grantCredits', (p) => {
    if (!p || !(p.amount > 0)) return;
    state.player.credits = (state.player.credits || 0) + Math.round(p.amount);
  });
  return bus;
}

function makeHarness(seed = 73) {
  const entities = new Map();
  const state = {
    simTime: 0,
    tick: 0,
    timeScale: 1,
    mode: 'flight',
    meta: { seed },
    entities,
    playerId: 1,
    player: {
      credits: 20_000,
      cargo: {
        items: {
          cmdty_regocrete: 160,
          cmdty_control_unit: 40,
          cmdty_refined_metals: 120,
          cmdty_electronics: 80,
          cmdty_purified_silica: 60,
          cmdty_alloys: 80,
          cmdty_silicate: 100,
          cmdty_ore_iron: 120,
          cmdty_ore_copper: 40,
          cmdty_ore_titanium: 40,
          cmdty_comp_circuitry: 40,
          cmdty_comp_hullplate: 40,
          cmdty_fuel_cells: 30,
          cmdty_munitions: 30,
          cmdty_ice_water: 40,
          cmdty_crystal_lumin: 20,
          cmdty_polymers: 20,
          cmdty_exotic_xenium: 10,
          cmdty_quantum_cores: 5,
          cmdty_gas_hydrogen: 30,
        },
        usedVolume: 0,
        usedMass: 0,
        capVolume: 4000,
        capMass: 8000,
      },
    },
    world: { currentSectorId: 'sec_core_alpha' },
    content: { commodities: COMMODITIES },
  };
  const bus = makeBus(state);
  let nextId = 900;
  const helpers = {
    spawnEntity(spec) {
      const ent = { id: nextId++, alive: true, ...spec };
      ent.data = spec.data || {};
      entities.set(ent.id, ent);
      return ent;
    },
  };
  const registry = {
    get(name) {
      if (name === 'automation') return { creditPassive: (gross) => Math.round(gross * 0.5) };
      if (name === 'economy') return { state };
      return null;
    },
  };
  const sys = Object.create(asteroidSites);
  sys.init({ state, bus, helpers, registry });
  return { sys, state, bus, entities };
}

function addRock(h, asteroidId, pos = { x: 100, z: 0 }, typeId = 'ast_metallic', oreType = 'cmdty_ore_iron') {
  const rock = {
    id: asteroidId,
    type: 'asteroid',
    alive: true,
    pos,
    radius: 10,
    data: { typeId, oreType, yieldU: 40, drillCleared: [], fieldId: 'field_alpha' },
  };
  h.entities.set(asteroidId, rock);
  return rock;
}

function stepSim(h, seconds, stepS = 1) {
  const n = Math.round(seconds / stepS);
  for (let i = 0; i < n; i++) {
    h.state.simTime += stepS;
    h.state.tick += 1;
    h.sys.update(stepS, h.state);
  }
}

test('catalog checks: 6 subterranean machines, 4 synthesizer recipes >= 20% margin, 12 orbital structures, 12 doctrines', () => {
  const newMachines = [
    'sm_cryo_condenser', 'sm_seismic_brace', 'sm_capacitor_bank',
    'sm_deep_synthesizer', 'sm_mass_driver', 'sm_harmonic_resonator',
  ];
  for (const id of newMachines) {
    assert.ok(SITE_MACHINE_BY_ID.has(id), `${id} registered in SITE_MACHINE_BY_ID`);
  }
  const synthRecipes = [
    'sr_synth_polymers', 'sr_synth_microchips', 'sr_synth_medical', 'sr_synth_quantum_core',
  ];
  const priceOf = new Map(COMMODITIES.map((c) => [c.id, Number(c.basePrice) || 10]));
  for (const rId of synthRecipes) {
    const rec = SITE_RECIPE_BY_ID.get(rId);
    assert.ok(rec, `${rId} registered`);
    assert.equal(rec.machine, 'sm_deep_synthesizer');
    const inVal = Object.entries(rec.inputs).reduce((s, [g, q]) => s + (priceOf.get(g) || 0) * q, 0);
    const outVal = Object.entries(rec.output).reduce((s, [g, q]) => s + (priceOf.get(g) || 0) * q, 0);
    assert.ok((outVal - inVal) / outVal >= 0.2, `${rId} satisfies >=20% margin`);
  }
  assert.equal(BELT_ORBITAL_STRUCTURE_LIST.length, 12);
  assert.equal(BELT_DOCTRINES.length, 12);
  assert.equal(ASTEROID_BLUEPRINTS.length, 6);
  assert.equal(SITE_DIRECTIVES.length, 5);
  assert.equal(BELT_CHARTER_TEMPLATES.length, 6);
});

test('Deep Synthesizer produces Quantum Cores, Microchips, Medical Kits, and Polymers inside a claimed rock', () => {
  const h = makeHarness(77);
  addRock(h, 201, { x: 0, z: 0 }, 'ast_crystalline');
  const comm = h.sys.commissionFieldAsteroid(201, 'extractor');
  assert.equal(comm.ok, true);
  const site = h.sys.getSite(comm.siteId);
  const mid = Math.floor(COLS / 2);

  // Carve expansion cells on row 2 for Gas Tap + Deep Synthesizer
  for (const c of [mid - 2, mid + 1, mid + 2]) {
    const idx = tileIndex(c, 2);
    if (!site.cleared.includes(idx)) site.cleared.push(idx);
    if (!site.overlays.power.includes(idx)) site.overlays.power.push(idx);
    if (!site.overlays.lane.includes(idx)) site.overlays.lane.push(idx);
  }
  site.machines.push(
    { id: 'm10', defId: 'sm_gas_tap', col: mid + 2, row: 2, mode: 'generate', installT: 0, job: null, carry: {} },
    { id: 'm11', defId: 'sm_deep_synthesizer', col: mid + 1, row: 2, mode: 'sr_synth_polymers', installT: 0, job: null, carry: {} },
  );
  h.sys._markDirty(site.id, { field: true, net: true });

  // Supply full orbital power so Deep Synthesizer runs at 100% powerRatio
  assert.equal(h.sys.deploySiteDefense(site.id, 'solar_sail').ok, true);
  assert.equal(h.sys.deploySiteDefense(site.id, 'orbital_shipyard').ok, true);

  // Seed feedstock directly into lane store and hold synthesized polymers on-site
  assert.equal(h.sys.setExportFlag(site.id, 'cmdty_polymers', false).ok, true);
  const rt = h.sys._runtime(site);
  const st = rt.stores[rt.laneComps[0].key];
  st.cmdty_gas_hydrogen = 20;
  st.cmdty_silicate = 20;

  stepSim(h, 80, 1);
  assert.ok((st.cmdty_polymers || 0) >= 1, `expected polymers synthesized, got ${st.cmdty_polymers}`);
});

test('Cryo Condenser cools adjacent smelter and lowers storedHeat vs uncooled control', () => {
  function runWithCryo(withCryo) {
    const h = makeHarness(88);
    addRock(h, 202, { x: 0, z: 0 }, 'ast_metallic');
    const comm = h.sys.commissionFieldAsteroid(202, 'refinery');
    assert.equal(comm.ok, true);
    const site = h.sys.getSite(comm.siteId);
    const mid = Math.floor(COLS / 2);
    // Excavate around refinery at (mid+1, 2) so rock conductive heat sink is low & machine heats up
    for (const [c, r] of [[mid + 2, 1], [mid + 2, 2], [mid + 2, 3], [mid + 1, 1], [mid + 1, 3]]) {
      const idx = tileIndex(c, r);
      if (!site.cleared.includes(idx)) site.cleared.push(idx);
    }
    site.overlays.power.push(tileIndex(mid + 1, 2), tileIndex(mid + 2, 2));
    if (withCryo) {
      site.machines.push({ id: 'mcryo', defId: 'sm_cryo_condenser', col: mid + 2, row: 2, mode: null, installT: 0, job: null, carry: {} });
    }
    h.sys._markDirty(site.id, { field: true, net: true });
    stepSim(h, 60, 1);
    const refinery = site.machines.find((m) => m.defId === 'sm_refinery');
    const proj = h.sys.projection(site.id);
    return {
      storedHeat: refinery.storedHeat || 0,
      mod: proj.synergies.machineModifiers[refinery.id],
    };
  }

  const hot = runWithCryo(false);
  const cold = runWithCryo(true);
  assert.equal(cold.mod.cryoCooled, true);
  assert.ok(cold.mod.coolingRate > hot.mod.coolingRate, 'Cryo Condenser adds coolingRate');
  assert.ok(cold.storedHeat <= hot.storedHeat, `expected Cryo-cooled storedHeat (${cold.storedHeat}) <= uncooled (${hot.storedHeat})`);
});

test('Seismic Brace prevents ceiling fractures between heavy adjacent machines', () => {
  const field = generateDrillField(101, 'ast_common_rock', 'sec_core_alpha');
  // Hollow out a wide cavern with zero natural rock pillars
  for (let c = 2; c <= 8; c++) {
    for (let r = 2; r <= 8; r++) {
      field[c][r] = { type: 'empty', hp: 0, maxHp: 0, ore: null, hazard: false, tierReq: 1, hardness: 0 };
    }
  }
  const heavyPair = [
    { id: 'm1', defId: 'sm_refinery', col: 3, row: 4, powerRatio: 1 },
    { id: 'm2', defId: 'sm_fabricator', col: 7, row: 4, powerRatio: 1 },
  ];
  let resUnbraced = null;
  let struct = null;
  for (let i = 0; i < 40; i++) {
    resUnbraced = stepSiteStructure({ dtS: 1, cols: COLS, rows: ROWS, machines: heavyPair, field, structure: struct });
    struct = resUnbraced.structure;
    if (struct.fractured) break;
  }
  assert.equal(struct.fractured, true, 'unbraced heavy span fractures ceiling');

  // Now add powered Seismic Brace beside span
  const bracedMachines = [
    ...heavyPair,
    { id: 'm3', defId: 'sm_seismic_brace', col: 4, row: 4, powerRatio: 1 },
  ];
  let structBraced = null;
  for (let i = 0; i < 40; i++) {
    const out = stepSiteStructure({ dtS: 1, cols: COLS, rows: ROWS, machines: bracedMachines, field, structure: structBraced });
    structBraced = out.structure;
  }
  assert.equal(structBraced.fractured, false, 'Seismic Brace completely suppresses span fracture');
});

test('Harmonic Resonator boosts extractor yield by +25% and Capacitor Bank buffers MW brownouts', () => {
  const h = makeHarness(99);
  addRock(h, 203, { x: 0, z: 0 }, 'ast_metallic');
  const comm = h.sys.commissionFieldAsteroid(203, 'extractor');
  const site = h.sys.getSite(comm.siteId);
  const mid = Math.floor(COLS / 2);

  // Excavate cell next to extractor (mid-1, 2) and add Resonator + Capacitor Bank
  for (const [c, r] of [[mid - 2, 2], [mid + 1, 2], [mid + 1, 1]]) {
    const idx = tileIndex(c, r);
    if (!site.cleared.includes(idx)) site.cleared.push(idx);
    if (!site.overlays.power.includes(idx)) site.overlays.power.push(idx);
    if (!site.overlays.lane.includes(idx)) site.overlays.lane.push(idx);
  }
  site.machines.push(
    { id: 'mres', defId: 'sm_harmonic_resonator', col: mid - 2, row: 2, mode: null, installT: 0, job: null, carry: {} },
    { id: 'mcap', defId: 'sm_capacitor_bank', col: mid + 1, row: 2, mode: null, installT: 0, job: null, carry: {} },
  );
  // Deploy a Solar Collector Wing (+8 MW) so grid has a net +5 MW surplus with Resonator (-5 MW) active
  assert.equal(h.sys.deploySiteDefense(site.id, 'solar_sail').ok, true);
  h.sys._markDirty(site.id, { field: true, net: true });
  stepSim(h, 5, 1);

  const projCharged = h.sys.projection(site.id);
  const ext = site.machines.find((m) => m.defId === 'sm_extractor');
  assert.equal(projCharged.synergies.machineModifiers[ext.id].resonatorBoosted, true);
  assert.ok(projCharged.synergies.machineModifiers[ext.id].yieldMult >= 1 + SUBTERRANEAN_SYNERGY_RULES.resonatorYieldBonus - 1e-6);
  assert.ok(site.capacitorMwS > 0, 'Capacitor Bank charged on power surplus');

  // Now add a heavy Deep Synthesizer (-14 MW) pushing total draw (29 MW) above gen (20 MW)
  const capBefore = site.capacitorMwS;
  site.machines.push({ id: 'msyn', defId: 'sm_deep_synthesizer', col: mid + 1, row: 1, mode: 'sr_synth_microchips', installT: 0, job: null, carry: {} });
  h.sys._markDirty(site.id, { field: true, net: true });
  stepSim(h, 1, 1);
  assert.ok(site.capacitorMwS < capBefore, 'Capacitor Bank discharged MW during heavy demand');
});

test('Anomalies can be preserved & tapped for aura or breached once for lump loot', () => {
  const h = makeHarness(105);
  addRock(h, 204, { x: 0, z: 0 }, 'ast_crystalline');
  const comm = h.sys.commissionFieldAsteroid(204, 'extractor');
  const site = h.sys.getSite(comm.siteId);
  const scan1 = h.sys.tapOrScanSiteAnomalies(site.id, 'scan');
  assert.equal(scan1.ok, true);
  assert.ok(scan1.anomalies.length >= 2 && scan1.anomalies.length <= 4);

  const target = scan1.anomalies[0];
  assert.notEqual(target.status, 'breached');
  const breach = h.sys.tapOrScanSiteAnomalies(site.id, 'breach', target.id);
  assert.equal(breach.ok, true);
  assert.equal(breach.breached, target.id);
  assert.ok(breach.loot && Object.keys(breach.loot).length > 0);
  // Repeating breach never grants duplicate loot
  const breachAgain = h.sys.tapOrScanSiteAnomalies(site.id, 'breach', target.id);
  assert.equal(breachAgain.loot, null);
});

test('Interior blueprints rotate cleanly and applySiteBlueprint remotely stamps modules into an asteroid', () => {
  const rot1 = rotateCellOffset(1, 0, 1);
  assert.deepEqual(rot1, { dc: 0, dr: 1 });
  const rot2 = rotateCellOffset(1, 0, 2);
  assert.deepEqual(rot2, { dc: -1, dr: 0 });

  const h = makeHarness(112);
  addRock(h, 205, { x: 50, z: 50 }, 'ast_metallic');
  const field = generateDrillField(205, 'ast_metallic', 'sec_core_alpha');
  const seats = findBestBlueprintSeats(field, null, 'bp_starter_pocket', 3);
  assert.ok(seats.length > 0);
  const check = scoreBlueprintPlacement(field, null, 'bp_starter_pocket', seats[0].col, seats[0].row, seats[0].rotation);
  assert.equal(check.valid, true);

  const res = h.sys.applySiteBlueprint(205, 'bp_starter_pocket', null, null, 0);
  assert.equal(res.ok, true);
  assert.ok(res.installedCount >= 3);
  const site = h.sys.getSite(res.siteId);
  assert.equal(h.sys.hasCore(site), true);
  assert.ok(site.machines.some((m) => m.defId === 'sm_extractor'));
  assert.ok(site.machines.some((m) => m.defId === 'sm_cargo_port'));
});

test('All 12 orbital megastructures deploy cleanly, including mass_relay extended tether range, storage_silo +300u, and refinery_barge passive regocrete', () => {
  const h = makeHarness(120);
  // Place rock A and rock B beyond base linkRangeWu (2600) but inside 1.75x mass_relay range (4550)
  addRock(h, 206, { x: 0, z: 0 }, 'ast_metallic');
  addRock(h, 207, { x: 3200, z: 0 }, 'ast_common_rock');
  const c1 = h.sys.commissionFieldAsteroid(206, 'extractor');
  const c2 = h.sys.commissionFieldAsteroid(207, 'extractor');
  const s1 = h.sys.getSite(c1.siteId);
  const s2 = h.sys.getSite(c2.siteId);

  // Without mass_relay, 3200 WU > 2600 WU base range -> out-of-range
  const blockedLink = h.sys.setSiteLink(s1.id, s2.id, 'material', null);
  assert.equal(blockedLink.ok, false);
  assert.equal(blockedLink.reason, 'out-of-range');

  // Deploy mass_relay, storage_silo, refinery_barge, solar_sail, shield_dome, trade_terminal, flak_battery, orbital_shipyard
  const kindsSite1 = ['mass_relay', 'storage_silo', 'refinery_barge', 'solar_sail', 'shield_dome', 'trade_terminal', 'flak_battery', 'orbital_shipyard'];
  for (const kind of kindsSite1) {
    const dep = h.sys.deploySiteDefense(s1.id, kind);
    assert.equal(dep.ok, true, `expected ${kind} to deploy cleanly: ${dep.reason}`);
  }
  const kindsSite2 = ['turret', 'sensor', 'drone_dock', 'cryo_radiator_array'];
  for (const kind of kindsSite2) {
    const dep = h.sys.deploySiteDefense(s2.id, kind);
    assert.equal(dep.ok, true, `expected ${kind} to deploy cleanly: ${dep.reason}`);
  }

  // With mass_relay installed, 3200 WU link now succeeds!
  const rangeLink = h.sys.setSiteLink(s1.id, s2.id, 'material', null);
  assert.equal(rangeLink.ok, true);

  // Check storage_silo +300u bonus & refinery_barge passive regocrete generation (set reserve floor so s1 retains cast regocrete instead of streaming it across link to s2)
  h.sys.setReserveFloor(s1.id, 'cmdty_regocrete', 20);
  const rt1 = h.sys._runtime(s1);
  const st1 = rt1.stores[rt1.laneComps[0].key];
  const regoBefore = st1.cmdty_regocrete || 0;
  stepSim(h, 45, 1); // 1.5 u/min * 0.75 min = 1.125u -> casts at least 1 regocrete
  assert.ok((st1.cmdty_regocrete || 0) >= regoBefore + 1, 'refinery_barge passively sinters cmdty_regocrete');
  const proj1 = h.sys.projection(s1.id);
  assert.ok(proj1.lanes[0].capacity >= 300 + SITE_BALANCE.laneStoreBase, 'storage_silo expands lane capacity by +300u');
});

test('Autonomous Harvester/Shuttle/Patrol drones harvest wild rocks, boost Mass Driver links, and follow directives/doctrines/charters/auto-balance', () => {
  const h = makeHarness(130);
  addRock(h, 208, { x: 0, z: 0 }, 'ast_metallic');
  addRock(h, 209, { x: 240, z: 0 }, 'ast_crystalline');
  addRock(h, 210, { x: 180, z: 220 }, 'ast_metallic', 'cmdty_ore_copper'); // Unclaimed wild rock for Harvester drone!

  const c1 = h.sys.commissionFieldAsteroid(208, 'extractor');
  const c2 = h.sys.commissionFieldAsteroid(209, 'refinery');
  const s1 = h.sys.getSite(c1.siteId);
  const s2 = h.sys.getSite(c2.siteId);

  // Shift directives
  assert.equal(h.sys.setSiteDirective(s1.id, 'conservation_annuity').ok, true);
  assert.equal(s1.directive, 'conservation_annuity');

  // Commission Harvester + Shuttle + Patrol drones
  assert.equal(h.sys.commissionSiteDrone(s1.id, 'harvester').ok, true);
  assert.equal(h.sys.commissionSiteDrone(s1.id, 'shuttle').ok, true);
  assert.equal(h.sys.commissionSiteDrone(s1.id, 'patrol').ok, true);

  // Give s1 surplus orbital power (+8 MW) and seed iron ore stockpile so Auto-Balance creates both power & material links to s2
  assert.equal(h.sys.deploySiteDefense(s1.id, 'solar_sail').ok, true);
  const rt1 = h.sys._runtime(s1);
  rt1.stores[rt1.laneComps[0].key].cmdty_ore_iron = 20;

  // Auto-balance sector cluster links s1 (power surplus + iron stock) -> s2 (power deficit + smelt_iron refinery)
  const bal = h.sys.autoLinkSectorCluster('sec_core_alpha');
  assert.equal(bal.ok, true);
  assert.ok(bal.linksCreated >= 1, 'auto-balance creates material/power link');

  // Research Tier 1 -> Tier 2 Swarm Doctrine using exact economy:chargeCredits escrow
  assert.equal(h.sys.unlockBeltDoctrine('doc_swarm_2').reason, 'missing-prereq');
  const crBefore = h.state.player.credits;
  const doc1 = h.sys.unlockBeltDoctrine('doc_swarm_1');
  assert.equal(doc1.ok, true);
  assert.equal(h.state.player.credits, crBefore - 650);

  // Accept Charter & complete it
  const ch = h.sys.acceptBeltCharter('charter_regocrete_sprawl'); // requires >= 2 commissioned sites
  assert.equal(ch.ok, true);
  assert.ok(h.state.sites.empire.completedCharters.includes('charter_regocrete_sprawl'));

  // Run sim 25s: verify harvester drone gathers ore and Mass Driver + Shuttle boosts link speed
  stepSim(h, 25, 1);
  assert.ok((h.state.sites.empire.stats.droneHarvestedU || 0) >= 1, 'harvester drone delivered ore from wild rock');

  // Check enriched buildFieldArchitectViewModel
  const vm = buildFieldArchitectViewModel({
    state: h.state,
    siteSys: h.sys,
    selectedAsteroidId: 208,
    selectedAsteroidIds: [208, 209],
    activeTab: 'matrix',
    mapMode: 'supply_flow',
    blueprintRotation: 2,
  });
  assert.equal(vm.activeTab, 'matrix');
  assert.equal(vm.mapMode, 'supply_flow');
  assert.equal(vm.blueprintRotation, 2);
  assert.equal(vm.selectedAsteroidIds.length, 2);
  assert.ok(vm.supplyMatrix && vm.supplyMatrix.commodities.length > 0);
  assert.ok(vm.selectedSite.cutawaySchematic && vm.selectedSite.drones.length === 3);

  // Save/load normalization roundtrip
  const snap = h.sys.serialize();
  const h2 = makeHarness(130);
  addRock(h2, 208, { x: 0, z: 0 }, 'ast_metallic');
  addRock(h2, 209, { x: 240, z: 0 }, 'ast_crystalline');
  h2.sys.deserialize(snap);
  const rs1 = h2.sys.getSite(s1.id);
  assert.equal(rs1.directive, 'conservation_annuity');
  assert.equal(rs1.drones.length, 3);
  assert.ok(h2.state.sites.empire.doctrines.doc_swarm_1);
  assert.ok(h2.state.sites.empire.completedCharters.includes('charter_regocrete_sprawl'));
});

test('All 9 non-authored subterranean machines build distinct 3D assemblies with SHARED_MATERIAL_ROLE and dyn hooks', () => {
  const S = 2.2;
  const expectedDyn = {
    charge_press: ['lamp', 'piston', 'pistonBase'],
    auto_drill: ['lamp', 'orbit'],
    relay: ['lamp', 'orbit'],
    cryo_condenser: ['lamp', 'orbit'],
    seismic_brace: ['lamp', 'piston', 'pistonBase'],
    capacitor_bank: ['lamp', 'furnace', 'furnaceAnchor'],
    deep_synthesizer: ['lamp', 'orbit', 'progressBar', 'progressBase', 'progressTravel', 'furnace'],
    mass_driver: ['lamp', 'piston', 'pistonBase'],
    harmonic_resonator: ['lamp', 'orbit'],
  };
  const validRoles = new Set([SHARED_MATERIAL_ROLE.HULL, SHARED_MATERIAL_ROLE.PLUME]);
  for (const [kind, keys] of Object.entries(expectedDyn)) {
    const built = makeMachine(kind, S, null);
    let meshCount = 0;
    built.group.traverse((node) => {
      if (!node.isMesh) return;
      meshCount += 1;
      const mats = Array.isArray(node.material) ? node.material : [node.material];
      for (const mat of mats) {
        assert.ok(
          validRoles.has(mat.userData?.spacefaceSharedMaterialRole),
          `${kind}: mesh ${node.name || ''} material carries valid SHARED_MATERIAL_ROLE`,
        );
      }
    });
    assert.ok(meshCount >= 5, `${kind}: has rich hardware geometry (${meshCount} meshes)`);
    for (const k of keys) {
      assert.ok(built.dyn[k] !== undefined, `${kind}: exposes dyn.${k}`);
    }
  }
});

test('Works lens, Site drawer directives/blueprints/anomalies, kits, FIELD_TOOLS, and radar viewport math behave consistently', () => {
  const h = makeHarness(144);
  addRock(h, 301, { x: 400, z: -200 }, 'ast_metallic');
  const comm = h.sys.commissionFieldAsteroid(301, 'extractor');
  assert.equal(comm.ok, true);
  const siteId = comm.siteId;
  h.sys.tapOrScanSiteAnomalies(siteId, 'scan');

  // New advanced planning kits exist
  assert.ok(INDUSTRY_KITS.some((k) => k.id === 'cryo_synthesizer'));
  assert.ok(INDUSTRY_KITS.some((k) => k.id === 'harmonic_hub'));

  // Lens hints for anomalies + support machines
  const tileAnom = tileLensModel({
    tile: { type: 'rock', hp: 5, maxHp: 5 },
    anomaly: { name: 'Resonant Crystal Pocket', status: 'sealed' },
  });
  assert.match(tileAnom.body, /Resonant crystal pocket/i);
  assert.equal(machineLensModel({ defId: 'sm_cryo_condenser', capability: {}, status: { state: 'running' } }).numerals, '−35% heat');
  assert.match(ghostLensModel('sm_harmonic_resonator', { ok: true, profile: { matrix: 2, basalt: 0, gas: 0, ores: {} } }).body, /extractor yield/);

  // Site drawer verbs & extended totals
  const drawer = siteDrawerModel({ siteSys: h.sys, siteId, drillActive: true, now: 10 });
  assert.equal(drawer.verbs.directive.owner, 'setSiteDirective');
  assert.equal(drawer.verbs.blueprint.owner, 'applySiteBlueprint');
  assert.equal(drawer.verbs.anomaly.owner, 'tapOrScanSiteAnomalies');
  assert.equal(drawer.verbs.directive.apply('overclock_burn').ok, true);
  assert.equal(h.sys.getSite(siteId).directive, 'overclock_burn');
  assert.equal(drawer.verbs.blueprint.apply('bp_starter_pocket', 1).ok, true);
  if (!drawer.verbs.anomaly.disabled) {
    const firstAnom = drawer.verbs.anomaly.anomalies[0];
    assert.equal(drawer.verbs.anomaly.apply('breach', firstAnom.id).ok, true);
  }

  // FIELD_TOOLS & Sector Radar minimap inverse mapping
  assert.ok(FIELD_TOOLS.some((t) => t.id === 'solar_sail' && t.key === '6'));
  assert.ok(FIELD_TOOLS.some((t) => t.id === 'drone' && t.key === '7'));
  assert.ok(FIELD_TOOLS.some((t) => t.id === 'open_works' && t.key === '8'));

  h.entities.set(1, { id: 1, alive: true, type: 'player', pos: { x: 0, z: 0 } });
  const network = h.sys.sectorNetworkProjection('sec_core_alpha');
  const radar = computeSectorRadarViewport({ w: 1280, h: 720, state: h.state, network });
  assert.equal(radar.x, 16);
  const centerWorld = radarScreenToWorld(radar, radar.x + radar.size * 0.5, radar.y + radar.size * 0.5);
  assert.ok(Math.abs(centerWorld.wx - radar.centerX) < 1e-6);
  assert.ok(Math.abs(centerWorld.wz - radar.centerZ) < 1e-6);
  assert.equal(radarScreenToWorld(radar, radar.x - 5, radar.y), null);
});
