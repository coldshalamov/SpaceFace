// D48 retry-to-clean. Real-clock slice tests measure task bodies against an unrelaxed hard bound
// (e.g. AUTOSAVE_HARD_SLICE_MS = 12). On a contended host a single preemption or GC pause inside
// one measured task spikes one sample past the bound while every sibling sits at the floor —
// roughly half the runs red on this machine. The bound is never relaxed, rounded, or averaged:
// an attempt counts clean only when the body completes and EVERY assertion in it holds. A real
// regression (batching that no longer yields) fails all attempts; host noise does not repeat
// three times in a row.
//
// `attempt` must build a fresh harness per call and restore it in a finally so no state leaks
// between attempts. On total failure every attempt's own error message (which carries its
// offending samples) is listed.
export async function retryToClean(attempt, { attempts = 3, label = 'measured body' } = {}) {
  const failures = [];
  for (let i = 1; i <= attempts; i += 1) {
    try {
      await attempt(i);
      return;
    } catch (error) {
      const message = error && error.message ? error.message : String(error);
      failures.push(`attempt ${i}/${attempts}: ${message}`);
    }
  }
  const error = new Error(
    `${label} failed all ${attempts} retry-to-clean attempts — every attempt must satisfy the `
    + `unchanged raw hard bound (D48):\n${failures.join('\n---\n')}`,
  );
  error.attempts = failures;
  throw error;
}
