// src/data/special500/entries-annex2-c.js — annex wave 2, file C (SPX-E-101..150).
//
// Fifty timed and ambient entries:
//   calendar    22 recurring rituals — the sixteen land on year-days the ratified
//               catalog and wave 1 left empty (17/23/29/32/34/35/36/37, two
//               each), the rest on days carrying a single prior entry.
//   hashDaily   18 sector-scoped ambient beats, seeded per save-day.
//   sectorEntry  7 arrival lines for sectors with the weakest coverage.
//   simWindow    3 early-life beats keyed to save-age.
// All rhythms are world-clock: calendar re-arms yearly, hashDaily is seeded,
// simWindow is save-age — no wall time anywhere.

export const ENTRIES_ANNEX2_C = [
  // ── calendar: twenty-two recurring rituals ────────────────────────────────

  // SPX-E-101 — The Filing Season Opens: the paperwork new year.
  {
    id: 'SPX-E-101',
    kind: 'comms-event',
    title: 'The Filing Season Opens',
    sectors: [],
    trigger: { type: 'calendar', dayOfYear: 17, windowS: [0, 300] },
    recurring: true,
    channel: 'news',
    payload: {
      text: 'FILING SEASON OPENS: the registry year turns over and every office posts its fresh stamp — a new seal, a new seal-ring, and the same instruction in every office: FILE EVERYTHING ONCE. The desks celebrate with new ink. The ink is already a week old.',
      kind: 'notices',
    },
  },

  // SPX-E-102 — The Twice-A-Year Day: the day that counts double.
  {
    id: 'SPX-E-102',
    kind: 'easter-egg',
    title: 'The Twice-A-Year Day',
    sectors: [],
    trigger: { type: 'calendar', dayOfYear: 17, windowS: [330, 600] },
    recurring: true,
    channel: 'commsLog',
    payload: {
      from: 'Station almanac',
      text: 'The almanac marks today twice — once as the seventeenth, once as the unnumbered day it keeps for debts too awkward to schedule. Nobody agrees which is which. The toll boards take both. They always take both.',
    },
  },

  // SPX-E-103 — Audit Eve: the night before the counting.
  {
    id: 'SPX-E-103',
    kind: 'comms-event',
    title: 'Audit Eve',
    sectors: [],
    trigger: { type: 'calendar', dayOfYear: 23, windowS: [60, 300] },
    recurring: true,
    channel: 'news',
    payload: {
      text: 'AUDIT EVE: the registry reminds all desks that tomorrow the counting begins, and tonight the shredders run at capacity — a legal capacity, the reminder adds, in the same flat tone it uses for everything true and inconvenient.',
      kind: 'notices',
    },
  },

  // SPX-E-104 — The Honest Hour: one hour of posted truth.
  {
    id: 'SPX-E-104',
    kind: 'easter-egg',
    title: 'The Honest Hour',
    sectors: [],
    trigger: { type: 'calendar', dayOfYear: 23, windowS: [330, 390] },
    recurring: true,
    channel: 'commsLog',
    payload: {
      from: 'Toll desk',
      text: 'For one hour today the toll boards post their real margin — the actual take, the actual markup, the actual cost of mercy. It is the charter\'s honesty clause, and it lasts sixty minutes because that is how long honesty can be afforded. The other twenty-three hours are a different kind of accurate.',
    },
  },

  // SPX-E-105 — The Long Reading: the Archive reads the year aloud.
  {
    id: 'SPX-E-105',
    kind: 'comms-event',
    title: 'The Long Reading',
    sectors: [],
    trigger: { type: 'calendar', dayOfYear: 29, windowS: [0, 600] },
    recurring: true,
    channel: 'commsLog',
    payload: {
      from: 'Archive wire',
      text: 'The Archive\'s annual public read begins: one clerk, one ledger, the year\'s filings read aloud in order of submission. It takes ten hours by law. The reading room is always full for the first line and the last. The middle is for people who owe the Archive something.',
    },
  },

  // SPX-E-106 — Null Day: the day the ledger pretends is missing.
  {
    id: 'SPX-E-106',
    kind: 'anomaly',
    title: 'Null Day',
    sectors: [],
    trigger: { type: 'calendar', dayOfYear: 29, windowS: [300, 330] },
    recurring: true,
    channel: 'commsLog',
    payload: {
      from: 'Registry almanac',
      text: 'The almanac lists today as NULL — a bookkeeping gap the calendar keeps on purpose, a day for transactions that must exist but must not be dated. The desks call it the calendar\'s conscience. Business as usual, filed nowhere.',
    },
  },

  // SPX-E-107 — The Pound of Salt: the old trade-law ritual.
  {
    id: 'SPX-E-107',
    kind: 'comms-event',
    title: 'The Pound of Salt',
    sectors: [],
    trigger: { type: 'calendar', dayOfYear: 32, windowS: [60, 420] },
    recurring: true,
    channel: 'news',
    payload: {
      text: 'TRADE-DAY: the oldest clause still in force requires every exchange floor to weigh one pound of salt against one rumor and declare the salt heavier. The floors comply, every year, because the alternative — weighing the rumor honestly — is how the last crash started.',
      kind: 'notices',
    },
  },

  // SPX-E-108 — The Half-Year Count: the ledger takes attendance.
  {
    id: 'SPX-E-108',
    kind: 'comms-event',
    title: 'The Half-Year Count',
    sectors: [],
    trigger: { type: 'calendar', dayOfYear: 32, windowS: [450, 600] },
    recurring: true,
    channel: 'news',
    payload: {
      text: 'HALF-YEAR COUNT: every desk reports its open files to the registry, which publishes the total in one line: FILES OPEN: MORE THAN LAST YEAR. The registry no longer publishes the number. The number, it says, was discouraging the files.',
      kind: 'notices',
    },
  },

  // SPX-E-109 — The Kestrel Night: a storm that got a name.
  {
    id: 'SPX-E-109',
    kind: 'comms-event',
    title: 'The Kestrel Night',
    sectors: [],
    trigger: { type: 'calendar', dayOfYear: 34, windowS: [120, 480] },
    recurring: true,
    channel: 'commsLog',
    payload: {
      from: 'Weather wire',
      text: 'The anniversary of the Kestrel — the only storm the survey ever named, because the crew that flew through it named it after the ship that did not. Every year the wire replays the last clear transmission. It is one word, and the wire lets it stand without commentary.',
    },
  },

  // SPX-E-110 — The Unmanned Watch: a post kept by the dead.
  {
    id: 'SPX-E-110',
    kind: 'easter-egg',
    title: 'The Unmanned Watch',
    sectors: [],
    trigger: { type: 'calendar', dayOfYear: 34, windowS: [510, 600] },
    recurring: true,
    channel: 'commsLog',
    payload: {
      from: 'Watch desk',
      text: 'The last watch of the day is kept by nobody — an empty chair, an open channel, one hour where the network listens to itself. The custom started after a night shift that heard something it could not file. The hour is kept so the network knows someone might be listening. It is the politeness of the wire.',
    },
  },

  // SPX-E-111 — The Borrowed Day: a day on loan from last year.
  {
    id: 'SPX-E-111',
    kind: 'easter-egg',
    title: 'The Borrowed Day',
    sectors: [],
    trigger: { type: 'calendar', dayOfYear: 35, windowS: [0, 300] },
    recurring: true,
    channel: 'commsLog',
    payload: {
      from: 'Station almanac',
      text: 'The thirty-fifth is on loan — the calendar borrowed it from last year to make the accounting work, and it has never been returned. Days borrowed from last year are legally last year, which makes today the only day you can fix last year\'s books without lying. The desks call it amendable.',
    },
  },

  // SPX-E-112 — Debtors\' Sunday: the moor\'s quiet day.
  {
    id: 'SPX-E-112',
    kind: 'comms-event',
    title: 'Debtors\' Sunday',
    sectors: [],
    trigger: { type: 'calendar', dayOfYear: 35, windowS: [330, 600] },
    recurring: true,
    channel: 'news',
    payload: {
      text: 'DEBTORS\' SUNDAY: by old statute no collection action may be filed on the thirty-fifth — one day a year when owing is, briefly, not a verb. The statute names no Sunday. The debtors chose the thirty-fifth themselves, decades ago, and the collectors pretended it was always that day.',
      kind: 'notices',
    },
  },

  // SPX-E-113 — The Sweepstakes: the wreck-pool draw.
  {
    id: 'SPX-E-113',
    kind: 'comms-event',
    title: 'The Sweepstakes',
    sectors: [],
    trigger: { type: 'calendar', dayOfYear: 36, windowS: [60, 420] },
    recurring: true,
    channel: 'commsLog',
    payload: {
      from: 'Salvage wire',
      text: 'The wreck-pool draws today — every salvager in the book puts in on which uncharted hulk surfaces next, and the pot pays whoever guesses closest. The pool is older than half the sectors in it. This year\'s favorite is the one nobody wants to find.',
    },
  },

  // SPX-E-114 — The Quiet Audition: the band\'s silent open mic.
  {
    id: 'SPX-E-114',
    kind: 'easter-egg',
    title: 'The Quiet Audition',
    sectors: [],
    trigger: { type: 'calendar', dayOfYear: 36, windowS: [450, 600] },
    recurring: true,
    channel: 'commsLog',
    payload: {
      from: 'The band',
      text: 'The band\'s annual open hour — except the rule is no sound: every act transmits a plan of what it would have played, in text, in order. The audience votes by silence — whoever gets talked over least wins. Last year a maintenance report won. It was very well paced.',
    },
  },

  // SPX-E-115 — The Belt\'s Birthday: the disputed founding.
  {
    id: 'SPX-E-115',
    kind: 'comms-event',
    title: 'The Belt\'s Birthday',
    sectors: [],
    trigger: { type: 'calendar', dayOfYear: 37, windowS: [0, 420] },
    recurring: true,
    channel: 'news',
    payload: {
      text: 'FOUNDING OBSERVED: the belt\'s founding date is marked today on three different charts as three different years — and all three are official, since the founding party filed its paperwork before it existed. The registrar accepts all three dates. It is the only birthday the ledger celebrates three times and means it once.',
      kind: 'notices',
    },
  },

  // SPX-E-116 — The Eleventh Hour: the year\'s last loud minute.
  {
    id: 'SPX-E-116',
    kind: 'comms-event',
    title: 'The Eleventh Hour',
    sectors: [],
    trigger: { type: 'calendar', dayOfYear: 37, windowS: [450, 600] },
    recurring: true,
    channel: 'commsLog',
    payload: {
      from: 'Every band',
      text: 'The last hour before the year\'s end belongs to the toasts — every channel stacked with crews reading their years aloud, debts, saves, losses, all of it admissible. The rule is you may not toast the coming year. That year has not paid its toll yet.',
    },
  },

  // SPX-E-117 — The Fax Machine Day: paper traffic, by law.
  {
    id: 'SPX-E-117',
    kind: 'easter-egg',
    title: 'The Fax Machine Day',
    sectors: [],
    trigger: { type: 'calendar', dayOfYear: 3, windowS: [120, 480] },
    recurring: true,
    channel: 'commsLog',
    payload: {
      from: 'Desk wire',
      text: 'One day a year the desks exchange physical paper — the retention act requires it, on the theory that a bureaucracy that never touches paper stops being able to prove it exists. The paper is filed, stamped, and stored. The theory is holding.',
    },
  },

  // SPX-E-118 — Small Claims Day: justice at desk height.
  {
    id: 'SPX-E-118',
    kind: 'comms-event',
    title: 'Small Claims Day',
    sectors: [],
    trigger: { type: 'calendar', dayOfYear: 4, windowS: [0, 480] },
    recurring: true,
    channel: 'news',
    payload: {
      text: 'SMALL CLAIMS DAY: the one session where disputes under a hundred credits are heard — a full docket of missing spanners, insulted hulls, and one eternal case about a sandwich. The hearing officer has presided for thirty years. She remembers the sandwich. She will not say whose side she is on.',
      kind: 'notices',
    },
  },

  // SPX-E-119 — The Comet Lesson: the band teaches the year.
  {
    id: 'SPX-E-119',
    kind: 'comms-event',
    title: 'The Comet Lesson',
    sectors: [],
    trigger: { type: 'calendar', dayOfYear: 10, windowS: [0, 600] },
    recurring: true,
    channel: 'commsLog',
    payload: {
      from: 'The band, teaching hour',
      text: 'Once a year the band runs the lesson — an hour where the old hands take over the open channel and explain one thing to every new hull listening: how the belt works, what it costs, what it forgives. The lesson is different every year. The part that never changes is the last five minutes, which is just names.',
    },
  },

  // SPX-E-120 — The Middle of Nowhere Day: the far crews\' holiday.
  {
    id: 'SPX-E-120',
    kind: 'comms-event',
    title: 'The Middle of Nowhere Day',
    sectors: [],
    trigger: { type: 'calendar', dayOfYear: 15, windowS: [0, 600] },
    recurring: true,
    channel: 'commsLog',
    payload: {
      from: 'Far lanes',
      text: 'The holiday the deep-sector crews declared for themselves — the middle of the year, celebrated at the point farthest from any desk. The custom is one message, sent inward: STILL HERE. The messages arrive for days afterward, from farther and farther out. The registrar files them under WEATHER, because it has no other box.',
    },
  },

  // SPX-E-121 — The Turn: the year\'s midpoint, officially.
  {
    id: 'SPX-E-121',
    kind: 'comms-event',
    title: 'The Turn',
    sectors: [],
    trigger: { type: 'calendar', dayOfYear: 27, windowS: [120, 480] },
    recurring: true,
    channel: 'commsLog',
    payload: {
      from: 'Station almanac',
      text: 'The year\'s midpoint — the Turn — and the custom is to say the year\'s count aloud: days spent, days owed, days left. The count is private arithmetic done in public, the one day the ledger lets you see everyone else adding. The sums are always wrong. The admitting is the point.',
    },
  },

  // SPX-E-122 — The Clerk\'s Relief Day: the desks trade seats.
  {
    id: 'SPX-E-122',
    kind: 'easter-egg',
    title: 'The Clerk\'s Relief Day',
    sectors: [],
    trigger: { type: 'calendar', dayOfYear: 31, windowS: [60, 540] },
    recurring: true,
    channel: 'commsLog',
    payload: {
      from: 'Desk wire',
      text: 'One day a year the clerks trade desks — customs does salvage, salvage does claims, claims does grief. The statute calls it perspective training. What it trains is the specific, precious knowledge that your own desk is not the worst one. The sandwich case transfers with the officer. It is technically a claim.',
    },
  },

  // ── hashDaily: eighteen sector-scoped ambient beats ───────────────────────

  // SPX-E-123 — The Belt\'s Gossip Index.
  {
    id: 'SPX-E-123',
    kind: 'comms-event',
    title: 'The Belt\'s Gossip Index',
    sectors: ['sector_ceres_belt'],
    trigger: { type: 'hashDaily', chance: 0.35 },
    channel: 'commsLog',
    payload: {
      from: 'Belt chatter',
      text: 'The day\'s gossip index posts: three affairs, two debts, one missing wrench that has become a legend with a fan club. The wrench has been missing eleven years. The index notes it trends up whenever a new crew arrives, which the old hands say is the point of a good legend — it never clocks out.',
    },
  },

  // SPX-E-124 — The Queue\'s Poetry Corner.
  {
    id: 'SPX-E-124',
    kind: 'easter-egg',
    title: 'The Queue\'s Poetry Corner',
    sectors: ['sector_tethys_junction'],
    trigger: { type: 'hashDaily', chance: 0.3 },
    channel: 'commsLog',
    payload: {
      from: 'Queue chatter',
      text: 'The tally queue keeps a poetry corner — verses scratched into the rail by people who had time. Today\'s addition, in fresh ink: I WAITED IN THIS QUEUE SO LONG / MY CHILDREN GREW, MY TOLL GREW STRONG / THE CLERK LOOKED UP AND ASKED MY NAME / AND STAMPED THE FORM THE VERY SAME. It is the happiest poem on the rail. It is the only one about success.',
    },
  },

  // SPX-E-125 — The Forge\'s Ash Forecast.
  {
    id: 'SPX-E-125',
    kind: 'comms-event',
    title: 'The Forge\'s Ash Forecast',
    sectors: ['sector_vesta_forge'],
    trigger: { type: 'hashDaily', chance: 0.4 },
    channel: 'commsLog',
    payload: {
      from: 'Forge wire',
      text: 'The forge posts its daily ash forecast the way farm country posts rain — expected fallout, wind bearing, and one line of advice: BRUSH YOUR INTAKES. The forecasters are kiln tenders reading the furnace\'s mood. They are wrong about the ash more often than the meteorologists. They are never wrong about the mood.',
    },
  },

  // SPX-E-126 — The Drift\'s Luck Report.
  {
    id: 'SPX-E-126',
    kind: 'comms-event',
    title: 'The Drift\'s Luck Report',
    sectors: ['sector_pallas_drift'],
    trigger: { type: 'hashDaily', chance: 0.3 },
    channel: 'commsLog',
    payload: {
      from: 'Drift chatter',
      text: 'The drift publishes a luck report — which lanes ran clean, which stakes found metal, which hulls nobody should lend money to today. It is astrology with a balance sheet, and the drift swears by it because the alternative is admitting the drift is chance. The drift is chance. The report is its filing.',
    },
  },

  // SPX-E-127 — The Reach\'s Patrol Chatter.
  {
    id: 'SPX-E-127',
    kind: 'comms-event',
    title: 'The Reach\'s Patrol Chatter',
    sectors: ['sector_io_reach'],
    trigger: { type: 'hashDaily', chance: 0.4 },
    channel: 'commsLog',
    payload: {
      from: 'Patrol channel',
      text: 'The patrol net runs a rolling commentary — half work, half the longest-running conversation in the reach, a chat that has outlasted four patrol commanders by refusing to end. New officers get assigned a patrol route and a place in the conversation. The conversation is older than the route.',
    },
  },

  // SPX-E-128 — The Expanse\'s Stillness Report.
  {
    id: 'SPX-E-128',
    kind: 'comms-event',
    title: 'The Expanse\'s Stillness Report',
    sectors: ['sector_charon_expanse'],
    trigger: { type: 'hashDaily', chance: 0.35 },
    channel: 'commsLog',
    payload: {
      from: 'Expanse wire',
      text: 'The expanse posts a stillness report — a daily measure of how quiet it was, graded on a scale only the expanse understands. Today: very. The report exists so the silence stays a measurement and not a condition. The grading rubric was lost with the desk that wrote it. The report continues at the same grades.',
    },
  },

  // SPX-E-129 — The Haven\'s Menagerie.
  {
    id: 'SPX-E-129',
    kind: 'easter-egg',
    title: 'The Haven\'s Menagerie',
    sectors: ['sector_sker_haven'],
    trigger: { type: 'hashDaily', chance: 0.3 },
    channel: 'commsLog',
    payload: {
      from: 'Haven chatter',
      text: 'The haven keeps a menagerie of grudges — every feud in the sector, filed, fed, and occasionally walked by the peace desk like animals that might otherwise bite. Today\'s inventory: eleven active feuds, two dormant, one considered decorative. The decorative one has never been dangerous. That is its job.',
    },
  },

  // SPX-E-130 — The Veil\'s Song List.
  {
    id: 'SPX-E-130',
    kind: 'anomaly',
    title: 'The Veil\'s Song List',
    sectors: ['sector_veil_nebula'],
    trigger: { type: 'hashDaily', chance: 0.4 },
    channel: 'commsLog',
    payload: {
      from: 'Veil wire',
      text: 'The veil posts the day\'s song list — the frequencies the nebula sang at, in order, cataloged by listeners who have made a liturgy of static. Today\'s list is four notes long. The listeners call a four-note day a sermon. Nobody has decided what a five-note day means yet, and the wait for one is its own worship.',
    },
  },

  // SPX-E-131 — The Reach\'s Memory.
  {
    id: 'SPX-E-131',
    kind: 'comms-event',
    title: 'The Reach\'s Memory',
    sectors: ['sector_ashfall_reach'],
    trigger: { type: 'hashDaily', chance: 0.35 },
    channel: 'commsLog',
    payload: {
      from: 'Ashfall wire',
      text: 'The reach\'s oldest archive runs a memory hour — reading from its deepest records, the ones about the reach before the reach was a name. Today\'s reading concerned a survey that described this sector as briefly hospitable. The archive reads it every year on a different day, as if checking whether it has become true again.',
    },
  },

  // SPX-E-132 — The March\'s Dark Humor Index.
  {
    id: 'SPX-E-132',
    kind: 'easter-egg',
    title: 'The March\'s Dark Humor Index',
    sectors: ['sector_nyx_march'],
    trigger: { type: 'hashDaily', chance: 0.35 },
    channel: 'commsLog',
    payload: {
      from: 'March chatter',
      text: 'The march keeps a humor index — jokes told per shift, tracked on the theory that when the jokes stop the sector is in real trouble. Today: forty-one, two of them good. The index has never hit zero. The march keeps the index because it is the only instrument that has never lied about the mood.',
    },
  },

  // SPX-E-133 — The Scar\'s Salvage Bell.
  {
    id: 'SPX-E-133',
    kind: 'comms-event',
    title: 'The Scar\'s Salvage Bell',
    sectors: ['sector_kepler_scar'],
    trigger: { type: 'hashDaily', chance: 0.35 },
    channel: 'commsLog',
    payload: {
      from: 'Scar wire',
      text: 'The scar rings a salvage bell for every find — a sound the whole sector times its coffee by. The bell is a broadcast, but the crews answer it in the same order every day, a roll call disguised as superstition. The order was set by a wreck that took the best three crews first. The order never changes.',
    },
  },

  // SPX-E-134 — The Cinder\'s Clock Report.
  {
    id: 'SPX-E-134',
    kind: 'easter-egg',
    title: 'The Cinder\'s Clock Report',
    sectors: ['sector_rhea_cinder'],
    trigger: { type: 'hashDaily', chance: 0.4 },
    channel: 'commsLog',
    payload: {
      from: 'Cinder wire',
      text: 'The cinder station reports its clocks — all twelve of them, none agreeing, each defended by a different shift as the real one. The report is daily theater: the shifts read their clock\'s time and the crews vote on which was most wrong. The losing shift buys the pour. The pour is the real clock.',
    },
  },

  // SPX-E-135 — The Rift\'s Bell Weather.
  {
    id: 'SPX-E-135',
    kind: 'anomaly',
    title: 'The Rift\'s Bell Weather',
    sectors: ['sector_haumea_rift'],
    trigger: { type: 'hashDaily', chance: 0.35 },
    channel: 'commsLog',
    payload: {
      from: 'Rift wire',
      text: 'The rift posts a bell weather report — which of the ice bells rang today, and for how long, the way other sectors post fog warnings. A long ring means the ice is moving; a chorus means move with it. The listeners keep a hymnal of the bells. The hymnal has one page for every season the bells got a chorus wrong.',
    },
  },

  // SPX-E-136 — The Margin\'s Pragmatist.
  {
    id: 'SPX-E-136',
    kind: 'comms-event',
    title: 'The Margin\'s Pragmatist',
    sectors: ['sector_eris_margin'],
    trigger: { type: 'hashDaily', chance: 0.35 },
    channel: 'commsLog',
    payload: {
      from: 'Margin wire',
      text: 'The margin\'s oldest toll keeper reads the day\'s pragmatism report — a column of small adjustments: a booth moved a meter, a fee bent a credit, a rule bent less. The keeper writes it himself and calls it what the margin calls everything honest: the day\'s arithmetic of surviving nicely. The column has run for thirty years. It has never once ended badly.',
    },
  },

  // SPX-E-137 — The Shoal\'s Ice Report.
  {
    id: 'SPX-E-137',
    kind: 'comms-event',
    title: 'The Shoal\'s Ice Report',
    sectors: ['sector_nereid_shoal'],
    trigger: { type: 'hashDaily', chance: 0.4 },
    channel: 'commsLog',
    payload: {
      from: 'Shoal wire',
      text: 'The shoal posts its ice report — drift, thickness, temperament. Temperament is the one the instrument cannot read and the rime-watchers supply from experience: today the ice is patient. The report has called the ice patient every day for a decade. The watchers say it is waiting. The report does not ask for what.',
    },
  },

  // SPX-E-138 — The Wake\'s Science Hour.
  {
    id: 'SPX-E-138',
    kind: 'comms-event',
    title: 'The Wake\'s Science Hour',
    sectors: ['sector_triton_wake'],
    trigger: { type: 'hashDaily', chance: 0.35 },
    channel: 'commsLog',
    payload: {
      from: 'Field lab',
      text: 'The wake\'s field lab does a science hour on the open band — an instrument reading, a hypothesis, and one line of honesty the journals never print: TODAY WE LEARNED NOTHING, BEAUTIFULLY. The lab\'s funding report calls it outreach. The band calls it the best hour in the day and the only honest science in the sector.',
    },
  },

  // SPX-E-139 — The Gulf\'s Logistics Hymn.
  {
    id: 'SPX-E-139',
    kind: 'easter-egg',
    title: 'The Gulf\'s Logistics Hymn',
    sectors: ['sector_eunomia_gulf'],
    trigger: { type: 'hashDaily', chance: 0.35 },
    channel: 'commsLog',
    payload: {
      from: 'Gulf wire',
      text: 'The gulf\'s shipping office reads its logistics hymn — a chant of manifests in transit order that crews treat as liturgy: crate, hull, destination, amen. It is genuinely a scheduling tool. It is also genuinely a hymn, in the sense that everyone in the gulf knows it by heart and it works better sung.',
    },
  },

  // SPX-E-140 — The Dark\'s Bookkeeping.
  {
    id: 'SPX-E-140',
    kind: 'anomaly',
    title: 'The Dark\'s Bookkeeping',
    sectors: ['sector_sedna_dark'],
    trigger: { type: 'hashDaily', chance: 0.35 },
    channel: 'commsLog',
    payload: {
      from: 'Sedna wire',
      text: 'Sedna posts a daily account of the dark — a census of things seen without names: one light too steady to be a star, two wakes without hulls, a shadow that changed its mind. The census is filed, dated, and never resolved. The dark keeps its own books, says the post. Sedna just reads the receipts.',
    },
  },

  // ── sectorEntry: seven arrival lines for the under-covered sectors ────────

  // SPX-E-141 — The March\'s Welcome: a border with no border.
  {
    id: 'SPX-E-141',
    kind: 'comms-event',
    title: 'The March\'s Welcome',
    sectors: ['sector_nyx_march'],
    trigger: { type: 'sectorEntry' },
    channel: 'commsLog',
    payload: {
      from: 'March wire',
      text: 'No border post marks the march — the welcome is a change in the band\'s accent, the chatter going dark and dry the way the march likes it. The first thing you learn here is that the jokes get shorter as the nights get longer. The second thing is that nobody explains the first.',
    },
  },

  // SPX-E-142 — The Cut\'s Posted Terms: hyperion\'s honesty.
  {
    id: 'SPX-E-142',
    kind: 'comms-event',
    title: 'The Cut\'s Posted Terms',
    sectors: ['sector_hyperion_cut'],
    trigger: { type: 'sectorEntry' },
    channel: 'commsLog',
    payload: {
      from: 'Cut wire',
      text: 'The cut posts its terms at the border, painted on a dead gate: TAKE WHAT YOU DIG. PAY FOR WHAT YOU BREAK. LEAVE THE STORIES. The stories are the cut\'s real export — every wreck here gets told before it gets stripped. The gate has been dead sixty years. The terms are enforced anyway.',
    },
  },

  // SPX-E-143 — The Scar\'s Price Board: kepler\'s single number.
  {
    id: 'SPX-E-143',
    kind: 'comms-event',
    title: 'The Scar\'s Price Board',
    sectors: ['sector_kepler_scar'],
    trigger: { type: 'sectorEntry' },
    channel: 'commsLog',
    payload: {
      from: 'Scar wire',
      text: 'The scar greets you with a price board — one number, updated hourly: what the next salvage right goes for. Below it, in chalk that never gets refreshed because it never needs to be: AND WHAT IT COSTS. The chalk is the older board. The number above it has never once equaled it.',
    },
  },

  // SPX-E-144 — The Well\'s Depth Charge: proteus\'s welcome.
  {
    id: 'SPX-E-144',
    kind: 'anomaly',
    title: 'The Well\'s Depth Charge',
    sectors: ['sector_proteus_well'],
    trigger: { type: 'sectorEntry' },
    channel: 'memory',
    payload: {
      text: 'The well reads your hull\'s mass on the way in — a courtesy scan the locals call the depth charge, since the well charges attention by how far it pulls you in. The scan is real; the poetry is the locals\'. Both get logged. The well\'s ledger is the only one that lists your displacement as a fee you already paid.',
    },
  },

  // SPX-E-145 — The Echo\'s Receipt: phoebe\'s answering hush.
  {
    id: 'SPX-E-145',
    kind: 'comms-event',
    title: 'The Echo\'s Receipt',
    sectors: ['sector_phoebe_echo'],
    trigger: { type: 'sectorEntry' },
    channel: 'commsLog',
    payload: {
      from: 'Echo array',
      text: 'The echo sector acknowledges every arrival the same way — a copy of your own transponder handshake, played back on a three-second delay, as if the sector is confirming it heard you right. It is just physics. It is also, the old operators insist, the politest sector on the chart. The three seconds are what make it manners instead of noise.',
    },
  },

  // SPX-E-146 — The Lane\'s Toll Ledger: dione\'s running count.
  {
    id: 'SPX-E-146',
    kind: 'comms-event',
    title: 'The Lane\'s Toll Ledger',
    sectors: ['sector_dione_lane'],
    trigger: { type: 'sectorEntry' },
    channel: 'commsLog',
    payload: {
      from: 'Lane wire',
      text: 'The lane keeps a running toll ledger on the open band — every hull that has paid, in order, going back to the first year of the first booth. Your name enters at the bottom. The lane\'s welcome is that the ledger is real, public, and proud: out here, a receipt is the closest thing to a door being held open.',
    },
  },

  // SPX-E-147 — The Bolus\'s Rib Watch: the slowest border.
  {
    id: 'SPX-E-147',
    kind: 'comms-event',
    title: 'The Bolus\'s Rib Watch',
    sectors: ['sector_the_bolus'],
    trigger: { type: 'sectorEntry' },
    channel: 'commsLog',
    payload: {
      from: 'Rib watch',
      text: 'The bolus greets traffic from the rib watch — a skeleton watchtower, literal, built into a rib of the wreck the sector is named for. The watchers log arrivals in a hand-bound book because the tower has no transmitter worth the name. The book is the only record of the bolus\'s border, and it has never once been wrong.',
    },
  },

  // ── simWindow: three early-life beats ─────────────────────────────────────

  // SPX-E-148 — The First Week\'s Form: the registry notices you exist.
  {
    id: 'SPX-E-148',
    kind: 'comms-event',
    title: 'The First Week\'s Form',
    sectors: [],
    trigger: { type: 'simWindow', startS: 600, endS: 1200 },
    channel: 'comms',
    payload: {
      from: 'Registry desk',
      text: 'NEW ENTITY ACKNOWLEDGED: the registry has opened a file in your name. It contains one document — the form you filled when you arrived — and it has already been misfiled once and found again. The registry apologizes for the error and notes, correctly, that this is how every file begins.',
      ttl: 9,
    },
  },

  // SPX-E-149 — The Seasoned Hull Notice: one hour in, the desk upgrades you.
  {
    id: 'SPX-E-149',
    kind: 'comms-event',
    title: 'The Seasoned Hull Notice',
    sectors: [],
    trigger: { type: 'simWindow', startS: 3600, endS: 5400 },
    channel: 'commsLog',
    payload: {
      from: 'Desk wire',
      text: 'An hour out and the desk quietly re-rates you — the harbor\'s board moves your hull from NEW to PRESENT, the smallest possible promotion and the only one the harbor gives for free. The new-hull column still shows your name crossed out. It is crossed out in the harbor\'s politest ink.',
    },
  },

  // SPX-E-150 — The Third Hour Audit: the desk\'s first real look.
  {
    id: 'SPX-E-150',
    kind: 'easter-egg',
    title: 'The Third Hour Audit',
    sectors: [],
    trigger: { type: 'simWindow', startS: 9000, endS: 10800 },
    channel: 'comms',
    payload: {
      from: 'Registry desk',
      text: 'ROUTINE REVIEW COMPLETE: your file has been audited — fuel logs, dockings, the incident you have not told anyone about, which the file describes charitably as a mooring event. The audit passes you with one note: ENTITY LEGIBLE. It is the nicest thing the registry says about anybody.',
      ttl: 9,
    },
  },
];
