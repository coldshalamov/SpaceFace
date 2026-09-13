// Compatibility face for the five launch catalogs. The packet names EN, ES, FR, DE, PT-BR.
// Full catalogs live under catalogs/; this module is the small import surface older tests use.

import { buildTranslatedCatalog, SHIPPED_LOCALES } from './pipeline.js';
import { STORE_KEYS } from './storeCopy.js';

export { SHIPPED_LOCALES };

export function catalogFor(locale) {
  return buildTranslatedCatalog(locale);
}

export function fiveCatalogsShip() {
  return SHIPPED_LOCALES.every((locale) => {
    const catalog = catalogFor(locale);
    if (!catalog) return false;
    return STORE_KEYS.every((key) => typeof catalog[key] === 'string' && catalog[key].length > 0);
  });
}

export default {
  SHIPPED_LOCALES,
  catalogFor,
  fiveCatalogsShip,
};
