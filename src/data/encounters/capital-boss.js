// LAST_ARGUMENT_INTEGRATION_V1
import { LAST_ARGUMENT_SCORE } from './capital-boss/last-argument.js';
// Packet 09: complete authored capitals. Legacy exports and actor recipe fields are preserved.
// `.score` is executed by capitalBossScore.js; the stock mission spawner alone does NOT execute it.
import { IRON_MAW } from './capital-boss/iron-maw.js';
import { TOLLMAN } from './capital-boss/tollman.js';
import { ALA } from './capital-boss/ala.js';
import { FOREMAN } from './capital-boss/foreman.js';
import { REGENT } from './capital-boss/regent.js';
import { BROOD_QUEEN } from './capital-boss/brood-queen.js';
import { TENDRIL } from './capital-boss/tendril.js';
// W-COLOSSI (row 547, expansion 07 §5): the rest of the Colossus roster — the Nest Carrier,
// Casket Worm, Furnace Maw, Yardmaster, Adjudicator 44-C and Hive-hulk join the Foreman,
// Regent and Spindle Mother on row-448's plate framework.
import { NEST_CARRIER } from './capital-boss/nest-carrier.js';
import { CASKET_WORM } from './capital-boss/casket-worm.js';
import { FURNACE_MAW } from './capital-boss/furnace-maw.js';
import { YARDMASTER } from './capital-boss/yardmaster.js';
import { ADJUDICATOR_44C } from './capital-boss/adjudicator-44c.js';
import { HIVE_HULK } from './capital-boss/hive-hulk.js';
export { SUBSYSTEM_ROLES as CAPITAL_BOSS_SUBSYSTEM_ROLES } from './capital-boss/shared.js';
export const CAPITAL_BOSS_ENCOUNTER_ID = 'capital_boss_hulk';
export const CAPITAL_BOSS_TOLLMAN_ENCOUNTER_ID = 'capital_boss_tollman';
export const CAPITAL_BOSS_ALA_ENCOUNTER_ID = 'capital_boss_ala';
// FB-024: the Crucible's wave-20/wave-30 champions field the authored Foreman/Regent scores.
// They are encounter-only ids — no mission row posts them; the swarm wave owner starts the fight.
export const CAPITAL_BOSS_FOREMAN_ENCOUNTER_ID = 'capital_boss_foreman';
export const CAPITAL_BOSS_REGENT_ENCOUNTER_ID = 'capital_boss_regent';
// SWARM-07 B3: the deep rotation's Brood champions — the Queen's nest at wave 70 and the
// Tendril's coil field at wave 80. Same encounter-only contract as the Foreman/Regent rows.
export const CAPITAL_BOSS_BROOD_QUEEN_ENCOUNTER_ID = 'capital_boss_brood_queen';
export const CAPITAL_BOSS_TENDRIL_ENCOUNTER_ID = 'capital_boss_tendril';
// W-COLOSSI (row 547): encounter-only ids, swarm-fielded through the rotation like the
// Foreman/Regent rows — no mission row posts them.
export const CAPITAL_BOSS_NEST_CARRIER_ENCOUNTER_ID = 'capital_boss_nest_carrier';
export const CAPITAL_BOSS_CASKET_WORM_ENCOUNTER_ID = 'capital_boss_casket_worm';
export const CAPITAL_BOSS_FURNACE_MAW_ENCOUNTER_ID = 'capital_boss_furnace_maw';
export const CAPITAL_BOSS_YARDMASTER_ENCOUNTER_ID = 'capital_boss_yardmaster';
export const CAPITAL_BOSS_ADJUDICATOR_ENCOUNTER_ID = 'capital_boss_adjudicator';
export const CAPITAL_BOSS_HIVE_HULK_ENCOUNTER_ID = 'capital_boss_hive_hulk';
export const CAPITAL_BOSS_ENCOUNTER = IRON_MAW;
export const CAPITAL_BOSS_TOLLMAN_ENCOUNTER = TOLLMAN;
export const CAPITAL_BOSS_ALA_ENCOUNTER = ALA;
export const CAPITAL_BOSS_FOREMAN_ENCOUNTER = FOREMAN;
export const CAPITAL_BOSS_REGENT_ENCOUNTER = REGENT;
export const CAPITAL_BOSS_BROOD_QUEEN_ENCOUNTER = BROOD_QUEEN;
export const CAPITAL_BOSS_TENDRIL_ENCOUNTER = TENDRIL;
export const CAPITAL_BOSS_NEST_CARRIER_ENCOUNTER = NEST_CARRIER;
export const CAPITAL_BOSS_CASKET_WORM_ENCOUNTER = CASKET_WORM;
export const CAPITAL_BOSS_FURNACE_MAW_ENCOUNTER = FURNACE_MAW;
export const CAPITAL_BOSS_YARDMASTER_ENCOUNTER = YARDMASTER;
export const CAPITAL_BOSS_ADJUDICATOR_ENCOUNTER = ADJUDICATOR_44C;
export const CAPITAL_BOSS_HIVE_HULK_ENCOUNTER = HIVE_HULK;
export const CAPITAL_BOSS_ENCOUNTERS = Object.freeze({
  [LAST_ARGUMENT_SCORE.id]: LAST_ARGUMENT_SCORE,
  [IRON_MAW.id]: IRON_MAW, [TOLLMAN.id]: TOLLMAN, [ALA.id]: ALA,
  [FOREMAN.id]: FOREMAN, [REGENT.id]: REGENT,
  [BROOD_QUEEN.id]: BROOD_QUEEN, [TENDRIL.id]: TENDRIL,
  [NEST_CARRIER.id]: NEST_CARRIER, [CASKET_WORM.id]: CASKET_WORM,
  [FURNACE_MAW.id]: FURNACE_MAW, [YARDMASTER.id]: YARDMASTER,
  [ADJUDICATOR_44C.id]: ADJUDICATOR_44C, [HIVE_HULK.id]: HIVE_HULK,
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
