import { readFileSync, readdirSync } from 'node:fs';
import { basename, extname, join, relative } from 'node:path';

const SCRIPT_EXTENSIONS = new Set(['.js', '.mjs', '.cjs']);
const ALLOWED_WRITERS = new Set([
  'src/core/timeEffects.js',
  'scripts/lib/timeScaleWriterAudit.mjs',
]);
const ASSIGNMENT_OPERATORS = new Set([
  '=', '+=', '-=', '*=', '/=', '%=', '**=', '<<=', '>>=', '>>>=',
  '&=', '|=', '^=', '&&=', '||=', '??=',
]);
const UPDATE_OPERATORS = new Set(['++', '--']);

/**
 * Find explicit JavaScript writes to a property named `timeScale`.
 *
 * This intentionally recognizes mutation syntax rather than matching source text: comments,
 * strings, regular expressions, reads, and equality checks cannot satisfy the audit. Object API
 * writers are covered because they bypass ordinary member-assignment syntax.
 */
export function scanTimeScaleMutations(source, file = '<source>') {
  if (typeof source !== 'string') throw new TypeError('source must be a string');
  return scanSourceMutations(source, file, source, 0, 0);
}

function scanSourceMutations(source, file, outerSource, baseOffset, depth) {
  const tokens = tokenize(source);
  const findings = [];
  const record = (token, kind) => addFinding(
    findings,
    outerSource,
    file,
    { start: baseOffset + token.start },
    kind,
  );

  for (let i = 0; i < tokens.length; i += 1) {
    const dotMember = tokens[i].type === 'identifier'
      && tokens[i].value === 'timeScale'
      && tokens[i - 1] && tokens[i - 1].value === '.';
    const bracketMember = tokens[i].value === '['
      && isTimeScaleString(tokens[i + 1])
      && tokens[i + 2] && tokens[i + 2].value === ']'
      && canEndExpression(tokens[i - 1]);
    if (!dotMember && !bracketMember) continue;

    const propertyToken = dotMember ? tokens[i] : tokens[i + 1];
    const memberEnd = dotMember ? i : i + 2;
    const memberStart = findMemberStart(tokens, dotMember ? i - 2 : i - 1);
    const next = tokens[memberEnd + 1];
    const previous = tokens[memberStart - 1];

    if (next && ASSIGNMENT_OPERATORS.has(next.value)) {
      record(propertyToken, `assignment ${next.value}`);
    } else if (next && UPDATE_OPERATORS.has(next.value)) {
      record(propertyToken, `update ${next.value}`);
    } else if (previous && UPDATE_OPERATORS.has(previous.value)) {
      record(propertyToken, `update ${previous.value}`);
    } else if (previous && previous.type === 'identifier' && previous.value === 'delete') {
      record(propertyToken, 'delete');
    } else {
      const destructuring = findDestructuringAssignment(tokens, memberStart, memberEnd);
      const iteration = findForIterationWrite(tokens, memberStart, memberEnd);
      if (destructuring) record(propertyToken, 'destructuring assignment');
      else if (iteration) record(propertyToken, `for-${iteration}`);
    }
  }

  for (let i = 0; i < tokens.length; i += 1) {
    const objectAssignOpen = matchCallOpen(tokens, i, 'Object', 'assign');
    if (objectAssignOpen >= 0) {
      const close = findMatching(tokens, objectAssignOpen, '(', ')');
      if (close < 0) continue;
      const args = splitCallArguments(tokens, objectAssignOpen + 1, close);
      // The first argument is only the target. A literal there initializes an object but does not
      // copy timeScale into another object; only source arguments are writer payloads.
      for (const argument of args.slice(1)) {
        if (argument.length === 0) continue;
        const start = tokens.indexOf(argument[0]);
        const end = tokens.indexOf(argument[argument.length - 1]) + 1;
        for (const token of findLiteralTimeScaleProperties(tokens, start, end)) {
          record(token, 'Object.assign');
        }
      }
    }

    const reflectSetOpen = matchCallOpen(tokens, i, 'Reflect', 'set');
    if (reflectSetOpen >= 0) {
      const close = findMatching(tokens, reflectSetOpen, '(', ')');
      const args = close < 0 ? [] : splitCallArguments(tokens, reflectSetOpen + 1, close);
      if (isExactTimeScaleArgument(args[1])) {
        record(args[1][0], 'Reflect.set');
      }
    }

    const objectDefinePropertyOpen = matchCallOpen(tokens, i, 'Object', 'defineProperty');
    const reflectDefinePropertyOpen = matchCallOpen(tokens, i, 'Reflect', 'defineProperty');
    const definePropertyOpen = objectDefinePropertyOpen >= 0
      ? objectDefinePropertyOpen
      : reflectDefinePropertyOpen;
    if (definePropertyOpen >= 0) {
      const close = findMatching(tokens, definePropertyOpen, '(', ')');
      const args = close < 0 ? [] : splitCallArguments(tokens, definePropertyOpen + 1, close);
      if (isExactTimeScaleArgument(args[1])) {
        const owner = tokens[i].value;
        record(args[1][0], `${owner}.defineProperty`);
      }
    }

    const objectDefinePropertiesOpen = matchCallOpen(tokens, i, 'Object', 'defineProperties');
    if (objectDefinePropertiesOpen >= 0) {
      const close = findMatching(tokens, objectDefinePropertiesOpen, '(', ')');
      const args = close < 0 ? [] : splitCallArguments(tokens, objectDefinePropertiesOpen + 1, close);
      if (!args[1] || args[1].length === 0) continue;
      const start = tokens.indexOf(args[1][0]);
      const end = tokens.indexOf(args[1][args[1].length - 1]) + 1;
      for (const token of findLiteralTimeScaleProperties(tokens, start, end)) {
        record(token, 'Object.defineProperties');
      }
    }
  }

  // Browser probes commonly keep Runtime.evaluate programs in non-interpolated template strings.
  // Audit those programs recursively while mapping findings back to the containing file/line.
  if (depth < 8) {
    for (const token of tokens) {
      if (!token.template || !token.raw) continue;
      findings.push(...scanSourceMutations(
        token.raw,
        file,
        outerSource,
        baseOffset + token.contentStart,
        depth + 1,
      ));
    }
  }

  return dedupeAndSort(findings);
}

/** Audit production sources plus every check-* / probe-* script. */
export function auditTimeScaleWriters(root) {
  if (typeof root !== 'string' || root.trim() === '') throw new TypeError('root must be a path');
  const files = [
    ...collectScripts(join(root, 'src'), () => true),
    ...collectScripts(join(root, 'scripts'), (file) => /^(?:check-|probe-)/.test(basename(file))),
  ];
  const findings = [];
  for (const absolute of files) {
    const file = normalizePath(relative(root, absolute));
    if (ALLOWED_WRITERS.has(file)) continue;
    findings.push(...scanTimeScaleMutations(readFileSync(absolute, 'utf8'), file));
  }
  return dedupeAndSort(findings);
}

export function formatTimeScaleFindings(findings) {
  if (!Array.isArray(findings) || findings.length === 0) return '(none)';
  return findings
    .map((finding) => `${finding.file}:${finding.line}:${finding.column} ${finding.kind} — ${finding.snippet}`)
    .join('\n');
}

function collectScripts(dir, include) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const absolute = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...collectScripts(absolute, include));
    else if (SCRIPT_EXTENSIONS.has(extname(entry.name)) && include(absolute)) files.push(absolute);
  }
  return files;
}

function matchCallOpen(tokens, index, owner, method) {
  if (!tokens[index] || tokens[index].type !== 'identifier' || tokens[index].value !== owner) return -1;
  if (tokens[index + 1] && tokens[index + 1].value === '.'
    && tokens[index + 2] && tokens[index + 2].type === 'identifier'
    && tokens[index + 2].value === method
    && tokens[index + 3] && tokens[index + 3].value === '(') {
    return index + 3;
  }
  if (tokens[index + 1] && tokens[index + 1].value === '['
    && tokens[index + 2] && tokens[index + 2].type === 'string'
    && tokens[index + 2].value === method
    && tokens[index + 3] && tokens[index + 3].value === ']'
    && tokens[index + 4] && tokens[index + 4].value === '(') {
    return index + 4;
  }
  return -1;
}

function findLiteralTimeScaleProperties(tokens, start, end) {
  const found = [];
  const containers = [];
  for (let i = start; i < end; i += 1) {
    const value = tokens[i].value;
    const parentContainer = containers[containers.length - 1];
    const computed = parentContainer === '{'
      && value === '['
      && tokens[i - 1] && (tokens[i - 1].value === '{' || tokens[i - 1].value === ',')
      && isTimeScaleString(tokens[i + 1])
      && tokens[i + 2] && tokens[i + 2].value === ']'
      && tokens[i + 3] && tokens[i + 3].value === ':';
    if (computed) found.push(tokens[i + 1]);

    if (value === '{' || value === '[' || value === '(') containers.push(value);
    if (value === '}' || value === ']' || value === ')') containers.pop();
    if (containers[containers.length - 1] !== '{') continue;

    const plain = isTimeScalePropertyToken(tokens[i])
      && tokens[i + 1] && (tokens[i + 1].value === ':' || tokens[i + 1].value === ',' || tokens[i + 1].value === '}')
      && tokens[i - 1] && (tokens[i - 1].value === '{' || tokens[i - 1].value === ',');
    if (plain) found.push(tokens[i]);
  }
  return found;
}

function splitCallArguments(tokens, start, end) {
  const args = [];
  let current = [];
  const stack = [];
  for (let i = start; i < end; i += 1) {
    const token = tokens[i];
    if (token.value === ',' && stack.length === 0) {
      args.push(current);
      current = [];
      continue;
    }
    current.push(token);
    if (token.value === '(' || token.value === '[' || token.value === '{') stack.push(token.value);
    else if (token.value === ')' || token.value === ']' || token.value === '}') stack.pop();
  }
  args.push(current);
  return args;
}

function isExactTimeScaleArgument(argument) {
  return !!(argument && argument.length === 1 && isTimeScaleString(argument[0]));
}

function isTimeScalePropertyToken(token) {
  return !!token && ((token.type === 'identifier' && token.value === 'timeScale') || isTimeScaleString(token));
}

function isTimeScaleString(token) {
  return !!token && token.type === 'string' && token.value === 'timeScale';
}

function canEndExpression(token) {
  if (!token) return false;
  return token.type === 'identifier' || token.type === 'number' || token.type === 'string'
    || token.value === ')' || token.value === ']';
}

function findMemberStart(tokens, baseEnd) {
  let start = baseEnd;
  if (start < 0) return 0;
  if (tokens[start].value === ')' || tokens[start].value === ']') {
    const opener = tokens[start].value === ')' ? '(' : '[';
    const matched = findMatchingBackward(tokens, start, opener, tokens[start].value);
    if (matched >= 0) start = matched;
  }
  while (start >= 2 && tokens[start - 1].value === '.' && canEndExpression(tokens[start - 2])) {
    start -= 2;
  }
  return start;
}

function findDestructuringAssignment(tokens, memberStart, memberEnd) {
  for (let open = memberStart - 1; open >= 0; open -= 1) {
    const openValue = tokens[open].value;
    if (openValue !== '[' && openValue !== '{') continue;
    const closeValue = openValue === '[' ? ']' : '}';
    const close = findMatching(tokens, open, openValue, closeValue);
    if (close < memberEnd || !tokens[close + 1] || tokens[close + 1].value !== '=') continue;
    if (isComputedPatternKey(tokens, open, close, memberStart, memberEnd)) continue;
    if (isPatternDefaultRead(tokens, open, memberStart)) continue;
    return tokens[close + 1];
  }
  return null;
}

function isComputedPatternKey(tokens, patternOpen, patternClose, memberStart, memberEnd) {
  for (let open = memberStart - 1; open > patternOpen; open -= 1) {
    if (tokens[open].value !== '[') continue;
    const close = findMatching(tokens, open, '[', ']');
    if (close >= memberEnd && close < patternClose
      && tokens[close + 1] && tokens[close + 1].value === ':') return true;
  }
  return false;
}

function isPatternDefaultRead(tokens, patternOpen, memberStart) {
  const stack = [];
  let segmentStart = patternOpen + 1;
  for (let i = patternOpen + 1; i < memberStart; i += 1) {
    const value = tokens[i].value;
    if (value === '(' || value === '[' || value === '{') stack.push(value);
    else if (value === ')' || value === ']' || value === '}') stack.pop();
    else if (value === ',' && stack.length === 0) segmentStart = i + 1;
  }
  for (let i = segmentStart; i < memberStart; i += 1) {
    if (tokens[i].value === '=') return true;
  }
  return false;
}

function findForIterationWrite(tokens, memberStart, memberEnd) {
  const operator = tokens[memberEnd + 1];
  if (!operator || operator.type !== 'identifier' || (operator.value !== 'of' && operator.value !== 'in')) {
    return null;
  }
  for (let open = memberStart - 1; open >= 0; open -= 1) {
    if (tokens[open].value !== '(') continue;
    const close = findMatching(tokens, open, '(', ')');
    if (close < memberEnd) continue;
    const before = tokens[open - 1];
    const beforeBefore = tokens[open - 2];
    if ((before && before.type === 'identifier' && before.value === 'for')
      || (before && before.type === 'identifier' && before.value === 'await'
        && beforeBefore && beforeBefore.type === 'identifier' && beforeBefore.value === 'for')) {
      return operator.value;
    }
  }
  return null;
}

function findMatching(tokens, openIndex, open, close) {
  let depth = 0;
  for (let i = openIndex; i < tokens.length; i += 1) {
    if (tokens[i].value === open) depth += 1;
    else if (tokens[i].value === close) {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function findMatchingBackward(tokens, closeIndex, open, close) {
  let depth = 0;
  for (let i = closeIndex; i >= 0; i -= 1) {
    if (tokens[i].value === close) depth += 1;
    else if (tokens[i].value === open) {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function addFinding(findings, source, file, token, kind) {
  const location = locate(source, token.start);
  findings.push({
    file: normalizePath(file),
    line: location.line,
    column: location.column,
    kind,
    snippet: source.slice(location.lineStart, location.lineEnd).trim(),
  });
}

function locate(source, offset) {
  let line = 1;
  let lineStart = 0;
  for (let i = 0; i < offset; i += 1) {
    if (source.charCodeAt(i) === 10) {
      line += 1;
      lineStart = i + 1;
    }
  }
  let lineEnd = source.indexOf('\n', offset);
  if (lineEnd < 0) lineEnd = source.length;
  return { line, column: offset - lineStart + 1, lineStart, lineEnd };
}

function dedupeAndSort(findings) {
  const unique = new Map();
  for (const finding of findings) {
    unique.set(`${finding.file}:${finding.line}:${finding.column}:${finding.kind}`, finding);
  }
  return [...unique.values()].sort((a, b) => a.file.localeCompare(b.file)
    || a.line - b.line || a.column - b.column || a.kind.localeCompare(b.kind));
}

function normalizePath(value) {
  return String(value || '').replace(/\\/g, '/');
}

function tokenize(source) {
  const tokens = [];
  let index = 0;

  function token(type, value, start, end = index) {
    tokens.push({ type, value, start, end });
  }

  function code(stopAtTemplateBrace = false) {
    let braceDepth = 0;
    while (index < source.length) {
      const ch = source[index];
      if (/\s/.test(ch)) { index += 1; continue; }
      if (ch === '/' && source[index + 1] === '/') { skipLineComment(); continue; }
      if (ch === '/' && source[index + 1] === '*') { skipBlockComment(); continue; }
      if (ch === '}' && stopAtTemplateBrace && braceDepth === 0) { index += 1; return; }
      if (ch === '"' || ch === "'") { readQuotedString(ch); continue; }
      if (ch === '`') { readTemplate(); continue; }
      if (ch === '/' && canStartRegex(tokens[tokens.length - 1])) { skipRegex(); continue; }
      const escapedIdentifier = decodeIdentifierEscape(source, index);
      if (isIdentifierStart(ch) || (escapedIdentifier && isIdentifierStart(escapedIdentifier.value))) {
        readIdentifier();
        continue;
      }
      if (/[0-9]/.test(ch)) { readNumber(); continue; }

      const start = index;
      const operator = readOperator();
      token('punctuator', operator, start);
      if (operator === '{') braceDepth += 1;
      else if (operator === '}') braceDepth = Math.max(0, braceDepth - 1);
    }
  }

  function readIdentifier() {
    const start = index;
    let value = '';
    let first = true;
    while (index < source.length) {
      const ch = source[index];
      if ((first && isIdentifierStart(ch)) || (!first && isIdentifierPart(ch))) {
        value += ch;
        index += 1;
        first = false;
        continue;
      }
      const escaped = decodeIdentifierEscape(source, index);
      if (escaped && ((first && isIdentifierStart(escaped.value))
        || (!first && isIdentifierPart(escaped.value)))) {
        value += escaped.value;
        index = escaped.end;
        first = false;
        continue;
      }
      break;
    }
    token('identifier', value, start);
  }

  function readNumber() {
    const start = index;
    index += 1;
    while (index < source.length && /[0-9A-Fa-f_xXobn.eE+-]/.test(source[index])) index += 1;
    token('number', source.slice(start, index), start);
  }

  function readQuotedString(quote) {
    const start = index;
    index += 1;
    let value = '';
    while (index < source.length) {
      const ch = source[index];
      if (ch === quote) { index += 1; break; }
      if (ch === '\\') value += readEscape();
      else { value += ch; index += 1; }
    }
    token('string', value, start);
  }

  function readTemplate() {
    const start = index;
    index += 1;
    const contentStart = index;
    let value = '';
    let interpolated = false;
    const interpolationRanges = [];
    while (index < source.length) {
      const ch = source[index];
      if (ch === '`') {
        const contentEnd = index;
        index += 1;
        const raw = maskTemplateInterpolations(
          source.slice(contentStart, contentEnd),
          contentStart,
          interpolationRanges,
        );
        tokens.push({
          type: 'string',
          value: interpolated ? null : value,
          start,
          end: index,
          template: true,
          raw,
          contentStart,
        });
        return;
      }
      if (ch === '$' && source[index + 1] === '{') {
        interpolated = true;
        const interpolationStart = index;
        index += 2;
        code(true);
        interpolationRanges.push([interpolationStart, index]);
        continue;
      }
      if (ch === '\\') value += readEscape();
      else { value += ch; index += 1; }
    }
  }

  function readEscape() {
    index += 1;
    if (index >= source.length) return '';
    const ch = source[index++];
    if (ch === 'n') return '\n';
    if (ch === 'r') return '\r';
    if (ch === 't') return '\t';
    if (ch === 'x') {
      const raw = source.slice(index, index + 2);
      if (/^[0-9A-Fa-f]{2}$/.test(raw)) { index += 2; return String.fromCodePoint(parseInt(raw, 16)); }
    }
    if (ch === 'u') {
      if (source[index] === '{') {
        const end = source.indexOf('}', index + 1);
        const raw = end < 0 ? '' : source.slice(index + 1, end);
        if (/^[0-9A-Fa-f]+$/.test(raw)) { index = end + 1; return String.fromCodePoint(parseInt(raw, 16)); }
      }
      const raw = source.slice(index, index + 4);
      if (/^[0-9A-Fa-f]{4}$/.test(raw)) { index += 4; return String.fromCodePoint(parseInt(raw, 16)); }
    }
    return ch;
  }

  function skipLineComment() {
    index += 2;
    while (index < source.length && source[index] !== '\n') index += 1;
  }

  function skipBlockComment() {
    index += 2;
    while (index < source.length && !(source[index] === '*' && source[index + 1] === '/')) index += 1;
    index = Math.min(source.length, index + 2);
  }

  function skipRegex() {
    index += 1;
    let inClass = false;
    while (index < source.length) {
      const ch = source[index++];
      if (ch === '\\') { index += 1; continue; }
      if (ch === '[') inClass = true;
      else if (ch === ']') inClass = false;
      else if (ch === '/' && !inClass) break;
    }
    while (index < source.length && /[A-Za-z]/.test(source[index])) index += 1;
  }

  function readOperator() {
    const operators = [
      '>>>=', '===', '!==', '>>>', '**=', '&&=', '||=', '??=', '<<=', '>>=', '...',
      '=>', '==', '!=', '<=', '>=', '++', '--', '&&', '||', '??', '**', '<<', '>>',
      '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '?.',
    ];
    for (const candidate of operators) {
      if (source.startsWith(candidate, index)) { index += candidate.length; return candidate; }
    }
    return source[index++];
  }

  code(false);
  return tokens;
}

function canStartRegex(previous) {
  if (!previous) return true;
  if (previous.type === 'identifier') {
    return new Set(['return', 'throw', 'case', 'delete', 'void', 'typeof', 'instanceof', 'in', 'of', 'yield', 'await']).has(previous.value);
  }
  return new Set(['(', '[', '{', ',', ';', ':', '=', '=>', '!', '?', '&&', '||', '??']).has(previous.value)
    || ASSIGNMENT_OPERATORS.has(previous.value);
}

function isIdentifierStart(ch) {
  return typeof ch === 'string' && /^[A-Za-z_$]$/.test(ch);
}

function isIdentifierPart(ch) {
  return typeof ch === 'string' && /^[A-Za-z0-9_$]$/.test(ch);
}

function decodeIdentifierEscape(source, start) {
  if (source[start] !== '\\' || source[start + 1] !== 'u') return null;
  let raw = '';
  let end = start + 2;
  if (source[end] === '{') {
    const close = source.indexOf('}', end + 1);
    if (close < 0) return null;
    raw = source.slice(end + 1, close);
    end = close + 1;
    if (!/^[0-9A-Fa-f]{1,6}$/.test(raw)) return null;
  } else {
    raw = source.slice(end, end + 4);
    if (!/^[0-9A-Fa-f]{4}$/.test(raw)) return null;
    end += 4;
  }
  const codePoint = Number.parseInt(raw, 16);
  if (!Number.isFinite(codePoint) || codePoint > 0x10ffff) return null;
  return { value: String.fromCodePoint(codePoint), end };
}

function maskTemplateInterpolations(raw, contentStart, ranges) {
  if (!ranges.length) return raw;
  const chars = raw.split('');
  for (const [absoluteStart, absoluteEnd] of ranges) {
    const start = Math.max(0, absoluteStart - contentStart);
    const end = Math.min(chars.length, absoluteEnd - contentStart);
    let wrotePlaceholder = false;
    for (let i = start; i < end; i += 1) {
      if (chars[i] === '\n' || chars[i] === '\r') continue;
      chars[i] = wrotePlaceholder ? ' ' : '0';
      wrotePlaceholder = true;
    }
  }
  return chars.join('');
}
