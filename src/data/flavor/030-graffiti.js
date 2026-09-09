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
  ],
});
