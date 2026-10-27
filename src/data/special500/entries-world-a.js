// src/data/special500/entries-world-a.js — batch cat-world-a (32 entries).
// Authored from the ratified consensus rows in
// design/program/special-500/CONSENSUS_500.json (ids in
// design/program/special-500/batches/cat-world-a.json). World one-offs:
// places, fixtures, resident characters, persistent world facts. Every
// receipt trigger names a bus event verified against src/systems emitters
// (dock:docked src/ui/input.js+world.js; combat:kill world.js;
// history:deadNoted historyWear.js; drill:chargeBlast drill.js;
// gate:verdict gateControlDirector.js; deniable:fenceThanked
// encounterDirector.js; scan:completed scanner.js; economy:tradeCompleted
// economy.js; law:fineAssessed lawSecurity.js; cargo:delivered missions.js;
// rescue:started onboarding.js). Every sector, station and poi id is real
// (src/data/sectors.js, src/data/frontierRegions/*.js). Channel choice: a
// line addressed to the player -> comms, an ambient band line ->
// commsLog, a visual noticing line whose renderer leg is a later batch ->
// spectacle, a genuinely interactive fixture (vendor, offer, charge,
// interactable) -> memory + followup naming the bespoke mechanic. No mail.
//
// Canon recasts applied per each entry's own hones directive (no sector
// remaps were needed — every consensus sector id is real):
//   SP1-028  checkpoint wardens Vael -> Concord patrol (Vael remit is the
//            far rim: sector_veil_nebula + sector_ashfall_reach,
//            src/data/factions/vael.js; io_reach law is Concord's).
//   SP1-170  clinic operator Helix -> The Understory (Helix is a paper
//            faction: contract allocation and variance audits, fleetClass
//            none, src/data/factions/helix.js; the Understory owns wreck
//            recovery and care, src/data/factions/understory.js). Consensus
//            title "The Helix Barge" becomes "The Clinic Ring" so the
//            display title does not contradict the operator.
//   SP2-118  Bracket BX-9 verified canon (character_bracket,
//            src/data/bracket.js — a salvage robot goalkeeping a small yard
//            in sector_helios_prime, not a patrol); "patrol box" reads as
//            his yard per the verify-or-bless hone.

export const ENTRIES_WORLD_A = [
  // SP2-086 — The Lost Luggage Board: the concourse corkboard of unclaimed
  // tags. Absorbs SP1-175's describe-the-label claim game as the back room.
  {
    id: 'SP2-086',
    kind: 'world-oneoff',
    title: 'The Lost Luggage Board',
    sectors: [],
    trigger: { type: 'receipt', event: 'dock:docked' },
    channel: 'memory',
    followup: 'Concourse dressing row keyed to roaming-story receipts (src/data/roamingStories.js): one live tag per story the player personally witnessed; the back-room describe-the-label claim game draws its inventory from encounter history (absorbs SP1-175); codex page "The Lost Property Register."',
    payload: {
      text: 'A corkboard of unclaimed tags by the concourse lift: "CLAIMED — NEVER COLLECTED. CONTENTS: WEDDING DRESS, UNWORN." "CONTENTS: ONE GOAT, RETURNED." "CONTENTS: TAPES (41 YEARS OVERDUE)." One tag has no contents line at all: "CONTENTS: [REDACTED BY REQUEST OF THE CONTENTS]."',
    },
  },

  // SP1-056 — The Paid Stamp: the toll ring stencils your payment status
  // where the whole lane can read it. Absorbs SP2-104's payer discount and
  // dead-signature lore; the SKIP stencil decays at day end.
  {
    id: 'SP1-056',
    kind: 'world-oneoff',
    title: 'The Paid Stamp',
    sectors: ['sector_io_reach'],
    trigger: { type: 'receipt', event: 'gate:verdict' },
    channel: 'comms',
    payload: {
      from: 'Reach weigh-booth',
      text: 'The scanner paints a light-dust stencil across your plating: PAID — legible to every scanner on the lane until day\'s end, and skippers nod as you pass. Skip the toll and it prints SKIP instead, and the hunters and the patrol read that the same way: worth a look.',
      ttl: 7,
    },
  },

  // SP2-062 — The Tab That Outlived Its Owner: the dead contact's tab, kept
  // open, then quietly covered. Absorbs SP2-078's self-refilling glass as the
  // night beat. Kell canon: "Wraith" Kell, the Quiet's manifest clerk.
  {
    id: 'SP2-062',
    kind: 'world-oneoff',
    title: 'The Tab That Outlived Its Owner',
    sectors: [],
    trigger: { type: 'receipt', event: 'history:deadNoted' },
    channel: 'comms',
    payload: {
      from: 'The rail, word travels',
      text: 'By the rail of the nearest blackmarket bar, a slate: one name, one word — OPEN. "It stays open," the barkeep says. "Closing it feels like filing." Beneath it, a smaller slate over the same name: COVERED. The handwriting belongs to a customs manifest clerk. Wraith Kell signs nothing else.',
      ttl: 8,
    },
  },

  // SP1-168 — The Graft: the Understory's living hull-tissue offer at the
  // Charon hull garden. Absorbs SP2-096's florist as the storefront.
  {
    id: 'SP1-168',
    kind: 'world-oneoff',
    title: 'The Graft',
    sectors: ['sector_charon_expanse'],
    trigger: { type: 'proximity', nearStation: 'poi_charon_hull_garden', wu: 400 },
    channel: 'memory',
    followup: 'Authored offer at poi_charon_hull_garden + persistent hull-state prop (growth stage in story.flags): capped slow micromend on the existing armor regen path (damage.js only if clean); removable, painfully, and it remembers. The Understory florist stall is the storefront (absorbs SP2-096); "everything dead wants to be soil" moves into the care copy.',
    payload: {
      text: 'The Understory growers run a thumb along your seam-line and make the offer like they are discussing weather: a living graft — hull-tissue that bonds to your plating, seals micro-fractures, and grows, slowly and visibly, toward your cockpit. It wants light. It hums when you are in danger. "It is not equipment," they insist. "It is crew."',
    },
  },

  // SPX-B-06 — The Meteor Fishery: the fixed net-rig on the Forge surge path.
  // io_reach runs mirror rigs (folded into the text; the anchor is the one
  // real fixture on the vesta surge lane).
  {
    id: 'SPX-B-06',
    kind: 'world-oneoff',
    title: 'The Meteor Fishery',
    sectors: ['sector_vesta_forge'],
    trigger: { type: 'proximity', nearStation: 'station_forge', wu: 1500 },
    channel: 'memory',
    followup: 'weatherMeteors slot-book read + prop line on the surge path, live during meteor_shower seasons: the player may string ONE net-line, licensed for the season (40 cr and a signature); the line catches seeded stones on the public weather schedule; unlicensed lines get cut by the fishery, politely, once (capped yield flag in story.flags).',
    payload: {
      text: 'Off the Forge surge lane, crews have strung foil net-lines across the meteor run like a salmon river — stones hit the nets, sparks walk the lines, a skiff hauls the catch. The shingle sign reads the day\'s take and one honest loss: "NETS: 3. METEORS: EVERYTHING ELSE."',
    },
  },

  // SP2-091 — The Confessional Booth: the Choir files guilt, does not absolve
  // it. Absorbs SP1-165's Heard/Weighted/Absolved voice; the read-back lands
  // as a late letter at the ending.
  {
    id: 'SP2-091',
    kind: 'world-oneoff',
    title: 'The Confessional Booth',
    sectors: [],
    trigger: { type: 'receipt', event: 'combat:kill' },
    channel: 'memory',
    followup: 'barContacts booth keyed to a moralMemory read (src/systems/moralMemory.js): flat tithe processes the kill record, flag guilt_filed, Choir standing +1; the read-back lands verbatim as a late mail letter on the ending screen — one Choir liturgy, two sacraments, same receipt grammar as the buoy that absolves.',
    payload: {
      text: 'In the back of a Choir-berthed bar, a side booth: DISPOSAL OF GUILT, PROFESSIONAL. The acolyte does not offer absolution, only filing: "Guilt is a record with no filing cabinet. We are the cabinet. It will be read back to you once, at the end, and then it is ours."',
    },
  },

  // SP1-087 — The Falling Anchor: a capital wreck weeks from the gravity
  // well. Absorbs SP3-126's reentry fire-line for impact day.
  {
    id: 'SP1-087',
    kind: 'world-oneoff',
    title: 'The Falling Anchor',
    sectors: ['sector_ashfall_reach'],
    trigger: { type: 'sectorEntry' },
    channel: 'memory',
    followup: 'Persistent prop with simTime drift (asteroidMotion precedent), visibly lower against the dead moon each visit; salvage tags re-price by risk as it falls; on impact day the reentry fire-line crosses the sector, everyone hears it via news:publish, and the crater persists as a landmark — the pool pays pocket change at any Ashfall bar.',
    payload: {
      text: 'A capital wreck is falling. Slowly — weeks, not hours — toward the gravity well of a dead moon, and every pass it hangs visibly lower against the moon\'s face. The salvage tags on it get re-priced by risk, and the belt has started a pool on the day it lands.',
    },
  },

  // SPX-A-10 — The Census of One: the weigh buoy's chalk list, you included.
  {
    id: 'SPX-A-10',
    kind: 'world-oneoff',
    title: 'The Census of One',
    sectors: ['sector_tethys_junction'],
    trigger: { type: 'proximity', nearStation: 'poi_tethys_weigh', wu: 400 },
    channel: 'comms',
    payload: {
      from: 'Weigh-Slip Buoy',
      text: 'The tally buoy chalks every hull that passed the weigh today, in order of keel — and today\'s list carries yours, underlined. Nobody signs the chalk. The list wipes itself at rollover and starts again with the next hull through.',
      ttl: 6,
    },
  },

  // SPX-A-04 — The Painted Ring: the starter-seam rock that says MINE, and
  // stays freshly painted forever.
  {
    id: 'SPX-A-04',
    kind: 'world-oneoff',
    title: 'The Painted Ring',
    sectors: ['sector_helios_prime'],
    trigger: { type: 'receipt', event: 'drill:chargeBlast' },
    channel: 'comms',
    payload: {
      from: 'the starter seam',
      text: 'One rock in the starter field carries a hand-painted white ring and two words: MINE. — K. It strikes clean and rings true, and by your next pass the ring has been freshly repainted. Nobody on the lane will say who K is. Nobody has stopped painting.',
      ttl: 6,
    },
  },

  // SP2-194 — The Kurtz Desk's Second Count: chained behind SP2-160's count
  // completion; the ledger opens a page that never closes.
  {
    id: 'SP2-194',
    kind: 'world-oneoff',
    title: "The Kurtz Desk's Second Count",
    sectors: ['sector_ashfall_reach'],
    trigger: { type: 'flag', requires: 'special500.SP2-160' },
    channel: 'memory',
    followup: 'Post-SP2-160 dressing at Kurtz\'s desk: the player\'s page stays open permanently — the one ledger line Kurtz will not close — flag ledger_open, Ashfall standing +6; the page\'s lines accrue on return visits.',
    payload: {
      text: 'Kurtz\'s count has a new final line, chalked where only a returning pilot will see it: "42 PRESENT. 41 ACCOUNTED. THE DIFFERENCE IS THE ONE THAT STAYS." The difference is you — the only hull that came back after being counted. The ledger, for the first time, is open to a blank page with your callsign at the top.',
    },
  },

  // SP2-082 — The Quiet Booth: the reserved plate that reads THE HOUSE, and
  // the drink that is for you.
  {
    id: 'SP2-082',
    kind: 'world-oneoff',
    title: 'The Quiet Booth',
    sectors: [],
    trigger: { type: 'receipt', event: 'deniable:fenceThanked' },
    channel: 'memory',
    followup: 'Bar set-dressing keyed to Quiet transaction receipts (deniable:fenceThanked, then dock at station_customs within a day): flag house_drinks_to_you, one-time Quiet standing +2; the reserved plate gains the player\'s callsign, etched small, for the rest of the game (stationContacts persistent contact-memory line).',
    payload: {
      text: 'At the Customs Gate bar there is a booth where nobody sits, reserved by a plate that reads THE HOUSE. The barkeep sets one drink on it every shift. A manifest clerk with a low hat nods at you once: "The House drinks to clean work. You are being drunk to. Do not wave."',
    },
  },

  // SP1-189 — The Plaque: somebody marked the site of your first kill, and
  // they were accurate about it.
  {
    id: 'SP1-189',
    kind: 'world-oneoff',
    title: 'The Plaque',
    sectors: [],
    trigger: { type: 'receipt', event: 'combat:kill' },
    channel: 'memory',
    followup: 'First-kill record writes site coordinates + a persistent marker prop; returning seasons later the plate has accumulated small objects — bolts, a ribbon, someone\'s spare key — left by people who fly this lane (offerings accrue in story.flags, keyed to simTime since the kill).',
    payload: {
      text: 'Somebody has marked the site of your first kill — a small buoy, a plate, and an inscription nobody signs: "First hull down, by an unregistered hull. It had a name too." The plate does not judge. The plate is just accurate, and it has been here the whole time.',
    },
  },

  // SP1-082 — The Two Halves: one ship, two sectors, one transponder.
  {
    id: 'SP1-082',
    kind: 'world-oneoff',
    title: 'The Two Halves',
    sectors: ['sector_ceres_belt', 'sector_tethys_junction'],
    trigger: { type: 'receipt', event: 'scan:completed' },
    channel: 'memory',
    followup: 'Two wreck sites in src/data/uniqueWrecks.js sharing one log-fragment pool: scanning either half marks the other on the chart with a line no map function drew; visiting both assembles the joined log in src/data/codexPages.js — the crew\'s last three days, ending on a decision the player understands but cannot judge.',
    payload: {
      text: 'A ship torn in two by something nobody wants to name: the bow drifting the Ceres field, the stern holding station off Tethys, both halves still squawking one joined transponder. Scan either half and the other marks itself on your chart, with a line drawn between them that no map function drew.',
    },
  },

  // SP2-065 — The Sommelier of Coolant: the depot bar's censer machine has
  // rebranded. Depot3 is Choir-run in canon (station_depot3, faction_choir).
  {
    id: 'SP2-065',
    kind: 'world-oneoff',
    title: 'The Sommelier of Coolant',
    sectors: ['sector_vesta_forge'],
    trigger: { type: 'receipt', event: 'dock:docked' },
    channel: 'memory',
    followup: 'barContacts canonical contact at the Refuel Depot bar + purchase option: buying "the Thursday" (small credit price) grants a fuel-efficiency buff for one run and Choir rep +1 — "the censer remembers patronage."',
    payload: {
      text: 'The Refuel Depot bar\'s sole bartender is a retired Choir censer machine that has rebranded its incense burn as "beverage temperature control." It describes fuel-cell vintages in liturgical cadence, unbidden: "This cell — cast on a Thursday. You will taste the Thursday."',
    },
  },

  // SP1-113 — The Return: the enemy with a code, and the ending the rivalry
  // gets.
  {
    id: 'SP1-113',
    kind: 'world-oneoff',
    title: 'The Return',
    sectors: [],
    trigger: { type: 'receipt', event: 'combat:kill' },
    channel: 'memory',
    followup: 'Story-flag record of near-death fights (survived at hull < 20%) plus a three-sector-day delay, then a numbered selfRegistered encounter spawns the escort keyed to that flag (vignetteInterpreter face/depart motions); the nemesis appears exactly once more, at the next worst moment, and takes a side the player does not expect.',
    payload: {
      text: 'An old enemy drops out of cruise beside you — the one who nearly ended you — and escorts you, in silence, to the station ring. Before peeling off, one transmission: "Not today. I want the version that\'s repaired." The band, for once, has nothing to say.',
    },
  },

  // SP1-108 — The Dimming: the vigil buoy going out on a schedule, unless
  // somebody feeds it.
  {
    id: 'SP1-108',
    kind: 'world-oneoff',
    title: 'The Dimming',
    sectors: ['sector_charon_expanse'],
    trigger: { type: 'sectorEntry' },
    channel: 'memory',
    followup: 'Persistent prop with a decay value in story.flags, measurably dimmer each visit: latch and feed it — a real massline charge interaction — to reset the decay; each donation is logged on the buoy; at three donations the belt quietly names the buoy after the player\'s hull via news:publish.',
    payload: {
      text: 'A vigil buoy nobody claims, burning for a disaster no record names. It is dying — each pass it measures a little dimmer, and the belt has noticed. Nobody will fund it. Everyone mentions it. A grieving light, going out on a schedule.',
    },
  },

  // SP2-064 — The Two-Yard Feud: both bars are right about the same junction.
  {
    id: 'SP2-064',
    kind: 'world-oneoff',
    title: 'The Two-Yard Feud',
    sectors: ['sector_tethys_junction'],
    trigger: { type: 'receipt', event: 'economy:tradeCompleted' },
    channel: 'memory',
    followup: 'barContacts rumor rows at station_tethys and station_customs (unlocked once the player has traded at both) resolving into a real one-off pallet job via src/data/missions.js — one disputed pallet, two liens, no manifest; payment is both bars\' standing +3, permanently.',
    payload: {
      text: 'The Tethys regulars describe the Customs yard with escalating precision and zero facts: the breakaway rig "fires payloads nobody files." The Customs regulars say the weigh clamp "holds hulls for the pleasure of holding." Both bars are describing the same junction from opposite ends, and both are correct.',
    },
  },

  // SP2-068 — The Complaint Choir: retired Concord clerks who read the form.
  {
    id: 'SP2-068',
    kind: 'world-oneoff',
    title: 'The Complaint Choir',
    sectors: ['sector_helios_prime'],
    trigger: { type: 'receipt', event: 'law:fineAssessed' },
    channel: 'memory',
    followup: 'barContacts canonical contact group keyed to law receipts: the free review finds one procedural error in any fine the player has paid — always line four — and the first review refunds a fine in real credits; flag clerks_corner, Concord rep +1 ("someone read the form").',
    payload: {
      text: 'A corner booth at Helios holds retired Concord clerks filing grievances against current Concord out of pure craft pride: "Form 44-C sub-paragraph nine used to have a diagram. A DIAGRAM. Now it is adjectives." They offer to review any fine you have ever paid, free, and find one procedural error. It is always line four.',
    },
  },

  // SP2-070 — The Question Booth: it pays for good questions and audits the
  // rest. Vergé-Layers canon: auditors of old doors.
  {
    id: 'SP2-070',
    kind: 'world-oneoff',
    title: 'The Question Booth',
    sectors: ['sector_sedna_dark'],
    trigger: { type: 'receipt', event: 'scan:completed' },
    channel: 'memory',
    followup: 'barContacts canonical contact + a real breadcrumb reveal of an uncharted Verge gate POI (gate-coordinate fragment as payment); codex page under Vergé-Layers: "auditors of old doors." The best-question audit is the booth\'s own ledger and is never explained.',
    payload: {
      text: 'At the dark end of the Sedna rail sits a booth with one occupant who registers questions and pays for good ones. It answers everything with questions. Your first one earns a flat fee; the occupant\'s own opaque audit will later declare your best one — and pay that in gate coordinates.',
    },
  },

  // SP2-071 — The Archive's Reading Hour: a sealed record declassified by the
  // act of performance. Recurring calendar window stands in for the weekly
  // cadence (the runtime calendar re-arms per 40-day year); the codex set is
  // the bespoke leg.
  {
    id: 'SP2-071',
    kind: 'world-oneoff',
    title: "The Archive's Reading Hour",
    sectors: ['sector_helios_prime'],
    trigger: { type: 'calendar', dayOfYear: 13, windowS: [300, 600] },
    recurring: true,
    channel: 'memory',
    followup: 'Recurring bar event in the Helios back room during the calendar window: one codex page per attended hour, "Reading Hour, [Week N]" — a 4-6 page authored set in src/data/codexPages.js; attendance is the dock-side option while the window is open.',
    payload: {
      text: 'Once a watch-week the Archive hosts a reading hour in the Helios back room: one sealed record, read aloud, declassified by the act of performance. The first on the stand is the transcript of a docking clerk\'s last shift — all of it procedural, all of it devastating.',
    },
  },

  // SP2-079 — The Choir Chair: the empty chair for whoever reels in the last
  // pod. Eris Margin canon: the Fence on the Ashfall approach.
  {
    id: 'SP2-079',
    kind: 'world-oneoff',
    title: 'The Choir Chair',
    sectors: ['sector_eris_margin'],
    trigger: { type: 'receipt', event: 'dock:docked' },
    channel: 'memory',
    followup: 'Bar set-dressing + a ropeable pod interaction on the Ashfall tow-line (worldOneOffs rope pattern): reel in the last pod to claim the chair — one free drink per visit, forever, and the whole bar stands up (flag write; stationContacts line).',
    payload: {
      text: 'The Margin Fence bar keeps one chair empty at the end of the rail, angled at the window where the tow-line pods hang on the Ashfall approach. "For the line," the barkeep says. "When it finally cuts down, the chair is for whoever reels in the last pod. It has never been used. The beer on it is replaced daily."',
    },
  },

  // SP2-080 — The Night Manager: a Fulfillment automaton runs the rail on
  // queue logic and cannot classify gratitude.
  {
    id: 'SP2-080',
    kind: 'world-oneoff',
    title: 'The Night Manager',
    sectors: ['sector_hyperion_cut'],
    trigger: { type: 'receipt', event: 'dock:docked' },
    channel: 'memory',
    followup: 'barContacts canonical contact at the Cut Claim Outpost, gated to the berth\'s third watch (worldCalendar stationShiftAt), + tip purchase option; codex page under Fulfillment: "the night manager processes gratitude as inventory"; Fulfillment standing +1 if the player tips.',
    payload: {
      text: 'On the deep-night watches the Claim Outpost\'s rail is run by a leased Fulfillment automaton: drinks served in strict shift-order, wait times quoted to the second, and taped to its chassis a hand-written sign — "TIP JAR (PROCESSED AS INVENTORY)." Every regular tips. It has not determined why.',
    },
  },

  // SP2-103 — The DMC Retirement Watch: the rigs get a bell-time too.
  {
    id: 'SP2-103',
    kind: 'world-oneoff',
    title: 'The DMC Retirement Watch',
    sectors: ['sector_ceres_belt'],
    trigger: { type: 'receipt', event: 'drill:chargeBlast' },
    channel: 'memory',
    followup: 'Dock-side dressing row keyed to the belt mining counter (3+ different fields worked): attending the bell reading at station_ceres grants DMC standing +2; codex page "The Retirement Line."',
    payload: {
      text: 'By the Ceres refinery, a line of parked-out rigs gets the bell-time the crews give their own: one name plate, one fact, read aloud — "DRILL FOUR. PULLED NINE THOUSAND TONNES. BIT THREE CHILDREN\'S TEETH." Nobody explains the third one. Nobody has to.',
    },
  },

  // SP2-107 — The Frontier's Porch Light: the unlit work light on every Free
  // beacon, and the convention that lights it. Free-berthed sectors: Reach,
  // Veil, and the three Free frontier packs.
  {
    id: 'SP2-107',
    kind: 'world-oneoff',
    title: "The Frontier's Porch Light",
    sectors: ['sector_io_reach', 'sector_veil_nebula', 'sector_nereid_shoal', 'sector_haumea_rift', 'sector_triton_wake'],
    trigger: { type: 'receipt', event: 'history:deadNoted' },
    channel: 'memory',
    followup: 'Beacon interactable keyed to Free-hull loss events: first hull on scene lights the beacon — +3 Free standing and a next-of-kin letter ("The light was on. We knew.") filed as a late mail row in the serial integration pass; per-station porch_lit flags.',
    payload: {
      text: 'On the outer beacon of every Free station hangs a single work light — unlit, spare bulbs stowed beside it. "If a Free hull comes home dark — systems dead, crew cold — the first hull through lights the beacon," a regular explains. "Nobody logs it. It is not a service. It is a porch."',
    },
  },

  // SP2-118 — Bracket's Perfect Game: the goalkeeper files his first zero.
  // Bracket BX-9 is verified canon (character_bracket, src/data/bracket.js).
  {
    id: 'SP2-118',
    kind: 'world-oneoff',
    title: "Bracket's Perfect Game",
    sectors: ['sector_helios_prime'],
    trigger: { type: 'receipt', event: 'dock:docked' },
    channel: 'memory',
    followup: 'Session collision counter inside Bracket\'s yard radius (character_bracket anchor, src/data/bracket.js) feeds a hail variant on the bracket.js line pattern; flag bracket_zero; the zero becomes one regular line at the Helios bar; Bracket\'s own bookkeeping marks the perfect game and cites it by day number forever.',
    payload: {
      text: 'BRACKET hails with the goalkeeper\'s version of a medal: "ZONE LOG: ZERO IMPACTS. I HAVE NEVER FILED A ZERO. I HAVE FILED THIS ONCE. KEEP THE HULL. I AM KEEPING THE LOG." Every greeting after that cites the zero by day number.',
    },
  },

  // SP1-028 — The Warden Drill: lane-closure drills the locals just wait out.
  // Wardens recast to Concord patrol per the verify-remit hone (Vael's remit
  // is the far rim). Daily cadence maps to the seeded per-day hash: the drill
  // runs most days; you catch one on a seeded day.
  {
    id: 'SP1-028',
    kind: 'world-oneoff',
    title: 'The Warden Drill',
    sectors: ['sector_io_reach'],
    trigger: { type: 'hashDaily', chance: 0.85 },
    channel: 'commsLog',
    payload: {
      from: 'Checkpoint lane',
      text: 'The checkpoint shuts without ceremony: all traffic stacks into a visible holding pattern while the wardens walk the line hull-to-hull, then the lane reopens like nothing happened. Locals just wait it out. The mine-marker cut-through is open, unmarked on any chart, and priced at whatever a patrol decides you look like.',
    },
  },

  // SP2-126 — The Runaway Kiln Cools: the first bend in a recorded life.
  {
    id: 'SP2-126',
    kind: 'world-oneoff',
    title: 'The Runaway Kiln Cools',
    sectors: ['sector_vesta_forge'],
    trigger: { type: 'receipt', event: 'cargo:delivered' },
    channel: 'memory',
    followup: 'Kiln runtime counter crossing the cool threshold on delivered/jettisoned coolant mass across visits; the state transition persists per save (flag kiln_cooled, Pitborn standing +2); a Pitborn fence later offers a discount memoized "the kiln put in a word."',
    payload: {
      text: 'The Runaway Kiln\'s temperature curve bends down for the first time in its recorded life. It does not thank anyone: "COOLING. SCHEDULE: FIRST TIME. CAUSE: [YOUR HULL]. LOG: THE CAUSE IS NOTED. THE CAUSE MAY RETURN."',
    },
  },

  // SP1-164 — The Graveyard Orbit: the slow ring of the sector's dead fleet,
  // appended to in order, always at the tail.
  {
    id: 'SP1-164',
    kind: 'world-oneoff',
    title: 'The Graveyard Orbit',
    sectors: ['sector_veil_nebula'],
    trigger: { type: 'sectorEntry' },
    channel: 'memory',
    followup: 'Persistent ring of wrecks (wreckClasses) with an append-at-tail rule keyed to major NPC deaths; scanning a hull\'s plaque long-form yields one codex page per hull, twenty in all; the newest hull in the ring is always someone the player has heard of.',
    payload: {
      text: 'A graveyard orbit: decommissioned hulls parked nose to tail in a slow ring, kilometer after kilometer, each stripped of anything useful and left exactly as it was, name still on. The ring is maintained by nobody. Hulls are added to it by somebody — in order, always at the tail.',
    },
  },

  // SP3-035 — The Anvil Lighthouse: one lonely light, exactly on time. The
  // renderer leg (authoredPlaces zone + beacon lamp channel) is a later batch
  // keyed on this memory receipt.
  {
    id: 'SP3-035',
    kind: 'world-oneoff',
    title: 'The Anvil Lighthouse',
    sectors: ['sector_tethys_junction'],
    trigger: { type: 'sectorEntry' },
    channel: 'spectacle',
    payload: {
      from: 'Tethys Junction',
      text: 'One lonely light rides the influence edge on a slow orbit, sweeping the dark side of the disc once every thirteen seconds — the only structure for a thousand WU. Pilots time their sling-band approaches by it, and the light is always exactly on time.',
    },
  },

  // SP1-170 — The Clinic Ring: doors open to anyone, and the ring is honest.
  // Operator recast Helix -> The Understory per the verify-remit hone
  // (consensus title "The Helix Barge"); free repairs cost queue time, and
  // the ring violation is the one permanent consequence.
  {
    id: 'SP1-170',
    kind: 'world-oneoff',
    title: 'The Clinic Ring',
    sectors: ['sector_sker_haven'],
    trigger: { type: 'sectorEntry' },
    channel: 'memory',
    followup: 'Understory triage barge (persistent vendor fixture): free repairs cost visible queue TIME with the triage order on display, worse hulls first, your enemies included, which you watch; fire inside the ring once and it is permanent — news:publish broadcast within the day and a faction-wide standing penalty. It is tested once.',
    payload: {
      text: 'A clinic barge hangs in the deep lanes with its lights on and its doors open to anyone — pirates, patrols, you. The rule is painted twice on the ring: NO WEAPONS INSIDE. NO EXCEPTIONS EXCEPT YOURS. The ring is honest: fire inside it and every faction\'s ledger hears about it within the day.',
    },
  },

  // SP2-061 — The Regular's Empty Stool: the drink is for the arithmetic.
  // Shaft 7 is Ceres canon (poi_ceres_shaft_seven keeps the stake).
  {
    id: 'SP2-061',
    kind: 'world-oneoff',
    title: "The Regular's Empty Stool",
    sectors: ['sector_ceres_belt'],
    trigger: { type: 'receipt', event: 'dock:docked' },
    channel: 'memory',
    followup: 'Bar set-dressing row at station_ceres gated to the night watch (worldCalendar stationShiftAt) + purchase option: buying the next round for the floor crew grants DMC rep +1; codex page under Shaft 7 (poi_ceres_shaft_seven keeps the stake).',
    payload: {
      text: 'One stool on the Crucible\'s night rail has a drink on it and nobody near it. The barkeep explains, unprompted: "Shift 7\'s floor lead. Nine of eleven came back from Shaft 7. The drink is for the arithmetic." It is refreshed every night by the same crew. Nobody drinks it.',
    },
  },

  // SP1-182 — The Naming: the yard named a tug after you, and the yardmaster
  // will not correct the pronunciation.
  {
    id: 'SP1-182',
    kind: 'world-oneoff',
    title: 'The Naming',
    sectors: ['sector_helios_prime'],
    trigger: { type: 'receipt', event: 'rescue:started' },
    channel: 'memory',
    followup: 'Rescue flag + dock ceremony vignette at the Helios yard: a real borrowable assist verb at station_helios (docking speed-up, fairly capped); the mispronounced name is persisted — the yardmaster refuses to correct it, and the tug answers to it.',
    payload: {
      text: 'The Helios yard has named a tug. Your hull\'s name — mispronounced — on a brand-new tug, at a naming ceremony nobody told you about. The yardmaster\'s whole speech: "Small yard. We name what we\'re grateful for. She\'s yours to borrow, any time she\'s not working."',
    },
  },
];
