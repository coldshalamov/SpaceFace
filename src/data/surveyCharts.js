// Chart filing — the sell side of sector survey.
//
// The buy side is `surveyDataPrice` (sectors.js): a bar sells partial nav data for a neighbor
// sector. This module is the other half of the deal: when a sector's authored-site census
// (src/world/explorationJournal.js — investigated / identified / defeated over the curated
// site rows) reaches complete for the first time, the world files the finished chart and the
// cartography office pays for it once, durably, through the canonical credit writer.
//
// The curve is legible on purpose: a flat filing fee plus a per-site bounty, scaled by sector
// tier — a long safe chart pays for its length, a short deep chart pays for the risk the
// survey took. Pure math only: no runtime side effects, no ambient randomness.

export const CHART_FILING = Object.freeze({
  baseCr: 300,
  perSiteCr: 220,
  perTierCr: 850,
  // The Concord keeps the charts; a filed chart is logged standing, not just a credit line.
  repFactionId: 'faction_scn',
  repDelta: 2,
  reasonId: 'survey:chart_filed',
});

/** Credits the office pays for a completed sector chart. sector.tier drives the risk term. */
export function chartFilingBounty(sector, siteCount) {
  const tier = Math.max(0, Math.trunc(Number(sector && sector.tier) || 0));
  const sites = Math.max(0, Math.trunc(Number(siteCount) || 0));
  if (!(sites > 0)) return 0;
  return Math.round(
    CHART_FILING.baseCr
    + CHART_FILING.perSiteCr * sites
    + CHART_FILING.perTierCr * tier,
  );
}

/** Normalize the durable stamp a save carries on the sector's discovery record. */
export function normalizeChartFiling(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const at = Number(raw.at);
  const sites = Math.trunc(Number(raw.sites));
  const paid = Math.round(Number(raw.paid));
  if (!Number.isFinite(at) || at < 0 || !(sites > 0) || !(paid > 0)) return null;
  return { at, sites, paid };
}
