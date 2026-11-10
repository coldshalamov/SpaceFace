/** Canonical contract economics. Pure quotes, never grants; accepted rewards remain immutable. */
import { ECONOMY_BALANCE as B } from '../data/economyDerived.js';
import { finite, clamp } from './economyMath.js';
export const economyTier = (value) => clamp(Math.floor(finite(value)),0,B.phases.length-1);

export function offerMixForTier(profile, tier = 0) {
  return (B.offerMixByTier[profile] || B.offerMixByTier.trade_hub)[economyTier(tier)];
}

/** Fit one-load work to physical hold space, not the player's wallet or an imagined capacity. */
export function affordableContractQuantity({ desired, freeVolume, volumePerUnit = 1, sourceStock = Infinity }) {
  if (!Number.isFinite(freeVolume) || freeVolume < 0 || !(volumePerUnit > 0)) return 0;
  const available = sourceStock === Infinity ? Infinity : Math.max(0,Math.floor(finite(sourceStock)));
  return Math.max(0,Math.min(B.mission.maxCargoQty,Math.floor(finite(desired)),
    Math.floor((freeVolume+1e-9)/volumePerUnit),available));
}

/**
 * Invert E[net] = p*(reward + otherRevenue) - operating - suppliedInputs - failureLoss.
 * Monetary inputs are EXPLICIT estimates; they are never reread at settlement.
 * No cargo purchase reimbursement for sealed client-supplied cargo, or bulk_trade
 * (whose sale proceeds already return the player's principal).
 */
export function quoteMissionEconomics({
  type, tier=0, riskTier=0, distance=0, params={}, preloadedCargo=false,
  cargoPurchaseCr=null, cargoOpportunityCr=null, expectedOtherRevenueCr=null,
  expectedFailureLossCr=0, fieldPressure=0, loyaltyMultiplier=1, collateralRequired=null,
} = {}) {
  const work=B.mission.work[type];
  if (!work) throw new RangeError(`Unknown economic mission type: ${String(type)}`);
  const phaseIndex=economyTier(tier), phase=B.phases[phaseIndex], cfg=B.mission;
  const risk=clamp(Math.floor(finite(riskTier)),0,4);
  const qty=clamp(Math.floor(finite(params.qty)),0,cfg.maxCargoQty);
  const commodity=B.commodities[params.cmdtyId];
  let units=1;
  if (type==='patrol_clear') units=clamp(finite(params.clearCount,3),1,cfg.maxCount)/3;
  else if (type==='recon_scan') units=clamp(finite(params.scanTargets,2),1,cfg.maxCount)/2;
  else if (type==='bounty_hunt') units=clamp(finite(params.targetStrength,1.5),0.5,12)/1.5;
  else if (qty && commodity) units=clamp(qty/commodity.lotUnits,0.5,8);
  const travelS=clamp(finite(distance),0,1_000_000)*work.legs/cfg.cruiseWuPerS;
  const expectedDurationS=Math.ceil(cfg.handlingS+cfg.searchS+work.taskS*units+travelS);
  const serviceNetCr=phase.netCrPerHour*expectedDurationS/3600;
  const pressure=clamp(finite(fieldPressure),0,1);
  const serviceTargetCr=serviceNetCr*(1+cfg.riskWagePremium[risk])
    *(1+pressure*cfg.maxFieldPremium)*clamp(finite(loyaltyMultiplier,1),1,1.15);
  const operatingCr=serviceNetCr*phase.operatingFraction/(1-phase.operatingFraction);
  const successProbability=cfg.successProbability[risk];
  const catalogValue=commodity ? commodity.basePrice*qty : Math.max(0,finite(params.cargoValue));
  let suppliedInputsCr=0;
  if (work.consumesCargo && !preloadedCargo) {
    // Salvage has an opportunity cost, not an imaginary purchase invoice.
    suppliedInputsCr=work.recoveredCargo
      ? Math.max(0,finite(cargoOpportunityCr ?? catalogValue, catalogValue))
      : Math.max(0,finite(cargoPurchaseCr ?? catalogValue*(1+B.market.spread/2), catalogValue*(1+B.market.spread/2)));
  }
  // Retained mining cargo pays part of the job. No second full wage for the same rock.
  const otherRevenueCr=expectedOtherRevenueCr != null ? Math.max(0,finite(expectedOtherRevenueCr))
    : work.retainedLoot ? catalogValue*(1-B.market.spread/2)
    : work.saleRevenue && commodity ? commodity.referenceGrossCr*qty/commodity.lotUnits : 0;
  const needsCollateral=collateralRequired ?? ['bulk_trade','smuggling_run'].includes(type);
  const collateralCr=needsCollateral && !preloadedCargo
    ? Math.floor(Math.min(catalogValue*0.10,serviceNetCr*cfg.collateralWageFraction)) : 0;
  const failureLossCr=Math.max(0,finite(expectedFailureLossCr))+(1-successProbability)*collateralCr;
  const required=(serviceTargetCr+operatingCr+suppliedInputsCr+failureLossCr)
    /successProbability-otherRevenueCr;
  // Kept cargo or ordinary trade margin can already cover the wage. A quota still pays
  // a modest, explicit objective premium; never advertise a zero-credit job as new income.
  const floor=(work.retainedLoot || work.saleRevenue) ? serviceNetCr*0.10 : 0;
  const rewardCr=Math.ceil(Math.max(floor,required));
  if (!Number.isSafeInteger(rewardCr)) throw new RangeError('Contract reward exceeds safe credit range');
  return {
    version:B.version,tier:phaseIndex,type,riskTier:risk,
    expectedDurationS,deadlineS:Math.max(cfg.minimumDeadlineS,Math.ceil(expectedDurationS*cfg.deadlineSlack)),
    rewardCr,collateralCr,
    targetNetCr:serviceTargetCr,operatingCr,suppliedInputsCr,otherRevenueCr,failureLossCr,successProbability,
    expectedNetCr:successProbability*(rewardCr+otherRevenueCr)-operatingCr-suppliedInputsCr-failureLossCr,
    expectedNetCrPerHour:(successProbability*(rewardCr+otherRevenueCr)-operatingCr-suppliedInputsCr-failureLossCr)*3600/expectedDurationS,
  };
}

/** Read-only adapter for the ordinary missions owner's known info/destination contracts.
 *  `tier` pins the priced tier, escaping the sector-max walk for a type that owns its pay class. */
export function priceProceduralOffer({ type, info, dest, riskTier, distance, params, loyaltyMultiplier=1, tier=null }) {
  return quoteMissionEconomics({type,
    tier: tier != null ? economyTier(tier)
      : Math.max(economyTier(info?.sectorTier ?? info?.tier),
        economyTier(dest?.sectorTier ?? dest?.tier),economyTier(riskTier)),
    riskTier,distance,params,loyaltyMultiplier});
}

/** Standing unlocks stronger *spawned* combat work, not richer pay for an unchanged delivery. */
export function standingWorkTier(standing) {
  const rep=finite(standing);
  return rep>=400 ? 4 : rep>=150 ? 3 : rep>=30 ? 2 : rep>=0 ? 1 : 0;
}
export function economicRiskTier(type, sectorRisk, standing) {
  return ['bounty_hunt','patrol_clear','escort','demolition','rescue_under_fire'].includes(type)
    ? Math.max(finite(sectorRisk),standingWorkTier(standing)) : finite(sectorRisk);
}
