// The Bulwark never appears as a solo shield brick: its guaranteed interceptor wing supplies the
// allied hulls its projector mechanic is designed to protect.
import { deepFreeze, defineEncounter } from './catalog.js';

export const encounterOrder = 348;
export const trigger = deepFreeze({
  id: 'medium_bulwark_wing',
  tier: 'minor',
  deck: 'combat',
  weight: 0.55,
  zoneTypes: ['patrol_corridor', 'trade_lane', 'refinery_approach', 'outlaw_zone'],
  script: 'ambush',
  pressureCost: 56,
  cooldownS: 960,
  proximity: true,
  gates: {
    minSectorTier: 2,
    maxSecurity: 0.7,
  },
});
export default defineEncounter(trigger, {
  motive: 'projected_wing_interdiction',
  engagementTrigger: 'player_enters_projector_envelope',
  factionId: 'faction_reach',
  context: 'encounter',
  title: 'PROJECTOR WING',
  primaryLine: 'LINKED CONTACTS: a Bulwark emitter is carrying an Interceptor wing through the approach.',
  squad: {
    anchorArchetype: 'bulwark_escort',
    archetypes: ['hostile_interceptor'],
    size: [3, 4],
    doctrine: 'anchor',
    formation: 'ring',
  },
  bark: 'ambush_tele',
  telegraph: 'The emitter ring is feeding the wing. Strip it, or pull the anchor out of link range.',
  aftermath: {
    flee: 'The wing loses its shared field and separates.',
    kill: 'The projector ring gutters while the surviving escorts scatter.',
  },
});
