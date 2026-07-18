import { COMMODITIES } from '../../src/data/commodities.js';
import { ENCOUNTERS } from '../../src/data/encounters.js';
import { ENEMY_TYPES } from '../../src/data/enemies.js';
import { FACTION_META } from '../../src/data/factions.js';
import {
  MISSION_TYPES,
  SET_PIECE_MISSIONS,
  STORY_BEATS,
} from '../../src/data/missions.js';
import { MODULES } from '../../src/data/modules.js';
import { SECTOR_ZONES } from '../../src/data/sectorZones.js';
import { SECTORS } from '../../src/data/sectors.js';
import { SHIPS } from '../../src/data/ships.js';
import { SITE_MACHINES, SITE_RECIPES } from '../../src/data/sites.js';
import { WEAPONS } from '../../src/data/weapons.js';
import {
  inventoryDigest,
  locale,
  messages as englishMessages,
  sources as englishSources,
} from '../../src/localization/catalogs/en-US.generated.js';

export const CONTENT_CENSUS_SCHEMA = 'spaceface.content-census';
export const CONTENT_CENSUS_SCHEMA_VERSION = 1;

const LIVE_REGISTRIES = Object.freeze({
  sectors: SECTORS,
  sectorZones: SECTOR_ZONES,
  enemyDefinitions: ENEMY_TYPES,
  encounters: ENCOUNTERS,
  missionTypes: MISSION_TYPES,
  setPieceMissions: SET_PIECE_MISSIONS,
  storyBeats: STORY_BEATS,
  ships: SHIPS,
  modules: MODULES,
  weapons: WEAPONS,
  factions: FACTION_META,
  commodities: COMMODITIES,
  asteroidSiteMachines: SITE_MACHINES,
  asteroidSiteRecipes: SITE_RECIPES,
  localization: Object.freeze({
    locale,
    inventoryDigest,
    messages: englishMessages,
    sources: englishSources,
  }),
});

const lexical = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const sorted = (values) => [...values].sort(lexical);
const asArray = (value) => (Array.isArray(value) ? value : []);
const asObject = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {});
const validId = (value) => (typeof value === 'string' && value.length > 0 ? value : null);

const DEFAULT_ROUTE_PREFIX = Object.freeze([
  'src/main.js',
  'src/core/registry.js',
]);

function notAssessedEvidence(reason) {
  return {
    status: 'not-assessed',
    method: 'not-measured',
    sources: [],
    reason,
  };
}

function verifiedEvidence(declaredSources, importedSources, runtimeReachableSources) {
  return {
    declared: {
      status: 'verified',
      method: 'live-registry-import',
      sources: sorted(declaredSources),
    },
    imported: {
      status: 'maintained-reference',
      method: 'maintained-source-chain',
      sources: sorted(importedSources),
    },
    runtimeReachable: {
      status: 'maintained-reference',
      method: 'maintained-source-chain',
      sources: [...new Set(runtimeReachableSources)],
    },
    fixture: notAssessedEvidence('Registry reachability does not prove a restorable deep-state fixture.'),
    naturalEncounter: notAssessedEvidence('Registry reachability does not prove natural player-route occurrence.'),
    visualAcceptance: notAssessedEvidence('Registry reachability does not prove player-visible visual acceptance.'),
  };
}

const EVIDENCE_BY_CATEGORY = Object.freeze({
  asteroidSiteMachines: verifiedEvidence(
    ['src/data/sites.js'],
    ['src/systems/asteroidSites.js'],
    [...DEFAULT_ROUTE_PREFIX, 'src/systems/asteroidSites.js'],
  ),
  asteroidSiteRecipes: verifiedEvidence(
    ['src/data/sites.js'],
    ['src/systems/asteroidSites.js', 'src/systems/siteProduction.js'],
    [...DEFAULT_ROUTE_PREFIX, 'src/systems/asteroidSites.js'],
  ),
  commodities: verifiedEvidence(
    ['src/data/commodities.js'],
    ['src/systems/economy.js'],
    [...DEFAULT_ROUTE_PREFIX, 'src/systems/economy.js'],
  ),
  encounters: verifiedEvidence(
    ['src/data/encounters.js', 'src/data/encounters/index.generated.js'],
    ['src/systems/encounterDirector.js'],
    [...DEFAULT_ROUTE_PREFIX, 'src/systems/encounterDirector.js'],
  ),
  enemyDefinitions: verifiedEvidence(
    ['src/data/enemies.js'],
    ['src/systems/encounterDirector.js'],
    [...DEFAULT_ROUTE_PREFIX, 'src/systems/encounterDirector.js'],
  ),
  factions: verifiedEvidence(
    ['src/data/factions.js', 'src/data/factions/index.js'],
    ['src/systems/factions.js'],
    [...DEFAULT_ROUTE_PREFIX, 'src/systems/factions.js'],
  ),
  hazards: verifiedEvidence(
    ['src/data/sectors.js'],
    ['src/systems/world.js'],
    [...DEFAULT_ROUTE_PREFIX, 'src/systems/world.js'],
  ),
  localizedEnUsEntries: verifiedEvidence(
    ['src/localization/catalogs/en-US.generated.js'],
    ['src/localization/gameLocalization.js'],
    [
      ...DEFAULT_ROUTE_PREFIX,
      'src/ui/uiRoot.js',
      'src/ui/hud.js',
      'src/ui/localizedCoreCopy.js',
      'src/localization/gameLocalization.js',
    ],
  ),
  missionTypes: verifiedEvidence(
    ['src/data/missions.js'],
    ['src/systems/missions.js'],
    [...DEFAULT_ROUTE_PREFIX, 'src/systems/missions.js'],
  ),
  modules: verifiedEvidence(
    ['src/data/modules.js'],
    ['src/systems/ships.js'],
    [...DEFAULT_ROUTE_PREFIX, 'src/systems/ships.js'],
  ),
  pois: verifiedEvidence(
    ['src/data/sectors.js'],
    ['src/systems/world.js'],
    [...DEFAULT_ROUTE_PREFIX, 'src/systems/world.js'],
  ),
  sectors: verifiedEvidence(
    ['src/data/sectors.js'],
    ['src/systems/world.js'],
    [...DEFAULT_ROUTE_PREFIX, 'src/systems/world.js'],
  ),
  setPieceMissions: verifiedEvidence(
    ['src/data/missions.js'],
    ['src/systems/missions.js', 'src/systems/setPieceMissionOffers.js'],
    [...DEFAULT_ROUTE_PREFIX, 'src/systems/missions.js'],
  ),
  ships: verifiedEvidence(
    ['src/data/ships.js'],
    ['src/systems/ships.js'],
    [...DEFAULT_ROUTE_PREFIX, 'src/systems/ships.js'],
  ),
  stations: verifiedEvidence(
    ['src/data/sectors.js'],
    ['src/systems/world.js'],
    [...DEFAULT_ROUTE_PREFIX, 'src/systems/world.js'],
  ),
  storyBeats: verifiedEvidence(
    ['src/data/missions.js'],
    ['src/systems/missions.js'],
    [...DEFAULT_ROUTE_PREFIX, 'src/systems/missions.js'],
  ),
  weapons: verifiedEvidence(
    ['src/data/weapons.js'],
    ['src/systems/weapons.js'],
    [...DEFAULT_ROUTE_PREFIX, 'src/systems/weapons.js'],
  ),
  zones: verifiedEvidence(
    ['src/data/sectorZones.js'],
    ['src/systems/world.js', 'src/systems/encounterDirector.js'],
    [...DEFAULT_ROUTE_PREFIX, 'src/systems/world.js'],
  ),
});

const IDENTITY_BY_CATEGORY = Object.freeze({
  asteroidSiteMachines: 'authored-id',
  asteroidSiteRecipes: 'authored-id',
  commodities: 'authored-id',
  encounters: 'authored-id',
  enemyDefinitions: 'authored-id',
  factions: 'authored-id',
  hazards: 'authored-id-or-owner-index',
  localizedEnUsEntries: 'catalog-key',
  missionTypes: 'authored-type',
  modules: 'authored-id',
  pois: 'authored-id',
  sectors: 'authored-id',
  setPieceMissions: 'authored-id',
  ships: 'authored-id',
  stations: 'authored-id',
  storyBeats: 'authored-id',
  weapons: 'authored-id',
  zones: 'authored-id',
});

function record(category, id, location, value, context = {}, authoredId = true) {
  return {
    category,
    id: validId(id),
    location,
    value,
    context,
    authoredId,
  };
}

function arrayRecords(category, entries, idField = 'id') {
  return asArray(entries).map((entry, index) => record(
    category,
    entry && entry[idField],
    `${category}[${index}]`,
    entry,
  ));
}

function nestedSectorRecords(sectors, category, field) {
  const out = [];
  asArray(sectors).forEach((sector, sectorIndex) => {
    asArray(sector && sector[field]).forEach((entry, entryIndex) => {
      out.push(record(
        category,
        entry && entry.id,
        `sectors[${sectorIndex}].${field}[${entryIndex}]`,
        entry,
        { ownerSectorId: validId(sector && sector.id) },
      ));
    });
  });
  return out;
}

function hazardRecords(sectors) {
  const out = [];
  asArray(sectors).forEach((sector, sectorIndex) => {
    asArray(sector && sector.hazards).forEach((hazard, hazardIndex) => {
      const authored = validId(hazard && hazard.id);
      const owner = validId(sector && sector.id) || `<missing-sector-${sectorIndex}>`;
      const type = validId(hazard && hazard.type) || 'unnamed';
      const derived = `${owner}::hazard[${hazardIndex}]::${type}`;
      out.push(record(
        'hazards',
        authored || derived,
        `sectors[${sectorIndex}].hazards[${hazardIndex}]`,
        hazard,
        { ownerSectorId: validId(sector && sector.id) },
        Boolean(authored),
      ));
    });
  });
  return out;
}

function zoneRecords(sectorZones) {
  const out = [];
  for (const [ownerSectorId, zones] of Object.entries(asObject(sectorZones))) {
    asArray(zones).forEach((zone, zoneIndex) => {
      out.push(record(
        'zones',
        zone && zone.id,
        `sectorZones[${JSON.stringify(ownerSectorId)}][${zoneIndex}]`,
        zone,
        { ownerSectorId },
      ));
    });
  }
  return out;
}

function encounterRecords(encounters) {
  if (Array.isArray(encounters)) return arrayRecords('encounters', encounters);
  return Object.entries(asObject(encounters)).map(([registryKey, entry]) => record(
    'encounters',
    entry && entry.id,
    `encounters[${JSON.stringify(registryKey)}]`,
    entry,
    { registryKey },
    Boolean(validId(entry && entry.id)),
  ));
}

function localizationRecords(localization) {
  return Object.entries(asObject(localization && localization.messages)).map(([key, message]) => record(
    'localizedEnUsEntries',
    key,
    `localization.messages[${JSON.stringify(key)}]`,
    message,
    {},
    false,
  ));
}

function collectRecords(registries) {
  const sectors = asArray(registries.sectors);
  return {
    asteroidSiteMachines: arrayRecords('asteroidSiteMachines', registries.asteroidSiteMachines),
    asteroidSiteRecipes: arrayRecords('asteroidSiteRecipes', registries.asteroidSiteRecipes),
    commodities: arrayRecords('commodities', registries.commodities),
    encounters: encounterRecords(registries.encounters),
    enemyDefinitions: arrayRecords('enemyDefinitions', registries.enemyDefinitions),
    factions: arrayRecords('factions', registries.factions),
    hazards: hazardRecords(sectors),
    localizedEnUsEntries: localizationRecords(registries.localization),
    missionTypes: arrayRecords('missionTypes', registries.missionTypes, 'type'),
    modules: arrayRecords('modules', registries.modules),
    pois: nestedSectorRecords(sectors, 'pois', 'pois'),
    sectors: arrayRecords('sectors', sectors),
    setPieceMissions: arrayRecords('setPieceMissions', registries.setPieceMissions),
    ships: arrayRecords('ships', registries.ships),
    stations: nestedSectorRecords(sectors, 'stations', 'stations'),
    storyBeats: arrayRecords('storyBeats', registries.storyBeats),
    weapons: arrayRecords('weapons', registries.weapons),
    zones: zoneRecords(registries.sectorZones),
  };
}

function duplicateAndMissingDiagnostics(recordsByCategory) {
  const duplicateIds = [];
  const missingIds = [];
  const identityMismatches = [];

  for (const category of sorted(Object.keys(recordsByCategory))) {
    const locationsById = new Map();
    for (const entry of recordsByCategory[category]) {
      if (!entry.id) {
        missingIds.push({
          category,
          location: entry.location,
          identity: IDENTITY_BY_CATEGORY[category],
        });
        continue;
      }
      if (category === 'encounters'
        && entry.context.registryKey
        && entry.context.registryKey !== entry.id) {
        identityMismatches.push({
          category,
          location: entry.location,
          registryKey: entry.context.registryKey,
          id: entry.id,
        });
      }
      const locations = locationsById.get(entry.id) || [];
      locations.push(entry.location);
      locationsById.set(entry.id, locations);
    }
    for (const [id, locations] of locationsById) {
      if (locations.length > 1) {
        duplicateIds.push({ category, id, locations: sorted(locations) });
      }
    }
  }

  return {
    duplicateIds: sortIssues(duplicateIds),
    missingIds: sortIssues(missingIds),
    identityMismatches: sortIssues(identityMismatches),
  };
}

function sortIssues(issues) {
  return [...issues].sort((a, b) => lexical(JSON.stringify(a), JSON.stringify(b)));
}

function stageEntries(setPiece) {
  const entries = [];
  asArray(setPiece && setPiece.commonStages).forEach((stage, index) => {
    entries.push({ stage, path: `commonStages[${index}]` });
  });
  asArray(setPiece && setPiece.branches).forEach((branch, branchIndex) => {
    asArray(branch && branch.stages).forEach((stage, stageIndex) => {
      entries.push({ stage, path: `branches[${branchIndex}].stages[${stageIndex}]` });
    });
  });
  return entries;
}

function danglingReferenceDiagnostics(recordsByCategory, registries) {
  const idsByCategory = Object.fromEntries(Object.entries(recordsByCategory).map(([category, entries]) => [
    category,
    new Set(entries.map((entry) => entry.id).filter(Boolean)),
  ]));
  const dangling = [];

  function check(sourceCategory, sourceId, path, targetCategory, targetId) {
    const normalized = validId(targetId);
    if (!normalized) return;
    const targets = idsByCategory[targetCategory];
    if (!targets || targets.has(normalized)) return;
    dangling.push({ sourceCategory, sourceId, path, targetCategory, targetId: normalized });
  }

  function contentCategoryForId(targetId) {
    const normalized = validId(targetId);
    if (!normalized) return null;
    const candidates = [
      ['commodities', 'cmdty_'],
      ['weapons', 'wpn_'],
      ['modules', 'mod_'],
      ['ships', 'ship_'],
    ];
    for (const [category] of candidates) {
      if (idsByCategory[category].has(normalized)) return category;
    }
    const prefixed = candidates.find(([, prefix]) => normalized.startsWith(prefix));
    return prefixed ? prefixed[0] : null;
  }

  function checkCommodityKey(sourceCategory, sourceId, path, targetId) {
    const normalized = validId(targetId);
    if (!normalized) return;
    if (idsByCategory.commodities.has(normalized) || normalized.startsWith('cmdty_')) {
      check(sourceCategory, sourceId, path, 'commodities', normalized);
    }
  }

  for (const entry of recordsByCategory.sectors) {
    const sector = asObject(entry.value);
    check('sectors', entry.id || entry.location, 'factionId', 'factions', sector.factionId);
    asArray(sector.neighbors).forEach((id, index) => check(
      'sectors', entry.id || entry.location, `neighbors[${index}]`, 'sectors', id,
    ));
    asArray(sector.gates).forEach((gate, index) => check(
      'sectors', entry.id || entry.location, `gates[${index}].to`, 'sectors', gate && gate.to,
    ));
  }

  for (const category of ['stations', 'pois']) {
    for (const entry of recordsByCategory[category]) {
      check(category, entry.id || entry.location, 'factionId', 'factions', entry.value && entry.value.factionId);
    }
  }

  for (const entry of recordsByCategory.zones) {
    const zone = asObject(entry.value);
    check('zones', entry.id || entry.location, 'ownerSectorId', 'sectors', entry.context.ownerSectorId);
    check('zones', entry.id || entry.location, 'factionId', 'factions', zone.factionId);
    check('zones', entry.id || entry.location, 'presence.factionId', 'factions', zone.presence && zone.presence.factionId);
    asArray(zone.presence && zone.presence.archetypes).forEach((id, index) => check(
      'zones', entry.id || entry.location, `presence.archetypes[${index}]`, 'enemyDefinitions', id,
    ));
  }

  for (const entry of recordsByCategory.enemyDefinitions) {
    const enemy = asObject(entry.value);
    check('enemyDefinitions', entry.id || entry.location, 'shipId', 'ships', enemy.shipId);
    check('enemyDefinitions', entry.id || entry.location, 'factionId', 'factions', enemy.factionId);
    asArray(enemy.weapons).forEach((weapon, index) => check(
      'enemyDefinitions', entry.id || entry.location, `weapons[${index}].id`, 'weapons', weapon && weapon.id,
    ));
    asArray(enemy.loot && enemy.loot.drops).forEach((drop, index) => {
      const targetId = drop && drop.id;
      const targetCategory = contentCategoryForId(targetId);
      if (targetCategory) {
        check(
          'enemyDefinitions',
          entry.id || entry.location,
          `loot.drops[${index}].id`,
          targetCategory,
          targetId,
        );
      }
    });
  }

  for (const entry of recordsByCategory.encounters) {
    const encounter = asObject(entry.value);
    check('encounters', entry.id || entry.location, 'factionId', 'factions', encounter.factionId);
    asArray(encounter.squad && encounter.squad.archetypes).forEach((id, index) => check(
      'encounters', entry.id || entry.location, `squad.archetypes[${index}]`, 'enemyDefinitions', id,
    ));
    asArray(encounter.sectorIds).forEach((id, index) => check(
      'encounters', entry.id || entry.location, `sectorIds[${index}]`, 'sectors', id,
    ));
  }

  for (const entry of recordsByCategory.setPieceMissions) {
    const setPiece = asObject(entry.value);
    check('setPieceMissions', entry.id || entry.location, 'startStationId', 'stations', setPiece.startStationId);
    for (const { stage, path } of stageEntries(setPiece)) {
      const value = asObject(stage);
      check('setPieceMissions', entry.id || entry.location, `${path}.type`, 'missionTypes', value.type);
      check('setPieceMissions', entry.id || entry.location, `${path}.boardStationId`, 'stations', value.boardStationId);
      check('setPieceMissions', entry.id || entry.location, `${path}.destStationId`, 'stations', value.destStationId);
      check('setPieceMissions', entry.id || entry.location, `${path}.destSectorId`, 'sectors', value.destSectorId);
      check('setPieceMissions', entry.id || entry.location, `${path}.factionId`, 'factions', value.factionId);
      check('setPieceMissions', entry.id || entry.location, `${path}.params.cmdtyId`, 'commodities', value.params && value.params.cmdtyId);
    }
  }

  for (const entry of recordsByCategory.storyBeats) {
    const unlock = entry.value && entry.value.reward && entry.value.reward.unlock;
    if (typeof unlock === 'string' && unlock.startsWith('mod_')) {
      check('storyBeats', entry.id || entry.location, 'reward.unlock', 'modules', unlock);
    } else if (typeof unlock === 'string' && unlock.startsWith('wpn_')) {
      check('storyBeats', entry.id || entry.location, 'reward.unlock', 'weapons', unlock);
    }
  }

  for (const entry of recordsByCategory.factions) {
    const faction = asObject(entry.value);
    asArray(faction.homeSectors).forEach((id, index) => check(
      'factions', entry.id || entry.location, `homeSectors[${index}]`, 'sectors', id,
    ));
    Object.keys(asObject(faction.relations)).forEach((id) => check(
      'factions', entry.id || entry.location, `relations.${id}`, 'factions', id,
    ));
  }

  for (const entry of recordsByCategory.asteroidSiteMachines) {
    Object.keys(asObject(entry.value && entry.value.cost)).forEach((id) => checkCommodityKey(
      'asteroidSiteMachines', entry.id || entry.location, `cost.${id}`, id,
    ));
  }

  for (const entry of recordsByCategory.asteroidSiteRecipes) {
    const recipe = asObject(entry.value);
    check('asteroidSiteRecipes', entry.id || entry.location, 'machine', 'asteroidSiteMachines', recipe.machine);
    for (const field of ['inputs', 'output']) {
      Object.keys(asObject(recipe[field])).forEach((id) => checkCommodityKey(
        'asteroidSiteRecipes', entry.id || entry.location, `${field}.${id}`, id,
      ));
    }
  }

  const localization = asObject(registries.localization);
  const messageKeys = new Set(Object.keys(asObject(localization.messages)));
  const sourceKeys = new Set(Object.keys(asObject(localization.sources)));
  for (const key of messageKeys) {
    if (!sourceKeys.has(key)) {
      dangling.push({
        sourceCategory: 'localizedEnUsEntries',
        sourceId: key,
        path: 'source',
        targetCategory: 'localizedEnUsSources',
        targetId: key,
      });
    }
  }
  for (const key of sourceKeys) {
    if (!messageKeys.has(key)) {
      dangling.push({
        sourceCategory: 'localizedEnUsSources',
        sourceId: key,
        path: 'message',
        targetCategory: 'localizedEnUsEntries',
        targetId: key,
      });
    }
  }

  return sortIssues(dangling);
}

function publicCategories(recordsByCategory, liveEvidence) {
  return Object.fromEntries(sorted(Object.keys(recordsByCategory)).map((category) => {
    const entries = recordsByCategory[category];
    const evidence = liveEvidence
      ? Object.fromEntries(
        Object.entries(EVIDENCE_BY_CATEGORY[category]).map(([level, value]) => [
          level,
          { ...value, sources: [...value.sources] },
        ]),
      )
      : Object.fromEntries([
        'declared',
        'imported',
        'runtimeReachable',
        'fixture',
        'naturalEncounter',
        'visualAcceptance',
      ].map((level) => [level, {
        status: 'not-assessed',
        method: 'supplied-registry-input',
        sources: [],
        reason: 'Supplied registries do not carry maintained repository source evidence.',
      }]));
    return [category, {
      count: entries.length,
      ids: sorted(entries.map((entry) => entry.id).filter(Boolean)),
      identity: IDENTITY_BY_CATEGORY[category],
      authoredIdCount: entries.filter((entry) => entry.authoredId).length,
      evidence,
    }];
  }));
}

/**
 * Build a deterministic, JSON-serializable census from the registries imported
 * by the current game. Passing a complete registry object supports focused
 * validation without changing the production source bindings.
 */
export function buildContentCensus(registries = LIVE_REGISTRIES) {
  const liveEvidence = registries === LIVE_REGISTRIES;
  const recordsByCategory = collectRecords(registries);
  const categories = publicCategories(recordsByCategory, liveEvidence);
  const { duplicateIds, missingIds, identityMismatches } = duplicateAndMissingDiagnostics(recordsByCategory);
  const danglingReferences = danglingReferenceDiagnostics(recordsByCategory, registries);
  const issueCount = duplicateIds.length + missingIds.length
    + identityMismatches.length + danglingReferences.length;

  return {
    schema: CONTENT_CENSUS_SCHEMA,
    schemaVersion: CONTENT_CENSUS_SCHEMA_VERSION,
    source: {
      kind: liveEvidence ? 'live-imported-registries' : 'supplied-registries',
      locale: validId(registries.localization && registries.localization.locale) || 'unknown',
      localizationInventoryDigest: validId(
        registries.localization && registries.localization.inventoryDigest,
      ) || null,
    },
    claims: {
      naturalEncounter: {
        status: 'not-assessed',
        sources: [],
        reason: 'Declared, imported, and runtime-reachable registry evidence does not prove natural encounter occurrence.',
      },
      visualAcceptance: {
        status: 'not-assessed',
        sources: [],
        reason: 'Declared, imported, and runtime-reachable registry evidence does not prove player-visible visual acceptance.',
      },
    },
    categories,
    diagnostics: {
      ok: issueCount === 0,
      duplicateIds,
      missingIds,
      identityMismatches,
      danglingReferences,
      coverage: [
        'category-local duplicate and missing identities',
        'sector graph, owner, faction, zone, enemy, loadout, and loot references',
        'set-piece mission route/type/content references',
        'faction home/relationship references',
        'asteroid-site machine/recipe commodity references',
        'en-US message/source parity',
      ],
    },
    summary: {
      categoryCount: Object.keys(categories).length,
      totalEntries: Object.values(categories).reduce((sum, category) => sum + category.count, 0),
      issueCount,
    },
  };
}
