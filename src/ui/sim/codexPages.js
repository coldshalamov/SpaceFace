// codexPages.js — PULSE-CODEX (build_map row 437), the discovery-gated view the codex screen reads.
//
// Projects data/codexPages.js against live state: every page is unlocked by something the
// player actually did — held the cargo, flew the hull, fitted the module, met the flag,
// jumped the sector, found what the fauna sheds, reached the story beat. A locked page
// returns its section's honest hint and never leaks the real body.
//
// PURE and VIEW-ONLY (ARCHITECTURE §5, discoveryKnowledge.js precedent): reads state, never
// mutates, never imports Three.js, no ambient randomness.

import {
  CODEX_LOCKED_HINTS,
  CODEX_PAGES,
  CODEX_SECTIONS,
  codexFigureUnlockBeat,
  codexPageGate,
} from '../../data/codexPages.js';
import { FAUNA_DROPS } from '../../data/alienEcology.js';
import { FAUNA_SPECIES } from '../../data/alienFauna.js';
import { fittedModuleIds } from '../../core/fittedModules.js';

// Species with at least this much field evidence filed are readable: a drifter you flew
// through is one row, the deep strains want the survey record to match the smell.
const SPECIES_EVIDENCE_GATE = Object.freeze({
  drifter: 1, grazer: 1, swarm: 1, scavenger: 1, default: 2,
});

function commoditiesDiscovered(state) {
  const found = new Set();
  const player = state && state.player || {};
  const cargo = player.cargo && player.cargo.items || {};
  for (const [id, qty] of Object.entries(cargo)) {
    if ((Number(qty) || 0) > 0) found.add(id);
  }
  const ledger = Array.isArray(player.tradeLedger) ? player.tradeLedger : [];
  for (const row of ledger) {
    if (row && row.commodityId) found.add(row.commodityId);
  }
  const lots = player.tradeLots && typeof player.tradeLots === 'object' ? player.tradeLots : {};
  for (const id of Object.keys(lots)) found.add(id);
  const intel = state && state.economy && state.economy.marketIntel || {};
  for (const rec of Object.values(intel)) {
    const snapshot = rec && rec.snapshot;
    if (!snapshot) continue;
    for (const id of Object.keys(snapshot)) found.add(id);
  }
  return found;
}

function hullsDiscovered(state) {
  const found = new Set();
  const player = state && state.player || {};
  for (const ship of Array.isArray(player.ownedShips) ? player.ownedShips : []) {
    if (!ship) continue;
    for (const key of [ship.shipId, ship.defId, ship.id]) {
      if (key) found.add(String(key));
    }
    if (ship.def && ship.def.id) found.add(String(ship.def.id));
  }
  const losses = state && state.lossLedger && Array.isArray(state.lossLedger.entries)
    ? state.lossLedger.entries : [];
  for (const row of losses) {
    if (row && row.shipDefId) found.add(String(row.shipDefId));
    if (row && row.victimShipDefId) found.add(String(row.victimShipDefId));
  }
  return found;
}

function equipmentDiscovered(state) {
  const found = new Set();
  for (const defId of fittedModuleIds(state)) found.add(defId);
  const player = state && state.player || {};
  for (const item of Array.isArray(player.moduleInventory) ? player.moduleInventory : []) {
    if (item && item.defId) found.add(String(item.defId));
  }
  for (const ship of Array.isArray(player.ownedShips) ? player.ownedShips : []) {
    for (const defId of ship && Array.isArray(ship.fittings) ? ship.fittings : []) {
      if (defId) found.add(String(defId));
    }
  }
  return found;
}

function factionsMet(state) {
  const found = new Set();
  const records = state && state.factions || {};
  for (const id of Object.keys(records)) found.add(id);
  return found;
}

function sectorsDiscovered(state) {
  const found = new Set();
  const discovery = state && state.world && state.world.discovery || {};
  for (const [id, rec] of Object.entries(discovery)) {
    if (rec && (rec.discovered === true || (Number(rec.visitedCount) || 0) > 0)) found.add(id);
  }
  const current = state && state.world && state.world.currentSectorId;
  if (current) found.add(current);
  return found;
}

function ecologyState(state) {
  const ae = state && state.world && state.world.alienEcology;
  const evidence = ae && ae.evidence && typeof ae.evidence === 'object' ? ae.evidence : {};
  return {
    evidenceCount: Object.keys(evidence).length,
    wrenRecognized: ae && ae.wrenRecognized === true,
    scannedSpecies: ae?.taxonomy?.scannedSpecies,
  };
}

function speciesDiscovered(state, discoveredCommodities) {
  const found = new Set();
  const ecology = ecologyState(state);
  for (const [speciesId, def] of Object.entries(FAUNA_SPECIES)) {
    // New campaigns earn each behaviour page on its own physical scan. Legacy archives keep
    // their already-earned global evidence gates rather than losing pages during an upgrade.
    if (ecology.scannedSpecies && typeof ecology.scannedSpecies === 'object') {
      if (ecology.scannedSpecies[speciesId]) found.add(speciesId);
      continue;
    }
    const drop = FAUNA_DROPS && FAUNA_DROPS[speciesId];
    if (drop && drop.commodityId && discoveredCommodities.has(drop.commodityId)) {
      found.add(speciesId);
      continue;
    }
    const needed = SPECIES_EVIDENCE_GATE[def.role] || SPECIES_EVIDENCE_GATE.default;
    if (ecology.evidenceCount >= needed) {
      found.add(speciesId);
      continue;
    }
    // The Wren bond names what the relay swarm already trusts.
    if (ecology.wrenRecognized && (Number(def.relayAffinity) || 0) >= 0.5) found.add(speciesId);
  }
  return found;
}

function figuresKnown(state) {
  const found = new Set();
  const story = state && state.story || {};
  const beat = Math.floor(Number(story.beatIndex) || 0);
  const flags = story.flags && typeof story.flags === 'object' ? story.flags : {};
  for (const page of CODEX_PAGES) {
    if (page.section !== 'figures') continue;
    const gate = codexPageGate(page);
    if (gate === 'always') { found.add(page.id); continue; }
    const unlockBeat = codexFigureUnlockBeat(page.id);
    if (unlockBeat != null && beat >= unlockBeat) { found.add(page.id); continue; }
    if (flags[page.id] === true) found.add(page.id);
  }
  return found;
}

/** One page against live state: the real body when earned, the section's hint when not. */
export function codexPageView(state, page) {
  if (!page) return null;
  const gates = viewGates(state);
  const unlocked = codexPageUnlocked(page, gates);
  return {
    id: page.id,
    section: page.section,
    name: unlocked ? page.name : '— unfiled —',
    tag: unlocked ? page.tag || '' : '',
    body: unlocked ? page.body : '',
    unlocked,
    hint: unlocked ? '' : (CODEX_LOCKED_HINTS[page.section] || ''),
  };
}

function viewGates(state) {
  const discoveredCommodities = commoditiesDiscovered(state);
  return {
    commodities: discoveredCommodities,
    hulls: hullsDiscovered(state),
    equipment: equipmentDiscovered(state),
    factions: factionsMet(state),
    sectors: sectorsDiscovered(state),
    species: speciesDiscovered(state, discoveredCommodities),
    figures: figuresKnown(state),
  };
}

function codexPageUnlocked(page, gates) {
  switch (codexPageGate(page)) {
    case 'always': return true;
    case 'commodity': return gates.commodities.has(page.id);
    case 'hull': return gates.hulls.has(page.id);
    case 'equipment': return gates.equipment.has(page.id);
    case 'faction': return gates.factions.has(page.id);
    case 'sector': return gates.sectors.has(page.id);
    case 'species': return gates.species.has(page.id);
    case 'beat': case 'story': return gates.figures.has(page.id);
    default: return false;
  }
}

/** The full catalog for the screen: sections in authored order, pages gated honestly. */
export function codexPagesView(state) {
  const gates = viewGates(state);
  const sections = CODEX_SECTIONS.map((section) => {
    const pages = CODEX_PAGES
      .filter((page) => page.section === section.id)
      .map((page) => {
        const unlocked = codexPageUnlocked(page, gates);
        return {
          id: page.id,
          name: unlocked ? page.name : '— unfiled —',
          tag: unlocked ? page.tag || '' : '',
          body: unlocked ? page.body : '',
          unlocked,
          hint: unlocked ? '' : (CODEX_LOCKED_HINTS[section.id] || ''),
        };
      });
    return {
      id: section.id,
      title: section.title,
      line: section.line,
      total: pages.length,
      unlocked: pages.filter((p) => p.unlocked).length,
      pages,
    };
  });
  const totalPages = sections.reduce((n, s) => n + s.total, 0);
  const totalUnlocked = sections.reduce((n, s) => n + s.unlocked, 0);
  return {
    sections,
    totalPages,
    totalUnlocked,
    note: 'Pages unseal as the run earns them — cargo you held, hulls you flew or found dead, flags you met, sectors you jumped, fauna evidence you filed.',
  };
}

export default { codexPagesView, codexPageView };
