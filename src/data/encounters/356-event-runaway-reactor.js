// Rare Plan 20 physical emergency: tow, shove, or shoot the venting hull before lane contact.
import { deepFreeze, defineEncounter } from './catalog.js';
import { SETPIECE_EVENT_RUNTIMES } from '../../systems/setpieceEventRuntime.js';

export const encounterOrder = 356;
export const trigger = deepFreeze({
  id: 'event_runaway_reactor',
  tier: 'major',
  deck: 'civilian',
  weight: 0.11,
  rare: true,
  zoneTypes: ['trade_lane', 'civilian_core', 'patrol_corridor'],
  script: 'selfRegistered',
  pressureCost: 90,
  cooldownS: 86_400,
  proximity: true,
  gates: { storyBeatMin: 1, minSectorTier: 1 },
});

export const runtime = SETPIECE_EVENT_RUNTIMES.runawayReactor;
export default defineEncounter(trigger, {
  factionId: 'faction_free',
  title: 'RUNAWAY REACTOR',
  primaryLine: 'OPEN-BAND MAYDAY: venting ship on the populated lane. Tow it, shove it sunward, or break it up clear.',
  telegraph: 'The reactor glow and open-band call replace a hidden countdown.',
  receipts: {
    reactor_towed_clear: 'REACTOR TOWED CLEAR — traffic is safe.',
    reactor_shoved_sunward: 'REACTOR DIVERTED — traffic is safe.',
    reactor_destroyed_safe: 'REACTOR DESTROYED CLEAR — fragments miss the lane.',
    reactor_detonated_close: 'REACTOR DETONATED CLOSE — debris tears through traffic.',
    reactor_lane_breach: 'REACTOR BREACH — the populated lane is closed.',
  },
});
