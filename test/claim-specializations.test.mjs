// M5 — three visible outpost specializations on the Claims system (SPEC3-F6/26 unification).
// Contract: Industrial Refinery / Trade Relay / Defense Bastion are default-reachable, behaviorally
// distinct operating identities on claimed bodies. Drives the REAL claims system (plus the real
// automation system for legacy-outpost migration) headlessly — no regex-only feature proofs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

import {
  claims as claimsBase,
  raidTripChance,
  repelChance,
  claimDefenseRating,
  REFINABLE_ORE_IDS,
  SPEC_UPKEEP_EVERY_S,
  SPEC_RAID_EVERY_S,
  RAID_SECURITY_FLOOR,
  SPEC_RAID_LOSS_FRAC,
  SPEC_RAID_COOLDOWN_S,
  SPEC_DETERRENCE_S,
  CLAIM_DEFENSE_WARNING_S,
} from '../src/systems/claims.js';
import {
  BODY_SPECIALIZATIONS,
  BODY_SPECIALIZATION_BY_ID,
  BODY_MODULES,
  BODY_MODULE_BY_ID,
  CLAIMABLE_BODY_SITES,
} from '../src/data/claimableBodies.js';
import { describeSpecializationAction } from '../src/ui/screens/base.js';
import {
  buildLocalModel,
  describeClaimMapMarker,
  emitGalaxyMapPrimaryAction,
  galaxyMapScreen,
  resolveCourseTarget,
  resolveGalaxyMapPrimaryAction,
} from '../src/ui/galaxyMap.js';
import { MAP_FOCUS, openGalaxyMap, peekMapOpenIntent } from '../src/ui/mapAuthority.js';
import { automation } from '../src/systems/automation.js';
import { OUTPOSTS } from '../src/data/automation.js';
import { SECTORS, dangerIndex } from '../src/data/sectors.js';
import { TECH_NODES } from '../src/data/tech.js';
import { COMMODITIES } from '../src/data/commodities.js';
import { addCargo } from '../src/systems/cargo.js';
import {
  ensureCampaign47aState,
  isBeatStepsComplete,
  recordBeatStep,
} from '../src/story/campaign47a/index.js';
import { fileURLToPath } from 'node:url';

const SECTOR_BY_ID = new Map(SECTORS.map((s) => [s.id, s]));
const TECH_IDS = new Set(TECH_NODES.map((t) => t.id));
const COMMODITY_IDS = new Set(COMMODITIES.map((c) => c.id));
const BASE_SOURCE = readFileSync(new URL('../src/ui/screens/base.js', import.meta.url), 'utf8');

// Low-security sector with a station and a real claimable POI (Pallas Industrial Moon).
const FRONTIER = 'sector_io_reach';
// Lawful core sector (security 0.98) for the never-hostile contract.
const LAWFUL = 'sector_helios_prime';

// ── harness ──────────────────────────────────────────────────────────────────────────────────

function makeBus() {
  const handlers = new Map();
  const emitLog = [];
  return {
    emitLog,
    on(evt, fn) {
      if (!handlers.has(evt)) handlers.set(evt, []);
      handlers.get(evt).push(fn);
    },
    off() {},
    emit(evt, payload) {
      emitLog.push({ evt, payload });
      for (const fn of (handlers.get(evt) || []).slice()) fn(payload);
    },
  };
}

function makeState({ seed = 47, sectorId = FRONTIER, credits = 200000, researched = true } = {}) {
  return {
    simTime: 1000,
    meta: { seed },
    playerId: 'player',
    mode: 'flight',
    player: {
      credits,
      heat: 0.123,
      droneTierCap: 1,
      stats: {},
      researchedNodes: researched
        ? ['tech_outpost_charter', 'tech_deep_core_mining', 'tech_graviton_drives']
        : [],
      cargo: { items: {}, usedVolume: 0, usedMass: 0, capVolume: 400, capMass: 400 },
      ownedShips: [],
    },
    factions: Object.freeze({}), // any reputation write from claims throws
    world: { currentSectorId: sectorId, activeSector: null },
    entities: new Map(),
    entityList: [],
    claims: null,
    automation: null,
  };
}

function makeEconomyStub(priceTable = {}) {
  return {
    name: 'economy',
    prices: priceTable,
    priceOf(stationId, goodId, side) {
      const key = stationId + '|' + goodId + '|' + side;
      if (key in this.prices) return this.prices[key];
      return this.prices[goodId] != null ? this.prices[goodId] : 50;
    },
  };
}

function boot({ seed = 47, sectorId = FRONTIER, credits = 200000, researched = true, economy = makeEconomyStub(), withAutomation = false } = {}) {
  const state = makeState({ seed, sectorId, credits, researched });
  const bus = makeBus();
  const peers = new Map();
  const registry = { get: (name) => peers.get(name) || null };
  const ctx = { state, bus, helpers: {}, registry };

  // Economy single-writer: the test bus applies grant/charge so affordability reads stay live.
  bus.on('economy:chargeCredits', (p) => {
    const amt = Math.max(0, Math.round(p.amount || 0));
    state.player.credits = Math.max(0, (state.player.credits || 0) - amt);
  });
  bus.on('economy:grantCredits', (p) => {
    const amt = Math.max(0, Math.round(p.amount || 0));
    state.player.credits = (state.player.credits || 0) + amt;
  });

  if (economy) peers.set('economy', economy);

  let auto = null;
  if (withAutomation) {
    auto = Object.create(automation);
    auto.init({ state, bus, helpers: {}, registry: null });
    auto.newGame();
    auto._orePrice = () => 28;
    auto._stationPrice = () => 28;
    peers.set('automation', auto);
  }

  const sys = { ...claimsBase };
  sys.init(ctx);
  if (!state.claims) state.claims = { bodies: [] };
  return { state, bus, sys, auto, registry, peers };
}

function claimBody(h, { poiId = 'poi_claim_pallas', name = 'Pallas Industrial Moon', size = 'M', pos = { x: 20, z: 0 } } = {}) {
  assert.equal(h.sys.claim({ id: poiId, name, size, pos }), true, 'claiming fixture body succeeds');
  return h.state.claims.bodies.at(-1);
}

function buildModules(h, body, modIds) {
  for (const modId of modIds) {
    assert.equal(h.sys.buildModule(body.id, modId), true, 'fixture module builds: ' + modId);
  }
}

function commission(h, body, specId, mods) {
  buildModules(h, body, mods || [BODY_SPECIALIZATION_BY_ID.get(specId).requiresModule]);
  assert.equal(h.sys.specialize(body.id, specId), true, 'commissioning succeeds: ' + specId);
  return body;
}

function runSim(h, seconds, dt = 0.1) {
  const steps = Math.round(seconds / dt);
  for (let i = 0; i < steps; i++) {
    h.state.simTime += dt;
    h.sys.update(dt, h.state);
  }
}

// Force the next tick to run one raid window (drives the real roll path, not a private API).
function forceRaidWindow(h) {
  const meta = h.state.claims.meta;
  assert.ok(meta, 'claims meta exists once a specialization is live');
  meta.raidAccum = SPEC_RAID_EVERY_S - 0.05;
  runSim(h, 0.1, 0.1);
}

function events(h, name) {
  return h.bus.emitLog.filter((e) => e.evt === name);
}
function charges(h, reason) {
  return events(h, 'economy:chargeCredits').filter((e) => !reason || e.payload.reason === reason);
}
function grants(h, reason) {
  return events(h, 'economy:grantCredits').filter((e) => !reason || e.payload.reason === reason);
}
function storedUnits(body) {
  const sum = (o) => Object.values(o || {}).reduce((a, b) => a + b, 0);
  return sum(body.spec && body.spec.store && body.spec.store.input) + sum(body.spec && body.spec.store && body.spec.store.output);
}

// ── 1. default-reachable + behaviorally distinct ─────────────────────────────────────────────

test('all three specializations exist, are default-reachable, and are gated by real tech/modules', () => {
  assert.equal(BODY_SPECIALIZATIONS.length, 3, 'exactly three specializations');
  const ids = BODY_SPECIALIZATIONS.map((s) => s.id);
  assert.deepEqual(ids.slice().sort(), ['spec_bastion', 'spec_refinery', 'spec_relay'].sort());
  for (const spec of BODY_SPECIALIZATIONS) {
    assert.ok(spec.name && spec.desc, spec.id + ' has player-facing copy');
    assert.ok(spec.cost > 0, spec.id + ' has a real cost');
    assert.ok(spec.upkeepPerMin > 0, spec.id + ' has a real upkeep (ongoing input)');
    const mod = BODY_MODULE_BY_ID.get(spec.requiresModule);
    assert.ok(mod, spec.id + ' prerequisite module exists in the live catalog');
    assert.ok(TECH_IDS.has(mod.techReq), spec.id + ' prerequisite tech node exists in the real tree');
    assert.equal(BODY_SPECIALIZATION_BY_ID.get(spec.id), spec);
  }
  // Each specialization is commissionable through the real flow in the default game path.
  for (const spec of BODY_SPECIALIZATIONS) {
    const h = boot();
    const body = claimBody(h);
    commission(h, body, spec.id);
    assert.equal(body.spec.id, spec.id);
    assert.ok(events(h, 'claim:specialized').some((e) => e.payload.specId === spec.id));
  }
});

test('specializations are behaviorally distinct: refinery converts, relay sells, bastion defends', () => {
  // Refinery: ore in → refined goods out, no credits granted.
  const hr = boot({ seed: 7 });
  const refinery = commission(hr, claimBody(hr), 'spec_refinery');
  hr.state.player.cargo.items = {};
  hr.state.player.cargo.usedVolume = 0;
  assert.ok(REFINABLE_ORE_IDS.includes('cmdty_ore_iron'));
  // give the player ore through the cargo owner (cargo helpers are exercised via deliver/collect)
  addCargo(hr.state, 'cmdty_ore_iron', 100);
  const moved = hr.sys.deliverToClaim(refinery.id, 'cmdty_ore_iron', 100);
  assert.equal(moved, 100, 'refinery accepts delivered ore');
  runSim(hr, 300, 0.1); // 300 s at 0.5 u/s → 150 u processed → 75 refined
  const out = refinery.spec.store.output;
  assert.ok((out.cmdty_refined_metals || 0) > 0, 'refinery produced refined goods');
  assert.equal(grants(hr).length, 0, 'refinery never fabricates credits');

  // Relay: goods in → convoy dispatch → sale at destination market price − fee, credits granted.
  const hl = boot({ seed: 7, economy: makeEconomyStub({ cmdty_refined_metals: 80 }) });
  const relay = commission(hl, claimBody(hl), 'spec_relay');
  addCargo(hl.state, 'cmdty_refined_metals', 60);
  assert.equal(hl.sys.deliverToClaim(relay.id, 'cmdty_refined_metals', 60), 60);
  runSim(hl, 1200, 0.1);
  assert.ok(grants(hl, 'claim_relay_sale').length >= 1, 'relay sold through a convoy');
  assert.equal((relay.spec.store.input.cmdty_refined_metals || 0), 0, 'relay dispatched its stock');
  assert.ok(!Object.keys(relay.spec.store.output || {}).length, 'relay produces no goods of its own');

  // Bastion: neither converts nor sells; it raises defense rating and covers the sector.
  const hb = boot({ seed: 7 });
  const bastionBody = commission(hb, claimBody(hb), 'spec_bastion');
  runSim(hb, 600, 0.1);
  assert.equal(grants(hb).length, 0, 'bastion generates no credits');
  assert.equal(storedUnits(bastionBody), 0, 'bastion stores no goods');
  const spec = BODY_SPECIALIZATION_BY_ID.get('spec_bastion');
  const rating = claimDefenseRating(bastionBody, hb.state.claims.bodies);
  const battery = BODY_MODULE_BY_ID.get('mod_defense').defenseRating;
  assert.equal(rating, battery + spec.defenseBonus, 'bastion rating = battery + garrison bonus');
  assert.ok(repelChance(rating) > repelChance(battery), 'bastion strictly raises repel odds');
});

// ── 2. selection contract: prerequisites, exact cost, idempotency, invalid rejection ─────────

test('specialize validates prerequisites, charges the exact cost once, and is idempotent', () => {
  const h = boot();
  const body = claimBody(h);
  const spec = BODY_SPECIALIZATION_BY_ID.get('spec_refinery');

  // invalid spec id
  assert.equal(h.sys.specialize(body.id, 'spec_bogus'), false, 'invalid spec id rejected');
  // missing prerequisite module
  assert.equal(h.sys.specialize(body.id, 'spec_refinery'), false, 'missing module rejected');
  assert.equal(charges(h, 'claim_specialize').length, 0, 'no charge on rejection');

  buildModules(h, body, ['mod_refinery']);

  // unaffordable
  const bank = h.state.player.credits;
  h.state.player.credits = spec.cost - 1;
  assert.equal(h.sys.specialize(body.id, 'spec_refinery'), false, 'unaffordable rejected');
  assert.equal(charges(h, 'claim_specialize').length, 0);
  h.state.player.credits = bank;

  // success charges exactly once with the exact cost
  assert.equal(h.sys.specialize(body.id, 'spec_refinery'), true);
  let specCharges = charges(h, 'claim_specialize');
  assert.equal(specCharges.length, 1);
  assert.equal(specCharges[0].payload.amount, spec.cost, 'exact commissioning cost');
  assert.equal(body.spec.id, 'spec_refinery');

  // idempotent: re-selecting the same spec cannot double-charge
  assert.equal(h.sys.specialize(body.id, 'spec_refinery'), false, 're-selection is a no-op');
  specCharges = charges(h, 'claim_specialize');
  assert.equal(specCharges.length, 1, 'no double charge');

  // exactly one specialization at a time; switching needs empty stores
  buildModules(h, body, ['mod_depot']);
  addCargo(h.state, 'cmdty_ore_iron', 10);
  h.sys.deliverToClaim(body.id, 'cmdty_ore_iron', 10);
  assert.equal(h.sys.specialize(body.id, 'spec_relay'), false, 'switching with stored goods rejected');
  assert.equal(body.spec.id, 'spec_refinery', 'original specialization intact');
  assert.equal(h.sys.collectFromClaim(body.id), 0, 'nothing refined yet to collect');
  // pull the raw ore back out, then switching works and charges the relay cost once
  assert.equal(h.sys.withdrawFromClaim(body.id, 'cmdty_ore_iron', 10), 10, 'raw input can be withdrawn');
  assert.equal(h.sys.specialize(body.id, 'spec_relay'), true, 'switching allowed once stores are empty');
  assert.equal(body.spec.id, 'spec_relay', 'one specialization per body at a time');
  const relayCharges = charges(h, 'claim_specialize');
  assert.equal(relayCharges.length, 2);
  assert.equal(relayCharges[1].payload.amount, BODY_SPECIALIZATION_BY_ID.get('spec_relay').cost);
});

test('first commissioning emits one canonical B6 deployment receipt across save/reload and re-commission', () => {
  const h = boot({ seed: 9 });
  h.state.story = { beatIndex: 6, branch: 'traders', flags: {} };
  const observed = [];
  h.bus.on('asset:deployed', (payload) => {
    observed.push(recordBeatStep(h.state, 'asset:deployed', payload, h.state.simTime));
  });

  const body = claimBody(h);
  buildModules(h, body, ['mod_refinery', 'mod_depot']);
  assert.equal(h.sys.specialize(body.id, 'spec_refinery'), true);

  const deployed = events(h, 'asset:deployed');
  assert.equal(deployed.length, 1, 'one successful first commission produces one deploy event');
  assert.deepEqual(deployed[0].payload, {
    receiptId: 'claim-deploy:' + body.id,
    kind: 'outpost',
    id: body.id,
    claimId: body.id,
    claimSpecId: 'spec_refinery',
    sectorId: FRONTIER,
    simTime: 1000,
    source: 'claims',
  });
  assert.equal(observed.length, 1);
  assert.equal(observed[0].ok, true, 'campaign sidecar accepts the canonical B6 payload');
  assert.equal(isBeatStepsComplete(h.state, 6), true, 'B6 deployment step is satisfied');
  assert.equal(ensureCampaign47aState(h.state).outpostSpecializationId, 'spec_refinery',
    'physical claimSpecId becomes campaign ownership truth');
  assert.deepEqual(body.deploymentReceipt, deployed[0].payload, 'durable body receipt matches the event');

  // Same-spec idempotency cannot emit or reward twice.
  assert.equal(h.sys.specialize(body.id, 'spec_refinery'), false);
  assert.equal(events(h, 'asset:deployed').length, 1);

  // The body-level receipt survives save/load. Re-commissioning to a different valid identity is
  // allowed, but it is an operating change to the same outpost, not a second deployment reward.
  const snap = JSON.parse(JSON.stringify(h.sys.serialize()));
  const h2 = boot({ seed: 9 });
  h2.sys.deserialize(snap);
  const restored = h2.state.claims.bodies[0];
  assert.deepEqual(restored.deploymentReceipt, body.deploymentReceipt);
  assert.equal(h2.sys.specialize(restored.id, 'spec_relay'), true);
  assert.equal(events(h2, 'asset:deployed').length, 0, 'reload and re-commission emit no duplicate deploy');
  assert.equal(charges(h2, 'claim_specialize').length, 1, 'operating change still pays its honest cost once');
});

test('physical Bastion commissioning owns B6 identity and Bastion consequences', () => {
  const h = boot({ seed: 91 });
  h.state.story = { beatIndex: 6, branch: 'patrol', flags: {} };
  const observed = [];
  h.bus.on('asset:deployed', (payload) => {
    observed.push(recordBeatStep(h.state, 'asset:deployed', payload, h.state.simTime));
  });

  const body = claimBody(h, { poiId: 'poi_colony', name: 'Watch Rock', size: 'S' });
  commission(h, body, 'spec_bastion');
  assert.equal(observed.length, 1);
  assert.equal(observed[0].ok, true, observed[0].reason);

  const own = ensureCampaign47aState(h.state);
  assert.equal(own.outpostSpecializationId, 'spec_bastion');
  assert.deepEqual(own.outpostsOwned, ['spec_bastion']);
  const receipt = own.receipts.findLast((entry) => entry.kind === 'outpost_spec');
  assert.equal(receipt.specializationId, 'spec_bastion');
  assert.equal(receipt.claimSpecId, 'spec_bastion');
  assert.ok(receipt.consequenceFlags.length >= 1);
  assert.ok(receipt.consequenceFlags.every((flag) => flag.includes('bastion')));
  for (const flag of receipt.consequenceFlags) {
    assert.equal(own.flags[flag], true, `commissioned Bastion applies ${flag}`);
  }
});

test('fifteen authored claim sites are distributed and reachable across the 24-region graph', () => {
  assert.equal(SECTORS.length, 24, 'canonical galaxy still has 24 regions');
  assert.equal(CLAIMABLE_BODY_SITES.length, 15, 'authored scarcity stays within the 12–16 target');

  const ids = new Set();
  const occupiedSectors = new Set();
  const sizes = { S: 0, M: 0, L: 0 };
  const sectorById = new Map(SECTORS.map((sector) => [sector.id, sector]));
  for (const site of CLAIMABLE_BODY_SITES) {
    assert.ok(!ids.has(site.id), 'claim POI ids are unique: ' + site.id);
    ids.add(site.id);
    occupiedSectors.add(site.sectorId);
    assert.notEqual(site.sectorId, LAWFUL, 'Helios core does not sell land');
    assert.ok(sectorById.has(site.sectorId), 'claim sector exists: ' + site.sectorId);
    assert.ok(['S', 'M', 'L'].includes(site.size), 'site has a supported body size');
    sizes[site.size] += 1;
    const sector = sectorById.get(site.sectorId);
    const live = (sector.pois || []).find((poi) => poi.id === site.id);
    assert.ok(live && live.claimable, 'site is present on the live sector POI route: ' + site.id);
    assert.equal(live.size, site.size);
    assert.deepEqual(live.pos, site.pos, 'authored position survives sector composition');
    assert.ok(Math.hypot(live.pos.x, live.pos.z) < sector.worldRadius * 0.75,
      'site stays inside a navigable sector radius: ' + site.id);
    const glb = new URL('../assets/ships/release/parts/places/' + site.landmarkGlb + '.glb', import.meta.url);
    assert.ok(existsSync(glb), 'site reuses a shipped place asset: ' + site.landmarkGlb);
  }
  assert.equal(occupiedSectors.size, 15, 'sites are distributed rather than stacked');
  assert.equal(sizes.L, 3, 'exactly three dangerous L-class stakes');
  assert.ok(sizes.S >= 5 && sizes.M >= 5, 'small and medium claims both support progression');

  // Every claim sector is reachable through the actual reciprocal galaxy graph from Helios.
  const reached = new Set([LAWFUL]);
  const queue = [LAWFUL];
  while (queue.length) {
    const id = queue.shift();
    const sector = sectorById.get(id);
    for (const neighbor of (sector && sector.neighbors) || []) {
      if (!reached.has(neighbor)) { reached.add(neighbor); queue.push(neighbor); }
    }
  }
  for (const sectorId of occupiedSectors) {
    assert.ok(reached.has(sectorId), 'claim sector reachable from Helios: ' + sectorId);
  }
});

// ── 3. refinery truth through canonical owners ───────────────────────────────────────────────

test('refinery input/output/upkeep/storage go through cargo + economy owners with honest numbers', () => {
  const h = boot({ seed: 11 });
  const body = commission(h, claimBody(h), 'spec_refinery');
  const spec = BODY_SPECIALIZATION_BY_ID.get('spec_refinery');

  addCargo(h.state, 'cmdty_ore_iron', 300);
  const cargoBefore = h.state.player.cargo.items.cmdty_ore_iron;

  // storage cap is honest: cannot deliver past inputCapU
  const moved = h.sys.deliverToClaim(body.id, 'cmdty_ore_iron', 300);
  assert.equal(moved, spec.inputCapU, 'delivery clamps to input capacity');
  assert.equal(h.state.player.cargo.items.cmdty_ore_iron, cargoBefore - moved, 'ore left the hold via the cargo owner');
  assert.equal(body.spec.store.input.cmdty_ore_iron, moved);

  // non-refinable goods are rejected
  addCargo(h.state, 'cmdty_fuel_cells', 5);
  assert.equal(h.sys.deliverToClaim(body.id, 'cmdty_fuel_cells', 5), 0, 'refinery only accepts refinable ore');

  const creditsBefore = h.state.player.credits;
  runSim(h, 240, 0.1); // 240 s → 120 ore processed → 60 refined; 4 upkeep windows

  // conversion truth: 2 ore -> 1 refined good, deterministic rate
  const processed = moved - body.spec.store.input.cmdty_ore_iron;
  const outUnits = body.spec.store.output.cmdty_refined_metals || 0;
  assert.equal(outUnits, Math.floor(processed / 2), 'refine ratio is the canonical 2:1');
  assert.ok(Math.abs(processed - spec.refineRatePerS * 240) <= 2, 'refine rate is the published rate');

  // upkeep flows only through economy:chargeCredits
  const upkeepCharges = charges(h, 'claim_upkeep');
  assert.ok(upkeepCharges.length >= 3, 'upkeep charged periodically');
  const upkeepPaid = upkeepCharges.reduce((a, c) => a + c.payload.amount, 0);
  assert.ok(Math.abs(upkeepPaid - spec.upkeepPerMin * 4) <= spec.upkeepPerMin, 'upkeep magnitude honest');
  assert.equal(h.state.player.credits, creditsBefore - upkeepPaid, 'credits only moved by the economy intents');

  // collection routes through the cargo owner
  const held = h.state.player.cargo.items.cmdty_refined_metals || 0;
  const collected = h.sys.collectFromClaim(body.id);
  assert.equal(collected, outUnits, 'collect moves the whole output store');
  assert.equal((h.state.player.cargo.items.cmdty_refined_metals || 0) - held, collected);
  assert.equal(Object.keys(body.spec.store.output).length, 0, 'output store empties on collect');

  // ledger tells the same story as the state
  const ledger = h.sys.ledger(body.id);
  assert.equal(ledger.specId, 'spec_refinery');
  assert.equal(ledger.upkeepPerMin, spec.upkeepPerMin);
  assert.equal(ledger.stores.inputCapU, spec.inputCapU);
  assert.equal(ledger.stores.outputCapU, spec.outputCapU);
  assert.equal(ledger.flows.refinedTotalU, outUnits, 'ledger output total matches actual production');
  assert.ok(ledger.lastEvent, 'ledger reports the last material event');

  // unpaid upkeep is a recoverable, explained failure state
  h.state.player.credits = 0;
  runSim(h, SPEC_UPKEEP_EVERY_S * 2 + 1, 0.1);
  assert.equal(body.spec.status, 'cold', 'unpaid upkeep sends the site cold');
  assert.ok(body.spec.receipts.some((r) => r.kind === 'upkeep_missed'), 'cold state is explained');
  h.state.player.credits = 100000;
  runSim(h, SPEC_UPKEEP_EVERY_S + 1, 0.1);
  assert.equal(body.spec.status, 'active', 'paying upkeep recovers the site');
});

// ── 4. relay capacity/throughput/receipts without fabricated profit ──────────────────────────

test('relay dispatches deterministic convoys and only realizes real market prices', () => {
  const price = 80;
  const h = boot({ seed: 13, economy: makeEconomyStub({ cmdty_refined_metals: price }) });
  const body = commission(h, claimBody(h), 'spec_relay');
  const spec = BODY_SPECIALIZATION_BY_ID.get('spec_relay');

  addCargo(h.state, 'cmdty_refined_metals', 200);
  const moved = h.sys.deliverToClaim(body.id, 'cmdty_refined_metals', 200);
  assert.equal(moved, 200, 'relay accepts goods up to capacity');

  runSim(h, spec.dispatchEveryS + spec.transitS + 2, 0.1);
  const sales = grants(h, 'claim_relay_sale');
  assert.equal(sales.length, 1, 'one convoy cycle completed');
  const receipt = body.spec.receipts.find((r) => r.kind === 'convoy_sold');
  assert.ok(receipt, 'convoy produces a durable receipt');
  assert.equal(receipt.data.qty, spec.convoyLoadU, 'convoy carries the published load');
  assert.ok(COMMODITY_IDS.has(receipt.data.goodId));
  assert.ok(receipt.data.destStationId, 'receipt names the destination station');
  const expected = Math.round(spec.convoyLoadU * price * (1 - spec.saleFee));
  assert.equal(receipt.data.revenueCr, expected, 'revenue = qty × real market price × (1 − fee)');
  assert.equal(sales[0].payload.amount, expected, 'granted credits equal the receipt');
  // honest market impact: the sale presses the destination market
  const pressure = events(h, 'economy:applyTradePressure');
  assert.ok(pressure.some((p) => p.payload.stationId === receipt.data.destStationId && p.payload.vol === spec.convoyLoadU));

  // no economy → no sale, goods held, no fabricated profit
  const h2 = boot({ seed: 13, economy: null });
  const body2 = commission(h2, claimBody(h2), 'spec_relay');
  addCargo(h2.state, 'cmdty_refined_metals', 100);
  h2.sys.deliverToClaim(body2.id, 'cmdty_refined_metals', 100);
  runSim(h2, (spec.dispatchEveryS + spec.transitS) * 2, 0.1);
  assert.equal(grants(h2, 'claim_relay_sale').length, 0, 'no market truth → no revenue');
  assert.equal(storedUnits(body2), 100, 'goods are held, not vaporized');

  // ledger throughput/capacity/risk are published
  const ledger = h.sys.ledger(body.id);
  assert.equal(ledger.stores.inputCapU, spec.storeCapU);
  assert.ok(ledger.risk && typeof ledger.risk.tripChance === 'number', 'risk is published');
  assert.ok(ledger.throughput && ledger.throughput.convoyLoadU === spec.convoyLoadU);
});

// ── 5. bastion readiness/coverage; defense only against canonical threats ────────────────────

test('bastion decomposition preserves the legacy raid math exactly', () => {
  for (const danger of [0.1, 0.3, 0.5, 0.8725, 1.0]) {
    for (const defense of [0, 20, 40, 80, 100, 140]) {
      const defenseMult = Math.max(1, defense / 20);
      const legacy = Math.min(danger * 0.4 / defenseMult, 0.5);
      const decomposed = raidTripChance(danger) * (1 - repelChance(defense));
      assert.ok(Math.abs(legacy - decomposed) < 1e-12,
        `trip×(1−repel) equals legacy pRaid (danger=${danger}, defense=${defense})`);
    }
  }
});

test('bastion covers the sector: warnings, higher repel odds, softer losses, deterrence', () => {
  // Unprotected refinery with stored ore: forced raid windows eventually strip storage.
  const raw = boot({ seed: 21 });
  const rawBody = commission(raw, claimBody(raw), 'spec_refinery');
  addCargo(raw.state, 'cmdty_ore_iron', 200);
  raw.sys.deliverToClaim(rawBody.id, 'cmdty_ore_iron', 200);
  let threatened = false;
  for (let i = 0; i < 40 && !threatened; i++) {
    forceRaidWindow(raw);
    threatened = !!rawBody.spec.defense;
  }
  assert.equal(threatened, true, 'an undefended stocked claim eventually receives a playable warning');
  assert.equal(rawBody.spec.totals.raidsSuffered, 0, 'the warning does not delete storage before counterplay');
  runSim(raw, CLAIM_DEFENSE_WARNING_S + 1, 0.5);
  assert.ok(rawBody.spec.totals.raidsSuffered >= 1, 'an unanswered warning resolves through the off-screen fallback');
  assert.ok(storedUnits(rawBody) < 200, 'a suffered raid takes goods');
  assert.equal(rawBody.spec.status, 'raided', 'raided site freezes');
  assert.ok(rawBody.spec.receipts.some((r) => r.kind === 'defense_ignored'), 'unanswered defense is explained in receipts');
  const oreEquivalent = (body) => Object.values(body.spec.store.input || {}).reduce((a, b) => a + b, 0)
    + Object.values(body.spec.store.output || {}).reduce((a, b) => a + b * 2, 0);
  const frozenAt = oreEquivalent(rawBody);
  runSim(raw, SPEC_RAID_COOLDOWN_S + 1, 0.5);
  assert.equal(rawBody.spec.status, 'active', 'raided site recovers after cooldown');
  assert.equal(oreEquivalent(rawBody), Math.max(0, frozenAt), 'no offline double-dipping');

  // Same seed, same deliveries, but with a bastion in-sector: coverage is visible and material.
  const cov = boot({ seed: 21 });
  const covRefinery = commission(cov, claimBody(cov), 'spec_refinery');
  const bastion = commission(cov, claimBody(cov, { poiId: 'poi_colony', name: 'Watch Rock', size: 'S' }), 'spec_bastion');
  addCargo(cov.state, 'cmdty_ore_iron', 200);
  cov.sys.deliverToClaim(covRefinery.id, 'cmdty_ore_iron', 200);

  const specB = BODY_SPECIALIZATION_BY_ID.get('spec_bastion');
  const covered = claimDefenseRating(covRefinery, cov.state.claims.bodies);
  assert.equal(covered, specB.coverageBonus, 'stationed protection extends to sector claims');
  const ledgerB = cov.sys.ledger(bastion.id);
  assert.ok(ledgerB.defense.rating > covered, 'bastion itself is harder than what it lends');
  assert.equal(ledgerB.readiness.coveredBodies, 2, 'readiness reports what it protects');

  let repelled = 0;
  for (let i = 0; i < 60 && !repelled; i++) {
    forceRaidWindow(cov);
    repelled = covRefinery.spec.totals.raidsRepelled + bastion.spec.totals.raidsRepelled;
  }
  assert.ok(repelled >= 1, 'covered claims repel raids');
  assert.ok(events(cov, 'claim:raidWarning').length >= 1, 'bastion warns when a raid trips in-sector');
  const deterred = cov.state.claims.bodies.find((b) => b.spec && b.spec.deterrenceUntil > cov.state.simTime);
  assert.ok(deterred, 'a repelled raid opens a deterrence window');

  // defense never acts on its own: claims emit no hostility, no spawns, no heat, no rep writes
  for (const h of [raw, cov]) {
    assert.equal(events(h, 'spawn:request').length, 0, 'claims never spawn combat entities');
    assert.equal(events(h, 'faction:aggro').length, 0, 'claims never aggro factions');
    assert.ok(events(h, 'faction:repDelta').every((event) => /^claim_defense:/.test(event.payload.reason)),
      'claim-defense reputation consequences route only through the faction owner event');
    assert.equal(h.state.player.heat, 0.123, 'claims never write WANTED heat');
  }
});

test('high-security lawful space never produces raids, losses, or hostility from specializations', () => {
  const sec = SECTOR_BY_ID.get(LAWFUL).security;
  assert.ok(sec >= RAID_SECURITY_FLOOR, 'fixture sector is lawful');
  const h = boot({ seed: 31, sectorId: LAWFUL, economy: makeEconomyStub({ cmdty_refined_metals: 80 }) });
  const refinery = commission(h, claimBody(h, { poiId: 'poi_lawful_a', name: 'Helios Rock A' }), 'spec_refinery');
  const relay = commission(h, claimBody(h, { poiId: 'poi_lawful_b', name: 'Helios Rock B' }), 'spec_relay');
  addCargo(h.state, 'cmdty_ore_iron', 200);
  h.sys.deliverToClaim(refinery.id, 'cmdty_ore_iron', 100);
  addCargo(h.state, 'cmdty_refined_metals', 100);
  h.sys.deliverToClaim(relay.id, 'cmdty_refined_metals', 100);
  for (let i = 0; i < 30; i++) forceRaidWindow(h);
  runSim(h, 2400, 0.5);
  assert.equal(refinery.spec.totals.raidsSuffered + refinery.spec.totals.raidsRepelled, 0, 'no raids in lawful space');
  assert.equal(relay.spec.totals.lostU, 0, 'no convoy losses in lawful space');
  assert.equal(events(h, 'claim:raidWarning').length, 0);
  assert.equal(events(h, 'spawn:request').length, 0);
  const ledger = h.sys.ledger(refinery.id);
  assert.equal(ledger.risk.raidEligible, false, 'ledger says lawful space is safe');
});

test('off-sector claims cannot suffer silent losses without warning coverage', () => {
  const h = boot({ seed: 37, sectorId: FRONTIER });
  const refinery = commission(h, claimBody(h), 'spec_refinery');
  addCargo(h.state, 'cmdty_ore_iron', 200);
  h.sys.deliverToClaim(refinery.id, 'cmdty_ore_iron', 200);
  const oreEquivalent = () => Object.values(refinery.spec.store.input || {}).reduce((a, b) => a + b, 0)
    + Object.values(refinery.spec.store.output || {}).reduce((a, b) => a + b * 2, 0);
  const before = oreEquivalent();

  // The player leaves and no active bastion/sensor coverage remains. Time may advance, but an
  // unseen abstract roll cannot delete goods without a warning/counterplay owner.
  h.state.world.currentSectorId = LAWFUL;
  for (let i = 0; i < 60; i++) forceRaidWindow(h);
  assert.equal(oreEquivalent(), before, 'uncovered off-sector storage is not silently destroyed');
  assert.equal(refinery.spec.totals.raidsSuffered, 0);
  assert.equal(refinery.spec.totals.lostU, 0);
  assert.equal(events(h, 'claim:raidWarning').length, 0);

  // Returning to the claim restores the normal local raid contract.
  h.state.world.currentSectorId = FRONTIER;
  let threatened = false;
  for (let i = 0; i < 60 && !threatened; i++) {
    forceRaidWindow(h);
    threatened = !!refinery.spec.defense
      || refinery.spec.totals.raidsSuffered + refinery.spec.totals.raidsRepelled > 0;
  }
  assert.equal(threatened, true, 'local presence makes the authored warning/counterplay risk active again');
  if (refinery.spec.defense) runSim(h, CLAIM_DEFENSE_WARNING_S + 1, 0.5);
  assert.ok(refinery.spec.totals.raidsSuffered + refinery.spec.totals.raidsRepelled >= 1,
    'an unanswered local warning eventually resolves exactly once');
});

// ── 6. save/load + legacy migration: exactly once, no duplication ────────────────────────────

test('serialize/deserialize restores specialization, buffers, timers, and receipts exactly', () => {
  const h = boot({ seed: 41, economy: makeEconomyStub({ cmdty_refined_metals: 80 }) });
  const body = commission(h, claimBody(h), 'spec_refinery');
  addCargo(h.state, 'cmdty_ore_iron', 120);
  h.sys.deliverToClaim(body.id, 'cmdty_ore_iron', 120);
  runSim(h, 90, 0.1);

  const snap = h.sys.serialize();
  assert.equal(snap.specVersion, 1, 'serialized claims are versioned');
  // deep copy: mutating the snapshot must not touch live state
  snap.bodies[0].spec.store.input.cmdty_ore_iron = 99999;
  assert.notEqual(body.spec.store.input.cmdty_ore_iron, 99999, 'serialize deep-copies spec state');

  const clean = h.sys.serialize();
  const h2 = boot({ seed: 41, economy: makeEconomyStub({ cmdty_refined_metals: 80 }) });
  h2.sys.deserialize(JSON.parse(JSON.stringify(clean)));
  const restored = h2.state.claims.bodies[0];
  assert.deepEqual(restored.spec, body.spec, 'spec state round-trips exactly');
  assert.equal(h2.sys.serialize && JSON.stringify(h2.sys.serialize()), JSON.stringify(clean), 'second serialize is stable');

  // restored sim continues identically to an uninterrupted run
  const hRef = boot({ seed: 41, economy: makeEconomyStub({ cmdty_refined_metals: 80 }) });
  const refBody = commission(hRef, claimBody(hRef), 'spec_refinery');
  addCargo(hRef.state, 'cmdty_ore_iron', 120);
  hRef.sys.deliverToClaim(refBody.id, 'cmdty_ore_iron', 120);
  runSim(hRef, 90, 0.1);
  h2.state.simTime = hRef.state.simTime;
  h2.state.player.credits = hRef.state.player.credits;
  runSim(hRef, 300, 0.1);
  runSim(h2, 300, 0.1);
  assert.deepEqual(h2.state.claims.bodies[0].spec.store, refBody.spec.store, 'reload does not fork the simulation');
});

test('older saves default to no specialization (versioned migration)', () => {
  const h = boot();
  h.sys.deserialize({
    bodies: [{ id: 'claim_3', sectorId: FRONTIER, poiId: 'poi_old', name: 'Old Moon', size: 'M', slots: 3, modules: ['mod_refinery'], linkedStationId: null, x: 0, z: 0, claimedAt: 5 }],
  });
  const body = h.state.claims.bodies[0];
  assert.equal(body.spec, null, 'legacy body defaults to unspecialized');
  assert.equal(h.state.claims.specVersion, 1, 'load stamps the current version');
  // still fully operable after migration default
  assert.equal(h.sys.specialize(body.id, 'spec_refinery'), true);
});

test('legacy abstract outposts migrate through the F6 path exactly once with no duplicate production', () => {
  const h = boot({ seed: 51, withAutomation: true });
  // player built a legacy refinery outpost in the frontier sector via the real automation system
  h.state.player.credits = 500000;
  assert.equal(h.auto.buildOutpost('outpost_refinery'), true, 'legacy outpost builds');
  const outpost = h.state.automation.outposts[0];
  outpost.storage = 120; // banked production
  const automationSnap = JSON.parse(JSON.stringify(h.auto.serialize ? h.auto.serialize() : h.state.automation));

  // loading a legacy claims payload (no specVersion) triggers the F6-owned migration
  h.sys.deserialize({ bodies: [] });
  assert.equal(h.state.automation.outposts.length, 0, 'migrated outpost released from automation');
  assert.equal(h.state.claims.bodies.length, 1, 'outpost re-chartered as a claim');
  const migrated = h.state.claims.bodies[0];
  assert.equal(migrated.sectorId, FRONTIER);
  assert.equal(migrated.spec.id, 'spec_refinery', 'refinery outpost becomes an Industrial Refinery');
  assert.equal(migrated.spec.store.output.cmdty_alloys, 120, 'banked storage carries over as real goods');
  assert.ok(h.state.claims.legacyMigration, 'migration writes a durable receipt');
  assert.ok(events(h, 'claims:migrated').length === 1);

  // exactly-once: replaying the same legacy load (as a save re-load would) cannot duplicate
  if (h.auto.deserialize) h.auto.deserialize(JSON.parse(JSON.stringify(automationSnap)));
  else h.state.automation = JSON.parse(JSON.stringify(automationSnap));
  h.sys.deserialize({ bodies: [] });
  assert.equal(h.state.claims.bodies.length, 1, 'second legacy load migrates to the same single claim');
  assert.equal(h.state.claims.bodies[0].spec.store.output.cmdty_alloys, 120, 'storage not duplicated');
  assert.equal(h.state.automation.outposts.length, 0);

  // new-format saves never migrate: outposts in automation stay automation's
  const h2 = boot({ seed: 52, withAutomation: true });
  h2.state.player.credits = 500000;
  assert.equal(h2.auto.buildOutpost('outpost_refinery'), true);
  h2.sys.deserialize({ specVersion: 1, bodies: [] });
  assert.equal(h2.state.automation.outposts.length, 1, 'current-version saves leave outposts alone');
  assert.equal(h2.state.claims.bodies.length, 0);

  // no claimable body available → outpost is kept legacy, never deleted
  const h3 = boot({ seed: 53, sectorId: 'sector_helios_prime', withAutomation: true });
  h3.state.player.credits = 500000;
  assert.equal(h3.auto.buildOutpost('outpost_refinery'), true, 'outpost in a sector with no claimable body');
  h3.sys.deserialize({ bodies: [] });
  assert.equal(h3.state.automation.outposts.length, 1, 'unmigratable outpost keeps running');
  assert.equal(h3.state.claims.legacyMigration.kept, 1, 'kept-legacy is recorded');
});

// ── 7. determinism: 20 seeds per specialization, stable fingerprints, bounded outcomes ───────

function scenarioFingerprint(specId, seed) {
  const h = boot({ seed, economy: makeEconomyStub({ cmdty_refined_metals: 80, cmdty_ore_iron: 30 }) });
  const body = commission(h, claimBody(h), specId);
  if (specId === 'spec_refinery') {
    addCargo(h.state, 'cmdty_ore_iron', 200);
    h.sys.deliverToClaim(body.id, 'cmdty_ore_iron', 200);
  } else if (specId === 'spec_relay') {
    addCargo(h.state, 'cmdty_refined_metals', 200);
    h.sys.deliverToClaim(body.id, 'cmdty_refined_metals', 200);
  }
  runSim(h, 1800, 0.5);
  const digest = {
    store: body.spec.store,
    totals: body.spec.totals,
    status: body.spec.status,
    receipts: body.spec.receipts.map((r) => r.kind),
    credits: h.state.player.credits,
    grants: grants(h).map((g) => [g.payload.reason, g.payload.amount]),
    charges: charges(h).map((c) => [c.payload.reason, c.payload.amount]),
  };
  return { hash: createHash('sha256').update(JSON.stringify(digest)).digest('hex'), digest, body, h };
}

test('20 deterministic seeds per specialization: identical replays, bounded outcomes', () => {
  for (const specId of ['spec_refinery', 'spec_relay', 'spec_bastion']) {
    const spec = BODY_SPECIALIZATION_BY_ID.get(specId);
    for (let seed = 1; seed <= 20; seed++) {
      const a = scenarioFingerprint(specId, seed);
      const b = scenarioFingerprint(specId, seed);
      assert.equal(a.hash, b.hash, `${specId} seed ${seed} replays identically`);
      // bounded outcomes
      const t = a.digest.totals;
      assert.ok(t.refinedTotalU <= 100 + 1, 'refined output bounded by delivered input / ratio');
      assert.ok(t.soldTotalCr <= 200 * 80 + 1, 'revenue bounded by goods × price');
      assert.ok(storedUnits(a.body) >= 0 && storedUnits(a.body) <= 400, 'stores stay in bounds');
      for (const [, amount] of a.digest.grants) assert.ok(amount >= 0);
      for (const [, amount] of a.digest.charges) assert.ok(amount >= 0);
    }
  }
});

// ── 8. single-writer discipline ──────────────────────────────────────────────────────────────

test('claims never writes credits, cargo caches, reputation, or heat directly', () => {
  const h = boot({ seed: 61, economy: makeEconomyStub({ cmdty_refined_metals: 80 }) });
  // Freeze credits application: do NOT apply bus charges — player.credits must then never move.
  const inert = boot({ seed: 61, economy: makeEconomyStub({ cmdty_refined_metals: 80 }) });
  inert.bus.emitLog.length = 0;
  // strip the credit-applying handlers by rebuilding a bus with no handlers
  const bareBus = { on() {}, off() {}, emitLog: [], emit(evt, payload) { this.emitLog.push({ evt, payload }); } };
  const sys = { ...claimsBase };
  const state = makeState({ seed: 61 });
  sys.init({ state, bus: bareBus, helpers: {}, registry: { get: () => makeEconomyStub({ cmdty_refined_metals: 80 }) } });
  state.claims = { bodies: [] };
  assert.equal(sys.claim({ id: 'poi_claim_pallas', name: 'Pallas Industrial Moon', size: 'M', pos: { x: 0, z: 0 } }), true);
  const body = state.claims.bodies[0];
  for (const mod of ['mod_refinery']) sys.buildModule(body.id, mod);
  sys.specialize(body.id, 'spec_refinery');
  const credits = state.player.credits;
  addCargo(state, 'cmdty_ore_iron', 100);
  sys.deliverToClaim(body.id, 'cmdty_ore_iron', 100);
  for (let i = 0; i < 6000; i++) { state.simTime += 0.5; sys.update(0.5, state); }
  assert.equal(state.player.credits, credits, 'without the economy system, credits never move — claims only emits intents');
  assert.equal(state.player.heat, 0.123, 'heat untouched');
  // cargo cache consistency: recompute usedVolume from items and compare
  const volOf = new Map(COMMODITIES.map((c) => [c.id, c.volPerU > 0 ? c.volPerU : 1]));
  const recomputed = Object.entries(state.player.cargo.items).reduce((a, [id, q]) => a + q * (volOf.get(id) || 1), 0);
  assert.ok(Math.abs(recomputed - state.player.cargo.usedVolume) < 1e-6, 'cargo caches stay coherent (helpers-only mutation)');
});

// ── 9. UI surface: default-reachable readout + keyboard/pointer access (static contracts) ────

test('base screen embodies specializations with accessible controls (static DOM contract)', () => {
  const checksRe = [
    [/export function describeSpecializationAction/, 'guidance helper is exported for reuse/tests'],
    [/BODY_SPECIALIZATIONS/, 'base screen renders the real specialization catalog'],
    [/claims\.specialize\(body\.id,\s*spec\.id\)/, 'commission action routes through the claims system'],
    [/claims\.ledger\(body\.id\)/, 'operations readout comes from the system ledger, not UI math'],
    [/setAttribute\('aria-label',\s*specAction\.title\)/, 'commission buttons carry aria-labels'],
    [/claims\.deliverToClaim\(/, 'deliver action routes through the claims system'],
    [/claims\.collectFromClaim\(/, 'collect action routes through the claims system'],
  ];
  for (const [re, label] of checksRe) {
    assert.match(BASE_SOURCE, re, label);
  }
  assert.doesNotMatch(BASE_SOURCE, /coming soon/i, 'no coming-soon stubs');

  // guidance state machine (drives the real exported function)
  const spec = BODY_SPECIALIZATION_BY_ID.get('spec_refinery');
  const playerRich = { credits: 100000, researchedNodes: ['tech_deep_core_mining'] };
  let a = describeSpecializationAction(spec, playerRich, { modules: [], slots: 3 });
  assert.equal(a.state, 'requires');
  assert.equal(a.disabled, true);
  assert.match(a.label, /On-Site Refinery/);
  a = describeSpecializationAction(spec, { credits: 100, researchedNodes: [] }, { modules: ['mod_refinery'], slots: 3 });
  assert.equal(a.state, 'funding');
  assert.match(a.label, /more cr|cr/i);
  a = describeSpecializationAction(spec, playerRich, { modules: ['mod_refinery'], slots: 3 });
  assert.equal(a.state, 'available');
  assert.equal(a.disabled, false);
  a = describeSpecializationAction(spec, playerRich, { modules: ['mod_refinery'], slots: 3, spec: { id: 'spec_refinery', store: { input: {}, output: {} } } });
  assert.equal(a.state, 'active');
  assert.equal(a.disabled, true);
  a = describeSpecializationAction(spec, playerRich, { modules: ['mod_refinery', 'mod_depot'], slots: 3, spec: { id: 'spec_relay', store: { input: { cmdty_ore_iron: 5 }, output: {} } } });
  assert.equal(a.state, 'occupied', 'switching with stored goods is explained, not allowed');
});

test('claim map/navigation identity reflects the specialization', () => {
  const h = boot({ seed: 71 });
  const poiEntity = {
    id: 'e_poi', alive: true, type: 'poi',
    pos: { x: 20, z: 0 },
    data: { poi: true, claimable: true, poiId: 'poi_claim_pallas', name: 'Pallas Industrial Moon' },
  };
  h.state.entityList.push(poiEntity);
  const body = commission(h, claimBody(h), 'spec_refinery');
  assert.equal(body.owned, true, 'a canonical claim is explicitly player-owned');
  assert.equal(poiEntity.data.claimOwned, true, 'the live POI selects the authored player-base family');
  assert.match(poiEntity.data.name, /Industrial Refinery/, 'live POI identity carries the specialization');
  // re-entering the sector (world respawns POIs) re-applies the label
  poiEntity.data.name = 'Pallas Industrial Moon';
  h.bus.emit('sector:enter', { sectorId: FRONTIER });
  assert.match(poiEntity.data.name, /Industrial Refinery/, 'label survives sector respawn');
  h.bus.emit('sector:enter', { sectorId: FRONTIER });
  assert.equal((poiEntity.data.name.match(/Industrial Refinery/g) || []).length, 1, 'label application is idempotent');
  void body;
});

test('local-map ownership markers make all three jobs distinct and actionable', () => {
  const fixtures = [
    {
      specId: 'spec_refinery', kind: 'claim-refinery', glyph: '▣', role: 'REFINERY',
      ledger: { status: 'active', stores: { inputU: 48, inputCapU: 240, outputU: 12, outputCapU: 120 }, throughput: { refineRatePerS: 0.5 } },
      tells: [/48\/240u ore/i, /12\/120u ready/i, /0\.5 ore\/s/i],
    },
    {
      specId: 'spec_relay', kind: 'claim-relay', glyph: '⬡', role: 'RELAY',
      ledger: { status: 'active', stores: { inputU: 75, inputCapU: 300, outputU: 0, outputCapU: 0 }, convoy: { etaS: 37 }, flows: { soldTotalCr: 1820 } },
      tells: [/75\/300u freight/i, /convoy 37s/i, /1,820 cr sold/i],
    },
    {
      specId: 'spec_bastion', kind: 'claim-bastion', glyph: '⬟', role: 'BASTION',
      ledger: { status: 'active', defense: { rating: 100 }, readiness: { coveredBodies: 2 }, risk: { nextRollInS: 90 } },
      tells: [/100 defense/i, /2 claims covered/i, /next sweep 90s/i],
    },
  ];
  for (const fixture of fixtures) {
    const marker = describeClaimMapMarker({
      id: 'claim_1', poiId: 'poi_claim_pallas', name: 'Pallas Industrial Moon', sectorId: FRONTIER,
      x: 20, z: 30, owned: true, spec: { id: fixture.specId, status: 'active' },
    }, fixture.ledger, { id: 'e_poi', pos: { x: 22, z: 32 } });
    assert.equal(marker.kind, fixture.kind);
    assert.equal(marker.glyph, fixture.glyph);
    assert.equal(marker.role, fixture.role);
    assert.equal(marker.targetEntityId, 'e_poi');
    assert.deepEqual({ x: marker.x, z: marker.z }, { x: 22, z: 32 }, 'live global position wins over the save record');
    for (const tell of fixture.tells) assert.match(marker.statusLine, tell);
    assert.match(marker.name, new RegExp(fixture.role, 'i'));
  }
});

test('normal LOCAL map route exposes owned bases and pointer course-setting emits autopilot intent', () => {
  const h = boot({ seed: 72 });
  const poiEntity = {
    id: 'e_poi_map', alive: true, type: 'poi',
    pos: { x: 122, z: -38 },
    data: { poi: true, claimable: true, poiId: 'poi_claim_pallas', name: 'Pallas Industrial Moon' },
  };
  h.state.entityList.push(poiEntity);
  h.state.entities.set(poiEntity.id, poiEntity);
  const body = commission(h, claimBody(h, { pos: poiEntity.pos }), 'spec_refinery');

  const pushed = [];
  assert.equal(openGalaxyMap({
    state: h.state,
    bus: h.bus,
    screenManager: { top: () => null, pushScreen: (id) => pushed.push(id) },
  }, { focus: MAP_FOCUS.LOCAL, source: 'keyboard' }), true);
  assert.deepEqual(pushed, ['galaxyMap'], 'normal LOCAL route opens the unified map only');
  assert.equal(peekMapOpenIntent(h.state).focus, MAP_FOCUS.LOCAL);

  const model = buildLocalModel(h.state, null, { claimsSystem: h.sys });
  const marker = model.ownership.find((entry) => entry.claimId === body.id);
  assert.ok(marker, 'commissioned base is present on the authoritative LOCAL model');
  assert.equal(marker.role, 'REFINERY');
  assert.match(marker.statusLine, /ore/i);

  const pointerTarget = {
    ...marker,
    kind: 'claim',
    entityId: marker.targetEntityId,
    sx: 140,
    sy: 90,
    radiusPx: 22,
  };
  const course = resolveCourseTarget(pointerTarget);
  assert.deepEqual(course.pos, poiEntity.pos);
  assert.equal(course.targetEntityId, poiEntity.id);
  assert.equal(course.arrivalRadius, 170);
  assert.equal(course.autopilot, true);
  const action = resolveGalaxyMapPrimaryAction(h.state, pointerTarget);
  assert.equal(action.kind, 'waypoint');
  assert.equal(action.label, 'Set Base Waypoint');

  const directBus = makeBus();
  assert.equal(emitGalaxyMapPrimaryAction(directBus, action), true);
  assert.ok(events({ bus: directBus }, 'ui:setCourse').some((entry) => entry.payload.autopilot === true));

  // Exercise the actual canvas pointer handler used by a public double-click, not just the resolver.
  const old = {
    canvas: galaxyMapScreen._canvas,
    clickTargets: galaxyMapScreen._clickTargets,
    ctx: galaxyMapScreen._ctx,
  };
  const pointerBus = makeBus();
  let popped = 0;
  try {
    galaxyMapScreen._canvas = { getBoundingClientRect: () => ({ left: 0, top: 0 }) };
    galaxyMapScreen._clickTargets = [pointerTarget];
    galaxyMapScreen._ctx = {
      state: h.state,
      bus: pointerBus,
      screenManager: { popScreen: () => { popped += 1; } },
    };
    galaxyMapScreen._onCanvasDblClick({ clientX: 140, clientY: 90 });
  } finally {
    galaxyMapScreen._canvas = old.canvas;
    galaxyMapScreen._clickTargets = old.clickTargets;
    galaxyMapScreen._ctx = old.ctx;
  }
  const emitted = pointerBus.emitLog.find((entry) => entry.evt === 'ui:setCourse');
  assert.ok(emitted, 'public pointer path emits ui:setCourse');
  assert.equal(emitted.payload.autopilot, true);
  assert.equal(emitted.payload.targetEntityId, poiEntity.id);
  assert.equal(popped, 1, 'successful pointer course closes the map');
});

// ── 10. hygiene ──────────────────────────────────────────────────────────────────────────────

test('Enter and Space activate a selected claim without stealing text-entry keys', () => {
  const h = boot({ seed: 73 });
  const target = {
    id: 'player-claim:claim_keyboard', claimId: 'claim_keyboard', kind: 'claim', role: 'REFINERY',
    name: 'REFINERY · Keyboard Claim', x: 420, z: -180, targetEntityId: 'entity_keyboard_claim',
  };
  const old = { ctx: galaxyMapScreen._ctx, selectedTarget: galaxyMapScreen._selectedTarget };
  try {
    for (const key of ['Enter', ' ']) {
      const bus = makeBus();
      let popped = 0;
      let prevented = 0;
      galaxyMapScreen._ctx = {
        state: h.state,
        bus,
        screenManager: { popScreen: () => { popped += 1; } },
      };
      galaxyMapScreen._selectedTarget = target;
      const handled = galaxyMapScreen.onKey({
        key,
        target: { tagName: 'DIV', isContentEditable: false },
        preventDefault: () => { prevented += 1; },
      }, galaxyMapScreen._ctx);
      assert.equal(handled, true, `${JSON.stringify(key)} handles the selected base`);
      assert.equal(prevented, 1);
      const course = bus.emitLog.find((entry) => entry.evt === 'ui:setCourse');
      assert.ok(course, `${JSON.stringify(key)} emits ui:setCourse`);
      assert.equal(course.payload.type, 'claim');
      assert.equal(course.payload.autopilot, true);
      assert.equal(course.payload.targetEntityId, target.targetEntityId);
      assert.equal(course.payload.arrivalRadius, 170);
      assert.equal(popped, 1, `${JSON.stringify(key)} closes the map`);
    }

    const textBus = makeBus();
    let textPops = 0;
    let textPrevented = 0;
    galaxyMapScreen._ctx = {
      state: h.state,
      bus: textBus,
      screenManager: { popScreen: () => { textPops += 1; } },
    };
    galaxyMapScreen._selectedTarget = target;
    const handled = galaxyMapScreen.onKey({
      key: 'Enter',
      target: { tagName: 'INPUT', isContentEditable: false },
      preventDefault: () => { textPrevented += 1; },
    }, galaxyMapScreen._ctx);
    assert.equal(handled, false, 'search input retains native Enter behavior');
    assert.equal(textPrevented, 0);
    assert.equal(textPops, 0);
    assert.equal(textBus.emitLog.some((entry) => entry.evt === 'ui:setCourse'), false);
  } finally {
    galaxyMapScreen._ctx = old.ctx;
    galaxyMapScreen._selectedTarget = old.selectedTarget;
  }
});

test('git diff --check is clean for the feature paths', () => {
  const paths = [
    'src/systems/claims.js',
    'src/data/claimableBodies.js',
    'src/ui/screens/base.js',
    'src/ui/galaxyMap.js',
    'src/systems/automation.js',
    'test/claim-specializations.test.mjs',
  ];
  const out = execSync('git diff --check -- ' + paths.join(' '), {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    encoding: 'utf8',
  });
  assert.equal(out.trim(), '', 'no whitespace errors in feature paths');
});
