// What an already-filed ending still allows. Read-only. Missions remains the offer writer.
import { endingDef } from './endingDefs.js';

/** A continuation job may count only when it matches that ending's authored access rule. */
export function continuationJobPermitted(choiceId, mission) {
  const def = endingDef(choiceId);
  const types = def && def.continuity && Array.isArray(def.continuity.missionTypes)
    ? def.continuity.missionTypes
    : [];
  if (!types.length) return true;
  return types.includes(mission && mission.type);
}

export const NEW_GAME_PLUS_RESET_FIELDS = Object.freeze([
  'cargo',
  'credits',
  'claims',
  'active jobs',
  'live entity ids',
]);

/** The sentence the captain hears. Names what is kept and what the fresh run does not copy. */
export function newGamePlusConsequenceLine(record) {
  if (!record || typeof record !== 'object') return '';
  const kept = [
    record.keepsakeName,
    record.leadGrudgeName,
    record.worldFacts && record.worldFacts.title,
  ].map((part) => String(part || '').trim()).filter(Boolean);
  const keptText = kept.length ? kept.join(', ') : 'the filed ending';
  return `New run keeps ${keptText}. Cargo, credits, claims, active jobs, and live entity ids reset. They are not copied.`;
}
