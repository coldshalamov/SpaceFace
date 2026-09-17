// 342 — Vael station screen. A warden pair interdicts the checkpoint approach:
// lawful security forcing a decision, not pirates. Inverted gates (minimum
// security, not maximum) put it in policed space where ambushes rarely go.
import { deepFreeze, defineEncounter } from './catalog.js';

export const encounterOrder = 342;
export const trigger = deepFreeze({
  id: 'vael_station_screen',
  tier: 'minor',
  deck: 'combat',
  weight: 0.8,
  zoneTypes: ['border_checkpoint', 'civilian_core'],
  script: 'ambush',
  pressureCost: 50,
  cooldownS: 720,
  proximity: true,
  gates: {
    minSecurity: 0.6,
    minSectorTier: 2,
    storyBeatMin: 1,
  },
});

export default defineEncounter(trigger, {
  shape: {
    situation: 'ambush',
    place: trigger.zoneTypes,
    twist: 'none',
    actor: 'faction_vael',
  },
  motive: 'area_control_interdiction',
  engagementTrigger: 'player_in_range',
  factionId: 'faction_vael',
  context: 'encounter',
  title: 'VAEL STATION SCREEN',
  primaryLine: 'SECURITY CONTACT: warden screen on the checkpoint approach. Hold vector or break it.',
  squad: {
    anchorArchetype: 'warden_escort',
    archetypes: ['warden_escort'],
    size: [2, 2],
    doctrine: 'official',
    formation: 'wedge',
  },
  bark: 'ambush_tele',
  telegraph: 'Warden screen deploying. It guards the lane, not hunts you.',
  aftermath: {
    flee: 'The screen reforms on the checkpoint and holds.',
    kill: 'The checkpoint approach goes unguarded; traffic scatters.',
  },
});
