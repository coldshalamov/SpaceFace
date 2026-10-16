// Shared mobile worker reachability and protocol contract.
//
// This module is used by the deployment probe and the isolated native-worker
// check.  The browser path below is deliberately a real fetch + Worker
// round-trip: the probe must not infer worker health from a capped response
// journal or from a mocked worker.

import { RUNTIME_WORKERS, runtimeWorkerUrl } from '../../../../../../src/render/runtimeWorkers.js';

const CONTRACT_IDS = Object.freeze(['digest', 'prepass']);
const MAX_CRITICAL_RECORDS = 64;
const DEFAULT_RESPONSE_LIMIT = 3000;
const DEFAULT_FAILURE_LIMIT = 500;
const DEFAULT_HOST_MARGIN_MS = 1000;

export const MOBILE_WORKER_CONTRACT_HOST_MARGIN_MS = DEFAULT_HOST_MARGIN_MS;

export const MOBILE_WORKER_CONTRACT_IDS = CONTRACT_IDS;

const workerSpec = id => {
  const spec = RUNTIME_WORKERS.find(entry => entry.id === id);
  if (!spec) throw new Error(`Runtime worker contract entry is missing: ${id}`);
  return spec;
};

export function resolveWorkerContractUrls({
  moduleUrl,
  production = false,
  documentBase,
  releaseBase = '',
} = {}) {
  if (typeof moduleUrl !== 'string' || moduleUrl.length === 0) {
    throw new TypeError('moduleUrl is required to resolve mobile worker URLs');
  }
  const base = documentBase || moduleUrl;
  return Object.fromEntries(CONTRACT_IDS.map(id => [
    id,
    runtimeWorkerUrl(workerSpec(id).id, moduleUrl, { production, documentBase: base, releaseBase }),
  ]));
}

export function isJavaScriptMime(mime) {
  return typeof mime === 'string'
    && /(?:^|\/)(?:java|ecma)script(?:\s*;|$)/i.test(mime.trim());
}

export function isCriticalRuntimeAssetUrl(url) {
  if (typeof url !== 'string' || url.length === 0) return false;
  let pathname;
  try { pathname = new URL(url, 'http://spaceface.invalid/').pathname; }
  catch { return false; }
  return /\.(?:glb|wasm|m?js)$/i.test(pathname)
    || /\/assets\/ships\/motions\/.*\.json$/i.test(pathname);
}

function capPush(list, value, limit) {
  if (list.length < limit) list.push(value);
}

function runtimeWorkerIdForUrl(url) {
  let pathname;
  try { pathname = new URL(url, 'http://spaceface.invalid/').pathname; }
  catch { return null; }
  for (const id of CONTRACT_IDS) {
    const spec = workerSpec(id);
    const sourceName = spec.source.slice(spec.source.lastIndexOf('/') + 1);
    const outputName = spec.output.slice(spec.output.lastIndexOf('/') + 1);
    if (pathname.endsWith(`/${sourceName}`) || pathname.endsWith(`/${outputName}`)) return id;
  }
  return null;
}

export function createMobileResponseLedger({
  responseLimit = DEFAULT_RESPONSE_LIMIT,
  failureLimit = DEFAULT_FAILURE_LIMIT,
  criticalLimit = MAX_CRITICAL_RECORDS,
} = {}) {
  return {
    responses: [],
    responseCount: 0,
    criticalResponses: [],
    criticalResponseCount: 0,
    requestFailures: [],
    requestFailureCount: 0,
    criticalRequestFailures: [],
    criticalRequestFailureCount: 0,
    workerResponseFailures: [],
    workerResponseFailureCount: 0,
    responseLimit,
    failureLimit,
    criticalLimit,
  };
}

export function recordMobileResponse(ledger, response) {
  const entry = {
    url: String(response?.url || ''),
    status: Number(response?.status),
    type: response?.type,
    mime: response?.mime,
    bytes: response?.bytes,
  };
  ledger.responseCount += 1;
  const critical = entry.status >= 400 && isCriticalRuntimeAssetUrl(entry.url);
  if (critical) {
    ledger.criticalResponseCount += 1;
    capPush(ledger.criticalResponses, entry, ledger.criticalLimit);
  }
  const workerId = runtimeWorkerIdForUrl(entry.url);
  const workerFailure = workerId && (entry.status !== 200
    || (entry.status === 200 && !isJavaScriptMime(entry.mime)));
  if (workerFailure) {
    ledger.workerResponseFailureCount += 1;
    capPush(ledger.workerResponseFailures, {
      id: workerId,
      reason: entry.status === 200 ? 'wrong-mime' : 'http-status',
      status: entry.status,
      mime: entry.mime || '',
      url: entry.url,
    }, ledger.criticalLimit);
  }
  capPush(ledger.responses, entry, ledger.responseLimit);
  return { entry, critical };
}

export function recordMobileRequestFailure(ledger, failure) {
  const entry = {
    url: String(failure?.url || ''),
    error: failure?.error,
    resourceType: typeof failure?.resourceType === 'string' ? failure.resourceType : null,
    actorStage: typeof failure?.actorStage === 'string' ? failure.actorStage : null,
    timestamp: typeof failure?.timestamp === 'string' ? failure.timestamp : null,
  };
  ledger.requestFailureCount += 1;
  const critical = isCriticalRuntimeAssetUrl(entry.url);
  if (critical) {
    ledger.criticalRequestFailureCount += 1;
    capPush(ledger.criticalRequestFailures, entry, ledger.criticalLimit);
  }
  capPush(ledger.requestFailures, entry, ledger.failureLimit);
  return { entry, critical };
}

function sameResourceUrl(left, right) {
  try {
    const a = new URL(left);
    const b = new URL(right);
    return a.origin === b.origin && a.pathname === b.pathname;
  } catch { return left === right; }
}

export function observedWorkerFailures(responses, workerUrls, priorFailures = []) {
  const failures = [...priorFailures];
  const seen = new Set(failures.map(failure => `${failure.id}|${failure.reason}|${failure.status}|${failure.url}`));
  const addFailure = failure => {
    const key = `${failure.id}|${failure.reason}|${failure.status}|${failure.url}`;
    if (seen.has(key)) return;
    seen.add(key);
    failures.push(failure);
  };
  for (const id of CONTRACT_IDS) {
    const url = workerUrls?.[id];
    if (!url) continue;
    for (const response of responses || []) {
      if (!sameResourceUrl(response.url, url)) continue;
      if (response.status !== 200) {
        addFailure({ id, reason: 'http-status', status: response.status, url: response.url });
      } else if (!isJavaScriptMime(response.mime)) {
        addFailure({ id, reason: 'wrong-mime', mime: response.mime || '', status: response.status, url: response.url });
      }
    }
  }
  return failures;
}

function fixtureFailure(failures, id, reason, detail = {}) {
  failures.push({ id, reason, ...detail });
}

// Node-only fixture validation for the focused contract test.  It mirrors the
// browser contract's observable outcomes; the browser contract itself remains
// runMobileWorkerContract below and always uses native fetch + Worker objects.
export function validateWorkerContractFixture({ assets = {}, roundTrips = {} } = {}) {
  const failures = [];
  for (const id of CONTRACT_IDS) {
    const asset = assets[id];
    if (!asset || asset.status !== 200) {
      fixtureFailure(failures, id, 'http-status', { status: asset?.status ?? null });
      continue;
    }
    if (!isJavaScriptMime(asset.mime)) {
      fixtureFailure(failures, id, 'wrong-mime', { mime: asset.mime || '' });
      continue;
    }
    const roundTrip = roundTrips[id];
    if (!roundTrip || ['error', 'timeout', 'messageerror', 'badreply'].includes(roundTrip.kind)) {
      fixtureFailure(failures, id, roundTrip?.kind || 'badreply');
      continue;
    }
    if (id === 'digest') {
      if (roundTrip.hex !== roundTrip.expectedHex) fixtureFailure(failures, id, 'digest-mismatch');
      if (roundTrip.returnedText !== 'SpaceFace mobile worker contract') {
        fixtureFailure(failures, id, 'digest-text-mismatch');
      }
    } else if (roundTrip.ok !== true || roundTrip.glbMatches !== true) {
      fixtureFailure(failures, id, 'prepass-bad-reply');
    }
    if (roundTrip.detached !== true) fixtureFailure(failures, id, 'transfer-not-detached');
  }
  return { ok: failures.length === 0, failures };
}

function mobileWorkerContractInPage({ workerUrls, timeoutMs, fetchTimeoutMs }) {
  const isJsMime = mime => typeof mime === 'string'
    && /(?:^|\/)(?:java|ecma)script(?:\s*;|$)/i.test(mime.trim());
  const verifyWorkerAsset = async (id, url) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), fetchTimeoutMs);
    let response;
    let validationError = null;
    try {
      response = await fetch(url, { cache: 'no-store', signal: controller.signal });
      const mime = response.headers.get('content-type') || '';
      if (response.status !== 200) {
        validationError = new Error(`${id} worker asset returned HTTP ${response.status}: ${url}`);
        throw validationError;
      }
      if (!isJsMime(mime)) {
        validationError = new Error(`${id} worker asset has non-JavaScript MIME ${mime || '(missing)'}: ${url}`);
        throw validationError;
      }
      await response.arrayBuffer();
      return { status: response.status, mime };
    } catch (error) {
      if (error === validationError) throw error;
      const reason = controller.signal.aborted ? `timed out after ${fetchTimeoutMs}ms` : String(error?.message || error);
      throw new Error(`${id} worker fetch failed for ${url}: ${reason}`);
    } finally {
      clearTimeout(timer);
    }
  };
  const roundTrip = (id, url, type, message, transfer) => new Promise((resolve, reject) => {
    let worker;
    let timer;
    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { worker?.terminate(); } catch { /* termination is best effort after a response */ }
      fn(value);
    };
    try {
      worker = new Worker(url, { type });
      timer = setTimeout(() => finish(reject, new Error(`${id} worker response timed out after ${timeoutMs}ms`)), timeoutMs);
      worker.onmessage = event => finish(resolve, event.data);
      worker.onerror = event => {
        event.preventDefault?.();
        finish(reject, new Error(`${id} worker error: ${event.message || 'unknown worker error'}`));
      };
      worker.onmessageerror = () => finish(reject, new Error(`${id} worker returned an unreadable reply`));
      worker.postMessage(message, transfer);
    } catch (error) {
      finish(reject, new Error(`${id} worker could not start: ${String(error?.message || error)}`));
    }
  });
  const makeGlb = () => {
    const json = new TextEncoder().encode('{"asset":{"version":"2.0"}}  ');
    const length = Math.ceil(json.byteLength / 4) * 4;
    const glb = new ArrayBuffer(20 + length);
    const view = new DataView(glb);
    view.setUint32(0, 0x46546c67, true); view.setUint32(4, 2, true); view.setUint32(8, glb.byteLength, true);
    view.setUint32(12, length, true); view.setUint32(16, 0x4e4f534a, true);
    new Uint8Array(glb, 20).fill(32); new Uint8Array(glb, 20, json.byteLength).set(json);
    return glb;
  };

  return (async () => {
    const digestAsset = await verifyWorkerAsset('digest', workerUrls.digest);
    const prepassAsset = await verifyWorkerAsset('prepass', workerUrls.prepass);
    const input = new TextEncoder().encode('SpaceFace mobile worker contract');
    const expectedHex = [...new Uint8Array(await crypto.subtle.digest('SHA-256', input))]
      .map(value => value.toString(16).padStart(2, '0')).join('');
    const digest = await roundTrip('digest', workerUrls.digest, 'classic',
      { id: 7, buffer: input.buffer, keep: true }, [input.buffer]);
    if (digest?.hex !== expectedHex) throw new Error(`digest worker returned an unexpected SHA-256: ${digest?.hex || '(missing)'}`);
    if (new TextDecoder().decode(digest?.buffer) !== 'SpaceFace mobile worker contract') {
      throw new Error('digest worker did not return the transferred bytes');
    }
    if (input.byteLength !== 0) throw new Error('digest input ArrayBuffer was not detached');
    const glb = makeGlb();
    const expectedGlb = [...new Uint8Array(glb)];
    const prepass = await roundTrip('prepass', workerUrls.prepass, 'module', { id: 9, glb }, [glb]);
    if (prepass?.ok !== true) throw new Error(`prepass worker returned a failed reply: ${prepass?.error || '(missing)'}`);
    if (JSON.stringify([...new Uint8Array(prepass.glb)]) !== JSON.stringify(expectedGlb)) {
      throw new Error('prepass worker did not return the transferred GLB bytes');
    }
    if (glb.byteLength !== 0) throw new Error('prepass GLB ArrayBuffer was not detached');
    return {
      urls: workerUrls,
      assets: { digest: digestAsset, prepass: prepassAsset },
      digest: { hex: digest.hex, expectedHex, returnedText: 'SpaceFace mobile worker contract', detached: input.byteLength === 0 },
      prepass: { ok: true, glbMatches: true, detached: glb.byteLength === 0 },
      capabilities: { points: navigator.maxTouchPoints ?? null, coarse: matchMedia('(pointer: coarse)').matches,
        touchEvents: 'ontouchstart' in window },
    };
  })();
}

export function mobileWorkerContractHostDeadlineMs({
  timeoutMs = 15000,
  fetchTimeoutMs = 10000,
  marginMs = DEFAULT_HOST_MARGIN_MS,
} = {}) {
  const roundTripMs = Number(timeoutMs);
  const fetchMs = Number(fetchTimeoutMs);
  const margin = Number(marginMs);
  if (![roundTripMs, fetchMs, margin].every(Number.isFinite)
      || roundTripMs < 0 || fetchMs < 0 || margin < 0) {
    throw new TypeError('Worker contract timeouts and host margin must be finite non-negative numbers');
  }
  return (2 * fetchMs) + (2 * roundTripMs) + margin;
}

function withMobileWorkerContractHostDeadline(operation, deadlineMs) {
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(
      `Mobile worker contract host deadline exceeded after ${deadlineMs}ms`)), deadlineMs);
  });
  return Promise.race([operation, deadline]).finally(() => clearTimeout(timer));
}

export async function runMobileWorkerContract(page, {
  workerUrls,
  timeoutMs = 15000,
  fetchTimeoutMs = 10000,
  hostMarginMs = DEFAULT_HOST_MARGIN_MS,
} = {}) {
  if (!page || typeof page.evaluate !== 'function') throw new TypeError('A Playwright page is required');
  if (!workerUrls?.digest || !workerUrls?.prepass) throw new TypeError('digest and prepass worker URLs are required');
  const hostDeadlineMs = mobileWorkerContractHostDeadlineMs({
    timeoutMs, fetchTimeoutMs, marginMs: hostMarginMs,
  });
  try {
    return await withMobileWorkerContractHostDeadline(
      page.evaluate(mobileWorkerContractInPage, { workerUrls, timeoutMs, fetchTimeoutMs }),
      hostDeadlineMs,
    );
  } catch (error) {
    throw new Error(`Mobile worker contract failed: ${String(error?.message || error)}`, { cause: error });
  }
}
