// §22 F10 — the three starters say what they are for, in the numbers the sim already derives.

import { fittingsFromDefaultModules, getDerivedStats } from '../systems/ships.js';
import { forwardAccelFor, lineLoadSpeedFor } from '../systems/shipCapabilities.js';
import { shipStatSheet } from './ship/shipStats.js';

const ROLE = Object.freeze({
  starter_hitch: 'Lives on the line',
  starter_pelican: 'Anchors the swing',
  starter_wasp: 'Throws what it catches',
});

export function starterAirCard(starter) {
  const fittings = fittingsFromDefaultModules(starter.shipId, starter.fittedModules || []);
  const derived = getDerivedStats(starter.shipId, fittings, null);
  const massT = Math.round(Number(derived.operationalMass) || 0);
  // The card's "thrust" word quotes the same live channel as the Shipworks gauge - forward
  // accel at the printed mass - never the legacy spec field (NXB-030).
  const thrust = Math.round(forwardAccelFor(derived));
  const lineWuPerS = Math.round(lineLoadSpeedFor(derived).speedWuPerS || 0);
  const role = ROLE[starter.id] || 'Flies its own job';
  // P1 — the card carries the one stat sheet, so the starter choice and the ship screen speak the
  // same six numbers. The word under the hull's name is the sheet's own identity, not a hand tag.
  const sheet = shipStatSheet({ shipId: starter.shipId, fittings });
  return {
    role,
    massT,
    thrust,
    lineWuPerS,
    sheet,
    identity: sheet ? sheet.identity.label : null,
    sentence: `${role}. ${massT} t, thrust ${thrust}, line ${lineWuPerS} u/s.`,
  };
}
