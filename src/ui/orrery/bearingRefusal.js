// SFQ-B203 — a refused band bearing has to land on the tuner chip.
// uniqueWrecks emits band:bearingUnavailable; nothing in the UI was listening.

const LINES = Object.freeze({
  'no-unread-canonical-wrecks': 'No unread wreck left on this band',
  'canonical-source-missing': 'That bearing has no source',
  'canonical-record-rejected': 'The band refused that bearing',
});

export const BEARING_REFUSAL_HOLD_MS = 8000;

export function bearingRefusalLine(reason) {
  return LINES[reason] || 'Bearing unavailable';
}

/** Paint the refusal on the tuner chip. Does not move focus — flight still owns the helm. */
export function paintBearingRefusal(button, reason) {
  const line = bearingRefusalLine(reason);
  if (!button) return line;
  button.textContent = line;
  button.setAttribute('aria-live', 'polite');
  button.setAttribute('data-bearing-refusal', reason ? String(reason) : 'unavailable');
  button.setAttribute('aria-label', `${line}.`);
  return line;
}
