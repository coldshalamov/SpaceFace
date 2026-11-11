import { ASH_CACHE_CLEARANCE_TEXT } from './ashCacheAccess.js';
// Mission/contact presentation only. The mission owner validates the actual hulk, tower or core.
const PIECE_NAMES = Object.freeze({
  b1_cut: 'plate', b1_ram: 'wreck hammer', b2_crew: 'rescued tug',
  b3_tow_in: 'yard mass', b3_sling_in: 'yard mass',
  b6_drone: 'drone shield', b6_trader: 'trader ballast', b6_outpost: 'outpost cover',
});
const ROUTES = Object.freeze({
  ashfall_blockade: 'At Ash Cache in Ashfall Reach, dock with the marked dead frigate still on your Line, throw it into the berth, or swing that hulk through the patrol wedge.',
  ashfall_siege: 'At Ash Cache in Ashfall Reach, break the marked tower with swinging mass or cut it down.',
  ashfall_evidence_tow: 'At Ash Cache in Ashfall Reach, bring the marked evidence core into the cache on your Line, or sling it into the berth.',
});
export function deepReachBriefing(operation, callbacks = [], { active = false, clearance = false } = {}) {
  const rows = (Array.isArray(callbacks) ? callbacks : []).filter(row => row && PIECE_NAMES[row.id]);
  const names = [...new Set(rows.map(row => PIECE_NAMES[row.id]))];
  const title = `${operation.label}${names.length ? `: ${names[names.length - 1]}` : ''}`;
  const route = ROUTES[operation.id] || operation.instruction || '';
  const pieces = names.length
    ? `${active ? 'Retained working pieces' : 'On acceptance, your earlier work supplies'}: ${names.join(', ')}. These are optional working pieces; the marked mission target settles the contract.`
    : '';
  return { title, brief: [clearance ? ASH_CACHE_CLEARANCE_TEXT : '', route, pieces, 'Return to the Ash Cache desk afterward.'].filter(Boolean).join(' ') };
}
