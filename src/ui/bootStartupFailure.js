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
