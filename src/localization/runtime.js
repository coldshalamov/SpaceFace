// Platform-pure localization runtime. Safe for browser, Electron, tests, and deterministic tools.

export const DEFAULT_LOCALE = 'en-US';
export const PSEUDO_LOCALE = 'qps-ploc';
/** Target expansion for the growth pass. Layout is designed against this ratio, not English. */
export const PSEUDO_GROWTH_RATIO = 1.4;
const PLACEHOLDER_RE = /\{([A-Za-z_][A-Za-z0-9_.-]*)\}/g;
const PLACEHOLDER_SPLIT_RE = /(\{[A-Za-z_][A-Za-z0-9_.-]*\})/g;
const PLACEHOLDER_TOKEN_RE = /^\{[A-Za-z_][A-Za-z0-9_.-]*\}$/;
const PAD_CHAR = '·';
const ACCENTS = Object.freeze({
  a: 'à', b: 'ƀ', c: 'ç', d: 'đ', e: 'ë', f: 'ƒ', g: 'ğ', h: 'ħ', i: 'ï',
  j: 'ĵ', k: 'ķ', l: 'ľ', m: 'ɱ', n: 'ñ', o: 'ö', p: 'þ', q: 'ʠ', r: 'ř',
  s: 'š', t: 'ŧ', u: 'ü', v: 'ṽ', w: 'ŵ', x: 'ẋ', y: 'ÿ', z: 'ž',
});

export function localeFallbackChain(locale) {
  const exact = normalizeLocale(locale);
  const out = [];
  pushUnique(out, exact);
  const dash = exact.indexOf('-');
  if (exact !== DEFAULT_LOCALE && dash > 0) pushUnique(out, exact.slice(0, dash));
  pushUnique(out, DEFAULT_LOCALE);
  return out;
}

export function extractPlaceholders(message) {
  const found = new Set();
  const text = String(message == null ? '' : message);
  PLACEHOLDER_RE.lastIndex = 0;
  let match;
  while ((match = PLACEHOLDER_RE.exec(text))) found.add(match[1]);
  return [...found].sort();
}

export function hasPlaceholderParity(source, candidate) {
  const a = extractPlaceholders(source);
  const b = extractPlaceholders(candidate);
  return a.length === b.length && a.every((name, index) => name === b[index]);
}

export function interpolate(message, values = {}) {
  return String(message == null ? '' : message).replace(PLACEHOLDER_RE, (whole, name) => (
    Object.prototype.hasOwnProperty.call(values || {}, name) ? String(values[name]) : whole
  ));
}

export function pseudoLocalize(message) {
  // Expansion is per translatable character so `t(key, values)` on a template stays equal to
  // pseudo-localizing the interpolated English — padding by total length would break that.
  const parts = String(message == null ? '' : message).split(PLACEHOLDER_SPLIT_RE);
  let body = '';
  for (const part of parts) {
    if (PLACEHOLDER_TOKEN_RE.test(part)) {
      body += part;
      continue;
    }
    for (const char of part) {
      const lower = char.toLowerCase();
      const accented = ACCENTS[lower] || char;
      const rendered = char !== lower && ACCENTS[lower] ? accented.toUpperCase() : accented;
      body += rendered;
      // Per-character growth only: length-total padding would break placeholder interpolation.
      if ('aeiouAEIOUyY'.includes(char)) body += rendered;
      if (char === ' ' || char === '\u00a0') body += PAD_CHAR;
      // One extra tick on the most common English consonant so the mean lands near +40%.
      if (char === 't' || char === 'T') body += PAD_CHAR;
    }
  }
  return `⟦${body}⟧`;
}

/** Display-length ratio of the pseudo string to its English source. */
export function pseudoGrowthRatio(message) {
  const source = String(message == null ? '' : message);
  if (!source) return 1;
  return [...pseudoLocalize(source)].length / [...source].length;
}

/** Mean growth across a catalog. Short codes pull the mean down; the layout pass still uses 1.4. */
export function meanPseudoGrowth(messages) {
  let sourceUnits = 0;
  let pseudoUnits = 0;
  for (const value of Object.values(messages || {})) {
    const source = String(value == null ? '' : value);
    if (!source) continue;
    sourceUnits += [...source].length;
    pseudoUnits += [...pseudoLocalize(source)].length;
  }
  return sourceUnits > 0 ? pseudoUnits / sourceUnits : 1;
}

export function createLocalizationRuntime(options = {}) {
  let locale = normalizeLocale(options.locale);
  const catalogs = options.catalogs && typeof options.catalogs === 'object' ? options.catalogs : {};
  const onMissing = typeof options.onMissing === 'function' ? options.onMissing : null;
  const reported = new Set();

  function report(key, reason) {
    const signature = `${locale}\u0000${key}\u0000${reason}`;
    if (reported.has(signature)) return;
    reported.add(signature);
    if (onMissing) onMissing(Object.freeze({ locale, key, reason }));
  }

  function lookup(catalogLocale, key) {
    const catalog = catalogs[catalogLocale];
    if (!catalog || !Object.prototype.hasOwnProperty.call(catalog, key)) return null;
    const entry = catalog[key];
    if (typeof entry === 'string') return entry;
    if (entry && typeof entry.message === 'string') return entry.message;
    return null;
  }

  function t(keyValue, values = {}, callFallback = null) {
    const key = String(keyValue);
    const english = lookup(DEFAULT_LOCALE, key);
    if (locale === PSEUDO_LOCALE) {
      if (english != null) return interpolate(pseudoLocalize(english), values);
      const fallback = resolveCallFallbackRaw(callFallback, key, values);
      report(key, 'missing_key');
      return interpolate(pseudoLocalize(fallback == null ? key : fallback), values);
    }
    for (const candidateLocale of localeFallbackChain(locale)) {
      const message = lookup(candidateLocale, key);
      if (message == null) continue;
      if (candidateLocale !== DEFAULT_LOCALE && english != null && !hasPlaceholderParity(english, message)) {
        report(key, 'placeholder_mismatch');
        continue;
      }
      return interpolate(message, values);
    }
    report(key, 'missing_key');
    const fallback = resolveCallFallback(callFallback, key, values);
    return fallback == null ? key : fallback;
  }

  return Object.freeze({
    t,
    get locale() { return locale; },
    setLocale(next) { locale = normalizeLocale(next); return locale; },
    missingCount() { return reported.size; },
  });
}

function resolveCallFallback(fallback, key, values) {
  const raw = resolveCallFallbackRaw(fallback, key, values);
  return raw == null ? null : interpolate(raw, values);
}

function resolveCallFallbackRaw(fallback, key, values) {
  if (typeof fallback === 'function') return String(fallback(key, values));
  if (fallback != null) return String(fallback);
  return null;
}

function normalizeLocale(value) {
  const text = String(value || DEFAULT_LOCALE).trim();
  return text || DEFAULT_LOCALE;
}

function pushUnique(out, value) {
  if (value && !out.includes(value)) out.push(value);
}
