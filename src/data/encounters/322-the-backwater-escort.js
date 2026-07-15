// 322 — THE BACKWATER ESCORT. Theo Von steal: escort a rambling asteroid miner
// whose regionally-specific analogies reveal a hidden history. The humor is in the
// sincere, overly-specific comparison — not random absurdity, but a person whose
// metaphor is a window into where they've been. Self-undercutting, never mean.
import { deepFreeze, defineEncounter } from './catalog.js';
import { E1_ENCOUNTER_RUNTIMES } from '../../systems/e1EncounterRuntime.js';

export const encounterOrder = 322;
export const trigger = deepFreeze({
  id: 'side_backwater_escort', tier: 'minor', deck: 'civilian', weight: 0.8,
  zoneTypes: ['mining_belt'], script: 'selfRegistered',
  pressureCost: 10, cooldownS: 43200, proximity: true,
  gates: { uniqueOnce: true, storyBeatMin: 1 },
});
export const runtime = E1_ENCOUNTER_RUNTIMES.h9;
export default defineEncounter(trigger, {
  title: 'THE BACKWATER ESCORT', factionId: 'faction_dmc', noCombat: true,
  context: 'convoy_civilian',
  primaryLine: 'MINER: Appreciate the escort. This belt\'s like the third drawer in my mother\'s kitchen — nobody opens it, everybody scared of what\'s in there, and it\'s where she kept the good cutlery. I\'m the cutlery.',
  choices: [
    { id: 'escort',  label: 'Escort the miner',     playerLine: 'Stay on your wing.' },
    { id: 'ask',     label: 'Ask about the drawer', playerLine: 'What was in the drawer?' },
    { id: 'decline', label: 'Decline the escort',   playerLine: 'Fly your own lane.' },
  ],
  timeoutChoice: 'decline',
  receipts: {
    escort: 'ESCORT COMPLETE — miner delivered. Left a frequency. Said if you\'re ever in the third drawer, ping him.',
    ask:    'MINER TALKED — the drawer had his sister\'s medical records. The records had a coordinate. The coordinate doesn\'t match any chart. He laughed about it.',
    decline:'ESCORT DECLINED — the miner flew the lane alone. The comms stayed open. He narrated the whole transit to nobody. You heard it anyway.',
  },
  graffitiOn: {
    ask: { line: 'THE DRAWER HAD A COORDINATE. THE COORDINATE HAD A LAUGH.', where: 'airlock' },
  },
});
