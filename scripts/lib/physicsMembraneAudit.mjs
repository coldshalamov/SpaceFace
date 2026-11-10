// Fail-closed source audit for gameplay paths that may request physics work but may not own motion.
// The scanner intentionally accepts source strings so checks can prove the negative case by
// injecting a violation without modifying the working tree.

const DIRECT_VELOCITY_WRITE = /(?:\.\s*(?:vel|velocity)|\[\s*['"](?:vel|velocity)['"]\s*\])\s*(?:(?:\.\s*[xyz]|\[\s*['"][xyz]['"]\s*\])\s*)?(?:\+\+|--|(?:\*\*|[+\-*/%])?=(?!=|>))/g;

export function auditPhysicsMembraneSources(entries = []) {
  const issues = [];
  for (const entry of entries) {
    const path = String(entry && entry.path || '<unknown>');
    const source = String(entry && entry.source || '');
    const sanitized = stripCommentsAndStrings(source);
    DIRECT_VELOCITY_WRITE.lastIndex = 0;
    let match;
    while ((match = DIRECT_VELOCITY_WRITE.exec(sanitized))) {
      const line = 1 + countNewlinesBefore(sanitized, match.index);
      issues.push({
        code: 'direct-velocity-write',
        path,
        line,
        excerpt: sourceLine(source, line),
      });
      if (match[0].length === 0) DIRECT_VELOCITY_WRITE.lastIndex++;
    }
  }
  return issues;
}

function stripCommentsAndStrings(source) {
  let out = '';
  let mode = 'code';
  let quote = '';
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    const next = source[i + 1];
    if (mode === 'line-comment') {
      if (char === '\n') { mode = 'code'; out += '\n'; }
      else out += ' ';
      continue;
    }
    if (mode === 'block-comment') {
      if (char === '*' && next === '/') { out += '  '; i++; mode = 'code'; }
      else out += char === '\n' ? '\n' : ' ';
      continue;
    }
    if (mode === 'string') {
      if (char === '\\') {
        out += ' ';
        if (i + 1 < source.length) { out += source[i + 1] === '\n' ? '\n' : ' '; i++; }
      } else if (char === quote) {
        out += ' ';
        mode = 'code';
      } else {
        out += char === '\n' ? '\n' : ' ';
      }
      continue;
    }
    if (char === '/' && next === '/') { out += '  '; i++; mode = 'line-comment'; continue; }
    if (char === '/' && next === '*') { out += '  '; i++; mode = 'block-comment'; continue; }
    if (char === "'" || char === '"' || char === '`') {
      quote = char;
      out += ' ';
      mode = 'string';
      continue;
    }
    out += char;
  }
  return out;
}

function countNewlinesBefore(source, index) {
  let count = 0;
  for (let i = 0; i < index; i++) if (source.charCodeAt(i) === 10) count++;
  return count;
}

function sourceLine(source, lineNumber) {
  return String(source.split(/\r?\n/)[lineNumber - 1] || '').trim();
}
