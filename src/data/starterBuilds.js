// Milestone-3 starter build identities for the Hitch.
// Pure immutable data: runtime fitting and preview truth remain owned by ships.getDerivedStats.

import { ORIGIN_ROLE_KITS } from '../careers/origins/careerOriginContracts.js';
import { NEW_GAME } from './newGameDefaults.js';

export const STARTER_BUILDS_SCHEMA_ID = 'spaceface.starterBuilds.v1';

const SHIP_ID = NEW_GAME.shipId;
const GENERALIST_FITTINGS = Object.freeze(NEW_GAME.fittedModules.slice());
const CAREER_BASE_FITTINGS = Object.freeze(
  GENERALIST_FITTINGS.filter((defId) => defId !== 'mod_ram_plate'),
);
const CAREER_BUILD_COPY = Object.freeze({
  hauler: Object.freeze({
    benefit: 'Lightest career utility fit, preserving the best speed and turn authority of the three role kits.',
    tradeoff: 'Uses the Hitch utility slot and adds a small mass and power cost without expanding the hold.',
  }),
  hunter: Object.freeze({
    benefit: 'Heaviest career fit, giving the physics body the most collision inertia of the three role kits.',
    tradeoff: 'Uses the Hitch utility slot and gives up more speed and turn authority than either other role kit.',
  }),
  prospector: Object.freeze({
    benefit: 'Faster Massline reel rate now, with higher load capacity reserved for future extreme-scale operations.',
    tradeoff: 'Uses the Hitch utility slot and carries more mass and power draw than the route-runner fit.',
  }),
});

function acquisition(source, careerId = null, moduleId = null) {
  return Object.freeze({ source, careerId, moduleId });
}

function build({ id, label, careerId, verb, fittings, acquisition: acquired, benefit, tradeoff }) {
  return Object.freeze({
    id,
    label,
    shipId: SHIP_ID,
    careerId,
    verb,
    fittings: Object.freeze(fittings.slice()),
    acquisition: acquired,
    benefit,
    tradeoff,
  });
}

function careerBuild(careerId, label, verb) {
  const kit = ORIGIN_ROLE_KITS[careerId];
  const copy = CAREER_BUILD_COPY[careerId];
  return build({
    id: `starter_${careerId}`,
    label,
    careerId,
    verb,
    // A career utility is a replacement choice for Hitch's one S utility slot. The generalist
    // begins with the Ram Plate so the starter has a real physics verb; career previews never
    // fabricate a second utility slot or silently drop the selected career kit.
    fittings: [...CAREER_BASE_FITTINGS, kit.defId],
    acquisition: acquisition('career_origin', careerId, kit.defId),
    benefit: copy.benefit,
    tradeoff: copy.tradeoff,
  });
}

export const STARTER_BUILDS = Object.freeze([
  build({
    id: 'starter_generalist',
    label: 'Hitch Generalist',
    careerId: null,
    verb: 'adapt',
    fittings: GENERALIST_FITTINGS,
    acquisition: acquisition('new_game'),
    benefit: 'A fitted Ram Plate turns committed contact into a real tumble-and-terrain kill path.',
    tradeoff: 'Uses Hitch\'s utility slot and adds mass; swap it at Outfitting for a career tool.',
  }),
  careerBuild('hauler', 'Hitch Route Runner', 'carry'),
  careerBuild('hunter', 'Hitch Warrant Chaser', 'intercept'),
  careerBuild('prospector', 'Hitch Field Hand', 'survey'),
]);

export const STARTER_BUILD_BY_ID = Object.freeze(Object.fromEntries(
  STARTER_BUILDS.map((entry) => [entry.id, entry]),
));

export function getStarterBuild(id) {
  return STARTER_BUILD_BY_ID[id] || null;
}

export default STARTER_BUILDS;
