/** Fixed-space event histogram. No entities/payloads survive ingestion.
 * Ten-second bins deliberately trade <=10 s of window-edge precision for fixed work.
 * Emergency hull/damage guards use separate immediate signals, not this approximation.
 */
export const TENSION_CHANNELS = Object.freeze([
  'incoming', 'combat', 'mining', 'trade', 'tether', 'exploration', 'salvage',
  'mission', 'offered', 'delivered', 'resolved', 'defeat',
]);
export const TENSION_VERBS = Object.freeze([
  'combat', 'mining', 'trade', 'tether', 'exploration', 'salvage', 'mission',
]);
export const WINDOW_BIN_S = 10;
export const WINDOW_BIN_COUNT = 180; // thirty simulation minutes, independent of session length
const INDEX = Object.freeze(Object.fromEntries(TENSION_CHANNELS.map((name, i) => [name, i])));
const VERB_INDICES = new Set(TENSION_VERBS.map((name) => INDEX[name]));

export function createTensionWindow() {
  return {
    epochs: Array(WINDOW_BIN_COUNT).fill(-1),
    values: Array.from({ length: WINDOW_BIN_COUNT }, () => Array(TENSION_CHANNELS.length).fill(0)),
  };
}

export function addTensionSignal(window, now, channel, amount = 1) {
  const column = Object.hasOwn(INDEX, channel) ? INDEX[channel] : undefined;
  if (column === undefined || !Number.isFinite(now) || now < 0
    || !Number.isFinite(amount) || amount <= 0) return false;
  const epoch = Math.floor(now / WINDOW_BIN_S);
  const slot = epoch % WINDOW_BIN_COUNT;
  if (window.epochs[slot] > epoch) return false; // never overwrite a newer slot with an old event
  if (window.epochs[slot] !== epoch) {
    window.epochs[slot] = epoch;
    window.values[slot].fill(0);
  }
  // Activity measures occupied time bins, NOT input-spam frequency. Four thousand latch
  // repeats are still one verb. Damage is normalized to max protection at ingestion.
  const cap = VERB_INDICES.has(column) ? 1 : channel === 'incoming' ? 4 : 32;
  const row = window.values[slot];
  row[column] = Math.min(cap, row[column] + Math.min(cap, amount));
  return true;
}

export function summarizeTensionWindow(window, now) {
  const recent = Object.fromEntries(TENSION_CHANNELS.map((key) => [key, 0]));
  const medium = { ...recent };
  const long = { ...recent };
  const currentEpoch = Math.floor(now / WINDOW_BIN_S);
  // Each bin visited at most once. No event-list pruning, sorting, or session-length scans.
  for (let slot = 0; slot < WINDOW_BIN_COUNT; slot++) {
    const age = currentEpoch - window.epochs[slot];
    if (window.epochs[slot] < 0 || age < 0 || age >= WINDOW_BIN_COUNT) continue;
    const row = window.values[slot];
    for (let col = 0; col < TENSION_CHANNELS.length; col++) {
      const name = TENSION_CHANNELS[col];
      const value = row[col];
      long[name] += value;
      if (age < 30) medium[name] += value; // <= 300 s
      if (age < 3) recent[name] += value; // <= 30 s
    }
  }
  let total = 0, dominant = 0, distinct = 0, entropy = 0;
  for (const key of TENSION_VERBS) {
    total += medium[key];
    dominant = Math.max(dominant, medium[key]);
    if (medium[key] > 0) distinct++;
  }
  if (total > 0) {
    for (const key of TENSION_VERBS) {
      const p = medium[key] / total;
      if (p > 0) entropy -= p * Math.log2(p);
    }
  }
  return {
    recent, medium, long,
    occupiedVerbBins: total,
    distinctVerbs: distinct,
    dominance: total ? dominant / total : 0,
    entropy: entropy / Math.log2(TENSION_VERBS.length),
  };
}

export function validateTensionWindow(window) {
  return !!window && Array.isArray(window.epochs) && window.epochs.length === WINDOW_BIN_COUNT
    && Array.isArray(window.values) && window.values.length === WINDOW_BIN_COUNT
    && Array.from(window.epochs).every((v) => Number.isSafeInteger(v) && v >= -1)
    && Array.from(window.values).every((row) => Array.isArray(row) && row.length === TENSION_CHANNELS.length
      && Array.from(row).every((v, i) => Number.isFinite(v) && v >= 0
        && v <= (VERB_INDICES.has(i) ? 1 : i === INDEX.incoming ? 4 : 32)));
}
