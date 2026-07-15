import { defineFlavorPack } from './catalog.js';

export const flavorOrder = 30;
export const flavorId = 'graffiti';
export const flavorKind = 'graffiti';

export default defineFlavorPack({
  id: flavorId,
  kind: flavorKind,
  description: 'Dormant event-driven graffiti additions for Vols, Senna, and player memory.',
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
  ],
});
