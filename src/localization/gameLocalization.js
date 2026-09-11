import { messages as englishMessages } from './catalogs/en-US.generated.js';
import { createLocalizationRuntime, DEFAULT_LOCALE, PSEUDO_LOCALE } from './runtime.js';
import { installLocalizedDocumentBridge, localizationBridgeStats } from './domBridge.js';

const LOCALE_TOKEN_RE = /^[A-Za-z]{2,3}(?:[-_][A-Za-z0-9]{2,8})*$/;
const keyByEnglishMessage = new Map();

for (const [key, entry] of Object.entries(englishMessages).sort(([a], [b]) => a.localeCompare(b))) {
  const message = typeof entry === 'string' ? entry : entry && entry.message;
  if (typeof message === 'string' && !keyByEnglishMessage.has(message)) keyByEnglishMessage.set(message, key);
}

/** The locales the Settings picker offers. English is first: it is the default unless chosen. */
export const LANGUAGE_OPTIONS = Object.freeze([
  Object.freeze({ id: DEFAULT_LOCALE, label: 'English' }),
  Object.freeze({ id: PSEUDO_LOCALE, label: 'Pseudo-locale (layout check)' }),
]);

/** Default route stays English. Any well-formed locale may be chosen via `?locale=` or Settings. */
export function resolveStartupLocale(search = '') {
  let requested = '';
  try { requested = new URLSearchParams(String(search || '')).get('locale') || ''; } catch (error) {}
  return LOCALE_TOKEN_RE.test(requested) ? requested : DEFAULT_LOCALE;
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

let bridgeActive = false;

function publishLocalizationApi() {
  if (typeof window === 'undefined') return;
  window.__SF_LOCALIZATION__ = Object.freeze({
    get locale() { return gameLocalization.locale; },
    locales: LANGUAGE_OPTIONS,
    setLocale: setGameLocale,
    stats: localizationBridgeStats,
  });
}

/** Write the locale onto <html> and keep the DOM bridge pointed at the live runtime. */
function applyDocumentLocale(locale) {
  if (typeof document === 'undefined' || !document.documentElement) return locale;
  document.documentElement.lang = locale;
  document.documentElement.dataset.locale = locale;
  // The bridge is observer-free until a non-English locale is chosen; after that it stays installed
  // so switching back to English can restore authored copy from the source it stored on first visit.
  if (locale !== DEFAULT_LOCALE || bridgeActive) {
    bridgeActive = installLocalizedDocumentBridge({ document, locale, translate: localizeText }) || bridgeActive;
  }
  publishLocalizationApi();
  return locale;
}

/** Switch the live locale and re-render every mounted screen without a reload. */
export function setGameLocale(next) {
  const locale = gameLocalization.setLocale(next);
  return applyDocumentLocale(locale);
}

/** The locale the runtime is currently rendering with. */
export function currentGameLocale() {
  return gameLocalization.locale;
}

if (typeof document !== 'undefined' && document.documentElement) {
  if (startupLocale !== DEFAULT_LOCALE) {
    applyDocumentLocale(startupLocale);
  } else {
    document.documentElement.lang = startupLocale;
    document.documentElement.dataset.locale = startupLocale;
    publishLocalizationApi();
  }
}
