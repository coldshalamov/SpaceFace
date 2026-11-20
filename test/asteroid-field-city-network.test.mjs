// Mindustry / Field Architect Inter-Asteroid City Network & Field Build Tests.
// No DOM needed — tests pure classification, remote commissioning, reserve floors,
// material/power linking, perimeter defense deployment, view-model projection, and save fidelity.
import test from 'node:test';
import assert from 'node:assert/strict';

import { asteroidSites } from '../src/systems/asteroidSites.js';
import { generateDrillField, tileIndex } from '../src/systems/drill.js';
import { classifySiteSpecialization, SITE_BALANCE } from '../src/data/sites.js';
import { COMMODITIES } from '../src/data/commodities.js';
import { buildFieldArchitectViewModel } from '../src/ui/fieldBuild/fieldBuildMode.js';

const EMPTY = () => ({ type: 'empty', hp: 0, maxHp: 0, ore: null, hazard: false, tierReq: 1, hardness: 0 });
const GAS = () => ({ type: 'gas', hp: 1, maxHp: 1, ore: null, hazard: true, tierReq: 1, hardness: 0.5 });

function makeBus() {
  const handlers = new Map();
  return {
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
}

function makeHarness() {
  const bus = makeBus();
  const entities = new Map();
  const state = {
    simTime: 0,
    tick: 0,
    meta: { seed: 73 },
    entities,
    playerId: 1,
    player: {
      cargo: {
        items: {
          cmdty_regocrete: 60,
          cmdty_control_unit: 16,
          cmdty_refined_metals: 24,
          cmdty_electronics: 16,
          cmdty_purified_silica: 12,
          cmdty_alloys: 12,
          cmdty_silicate: 20,
          cmdty_ore_iron: 20,
          cmdty_ore_titanium: 10,
        },
        usedVolume: 0,
        usedMass: 0,
        capVolume: 1200,
        capMass: 2000,
      },
    },
    world: { currentSectorId: 'sec_core_alpha' },
    content: { commodities: COMMODITIES },
  };
  let nextId = 500;
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
      return name === 'automation' ? { creditPassive: (gross) => Math.round(gross * 0.5) } : null;
    },
  };
  const sys = Object.create(asteroidSites);
  sys.init({ state, bus, helpers, registry });
  return { sys, state, bus, entities };
}

function addRock(h, asteroidId, pos = { x: 100, z: 0 }, typeId = 'ast_metallic') {
  const rock = {
    id: asteroidId,
    type: 'asteroid',
    alive: true,
    pos,
    radius: 10,
    data: { typeId, yieldU: 28, drillCleared: [], fieldId: 'field_alpha' },
  };
  h.entities.set(asteroidId, rock);
  return rock;
}

function buildManualSite(h, asteroidId, pos = { x: 0, z: 0 }, opts = {}) {
  addRock(h, asteroidId, pos, opts.typeId || 'ast_metallic');
  const field = generateDrillField(asteroidId);
  const pocket = [[14, 0], [14, 1], [14, 2], [14, 3], [13, 2], [15, 2], [15, 1]];
  for (const [c, r] of pocket) field[c][r] = EMPTY();
  if (opts.gas) {
    field[16][2] = GAS();
    field[16][1] = GAS();
  }
  h.entities.get(asteroidId).data.drillCleared = pocket.map(([c, r]) => tileIndex(c, r));
  h.state.drill = { active: true, asteroidId, field, avatar: { col: 14, row: 2 } };
  const rCore = h.sys.installMachine({ asteroidId, defId: 'sm_massline_core', col: 14, row: 1 });
  assert.equal(rCore.ok, true);
  const siteId = rCore.siteId;
  for (const [c, r] of [[14, 1], [14, 2], [15, 2], [13, 2], [14, 3]]) {
    h.sys.setOverlay(siteId, 'power', c, r, true);
    h.sys.setOverlay(siteId, 'lane', c, r, true);
  }
  h.state.drill = null;
  return siteId;
}

const step = (h, seconds) => {
  for (let i = 0; i < seconds; i++) {
    h.state.simTime += 1;
    h.state.tick += 1;
    h.sys.update(1, h.state);
  }
};

test('classifySiteSpecialization derives emergent industrial roles from machine layout and links', () => {
  assert.equal(classifySiteSpecialization({ machines: [{ machineId: 'sm_fabricator' }] }).id, 'fabrication');
  assert.equal(classifySiteSpecialization({ machines: [{ machineId: 'sm_refinery' }] }).id, 'smelting');
  assert.equal(classifySiteSpecialization({
    machines: [{ machineId: 'sm_gas_tap' }],
    powerGenMw: 20,
    powerDrawMw: 4,
    links: [{ kind: 'power', active: true }],
  }).id, 'powerhouse');
  assert.equal(classifySiteSpecialization({
    machines: [{ machineId: 'sm_massline_core' }],
    defenses: [{ kind: 'turret' }, { kind: 'sensor' }],
  }).id, 'bastion');
  assert.equal(classifySiteSpecialization({ machines: [{ machineId: 'sm_extractor' }] }).id, 'extraction');
  assert.equal(classifySiteSpecialization({ machines: [{ machineId: 'sm_massline_core' }] }).id, 'outpost');
});

test('commissionFieldAsteroid stakes an unclaimed rock and starts extracting immediately', () => {
  const h = makeHarness();
  addRock(h, 77, { x: 240, z: -120 }, 'ast_common_rock');
  const res = h.sys.commissionFieldAsteroid(77, 'extractor');
  assert.equal(res.ok, true);
  assert.ok(res.siteId);

  const site = h.sys.getSite(res.siteId);
  assert.equal(site.anchored, true);
  assert.equal(site.machines.length, 3);
  assert.ok(site.machines.some((m) => m.defId === 'sm_massline_core'));
  assert.ok(site.machines.some((m) => m.defId === 'sm_extractor'));
  assert.ok(site.machines.some((m) => m.defId === 'sm_cargo_port'));

  // Run 90 seconds so the commissioned extractor produces into lanes cleanly
  step(h, 90);
  const proj = h.sys.projection(res.siteId);
  const totalStored = proj.lanes.reduce((s, l) => s + l.stored, 0)
    + Object.values(proj.exportBuffer || {}).reduce((s, q) => s + q, 0);
  assert.ok(totalStored > 0, 'commissioned asteroid rig produces positive stock automatically');
});

test('setReserveFloor retains minimum stock while setSiteLink streams surplus to linked refinery asteroid', () => {
  const h = makeHarness();
  const extSiteId = buildManualSite(h, 101, { x: 0, z: 0 });
  const refSiteId = buildManualSite(h, 102, { x: 350, z: 0 });

  const extSite = h.sys.getSite(extSiteId);
  const refSite = h.sys.getSite(refSiteId);
  h.sys.setExportFlag(extSiteId, 'cmdty_silicate', true);

  // Give extractor site 30u of iron ore directly in its lane store
  const extRt = h.sys._runtime(extSite);
  const extStore = extRt.stores[extRt.laneComps[0].key];
  extStore.cmdty_ore_iron = 30;
  extStore.cmdty_silicate = 20;

  // Put refinery on the receiving site consuming cmdty_ore_iron -> cmdty_refined_metals
  const refEnt = h.entities.get(102);
  h.state.drill = { active: true, asteroidId: 102, field: h.sys._runtime(refSite).field, avatar: { col: 14, row: 2 } };
  const addRef = h.sys.installMachine({ asteroidId: 102, defId: 'sm_refinery', col: 13, row: 2 });
  assert.equal(addRef.ok, true);
  h.state.drill = null;

  // Keep a reserve floor of 12u iron ore on source asteroid, link cargo to refinery asteroid
  assert.equal(h.sys.setReserveFloor(extSiteId, 'cmdty_ore_iron', 12).ok, true);
  const linked = h.sys.setSiteLink(extSiteId, refSiteId, 'material', 'cmdty_ore_iron');
  assert.equal(linked.ok, true);

  step(h, 80);

  const extOreAfter = Number(h.sys._runtime(extSite).stores[h.sys._runtime(extSite).laneCompByMachine[extSite.machines[0].id]]?.cmdty_ore_iron || 0);
  assert.ok(extOreAfter >= 11.99, `reserve floor kept >= 12u on source asteroid (${extOreAfter})`);

  const refProj = h.sys.projection(refSiteId);
  const refMetals = refProj.lanes.reduce((s, l) => s + (Number(l.store?.cmdty_refined_metals) || 0), 0);
  const refOre = refProj.lanes.reduce((s, l) => s + (Number(l.store?.cmdty_ore_iron) || 0), 0);
  assert.ok(refOre + refMetals > 0, 'linked cargo streamed iron ore across space and/or refined it');

  assert.equal(h.sys.removeSiteLink(extSiteId, refSiteId, 'material').ok, true);
  assert.equal(extSite.links.length, 0);
});

test('power link shares surplus MW from generator asteroid to power-deficit asteroid', () => {
  const h = makeHarness();
  // Powerhouse rock: pick a seed whose natural field has a real gas pocket so sm_gas_tap generates +16..32 MW
  let pwrId = 201;
  let gasSeat = null;
  for (let seed = 200; seed < 260 && !gasSeat; seed++) {
    const f = generateDrillField(seed);
    for (let c = 2; c < f.length - 2 && !gasSeat; c++) {
      for (let r = 2; r < f[0].length - 2 && !gasSeat; r++) {
        if (f[c][r]?.type === 'gas') {
          gasSeat = { col: c - 1, row: r, seed };
          pwrId = seed;
        }
      }
    }
  }
  assert.ok(gasSeat, 'found a natural gas pocket cell in generated field');
  const fPwr = generateDrillField(pwrId);
  const pwrPocket = [[14, 0], [14, 1], [14, 2], [gasSeat.col, gasSeat.row], [gasSeat.col - 1, gasSeat.row]];
  for (const [c, r] of pwrPocket) fPwr[c][r] = EMPTY();
  addRock(h, pwrId, { x: 0, z: 0 }, 'ast_gas_cloud');
  h.entities.get(pwrId).data.drillCleared = pwrPocket.map(([c, r]) => tileIndex(c, r));
  h.state.drill = { active: true, asteroidId: pwrId, field: fPwr, avatar: { col: 14, row: 1 } };
  const pwrCore = h.sys.installMachine({ asteroidId: pwrId, defId: 'sm_massline_core', col: 14, row: 2 });
  assert.equal(pwrCore.ok, true);
  const pwrSiteId = pwrCore.siteId;
  h.state.drill.field = generateDrillField(pwrId);
  for (const [c, r] of pwrPocket) h.state.drill.field[c][r] = EMPTY();
  h.state.drill.avatar = { col: gasSeat.col - 1, row: gasSeat.row };
  const gasTap = h.sys.installMachine({ asteroidId: pwrId, defId: 'sm_gas_tap', col: gasSeat.col, row: gasSeat.row });
  assert.equal(gasTap.ok, true);
  h.state.drill = null;

  // Consumer rock with Core (12 MW) + 2 Refineries (-16 MW total -> needs >= 4 MW external share!)
  const conSiteId = buildManualSite(h, 202, { x: 400, z: 0 });
  const conField = h.sys._runtime(h.sys.getSite(conSiteId)).field;
  h.state.drill = { active: true, asteroidId: 202, field: conField, avatar: { col: 14, row: 2 } };
  assert.equal(h.sys.installMachine({ asteroidId: 202, defId: 'sm_refinery', col: 13, row: 2 }).ok, true);
  assert.equal(h.sys.installMachine({ asteroidId: 202, defId: 'sm_refinery', col: 15, row: 2 }).ok, true);
  h.state.drill = null;

  // Before power link: consumer draws 16 MW vs 12 MW local gen -> ratio < 1
  step(h, 2);
  assert.ok(h.sys.projection(conSiteId).power[0].ratio < 1);

  // Connect power tether: generator surplus bridges the deficit cleanly!
  assert.equal(h.sys.setSiteLink(pwrSiteId, conSiteId, 'power').ok, true);
  step(h, 2);
  const conProj = h.sys.projection(conSiteId);
  assert.ok(conProj.sharedPowerInMw > 4, `expected shared MW > 4, got ${conProj.sharedPowerInMw}`);
  assert.equal(conProj.power[0].ratio, 1, 'linked power stabilized consumer grid to 100%');
});

test('deploySiteDefense, sectorNetworkProjection, buildFieldArchitectViewModel, and save roundtrip', () => {
  const h = makeHarness();
  const s1 = buildManualSite(h, 301, { x: 100, z: 50 });
  const s2 = buildManualSite(h, 302, { x: 500, z: 50 });
  assert.equal(h.sys.setSiteLink(s1, s2, 'material').ok, true);
  assert.equal(h.sys.setReserveFloor(s1, 'cmdty_silicate', 15).ok, true);
  assert.equal(h.sys.deploySiteDefense(s1, 'turret').ok, true);
  assert.equal(h.sys.deploySiteDefense(s1, 'sensor').ok, true);

  const cluster = h.sys.sectorNetworkProjection('sec_core_alpha');
  assert.equal(cluster.totals.siteCount, 2);
  assert.equal(cluster.totals.activeLinkCount, 1);
  assert.equal(cluster.totals.defenseCount, 2);

  const vm = buildFieldArchitectViewModel({
    state: h.state,
    siteSys: h.sys,
    selectedAsteroidId: 301,
    activeTool: 'link_material',
    linkSourceSiteId: s1,
  });
  assert.equal(vm.selectedSite.siteId, s1);
  assert.equal(vm.selectedSite.reserves.cmdty_silicate, 15);
  assert.equal(vm.selectedSite.defenses.length, 2);
  assert.equal(vm.peerSites.length, 1);

  // Save & load roundtrip preserves reserves, links, and defenses
  const saved = h.sys.serialize();
  const h2 = makeHarness();
  h2.sys.deserialize(saved);
  const restored = h2.sys.getSite(s1);
  assert.equal(restored.reserves.cmdty_silicate, 15);
  assert.equal(restored.links.length, 1);
  assert.equal(restored.links[0].targetSiteId, s2);
  assert.equal(restored.defenses.length, 2);
  assert.equal(restored.defenses[0].kind, 'turret');
  assert.equal(restored.defenses[1].kind, 'sensor');
});
