// Bespoke visual overrides for hero assets.
//
// The existing visualFactory remains the procedural fallback for the complete ship catalog.
// Overrides are deliberately narrow, deterministic, and failure-isolated: if a bespoke builder
// throws, the original factory still produces a usable ship instead of blanking the entity.
import { buildKestrelHero } from './ships/kestrelHero.js';

function isPlayerKestrel(entity) {
  return !!entity
    && entity.type === 'ship'
    && entity.team === 0
    && entity.data
    && entity.data.defId === 'ship_kestrel';
}

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
      try {
        return buildKestrelHero(entity);
      } catch (error) {
        console.warn('[visualOverrides] Kestrel hero build failed; using procedural fallback', error);
      }
    }
    return fallbackBuild(entity);
  };

  Object.defineProperty(factory, '__spacefaceOverridesInstalled', {
    value: true,
    enumerable: false,
    configurable: false,
  });
  return factory;
}
