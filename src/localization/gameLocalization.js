import { messages as englishExtracted } from './catalogs/en-US.generated.js';
import { messages as spanishMessages } from './catalogs/es-ES.js';
import { messages as frenchMessages } from './catalogs/fr-FR.js';
import { messages as germanMessages } from './catalogs/de-DE.js';
import { messages as portugueseMessages } from './catalogs/pt-BR.js';
import { createLocalizationRuntime, DEFAULT_LOCALE, PSEUDO_LOCALE } from './runtime.js';
import { installLocalizedDocumentBridge, localizationBridgeStats } from './domBridge.js';
import { STORE_COPY } from './storeCopy.js';
import { barkMessagesFor } from './barks.js';
import { IS_DEV } from '../core/devMode.js';
import { localeReadiness, SHIPPED_LOCALES, translateMessage } from './pipeline.js';

const englishMessages = Object.freeze({
  ...englishExtracted,
  ...barkMessagesFor(DEFAULT_LOCALE),
  ...STORE_COPY[DEFAULT_LOCALE],
});

const LOCALE_TOKEN_RE = /^[A-Za-z]{2,3}(?:[-_][A-Za-z0-9]{2,8})*$/;
const keyByEnglishMessage = new Map();

for (const [key, entry] of Object.entries(englishMessages).sort(([a], [b]) => a.localeCompare(b))) {
  const message = typeof entry === 'string' ? entry : entry && entry.message;
  if (typeof message === 'string' && !keyByEnglishMessage.has(message)) keyByEnglishMessage.set(message, key);
}

/** The five languages a player can pick. English is first: it is the default unless chosen.
 * FB-107: a machine-filled locale is labelled honestly — the "(machine preview)" suffix is
 * measured (pipeline.js localeReadiness), so a reviewed batch that passes the gate drops the
 * label with no code change. English, the source locale, never carries it. */
const MACHINE_PREVIEW_LABEL_SUFFIX = ' (machine preview)';

function honestLocaleLabel(localeId, label) {
  if (localeId === DEFAULT_LOCALE) return label;
  return localeReadiness(localeId).preview ? `${label}${MACHINE_PREVIEW_LABEL_SUFFIX}` : label;
}

const SHIPPED_LANGUAGE_ROWS = Object.freeze([
  Object.freeze({ id: DEFAULT_LOCALE, label: 'English' }),
  Object.freeze({ id: 'es-ES', label: honestLocaleLabel('es-ES', 'Español') }),
  Object.freeze({ id: 'fr-FR', label: honestLocaleLabel('fr-FR', 'Français') }),
  Object.freeze({ id: 'de-DE', label: honestLocaleLabel('de-DE', 'Deutsch') }),
  Object.freeze({ id: 'pt-BR', label: honestLocaleLabel('pt-BR', 'Português (Brasil)') }),
]);

const PSEUDO_LANGUAGE_OPTION = Object.freeze({
  id: PSEUDO_LOCALE,
  label: 'Pseudo-locale (layout check)',
});

/** Picker rows for a dev flag. Only a strict true adds the layout pseudo-locale. */
export function languageOptionsFor(isDev) {
  if (isDev !== true) return SHIPPED_LANGUAGE_ROWS;
  return Object.freeze([...SHIPPED_LANGUAGE_ROWS, PSEUDO_LANGUAGE_OPTION]);
}

/** The locales the Settings picker offers in this process. */
export const LANGUAGE_OPTIONS = languageOptionsFor(IS_DEV);

export { SHIPPED_LOCALES };

/** Measured reviewed coverage per locale (FB-107) — the data the labels are read from. */
export { localeReadiness };

export const CATALOGS = Object.freeze({
  [DEFAULT_LOCALE]: englishMessages,
  'es-ES': spanishMessages,
  es: spanishMessages,
  'fr-FR': frenchMessages,
  fr: frenchMessages,
  'de-DE': germanMessages,
  de: germanMessages,
  'pt-BR': portugueseMessages,
  pt: portugueseMessages,
});

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
  catalogs: CATALOGS,
});

/** Translate generated English inventory copy through the canonical runtime.
 * Unknown dynamic copy resolves through the same phrase/machine layer the shipped catalogs
 * use; en-US and the pseudo locale keep the deterministic source/pseudo path. */
export function localizeText(message, values = {}) {
  const source = String(message == null ? '' : message);
  const key = keyByEnglishMessage.get(source) || `runtime:${source}`;
  return gameLocalization.t(key, values, () => {
    const locale = gameLocalization.locale;
    if (locale === DEFAULT_LOCALE || locale === PSEUDO_LOCALE) return source;
    return translateMessage(locale, source, key);
  });
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
