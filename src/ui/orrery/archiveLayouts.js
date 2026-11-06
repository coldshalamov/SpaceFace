// src/ui/orrery/archiveLayouts.js — ORRERY composition for the archive screens (design/frontend/ORRERY.md
// §6 Meta): the Codex and the Mission log. It styles the screens' existing nodes (every class, role and
// data hook that checks and probes read stays where it was) and pins nothing inline.
//
// CODEX — an archive instrument. The hang is one ladder read at two magnifications: the eight
// sections are graduations on a scale, and the open section's entries hang off a second rail that its
// graduation fans out to; the chosen entry carries the Hand. The stage is the entry's plate: produced
// art (a portrait, a crest, a discovery still) or the section's glyph in an aperture ringed by the
// section itself, one arc per entry, the lore rising under its title. The unlock counts are dials.
//
// MISSION LOG — a tracing beam. One beam runs the hang: the current action at its head, every active
// contract a node on it with its progress lit down the beam below the node, the Hand on the chosen
// node; the career paths and the settled receipts further down. The stage is the chosen contract's
// reading beside a dial of its progress and its clock; its verbs are words, one Lamp Key at most
// (Track, while the contract is not yet tracked) and Abandon red only where the player reaches it.
import { injectOrrery } from './tokens.js';
import { loadCssSidecar } from './cssSidecar.js';

const STYLE_ID = 'sf-orrery-archive';

/** Inject the archive composition after Deckplate and ORRERY, preserving the existing cascade. */
export function injectArchiveLayouts(doc = globalThis.document) {
  if (!doc || !doc.head || typeof doc.createElement !== 'function') return Promise.resolve();
  injectOrrery(doc);
  return loadCssSidecar(doc, {
    id: STYLE_ID,
    path: 'styles/archive.generated.css',
    fallback: () => import('./archiveCssSource.js').then((module) => module.ARCHIVE_CSS),
  });
}
