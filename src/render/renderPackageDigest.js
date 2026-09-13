// SHA-256 for render package verification (renderPackageLoader.js), computed in a dedicated worker.
//
// Every render package is hashed once before it is parsed: ~125 MB of GLB per boot plus every package
// streamed in flight. On the calling thread that hashing showed up as ~0.27 s of main-thread `digest` over
// a jump to Ceres and 8 s there (2026-09-13 jump profile). The worker gets its own copy of the bytes (a
// copy costs far less than hashing), so the caller keeps its buffer for parsing and a failing worker never
// takes the only copy with it. If workers are unavailable, the worker errors, answers with an error, or
// does not answer in time, the hash is computed on the calling thread: the previous behaviour.

const WORKER_NAME = 'spaceface-render-package-digest';
const REQUEST_TIMEOUT_MS = 20_000;

function defaultWorkerUrl() {
  try {
    return new URL('./renderPackageDigestWorker.js', import.meta.url).href;
  } catch (_) {
    return null;
  }
}

export function hexOfDigest(digest) {
  const bytes = new Uint8Array(digest);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, '0');
  return hex;
}

export async function sha256HexOnCallingThread(bytes, cryptoImpl = globalThis.crypto) {
  if (!cryptoImpl || !cryptoImpl.subtle) throw new Error('Web Crypto SHA-256 is required to verify render packages.');
  return hexOfDigest(await cryptoImpl.subtle.digest('SHA-256', bytes));
}

export function createRenderPackageDigester(options = {}) {
  const WorkerImpl = Object.prototype.hasOwnProperty.call(options, 'WorkerImpl') ? options.WorkerImpl : globalThis.Worker;
  const workerUrl = options.workerUrl || defaultWorkerUrl();
  const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : REQUEST_TIMEOUT_MS;
  // Resolved per call so a replaced global crypto is honoured, as the direct call always did.
  const cryptoOf = () => options.cryptoImpl || globalThis.crypto;
  let worker = null;
  let unavailable = typeof WorkerImpl !== 'function' || !workerUrl;
  let nextId = 1;
  const pending = new Map();

  const retire = () => {
    unavailable = true;
    const current = worker;
    worker = null;
    if (current) {
      try { current.terminate(); } catch (_) { /* already gone */ }
    }
    const waiting = [...pending.values()];
    pending.clear();
    for (const entry of waiting) entry.fallback();
  };

  const ensureWorker = () => {
    if (worker || unavailable) return worker;
    try {
      worker = new WorkerImpl(workerUrl, { name: WORKER_NAME });
    } catch (_) {
      worker = null;
      unavailable = true;
      return null;
    }
    worker.addEventListener('message', (event) => {
      const data = (event && event.data) || {};
      const entry = pending.get(data.id);
      if (!entry) return;
      pending.delete(data.id);
      if (typeof data.hex === 'string') entry.resolve(data.hex);
      else entry.fallback();
    });
    worker.addEventListener('error', (event) => {
      if (event && typeof event.preventDefault === 'function') event.preventDefault();
      retire();
    });
    return worker;
  };

  return {
    get usingWorker() {
      return !!worker && !unavailable;
    },
    sha256Hex(bytes) {
      const target = ensureWorker();
      if (!target) return sha256HexOnCallingThread(bytes, cryptoOf());
      return new Promise((resolve, reject) => {
        const id = nextId++;
        let timer = null;
        const clear = () => {
          if (timer != null) clearTimeout(timer);
          timer = null;
        };
        const entry = {
          resolve: (hex) => {
            clear();
            resolve(hex);
          },
          fallback: () => {
            clear();
            sha256HexOnCallingThread(bytes, cryptoOf()).then(resolve, reject);
          },
        };
        pending.set(id, entry);
        if (timeoutMs > 0) {
          timer = setTimeout(() => {
            if (!pending.has(id)) return;
            pending.delete(id);
            entry.fallback();
          }, timeoutMs);
        }
        try {
          const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
          const copy = view.slice().buffer;
          target.postMessage({ id, buffer: copy }, [copy]);
        } catch (_) {
          pending.delete(id);
          entry.fallback();
        }
      });
    },
    dispose() {
      retire();
    },
  };
}
