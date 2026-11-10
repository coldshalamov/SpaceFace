// GLB structural pre-pass for render packages: a small module-worker pool takes the whole verified
// GLB by transfer, and glbPrepassWorker.js batch-decodes every meshopt-compressed bufferView plus
// slices each embedded image's bytes for the KTX2 transcoder, then transfers everything back in one
// reply. GLTFLoader.parse still runs on the calling thread — but where it used to fan out into one
// worker round trip per bufferView (~135-214 postMessage/dispatch pairs per render package, each
// with a decode-budget acquire and two transfers) and one memcpy per embedded KTX2 image, it now
// serves the same byte-identical results straight off the parser's predecoded/presliced maps.
// What the loader builds from them is unchanged, so the produced scene graph is identical.
//
// Failure discipline mirrors renderPackageDigest.js: each job first takes one shared decode-budget
// token; a worker lost while holding the buffer resolves `null` and the caller re-reads the package
// (content-hash immutable, so force-cache makes the re-read cheap); a clean error reply hands the
// GLB back inside the result so the stock parse still runs on the same bytes. When workers are
// unavailable the prepass resolves to the input buffer untouched, which is the stock path.
import { activeDecodeClass, resolveDecodeTaskBudgetLimit, sharedDecodeTaskBudget } from './decodeTaskBudget.js';
import { runtimeWorkerUrl } from './runtimeWorkers.js';

const WORKER_NAME = 'spaceface-glb-prepass';
const REQUEST_TIMEOUT_MS = 20_000;
const QUEUE_TIMEOUT_MS = 120_000;

function defaultWorkerUrl() {
  try { return runtimeWorkerUrl('prepass', import.meta.url); }
  catch (_) { return null; }
}

export function createGlbPrepasser(options = {}) {
  const WorkerImpl = Object.hasOwn(options, 'WorkerImpl') ? options.WorkerImpl : globalThis.Worker;
  const workerUrl = options.workerUrl || defaultWorkerUrl();
  const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : REQUEST_TIMEOUT_MS;
  const queueTimeoutMs = Number.isFinite(options.queueTimeoutMs) ? options.queueTimeoutMs : QUEUE_TIMEOUT_MS;
  const setTimer = options.setTimer || setTimeout, clearTimer = options.clearTimer || clearTimeout;
  const budget = options.budget || sharedDecodeTaskBudget();
  const cores = Number.isFinite(options.cores) ? options.cores
    : (Number.isFinite(globalThis.navigator?.hardwareConcurrency) ? navigator.hardwareConcurrency : 4);
  const poolSize = Math.max(1, resolveDecodeTaskBudgetLimit(cores));
  const workers = [], queue = [];
  let unavailable = typeof WorkerImpl !== 'function' || !workerUrl, nextId = 1;

  const passthrough = glb => ({ glb, bufferViews: null, sourceBytes: null });
  const finish = (job, result) => {
    if (job.finished) return;
    job.finished = true;
    clearTimer(job.timer); job.timer = null;
    // A disposed/expired queued job must also leave the shared semaphore's wait list.
    job.controller.abort();
    if (job.release) { job.release(); job.release = null; }
    job.resolve(result);
  };
  const settleLost = job => finish(job, job.glb?.byteLength > 0 ? passthrough(job.glb) : null);
  const retire = () => {
    unavailable = true;
    const pending = queue.splice(0);
    for (const worker of workers.splice(0)) {
      if (worker.current) pending.push(worker.current);
      worker.current = null;
      try { worker.object.terminate(); } catch (_) { /* already gone */ }
    }
    for (const job of pending) settleLost(job);
  };
  const settle = (worker, job, result) => {
    if (worker.current !== job || job.finished) return;
    worker.current = null;
    finish(job, result);
    pump();
  };
  const spawn = () => {
    let object;
    try { object = new WorkerImpl(workerUrl, { name: WORKER_NAME, type: 'module' }); }
    catch (_) { retire(); return false; }
    const worker = { object, current: null, urgentStreak: 0 };
    object.addEventListener('message', event => {
      const data = event?.data || {}, job = worker.current;
      if (!job || data.id !== job.id) return;
      if (data.ok === true) settle(worker, job, {
        glb: data.glb, bufferViews: new Map(data.decoded || []), sourceBytes: new Map(data.images || []),
      });
      else settle(worker, job, data.glb ? passthrough(data.glb) : null);
    });
    object.addEventListener('error', event => { event?.preventDefault?.(); retire(); });
    object.addEventListener('messageerror', () => retire());
    workers.push(worker);
    return true;
  };
  const pump = () => {
    if (unavailable) return;
    // Instantiate only demanded workers, not hardwareConcurrency-2 WASM heaps for ONE GLB.
    // Keep the existing maximum and shared CPU budget; asset fidelity is unchanged.
    let idle = workers.reduce((n, worker) => n + (worker.current ? 0 : 1), 0);
    while (queue.length > idle && workers.length < poolSize) {
      if (!spawn()) return;
      idle += 1;
    }
    for (const worker of workers) {
      if (!queue.length) break;
      if (worker.current) continue;
      const urgent = job => job.decodeClass === 'visible' || job.decodeClass === 'deadline';
      let index = queue.findIndex(job => job.decodeClass === 'visible');
      if (index < 0) index = queue.findIndex(job => job.decodeClass === 'deadline');
      if (index < 0) index = 0;
      else if (worker.urgentStreak >= 2) {
        const ambient = queue.findIndex(job => !urgent(job));
        if (ambient >= 0) index = ambient;
      }
      const job = queue.splice(index, 1)[0];
      worker.urgentStreak = urgent(job) ? worker.urgentStreak + 1 : 0;
      worker.current = job;
      Promise.resolve().then(() => budget.acquire({ decodeClass: job.decodeClass, signal: job.controller.signal }))
        .then(release => {
          if (job.finished || worker.current !== job) { release(); return; }
          job.release = release;
          // Queue contention is not a silent worker. Start the execution deadline only
          // once the job owns a decode token and is actually being posted.
          clearTimer(job.timer); job.timer = null;
          if (timeoutMs > 0) job.timer = setTimer(retire, timeoutMs);
          try { worker.object.postMessage({ id: job.id, glb: job.glb }, [job.glb]); }
          catch (_) { settle(worker, job, job.glb?.byteLength > 0 ? passthrough(job.glb) : null); }
        }, () => {
          if (!job.finished) settle(worker, job, passthrough(job.glb));
        });
    }
  };
  const prepasser = {
    get usingWorker() { return !unavailable && workers.length > 0; },
    prepass(glb, request = {}) {
      if (unavailable) return Promise.resolve(passthrough(glb));
      return new Promise(resolve => {
        const job = { id: nextId++, glb, resolve, release: null, timer: null, finished: false,
          controller: new AbortController(), decodeClass: request.decodeClass || activeDecodeClass() };
        if (queueTimeoutMs > 0) job.timer = setTimer(() => {
          // Only this caller waited too long. Its bytes have never left this thread;
          // return them intact without killing unrelated workers/forcing GLB rereads.
          const index = queue.indexOf(job);
          if (index >= 0) queue.splice(index, 1);
          const worker = workers.find(entry => entry.current === job);
          if (worker) worker.current = null;
          finish(job, passthrough(glb));
          pump();
        }, queueTimeoutMs);
        queue.push(job);
        pump();
      });
    },
    dispose: retire,
  };
  return prepasser;
}

let sharedPrepasser = null;
/** Process-wide pre-pass pool shared by every render-package decode. */
export function sharedGlbPrepasser() {
  if (!sharedPrepasser) sharedPrepasser = createGlbPrepasser();
  return sharedPrepasser;
}
