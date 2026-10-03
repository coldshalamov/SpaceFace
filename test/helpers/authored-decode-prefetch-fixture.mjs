import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { setImmediate as nextTurn } from 'node:timers/promises';
import { createAsyncAdmission } from '../../src/render/asyncAdmission.js';

const require = createRequire(import.meta.url);
const { parse } = require('@babel/parser');
const source = readFileSync(process.env.ENTRY_PARTS_SOURCE
  || new URL('../../src/render/partsLibrary.js', import.meta.url), 'utf8');
const names = new Set([
  'upgradeBoundary', 'preloadAuthoredAssetsForEntity', 'ensureEntityLibrary',
  'admitEntityPlan', 'pumpEntityPlanLane', 'loadPlanIntoLibrary',
  'assertAuthoredVisualPreparationActive', 'assertQueuedAuthoredAdmissionActive',
  'waitForAuthoredAdmission', 'libraryHasPreloadPlan', 'recordUrlEndsWith', 'recordIsResident',
]);
const functions = [];
for (let node of parse(source, { sourceType: 'module' }).program.body) {
  if (node.type === 'ExportNamedDeclaration') node = node.declaration;
  if (node?.type === 'FunctionDeclaration' && names.has(node.id.name)) {
    functions.push(source.slice(node.start, node.end));
    names.delete(node.id.name);
  }
}
if (names.size) throw new Error(`Missing production functions: ${[...names]}`);

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const scenario = process.argv[2];
const prefetch = deferred(), decode = deferred(), started = deferred();
const library = new Map();
const plan = { hull: ['wholeships/mule_production_v1.glb'] };
const original = new Error('fixture decode failed');
const errors = [], unhandled = [];
let ownerActive = true, compositions = 0, activeDecodeCount = 0;
process.on('unhandledRejection', (error) => unhandled.push({ name: error.name, message: error.message }));
process.on('rejectionHandled', () => {});
const noop = () => {};
const env = {
  mayComposeAuthoredShipLive: () => true,
  isEmptyAdmissionSubstrate: () => true,
  beginAdmissionPhaseTimings: () => ({}), monotonicNow: () => 0,
  loadCanonicalLibrary: async () => library,
  authoredPreloadPlanForEntity: () => plan,
  retainLibraryPlan: noop, planAdmissionByRenderer: new WeakMap(),
  isReleaseAssetMode: () => true, PART_RELEASE_ROOT: 'release/', PART_ROOT: 'source/',
  loadAuthoredPart: () => { started.resolve(); return decode.promise; },
  beginDecodeAdmission: () => { activeDecodeCount++; return {}; },
  finishDecodeAdmission: () => { activeDecodeCount--; },
  normalizePartUrl: (url) => url,
  endAdmissionPhase: noop, recordAdmissionSlice: noop, tier1CausalCounters: () => null,
  buildComposedShipAsync: async () => { compositions++; return { root: {} }; },
  registerPreparedAuthoredAdmission: noop,
  prepareAuthoredShipVisualPipelines: async () => ({}),
  commitAuthoredBoundary: async () => true,
  installWholeShipLodFamilyController: noop,
  handleAuthoredBoundaryAdmissionError: async (_b, _e, _r, _s, error) => {
    errors.push({ name: error.name, message: error.message, original: error === original });
  },
};
// Complete production functions execute unchanged. Only GPU/asset bytes, the canonical
// cache, and final publication/cleanup leaves are controlled by this CPU interleave fixture.
const upgrade = new Function('env', `with (env) { ${functions.join('\n')} return upgradeBoundary; }`)(env);
const admission = createAsyncAdmission();
const options = { asyncAdmission: admission, isResidencyOwnerActive: () => ownerActive };
const boundary = { userData: {}, parent: {} };
const entity = { id: 'fixture-mule', type: 'ship', alive: true, data: { defId: 'ship_mule' } };
const running = upgrade(boundary, { userData: {} }, entity, {}, {}, options, noop, prefetch.promise);
await started.promise;
if (scenario === 'owner-departed' || scenario === 'cancel-prefetch') ownerActive = false;
if (scenario === 'decode-failed') decode.reject(original);
else decode.resolve({ url: 'release/wholeships/mule_production_v1.glb' });
// Allow a real event-loop turn: microtask-only flushes cannot detect unhandled rejection.
await nextTurn();
await nextTurn();
const beforePrefetchCompositions = compositions;
if (scenario === 'cancel-prefetch') {
  admission.abort('fixture owner retired');
  prefetch.reject(admission.signal.reason);
} else prefetch.resolve(library);
await running;
await nextTurn();
admission.finish();
console.log(JSON.stringify({ errors, unhandled, compositions, beforePrefetchCompositions,
  activeDecodeCount, hasRequiredRecord: library.get('hull')?.length === 1 }));
