import { defineFlavorPack } from './catalog.js';

export const flavorOrder = 20;
export const flavorId = 'ad_board';
export const flavorKind = 'advertising';

export default defineFlavorPack({
  id: flavorId,
  kind: flavorKind,
  description: 'Dockside commerce notices in the bureaucratic-horror house voice.',
  entries: [
    { id: 'ad_01', sponsor: 'Concord Mutual', text: 'CLAIMS BEGIN AFTER IMPACT. COVERAGE BEGINS AFTER REGISTRATION.' },
    { id: 'ad_02', sponsor: 'Meridian Exchange', text: 'YOUR CREDIT RATING ARRIVED BEFORE YOU DID.' },
    { id: 'ad_03', sponsor: 'DMC Safety', text: 'A REPLACEMENT CREW IS NOT A REPAIR.' },
    { id: 'ad_04', sponsor: 'Helios Customs', text: 'DECLARE FIRST. EXPLAIN LATER. APPEAL NEVER.' },
    { id: 'ad_05', sponsor: 'MTS Freight', text: 'WE MOVE EVERYTHING EXCEPT LIABILITY.' },
    { id: 'ad_06', sponsor: 'Concord Transit', text: 'PRIORITY LANES: ARRIVE EARLY TO WAIT SOONER.' },
    { id: 'ad_07', sponsor: 'Meridian Recovery', text: 'YOUR COLLATERAL MISSES YOU.' },
    { id: 'ad_08', sponsor: 'DMC Clinic', text: 'SHIFT INJURIES REQUIRE SUPERVISOR CONFIRMATION.' },
    { id: 'ad_09', sponsor: 'Tethys Arbitration', text: 'CONFLICT RESOLUTION PRICED BY SURVIVING PARTY.' },
    { id: 'ad_10', sponsor: 'Quiet Courier', text: 'MANIFEST BLANKS FILLED WHILE YOU WAIT. NAMES COST EXTRA.' },
    { id: 'ad_11', sponsor: 'Concord Registry', text: 'UNLICENSED NAMES WILL BE REMOVED FROM HULLS.' },
    { id: 'ad_12', sponsor: 'Meridian Housing', text: 'WINDOWS AVAILABLE ON PREMIUM OXYGEN PLANS.' },
    { id: 'ad_13', sponsor: 'DMC Payroll', text: 'HAZARD PAY EXCLUDES EXPECTED HAZARDS.' },
    { id: 'ad_14', sponsor: 'Helios Memorials', text: 'PRENEED PLAQUES LOCK TODAY\'S LETTERING RATE.' },
    { id: 'ad_15', sponsor: 'MTS Escrow', text: 'YOUR TRUST WILL CLEAR IN THREE TO FIVE CYCLES.' },
    { id: 'ad_16', sponsor: 'Concord Security', text: 'FULL COMPLIANCE PACKAGES INCLUDE SEARCH, SEIZURE, AND PORTRAIT.' },
    { id: 'ad_17', sponsor: 'Meridian Salvage', text: 'FOUND PROPERTY REMAINS OWNED UNTIL WE BUY IT.' },
    { id: 'ad_18', sponsor: 'DMC Recruitment', text: 'THE SHAFT IS DEEP. YOUR CONTRACT IS DEEPER.' },
    { id: 'ad_19', sponsor: 'Tethys Legal', text: 'INNOCENCE AVAILABLE IN THREE SERVICE TIERS.' },
    { id: 'ad_20', sponsor: 'Concord Pensions', text: 'SURVIVOR BENEFITS REQUIRE A SURVIVOR.' },
    { id: 'ad_21', sponsor: 'Meridian Leasing', text: 'OWN THE FEELING. LEASE THE HULL.' },
    { id: 'ad_22', sponsor: 'DMC Canteen', text: 'MEAL BREAKS BEGIN AFTER QUOTA.' },
    { id: 'ad_23', sponsor: 'Helios Dockmaster', text: 'UNATTENDED SHIPS BECOME ATTENDED ASSETS.' },
    { id: 'ad_24', sponsor: 'MTS Futures', text: "LOCK TOMORROW'S ORE PRICE BEFORE TODAY'S SHAFT COLLAPSES." },
  ],
});
