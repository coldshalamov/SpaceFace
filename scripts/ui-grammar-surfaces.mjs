// ui-grammar-surfaces.mjs — PQ-180 .00 "The surface manifest."
//
// THE authoritative list of player-facing UI surfaces, with the route that opens each one, the file
// that owns it, its archetype, and the existing checks that already cover the rules the runtime
// matrix cannot compute. `scripts/check-ui-grammar-matrix.mjs` drives the game from this file;
// `scripts/capture-ui-matrix.mjs` builds its frame plan from it. Adding a surface here is what
// makes it measured — there is no second list.
//
// Honesty rules baked into the shape (PQ-180 "How agents get this wrong"):
//   * `entry.evidence` is 'public-route' ONLY when the harness opens the surface the way a player
//     does (a key, a button). A `fixture` entry (a bus emit that puts the game in a state the
//     harness cannot fly to yet) may unlock MEASUREMENT, but it can never green the reachability
//     cell. `none` means we cannot open it at all: red, with an owner.
//   * `ownerFile: null` means the surface named by the packet does not exist yet. That is a red
//     row with an owner packet, not an omission.
//   * `checks` records the existing separate audits that touch a surface. It is NOT proof of any
//     rule: the matrix never imports another check's verdict, so a listed check name can never
//     turn a cell green (see the pass rule at the top of scripts/lib/ui-grammar-measure.mjs).
//   * `ownerLeaf` names the work item that clears a red cell. Every failing cell needs a packet AND
//     a leaf, not just a row-level owner.

import { MIN_MANIFEST_SURFACES } from './ui-grammar-thresholds.mjs';

/** Packets a red cell may be assigned to (PQ-180 .02). A red row with any other owner is a bug. */
export const ADMITTED_OWNER_PACKETS = Object.freeze([
  'PQ-130', // Asteroid Works playfield
  'PQ-162', // station screens
  'PQ-168', // the chart
  'PQ-180', // this packet — coverage/measurement gaps it must close itself
  'PQ-181', // the meta shell (credits, statistics, photo mode, title/settings/save)
  'PQ-182', // Crucible screens
  'PQ-183', // entity links
  'PQ-184', // UI perf
]);

export const ARCHETYPES = Object.freeze([
  'FLIGHT-HUD',   // live, non-pausing, drawn over a moving world
  'OVERLAY',      // live non-pausing overlay (radials, rails)
  'INSTRUMENT',   // pausing full-screen instrument (Ship, Chart, Footprint, Range)
  'META-SHELL',   // title, settings, save/load, pause, help, codex, game over
  'STATION',      // docked Orbital Command dock + its destinations
  'CRUCIBLE',     // the Survival door and its run surfaces
  'WORKS',        // Asteroid Works / base / automation site engineering
]);

const A11Y = 'check:ui-a11y';
const CONTRAST = 'check:wcag-contrast';
const DATA_STATES = 'check:data-states';
const LINKS = 'check:entity-links';
const EFFECTS = 'check:ui-effects';
const FRAME_SLEEP = 'check:ui-frame-sleep';
const STATION_TABS = 'check:station-tab-navigation-runtime';

const BASE_CHECKS = Object.freeze([A11Y, CONTRAST, DATA_STATES, LINKS, EFFECTS, FRAME_SLEEP]);

function surface(spec) {
  return Object.freeze({
    scope: 'shipping',
    status: 'live',
    owner: null,
    screenId: null,
    root: Object.freeze([]),
    checks: BASE_CHECKS,
    ...spec,
    entry: Object.freeze(spec.entry),
  });
}

/**
 * Entry route helpers. `key` presses a key in idle flight; `nested` opens a parent surface first
 * and then clicks a control inside it; `fixture` names the runtime state we cannot fly to yet.
 */
const key = (k, detail) => ({ kind: 'key', key: k, evidence: 'public-route', detail });
/**
 * A control inside an already-open parent. `selector` scopes the search; `text` names the control by
 * its visible label, matched after stripping pseudo-localization decoration so the SAME route works
 * in the qps-ploc pass. Text is the only stable handle these screens expose — they build plain
 * <button> elements with no id, role hook or data attribute.
 */
const nested = (parent, selector, text, detail) => ({
  kind: 'nested', parent, selector, text, evidence: 'public-route', detail,
});
const fixture = (name, detail) => ({ kind: 'fixture', fixture: name, evidence: 'fixture', detail });
const none = (detail) => ({ kind: 'none', evidence: 'none', detail });

/**
 * Reachability is inherited. A destination reached by clicking a control inside a parent we can
 * only reach through a FIXTURE is not on a public route either — a chain is only as honest as its
 * weakest link. Resolved once, here, so no evaluator has to remember to walk the chain.
 */
function resolveInheritedEvidence(list) {
  const raw = new Map(list.map((s) => [s.id, s]));
  const evidenceOf = new Map();
  function walk(id, seen) {
    if (evidenceOf.has(id)) return evidenceOf.get(id);
    const surface = raw.get(id);
    if (!surface) return 'none';
    let evidence = surface.entry.evidence;
    const parentId = surface.entry.parent;
    if (parentId && !seen.has(parentId)) {
      seen.add(parentId);
      const parentEvidence = walk(parentId, seen);
      if (evidence === 'public-route' && parentEvidence !== 'public-route') evidence = parentEvidence;
    }
    evidenceOf.set(id, evidence);
    return evidence;
  }
  return list.map((surface) => {
    const evidence = walk(surface.id, new Set([surface.id]));
    if (evidence === surface.entry.evidence) return surface;
    const parentId = surface.entry.parent;
    return Object.freeze({
      ...surface,
      entry: Object.freeze({
        ...surface.entry,
        evidence,
        // Say the evidence was INHERITED, not native. A nested entry has no `fixture` name of its
        // own, so a reader told only "evidence: fixture" would look for one and find undefined.
        inheritedFrom: parentId,
        detail: `${surface.entry.detail || ''} — reached only through ${parentId}, which is ${evidence}`.trim(),
      }),
    });
  });
}

const RAW_SURFACES = Object.freeze([
  // ---------------------------------------------------------------- flight route
  surface({
    id: 'flight',
    title: 'The flight HUD',
    archetype: 'FLIGHT-HUD',
    ownerFile: 'src/ui/hud.js',
    root: ['#hud'],
    entry: { kind: 'default', evidence: 'public-route', detail: 'the default route after Launch' },
  }),
  surface({
    id: 'power-rail',
    title: 'The Power Rail',
    archetype: 'OVERLAY',
    ownerFile: 'src/ui/powerRail.js',
    root: ['.sf-prail'],
    entry: { kind: 'default', evidence: 'public-route', detail: 'always mounted in the flight HUD' },
    // Photographed as an ELEMENT crop, not a full viewport: it lives inside the flight frame, and
    // PQ-180 .03 says every surface gets frames — "it is part of the HUD" is not an exemption.
    captureMode: 'element',
    ownerLeaf: 'ui-frame-timing',
  }),
  surface({
    id: 'comms-radial',
    title: 'The comms fan',
    archetype: 'OVERLAY',
    ownerFile: 'src/ui/commsRadial.js',
    root: ['#sf-commsfan', '.sf-commsfan'],
    entry: key('Alt', 'Alt (HOLD ALT) opens the quick comms hail fan in flight'),
    captureMode: 'element',
  }),
  surface({
    id: 'wingman-radial',
    title: 'The wingman command radial',
    archetype: 'OVERLAY',
    ownerFile: 'src/ui/wingmanRadial.js',
    root: ['#sf-wingman-radial', '.sf-wradial'],
    entry: key('z', 'fleetCommand key (BINDINGS.fleetCommand)'),
    captureMode: 'element',
  }),

  // ---------------------------------------------------------------- the four instruments
  surface({
    id: 'ship',
    title: 'THE SHIP',
    archetype: 'INSTRUMENT',
    ownerFile: 'src/ui/ship/shipScreen.js',
    screenId: 'ship',
    root: ['[data-screen="ship"]'],
    entry: key('F2', 'canonical entry key table, INSTRUMENT_GRAMMAR §10.5'),
  }),
  surface({
    id: 'footprint',
    title: 'THE FOOTPRINT',
    archetype: 'INSTRUMENT',
    ownerFile: 'src/ui/screens/footprint.js',
    screenId: 'footprint',
    root: ['[data-screen="footprint"]'],
    entry: key('F3', 'canonical entry key table'),
  }),
  surface({
    id: 'range',
    title: 'THE RANGE',
    archetype: 'INSTRUMENT',
    ownerFile: 'src/ui/screens/range.js',
    screenId: 'range',
    root: ['[data-screen="range"]'],
    entry: key('F4', 'canonical entry key table'),
  }),
  surface({
    id: 'chart',
    title: 'THE CHART — local focus',
    archetype: 'INSTRUMENT',
    ownerFile: 'src/ui/galaxyMap.js',
    screenId: 'galaxyMap',
    root: ['[data-screen="galaxyMap"]', '[data-screen="localmap"]', '[data-screen="starmap"]'],
    entry: key('m', 'BINDINGS.localmap — opens the chart at LOCAL focus'),
  }),
  surface({
    id: 'chart-galaxy',
    title: 'THE CHART — galaxy focus',
    archetype: 'INSTRUMENT',
    ownerFile: 'src/ui/galaxyMap.js',
    screenId: 'galaxyMap',
    root: ['[data-screen="galaxyMap"]'],
    entry: key('n', 'BINDINGS.starmap — same screen, galaxy focus'),
  }),

  // ---------------------------------------------------------------- meta shell
  surface({
    id: 'title',
    title: 'The title screen',
    archetype: 'META-SHELL',
    ownerFile: 'src/ui/screens/mainMenu.js',
    screenId: 'mainMenu',
    root: ['[data-screen="mainMenu"]'],
    entry: { kind: 'boot', evidence: 'public-route', detail: 'the first screen of the game, before New Game' },
  }),
  surface({
    id: 'new-game',
    title: 'New game',
    archetype: 'META-SHELL',
    ownerFile: 'src/ui/screens/newGame.js',
    screenId: 'newGame',
    root: ['[data-screen="newGame"]'],
    entry: {
      kind: 'boot-nested',
      parent: 'title',
      selector: '[data-screen="mainMenu"] .sf-col > button',
      evidence: 'public-route',
      detail: 'title → New Game',
    },
  }),
  surface({
    id: 'pause',
    title: 'Pause',
    archetype: 'META-SHELL',
    ownerFile: 'src/ui/screens/pause.js',
    screenId: 'pause',
    root: ['[data-screen="pause"]'],
    entry: key('Escape', 'Escape / P in flight'),
  }),
  surface({
    id: 'settings',
    title: 'Settings',
    archetype: 'META-SHELL',
    ownerFile: 'src/ui/screens/settings.js',
    screenId: 'settings',
    root: ['[data-screen="settings"]'],
    entry: nested('pause', '[data-screen="pause"] button', 'Settings', 'pause → Settings'),
  }),
  surface({
    id: 'save-load',
    title: 'Load and save',
    archetype: 'META-SHELL',
    ownerFile: 'src/ui/screens/saveLoad.js',
    screenId: 'saveLoad',
    root: ['[data-screen="saveLoad"]'],
    // The pause menu's Save button opens saveLoad directly; its Load button routes through a
    // destructive confirm, so Save is the non-destructive public route to the same surface.
    entry: nested('pause', '[data-screen="pause"] button', 'Save', 'pause → Save'),
  }),
  surface({
    id: 'help',
    title: 'Help',
    archetype: 'META-SHELL',
    ownerFile: 'src/ui/screens/help.js',
    screenId: 'help',
    root: ['[data-screen="help"]'],
    entry: key('F1', 'F1 / H in flight'),
  }),
  surface({
    id: 'codex',
    title: 'Codex',
    archetype: 'META-SHELL',
    ownerFile: 'src/ui/screens/codex.js',
    screenId: 'codex',
    root: ['[data-screen="codex"]'],
    entry: key('k', 'BINDINGS.codex'),
  }),
  surface({
    id: 'mission-log',
    title: 'Mission log',
    archetype: 'META-SHELL',
    ownerFile: 'src/ui/screens/missionLog.js',
    screenId: 'missionLog',
    root: ['[data-screen="missionLog"]'],
    entry: key('j', 'BINDINGS.missionLog'),
  }),
  surface({
    id: 'tech-tree',
    title: 'Tech tree',
    archetype: 'META-SHELL',
    ownerFile: 'src/ui/screens/techTree.js',
    screenId: 'techTree',
    root: ['[data-screen="techTree"]'],
    entry: key('t', 'BINDINGS.techTree'),
  }),
  surface({
    id: 'game-over',
    title: 'Game over',
    archetype: 'META-SHELL',
    ownerFile: 'src/ui/screens/gameOver.js',
    screenId: 'gameOver',
    root: ['[data-screen="gameOver"]'],
    // Destructive: it ends the run. Measured last, in its own boot.
    entry: fixture('player-death', 'the run must end; the harness cannot yet die on the public route'),
    owner: 'PQ-181',
    ownerLeaf: 'meta-shell',
    // `destructive` describes what the FIXTURE does to the session, not the surface. Killing the
    // player ends the run, so nothing can be opened after it in the same boot — it is measured last
    // and it gets no reference frame until a leaf gives it a boot of its own.
    destructive: true,
  }),
  surface({
    id: 'credits',
    title: 'Credits',
    archetype: 'META-SHELL',
    ownerFile: null,
    status: 'missing',
    entry: none('no credits surface exists on any route (audited 2026-09-04)'),
    owner: 'PQ-181',
    ownerLeaf: 'meta-shell',
  }),
  surface({
    id: 'statistics',
    title: 'Statistics',
    archetype: 'META-SHELL',
    ownerFile: null,
    status: 'missing',
    entry: none('career/ladder models exist in src/ui/careerLadderView.js but no statistics surface is registered'),
    owner: 'PQ-181',
    ownerLeaf: 'meta-shell',
  }),
  surface({
    id: 'photo-mode',
    title: 'Photo mode',
    archetype: 'META-SHELL',
    ownerFile: null,
    status: 'missing',
    entry: none('no photo mode exists (audited 2026-09-04)'),
    owner: 'PQ-181',
    ownerLeaf: 'meta-shell',
  }),

  // ---------------------------------------------------------------- the station
  surface({
    id: 'station-dock',
    title: 'The Command Dock (berth fascia)',
    archetype: 'STATION',
    ownerFile: 'src/ui/station/stationScreen.js',
    screenId: 'station',
    root: ['[data-screen="station"]'],
    checks: [...BASE_CHECKS, STATION_TABS],
    entry: fixture('dock', 'the harness docks via the dock:docked bus path used by check-station-tab-navigation-runtime; flying to a berth is not automated'),
    owner: 'PQ-162',
    ownerLeaf: 'station-screens',
  }),
  ...[
    ['market', 'Market', 'src/ui/station/screens/market.js'],
    ['shipworks', 'Shipworks', 'src/ui/station/screens/shipworks.js'],
    ['industry', 'Industry', 'src/ui/station/screens/industry.js'],
    ['contracts', 'Missions', 'src/ui/station/screens/contracts.js'],
    ['factions', 'Factions', 'src/ui/station/screens/factions.js'],
    ['bar', 'Bar', 'src/ui/station/screens/bar.js'],
    ['ledger', 'Ledger', 'src/ui/station/screens/ledger.js'],
  ].map(([id, title, ownerFile]) => surface({
    id: `station-${id}`,
    title: `Station · ${title}`,
    archetype: 'STATION',
    ownerFile,
    screenId: 'station',
    root: ['[data-screen="station"] .sx-app__panel', '[data-screen="station"]'],
    checks: [...BASE_CHECKS, STATION_TABS],
    entry: nested('station-dock', `[data-screen="station"] .sx-dock [data-nav="${id}"]`, null, `Command Dock → ${title}`),
    owner: 'PQ-162',
    ownerLeaf: 'station-screens',
  })),

  // ---------------------------------------------------------------- the Crucible
  surface({
    id: 'crucible-door',
    title: 'The Crucible door',
    archetype: 'CRUCIBLE',
    ownerFile: 'src/ui/screens/crucible.js',
    screenId: 'crucible',
    root: ['[data-screen="crucible"]'],
    // A REAL public route: the title screen carries a "Crucible" button (mainMenu.js:243, PQ-133
    // §12.2 direct main-menu entry). It is pressed before Launch, so this is a menu-phase surface.
    entry: {
      kind: 'boot-nested',
      parent: 'title',
      selector: '[data-screen="mainMenu"] .sf-col > button',
      text: 'Crucible',
      evidence: 'public-route',
      detail: 'title → Crucible',
    },
    owner: 'PQ-182',
    ownerLeaf: 'crucible-screens',
    ownerLeaf: 'crucible-screens',
  }),
  surface({
    id: 'crucible-draft',
    title: 'The Crucible draft',
    archetype: 'CRUCIBLE',
    ownerFile: 'src/ui/screens/crucibleDraft.js',
    screenId: 'crucibleDraft',
    root: ['[data-screen="crucibleDraft"]'],
    entry: fixture('crucible-draft', 'reached mid-run after a wave clears'),
    owner: 'PQ-182',
    ownerLeaf: 'crucible-screens',
  }),
  surface({
    id: 'crucible-refit',
    title: 'The Crucible refit',
    archetype: 'CRUCIBLE',
    ownerFile: 'src/ui/screens/crucibleDraft.js',
    screenId: 'crucibleRefit',
    root: ['[data-screen="crucibleRefit"]'],
    entry: fixture('crucible-refit', 'reached at the ten-wave refit break'),
    owner: 'PQ-182',
    ownerLeaf: 'crucible-screens',
  }),
  surface({
    id: 'crucible-results',
    title: 'The Crucible results',
    archetype: 'CRUCIBLE',
    ownerFile: 'src/ui/screens/crucible.js',
    screenId: 'crucibleResults',
    root: ['[data-screen="crucibleResults"]'],
    // Not destructive in the harness: the fixture is a plain ui:pushScreen, so nothing dies and the
    // boot survives it. On the real route a run ends first — that is a reachability red, not a
    // session hazard.
    entry: fixture('crucible-results', 'reached when a Survival run ends'),
    owner: 'PQ-182',
    ownerLeaf: 'crucible-screens',
  }),
  surface({
    id: 'crucible-lab',
    title: 'The Crucible lab',
    archetype: 'CRUCIBLE',
    ownerFile: 'src/ui/screens/crucibleLabControls.js',
    status: 'unregistered',
    entry: none('the lab controls module registers no screen id; there is no route that opens it as a surface'),
    owner: 'PQ-182',
    ownerLeaf: 'crucible-screens',
  }),

  // ---------------------------------------------------------------- works, base, automation
  surface({
    id: 'asteroid-works',
    title: 'Asteroid Works',
    archetype: 'WORKS',
    ownerFile: 'src/ui/asteroid/asteroidScreen.js',
    screenId: 'drill',
    root: ['[data-screen="drill"]'],
    entry: key('b', 'BINDINGS.drill on a selected asteroid — requires an asteroid in range'),
    owner: 'PQ-130',
    ownerLeaf: 'works-screens',
  }),
  surface({
    id: 'base',
    title: 'The base / claims board',
    archetype: 'WORKS',
    ownerFile: 'src/ui/screens/base.js',
    screenId: 'base',
    root: ['[data-screen="base"]'],
    entry: key('u', 'BINDINGS.claimBase — requires a claimable body in range'),
    owner: 'PQ-130',
    ownerLeaf: 'works-screens',
  }),
  surface({
    id: 'automation',
    title: 'Automation',
    archetype: 'WORKS',
    ownerFile: 'src/ui/screens/automationPanel.js',
    screenId: 'automation',
    root: ['[data-screen="automation"]'],
    // A REAL public route: the pause menu's "Operations" button (pause.js:402) pushes 'automation'.
    entry: nested('pause', '[data-screen="pause"] button', 'Operations', 'pause → Operations'),
    owner: 'PQ-130',
    ownerLeaf: 'works-screens',
    ownerLeaf: 'works-screens',
  }),

  // ---------------------------------------------------------------- legacy, still registered
  surface({
    id: 'localmap-legacy',
    title: 'Local map (legacy)',
    archetype: 'INSTRUMENT',
    ownerFile: 'src/ui/screens/localmap.js',
    screenId: 'localmap',
    status: 'legacy',
    root: ['[data-screen="localmap"]'],
    entry: none('superseded by the chart; registered for tools/checks only, no player route'),
    owner: 'PQ-168',
    ownerLeaf: 'chart',
  }),
  surface({
    id: 'starmap-legacy',
    title: 'Star map (legacy)',
    archetype: 'INSTRUMENT',
    ownerFile: 'src/ui/screens/starmap.js',
    screenId: 'starmap',
    status: 'legacy',
    root: ['[data-screen="starmap"]'],
    entry: none('superseded by the chart; registered for tools/checks only, no player route'),
    owner: 'PQ-168',
    ownerLeaf: 'chart',
  }),

  // ---------------------------------------------------------------- dev only, not shipping
  surface({
    id: 'sandbox',
    title: 'Sandbox (dev harness)',
    archetype: 'META-SHELL',
    ownerFile: 'src/ui/screens/sandbox.js',
    screenId: 'sandbox',
    scope: 'dev',
    root: ['[data-screen="sandbox"]'],
    entry: none('IS_DEV only; never registered in a shipping build'),
    owner: null,
  }),
]);

export const SURFACES = Object.freeze(resolveInheritedEvidence([...RAW_SURFACES]));

export const SHIPPING_SURFACES = Object.freeze(SURFACES.filter((s) => s.scope === 'shipping'));

/**
 * Entry kinds `scripts/capture-ui-matrix.mjs::openSurface` actually implements. A surface may only
 * be called "automatable" because an opener exists for it — not because the manifest describes a
 * route in prose. `openSurface` asserts this list against itself, so the two cannot drift.
 */
export const IMPLEMENTED_ENTRY_KINDS = Object.freeze(['default', 'key', 'nested', 'fixture', 'boot', 'boot-nested']);

/** Surfaces the runtime harness has an implemented opener for. */
export const AUTOMATABLE_SURFACES = Object.freeze(
  SHIPPING_SURFACES.filter((s) => IMPLEMENTED_ENTRY_KINDS.includes(s.entry.kind) && s.ownerFile),
);

/**
 * PQ-180 .03 says EVERY surface × 4 modes × 3 widths. The frame plan therefore covers every shipping
 * surface, including the ones that cannot be opened: those become explicit missing/error rows in the
 * capture report and red `reference-frames` cells in the matrix. Omitting a surface from the plan
 * would turn a gap into silence, which is the failure this packet exists to prevent.
 */
export const CAPTURE_SURFACES = SHIPPING_SURFACES;

/**
 * Surfaces that could ever count toward "≥ 30 real surfaces": they exist as a module AND have an
 * implemented opener. A legacy screen with no route and a screen that does not exist are listed for
 * honesty, and are never evidence of reach.
 */
export const REACHABLE_CANDIDATES = AUTOMATABLE_SURFACES;

export function surfaceById(id) {
  return SURFACES.find((s) => s.id === id) || null;
}

/**
 * The order a single boot must visit surfaces in. This is not cosmetic: a fixture changes the
 * session. Dock and the player never come back to open flight in the same page, so a surface opened
 * after them records a FALSE red ("did not open") that says nothing about the surface. Cheapest
 * first, most session-changing last:
 *
 *   0  already on screen (the HUD)          40  push-screen fixtures (Crucible, automation)
 *  10  a key press in idle flight           60  docking (no undock route in the harness)
 *  +1  per nesting level under its parent    90  ends the run — nothing may follow
 */
export function passOrder(surface, byId = new Map(SURFACES.map((s) => [s.id, s]))) {
  if (surface.destructive) return 90;
  const entry = surface.entry || {};
  switch (entry.kind) {
    case 'default': return 0;
    case 'boot':
    case 'boot-nested': return -10; // the menu phase, before Launch
    case 'key': return 10;
    case 'nested': {
      const parent = byId.get(entry.parent);
      return (parent ? passOrder(parent, byId) : 20) + 1;
    }
    case 'fixture': return entry.fixture === 'dock' ? 60 : 40;
    default: return 80;
  }
}

/** The manifest sorted into a safe single-boot visiting order. */
export function orderForOneBoot(surfaces) {
  const byId = new Map(SURFACES.map((s) => [s.id, s]));
  return [...surfaces].sort((a, b) => passOrder(a, byId) - passOrder(b, byId));
}

/**
 * Manifest self-audit. Returns a list of problem strings; empty means the manifest itself is sound.
 * This is checked by test and by the matrix CLI before it boots anything — a malformed manifest
 * must never present as a green matrix.
 */
export function auditManifest(surfaces = SURFACES) {
  const problems = [];
  const seen = new Set();
  for (const s of surfaces) {
    if (!s.id) problems.push('surface with no id');
    if (seen.has(s.id)) problems.push(`duplicate surface id: ${s.id}`);
    seen.add(s.id);
    if (!ARCHETYPES.includes(s.archetype)) problems.push(`${s.id}: unknown archetype ${s.archetype}`);
    if (!s.title) problems.push(`${s.id}: no title`);
    if (!s.entry || !s.entry.kind) problems.push(`${s.id}: no entry route`);
    if (s.entry && !['public-route', 'fixture', 'none'].includes(s.entry.evidence)) {
      problems.push(`${s.id}: entry.evidence must be public-route | fixture | none`);
    }
    if (s.entry && s.entry.evidence !== 'public-route' && !s.owner && s.scope === 'shipping') {
      problems.push(`${s.id}: not on a public route and has no owner packet`);
    }
    if (s.owner && !ADMITTED_OWNER_PACKETS.includes(s.owner)) {
      problems.push(`${s.id}: owner ${s.owner} is not an admitted packet`);
    }
    if (!Array.isArray(s.checks) || !s.checks.length) problems.push(`${s.id}: no covering checks`);
    if (s.status === 'live' && !s.ownerFile) problems.push(`${s.id}: status live but no owner file`);
  }
  const shipping = surfaces.filter((s) => s.scope === 'shipping').length;
  if (shipping < MIN_MANIFEST_SURFACES) {
    problems.push(`manifest lists ${shipping} shipping surfaces; the floor is ${MIN_MANIFEST_SURFACES}`);
  }
  // The floor is thirty REAL surfaces. A row for a screen that does not exist, or a legacy screen
  // with no route, keeps the manifest honest but must never help clear the count.
  const candidates = surfaces.filter((s) => s.scope === 'shipping'
    && s.ownerFile
    && IMPLEMENTED_ENTRY_KINDS.includes(s.entry.kind)).length;
  if (candidates < MIN_MANIFEST_SURFACES) {
    problems.push(
      `only ${candidates} shipping surfaces both exist and have an implemented opener; `
      + `the floor is ${MIN_MANIFEST_SURFACES} real surfaces (rows for missing or route-less screens do not count)`,
    );
  }
  return problems;
}

export default SURFACES;
