// Durable survey receipts are distinct from the bounded scanner recognition cache.
// The loss ledger retains its paid stamp; this slice retains recognition and chart tiers.
export const SURVEY_MEMORY_CAP = 64;
const MILESTONE_CAP = 192;
const TIERS = [3, 6, 10];
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const key = value => typeof value === 'string' && value.length > 0 && value.length <= 160
  && !['__proto__', 'constructor', 'prototype'].includes(value);
const time = value => Number.isFinite(value) && value >= 0 ? value : 0;

export function normalizeSurveyMemory(value) {
  const investigated = {}, milestones = {};
  const source = object(value?.investigated) ? value.investigated : {};
  const ids = Object.keys(source).filter(id => key(id) && object(source[id]))
    .sort((a, b) => time(source[b].at) - time(source[a].at) || a.localeCompare(b));
  for (const id of ids.slice(0, SURVEY_MEMORY_CAP)) {
    const row = source[id];
    investigated[id] = { at: time(row.at), sectorId: key(row.sectorId) ? row.sectorId : null,
      entityId: Number.isSafeInteger(row.entityId) && row.entityId >= 0 ? row.entityId : null,
      ...(row.credited === false ? { credited: false } : {}) };
  }
  const marks = object(value?.milestones) ? value.milestones : {};
  for (const id of Object.keys(marks).filter(key).sort().slice(0, MILESTONE_CAP)) {
    const row = marks[id], tier = Number(id.slice(id.lastIndexOf(':') + 1));
    if (!object(row) || !TIERS.includes(tier)) continue;
    milestones[id] = { at: time(row.at), count: Math.max(tier, Math.min(SURVEY_MEMORY_CAP,
      Number.isFinite(row.count) ? Math.floor(row.count) : tier)) };
  }
  return { investigated, milestones,
    ...(value?.legacyChartBonusesUnknown === true ? { legacyChartBonusesUnknown: true } : {}) };
}

// Pre-v19 saves omitted survey memory, but a persistent hull's deep reveal proves the old
// claim branch ran. Recover only that evidence. Structural fixtures never owned ship losses.
// A missing hull/read is ambiguous: do not invent a discovery or erase an authentic story.
export function legacySurveyMemory(data) {
  const memory = { investigated: {}, milestones: {} }, counts = new Map();
  const entries = Array.isArray(data?.lossLedger?.entries) ? data.lossLedger.entries : [];
  const losses = new Map(entries.filter(object).map(row => [row.lossId, row]));
  const entities = Array.isArray(data?.entities?.persistent) ? data.entities.persistent : [];
  for (const entity of entities) {
    const reveal = entity?.data?.scanRevealed;
    if (entity?.type !== 'wreck' || entity.data?.worldSiteStructural === true
      || !(reveal?.quality === 'deep' || reveal?.recognized === true) || !key(reveal.lossId)) continue;
    const loss = losses.get(reveal.lossId);
    const sectorId = loss?.sectorId || entity.data?.sectorId || entity.data?.homeSectorId
      || data?.world?.currentSectorId || null;
    memory.investigated[reveal.lossId] = { at: time(reveal.revealedAt), sectorId, entityId: entity.id };
  }
  for (const row of Object.values(memory.investigated)) {
    const sectorId = row.sectorId || 'unknown', prior = counts.get(sectorId) || { count: 0, at: 0 };
    prior.count++; prior.at = Math.max(prior.at, row.at); counts.set(sectorId, prior);
  }
  for (const [sectorId, row] of counts) for (const tier of TIERS) {
    if (row.count >= tier) memory.milestones[`${sectorId}:${tier}`] = { ...row };
  }
  return normalizeSurveyMemory(memory);
}
