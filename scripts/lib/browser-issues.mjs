export function collectPageIssues(page, options = {}) {
  const includeWarnings = options.includeWarnings === true;
  const ignoreProbeWarnings = options.ignoreProbeWarnings === true;
  const issues = [];
  const ignoredIssues = [];
  const activeRequests = new Set();
  const expectedNavigationAborts = new Map();
  const expectedNavigationTokens = new Map();
  let nextExpectedNavigationToken = 1;

  page.on('request', (request) => {
    activeRequests.add(request);
    if (expectedNavigationTokens.size > 0) {
      const labels = expectedNavigationAborts.get(request) || new Set();
      for (const label of expectedNavigationTokens.values()) labels.add(label);
      expectedNavigationAborts.set(request, labels);
    }
  });
  page.on('requestfinished', (request) => {
    activeRequests.delete(request);
    expectedNavigationAborts.delete(request);
  });
  page.on('console', (msg) => {
    const issue = { type: msg.type(), text: msg.text() };
    if (isGenericResourceLoadConsoleError(issue)) return;
    if (isIgnorableWebglValidation(issue) || (ignoreProbeWarnings && isProbeInducedWarning(issue))) {
      ignoredIssues.push(issue);
      return;
    }
    if (issue.type === 'error' || (includeWarnings && issue.type === 'warning')) issues.push(issue);
  });
  page.on('response', (response) => {
    const status = response.status();
    if (status >= 400) {
      issues.push({ type: 'error', text: `HTTP ${status} ${response.url()}` });
    }
  });
  page.on('requestfailed', (request) => {
    const failure = request.failure();
    const expectedNavigation = expectedNavigationAborts.get(request);
    activeRequests.delete(request);
    expectedNavigationAborts.delete(request);
    const issue = {
      type: 'error',
      text: `Request failed ${request.url()}${failure && failure.errorText ? `: ${failure.errorText}` : ''}`,
    };
    if (expectedNavigation && isNavigationCancelledRequest(failure)) {
      ignoredIssues.push({
        ...issue,
        expectedNavigation: [...expectedNavigation],
      });
      return;
    }
    issues.push(issue);
  });
  page.on('pageerror', (err) => {
    issues.push({ type: 'pageerror', text: String(err && err.message || err) });
  });

  return {
    issues,
    ignoredIssues,
    errorIssues() {
      return issues.filter((issue) => issue.type === 'error' || issue.type === 'pageerror');
    },
    warningIssues() {
      return issues.filter((issue) => issue.type === 'warning');
    },
    beginExpectedNavigation(label = 'expected-navigation') {
      const token = nextExpectedNavigationToken++;
      const normalizedLabel = String(label);
      expectedNavigationTokens.set(token, normalizedLabel);
      for (const request of activeRequests) {
        const labels = expectedNavigationAborts.get(request) || new Set();
        labels.add(normalizedLabel);
        expectedNavigationAborts.set(request, labels);
      }
      return token;
    },
    endExpectedNavigation(token) {
      return expectedNavigationTokens.delete(token);
    },
  };
}

export function isNavigationCancelledRequest(failure) {
  return /^net::ERR_ABORTED$/i.test(String(failure && failure.errorText || '').trim());
}

export function isExpectedNavigationTextureAbort(text, phase) {
  return String(phase || '') === 'harness-reload'
    && /^THREE\.GLTFLoader: Couldn't load texture blob:/i.test(String(text || '').trim());
}

export function isGenericResourceLoadConsoleError(issue) {
  if (!issue || issue.type !== 'error') return false;
  return /^Failed to load resource: the server responded with a status of \d+ \([^)]+\)$/i
    .test(String(issue.text || '').trim());
}

export function isIgnorableWebglValidation(issue) {
  if (!issue || issue.type !== 'error') return false;
  const text = String(issue.text || '').trim();
  return /^(?:THREE\.)+WebGLProgram: Shader Error (?:0|1282) - VALIDATE_STATUS false/.test(text)
    && /Program Info Log:\s*$/.test(text);
}

export function isProbeInducedWarning(issue) {
  if (!issue || issue.type !== 'warning') return false;
  const text = String(issue.text || '');
  // Environmental warnings that are not code defects, filtered under --strict-warnings:
  //  - "GPU stall due to ReadPixels": induced by the probe reading the framebuffer for screenshots.
  //  - "KHR_parallel_shader_compile extension not supported": an OPTIONAL Three.js perf extension
  //    absent under software rendering (SwiftShader) but present on hardware GPUs — a capability
  //    notice, not a bug (it never appears on the real-GPU release path).
  return /GPU stall due to ReadPixels/i.test(text)
    || /KHR_parallel_shader_compile extension not supported/i.test(text);
}

export function summarizeIssues(issues) {
  const MAX_ISSUES = 8;
  const MAX_TEXT = 420;
  return (issues || []).slice(0, MAX_ISSUES).map((issue) => {
    const text = String(issue && issue.text || '');
    return {
      type: issue && issue.type || 'unknown',
      text: text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT)}... [truncated ${text.length - MAX_TEXT} chars]` : text,
    };
  });
}
