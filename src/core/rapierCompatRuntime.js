// Shared Rapier compatibility runtime bootstrap.
//
// The upstream compat bundle's wasm-bindgen glue constructs exactly one function body,
// `return this`, as a legacy global-object fallback. A strict CSP correctly blocks the general
// Function constructor. During the single shared initialization below, replace it with a
// capability-limited constructor that accepts only that inert getter and rejects all other source.

const RAPIER_COMPAT_INIT_WARNING = 'using deprecated parameters for the initialization function';
const RAPIER_GLOBAL_GETTER_SOURCE = 'return this';

let rapierRuntimePromise = null;

export function loadRapierCompatRuntime({
  importModule = () => import('@dimforge/rapier3d-compat'),
  globalObject = globalThis,
} = {}) {
  if (!rapierRuntimePromise) {
    rapierRuntimePromise = initializeRapierCompatRuntime({ importModule, globalObject }).catch((error) => {
      rapierRuntimePromise = null;
      throw error;
    });
  }
  return rapierRuntimePromise;
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
