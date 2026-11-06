// Read-only bridge for the compact per-entity worker frame. Runtime fight ledgers stay in sim.
// Cache by entity lifetime so render and sound can share the same immutable receipt parse.
import { ironKrakenProfileFor } from './ironKraken.js';

const frames = new WeakMap();
const MAX_FRAME_CHARACTERS = 16384;

export function readIronKrakenMotionFrame(entity) {
  if (!entity || typeof entity !== 'object') return null;
  const frame = entity.ironKrakenMotionFrame;
  const cached = frames.get(entity);
  if (cached && cached.frame === frame && cached.life === entity.occupantGeneration) return cached.fight;
  let fight = null;
  if (typeof frame === 'string' && frame.length <= MAX_FRAME_CHARACTERS) {
    try {
      const parsed = JSON.parse(frame);
      const profile = ironKrakenProfileFor(entity);
      if (profile && parsed?.actorId === entity.id
        && (parsed.ownerLife == null || parsed.ownerLife === entity.occupantGeneration)
        && parsed.encounterId === profile.scoreId && typeof parsed.fightId === 'string') {
        fight = { ...parsed, bossId: entity.id };
      }
    } catch (_) { /* Retired or malformed presentation cannot create an attack. */ }
  }
  frames.set(entity, { frame, life: entity.occupantGeneration, fight });
  return fight;
}

export function ironKrakenPresentationFight(state, entity) {
  if (!entity) return null;
  const fights = state?.capitalBossEncounters?.fights;
  const assigned = fights?.[entity.data?.ironKraken?.fightId];
  if (assigned?.bossId === entity.id) return assigned;
  // Main-thread spawn and assignment can arrive separately. The canonical owner id resolves it.
  if (fights) for (const id in fights) if (fights[id]?.bossId === entity.id) return fights[id];
  return readIronKrakenMotionFrame(entity);
}

export function ironKrakenPresentationFightById(state, fightId) {
  const direct = state?.capitalBossEncounters?.fights?.[fightId];
  if (direct) return direct;
  const actors = state?.entityList || state?.entities?.values?.() || [];
  for (const entity of actors) {
    if (!ironKrakenProfileFor(entity)) continue;
    const fight = readIronKrakenMotionFrame(entity);
    if (fight?.fightId === fightId) return fight;
  }
  return null;
}
