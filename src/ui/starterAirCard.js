// §22 F10 — the three starters say what they are for, in the numbers the sim already derives.

import { fittingsFromDefaultModules, getDerivedStats } from '../systems/ships.js';
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
  const role = ROLE[starter.id] || 'Flies its own job';
  // P1 — the card carries the one stat sheet, so the starter choice and the ship screen speak the
  // same six numbers. Its rail label is the sheet's authored class beside its build word, exactly
  // as the dock and flight sheets print them, so two starters can never share a whole label.
  const sheet = shipStatSheet({ shipId: starter.shipId, fittings });
  return {
    role,
    // Read by the yard carousel's spin feel; never printed as a raw engineering reading.
    massT,
    sheet,
    identity: sheet ? sheet.identity.label : null,
    railLabel: sheet ? `${sheet.roleLabel} \u00b7 ${sheet.identity.label}` : null,
  };
}
