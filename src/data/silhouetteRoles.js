// BP-02.1/C4 Silhouette Threat Language.
//
// Data-only contract for future radar glyphs, target badges, codex copy, and
// BP-08 asset manifests. This module does not pick meshes or draw anything.

const FAMILY_ROWS = Object.freeze([
  Object.freeze({
    id: 'swarmer',
    label: 'Swarmer',
    shape: 'darting-dot',
    radarGlyph: 'dot',
    tell: 'DART',
    tacticalTell: 'Small, fast, and easy to lose in a turn.',
    counterplay: 'Keep it ahead of the nose and punish over-commitment.',
  }),
  Object.freeze({
    id: 'sniper',
    label: 'Sniper',
    shape: 'long-triangle',
    radarGlyph: 'needle',
    tell: 'LANCE',
    tacticalTell: 'Long nose, long reach, poor comfort in a close knot.',
    counterplay: 'Close the angle or break the line before the shot settles.',
  }),
  Object.freeze({
    id: 'brawler',
    label: 'Brawler',
    shape: 'fat-wedge',
    radarGlyph: 'wedge',
    tell: 'WEDGE',
    tacticalTell: 'Wide armor face, short patience, wants a direct trade.',
    counterplay: 'Keep distance, pull it off-axis, and attack from the flank.',
  }),
  Object.freeze({
    id: 'hauler',
    label: 'Hauler',
    shape: 'wide-slab',
    radarGlyph: 'slab',
    tell: 'BULK',
    tacticalTell: 'Broad mass and cargo profile; slow to correct mistakes.',
    counterplay: 'Cut the escape line or hit the escort before the hold.',
  }),
  Object.freeze({
    id: 'carrier',
    label: 'Carrier',
    shape: 'spoked',
    radarGlyph: 'spoke',
    tell: 'COMMAND',
    tacticalTell: 'Command mass with exposed limbs and escort dependence.',
    counterplay: 'Strip escorts, then pressure the central hull.',
  }),
]);

export const SILHOUETTE_FAMILY_IDS = Object.freeze(FAMILY_ROWS.map((row) => row.id));
export const SILHOUETTE_FAMILIES = Object.freeze(Object.fromEntries(
  FAMILY_ROWS.map((row) => [row.id, row]),
));

const ROLE_ROWS = Object.freeze([
  Object.freeze({
    role: 'starter',
    label: 'Starter',
    familyId: 'swarmer',
    tell: 'DART',
    visualFamilies: Object.freeze(['scout']),
    tacticalTell: 'Tiny scout profile; it survives by slipping through lines.',
    counterplay: 'Do not chase the turn; cut off the next escape vector.',
  }),
  Object.freeze({
    role: 'mining',
    label: 'Miner',
    familyId: 'hauler',
    tell: 'DRILL',
    visualFamilies: Object.freeze(['miner']),
    tacticalTell: 'Industrial nose and broad work frame; poor at snap turns.',
    counterplay: 'Stay out of the drill line and force a loaded turn.',
  }),
  Object.freeze({
    role: 'fighter',
    label: 'Fighter',
    familyId: 'swarmer',
    tell: 'KNIFE',
    visualFamilies: Object.freeze(['fighter']),
    tacticalTell: 'Small attack craft; expects to win by crossing your nose.',
    counterplay: 'Brake the overshoot and answer while it is correcting.',
  }),
  Object.freeze({
    role: 'freighter',
    label: 'Freighter',
    familyId: 'hauler',
    tell: 'CARGO',
    visualFamilies: Object.freeze(['freighter']),
    tacticalTell: 'Wide hold, rear coverage, and a predictable escape burn.',
    counterplay: 'Attack from the side or stop the engine line.',
  }),
  Object.freeze({
    role: 'multirole',
    label: 'Multirole',
    familyId: 'brawler',
    tell: 'FLEX',
    visualFamilies: Object.freeze(['multirole']),
    tacticalTell: 'Balanced silhouette; no obvious weak range.',
    counterplay: 'Read the fitted modules before committing.',
  }),
  Object.freeze({
    role: 'interceptor',
    label: 'Interceptor',
    familyId: 'swarmer',
    tell: 'DART',
    visualFamilies: Object.freeze(['fighter']),
    tacticalTell: 'Long-wing fighter profile; lethal during approach windows.',
    counterplay: 'Break the first pass and make it spend its boost.',
  }),
  Object.freeze({
    role: 'mining_barge',
    label: 'Mining Barge',
    familyId: 'hauler',
    tell: 'BRICK',
    visualFamilies: Object.freeze(['miner']),
    tacticalTell: 'Heavy industrial slab; slow, tough, and hard to shove.',
    counterplay: 'Do not trade into the face; work around the mass.',
  }),
  Object.freeze({
    role: 'corvette',
    label: 'Corvette',
    familyId: 'brawler',
    tell: 'GUARD',
    visualFamilies: Object.freeze(['frigate']),
    tacticalTell: 'Compact warship wedge; patrol-grade brawl platform.',
    counterplay: 'Pull it away from escorts and punish the turn reset.',
  }),
  Object.freeze({
    role: 'heavy_hauler',
    label: 'Heavy Hauler',
    familyId: 'hauler',
    tell: 'BULK',
    visualFamilies: Object.freeze(['freighter']),
    tacticalTell: 'Large rectangular freight mass with slow recovery.',
    counterplay: 'Block the route and make it choose cargo or escape.',
  }),
  Object.freeze({
    role: 'explorer',
    label: 'Explorer',
    familyId: 'sniper',
    tell: 'SCOUT',
    visualFamilies: Object.freeze(['multirole']),
    tacticalTell: 'Long sensor profile; reads you before it commits.',
    counterplay: 'Close quickly or break lock with terrain and clutter.',
  }),
  Object.freeze({
    role: 'gunship',
    label: 'Gunship',
    familyId: 'sniper',
    tell: 'LANCE',
    visualFamilies: Object.freeze(['frigate']),
    tacticalTell: 'Long-gun frame; dangerous when it holds a lane.',
    counterplay: 'Stay close, cross the barrel, or force a line change.',
  }),
  Object.freeze({
    role: 'battlecruiser',
    label: 'Battlecruiser',
    familyId: 'brawler',
    tell: 'WEDGE',
    visualFamilies: Object.freeze(['capital']),
    tacticalTell: 'Capital wedge with enough mass to own the center.',
    counterplay: 'Avoid the face and use momentum to peel off escorts.',
  }),
  Object.freeze({
    role: 'flagship',
    label: 'Flagship',
    familyId: 'carrier',
    tell: 'COMMAND',
    visualFamilies: Object.freeze(['capital']),
    tacticalTell: 'Spoked command silhouette; the fight bends around it.',
    counterplay: 'Break the wing first, then isolate the core.',
  }),
]);

export const SILHOUETTE_ROLE_IDS = Object.freeze(ROLE_ROWS.map((row) => row.role));
export const ROLE_SILHOUETTES = Object.freeze(Object.fromEntries(
  ROLE_ROWS.map((row) => [row.role, row]),
));

export function silhouetteFamilyById(id) {
  if (id == null) return null;
  return SILHOUETTE_FAMILIES[String(id)] || null;
}

export function silhouetteForRole(role) {
  if (role == null) return null;
  return ROLE_SILHOUETTES[String(role)] || null;
}

export function silhouetteReadoutForRole(role) {
  const row = silhouetteForRole(role);
  if (!row) return null;
  const family = silhouetteFamilyById(row.familyId);
  if (!family) return null;
  return Object.freeze({
    role: row.role,
    label: row.label,
    familyId: family.id,
    familyLabel: family.label,
    shape: family.shape,
    radarGlyph: family.radarGlyph,
    tell: row.tell,
    familyTell: family.tell,
    tacticalTell: row.tacticalTell,
    counterplay: row.counterplay,
    visualFamilies: row.visualFamilies,
  });
}

export function silhouetteForShipDef(shipDef) {
  if (!shipDef) return null;
  const readout = silhouetteReadoutForRole(shipDef.role);
  if (!readout) return null;
  const visualFamily = shipDef.visuals && shipDef.visuals.family || null;
  return Object.freeze({
    ...readout,
    shipId: shipDef.id || null,
    shipName: shipDef.name || null,
    visualFamily,
    visualFamilyMatchesContract: !visualFamily || readout.visualFamilies.includes(visualFamily),
  });
}
