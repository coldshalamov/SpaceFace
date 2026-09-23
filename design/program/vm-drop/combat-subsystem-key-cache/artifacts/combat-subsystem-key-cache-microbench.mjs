const ITER = 300000;
function makeRuntime(n=12) {
  const subsystems = {};
  for (let i = 0; i < n; i++) {
    subsystems['subsystem_' + i] = { pendingTransition: null, destroyed: false, effectiveDisabled: false, health: 10, maxHealth: 10 };
  }
  return { subsystems, statuses: {}, capabilities: {}, multipliers: {}, physicsResponse: {}, baseCapabilities: {} };
}
function before(runtime) {
  let hits = 0;
  for (const id of Object.keys(runtime.subsystems || {}).sort()) {
    const s = runtime.subsystems[id];
    if (s.pendingTransition) hits++;
  }
  // mimic recompute's two extra sorts
  for (const id of Object.keys(runtime.subsystems || {}).sort()) hits += id.length;
  for (const id of Object.keys(runtime.subsystems || {}).sort()) hits += 1;
  return hits;
}
function sortedSubsystemIds(runtime) {
  const map = runtime && runtime.subsystems;
  if (!map) return [];
  let cached = runtime._sfSortedSubsystemIds;
  if (cached) return cached;
  cached = Object.keys(map).sort();
  runtime._sfSortedSubsystemIds = cached;
  return cached;
}
function after(runtime) {
  let hits = 0;
  for (const id of sortedSubsystemIds(runtime)) {
    const s = runtime.subsystems[id];
    if (s.pendingTransition) hits++;
  }
  for (const id of sortedSubsystemIds(runtime)) hits += id.length;
  for (const id of sortedSubsystemIds(runtime)) hits += 1;
  return hits;
}
function bench(fn){ for(let i=0;i<3000;i++)fn(); const t0=performance.now(); for(let i=0;i<ITER;i++)fn(); return performance.now()-t0; }
const rt = makeRuntime(12);
const b = bench(() => before(rt));
const rt2 = makeRuntime(12);
const a = bench(() => after(rt2));
console.log(JSON.stringify({ beforeMs: b, afterMs: a, speedup: b/a, iters: ITER, n: 12 }));
