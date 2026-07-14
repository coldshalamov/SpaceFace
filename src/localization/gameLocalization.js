import { messages as englishMessages } from './catalogs/en-US.generated.js';
import { createLocalizationRuntime, DEFAULT_LOCALE, PSEUDO_LOCALE } from './runtime.js';
import { installLocalizedDocumentBridge, localizationBridgeStats } from './domBridge.js';

const SUPPORTED_STARTUP_LOCALES = new Set([DEFAULT_LOCALE, PSEUDO_LOCALE]);
const keyByEnglishMessage = new Map();

for (const [key, entry] of Object.entries(englishMessages).sort(([a], [b]) => a.localeCompare(b))) {
  const message = typeof entry === 'string' ? entry : entry && entry.message;
  if (typeof message === 'string' && !keyByEnglishMessage.has(message)) keyByEnglishMessage.set(message, key);
}

export function resolveStartupLocale(search = '') {
  let requested = '';
  try { requested = new URLSearchParams(String(search || '')).get('locale') || ''; } catch (error) {}
  return SUPPORTED_STARTUP_LOCALES.has(requested) ? requested : DEFAULT_LOCALE;
}

export const startupLocale = resolveStartupLocale(
  typeof window !== 'undefined' && window.location ? window.location.search : '',
);

export const gameLocalization = createLocalizationRuntime({
  locale: startupLocale,
  catalogs: { [DEFAULT_LOCALE]: englishMessages },
});

/** Translate generated English inventory copy through the canonical runtime.
 * Unknown dynamic copy still uses the runtime's deterministic fallback/pseudo path. */
export function localizeText(message, values = {}) {
  const source = String(message == null ? '' : message);
  const key = keyByEnglishMessage.get(source) || `runtime:${source}`;
  return gameLocalization.t(key, values, source);
}

if (typeof document !== 'undefined' && document.documentElement) {
  document.documentElement.lang = startupLocale;
  document.documentElement.dataset.locale = startupLocale;
  if (startupLocale !== DEFAULT_LOCALE) {
    installLocalizedDocumentBridge({ document, locale: startupLocale, translate: localizeText });
    if (typeof window !== 'undefined') {
      window.__SF_LOCALIZATION__ = Object.freeze({
        get locale() { return gameLocalization.locale; },
        stats: localizationBridgeStats,
      });
    }
  }
}
