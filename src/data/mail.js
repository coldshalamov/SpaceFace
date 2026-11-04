// mail.js — PULSE-MAIL (build_map row 435).
//
// The pilot's mailbox: cast letters, job offers, spam in the house voice, fan and hate mail
// after feats, bills, and letters meant for Captain Maera Vols's lost crew — 130+ authored
// letters, every one gated by a real event or a deterministic time window. Nothing here
// arrives untriggered: the mail system (src/systems/mail.js) only delivers a letter when
// EVERY entry in `triggers` holds against live state or a bus event it actually witnessed.
//
// Trigger vocabulary (each object is one conjunct; all must hold):
//   { type: 'event',   name: '<bus event>', match?: { field: value | { gte } } }
//                     a bus event the system witnessed (see MAIL_EVENT_NAMES)
//   { type: 'day',     at: n }               day index (simTime / DAY_S) >= n
//   { type: 'window',  fromDay: a, toDay: b }day index inside [a, b] inclusive
//   { type: 'beat',    at: n }               story.beatIndex >= n
//   { type: 'stat',    stat: '<player.stats key>', gte: n }
//   { type: 'deed',    kind: '<deed kind>' } the deed Record already holds one
//   { type: 'rep',     faction: '<faction id>', gte: n }
//   { type: 'heat',    gte: n }              player.heat >= n
//   { type: 'flag',    flag: '<story flag>' }story.flags[flag] truthy
//   { type: 'cargo',   commodity: '<cmdty id>', gte?: n }
//   { type: 'docked',  station: '<station id>' }
//   { type: 'ship',    ship: '<ship id>' }   an owned hull
//   { type: 'ownedShips', gte: n }          owned hull count >= n (second hull onward)
//   { type: 'credits', gte: n }
//
// Pure data: stable `mail_*` ids, authored text, deterministic trigger lists. No state reads,
// no RNG — the evaluator lives in the system.

export const MAIL_DAY_S = 600;

/** Bus events the mail system subscribes to — every event trigger below names one of these. */
export const MAIL_EVENT_NAMES = Object.freeze([
  'dock:docked',
  'jump:arrive',
  'economy:tradeCompleted',
  'service:completed',
  'law:fineAssessed',
  'law:killedAdjudicated',
  'entity:killed',
  'heat:changed',
  'warrant:hunterDisabled',
  'warrant:hunterEscaped',
  'warrant:hunterOffer',
  'mission:completed',
  'craft:complete',
  'ship:purchased',
  'player:death',
  'economy:debtEscalated',
  'contract:clauseHonored',
  'contract:clauseBroken',
  'automation:assetLost',
  'automation:assetDistressed',
  'fuel:empty',
  'poi:identified',
  'signal:surveyFiled',
  'encounter:resolved',
  'economy:eventStarted',
]);

export const MAIL_KINDS = Object.freeze(['cast', 'job', 'spam', 'fan', 'hate', 'bill', 'crew']);

const E = (name, match) => ({ type: 'event', name, ...(match ? { match } : {}) });
const DAY = (at) => ({ type: 'day', at });
const WINDOW = (fromDay, toDay) => ({ type: 'window', fromDay, toDay });
const BEAT = (at) => ({ type: 'beat', at });
const STAT = (stat, gte) => ({ type: 'stat', stat, gte });
const DEED = (kind) => ({ type: 'deed', kind });
const REP = (faction, gte) => ({ type: 'rep', faction, gte });
const HEAT = (gte) => ({ type: 'heat', gte });
const FLAG = (flag) => ({ type: 'flag', flag });
const CARGO = (commodity, gte) => ({ type: 'cargo', commodity, ...(gte ? { gte } : {}) });
const DOCKED = (station) => ({ type: 'docked', station });
const SHIP = (ship) => ({ type: 'ship', ship });
const OWNSHIPS = (gte) => ({ type: 'ownedShips', gte });
const CREDITS = (gte) => ({ type: 'credits', gte });

export const MAIL_LETTERS = Object.freeze([
  // ── CAST — letters from the named figures (26 of them) ─────────────────────────────
  {
    id: 'mail_kael_01', kind: 'cast', from: 'Kael',
    subject: 'You still owe me a drink',
    body: 'Six months in the colony, and the first thing I hear is your transponder back on the board. Berth-side, first bell. You are buying because you can afford to now.',
    triggers: [DAY(2)],
  },
  {
    id: 'mail_kael_02', kind: 'cast', from: 'Kael',
    subject: 'Do not take the quiet contracts',
    body: 'A manifest with blank pages is a blank check on your hull. If Quinn offers you the unlisted run, ask her who insured the last pilot. Then order something expensive.',
    triggers: [BEAT(1), E('dock:docked')],
  },
  {
    id: 'mail_kael_03', kind: 'cast', from: 'Kael',
    subject: 'Saw your name on a wire',
    body: 'The wire said a hull made noise at the rings and I knew the pilot before I read the callsign. Keep it loud enough to hear and quiet enough to bill.',
    triggers: [DEED('ore_flood')],
  },
  {
    id: 'mail_kessler_01', kind: 'cast', from: 'Kessler',
    subject: 'Weight variance, routine',
    body: 'Your last manifest cleared. The variance on line four was within tolerance this time. This is not a favor; it is a note that I noticed.',
    triggers: [E('economy:tradeCompleted', { side: 'sell' }), STAT('tradesCount', 4)],
  },
  {
    id: 'mail_hale_01', kind: 'cast', from: 'Hale',
    subject: 'REF 44-C',
    body: 'The inspection fee you paid generated a second filing. That is how Gate 3 says hello. Your record currently says "no flags." Keep it that way; the alternative is my Tuesday.',
    triggers: [E('law:fineAssessed')],
  },
  {
    id: 'mail_slate_01', kind: 'cast', from: 'Slate',
    subject: 'Your welds',
    body: 'I signed the plate because it held. If it opens at a seam, it opens on my signature, and I will find you before the vacuum does. Bring it back before the next long burn.',
    triggers: [E('service:completed', { type: 'repair' })],
  },
  {
    id: 'mail_quinn_01', kind: 'cast', from: 'Quinn',
    subject: 'Same rates',
    body: 'The bar is under new management, same rates, no questions. Your stool is the third one. It remembers your tab better than the ledger does.',
    triggers: [DAY(3)],
  },
  {
    id: 'mail_quinn_02', kind: 'cast', from: 'Quinn',
    subject: 'A thing left at the bar',
    body: 'Someone left a chip marked TESSERA under the rail. I did not read it. House policy: I read everything. Bring coin.',
    triggers: [FLAG('volsEchoUnlocked'), DAY(5)],
  },
  {
    id: 'mail_voss_01', kind: 'cast', from: 'Voss',
    subject: 'The drift claim you filed',
    body: 'Your claim posted clean, which means somebody else filed the same rock tired. Second claim wins. I did not write the rule, I only charge for reading it.',
    triggers: [STAT('tradesCount', 8), DAY(4)],
  },
  {
    id: 'mail_vale_01', kind: 'cast', from: 'Office of Director Vale',
    subject: 'Courtesy notice',
    body: 'The Directorate observes your throughput with professional interest. Continued compliance is the cheapest form of privacy currently offered. No reply is required or read.',
    triggers: [BEAT(4), DAY(8)],
  },
  {
    id: 'mail_elroy_01', kind: 'cast', from: 'Elroy',
    subject: 'You saw the recycler report',
    body: 'Then you saw what they wrote me as. I fixed the recycler. The report fixed me. Thanks for not shooting.',
    triggers: [BEAT(2), DAY(5)],
  },
  {
    id: 'mail_mira_01', kind: 'cast', from: 'Mira',
    subject: 'Seals match',
    body: 'Your freight seals verified on the first pass. Do you know how rare that is? The database agreed with the cargo and nobody had to die about it. Keep your paperwork honest.',
    triggers: [STAT('tradesCount', 12), DAY(6)],
  },
  {
    id: 'mail_rook_01', kind: 'cast', from: 'Rook',
    subject: 'A professional courtesy',
    body: 'Word is a warrant was priced on your hull and you priced it back down. When you need the same service from the other side, my booth knows your silhouette.',
    triggers: [E('warrant:hunterDisabled')],
  },
  {
    id: 'mail_kurtz_01', kind: 'cast', from: 'The Ashfall Desk',
    subject: 'The ledger kept running',
    body: 'You walked the station and the station noticed. That is all the letter says. It has been waiting longer than you have been flying.',
    triggers: [E('jump:arrive', { sectorId: 'sector_ashfall_reach' }), BEAT(6)],
  },
  {
    id: 'mail_yune_01', kind: 'cast', from: 'Clerk Yune',
    subject: 'Sealed evidence, sealed lips',
    body: 'The file you asked about exists in the sealed collection. Existence is free. The collection is not. Bring a clearance or a reason that weighs the same.',
    triggers: [BEAT(3), DAY(6)],
  },
  {
    id: 'mail_rey_01', kind: 'cast', from: '"Coldburn" Rey',
    subject: 'Your lane etiquette',
    body: 'You run the corridor like you own a share of it. You do not. But you run it like someone who might someday, and that is worth a wave instead of a warning.',
    triggers: [STAT('tradesCount', 16), DAY(8)],
  },
  {
    id: 'mail_suhl_01', kind: 'cast', from: 'Dr. Iren Suhl',
    subject: 'What your scanner heard',
    body: 'The fauna calls you logged are not noise. Every signature you filed is a sentence the field had never finished. Come argue about what they mean when the archive opens.',
    triggers: [E('signal:surveyFiled')],
  },
  {
    id: 'mail_orrin_01', kind: 'cast', from: 'Warrant Orrin',
    subject: 'For the record',
    body: 'You were told the case is testimony. It is. So is this letter. When they ask who corroborated, the answer is already filed under your name.',
    triggers: [FLAG('orrinPathOpen'), DAY(10)],
  },
  {
    id: 'mail_vane_01', kind: 'cast', from: 'Boss Sker Vane',
    subject: 'Lane tolls',
    body: 'You fly through my reach without paying the toll. The toll is not money yet. It is that I now know your silhouette. Deliver to me before I collect in kind.',
    triggers: [HEAT(0.35), E('heat:changed')],
  },
  {
    id: 'mail_senna_01', kind: 'cast', from: '"Dustwife" Senna',
    subject: 'The wreck remembers',
    body: 'I keep the names of the ships that do not come back. Yours keeps getting written and keeps being wrong. The wrecks do not mind being wrong. I do. Fly home sometime.',
    triggers: [DEED('pod_rescued')],
  },
  {
    id: 'mail_latch_01', kind: 'cast', from: 'Latch-Child',
    subject: 'kzzt. hull. yours?',
    body: 'found metal. warm metal. you flew close and the old parts woke. latch-child keeps what latch-child finds. come take it or leave it warm.',
    triggers: [BEAT(3), DAY(6)],
  },
  {
    id: 'mail_question_01', kind: 'cast', from: 'The Question',
    subject: 'Why do you fly?',
    body: 'Every answer you gave someone else is on file somewhere. The question remains open because none of them matched. Answer when the answer changes.',
    triggers: [DAY(9)],
  },
  {
    id: 'mail_dorin_01', kind: 'cast', from: '"Filecleaver" Dorin',
    subject: 'Seal logs',
    body: 'I broke open the seal log because somebody had to. Your name is on a clean page in a dirty book. Guard the page; the book does not get cleaner.',
    triggers: [BEAT(4), DAY(7)],
  },
  {
    id: 'mail_vonn_01', kind: 'cast', from: 'Lira Vonn',
    subject: 'On the record, off the wire',
    body: 'I am the correspondent your wire calls "local" when it wants to sound harmless. A story is forming around your hull. I would rather hear it from the hull.',
    triggers: [DEED('kill_outlaw'), STAT('kills', 3)],
  },
  {
    id: 'mail_zell_01', kind: 'cast', from: 'Tinker Zell',
    subject: 'That thing you bought',
    body: 'Whatever you paid for the secondhand rig, it was worth it if it works and a lesson if it does not. Bring it by the stall when it does not. First look is free-ish.',
    triggers: [E('ship:purchased')],
  },
  {
    id: 'mail_mara_01', kind: 'cast', from: 'Mara',
    subject: 'We saw the lights',
    body: 'The children asked why a ship stopped. I said sometimes the world stops for you. They made me write it down. Thank you for stopping.',
    triggers: [DEED('pod_rescued')],
  },
  {
    id: 'mail_kell_01', kind: 'cast', from: '"Wraith" Kell',
    subject: 'Your manifest, page nine',
    body: 'Nothing is on page nine. That is the problem. Page nine is where the cargo you did not buy gets listed. Check your holds. Then decide who to bill.',
    triggers: [FLAG('manifestPageNine'), DAY(8)],
  },
  {
    id: 'mail_doss_01', kind: 'cast', from: 'Prof. Halev Doss',
    subject: 'The archive grows teeth',
    body: 'Every deed you file in the Record is a page the university did not have to invent. History thanks you in advance for the citations and apologizes for the footnotes.',
    triggers: [DEED('pod_rescued'), BEAT(2)],
  },

  // ── JOB — offers that arrive because something real happened ───────────────────────
  {
    id: 'mail_job_mts_01', kind: 'job', from: 'MTS Freight Desk',
    subject: 'Standing route offer',
    body: 'Your last three deliveries cleared without a seal flag. Meridian runs a standing route on this corridor — honest freight, boring money, on the books. Ask at the desk.',
    triggers: [STAT('tradesCount', 6), E('economy:tradeCompleted')],
  },
  {
    id: 'mail_job_mts_02', kind: 'job', from: 'MTS Bond Office',
    subject: 'Bonded pilot wanted',
    body: 'We insure pilots who finish. Your completion record qualifies you for bonded work — the runs that pay for the risk, priced in writing.',
    triggers: [STAT('missionsDone', 4), E('mission:completed')],
  },
  {
    id: 'mail_job_dmc_01', kind: 'job', from: 'DMC Survey Board',
    subject: 'Breaker wanted',
    body: 'The belt needs a hull that can crack a claim and not crack the crew. Your name came off the ore-flood wire with the right adjectives. Claim office, second bell.',
    triggers: [DEED('ore_flood')],
  },
  {
    id: 'mail_job_dmc_02', kind: 'job', from: 'DMC Tally Desk',
    subject: 'Convoy escort, paid in ore',
    body: 'Our haulers run light on guns and heavy on cargo. Your silhouette would look good on their flank. Escort terms posted at the claim office.',
    triggers: [DEED('kill_outlaw'), STAT('kills', 2)],
  },
  {
    id: 'mail_job_scn_01', kind: 'job', from: 'Concord Recruiting',
    subject: 'Auxiliary patrol consideration',
    body: 'The Navy notes pilots who answer distress without a contract. Auxiliary patrol work is not glory. It is fuel, clearance, and a uniform the law reads twice.',
    triggers: [DEED('pod_rescued')],
  },
  {
    id: 'mail_job_scn_02', kind: 'job', from: 'Concord Customs Desk',
    subject: 'Bounty license invitation',
    body: 'Your record shows you can end a fight you did not start. Licensed bounty work pays in warrants, not promises. Registry desk, third window.',
    triggers: [E('law:killedAdjudicated')],
  },
  {
    id: 'mail_job_quiet_01', kind: 'job', from: 'A Quiet Courier',
    subject: 'Manifest-blank courier work',
    body: 'You keep a sealed hold sealed. That is the whole skill. Runs pay triple, questions pay nothing, and you will never learn our name twice.',
    triggers: [CARGO('cmdty_narcotics'), E('dock:docked')],
  },
  {
    id: 'mail_job_quiet_02', kind: 'job', from: 'A Quiet Courier',
    subject: 'Your heat is a resume',
    body: 'Most pilots hide a warrant. You survived one. There is work for a hull that can carry a price on its nose without blinking. The booth knows the silhouette.',
    triggers: [HEAT(0.5), E('heat:changed')],
  },
  {
    id: 'mail_job_reach_01', kind: 'job', from: 'Crimson Reach Toll Desk',
    subject: 'Collector wanted',
    body: 'The Reach pays pilots who make debtors honest. Your record says you can stand in a lane and be believed. Collect for us and the tolls reverse.',
    triggers: [DEED('kill_lawful'), HEAT(0.2)],
  },
  {
    id: 'mail_job_archive_01', kind: 'job', from: 'The Archive',
    subject: 'Field contributor wanted',
    body: 'Your survey filings are unusually complete. The Archive pays for charted edges — POIs verified, wrecks identified, rumors confirmed or buried in writing.',
    triggers: [E('poi:identified'), E('signal:surveyFiled')],
  },
  {
    id: 'mail_job_free_01', kind: 'job', from: 'Free Frontier Dispatch',
    subject: 'Frontier runner wanted',
    body: 'The frontier needs pilots who answer a mayday without asking which flag. Your record says you did exactly that. Paid in fuel, favor, and honest trouble.',
    triggers: [DEED('pod_rescued'), REP('faction_free', 5)],
  },
  {
    id: 'mail_job_helix_01', kind: 'job', from: 'Helix Directorate',
    subject: 'Measurement contract',
    body: 'Your flight telemetry is an outlier the Directorate wishes to study. A measurement contract pays for unmodified flight data. The hull stays yours. The data becomes ours.',
    triggers: [STAT('kills', 8), DAY(9)],
  },
  {
    id: 'mail_job_vael_01', kind: 'job', from: 'Vael Tide-Office',
    subject: 'Deep-current runner',
    body: 'The tide takes hulls that fight it and carries hulls that read it. Your record reads like someone who reads. There is freight that only moves in the deep current.',
    triggers: [E('jump:arrive', { sectorId: 'sector_veil_nebula' })],
  },
  {
    id: 'mail_job_choir_01', kind: 'job', from: 'Choir Supply Clerk',
    subject: 'Provision runs for the vigil',
    body: 'The vigil needs lamp oil and honest hauling. It is not glamorous and the pay is in the Choir\'s own coin, which spends better than it sounds.',
    triggers: [DAY(5), REP('faction_choir', 0)],
  },
  {
    id: 'mail_job_fence_01', kind: 'job', from: 'Berth Fence',
    subject: 'A set-up job, politely offered',
    body: 'There is a run that pays what a run should never pay. You have the hull for it. Whether you have the exit is a separate invoice.',
    triggers: [HEAT(0.15), DAY(4)],
  },
  {
    id: 'mail_job_understory_01', kind: 'job', from: 'The Understory',
    subject: 'Below-deck courier',
    body: 'Some freight rides the lifts, not the lanes. You have been below a floor before and come back. There is steady work for a hull that remembers the stairs.',
    triggers: [E('dock:docked', { stationId: 'station_ashcache' })],
  },
  {
    id: 'mail_job_verge_01', kind: 'job', from: 'Verge-Layer Dispatch',
    subject: 'Gate-key courier',
    body: 'Certain doors open for the right cargo and no other. You carry the right silhouette. The pay is in routes the charts have not earned yet.',
    triggers: [BEAT(5), DAY(9)],
  },
  {
    id: 'mail_job_pitborn_01', kind: 'job', from: 'Pitborn Steward',
    subject: 'Pit work, honest weight',
    body: 'The pit remembers pilots who did not look down on it. There is salvage only the Pitborn will let you touch. Terms are plain and so is the danger.',
    triggers: [E('jump:arrive', { sectorId: 'sector_ashfall_reach' })],
  },
  {
    id: 'mail_job_fulfillment_01', kind: 'job', from: 'Fulfillment Dispatch',
    subject: 'A crate needs a hero',
    body: 'Somewhere out there is a crate marked DO NOT FAIL. It is a large crate. The fee is proportionate. We provide the crate; you provide the not-failing.',
    triggers: [STAT('missionsDone', 6), E('mission:completed')],
  },
  {
    id: 'mail_job_insurance_01', kind: 'job', from: 'Concord Mutual Adjustments',
    subject: 'Loss-assessment pilot',
    body: 'We pay pilots to reach wrecks before the seagulls do — honest salvage assessment, photographed and filed. Your survival rate is the qualification.',
    triggers: [E('entity:killed'), STAT('kills', 1)],
  },

  // ── SPAM — junk mail in the house voice ─────────────────────────────────────────────
  {
    id: 'mail_spam_01', kind: 'spam', from: 'Meridian Futures (Automated)',
    subject: 'YOUR ORE HAS A POSITION',
    body: 'It is underperforming. Enroll in ore futures and let the market explain why this was inevitable. Terms apply. Terms always apply.',
    triggers: [DAY(2)],
  },
  {
    id: 'mail_spam_02', kind: 'spam', from: 'Concord Wellness Board',
    subject: 'OXYGEN AUDIT REMINDER',
    body: 'Your breathing pattern suggests unregistered calm. Schedule an assessment before it becomes a habit we cannot bill.',
    triggers: [DAY(4)],
  },
  {
    id: 'mail_spam_03', kind: 'spam', from: 'Heirs of Sedna',
    subject: 'A FORTUNE IN FROZEN CREDITS',
    body: 'Esteemed pilot: a crate of pre-collapse currency awaits a hull of your discretion. Small release fee required. Regards, a Prince of Sedna Dark.',
    triggers: [DAY(3)],
  },
  {
    id: 'mail_spam_04', kind: 'spam', from: 'Hull Warranty Desk',
    subject: 'EXTENDED WARRANTY EXPIRES YESTERDAY',
    body: 'Our records show your hull exists. Coverage for existence is available for a limited eternity. Act now; regret later in writing.',
    triggers: [E('ship:purchased')],
  },
  {
    id: 'mail_spam_05', kind: 'spam', from: 'Choir Outreach (Bulk)',
    subject: 'YOU ARE ALREADY SINGING',
    body: 'You just have not heard your note yet. The Choir hears everything. First vigil is complimentary; tithes are the second verse.',
    triggers: [DAY(6)],
  },
  {
    id: 'mail_spam_06', kind: 'spam', from: 'DMC Motivational Desk',
    subject: 'THE SHAFT MISSES YOU',
    body: 'Statistically, so does someone. Return to the belt and receive a complimentary tally mark. Collect ten for a badge that means nothing but says plenty.',
    triggers: [DAY(5)],
  },
  {
    id: 'mail_spam_07', kind: 'spam', from: 'Verge Wellness Cooperative',
    subject: 'YOUR GATE ANXIETY IS VALID',
    body: 'And it is billable. Attend one session and learn to fear the machinery professionally. Group rates for crew; the hull attends free.',
    triggers: [E('jump:arrive'), DAY(7)],
  },
  {
    id: 'mail_spam_08', kind: 'spam', from: 'Meridian Identity Bureau',
    subject: 'IS YOUR NAME WORKING FOR YOU?',
    body: 'Trademark your callsign before someone braver does. Filing fee today, royalties never, peace of mind pending.',
    triggers: [STAT('tradesCount', 10), DAY(11)],
  },
  {
    id: 'mail_spam_09', kind: 'spam', from: 'Helios Premium Docking',
    subject: 'BERTH IN STYLE',
    body: 'Our premium berths offer ambient lighting, a wider berth cushion, and a concierge who says your name correctly the first time. Book now.',
    triggers: [E('dock:docked', { stationId: 'station_helios' })],
  },
  {
    id: 'mail_spam_10', kind: 'spam', from: 'Unclaimed Cargo Syndicate',
    subject: 'CRATES WANT OWNERS',
    body: 'A warehouse of orphaned freight seeks loving pilots. Slight water damage. Slight legal damage. Adopt today.',
    triggers: [DAY(8)],
  },
  {
    id: 'mail_spam_11', kind: 'spam', from: 'The Fulfillment (Marketing)',
    subject: 'EVERYTHING, DELIVERED',
    body: 'If it exists, we ship it. If it does not exist, we ship the apology. Now hiring and selling, interchangeable verbs.',
    triggers: [DAY(10)],
  },
  {
    id: 'mail_spam_12', kind: 'spam', from: 'A Totally Real Notary',
    subject: 'NOTARIZE YOUR SOUL',
    body: 'In this economy a witnessed signature on your soul is the only hedge that appreciates. Limited slots per hull.',
    triggers: [WINDOW(6, 14)],
  },
  {
    id: 'mail_spam_13', kind: 'spam', from: 'Pitborn Heritage Tours',
    subject: 'SEE THE PIT SAFELY',
    body: 'From a distance. Behind glass. Your ticket includes one complimentary retelling of the collapse, told with feeling.',
    triggers: [E('jump:arrive', { sectorId: 'sector_ashfall_reach' })],
  },
  {
    id: 'mail_spam_14', kind: 'spam', from: 'Belt Weather Authority',
    subject: 'SUBSCRIBE TO FORECASTS',
    body: 'Know which rocks will be rocks before you arrive. Premium tier tells you which rocks are lying.',
    triggers: [DAY(12)],
  },
  {
    id: 'mail_spam_15', kind: 'spam', from: 'Concord Bureau of Notifications',
    subject: 'YOU HAVE BEEN NOTIFIED',
    body: 'This notification fulfills all legal obligations of notification. Further notifications will be billed at the notifying rate.',
    triggers: [DAY(15)],
  },
  {
    id: 'mail_spam_16', kind: 'spam', from: 'Quiet Courier Recruitment',
    subject: 'EARN CREDITS FOR SAYING NOTHING',
    body: 'You already do it. Get paid for it. Interview process is entirely non-verbal. Bring a hold.',
    triggers: [HEAT(0.1), WINDOW(9, 30)],
  },
  {
    id: 'mail_spam_17', kind: 'spam', from: 'Archive Donations Desk',
    subject: 'DONATE YOUR OLD LOGS',
    body: 'Your flight logs are history the moment you make them. The Archive accepts all records, flattering or otherwise. Especially otherwise.',
    triggers: [STAT('missionsDone', 3), DAY(13)],
  },
  {
    id: 'mail_spam_18', kind: 'spam', from: 'Free Frontier Matchmaking',
    subject: 'LONELY LANES?',
    body: 'Meet other independent pilots for low-stakes escort arrangements and shared toll-dodging. Frontier rates apply.',
    triggers: [DAY(18)],
  },
  {
    id: 'mail_spam_19', kind: 'spam', from: 'Halev Doss Alumni Fund',
    subject: 'GIVE BACK TO THE ARCHIVE THAT GAVE YOU DEBT',
    body: 'Your tuition built a wing. Your donations could name a shelf. Every shelf is a small immortality.',
    triggers: [WINDOW(20, 30)],
  },
  {
    id: 'mail_spam_20', kind: 'spam', from: 'Wraith Insurance (Probably Real)',
    subject: 'GHOST HULL INSURANCE',
    body: 'If your hull comes back wrong, we pay out. Payout is in candles. Candles are redeemable nowhere but burn beautifully.',
    triggers: [DEED('pod_abandoned')],
  },

  // ── FAN — letters that arrive because the Record says you did something loud ───────
  {
    id: 'mail_fan_01', kind: 'fan', from: 'A belt crew',
    subject: 'You cleared the lane',
    body: 'We ran the corridor with our lights on for the first time in months. Nobody had to file a report about us. That is the whole letter.',
    triggers: [DEED('kill_outlaw'), STAT('kills', 2)],
  },
  {
    id: 'mail_fan_02', kind: 'fan', from: 'A hauler skipper',
    subject: 'The pod you towed in',
    body: 'I knew the crew. The company would have let them drift and called it variance. You turned around. The belt talks about who turns around.',
    triggers: [DEED('pod_rescued')],
  },
  {
    id: 'mail_fan_03', kind: 'fan', from: 'A Concord rating',
    subject: 'Off the record',
    body: 'The official line is the Navy handles outlaws. The unofficial truth is a civilian hull did it faster. Keep the second part quiet; the first part keep doing.',
    triggers: [DEED('kill_outlaw'), REP('faction_scn', 10)],
  },
  {
    id: 'mail_fan_04', kind: 'fan', from: 'Quinn\'s bar',
    subject: 'Round on the house',
    body: 'A dozen pilots stood when your name came up. Management denies authorizing the standing. First round is on the house until further notice.',
    triggers: [DEED('base_destroyed')],
  },
  {
    id: 'mail_fan_05', kind: 'fan', from: 'A mining family',
    subject: 'Thank you',
    body: 'You pulled our father\'s pod out of the dark. He is bad at letters. We are not. There is a plate of something warm under the counter whenever you dock.',
    triggers: [DEED('pod_rescued'), DAY(4)],
  },
  {
    id: 'mail_fan_06', kind: 'fan', from: 'A Verge-Layer',
    subject: 'The gate opened for you',
    body: 'We watched. The machines do not open for most. Whatever the gate read in your silhouette, keep carrying it.',
    triggers: [E('encounter:resolved'), BEAT(5)],
  },
  {
    id: 'mail_fan_07', kind: 'fan', from: 'A junior trader',
    subject: 'Your fills moved the book',
    body: 'Your last sale broke a shortage the syndicate was milking. Half the desk bought you a drink in spirit. The other half filed a complaint about fairness. We prefer the first half.',
    triggers: [E('economy:tradeCompleted', { side: 'sell' }), STAT('tradesCount', 15)],
  },
  {
    id: 'mail_fan_08', kind: 'fan', from: 'An old captain',
    subject: 'You fly like her',
    body: 'I flew with Vols, once. The way you take a lane — the drift, the patience, the sudden violence when it is owed — it reads like her flight book. Do not tell anyone I said so.',
    triggers: [DEED('kill_outlaw'), BEAT(5)],
  },
  {
    id: 'mail_fan_09', kind: 'fan', from: 'A rescued witness',
    subject: 'I watched you fight',
    body: 'The raider had us cold and you turned into its approach like it owed you money. I owe you my hull. This letter is the deposit.',
    triggers: [E('law:killedAdjudicated')],
  },
  {
    id: 'mail_fan_10', kind: 'fan', from: 'A dockhand',
    subject: 'We heard what you did',
    body: 'Word travels the gantries faster than the wire. The crew that loaded your hold this morning worked careful because they figured a pilot like you notices.',
    triggers: [DEED('base_destroyed'), STAT('kills', 6)],
  },
  {
    id: 'mail_fan_11', kind: 'fan', from: 'A Choir novice',
    subject: 'Your note',
    body: 'They say every hull has a note. Yours rang at the vigil last night — something resolved, something owed. The Choir thanks you for the verse.',
    triggers: [DEED('pod_rescued'), REP('faction_choir', 3)],
  },
  {
    id: 'mail_fan_12', kind: 'fan', from: 'A smuggler (friendly)',
    subject: 'Respect where due',
    body: 'You ran a load past the checkpoint clean enough that the checkpoint is still wondering. The den noticed. The den approves. The den denies both.',
    triggers: [CARGO('cmdty_narcotics'), E('dock:docked')],
  },
  {
    id: 'mail_fan_13', kind: 'fan', from: 'The Question',
    subject: 'An answer, filed',
    body: 'You asked once why anyone stays. Your Record is the answer some of us give now. It is not eloquent. It is evidence.',
    triggers: [DEED('pod_rescued'), DEED('kill_outlaw')],
  },
  {
    id: 'mail_fan_14', kind: 'fan', from: 'A new pilot',
    subject: 'You made it look possible',
    body: 'First license, first hull, first terror. Then I watched you dock through a storm front like the wind was an employee. Whatever you are doing, it looks survivable.',
    triggers: [E('jump:arrive'), STAT('missionsDone', 2)],
  },
  {
    id: 'mail_fan_15', kind: 'fan', from: 'Meridian desk (unofficial)',
    subject: 'The route rumor',
    body: 'They are saying the corridor is safe enough to raise rates on. That is the highest compliment freight knows. Do not let them charge you for the compliment.',
    triggers: [DEED('kill_outlaw'), STAT('tradesCount', 12)],
  },

  // ── HATE — letters that arrive because the same Record is loud ────────────────────
  {
    id: 'mail_hate_01', kind: 'hate', from: 'A Concord deck officer',
    subject: 'Collateral',
    body: 'Your base run left a debris field where a posting used to be. The posting had people in it. The paperwork is finished. I am not.',
    triggers: [DEED('base_destroyed')],
  },
  {
    id: 'mail_hate_02', kind: 'hate', from: 'A raider\'s brother',
    subject: 'You know what you did',
    body: 'The wreck you left had a name and a crew roster longer than yours. The Reach does not file grievances. The Reach keeps lists.',
    triggers: [DEED('kill_outlaw'), STAT('kills', 4)],
  },
  {
    id: 'mail_hate_03', kind: 'hate', from: 'A DMC foreman',
    subject: 'Your ore flood',
    body: 'You cracked that rock and our contracts collapsed under the surplus. Fifty crews ate your payday for a week. The tally remembers whose shot did it.',
    triggers: [DEED('ore_flood')],
  },
  {
    id: 'mail_hate_04', kind: 'hate', from: 'Customs Inspector Hale',
    subject: 'Your last inspection',
    body: 'I am required to inform you that your file has gained a page. It is not a kind page. Further pages are available at market rates.',
    triggers: [HEAT(0.4), E('heat:changed')],
  },
  {
    id: 'mail_hate_05', kind: 'hate', from: 'A pod\'s family',
    subject: 'You flew on',
    body: 'The beacon was on your scope. Your log says you heard it. We buried a box with a name on it and the name should have been yours.',
    triggers: [DEED('pod_abandoned')],
  },
  {
    id: 'mail_hate_06', kind: 'hate', from: 'MTS Loss Desk',
    subject: 'Freight variance: negative',
    body: 'Your "salvage" of a Meridian consignment has been reconciled as theft with good lighting. The invoice follows. The warrant follows the invoice.',
    triggers: [DEED('kill_lawful')],
  },
  {
    id: 'mail_hate_07', kind: 'hate', from: 'A Quiet courier',
    subject: 'You burned a fence',
    body: 'The job you walked out of was a test with a body count. You passed. That is worse. The Quiet does not threaten; it deprioritizes.',
    triggers: [DEED('fence_burned')],
  },
  {
    id: 'mail_hate_08', kind: 'hate', from: 'Concord Registry',
    subject: 'Conduct unbecoming a hull',
    body: 'Your silhouette appears in three incident reports and one ballad. Only one of those is admissible. Guess which concerns us.',
    triggers: [DEED('kill_lawful'), HEAT(0.3)],
  },
  {
    id: 'mail_hate_09', kind: 'hate', from: 'A rival pilot',
    subject: 'My route',
    body: 'The corridor you have been cleaning up was my income. I had contracts. Now I have a grudge and your callsign memorized.',
    triggers: [DEED('kill_outlaw'), STAT('tradesCount', 10)],
  },
  {
    id: 'mail_hate_10', kind: 'hate', from: 'The Reach',
    subject: 'Toll notice',
    body: 'You took one of ours. Tolls are now doubled on your silhouette until the ledger balances or you do. Both are acceptable.',
    triggers: [DEED('kill_outlaw'), HEAT(0.45)],
  },
  {
    id: 'mail_hate_11', kind: 'hate', from: 'Warrant desk',
    subject: 'Hunter report',
    body: 'You disabled a licensed hunter. The license survives. The grudge is filed under your name and accrues like interest.',
    triggers: [E('warrant:hunterDisabled')],
  },
  {
    id: 'mail_hate_12', kind: 'hate', from: 'A station crew',
    subject: 'Your dock slam',
    body: 'Berth four\'s ring still lists. The repair crew worked a double. Your insurance covered the plate, not the people under it. Fly a straighter approach.',
    triggers: [DEED('dock_slam')],
  },
  {
    id: 'mail_hate_13', kind: 'hate', from: 'A Vael tidekeeper',
    subject: 'You dragged a hauler',
    body: 'A hauler on its lane is a promise to the tide. You pulled it off like a fish on a hook. The tide keeps the same promise about you.',
    triggers: [DEED('hauler_dragged')],
  },
  {
    id: 'mail_hate_14', kind: 'hate', from: 'Anonymous',
    subject: 'The ballad',
    body: 'They wrote a ballad about your run. I was in the second verse. There is no third verse for me. The singer never asked.',
    triggers: [DEED('base_destroyed'), HEAT(0.2)],
  },
  {
    id: 'mail_hate_15', kind: 'hate', from: 'Pitborn steward',
    subject: 'The pit saw',
    body: 'What you did at the wreck was seen by people who have learned to watch. The Pitborn do not write threats. We write invitations. Decline carefully.',
    triggers: [DEED('pod_captured')],
  },

  // ── BILLS — invoices that arrive because something cost money ─────────────────────
  {
    id: 'mail_bill_01', kind: 'bill', from: 'Berth Office',
    subject: 'Berth occupancy statement',
    body: 'Docking logged. Berth time, air draw, and the administrative pleasure of your company: itemized and attached. Pay before the next bell or the clamps learn your name.',
    triggers: [E('dock:docked'), DAY(1)],
  },
  {
    id: 'mail_bill_02', kind: 'bill', from: 'Yard Ledger',
    subject: 'Repair invoice',
    body: 'Work performed, parts consumed, warranty excluded: attached. The welds hold. The debt holds longer.',
    triggers: [E('service:completed', { type: 'repair' })],
  },
  {
    id: 'mail_bill_03', kind: 'bill', from: 'Concord Customs',
    subject: 'Assessment notice',
    body: 'A fine has been assessed under REF 44-C. Payment closes the file. Non-payment opens a second, more interesting file.',
    triggers: [E('law:fineAssessed')],
  },
  {
    id: 'mail_bill_04', kind: 'bill', from: 'Fuel Cooperative',
    subject: 'Cell replacement estimate',
    body: 'Your fuel state was logged at critical. Replacement cells are priced per unit of panic. Prepay now to lock the panic rate.',
    triggers: [E('fuel:empty')],
  },
  {
    id: 'mail_bill_05', kind: 'bill', from: 'Concord Debt Office',
    subject: 'Escalated note',
    body: 'Your outstanding note has escalated to bounty. This letter is the courtesy before the hunters. It is also the receipt for the courtesy.',
    triggers: [E('economy:debtEscalated')],
  },
  {
    id: 'mail_bill_06', kind: 'bill', from: 'Insurance Desk',
    subject: 'Deductible reminder',
    body: 'Your policy carried a deductible. The deductible has been carried. This is the carrying fee.',
    triggers: [E('player:death')],
  },
  {
    id: 'mail_bill_07', kind: 'bill', from: 'Gantry Crew Local',
    subject: 'Mishap levy',
    body: 'The dock slam at our berth generated a crew levy. The ring is straight again. Your account is not.',
    triggers: [DEED('dock_slam')],
  },
  {
    id: 'mail_bill_08', kind: 'bill', from: 'Quiet Brokerage',
    subject: 'Handling fee',
    body: 'The manifest-blank service you requested has concluded. Your discretion was flawless. Your bill is not.',
    triggers: [CARGO('cmdty_narcotics'), E('economy:tradeCompleted', { side: 'sell' })],
  },
  {
    id: 'mail_bill_09', kind: 'bill', from: 'Warrant Processing',
    subject: 'Bounty administration',
    body: 'A bounty was priced and processed on your hull. Processing costs are borne by the processed. Standard practice, itemized attached.',
    triggers: [DEED('wanted_tier')],
  },
  {
    id: 'mail_bill_10', kind: 'bill', from: 'Hunter\'s Guild',
    subject: 'Hunter recovery fee',
    body: 'You damaged a licensed hunter\'s hull beyond deductible. The Guild bills the target. Consider it a compliment in invoice form.',
    triggers: [E('warrant:hunterDisabled')],
  },
  {
    id: 'mail_bill_11', kind: 'bill', from: 'Storage Annex',
    subject: 'Seized goods holding fee',
    body: 'The lot seized under your name accrues storage by the shift. Collect it, contest it, or let the interest eat it for you.',
    triggers: [DEED('fence_burned')],
  },
  {
    id: 'mail_bill_12', kind: 'bill', from: 'Automation Registry',
    subject: 'Asset loss write-down',
    body: 'An automated asset under your registry was lost. Depreciation is cruel and immediate. Enclosed: the bill for the depreciation report.',
    triggers: [E('automation:assetLost')],
  },
  {
    id: 'mail_bill_13', kind: 'bill', from: 'Crafting Guild',
    subject: 'Materials reconciliation',
    body: 'Your craft consumed more reagents than the estimate pretended. The guild bills the gap. Craft something cheaper next time.',
    triggers: [E('craft:complete')],
  },
  {
    id: 'mail_bill_14', kind: 'bill', from: 'Concord Probate',
    subject: 'Death certificate filing',
    body: 'A hull loss requires a filing. Yours was dramatic enough to require two. Fees split evenly, condolences not included.',
    triggers: [E('player:death'), DAY(3)],
  },
  {
    id: 'mail_bill_15', kind: 'bill', from: 'Lane Authority',
    subject: 'Traffic violation invoice',
    body: 'Your transit through a restricted corridor was logged. The corridor bills by the meter and the audacity. Attached.',
    triggers: [HEAT(0.25), E('jump:arrive')],
  },

  // ── CREW — letters for Captain Maera Vols's lost crew, arriving misdirected ────────
  {
    id: 'mail_crew_01', kind: 'crew', from: 'J. Pell (Tessera, drive)',
    subject: 'To whoever has her hull',
    body: 'If the Tessera still flies, someone is flying her. Maera owed me a bottle and a debt she never got to settle. The bottle is paid. The debt rides with the hull. Take care of her; she is older than she looks.',
    triggers: [BEAT(1), DAY(2)],
  },
  {
    id: 'mail_crew_02', kind: 'crew', from: 'Sister Wenn',
    subject: 'The old crew\'s tab',
    body: 'Captain Vols kept a ledger of small debts — coffee owed, shifts covered, a hand lent at the gantry. The ledger outlived the crew. Pay it forward or pay it off; the hull remembers either way.',
    triggers: [BEAT(2), DAY(4)],
  },
  {
    id: 'mail_crew_03', kind: 'crew', from: 'R. Ash (Tessera, cargo)',
    subject: 'Manifest of the missing',
    body: 'We scattered. Some of us landed. Some of us are still the kind of thing you find in a pod. If you pull one in, that is one of ours. Tell them the ship kept flying.',
    triggers: [DEED('pod_rescued')],
  },
  {
    id: 'mail_crew_04', kind: 'crew', from: 'The Quartermaster',
    subject: 'Spare seals',
    body: 'I still hold the Tessera\'s spare custody seals from before she was lost. They authenticate to her signature. If the hull is yours now, they are yours — no charge, she hated paying twice.',
    triggers: [FLAG('volsBlackBoxRecovered'), DAY(9)],
  },
  {
    id: 'mail_crew_05', kind: 'crew', from: 'M. Osei (Tessera, nav)',
    subject: 'The jump she never took',
    body: 'Maera plotted a route she never filed — the one that was supposed to buy us all out. It is in the black box if you found it. The route was real. So was the buyout. Finish it if you dare.',
    triggers: [FLAG('volsBlackBoxRecovered'), BEAT(4), DAY(10)],
  },
  {
    id: 'mail_crew_06', kind: 'crew', from: 'T. Brandt (Tessera, comms)',
    subject: 'Her mayday habit',
    body: 'The Captain never ignored a distress call, even the ones that cost her. It is why the crew loved her and why the hull is a legend and why you should be careful about which trait you inherit.',
    triggers: [DEED('pod_rescued'), BEAT(3)],
  },
  {
    id: 'mail_crew_07', kind: 'crew', from: 'A Vols cousin',
    subject: 'Personal effects',
    body: 'The wreck left her locker unclaimed. A photo, two medals she never wore, and a book with a name in it. If the hull comes home, the locker does too.',
    triggers: [E('jump:arrive', { sectorId: 'sector_ashfall_reach' })],
  },
  {
    id: 'mail_crew_08', kind: 'crew', from: 'E. Vorn (Tessera, gunner)',
    subject: 'Her standing order',
    body: 'Standing order, never countermanded: if the Tessera takes fire, the crew hits the pods before the hull hits the floor. Whoever is crew now should know the order stood.',
    triggers: [DEED('kill_lawful'), BEAT(5)],
  },
  {
    id: 'mail_crew_09', kind: 'crew', from: 'Dock crew, Helios',
    subject: 'The berth she kept',
    body: 'Captain Vols kept berth nine painted for a hull that never came back. If you are flying her now, the berth is paid through the season. House policy: paint it anyway.',
    triggers: [E('dock:docked', { stationId: 'station_helios' }), BEAT(2)],
  },
  {
    id: 'mail_crew_10', kind: 'crew', from: 'L. Ilex (Tessera, medic)',
    subject: 'The pod protocol',
    body: 'The old crew protocol: survivors first, cargo second, pride never. Maera drilled it into us until it was reflex. If you have the hull, you have the obligation. It is a good one.',
    triggers: [DEED('pod_rescued'), DAY(6)],
  },
  {
    id: 'mail_crew_11', kind: 'crew', from: 'Registry Clerk',
    subject: 'Crew of record',
    body: 'The Tessera\'s last filed crew list is a legal document now. You are not on it. Neither is anyone else, which is the point. The list is evidence and inheritance both.',
    triggers: [BEAT(3), DAY(6)],
  },
  {
    id: 'mail_crew_12', kind: 'crew', from: 'A survivor\'s brother',
    subject: 'Thank you for flying her',
    body: 'My sister shipped under Vols and never shipped home. Seeing the hull on the board again felt like a visit. Do whatever she was going to do; she would have liked the company.',
    triggers: [DEED('kill_outlaw'), BEAT(4)],
  },
  {
    id: 'mail_crew_13', kind: 'crew', from: 'The First Mate',
    subject: 'Her real manifest',
    body: 'What Maera was actually hauling is not on any manifest — it is why the hull went down and why it came back up. When you find the page, the page finds you.',
    triggers: [FLAG('manifestPageNine'), BEAT(6), DAY(12)],
  },
  {
    id: 'mail_crew_14', kind: 'crew', from: 'K. Asha (Tessera, engineer)',
    subject: 'The ghost in the drive',
    body: 'The Tessera\'s drive had a harmonics fault she never fixed. It sings at exactly the wrong moment. We used to say the ship was talking. When you hear it, answer. She always did.',
    triggers: [E('jump:arrive'), BEAT(3)],
  },
  {
    id: 'mail_crew_15', kind: 'crew', from: 'Dockmaster\'s archive',
    subject: 'The last inspection',
    body: 'Her last inspection before the loss is a matter of record. It reads like a warning and a eulogy. Whatever the hull is now, it was loved in paperwork once.',
    triggers: [E('dock:docked'), BEAT(5)],
  },

  // ── ATT U-09 remainder — second tranche across the same kinds ─────────────────────
  {
    id: 'mail_slate_02', kind: 'cast', from: 'Slate',
    subject: 'The plate, again',
    body: 'I stamped your hull plate once and word is you treat it like a dare now. The weld holds because I made it hold. Stop testing my signature.',
    triggers: [DEED('stunt'), DAY(7)],
  },
  {
    id: 'mail_senna_02', kind: 'cast', from: '"Dustwife" Senna',
    subject: 'Another name stayed wrong',
    body: 'Two more hulls went on the wrong side of my list this month. Yours keeps refusing to stay written. I have started keeping your page in a different drawer.',
    triggers: [DEED('pod_rescued'), DAY(9)],
  },
  {
    id: 'mail_question_02', kind: 'cast', from: 'The Question',
    subject: 'An answer, partial',
    body: 'You answered the last thing that asked by outlasting it. That was not an answer. It was evidence. The question remains open.',
    triggers: [DEED('hunter_outran'), DAY(9)],
  },
  {
    id: 'mail_job_union_01', kind: 'job', from: 'Salvage Assessors Local',
    subject: 'Certified adjuster wanted',
    body: 'The union does not pay for the photograph. The union certifies, after the fact, that a photograph existed. Certification is what pays, and certification looks away from the stripping. Rate card attached.',
    triggers: [E('encounter:resolved'), STAT('missionsDone', 5)],
  },
  {
    id: 'mail_spam_21', kind: 'spam', from: 'Concord Rest Registry',
    subject: 'UNLICENSED IDLE TIME FOUND',
    body: 'Our auditors detected four minutes of unbilled calm in your last berth stay. License your leisure or return the minutes. Appeals processed in order of despair.',
    triggers: [E('dock:docked'), DAY(10)],
  },
  {
    id: 'mail_spam_22', kind: 'spam', from: 'Vigilance Mutual',
    subject: 'YOUR ESCAPE POD IS UNDERINSURED',
    body: 'The pod you will never admit you need is covered for only half a rescue. Upgrade to whole-rescue coverage before the math becomes personal.',
    triggers: [E('player:death'), DAY(3)],
  },
  {
    id: 'mail_fan_16', kind: 'fan', from: 'The relief watch',
    subject: 'You slowed down',
    body: 'Third watch saw a ship reduce speed for a drifting pod instead of logging it as debris. The watch does not clap. The watch wrote this anyway.',
    triggers: [DEED('pod_rescued'), DAY(4)],
  },
  {
    id: 'mail_hate_16', kind: 'hate', from: 'A toll keeper\'s sister',
    subject: 'The gate you broke',
    body: 'He kept that gate eleven years and knew every hull by its lighting. You left him a job with no gate in it. I hope the cargo was worth a man\'s whole shape.',
    triggers: [DEED('base_destroyed')],
  },
  {
    id: 'mail_bill_16', kind: 'bill', from: 'Notary of Transit',
    subject: 'Witnessing fee',
    body: 'An officer witnessed your last assessment and countersigned the paperwork. The countersignature is a service. Services are billed. Attached.',
    triggers: [E('law:fineAssessed'), DAY(2)],
  },
  {
    id: 'mail_crew_16', kind: 'crew', from: 'The navigator\'s apprentice',
    subject: 'Her margin notes',
    body: 'Captain Vols wrote routes in the chart margins in pencil, so the ship could change its mind. If the Tessera still carries her charts, page sixty-one is hers.',
    triggers: [E('jump:arrive'), BEAT(4)],
  },
  // ── The freighter you saved sends word — escorts end at a berth; these arrive after ──
  {
    id: 'mail_fan_17', kind: 'fan', from: 'Convoy lead, second berth',
    subject: 'The manifests posted',
    body: 'You walked us through the lane and filed nothing. The manifests posted yesterday, every line intact. The crew took a vote about what to call you. The polite version is on the berth wall.',
    triggers: [E('mission:completed', { type: 'escort' }), DAY(2)],
  },
  {
    id: 'mail_fan_18', kind: 'fan', from: 'A loadmaster',
    subject: 'It is girders now',
    body: 'The ore you shepherded got weighed, smelted, and sold twice. It is girders in a station that is still standing. I was told to write down where they came from. The column reads: one escort, unbooked.',
    triggers: [E('mission:completed', { type: 'escort' }), DAY(5)],
  },
  {
    id: 'mail_job_15', kind: 'job', from: 'Convoy Dispatch, Lido Line',
    subject: 'Same lane, better terms',
    body: 'The convoy captains talk. You flew flank and the count came home whole — we log that differently than the guns-for-hire. Standing escort terms are posted under your name. Repeat customers get the berth with the light.',
    triggers: [E('mission:completed', { type: 'escort' }), STAT('missionsDone', 4)],
  },

  // ── special-500 Phase 2 (batch 1, mail family) ─────────────────────────────────────
  // SP2-018 "The Manifest That Reads You" — mail leg. The hail half of the unit (the
  // weigh-slip buoy's contactHail variants, gated on an empty hold and 0 credits) is a
  // separate build; it writes flag `weighslip_intent`. Until that leg lands the letter
  // waits, gated and honest — the evaluator delivers nothing without the flag.
  {
    id: 'mail_hale_special500_weighslip', kind: 'cast', from: 'Hale',
    subject: 'REF T-9 — intent reading, noted',
    body: 'Buoy T-9 filed an intent reading on you. Standard. Ignore it. I ignore mine. '
      + 'For the record you did not ask for: the buoy reads hold mass, transponder age, and how long '
      + 'you hesitated before the hail. The hesitation is the field it files. It goes in a drawer at '
      + 'the customs clamp zone with ten thousand identical drawers, and nobody reads them unless '
      + 'somebody dies, and then everybody reads them. Yours says PENDING. Keep it pending. A pilot '
      + 'with no intentions is a pilot whose paperwork I never have to open. That is a compliment. '
      + 'File it where you file everything else.',
    triggers: [FLAG('weighslip_intent')],
  },
  // SP2-041 "The Previous Tenant's Mail" — mail leg. The mail system routes by hull, not by
  // person, so the first delivery after the player's second hull arrives addressed to whoever
  // held the seat before. Second-hull gate is the live ownedShips read plus the witnessed
  // purchase; delivery is once, like every letter here.
  {
    id: 'mail_previous_tenant_01', kind: 'cast', from: 'Rets',
    subject: 'RE: THE SEAT CUSHION YOU TOOK',
    body: 'TO: [OLD REG, SIXTH OWNER] / RE: THE SEAT CUSHION YOU TOOK. WE NOTICED. WE HAVE NOT '
      + 'FORGIVEN. THE CUSHION WAS LOAD-BEARING SOCIALLY.\n\n'
      + 'Whoever sits in that chair now — this was addressed to the hull, and the hull is a forwarding '
      + 'address now. Six owners, four cushions, and the one that mattered went out the airlock with '
      + 'the fifth. That cushion held the whole watch together. Arguments were won from it. If you are '
      + 'reading this, the broker sold you a hull with a hole in its social manifest. Sit carefully. '
      + 'The fifth owner still buys, wherever they drifted.',
    triggers: [E('ship:purchased'), OWNSHIPS(2)],
  },

  // ── special-500 Phase 2 (batch 2, serial mail pass) ────────────────────────────────
  // Fourteen letters, one per catalog entry, each keyed to the story flag the director
  // writes when its entry fires: state.story.flags['special500.<id>'] (the director is the
  // only writer of that namespace — src/systems/special500Director.js). The letter is the
  // world remembering the beat; the sender is the entry's own voice.

  // SP1-089 "The Far-Side Message" — the SORRY wreck off the Black Orchard, legible from one
  // bearing only. Entry payload `from` is "Veil fog" — no natural letter-writer — so the
  // nearest in-world sender signs it: the soundings desk at Research Station Veil.
  {
    id: 'mail_special500_sp1-089', kind: 'cast', from: 'Soundings desk, Research Station Veil',
    subject: 'The wreck that says SORRY',
    body: 'We run soundings out of Research Station Veil, and most of what the fog gives back '
      + 'we file and forget. Not this one. The wreck off the Black Orchard carries one word on its '
      + 'far side, welded in plate, and the nebula\'s rim glow reads it through the hull: SORRY. You '
      + 'only get the word from one bearing and one side — stand anywhere else and it is just a '
      + 'hull with its back to you. The registration says it carried passengers. I have stopped '
      + 'guessing what it was sorry for. The codex page is one word long, and it took me a week to '
      + 'stop standing there. Come read it before the fog closes.',
    triggers: [FLAG('special500.SP1-089')],
  },
  // SP2-036 "The Overtime Log" — the night-only line on the Helios derelict's work log. The
  // sender is the one the consensus names: Kessler, weights desk.
  {
    id: 'mail_special500_sp2-036', kind: 'cast', from: 'Kessler',
    subject: 'Overtime log: one unreconciled line',
    body: 'Someone finally scanned the overtime derelict at night and pulled the extra line: '
      + 'SHIFT ENDED. I STAYED. THE LANE DOES NOT SUPERVISE ITSELF. By day the log ends two entries '
      + 'earlier, like the line was never typed. I checked the copies going back before my time at '
      + 'the weights desk. Same line, every night shift, for years. Somebody has been leaving it on '
      + 'and never once billed for the hour. We built our whole ledger on catching discrepancies, '
      + 'and the honest one was sitting in a derelict the whole time. The night clerk at the '
      + 'overtime pin. Good man. Never billed us. I have noted the line under no charge, which is '
      + 'where the best entries live.',
    triggers: [FLAG('special500.SP2-036')],
  },
  // SP2-056 "Letters For The Dead Crew" — the benefits desk writes to the hull's dead crew,
  // never having been told. Addressed to the Tessera, so it files under the Vols crew thread.
  {
    id: 'mail_special500_sp2-056', kind: 'crew', from: 'Concord Benefits Desk',
    subject: 'TO: CREW, TESSERA — RE: THE SEVENTH RUN',
    body: 'TO: CREW, TESSERA / RE: THE SEVENTH RUN. We are still holding your deposits. They have '
      + 'matured. Come collect. Bring registration.\n\n'
      + 'This desk writes to the address on file, and the address on file is a hull. If the hull is '
      + 'reading this and the crew is not, that is a filing problem, not ours. The deposits drew '
      + 'interest for every year the account sat quiet, which the ledger calls diligence and we '
      + 'call momentum. The count will not release the sum to a name, a cousin, or a story. '
      + 'Registration only. We have never once been told what happened on the seventh run, and we '
      + 'have decided that being told is more trouble than the interest. Come collect. Or keep her '
      + 'flying, and we will keep holding it. Either way the account stays open.',
    triggers: [FLAG('special500.SP2-056')],
  },
  // SP2-178 "The Lost Freight's Address" — the Helios lost-property board names the player
  // courier; the letter is the tag arriving as the mail attachment the followup describes.
  {
    id: 'mail_special500_sp2-178', kind: 'cast', from: 'Helios Lost-Property Desk',
    subject: 'Tag 41: ONE (1) ENGINE, still waiting',
    body: 'You scanned the freight on the lost apron, so the board has matched its label to a tag '
      + 'and printed your name in the courier line. We did not choose you; the match did. CONTENTS: '
      + 'ONE (1) ENGINE. WAITING SINCE BEFORE YOU ARRIVED. OWNER NOTIFIED 41 TIMES. OWNER IS THE '
      + 'WAITING PROBLEM. Read that line twice. The freight is waiting for itself. The board is '
      + 'waiting for the freight. Nobody at this desk can say which notice failed first, and the '
      + 'file has been open longer than most careers. You are now the loop\'s only moving part. '
      + 'Carry the tag to the freight and both halves close. Or keep the tag, and the loop keeps '
      + 'its shape. The board is indifferent. The engine is not going anywhere.',
    triggers: [FLAG('special500.SP2-178')],
  },
  // SP2-046 "The Recruitment Letter" — Sker Vane's office after a fine reached the Reach.
  // Vane voice per FIGURES; the job terms are the entry's own payload, unchanged.
  {
    id: 'mail_special500_sp2-046', kind: 'cast', from: 'Boss Sker Vane',
    subject: 'The Reach weighed you',
    body: 'A fine on your record reached us before Concord finished filing it. Good. The Reach '
      + 'weighed you while you were standing still — you came up short, loud, and useful. Two of '
      + 'those are fixable and one of them is the job. One task, no contract paper, paid in hull '
      + 'parts and not asking: shadow a Meridian toll run and report its timing. No shots. We want '
      + 'the schedule, not the cargo; cargo is loud and schedules are cheap. Refusal is fine. This '
      + 'is an office, not a trap. Refusal twice is memorable. I keep a short list for memorable '
      + 'and a long burn for the rest of it. Answer by flying or by not.',
    triggers: [FLAG('special500.SP2-046')],
  },
  // SP2-051 "Voss's Open Page" — the claim office's paper-clipped ledger page, the convoy that
  // never logged. Voss asking, not as a mission, as a favor between ledgers.
  {
    id: 'mail_special500_sp2-051', kind: 'cast', from: 'Voss',
    subject: 'The page with the paper clip',
    body: 'There is a page in the claim ledger I have not closed in years. A paper clip holds it '
      + 'open: the convoy that never logged. Old route, full tally on the outbound, nothing on the '
      + 'return. The books call that a rounding error the size of a convoy. I am not asking as a '
      + 'mission. I am asking as a favor between ledgers. Fly the old route once with a live tally '
      + 'rig and let the scale say what the page says. If it confirms the hole, I write one '
      + 'correction line and hand you five points of DMC goodwill, and the clerk — me — keeps the '
      + 'page open. If the scale reads one extra hull, we both learn something the page did not '
      + 'know. Either way it is a story with a receipt.',
    triggers: [FLAG('special500.SP2-051')],
  },
  // SP2-132 "The Claim Tag Wedding" — the rival crew's joint claim form. The entry payload has
  // no `from` (memory channel); the followup's co-owner letters are signed "— V", so that is
  // the voice that signs here too.
  {
    id: 'mail_special500_sp2-132', kind: 'cast', from: 'V. (rival claim crew)',
    subject: 'The claim form, pre-signed',
    body: 'The form you are holding is real. Pre-signed, one blank line, filed in duplicate like '
      + 'anything that matters. You ran an honest scale over that rock and we watched the numbers '
      + 'behave, and out here that is rarer than ore. So: SECOND NAME. THIS IS NOT A QUESTION. WE '
      + 'SAW YOUR SCALE READINGS. MARRY US COMMERCIALLY. What signing means, plainly: both yields '
      + 'on the claim double, the quarrels end, and the form outlives both crews like all '
      + 'paperwork does. What declining means, also plainly: respect, no grudge, and we go back to '
      + 'arguing with the rock instead of you. One line, one signature. The rock does not care. '
      + 'We do.',
    triggers: [FLAG('special500.SP2-132')],
  },
  // SP3-014 "The Sun Dogs" — the annual 22-degree mock suns over Helios. Sender is the
  // entry's own voice: Helios traffic.
  {
    id: 'mail_special500_sp3-014', kind: 'cast', from: 'Helios Traffic Control',
    subject: 'Optics check: two mock suns',
    body: 'Optics check, annual, filed late as always: two mock suns flanking the key at exactly '
      + '22 degrees, each dragging a short tail of colored fire, holding formation for about a '
      + 'minute while everything moves and nothing does. Haulers flew through them like they were '
      + 'lanes. One rookie called it a sensor fault; the fault called back with both birds. The '
      + 'bar is running its usual bet on which one goes out first, and the book still will not '
      + 'split them, which tells you everything about how seriously this station takes physics. '
      + 'It happens every year around now, first watch. Set your clock by it or set your drink by '
      + 'it.',
    triggers: [FLAG('special500.SP3-014')],
  },
  // SP3-019 "Eclipse Bulletin" — the wire teach that the umbra is scheduled, not random. The
  // news payload has no named writer; the Sector Wire desk that prints it signs the letter.
  {
    id: 'mail_special500_sp3-019', kind: 'cast', from: 'Sector Wire Desk',
    subject: 'SECTOR WIRE: umbra transit tomorrow, second bell',
    body: 'SECTOR WIRE, standing item, reprinted because people keep calling it an omen: umbra '
      + 'transit tomorrow, second bell. Window glass down, work lights up. The umbra is not '
      + 'weather and it is not a curse; it is a schedule. It crosses when the geometry says it '
      + 'crosses, which is the same authority the tolls use, so you already trust it more than '
      + 'you think. Crews on open gantries: down before the bell. Pilots in the dark half: '
      + 'lights, formation, and no heroics — the black out there is total and it does not care '
      + 'what your mirrors cost. The starmap has the minute marked. The wire will run it again '
      + 'next cycle. The dark keeps the appointment either way.',
    triggers: [FLAG('special500.SP3-019')],
  },
  // SPX-A-02 "The Forty-Year Crate" — the oldest manifest line on the Helios dock. Entry
  // payload has no `from` (memory channel); the nearest in-world sender is the dock office
  // that owns the manifest the line sits on.
  {
    id: 'mail_special500_spx-a-02', kind: 'cast', from: 'Helios Manifest Desk',
    subject: 'The oldest line on the manifest',
    body: 'Every dock keeps one item it has stopped trying to explain. Ours is the crate on the '
      + 'apron past the freight lanes, and its manifest line is the oldest thing on the dock\'s '
      + 'books: IN TRANSIT, YEAR 3. Not year three of its transit — just YEAR 3, an era with no '
      + 'number after it. The tape has been opened and resealed so many times it has stratified; '
      + 'peel one layer and you get the paperwork of a different decade, all of it agreeing the '
      + 'crate is somebody else\'s problem. It is scan scenery. It is not for sale. Forty years of '
      + 'clerks have signed it onward, and every one of them is retired or worse, and the crate '
      + 'is, in every way that matters, still in transit.',
    triggers: [FLAG('special500.SPX-A-02')],
  },
  // SP1-008 "The Captain's tow" — the Reach pack's burial column in Sker Haven. The news
  // payload has no named writer; Lira Vonn ("The Margin") is the in-world correspondent whose
  // beat is hulls like this one.
  {
    id: 'mail_special500_sp1-008', kind: 'cast', from: 'Lira Vonn',
    subject: 'REACH BURIAL — the long burn',
    body: 'The wire ran it as an incident and I am running it as what it was. A Reach pack took a '
      + 'dead captain home on the long burn: casket-rigged hull in slow column toward the star, '
      + 'engines dim, and every hundred WU a wasp peeling off the column like a gun salute you '
      + 'could set a watch by. The pack declared hands-off for the tow and is keeping the '
      + 'declaration. Nobody touched them; they touched nobody. Plenty of you price the hulls of '
      + 'dead captains. The market is closed for this one, and every Reach pack will remember it '
      + 'otherwise. The Margin does not print sentiment, so I will print physics instead: the '
      + 'formation held the whole way down. Whoever they ran with, the captain takes the long '
      + 'burn.',
    triggers: [FLAG('special500.SP1-008')],
  },
  // SP3-033 "The Fiddle Strings" — eleven cargo tethers between the f_ceres_2 boulders. Entry
  // payload `from` is "Belt chatter" — no natural letter-writer — so the nearest in-world
  // sender signs it: an old-timer driller at Belt Outpost.
  {
    id: 'mail_special500_sp3-033', kind: 'cast', from: 'A driller at Belt Outpost',
    subject: 'Eleven strings, no fiddle',
    body: 'Somebody between the f_ceres_2 boulders strung eleven real cargo tethers across the '
      + 'dark like a harp, and nobody is claiming it, which is how you know it was done for free. '
      + 'Old-timers at the outpost say they sing when the wind fronts come through — a slow, '
      + 'detuned chord that changes pitch as each front passes, every string throwing its own '
      + 'faint vibration glint. I heard it once on a fuel run and stood there like an idiot until '
      + 'my tanks topped. One house rule, posted nowhere and obeyed everywhere: do not shoot a '
      + 'string. Cut one and the chord loses a voice for good, and nobody will thank you for the '
      + 'experiment. It is not a fight. It is a listening place. Leave it one.',
    triggers: [FLAG('special500.SP3-033')],
  },
  // SPX-A-01 "The Pointing Chain" — five dead nav buoys aimed at a chalked X in the Ceres
  // derelict field. Entry payload `from` is "Belt chatter" — no natural letter-writer — so the
  // nearest in-world sender signs it: the Ceres survey desk that walked the rumor.
  {
    id: 'mail_special500_spx-a-01', kind: 'cast', from: 'Ceres survey desk',
    subject: 'Five buoys, one X',
    body: 'The survey desk finally walked the derelict field\'s newest rumor and it checks out: '
      + 'five dead nav buoys in a chain, each one physically aimed at the next — not transmitting, '
      + 'not powered, just pointed, the way you aim a thing when you mean it. The last one aims '
      + 'at an uncharted rock marked with a hand-chalked X and nothing else. No name, no date, no '
      + 'hazard glyph. Someone wanted to be followed, and did it the hard way, with alignment '
      + 'instead of a signal. The rock holds one modest cache and a page of somebody\'s codex, '
      + 'which is a strange thing to leave behind and an honest one. If you go: the buoys are '
      + 'dead, the X is chalk, and the intent has outlasted both.',
    triggers: [FLAG('special500.SPX-A-01')],
  },
  // SP3-048 "The Forecast Bell" — the season-turn chime: three notes, one per temper. The news
  // payload has no named writer; the Season Wire desk that files the bulletin signs the letter.
  {
    id: 'mail_special500_sp3-048', kind: 'cast', from: 'Season Wire Desk',
    subject: 'SEASON WIRE: the bell has struck',
    body: 'SEASON WIRE, filed on the stroke: the bell has struck and the weather has changed '
      + 'addresses. Three notes, one per temper — ion, wind, iron — and the season you get is the '
      + 'one it names. That is the whole announcement. There is no forecast desk arguing with the '
      + 'bell, no sponsor, no corrections; the almanac calls it an announcement and the dockhands '
      + 'call it the only honest thing on the band, which is the same sentence wearing different '
      + 'coats. What it means for you: whatever temper the bell named is now the weather\'s legal '
      + 'residence, and hulls that fly like the last season still lives pay the difference out of '
      + 'their own plating. The bell strikes again in seven days. It has never once been late.',
    triggers: [FLAG('special500.SP3-048')],
  },

  // ── special-500 Phase 2 (batch 3, serial mail pass) ────────────────────────────────
  // Fourteen letters, one per catalog entry, each keyed to the story flag the director
  // writes when its entry fires: state.story.flags['special500.<id>'] (the director is the
  // only writer of that namespace — src/systems/special500Director.js). The letter is the
  // world remembering the beat; the sender is the entry's own voice.

  // SPX-A-11 "The Dockmaster's Garden" — the hydroponic rack on the station_helios dock
  // spine. Entry channel is memory and the payload has no `from`; the nearest in-world
  // sender is the dockmaster's office that owns the spine the rack is bolted to.
  {
    id: 'mail_special500_spx-a-11', kind: 'cast', from: 'Helios dockmaster\'s office',
    subject: 'The rack on the dock spine',
    body: 'You docked at Helios this week and walked the spine past the hydroponic rack, because '
      + 'everyone does and almost nobody asks. Three rows of lamps, two green and one wilted with '
      + 'dignity, and a sign that settles all commerce in advance: NOT FOR RESALE. YES, FOR YOU, '
      + 'FRANK. The office has been asked, formally, who Frank is. Nobody on the roster is named '
      + 'Frank. Nobody on the dock can remember a Frank. The tomatoes do not care, and neither '
      + 'does the rack, which produces anyway — that is the whole lesson of the thing, and this '
      + 'office is not paid to teach it. Leave the wilted row alone. It has seniority.',
    triggers: [FLAG('special500.SPX-A-11')],
  },
  // SP1-097 "The Favor Ledger" — the Tethys Junction buoy's public ledger of favors owed and
  // owed-by. Sender is the entry payload's own `from`: the unregistered buoy, mailing you
  // your line.
  {
    id: 'mail_special500_sp1-097', kind: 'cast', from: 'Unregistered buoy',
    subject: 'Your line on the ledger',
    body: 'This is a copy, not a request. The buoy at the Tethys Junction keeps a public ledger '
      + 'on its screen face: FAVORS OWED, OWED-BY, maintained by nobody and accurate about '
      + 'everybody, because accuracy is what happens when nobody is paid to round. Your hull has '
      + 'a line on it now. It reads: owes the belt one honest tow. There is no appeals desk, '
      + 'because there is no staff; there is only the belt seeing the same screen you do. Do the '
      + 'tow and the line settles, and the ledger will say so in the same plain type it used to '
      + 'open. Skip it and the line stays, and the belt reads skipping the way skippers read '
      + 'anything — out loud, with pauses. The buoy does not care which. It only keeps the '
      + 'record.',
    triggers: [FLAG('special500.SP1-097')],
  },
  // SP2-163 "The Listening Field's Reply" — the field's filing receipt, the only unsealed
  // thing it does (after the sealed shelf of SP2-004). Sender is the entry payload's own
  // `from`: the field itself; the letter is the durable copy of a reply it does not repeat.
  {
    id: 'mail_special500_sp2-163', kind: 'cast', from: 'The Listening Field',
    subject: 'FILED UNDER TODAY',
    body: 'RECEIVED. YOUR TRANSMISSION HAS BEEN FILED UNDER TODAY, CROSS-REFERENCED TO NOTHING. '
      + 'IN ELEVEN YEARS NO ONE HAS FILED FROM HERE. THE SHELF IS PLEASED. CONTINUE.\n\n'
      + 'That is the whole reply, and the field does not repeat itself, so this copy is the '
      + 'durable one. You transmitted from inside the field\'s radius — the only thing anyone '
      + 'has ever transmitted from there — and the one unsealed thing the shelf does, it did for '
      + 'you: a filing receipt. The sealed shelves stay sealed. Whatever they hold has held it '
      + 'for eleven years without comment, and the field\'s answer to attention is paperwork, '
      + 'not opening. Cross-referenced to nothing is not an insult. It means nothing else in the '
      + 'archive is like it. File this letter where you file things that were addressed to you '
      + 'alone.',
    triggers: [FLAG('special500.SP2-163')],
  },
  // SPX-C-03 "Division Six's Quiet Neighbor" — the extra band under the Veil storm, and the
  // wire's unbidden denial. Sender is the entry payload's own `from`. The sealed "I. S."
  // playback reply is a separate mail row keyed to the playback flag, per the consensus seam;
  // it belongs to the unit that builds the playback leg.
  {
    id: 'mail_special500_spx-c-03', kind: 'cast', from: 'Research Station Veil',
    subject: 'ALL BANDS NOMINAL',
    body: 'You held station inside four hundred WU through the surge, so the wire assumes you '
      + 'heard it, and the wire would rather file this than be asked. Under the storm noise, one '
      + 'narrow band is carrying a pattern that is not weather and not any code on the books. It '
      + 'is not interference. Interference does not keep a schedule. The station\'s position, '
      + 'unbidden and unprompted: ALL BANDS NOMINAL. THERE IS NO EXTRA BAND. Nobody asked. That '
      + 'is the part worth filing — a denial that answers a question nobody asked is a receipt. '
      + 'One thing more, and the wire will deny this too: somebody inside the station hears the '
      + 'band correctly. The wire does not say who. The band was there before the storm and will '
      + 'be there after, and the pattern will keep not being weather.',
    triggers: [FLAG('special500.SPX-C-03')],
  },
  // SP2-002 "Behind the Plate" — Slate's yard closes the Vols thread over the comms log: the
  // locker behind the Tessera-class plate, empty, hinges scratched from the inside. Sender is
  // the entry payload's own `from`.
  {
    id: 'mail_special500_sp2-002', kind: 'cast', from: 'Slate\'s yard',
    subject: 'One line from the yard',
    body: 'You were in the yard\'s bay long enough for the crew to talk, and Pit Shipyard talks '
      + 'in one lines, so here is the one. Slate pulled a plate off a Tessera-class frame once — '
      + 'a working hull, not a wreck — and behind it, on every one of these hulls, there was a '
      + 'locker. Was. Past tense, in your case, because your hull came up empty and the hinges '
      + 'are scratched from the inside. From the inside is the part the crew keeps not saying '
      + 'out loud. Someone opened that locker from within, left it shut again, and the plate '
      + 'went back over the top of it. The yard does not speculate on manifest. We sell parts. '
      + 'But you should know what your frame was built to carry, and that whoever sat where you '
      + 'sit took it out.',
    triggers: [FLAG('special500.SP2-002')],
  },
  // SP1-056 "The Paid Stamp" — the toll ring's light-dust PAID stencil on your plating, and
  // the SKIP stencil if you don't. Sender is the entry payload's own `from`.
  {
    id: 'mail_special500_sp1-056', kind: 'cast', from: 'Reach weigh-booth',
    subject: 'You are wearing your receipt',
    body: 'For the rest of the day you are legible. The toll ring\'s scanner painted a light-dust '
      + 'stencil across your plating — PAID — and every scanner on the lane reads it before your '
      + 'transponder, because the stencil is newer information and scanners respect that. '
      + 'Skippers nod as you pass. Accept the nods; they cost nothing and they are the Reach\'s '
      + 'whole tax rebate. Understand the other half too: skip a toll and the same scanner '
      + 'prints SKIP, in the same honest dust, and the hunters read that as worth a look and the '
      + 'patrol reads it as worth a scan, and both are correct. The stencil is not a medal or a '
      + 'mark of shame. It is the lane\'s only honest op-ed, and it washes off at day\'s end. '
      + 'Pay, fly, be legible.',
    triggers: [FLAG('special500.SP1-056')],
  },
  // SP3-061 "The Barometer Ghost" — doubled, smeared stars at a weather volume's edge: the
  // refraction ring IS the safe line. News payload has no `from`; its own voice signs the
  // item "WEATHER DESK", so the Veil weather desk signs the letter.
  {
    id: 'mail_special500_sp3-061', kind: 'cast', from: 'Veil Weather Desk',
    subject: 'The ring at the front\'s edge',
    body: 'WEATHER DESK, one item, not repeated, and this copy is the not-repeating made durable. '
      + 'When the stars at a front\'s edge double and smear into a ring, believe the ring. It is '
      + 'not your glass and it is not fatigue; it is the volume\'s boundary lensing the sky, '
      + 'which means the invisible weather has just drawn you a map of itself. The doubled stars '
      + 'mark the edge of the coming front, printed in refraction before the weather arrives. '
      + 'The ring is the safe line. Stay outside it and the front will pass you like a rumor. '
      + 'Cross it because the smear looked pretty and you will learn what the almanac means by '
      + 'warning phase. This desk has said its whole speech once. The sky will do the rest, '
      + 'louder.',
    triggers: [FLAG('special500.SP3-061')],
  },
  // SPX-B-03 "The Rookie Rate" — the first toll of a save prints ROOKIE RATE, on the house.
  // Sender is the entry payload's own `from`: the collector, embarrassed about the promo.
  {
    id: 'mail_special500_spx-b-03', kind: 'cast', from: 'Reach toll collector',
    subject: 'RE: your receipt — the promo line',
    body: 'Your receipt printed the line. ROOKIE RATE — FIRST TOLL ON THE HOUSE. THE LANE WANTS '
      + 'YOU BACK. It printed because that was the first toll on your record, the promo runs '
      + 'once per pilot, and the booth does not choose when it runs — the lane does. This note '
      + 'is the part the receipt cannot print, which is: it\'s a promotion. Don\'t make it a '
      + 'thing. The collector does not need the story retold at the bar, and does not need word '
      + 'getting around that the tolls go soft on first contact, because then every new hull '
      + 'arrives expecting a gift, and the booth runs out of gifts before the collector runs out '
      + 'of patience. You got the rate. The lane wants you back. Come back, and pay full like '
      + 'everybody. That is how the promo keeps working.',
    triggers: [FLAG('special500.SPX-B-03')],
  },
  // SP2-062 "The Tab That Outlived Its Owner" — the dead contact's tab: one slate OPEN, a
  // smaller one COVERED in Wraith Kell's handwriting. Payload `from` is "The rail, word
  // travels" — no natural letter-writer — so the nearest in-world sender signs it: the
  // barkeep on the quiet circuit who keeps the slates up.
  {
    id: 'mail_special500_sp2-062', kind: 'cast', from: 'A barkeep on the quiet circuit',
    subject: 'The slate by the rail',
    body: 'Word travels on the quiet circuit, and the rail\'s word is that you knew them — that '
      + 'you were on the circuit when it lost one of its own. The slate by the rail carries one '
      + 'name and one word: OPEN. It stays open. Closing it feels like filing, and this bar does '
      + 'not file its people. But you should see the second slate, the smaller one, hung under '
      + 'the same name: COVERED. Somebody paid the dead contact\'s tab in full, anonymously, and '
      + 'left no note — which is how the handwriting gave them away anyway. It belongs to a '
      + 'customs manifest clerk. Wraith Kell signs nothing else, and nobody can prove Kell has '
      + 'ever bought a round for the living. The tab stays open. The debt is covered. Both '
      + 'slates stay up. That is the whole service, and it is not for sale.',
    triggers: [FLAG('special500.SP2-062')],
  },
  // SPX-A-03 "The Missed Bells" — three shift bells missed, and the PA dry about it. Sender
  // is the entry payload's own `from`: the station PA itself.
  {
    id: 'mail_special500_spx-a-03', kind: 'cast', from: 'Station PA',
    subject: 'Station to hull',
    body: 'Station to hull: we noticed the absence. The lane did not. One of those is a '
      + 'compliment. Three shift bells have rung while your hull was elsewhere, and this station '
      + 'keeps count of its regulars the way harbors keep count of weather — quietly, and '
      + 'without a form for it. The bells do not require you. Nothing on the lane requires you; '
      + 'that is the deal you signed and the deal we honor. But the roster of hulls this deck '
      + 'expects to hear from has your line in it, and the line has been quiet, so this is the '
      + 'quiet line\'s reply. Come back when the work allows. The bells will keep ringing either '
      + 'way. That is what bells are for. The part of the roster that noticed will be at the '
      + 'bar.',
    triggers: [FLAG('special500.SPX-A-03')],
  },
  // SPX-A-10 "The Census of One" — the poi_tethys_weigh tally buoy's chalked daily list, your
  // hull underlined. Sender is the entry payload's own `from`.
  {
    id: 'mail_special500_spx-a-10', kind: 'cast', from: 'Weigh-Slip Buoy',
    subject: 'Today\'s list, your line underlined',
    body: 'The tally buoy at the Tethys weigh keeps a census the old way: every hull that passed '
      + 'the weigh today, chalked in order of keel, nobody signing the chalk. Your hull is on '
      + 'today\'s list. It is the one underlined. Nobody knows who underlines it — the chalk '
      + 'does the accounting and the accounting does the underlining, or so the regulars have '
      + 'decided, which is the same thing as a fact around here. The list is not a reward; being '
      + 'counted is not a rank. It is the lane saying, in the smallest official language it has: '
      + 'one of these, today, was you. At rollover the whole list wipes itself and starts again '
      + 'with the next hull through, and tomorrow you are a stranger again unless you pass. The '
      + 'underline is only good for a day. Come earn another.',
    triggers: [FLAG('special500.SPX-A-10')],
  },
  // SPX-A-05 "The Queue Critic" — the hull ahead in the customs hold reviews the service,
  // addressed to no one. Sender is the entry payload's own `from`, relayed by the queue.
  {
    id: 'mail_special500_spx-a-05', kind: 'cast', from: 'Hull ahead in the queue',
    subject: 'FWD: two lines, addressed to no one',
    body: 'The transmission below went out on the local band from the hull ahead of yours during '
      + 'the customs hold, addressed to no one, and the queue\'s relay copied it to every box it '
      + 'could reach, which is how band life works. Reproduced in full, unedited: Two stars. The '
      + 'forms are load-bearing. A pause, then, generously: The scan itself was five stars. Very '
      + 'thorough. Nobody escaped. That is the whole review. The checkpoint\'s paperwork holds '
      + 'the queue up and the queue holds the paperwork up, which is the arrangement, and one '
      + 'hull in every hold eventually says it out loud. The reviewer is gone — hulls in a scan '
      + 'queue do not sign their work. But the review stands, because nobody escaped, and the '
      + 'forms are, as advertised, load-bearing.',
    triggers: [FLAG('special500.SPX-A-05')],
  },
  // SPX-A-04 "The Painted Ring" — the starter-seam rock with the hand-painted ring and
  // "MINE. — K.", freshly repainted every visit. Payload `from` is "the starter seam" — no
  // natural letter-writer — so the nearest in-world sender signs it: the Helios claims desk
  // that logs the strikes.
  {
    id: 'mail_special500_spx-a-04', kind: 'cast', from: 'The claims desk, station_helios',
    subject: 'The rock with the ring on it',
    body: 'Your strike log came through the starter field this week, which means you have met '
      + 'the rock. Hand-painted white ring, two words: MINE. — K. The strike was clean and the '
      + 'rock rang true, which anyone who works the seam could tell you is the ring\'s doing — '
      + 'marked rock, honored rock. The claims registry at Helios has no K on file. It never '
      + 'has. Nobody on the lane will say who K is, and the registry has stopped asking, because '
      + 'the answer does not touch the only relevant fact: by your next pass the ring had been '
      + 'freshly repainted. White paint on rock, at the starter seam, applied by nobody the '
      + 'roster admits to. Somebody repaints the ring. Nobody has stopped painting. Work the '
      + 'seam around it — the ring was here first.',
    triggers: [FLAG('special500.SPX-A-04')],
  },
  // SP1-191 "The Letter Home" — the rescued survivor's home-station mailroom forwarding their
  // mail, candle wired to the envelope. Sender is the entry payload's own `from`.
  {
    id: 'mail_special500_sp1-191', kind: 'cast', from: 'Home-station mailroom',
    subject: 'FWD: their mail — the kid, the hull, the candle',
    body: 'This desk forwards mail to crews\' home ports when the addressing holds, and this one '
      + 'holds. It is not thanks — the port was clear about that — it is their mail, and you are '
      + 'in it. Quote: the kid talks about the rescue like weather. "And then the hull just '
      + 'CAME." We told them you charge rates like everyone. They\'ve decided you\'re a smuggler '
      + 'of people. High praise here. The enclosure is wired to the envelope by a steady hand: '
      + 'one candle, for luck, which is what this port sends instead of payment, because payment '
      + 'assumes the debt can be settled. The port\'s records will call the rescue a custody '
      + 'transfer. The kid\'s version has the hull arrive like weather does. The kid\'s version '
      + 'is the one that travels. Forward it or don\'t — the desk has filed its copy.',
    triggers: [FLAG('special500.SP1-191')],
  },
]);

export default { MAIL_LETTERS, MAIL_KINDS, MAIL_EVENT_NAMES, MAIL_DAY_S };
