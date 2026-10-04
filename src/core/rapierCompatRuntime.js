// Shared Rapier compatibility runtime bootstrap.
//
// The upstream compat bundle's wasm-bindgen glue constructs exactly one function body,
// `return this`, as a legacy global-object fallback. A strict CSP correctly blocks the general
// Function constructor. During the single shared initialization below, replace it with a
// capability-limited constructor that accepts only that inert getter and rejects all other source.

const RAPIER_COMPAT_INIT_WARNING = 'using deprecated parameters for the initialization function';
const RAPIER_GLOBAL_GETTER_SOURCE = 'return this';

let rapierRuntimePromise = null;
let rapierRuntimeFailures = 0;
let rapierRuntimeBlockedUntil = 0;
let rapierRuntimeLastFailureAt = 0;
let rapierRuntimeLastError = null;

// A deterministically-failed init (missing wasm, CSP, a broken worker import) re-pays
// the whole WASM bootstrap on every caller mint — per-tick physics re-prepares would
// serialize fresh init attempts forever on a doomed environment. After repeated
// failures, refuse for a backing-off window: a recovering env self-heals, a dead one
// settles instead of churning.
const RAPIER_INIT_FAILURES_BEFORE_BACKOFF = 2;
const RAPIER_INIT_BACKOFF_STEP_MS = 15000;
const RAPIER_INIT_BACKOFF_CAP_MS = 120000;
// A failure older than the longest backoff window can't count toward a "consecutive"
// streak — transient faults hours apart must not eventually trigger the refusal.
const RAPIER_INIT_FAILURE_DECAY_MS = RAPIER_INIT_BACKOFF_CAP_MS;

export function loadRapierCompatRuntime({
  importModule = () => import('@dimforge/rapier3d-compat'),
  globalObject = globalThis,
} = {}) {
  if (!rapierRuntimePromise) {
    const now = Date.now();
    if (rapierRuntimeFailures > 0 && now - rapierRuntimeLastFailureAt > RAPIER_INIT_FAILURE_DECAY_MS) {
      rapierRuntimeFailures = 0;
      rapierRuntimeLastError = null;
    }
    if (rapierRuntimeFailures >= RAPIER_INIT_FAILURES_BEFORE_BACKOFF && now < rapierRuntimeBlockedUntil) {
      const cause = rapierRuntimeLastError && rapierRuntimeLastError.message
        ? `; last error: ${rapierRuntimeLastError.message}`
        : '';
      return Promise.reject(new Error(
        `Rapier runtime init in failure backoff (${rapierRuntimeFailures} consecutive failures)${cause}`,
      ));
    }
    rapierRuntimePromise = initializeRapierCompatRuntime({ importModule, globalObject }).then(
      (runtime) => {
        rapierRuntimeFailures = 0;
        rapierRuntimeBlockedUntil = 0;
        rapierRuntimeLastError = null;
        return runtime;
      },
      (error) => {
        rapierRuntimePromise = null;
        rapierRuntimeFailures += 1;
        rapierRuntimeLastFailureAt = Date.now();
        rapierRuntimeLastError = error;
        rapierRuntimeBlockedUntil = Date.now()
          + Math.min(rapierRuntimeFailures * RAPIER_INIT_BACKOFF_STEP_MS, RAPIER_INIT_BACKOFF_CAP_MS);
        throw error;
      },
    );
  }
  return rapierRuntimePromise;
}

/** True while init is refusing attempts inside the failure backoff window. */
export function rapierRuntimeBlocked() {
  return rapierRuntimeFailures >= RAPIER_INIT_FAILURES_BEFORE_BACKOFF
    && Date.now() < rapierRuntimeBlockedUntil;
}

export function createRapierCspFunctionConstructor(globalObject = globalThis) {
  return function RapierCspFunctionConstructor(...parameters) {
    const source = parameters.length === 1 ? String(parameters[0]).trim().replace(/;$/, '') : '';
    if (source !== RAPIER_GLOBAL_GETTER_SOURCE) {
      throw new EvalError('Rapier CSP bridge rejected dynamic JavaScript source');
    }
    return function rapierGlobalObjectGetter() {
      return globalObject;
    };
  };
}

export async function withRapierCspFunctionBridge(
  operation,
  globalObject = globalThis,
  { retainAfterSuccess = false } = {},
) {
  if (typeof operation !== 'function') throw new TypeError('Rapier CSP bridge requires an operation');
  const descriptor = Object.getOwnPropertyDescriptor(globalObject, 'Function');
  if (!descriptor || descriptor.configurable !== true) {
    throw new Error('Rapier CSP bridge requires a configurable global Function binding');
  }
  Object.defineProperty(globalObject, 'Function', {
    ...descriptor,
    value: createRapierCspFunctionConstructor(globalObject),
  });
  let completed = false;
  try {
    const result = await operation();
    completed = true;
    return result;
  } finally {
    // A CSP-protected Electron renderer cannot use the native constructor at all. Retain the
    // capability-limited replacement there because wasm-bindgen performs some lazy global lookups
    // after init() resolves. Browser routes restore their normal global immediately.
    if (!retainAfterSuccess || !completed) Object.defineProperty(globalObject, 'Function', descriptor);
  }
}

async function initializeRapierCompatRuntime({ importModule, globalObject }) {
  if (typeof importModule !== 'function') throw new TypeError('Rapier runtime importer must be callable');
  return withRapierCspFunctionBridge(async () => {
    const module = await importModule();
    const RAPIER = module?.default || module;
    await runRapierInitWithFilteredWarning(RAPIER);
    return RAPIER;
  }, globalObject, {
    retainAfterSuccess: isElectronRenderer(globalObject),
  });
}

function isElectronRenderer(globalObject) {
  return /\bElectron\/\d/i.test(String(globalObject?.navigator?.userAgent || ''));
}

async function runRapierInitWithFilteredWarning(RAPIER) {
  if (!RAPIER || typeof RAPIER.init !== 'function') return;
  if (typeof console === 'undefined' || typeof console.warn !== 'function') {
    await RAPIER.init();
    return;
  }
  const originalWarn = console.warn;
  console.warn = (...args) => {
    const text = args.map(String).join(' ');
    if (text.includes(RAPIER_COMPAT_INIT_WARNING)) return;
    originalWarn.apply(console, args);
  };
  try {
    await RAPIER.init();
  } finally {
    console.warn = originalWarn;
  }
}
