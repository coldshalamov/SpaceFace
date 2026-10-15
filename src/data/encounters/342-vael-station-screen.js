// 342 — Vael station screen. A warden pair interdicts the checkpoint approach:
// lawful security forcing a decision, not pirates. Inverted gates (minimum
// security, not maximum) put it in policed space where ambushes rarely go.
// Gates used to demand tier 2 AND security >= 0.6, and no border_checkpoint /
// civilian_core host satisfies both (tier-2 hosts run 0.30-0.35 security; the
// 0.6+ hosts are all tier 0-1) — the shape could not schedule anywhere. The
// security floor is the authored intent and stays; the tier floor drops to 1 so
// the policed core hosts it (Ceres 0.72, Tethys 0.65, Dione 0.68).
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
    minSectorTier: 1,
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
