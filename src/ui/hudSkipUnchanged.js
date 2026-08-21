// Skip HUD/DOM work when the readable value has not changed. Keep the cache outside game state so
// save envelopes never accidentally acquire presentation-only bookkeeping.

const SIGNATURES = new WeakMap();
const FIELD_SIGNATURES = new WeakMap();

function signatureBag(state) {
  let bag = SIGNATURES.get(state);
  if (!bag) {
    bag = Object.create(null);
    SIGNATURES.set(state, bag);
  }
  return bag;
}

function fieldSignatureBag(state) {
  let bag = FIELD_SIGNATURES.get(state);
  if (!bag) {
    bag = Object.create(null);
    FIELD_SIGNATURES.set(state, bag);
  }
  return bag;
}

export function hudSignatureUnchanged(state, id, signature) {
  if (!state || typeof state !== 'object') return false;
  const bag = signatureBag(state);
  const key = String(id);
  const unchanged = Object.is(bag[key], signature);
  bag[key] = signature;
  return unchanged;
}

/**
 * Compare a fixed scalar block without allocating a per-frame array or joined signature string.
 * `write` receives a reusable scratch array (plus the state and optional context) and returns the
 * number of populated fields. It may contain numbers, booleans, strings, or stable ids; callers
 * own the field order.
 */
export function hudFieldsUnchanged(state, id, write, context = undefined) {
  if (!state || typeof state !== 'object' || typeof write !== 'function') return false;
  const bag = fieldSignatureBag(state);
  const key = String(id);
  let entry = bag[key];
  if (!entry) {
    entry = { scratch: [], previous: [], count: 0, initialized: false };
    bag[key] = entry;
  }
  const count = Math.max(0, Number(write(entry.scratch, state, context)) | 0);
  let unchanged = entry.initialized && entry.count === count;
  if (unchanged) {
    for (let index = 0; index < count; index++) {
      if (!Object.is(entry.previous[index], entry.scratch[index])) {
        unchanged = false;
        break;
      }
    }
  }
  if (!unchanged) {
    for (let index = 0; index < count; index++) entry.previous[index] = entry.scratch[index];
    entry.count = count;
    entry.initialized = true;
  }
  return unchanged;
}

export function clearHudSignature(state, id) {
  if (!state || typeof state !== 'object') return;
  const bag = SIGNATURES.get(state);
  if (bag) delete bag[String(id)];
  const fieldBag = FIELD_SIGNATURES.get(state);
  const fieldEntry = fieldBag && fieldBag[String(id)];
  // Keep the fixed scratch/previous arrays allocated across visibility gates; only the next
  // comparison must be forced to repaint.
  if (fieldEntry) fieldEntry.initialized = false;
}

export function clearHudSignatures(state) {
  if (state && typeof state === 'object') {
    SIGNATURES.delete(state);
    FIELD_SIGNATURES.delete(state);
  }
}
