/** Pure identity and ordering rules for save-slot keys and index cards. */
export function isUnsafePlainKey(key) {
  return key === '__proto__' || key === 'constructor' || key === 'prototype';
}

export function isSaveSlotId(slot, {
  savePrefix = 'sf.save.',
  achievementsStorageKey = 'sf.save.achievements',
  crucibleMetaStorageKey = 'sf.save.crucible_meta',
} = {}) {
  return typeof slot === 'string' && slot.length > 0 && slot !== 'index'
    && !isUnsafePlainKey(slot)
    && savePrefix + slot !== achievementsStorageKey
    && savePrefix + slot !== crucibleMetaStorageKey;
}

function isOccupiedSlotMeta(meta) {
  return !!meta && (meta.savedAt || meta.lastSavedAt || meta.playtimeS != null);
}

export function slotMetaScore(meta) {
  const t = Date.parse((meta && (meta.savedAt || meta.lastSavedAt)) || '') || 0;
  if (t) return t;
  const playtimeS = Number(meta && meta.playtimeS);
  return Number.isFinite(playtimeS) ? playtimeS : 0;
}

function slotPlaytimeScore(meta) {
  const playtimeS = Number(meta && meta.playtimeS);
  return Number.isFinite(playtimeS) ? playtimeS : 0;
}

export function slotMetaBeats(candidate, incumbent) {
  const scoreDelta = slotMetaScore(candidate) - slotMetaScore(incumbent);
  if (scoreDelta !== 0) return scoreDelta > 0;
  const playDelta = slotPlaytimeScore(candidate) - slotPlaytimeScore(incumbent);
  if (playDelta !== 0) return playDelta > 0;
  return String(candidate.slot) > String(incumbent.slot);
}

/**
 * Latest-slot authority for Continue, load('latest'), and New Run+.
 * Higher saved-at time wins. When those times match, higher playtime wins.
 * When both match, the greater slot id in UTF-16 code-unit order wins.
 */
export function selectLatestOccupiedSlot(slots, isSlotId = isSaveSlotId) {
  if (!slots || typeof slots !== 'object') return null;
  let bestKey = null;
  let bestMeta = null;
  for (const key of Object.keys(slots)) {
    if (!isSlotId(key)) continue;
    const meta = slots[key];
    if (!isOccupiedSlotMeta(meta)) continue;
    const candidate = {
      slot: key,
      savedAt: meta.savedAt,
      lastSavedAt: meta.lastSavedAt,
      playtimeS: meta.playtimeS,
    };
    if (bestMeta == null || slotMetaBeats(candidate, bestMeta)) {
      bestKey = key;
      bestMeta = candidate;
    }
  }
  return bestKey;
}

export function compareOccupiedSlotNewestFirst(a, b) {
  const left = {
    slot: String((a && a.slot) || ''),
    savedAt: a && a.savedAt,
    lastSavedAt: a && a.lastSavedAt,
    playtimeS: a && a.playtimeS,
  };
  const right = {
    slot: String((b && b.slot) || ''),
    savedAt: b && b.savedAt,
    lastSavedAt: b && b.lastSavedAt,
    playtimeS: b && b.playtimeS,
  };
  if (slotMetaBeats(left, right)) return -1;
  if (slotMetaBeats(right, left)) return 1;
  return 0;
}
