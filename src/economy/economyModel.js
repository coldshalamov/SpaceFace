/**
 * SPACEFACE / ECONOMY PULSE — the AUTHORING source, not a feedback controller.
 * Targets below are design decisions, not measured facts. All money tables are
 * consequences of these decisions. Change assumptions here; run the generator.
 * Runtime never inflates prices because a player is wealthy or has played longer.
 */
import { averageBoundedPrice } from './economyMath.js';
const rounded = (n, digits = 6) => Number(n.toFixed(digits));
export function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

export const ECONOMY_MODEL = deepFreeze({
  version: 1,
  currency: 'cr',
  // Economic opportunity tiers, NOT automatic elapsed-hour/player-level bands.
  phases: [
    { id: 'foothold',    netCrPerHour: 6000,  operatingFraction: 0.18, rpPerHour: 12,  referenceHold: 24 },
    { id: 'specialist',  netCrPerHour: 10000, operatingFraction: 0.20, rpPerHour: 18,  referenceHold: 36 },
    { id: 'operator',    netCrPerHour: 18000, operatingFraction: 0.22, rpPerHour: 24,  referenceHold: 54 },
    { id: 'captain',     netCrPerHour: 30000, operatingFraction: 0.24, rpPerHour: 36,  referenceHold: 80 },
    { id: 'industrial',  netCrPerHour: 48000, operatingFraction: 0.26, rpPerHour: 48,  referenceHold: 120 },
    { id: 'enterprise',  netCrPerHour: 72000, operatingFraction: 0.28, rpPerHour: 60,  referenceHold: 180 },
  ],
  market: {
    referenceElasticity: 0.45, producerDiscount: 0.12, consumerPremium: 0.20,
    spread: 0.08, lotImpactFraction: 0.05, stockShockFraction: 0.35,
    priceShockAtTier0: 0.16, priceShockPerTier: 0.025,
    halfLifeS: 900, priceLo: 0.4, priceHi: 2.6, // fallback for non-catalog listings only
    steadyTradeMarginFraction: 0.65, steadyExtractionBidFraction: 0.88,
    referenceWorkingCapitalFraction: 0.35,
    cycleDeviationBudget: 0.12, cycleWeight: 0.35,
    cyclePeriodInHauls: [2, 6], referenceHaulS: 240,
  },
  contract: {
    referenceDistanceWu: 1800, cruiseWuPerS: 100,
    handlingS: 45, searchS: 35, deadlineSlack: 2.4, minimumDeadlineS: 240,
    refreshS: 300, maxCount: 64, maxCargoQty: 4096,
    successProbability: [0.98, 0.94, 0.88, 0.80, 0.70],
    riskWagePremium: [0, 0.10, 0.22, 0.38, 0.60],
    maxFieldPremium: 0.35,
    collateralWageFraction: 0.35,
    maintenanceCadenceS: 600,
  },
  resource: {
    halfLifeS: 1200, operatingStockFraction: 0.5,
    workSecondsPerSimSecond: 1.10, maxTravelS: 45, conservativeCruiseWuPerS: 60,
    maxLeaseS: 900, maxLeasesPerSector: 16, maxGrantWorkS: 600,
  },
});

// Physical reference inputs copied from the packet's canonical catalog; verifier checks every
// value against the live catalog. Lot generation fits the declared phase hold, not an imaginary ship.
export const COMMODITY_REFERENCE_VOLUMES = deepFreeze({
  "cmdty_ore_iron": 1.0,
  "cmdty_ore_copper": 1.0,
  "cmdty_ore_titanium": 1.0,
  "cmdty_silicate": 1.0,
  "cmdty_ice_water": 1.4,
  "cmdty_volatiles": 1.4,
  "cmdty_ore_platinoid": 1.0,
  "cmdty_ore_bronzium": 1.0,
  "cmdty_ore_silverium": 1.0,
  "cmdty_ore_goldium": 1.0,
  "cmdty_ore_platinium": 1.0,
  "cmdty_ore_einsteinium": 1.0,
  "cmdty_gem_emerald": 0.8,
  "cmdty_gem_ruby": 0.8,
  "cmdty_gem_diamond": 0.8,
  "cmdty_exotic_amazonite": 0.8,
  "cmdty_gas_hydrogen": 2.5,
  "cmdty_gas_helium3": 2.5,
  "cmdty_crystal_silica": 1.0,
  "cmdty_crystal_lumin": 1.0,
  "cmdty_exotic_xenium": 1.0,
  "cmdty_refined_metals": 0.5,
  "cmdty_alloys": 0.5,
  "cmdty_polymers": 1.2,
  "cmdty_fuel_cells": 0.8,
  "cmdty_purified_silica": 0.8,
  "cmdty_regocrete": 1.5,
  "cmdty_control_unit": 1.2,
  "cmdty_comp_hullplate": 0.7,
  "cmdty_comp_circuitry": 0.6,
  "cmdty_microchips": 0.7,
  "cmdty_electronics": 0.9,
  "cmdty_quantum_cores": 0.9,
  "cmdty_consumer_goods": 1.0,
  "cmdty_textiles": 1.0,
  "cmdty_luxury_goods": 0.9,
  "cmdty_art": 0.7,
  "cmdty_food": 1.0,
  "cmdty_medical": 0.8,
  "cmdty_scrap_metal": 1.0,
  "cmdty_salvage_electronics": 0.6,
  "cmdty_classified_salvage": 0.6,
  "cmdty_narcotics": 0.6,
  "cmdty_stolen_goods": 1.0,
  "cmdty_weapons": 0.9,
  "cmdty_munitions": 0.6,
  "cmdty_impulse_charge": 2.0
});

// [tier, representative lot units, door-to-door active work minutes, valuation mode].
// 'extract': value of landed goods funds the work. 'trade': producer→consumer MARGIN funds it.
// Rare finds buy minutes of agency, not several tech trees from a single pebble.
export const COMMODITY_WORK = deepFreeze({
  cmdty_ore_iron: [0,24,3,'extract'], cmdty_ore_copper: [1,24,3,'extract'],
  cmdty_ore_titanium: [2,20,3,'extract'], cmdty_silicate: [0,36,1.5,'extract'],
  cmdty_ice_water: [0,24,2,'extract'], cmdty_volatiles: [1,20,3,'extract'],
  cmdty_ore_platinoid: [3,16,4,'extract'], cmdty_ore_bronzium: [1,24,3.5,'extract'],
  cmdty_ore_silverium: [2,16,3.5,'extract'], cmdty_ore_goldium: [2,8,4,'extract'],
  cmdty_ore_platinium: [3,6,5,'extract'], cmdty_ore_einsteinium: [3,4,6,'extract'],
  cmdty_gem_emerald: [3,2,6,'extract'], cmdty_gem_ruby: [4,2,8,'extract'],
  cmdty_gem_diamond: [4,1,12,'extract'], cmdty_exotic_amazonite: [4,1,18,'extract'],
  cmdty_gas_hydrogen: [0,12,2.5,'extract'], cmdty_gas_helium3: [2,10,3,'extract'],
  cmdty_crystal_silica: [1,20,3,'extract'], cmdty_crystal_lumin: [2,16,4,'extract'],
  cmdty_exotic_xenium: [4,6,5,'extract'],
  cmdty_refined_metals: [1,36,4,'trade'], cmdty_alloys: [2,36,4,'trade'],
  cmdty_polymers: [0,24,3,'trade'], cmdty_fuel_cells: [0,24,4,'trade'],
  cmdty_purified_silica: [0,30,3,'trade'], cmdty_regocrete: [0,24,2.5,'trade'],
  cmdty_control_unit: [2,24,4,'trade'], cmdty_comp_hullplate: [1,30,4,'trade'],
  cmdty_comp_circuitry: [2,30,4,'trade'], cmdty_microchips: [2,36,4,'trade'],
  cmdty_electronics: [1,30,4,'trade'], cmdty_quantum_cores: [3,24,5,'trade'],
  cmdty_consumer_goods: [0,24,3.5,'trade'], cmdty_textiles: [0,30,3,'trade'],
  cmdty_luxury_goods: [2,24,5,'trade'], cmdty_art: [3,16,6,'trade'],
  cmdty_food: [0,30,3,'trade'], cmdty_medical: [1,24,4,'trade'],
  cmdty_scrap_metal: [0,24,2,'extract'], cmdty_salvage_electronics: [1,16,3,'extract'],
  cmdty_classified_salvage: [2,10,4,'extract'],
  cmdty_narcotics: [3,20,6,'trade'], cmdty_stolen_goods: [2,20,5,'trade'],
  cmdty_weapons: [3,24,5,'trade'], cmdty_munitions: [1,30,4,'trade'],
  cmdty_impulse_charge: [2,16,4,'trade'],
});

// [opportunity tier, marginal saving minutes, research minutes]. Prerequisites stay in tech.js.
// Root RP is zero: basic verb access must not depend on finding a finite discovery token.
export const TECH_WORK = deepFreeze({
  tech_combat_basics:[0,12,0], tech_beam_focusing:[1,20,20], tech_kinetic_drivers:[1,22,20],
  tech_guided_ordnance:[1,24,24], tech_plasma_dynamics:[2,35,35], tech_deflector_theory:[0,11,0],
  tech_hardened_deflectors:[2,35,35], tech_strike_craft:[1,25,25], tech_fire_control:[2,30,30],
  tech_warship_license:[2,40,40], tech_capital_weapons:[4,65,65], tech_capital_hulls:[4,90,90],
  tech_flagship_command:[5,120,120], tech_attack_topology:[1,20,20], tech_ricochet_ballistics:[2,25,25],
  tech_payload_conduction:[3,35,35], tech_orbit_cryo:[3,40,40],
  tech_industrial_mining:[0,14,0], tech_focused_extraction:[1,22,20], tech_deep_core_mining:[2,35,35],
  tech_bulk_logistics:[0,16,0], tech_matter_compression:[2,30,30], tech_drive_tuning:[0,15,0],
  tech_impulse_ballistics:[2,25,25], tech_graviton_drives:[2,30,30], tech_long_range_survey:[1,25,25],
  tech_tractor_systems:[0,12,0], tech_drone_control:[2,30,30], tech_drone_swarm:[3,45,45],
  tech_autonomous_fleets:[4,65,65], tech_nanofabrication:[3,35,35], tech_outpost_charter:[5,100,100],
});

// Seconds of real task work; travel, handling/search, risk, and costs are added separately.
// Existing taskTime values describe objective animations, not complete revenue cycles.
export const MISSION_WORK = deepFreeze({
  cargo_delivery:{ taskS:100, legs:1, consumesCargo:true },
  bulk_trade:{ taskS:120, legs:1, saleRevenue:true },
  // D59: a mark's on-site work is the approach plus the fight — the data-grounded EHP/DPS model
  // kills a reference-strength mark in ~30s, and units scaling tracks real EHP growth. Pricing the
  // hunt at 150s re-paid the same loop several times over every wage period.
  bounty_hunt:{ taskS:30, legs:2 },
  mining_quota:{ taskS:210, legs:2, retainedLoot:true },
  salvage_retrieval:{ taskS:180, legs:2, consumesCargo:true, recoveredCargo:true },
  escort:{ taskS:190, legs:1 }, patrol_clear:{ taskS:200, legs:2 },
  smuggling_run:{ taskS:140, legs:1, consumesCargo:true },
  passenger_transport:{ taskS:120, legs:1 }, recon_scan:{ taskS:150, legs:2 },
  tow_recovery:{ taskS:220, legs:2 }, demolition:{ taskS:190, legs:2 },
  rescue_under_fire:{ taskS:240, legs:2 },
  authored_set_piece:{ taskS:300, legs:2 }, capital_boss:{ taskS:480, legs:2 },
});

export const MISSION_ORDER = deepFreeze([
  'cargo_delivery','bulk_trade','bounty_hunt','mining_quota','salvage_retrieval',
  'escort','patrol_clear','smuggling_run','passenger_transport','recon_scan',
]);

// Desired workload shares (not an index keyed to an accidental MISSION_TYPES ordering).
export const STATION_WORK = deepFreeze({
  mining:{ cargo_delivery:3,bulk_trade:2,bounty_hunt:1,mining_quota:4,salvage_retrieval:3,escort:1,patrol_clear:1,passenger_transport:1,recon_scan:2,tow_recovery:4,demolition:2,rescue_under_fire:1 },
  refinery:{ cargo_delivery:4,bulk_trade:4,bounty_hunt:1,mining_quota:2,salvage_retrieval:4,escort:1,patrol_clear:1,passenger_transport:1,recon_scan:1,tow_recovery:3,demolition:1,rescue_under_fire:1 },
  fab:{ cargo_delivery:3,bulk_trade:3,bounty_hunt:1,mining_quota:1,salvage_retrieval:3,escort:1,patrol_clear:1,passenger_transport:1,recon_scan:2,tow_recovery:2,demolition:4,rescue_under_fire:1 },
  trade_hub:{ cargo_delivery:4,bulk_trade:4,bounty_hunt:2,mining_quota:1,salvage_retrieval:2,escort:3,patrol_clear:1,smuggling_run:1,passenger_transport:3,recon_scan:2,tow_recovery:2,demolition:1,rescue_under_fire:1 },
  military:{ cargo_delivery:1,bulk_trade:1,bounty_hunt:4,salvage_retrieval:2,escort:3,patrol_clear:4,passenger_transport:1,recon_scan:3,tow_recovery:1,demolition:2,rescue_under_fire:3 },
  research:{ cargo_delivery:2,bulk_trade:1,bounty_hunt:1,mining_quota:1,salvage_retrieval:3,escort:1,patrol_clear:1,passenger_transport:1,recon_scan:4,tow_recovery:1,demolition:1,rescue_under_fire:2 },
  blackmarket:{ cargo_delivery:2,bulk_trade:1,bounty_hunt:3,mining_quota:1,salvage_retrieval:3,escort:1,patrol_clear:2,smuggling_run:4,passenger_transport:1,recon_scan:2,tow_recovery:2,demolition:2,rescue_under_fire:2 },
  bounty_board:{ cargo_delivery:1,bounty_hunt:7,salvage_retrieval:5,escort:1,patrol_clear:5,smuggling_run:1,recon_scan:3 },
  contracts_hub:{ cargo_delivery:5,bulk_trade:4,bounty_hunt:2,salvage_retrieval:1,escort:5,patrol_clear:3,smuggling_run:1,passenger_transport:3,recon_scan:3 },
});

/** Solve the periodic book, independent of currency units. */
function referenceBook(m, roleFactor, tier, lotUnits, workMinutes, mode) {
  const elasticity=rounded(Math.log1p(m.priceShockAtTier0+tier*m.priceShockPerTier)/-Math.log1p(-m.stockShockFraction));
  const baseEq=Math.ceil(lotUnits/(1-Math.pow(1+m.lotImpactFraction,-1/elasticity)));
  const cStock=baseEq*roleFactor.consume,pStock=baseEq*roleFactor.produce;
  const sellAt=(r)=>averageBoundedPrice(1,baseEq,elasticity,cStock+lotUnits*r,cStock+lotUnits*(r+1),m.priceLo,m.priceHi)*(1-m.spread/2);
  const buyAt=(r)=>averageBoundedPrice(1,baseEq,elasticity,pStock-lotUnits*(r+1),pStock-lotUnits*r,m.priceLo,m.priceHi)*(1+m.spread/2);
  const marginAt=(r)=>mode==='trade' ? sellAt(r)-buyAt(r) : sellAt(r);
  const openingEarningsMult=marginAt(0);
  if(!(openingEarningsMult>0)) throw new Error('Structural reference book has no margin');
  const target=openingEarningsMult*(mode==='trade' ? m.steadyTradeMarginFraction : m.steadyExtractionBidFraction);
  let low=0,high=mode==='trade' ? Math.max(0,(pStock-lotUnits-1)/lotUnits) : 1;
  if(mode!=='trade') while(marginAt(high)>target && high<4096) high*=2;
  if(!(high>0) || marginAt(high)>target) throw new Error('Cannot sustain reference throughput');
  for(let i=0;i<64;i++) {const mid=(low+high)/2;if(marginAt(mid)>target) low=mid;else high=mid;}
  const recurrenceOffset=(low+high)/2;
  return {elasticity,baseEq,openingEarningsMult,earningsMult:marginAt(recurrenceOffset),
    steadyBuyMult:buyAt(recurrenceOffset),recurrenceOffset,
    recoveryHalfLifeS:rounded(Math.LN2*workMinutes*60/Math.log1p(1/recurrenceOffset))};
}

export function deriveEconomyTables(model = ECONOMY_MODEL) {
  const m = model.market;
  // Solve the structural contrast so one reference freight lot requires only the authored
  // working-capital budget. Currency scale alone cannot solve a liquidity constraint.
  const rolesAt=(contrast)=>({
    produce:Math.pow(1-m.producerDiscount,-contrast/m.referenceElasticity),
    consume:Math.pow(1+m.consumerPremium,-contrast/m.referenceElasticity),none:1});
  const ref=COMMODITY_WORK.cmdty_fuel_cells;
  const refPhase=model.phases[ref[0]],referenceCapitalBudget=refPhase.netCrPerHour*m.referenceWorkingCapitalFraction;
  const capitalAt=(contrast)=>{
    const book=referenceBook(m,rolesAt(contrast),...ref);
    const gross=refPhase.netCrPerHour/60*ref[2]/(1-refPhase.operatingFraction);
    return gross*book.steadyBuyMult/book.earningsMult;
  };
  let contrastLo=1,contrastHi=2;
  while(capitalAt(contrastHi)>referenceCapitalBudget && contrastHi<16) contrastHi*=2;
  if(capitalAt(contrastHi)>referenceCapitalBudget) throw new Error('Working-capital target is infeasible');
  if(capitalAt(contrastLo)>referenceCapitalBudget) {
    for(let i=0;i<64;i++){const mid=(contrastLo+contrastHi)/2;if(capitalAt(mid)>referenceCapitalBudget) contrastLo=mid;else contrastHi=mid;}
  } else contrastHi=contrastLo;
  const roleContrast=(contrastLo+contrastHi)/2;
  const roleFactor=rolesAt(roleContrast);
  const commodities = {};
  for (const [id,[tier, requestedLotUnits, workMinutes, mode]] of Object.entries(COMMODITY_WORK)) {
    const phase = model.phases[tier];
    const volPerU=COMMODITY_REFERENCE_VOLUMES[id];
    const lotUnits=Math.min(requestedLotUnits,Math.floor((phase.referenceHold+1e-9)/volPerU));
    if(!Number.isSafeInteger(lotUnits) || lotUnits<1) throw new Error(`No physical reference lot fits: ${id}`);
    const {elasticity,baseEq,openingEarningsMult,earningsMult,steadyBuyMult,
      recurrenceOffset,recoveryHalfLifeS}=referenceBook(m,roleFactor,tier,lotUnits,workMinutes,mode);
    const grossWork = phase.netCrPerHour / 60 * workMinutes / (1-phase.operatingFraction);
    if (!(earningsMult > 0)) throw new Error(`No viable reference margin: ${id}`);
    const basePrice = Math.max(2, Math.round(grossWork / (lotUnits * earningsMult)));
    commodities[id] = {
      basePrice, elasticity, volatility: rounded(0.18 + tier*0.025),
      economyTier:tier, baseEq, lotUnits, lotVolume:rounded(lotUnits*volPerU), workMinutes, valuation:mode,
      recoveryHalfLifeS, steadyRecurrenceOffset:rounded(recurrenceOffset),
      workingCapitalCr:mode==='trade' ? Math.ceil(basePrice*lotUnits*steadyBuyMult) : 0,
      openingNetCrPerHour:rounded(basePrice * lotUnits * openingEarningsMult * (1-phase.operatingFraction) * 60/workMinutes),
      referenceGrossCr:rounded(basePrice * lotUnits * earningsMult),
      referenceNetCrPerHour:rounded(basePrice * lotUnits * earningsMult * (1-phase.operatingFraction) * 60/workMinutes),
    };
  }
  const tech = Object.fromEntries(Object.entries(TECH_WORK).map(([id,[tier,minutes,rpMinutes]]) => [id,{
    credits:Math.round(model.phases[tier].netCrPerHour*minutes/60),
    rp:Math.round(model.phases[tier].rpPerHour*rpMinutes/60), tier, savingMinutes:minutes,
  }]));
  const c=model.contract, p=model.phases[0];
  const base = {};
  for (const [type,w] of Object.entries(MISSION_WORK)) {
    const duration = c.handlingS+c.searchS+w.taskS+w.legs*c.referenceDistanceWu/c.cruiseWuPerS;
    // Fallback data for the legacy multiplicative consumer. Canonical runtime uses the full quote.
    base[type] = Math.ceil(p.netCrPerHour*duration/3600 / (1-p.operatingFraction) / c.successProbability[0]);
  }
  const riskMult=c.successProbability.map((prob,i) => rounded((1+c.riskWagePremium[i])*c.successProbability[0]/prob));
  const offerMix = {}, offerMixByTier = {};
  const procedural = [...MISSION_ORDER,'tow_recovery','demolition','rescue_under_fire'];
  for (const [profile,weights] of Object.entries(STATION_WORK)) {
    offerMix[profile]=Object.fromEntries(procedural.map(type=>[type,weights[type]||0]));
    offerMixByTier[profile]=model.phases.map((_,tier)=>Object.fromEntries(procedural.map(type=> {
      const specialized=['escort','patrol_clear','tow_recovery','demolition','rescue_under_fire','recon_scan'].includes(type);
      return [type, rounded((weights[type]||0)*(specialized ? 1+tier*0.20 : 1),3)];
    })));
  }
  const supplyShock=(fraction)=>rounded(Math.pow(1-fraction,-m.referenceElasticity)-1);
  const demandProfiles={
    war:{id:'war-footing',label:'War footing',defaultDelta:0,
      categoryDelta:{military:supplyShock(0.35),med:supplyShock(0.25),food:supplyShock(0.15)},
      commodityDelta:{cmdty_fuel_cells:supplyShock(0.20)}},
    blockade:{id:'blockade-relief',label:'Blockade pressure',defaultDelta:supplyShock(0.08),
      categoryDelta:{consumer:-supplyShock(0.30),luxury:-supplyShock(0.35)},
      commodityDelta:{cmdty_medical:supplyShock(0.28),cmdty_food:supplyShock(0.23),cmdty_fuel_cells:supplyShock(0.23)}},
    industrialExpansion:{id:'industrial-expansion',label:'Industrial expansion',defaultDelta:0,
      categoryDelta:{refined:supplyShock(0.18),component:supplyShock(0.24),tech:supplyShock(0.14)},commodityDelta:{}},
  };
  const resource={...model.resource,
    capacityWorkS:rounded(model.resource.workSecondsPerSimSecond*model.resource.halfLifeS
      /(Math.LN2*(1-model.resource.operatingStockFraction))),
    maxTravelWu:model.resource.maxTravelS*model.resource.conservativeCruiseWuPerS,
  };
  return {
    version:model.version,phases:model.phases,
    market:{...m,roleContrast:rounded(roleContrast),referenceCapitalBudget,roleFactor:Object.fromEntries(Object.entries(roleFactor).map(([k,v])=>[k,rounded(v)])),
      baseEqDefault:commodities.cmdty_ore_iron.baseEq,
      cycleFactorLo:1-m.cycleDeviationBudget,cycleFactorHi:1+m.cycleDeviationBudget,
      cyclePeriodLoS:m.cyclePeriodInHauls[0]*m.referenceHaulS,
      cyclePeriodHiS:m.cyclePeriodInHauls[1]*m.referenceHaulS},
    commodities,tech,mission:{...c,base,riskMult,work:MISSION_WORK},
    offerMix,offerMixByTier,demandProfiles,demandBounds:{min:0.72,max:1.45},resource,
  };
}
