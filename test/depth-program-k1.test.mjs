import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const K1_IDS = Object.freeze([
  'faction_understory',
  'faction_fulfillment',
  'faction_archive',
  'faction_pitborn',
  'faction_verge_layers',
]);

const LEGACY_RELATIONS = Object.freeze({
  faction_scn: { faction_mts: 0.5, faction_dmc: 0, faction_reach: -0.6, faction_quiet: 0, faction_vael: -0.5, faction_free: 0, faction_choir: 0.3, faction_helix: 0 },
  faction_mts: { faction_scn: 0.5, faction_dmc: -0.2, faction_reach: -0.35, faction_quiet: 0, faction_vael: 0, faction_free: 0.2, faction_choir: 0, faction_helix: 0 },
  faction_dmc: { faction_scn: 0, faction_mts: -0.2, faction_reach: -0.35, faction_quiet: 0, faction_vael: 0, faction_free: 0.35, faction_choir: 0, faction_helix: 0 },
  faction_reach: { faction_scn: -0.6, faction_mts: -0.35, faction_dmc: -0.35, faction_quiet: 0.2, faction_vael: 0, faction_free: 0, faction_choir: -0.35, faction_helix: 0 },
  faction_quiet: { faction_scn: 0, faction_mts: 0, faction_dmc: 0, faction_reach: 0.2, faction_vael: 0, faction_free: 0, faction_choir: 0, faction_helix: 0 },
  faction_vael: { faction_scn: -0.5, faction_mts: 0, faction_dmc: 0, faction_reach: 0, faction_quiet: 0, faction_free: 0, faction_choir: -0.6, faction_helix: 0 },
  faction_free: { faction_scn: 0, faction_mts: 0.2, faction_dmc: 0.35, faction_reach: 0, faction_quiet: 0, faction_vael: 0, faction_choir: -0.2, faction_helix: 0 },
  faction_choir: { faction_scn: 0.3, faction_mts: 0, faction_dmc: 0, faction_reach: -0.35, faction_quiet: 0, faction_vael: -0.6, faction_free: -0.2, faction_helix: 0 },
  faction_helix: { faction_scn: 0, faction_mts: 0, faction_dmc: 0, faction_reach: 0, faction_quiet: 0, faction_vael: 0, faction_free: 0, faction_choir: 0 },
});

const EXACT_CUSTOM_FLAGS = Object.freeze({
  faction_understory: ['neverFiresFirst', 'scavengesAfterBattles', 'refliesLedgerHullsOnly', 'sporeBloomOnDeath', 'buysWreckageAndAsksNothing'],
  faction_fulfillment: ['interdictsAndBoards', 'neverFiresFirst', 'fliesFixedRoutesOnly', 'boardingIsAdministrativeRoutingEvent', 'repStartsNeutralCannotImprove'],
  faction_archive: ['tradesOnlyInSecrets', 'neutralToAll', 'redactionEMP', 'burningAnArchiveUnitesTheGalaxyAgainstYou'],
  faction_pitborn: ['hostileToConcordAlways', 'alliedWithReachAndQuiet', 'recognizesPlayerAsPitborn', 'repStartsPositiveForPlayer', 'buysWrecksAtFixedRates', 'civilianHullsSacrosanct'],
  faction_verge_layers: ['hostileOnlyToGateClosers', 'weaponsDisableNotDestroy', 'wakesProgressivelyAsGatesClose', 'neutralToEveryoneElse'],
});

test('K1 installs five complete faction kits without changing a legacy relation value', async () => {
  const [{ FACTION_KITS }, { SHIPS }, { COMMODITIES }, { SECTORS }] = await Promise.all([
    import('../src/data/factions/index.js'),
    import('../src/data/ships.js'),
    import('../src/data/commodities.js'),
    import('../src/data/sectors.js'),
  ]);
  assert.equal(FACTION_KITS.length, 14);
  const byId = new Map(FACTION_KITS.map((kit) => [kit.id, kit]));
  assert.deepEqual(K1_IDS.filter((id) => !byId.has(id)), []);

  for (const [factionId, expected] of Object.entries(LEGACY_RELATIONS)) {
    const actual = byId.get(factionId).relations;
    for (const [otherId, value] of Object.entries(expected)) {
      assert.equal(actual[otherId], value, `${factionId}<->${otherId} baseline drift`);
    }
  }

  const shipIds = new Set(SHIPS.map((ship) => ship.id));
  const commodityIds = new Set(COMMODITIES.map((commodity) => commodity.id));
  const sectorIds = new Set(SECTORS.map((sector) => sector.id));
  for (const kit of FACTION_KITS) {
    assert.equal(Object.keys(kit.relations).length, 13, `${kit.id} relation completeness`);
    for (const other of FACTION_KITS) {
      if (other.id === kit.id) continue;
      assert.equal(kit.relations[other.id], other.relations[kit.id], `${kit.id}<->${other.id} symmetry`);
    }
  }
  for (const factionId of K1_IDS) {
    const kit = byId.get(factionId);
    assert.equal(Number.isFinite(kit.aggression), true, `${factionId} aggression`);
    assert.equal(kit.palette.primary, kit.color, `${factionId} primary palette`);
    assert.deepEqual(Object.keys(kit.custom).sort(), [...EXACT_CUSTOM_FLAGS[factionId]].sort(), `${factionId} exact custom flags`);
    assert.equal(Object.values(kit.custom).every((value) => value === true), true, `${factionId} custom flags are true`);
    assert.equal(kit.homeSectors.every((id) => sectorIds.has(id)), true, `${factionId} sector refs`);
    assert.equal(kit.illegalCommodities.every((id) => commodityIds.has(id)), true, `${factionId} commodity refs`);
    for (const role of kit.shipRoles) {
      const hullIds = role.hullIds || [role.hullId];
      assert.equal(hullIds.every((id) => shipIds.has(id)), true, `${factionId}/${role.role} hull refs`);
    }
  }
  assert.equal(byId.get('faction_pitborn').relations.faction_scn, -0.6, 'Pitborn are always hostile to Concord');
  assert.equal(byId.get('faction_pitborn').relations.faction_reach, 0.5, 'Pitborn ally with Reach');
  assert.equal(byId.get('faction_pitborn').relations.faction_quiet, 0.5, 'Pitborn ally with Quiet');
  for (const neutralId of ['faction_fulfillment', 'faction_archive', 'faction_verge_layers']) {
    assert.equal(Object.values(byId.get(neutralId).relations).every((value) => value === 0), true, `${neutralId} conditional ROE is not encoded as reputation hostility`);
  }
});

test('K1 palettes and paint profiles preserve the five canonical visual identities', async () => {
  const [{ FACTION_PALETTES, PAINT_PROFILES }, { FACTION_KITS }] = await Promise.all([
    import('../src/data/palettes.js'),
    import('../src/data/factions/index.js'),
  ]);
  const expected = {
    faction_understory: '#8FA82E',
    faction_fulfillment: '#F0F0E8',
    faction_archive: '#3A2A5A',
    faction_pitborn: '#C8501C',
    faction_verge_layers: '#B0A8B8',
  };
  const byId = new Map(FACTION_KITS.map((kit) => [kit.id, kit]));
  for (const [id, primary] of Object.entries(expected)) {
    assert.equal(byId.get(id).palette.primary, primary, `${id} kit primary`);
    assert.equal(FACTION_PALETTES[id].primary, primary, `${id} render primary`);
    assert.ok(PAINT_PROFILES[byId.get(id).personality], `${id} paint profile`);
  }
  assert.equal(FACTION_PALETTES.faction_fulfillment.emissive, '#40B8E0');
  assert.equal(FACTION_PALETTES.faction_archive.accent, '#B88830');
  assert.equal(FACTION_PALETTES.faction_verge_layers.emissive, '#C0B8D8');
});

test('K1 doctrine sampler is deterministic and produces five genuinely different distributions', async () => {
  const { FACTION_DOCTRINES, sampleFactionBehavior } = await import('../src/data/factionDoctrines.js');
  const doctrineIds = new Set(Object.keys(FACTION_DOCTRINES));
  assert.deepEqual(K1_IDS.filter((factionId) => !doctrineIds.has(factionId)), [],
    'the shared doctrine registry must retain every K1 identity');
  const signatures = [];
  for (const factionId of K1_IDS) {
    const first = sampleFactionBehavior(factionId, 0x47a, 64);
    const replay = sampleFactionBehavior(factionId, 0x47a, 64);
    assert.deepEqual(first, replay, `${factionId} deterministic replay`);
    assert.equal(first.length, 64);
    assert.equal(first.every((row) => Number.isFinite(row.pursuit) && Number.isFinite(row.engagementRange)), true);
    signatures.push(JSON.stringify(first));
  }
  assert.equal(new Set(signatures).size, 5, 'each faction needs its own behavior distribution');
  assert.equal(FACTION_DOCTRINES.faction_understory.firstFire, false);
  assert.equal(FACTION_DOCTRINES.faction_fulfillment.fixedRoute, true);
  assert.equal(FACTION_DOCTRINES.faction_archive.stationDefenseAggression, 1);
  assert.equal(FACTION_DOCTRINES.faction_pitborn.disableThenRun, true);
  assert.equal(FACTION_DOCTRINES.faction_verge_layers.destroyTarget, false);
});

test('K1 pure presence model exposes five map seams and story-gated deterministic plans', async () => {
  const {
    FACTION_PRESENCE_NODES,
    mapFactionPresenceNodes,
    planFactionPresence,
    resolveVergePhase,
  } = await import('../src/data/factionPresence.js');
  const { SECTORS } = await import('../src/data/sectors.js');
  const stationIds = new Set(SECTORS.flatMap((sector) => sector.stations || []).map((station) => station.id));
  assert.equal(FACTION_PRESENCE_NODES.length, 5);
  assert.equal(mapFactionPresenceNodes().length, 5);
  assert.equal(FACTION_PRESENCE_NODES.every((node) => node.stationIds.every((id) => stationIds.has(id))), true);

  assert.equal(resolveVergePhase({ seed: 77, revocationCount: 3, storyFlags: {} }).phase, 'asleep');
  const observerArgs = { seed: 77, revocationCount: 1, storyFlags: { vergeLayersRevealed: true } };
  assert.deepEqual(resolveVergePhase(observerArgs), resolveVergePhase(observerArgs), 'phase is save/reload stable');
  assert.equal(resolveVergePhase(observerArgs).phase, 'observer');
  assert.equal(resolveVergePhase({
    seed: 77,
    revocationCount: 3,
    storyFlags: { vergeLayersRevealed: true, vergeAwake: true, valeGatesRevoked: true },
  }).phase, 'awake');

  const emptyUnderstory = planFactionPresence({ sectorId: 'sector_charon_expanse', seed: 11, losses: [] });
  assert.equal(emptyUnderstory.some((plan) => plan.factionId === 'faction_understory'), false, 'Understory cannot invent a pre-loss hull');
  const withLoss = planFactionPresence({
    sectorId: 'sector_charon_expanse',
    seed: 11,
    losses: [{ lossId: 'loss_1', shipDefId: 'ship_mule' }],
  });
  const salvager = withLoss.find((plan) => plan.factionId === 'faction_understory');
  assert.equal(salvager.shipDefId, 'ship_mule');
  assert.equal(salvager.lossId, 'loss_1');

  const routePlans = planFactionPresence({ sectorId: 'sector_tethys_junction', seed: 11, losses: [] });
  const fulfillment = routePlans.find((plan) => plan.factionId === 'faction_fulfillment');
  assert.equal(fulfillment.passive, true);
  assert.equal(fulfillment.fixedRoute, true);
  assert.deepEqual(fulfillment.route, ['sector_tethys_junction', 'sector_helios_prime']);
});

test('K1 live system spawns from canonical seams and routes cargo/services through their owners', async () => {
  const [{ factionPresence }, { createBus }] = await Promise.all([
    import('../src/systems/factionPresence.js'),
    import('../src/core/eventBus.js'),
  ]);
  const bus = createBus();
  const spawned = [];
  const receipts = [];
  const state = {
    meta: { seed: 47 }, simTime: 12,
    world: { currentSectorId: 'sector_charon_expanse' },
    story: { flags: { vergeLayersRevealed: true }, closedGateCount: 1, persistentCargo: [] },
    factions: {
      faction_archive: { rep: 24 },
      faction_pitborn: { rep: 40 },
    },
    lossLedger: {
      seed: 47,
      entries: [{ lossId: 'loss_live', sectorId: 'sector_charon_expanse', shipDefId: 'ship_mule' }],
      bySector: { sector_charon_expanse: [{ lossId: 'loss_live', sectorId: 'sector_charon_expanse', shipDefId: 'ship_mule' }] },
      ghostConvoy: { fired: {} },
    },
    player: {
      cargo: { items: { cmdty_stolen_goods: 2 }, usedVolume: 2, usedMass: 1, capVolume: 20, capMass: 20 },
    },
  };
  for (const event of ['factionPresence:spawned', 'factionPresence:service', 'factionPresence:administrativeRouting']) {
    bus.on(event, (payload) => receipts.push({ event, payload }));
  }
  const sys = Object.create(factionPresence);
  sys.init({ state, bus, helpers: { spawnEntity(spec) { const entity = { ...spec, id: `spawn_${spawned.length + 1}` }; spawned.push(entity); return entity; } } });

  bus.emit('sector:enter', { sectorId: 'sector_charon_expanse' });
  assert.equal(spawned.some((entity) => entity.factionId === 'faction_understory' && entity.data.defId === 'ship_mule'), true);
  bus.emit('sector:enter', { sectorId: 'sector_tethys_junction' });
  assert.equal(spawned.some((entity) => entity.factionId === 'faction_fulfillment' && entity.data.factionPresence.fixedRoute), true);

  bus.emit('factionPresence:fulfillmentBoarding', {
    commodityId: 'cmdty_stolen_goods', quantity: 1, routeId: 'fulfillment_tethys_helios',
  });
  assert.equal(state.player.cargo.items.cmdty_stolen_goods, 2,
    'a synthetic boarding event cannot bypass the real combat-disable and boarding phase chain');
  assert.equal(receipts.some((row) => row.event === 'factionPresence:administrativeRouting'), false,
    'administrative routing is emitted only by the live boarding state machine');

  bus.emit('dock:docked', { stationId: 'station_drift' });
  assert.equal(receipts.at(-1).payload.available, false, 'Archive reading room is rep-gated');
  state.factions.faction_archive.rep = 25;
  bus.emit('dock:docked', { stationId: 'station_drift' });
  assert.equal(receipts.at(-1).payload.available, true);
  bus.emit('dock:docked', { stationId: 'station_forge' });
  assert.deepEqual(receipts.at(-1).payload.services, ['yard', 'fence']);

  sys.destroy();
});

test('K1 implementation has no direct credits, cargo, reputation, or nondeterministic writes', () => {
  const systemSource = readFileSync(new URL('../src/systems/factionPresence.js', import.meta.url), 'utf8');
  const registrySource = readFileSync(new URL('../src/core/registry.js', import.meta.url), 'utf8');
  assert.match(systemSource, /removeCargo\s*\(/, 'Fulfillment must call the cargo owner');
  assert.match(systemSource, /lossesFor\s*\(/, 'Understory must read the loss-ledger public seam');
  assert.doesNotMatch(systemSource, /state\.player\.credits\s*(?:\+\+|--|[+\-*/]?=)/);
  assert.doesNotMatch(systemSource, /state\.player\.cargo(?:\.[A-Za-z_$][\w$]*|\[[^\]]+\])?\s*(?:\+\+|--|[+\-*/]?=)/);
  assert.doesNotMatch(systemSource, /state\.factions(?:\.[A-Za-z_$][\w$]*|\[[^\]]+\])[^\n=]*\.rep\s*(?:\+\+|--|[+\-*/]?=)/);
  assert.doesNotMatch(systemSource, /Math\.random|Date\.now|performance\.now/);
  assert.doesNotMatch(systemSource, /entity:killed/, 'Understory must not bypass the loss ledger');
  assert.match(registrySource, /import \{ factionPresence \} from '\.\.\/systems\/factionPresence\.js'/);
  assert.match(registrySource, /\bfactionPresence\b[\s\S]*\bworld\b/, 'presence must initialize before world emits sector entry');
});

test('K1 encounter modules are discoverable through the generated F2 loader', async () => {
  const { ENCOUNTERS } = await import('../src/data/encounters/index.generated.js');
  const ids = [
    'k1_understory_salvager',
    'k1_fulfillment_fixed_route',
    'k1_archive_reading_room',
    'k1_pitborn_yard',
    'k1_verge_observer_prism',
  ];
  for (const id of ids) {
    assert.ok(ENCOUNTERS[id], `${id} registered`);
    assert.equal(ENCOUNTERS[id].gates.externalOnly, true, `${id} is presence-system owned`);
  }
});
