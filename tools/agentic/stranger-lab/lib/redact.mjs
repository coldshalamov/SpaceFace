// Strip account and credential material before a stranger artifact is written.

const SENSITIVE_KEY = /email|e-mail|token|password|secret|authorization|cookie|account|sessionid|api[-_]?key|credential/i;
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const BEARER = /bearer\s+[a-z0-9._~+/-]+=*/gi;

export function redact(value, depth = 0) {
  if (depth > 8) return '[redacted-depth]';
  if (typeof value === 'string') return redactString(value);
  if (Array.isArray(value)) {
    const cap = Math.min(value.length, 80);
    const out = [];
    for (let i = 0; i < cap; i++) out.push(redact(value[i], depth + 1));
    if (value.length > cap) out.push(`[truncated ${value.length - cap}]`);
    return out;
  }
  if (value && typeof value === 'object') {
    const out = {};
    const keys = Object.keys(value).slice(0, 60);
    for (const key of keys) {
      if (SENSITIVE_KEY.test(key)) out[key] = '[redacted]';
      else out[key] = redact(value[key], depth + 1);
    }
    return out;
  }
  return value;
}

export function redactString(text) {
  if (typeof text !== 'string') return text;
  return text.replace(EMAIL, '[redacted-email]').replace(BEARER, 'bearer [redacted]');
}
