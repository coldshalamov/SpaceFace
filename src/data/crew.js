// Row 446 GOLD-CREW — crew aboard: up to four hires from the local station pools, each with a
// real role, a real derived-stat perk (written through player.efficiencyMods — the same additive
// multiplier seam tech unlocks use), banter about real sim events, one loyalty job each, and
// injury/loss when the hull goes down. Data-only contracts; the registered owner is
// src/systems/crew.js.
//
// EXP-25 — the crew is a company: sign-on fees and day wages, morale that moves on deaths,
// paydays, homecomings and shore leave, strikes and walkouts when the pay stops, hazard-pay
// demands at morale zero, and veteran ranks that grow the perk and unlock salvage favors.

export const CREW_CAP = 4;

// The company-law constants the system enforces. Every number here is a bound a hostile save
// heals toward — nothing in the slice may exceed these.
export const CREW_LAW = Object.freeze({
  STRIKE_AFTER_UNPAID_DAYS: 2,  // consecutive missed paydays that start a strike
  MORALE_MAX: 9,
  MORALE_START: 6,              // a new hire is steady, not adoring
  MORALE_SETTLED: 4,            // floor morale after a paid strike settlement
  MORALE_PAID: 5,               // morale after a paid hazard demand
  MORALE_LOW: 2,                // at or under: grumble banter replaces the usual line
  VET_XP: Object.freeze([4, 12, 24]),  // witnessed-event counts that mint vet 1/2/3
  VET_PERK_STEP: 0.25,          // role perk delta scale per vet rank (vet 3 = +75%)
  VET_SALVAGE_MIN: 1,           // salvage favors start at vet 1
  SALVAGE_GAP_S: 25,            // at most one crew salvage grant per this many sim-seconds
  BACK_PAY_CAP: 100000,         // owed-wages bound for hostile saves
  XP_CAP: 999,
});

// Veteran rank labels, stable for save/UI display. Index is the vet level.
export const CREW_VET_RANKS = Object.freeze(['hand', 'rated', 'veteran', 'ace']);

export function crewVetRankLabel(vet) {
  const i = Math.max(0, Math.min(CREW_VET_RANKS.length - 1, Math.floor(Number(vet) || 0)));
  return CREW_VET_RANKS[i];
}

// Role ids are stable save keys. Perk keys must name real fields with live consumers:
//   shieldRegenMult / energyRegenMult / cargoCapMult → computeDerivedStats fold (ships.js);
//   jumpCooldownMult → driveCooldownMultiplier (world.js).
// salvage: a vet-ranked member of this role skims a favor off player kills — a seeded roll
// (hash32 over kill id + member id) under `chance + 0.04*vet` grants `base + h%jitter + 3*vet`
// credits through economy:grantCredits, rate-limited by CREW_LAW.SALVAGE_GAP_S.
export const CREW_ROLES = Object.freeze({
  engineer: {
    label: 'Engineer',
    perk: Object.freeze({ key: 'shieldRegenMult', delta: 0.08 }),
    perkLine: 'shield weave +8%',
    salvage: Object.freeze({ chance: 0.18, base: 14, jitter: 12 }),
  },
  quartermaster: {
    label: 'Quartermaster',
    perk: Object.freeze({ key: 'cargoCapMult', delta: 0.10 }),
    perkLine: 'hold capacity +10%',
    salvage: Object.freeze({ chance: 0.28, base: 22, jitter: 18 }),
  },
  gunner: {
    label: 'Gunner',
    perk: Object.freeze({ key: 'energyRegenMult', delta: 0.08 }),
    perkLine: 'gun capacitor feed +8%',
    salvage: Object.freeze({ chance: 0.20, base: 16, jitter: 14 }),
  },
  navigator: {
    label: 'Navigator',
    perk: Object.freeze({ key: 'jumpCooldownMult', delta: -0.10 }),
    perkLine: 'jump spool cooldown −10%',
    salvage: Object.freeze({ chance: 0.14, base: 10, jitter: 12 }),
  },
});

// Loyalty jobs: each candidate carries one, keyed to real bus events the system counts.
// kind → the event stream and field the counter reads; every job is completable in play.
export const LOYALTY_JOB_KINDS = Object.freeze({
  // The crew berth is the last stage, so post-hire stage events never arrive again —
  // the engineers' seam is bringing the ship home to the yard they keep.
  berth_homecomings: { event: 'dock:docked', label: 'Bring the ship home to the Long Berth' },
  trophies:     { event: 'longBerth:trophy', label: 'Park trophies in the yard' },
  kills:        { event: 'entity:killed', label: 'Fight alongside — hulls you broke' },
  missions:     { event: 'mission:completed', label: 'Fly contracts together' },
});

// The local pool: each candidate lives at a real station on the early route and hails when the
// fitted crew berth exists and the player flies near. Cast-flavored picks ride the same pool —
// a ship is only ever crew once these people choose it.
//
// EXP-25 fields per candidate: signOnCr (the one-time fee the hire intent charges), wageCr
// (their ask per world day — payroll sums the live roster), and the company lines:
//   grumble.pay/kills/missions — low-morale or missed-payday voice;
//   strikeLine/settleLine — the picket opens, the pay lands;
//   demandLine/thanksLine — the morale-zero hazard ask and its paid answer;
//   walkLine — the kit-bag exit; shoreLine — docking their home station;
//   promote{1,2,3} — rank-ups; salvageLine — the vet favor on a kill.
export const CREW_CANDIDATES = Object.freeze([
  Object.freeze({
    id: 'crew_bram', name: 'Bram Okafor', role: 'engineer', homeStationId: 'station_ceres',
    signOnCr: 550, wageCr: 160,
    line: 'I welded yard tugs before they let her turn. Let me keep yours honest.',
    hireLine: 'Bram finds the tool crib before his kit bag is stowed.',
    banter: Object.freeze({
      kills: 'She holds. The weld always holds — stop testing it.',
      missions: 'Contract closed. I logged the hull wear while you shook hands.',
      stages: 'Another stage welded into her. I know every plate by name now.',
    }),
    grumble: Object.freeze({
      pay: 'The packet is late, captain. Welders do not weld on promises.',
      kills: 'Another hole for me to plate. Pay us first, break her second.',
      missions: 'Logged the wear. Pity I cannot log the wage.',
    }),
    strikeLine: 'Tools down, captain. The weld holds — the crew does not, unpaid.',
    settleLine: 'Pay in hand. The crib is open again — tell me where she hurts.',
    demandLine: 'I have eaten two hull-downs for this ship. Hazard pay, or I weld elsewhere.',
    thanksLine: 'Square. The next seam is on me.',
    walkLine: 'Bram hangs the tool belt on the lock and goes. The weld outlasts the job.',
    shoreLine: 'Ceres dust in the seams. My old bench is three decks down — buying the round.',
    salvageLine: 'Her plate stock was still good. Sold it off the manifest.',
    promote: Object.freeze({
      1: 'Rated now. I have earned louder tools.',
      2: 'Veteran of her ribs. I can hear a bad weld from the lock.',
      3: 'Ace of the yard, they said at Ceres. On this ship, it is true.',
    }),
    loyaltyJob: Object.freeze({ kind: 'berth_homecomings', goal: 2 }),
    loyaltyLine: 'The berth answers to my welds now. I am not leaving her.',
  }),
  Object.freeze({
    id: 'crew_yella', name: 'Yella Ndu', role: 'quartermaster', homeStationId: 'station_helios',
    signOnCr: 450, wageCr: 140,
    line: 'Your hold is a lie told by a lazy loader. I fix lies like that.',
    hireLine: 'Yella repacks the hold before the hatch closes. It fits better.',
    banter: Object.freeze({
      kills: 'Note the scrap coordinates — I will want the plates off that.',
      missions: 'Manifest balanced. The decimals even agreed this time.',
      trophies: 'Logged, tagged, parked. The yard reads like a ledger now.',
    }),
    grumble: Object.freeze({
      pay: 'My ledger has a column for wages owed. It is filling.',
      kills: 'Scrap logged. Whether I get paid to tally it is another column.',
      missions: 'Contract closed. The pay column, however, disagrees.',
    }),
    strikeLine: 'The ledger is closed, captain. Nothing moves in or out until the wages do.',
    settleLine: 'Balanced, down to the decimal. The hold is yours again.',
    demandLine: 'I keep perfect books, and the books say I am owed for the risks. Pay the line.',
    thanksLine: 'Posted and balanced. A pleasure doing honest books.',
    walkLine: 'Yella closes the manifest, pockets the pen, and steps off at the lock.',
    shoreLine: 'Helios loaders still stack wrong. I corrected three on the way through — morale is up.',
    salvageLine: 'Manifest says that wreck owed us goods. I collected.',
    promote: Object.freeze({
      1: 'Rated quartermaster. The hold finally answers to me.',
      2: 'Veteran of the bays. I can stack a fleet into a closet.',
      3: 'Ace of the ledger. Inspectors pay me now, not the reverse.',
    }),
    loyaltyJob: Object.freeze({ kind: 'trophies', goal: 2 }),
    loyaltyLine: 'Every trophy filed. I keep books other people frame.',
  }),
  Object.freeze({
    id: 'crew_marko', name: 'Marko Vane', role: 'gunner', homeStationId: 'station_beltout',
    signOnCr: 700, wageCr: 180,
    line: 'Guns do not miss. Feed does. I keep the feed.',
    hireLine: 'Marko is already rebalancing the capacitor feeds.',
    banter: Object.freeze({
      kills: 'Clean break. The feed never sagged once.',
      missions: 'Work done. The guns stayed warm the whole run.',
      stages: 'More bus power means hotter rails. I approve.',
    }),
    grumble: Object.freeze({
      pay: 'Feed runs on credit too, and yours is thin.',
      kills: 'Hull broke. So did my patience for empty paydays.',
      missions: 'Run done. The invoice is still open.',
    }),
    strikeLine: 'The safeties are on and they stay on. Pay the crew.',
    settleLine: 'Safeties off. Feed is hot — point me at something.',
    demandLine: 'I keep your guns fed. Feed mine — hazard pay, or I pack the safeties.',
    thanksLine: 'Fed. The feed stays hot.',
    walkLine: 'Marko racks the feed key on the console and leaves without a word.',
    shoreLine: 'Beltout. Where I learned the trade — the smell alone is worth the stop.',
    salvageLine: 'Her pods stripped clean. Sold the racks.',
    promote: Object.freeze({
      1: 'Rated gunner. The feed knows my hands now.',
      2: 'Veteran. I can hear a sag before the rail does.',
      3: 'Ace feed. Guns like this do not exist on paper.',
    }),
    loyaltyJob: Object.freeze({ kind: 'kills', goal: 5 }),
    loyaltyLine: 'Five hulls under your guns and my feed. We work.',
  }),
  Object.freeze({
    id: 'crew_isese', name: 'Isese Ro', role: 'navigator', homeStationId: 'station_tethys',
    signOnCr: 650, wageCr: 170,
    line: 'Every toll lane is a shape. I read the shapes.',
    hireLine: 'Isese re-plots the spool tables before her bunk is warm.',
    banter: Object.freeze({
      kills: 'Debris on the nine-mark. Routing around.',
      missions: 'That is a route closed clean. Plotting the next.',
      trophies: 'The yard grows. Home has a shape now.',
    }),
    grumble: Object.freeze({
      pay: 'The shortest lane to trust runs through a pay packet. It is closed.',
      kills: 'I plot around debris. I cannot plot around empty wages.',
      missions: 'Route closed. The wage lane is not.',
    }),
    strikeLine: 'The charts stay folded until the pay unfolds. Crew\'s word, not only mine.',
    settleLine: 'Pay aboard. The lanes are open — say the word.',
    demandLine: 'Every route has a toll. Mine is hazard pay — or I read someone else\'s shapes.',
    thanksLine: 'Toll paid. The next shape is yours.',
    walkLine: 'Isese folds her charts into the kit bag and disembarks, exactly on course.',
    shoreLine: 'Tethys taught me the shapes. Walking her ring again steadies the eye.',
    salvageLine: 'Filed that kill as a lane note. Sold the report to the toll office.',
    promote: Object.freeze({
      1: 'Rated navigator. The ship reads my charts now.',
      2: 'Veteran of the lanes. I see the tolls before they see us.',
      3: 'Ace of the shapes. There is no lane I cannot shorten.',
    }),
    loyaltyJob: Object.freeze({ kind: 'missions', goal: 3 }),
    loyaltyLine: 'Three runs without a wasted burn. I stay.',
  }),
  Object.freeze({
    id: 'crew_paolo', name: 'Paolo Crest', role: 'engineer', homeStationId: 'station_forge',
    signOnCr: 600, wageCr: 150,
    line: 'Forge discipline. I do not bolt what I have not measured.',
    hireLine: 'Paolo takes the engine room like he signed for it.',
    banter: Object.freeze({
      kills: 'Impact on the four-plate seam. Already re-torqued.',
      missions: 'Clean work. The engine did not even notice.',
      stages: 'She takes load now. Real load.',
    }),
    grumble: Object.freeze({
      pay: 'Forge discipline includes paying the forge. Yours is cold.',
      kills: 'Measured the damage. Wish I could measure the wage the same way.',
      missions: 'Work measured, work done. Pay unmeasured.',
    }),
    strikeLine: 'The engine room is locked until the books open. Discipline works both ways.',
    settleLine: 'Counted and correct. Back to the bolts.',
    demandLine: 'I measured the risk of this hull the day I boarded. Hazard pay settles the account.',
    thanksLine: 'Measured, paid, filed. Forge bookkeeping.',
    walkLine: 'Paolo wipes his hands on a rag, folds it twice, and leaves the engine room swept.',
    shoreLine: 'The Forge still burns honest. An hour at her vents sets a man right.',
    salvageLine: 'Her bearings were still true. Forge price, banked.',
    promote: Object.freeze({
      1: 'Rated. My stamps carry weight now.',
      2: 'Veteran of the engine room. Every bolt knows my gauge.',
      3: 'Ace of the Forge line. I measure ships by listening.',
    }),
    loyaltyJob: Object.freeze({ kind: 'berth_homecomings', goal: 2 }),
    loyaltyLine: 'My torque stamps are in her ribs. Where would I go?',
  }),
  Object.freeze({
    id: 'crew_ndelo', name: 'Ndelo Quist', role: 'quartermaster', homeStationId: 'station_drift',
    signOnCr: 400, wageCr: 130,
    line: 'Ore weighs nothing if you stack it right. I stack right.',
    hireLine: 'Ndelo chalks the hold bays in the first hour.',
    banter: Object.freeze({
      kills: 'Debris worth lifting, if we circle back.',
      missions: 'Ledger balanced. Even the inspector would smile.',
      trophies: 'Room left in the yard. Bring another home.',
    }),
    grumble: Object.freeze({
      pay: 'A stack of unpaid days tips over. Basic physics.',
      kills: 'Worth lifting, yes. Worth lifting unpaid, no.',
      missions: 'Balanced the manifest. The pay chit is still floating.',
    }),
    strikeLine: 'Nothing loads, nothing unloads. The stack stays as it is until the pay lands.',
    settleLine: 'Pay stacked square. The bays are open.',
    demandLine: 'Hazard work stacks higher than the wage. Level the stack or I walk it off.',
    thanksLine: 'Leveled. The stack holds.',
    walkLine: 'Ndelo erases his chalk marks from the bays and drifts down the ramp.',
    shoreLine: 'Drift stacking is an art nobody else practices. Good to watch it done right.',
    salvageLine: 'Stacked her leavings and sold the pile. Small ore, real credits.',
    promote: Object.freeze({
      1: 'Rated. The bays answer to my chalk.',
      2: 'Veteran stacker. I fit more ship into this ship than the ship did.',
      3: 'Ace of the bays. Mass means what I say it means.',
    }),
    loyaltyJob: Object.freeze({ kind: 'trophies', goal: 2 }),
    loyaltyLine: 'The yard list is my best ledger yet.',
  }),
  Object.freeze({
    id: 'crew_sable', name: 'Sable Renner', role: 'gunner', homeStationId: 'station_smuggler',
    signOnCr: 800, wageCr: 190,
    line: 'Quiet berth, loud guns. That is the whole arrangement.',
    hireLine: 'Sable checks the firing safeties twice, then smiles once.',
    banter: Object.freeze({
      kills: 'They stopped moving. That is the job.',
      missions: 'Paid work is paid work.',
      stages: 'Home armor is worth more than station armor. Keep building.',
    }),
    grumble: Object.freeze({
      pay: 'Quiet berth is fine. Quiet purse is not.',
      kills: 'Done. Unpaid work has a smell, though.',
      missions: 'Paid work is paid work. This was neither.',
    }),
    strikeLine: 'Safeties on. The arrangement was loud guns for loud pay — half the deal broke.',
    settleLine: 'Arrangement restored. The guns are loud again.',
    demandLine: 'The quiet berth clause expires without hazard pay. Decide.',
    thanksLine: 'Paid. The quiet resumes.',
    walkLine: 'Sable leaves the way she came — quietly, and all at once.',
    shoreLine: 'The Smuggler\'s rest. Nobody asks questions here — I needed a night like that.',
    salvageLine: 'Stripped her quietly. Sold it quietly.',
    promote: Object.freeze({
      1: 'Rated. The safeties answer faster now.',
      2: 'Veteran. The quiet is mine to keep.',
      3: 'Ace. The guns speak only when I say.',
    }),
    loyaltyJob: Object.freeze({ kind: 'kills', goal: 5 }),
    loyaltyLine: 'You shoot straight enough. I sign on.',
  }),
  Object.freeze({
    id: 'crew_verity', name: 'Verity Oldman', role: 'navigator', homeStationId: 'station_customs',
    signOnCr: 700, wageCr: 160,
    line: 'I filed routes for the customs office. Yours will be leaner.',
    hireLine: 'Verity tapes the route strips beside the helm herself.',
    banter: Object.freeze({
      kills: 'Loud lane. I am finding us a quieter one.',
      missions: 'Route closed on the numbers. Good.',
      stages: 'A home berth changes every route I plot.',
    }),
    grumble: Object.freeze({
      pay: 'I file wages owed like I filed routes. This route is overdue.',
      kills: 'Filed under hazard. Hazard should pay extra.',
      missions: 'On the numbers, except the pay numbers.',
    }),
    strikeLine: 'Consider this a formal filing: routes halt until wages post. It is all in order.',
    settleLine: 'Payment verified and filed. Routes resume.',
    demandLine: 'My old office taught me: unpaid hazard is unpaid forever. Pay it, or I file elsewhere.',
    thanksLine: 'Filed as settled. Precisely as agreed.',
    walkLine: 'Verity removes her route strips one by one, files them away, and departs correctly.',
    shoreLine: 'Customs still stamps the same forms. Filing past the desk felt like a holiday.',
    salvageLine: 'Declared that wreck\'s transit log to the toll office. They pay for accuracy.',
    promote: Object.freeze({
      1: 'Rated. My strips hold official weight aboard.',
      2: 'Veteran of the lanes. I know where every form is filed.',
      3: 'Ace of the routes. Even customs files me under fast.',
    }),
    loyaltyJob: Object.freeze({ kind: 'missions', goal: 3 }),
    loyaltyLine: 'Your lanes make sense now. So do I, aboard.',
  }),
]);

export function crewCandidate(id) {
  return CREW_CANDIDATES.find((c) => c.id === id) || null;
}

export function crewRoleLabel(role) {
  const def = CREW_ROLES[role];
  return def ? def.label : String(role || 'crew');
}
