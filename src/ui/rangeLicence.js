export const RANGE_LICENCE_KEY = 'spaceface.rangeLicence.v1';
export const RANGE_LICENCE_MEDALS = Object.freeze(['Unlicensed', 'Bronze', 'Silver', 'Gold']);

export function normalizeRangeLicence(raw) {
  const out = { version: 1, rungs: {} };
  for (const [id, row] of Object.entries(raw?.rungs || {}).slice(0, 96)) {
    if (!/^[a-z0-9_-]{1,80}$/.test(id) || !(row?.bestS > 0) || !Number.isFinite(row.bestS)) continue;
    out.rungs[id] = { bestS: row.bestS, medal: Math.max(1, Math.min(3, Math.floor(row.medal) || 1)) };
  }
  return out;
}

export function readRangeLicence(storage = globalThis.localStorage) {
  try { return normalizeRangeLicence(JSON.parse(storage?.getItem(RANGE_LICENCE_KEY) || 'null')); }
  catch { return normalizeRangeLicence(null); }
}

export function awardRangeLicence(profile, id, elapsedS, targetS = 30) {
  const next = normalizeRangeLicence(profile);
  if (!(elapsedS > 0) || !Number.isFinite(elapsedS) || !/^[a-z0-9_-]{1,80}$/.test(id)) return next;
  const medal = elapsedS <= targetS ? 3 : elapsedS <= targetS * 2 ? 2 : 1;
  const old = next.rungs[id];
  next.rungs[id] = { bestS: old ? Math.min(old.bestS, elapsedS) : elapsedS,
    medal: Math.max(old?.medal || 0, medal) };
  return next;
}

export function storeRangeLicence(profile, storage = globalThis.localStorage) {
  const normalized = normalizeRangeLicence(profile);
  try { storage?.setItem(RANGE_LICENCE_KEY, JSON.stringify(normalized)); } catch { /* optional local record */ }
  return normalized;
}

export function rangeMedalLabel(profile, id) {
  return RANGE_LICENCE_MEDALS[profile?.rungs?.[id]?.medal || 0];
}
