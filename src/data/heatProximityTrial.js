// One comparison at one range: a cold pass and a hot pass.
// The notebook records the difference. A scan does not pay for it.

export const HEAT_TRIAL_NOTE =
  'NOTEBOOK. SAME RANGE. THE COLD PASS HOLDS SHADOW. THE HOT PASS BRINGS THE CHARGE. THIS BODY ANSWERS HEAT, NOT PROXIMITY.';

function copySlot(slot) {
  if (!slot || (slot.drive !== 'shadow' && slot.drive !== 'charge')) return null;
  if (typeof slot.geometryKey !== 'number' || !Number.isFinite(slot.geometryKey)) return null;
  return { drive: slot.drive, geometryKey: slot.geometryKey };
}

export function noteHeatTrial(book, sample) {
  const prev = book && typeof book === 'object' ? book : {};
  const next = {
    cold: copySlot(prev.cold),
    hot: copySlot(prev.hot),
    note: typeof prev.note === 'string' ? prev.note : null,
    scans: Number.isFinite(prev.scans) && prev.scans > 0 ? Math.floor(prev.scans) : 0,
    spoken: prev.spoken === true,
  };
  if (!sample || typeof sample !== 'object') return next;
  if (sample.kind === 'scan') {
    next.scans += 1;
    return next;
  }
  if (typeof sample.geometryKey !== 'number' || !Number.isFinite(sample.geometryKey)) return next;
  const slot = sample.heat === true ? 'hot' : 'cold';
  const drive = sample.drive;
  if (slot === 'cold' && drive !== 'shadow') return next;
  if (slot === 'hot' && drive !== 'charge') return next;
  // A later pass in a different bucket replaces the frozen one.
  // The notice band is one range, so a moved body can still complete the pair.
  if (!next[slot] || next[slot].geometryKey !== sample.geometryKey) {
    next[slot] = { drive, geometryKey: sample.geometryKey };
  }
  if (next.cold && next.hot
      && next.cold.geometryKey === next.hot.geometryKey
      && next.cold.drive === 'shadow'
      && next.hot.drive === 'charge'
      && !next.note) {
    next.note = HEAT_TRIAL_NOTE;
  }
  return next;
}
