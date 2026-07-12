import { execFile } from 'node:child_process';
import {
  inspectCanonicalRootUrl,
} from './alphaLiveBaselineContracts.mjs';
import { validateEvidenceDocument } from '../../src/contracts/evidenceSchemas.js';

const GPU_PROCESS_FAILURE = /GPU process exited unexpectedly\b|gpu-process-crashed\b|GPU process crashed\b|child-process-gone[^\n]*\bgpu\b|\bgpu\b[^\n]*child-process-gone/i;
const MAIN_PROCESS_FAILURE = /(?:\[FATAL\]|\bFATAL\s*:|\bFATAL\s+ERROR\b)|segmentation fault\b|main process[^\n]*(?:crash(?:ed)?|gone)\b|render-process-gone\b/i;

export function createStrictElectronPageIssueTracker(page) {
  const issues = [];
  const listeners = [];
  const push = (issue) => issues.push({ at: new Date().toISOString(), ...issue });
  const on = (event, handler) => {
    page.on(event, handler);
    listeners.push([event, handler]);
  };

  on('console', (message) => {
    const level = readMaybeFunction(message, 'type') || 'unknown';
    if (level === 'error' || level === 'warning') {
      push({ source: 'console', level, text: readMaybeFunction(message, 'text') || '' });
    }
  });
  on('pageerror', (error) => {
    push({ source: 'pageerror', level: 'error', text: String(error?.message || error) });
  });
  on('crash', () => {
    push({ source: 'page-crash', level: 'error', text: 'Electron renderer page crashed' });
  });
  on('requestfailed', (request) => {
    push({
      source: 'request',
      level: 'error',
      text: `${readMaybeFunction(request, 'method') || 'REQUEST'} ${readMaybeFunction(request, 'url') || ''} failed: ${readMaybeFunction(request, 'failure')?.errorText || 'unknown'}`,
    });
  });
  on('response', (response) => {
    const status = Number(readMaybeFunction(response, 'status'));
    if (status >= 400) {
      push({ source: 'response', level: 'error', text: `HTTP ${status} ${readMaybeFunction(response, 'url') || ''}` });
    }
  });

  return {
    all: () => issues.slice(),
    errors: () => issues.filter((issue) => issue.level === 'error'),
    stop() {
      for (const [event, handler] of listeners) page.off?.(event, handler);
      listeners.length = 0;
      return issues.slice();
    },
  };
}

export function createStrictElectronApplicationIssueTracker(electronApp) {
  const context = typeof electronApp?.context === 'function' ? electronApp.context() : null;
  const issues = [];
  const removers = [];
  const boundPages = new WeakSet();
  const backfillPromises = new WeakMap();
  const seenConsoleMessages = new WeakSet();
  const seenPageErrors = new WeakSet();
  const seenFailedRequests = new WeakSet();
  const seenResponses = new WeakSet();
  const applicationEvents = [];
  const contextEvents = [];
  const pageEvents = new Set();
  const backfill = Object.fromEntries(['consoleMessages', 'pageErrors', 'requests'].map((name) => [name, {
    supported: null,
    attempted: false,
    completed: false,
    pageCount: 0,
    itemCount: 0,
    unsupportedPageCount: 0,
    errors: [],
  }]));
  let stopped = false;

  const push = (issue) => issues.push({ at: new Date().toISOString(), ...issue });
  const markOnce = (seen, value) => {
    if ((typeof value !== 'object' && typeof value !== 'function') || value === null) return true;
    if (seen.has(value)) return false;
    seen.add(value);
    return true;
  };
  const listen = (emitter, event, handler, telemetry) => {
    if (typeof emitter?.on !== 'function') return false;
    emitter.on(event, handler);
    removers.push(() => emitter.off?.(event, handler));
    telemetry?.push?.(event);
    return true;
  };
  const recordConsole = (message) => {
    if (!markOnce(seenConsoleMessages, message)) return;
    const level = readMaybeFunction(message, 'type') || 'unknown';
    if (level === 'error' || level === 'warning') {
      push({ source: 'console', level, text: readMaybeFunction(message, 'text') || '' });
    }
  };
  const recordPageError = (error) => {
    if (!markOnce(seenPageErrors, error)) return;
    push({ source: 'pageerror', level: 'error', text: String(error?.message || error) });
  };
  const recordFailedRequest = (request, failedEventObserved = false) => {
    const failure = readMaybeFunction(request, 'failure');
    if ((!failure && !failedEventObserved) || !markOnce(seenFailedRequests, request)) return;
    push({
      source: 'request',
      level: 'error',
      text: `${readMaybeFunction(request, 'method') || 'REQUEST'} ${readMaybeFunction(request, 'url') || ''} failed: ${failure?.errorText || 'unknown'}`,
    });
  };
  const recordResponse = (response) => {
    if (!response || !markOnce(seenResponses, response)) return;
    const status = Number(readMaybeFunction(response, 'status'));
    if (status >= 400) {
      push({ source: 'response', level: 'error', text: `HTTP ${status} ${readMaybeFunction(response, 'url') || ''}` });
    }
  };
  const bindPage = (page) => {
    if (!page || boundPages.has(page) || stopped) return page;
    boundPages.add(page);
    const bind = (event, handler) => {
      if (listen(page, event, handler)) pageEvents.add(event);
    };
    bind('console', recordConsole);
    bind('pageerror', recordPageError);
    bind('crash', () => push({ source: 'page-crash', level: 'error', text: 'Electron renderer page crashed' }));
    bind('requestfailed', (request) => recordFailedRequest(request, true));
    bind('response', recordResponse);
    return page;
  };
  const recordBackfillFailure = (name, error) => {
    const serialized = serializeError(error);
    backfill[name].errors.push(serialized);
    push({
      source: 'observation-backfill',
      level: 'error',
      text: `${name} history could not be read: ${serialized.message}`,
    });
  };
  const readHistory = async (page, name, consume) => {
    const status = backfill[name];
    status.pageCount += 1;
    const reader = page?.[name];
    if (typeof reader !== 'function') {
      status.supported = status.supported === true ? true : false;
      status.unsupportedPageCount += 1;
      return;
    }
    status.supported = true;
    status.attempted = true;
    try {
      const values = name === 'requests'
        ? await reader.call(page)
        : await reader.call(page, { filter: 'all' });
      const history = Array.isArray(values) ? values : [];
      status.itemCount += history.length;
      await consume(history);
      status.completed = status.errors.length === 0;
    } catch (error) {
      status.completed = false;
      recordBackfillFailure(name, error);
    }
  };
  const bindAndBackfillPage = (page) => {
    bindPage(page);
    if (!page || stopped) return Promise.resolve();
    const existing = backfillPromises.get(page);
    if (existing) return existing;
    const promise = (async () => {
      await readHistory(page, 'consoleMessages', async (messages) => {
        for (const message of messages) recordConsole(message);
      });
      await readHistory(page, 'pageErrors', async (errors) => {
        for (const error of errors) recordPageError(error);
      });
      await readHistory(page, 'requests', async (requests) => {
        for (const request of requests) {
          recordFailedRequest(request);
          if (typeof request?.response === 'function') recordResponse(await request.response());
        }
      });
    })();
    backfillPromises.set(page, promise);
    return promise;
  };

  listen(electronApp, 'window', bindPage, applicationEvents);
  listen(electronApp, 'console', recordConsole, applicationEvents);
  listen(context, 'page', bindPage, contextEvents);
  listen(context, 'console', recordConsole, contextEvents);
  listen(context, 'weberror', (webError) => recordPageError(readMaybeFunction(webError, 'error') || webError), contextEvents);
  listen(context, 'requestfailed', (request) => recordFailedRequest(request, true), contextEvents);
  listen(context, 'response', recordResponse, contextEvents);

  for (const page of typeof context?.pages === 'function' ? context.pages() : []) bindPage(page);
  for (const page of typeof electronApp?.windows === 'function' ? electronApp.windows() : []) bindPage(page);

  return {
    bindAndBackfillPage,
    all: () => issues.slice(),
    errors: () => issues.filter((issue) => issue.level === 'error'),
    coverage: () => ({
      schema: 'spaceface.electronApplicationIssueCoverage.v1',
      contextAvailable: !!context,
      applicationEvents: [...new Set(applicationEvents)],
      contextEvents: [...new Set(contextEvents)],
      pageEvents: [...pageEvents],
      backfill: Object.fromEntries(Object.entries(backfill).map(([name, status]) => [name, {
        ...status,
        errors: status.errors.map((error) => ({ ...error })),
      }])),
    }),
    stop() {
      if (!stopped) {
        for (const remove of removers.splice(0)) remove();
        stopped = true;
      }
      return issues.slice();
    },
  };
}

export function createElectronCanonicalUrlTracker(targetPage, options = {}) {
  const pollIntervalMs = Math.min(1_000, Math.max(1, Number(options.pollIntervalMs || 75)));
  const bootstrapTimeoutMs = Math.min(30_000, Math.max(1, Number(options.bootstrapTimeoutMs || 10_000)));
  const observations = [];
  const trackerErrors = [];
  const startedAt = new Date().toISOString();
  const startedAtMs = Date.now();
  let sequence = 0;
  let stopping = false;
  let stoppedAt = null;
  let expectedRootUrl = null;
  let canonicalEstablishedAt = null;
  let terminalBootstrapFailure = false;

  const record = (source, url) => {
    const actual = String(url || '');
    const at = new Date().toISOString();
    const common = { sequence: ++sequence, source, at, actual };
    if (!expectedRootUrl) {
      const withinBootstrapWindow = Date.now() - startedAtMs <= bootstrapTimeoutMs;
      if (actual === 'about:blank') {
        const failures = withinBootstrapWindow
          ? []
          : [`about:blank bootstrap exceeded ${bootstrapTimeoutMs} ms`];
        if (failures.length) terminalBootstrapFailure = true;
        const observation = {
          ...common,
          bootstrap: true,
          enforced: false,
          canonicalEstablished: false,
          pass: failures.length === 0,
          failures,
        };
        observations.push(observation);
        return observation;
      }

      const candidate = inspectElectronRootCandidate(actual);
      const failures = candidate.failures.slice();
      if (!withinBootstrapWindow) failures.push(`canonical root arrived after ${bootstrapTimeoutMs} ms bootstrap window`);
      if (terminalBootstrapFailure) failures.push('canonical root arrived after a terminal bootstrap violation');
      const established = failures.length === 0;
      if (established) {
        expectedRootUrl = candidate.actual;
        canonicalEstablishedAt = at;
      } else {
        terminalBootstrapFailure = true;
      }
      const observation = {
        ...common,
        ...candidate,
        bootstrap: false,
        enforced: true,
        canonicalEstablished: established,
        pass: established,
        failures,
      };
      observations.push(observation);
      return observation;
    }

    let check;
    try {
      check = inspectCanonicalRootUrl(actual, expectedRootUrl);
    } catch (error) {
      check = { pass: false, actual, failures: [`invalid observed URL: ${error.message}`] };
    }
    const observation = {
      ...common,
      bootstrap: false,
      enforced: true,
      canonicalEstablished: false,
      ...check,
    };
    observations.push(observation);
    return observation;
  };

  const onFrameNavigated = (frame) => {
    if (frame === targetPage.mainFrame()) {
      record('framenavigated', typeof frame?.url === 'function' ? frame.url() : targetPage.url());
    }
  };
  targetPage.on('framenavigated', onFrameNavigated);
  record('first-window-acquired', targetPage.url());

  const pollPromise = (async () => {
    while (!stopping) {
      await delay(pollIntervalMs);
      if (stopping || targetPage.isClosed()) continue;
      record('node-live-url-poll', targetPage.url());
    }
  })().catch((error) => trackerErrors.push(serializeError(error)));

  const report = () => {
    const violations = observations.filter((observation) => observation.pass !== true);
    const acquisitionCount = observations.filter((observation) => observation.source === 'first-window-acquired').length;
    const canonicalAcquisitionCount = observations.filter((observation) => observation.canonicalEstablished === true).length;
    const canonicalAcquisitionIndex = observations.findIndex((observation) => observation.canonicalEstablished === true);
    const pollObservationCount = observations.filter((observation, index) => (
      observation.source === 'node-live-url-poll'
      && observation.bootstrap !== true
      && observation.pass === true
      && index > canonicalAcquisitionIndex
    )).length;
    return {
      schema: 'spaceface.electronCanonicalUrlLifecycle.v1',
      expectedRootUrl,
      startedAt,
      stoppedAt,
      pollIntervalMs,
      bootstrapTimeoutMs,
      canonicalEstablishedAt,
      observationCount: observations.length,
      acquisitionCount,
      canonicalAcquisitionCount,
      eventObservationCount: observations.filter((observation) => observation.source === 'framenavigated').length,
      pollObservationCount,
      bootstrapObservations: observations.filter((observation) => observation.bootstrap === true),
      observations: observations.slice(),
      violations,
      trackerErrors: trackerErrors.slice(),
      pageClosedWhenStopped: targetPage.isClosed(),
      pass: acquisitionCount === 1 && canonicalAcquisitionCount === 1 && pollObservationCount > 0 && violations.length === 0
        && trackerErrors.length === 0 && targetPage.isClosed(),
    };
  };

  return {
    async waitForCanonicalRoot(timeoutMs = bootstrapTimeoutMs) {
      const waitDeadline = Date.now() + Math.min(bootstrapTimeoutMs, Math.max(1, Number(timeoutMs || bootstrapTimeoutMs)));
      while (!expectedRootUrl) {
        if (terminalBootstrapFailure) {
          const latest = observations[observations.length - 1];
          throw new Error(`Electron canonical bootstrap failed: ${latest?.failures?.join('; ') || latest?.actual || 'unknown violation'}`);
        }
        if (Date.now() >= waitDeadline || Date.now() - startedAtMs > bootstrapTimeoutMs) {
          record('bootstrap-timeout-live', targetPage.url());
          throw new Error(`Electron about:blank bootstrap did not establish a canonical root within ${bootstrapTimeoutMs} ms`);
        }
        await delay(Math.min(pollIntervalMs, Math.max(1, waitDeadline - Date.now())));
      }
      return expectedRootUrl;
    },
    observeNow(source) {
      if (targetPage.isClosed()) return null;
      return record(source, targetPage.url());
    },
    async stopAfterPageClose() {
      stopping = true;
      await pollPromise;
      targetPage.off?.('framenavigated', onFrameNavigated);
      stoppedAt = new Date().toISOString();
      return report();
    },
    report,
  };
}

export function evaluateElectronUrlAcceptance({
  expectedRootUrl,
  observations,
  postFingerprintUrlCheck,
  precloseUrlCheck,
} = {}) {
  const failures = [];
  const checkedObservations = [];
  if (!expectedRootUrl) failures.push('expected Electron canonical root URL is missing');
  if (!Array.isArray(observations) || observations.length === 0) {
    failures.push('Electron first-window event/poll observations are missing');
  } else if (expectedRootUrl) {
    let canonicalSeen = false;
    for (const observation of observations) {
      const actual = observation?.actual || observation?.url || '';
      let check;
      if (observation?.bootstrap === true) {
        const bootstrapFailures = [];
        if (canonicalSeen) bootstrapFailures.push('about:blank bootstrap observation occurred after canonical enforcement began');
        if (actual !== 'about:blank') bootstrapFailures.push(`bootstrap URL must be about:blank, got ${actual || 'missing'}`);
        if (observation.enforced !== false) bootstrapFailures.push('bootstrap observation must be explicitly unenforced');
        if (observation.pass !== true) bootstrapFailures.push(...(observation.failures || ['bootstrap observation failed']));
        check = { pass: bootstrapFailures.length === 0, actual, failures: bootstrapFailures };
      } else {
        try {
          check = inspectCanonicalRootUrl(actual, expectedRootUrl);
        } catch (error) {
          check = { pass: false, actual, failures: [`invalid observed URL: ${error.message}`] };
        }
      }
      const checked = {
        sequence: observation?.sequence ?? checkedObservations.length + 1,
        source: observation?.source || 'unknown',
        at: observation?.at || null,
        bootstrap: observation?.bootstrap === true,
        enforced: observation?.enforced !== false,
        canonicalEstablished: observation?.canonicalEstablished === true,
        ...check,
      };
      checkedObservations.push(checked);
      if (!checked.pass) failures.push(`${checked.source} observation ${checked.sequence} drifted: ${checked.failures.join('; ')}`);
      if (checked.canonicalEstablished) canonicalSeen = true;
    }
    if (checkedObservations.filter((observation) => observation.source === 'first-window-acquired').length !== 1) {
      failures.push('exactly one first-window-acquired observation is required');
    }
    if (checkedObservations.filter((observation) => observation.canonicalEstablished === true).length !== 1) {
      failures.push('exactly one canonical root acquisition observation is required');
    }
    const canonicalAcquisitionIndex = checkedObservations.findIndex((observation) => observation.canonicalEstablished === true);
    if (!checkedObservations.some((observation, index) => (
      observation.source === 'node-live-url-poll'
      && observation.bootstrap !== true
      && observation.pass === true
      && index > canonicalAcquisitionIndex
    ))) {
      failures.push('Node-side live canonical URL poll after root acquisition is missing');
    }
  }

  const postFingerprint = checkRequiredLiveUrl(
    postFingerprintUrlCheck,
    'post-worktree-fingerprint-live',
    expectedRootUrl,
    failures,
  );
  const preclose = checkRequiredLiveUrl(
    precloseUrlCheck,
    'immediately-preclose-live',
    expectedRootUrl,
    failures,
  );
  return {
    pass: failures.length === 0,
    failures,
    expectedRootUrl: expectedRootUrl ? new URL(expectedRootUrl).href : null,
    observationCount: checkedObservations.length,
    observations: checkedObservations,
    postFingerprintUrlCheck: postFingerprint,
    precloseUrlCheck: preclose,
  };
}

export function createElectronProcessMonitor({
  electronApp,
  childProcess,
  maxMessages = 400,
  maxFailureSamples = 32,
  maxMonitorErrorSamples = 32,
  maxPendingFragmentChars = 65_536,
} = {}) {
  const candidatePid = Number(childProcess?.pid);
  const capturedPid = Number.isSafeInteger(candidatePid) && candidatePid > 0 ? candidatePid : null;
  const diagnosticLimit = Math.max(1, Number.isInteger(maxMessages) ? maxMessages : 400);
  const failureSampleLimit = Math.max(1, Number.isInteger(maxFailureSamples) ? maxFailureSamples : 32);
  const monitorErrorSampleLimit = Math.max(1, Number.isInteger(maxMonitorErrorSamples) ? maxMonitorErrorSamples : 32);
  const fragmentLimit = Math.max(16, Number.isInteger(maxPendingFragmentChars) ? maxPendingFragmentChars : 65_536);
  const messages = [];
  const gpuProcessFailures = [];
  const fatalMainMessages = [];
  const processExitEvents = [];
  const processCloseEvents = [];
  const appCloseEvents = [];
  const monitorErrors = [];
  const removers = [];
  const sourceLines = new Map();
  const closeWaiters = new Set();
  const streamCapabilities = {};
  let fatalSequence = 0;
  let gpuProcessFailureCount = 0;
  let fatalMainMessageCount = 0;
  let monitorErrorCount = 0;
  let truncatedCompletedLineCount = 0;
  let closingStarted = false;
  let stopped = false;

  const addListener = (emitter, event, handler) => {
    if (!emitter?.on) return;
    emitter.on(event, handler);
    removers.push(() => emitter.off?.(event, handler));
  };
  const lineState = (source) => {
    if (!sourceLines.has(source)) {
      sourceLines.set(source, {
        partial: '',
        gpuRecorded: false,
        mainRecorded: false,
        overflowRecorded: false,
      });
    }
    return sourceLines.get(source);
  };
  const recordMonitorError = (source, message, details = {}) => {
    monitorErrorCount += 1;
    if (monitorErrors.length >= monitorErrorSampleLimit) return;
    monitorErrors.push({
      at: new Date().toISOString(),
      source,
      name: 'ElectronProcessMonitorError',
      message,
      stack: null,
      ...details,
    });
  };
  const boundTelemetryText = (text) => {
    const originalLength = text.length;
    if (originalLength <= fragmentLimit) return { text, originalLength, truncated: false };
    const marker = '[truncated]';
    const available = Math.max(0, fragmentLimit - marker.length);
    const headLength = Math.ceil(available / 2);
    const tailLength = Math.floor(available / 2);
    return {
      text: `${text.slice(0, headLength)}${marker}${tailLength > 0 ? text.slice(-tailLength) : ''}`,
      originalLength,
      truncated: true,
    };
  };
  const retainDiagnosticLine = (source, retained) => {
    if (!retained.text) return;
    messages.push({ at: new Date().toISOString(), source, ...retained });
    if (messages.length > diagnosticLimit) messages.splice(0, messages.length - diagnosticLimit);
  };
  const classifyLogicalLine = (source, state, text, retained) => {
    if (!state.gpuRecorded && GPU_PROCESS_FAILURE.test(text)) {
      state.gpuRecorded = true;
      gpuProcessFailureCount += 1;
      const failure = {
        sequence: ++fatalSequence,
        at: new Date().toISOString(),
        source,
        ...retained,
      };
      if (gpuProcessFailures.length < failureSampleLimit) gpuProcessFailures.push(failure);
    }
    if (!state.mainRecorded && MAIN_PROCESS_FAILURE.test(text)) {
      state.mainRecorded = true;
      fatalMainMessageCount += 1;
      const failure = {
        sequence: ++fatalSequence,
        at: new Date().toISOString(),
        source,
        ...retained,
      };
      if (fatalMainMessages.length < failureSampleLimit) fatalMainMessages.push(failure);
    }
  };
  const finishLogicalLine = (source, state, text) => {
    const retained = boundTelemetryText(text);
    classifyLogicalLine(source, state, text, retained);
    if (retained.truncated) {
      truncatedCompletedLineCount += 1;
      recordMonitorError(
        'completed-line-truncated',
        `${source} completed process line had ${retained.originalLength} characters and exceeded the ${fragmentLimit}-character telemetry limit`,
        { originalLength: retained.originalLength, retainedLength: retained.text.length },
      );
    }
    retainDiagnosticLine(source, retained);
    state.gpuRecorded = false;
    state.mainRecorded = false;
    state.overflowRecorded = false;
  };
  const ingestChunk = (source, chunk) => {
    const value = String(chunk || '');
    if (!value) return;
    const state = lineState(source);
    state.partial += value;
    while (state.partial) {
      const match = /[\r\n]/.exec(state.partial);
      if (!match) break;
      const line = state.partial.slice(0, match.index);
      let delimiterLength = 1;
      if (state.partial[match.index] === '\r' && state.partial[match.index + 1] === '\n') delimiterLength = 2;
      finishLogicalLine(source, state, line);
      state.partial = state.partial.slice(match.index + delimiterLength);
    }
    if (state.partial.length > fragmentLimit) {
      if (!state.overflowRecorded) {
        recordMonitorError(
          'fragment-overflow',
          `${source} unterminated process fragment exceeded ${fragmentLimit} characters; acceptance cannot prove complete crash diagnostics`,
        );
        state.overflowRecorded = true;
      }
      state.partial = state.partial.slice(-fragmentLimit);
    }
  };
  const onExit = (code, signal) => {
    processExitEvents.push({
      at: new Date().toISOString(),
      code: Number.isInteger(code) ? code : null,
      signal: signal || null,
      expected: closingStarted,
    });
  };
  const onProcessError = (error) => {
    const serialized = serializeError(error);
    recordMonitorError('process-error', serialized.message, {
      name: serialized.name,
      stack: serialized.stack,
    });
  };
  const resolveCloseWaiters = (record) => {
    for (const waiter of [...closeWaiters]) waiter(record);
    closeWaiters.clear();
  };
  const onClose = (code, signal) => {
    const record = {
      at: new Date().toISOString(),
      code: Number.isInteger(code) ? code : null,
      signal: signal || null,
      expected: closingStarted,
    };
    processCloseEvents.push(record);
    resolveCloseWaiters(record);
  };
  const onAppClose = () => {
    appCloseEvents.push({ at: new Date().toISOString(), expected: closingStarted });
  };
  const onAppConsole = (message) => {
    ingestChunk(
      `electron-console:${readMaybeFunction(message, 'type') || 'unknown'}`,
      `${readMaybeFunction(message, 'text') || ''}\n`,
    );
  };

  const attachProcessStream = (name, stream) => {
    const capability = {
      present: !!stream,
      bufferedReadSupported: typeof stream?.read === 'function',
      bufferedChunksConsumed: 0,
    };
    streamCapabilities[name] = capability;
    if (!stream) return;
    if (capability.bufferedReadSupported) {
      while (Number(stream.readableLength || 0) > 0) {
        const buffered = stream.read();
        if (buffered == null) break;
        capability.bufferedChunksConsumed += 1;
        ingestChunk(name, buffered);
      }
    }
    addListener(stream, 'data', (chunk) => ingestChunk(name, chunk));
  };

  attachProcessStream('stdout', childProcess?.stdout);
  attachProcessStream('stderr', childProcess?.stderr);
  addListener(childProcess, 'exit', onExit);
  addListener(childProcess, 'close', onClose);
  addListener(childProcess, 'error', onProcessError);
  addListener(electronApp, 'close', onAppClose);
  addListener(electronApp, 'console', onAppConsole);
  if (childProcess && (childProcess.exitCode != null || childProcess.signalCode != null)) {
    onExit(childProcess.exitCode, childProcess.signalCode);
  }

  const snapshot = () => ({
      schema: 'spaceface.electronProcessMonitor.v1',
      pid: capturedPid,
      closingStarted,
      stopped,
      messages: messages.slice(),
      pendingLineFragments: [...sourceLines.entries()]
        .filter(([, state]) => state.partial.length > 0)
        .map(([source, state]) => ({ source, text: state.partial })),
      processExitEvents: processExitEvents.slice(),
      processCloseEvents: processCloseEvents.slice(),
      appCloseEvents: appCloseEvents.slice(),
      monitorErrors: monitorErrors.slice(),
      monitorErrorCount,
      monitorErrorSampleLimit,
      truncatedCompletedLineCount,
      streamCapabilities: Object.fromEntries(
        Object.entries(streamCapabilities).map(([name, capability]) => [name, { ...capability }]),
      ),
      gpuProcessFailureCount,
      fatalMainMessageCount,
      failureSampleLimit,
      gpuProcessFailures: gpuProcessFailures.map((failure) => ({ ...failure })),
      fatalMainMessages: fatalMainMessages.map((failure) => ({ ...failure })),
      unexpectedProcessExit: processExitEvents.some((event) => event.expected !== true),
      unexpectedProcessClose: processCloseEvents.some((event) => event.expected !== true),
      unexpectedAppClose: appCloseEvents.some((event) => event.expected !== true),
    });

  return {
    childProcess,
    capturedPid,
    markClosing() {
      closingStarted = true;
    },
    async waitForClose(timeoutMs = 15_000) {
      if (processCloseEvents.length > 0) {
        const latest = processCloseEvents[processCloseEvents.length - 1];
        return { closed: true, ...latest };
      }
      return new Promise((resolve) => {
        let settled = false;
        let timer = null;
        const finish = (result) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          closeWaiters.delete(onObservedClose);
          resolve(result);
        };
        const onObservedClose = (record) => finish({ closed: true, ...record });
        closeWaiters.add(onObservedClose);
        const raced = processCloseEvents[processCloseEvents.length - 1];
        if (raced) {
          finish({ closed: true, ...raced });
          return;
        }
        timer = setTimeout(() => finish({
          closed: false,
          exitCode: Number.isInteger(childProcess?.exitCode) ? childProcess.exitCode : null,
          signalCode: childProcess?.signalCode || null,
          timeout: true,
        }), timeoutMs);
      });
    },
    snapshot,
    stop() {
      if (!stopped) {
        for (const [source, state] of sourceLines) {
          if (state.partial) {
            finishLogicalLine(source, state, state.partial);
            state.partial = '';
          }
        }
        for (const remove of removers.splice(0)) remove();
        for (const waiter of [...closeWaiters]) waiter({
          at: new Date().toISOString(),
          code: null,
          signal: null,
          expected: closingStarted,
          monitorStoppedBeforeClose: true,
        });
        closeWaiters.clear();
        stopped = true;
      }
      return snapshot();
    },
  };
}

export function assessElectronProcessHealth(snapshot = {}) {
  const failures = [];
  const gpuFailureCount = Number.isSafeInteger(snapshot.gpuProcessFailureCount)
    ? snapshot.gpuProcessFailureCount
    : (Array.isArray(snapshot.gpuProcessFailures) ? snapshot.gpuProcessFailures.length : 0);
  const mainFailureCount = Number.isSafeInteger(snapshot.fatalMainMessageCount)
    ? snapshot.fatalMainMessageCount
    : (Array.isArray(snapshot.fatalMainMessages) ? snapshot.fatalMainMessages.length : 0);
  if (gpuFailureCount > 0) {
    failures.push(`${gpuFailureCount} GPU process crash message(s) observed`);
  }
  if (mainFailureCount > 0) {
    failures.push(`${mainFailureCount} fatal main/renderer process message(s) observed`);
  }
  if (snapshot.unexpectedProcessExit === true) failures.push('Electron main process exited unexpectedly before owned close');
  if (snapshot.unexpectedProcessClose === true) failures.push('Electron main process streams closed unexpectedly before owned close');
  if (snapshot.unexpectedAppClose === true) failures.push('Electron application closed unexpectedly before owned close');
  const monitorErrorCount = Number.isSafeInteger(snapshot.monitorErrorCount)
    ? snapshot.monitorErrorCount
    : (Array.isArray(snapshot.monitorErrors) ? snapshot.monitorErrors.length : 0);
  if (monitorErrorCount > 0) {
    failures.push(`${monitorErrorCount} Electron process monitor error(s) observed`);
  }
  const badExpectedExit = (Array.isArray(snapshot.processExitEvents) ? snapshot.processExitEvents : [])
    .find((event) => event.expected === true && event.code != null && event.code !== 0);
  if (badExpectedExit) failures.push(`Electron process returned nonzero exit code ${badExpectedExit.code} during owned close`);
  const terminationSignals = new Set([
    ...(Array.isArray(snapshot.processExitEvents) ? snapshot.processExitEvents : []).map((event) => event.signal),
    ...(Array.isArray(snapshot.processCloseEvents) ? snapshot.processCloseEvents : []).map((event) => event.signal),
  ].filter(Boolean));
  if (terminationSignals.size > 0) {
    failures.push(`Electron process terminated by signal(s): ${[...terminationSignals].join(', ')}`);
  }
  return { pass: failures.length === 0, failures, snapshot };
}

export async function closeOwnedElectronRuntime(resources, {
  fetchImpl = globalThis.fetch,
  timeoutSignalFactory = (milliseconds) => AbortSignal.timeout(milliseconds),
  waitForProcessCloseImpl = waitForElectronProcessClose,
  forceCloseTreeImpl = forceCloseOwnedElectronTree,
  appCloseTimeoutMs = 15_000,
} = {}) {
  const report = {
    pass: false,
    failures: [],
    precloseUrlCheck: null,
    appCloseCompleted: false,
    pageClosed: false,
    processExited: false,
    gracefulProcessCloseConfirmed: false,
    gracefulProcessClose: null,
    processCloseConfirmed: false,
    processClose: null,
    forceClose: {
      attempted: false,
      ownershipProven: false,
      pid: null,
      platform: process.platform,
      method: null,
      command: null,
      args: null,
      signal: null,
      result: null,
      error: null,
      closeConfirmed: false,
      close: null,
    },
    listenerReleased: false,
    listenerRootCheck: null,
    urlTracker: null,
    processMonitor: null,
    processHealth: null,
  };

  if (resources.page && !resources.page.isClosed() && resources.canonicalUrlTracker) {
    report.precloseUrlCheck = resources.canonicalUrlTracker.observeNow('immediately-preclose-live');
    if (report.precloseUrlCheck?.pass !== true) {
      report.failures.push('immediately-preclose live URL check is missing or failed');
    }
  } else {
    report.failures.push('live Electron page or canonical URL tracker was unavailable immediately before close');
  }

  resources.processMonitor?.markClosing();
  if (!resources.electronApp || typeof resources.electronApp.close !== 'function') {
    report.failures.push('owned Electron application handle is missing');
  } else {
    try {
      await withTimeout(resources.electronApp.close(), appCloseTimeoutMs, 'Electron application close');
      report.appCloseCompleted = true;
    } catch (error) {
      report.failures.push(`Electron application close failed: ${error.message || error}`);
    }
  }

  report.pageClosed = resources.page ? resources.page.isClosed() : false;
  if (!report.pageClosed) report.failures.push('Electron page remained open after application close');

  if (resources.canonicalUrlTracker) {
    try {
      report.urlTracker = await resources.canonicalUrlTracker.stopAfterPageClose();
      if (report.urlTracker.pass !== true) report.failures.push('Electron canonical URL lifecycle did not pass through page closure');
    } catch (error) {
      report.failures.push(`Electron canonical URL tracker failed during close: ${error.message || error}`);
    }
  } else {
    report.failures.push('Electron canonical URL tracker was not created');
  }

  try {
    report.gracefulProcessClose = await waitForProcessCloseImpl(
      resources.childProcess,
      appCloseTimeoutMs,
      resources.processMonitor,
    );
    report.gracefulProcessCloseConfirmed = report.gracefulProcessClose?.closed === true;
    report.processClose = report.gracefulProcessClose;
    report.processCloseConfirmed = report.gracefulProcessCloseConfirmed;
    report.processExited = report.gracefulProcessCloseConfirmed;
    if (!report.gracefulProcessCloseConfirmed) {
      report.failures.push('Electron ChildProcess graceful close was not observed; process exit and stdio drain remain unconfirmed');
    }
  } catch (error) {
    report.failures.push(`Electron ChildProcess graceful close/stdio drain could not be confirmed: ${error.message || error}`);
  }

  if (!report.gracefulProcessCloseConfirmed) {
    const ownership = inspectOwnedElectronChild(resources);
    report.forceClose.ownershipProven = ownership.pass;
    report.forceClose.pid = ownership.pid;
    if (!ownership.pass) {
      report.failures.push(`Electron force-close ownership proof failed: ${ownership.failures.join('; ')}`);
    } else {
      report.forceClose.attempted = true;
      report.failures.push('Electron exact-child force-close fallback was required after graceful close timeout');
      try {
        report.forceClose.result = await forceCloseTreeImpl({
          pid: ownership.pid,
          platform: process.platform,
        });
        report.forceClose.method = report.forceClose.result?.method || null;
        report.forceClose.command = report.forceClose.result?.command || null;
        report.forceClose.args = report.forceClose.result?.args || null;
        report.forceClose.signal = report.forceClose.result?.signal || null;
        if (report.forceClose.result?.pass !== true) {
          report.failures.push(`Electron exact-child process-tree termination failed: ${report.forceClose.result?.error?.message || 'unknown failure'}`);
        }
      } catch (error) {
        report.forceClose.error = serializeError(error);
        report.failures.push(`Electron exact-child force-close failed: ${error.message || error}`);
      }
      try {
        report.forceClose.close = await waitForProcessCloseImpl(
          resources.childProcess,
          appCloseTimeoutMs,
          resources.processMonitor,
        );
        report.forceClose.closeConfirmed = report.forceClose.close?.closed === true;
      } catch (error) {
        report.forceClose.error ||= serializeError(error);
        report.failures.push(`Electron exact-child force-close did not reach ChildProcess close: ${error.message || error}`);
      }
      report.processClose = report.forceClose.close || report.processClose;
      report.processCloseConfirmed = report.forceClose.closeConfirmed;
      report.processExited = report.forceClose.closeConfirmed;
      if (!report.forceClose.closeConfirmed) {
        report.failures.push('Electron exact-child force-close did not prove process exit and stdio drain');
      }
    }
  }

  report.listenerRootCheck = inspectElectronRootCandidate(resources.rootUrl);
  if (report.listenerRootCheck.pass !== true) {
    report.failures.push(`Electron listener refusal requires the exact stable root: ${report.listenerRootCheck.failures.join('; ')}`);
  } else if (typeof fetchImpl !== 'function') {
    report.failures.push('Electron root URL or listener probe is unavailable');
  } else {
    try {
      const signal = timeoutSignalFactory(1_000);
      const options = signal ? { signal } : {};
      await fetchImpl(resources.rootUrl, options);
      report.failures.push('Electron-owned HTTP listener remained reachable after application close');
    } catch (error) {
      if (isConclusiveLoopbackRefusal(error)) {
        report.listenerReleased = true;
      } else {
        report.failures.push(`Electron-owned HTTP listener probe was inconclusive: ${error?.name || 'Error'}: ${error?.message || error}`);
      }
    }
  }

  report.processMonitor = resources.processMonitor?.stop?.()
    || resources.processMonitor?.snapshot?.()
    || null;
  report.processHealth = assessElectronProcessHealth(report.processMonitor || {});
  if (!report.processHealth.pass) report.failures.push(...report.processHealth.failures);

  const assessment = assessElectronCleanup(report);
  report.assessment = assessment;
  report.pass = assessment.pass;
  return report;
}

export function assessElectronCleanup(report = {}) {
  const failures = Array.isArray(report.failures) ? report.failures.slice() : [];
  if (report.appCloseCompleted !== true) failures.push('Electron application close did not complete');
  if (report.pageClosed !== true) failures.push('Electron page closure was not confirmed');
  if (report.gracefulProcessCloseConfirmed !== true) failures.push('Electron process did not reach ChildProcess close through graceful application shutdown');
  if (report.forceClose?.attempted === true) failures.push('Electron exact-child force-close fallback was required');
  if (report.processExited !== true) failures.push('Electron process exit was not confirmed');
  if (report.processCloseConfirmed !== true) failures.push('Electron ChildProcess close and stdio drain were not confirmed');
  if (report.listenerReleased !== true) failures.push('Electron listener release was not confirmed');
  if (report.urlTracker?.pageClosedWhenStopped !== true || report.urlTracker?.pass !== true) {
    failures.push('Electron URL tracker did not stop successfully after page closure');
  }
  if (report.precloseUrlCheck?.pass !== true) failures.push('Electron immediately-preclose URL proof is missing or failed');
  if (report.processHealth?.pass !== true) failures.push('Electron process health did not pass');
  return { pass: failures.length === 0, failures: [...new Set(failures)] };
}

export function validateElectronEvidenceEnvelope(evidence) {
  const validation = validateEvidenceDocument(evidence, { file: 'electron-evidence.json' });
  const failures = validation.issues.map((issue) => `${issue.path}: ${issue.message}`);
  if (evidence?.captureKind !== 'electron') failures.push('captureKind must be electron');
  if (evidence?.runtime?.kind !== 'electron') failures.push('runtime.kind must be electron');
  if (typeof evidence?.runtime?.gpu !== 'string' || !evidence.runtime.gpu.trim()) {
    failures.push('Electron runtime GPU identity must be nonempty');
  }
  if (evidence?.inputSource !== 'keyboard-mouse') failures.push('Electron baseline inputSource must be keyboard-mouse');
  if (evidence?.injectedState !== false) failures.push('Electron baseline cannot inject state or entities');
  if (evidence?.primaryAcceptance !== true) failures.push('Electron baseline must be primary acceptance');
  if (!(Number.isInteger(evidence?.viewport?.width) && evidence.viewport.width >= 1280)) {
    failures.push('Electron baseline CSS content viewport width must be at least 1280');
  }
  if (!(Number.isInteger(evidence?.viewport?.height) && evidence.viewport.height >= 720)) {
    failures.push('Electron baseline CSS content viewport height must be at least 720');
  }
  return { pass: failures.length === 0, failures, schemaValidation: validation };
}

export function assessElectronViewportFloor(runtimeMetadata = {}) {
  const cssViewport = {
    width: Number(runtimeMetadata?.viewport?.width),
    height: Number(runtimeMetadata?.viewport?.height),
  };
  const outerWindow = {
    width: Number(runtimeMetadata?.window?.outerWidth),
    height: Number(runtimeMetadata?.window?.outerHeight),
  };
  const screen = {
    width: Number(runtimeMetadata?.screen?.width),
    height: Number(runtimeMetadata?.screen?.height),
  };
  const deviceScaleFactor = Number(runtimeMetadata?.deviceScaleFactor);
  const failures = [];
  if (!Number.isInteger(cssViewport.width) || cssViewport.width < 1280) {
    failures.push(`CSS content viewport width must be at least 1280, got ${cssViewport.width}`);
  }
  if (!Number.isInteger(cssViewport.height) || cssViewport.height < 720) {
    failures.push(`CSS content viewport height must be at least 720, got ${cssViewport.height}`);
  }
  for (const [label, dimensions] of [['outer window', outerWindow], ['screen', screen]]) {
    if (!Number.isFinite(dimensions.width) || dimensions.width <= 0
      || !Number.isFinite(dimensions.height) || dimensions.height <= 0) {
      failures.push(`${label} width and height must be recorded as positive numbers`);
    }
  }
  if (!Number.isFinite(deviceScaleFactor) || deviceScaleFactor <= 0) {
    failures.push(`device scale factor must be recorded as a positive number, got ${deviceScaleFactor}`);
  }
  return {
    schema: 'spaceface.electronViewportFloorAssessment.v1',
    pass: failures.length === 0,
    failures,
    floor: { width: 1280, height: 720, unit: 'css-pixels' },
    cssViewport,
    outerWindow,
    screen,
    deviceScaleFactor,
  };
}

export function assessElectronScreenshotDimensions(screenshots) {
  const failures = [];
  const records = Array.isArray(screenshots) ? screenshots.map((entry) => ({
    name: String(entry?.name || ''),
    width: Number(entry?.width),
    height: Number(entry?.height),
    bytes: Number(entry?.bytes),
  })) : [];
  if (records.length === 0) failures.push('at least one parsed Electron PNG screenshot is required');
  for (const record of records) {
    if (!record.name) failures.push('parsed Electron PNG screenshot name is missing');
    if (!Number.isInteger(record.width) || record.width < 1440) {
      failures.push(`${record.name || 'screenshot'} physical PNG width must be at least 1440, got ${record.width}`);
    }
    if (!Number.isInteger(record.height) || record.height < 900) {
      failures.push(`${record.name || 'screenshot'} physical PNG height must be at least 900, got ${record.height}`);
    }
    if (!Number.isInteger(record.bytes) || record.bytes <= 0) {
      failures.push(`${record.name || 'screenshot'} PNG byte count must be positive`);
    }
  }
  return {
    schema: 'spaceface.electronScreenshotDimensionAssessment.v1',
    pass: failures.length === 0,
    failures,
    floor: { width: 1440, height: 900, unit: 'physical-pixels' },
    screenshots: records,
  };
}

export async function runGuardedElectronPublication({ acceptedPhase, failurePhase } = {}) {
  if (typeof acceptedPhase !== 'function') throw new TypeError('acceptedPhase must be a function');
  if (typeof failurePhase !== 'function') throw new TypeError('failurePhase must be a function');
  try {
    return { pass: true, accepted: await acceptedPhase(), error: null, failure: null };
  } catch (error) {
    try {
      return {
        pass: false,
        accepted: null,
        error: serializeError(error),
        failure: await failurePhase(error),
      };
    } catch (failureError) {
      throw new AggregateError(
        [error, failureError],
        'Electron accepted publication failed and its structured failure packet could not be published',
        { cause: error },
      );
    }
  }
}

export function evaluateElectronPublicationReadiness({
  routeResult,
  urlAcceptance,
  processHealth,
  cleanup,
  pageErrors,
  pageIssueCoverage,
  viewportFloorAssessment,
  screenshotDimensionAssessment,
  fingerprints,
  evidenceValidation,
} = {}) {
  const failures = [];
  if (routeResult?.pass !== true) failures.push('shared public route did not pass');
  if (urlAcceptance?.pass !== true) failures.push('Electron canonical URL acceptance did not pass');
  if (processHealth?.pass !== true) failures.push('Electron process health did not pass');
  if (cleanup?.pass !== true) failures.push('owned Electron cleanup did not pass');
  if (!Array.isArray(pageErrors)) failures.push('strict Electron page error collection is missing');
  else if (pageErrors.length > 0) failures.push(`${pageErrors.length} strict Electron page/request error(s) observed`);
  if (pageIssueCoverage?.schema !== 'spaceface.electronApplicationIssueCoverage.v1') {
    failures.push('Electron application/context issue coverage telemetry is missing');
  } else {
    if (pageIssueCoverage.contextAvailable !== true) failures.push('Electron BrowserContext issue observation was unavailable');
    for (const event of ['window', 'console']) {
      if (!pageIssueCoverage.applicationEvents?.includes(event)) failures.push(`ElectronApplication ${event} observation was not attached`);
    }
    for (const event of ['page', 'console', 'weberror', 'requestfailed', 'response']) {
      if (!pageIssueCoverage.contextEvents?.includes(event)) failures.push(`BrowserContext ${event} observation was not attached`);
    }
    for (const name of ['consoleMessages', 'pageErrors', 'requests']) {
      const status = pageIssueCoverage.backfill?.[name];
      if (typeof status?.supported !== 'boolean') failures.push(`${name} backfill support was not inspected`);
      else if (status.supported === true && (status.attempted !== true || status.completed !== true)) {
        failures.push(`${name} retained history backfill did not complete`);
      }
    }
  }
  if (viewportFloorAssessment?.schema !== 'spaceface.electronViewportFloorAssessment.v1'
    || viewportFloorAssessment.pass !== true) {
    failures.push('Electron CSS viewport-floor assessment did not pass');
  }
  if (screenshotDimensionAssessment?.schema !== 'spaceface.electronScreenshotDimensionAssessment.v1'
    || screenshotDimensionAssessment.pass !== true) {
    failures.push('Electron physical PNG dimension assessment did not pass');
  }
  const startDigest = fingerprints?.start?.digest;
  if (!startDigest) failures.push('starting worktree fingerprint is missing');
  for (const [label, fingerprint] of [
    ['after route', fingerprints?.afterRoute],
    ['after cleanup', fingerprints?.afterCleanup],
  ]) {
    if (!fingerprint?.digest) failures.push(`${label} worktree fingerprint is missing`);
    else if (startDigest && fingerprint.digest !== startDigest) failures.push(`worktree changed ${label}`);
  }
  if (evidenceValidation?.pass !== true) failures.push('Electron evidence envelope did not pass');
  return { pass: failures.length === 0, failures };
}

export async function waitForElectronProcessClose(childProcess, timeoutMs = 15_000, processMonitor = null) {
  if (!childProcess) return { closed: false, exitCode: null, signalCode: null, missing: true };
  if (!processMonitor || typeof processMonitor.waitForClose !== 'function') {
    return {
      closed: false,
      exitCode: Number.isInteger(childProcess.exitCode) ? childProcess.exitCode : null,
      signalCode: childProcess.signalCode || null,
      missingRaceSafeMonitor: true,
    };
  }
  return processMonitor.waitForClose(timeoutMs);
}

export async function forceCloseOwnedElectronTree({
  pid,
  platform = process.platform,
  execFileImpl = execFile,
  killProcessGroupImpl = (groupPid, signal) => process.kill(groupPid, signal),
} = {}) {
  if (!Number.isSafeInteger(pid) || pid <= 0) {
    throw new TypeError(`Electron force-close PID must be a positive safe integer, got ${pid}`);
  }
  if (platform === 'win32') {
    const command = 'taskkill.exe';
    const args = ['/PID', String(pid), '/T', '/F'];
    const options = {
      windowsHide: true,
      shell: false,
      timeout: 5_000,
      encoding: 'utf8',
    };
    return new Promise((resolve) => {
      const finish = (error, stdout = '', stderr = '') => resolve({
        pass: !error,
        method: 'windows-taskkill-tree',
        pid,
        command,
        args,
        signal: null,
        stdout: boundProcessCommandOutput(stdout),
        stderr: boundProcessCommandOutput(stderr),
        error: error ? serializeError(error) : null,
      });
      try {
        execFileImpl(command, args, options, finish);
      } catch (error) {
        finish(error);
      }
    });
  }

  const groupPid = -pid;
  const signal = 'SIGKILL';
  try {
    killProcessGroupImpl(groupPid, signal);
    return {
      pass: true,
      method: 'posix-process-group',
      pid,
      groupPid,
      command: null,
      args: null,
      signal,
      error: null,
    };
  } catch (error) {
    return {
      pass: false,
      method: 'posix-process-group',
      pid,
      groupPid,
      command: null,
      args: null,
      signal,
      error: serializeError(error),
    };
  }
}

function inspectOwnedElectronChild(resources = {}) {
  const failures = [];
  const candidate = resources.childProcess;
  const captured = resources.processMonitor?.childProcess;
  const monitorSnapshot = resources.processMonitor?.snapshot?.() || {};
  const pid = Number(candidate?.pid);
  const capturedPid = Number(monitorSnapshot.pid);
  if (!candidate) failures.push('captured Electron ChildProcess handle is missing');
  if (candidate !== captured) failures.push('cleanup ChildProcess is not the exact object captured by the launch process monitor');
  if (candidate?.exitCode != null || candidate?.signalCode != null || monitorSnapshot.processExitEvents?.length > 0) {
    failures.push('captured Electron ChildProcess has already exited or been signaled, so its OS PID is no longer safe to target');
  }
  if (!Number.isSafeInteger(pid) || pid <= 0) failures.push(`captured Electron ChildProcess PID is invalid: ${candidate?.pid}`);
  if (!Number.isSafeInteger(capturedPid) || capturedPid !== pid) {
    failures.push(`launch monitor PID ${capturedPid || 'missing'} does not match cleanup PID ${pid || 'missing'}`);
  }
  return { pass: failures.length === 0, failures, pid: Number.isSafeInteger(pid) && pid > 0 ? pid : null };
}

function boundProcessCommandOutput(value, limit = 4_096) {
  const text = String(value || '');
  if (text.length <= limit) return text;
  const marker = '...[truncated]';
  return `${text.slice(0, limit - marker.length)}${marker}`;
}

function checkRequiredLiveUrl(observation, requiredSource, expectedRootUrl, failures) {
  if (!observation) {
    failures.push(`${requiredSource} observation is missing`);
    return null;
  }
  if (observation.source !== requiredSource) {
    failures.push(`${requiredSource} observation has wrong source ${observation.source || 'missing'}`);
  }
  if (!expectedRootUrl) return { ...observation, pass: false };
  let check;
  try {
    check = inspectCanonicalRootUrl(observation.actual || observation.url || '', expectedRootUrl);
  } catch (error) {
    check = { pass: false, actual: observation.actual || observation.url || '', failures: [`invalid live URL: ${error.message}`] };
  }
  if (!check.pass) failures.push(`${requiredSource} drifted: ${check.failures.join('; ')}`);
  return { ...observation, ...check };
}

function inspectElectronRootCandidate(actualUrl) {
  const failures = [];
  let actual;
  try {
    actual = new URL(actualUrl);
  } catch (error) {
    return {
      pass: false,
      actual: String(actualUrl || ''),
      origin: '',
      pathname: '',
      search: '',
      hash: '',
      failures: [`invalid Electron root URL: ${error.message}`],
    };
  }
  if (actual.protocol !== 'http:') failures.push(`Electron root protocol must be http:, got ${actual.protocol}`);
  if (actual.hostname !== '127.0.0.1') failures.push(`Electron root hostname must be 127.0.0.1, got ${actual.hostname}`);
  if (actual.pathname !== '/') failures.push(`Electron root pathname must be /, got ${actual.pathname}`);
  if (actual.search !== '') failures.push(`Electron root search must be empty, got ${actual.search}`);
  if (actual.hash !== '') failures.push(`Electron root hash must be empty, got ${actual.hash}`);
  if (actual.username || actual.password) failures.push('Electron root cannot contain URL credentials');
  const port = Number(actual.port);
  if (!Number.isSafeInteger(port) || port <= 0 || port > 65_535) {
    failures.push(`Electron root must expose a concrete listener port, got ${actual.port || 'missing'}`);
  } else if (port !== 41_788) {
    failures.push(`Electron primary evidence requires stable save origin port 41788, got ${port}`);
  }
  return {
    pass: failures.length === 0,
    actual: actual.href,
    origin: actual.origin,
    pathname: actual.pathname,
    search: actual.search,
    hash: actual.hash,
    failures,
  };
}

function readMaybeFunction(owner, key) {
  const value = owner?.[key];
  return typeof value === 'function' ? value.call(owner) : value;
}

function isConclusiveLoopbackRefusal(error) {
  const chain = [];
  for (let current = error, depth = 0; current && depth < 5; current = current.cause, depth += 1) {
    chain.push(`${current.code || ''} ${current.name || ''} ${current.message || ''}`);
  }
  return /ECONNREFUSED|connection refused/i.test(chain.join(' | '));
}

function serializeError(error) {
  return { name: error?.name || 'Error', message: error?.message || String(error), stack: error?.stack || null };
}

function withTimeout(promise, timeoutMs, label) {
  let timer;
  return Promise.race([
    Promise.resolve(promise),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs} ms`)), timeoutMs);
    }),
  ]).finally(() => clearTimeout(timer));
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
