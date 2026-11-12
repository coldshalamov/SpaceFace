import assert from 'node:assert/strict';
import test from 'node:test';

import { COMMODITIES } from '../src/data/commodities.js';
import { ENCOUNTERS } from '../src/data/encounters.js';
import { ENEMY_TYPES } from '../src/data/enemies.js';
import { FACTION_META } from '../src/data/factions.js';
import {
  MISSION_TYPES,
  SET_PIECE_MISSIONS,
  STORY_BEATS,
} from '../src/data/missions.js';
import { MODULES } from '../src/data/modules.js';
import { SECTOR_ZONES } from '../src/data/sectorZones.js';
import { SECTORS } from '../src/data/sectors.js';
import { SHIPS } from '../src/data/ships.js';
import { SITE_MACHINES, SITE_RECIPES } from '../src/data/sites.js';
import { WEAPONS } from '../src/data/weapons.js';
import {
  inventoryDigest,
  locale,
  messages as englishMessages,
  sources as englishSources,
} from '../src/localization/catalogs/en-US.generated.js';

const lexical = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const sorted = (values) => [...values].sort(lexical);

async function loadCensusApi() {
  try {
    return await import('../scripts/lib/contentCensus.mjs');
  } catch (error) {
    assert.fail(`content census API is missing: ${error && (error.code || error.message)}`);
  }
}

function liveExpectedIds() {
  const nested = (field) => SECTORS.flatMap((sector) => (sector[field] || []).map((entry) => entry.id));
  const hazardIds = SECTORS.flatMap((sector) => (sector.hazards || []).map((hazard, index) => (
    hazard.id || `${sector.id}::hazard[${index}]::${hazard.type || 'unnamed'}`
  )));

  return {
    asteroidSiteMachines: SITE_MACHINES.map((entry) => entry.id),
    asteroidSiteRecipes: SITE_RECIPES.map((entry) => entry.id),
    commodities: COMMODITIES.map((entry) => entry.id),
    encounters: Object.values(ENCOUNTERS).map((entry) => entry.id),
    enemyDefinitions: ENEMY_TYPES.map((entry) => entry.id),
    factions: FACTION_META.map((entry) => entry.id),
    hazards: hazardIds,
    localizedEnUsEntries: Object.keys(englishMessages),
    missionTypes: MISSION_TYPES.map((entry) => entry.type),
    modules: MODULES.map((entry) => entry.id),
    pois: nested('pois'),
    sectors: SECTORS.map((entry) => entry.id),
    setPieceMissions: SET_PIECE_MISSIONS.map((entry) => entry.id),
    ships: SHIPS.map((entry) => entry.id),
    stations: nested('stations'),
    storyBeats: STORY_BEATS.map((entry) => entry.id),
    weapons: WEAPONS.map((entry) => entry.id),
    zones: Object.values(SECTOR_ZONES).flat().map((entry) => entry.id),
  };
}

function completeFixture(overrides = {}) {
  return {
    sectors: [{
      id: 'sector_a',
      factionId: 'faction_a',
      neighbors: [],
      stations: [{ id: 'station_a', factionId: 'faction_a' }],
      hazards: [{ type: 'nebula' }],
      pois: [{ id: 'poi_a', factionId: 'faction_a' }],
    }],
    sectorZones: {
      sector_a: [{
        id: 'zone_a',
        factionId: 'faction_a',
        presence: { factionId: 'faction_a', archetypes: ['enemy_a'] },
      }],
    },
    enemyDefinitions: [{
      id: 'enemy_a',
      shipId: 'ship_a',
      factionId: 'faction_a',
      weapons: [{ id: 'wpn_a' }],
      loot: { drops: [{ id: 'cmdty_a' }] },
    }],
    encounters: {
      encounter_a: {
        id: 'encounter_a',
        factionId: 'faction_a',
        squad: { archetypes: ['enemy_a'] },
      },
    },
    missionTypes: [{ type: 'mission_a' }],
    setPieceMissions: [{
      id: 'set_piece_a',
      startStationId: 'station_a',
      commonStages: [{
        id: 'stage_a',
        type: 'mission_a',
        boardStationId: 'station_a',
        destSectorId: 'sector_a',
        factionId: 'faction_a',
        params: { cmdtyId: 'cmdty_a' },
      }],
      branches: [],
    }],
    storyBeats: [{ id: 'beat_a', reward: { unlock: 'module_a' } }],
    ships: [{ id: 'ship_a' }],
    modules: [{ id: 'module_a' }],
    weapons: [{ id: 'wpn_a' }],
    factions: [{
      id: 'faction_a',
      homeSectors: ['sector_a'],
      relations: {},
    }],
    commodities: [{ id: 'cmdty_a' }],
    asteroidSiteMachines: [{ id: 'machine_a', cost: { cmdty_a: 1 } }],
    asteroidSiteRecipes: [{
      id: 'recipe_a',
      machine: 'machine_a',
      inputs: { cmdty_a: 1 },
      output: { cmdty_a: 1 },
    }],
    localization: {
      locale: 'en-US',
      inventoryDigest: 'fixture-digest',
      messages: { 'loc.a': 'Alpha' },
      sources: { 'loc.a': 'fixture.js:1 field:label' },
    },
    ...overrides,
  };
}

test('buildContentCensus derives all required category IDs and counts from the live registries', async () => {
  const { buildContentCensus } = await loadCensusApi();
  const census = buildContentCensus();
  const expected = liveExpectedIds();

  assert.equal(census.schema, 'spaceface.content-census');
  assert.equal(census.schemaVersion, 1);
  assert.equal(census.source.locale, locale);
  assert.equal(census.source.localizationInventoryDigest, inventoryDigest);
  assert.deepEqual(Object.keys(census.categories), sorted(Object.keys(expected)));

  for (const [category, ids] of Object.entries(expected)) {
    assert.deepEqual(census.categories[category].ids, sorted(ids), category);
    assert.equal(census.categories[category].count, ids.length, category);
  }

  const expectedTotal = Object.values(expected).reduce((sum, ids) => sum + ids.length, 0);
  assert.equal(census.summary.totalEntries, expectedTotal);
  assert.deepEqual(JSON.parse(JSON.stringify(census)), census);
});

test('census evidence separates declaration, import, and runtime reachability from unmeasured claims', async () => {
  const { buildContentCensus } = await loadCensusApi();
  const census = buildContentCensus();

  for (const [name, category] of Object.entries(census.categories)) {
    assert.equal(category.evidence.declared.status, 'verified', `${name}.declared`);
    assert.ok(category.evidence.declared.sources.length > 0, `${name}.declared sources`);
    for (const level of ['imported', 'runtimeReachable']) {
      assert.equal(category.evidence[level].status, 'maintained-reference', `${name}.${level}`);
      assert.ok(category.evidence[level].sources.length > 0, `${name}.${level} sources`);
    }
    for (const level of ['fixture', 'naturalEncounter', 'visualAcceptance']) {
      assert.equal(category.evidence[level].status, 'not-assessed', `${name}.${level}`);
      assert.deepEqual(category.evidence[level].sources, [], `${name}.${level} sources`);
    }
  }

  for (const claim of ['naturalEncounter', 'visualAcceptance']) {
    assert.equal(census.claims[claim].status, 'not-assessed');
    assert.deepEqual(census.claims[claim].sources, []);
    assert.match(census.claims[claim].reason, /not prove/i);
  }

  assert.equal(census.categories.hazards.identity, 'authored-id-or-owner-index');
  assert.ok(census.categories.hazards.ids.every((id) => typeof id === 'string' && id.length > 0));
  assert.deepEqual(
    census.categories.storyBeats.evidence.imported.sources,
    ['src/systems/missions.js'],
  );
  assert.deepEqual(
    census.categories.localizedEnUsEntries.evidence.runtimeReachable.sources,
    [
      'src/main.js',
      'src/core/registry.js',
      'src/ui/uiRoot.js',
      'src/ui/hud.js',
      'src/ui/localizedCoreCopy.js',
      'src/localization/gameLocalization.js',
    ],
  );
  assert.deepEqual(
    census.categories.zones.evidence.runtimeReachable.sources,
    ['src/main.js', 'src/core/registry.js', 'src/systems/world.js'],
  );
});

test('census ordering is stable for unordered registry input', async () => {
  const { buildContentCensus } = await loadCensusApi();
  const first = completeFixture({
    ships: [{ id: 'ship_z' }, { id: 'ship_a' }],
    localization: {
      locale: 'en-US',
      inventoryDigest: 'fixture-digest',
      messages: { 'loc.z': 'Zulu', 'loc.a': 'Alpha' },
      sources: { 'loc.z': 'fixture.js:2 field:label', 'loc.a': 'fixture.js:1 field:label' },
    },
  });
  const second = completeFixture({
    ships: [...first.ships].reverse(),
    localization: {
      ...first.localization,
      messages: { 'loc.a': 'Alpha', 'loc.z': 'Zulu' },
      sources: { 'loc.a': 'fixture.js:1 field:label', 'loc.z': 'fixture.js:2 field:label' },
    },
  });

  const firstCensus = buildContentCensus(first);
  const secondCensus = buildContentCensus(second);
  assert.deepEqual(firstCensus, secondCensus);
  assert.equal(firstCensus.source.kind, 'supplied-registries');
  for (const evidence of Object.values(firstCensus.categories.ships.evidence)) {
    assert.equal(evidence.status, 'not-assessed');
    assert.deepEqual(evidence.sources, []);
  }
  assert.notStrictEqual(
    firstCensus.categories.ships.evidence.declared.sources,
    secondCensus.categories.ships.evidence.declared.sources,
  );
  assert.deepEqual(firstCensus.categories.ships.ids, ['ship_a', 'ship_z']);
  assert.deepEqual(firstCensus.categories.localizedEnUsEntries.ids, ['loc.a', 'loc.z']);
});

test('reference diagnostics distinguish weapon loot and process tokens from commodities', async () => {
  const { buildContentCensus } = await loadCensusApi();
  const census = buildContentCensus(completeFixture({
    enemyDefinitions: [{
      id: 'enemy_a',
      shipId: 'ship_a',
      factionId: 'faction_a',
      weapons: [{ id: 'wpn_a' }],
      loot: { drops: [{ id: 'wpn_a' }, { id: 'cmdty_a' }] },
    }],
    asteroidSiteRecipes: [{
      id: 'recipe_a',
      machine: 'machine_a',
      inputs: { cmdty_a: 1 },
      output: { pod: 1 },
    }],
  }));

  assert.deepEqual(census.diagnostics.danglingReferences, []);
  assert.equal(census.diagnostics.ok, true);
});

test('census reports duplicate IDs, missing IDs, and dangling references with stable source paths', async () => {
  const { buildContentCensus } = await loadCensusApi();
  const fixture = completeFixture({
    sectors: [
      {
        id: 'sector_a',
        factionId: 'faction_missing',
        neighbors: ['sector_missing'],
        stations: [{ id: 'station_a', factionId: 'faction_a' }],
        hazards: [],
        pois: [],
      },
      { id: 'sector_a', stations: [], hazards: [], pois: [] },
    ],
    encounters: {
      encounter_key: {
        id: 'encounter_other',
        factionId: 'faction_a',
        squad: { archetypes: ['enemy_a'] },
      },
      encounter_missing: {
        factionId: 'faction_a',
        squad: { archetypes: ['enemy_a'] },
      },
    },
    sectorZones: {
      sector_missing: [{
        id: 'zone_a',
        presence: { archetypes: ['enemy_missing'] },
      }],
    },
    ships: [{ id: 'ship_a' }, {}],
    asteroidSiteRecipes: [{
      id: 'recipe_a',
      machine: 'machine_missing',
      inputs: { cmdty_missing: 1 },
      output: { cmdty_a: 1 },
    }],
    localization: {
      locale: 'en-US',
      inventoryDigest: 'fixture-digest',
      messages: { 'loc.a': 'Alpha', 'loc.missing-source': 'No source' },
      sources: { 'loc.a': 'fixture.js:1 field:label', 'loc.orphan': 'fixture.js:2 field:label' },
    },
  });

  const census = buildContentCensus(fixture);

  assert.ok(census.diagnostics.duplicateIds.some((issue) => (
    issue.category === 'sectors'
    && issue.id === 'sector_a'
    && issue.locations.length === 2
  )));
  assert.ok(census.diagnostics.missingIds.some((issue) => (
    issue.category === 'ships' && issue.location === 'ships[1]'
  )));
  assert.ok(census.diagnostics.missingIds.some((issue) => (
    issue.category === 'encounters'
    && issue.location === 'encounters["encounter_missing"]'
  )));
  assert.ok(census.diagnostics.identityMismatches.some((issue) => (
    issue.category === 'encounters'
    && issue.registryKey === 'encounter_key'
    && issue.id === 'encounter_other'
  )));

  const expectedDangling = [
    ['sectors', 'sector_a', 'factionId', 'factions', 'faction_missing'],
    ['sectors', 'sector_a', 'neighbors[0]', 'sectors', 'sector_missing'],
    ['zones', 'zone_a', 'ownerSectorId', 'sectors', 'sector_missing'],
    ['zones', 'zone_a', 'presence.archetypes[0]', 'enemyDefinitions', 'enemy_missing'],
    ['asteroidSiteRecipes', 'recipe_a', 'machine', 'asteroidSiteMachines', 'machine_missing'],
    ['asteroidSiteRecipes', 'recipe_a', 'inputs.cmdty_missing', 'commodities', 'cmdty_missing'],
    ['localizedEnUsEntries', 'loc.missing-source', 'source', 'localizedEnUsSources', 'loc.missing-source'],
    ['localizedEnUsSources', 'loc.orphan', 'message', 'localizedEnUsEntries', 'loc.orphan'],
  ];

  for (const [sourceCategory, sourceId, path, targetCategory, targetId] of expectedDangling) {
    assert.ok(census.diagnostics.danglingReferences.some((issue) => (
      issue.sourceCategory === sourceCategory
      && issue.sourceId === sourceId
      && issue.path === path
      && issue.targetCategory === targetCategory
      && issue.targetId === targetId
    )), `${sourceCategory}.${sourceId}.${path} -> ${targetCategory}.${targetId}`);
  }

  assert.equal(census.diagnostics.ok, false);
  assert.equal(
    census.summary.issueCount,
    census.diagnostics.duplicateIds.length
      + census.diagnostics.missingIds.length
      + census.diagnostics.identityMismatches.length
      + census.diagnostics.danglingReferences.length,
  );
  assert.deepEqual(
    census.diagnostics.danglingReferences,
    [...census.diagnostics.danglingReferences].sort((a, b) => lexical(JSON.stringify(a), JSON.stringify(b))),
  );
});
