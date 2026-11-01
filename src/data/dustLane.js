// DUST P1b — the additive dust lane's append-only eligibility and pacing constants.
//
// The 2026-10-31 exposure audit (design/program/dust/EXPOSURE_AUDIT.md §1.2) found 195 of 354
// encounter modules dark: authored, dispatchable vignettes whose only barrier is the
// `gates.externalOnly` planner rejection plus the lived tick's `livedRotation !== true`
// rejection. This module declares — WITHOUT editing a single encounter file — which of those
// modules the dust lane may present. It is append-only by contract (dust/README.md P1b):
// nothing here reweights, reorders, or removes a legacy candidate, so the legacy
// per-(seed, sector, day) rng stream keeps its exact draw sequence (audit §4/§5).
//
// Eligibility is deliberately narrow:
//   - `gates.externalOnly === true` — the exact gate that darkened the family. Modules with
//     `externalOnly` at trigger top level (e.g. last_argument_passage) are NOT captured: the
//     legacy planner filter never read that spelling, and their authored dispatchers stay owner.
//   - non-empty `zoneTypes` — the repo's real disable switch (a `weight` of 0 coerces to 1;
//     empty `zoneTypes` is what disables). The k1_* presence modules and the depth follow-on
//     stubs (both `zoneTypes: []`) stay out.
//   - not `interlude_*` — the story campaign dispatches its six interludes itself.
//   - not the two physical prop scenes (`scene_struck_bell`, `scene_sweep_window`) — the lived
//     tick's prop-proximity route already owns them.
//   - `livedRotation !== true` — the thirty curated rotation modules keep their existing
//     once-ever lived route; the lane lights only the dark remainder of the 4xx/5xx catalog.
//   - civilian deck / ambient tier only — the lane adds world-life, never combat pressure.

export const DUST_LANE_STREAM_LABEL = 'dust-lane-v1';
export const DUST_LIVE_STREAM_LABEL = 'dust-lane-live-v1';

// The lane's own scheduling caps (audit §5.1 sizing, adapted): at most this many dust offers
// per sector-day from the day planner, each item once-ever per save after it fires, a
// lane-specific minimum spacing between dust presentations (plus a 1-at-a-time bound on live
// scan offers), and a 15 s live-scan cadence — so the lane fills legacy-idle pumps without
// raising the encounter rate beyond the pacing valves' existing bounds.
export const DUST_MAX_PER_DAY = 2;
export const DUST_UNSEEN_WEIGHT = 6;
export const DUST_FIRE_GAP_S = 120;
export const DUST_SCAN_S = 15;

const PROP_SCENE_IDS = new Set(['scene_struck_bell', 'scene_sweep_window']);

/** True when the encounter module is dust-lane-eligible (append-only; see file header). */
export function isDustLaneEncounter(enc) {
  if (!enc || typeof enc !== 'object') return false;
  if (!enc.gates || enc.gates.externalOnly !== true) return false;
  if (!Array.isArray(enc.zoneTypes) || enc.zoneTypes.length === 0) return false;
  if (enc.deck !== 'civilian' || enc.tier !== 'ambient') return false;
  const id = String(enc.id || '');
  if (!id || id.startsWith('interlude_')) return false;
  if (PROP_SCENE_IDS.has(id)) return false;
  if (enc.livedRotation === true) return false;
  return true;
}

/** Ordered id list of the current dust cohort (audit/digest helper; order = registry order). */
export function dustLaneCohort(catalog) {
  const ids = [];
  for (const enc of Object.values(catalog || {})) {
    if (isDustLaneEncounter(enc)) ids.push(enc.id);
  }
  return ids;
}
