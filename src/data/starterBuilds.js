// Milestone-3 starter build identities for the Hitch.
// Pure immutable data: runtime fitting and preview truth remain owned by ships.getDerivedStats.

import { ORIGIN_ROLE_KITS } from '../careers/origins/careerOriginContracts.js';
import { NEW_GAME } from './newGameDefaults.js';

export const STARTER_BUILDS_SCHEMA_ID = 'spaceface.starterBuilds.v1';

const SHIP_ID = NEW_GAME.shipId;
const GENERALIST_FITTINGS = Object.freeze(NEW_GAME.fittedModules.slice());
const CAREER_BUILD_COPY = Object.freeze({
  hauler: Object.freeze({
    benefit: 'On a freight leg it keeps the most speed and turn authority of the three career kits, with a live station-price feed aboard.',
    tradeoff: 'Uses the Hitch utility slot for the uplink; a small mass and power cost, no hold growth, and nothing when the run turns physical.',
  }),
  hunter: Object.freeze({
    benefit: 'In a short fight its plate turns hull contact into the weapon; the heaviest of the three career kits carries the most momentum into a hit.',
    tradeoff: 'Uses the Hitch utility slot and gives up the most speed and turn authority of the three kits — the plate costs acceleration on every other run.',
  }),
  prospector: Object.freeze({
    benefit: 'On a tow-recovery it reels the Massline in faster and swings a line from farther out than the other career kits.',
    tradeoff: 'Uses the Hitch utility slot, draws the most power of the three kits, and its extra mass costs speed and turn authority.',
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
    fittings: [...GENERALIST_FITTINGS, kit.defId],
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
    benefit: 'Open utility slot and the lightest of the four fits — on the same freight, tow and fight runs it keeps the most speed and turn authority.',
    tradeoff: 'Keeps the utility slot open; flexible now, but no winch, plate or price feed when a specific job calls for one.',
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
