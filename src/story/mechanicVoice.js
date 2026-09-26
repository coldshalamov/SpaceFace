// Reader for leftover hull lines at the berth. Not a campaign owner.
// Reads leftover living-hull scars / patched scars and leftover live heat
// or leftover ship-ledger facts. Speaker stays Mechanic.
// One leftover line per leftover scar class the hull actually carries.
// Does not invent leftover scar classes. Cite leftover living-hull bands.
// Leftover bark corpus in src/data/barks.js is leftover radio, not this voice.

import { COMMODITIES } from '../data/commodities.js';
import { activeOwnedShip } from '../data/hullIdentity.js';
import {
  LIVING_HULL_SCAR_BANDS,
  livingHullPatchedScars,
  livingHullScars,
} from '../core/livingHull.js';
import { NEW_GAME_PLUS_SCHEMA, scarCarryPhrase } from '../core/newGamePlus.js';
import { isPlayerWanted } from '../systems/heat.js';
import { shipLedgerHasFactOutside } from '../systems/shipLedger.js';
import { LEDGER_SPEAKER } from './storyLedger.js';

const COMMODITY_NAME = new Map(COMMODITIES.map((def) => [def.id, def.name]));

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
  // Presence, not a page: the berth refresh runs this every 18 frames, and building the ledger
  // page here measured ~3.7 ms per refresh on a scarred hull with a traded ledger (PQ-207.00).
  if (!shipLedgerHasFactOutside(state || {}, HULL_HISTORY_TYPES)) return null;
  return leftoverLine('The ship ledger already has a fact on this hull.');
}

function leftoverCleanPlateLine(hull) {
  if (livingHullScars(hull).length) return null;
  return leftoverLine('Clean plate. Nothing on this hull to file.');
}

function leftoverCapitalised(text) {
  return text ? `${text.charAt(0).toUpperCase()}${text.slice(1)}` : '';
}

/**
 * New Run+ history, while any of it is still live: the carried scar still open on this hull, the
 * lead hunter still undefeated. Once the yard patches the scar and the ace is settled it stops
 * being news and the line goes. "This hull" only when the hull on the berth still carries a
 * carried scar (open or patched); a hull bought since did not come over.
 */
function leftoverLegacyLine(state, hull) {
  const record = state && state.story && state.story.newGamePlus;
  if (!record || record.schema !== NEW_GAME_PLUS_SCHEMA) return null;
  const endingTitle = leftoverLine(record.sourceEndingTitle);
  if (!endingTitle) return null;
  const carried = Array.isArray(record.scars) ? record.scars.filter((scar) => scar && scar.id) : [];
  const onHull = livingHullScars(hull);
  const hullCameOver = carried.some((scar) => onHull.some((row) => row.id === scar.id));
  const openIds = new Set(onHull.filter((row) => row.patchedAtT == null).map((row) => row.id));
  const openScar = carried.find((scar) => openIds.has(scar.id));
  const scarPhrase = leftoverCapitalised(leftoverLine(openScar && scarCarryPhrase(openScar)) || '');
  const aceId = leftoverLine(record.leadGrudgeAceId);
  const aceRecord = aceId && state.aceMemory && typeof state.aceMemory === 'object'
    ? state.aceMemory[aceId]
    : null;
  const aceName = aceId && !(aceRecord && aceRecord.defeated) ? leftoverLine(record.leadGrudgeName) : null;
  if (!scarPhrase && !aceName) return null;
  const parts = [`${hullCameOver ? 'This hull' : 'You'} came over from ${endingTitle}.`];
  if (scarPhrase) parts.push(`${scarPhrase} came with it.`);
  if (aceName) parts.push(`${aceName} is still out there.`);
  return leftoverLine(parts.join(' '));
}

/** Cargo left one spilled commodity on the hold. No receipt, no sentence. */
function leftoverDockSpillLine(state) {
  const spill = state && state.player && state.player.cargo && state.player.cargo.dockSpill;
  if (!spill || typeof spill !== 'object') return null;
  const commodityId = typeof spill.commodityId === 'string' ? spill.commodityId : '';
  const count = Math.floor(Number(spill.count) || 0);
  if (!commodityId || count <= 0) return null;
  const name = COMMODITY_NAME.get(commodityId);
  if (!name) return null;
  const units = count === 1 ? 'unit' : 'units';
  return leftoverLine(`${name} spilled on the way in, ${count} ${units}.`);
}

/** Leftover spoken lines from leftover live hull / leftover heat / leftover ledger facts. */
export function leftoverMechanicLines(state) {
  const lines = [];
  const owned = activeOwnedShip(state);
  if (owned) {
    const hull = owned.livingHull;
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
    // After the live-hull lines: audioSystem speaks lines[0] on dock, and the lead ace is usually
    // undefeated all run, so a first-position legacy line would bury every fresh scar/repair/rap
    // line for the whole carried run. It still joins the berth card body after them.
    const legacy = leftoverLegacyLine(state, hull);
    if (legacy) lines.push(legacy);
  }
  const spill = leftoverDockSpillLine(state);
  if (spill) lines.push(spill);
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
