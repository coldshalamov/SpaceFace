// When the translated catalogs may take a forced slice of main-thread time.
//
// The non-English catalogs warm in idle time, and a requestIdleCallback that times out still takes
// one slice so a main thread that never idles converges. The loading screen is exactly that main
// thread: the 2026-10-13 launch profile showed 0.73 s of machineTranslatePart landing in the
// gpu-resources stage of an English run, on the frames the loading shell is animating. Nobody is
// reading those catalogs yet (a locale switch still builds one synchronously on first access), so a
// timed-out slice waits until the shell is gone.

/** True while the boot/loading shell is on screen (the same test the loading presenter uses). */
export function loadingShellVisible(doc) {
  try {
    const shell = doc && typeof doc.getElementById === 'function' ? doc.getElementById('boot-overlay') : null;
    if (!shell) return false;
    const hidden = shell.style && shell.style.display === 'none';
    const classed = shell.classList && typeof shell.classList.contains === 'function'
      && shell.classList.contains('hidden');
    return !hidden && !classed;
  } catch {
    return false;
  }
}

/** Where requestIdleCallback does not exist (Safari, Node), one warm slice per tick, this far apart. */
export const FALLBACK_IDLE_WARM_DELAY_MS = 60;
/** The same fallback while the loading shell animates: nobody reads those catalogs yet, so wait longer. */
export const FALLBACK_IDLE_WARM_LOADING_DELAY_MS = 400;

/** Spacing for the next idle-warm slice on a runtime without requestIdleCallback. */
export function fallbackWarmDelayMs(doc) {
  return loadingShellVisible(doc) ? FALLBACK_IDLE_WARM_LOADING_DELAY_MS : FALLBACK_IDLE_WARM_DELAY_MS;
}

/** A timed-out idle callback may force a slice only when the loading shell is not animating. */
export function mayForceWarmSlice({ didTimeout, doc } = {}) {
  return didTimeout === true && !loadingShellVisible(doc);
}
