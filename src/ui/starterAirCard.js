// §22 F10 — the three starters say what they are for, in the numbers the sim already derives.

import { fittingsFromDefaultModules, getDerivedStats } from '../systems/ships.js';
import { lineLoadSpeedFor } from '../systems/shipCapabilities.js';

const ROLE = Object.freeze({
  starter_hitch: 'Lives on the line',
  starter_pelican: 'Anchors the swing',
  starter_wasp: 'Throws what it catches',
});

export function starterAirCard(starter) {
  const fittings = fittingsFromDefaultModules(starter.shipId, starter.fittedModules || []);
  const derived = getDerivedStats(starter.shipId, fittings, null);
  const massT = Math.round(Number(derived.operationalMass) || 0);
  const thrust = Math.round(Number(derived.thrust) || 0);
  const lineWuPerS = Math.round(lineLoadSpeedFor(derived).speedWuPerS || 0);
  const role = ROLE[starter.id] || 'Flies its own job';
  return {
    role,
    massT,
    thrust,
    lineWuPerS,
    sentence: `${role}. ${massT} t, thrust ${thrust}, line ${lineWuPerS} WU/s.`,
  };
}
