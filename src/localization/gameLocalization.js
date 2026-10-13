import { messages as spanishMessages } from './catalogs/es-ES.js';
import { messages as frenchMessages } from './catalogs/fr-FR.js';
import { messages as germanMessages } from './catalogs/de-DE.js';
import { messages as portugueseMessages } from './catalogs/pt-BR.js';
import { createLocalizationRuntime, DEFAULT_LOCALE, PSEUDO_LOCALE } from './runtime.js';
import { installLocalizedDocumentBridge, localizationBridgeStats } from './domBridge.js';
import { IS_DEV } from '../core/devMode.js';
import {
  deferredArray,
  deferredCatalog,
  localeReadiness,
  SHIPPED_LOCALES,
  translateMessage,
  warmTranslatedCatalog,
} from './pipeline.js';

// Boot-eval deferral (wave-140 B5): the English merge, the message→key map, and the picker rows
// (whose labels measure per-locale readiness over the whole inventory) used to be built inside
// the post-gate eval task. They now materialize on first real access through the deferred
// proxies — identical values — and the post-eval warm at the bottom of this module makes that
// access land inside the media-gate window, long before the Settings menu or first localized paint.
// W142-5: the en-US proxy resolves through deferredCatalog → buildTranslatedCatalog, so the
// object served here IS catalogCache['en-US'] — one merge, not two.
const englishMessages = deferredCatalog(DEFAULT_LOCALE);

const LOCALE_TOKEN_RE = /^[A-Za-z]{2,3}(?:[-_][A-Za-z0-9]{2,8})*$/;
let keyByEnglishMessageMap = null;

function keyByEnglishMessage() {
  if (keyByEnglishMessageMap === null) {
    const map = new Map();
    for (const [key, entry] of Object.entries(englishMessages).sort(([a], [b]) => a.localeCompare(b))) {
      const message = typeof entry === 'string' ? entry : entry && entry.message;
      if (typeof message === 'string' && !map.has(message)) map.set(message, key);
    }
    keyByEnglishMessageMap = map;
  }
  return keyByEnglishMessageMap;
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

const SHIPPED_LANGUAGE_ROWS = deferredArray(() => Object.freeze([
  Object.freeze({ id: DEFAULT_LOCALE, label: 'English' }),
  Object.freeze({ id: 'es-ES', label: honestLocaleLabel('es-ES', 'Español') }),
  Object.freeze({ id: 'fr-FR', label: honestLocaleLabel('fr-FR', 'Français') }),
  Object.freeze({ id: 'de-DE', label: honestLocaleLabel('de-DE', 'Deutsch') }),
  Object.freeze({ id: 'pt-BR', label: honestLocaleLabel('pt-BR', 'Português (Brasil)') }),
]));

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

// Every value here is a deferred proxy: the en-US merge and each stub's deferredCatalog.
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
  const key = keyByEnglishMessage().get(source) || `runtime:${source}`;
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

// Post-eval warm for the deferred data: run once the blocking eval task returns to the event
// loop, inside the media-gate window, so the parse/translate passes finish before the Settings
// menu mounts. Sliced via warmTranslatedCatalog so no single task stalls a frame; a real
// consumer arriving mid-warm still resolves synchronously on first access.
if (typeof window !== 'undefined') {
  // The boot locale leads: a `?locale=` pick warms ahead of the rest. en-US is always second —
  // every fallback chain ends there, so it is the catalog `t()` touches first.
  // W141-N8: only catalogs a consumer can actually read are warmed — a `?locale=` token
  // naming a non-shipped locale used to spend warm slices on dead data. SHIPPED_LOCALES is a
  // plain const, so the filter never materializes the deferredRows proxy.
  const warmQueue = [...new Set([startupLocale, DEFAULT_LOCALE, 'es-ES', 'fr-FR', 'de-DE', 'pt-BR'])]
    .filter((locale) => SHIPPED_LOCALES.includes(locale));
  // Phased warm chain (W141-BG-2/BG-3): every step is its own sub-frame task.
  //  0 — englishMessages materialize alone (generated JSON parse ~30-40ms) — otherwise it
  //      piggybacks on whichever consumer touches the catalog first.
  //  1 — keyByEnglishMessage (~86-90ms loop, inputs cached): it backs every localizeText,
  //      so leaving it for idle or the first consumer moves the cost into title paint.
  //  2 — localeReadiness per shipped locale (memoized, ~15-25ms each): pre-pays the
  //      per-entry scans so the rows materialize below is a freeze, not a parse.
  //  3 — SHIPPED_LANGUAGE_ROWS materializes with all inputs cached — trivial.
  //  4 — translated catalogs at ~400 rows/slice (W141-N3) — every task stays sub-frame.
  let warmPhase = 0;
  let warmIndex = 0;
  const warmStep = () => {
    if (warmPhase === 0) {
      void Object.keys(englishMessages).length;
      warmPhase = 1;
      setTimeout(warmStep, 0);
      return;
    }
    if (warmPhase === 1) {
      keyByEnglishMessage();
      warmPhase = 2;
      setTimeout(warmStep, 0);
      return;
    }
    if (warmPhase === 2) {
      if (warmIndex < SHIPPED_LOCALES.length) {
        localeReadiness(SHIPPED_LOCALES[warmIndex]);
        warmIndex += 1;
        setTimeout(warmStep, 0);
        return;
      }
      warmPhase = 3;
      warmIndex = 0;
    }
    if (warmPhase === 3) {
      void SHIPPED_LANGUAGE_ROWS.length;
      warmPhase = 4;
      setTimeout(warmStep, 0);
      return;
    }
    if (warmIndex < warmQueue.length) {
      const locale = warmQueue[warmIndex];
      if (!isIdleWarmLocale(locale)) {
        if (warmTranslatedCatalog(locale, 400)) warmIndex += 1;
        setTimeout(warmStep, 0);
        return;
      }
      // A locale nobody is reading yet only warms in idle time: its machine-translate pass
      // (~0.5 s of main-thread JS across the four non-English catalogs) used to land as
      // back-to-back timer tasks through the menu, New Game and loading. A switch to that
      // locale still builds it synchronously on first access, exactly as before.
      scheduleIdleWarm(warmStep);
    }
  };
  const isIdleWarmLocale = (locale) => locale !== startupLocale && locale !== DEFAULT_LOCALE;
  const scheduleIdleWarm = (step) => {
    if (typeof window.requestIdleCallback !== 'function') { setTimeout(step, 0); return; }
    window.requestIdleCallback((deadline) => {
      // A main thread that never idles still converges: a timed-out callback takes one slice.
      if (deadline.didTimeout && warmIndex < warmQueue.length && isIdleWarmLocale(warmQueue[warmIndex])) {
        if (warmTranslatedCatalog(warmQueue[warmIndex], 120)) warmIndex += 1;
      }
      while (warmIndex < warmQueue.length && isIdleWarmLocale(warmQueue[warmIndex])
        && deadline.timeRemaining() > 6) {
        if (warmTranslatedCatalog(warmQueue[warmIndex], 120)) warmIndex += 1;
      }
      if (warmIndex < warmQueue.length) step();
    }, { timeout: 30000 });
  };
  setTimeout(warmStep, 0);
}
