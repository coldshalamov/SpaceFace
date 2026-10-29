// What the boot shell does when the game module graph fails to load.
//
// A failed `import('../main.js')` is the one dead end the loading screen cannot recover from by
// itself: the dynamic import caches its failure for the life of the document, so retrying the
// import in place re-throws the same error. Most such failures are transient — a dev server
// restarting under a hot edit, a half-written asset, a service-worker handoff — and a fresh page
// load clears them. So the first failure in a tab session reloads once on its own; the retry is
// then remembered until the game actually starts, and any further failure stops and says what went
// wrong, instead of looping. There is deliberately no time window: a slow machine can take longer
// than any window to fail again, and a window that expires would hand a persistent failure a fresh
// retry every time. Storage that cannot hold the marker means no retry at all.
//
// Pure of the document: the caller passes the overlay, the storage and the reload hook, so the
// decision is testable without a browser.

export const STARTUP_RETRY_KEY = 'spaceface.startup-retry-at';
export const STARTUP_RETRY_DELAY_MS = 1_200;

const SUMMARY_LIMIT = 140;
const PROBE_CONCURRENCY = 8;
const PROBE_BUDGET_MS = 20_000;

/** One short line naming the failure, safe to put on screen. */
export function summarizeStartupError(error) {
  const raw = error && typeof error === 'object' && 'message' in error ? error.message : error;
  const text = String(raw == null ? '' : raw).replace(/\s+/g, ' ').trim();
  if (!text) return 'unknown error';
  return text.length > SUMMARY_LIMIT ? `${text.slice(0, SUMMARY_LIMIT - 1)}…` : text;
}

/** True when a retry was already spent, or when we cannot tell (unreadable storage never retries). */
function retryAlreadySpent(storage) {
  try {
    return storage.getItem(STARTUP_RETRY_KEY) !== null;
  } catch {
    return true;
  }
}

/** Remember the retry before reloading. No usable storage means no way to stop a loop: false. */
function spendRetry(storage, nowMs) {
  if (!storage || typeof storage.setItem !== 'function') return false;
  try {
    storage.setItem(STARTUP_RETRY_KEY, String(nowMs));
    return true;
  } catch {
    return false;
  }
}

/** A successful start clears the marker so a later, unrelated failure gets its own one retry. */
export function clearStartupRetry(storage) {
  try { if (storage) storage.removeItem(STARTUP_RETRY_KEY); } catch { /* storage may be blocked */ }
}

/**
 * Decide and present the response to a failed game import.
 * @returns {'retrying' | 'failed'} 'retrying' means a reload has been scheduled.
 */
export function presentStartupFailure({
  overlay, error, storage = null, reload = null, setTimer = setTimeout, nowMs = Date.now(),
} = {}) {
  const canRetry = typeof reload === 'function'
    && !!storage
    && !retryAlreadySpent(storage)
    && spendRetry(storage, nowMs);
  const summary = summarizeStartupError(error);
  if (overlay) {
    overlay.classList.remove('hidden');
    overlay.style.display = 'flex';
    overlay.setAttribute('aria-busy', canRetry ? 'true' : 'false');
    overlay.dataset.startupFailure = canRetry ? 'retrying' : 'failed';
    const label = overlay.querySelector('[data-loading-label]');
    const detail = overlay.querySelector('[data-loading-detail]');
    if (label) label.textContent = canRetry ? 'Restarting the flight systems' : 'Startup could not finish';
    if (detail) {
      detail.textContent = canRetry
        ? 'A flight system did not load. Trying once more.'
        : `Reload to retry. Your saved games have not been changed. (${summary})`;
      if (!canRetry) detail.classList.add('boot-error');
    }
  }
  if (canRetry) {
    setTimer(() => { try { reload(); } catch { /* a blocked reload leaves the message up */ } }, STARTUP_RETRY_DELAY_MS);
    return 'retrying';
  }
  return 'failed';
}

// ---- Dead-end diagnosis -----------------------------------------------------
//
// The rejected import's SyntaxError names a token but never the file, so "Unexpected token ':'"
// alone has sent repair into a 2,000-module tree twice. On the terminal failure — never on the
// success path, and never inside the retry window — we re-parse each warmed module ourselves
// and put the filename on screen. Every failure mode degrades to the plain message.

async function defaultFetchText(href) {
  try {
    const response = await fetch(href);
    return response.ok ? await response.text() : null;
  } catch { return null; } // a server that cannot answer cannot be diagnosed either
}

// Re-parse ONE module's own text by importing it as a blob and returning whatever it threw.
// A malformed file throws SyntaxError. A healthy file may have no static imports, so prepend
// a guaranteed-unresolvable static import: the module grammar is still parsed, but dependency
// resolution fails before any of the candidate's top-level code (including dynamic imports) runs.
// The SyntaxError call is made by the caller.
export function startupParseOnlySource(sourceText) {
  return `import 'spaceface-startup-diagnostics:parse-only';\n${sourceText}`;
}

async function defaultTryParse(sourceText) {
  const url = URL.createObjectURL(new Blob([startupParseOnlySource(sourceText)], { type: 'text/javascript' }));
  try {
    await import(/* @vite-ignore */ url);
    return null;
  } catch (error) {
    return error;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Fetch and re-parse candidate module URLs, returning [{ href, message }] for each file V8
 * rejects. Bounded by `budgetMs` of wall clock so a dying server cannot hang the failure
 * screen; callers inject fetchText/tryParse/nowMs in tests.
 */
export async function findBrokenModules({
  hrefs, fetchText = defaultFetchText, tryParse = defaultTryParse,
  budgetMs = PROBE_BUDGET_MS, nowMs = () => Date.now(),
} = {}) {
  const list = [...new Set(hrefs || [])];
  const culprits = [];
  const startedAt = nowMs();
  let cursor = 0;
  const worker = async () => {
    while (cursor < list.length && nowMs() - startedAt < budgetMs) {
      const href = list[cursor++];
      const text = await fetchText(href);
      if (text == null) continue;
      const error = await tryParse(text);
      if (error instanceof SyntaxError) culprits.push({ href, message: summarizeStartupError(error) });
    }
  };
  await Promise.all(Array.from({ length: Math.min(PROBE_CONCURRENCY, list.length) }, worker));
  return culprits;
}

/** The module URLs worth probing: every warmed module plus the game entry itself. */
export function startupProbeHrefs(doc) {
  if (!doc || typeof doc.querySelectorAll !== 'function') return [];
  const hrefs = [...doc.querySelectorAll('link[rel="modulepreload"]')]
    .map((link) => link.getAttribute('href')).filter(Boolean);
  if (!hrefs.includes('./src/main.js')) hrefs.unshift('./src/main.js');
  return hrefs;
}

/** Put the culprit file on the dead-end screen after the fact; a no-op when diagnosis found none. */
export function annotateStartupFailure({ overlay, culprits, summary } = {}) {
  if (!overlay || !culprits || !culprits.length) return false;
  const detail = overlay.querySelector('[data-loading-detail]');
  if (!detail) return false;
  const first = culprits[0];
  const more = culprits.length > 1 ? ` (+${culprits.length - 1} more)` : '';
  detail.textContent = 'Reload to retry. Your saved games have not been changed. '
    + `(${first.href}: ${first.message || summary || 'syntax error'}${more})`;
  return true;
}
