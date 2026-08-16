import { deepFreeze, defineEncounter } from './catalog.js';
import { RARE_SPAWN_RUNTIMES } from '../../systems/rareSpawnRuntime.js';

export const encounterOrder = 361;
export const trigger = deepFreeze({
  id: 'rare_double_wreck', tier: 'minor', deck: 'civilian', weight: 0.055, rare: true,
  zoneTypes: ['derelict_field', 'ambush_lane', 'outlaw_zone'],
  script: 'selfRegistered', pressureCost: 36, cooldownS: 86_400, proximity: true,
});
export const runtime = RARE_SPAWN_RUNTIMES.doubleWreck;
export default defineEncounter(trigger, {
  factionId: 'faction_free',
  noCombat: true,
  title: 'THE DOUBLE WRECK',
  primaryLine: 'SALVAGE RETURN: two ships killed each other, locked hull-to-hull, both black boxes still readable.',
  choices: [
    { id: 'read', label: 'Read both boxes' },
    { id: 'leave', label: 'Leave them locked' },
  ],
  timeoutChoice: 'leave',
  rareRumor: {
    kind: 'cache', kindLabel: 'Paired Wreck Return', targetName: 'locked mutual-kill wrecks',
    radius: 780,
    text: 'Salvagers logged one return with two hull signatures. The ring encloses the tumble; both manifests are still physical.',
  },
  receipts: {
    both_manifests_recovered: 'DOUBLE WRECK READ — both boxes agree that neither ship turned.',
    left_locked: 'DOUBLE WRECK LEFT — two manifests keep the argument.',
  },
});
