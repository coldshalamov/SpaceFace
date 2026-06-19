// Bespoke visual overrides for hero assets.
//
// The existing visualFactory remains the procedural fallback for the complete ship catalog.
// Overrides are deliberately narrow, deterministic, and failure-isolated: if a bespoke builder
// throws, the original factory still produces a usable ship instead of blanking the entity.
import { buildKestrelHero } from './ships/kestrelHero.js';
import { buildConcordPatrol } from './ships/concordPatrol.js';
import { buildReaverPirate } from './ships/reaverPirate.js';
import { buildMeridianTrader } from './ships/meridianTrader.js';
import { buildDriftBarge } from './ships/driftBarge.js';
import { buildQuietRaider } from './ships/quietRaider.js';
import { buildVaelSniper } from './ships/vaelSniper.js';

function isPlayerKestrel(entity) {
  return !!entity && entity.type === 'ship' && entity.team === 0 && entity.data && entity.data.defId === 'ship_kestrel';
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

/**
 * Install the hero-asset registry on a live visual factory.
 * Mutating the existing factory object is intentional: renderer event closures, rebuild paths,
 * and the dev ship-preview harness all retain a reference to that same object.
 */
export function installVisualOverrides(factory) {
  if (!factory || typeof factory.build !== 'function' || factory.__spacefaceOverridesInstalled) return factory;

  const fallbackBuild = factory.build.bind(factory);
  factory.build = (entity) => {
    if (isPlayerKestrel(entity)) {
      try { return buildKestrelHero(entity); }
      catch (error) { console.warn('[visualOverrides] Kestrel hero build failed; using procedural fallback', error); }
    } else if (entity && entity.type === 'ship' && entity.data) {
      // Faction bespoke ships (spec §8.2–§8.7, Phase 3 §20). Each is failure-isolated: any throw in
      // the bespoke builder falls back to the procedural factory, so a broken hero never blanks an NPC.
      const entry = FACTION_BUILDERS[entity.data.lootTableId];
      if (entry) {
        try { return entry.build(entity); }
        catch (error) { console.warn(`[visualOverrides] ${entry.label} build failed; using procedural fallback`, error); }
      }
    }
    return fallbackBuild(entity);
  };

  Object.defineProperty(factory, '__spacefaceOverridesInstalled', {
    value: true, enumerable: false, configurable: false,
  });
  return factory;
}
