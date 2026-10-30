import { runBootInitializers } from '../core/bootSystemInit.js';

/** Dependents release their scene/GPU references before the owner providing them. */
export const TEARDOWN_DEPENDENCIES = Object.freeze([
  Object.freeze(['vfx', 'render']),
  Object.freeze(['shipbreakingYardBrowser', 'render']),
  Object.freeze(['salvageTender', 'render']),
]);

function uniqueSystemsInOrder(systems) {
  const seen = new Set();
  const unique = [];
  for (const system of systems || []) {
    if (!system || seen.has(system)) continue;
    seen.add(system);
    unique.push(system);
  }
  return unique;
}

/**
 * Stable dependency ordering for shutdown. Every dependency edge is dependent → owner, so a
 * depth-first walk visits all dependents before their owner while preserving the existing registry
 * order for unrelated systems. Cycles are ignored at the back-edge; the declared contract remains
 * deterministic and a malformed future edge cannot make shutdown recurse forever.
 */
export function orderSystemsForTeardown(systems, dependencies = TEARDOWN_DEPENDENCIES) {
  const unique = uniqueSystemsInOrder(systems);
  const byName = new Map();
  for (const system of unique) {
    if (typeof system.name === 'string' && system.name && !byName.has(system.name)) {
      byName.set(system.name, system);
    }
  }

  const dependentsByOwner = new Map();
  for (const edge of dependencies || []) {
    if (!Array.isArray(edge) || edge.length < 2) continue;
    const dependent = byName.get(edge[0]);
    const owner = byName.get(edge[1]);
    if (!dependent || !owner || dependent === owner) continue;
    const dependents = dependentsByOwner.get(owner) || [];
    if (!dependents.includes(dependent)) dependents.push(dependent);
    dependentsByOwner.set(owner, dependents);
  }

  const visiting = new Set();
  const visited = new Set();
  const ordered = [];
  const visit = (system) => {
    if (visited.has(system) || visiting.has(system)) return;
    visiting.add(system);
    for (const dependent of dependentsByOwner.get(system) || []) visit(dependent);
    visiting.delete(system);
    visited.add(system);
    ordered.push(system);
  };
  for (const system of unique) visit(system);
  return ordered;
}

/** Run every unique system destroy hook in the declared dependency order. */
export function destroySystems(systems, dependencies = TEARDOWN_DEPENDENCIES) {
  for (const system of orderSystemsForTeardown(systems, dependencies)) {
    if (!system || typeof system.destroy !== 'function') continue;
    try {
      system.destroy();
    } catch (error) {
      // One broken subsystem must not strand every later owner. The shutdown caller has no useful
      // recovery path here; retain the deterministic attempt order and continue.
      console.error('[registry] destroy ' + (system.name || 'unnamed system'), error);
    }
  }
}

/**
 * Own the registry's one-way init/destroy lifecycle. A browser registry is built around module
 * singletons, so retrying a partial init or reinitializing after teardown would otherwise stack
 * every event subscription those singletons install. Init failure tears down every system whose
 * init was entered (including the throwing system), then permanently rejects retries.
 *
 * `getDestroyCandidates` is evaluated only when teardown starts. The normal registry supplies the
 * manifest update order plus init order; a partial init supplies only the systems it reached.
 *
 * @param {{systems?: object[], context?: object, getDestroyCandidates?: function, dependencies?: Array, onTeardown?: function}} options
 */
export function createSystemLifecycle({
  systems = [],
  context = null,
  getDestroyCandidates = null,
  dependencies = TEARDOWN_DEPENDENCIES,
  onTeardown = null,
} = {}) {
  const initSystems = Array.isArray(systems) ? systems : [];
  const destroyCandidates = typeof getDestroyCandidates === 'function'
    ? getDestroyCandidates
    : () => initSystems;
  let phase = 'new';
  let initError = null;
  let teardownStarted = false;
  let pendingInit = null;

  function lifecycleError(action) {
    const error = new Error(`[registry] cannot ${action}: lifecycle is ${phase}`);
    error.code = 'REGISTRY_LIFECYCLE_CLOSED';
    error.lifecycleState = phase;
    if (initError) error.cause = initError;
    return error;
  }

  function teardown(candidates, finalPhase) {
    if (teardownStarted) return;
    teardownStarted = true;
    phase = 'destroying';
    try {
      destroySystems(candidates, dependencies);
    } finally {
      try {
        if (typeof onTeardown === 'function') onTeardown();
      } finally {
        phase = finalPhase;
      }
    }
  }

  function init() {
    // A second call while active (or a reentrant call from an init hook) is a no-op. There is no
    // second subscription pass and the original successful init keeps ownership of the runtime.
    if (phase === 'active' || phase === 'initializing') return;
    if (phase !== 'new') throw lifecycleError('initialize');

    phase = 'initializing';
    const attempted = [];
    try {
      for (const system of initSystems) {
        if (!system || typeof system.init !== 'function') continue;
        // Record before invoking init: a hook can install listeners and then throw, so its destroy
        // hook is part of the partial-init rollback boundary too.
        attempted.push(system);
        system.init(context);
      }
      phase = 'active';
    } catch (error) {
      initError = error;
      // Cleanup errors are isolated by destroySystems; preserve and rethrow the original init
      // failure. `teardownStarted` makes a later destroy() unable to invoke any hook twice.
      teardown(attempted, 'failed');
      throw error;
    }
  }

  function initAsync(options = {}) {
    // Duplicate async callers join one pass; synchronous init() remains unchanged for sim tools.
    if (phase === 'initializing' && pendingInit) return pendingInit;
    if (phase === 'active') return Promise.resolve(null);
    if (phase !== 'new') return Promise.reject(lifecycleError('initialize'));
    phase = 'initializing';
    const attempted = [];
    // Assign ownership before any observer/hook can call back into initAsync().
    pendingInit = Promise.resolve().then(() => runBootInitializers(initSystems, context, options, attempted))
      .then((metrics) => { phase = 'active'; return metrics; })
      .catch((error) => {
        initError = error;
        teardown(attempted, 'failed');
        throw error;
      });
    return pendingInit;
  }

  function destroy() {
    if (phase === 'destroyed' || phase === 'failed' || phase === 'destroying') return;
    if (phase === 'initializing') throw lifecycleError('destroy');
    // Preserve the historical ability to destroy a registry whose callers manually initialized
    // selected systems without invoking registry.init(). A fresh registry has no lifecycle-owned
    // init list, so this is the only safe compatibility path for that legacy usage.
    teardown(destroyCandidates(), 'destroyed');
  }

  return { init, initAsync, destroy };
}

