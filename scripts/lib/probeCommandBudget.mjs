// The runner owns the command deadline; probes must not invent a longer one.
export const COMMAND_DEADLINE_ENV = 'SPACEFACE_COMMAND_DEADLINE_MS';
export const PROBE_CLEANUP_RESERVE_MS = 10000;
export function commandDeadlineEnv(env, started, timeoutMs) {
  return { ...env, [COMMAND_DEADLINE_ENV]: String(started + timeoutMs) };
}
export function readCommandDeadline(env = process.env) {
  const value = Number(env[COMMAND_DEADLINE_ENV]);
  return Number.isFinite(value) && value > 0 ? value : null;
}
export function remainingDiagnosticBudget(deadline, now, maximum) {
  return Number.isFinite(deadline)
    ? Math.max(0, Math.min(maximum, deadline - now - PROBE_CLEANUP_RESERVE_MS))
    : maximum;
}

// A timeout is not proof of graceful browser closure. The caller retains its
// original acceptance/error result; the outer runner remains the final backstop.
export async function closeOwnedProbeResources({ browser, server, warn = console.warn,
  timeoutMs = 5000, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  let timer, complete = true;
  try {
    if (browser) {
      const outcome = await Promise.race([
        Promise.resolve().then(() => browser.close()).then(() => 'closed'),
        new Promise(resolve => { timer = setTimer(() => resolve('timeout'), timeoutMs); }),
      ]);
      if (outcome === 'timeout') {
        complete = false;
        warn('Owned browser cleanup incomplete: close deadline exceeded; outer runner remains the backstop.');
      }
    }
  } catch (error) {
    complete = false;
    warn(`Owned browser cleanup incomplete: ${error?.message || error}`);
  } finally {
    clearTimer(timer);
    try { server?.kill?.(); }
    catch (error) { complete = false; warn(`Owned server cleanup incomplete: ${error?.message || error}`); }
  }
  return complete;
}
