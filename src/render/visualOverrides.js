// Bespoke visual overrides for hero assets plus the authored-asset boundary.
//
// The existing visualFactory remains the procedural fallback for the complete ship catalog in
// development. Release mode is stricter: the player Kestrel hero must build, because a procedural
// fallback would hide a broken authored-asset path from CI and packaged startup.
import { buildKestrelHero } from './ships/kestrelHero.js';
import { buildConcordPatrol } from './ships/concordPatrol.js';
import { buildReaverPirate } from './ships/reaverPirate.js';
import { buildMeridianTrader } from './ships/meridianTrader.js';
import { buildDriftBarge } from './ships/driftBarge.js';
import { buildQuietRaider } from './ships/quietRaider.js';
import { buildVaelSniper } from './ships/vaelSniper.js';
import { build47aScenarioProp } from './scenarioProps47a.js';
import { wrapShipWithAuthoredParts } from './partsLibrary.js';
import { isReleaseAssetMode } from './releaseMode.js';

const KESTREL_HERO_ASSET_ID = 'SF_K0_KESTREL_BORROWED_TIME';

function isPlayerKestrel(entity) {
  return !!entity && entity.type === 'ship' && entity.team === 0 && entity.data && entity.data.defId === 'ship_kestrel';
}

export { isReleaseAssetMode };

function releaseAssetError(message, cause) {
  const error = new Error(message);
  if (cause) error.cause = cause;
  return error;
}

function assertReleaseHeroVisual(entity, visual, releaseMode) {
  if (!releaseMode || !isPlayerKestrel(entity)) return;
  if (visual && visual.userData && visual.userData.assetId === KESTREL_HERO_ASSET_ID) return;
  throw releaseAssetError('[visualOverrides] release mode requires Kestrel hero asset; procedural fallback is forbidden');
}

function reportVisualWarning(options, message, error) {
  if (typeof options.onWarning === 'function') {
    options.onWarning(message, error);
    return;
  }
  if (error) console.warn(message, error);
  else console.warn(message);
}

// Faction bespoke ships intercept by enemy type id (data.lootTableId, set in combat.js). Each maps a
// spec §8 faction grammar to its most thematically-appropriate NPC host visible in the first sector.
const FACTION_BUILDERS = {
  patrol_lawman: { build: buildConcordPatrol, label: 'Concord patrol' },     // §8.2 authority
  reaver_pirate: { build: buildReaverPirate, label: 'Reaver pirate' },       // §8.5 pirate
  mule_trader: { build: buildMeridianTrader, label: 'Meridian trader' },     // §8.3 corporate
  bruiser_brawler: { build: buildDriftBarge, label: 'Drift barge' },         // §8.4 blue-collar
  corsair_raider: { build: buildQuietRaider, label: 'Quiet raider' },        // §8.6 smuggler
  lancer_sniper: { build: buildVaelSniper, label: 'Vael sniper' },           // §8.7 non-human
};

const SCENARIO_47A_SHIP_BUILDERS = {
  enemy_reaver_skirmisher: { build: buildReaverPirate, label: '47-A Reaver skirmisher' },
  enemy_reaver_tug: { build: buildReaverPirate, label: '47-A Reaver tug' },
  'asset.slice.meridian_recovery_tug': { build: buildConcordPatrol, label: '47-A Concord recovery tug' },
};

/**
 * Install the hero-asset registry and authored-part boundary on a live visual factory.
 * Mutating the existing factory object is intentional: renderer event closures, rebuild paths,
 * and the dev ship-preview harness all retain a reference to that same object.
 */
export function installVisualOverrides(factory, options = {}) {
  if (!factory || typeof factory.build !== 'function' || factory.__spacefaceOverridesInstalled) return factory;

  const fallbackBuild = factory.build.bind(factory);
  const releaseMode = isReleaseAssetMode(options);
  const kestrelBuilder = typeof options.kestrelBuilder === 'function' ? options.kestrelBuilder : buildKestrelHero;
  factory.build = (entity) => {
    let visual = null;
    const scenarioProp = build47aScenarioProp(entity);
    if (scenarioProp) {
      visual = scenarioProp;
    } else if (isPlayerKestrel(entity)) {
      try { visual = kestrelBuilder(entity); }
      catch (error) {
        if (releaseMode) {
          throw releaseAssetError('[visualOverrides] release mode requires Kestrel hero asset; hero build failed', error);
        }
        reportVisualWarning(options, '[visualOverrides] Kestrel hero build failed; using procedural fallback', error);
      }
      assertReleaseHeroVisual(entity, visual, releaseMode);
    } else if (entity && entity.type === 'ship' && entity.data) {
      // Faction bespoke ships (spec §8.2–§8.7, Phase 3 §20). Each is failure-isolated: any throw in
      // the bespoke builder falls back to the procedural factory, so a broken hero never blanks an NPC.
      const entry = SCENARIO_47A_SHIP_BUILDERS[entity.data.assetRef] || FACTION_BUILDERS[entity.data.lootTableId];
      if (entry) {
        try { visual = entry.build(entity); }
        catch (error) { reportVisualWarning(options, `[visualOverrides] ${entry.label} build failed; using procedural fallback`, error); }
      }
    }

    if (!visual) visual = fallbackBuild(entity);
    assertReleaseHeroVisual(entity, visual, releaseMode);
    if (!visual || !entity || entity.type !== 'ship') return visual;

    // The wrapper is synchronous. Any later transport, validation, or composition failure leaves
    // the selected procedural/bespoke visual mounted and alive.
    try { return wrapShipWithAuthoredParts(entity, visual, { releaseMode }); }
    catch (error) {
      reportVisualWarning(options, '[visualOverrides] authored-asset boundary failed; using selected ship visual', error);
      return visual;
    }
  };

  Object.defineProperty(factory, '__spacefaceOverridesInstalled', {
    value: true, enumerable: false, configurable: false,
  });
  return factory;
}
