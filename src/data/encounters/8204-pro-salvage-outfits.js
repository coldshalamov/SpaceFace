// Two working crews arrive for the same finite salvage. The encounter schedules discovery;
// salvageOutfits is the sole owner of bodies, agreements, memory, and settlement.
import { deepFreeze, defineEncounter } from './catalog.js';

export const encounterOrder = 8204;
export const trigger = deepFreeze({
  id: 'pro_salvage_outfits',
  tier: 'minor',
  deck: 'civilian',
  weight: 1.25,
  zoneTypes: ['derelict_field', 'mining_belt', 'refinery_approach'],
  script: 'selfRegistered',
  fallbackScript: 'whisper',
  pressureCost: 18,
  cooldownS: 720,
  proximity: true,
  fireWithinWu: 480,
  gates: { sectorIds: ['sector_ceres_belt', 'sector_vesta_forge'] },
});

export function fireReady(state) {
  const sectorId = state?.world?.currentSectorId;
  if (!trigger.gates.sectorIds.includes(sectorId)) return false;
  const meetings = state?.salvageOutfits?.meetings;
  for (const id in meetings) {
    const meeting = meetings[id];
    if (meeting?.sectorId === sectorId && meeting.status === 'working') return false;
  }
  return true;
}

export const runtime = Object.freeze({
  fire(d, live, state) {
    const owner = d.registry?.get?.('salvageOutfits');
    if (!owner?.start) return d.abort(live, 'missing_salvage_outfits_owner');
    // Director readiness is a bounded scheduling hold and can expire. Recheck here so an
    // expired hold cannot create a second active race in the same physical work pocket.
    if (!state.salvageOutfits?.meetings?.[live.id] && !fireReady(state)) {
      return d.abort(live, 'salvage_outfits_site_busy');
    }
    const center = live.plan?.zoneCenter || live.anchor;
    if (!center || !Number.isFinite(center.x) || !Number.isFinite(center.z)) {
      return d.abort(live, 'no_anchor');
    }
    const result = owner.start({
      encounterId: live.id,
      sectorId: live.sectorId || state.world?.currentSectorId,
      anchor: { x: center.x, z: center.z },
      variant: live.data?.salvageOutfitsVariant,
    });
    if (result === false || result?.ok === false) {
      return d.abort(live, result?.reason || 'outfits_unavailable');
    }
    const id = result?.meetingId || result?.id || live.id;
    if (!state.salvageOutfits?.meetings?.[id]) return d.abort(live, 'outfits_not_started');
    live.data = live.data || {};
    live.data.salvageOutfitsId = id;
    live.data.adoptedWorldActors = true;
    live.phase = 'working';
    // No acceptance gate, timer loot, cast adoption, or despawn here. Crews work if ignored.
  },

  tick(d, live, state) {
    if (live.phase === 'done') return;
    const meeting = state.salvageOutfits?.meetings?.[live.data?.salvageOutfitsId];
    if (!meeting) return d.abort(live, 'outfits_record_missing');
    if (meeting.status === 'complete') return d.resolve(live, 'worked', { speak: false });
  },
});

export default defineEncounter(trigger, {
  shape: { situation: 'salvage', place: trigger.zoneTypes, twist: 'named', actor: 'faction_pitborn' },
  title: 'Two crews, one wreck',
  context: 'civilian',
  motive: 'recover_finite_salvage',
  engagementTrigger: 'none',
  factionId: 'faction_pitborn',
  choices: [],
  bark: null,
  telegraph: 'A broad Keel Union tug lines up its winch while a Latchkey skiff cuts toward the same wreck.',
  receipts: { worked: 'The crews have finished this job. Every recovered piece has a destination.' },
});
