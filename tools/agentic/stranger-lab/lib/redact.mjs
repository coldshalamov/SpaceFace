// Strip account and credential material before a stranger artifact is written.
// Tapes and sweep rows are not truncated. A cap here made replay disagree with the artifact.

const SENSITIVE_KEY = /email|e-mail|token|password|secret|authorization|cookie|account|user[-_]?id|username|player[-_]?name|session|api[-_]?key|credential/i;
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const BEARER = /bearer\s+[a-z0-9._~+/-]+=*/gi;
const BASIC = /authorization\s*:?\s*basic\s+\S+/gi;
const COOKIE_HEADER = /\bcookie\s*:\s*(?:[^\s;]+=[^\s;]+(?:\s*;\s*[^\s;]+=[^\s;]+)*)/gi;
const COOKIE_ASSIGN = /\bcookie\s*=\s*["']?[^\s"',;}]+/gi;
const STRING_ASSIGN = /\b(user[-_]?id|player[-_]?name)\s*=\s*(?:"[^"]*"|'[^']*'|.*?)(?=\s+\b(?:authorization|cookie|password|api[_-]?key|bearer|user[-_]?id|player[-_]?name)\b|[;\n]|$)/gi;
const SECRET_ASSIGN = /(?<![A-Za-z0-9_-])(password|api[_-]?key|secret|token)(?![A-Za-z0-9_-])["']?\s*(?:[:=]\s*["']?|\s+)[^\s"',}]+/gi;
const JWT = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g;
const SK_LIVE = /\bsk-(?:live|test)-[A-Za-z0-9_-]+\b/g;

export function redact(value, depth = 0) {
  if (depth > 12) return '[redacted-depth]';
  if (typeof value === 'string') return redactString(value);
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1));
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value)) {
      if (SENSITIVE_KEY.test(key)) out[key] = '[redacted]';
      else out[key] = redact(value[key], depth + 1);
    }
    return out;
  }
  return value;
}

export function redactString(text) {
  if (typeof text !== 'string') return text;
  return text
    .replace(EMAIL, '[redacted-email]')
    .replace(BEARER, 'bearer [redacted]')
    .replace(BASIC, 'authorization: basic [redacted]')
    .replace(COOKIE_HEADER, 'cookie: [redacted]')
    .replace(COOKIE_ASSIGN, 'cookie=[redacted]')
    .replace(STRING_ASSIGN, (_, name) => `${name}=[redacted]`)
    .replace(JWT, '[redacted-jwt]')
    .replace(SK_LIVE, '[redacted-key]')
    .replace(SECRET_ASSIGN, (_, name) => `${name}: [redacted]`);
}
