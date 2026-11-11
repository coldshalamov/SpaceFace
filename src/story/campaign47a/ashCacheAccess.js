// Limited story-entry clearance, not a reputation award. Pure over canonical saved owners.
export const ASH_CACHE_CLEARANCE_TEXT = 'ASH CACHE BERTH CONTROL: Your working seed carries limited Deep Reach clearance through the disposition at the desk. Vael standing, debts and conduct restrictions remain in force.';

export function hasAshCacheStoryClearance(state, station) {
  const id = typeof station === 'string' ? station : station?.stationId || station?.id;
  if (id !== 'station_ashcache') return false;
  const story = state?.story;
  const flags = story?.flags;
  if (story?.beatIndex !== 7 || story.endgameResolved || story.endgameChoice
      || flags?.sandboxContinued || !flags
      || flags.elroy_outcome_legacy || !flags.beat_6_done
      || !flags.empire_seed_complete || flags.deep_reach_asset_lost
      || flags.empire_seed_pending_id != null) return false;
  // An embodied register receipt distinguishes the live campaign from old pinned saves.
  const done = story.campaign47a?.stepProgress?.['2']?.completed;
  if (!Array.isArray(done) || !done.includes('elroy')) return false;
  if (!['patrol', 'traders', 'free'].includes(story.branch)) return false;
  const idSeed = flags.empire_seed_asset_id;
  if (idSeed == null) return false;
  const automation = state?.automation;
  const alive = row => row?.id === idSeed && row.alive !== false
    && !['lost', 'destroyed', 'dead'].includes(row.status);
  if (flags.empire_seed_variant === 'trader') {
    return !!automation?.traders?.some(row => alive(row) && row.route?.from
      && row.route?.to && row.route?.good);
  }
  if (flags.empire_seed_variant === 'outpost') return !!automation?.outposts?.some(alive);
  // Program identity is checked against the same branch mapping as the seed owner.
  const variant = story.branch === 'patrol' ? 'custody_watch' : 'force_logistics';
  if (flags.empire_seed_variant !== variant) return false;
  const program = story.branch === 'patrol' ? 'patrol_guard' : 'mine_to_depot';
  return !!automation?.drones?.some(row => alive(row) && row.program?.templateId === program);
}

// Remove only the numeric floor on a copy. Explicit hostility and every other denial survive.
export function ashCacheAccessRecord(state, station, stationId) {
  return station && typeof station === 'object' && hasAshCacheStoryClearance(state, stationId || station)
    ? { ...station, id: station.id || stationId || station.stationId, minRep: -Infinity, repGated: false } : station;
}
