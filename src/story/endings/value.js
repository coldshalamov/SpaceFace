// Pure, bounded value helpers. Never coerce strings/null into evidence.
export const object = v => v && typeof v === 'object' && !Array.isArray(v) ? v : {};
export const array = v => Array.isArray(v) ? v : [];
export const number = (v, fallback = 0) => typeof v === 'number' && Number.isFinite(v) ? v : fallback;
export const count = v => Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, Math.floor(number(v))));
export const timestamp = v => typeof v === 'number' && Number.isFinite(v) && v >= 0;
export const text = (v, limit = 120) => typeof v === 'string'
  ? v.replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, limit) : '';
export const key = v => typeof v === 'string' || (typeof v === 'number' && Number.isSafeInteger(v))
  ? text(String(v), 160) : '';
export function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const v of Object.values(value)) freeze(v);
    Object.freeze(value);
  }
  return value;
}
export const clone = v => JSON.parse(JSON.stringify(v));
// Locale-independent, stable display formatting. No host Intl configuration enters a save.
export const integerText = v => String(Math.trunc(number(v))).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
// A non-cryptographic fingerprint for receipts, NOT a random stream or an authorization token.
export function fingerprint(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  return h.toString(16).padStart(8, '0');
}
