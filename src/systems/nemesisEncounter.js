// Production binding: use the existing combat catalogue and existing core/budget helpers.
// The standalone fixture imports encounterHost.js and injects a contract spy instead.
import { makeEnemySpawnSpec } from './combat.js';
import { createNemesisEncounterHost } from '../nemesis/encounterHost.js';

export const nemesisEncounter = createNemesisEncounterHost({ makeSpawnSpec: makeEnemySpawnSpec });
export { createNemesisEncounterHost } from '../nemesis/encounterHost.js';
export default nemesisEncounter;
