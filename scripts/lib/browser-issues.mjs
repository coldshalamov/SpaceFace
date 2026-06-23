export function collectPageIssues(page, options = {}) {
  const includeWarnings = options.includeWarnings === true;
  const ignoreProbeWarnings = options.ignoreProbeWarnings === true;
  const issues = [];
  const ignoredIssues = [];

  page.on('console', (msg) => {
    const issue = { type: msg.type(), text: msg.text() };
    if (isIgnorableWebglValidation(issue) || (ignoreProbeWarnings && isProbeInducedWarning(issue))) {
      ignoredIssues.push(issue);
      return;
    }
    if (issue.type === 'error' || (includeWarnings && issue.type === 'warning')) issues.push(issue);
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
  };
}

export function isIgnorableWebglValidation(issue) {
  if (!issue || issue.type !== 'error') return false;
  const text = String(issue.text || '').trim();
  return /^(?:THREE\.)+WebGLProgram: Shader Error (?:0|1282) - VALIDATE_STATUS false/.test(text)
    && /Program Info Log:\s*$/.test(text);
}

export function isProbeInducedWarning(issue) {
  if (!issue || issue.type !== 'warning') return false;
  return /GPU stall due to ReadPixels/i.test(String(issue.text || ''));
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
