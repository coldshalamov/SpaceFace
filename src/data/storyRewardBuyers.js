// storyRewardBuyers.js — who buys a unique wreck's story item, and what each sale costs.
//
// A claimed story commodity (data/uniqueWrecks.js `uniqueDrops[].choices`) is evidence the pilot
// carries until someone reads it. This table names each buyer, the berth they keep, and the
// consequence. Pure data plus pure reads: the bar (ui/station/barContacts.js) shows the buyer at a
// matching berth; the sim owner (systems/uniqueWrecks.js) settles the sale and records it in
// `player.uniqueWrecks.storyRewards[rewardId].disposition`. Nothing here writes state.
import { SECTORS } from './sectors.js';

const STATION_BY_ID = new Map();
for (const sector of SECTORS) {
  for (const station of (sector.stations || [])) STATION_BY_ID.set(station.id, station);
}

/** Bar contact ids carry this prefix + the reward id; the sim owner listens for it on ui:talkContact. */
export const STORY_BUYER_CONTACT_PREFIX = 'contact_story_buyer:';
/** Choice ids carry this prefix + the disposition id. */
export const STORY_BUYER_CHOICE_PREFIX = 'story_dispose:';
export const STORY_BUYER_DECLINE_CHOICE = 'story_buyer_later';

function isBlackMarket(station) {
  return !!station && (station.type === 'blackmarket'
    || (Array.isArray(station.services) && station.services.includes('black_market')));
}

/** Berth rules, by the authored choice id. Read from real station faction and service data. */
const BERTH_RULES = Object.freeze({
  // Meridian buys back its own paper at a Meridian berth.
  meridian: (st) => st.factionId === 'faction_mts' && !isBlackMarket(st),
  // Concord dockets only at a lawful Concord berth.
  concord: (st) => st.factionId === 'faction_scn' && !isBlackMarket(st),
  // The independent press prints at Free Frontier berths (no syndicate, no navy, no fence).
  independent: (st) => st.factionId === 'faction_free' && !isBlackMarket(st),
  // A quiet buyer only at a black-market berth.
  fence: (st) => isBlackMarket(st),
});

const D = (row) => Object.freeze({ ...row, repDeltas: Object.freeze((row.repDeltas || []).map((r) => Object.freeze({ ...r }))) });

/**
 * rewardId -> disposition id -> buyer row. `repDeltas[].factionId === 'station'` means the faction
 * of the berth where the sale happens (the fence's own house).
 */
export const STORY_REWARD_BUYERS = Object.freeze({
  unique_lost_ledger: Object.freeze({
    itemName: 'Lost Ledger',
    wreckId: 'wreck_mts_silver_draft',
    choices: Object.freeze({
      sell_meridian: D({
        berth: 'meridian',
        buyerName: 'Meridian Records Clerk', role: 'merchant', roleLabel: 'Syndicate Records',
        line: 'You have a ledger we have no record of. We would like to keep it that way.',
        label: 'Sell the Lost Ledger back to Meridian',
        credits: 9000,
        repDeltas: [{ factionId: 'faction_mts', delta: 10 }],
        reply: 'Paid in full. The Silver-Draft never filed late, and you never read page four.',
        news: 'MERIDIAN BUYS BACK A LEDGER IT SAYS NEVER EXISTED. THE SILVER-DRAFT FILE CLOSES CLEAN.',
      }),
      file_concord: D({
        berth: 'concord',
        buyerName: 'Concord Docket Officer', role: 'merchant', roleLabel: 'Concord Evidence Desk',
        line: 'If that is the Silver-Draft ledger, it is evidence. Evidence gets a docket number.',
        label: 'File the Lost Ledger with Concord',
        credits: 3500,
        repDeltas: [{ factionId: 'faction_scn', delta: 14 }, { factionId: 'faction_mts', delta: -8 }],
        reply: 'Docketed. Recovery award paid. Meridian will hear its name read aloud in a hearing room.',
        news: 'CONCORD DOCKETS THE SILVER-DRAFT LEDGER. MERIDIAN DECLINES TO NAME THE CLERK.',
      }),
      publish_independent: D({
        berth: 'independent',
        buyerName: 'Frontier Press Stringer', role: 'pilot', roleLabel: 'Independent Press',
        line: 'Nobody pays for a ledger like that. Everybody reads one.',
        label: 'Give the Lost Ledger to the Frontier press',
        credits: 1200,
        repDeltas: [{ factionId: 'faction_free', delta: 12 }, { factionId: 'faction_mts', delta: -12 }],
        reply: 'It runs on every board by next shift. The fee is small. The readers are not.',
        news: 'FRONTIER PRESS PRINTS THE SILVER-DRAFT LEDGER IN FULL. MERIDIAN DENIES EVERY LINE.',
      }),
    }),
  }),
  unique_quadrille_seal_log: Object.freeze({
    itemName: 'Quadrille Seal-Log',
    wreckId: 'wreck_mts_quadrille',
    choices: Object.freeze({
      file_public: D({
        berth: 'independent',
        buyerName: 'Frontier Press Editor', role: 'pilot', roleLabel: 'Independent Press',
        line: 'The Quadrille corridor count. Families have waited a long time to read those names.',
        label: 'Make the Quadrille corridor count public',
        credits: 1500,
        repDeltas: [{ factionId: 'faction_free', delta: 10 }, { factionId: 'faction_mts', delta: -6 }],
        reply: 'Posted under the courier’s name, not yours. The families read it before the cleaners did.',
        news: 'THE QUADRILLE CORRIDOR COUNT IS PUBLIC. FAMILIES READ THE NAMES BEFORE MERIDIAN COULD.',
      }),
      sell_quiet: D({
        berth: 'fence',
        buyerName: 'Quiet Buyer', role: 'smuggler', roleLabel: 'Back-Room Buyer',
        line: 'A list of names has a price. I pay it, and nobody ever reads the list.',
        label: 'Sell the Quadrille Seal-Log quietly',
        credits: 7200,
        repDeltas: [{ factionId: 'station', delta: 6 }, { factionId: 'faction_free', delta: -4 }],
        reply: 'Cash, no receipt. The names have an owner now, and it is not their families.',
        news: 'A QUIET BUYER HOLDS THE QUADRILLE NAMES. NO DOCKET OPENED. THE CORRIDOR COUNT STAYS DARK.',
      }),
    }),
  }),
});

export function stationForStoryBuyer(stationId) {
  return STATION_BY_ID.get(stationId) || null;
}

/** The buyer row for `rewardId` + `choiceId`, or null. */
export function storyBuyerRow(rewardId, choiceId) {
  const item = STORY_REWARD_BUYERS[rewardId];
  return (item && item.choices[choiceId]) || null;
}

/** Does this berth host that buyer? */
export function storyBuyerAtStation(rewardId, choiceId, stationId) {
  const row = storyBuyerRow(rewardId, choiceId);
  const station = STATION_BY_ID.get(stationId);
  const rule = row && BERTH_RULES[row.berth];
  return !!(row && station && rule && rule(station));
}

/** Rep deltas with `station` resolved to the berth's own faction. */
export function storyBuyerRepDeltas(row, stationId) {
  const station = STATION_BY_ID.get(stationId);
  const out = [];
  for (const rep of (row && row.repDeltas) || []) {
    const factionId = rep.factionId === 'station' ? (station && station.factionId) : rep.factionId;
    if (factionId && rep.delta) out.push({ factionId, delta: rep.delta });
  }
  return out;
}

/**
 * Every undisposed story item the pilot holds that has a buyer at this berth:
 * [{ rewardId, itemName, choiceIds: [...] }]. Pure read of `player.uniqueWrecks.storyRewards`.
 */
export function storyBuyerOffersAt(state, stationId) {
  const held = state && state.player && state.player.uniqueWrecks && state.player.uniqueWrecks.storyRewards;
  if (!held || typeof held !== 'object' || !STATION_BY_ID.has(stationId)) return [];
  const out = [];
  for (const [rewardId, record] of Object.entries(held)) {
    if (!record || typeof record !== 'object' || record.disposition) continue;
    const item = STORY_REWARD_BUYERS[rewardId];
    if (!item) continue;
    const authored = Array.isArray(record.choices) ? record.choices : Object.keys(item.choices);
    const choiceIds = authored.filter((choiceId) => storyBuyerAtStation(rewardId, choiceId, stationId));
    if (choiceIds.length) out.push({ rewardId, itemName: item.itemName, choiceIds });
  }
  return out;
}
