export const SHIELD_HIT_SLOTS = 4;
export const SHIELD_HIT_LIFE = 0.28;

const hits = new Map();

function ensureRecord(entityId) {
  let record = hits.get(entityId);
  if (!record) {
    record = {
      dirs: new Float32Array(SHIELD_HIT_SLOTS * 4),
      cursor: 0,
    };
    hits.set(entityId, record);
  }
  return record;
}

export function addShieldContact(entityId, dirX, dirY, dirZ, strength = 1) {
  if (entityId == null) return;
  const record = ensureRecord(entityId);
  const slot = record.cursor % SHIELD_HIT_SLOTS;
  record.cursor++;
  const o = slot * 4;
  const len = Math.hypot(dirX, dirY, dirZ) || 1;
  record.dirs[o] = dirX / len;
  record.dirs[o + 1] = dirY / len;
  record.dirs[o + 2] = dirZ / len;
  record.dirs[o + 3] = Math.max(0.35, Math.min(1, strength));
}

export function ageShieldContacts(dt) {
  const decay = dt / SHIELD_HIT_LIFE;
  for (const [id, record] of hits) {
    let any = false;
    for (let i = 0; i < SHIELD_HIT_SLOTS; i++) {
      const o = i * 4;
      if (record.dirs[o + 3] <= 0) continue;
      record.dirs[o + 3] = Math.max(0, record.dirs[o + 3] - decay);
      if (record.dirs[o + 3] > 0.001) any = true;
    }
    if (!any) hits.delete(id);
  }
}

export function readShieldContacts(entityId, out) {
  const record = hits.get(entityId);
  if (!record) {
    if (out) out.fill(0);
    return null;
  }
  if (out) out.set(record.dirs);
  return record.dirs;
}

export function clearShieldContacts(entityId) {
  if (entityId == null) hits.clear();
  else hits.delete(entityId);
}
