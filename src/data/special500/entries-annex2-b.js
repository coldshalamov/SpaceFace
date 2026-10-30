// src/data/special500/entries-annex2-b.js — annex wave 2, file B (SPX-E-051..100).
//
// Fifty receipt-driven beats: each entry rides a verified event already
// emitted by a live system (combat, economy, law, salvage, scan, story —
// the same event vocabulary the ratified catalog and annex wave 1 use).
// nth counters land milestones on meaningful counts; sector scoping is
// used only where the beat belongs to a place.

export const ENTRIES_ANNEX2_B = [
  // SPX-E-051 — The Third Mark: the band stops counting aloud.
  {
    id: 'SPX-E-051',
    kind: 'comms-event',
    title: 'The Third Mark',
    sectors: [],
    trigger: { type: 'receipt', event: 'combat:kill', nth: 3 },
    channel: 'commsLog',
    payload: {
      from: 'The band',
      text: 'Three marks and the band stops counting out loud. An old voice breaks protocol to say: counted for you. You are in the book now. The book has no appeal and no author, and it keeps the best handwriting of any record out here.',
    },
  },

  // SPX-E-052 — The Fifth Survey: the scanner learns your name.
  {
    id: 'SPX-E-052',
    kind: 'comms-event',
    title: 'The Fifth Survey',
    sectors: [],
    trigger: { type: 'receipt', event: 'scan:completed', nth: 5 },
    channel: 'commsLog',
    payload: {
      from: 'Survey net',
      text: 'Five surveys filed and the net\'s confirmation tone changes — one register warmer, like a clerk who has decided you are a regular. The survey desk calls it batching. The batch is just you.',
    },
  },

  // SPX-E-053 — The Jute Line: the delivery dockhand\'s ritual.
  {
    id: 'SPX-E-053',
    kind: 'comms-event',
    title: 'The Jute Line',
    sectors: [],
    trigger: { type: 'receipt', event: 'cargo:delivered' },
    channel: 'commsLog',
    payload: {
      from: 'Dock hands',
      text: 'On delivery the crew passes the manifest down the line hand to hand — jute, they call it — every dockhand touching the paperwork before the crane touches the cargo. The manifest reads faster than the crane works. The ritual exists so somebody, somewhere, can say it was read.',
    },
  },

  // SPX-E-054 — The Sea\'s Fee: what jettison costs out here.
  {
    id: 'SPX-E-054',
    kind: 'comms-event',
    title: 'The Sea\'s Fee',
    sectors: [],
    trigger: { type: 'receipt', event: 'cargo:jettisoned' },
    channel: 'commsLog',
    payload: {
      from: 'Deck hands',
      text: 'The old rule holds in vacuum: what goes over the side, the sea keeps — and the sea keeps books. The band logs your jettison under a running column called THE OCEAN\'S ACCOUNT, and marks you even. Somewhere a record clerk is smiling about the entry. It is the only ledger with a sense of humor.',
    },
  },

  // SPX-E-055 — The Discoverer\'s Discount: charting pays, barely.
  {
    id: 'SPX-E-055',
    kind: 'easter-egg',
    title: 'The Discoverer\'s Discount',
    sectors: [],
    trigger: { type: 'receipt', event: 'poi:discovered' },
    channel: 'commsLog',
    payload: {
      from: 'Chart office',
      text: 'A discovery credit posts against your next chart fee — the office\'s way of paying you for finding what it missed. The credit is one-sixteenth of the fee, rounded down, and the office is proud of it. It is the only discount in the ledger described as generous.',
    },
  },

  // SPX-E-056 — The Fourth Voice: the hail you are not meant to hear.
  {
    id: 'SPX-E-056',
    kind: 'anomaly',
    title: 'The Fourth Voice',
    sectors: [],
    trigger: { type: 'receipt', event: 'distress:call' },
    channel: 'commsLog',
    payload: {
      from: 'Protocol channel',
      text: 'Between the mayday and the acknowledgment there is a third transmission — protocol, automated, unreadable. Listen long enough and a fourth voice follows it, not in the protocol: repeating the mayday\'s coordinates a beat early, like someone finishing a familiar sentence. The network logs it as echo. Echo does not lead.',
    },
  },

  // SPX-E-057 — Towline Etiquette: what the rescued owe the record.
  {
    id: 'SPX-E-057',
    kind: 'comms-event',
    title: 'Towline Etiquette',
    sectors: [],
    trigger: { type: 'receipt', event: 'distress:rescued' },
    channel: 'commsLog',
    payload: {
      from: 'Tow register',
      text: 'The rescued boat signs the tow register before it unhooks — name, hull, weather, and one column labeled WHAT WAS SAID. The entries are short: thank you, mostly, and once, in an old hand: I WILL DO THE SAME. The register is the oldest book in the lane. Nobody checks ID at a tow.',
    },
  },

  // SPX-E-058 — The Book on You: the oddsmakers notice.
  {
    id: 'SPX-E-058',
    kind: 'comms-event',
    title: 'The Book on You',
    sectors: [],
    trigger: { type: 'receipt', event: 'combat:outcome' },
    channel: 'commsLog',
    payload: {
      from: 'Haven wire',
      text: 'The outcome posts to the haven book before your own damage report renders — the odds board updates in the same breath as your hull alarm. Someone out there is grading you, continuously, for money. The board keeps your file under a nickname you did not choose.',
    },
  },

  // SPX-E-059 — The Undertakers\' Tenth: a courtesy bell.
  {
    id: 'SPX-E-059',
    kind: 'comms-event',
    title: 'The Undertakers\' Tenth',
    sectors: [],
    trigger: { type: 'receipt', event: 'entity:killed', nth: 10 },
    channel: 'commsLog',
    payload: {
      from: 'Necrology wire',
      text: 'Ten entries in the necrology column and the wire runs your name in a different type — the undertakers\' courtesy for people in the trade. It is not respect, exactly. It is fluency. The column keeps a standing column called REGULARS. You have been moved.',
    },
  },

  // SPX-E-060 — The Desk Warms Up: third completion.
  {
    id: 'SPX-E-060',
    kind: 'comms-event',
    title: 'The Desk Warms Up',
    sectors: [],
    trigger: { type: 'receipt', event: 'mission:completed', nth: 3 },
    channel: 'commsLog',
    payload: {
      from: 'Contract desk',
      text: 'Third contract closed and the desk\'s receipt changes hands — the stamp comes down sideways now, the mark of a clerk who has stopped checking your references. You are not trusted yet. You are legible, which out here is the year before trusted.',
    },
  },

  // SPX-E-061 — The Courtesy Machine: every hail answered.
  {
    id: 'SPX-E-061',
    kind: 'easter-egg',
    title: 'The Courtesy Machine',
    sectors: [],
    trigger: { type: 'receipt', event: 'npc:hailed' },
    channel: 'comms',
    payload: {
      from: 'Relay desk',
      text: 'Every hail in the lane gets logged by the courtesy machine — a tireless recorder that rates each greeting and files the friendly ones under CIVIL. Your hail files CIVIL. The machine\'s compliment is worth nothing, and it is the only rating on your record that costs nothing to keep.',
      ttl: 7,
    },
  },

  // SPX-E-062 — The Gate\'s Dissent: one vote against.
  {
    id: 'SPX-E-062',
    kind: 'comms-event',
    title: 'The Gate\'s Dissent',
    sectors: [],
    trigger: { type: 'receipt', event: 'gate:verdict' },
    channel: 'commsLog',
    payload: {
      from: 'Verdict wire',
      text: 'The verdict posts unanimous — it always posts unanimous — and yet one line of the readout carries a dissent: a gate camera filing NOT SURE in the margin column reserved for abstentions. Gates are not supposed to abstain. The margin column has no error handler. The dissent stands.',
    },
  },

  // SPX-E-063 — The Cleared-Name Ceremony: very quiet, very real.
  {
    id: 'SPX-E-063',
    kind: 'comms-event',
    title: 'The Cleared-Name Ceremony',
    sectors: [],
    trigger: { type: 'receipt', event: 'bounty:cleared' },
    channel: 'commsLog',
    payload: {
      from: 'Warrant desk',
      text: 'When a bounty clears, the desk runs a two-line ceremony nobody watches: the warrant moves from ACTIVE to PAID, and a clerk — by old rule — says the cleared name aloud in an empty office. The office is empty by rule too. The name must be said where nobody needs to hear it.',
    },
  },

  // SPX-E-064 — The Scanner\'s Poker Face: nothing found, filed anyway.
  {
    id: 'SPX-E-064',
    kind: 'easter-egg',
    title: 'The Scanner\'s Poker Face',
    sectors: [],
    trigger: { type: 'receipt', event: 'contraband:scanned' },
    channel: 'commsLog',
    payload: {
      from: 'Inspection log',
      text: 'The inspection records the scan and the find and — always — a third field the inspector fills without looking: DEMEANOR OF THE SCANNED. Yours reads CALM. It reads that before you know what they found. The field is how the desk grades itself: a good scan finds nothing a nervous hand would hide.',
    },
  },

  // SPX-E-065 — The Necrology Column: noted, filed, said.
  {
    id: 'SPX-E-065',
    kind: 'comms-event',
    title: 'The Necrology Column',
    sectors: [],
    trigger: { type: 'receipt', event: 'history:deadNoted' },
    channel: 'commsLog',
    payload: {
      from: 'Necrology desk',
      text: 'A name enters the dead file and the necrology desk keeps its one custom: the entry is read once by a junior clerk before filing — not for accuracy, for witness. The desk\'s rule is written over the tray: A NAME UNREAD IS A NAME UNMOURNED. The reading takes eight seconds. It is never skipped.',
    },
  },

  // SPX-E-066 — Market Eve: the night the stalls rehearse.
  {
    id: 'SPX-E-066',
    kind: 'comms-event',
    title: 'Market Eve',
    sectors: [],
    trigger: { type: 'receipt', event: 'calendar:marketDay' },
    channel: 'commsLog',
    payload: {
      from: 'Market wire',
      text: 'On market day the stall lights come up an hour early for the rehearsal — every vendor checking the lamps, the chimes, the lie they will tell about the quality. The rehearsal is the most honest hour of the week: nobody has sold anything yet, so nobody is lying yet.',
    },
  },

  // SPX-E-067 — The Season Benediction: storm crews say grace.
  {
    id: 'SPX-E-067',
    kind: 'comms-event',
    title: 'The Season Benediction',
    sectors: [],
    trigger: { type: 'receipt', event: 'calendar:stormSeason' },
    channel: 'commsLog',
    payload: {
      from: 'Storm desk',
      text: 'At the season turn the storm crews read the benediction — a one-line weather prayer older than the sectors, sent on the band in plain text so every hull gets it in its own voice: MAY YOUR STORMS BE OLD ONES. The new storms, the benediction implies, are nobody\'s fault.',
    },
  },

  // SPX-E-068 — The Previous Owner\'s Ghost: bought hulls keep names.
  {
    id: 'SPX-E-068',
    kind: 'easter-egg',
    title: 'The Previous Owner\'s Ghost',
    sectors: [],
    trigger: { type: 'receipt', event: 'ship:purchased' },
    channel: 'commsLog',
    payload: {
      from: 'Registry desk',
      text: 'The title transfers clean — except the band. For three days after a sale, the old owner\'s callsign still answers in the wire\'s oldest echo, a routing ghost the network admits it cannot fully clear. The registry calls it attrition. The previous owners call it the last shift.',
    },
  },

  // SPX-E-069 — The File That Keeps You: death, administratively.
  {
    id: 'SPX-E-069',
    kind: 'comms-event',
    title: 'The File That Keeps You',
    sectors: [],
    trigger: { type: 'receipt', event: 'player:death' },
    channel: 'commsLog',
    payload: {
      from: 'Registrar',
      text: 'The file does not close when you do. It transfers — to a desk called CONTINUED HOLDINGS, which keeps your name in the active roll for exactly one billing cycle, in case. In case of what, the desk does not say. The rollover is free. It is the only free thing the registrar offers.',
    },
  },

  // SPX-E-070 — The Countdown Voice: heard everywhere at once.
  {
    id: 'SPX-E-070',
    kind: 'comms-event',
    title: 'The Countdown Voice',
    sectors: [],
    trigger: { type: 'receipt', event: 'drill:chargeBlast' },
    channel: 'commsLog',
    payload: {
      from: 'Blast net',
      text: 'Every charge in the sector counts down in the same voice — licensed, says the blasters\' guild, from a woman who read numbers for the first mines and died in one. The guild pays her estate a royalty per blast. The estate is a dog. The dog is well cared for.',
    },
  },

  // SPX-E-071 — The Seam\'s Apology: cave-ins get a receipt.
  {
    id: 'SPX-E-071',
    kind: 'anomaly',
    title: 'The Seam\'s Apology',
    sectors: [],
    trigger: { type: 'receipt', event: 'drill:caveIn' },
    channel: 'memory',
    payload: {
      text: 'After the dust settles the seismograph prints one anomalous line — a low, regular pulse under the failure signature, shaped almost like a slowed heartbeat. The drill crews call it the seam apologizing. The geologists call it aftershock. Both groups file it in the same drawer, which is the closest thing to agreement either manages.',
    },
  },

  // SPX-E-072 — The Prospector\'s Grace: said before every bite.
  {
    id: 'SPX-E-072',
    kind: 'comms-event',
    title: 'The Prospector\'s Grace',
    sectors: [],
    trigger: { type: 'receipt', event: 'mining:start' },
    channel: 'commsLog',
    payload: {
      from: 'Drill deck',
      text: 'Before the first bite the old hands say the grace — four words, unwritten, the same in every yard: TAKE ONLY WHAT SINGS. The new hands think it is about ore. It is not about ore. It is the only prayer the belt has that fits in a checklist.',
    },
  },

  // SPX-E-073 — The Pod\'s Stubborn Half: one half always resists.
  {
    id: 'SPX-E-073',
    kind: 'easter-egg',
    title: 'The Pod\'s Stubborn Half',
    sectors: [],
    trigger: { type: 'receipt', event: 'mining:podSplit' },
    channel: 'commsLog',
    payload: {
      from: 'Deck hands',
      text: 'Every pod splits a little wrong — one half always heavier, always the half facing the rock. The miners call it the stubborn half and bet on which way it will lean. The geologists have a paper on it. The miners have a pool on the paper.',
    },
  },

  // SPX-E-074 — The Losing Lane\'s Applause: last place gets a hand.
  {
    id: 'SPX-E-074',
    kind: 'comms-event',
    title: 'The Losing Lane\'s Applause',
    sectors: [],
    trigger: { type: 'receipt', event: 'race:ended' },
    channel: 'commsLog',
    payload: {
      from: 'Race wire',
      text: 'The winner takes the purse but the last hull home gets the applause — the racing crews\' oldest rule, clapping for whoever came in behind the news. The applause is real, and it is mercy: nobody on the wire claps for a winner. Winners already know.',
    },
  },

  // SPX-E-075 — The Notary\'s Fee: a claim costs a story.
  {
    id: 'SPX-E-075',
    kind: 'easter-egg',
    title: 'The Notary\'s Fee',
    sectors: [],
    trigger: { type: 'receipt', event: 'claim:claimed' },
    channel: 'commsLog',
    payload: {
      from: 'Claim notary',
      text: 'The claim fee is a credit and a story — the notary records, alongside the coordinates, one line about how you found the rock. It is filed forever. Two hundred years of claims read like an anthology of luck, lies, and one entry that only says: I WAS LOST. That claim paid best.',
    },
  },

  // SPX-E-076 — The Convoy\'s Arrival Toast: logged, on the house.
  {
    id: 'SPX-E-076',
    kind: 'comms-event',
    title: 'The Convoy\'s Arrival Toast',
    sectors: [],
    trigger: { type: 'receipt', event: 'claim:convoyDocked' },
    channel: 'commsLog',
    payload: {
      from: 'Harbor office',
      text: 'A convoy docking sets off the office\'s one generosity: the arrivals board prints every hull name on the toast line, on the house. The line is ceremonial — it buys nothing — but crews photograph it anyway. The board has never misspelled a name. It is the only perfection on record.',
    },
  },

  // SPX-E-077 — The Wake Fee: arrivals pay in decibels.
  {
    id: 'SPX-E-077',
    kind: 'easter-egg',
    title: 'The Wake Fee',
    sectors: [],
    trigger: { type: 'receipt', event: 'jump:arrive' },
    channel: 'commsLog',
    payload: {
      from: 'Arrival net',
      text: 'The lane charges no toll at the jump mouth — the toll is the wake itself, every arrival\'s turbulence logged as payment-in-noise to the field that lets you through. The field\'s ledger is metaphorical, but the noise is real, and the old-timers say a loud arrival is a rich one.',
    },
  },

  // SPX-E-078 — The Long Hum: cruise has a frequency.
  {
    id: 'SPX-E-078',
    kind: 'anomaly',
    title: 'The Long Hum',
    sectors: [],
    trigger: { type: 'receipt', event: 'cruise:engaged' },
    channel: 'memory',
    payload: {
      text: 'At cruise the drive settles to one sustained note, and the old survey ships taught the lanes to listen for it — the hum is how the field knows a hull is serious about somewhere. Charts mark the note\'s frequency as a landmark. The landmark moves. The charts shrug.',
    },
  },

  // SPX-E-079 — The Responder\'s Rebate: mercy has a discount.
  {
    id: 'SPX-E-079',
    kind: 'easter-egg',
    title: 'The Responder\'s Rebate',
    sectors: [],
    trigger: { type: 'receipt', event: 'rescue:started' },
    channel: 'commsLog',
    payload: {
      from: 'Lane desk',
      text: 'Start a rescue and the lane\'s fees quietly halve for the duration — an old statute, never repealed, rewarding anyone who turns toward a mayday. It is the cheapest fuel in the sector, and the statute is written so the rescue has to be real. The lane cannot be fooled into charity. It can only be fooled into hope.',
    },
  },

  // SPX-E-080 — The Rescued\'s Debt: the awkward math of gratitude.
  {
    id: 'SPX-E-080',
    kind: 'comms-event',
    title: 'The Rescued\'s Debt',
    sectors: [],
    trigger: { type: 'receipt', event: 'rescue:complete' },
    channel: 'commsLog',
    payload: {
      from: 'Tow register',
      text: 'The rescued party owes nothing — the register is clear on that — but the tradition is a favor owed anyway, unquantified, indefinite. The register records the tradition without endorsing it: A DEBT THAT IS NOT A DEBT, it says, IS THE ONLY KIND THAT SURVIVES THE DARK.',
    },
  },

  // SPX-E-081 — The Yard\'s Tithe: salvage owes the wreck one thing.
  {
    id: 'SPX-E-081',
    kind: 'comms-event',
    title: 'The Yard\'s Tithe',
    sectors: [],
    trigger: { type: 'receipt', event: 'salvage:completed' },
    channel: 'commsLog',
    payload: {
      from: 'Salvage yard',
      text: 'Finished salvage owes the wreck a tithe — not paid, returned: one piece of the hulk left welded in place, the yard\'s rule that a stripped ship keeps one thing it owned. On old wrecks you can see the tithing trail, weld by weld, back to the first salvager who felt guilty and started the custom.',
    },
  },

  // SPX-E-082 — The Recorder\'s Last Words: heard in the yard office.
  {
    id: 'SPX-E-082',
    kind: 'anomaly',
    title: 'The Recorder\'s Last Words',
    sectors: [],
    trigger: { type: 'receipt', event: 'salvage:communicatorFound' },
    channel: 'memory',
    payload: {
      text: 'A found communicator gets played once in the yard office before it is handed over — the yard\'s rule, standing since the first war: hear the dead before you bill the living. The office keeps a book of the last words. The book is short. Most of them are about the cargo.',
    },
  },

  // SPX-E-083 — The Wreck\'s Reading Fee: you scan, it charges.
  {
    id: 'SPX-E-083',
    kind: 'easter-egg',
    title: 'The Wreck\'s Reading Fee',
    sectors: [],
    trigger: { type: 'receipt', event: 'scan:wreckInvestigated' },
    channel: 'commsLog',
    payload: {
      from: 'Chart office',
      text: 'Investigating a wreck incurs the reading fee — a real deduction, one the chart office defends by pointing to the register: the dead pay no fees, so the curious pay them. The fee is small. The office calls it the cheapest moral in the book.',
    },
  },

  // SPX-E-084 — The Survey\'s Postage: filed under stamps.
  {
    id: 'SPX-E-084',
    kind: 'easter-egg',
    title: 'The Survey\'s Postage',
    sectors: [],
    trigger: { type: 'receipt', event: 'signal:surveyFiled' },
    channel: 'commsLog',
    payload: {
      from: 'Survey desk',
      text: 'The filed survey is stamped with the desk\'s oldest seal — an actual stamp, the pre-digital kind, kept in a drawer and applied to the paper copy nobody needs. The desk keeps the stamp because the seal ring was issued by a bureau that closed. The stamping outlives the bureau. That is the point of stamps.',
    },
  },

  // SPX-E-085 — The Name Retired: beaten aces leave the list.
  {
    id: 'SPX-E-085',
    kind: 'comms-event',
    title: 'The Name Retired',
    sectors: [],
    trigger: { type: 'receipt', event: 'encounter:namedCaptainDefeated' },
    channel: 'commsLog',
    payload: {
      from: 'Ace register',
      text: 'A named captain goes down and the register does the thing it does only for names: the entry stays, but the type changes to the small italic reserved for the retired — not dead, the register insists, only out of circulation. Aces come back. The italics wait.',
    },
  },

  // SPX-E-086 — The Haven\'s Tribute: a boss falls, the haven pays.
  {
    id: 'SPX-E-086',
    kind: 'comms-event',
    title: 'The Haven\'s Tribute',
    sectors: ['sector_sker_haven'],
    trigger: { type: 'receipt', event: 'boss:defeated' },
    channel: 'commsLog',
    payload: {
      from: 'Haven wire',
      text: 'The haven posts a tribute for the fallen boss — not mourning, tribute: the one thing the haven buys respectfully is a strong enemy. The tribute is a set of dock lights left on for a night nobody pays for. The haven calls it the best money it never spent.',
    },
  },

  // SPX-E-087 — The Service Joke: the bill\'s last line.
  {
    id: 'SPX-E-087',
    kind: 'easter-egg',
    title: 'The Service Joke',
    sectors: [],
    trigger: { type: 'receipt', event: 'service:completed' },
    channel: 'commsLog',
    payload: {
      from: 'Service desk',
      text: 'Every service bill ends with the same footer, unpriced, uncommissioned, older than the desk: NO CHARGE FOR THE AIR. The joke is that there is always a charge for the air — itemized, line three. The footer survives because the desk thinks the joke is the warranty.',
    },
  },

  // SPX-E-088 — The Chronicler\'s Margin: your story gets a footnote.
  {
    id: 'SPX-E-088',
    kind: 'anomaly',
    title: 'The Chronicler\'s Margin',
    sectors: [],
    trigger: { type: 'receipt', event: 'story:beatAdvanced' },
    channel: 'memory',
    payload: {
      text: 'Somewhere in the Archive a page updates — the chronicler\'s desk keeps a running margin on every name that has ever mattered, and yours just got another line. You will never see the page. The desk\'s oldest rule: the margin is for the record, not the remembered.',
    },
  },

  // SPX-E-089 — The Ace\'s Bequest: what return requests carry.
  {
    id: 'SPX-E-089',
    kind: 'comms-event',
    title: 'The Ace\'s Bequest',
    sectors: [],
    trigger: { type: 'receipt', event: 'aceMemory:returnRequested' },
    channel: 'comms',
    payload: {
      from: 'Ace register',
      text: 'A memory comes home — the register notes the return in the same line it noted the loss, closing a parenthesis it has held, in some cases, for decades. The register\'s note reads: RETURNED. CLOSED. LEFT OPEN. It is the only entry in the book allowed three conclusions.',
      ttl: 8,
    },
  },

  // SPX-E-090 — The Heir\'s First Lesson: named, and named for.
  {
    id: 'SPX-E-090',
    kind: 'comms-event',
    title: 'The Heir\'s First Lesson',
    sectors: [],
    trigger: { type: 'receipt', event: 'aceMemory:heirNamed' },
    channel: 'commsLog',
    payload: {
      from: 'Ace register',
      text: 'An heir is named and the register ships them the one thing aces inherit before anything else: the enemy list, footnoted. Not to settle it — the register is careful on that point — only so the heir knows which names wave at them in the dark. The first lesson is always a map of grudges.',
    },
  },

  // SPX-E-091 — The Surfer\'s Tithe: massline riders pay the wave.
  {
    id: 'SPX-E-091',
    kind: 'easter-egg',
    title: 'The Surfer\'s Tithe',
    sectors: [],
    trigger: { type: 'receipt', event: 'massline:rideStarted' },
    channel: 'commsLog',
    payload: {
      from: 'Lane surfers',
      text: 'The old riders pay the massline a tithe — one degree of burn, burned deliberately off the line, owed to the wave for carrying you. It buys nothing; it is just manners. But the riders insist the line runs colder for the ones who skip it. Nobody has checked. Nobody will.',
    },
  },

  // SPX-E-092 — The Tow Hand\'s Blessing: the assist that is a vow.
  {
    id: 'SPX-E-092',
    kind: 'comms-event',
    title: 'The Tow Hand\'s Blessing',
    sectors: [],
    trigger: { type: 'receipt', event: 'npcJobs:towAssistComplete' },
    channel: 'commsLog',
    payload: {
      from: 'Tow register',
      text: 'A completed tow-assist gets the register\'s old blessing appended to the receipt: AND MAY YOUR OWN LINE HOLD WHEN IT MATTERS. It is boilerplate — it prints on every receipt — and it still lands, every time, because out here it is the only blessing that is also a statistic.',
    },
  },

  // SPX-E-093 — The Foreman\'s Apology: returned workers get one.
  {
    id: 'SPX-E-093',
    kind: 'comms-event',
    title: 'The Foreman\'s Apology',
    sectors: [],
    trigger: { type: 'receipt', event: 'rescuedWorker:returned' },
    channel: 'commsLog',
    payload: {
      from: 'Shift office',
      text: 'A returned worker is met at the airlock by the foreman — not to debrief, to apologize, on the record, for the report that said lost. The office keeps a book of the apologies. It is the only book in the company library that is checked out, and the only report ever issued with a heartbeat.',
    },
  },

  // SPX-E-094 — The Reading Fee: the Archive charges attention.
  {
    id: 'SPX-E-094',
    kind: 'easter-egg',
    title: 'The Reading Fee',
    sectors: [],
    trigger: { type: 'receipt', event: 'archive:indexRead' },
    channel: 'commsLog',
    payload: {
      from: 'Archive desk',
      text: 'The Archive does not charge for the index — it charges for the attention. A reading fee, one credit a page, on the principle that nobody should learn what the Archive knows for free. The fee funds the reading room\'s one luxury: silence, maintained by a full-time door.',
    },
  },

  // SPX-E-095 — The Helix Compliment: a correct manifest, noticed.
  {
    id: 'SPX-E-095',
    kind: 'easter-egg',
    title: 'The Helix Compliment',
    sectors: [],
    trigger: { type: 'receipt', event: 'helix:manifestFiled' },
    channel: 'commsLog',
    payload: {
      from: 'Helix desk',
      text: 'A clean manifest earns the desk\'s one compliment — a checkmark in blue, the color reserved for filings that needed nothing. Most manifests get the red tick of review. Blue is rarer than praise anywhere else in the sector, and the desk knows it. Blue is how the desk says hello.',
    },
  },

  // SPX-E-096 — The Settled Ledger\'s Toast: debts end with a ring.
  {
    id: 'SPX-E-096',
    kind: 'comms-event',
    title: 'The Settled Ledger\'s Toast',
    sectors: [],
    trigger: { type: 'receipt', event: 'frontier:debtSettled' },
    channel: 'commsLog',
    payload: {
      from: 'Settlement desk',
      text: 'A settled debt rings a small bell at the settlement desk — a real bell, rung by the clerk whose name is on the account. The desk\'s rule: debt is settled by paperwork, but it is celebrated by sound. The bell has rung forty thousand times. The clerks still count.',
    },
  },

  // SPX-E-097 — The Deed\'s Second Witness: someone always signs twice.
  {
    id: 'SPX-E-097',
    kind: 'anomaly',
    title: 'The Deed\'s Second Witness',
    sectors: [],
    trigger: { type: 'receipt', event: 'frontier:deed' },
    channel: 'memory',
    payload: {
      text: 'Every deed registers two witnesses — you, and a second signature the registry cannot trace to anyone. The signature is always the same hand, in different inks, decades apart, on deeds from sectors that never met. The registry calls it a stamp error. The stamps have been retired twice. The hand persists.',
    },
  },

  // SPX-E-098 — The Receipt\'s Last Page: paid obligations have a footer.
  {
    id: 'SPX-E-098',
    kind: 'comms-event',
    title: 'The Receipt\'s Last Page',
    sectors: [],
    trigger: { type: 'receipt', event: 'law:obligationPaid' },
    channel: 'commsLog',
    payload: {
      from: 'Law desk',
      text: 'The paid receipt prints a last page nobody asks for — a footer listing, in small type, what the obligation actually bought: one entry in the ledger of the law, updated, legible, permanent. It is the only receipt in the sector that itemizes your own name as merchandise.',
    },
  },

  // SPX-E-099 — The Third Headline: the wire notices regulars.
  {
    id: 'SPX-E-099',
    kind: 'comms-event',
    title: 'The Third Headline',
    sectors: [],
    trigger: { type: 'receipt', event: 'news:headline', nth: 3 },
    channel: 'commsLog',
    payload: {
      from: 'News wire',
      text: 'Three headlines in and the wire starts recognizing your name — a small notation appears under your entries: REPEAT. It is not a compliment. It is not an accusation. It is just the wire admitting, in print, that you have become weather.',
    },
  },

  // SPX-E-100 — The Registrar\'s Condolence: the last courtesy.
  {
    id: 'SPX-E-100',
    kind: 'easter-egg',
    title: 'The Registrar\'s Condolence',
    sectors: [],
    trigger: { type: 'receipt', event: 'game:over' },
    channel: 'commsLog',
    payload: {
      from: 'Registrar',
      text: 'At the end the registrar sends one line, on the oldest form the office still uses: NOTED, WITH REGRET. It is the only form in the registry that admits a feeling. It was drafted by a clerk who outlived everyone she ever filed. The office kept it because the feeling was correct.',
    },
  },
];
