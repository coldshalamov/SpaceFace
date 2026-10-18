// Adhesive film. One spray, one sheet: purchase falls as the lighter hull gets
// heavier, and the load is the separating momentum that sheet has to cancel.
// A miss (too fast, too far, or nothing in the hold) leaves no status behind.

export const ADHESIVE = Object.freeze({
  filmNewtons: 2400,
  referenceMass: 16,
  wearPerSecond: 0.05,
  coatMin: 0.08,
  bridgeGap: 2.4,
  sprayReach: 8,
  depositClosingMax: 14,
  polymerId: 'cmdty_polymers',
  polymerCost: 1,
  maxCoatings: 16,
  maxBridges: 8,
});

export const ADHESIVE_LINES = Object.freeze({
  sprayTook: 'The spray took. A film is sticking to that surface.',
  bridged: 'The film bridged the two hulls.',
  snapped: 'The bond snapped.',
  woreThrough: 'The coating wore through and the bond let go.',
  wornOff: 'The coating has worn off.',
});
