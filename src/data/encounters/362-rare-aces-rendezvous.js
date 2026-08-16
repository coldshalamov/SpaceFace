import { deepFreeze, defineEncounter } from './catalog.js';
import { RARE_SPAWN_RUNTIMES } from '../../systems/rareSpawnRuntime.js';

export const encounterOrder = 362;
export const trigger = deepFreeze({
  id: 'rare_aces_rendezvous', tier: 'major', deck: 'combat', weight: 0.04, rare: true,
  zoneTypes: ['outlaw_zone', 'ambush_lane', 'border_checkpoint'],
  script: 'selfRegistered', pressureCost: 88, cooldownS: 86_400, proximity: true,
});
export const runtime = RARE_SPAWN_RUNTIMES.acesRendezvous;
export default defineEncounter(trigger, {
  factionId: 'faction_reach',
  motive: 'trade_named_crew_hardware',
  engagementTrigger: 'rendezvous_interrupted',
  title: "ACES' RENDEZVOUS",
  primaryLine: 'TWO NAMED TRANSPONDERS: a trade is underway. Interrupt it and both gimmicks turn at once.',
  choices: [
    { id: 'interrupt', label: 'Interrupt the trade' },
    { id: 'observe', label: 'Observe and leave' },
  ],
  timeoutChoice: 'observe',
  // Existing ace identities, copied as encounter composition references so this self-registering
  // module does not create an encounters -> runtime -> namedAces -> encounters import cycle.
  acePool: [
    { id: 'ace_yara_no_cut', name: 'Yara No-Cut', factionId: 'faction_reach', returnArchetype: 'corsair_raider', baseReturnLevel: 4 },
    { id: 'ace_toll_saint_venn', name: 'Toll Saint Venn', factionId: 'faction_reach', returnArchetype: 'lancer_sniper', baseReturnLevel: 5 },
    { id: 'ace_jex_wake_salt', name: 'Jex Wake-Salt', factionId: 'faction_reach', returnArchetype: 'mine_layer_jackal', baseReturnLevel: 4 },
    { id: 'ace_ves_no_face', name: 'Ves No-Face', factionId: 'faction_quiet', returnArchetype: 'quiet_ghost', baseReturnLevel: 5 },
  ],
  rareRumor: {
    kind: 'hunter', kindLabel: 'Two-Ace Crosscheck', targetName: 'named-ace rendezvous',
    radius: 920,
    text: 'Two named transponders overlap inside one broad search ring. Both bounties and both combat signatures are real.',
  },
  receipts: {
    double_bounty: 'ACES RENDEZVOUS ENDED — both named bounties cleared.',
    aces_escaped: 'ACES RENDEZVOUS BROKEN — surviving crews escaped separately.',
    trade_completed: 'ACES RENDEZVOUS OBSERVED — the exchange completed.',
  },
});
