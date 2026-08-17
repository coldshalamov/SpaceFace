// Short Codex retellings of the player deeds already owned by systems/titles.js. This module is a
// read model only: it never awards a deed, interprets a combat event, or writes story state.

import { PLAYER_DEEDS } from './titles.js';

function deedPage(id, headline, report, fieldNote) {
  const source = PLAYER_DEEDS.find((entry) => entry.id === id);
  if (!source) throw new Error(`Unknown player deed: ${id}`);
  return Object.freeze({
    id,
    title: source.title,
    headline,
    report,
    fieldNote,
  });
}

export const CODEX_DEEDS = Object.freeze([
  deedPage(
    'deed_rockbreaker',
    'HOSTILE HULL LOST TO BELT TERRAIN',
    'A hostile went into a tumble and came apart on rock. The pilot who started it did not need a second shot.',
    'Working note: once a hull is tumbling, put solid terrain in the rest of its lane.',
  ),
  deedPage(
    'deed_undertow',
    'ONE HULL CARRIES THROUGH ANOTHER',
    'Two hostiles met on one line. The first arrived sideways and the second paid for the remaining momentum.',
    'Working note: a moving hull is mass you already own. Keep the Massline clear before release.',
  ),
  deedPage(
    'deed_three_deep',
    'THREE LOSSES FOLLOW ONE MOVING HULL',
    'One tumbling hull stayed useful through a third loss. Nobody on the lane called the later contacts accidental.',
    'Working note: preserve the source hull\'s speed and line; every correction spends the next impact.',
  ),
  deedPage(
    'deed_wellhand',
    'GRAVITY WELL CLOSES WITH A HULL INSIDE',
    'A hostile entered a collapsing well and did not leave it. Recovery crews logged the field as the weapon.',
    'Working note: the last safe correction happens before the collapse, not during it.',
  ),
  deedPage(
    'deed_smokewalker',
    'ATMOSPHERE TAKES ANOTHER UNPAID LOAD',
    'A hostile crossed the burn line without a clean climb. The hull became a brief weather report.',
    'Working note: gravity and heat finish what a damaged drive cannot correct.',
  ),
  deedPage(
    'deed_yardhand',
    'HEAVY HULL LEAVES THE FIGHT AS A BARGE',
    'A working heavy lost its last useful assembly and stayed alive. The remaining hull was towage, not a kill.',
    'Working note: strip the mounted parts; the disabled parent stays recoverable.',
  ),
  deedPage(
    'deed_linehauler',
    'STRIPPED HEAVY MOVES UNDER MASSLINE',
    'A disabled heavy crossed the ledger as cargo while its living hull remained intact. The line did the hauling.',
    'Working note: settle the barge before taking load, then keep the tow out of cross-traffic.',
  ),
  deedPage(
    'deed_keelbreaker',
    'CAPITAL HULL ENTERS THE LOSS LEDGER',
    'A capital-class hull stopped answering under player fire. The wreck crews needed a wider approach than the battle did.',
    'Working note: remove the working parts first; the parent hull carries more danger after the guns go quiet.',
  ),
]);

export function codexDeedPages(story = {}) {
  const deedState = story && story.titles && story.titles.playerDeeds;
  const earnedById = deedState && deedState.earnedById && typeof deedState.earnedById === 'object'
    ? deedState.earnedById : {};
  return CODEX_DEEDS.map((page) => {
    const record = earnedById[page.id];
    const receiptId = record && typeof record.receiptId === 'string' ? record.receiptId.trim() : '';
    return {
      ...page,
      earned: Boolean(receiptId),
      earnedTick: receiptId && Number.isFinite(Number(record.earnedTick))
        ? Math.max(0, Math.floor(Number(record.earnedTick))) : null,
      receiptId: receiptId || null,
    };
  });
}
