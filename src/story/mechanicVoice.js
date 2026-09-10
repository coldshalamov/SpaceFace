// Reader for leftover hull lines at the berth. Not a campaign owner.
// Reads leftover living-hull scars / patched scars and leftover live heat
// or leftover ship-ledger facts. Speaker stays Mechanic.
// One leftover line per leftover scar class the hull actually carries.
// Does not invent leftover scar classes. Cite leftover living-hull bands.
// Leftover bark corpus in src/data/barks.js is leftover radio, not this voice.

import { activeOwnedShip } from '../data/hullIdentity.js';
import {
  LIVING_HULL_SCAR_BANDS,
  livingHullPatchedScars,
  livingHullScars,
} from '../core/livingHull.js';
import { isPlayerWanted } from '../systems/heat.js';
import { SHIP_LEDGER_MAX_PAGE_SIZE, buildShipLedger } from '../systems/shipLedger.js';
import { LEDGER_SPEAKER } from './storyLedger.js';

export const MECHANIC_KIND = 'mechanic-hull';
export const MECHANIC_BADGE = 'HULL';
export const MECHANIC_SPEAKER = LEDGER_SPEAKER;

const HULL_HISTORY_TYPES = new Set(['scar', 'patch']);

const SCAR_CLASS_LINE = Object.freeze({
  graze: (facing) => `Graze on the ${facing}. Soft enough the paint still argues.`,
  hard: (facing) => `Hard scar on the ${facing}. That is a real hit.`,
  heavy: (facing) => `Heavy scar on the ${facing}. Do not call it weather.`,
  crushing: (facing) => `Crushing scar on the ${facing}. The frame kept it.`,
});

function leftoverLine(value) {
  const next = String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
  return next || null;
}

function leftoverFacing(scar) {
  return leftoverLine(scar && scar.facing) || 'hull';
}

/** Leftover scar classes this leftover hull actually carries, leftover band order. */
export function leftoverMechanicScarClasses(hull) {
  const scars = livingHullScars(hull);
  const carried = [];
  for (const band of LIVING_HULL_SCAR_BANDS) {
    if (scars.some((scar) => scar.band === band)) carried.push(band);
  }
  return carried;
}

function leftoverScarLine(hull, band) {
  const phrase = SCAR_CLASS_LINE[band];
  if (!phrase) return null;
  const scar = livingHullScars(hull).find((row) => row.band === band);
  return leftoverLine(phrase(leftoverFacing(scar)));
}

function leftoverRepairLine(hull) {
  const patched = livingHullPatchedScars(hull);
  if (!patched.length) return null;
  return leftoverLine(`Yard patched the ${leftoverFacing(patched[0])}. The weld is still proud.`);
}

function leftoverRapLine(state, hull) {
  if (isPlayerWanted(state)) {
    return leftoverLine('Heat is on this hull. The law already filed the rap.');
  }
  // A clean plate is a hull file. Trade, renown, and loss rows are not scars —
  // naming them here made the mechanic contradict himself after the first sale.
  if (!livingHullScars(hull).length) return null;
  const page = buildShipLedger(state || {}, { page: 0, pageSize: SHIP_LEDGER_MAX_PAGE_SIZE });
  const fact = (page.entries || []).find((entry) => entry && !HULL_HISTORY_TYPES.has(entry.type));
  if (!fact) return null;
  return leftoverLine('The ship ledger already has a fact on this hull.');
}

function leftoverCleanPlateLine(hull) {
  if (livingHullScars(hull).length) return null;
  return leftoverLine('Clean plate. Nothing on this hull to file.');
}

/** Leftover spoken lines from leftover live hull / leftover heat / leftover ledger facts. */
export function leftoverMechanicLines(state) {
  const owned = activeOwnedShip(state);
  if (!owned) return [];
  const hull = owned.livingHull;
  const lines = [];
  const classes = leftoverMechanicScarClasses(hull);
  for (const band of classes) {
    const line = leftoverScarLine(hull, band);
    if (line) lines.push(line);
  }
  const repair = leftoverRepairLine(hull);
  if (repair) lines.push(repair);
  if (!classes.length) {
    const clean = leftoverCleanPlateLine(hull);
    if (clean) lines.push(clean);
  }
  const rap = leftoverRapLine(state, hull);
  if (rap) lines.push(rap);
  return lines;
}

export function leftoverMechanicLine(state) {
  const lines = leftoverMechanicLines(state);
  return lines.length ? leftoverLine(lines.join(' ')) : null;
}

/** Leftover berth card fields. Reader only — no leftover write. */
export function leftoverMechanicCard(state) {
  const body = leftoverMechanicLine(state);
  if (!body) return null;
  return {
    badge: MECHANIC_BADGE,
    title: MECHANIC_SPEAKER,
    body,
    kind: MECHANIC_KIND,
    tone: null,
    eventId: null,
  };
}

export function leftoverMechanicFor(state) {
  const card = leftoverMechanicCard(state);
  if (!card) {
    return { line: null, card: null, visible: false };
  }
  return { line: card.body, card, visible: true };
}
