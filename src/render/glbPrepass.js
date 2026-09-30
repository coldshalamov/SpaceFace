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
import { deadlineDecodeActive, resolveDecodeTaskBudgetLimit, sharedDecodeTaskBudget } from './decodeTaskBudget.js';

const WORKER_NAME = 'spaceface-glb-prepass';
const REQUEST_TIMEOUT_MS = 20_000;

function defaultWorkerUrl() {
  try {
    return new URL('./glbPrepassWorker.js', import.meta.url).href;
  } catch (_) {
    return null;
  }
}

export function createGlbPrepasser(options = {}) {
  const WorkerImpl = Object.prototype.hasOwnProperty.call(options, 'WorkerImpl') ? options.WorkerImpl : globalThis.Worker;
  const workerUrl = options.workerUrl || defaultWorkerUrl();
  const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : REQUEST_TIMEOUT_MS;
  const budget = options.budget || sharedDecodeTaskBudget();
  const cores = Number.isFinite(options.cores)
    ? options.cores
    : (typeof navigator !== 'undefined' && Number.isFinite(navigator.hardwareConcurrency)
      ? navigator.hardwareConcurrency : 4);
  // Pool size matches the shared decode budget: the budget only ever lets that many decode tasks
  // run at once, so more workers would sit token-starved and fewer would strand budget capacity.
  const poolSize = Math.max(1, resolveDecodeTaskBudgetLimit(cores));
  const workers = [];
  const queue = [];
  let unavailable = typeof WorkerImpl !== 'function' || !workerUrl;
  let nextId = 1;

  const settle = (worker, job, result) => {
    if (worker.current !== job) return;
    worker.current = null;
    clearTimeout(job.timer);
    job.timer = null;
    if (job.release) { const release = job.release; job.release = null; release(); }
    job.resolve(result);
    pump();
  };

  // The worker died mid-job. If postMessage already transferred the buffer it is gone — resolve
  // null so the caller re-reads the package; otherwise the caller still owns it and gets it back.
  const settleLost = (job) => {
    clearTimeout(job.timer);
    job.timer = null;
    if (job.release) { job.release(); job.release = null; }
    if (job.glb && job.glb.byteLength > 0) {
      job.resolve({ glb: job.glb, bufferViews: null, sourceBytes: null });
    } else {
      job.resolve(null);
    }
  };

  const retire = () => {
    unavailable = true;
    const stuck = queue.splice(0);
    for (const worker of workers) {
      const job = worker.current;
      worker.current = null;
      try { worker.object.terminate(); } catch (_) { /* already gone */ }
      if (job) settleLost(job);
    }
    workers.length = 0;
    for (const job of stuck) settleLost(job);
  };

  const spawn = () => {
    let object = null;
    try {
      object = new WorkerImpl(workerUrl, { name: WORKER_NAME, type: 'module' });
    } catch (_) {
      unavailable = true;
      return false;
    }
    const worker = { object, current: null };
    object.addEventListener('message', (event) => {
      const data = (event && event.data) || {};
      const job = worker.current;
      if (!job || data.id !== job.id) return;
      if (data.ok === true) {
        settle(worker, job, {
          glb: data.glb,
          bufferViews: new Map(data.decoded || []),
          sourceBytes: new Map(data.images || []),
        });
      } else if (data.glb) {
        // Clean worker-side failure with the buffer handed back: caller parses it stock.
        settle(worker, job, { glb: data.glb, bufferViews: null, sourceBytes: null });
      } else {
        settle(worker, job, null);
      }
    });
    object.addEventListener('error', (event) => {
      if (event && typeof event.preventDefault === 'function') event.preventDefault();
      retire();
    });
    workers.push(worker);
    return true;
  };

  const pump = () => {
    for (const worker of workers) {
      if (!queue.length) return;
      if (worker.current) continue;
      // Deadline-class jobs splice ahead of queued ambient jobs (FIFO within each class),
      // mirroring the shared decode budget's waiter order — a deadline decode must not sit
      // behind a deep ambient queue waiting for a free worker.
      let idx = queue.findIndex((job) => job.decodeClass === 'deadline');
      if (idx < 0) idx = 0;
      const job = queue.splice(idx, 1)[0];
      worker.current = job;
      budget.acquire(job.decodeClass || (deadlineDecodeActive() ? 'deadline' : 'ambient')).then((release) => {
        if (worker.current !== job) { release(); return; } // retired while waiting for the token
        job.release = release;
        try {
          worker.object.postMessage({ id: job.id, glb: job.glb }, [job.glb]);
        } catch (_) {
          // postMessage threw before the transfer happened: the caller still owns its buffer.
          settle(worker, job, { glb: job.glb, bufferViews: null, sourceBytes: null });
        }
      });
    }
  };

  const prepasser = {
    get usingWorker() {
      return !unavailable && workers.length > 0;
    },
    /**
     * Runs the structural pre-pass on a transferred GLB ArrayBuffer. Resolves
     * { glb, bufferViews, sourceBytes } — glb is always the buffer to parse (either the same one
     * handed back, or the untouched input when no worker is available); bufferViews/sourceBytes
     * are Maps keyed by bufferView index, or null when the worker declined/failed. Resolves null
     * only when the buffer was lost with the worker: the caller must re-read the package.
     */
    prepass(glb, options = {}) {
      if (unavailable) return Promise.resolve({ glb, bufferViews: null, sourceBytes: null });
      while (workers.length < poolSize) {
        if (!spawn()) break;
      }
      if (!workers.length) return Promise.resolve({ glb, bufferViews: null, sourceBytes: null });
      return new Promise((resolve) => {
        const job = {
          id: nextId++,
          glb,
          resolve,
          release: null,
          timer: null,
          decodeClass: options.decodeClass
            || (deadlineDecodeActive() ? 'deadline' : 'ambient'),
        };
        if (timeoutMs > 0) {
          job.timer = setTimeout(() => {
            // A silent worker is retired whole: the buffer went with it.
            retire();
          }, timeoutMs);
        }
        queue.push(job);
        pump();
      });
    },
    dispose() {
      retire();
    },
  };
  return prepasser;
}

let sharedPrepasser = null;

/** Process-wide pre-pass pool shared by every render-package decode. */
export function sharedGlbPrepasser() {
  if (!sharedPrepasser) sharedPrepasser = createGlbPrepasser();
  return sharedPrepasser;
}
