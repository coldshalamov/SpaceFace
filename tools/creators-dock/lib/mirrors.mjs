// Fail-closed mirrors of user-content key sets that are not exported by src/data.
// The authoritative accept/reject is the live merge (lib/probeMain.mjs).
// If a mirror key is no longer legal, the probe fails the pack. If the game
// adds a key, the mirror refuses it until this list is updated on purpose.

export const ENCOUNTER_KEYS = Object.freeze([
  'id', 'order', 'tier', 'deck', 'weight', 'zoneTypes', 'script', 'pressureCost', 'cooldownS',
  'proximity', 'gates', 'shape', 'barks', 'receipts',
  'factionId', 'context', 'squad', 'escort', 'boss', 'bossName', 'genuine', 'bait',
  'bark', 'beatS', 'choices', 'timeoutChoice', 'primaryLine', 'title',
  'aftermath', 'anchorPoiId', 'approachR', 'behavior', 'cachePool', 'civilian',
  'engagementTrigger', 'entranceS', 'followOnStub', 'follows', 'genuineChance', 'graffitiOn',
  'guardPay', 'identifyPay', 'identifyPayStep', 'intendedCadence', 'investigateR',
  'killCachePool', 'mirrorCourse', 'motive', 'noCombat', 'noCredits', 'offerS', 'phaseGate',
  'predation', 'presenceNodeId', 'rare', 'requiredPings', 'requiredRep', 'rescuePay', 'routeId',
  'runtimeReady', 'scanS', 'scanTellR', 'services', 'source', 'springR', 'telegraph',
  'transitS', 'triggerKind', 'unitsPerHauler', 'variant', 'windowS',
]);

export const FORBIDDEN_ENCOUNTER_SCRIPTS = Object.freeze(['selfRegistered', 'followOnStub']);

export const ENCOUNTER_TIERS = Object.freeze(['major', 'minor', 'ambient']);
export const ENCOUNTER_DECKS = Object.freeze(['combat', 'civilian', 'mystery', 'patrol']);

export const PLACE_KEYS = Object.freeze([
  'sectorId', 'id', 'name', 'type', 'factionId', 'reason', 'center', 'radius', 'threat',
  'presence', 'anchorPoiId',
]);

export const MODULE_KEYS = Object.freeze([
  'id', 'name', 'slotType', 'size', 'tier', 'mass', 'price', 'requiresTech', 'baseId',
  'energyDraw', 'mods', 'dps', 'range', 'rareOreChance', 'directToCargo',
  'legality', 'behavior', 'description', 'visuals', 'sentence',
  'purchasable', 'unique', 'salvageOnly', 'variantBonuses',
]);

export const MODULE_SLOT_TYPES = Object.freeze(['shield', 'engine', 'cargo', 'mining', 'thruster', 'utility']);

export const KNOWN_LAB_SIGNALS = Object.freeze([
  'tick', 'playerX', 'playerZ', 'playerVelX', 'playerVelZ', 'playerRot',
  'playerAlive', 'hull', 'cap', 'credits', 'tetherActive', 'distance', 'restLength',
  'radiusError', 'radialSpeed', 'tangentialSpeed', 'tangentFraction', 'tension',
  'angularSpeed', 'attachmentActive', 'loadBand', 'mtActive', 'mtPhase', 'mtStrain',
  'orbitAssistActive', 'orbitAssistReason',
  'cmdX', 'cmdZ', 'cmdRejected', 'cmdClamped', 'settles',
]);

export const FRAME_INPUT_KEYS = Object.freeze([
  'moveX', 'moveZ', 'turnIntent', 'boost', 'fire', 'aimAngle', 'reelDelta',
  'masslineHeld', 'lineLength', 'orbitDirection', 'gyreSnare',
]);

export const TETHER_DEF_ID = 'tether_standard';

export const OVERRIDE_APPLIED = Object.freeze({
  ship: Object.freeze(['mass', 'radius', 'hull']),
  enemy: Object.freeze(['dynamic', 'hull', 'level', 'mass', 'radius']),
  asteroid: Object.freeze(['dynamic', 'mass', 'radius']),
});
