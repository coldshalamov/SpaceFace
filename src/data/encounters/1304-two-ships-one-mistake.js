// TWO SHIPS, ONE MISTAKE — two medium haulers stuck by a leaked film on the
// Tethys trade lane. Offered, declined for free, and settled by the adhesive law.
import { deepFreeze, defineEncounter } from './catalog.js';
import { TWO_SHIPS_ONE_MISTAKE_RUNTIME } from '../../systems/twoShipsOneMistakeRuntime.js';

export const encounterOrder = 1304;
export const trigger = deepFreeze({
  id: 'two_ships_one_mistake', tier: 'ambient', deck: 'civilian', weight: 0.55,
  zoneTypes: ['trade_lane'], script: 'selfRegistered', pressureCost: 8,
  cooldownS: 1800, proximity: true, rare: true,
  earlyWindowGuaranteeDay: 0, earlyDelayS: [45, 180],
  gates: { sectorIds: ['sector_tethys_junction'] },
});
export const runtime = TWO_SHIPS_ONE_MISTAKE_RUNTIME;
export default defineEncounter(trigger, {
  shape: {
    situation: 'set_piece',
    place: 'trade_lane',
    twist: 'named',
    actor: 'faction_mts',
  },
  title: 'TWO SHIPS, ONE MISTAKE.',
  factionId: 'faction_mts',
  motive: 'the load should stay whole or come apart clean',
  primaryLine: 'JUNCTION DISPATCH: Two haulers kissed on the lane and the film held. '
    + 'One crew wants them cut apart. The other wants the load kept whole. '
    + 'Take the job and two cans of polymers are yours. Walk away and nothing moves.',
  choices: [
    { id: 'take', label: 'Take the job', playerLine: 'I will work the film.' },
    { id: 'decline', label: 'Leave the pair', playerLine: 'Not my pair.' },
  ],
  timeoutChoice: 'decline',
  receipts: {
    declined: 'JOB DECLINED — the pair was never yours. Your hold and your account are unchanged.',
    separated: 'CUT CLEAN — the film let go under a quiet pull. The crews go their own way. +240 cr.',
    paired: 'PAIR AT THE HUB — both hulls arrived still stuck together. The load stayed whole. +360 cr.',
    snapped: 'THE BOND SNAPPED — the load is loose in the lane. No bonus for a violent cut.',
    drifted: 'THE FILM LET GO WHILE THEY WERE STILL PULLING. No one pays for a half-finished cut.',
    harmed: 'A HULL IS GONE — there is no pay for breaking the crew.',
    lost: 'The pair is gone from the lane. There is nothing left to pay.',
    left: 'The lane stops watching. The pair is still out there.',
  },
});
