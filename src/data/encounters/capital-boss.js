// Packet 09: complete authored capitals. Legacy exports and actor recipe fields are preserved.
// `.score` is executed by capitalBossScore.js; the stock mission spawner alone does NOT execute it.
import { IRON_MAW } from './capital-boss/iron-maw.js';
import { TOLLMAN } from './capital-boss/tollman.js';
import { ALA } from './capital-boss/ala.js';
export { SUBSYSTEM_ROLES as CAPITAL_BOSS_SUBSYSTEM_ROLES } from './capital-boss/shared.js';
export const CAPITAL_BOSS_ENCOUNTER_ID = 'capital_boss_hulk';
export const CAPITAL_BOSS_TOLLMAN_ENCOUNTER_ID = 'capital_boss_tollman';
export const CAPITAL_BOSS_ALA_ENCOUNTER_ID = 'capital_boss_ala';
export const CAPITAL_BOSS_ENCOUNTER = IRON_MAW;
export const CAPITAL_BOSS_TOLLMAN_ENCOUNTER = TOLLMAN;
export const CAPITAL_BOSS_ALA_ENCOUNTER = ALA;
export const CAPITAL_BOSS_ENCOUNTERS = Object.freeze({
  [IRON_MAW.id]: IRON_MAW, [TOLLMAN.id]: TOLLMAN, [ALA.id]: ALA,
});
// Preserve the old fallback for existing callers. New starts use requireCapitalBossEncounter.
export function capitalBossEncounter(id = CAPITAL_BOSS_ENCOUNTER_ID) {
  return Object.hasOwn(CAPITAL_BOSS_ENCOUNTERS,id) ? CAPITAL_BOSS_ENCOUNTERS[id] : IRON_MAW;
}
export function requireCapitalBossEncounter(id) {
  const encounter = Object.hasOwn(CAPITAL_BOSS_ENCOUNTERS,id) ? CAPITAL_BOSS_ENCOUNTERS[id] : null;
  if (!encounter) throw new RangeError(`Unknown capital encounter: ${String(id)}`);
  return encounter;
}
export default IRON_MAW;
