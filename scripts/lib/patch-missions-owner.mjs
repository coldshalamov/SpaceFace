/** Exact seams read from coldshalamov/SpaceFace@de9f3f1fc, missions.js blob below.
 * This is NOT a replacement for the large missions owner. Refuse drift, then patch its seams.
 */
export const MISSIONS_BASE_BLOB = 'b46f9406e2570ecea69fe0cca0a52242b1e58bf4';
export const REWARD_BEFORE = `    // ── reward (one multiplicative family) ──
    const fDist = 1 + distance / (cfg.distDivisor || 2000);
    const fRisk = (cfg.RISK_MULT && cfg.RISK_MULT[riskTier]) || 1;
    const fValue = params.fValue;
    const fFaction = (this._repOf(info.factionId) >= (cfg.faction.friendlyThreshold || 25))
      ? (cfg.faction.loyaltyBonus || 1.15) : 1.0;
    const fTime = 1.0; // rush is opt-in at accept time (UI), default normal
    const base = (cfg.BASE && cfg.BASE[typeId]) || 100;
    const reward_cr = round(base * fDist * fRisk * fValue * fFaction * fTime);

    // ── time limit ──
    const travel = distance / (cfg.cruiseSpeedRef || 140);
    const slack = cfg.slackDefault || 2.2;
    const time_limit_s = round((travel + params.taskTime) * slack);

    // ── collateral (anti accept-then-dump on bulk_trade / smuggling) ──
    const collateral_cr = def.collateral ? round((cfg.collateralPct || 0.25) * reward_cr) : 0;`;
export const REWARD_AFTER = `    // Economy Pulse: pay the net work budget, not a product of unbounded multipliers.
    const economyTerms = priceProceduralOffer({type:typeId,info,dest,riskTier,distance,params,
      loyaltyMultiplier:this._repOf(info.factionId) >= (cfg.faction.friendlyThreshold || 25)
        ? (cfg.faction.loyaltyBonus || 1.15) : 1});
    const reward_cr = economyTerms.rewardCr;
    const time_limit_s = economyTerms.deadlineS;
    const collateral_cr = def.collateral ? economyTerms.collateralCr : 0;`;
export const SEAMS = [
  ["import { SECTORS, dangerTier } from '../data/sectors.js';",
   "import { priceProceduralOffer, offerMixForTier, economicRiskTier, standingWorkTier } from '../economy/economyMissionTerms.js';\nimport { SECTORS, dangerTier } from '../data/sectors.js';"],
  ["    const weights = OFFER_MIX[profile] || OFFER_MIX[info.type] || OFFER_MIX.trade_hub;",
   "    const weights = offerMixForTier(profile, Math.max(info.sectorTier || 0, standingWorkTier(this._repOf(info.factionId))));"],
  ["    return new Date().toISOString().slice(0, 10);",
   "    return `sim-day:${Math.floor(Math.max(0, Number(this.state.simTime) || 0) / 86400)}`;"],
  ["    const riskTier = clamp(sectorRisk, rLo, rHi);",
   "    const riskTier = clamp(economicRiskTier(typeId, sectorRisk, this._repOf(info.factionId)), rLo, rHi);"],
  [REWARD_BEFORE,REWARD_AFTER],
  ["      reward_cr, time_limit_s, collateral_cr, riskTier,\n      destStationId, destSectorId, distance,\n      params,\n      title: this._titleFor(typeId, params, dest),",
   "      reward_cr, time_limit_s, duration_s:time_limit_s, collateral_cr, riskTier,\n      economyTerms,\n      destStationId, destSectorId, distance,\n      params,\n      title: this._titleFor(typeId, params, dest),"],
  ["      riskTier: offer.riskTier,\n      destStationId: offer.destStationId, destSectorId: offer.destSectorId,",
   "      riskTier: offer.riskTier,\n      ...(offer.economyTerms ? { economyTerms: JSON.parse(JSON.stringify(offer.economyTerms)) } : {}),\n      destStationId: offer.destStationId, destSectorId: offer.destSectorId,"],
];

export function patchMissionsSeams(source) {
  let output=source;
  for(const [before,after] of SEAMS) {
    const count=output.split(before).length-1;
    if(count!==1) throw new Error(`Missions seam drift (${count} matches): ${before.slice(0,90)}`);
    output=output.replace(before,after);
  }
  const start=output.indexOf('  _rollParams(typeId, info, dest, riskTier, rng) {');
  const end=output.indexOf('\n  _titleFor(typeId, p, dest) {',start);
  if(start<0 || end<start) throw new Error('Missions parameter seam missing');
  let body=output.slice(start,end);
  for(const pool of ['LEGAL_TRADE_CMDTYS','MINEABLE_CMDTYS']) {
    const before=`pick(${pool})`;
    if(!body.includes(before)) throw new Error(`Missions pool seam missing: ${pool}`);
    body=body.replaceAll(before,`pick(${pool}.filter((id) => (CMDTY_BY_ID.get(id)?.marketTier || 0) <= Math.max(info.sectorTier || 0,dest?.sectorTier || 0)))`);
  }
  output=output.slice(0,start)+body+output.slice(end);
  return output;
}
