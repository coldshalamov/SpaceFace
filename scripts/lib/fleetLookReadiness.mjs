// A broken module graph cannot become ready by waiting for assets. Fail that specific startup
// failure immediately so a capture does not occupy the shared GPU lock until its long deadline.
export function isFatalFleetLookStartupError(error) {
  const message = String(error?.message || error || '');
  return /does not provide an export named|failed to resolve module specifier|failed to fetch dynamically imported module/i.test(message);
}

export async function navigateToFleetLookReady(page, url, { timeoutMs, navigationTimeoutMs = 180000 } = {}) {
  let rejectFatal;
  const fatal = new Promise((_, reject) => { rejectFatal = reject; });
  const onPageError = (cause) => {
    if (!isFatalFleetLookStartupError(cause)) return;
    const error = new Error(`fleet-look cannot start: ${String(cause?.message || cause)}`);
    error.code = 'FLEET_LOOK_FATAL_STARTUP';
    error.cause = cause;
    rejectFatal(error);
  };
  page.on('pageerror', onPageError);
  try {
    return await Promise.race([
      (async () => {
        await page.goto(url, { waitUntil: 'commit', timeout: navigationTimeoutMs });
        return page.waitForFunction(() => window.SF_fleetLookReady === true, null, { timeout: timeoutMs });
      })(),
      fatal,
    ]);
  } finally {
    page.off('pageerror', onPageError);
  }
}
