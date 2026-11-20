/** SWITCHBACK content values. Units: XZ world units, seconds, tonnes. */
export const SWITCHBACK = Object.freeze({
  id: 'switchback',
  encounterId: 'pro_five_convoy_raid',
  title: 'SWITCHBACK',
  sectorId: 'sector_ceres_belt',
  factionId: 'faction_dmc',
  origin: Object.freeze({ x: -1500, z: -700 }),
  heading: 0.1,
  entryRadius: 360,
  maxCarriages: 5,
  minCarriages: 3,
  carriageCount: 4,
  speed: 26,
  durationS: 300,
  offerDurationS: 75,
  // The latch is a service mechanism: matching velocity matters more than damage.
  latchRange: 32,
  latchSpeed: 12,
  latchTension: 0.72,
  latchHoldS: 1.2,
  receiverSpeed: 14,
  receiverPlayerRange: 150,
  receiverHoldS: 1.5,
  escortRange: 500,
  abandonRange: 1700,
  abandonGraceS: 14,
  guardThinkS: 0.35,
  recoveryRange: 420,
  escortReward: 720,
  defenseBonus: 240,
  theftReward: 1650,
  collateralPenalty: 200,
  maxCommandsPerTick: 16,
  maxEffectsPerTick: 24,
  maxCommandReceipts: 64,
  maxEscorts: 3,
  maxRaiderCount: 2,
});

export const SWITCHBACK_CHOICES = Object.freeze([
  Object.freeze({ id: 'escort', label: 'Escort the freight', playerLine: 'I will keep the spindle carrier moving.' }),
  Object.freeze({ id: 'theft', label: 'Inspect the couplers', playerLine: 'I want a closer look at the through-freight.' }),
  Object.freeze({ id: 'decline', label: 'Leave the lane', playerLine: 'I am passing through.' }),
]);

export const SWITCHBACK_BRIEF = 'SWITCHBACK: Four coupled carriages are crossing the Ceres belt. '
  + 'The double-chevron spindle carrier is marked before you commit. Escort it to the freight receiver for lawful pay. '
  + 'To steal it, release BOTH adjacent couplers while matching speed, or break the joints noisily. '
  + 'A pinned or shoved carriage can pull a strained joint apart. The train will brace; the freed mass keeps its momentum. '
  + 'Tow the marked carriage through the side-fork gate, then slow it inside the receiver. Other freight is not the contract.';

export const SWITCHBACK_RECEIPTS = Object.freeze({
  lawful_delivery: 'The spindle carrier reached its freight receiver. Escort pay is settled.',
  lawful_defense: 'The spindle carrier arrived under protection. Escort pay and the defense bonus are settled.',
  lawful_partial: 'The spindle carrier arrived, but the missing freight reduced the escort payment.',
  stolen_escape: 'The marked carrier crossed the side fork and settled at the receiver. The freight is sold once.',
  stolen_collateral: 'The receiver took the marked carrier. Collateral losses reduced the payment; the damage remains on record.',
  failed_theft: 'The marked carrier did not reach the side receiver. No theft payment is due.',
  convoy_lost: 'The marked spindle carrier is lost. Other freight survives where the physics left it.',
  abandoned: 'The escort contract closed after you left the freight lane. No payment is due.',
  declined: 'The freight lane stays open. You made no commitment.',
  invalid_restore: 'The saved freight identity is inconsistent. The contract closed without creating freight or payment.',
});
