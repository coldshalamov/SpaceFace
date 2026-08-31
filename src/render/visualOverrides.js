// Bespoke visual overrides for hero assets plus the authored-asset boundary.
// Explicit authored identities fail closed. A load/build problem may leave an entity temporarily
// absent and diagnostic, but it must never publish a visually unrelated procedural body first.
import * as THREE from 'three';
import { buildKestrelHero } from './ships/kestrelHero.js';
import { buildConcordPatrol } from './ships/concordPatrol.js';
import { buildReaverPirate } from './ships/reaverPirate.js';
import { buildMeridianTrader } from './ships/meridianTrader.js';
import { buildDriftBarge } from './ships/driftBarge.js';
import { buildQuietRaider } from './ships/quietRaider.js';
import { buildVaelSniper } from './ships/vaelSniper.js';
import { build47aScenarioProp } from './scenarioProps47a.js';
import { batchScenarioPropOpaqueMeshes } from './scenarioPropBatching.js';
import {
  buildAuthoredCargoCapsule,
  buildAuthoredPlaceProp,
  buildAuthoredStationArchetype,
  requiresProductionWholeShipForEntity,
  wrapShipWithAuthoredParts,
} from './partsLibrary.js';
import { isReleaseAssetMode } from './releaseMode.js';
import { configureTransparentSinglePassSurfaces } from './transparentSinglePassPolicy.js';
import { attachMirrorjawForemanPresentation } from './visualFactory.js';
import {
  hasExplicitAuthoredGeologyPresentation,
  hasExplicitAuthoredPayloadPresentation,
  PRESENTATION_ADMISSION,
  setPresentationAdmission,
} from '../core/presentationAdmission.js';

const KESTREL_HERO_ASSET_ID = 'SF_K0_KESTREL_BORROWED_TIME';

export function isPlayerKestrel(entity) {
  return !!entity && entity.type === 'ship' && entity.isPlayer === true
    && entity.data && entity.data.defId === 'ship_kestrel';
}

function isWorldPlaceProp(entity) {
  if (!entity || !entity.data) return false;
  if (hasExplicitAuthoredGeologyPresentation(entity)) return true;
  if (entity.type !== 'fx') return false;
  return typeof entity.data.placeId === 'string' || typeof entity.data.landmarkGlb === 'string';
}

function hasStationArchetype(entity) {
  return !!entity && entity.type === 'station' && entity.data
    && typeof entity.data.archetypeGlb === 'string' && entity.data.archetypeGlb.length > 0;
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
  if (visual && visual.userData && visual.userData.authoredAdmissionSubstrate === true) return;
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

function unavailableVisual(entity, reason, error) {
  const root = new THREE.Group();
  const kind = entity && entity.type ? entity.type : 'entity';
  root.name = `${kind}_AuthoredVisualUnavailable`;
  root.visible = false;
  root.userData.kind = kind;
  root.userData.authoredAssetState = 'unavailable';
  root.userData.authoredVisualRoot = 'none-build-failed';
  root.userData.visualBuildFailed = true;
  root.userData.visualBuildFailureReason = reason;
  if (error && error.message) root.userData.visualBuildFailureMessage = error.message;
  root.userData.renderContract = {
    assetBoundary: 'fail-closed authored identity',
    gracefulFallback: false,
  };
  return root;
}

function directAuthoredAdmissionSubstrate(entity) {
  const root = new THREE.Group();
  root.name = `${entity && entity.data && entity.data.defId || 'ship'}_DirectAuthoredAdmission`;
  root.visible = false;
  root.userData.kind = 'ship';
  root.userData.authoredAdmissionSubstrate = true;
  root.userData.authoredAdmissionTemporaryDrawables = 0;
  root.userData.shipConstruction = 'authored-direct';
  root.userData.assetId = 'DIRECT_AUTHORED_ADMISSION';
  root.userData.renderContract = {
    assetBoundary: 'resident authored identity admission substrate',
    gracefulFallback: false,
    temporaryDrawables: 0,
  };
  return root;
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
  enemy_reaver_interceptor: { build: buildReaverPirate, label: '47-A Reaver interceptor' },
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
  const authoredShips = options.authoredShips !== false;
  const authoredWholeShipsOnly = options.authoredWholeShipsOnly === true;
  const directAuthoredMount = options.directAuthoredMount === true;
  const kestrelBuilder = typeof options.kestrelBuilder === 'function' ? options.kestrelBuilder : buildKestrelHero;
  const authoredPlaceBuilder = typeof options.authoredPlaceBuilder === 'function'
    ? options.authoredPlaceBuilder
    : buildAuthoredPlaceProp;
  const authoredCargoCapsuleBuilder = typeof options.authoredCargoCapsuleBuilder === 'function'
    ? options.authoredCargoCapsuleBuilder
    : buildAuthoredCargoCapsule;
  const authoredStationBuilder = typeof options.authoredStationBuilder === 'function'
    ? options.authoredStationBuilder
    : buildAuthoredStationArchetype;
  factory.build = (entity) => {
    let visual = null;
    const requiredWholeShip = requiresProductionWholeShipForEntity(entity);
    const directShip = directAuthoredMount
      && authoredShips
      && entity && entity.type === 'ship'
      && !(entity.data && entity.data.precompileProbe === true)
      && !(authoredWholeShipsOnly && !requiredWholeShip);
    const authoredCargoCapsule = hasExplicitAuthoredPayloadPresentation(entity);
    const scenarioProp = directShip || isWorldPlaceProp(entity) || authoredCargoCapsule
      ? null
      : build47aScenarioProp(entity);
    if (directShip) {
      // The production catalog is resident before control. The live route therefore needs only a
      // zero-draw ownership boundary while the exact GLB composition is committed; constructing a
      // complete bespoke/procedural ship here would allocate and dispose an object graph that is
      // intentionally never shown.
      visual = directAuthoredAdmissionSubstrate(entity);
    } else if (isWorldPlaceProp(entity)) {
      const geologyFallback = hasExplicitAuthoredGeologyPresentation(entity)
        ? fallbackBuild(entity)
        : null;
      try { visual = authoredPlaceBuilder(entity, { releaseMode, fallbackRoot: geologyFallback }); }
      catch (error) {
        if (geologyFallback) {
          visual = settleSameSemanticGeologyBuildFallback(geologyFallback, entity, error);
          reportVisualWarning(options, '[visualOverrides] authored geology boundary failed; retaining procedural asteroid', error);
        } else {
          reportVisualWarning(options, '[visualOverrides] authored place prop failed closed', error);
          visual = unavailableVisual(entity, 'authored-place-build-failed', error);
        }
      }
      if (!visual && geologyFallback) visual = settleSameSemanticGeologyBuildFallback(geologyFallback, entity);
    } else if (hasStationArchetype(entity)) {
      try { visual = authoredStationBuilder(entity, { releaseMode }); }
      catch (error) {
        reportVisualWarning(options, '[visualOverrides] authored station archetype failed closed', error);
        visual = unavailableVisual(entity, 'authored-station-build-failed', error);
      }
    } else if (authoredCargoCapsule) {
      const payloadSubstrate = fallbackBuild(entity);
      try {
        visual = authoredCargoCapsuleBuilder(entity, {
          releaseMode,
          fallbackRoot: payloadSubstrate,
        });
      } catch (error) {
        setPresentationAdmission(entity, PRESENTATION_ADMISSION.unavailable);
        reportVisualWarning(options, '[visualOverrides] authored cargo capsule failed closed', error);
        visual = unavailableVisual(entity, 'authored-cargo-capsule-build-failed', error);
      }
      if (!visual) {
        setPresentationAdmission(entity, PRESENTATION_ADMISSION.unavailable);
        visual = unavailableVisual(entity, 'authored-cargo-capsule-build-unavailable');
      }
    } else if (scenarioProp) {
      visual = batchScenarioPropOpaqueMeshes(scenarioProp);
    } else if (isPlayerKestrel(entity)) {
      try { visual = kestrelBuilder(entity); }
      catch (error) {
        if (releaseMode) {
          throw releaseAssetError('[visualOverrides] release mode requires Kestrel hero asset; hero build failed', error);
        }
        reportVisualWarning(options, '[visualOverrides] Kestrel hero build failed closed', error);
        visual = unavailableVisual(entity, 'kestrel-hero-build-failed', error);
      }
      assertReleaseHeroVisual(entity, visual, releaseMode);
    } else if (entity && entity.type === 'ship' && entity.data) {
      // Faction bespoke ships (spec §8.2–§8.7, Phase 3 §20). Each is failure-isolated: any throw in
      // the bespoke builder falls back to the procedural factory, so a broken hero never blanks an NPC.
      const entry = SCENARIO_47A_SHIP_BUILDERS[entity.data.assetRef] || FACTION_BUILDERS[entity.data.lootTableId];
      if (entry) {
        try { visual = entry.build(entity); }
        catch (error) {
          reportVisualWarning(options, `[visualOverrides] ${entry.label} build failed closed`, error);
          visual = unavailableVisual(entity, 'bespoke-ship-build-failed', error);
        }
      }
    }

    if (!visual) visual = fallbackBuild(entity);
    assertReleaseHeroVisual(entity, visual, releaseMode);
    if (!visual || !entity || entity.type !== 'ship') return visual;
    configureTransparentSinglePassSurfaces(visual);
    if (!authoredShips) return visual;

    // Inspection surfaces must not replace a readable catalog ship with the generic modular kit.
    // That assembly is useful as a flight fallback, but it is not a validated complete body and its
    // asynchronous hot-swap creates the visible "clay ship -> different ship" discontinuity. Only
    // production whole-ship records may replace the object a player is directly manipulating.
    if (authoredWholeShipsOnly && !requiredWholeShip) {
      visual.userData.authoredAssetState = 'procedural-settled';
      return visual;
    }

    // The wrapper is synchronous and fail-closed. Live direct mounts carry no renderables; preview
    // modes may still provide a hidden bespoke/procedural substrate for isolated inspection tools.
    try {
      const boundary = wrapShipWithAuthoredParts(entity, visual, {
        releaseMode,
        libraryScope: options.authoredLibraryScope,
        bootstrapPlan: options.authoredBootstrapPlan,
        // The authored boundary is opt-in: only accepted production whole-ship identities may
        // bypass modular assembly. Keep the Kestrel boot rule intact while allowing later accepted
        // fleet bodies to remain exact across undock, Continue, and active-hull rebuilds.
        requiredWholeShip,
        onSwap: (payload) => {
          configureTransparentSinglePassSurfaces(payload && (payload.authoredRoot || payload.boundary));
          if (typeof options.onAuthoredAssetSwap === 'function') options.onAuthoredAssetSwap(payload);
        },
      });
      // Boss readability is a stable boundary decoration, not a procedural fallback. Mount it at
      // the one synchronous boundary-creation seam so prepared/cached publication and later LOD
      // swaps cannot bypass or remove it. It stays hidden until the authored body publishes.
      attachMirrorjawForemanPresentation(boundary, entity);
      return boundary;
    }
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

function settleSameSemanticGeologyBuildFallback(root, entity, error = null) {
  root.visible = true;
  root.userData = root.userData || {};
  root.userData.authoredReadableFallbackLayer = true;
  root.userData.authoredAssetState = 'same-semantic-fallback';
  root.userData.authoredVisualRoot = 'procedural-geology-fallback';
  root.userData.authoredReadableFallbackRetained = true;
  root.userData.renderContract = {
    ...(root.userData.renderContract || {}),
    assetBoundary: 'same-semantic procedural geology fallback',
    gracefulFallback: true,
  };
  if (error?.message) root.userData.authoredFallbackMessage = error.message;
  setPresentationAdmission(entity, PRESENTATION_ADMISSION.ready);
  return root;
}
