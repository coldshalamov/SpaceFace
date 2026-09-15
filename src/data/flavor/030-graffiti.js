import { defineFlavorPack } from './catalog.js';

export const flavorOrder = 30;
export const flavorId = 'graffiti';
export const flavorKind = 'graffiti';

export default defineFlavorPack({
  id: flavorId,
  kind: flavorKind,
  description: 'Event-driven graffiti for Vols, Senna, player memory, and live conflict fallout.',
  entries: [
    { id: 'vols_01', set: 'vols_hand', hand: 'vols', text: 'BORROWED TIME. PORT CLOCK SAYS I OWE ELEVEN YEARS.' },
    { id: 'vols_02', set: 'vols_hand', hand: 'vols', text: 'I SIGNED THE LOG. SOMEBODY ELSE KEPT FLYING.' },
    { id: 'vols_03', set: 'vols_hand', hand: 'vols', text: 'ELEVEN YEARS MISSING. HULL CLOCK DISAGREES.' },
    { id: 'vols_04', set: 'vols_hand', hand: 'vols', text: 'CLEAN LOG. ELEVEN YEARS STILL MISSING.' },
    { id: 'vols_05', set: 'vols_hand', hand: 'vols', text: 'WE ALREADY TRIED YOUR FIRST IDEA.' },
    { id: 'kind_01', set: 'kindness', text: 'SOMEONE LEFT AIR HERE. LEAVE SOME TOO.' },
    { id: 'kind_02', set: 'kindness', text: 'THE PILOT STOPPED FOR OUR POD. THAT WAS ENOUGH.' },
    { id: 'kind_03', set: 'kindness', text: 'NO BOUNTY POSTED. THEY CAME ANYWAY.' },
    { id: 'kind_04', set: 'kindness', text: 'YOU HELD FIRE UNTIL THE POD CLEARED.' },
    { id: 'cynic_01', set: 'cynic', text: 'KINDNESS IS DEBT WITHOUT PAPERWORK.' },
    { id: 'cynic_02', set: 'cynic', text: 'EVERY RESCUE INVOICES SOMEONE.' },
    { id: 'cynic_03', set: 'cynic', text: 'HEROES DOCK FIRST. WITNESSES WAIT.' },
    { id: 'cynic_04', set: 'cynic', text: 'THE GALAXY THANKS YOU AT MARKET RATE.' },
    { id: 'senna_01', set: 'senna_name', templateKey: 'recoveredName', text: '{name} WAS HERE. WE REMEMBERED.' },
    { id: 'senna_02', set: 'senna_name', templateKey: 'recoveredName', text: 'SENNA FOUND {name}. KEEP IT FOUND.' },
    { id: 'senna_03', set: 'senna_name', templateKey: 'recoveredName', text: '{name} MADE IT HOME IN INK.' },
    // Testimony set: named numbers, named beneficiaries. The wall keeps the receipt.
    { id: 'test_01', set: 'testimony', text: 'SHAFT 7. NINE OF ELEVEN. THE OTHER TWO ARE A COLUMN.' },
    { id: 'test_02', set: 'testimony', text: 'R3-CARRIER LEFT YEAR 3. NEVER REPLACED. YEAR 17.' },
    { id: 'test_03', set: 'testimony', text: 'THE ENGINE DID NOT NAME US. THE ENGINE DOES NOT NAME ANYONE.' },
    { id: 'test_04', set: 'testimony', text: 'ATMO TOKEN UP. PIT AIR DOWN. SAME DESK.' },
    { id: 'test_05', set: 'testimony', text: 'FORTY-ONE HULLS. FORTY-ONE FILINGS. ZERO CARGO.' },
    { id: 'test_06', set: 'testimony', text: 'KESSLER. SCALE 4. TYCHO. NINETEEN YEARS.' },
    // Elroy residue: the third tag the kill feed overwrote. Same-dock guarantee.
    { id: 'elroy_01', set: 'elroy_tag', text: 'THE TAG FLICKERED HALF A SECOND. IT COUNTED.' },
    { id: 'elroy_02', set: 'elroy_tag', text: 'THEY WERE CARRYING MEDICINE. THE FEED SAYS THREAT.' },
    // Conflict-flip mourning at Sker Bazaar. These are physical wall reactions, selected only
    // from a saved factions-owned flip fact when the player docks at Sker.
    { id: 'war_sker_01', set: 'war_sker_mourning', reactsTo: 'conflict_flip', author: 'Sker wall', text: 'THE MAP SAYS {sector} CHANGED HANDS. THE EMPTY BERTHS SAY WHO PAID.' },
    { id: 'war_sker_02', set: 'war_sker_mourning', reactsTo: 'conflict_flip', author: 'Sker wall', text: '{winner} TOOK {sector}. WE KEPT THE NAMES THEY LEFT OUT.' },
    { id: 'war_sker_03', set: 'war_sker_mourning', reactsTo: 'conflict_flip', author: 'Sker wall', text: '{sector} FLIPPED. THREE CREWS DID NOT. COUNT THEM BEFORE THE FLAGS.' },
    { id: 'war_sker_04', set: 'war_sker_mourning', reactsTo: 'conflict_flip', author: 'Sker wall', text: 'NEW FLAG OVER {sector}. SAME COLD BUNKS BELOW IT.' },
    { id: 'war_sker_05', set: 'war_sker_mourning', reactsTo: 'conflict_flip', author: 'Sker wall', text: '{loser} LOST THE LANE. THE WALL LOST SIX MORE NAMES.' },
    { id: 'war_sker_06', set: 'war_sker_mourning', reactsTo: 'conflict_flip', author: 'Sker wall', text: 'THE DESK CALLS {sector} SETTLED. SKER CALLS THE DEAD BY NAME.' },
    // war_quiet_whisper — the Quiet treat a flag change as a rumor; the real route never moved.
    { id: 'war_quiet_01', set: 'war_quiet_whisper', reactsTo: 'conflict_flip', author: 'Quiet channel', text: 'THE {sector} HANDOFF CHANGED HANDS. THE REAL ROUTE DID NOT.' },
    { id: 'war_quiet_02', set: 'war_quiet_whisper', reactsTo: 'conflict_flip', author: 'Quiet channel', text: '{winner} CHECKPOINTS ASK NEW QUESTIONS AT {sector}. OLD ANSWERS STILL WORK.' },
    { id: 'war_quiet_03', set: 'war_quiet_whisper', reactsTo: 'conflict_flip', author: 'Quiet channel', text: '{loser} NEVER HELD {sector}. THEY ONLY PAID THE TOLL.' },
    { id: 'war_quiet_04', set: 'war_quiet_whisper', reactsTo: 'conflict_flip', author: 'Quiet channel', text: 'SAY NOTHING AT {sector}. {winner} LISTENS HARDER THAN {loser} DID.' },
    { id: 'war_quiet_05', set: 'war_quiet_whisper', reactsTo: 'conflict_flip', author: 'Quiet channel', text: '{sector} FLIPPED. THE QUIET ALREADY HAD THE NEXT DOOR.' },
    { id: 'war_quiet_06', set: 'war_quiet_whisper', reactsTo: 'conflict_flip', author: 'Quiet channel', text: 'A FLAG IS A RUMOR. {sector} MOVED WHEN THE CARGO DID.' },
    // war_vael_keel — the Vael read every ownership line as a countdown on fresh ground.
    { id: 'war_vael_01', set: 'war_vael_keel', reactsTo: 'conflict_flip', author: 'Vael keel-mark', text: '{sector} WAS ALWAYS VAEL GROUND. THE INTRUDER FLAG WAS A LEASE OF BONES.' },
    { id: 'war_vael_02', set: 'war_vael_keel', reactsTo: 'conflict_flip', author: 'Vael keel-mark', text: 'THE {loser} CARCASS MARKS {sector} NOW. {winner} WILL ROT THE SAME.' },
    { id: 'war_vael_03', set: 'war_vael_keel', reactsTo: 'conflict_flip', author: 'Vael keel-mark', text: 'KEEL OVER {sector}. THE VOID KEEPS NO FLAG LONG.' },
    { id: 'war_vael_04', set: 'war_vael_keel', reactsTo: 'conflict_flip', author: 'Vael keel-mark', text: '{winner} COUNTS {sector} A VICTORY. WE COUNT IT A FEEDING GROUND.' },
    { id: 'war_vael_05', set: 'war_vael_keel', reactsTo: 'conflict_flip', author: 'Vael keel-mark', text: 'BLOOD MARKS {sector} BETTER THAN {winner} PAINT.' },
    { id: 'war_vael_06', set: 'war_vael_keel', reactsTo: 'conflict_flip', author: 'Vael keel-mark', text: '{loser} FLED {sector}. THE HUNGER DID NOT.' },
    // war_free_dockline — the Free Frontier refuses to call any flag an owner.
    { id: 'war_free_01', set: 'war_free_dockline', reactsTo: 'conflict_flip', author: 'Free dockline', text: '{sector} FLIPPED FREE OF {loser}. {winner} IS JUST THE NEXT HOLD.' },
    { id: 'war_free_02', set: 'war_free_dockline', reactsTo: 'conflict_flip', author: 'Free dockline', text: 'NO FLAG ASKED US AT {sector}. WE KEEP OUR OWN CHARTS.' },
    { id: 'war_free_03', set: 'war_free_dockline', reactsTo: 'conflict_flip', author: 'Free dockline', text: '{winner} TOOK {sector}. THE DRIFT TAKES EVERYTHING BACK.' },
    { id: 'war_free_04', set: 'war_free_dockline', reactsTo: 'conflict_flip', author: 'Free dockline', text: '{sector} UNDER {winner}: SAME THIN AIR, NEW LANDING FEE.' },
    { id: 'war_free_05', set: 'war_free_dockline', reactsTo: 'conflict_flip', author: 'Free dockline', text: 'WE RAN {sector} BEFORE {loser} NAMED IT. WE RUN IT STILL.' },
    { id: 'war_free_06', set: 'war_free_dockline', reactsTo: 'conflict_flip', author: 'Free dockline', text: 'A NEW OWNER FOR {sector}. THE FREEBOARD STAYS UNPAINTED.' },
    // war_choir_litany — the Ascendant Choir folds a flip into liturgy: a verse, not a verdict.
    { id: 'war_choir_01', set: 'war_choir_litany', reactsTo: 'conflict_flip', author: 'Choir litany', text: 'THE CHOIR COUNTS {sector} AMONG ITS VERSES. {winner} HOLDS A LINE, NOT THE SONG.' },
    { id: 'war_choir_02', set: 'war_choir_litany', reactsTo: 'conflict_flip', author: 'Choir litany', text: '{sector} CHANGED HANDS. NOTHING CHANGES THE RESONANCE.' },
    { id: 'war_choir_03', set: 'war_choir_litany', reactsTo: 'conflict_flip', author: 'Choir litany', text: 'PRAY FOR {loser}: THEIR SIGNAL FADES FROM {sector}.' },
    { id: 'war_choir_04', set: 'war_choir_litany', reactsTo: 'conflict_flip', author: 'Choir litany', text: 'THE ASCENDANCY SEES THE NEW FLAG OVER {sector} AND HUMS THE OLD HYMN.' },
    { id: 'war_choir_05', set: 'war_choir_litany', reactsTo: 'conflict_flip', author: 'Choir litany', text: '{winner} ADMINISTERS {sector}. THE CHOIR REMEMBERS IT ETERNAL.' },
    { id: 'war_choir_06', set: 'war_choir_litany', reactsTo: 'conflict_flip', author: 'Choir litany', text: 'EVERY FLAG OVER {sector} IS A VERSE. THE SONG OUTLASTS THE VERSE.' },
  ],
});
