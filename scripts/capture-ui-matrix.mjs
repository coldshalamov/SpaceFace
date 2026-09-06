#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer as createNetServer } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadPlaywright } from './lib/load-playwright.mjs';
import { CAPTURE_SURFACES, IMPLEMENTED_ENTRY_KINDS, orderForOneBoot } from './ui-grammar-surfaces.mjs';
import { RESPONSIVE_WIDTHS } from './ui-grammar-thresholds.mjs';
import {
  UI_AUXILIARY_RAF_SCOPE,
  UI_BUDGET_MEASUREMENT_SCOPE,
  UI_BUDGETS_SCHEMA,
  UI_DOM_LAYOUT_SCOPE,
  UI_FRAME_TOTAL_SCOPE,
  UI_KNOWN_RAF_SCOPE,
  aggregateBudgetRows,
  uiSourceDigest,
} from './lib/uiBudgets.mjs';
// The pseudo-locale is the game's OWN (src/localization/runtime.js), not a string the harness
// invents: a capture that boots a locale the game does not implement would photograph the English
// fallback and call it a +40 % pass. `pseudoLocalize` comes from the same module for the same
// reason: the harness must look for the label the GAME renders, not one it guessed at.
import { PSEUDO_LOCALE, pseudoLocalize } from '../src/localization/runtime.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const DEFAULT_OUTPUT_DIR = path.join(ROOT, '.devshots', 'ui-matrix');

// PQ-184.00 budget columns: the probe reads cost nothing unless the run asks for budgets, so the
// 408-frame reference matrix keeps its exact cost. A budgets run samples BUDGET_SAMPLE_MS of real
// present frames per surface (the synchronous registry UI owner plus authored src/ui callbacks
// bucketed at the same rAF timestamp, with game/unknown-rAF diagnostics alongside) and counts the
// surface's DOM subtree.
const BUDGET_SAMPLE_MS = 600;
let BUDGET_PROBE_ACTIVE = false;
export const UI_FRAME_REFERENCE_DIR = path.join(ROOT, 'test', 'ui-frame-references');
/**
 * Which universe each committed reference frame was photographed in.
 *
 * Without this, a baseline that is half re-shot is worse than no baseline at all: a frame from the
 * old random-universe era, diffed against a seed-pinned capture, reads as a 5-40 % REGRESSION, and
 * nothing anywhere distinguishes that from a real one. The calibration would then bank the
 * difference as that surface's floor — the exact thing this leaf added code to refuse.
 *
 * So a frame counts as coverage only while its recorded seed matches the seed the harness shoots in.
 * Anything else is reported MISSING, with the reason and the command. That also makes the baseline
 * resumable: it can be re-shot a few surfaces at a time, across sessions, and the check always says
 * exactly which frames are current.
 */
export const UI_FRAME_PROVENANCE_FILE = path.join(UI_FRAME_REFERENCE_DIR, 'provenance.json');

/**
 * THE UNIVERSE SEED, pinned.
 *
 * `resetRunState` falls back to `Date.now() ^ Math.random()` when New Game is launched with the seed
 * field blank (src/main.js). Every boot therefore built a DIFFERENT galaxy, and every reference frame
 * was a photograph of a universe no later run would ever see again — different market prices,
 * different contracts, different traffic, different missions. A diff against that is not a
 * regression test; it is a noise generator, and the only way to make it green is a floor wide enough
 * to hide a real change behind.
 *
 * So the harness types a seed, through the same `#sf-ng-seed` field a player types one into. 47 is
 * the repo's canonical fixture seed (`sf-sim ... --seed 47`, every 47a check), and using it here
 * means the visual matrix and the simulation goldens describe the same universe.
 */
export const UI_MATRIX_SEED = 47;

/**
 * THE GROUND, pinned — and the reason a full baseline fits in git at all.
 *
 * A reference frame in this matrix photographs the INTERFACE, over a flat neutral ground. It does
 * not photograph the live 3D picture, and that is a decision about what this instrument measures,
 * not a shortcut:
 *
 *   * Every rule the grammar matrix scores — type roles and the 12 px floor, tabular numerals,
 *     colour spent only on state, the layout skeleton, clipping at +40 %, forced-colours,
 *     reduce-motion — is a property of the interface layer. None of them is a property of the
 *     starfield behind it.
 *   * The 3D picture already has its own instruments: the runtime witness, the fun-loop bench
 *     strips, the shipping-camera captures. A screenshot diff is the wrong tool for it, and using
 *     one costs the matrix its whole reason to exist: the world legitimately moves, so the floor has
 *     to be widened until a real interface regression fits inside it. `flight` carried a 10 % floor
 *     for exactly that reason — 10 % of 2560x1080 is 276,000 pixels of change that this gate would
 *     have called "at rest".
 *   * And it is what makes the baseline affordable. The live picture is high-entropy noise that PNG
 *     cannot compress; flat ground plus DOM is the opposite.
 *
 * TWO things are hidden, because the game's 3D picture reaches the screen two ways:
 *
 *   * `#gl-canvas` — the single WebGL surface the renderer draws into (src/render/renderer.js), the
 *     live picture;
 *   * the `#screens` cinematic plate (`assets/cinematics/C-INTRO-01.jpg`, styles/ui.css) — the SAME
 *     picture, pre-rendered, standing behind the menu-phase screens whenever a run is not live.
 *
 * Calling the live one "ground" and the baked one "interface" would be incoherent: they are the same
 * content in two encodings, and the second is the most expensive thing in the matrix (2.3 MB of
 * photographic PNG per frame at 2560, on six surfaces). What that plate can hide is an asset change,
 * which belongs to the visual-asset route and not to a type-and-layout gate.
 *
 * Everything the INTERFACE itself draws is kept and photographed, including the parts that sit
 * between the plate and the panel: the `#screens::before` readability scrim and its vignette
 * composite over the neutral ground exactly as they composite over the plate, so a regression that
 * breaks the scrim is still a diff. Every canvas the interface owns is kept too — the radar dial
 * (src/ui/radar.js), the chart, the ship stage's hull preview, portrait art. The line is "is this the
 * game's 3D world", not "is this a canvas" and not "is this a background".
 *
 * `opacity: 0` rather than `visibility: hidden` or `display: none`: the canvas keeps its box and its
 * hit-testing, so `src/systems/input.js` (which binds to `#gl-canvas`) and `autoTargetAssist.js`
 * (which reads its rect) behave exactly as they do in play. Nothing about the game changes except
 * what reaches the film.
 *
 * The hex is part of the token. A frame shot over a different ground colour is a different
 * photograph, and a silent change to this constant would move every diff in the matrix with nothing
 * anywhere saying so — the same failure mode as the unpinned seed, one layer down.
 */
export const NEUTRAL_GROUND_HEX = '#12151a';
export const UI_MATRIX_GROUND = `neutral-${NEUTRAL_GROUND_HEX.slice(1)}`;

/**
 * `!important` on both rules, and appended after the document's own stylesheets: `src/ui/uiRoot.js`
 * injects HUD CSS at runtime, which lands after a `<link>` in `<head>` and would win a tie.
 *
 * Under the forced-colours column Chromium substitutes the system `Canvas` colour for this
 * background. That is still a flat, deterministic ground — it is simply the system's, not this hex,
 * and it is the correct ground for that mode.
 */
const NEUTRAL_GROUND_CSS = `
  #gl-canvas { opacity: 0 !important; }
  html, body { background: ${NEUTRAL_GROUND_HEX} !important; background-image: none !important; }
  /* The baked half of the picture. Only the IMAGE goes: #screens keeps whatever background-colour
     the interface gives it, and the ::before scrim above it is untouched, so the neutral ground
     shows through exactly where the plate used to. */
  #screens { background-image: none !important; }
`;

/**
 * Applied once per boot, immediately after the document exists and long before any frame is shot —
 * the title screen is photographed inside `menuPhase`, which runs later in the same `openBoot`.
 */
async function applyNeutralGround(page) {
  await page.addStyleTag({ content: NEUTRAL_GROUND_CSS });
}

const FLIGHT_SETTLE_MS = 1500;
const SURFACE_SETTLE_MS = 1500;
const SHIP_STAGE_SETTLE_MS = 6000;
const MAIN_MENU_TIMEOUT_MS = 90_000;
const NEW_GAME_TIMEOUT_MS = 45_000;

// PQ-180 .01 law: the three widths are declared once, in scripts/ui-grammar-thresholds.mjs, and
// nothing else may re-declare them. Only the capture HEIGHT is local — it is a framing choice
// (1080 for the two 16:9-and-wider desktop widths, 720 for the laptop width), not a floor.
const VIEWPORT_HEIGHTS = Object.freeze({ 1280: 720, 1920: 1080, 2560: 1080 });
export const MATRIX_VIEWPORTS = Object.freeze(
  // Widest first: the ultrawide safe-box rule is the one most likely to abort a boot, so it is
  // discovered in the first minute of a run rather than the last.
  [...RESPONSIVE_WIDTHS].sort((a, b) => b - a).map((width) => {
    const height = VIEWPORT_HEIGHTS[width];
    if (!height) throw new Error(`no capture height declared for threshold width ${width}`);
    return Object.freeze({ width, height });
  }),
);

const STANDARD_MODES = Object.freeze([
  Object.freeze({
    id: 'default',
    emulate: Object.freeze({ reducedMotion: 'no-preference', forcedColors: 'none' }),
  }),
  Object.freeze({
    id: 'reduced-motion',
    emulate: Object.freeze({ reducedMotion: 'reduce', forcedColors: 'none' }),
  }),
  Object.freeze({
    id: 'forced-colors',
    emulate: Object.freeze({ reducedMotion: 'no-preference', forcedColors: 'active' }),
  }),
]);

const PSEUDO_MODE = Object.freeze({
  id: 'pseudo-localized',
  emulate: Object.freeze({ reducedMotion: 'no-preference', forcedColors: 'none' }),
  locale: PSEUDO_LOCALE,
});

// Per-surface settle overrides. Everything else takes SURFACE_SETTLE_MS. The ship stage waits
// longest because its WebGL preview streams a hull before it is worth photographing.
const SETTLE_OVERRIDES = Object.freeze({
  flight: FLIGHT_SETTLE_MS,
  ship: SHIP_STAGE_SETTLE_MS,
});

// PQ-180 .03: the capture surface list is no longer hand-written here — it is the manifest in
// scripts/ui-grammar-surfaces.mjs, so a surface added to the matrix is captured by construction and
// the two can never drift. The five original ids (flight/ship/footprint/range/chart) keep their
// names, so the committed reference PNGs for them stay valid byte-for-byte.
export const MATRIX_SURFACES = Object.freeze(CAPTURE_SURFACES.map((surface) => Object.freeze({
  id: surface.id,
  key: surface.entry.kind === 'key' ? surface.entry.key : null,
  entry: surface.entry,
  screenId: surface.screenId || null,
  archetype: surface.archetype,
  selectors: Object.freeze([...(surface.root || [])]),
  settleMs: SETTLE_OVERRIDES[surface.id] || SURFACE_SETTLE_MS,
  destructive: surface.destructive === true,
  // A surface whose preparation leaves the session somewhere else — a different sector, a hull
  // parked against a rock. Photographed in a boot of its own so nothing after it inherits that world.
  isolatedBoot: surface.isolatedBoot === true,
  // 'element' crops to the surface's own box — the right frame for an overlay that lives inside the
  // flight picture (the Power Rail, the radials). Anything else is the whole viewport.
  captureMode: surface.captureMode === 'element' ? 'element' : 'viewport',
})));

const SURFACE_BY_ID = new Map(MATRIX_SURFACES.map((surface) => [surface.id, surface]));

export function readReferenceProvenance(file = UI_FRAME_PROVENANCE_FILE) {
  if (!existsSync(file)) return { seed: null, ground: null, frames: {} };
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    return { seed: parsed.seed ?? null, ground: parsed.ground ?? null, frames: parsed.frames || {} };
  } catch (_) {
    // An unreadable record means NOTHING is known to be current, which is the safe reading: every
    // frame is reported missing and re-shot, rather than silently trusted.
    return { seed: null, ground: null, frames: {} };
  }
}

/**
 * Is this committed frame comparable with what the harness shoots today? Two questions, one answer,
 * asked from three places (coverage, the fill-missing keep test, and the tests) so they can never
 * drift apart:
 *
 *   * the same universe — a frame from another seed shows different prices, contracts and traffic;
 *   * the same ground — a frame shot over the live 3D picture, diffed against one shot over the
 *     neutral ground, is a 40-90 % difference that has nothing to do with the interface.
 *
 * A frame that fails either is reported MISSING, never diffed, and re-shot even under
 * `--fill-missing`.
 */
export function isFrameCurrent(record, { seed = UI_MATRIX_SEED, ground = UI_MATRIX_GROUND } = {}) {
  if (!record) return false;
  if (seed != null && record.seed !== seed) return false;
  if (ground != null && record.ground !== ground) return false;
  return true;
}

/**
 * Flushed after every promoted frame, not at the end of the run. A full matrix takes hours; a record
 * written only after the last frame would turn any interruption into a baseline whose provenance is
 * unknown — which is the same lie in a different place.
 */
function recordReferenceProvenance(name, provenance) {
  provenance.frames[name] = {
    seed: UI_MATRIX_SEED,
    ground: UI_MATRIX_GROUND,
    capturedAt: new Date().toISOString(),
  };
  provenance.seed = UI_MATRIX_SEED;
  provenance.ground = UI_MATRIX_GROUND;
  writeFileSync(UI_FRAME_PROVENANCE_FILE, `${JSON.stringify({
    _law: 'test/ui-frame-references/README.md — a frame counts as coverage only while it was shot in '
      + 'the universe the harness shoots in AND over the ground the harness shoots over. A frame from '
      + 'another seed, or over the live 3D picture, is reported MISSING and never diffed.',
    seed: provenance.seed,
    ground: provenance.ground,
    frames: Object.fromEntries(Object.entries(provenance.frames).sort(([a], [b]) => a.localeCompare(b))),
  }, null, 2)}
`);
}

/** Pre-launch surfaces (title, new game) live before Launch and are captured in the menu phase. */
const PRE_LAUNCH_KINDS = new Set(['boot', 'boot-nested']);
// Ordered by scripts/ui-grammar-surfaces.mjs `orderForOneBoot`: a fixture changes the session, so
// key-entry flight surfaces come first, push-screen fixtures next, docking after that. A destructive
// surface would end the run for every mode sharing this boot, so it is photographed in its own boot
// (OWN_BOOT_SURFACES below) rather than being dropped from the plan.
const NEEDS_OWN_BOOT = (s) => s.destructive || s.isolatedBoot;
const IN_FLIGHT_SURFACES = Object.freeze(orderForOneBoot(
  MATRIX_SURFACES.filter((s) => !PRE_LAUNCH_KINDS.has(s.entry.kind) && s.id !== 'flight' && !NEEDS_OWN_BOOT(s)),
));
// One boot each, per mode. `game-over` ends the run; Asteroid Works parks the hull against a rock
// and the claims board flies to another sector. Sharing a boot with any of them would make every
// later frame a picture of what they left behind — and, for the station fixture, of a sector that
// may have no station in it at all.
const OWN_BOOT_SURFACES = Object.freeze(orderForOneBoot(MATRIX_SURFACES.filter(NEEDS_OWN_BOOT)));

export const ALL_MODES = Object.freeze([...STANDARD_MODES, PSEUDO_MODE]);

/**
 * A capture filter. It exists so a single surface, mode or width can be re-shot after a defect is
 * fixed without paying for the whole matrix again. It NEVER narrows the plan the check judges
 * against: `buildFramePlan()` with no argument is always the full matrix, and that is what
 * `check-visual-regression` and `check-ui-grammar-matrix` call. A filtered run can only write
 * frames; it can never make a missing frame disappear from the coverage table.
 */
export function normalizeFrameFilter(filter) {
  if (!filter) return { surfaces: null, modes: null, viewports: null };
  // IDEMPOTENT on purpose: the normalized form is passed on to the menu-phase capture, and a second
  // normalization that dropped it on the floor is exactly how `--only=` stopped applying there.
  // Sets in, Sets out; arrays in, Sets out; null stays null.
  const set = (values) => {
    const list = values instanceof Set ? [...values] : values;
    if (!Array.isArray(list) || !list.length) return null;
    const cleaned = list.map((v) => String(v).trim()).filter(Boolean);
    return cleaned.length ? new Set(cleaned) : null;
  };
  const viewports = set(filter.viewports);
  return {
    surfaces: set(filter.surfaces),
    modes: set(filter.modes),
    // "1280" and "1280x720" both name the same viewport; the short form is what a human types.
    viewports: viewports ? new Set([...viewports].map((v) => v.split('x')[0])) : null,
  };
}

function planIncludes(filter, { surfaceId, modeId, viewport }) {
  if (filter.surfaces && surfaceId != null && !filter.surfaces.has(surfaceId)) return false;
  if (filter.modes && modeId != null && !filter.modes.has(modeId)) return false;
  if (filter.viewports && viewport != null && !filter.viewports.has(String(viewport.width))) return false;
  return true;
}

export function buildFramePlan(filter = null) {
  const active = normalizeFrameFilter(filter);
  const out = [];
  for (const viewport of MATRIX_VIEWPORTS) {
    if (!planIncludes(active, { viewport })) continue;
    for (const mode of ALL_MODES) {
      if (!planIncludes(active, { modeId: mode.id })) continue;
      for (const surface of MATRIX_SURFACES) {
        if (!planIncludes(active, { surfaceId: surface.id })) continue;
        out.push(Object.freeze({
          surface: surface.id,
          mode: mode.id,
          viewport: `${viewport.width}x${viewport.height}`,
          width: viewport.width,
          height: viewport.height,
        }));
      }
    }
  }
  return out;
}

export function frameFileName({ surface, mode, width, height }) {
  return `${surface}-${mode}-${width}x${height}.png`;
}

export async function captureUiMatrix(options = {}) {
  const outputDir = path.resolve(options.outputDir || DEFAULT_OUTPUT_DIR);
  const budgetsOut = options.budgetsOut
    ? path.resolve(options.budgetsOut)
    : null;
  if (budgetsOut) BUDGET_PROBE_ACTIVE = true;
  const updateReferences = options.updateReferences === true;
  // Fill-missing writes ONLY references that do not exist yet and never prunes. That is what makes
  // it safe to grow the baseline from 60 frames to the full matrix without touching a single one of
  // the five surfaces whose diff floors were calibrated against the exact bytes on disk
  // (test/ui-frame-references/README.md, the golden law).
  const fillMissingOnly = options.fillMissingOnly === true;
  const printTable = options.printTable !== false;
  const quiet = options.quiet === true;
  const filter = normalizeFrameFilter(options.filter || null);
  // The REST TWIN: a second screenshot of the same surface, taken one settle beat after the first,
  // through the same open. It is how this harness measures whether a surface was actually AT REST
  // when it was photographed — the thing the old two-full-pass repeatability guard was really
  // asking, at a twelfth of the cost now that the matrix is 480 frames instead of 60.
  const restTwinDir = options.restTwinDir ? path.resolve(options.restTwinDir) : null;
  const promoteReference = fillMissingOnly ? 'fill-missing' : (updateReferences ? 'overwrite' : null);
  const provenance = promoteReference ? readReferenceProvenance() : null;
  const plan = buildFramePlan(options.filter || null);
  const byName = new Map(plan.map((entry) => [frameFileName(entry), entry]));
  const modes = STANDARD_MODES.filter((mode) => planIncludes(filter, { modeId: mode.id }));
  const pseudoIncluded = planIncludes(filter, { modeId: PSEUDO_MODE.id });
  const inFlightSurfaces = IN_FLIGHT_SURFACES.filter((surface) => planIncludes(filter, { surfaceId: surface.id }));
  const ownBootSurfaces = OWN_BOOT_SURFACES.filter((surface) => planIncludes(filter, { surfaceId: surface.id }));
  const flightIncluded = planIncludes(filter, { surfaceId: 'flight' });
  // Everything ONE shared boot is responsible for: the menu-phase surfaces, the flight HUD, and the
  // in-flight surfaces. A destructive surface gets its own boot, so a shared-boot failure never
  // speaks for it.
  const allPlannedSurfaces = MATRIX_SURFACES.filter(
    (surface) => !NEEDS_OWN_BOOT(surface) && planIncludes(filter, { surfaceId: surface.id }),
  );
  const inBootSurfaces = allPlannedSurfaces.filter((surface) => !PRE_LAUNCH_KINDS.has(surface.entry.kind));

  mkdirSync(outputDir, { recursive: true });
  if (restTwinDir) mkdirSync(restTwinDir, { recursive: true });
  if (updateReferences || fillMissingOnly) mkdirSync(UI_FRAME_REFERENCE_DIR, { recursive: true });

  const { chromium } = await loadPlaywright();
  // Server first, browser second, and the server is torn down if the browser never starts — a
  // stranded node server would hold its port for every later run.
  const server = await startFreshServer();
  let browser = null;
  try {
    browser = await chromium.launch({ headless: options.headed !== true });
  } catch (error) {
    server.kill();
    throw new Error(`chromium.launch failed (server torn down): ${error.message}`);
  }

  const captures = [];
  // A surface that could not be opened is an EXPLICIT missing/error entry, never a silently short
  // plan: PQ-180 .03 covers every surface, and a gap has to be visible to be assigned.
  const failures = [];
  let bootCount = 0;

  try {
    for (const viewport of MATRIX_VIEWPORTS) {
      if (!planIncludes(filter, { viewport })) continue;
      // A filtered run that only names an own-boot surface (Asteroid Works, the claims board,
      // game-over) has nothing for a shared session to photograph. Booting one anyway used to cost
      // two extra launches per width — minutes each — before the isolated boots even started.
      const sharedWork = flightIncluded
        || inBootSurfaces.length > 0
        || MATRIX_SURFACES.some((surface) => (
          PRE_LAUNCH_KINDS.has(surface.entry.kind) && planIncludes(filter, { surfaceId: surface.id })
        ));
      if (modes.length && sharedWork) {
        // A boot that never comes up costs THIS viewport's frames, not the run. Before this, the
        // throw escaped captureUiMatrix, and check:visual-regression's retry loop answered it by
        // re-shooting the entire matrix — an hour of capture to re-ask a question already answered.
        // Now the frames it cost are named, one row each, and the next viewport still runs.
        let primaryBoot = null;
        try {
          primaryBoot = await openBootWithRetry({
            browser,
            baseUrl: server.baseUrl,
            viewport,
            locale: null,
            menuPhase: makeMenuPhaseCapture({ modes, outputDir, captures, failures, viewport, filter, restTwinDir, promoteReference, provenance }),
          });
        } catch (error) {
          recordBootFailure({ failures, surfaces: allPlannedSurfaces, modes, viewport, reason: error.message });
        }
        if (primaryBoot) {
          bootCount += 1;
          try {
            for (const mode of modes) {
              try {
                await captureModeSet({
                  page: primaryBoot.page,
                  viewport,
                  mode,
                  outputDir,
                  captures,
                  failures,
                  surfaces: inFlightSurfaces,
                  captureFlight: flightIncluded,
                  restTwinDir,
                  promoteReference,
                  provenance,
                });
              } catch (error) {
                // One mode wedging the page must not silently cost the modes after it their rows.
                recordBootFailure({ failures, surfaces: inBootSurfaces, modes: [mode], viewport, reason: `mode pass aborted: ${error.message}` });
              }
            }
          } finally {
            await primaryBoot.close();
          }
        }
      }

      if (pseudoIncluded && sharedWork) {
        let pseudoBoot = null;
        try {
          pseudoBoot = await openBootWithRetry({
            browser,
            baseUrl: server.baseUrl,
            viewport,
            locale: PSEUDO_MODE.locale,
            menuPhase: makeMenuPhaseCapture({ modes: [PSEUDO_MODE], outputDir, captures, failures, viewport, filter, restTwinDir, promoteReference, provenance }),
          });
        } catch (error) {
          recordBootFailure({ failures, surfaces: allPlannedSurfaces, modes: [PSEUDO_MODE], viewport, reason: error.message });
        }
        if (pseudoBoot) {
          bootCount += 1;
          try {
            await captureModeSet({
              page: pseudoBoot.page,
              viewport,
              mode: PSEUDO_MODE,
              outputDir,
              captures,
              failures,
              expectedLocale: PSEUDO_MODE.locale,
              surfaces: inFlightSurfaces,
              captureFlight: flightIncluded,
              restTwinDir,
              promoteReference,
              provenance,
            });
          } catch (error) {
            recordBootFailure({ failures, surfaces: inBootSurfaces, modes: [PSEUDO_MODE], viewport, reason: `pseudo-locale pass aborted: ${error.message}` });
          } finally {
            await pseudoBoot.close();
          }
        }
      }

      // A boot to itself — see OWN_BOOT_SURFACES.
      //
      // Destructive surfaces end the run, so each mode is its own boot. Asteroid Works reels the
      // hull into the rock; a second mode in that same boot would photograph (and fail to re-latch)
      // the aftermath. Other isolatedBoot surfaces (the claims board) only change sector, and can
      // still share a boot across media modes, with a second boot only for the pseudo-locale.
      for (const surface of ownBootSurfaces) {
        const groups = (surface.destructive || surface.id === 'asteroid-works')
          ? [...modes, ...(pseudoIncluded ? [PSEUDO_MODE] : [])].map((mode) => [mode])
          : [modes, ...(pseudoIncluded ? [[PSEUDO_MODE]] : [])].filter((group) => group.length);
        for (const group of groups) {
          const needed = [];
          for (const mode of group) {
            const frameName = frameFileName({
              surface: surface.id,
              mode: mode.id,
              width: viewport.width,
              height: viewport.height,
            });
            if (promoteReference === 'fill-missing' && provenance
              && existsSync(path.join(UI_FRAME_REFERENCE_DIR, frameName))
              && isFrameCurrent(provenance.frames[frameName])) {
              captures.push({ name: frameName, path: path.join(UI_FRAME_REFERENCE_DIR, frameName), reference: 'kept' });
            } else {
              needed.push(mode);
            }
          }
          if (!needed.length) continue;
          const locale = needed[0].locale || null;
          let isolated = null;
          try {
            isolated = await openBootWithRetry({ browser, baseUrl: server.baseUrl, viewport, locale });
          } catch (error) {
            for (const mode of needed) {
              failures.push({ surface: surface.id, mode: mode.id, viewport, reason: `isolated boot failed: ${error.message}` });
            }
            continue;
          }
          bootCount += 1;
          try {
            await waitForSimTicks(isolated.page, 90, 45_000, FLIGHT_SETTLE_MS);
            await waitUntilFlightKeysLive(isolated.page);
            for (const mode of needed) {
              try {
                await isolated.page.emulateMedia(mode.emulate);
                const opened = await openSurface(isolated.page, surface);
                if (!opened.ok) {
                  failures.push({ surface: surface.id, mode: mode.id, viewport, reason: opened.reason });
                  continue;
                }
                await isolated.page.waitForTimeout(surface.settleMs);
                await stabilizeSurfaceForCapture(isolated.page, surface.id);
                await captureSurfaceScreenshot({
                  page: isolated.page, outputDir, captures, surface, modeId: mode.id, viewport, restTwinDir, promoteReference, provenance,
                });
              } catch (error) {
                failures.push({ surface: surface.id, mode: mode.id, viewport, reason: error.message });
              }
              // Re-open for the next mode from a KNOWN state. Verified, like everywhere else: a
              // screen left open would be photographed again under the next mode's name.
              if (needed.length > 1) {
                const closed = await closeSurface(isolated.page, surface).catch((error) => ({ ok: false, reason: error.message }));
                if (!closed.ok) {
                  recordBootFailure({
                    failures,
                    surfaces: [surface],
                    modes: needed.slice(needed.indexOf(mode) + 1),
                    viewport,
                    reason: `${surface.id} did not close between modes (${closed.reason})`,
                  });
                  break;
                }
              }
            }
          } finally {
            await isolated.close().catch(() => {});
          }
        }
      }
    }
  } finally {
    await browser.close().catch(() => {});
    server.kill();
  }

  // A surface can be photographed twice in one boot when it is both a menu stage and a child of the
  // stage before it. The FILE is the same; counting it twice would overstate coverage.
  //
  // This block MUST stay above its first reader. It was below them once, and because `const` is not
  // hoisted the run threw a ReferenceError after the browser and the server had already been torn
  // down — so every COMPLETE capture failed at the last step, and the check's retry loop answered
  // that by re-shooting the whole matrix three times.
  const seenNames = new Set();
  const uniqueCaptures = captures.filter((capture) => {
    if (seenNames.has(capture.name)) return false;
    seenNames.add(capture.name);
    return true;
  });

  if (uniqueCaptures.length !== plan.length && !quiet) {
    console.warn(
      `\ncapture coverage: ${uniqueCaptures.length}/${plan.length} planned frames produced; `
      + `${failures.length} explicit failure(s) recorded (see the table below).`,
    );
  }

  if (updateReferences && !fillMissingOnly
    && !filter.surfaces && !filter.modes && !filter.viewports) {
    // Pruning is only ever correct for a FULL, unfiltered rewrite: a filtered or fill-missing run
    // has not produced the frames it would be deleting.
    //
    // And it prunes against the PLAN, not against what this run happened to capture. Pruning against
    // the captures would delete a perfectly good reference because one run could not open its surface
    // — a transient timeout would quietly destroy a frame that takes an hour to shoot, and the next
    // run would report it as missing coverage with no idea why. Stale means "no longer in the
    // matrix", which is a question about the manifest, not about tonight's luck.
    pruneStaleReferencePngs(new Set(plan.map((entry) => frameFileName(entry))));
  }

  const enriched = uniqueCaptures
    .map((capture) => ({
      ...capture,
      bytes: statSync(capture.path).size,
      plan: byName.get(capture.name) || null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }));

  const totalBytes = enriched.reduce((sum, row) => sum + row.bytes, 0);

  if (printTable && !quiet) {
    printCaptureTable({
      rows: enriched,
      outputDir,
      updateReferences,
      bootCount,
      totalBytes,
    });
    printCaptureFailures(failures, plan.length, enriched.length);
  }

  const result = {
    outputDir,
    bootCount,
    totalBytes,
    captures: enriched,
    failures,
    referencesWritten: uniqueCaptures.filter((c) => c.reference === 'written').length,
    referencesKept: uniqueCaptures.filter((c) => c.reference === 'kept').length,
    referenceDir: UI_FRAME_REFERENCE_DIR,
    frames: plan.length,
    renderer: options.headed === true
      ? 'headed Chromium (host GPU)'
      : 'headless Chromium (SwiftShader software rendering — not performance acceptance evidence)',
  };
  // PQ-184.00: a --budgets-out run writes the per-surface budget baseline beside the reference
  // PNGs — the "matrix columns live; baseline committed" half of the leaf. The baseline names its
  // renderer (a headed run is performance evidence; headless SwiftShader is not) and the UI
  // source digest it budgets, so a stale baseline is itself red in check:ui:budgets.
  if (budgetsOut) {
    const surfaces = aggregateBudgetRows(enriched);
    const budgeted = Object.keys(surfaces).length;
    if (!budgeted) {
      throw new Error('budget probe produced no scoped UI rows — the page did not expose a usable '
        + 'registry.get("ui").frame sample (or its game-frame/DOM evidence was missing)');
    }
    // A surface the run NAMED as a capture failure (with its reason) is recorded as a named gap,
    // not silently dropped: the judge accepts a named gap and refuses an unnamed one, so the
    // baseline can never quietly shrink. This includes surfaces whose probe simply returned no
    // usable samples on a loaded box — they are named too, with the reason they have no row.
    const budgetedIds = new Set(Object.keys(surfaces));
    const plannedIds = [...new Set((allPlannedSurfaces || []).map((s) => s.id))]
      .filter((id) => planIncludes(filter, { surfaceId: id }));
    const reasonFor = (id) => {
      const hit = (failures || []).find((f) => f && f.surface === id);
      return hit
        ? `${hit.mode}@${hit.viewport?.width}x${hit.viewport?.height}: ${hit.reason}`
        : 'no budget row: the probe returned no usable samples in the sampling window';
    };
    const missing = plannedIds
      .filter((id) => !budgetedIds.has(id))
      .map((id) => ({ surface: id, reason: reasonFor(id) }));
    const baseline = {
      schema: UI_BUDGETS_SCHEMA,
      capturedAt: new Date().toISOString(),
      headed: options.headed === true,
      renderer: result.renderer,
      measurementScope: UI_BUDGET_MEASUREMENT_SCOPE,
      frameTotalScope: UI_FRAME_TOTAL_SCOPE,
      knownUiRafScope: UI_KNOWN_RAF_SCOPE,
      auxiliaryRafScope: UI_AUXILIARY_RAF_SCOPE,
      domLayoutScope: UI_DOM_LAYOUT_SCOPE,
      measured: 'synchronous registry.get("ui").frame plus authored src/ui requestAnimationFrame '
        + 'callback CPU bucketed per presentation timestamp, 150 ms warm-up discarded; worst '
        + 'combined UI sample per surface over a 600 ms headed window',
      excluded: 'browser layout/paint deferred after the owner callback is outside this CPU window; '
        + 'unclassified non-game requestAnimationFrame callbacks are reported separately as auxiliaryRaf* diagnostics',
      seed: UI_MATRIX_SEED,
      uiSourceDigest: uiSourceDigest(ROOT),
      surfaces,
      missing,
    };
    mkdirSync(path.dirname(budgetsOut), { recursive: true });
    writeFileSync(budgetsOut, `${JSON.stringify(baseline, null, 2)}\n`);
    console.log(`ui budget baseline: ${budgeted} surfaces (+${missing.length} named gaps) → ${budgetsOut}`);
  }
  return result;
}

/** Named, per-frame reasons — a plan entry with no PNG must say why, or it is just silence. */
function printCaptureFailures(failures, planned, produced) {
  console.log(`\ncapture coverage: ${produced}/${planned} planned frames produced`);
  if (!failures.length) return;
  console.log(`${failures.length} frame(s) could not be captured:`);
  const bySurface = new Map();
  for (const f of failures) {
    const bucket = bySurface.get(f.surface) || [];
    bucket.push(`${f.mode}@${f.viewport.width}x${f.viewport.height}: ${f.reason}`);
    bySurface.set(f.surface, bucket);
  }
  for (const [surface, reasons] of bySurface) {
    console.log(`  ${surface} (${reasons.length})`);
    console.log(`    ${reasons[0]}`);
  }
}

function pruneStaleReferencePngs(expectedNames) {
  for (const name of readdirSync(UI_FRAME_REFERENCE_DIR)) {
    if (!/\.png$/i.test(name)) continue;
    if (expectedNames.has(name)) continue;
    rmSync(path.join(UI_FRAME_REFERENCE_DIR, name), { force: true });
  }
}

async function captureModeSet({
  page,
  viewport,
  mode,
  outputDir,
  captures,
  failures,
  expectedLocale = null,
  surfaces = IN_FLIGHT_SURFACES,
  captureFlight = true,
  restTwinDir = null,
  promoteReference = null,
  provenance = null,
}) {
  await page.emulateMedia(mode.emulate);
  await ensureFlightIdle(page);
  if (expectedLocale) {
    await page.waitForFunction(
      (locale) => document.documentElement.dataset.locale === locale,
      expectedLocale,
      { timeout: 20_000 },
    );
  }

  await waitForSimTicks(page, 90, 45_000, FLIGHT_SETTLE_MS);
  // The intro live-screen fence also swallows Space/F. Shared-boot flight waits it out before
  // photographing; isolated boots (Asteroid Works, claims) must too or the Massline never latches.
  await waitUntilFlightKeysLive(page);
  if (captureFlight) {
    await captureSurfaceScreenshot({
      page,
      outputDir,
      captures,
      surface: SURFACE_BY_ID.get('flight'),
      modeId: mode.id,
      viewport,
      restTwinDir,
      promoteReference,
      provenance,
    });
  }

  for (let index = 0; index < surfaces.length; index += 1) {
    const surface = surfaces[index];
    try {
      const opened = await openSurface(page, surface);
      if (!opened.ok) {
        failures.push({ surface: surface.id, mode: mode.id, viewport, reason: opened.reason });
      } else {
        await page.waitForTimeout(surface.settleMs);
        await stabilizeSurfaceForCapture(page, surface.id);
        await captureSurfaceScreenshot({
          page,
          outputDir,
          captures,
          surface,
          modeId: mode.id,
          viewport,
          restTwinDir,
          promoteReference,
          provenance,
        });
      }
    } catch (error) {
      failures.push({ surface: surface.id, mode: mode.id, viewport, reason: error.message });
    }
    // Recovery is mandatory and VERIFIED, not best-effort: a radial or drawer left open would be
    // photographed on top of the next surface — and it would eat the Escape that opens pause — so
    // every later frame in this mode would show a defect that is really this one.
    const closed = await closeSurface(page, surface).catch((error) => ({ ok: false, reason: error.message }));
    if (!closed.ok) {
      failures.push({ surface: surface.id, mode: mode.id, viewport, reason: closed.reason });
      recordSkippedRest({ surfaces, index, mode, viewport, failures, cause: `${surface.id} did not close` });
      return;
    }
    try {
      await ensureFlightIdle(page);
    } catch (error) {
      failures.push({
        surface: surface.id, mode: mode.id, viewport,
        reason: `could not return to idle flight after this surface: ${error.message}`,
      });
      recordSkippedRest({ surfaces, index, mode, viewport, failures, cause: `flight never came back after ${surface.id}` });
      return;
    }
  }
}

/**
 * When a surface refuses to close, every surface after it in this mode goes unphotographed. Naming
 * only the surface that jammed would leave those frames MISSING with no reason at all — and a
 * missing frame with no reason is exactly the silence PQ-180 exists to prevent. So each one gets its
 * own row saying which surface upstream cost it its frame.
 */
/**
 * A boot that never came up, or a pass that aborted, costs whole blocks of frames at once. Naming
 * only the boot would leave those frames MISSING with no reason — the silence PQ-180 exists to
 * prevent — so every frame the failed boot was responsible for gets its own row saying so.
 */
function recordBootFailure({ failures, surfaces, modes, viewport, reason }) {
  for (const surface of surfaces) {
    for (const mode of modes) {
      failures.push({
        surface: surface.id,
        mode: mode.id,
        viewport,
        skipped: true,
        reason: `skipped: ${reason}, so this surface was never opened at this width`,
      });
    }
  }
}

function recordSkippedRest({ surfaces, index, mode, viewport, failures, cause }) {
  for (let i = index + 1; i < surfaces.length; i += 1) {
    failures.push({
      surface: surfaces[i].id,
      mode: mode.id,
      viewport,
      skipped: true,
      reason: `skipped: ${cause}, so this surface was never opened in this pass`,
    });
  }
}

/**
 * Return to the menu stage after opening something from it. `closeOpenScreens` can never succeed
 * here: the title screen is ITSELF an open screen, so "close the open screen" would loop through
 * twelve Escapes and then throw. One Escape, then wait for the stage to be back.
 */
async function returnToStage(page, stage) {
  for (let i = 0; i < 8; i += 1) {
    if (await anyVisible(page, stage.selectors)) return { ok: true };
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
  }
  return { ok: false, reason: `could not return to "${stage.id}" in the menu phase` };
}

/**
 * Open one manifest surface the way its entry route says to. Returns { ok, reason } instead of
 * throwing, so an unreachable surface becomes an explicit red cell in the grammar matrix rather
 * than an aborted run. Never force-injects DOM or instantiates a screen object directly — a
 * surface that cannot be reached through a control or a NAMED fixture is reported as unreachable.
 */
export async function openSurface(page, surface, context = {}) {
  const entry = surface.entry || {};
  if (!IMPLEMENTED_ENTRY_KINDS.includes(entry.kind)) {
    return { ok: false, reason: `no opener implemented for entry kind "${entry.kind}": ${entry.detail || ''}` };
  }
  try {
    switch (entry.kind) {
      case 'default':
        await ensureFlightIdle(page);
        break;
      case 'key': {
        await ensureFlightIdle(page);
        const prepared = await prepareForKeyEntry(page, surface);
        if (!prepared.ok) return prepared;
        if (prepared.handled) break;
        await page.keyboard.press(normalizeKey(entry.key));
        if (prepared.pressTwice) {
          // The base screen is registered lazily: the first press only starts the registration and
          // toasts "press again in a moment" (src/ui/input.js). A second press is what a player does.
          await page.waitForTimeout(700);
          await page.keyboard.press(normalizeKey(entry.key));
        }
        break;
      }
      case 'nested': {
        const parent = SURFACE_BY_ID.get(entry.parent) || null;
        if (!parent) return { ok: false, reason: `parent surface "${entry.parent}" is not in the capture set` };
        const parentOpened = await openSurface(page, parent, context);
        if (!parentOpened.ok) return { ok: false, reason: `parent ${entry.parent}: ${parentOpened.reason}` };
        await page.waitForTimeout(300);
        const clicked = await clickControl(page, entry);
        if (!clicked.ok) return { ok: false, reason: clicked.reason };
        break;
      }
      case 'fixture': {
        const applied = await applyFixture(page, entry.fixture);
        if (!applied.ok) return applied;
        break;
      }
      case 'boot':
        // The stage itself is already on screen during the menu phase; there is nothing to press.
        if (context.stage !== surface.id) {
          return { ok: false, reason: 'pre-launch surface: only openable during the menu phase of a boot' };
        }
        break;
      case 'boot-nested': {
        if (context.stage !== entry.parent) {
          return { ok: false, reason: `pre-launch surface: only openable while "${entry.parent}" is on screen` };
        }
        const clicked = await clickControl(page, entry);
        if (!clicked.ok) return { ok: false, reason: clicked.reason };
        break;
      }
      default:
        return { ok: false, reason: `no automatable entry (${entry.kind}): ${entry.detail || ''}` };
    }

    const selectors = surfaceSelectors(surface);
    if (!selectors.length) return { ok: true, route: entry.kind };
    // Asteroid Works presses `b` and then the tether reels the hull in before the screen is
    // pushed. Twenty seconds is enough on a quiet laptop; forced-colors at 2560 is the slowest
    // Chromium path and timed out there with the latch already live.
    const visibleMs = surface.id === 'asteroid-works' ? 60_000 : 20_000;
    await waitForAnyVisible(page, selectors, visibleMs, `${surface.id} visible`);
    return { ok: true, route: entry.kind };
  } catch (error) {
    return { ok: false, reason: error && error.message ? error.message : String(error) };
  }
}

/**
 * A hard bound on a preparation step.
 *
 * `page.evaluate` has no timeout of its own: it waits for the page's promise forever. A preparation
 * that calls into the game — jumping a sector, reeling a tether — can take an unbounded amount of
 * time on a loaded machine, and when it does the whole matrix stops on one surface with nothing
 * printed. The first run of the claims board did exactly that: twenty-five minutes, no frames, no
 * message. A surface that cannot be prepared in time is a named failure like any other.
 */
async function withTimeout(promise, ms, what) {
  let timer = null;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${what} did not finish within ${ms}ms`)), ms); }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * What a key-entry surface needs to be TRUE about the world before its key does anything.
 *
 * Every one of these arranges the world the way play arranges it — a wingman on the roster, a ship
 * in hail range, a rock alongside, a bankroll — and then presses the key the player presses. None of
 * them opens a screen directly, and none invents an entity the sector does not author: that is the
 * line between preparing a state a player reaches and photographing a thing that is not there.
 *
 * `handled: true` means the preparation already pressed the key (the comms fan is a HOLD, not a
 * press). `pressTwice: true` means the surface registers lazily and a player presses twice.
 */
async function prepareForKeyEntry(page, surface) {
  if (surface.id === 'wingman-radial') {
    await page.evaluate(() => {
      const s = window.SF && window.SF.state;
      if (!s) return;
      if (!s.automation) s.automation = {};
      if (!Array.isArray(s.automation.fleet) || !s.automation.fleet.length) {
        s.automation.fleet = [
          { id: 'wm-1', name: 'Alpha 1', hull: 'interceptor', role: 'escort', state: 'active' },
        ];
      }
    });
    return { ok: true };
  }

  if (surface.id === 'comms-radial') return prepareCommsFan(page);
  // Both of these drive the game itself, so both are bounded. A minute is many times what either
  // needs when the machine is quiet, and a fraction of what one costs when it wedges.
  if (surface.id === 'asteroid-works') {
    return withTimeout(prepareAsteroidWorks(page), 60_000, 'asteroid works preparation')
      .catch((error) => ({ ok: false, reason: error.message }));
  }
  if (surface.id === 'base') {
    return withTimeout(prepareClaimBase(page), 60_000, 'claims board preparation')
      .catch((error) => ({ ok: false, reason: error.message }));
  }
  return { ok: true };
}

/**
 * The comms fan opens on the Alt keydown edge and CLOSES itself on the next tick unless Alt is still
 * held, so it is opened with `keyboard.down` and held for the whole capture (commsRadial.js).
 *
 * The precondition is a hailable contact. The harness used to push a fabricated "Accord Patrol" onto
 * `state.entityList` and point `player.targetId` at it. That could not work, three times over:
 * `entityById` resolves through `state.entities` — a Map the fake was never added to; `contactKind`
 * classifies on `data.ai.lawful` / `team === 2` / `ai.passive`, none of which the fake carried; and
 * setting `targetId` at all DISABLES the auto-acquire that would have found a real ship. The fan
 * refuses to open with an empty action list, so all twelve of its frames went missing.
 *
 * The honest precondition is the opposite of the fabrication: clear the target and let the game
 * acquire one. Helios Prime runs eighteen traffic ships a minute, they are `team: 2` passive traders,
 * and the hail range is 5200 world units — the fan's own `nearestHailAvailability` finds one.
 */
async function prepareCommsFan(page) {
  // `altHeld` latches inside the radial and is cleared only by a keyup. A previous surface that left
  // Alt down would make this `down` a silent no-op.
  await page.keyboard.up('Alt').catch(() => {});
  await page.evaluate(() => {
    const s = window.SF && window.SF.state;
    if (s && s.player) s.player.targetId = null;
  });
  // Give traffic a moment to be in range, then hold. Waiting for a real contact beats pressing into
  // an empty sky and reporting the surface unreachable.
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const ready = await page.evaluate(() => {
      const s = window.SF && window.SF.state;
      const player = s && s.entities && s.entities.get ? s.entities.get(s.playerId) : null;
      if (!player || !player.pos) return false;
      const list = Array.isArray(s.entityList) ? s.entityList : [];
      return list.some((e) => e && e.alive && (e.type === 'ship' || e.type === 'drone')
        && e.id !== s.playerId && e.pos
        && Math.hypot(e.pos.x - player.pos.x, e.pos.z - player.pos.z) <= 5200);
    });
    if (ready) break;
    await page.waitForTimeout(500);
  }
  await page.keyboard.down('Alt');
  // The wedges arrive on the offer reply, one bus round-trip after the fan itself.
  await page.waitForFunction(() => document.querySelectorAll('.sf-commsfan__wedge').length > 0, null, { timeout: 6000 })
    .catch(() => {});
  return { ok: true, handled: true };
}

/**
 * Asteroid Works opens on `b`, but `b` only asks: the drill needs a live standard massline latched to
 * an asteroid within 220 world units of hull surface, and then an asynchronous approach the tether
 * system reels in and validates again before the screen is pushed (input.js, tetherGameplay.js).
 *
 * So the preparation is the flight the player would fly — put the hull alongside one of the seventy
 * rocks Helios Prime authors near spawn, select it, and latch with the real tether key. The rock is
 * the sector's own; nothing here invents one. Then `b` is pressed for real and the approach runs for
 * real, which is why this waits for the screen rather than assuming it.
 */
async function prepareAsteroidWorks(page) {
  await waitUntilFlightKeysLive(page);
  const attached = await page.evaluate(() => !!(window.SF && window.SF.state && window.SF.state.player
    && window.SF.state.player.tether && window.SF.state.player.tether.active));
  if (attached) {
    await page.keyboard.press('Space');
    await page.waitForFunction(() => !(window.SF && window.SF.state && window.SF.state.player
      && window.SF.state.player.tether && window.SF.state.player.tether.active), null, { timeout: 4000 })
      .catch(() => {});
  }
  const staged = await page.evaluate(() => {
    const sf = window.SF;
    const s = sf && sf.state;
    if (!s) return { ok: false, reason: 'no SF state' };
    const player = s.entities && s.entities.get ? s.entities.get(s.playerId) : null;
    if (!player || !player.pos) return { ok: false, reason: 'no player entity' };
    let best = null;
    let bestD = Infinity;
    for (const e of (s.entityList || [])) {
      if (!e || !e.alive || e.type !== 'asteroid' || !e.pos) continue;
      const d = Math.hypot(e.pos.x - player.pos.x, e.pos.z - player.pos.z);
      if (d < bestD) { bestD = d; best = e; }
    }
    if (!best) return { ok: false, reason: 'no asteroid exists in this sector' };
    const standoff = (best.radius || 0) + (player.radius || 0) + 90;
    const standAt = {
      x: best.pos.x + standoff,
      z: best.pos.z,
    };
    standAt.heading = Math.atan2(best.pos.z - standAt.z, best.pos.x - standAt.x);
    const world = sf.registry && sf.registry.get ? sf.registry.get('world') : null;
    if (world && typeof world.relocatePlayerInSector === 'function') {
      world.relocatePlayerInSector(standAt, { reason: 'capture:asteroid-works' });
    } else {
      player.pos.x = standAt.x;
      player.pos.z = standAt.z;
      player.rot = standAt.heading;
      if (player.vel) { player.vel.x = 0; player.vel.z = 0; }
      player.flags = player.flags || {};
      player.flags.noInterp = true;
    }
    const physicsOwner = sf.registry && sf.registry.get && sf.registry.get('physics')
      && sf.registry.get('physics')._sg02;
    const rec = physicsOwner && physicsOwner.records && physicsOwner.records.get(player.id);
    if (rec && rec.body && typeof rec.body.setTranslation === 'function') {
      const local = physicsOwner._globalPointToFrameLocal
        ? physicsOwner._globalPointToFrameLocal({ x: standAt.x, y: 0, z: standAt.z }, rec.body.translation())
        : { x: standAt.x, z: standAt.z };
      rec.body.setTranslation({ x: local.x, y: 0, z: local.z }, true);
      if (typeof rec.body.setLinvel === 'function') rec.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      if (typeof rec.body.setAngvel === 'function') rec.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    }
    if (s.player) s.player.targetId = best.id;
    return { ok: true, asteroidId: best.id, flownFrom: Math.round(bestD) };
  });
  if (!staged.ok) return { ok: false, reason: `asteroid works: ${staged.reason}` };

  await waitForSimTicks(page, 45, 15_000, 800);

  await page.evaluate(() => {
    const sf = window.SF;
    const s = sf && sf.state;
    const player = s && s.entities && s.entities.get && s.entities.get(s.playerId);
    const tether = sf && sf.registry && sf.registry.get && sf.registry.get('tetherGameplay');
    const def = { maxLength: 390 };
    if (tether && typeof tether._refreshAcquisitionPreview === 'function' && player) {
      tether._refreshAcquisitionPreview(player, def, s, s.simTime || 0, true, true);
    }
  });

  // The scorer may prefer a different nearby rock than the nearest-at-spawn pick. Latch that one.
  const readyId = await page.waitForFunction(() => {
    const s = window.SF && window.SF.state;
    const selected = s && s.masslineAcquisition && s.masslineAcquisition.selected;
    if (!selected || selected.status !== 'ready') return false;
    const target = s.entities && s.entities.get && s.entities.get(selected.targetId);
    if (!target || target.type !== 'asteroid' || target.alive === false) return false;
    return String(selected.targetId);
  }, null, { timeout: 8000 }).then((handle) => handle.jsonValue()).catch(() => null);
  if (readyId == null) {
    const why = await page.evaluate((asteroidId) => {
      const s = window.SF && window.SF.state;
      const player = s && s.entities && s.entities.get && s.entities.get(s.playerId);
      const ast = s && s.entities && s.entities.get && s.entities.get(asteroidId);
      const selected = s && s.masslineAcquisition && s.masslineAcquisition.selected;
      const live = document.body.classList.contains('ui-live-screen');
      const dist = player && ast && player.pos && ast.pos
        ? Math.round(Math.hypot(ast.pos.x - player.pos.x, ast.pos.z - player.pos.z))
        : null;
      const selectedEnt = selected && s.entities && s.entities.get && s.entities.get(selected.targetId);
      return {
        live,
        dist,
        selectedId: selected && selected.targetId,
        selectedType: selectedEnt && selectedEnt.type,
        status: selected && selected.status,
        reason: selected && selected.reason,
      };
    }, staged.asteroidId);
    return {
      ok: false,
      reason: `asteroid works: massline never read ready on a rock`
        + ` (status=${why.status || 'none'} reason=${why.reason || 'n/a'} dist=${why.dist}`
        + ` live-screen=${why.live} selected=${why.selectedId || 'none'}:${why.selectedType || '?'})`,
    };
  }

  await page.keyboard.press('Space');
  const latched = await page.waitForFunction((asteroidId) => {
    const s = window.SF && window.SF.state;
    const tether = s && s.player && s.player.tether;
    if (tether && tether.active && String(tether.targetId) === String(asteroidId)) return true;
    const byId = s && s.combat && s.combat.attachments && s.combat.attachments.byId;
    if (!byId) return false;
    return Object.values(byId).some((att) => att && (att.state === 'active' || att.state === 'latched')
      && att.ownerId === s.playerId && String(att.targetId) === String(asteroidId));
  }, readyId, { timeout: 8000 }).then(() => true).catch(() => false);
  if (!latched) {
    const denial = await page.evaluate(() => {
      const tether = window.SF && window.SF.registry && window.SF.registry.get
        && window.SF.registry.get('tetherGameplay');
      return tether && tether._lastLatchDenial ? tether._lastLatchDenial : null;
    });
    return {
      ok: false,
      reason: 'asteroid works: the standard massline never latched to the rock within 8s, so `b` has '
        + 'nothing to drill (src/ui/input.js openDrill requires an active tether_standard on the target)'
        + (denial ? ` [${JSON.stringify(denial)}]` : ''),
    };
  }
  return { ok: true };
}

/**
 * The claims board opens on `u` next to a claimable body — and Helios Prime authors none. The two
 * nearest are in Ceres Belt and Vesta Forge, both direct neighbours of the boot sector, and the
 * claim itself costs 15,000 credits against a 5,000 credit start.
 *
 * So the preparation is the two things a player does before pressing `u`: fly the jump, and arrive
 * with the money. The jump goes through the world system's own `enterSector` — the same call a real
 * gate jump makes — and the body it flies to is the one Ceres Belt authors. Nothing is invented; what
 * is granted is a bankroll and an arrival, both of which are play.
 */
async function prepareClaimBase(page) {
  const staged = await withTimeout(page.evaluate(async () => {
    const sf = window.SF;
    const s = sf && sf.state;
    if (!s) return { ok: false, reason: 'no SF state' };
    const world = sf.registry && typeof sf.registry.get === 'function' ? sf.registry.get('world') : null;

    const findClaimable = () => (s.entityList || []).find(
      (e) => e && e.alive && e.pos && e.data && e.data.poi && e.data.claimable,
    );

    let body = findClaimable();
    if (!body) {
      if (!world || typeof world.enterSector !== 'function') {
        return { ok: false, reason: 'no claimable body here and no world system to jump with' };
      }
      // A real jump, the same call a gate jump makes.
      for (const sectorId of ['sector_ceres_belt', 'sector_vesta_forge']) {
        try { world.enterSector(sectorId, { fromJump: true }); } catch (_) { continue; }
        await new Promise((resolve) => setTimeout(resolve, 600));
        body = findClaimable();
        if (body) break;
      }
    }
    if (!body) return { ok: false, reason: 'no sector reachable from here authors a claimable body' };

    const player = s.entities && s.entities.get ? s.entities.get(s.playerId) : null;
    if (!player || !player.pos) return { ok: false, reason: 'no player entity' };
    // The range check here is centre-to-centre at 220 wu (src/ui/input.js), tighter than the drill's.
    player.pos.x = body.pos.x + 60;
    player.pos.z = body.pos.z;
    if (player.vel) { player.vel.x = 0; player.vel.z = 0; }
    // The claim costs 15,000; the game starts you with 5,000. This is a bankroll, not a screen.
    if (s.player && (Number(s.player.credits) || 0) < 20000) s.player.credits = 20000;
    return { ok: true, bodyId: body.id };
  }), 45_000, 'the jump to a sector that authors a claimable body');
  if (!staged.ok) return { ok: false, reason: `claims board: ${staged.reason}` };
  return { ok: true, pressTwice: true };
}

/**
 * Press the manifest key VERBATIM. The manifest stores the BINDINGS `.key` value (`l`, `z`, `m`…)
 * and `matchesBinding` in src/ui/input.js accepts `ev.key === binding.key`, so the lowercase press
 * always matches. Upper-casing would rely on the binding also declaring a `.label`, which not every
 * binding does — and it asks the browser for a shifted key the player never presses.
 */
function normalizeKey(key) {
  return key;
}

/**
 * Click the control named by an entry. When the entry names `text`, the label is matched after
 * stripping pseudo-localization decoration (accents, wrapping punctuation, padding), so the SAME
 * public route works in the qps-ploc pass instead of being written off as unreachable there.
 */
// Both callers pass a surface: the capture harness passes its own MATRIX_SURFACES record
// (`selectors`, `key`), the grammar matrix passes the manifest entry (`root`, `entry.key`). One
// normalizer so neither caller has to reshape, and neither silently reads `undefined` — which would
// skip the visibility wait and measure a surface that had not opened yet.
function surfaceSelectors(surface) {
  if (surface.selectors && surface.selectors.length) return surface.selectors;
  return surface.root || [];
}

function surfaceKey(surface) {
  if (surface.key) return surface.key;
  return surface.entry && surface.entry.kind === 'key' ? surface.entry.key : null;
}

/**
 * Close ONE surface and prove it closed. `closeOpenScreens` only knows about the screen stack, so a
 * radial or a drawer — which are not stack screens — would survive it silently, still be on screen
 * when the next surface is photographed, and eat the Escape that should have opened the pause menu.
 * Every later row would then report a defect that is really this one.
 *
 * Returns { ok, reason }; the caller records a failure rather than proceeding on a dirty page.
 */
export async function closeSurface(page, surface) {
  const selectors = surfaceSelectors(surface);
  const key = surfaceKey(surface);
  const isOverlay = surface.archetype === 'OVERLAY';

  // An overlay toggles off with its own key first, then Escape; a stack screen goes through the
  // manager. Either way we VERIFY, and "always mounted" surfaces have nothing to close.
  if (surface.entry && surface.entry.kind === 'default') return { ok: true };

  if (isOverlay && key) {
    if (surface.id === 'comms-radial') {
      await page.keyboard.up('Alt').catch(() => {});
      await page.evaluate(() => {
        const fan = document.getElementById('sf-commsfan') || document.querySelector('.sf-commsfan');
        if (fan) {
          fan.hidden = true;
          fan.classList.remove('is-open');
        }
        const sf = window.SF;
        if (sf && sf.state && sf.state.ui) sf.state.ui.commsRadialOpen = false;
      });
    } else {
      await page.keyboard.press(normalizeKey(key));
    }
    await page.waitForTimeout(200);
  }
  if (await anyVisible(page, selectors)) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
  }
  if (await anyVisible(page, selectors)) {
    if (!isOverlay) {
      try { await closeOpenScreens(page); } catch (error) { return { ok: false, reason: error.message }; }
    }
  }
  for (let i = 0; i < 12; i += 1) {
    if (!(await anyVisible(page, selectors))) return { ok: true };
    await escalateScreenExit(page);
    await page.waitForTimeout(200);
  }
  return { ok: false, reason: `"${surface.id}" is still on screen after its close route; the next surface would be measured through it` };
}

async function anyVisible(page, selectors) {
  if (!selectors || !selectors.length) return false;
  return page.evaluate((items) => items.some((selector) => {
    const node = document.querySelector(selector);
    if (!node) return false;
    const style = getComputedStyle(node);
    const rect = node.getBoundingClientRect();
    return !node.hidden
      && style.display !== 'none'
      && style.visibility !== 'hidden'
      && parseFloat(style.opacity || '1') > 0.01
      && rect.width > 4 && rect.height > 4;
  }), selectors);
}

/**
 * The label candidates a control may legitimately carry: the English string, and what the game's
 * OWN `pseudoLocalize` turns it into.
 *
 * Stripping accents is not enough, and that is not a detail. `pseudoLocalize` maps `t → ŧ`,
 * `d → đ`, `h → ħ`, `p → þ`, `b → ƀ`, `f → ƒ`, `m → ɱ`, `q → ʠ` — letters with a STROKE or a
 * distinct shape, which have no NFD decomposition, so the normalizer deletes them outright.
 * "Settings" renders as ⟦Šëëŧŧïïñğš⟧ and normalizes to "seeiings"; the wanted "settings" is not a
 * substring of it, so the route reported itself unreachable and four surfaces lost their whole
 * pseudo-localised column. The fix is to ask the game what the label becomes — never to loosen the
 * matcher until something matches.
 */
export function labelCandidates(text) {
  if (!text) return [];
  const out = [text];
  try {
    const pseudo = pseudoLocalize(text);
    if (pseudo && pseudo !== text) out.push(pseudo);
  } catch (_) { /* a label the transform refuses is still matchable in English */ }
  return out;
}

async function clickControl(page, entry, attempts = 40) {
  const candidates = labelCandidates(entry.text || null);
  for (let i = 0; i < attempts; i += 1) {
    const result = await page.evaluate(({ selector, texts }) => {
      function normalize(value) {
        return String(value || '')
          .normalize('NFD')
          .replace(/[̀-ͯ]/g, '')       // combining marks left by NFD
          .replace(/[^a-z0-9]/gi, '')            // strokes, brackets, padding, punctuation
          .toLowerCase();
      }
      const nodes = [...document.querySelectorAll(selector)];
      if (!nodes.length) return { ok: false, reason: 'no node matched', seen: [] };
      const wanted = (texts || []).map(normalize).filter(Boolean);
      const seen = [];
      for (const node of nodes) {
        const label = node.textContent || '';
        seen.push(label.trim().slice(0, 24));
        const normalized = normalize(label);
        if (wanted.length && !wanted.some((candidate) => normalized.includes(candidate))) continue;
        if (node.disabled) return { ok: false, reason: 'control found but disabled', seen };
        const style = getComputedStyle(node);
        if (style.display === 'none' || style.visibility === 'hidden') {
          return { ok: false, reason: 'control found but hidden', seen };
        }
        node.click();
        return { ok: true };
      }
      return { ok: false, reason: wanted.length ? 'no control matched the label' : 'no enabled control', seen };
    }, { selector: entry.selector, texts: candidates });
    if (result.ok) return { ok: true };
    if (i === attempts - 1) {
      return {
        ok: false,
        reason: `${result.reason} for ${entry.selector}${entry.text ? ` text="${entry.text}"` : ''}`
          + `${result.seen && result.seen.length ? ` (labels present: ${result.seen.join(' | ')})` : ''}`,
      };
    }
    await page.waitForTimeout(250);
  }
  return { ok: false, reason: `control never became clickable: ${entry.selector}` };
}

/**
 * Named runtime fixtures. Each one puts the game in a state the harness cannot yet FLY to; it
 * unlocks measurement and never counts as reachability evidence (see ui-grammar-surfaces.mjs).
 * The dock fixture is the same `dock:docked` route check-station-tab-navigation-runtime uses.
 */
export async function applyFixture(page, name) {
  const result = await page.evaluate((fixture) => {
    const sf = window.SF;
    if (!sf || !sf.bus || !sf.state) return { ok: false, reason: 'SF bus not available' };
    switch (fixture) {
      case 'dock': {
        const station = (sf.state.entityList || []).find((e) => e && e.data && e.data.stationId);
        if (!station) return { ok: false, reason: 'no dockable station in the first-session sector' };
        sf.bus.emit('dock:docked', { stationId: station.data.stationId });
        return { ok: true };
      }
      case 'crucible-door':
        sf.bus.emit('ui:pushScreen', { id: 'crucible', source: 'ui-grammar-matrix-fixture' });
        return { ok: true };
      case 'crucible-draft':
        sf.bus.emit('ui:pushScreen', { id: 'crucibleDraft', source: 'ui-grammar-matrix-fixture' });
        return { ok: true };
      case 'crucible-refit':
        sf.bus.emit('ui:pushScreen', { id: 'crucibleRefit', source: 'ui-grammar-matrix-fixture' });
        return { ok: true };
      case 'crucible-results':
        sf.bus.emit('ui:pushScreen', { id: 'crucibleResults', source: 'ui-grammar-matrix-fixture' });
        return { ok: true };
      case 'automation':
        sf.bus.emit('ui:pushScreen', { id: 'automation', source: 'ui-grammar-matrix-fixture' });
        return { ok: true };
      case 'player-death': {
        // The after-action screen is opened by the `game:over` subscription in uiRoot.js (~1004),
        // NOT by an entity-destroyed event. It also returns early during a live Survival run, so the
        // fixture refuses rather than silently producing a picture of the wrong thing.
        const run = sf.state.run;
        if (run && run.kind === 'survival' && run.phase !== 'inactive') {
          return { ok: false, reason: 'a Survival run is live; game:over routes to the Crucible results instead' };
        }
        sf.bus.emit('game:over', { cause: 'ui-grammar-matrix-fixture' });
        return { ok: true };
      }
      default:
        return { ok: false, reason: `unknown fixture "${fixture}"` };
    }
  }, name);
  if (!result || !result.ok) {
    return { ok: false, reason: `fixture "${name}": ${(result && result.reason) || 'failed'}` };
  }
  await page.waitForTimeout(500);
  return { ok: true };
}

/**
 * The title and the new-game screens only exist before Launch, so they are photographed in every
 * mode during the menu phase of the same boot — no second server, no forced re-entry.
 */
function makeMenuPhaseCapture({ modes, outputDir, captures, failures, viewport, filter = null, restTwinDir = null, promoteReference = null, provenance = null }) {
  // `filter` arrives ALREADY normalized from captureUiMatrix; normalizeFrameFilter is idempotent so
  // that is safe. It was not always: re-normalizing turned every Set back into null, the menu phase
  // ignored `--only=` entirely, and every filtered run also photographed the title and new-game
  // screens. Harmless under `--fill-missing`, which keeps what exists; under `--update --only=X` it
  // would have rewritten two references nobody asked to re-shoot.
  const active = normalizeFrameFilter(filter);
  return async (page, stageId) => {
    const stage = SURFACE_BY_ID.get(stageId);
    // Surfaces reached by a button ON this stage — the Crucible door hangs off the title screen and
    // exists nowhere else, so it is photographed here or not at all.
    const children = MATRIX_SURFACES.filter((s) => s.entry.kind === 'boot-nested' && s.entry.parent === stageId);
    for (const mode of modes) {
      await page.emulateMedia(mode.emulate);
      for (const surface of [stage, ...children]) {
        if (!surface) continue;
        if (!planIncludes(active, { surfaceId: surface.id })) continue;
        try {
          if (surface !== stage) {
            const opened = await openSurface(page, surface, { stage: stageId });
            if (!opened.ok) {
              failures.push({ surface: surface.id, mode: mode.id, viewport, reason: opened.reason });
              continue;
            }
          }
          await waitForAnyVisible(page, surface.selectors, 20_000, `${surface.id} visible`);
          // The new-game screen is photographed HERE, as a child of the title stage — before the
          // seed is typed on the way to Launch. Left alone, its frame would show an empty seed field
          // one run and a filled one the next, depending on which stage got to it first. The field
          // only exists while this screen is mounted, so the seed is typed the moment it appears.
          if (surface.id === 'new-game') await setUniverseSeed(page, UI_MATRIX_SEED);
          await page.waitForTimeout(surface.settleMs);
          await captureSurfaceScreenshot({ page, outputDir, captures, surface, modeId: mode.id, viewport, restTwinDir, promoteReference, provenance });
        } catch (error) {
          failures.push({ surface: surface.id, mode: mode.id, viewport, reason: error.message });
        } finally {
          if (surface !== stage && stage) await returnToStage(page, stage).catch(() => {});
        }
      }
    }
    await page.emulateMedia(modes[0].emulate);
  };
}

/** How long the surface is left alone between the frame and its rest twin. */
const REST_TWIN_BEAT_MS = 400;

async function captureSurfaceScreenshot({
  page,
  outputDir,
  captures,
  surface,
  modeId,
  viewport,
  restTwinDir = null,
  promoteReference = null,
  provenance = null,
}) {
  const entry = {
    surface: surface.id,
    mode: modeId,
    width: viewport.width,
    height: viewport.height,
  };
  const name = frameFileName(entry);
  const dest = path.join(outputDir, name);
  const shoot = async (target) => {
    if (surface.captureMode === 'element') {
      // Crop to the overlay's own box. Playwright's element screenshot is the honest frame for a
      // surface that sits inside the flight picture: a full viewport would just be the HUD again.
      const handle = await firstVisibleHandle(page, surface.selectors);
      if (!handle) throw new Error(`element capture: no visible root for "${surface.id}"`);
      await handle.screenshot({ path: target, animations: 'disabled' });
    } else {
      await page.screenshot({ path: target, fullPage: false, animations: 'disabled' });
    }
  };
  // PQ-184.00 budget columns: when the run carries a budgets probe, sample the live surface's
  // combined authored-UI cost over BUDGET_SAMPLE_MS of present frames and count its DOM subtree.
  // Whole-game and unknown-rAF timings travel alongside it under their own scope tags; neither is
  // substituted for the 2 ms UI number. The probe is only read when asked for, so the 408-frame
  // reference matrix pays nothing.
  let budget = null;
  if (BUDGET_PROBE_ACTIVE) {
    const rootHandle = await firstVisibleHandle(page, surface.selectors);
    await page.evaluate(() => window.__sfBudgetProbe && window.__sfBudgetProbe.reset());
    await page.waitForTimeout(BUDGET_SAMPLE_MS);
    budget = await page.evaluate(() => {
      const probe = window.__sfBudgetProbe;
      return probe && typeof probe.snapshot === 'function' ? probe.snapshot() : null;
    }).catch(() => null);
    if (budget && rootHandle) {
      // Count on the RESOLVED handle, not a re-run selector: multi-selector roots (the station
      // panels) re-resolve differently in-document and committed a domNodes: 0 lie once already.
      budget.domNodes = await rootHandle
        .evaluate((el) => el.querySelectorAll('*').length + 1)
        .catch(() => null);
    } else if (budget) {
      // A missing DOM root is a named measurement gap, not an empty surface.
      budget.domNodes = null;
    }
  }
  await shoot(dest);
  // Promote to the committed baseline immediately, not at the end of the run. A full matrix takes
  // hours; a run that only writes its references after the last frame turns any late failure into
  // the loss of every frame before it.
  let reference = null;
  if (promoteReference) {
    // A PROMOTED FRAME WITHOUT A PROVENANCE RECORD IS A FRAME THAT CAN NEVER COUNT AS COVERAGE.
    //
    // It lands on disk, looks perfect, and is reported STALE by every later run — so the check can
    // never go green no matter how many times the matrix is shot. This is not hypothetical: the
    // primary-boot `captureModeSet` call was missing its `provenance` argument, which is roughly 270
    // of the 408 frames, and the only symptom was a coverage number that would not move. A missing
    // argument must fail here, loudly, in the first seconds of a run that otherwise costs hours.
    if (!provenance) {
      throw new Error(`refusing to promote "${name}" with no provenance record — it would be written to `
        + 'the baseline and then reported STALE forever. The capture path that reached here did not '
        + 'pass `provenance`.');
    }
    const target = path.join(UI_FRAME_REFERENCE_DIR, name);
    // "Already there" is not the same as "already current". A frame left over from another universe
    // — or shot over the live 3D picture rather than the neutral ground — has to be re-shot even
    // under --fill-missing, or the gap it represents stays invisible.
    const current = existsSync(target)
      && !!provenance && isFrameCurrent(provenance.frames[name]);
    if (promoteReference === 'fill-missing' && current) {
      reference = 'kept';
    } else {
      copyFileSync(dest, target);
      if (provenance) recordReferenceProvenance(name, provenance);
      reference = 'written';
    }
  }
  if (restTwinDir) {
    // The twin is the SAME surface, the same open, one beat later. Any difference between the two
    // is the surface still moving when it was called settled — which is exactly the rest variance
    // the per-surface floors are made of.
    await page.waitForTimeout(REST_TWIN_BEAT_MS);
    await shoot(path.join(restTwinDir, name));
  }
  captures.push({ name, path: dest, reference, surface: surface.id, budget });
}

async function firstVisibleHandle(page, selectors) {
  for (const selector of selectors || []) {
    const handle = await page.$(selector);
    if (!handle) continue;
    if (await handle.isVisible().catch(() => false)) return handle;
  }
  return null;
}

/**
 * Boot the game through the real title flow. `menuPhase(page, stageId)` is called while the title
 * and the new-game screens are on screen — that is the only moment those two surfaces exist, so
 * pre-launch capture and measurement hook in there rather than trying to reach them from flight.
 */
export async function openBoot({ browser, baseUrl, viewport, locale = null, menuPhase = null }) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    screen: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 1,
    colorScheme: 'dark',
  });
  const page = await context.newPage();
  try {
    await page.addInitScript(() => {
      try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch (_) {}
    });
    // PQ-184.00 budget probe: retain a diagnostic timing for the game's rAF callback while also
    // admitting authored UI callbacks from an explicit src/ui scheduling callsite. The actual
    // UI-owner wrapper is installed after window.SF exposes the initialized registry below. This
    // early wrapper is budgets-only, so the reference matrix pays nothing; known UI callback work
    // is bucketed by the browser's presentation timestamp, while unknown callbacks stay diagnostic.
    if (BUDGET_PROBE_ACTIVE) {
      await page.addInitScript(({ uiScope, frameTotalScope, knownUiRafScope, auxiliaryRafScope, domLayoutScope }) => {
        try {
          const raf = window.requestAnimationFrame.bind(window);
          // Reset discards a warm-up of 150 ms (compile/GC dust after the surface opens) — time
          // based, not frame-count-based. A hitch after warm-up remains real in max, while mean/p95
          // describe the steady sampling window the UI budget buys.
          const WARMUP_MS = 150;
          const MAX_SAMPLES = 900;
          const stats = {
            uiSamples: [],
            uiOwnerSamples: [],
            knownUiRafSamples: [],
            frameTotalSamples: [],
            auxiliaryRafSamples: [],
            unbucketedUiRafSamples: [],
            frameBuckets: new Map(),
            callbackScopes: new WeakMap(),
            resetAt: 0,
            activeFrameTimestamp: null,
            uiOwner: null,
            uiOriginal: null,
            uiWrapped: null,
          };
          const pushBounded = (samples, value) => {
            samples.push(value);
            if (samples.length > MAX_SAMPLES) samples.shift();
          };
          const summarize = (samples) => {
            if (!samples.length) return { mean: 0, p95: 0, max: 0, n: 0 };
            const sorted = [...samples].sort((a, b) => a - b);
            return {
              mean: samples.reduce((sum, value) => sum + value, 0) / samples.length,
              p95: sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))],
              max: sorted[sorted.length - 1],
              n: samples.length,
            };
          };
          const warmed = (startedAt) => stats.resetAt > 0 && startedAt - stats.resetAt >= WARMUP_MS;
          const timestampOf = (timestamp) => Number.isFinite(timestamp) ? timestamp : null;
          const bucketFor = (timestamp) => {
            if (timestamp == null) return null;
            let bucket = stats.frameBuckets.get(timestamp);
            if (!bucket) {
              bucket = { gameSeen: false, uiMs: 0, uiOwnerMs: 0, knownUiRafMs: 0 };
              stats.frameBuckets.set(timestamp, bucket);
              if (stats.frameBuckets.size > MAX_SAMPLES * 2) {
                const oldest = stats.frameBuckets.keys().next().value;
                if (oldest !== undefined) stats.frameBuckets.delete(oldest);
              }
            }
            return bucket;
          };
          const classifyCallback = (callback) => {
            if (typeof callback !== 'function') return 'unclassified';
            const cached = stats.callbackScopes.get(callback);
            if (cached) return cached;
            let scope = 'unclassified';
            try {
              // The dev server serves authored modules with the current app origin in the call
              // stack. That path is the evidence boundary: arbitrary non-game callbacks, browser
              // work, and third-party callbacks do not become UI budget time merely because they
              // use rAF. Requiring this origin also keeps a dependency path containing `src/ui`
              // from being mistaken for an authored module.
              const stack = String(new Error().stack || '').replaceAll('\\', '/');
              const appOrigin = typeof location === 'object' && location
                ? String(location.origin || '').replaceAll('\\', '/')
                : '';
              if (appOrigin && stack.split('\n').some((line) => {
                const normalized = line.replaceAll('\\', '/');
                return normalized.includes(`${appOrigin}/src/ui/`)
                  && !normalized.includes('/node_modules/');
              })) scope = 'knownUi';
            } catch (_) {}
            stats.callbackScopes.set(callback, scope);
            return scope;
          };
          const finalizeFrameBuckets = () => {
            for (const bucket of stats.frameBuckets.values()) {
              if (bucket.gameSeen) {
                // These are per-presentation-frame values, so a chart/map/sparkline callback that
                // shares this timestamp is added to the UI owner before the 2 ms budget is judged.
                pushBounded(stats.uiSamples, bucket.uiMs);
                pushBounded(stats.uiOwnerSamples, bucket.uiOwnerMs);
                pushBounded(stats.knownUiRafSamples, bucket.knownUiRafMs);
              } else if (bucket.knownUiRafMs > 0) {
                // A UI callback without a matching presentation frame cannot be charged honestly
                // to a present-frame budget; expose it so the row fails closed instead of hiding it.
                pushBounded(stats.unbucketedUiRafSamples, bucket.knownUiRafMs);
              }
            }
            stats.frameBuckets.clear();
          };
          const readGameFrameCount = () => {
            try {
              const diagnostics = window.SF && window.SF.loop && window.SF.loop.getDiagnostics
                ? window.SF.loop.getDiagnostics()
                : null;
              return diagnostics && Number.isFinite(diagnostics.executedFrames)
                ? diagnostics.executedFrames
                : null;
            } catch (_) {
              return null;
            }
          };
          window.__sfBudgetProbe = {
            measurementScope: uiScope,
            frameTotalScope,
            knownUiRafScope,
            auxiliaryRafScope,
            domLayoutScope,
            reset() {
              stats.uiSamples.length = 0;
              stats.uiOwnerSamples.length = 0;
              stats.knownUiRafSamples.length = 0;
              stats.frameTotalSamples.length = 0;
              stats.auxiliaryRafSamples.length = 0;
              stats.unbucketedUiRafSamples.length = 0;
              stats.frameBuckets.clear();
              stats.activeFrameTimestamp = null;
              stats.resetAt = performance.now();
            },
            installUiOwner() {
              const registry = window.SF && window.SF.registry;
              const owner = registry && typeof registry.get === 'function'
                ? registry.get('ui')
                : null;
              if (!owner || typeof owner.frame !== 'function') {
                return { ok: false, reason: 'window.SF.registry.get("ui").frame is unavailable' };
              }
              if (stats.uiOwner === owner && owner.frame === stats.uiWrapped) {
                return { ok: true, already: true, scope: uiScope };
              }
              const original = owner.frame;
              const wrapped = function budgetUiOwnerFrame(...args) {
                const startedAt = performance.now();
                try {
                  return original.apply(this, args);
                } finally {
                  const elapsed = performance.now() - startedAt;
                  // Do not return from this finally: a return here would replace the wrapped
                  // owner's value and swallow an owner exception during warm-up. The guard only
                  // controls whether this capture-only timing is recorded.
                  if (warmed(startedAt) && Number.isFinite(elapsed)) {
                    const bucket = bucketFor(stats.activeFrameTimestamp);
                    if (bucket) {
                      bucket.uiMs += elapsed;
                      bucket.uiOwnerMs += elapsed;
                    } else {
                      pushBounded(stats.unbucketedUiRafSamples, elapsed);
                    }
                  }
                }
              };
              try { owner.frame = wrapped; } catch (_) {
                return { ok: false, reason: 'registry.get("ui").frame could not be wrapped' };
              }
              if (owner.frame !== wrapped) {
                return { ok: false, reason: 'registry.get("ui").frame wrapper was not retained' };
              }
              stats.uiOwner = owner;
              stats.uiOriginal = original;
              stats.uiWrapped = wrapped;
              return { ok: true, scope: uiScope };
            },
            snapshot() {
              finalizeFrameBuckets();
              return {
                measurementScope: uiScope,
                frameTotalScope,
                knownUiRafScope,
                auxiliaryRafScope,
                domLayoutScope,
                uiFrameMs: summarize(stats.uiSamples),
                uiOwnerMs: summarize(stats.uiOwnerSamples),
                knownUiRafMs: summarize(stats.knownUiRafSamples),
                frameTotalMs: summarize(stats.frameTotalSamples),
                auxiliaryRafMs: summarize(stats.auxiliaryRafSamples),
                unbucketedUiRafMs: summarize(stats.unbucketedUiRafSamples),
              };
            },
          };
          window.requestAnimationFrame = (cb) => {
            // Capture the scheduling callsite, not the later browser callback stack. The caller is
            // where the authored-owner evidence lives; the callback stack only names this probe.
            const callbackScope = classifyCallback(cb);
            return raf((t) => {
              // Diagnostics are read outside the timed interval. The classifier itself must not add
              // its cost to the whole-game callback number it is identifying.
              const beforeFrames = readGameFrameCount();
              const previousTimestamp = stats.activeFrameTimestamp;
              const timestamp = timestampOf(t);
              stats.activeFrameTimestamp = timestamp;
              const t0 = performance.now();
              try { cb(t); } finally {
                const elapsed = performance.now() - t0;
                const afterFrames = readGameFrameCount();
                stats.activeFrameTimestamp = previousTimestamp;
                if (warmed(t0) && Number.isFinite(elapsed)) {
                  if (beforeFrames != null && afterFrames != null && afterFrames > beforeFrames) {
                    const bucket = bucketFor(timestamp);
                    if (bucket) bucket.gameSeen = true;
                    pushBounded(stats.frameTotalSamples, elapsed);
                  } else if (callbackScope === 'knownUi') {
                    const bucket = bucketFor(timestamp);
                    if (bucket) {
                      bucket.knownUiRafMs += elapsed;
                      bucket.uiMs += elapsed;
                    } else {
                      pushBounded(stats.unbucketedUiRafSamples, elapsed);
                    }
                  } else {
                    // This is a non-game callback outside an authored src/ui scheduling callsite.
                    // It remains a named diagnostic and is never silently folded into uiFrameMs.
                    pushBounded(stats.auxiliaryRafSamples, elapsed);
                  }
                }
              }
            });
          };
        } catch (_) {}
      }, {
        uiScope: UI_BUDGET_MEASUREMENT_SCOPE,
        frameTotalScope: UI_FRAME_TOTAL_SCOPE,
        knownUiRafScope: UI_KNOWN_RAF_SCOPE,
        auxiliaryRafScope: UI_AUXILIARY_RAF_SCOPE,
        domLayoutScope: UI_DOM_LAYOUT_SCOPE,
      });
    }

    const rootUrl = locale
      ? `${baseUrl}?locale=${encodeURIComponent(locale)}`
      : baseUrl;

    await page.goto(rootUrl, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    // Before anything is photographed, and before the title screen exists. A frame shot over the
    // live 3D picture is not comparable with one shot over the neutral ground, so the ground is
    // established at the top of the boot rather than per surface.
    await applyNeutralGround(page);
    await page.waitForFunction(
      () => !!(window.SF && window.SF.state && window.SF.bus && window.SF.registry),
      null,
      { timeout: 120_000 },
    );
    if (BUDGET_PROBE_ACTIVE) {
      // Registry.init() has run before main.js publishes window.SF. Attach to the public UI owner
      // only after that boundary; wrapping requestAnimationFrame before it exists measured the
      // wrong work and could never distinguish the game's callback from chart/effect callbacks.
      await page.waitForFunction(() => {
        const registry = window.SF && window.SF.registry;
        const owner = registry && typeof registry.get === 'function' ? registry.get('ui') : null;
        return !!(owner && typeof owner.frame === 'function');
      }, null, { timeout: 120_000 });
      const attached = await page.evaluate(() => window.__sfBudgetProbe
        && typeof window.__sfBudgetProbe.installUiOwner === 'function'
        ? window.__sfBudgetProbe.installUiOwner()
        : { ok: false, reason: 'budget probe was not installed' });
      if (!attached || attached.ok !== true) {
        throw new Error(`UI budget probe could not attach to the live owner: ${attached && attached.reason
          ? attached.reason : 'unknown reason'}`);
      }
    }
    await waitForAnyVisible(page, ['[data-screen="mainMenu"]'], MAIN_MENU_TIMEOUT_MS, 'main menu');
    if (menuPhase) await menuPhase(page, 'title');

    if (!(await clickMainMenuNewGame(page))) throw new Error('main menu New Game button missing or disabled');
    await waitForAnyVisible(page, ['[data-screen="newGame"]'], NEW_GAME_TIMEOUT_MS, 'new game screen');
    // Before the new-game screen is photographed, so that frame is deterministic too.
    const seeded = await setUniverseSeed(page, UI_MATRIX_SEED);
    if (!seeded) throw new Error('could not set the universe seed; every boot would build a different galaxy');
    if (menuPhase) await menuPhase(page, 'new-game');
    if (!(await clickNewGameLaunch(page))) throw new Error('new game Launch button missing or disabled');

    await page.waitForFunction(() => {
      const state = window.SF && window.SF.state;
      const player = state && state.entities && state.entities.get(state.playerId);
      return !!(state && state.mode === 'flight' && player && player.alive);
    }, null, { timeout: 120_000 });

    // Prove the seed took, in the running game, every boot. Typing into a field and trusting it is
    // how this defect survived in the first place: the frames looked fine, and nothing anywhere said
    // that each one was a different galaxy. A boot that did not take the seed is worthless for a
    // reference frame, so it fails here rather than producing one.
    const actualSeed = await page.evaluate(() => {
      const state = window.SF && window.SF.state;
      return state && state.meta ? state.meta.seed : null;
    });
    if (actualSeed !== UI_MATRIX_SEED) {
      throw new Error(`universe seed is ${actualSeed}, expected ${UI_MATRIX_SEED} — this boot built a `
        + 'different galaxy and its frames would not be comparable with any other run');
    }

    await waitForSimTicks(page, 120, 60_000, 2000);

    return {
      page,
      close: async () => {
        await context.close().catch(() => {});
      },
    };
  } catch (error) {
    await context.close().catch(() => {});
    throw error;
  }
}

export async function openBootWithRetry(params, attempts = 4) {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await openBoot(params);
    } catch (error) {
      lastError = error;
      if (attempt >= attempts) break;
      await new Promise((resolve) => setTimeout(resolve, 4000 * attempt));
    }
  }
  throw new Error(`boot failed after ${attempts} attempt(s): ${lastError && lastError.message ? lastError.message : String(lastError)}`);
}

// Escape alone cannot leave every screen, and pressing it harder does not help.
//
// The station is the clear case: dismissing it is an implicit Back that has to route through the
// station-exit owner so the transient clean and the confirm run before a committed undock — and
// while the hull is still docked, closing the panel would not restore flight anyway. The Crucible
// run screens are similar: they are advanced by a choice, not dismissed by a key. Before this, the
// probe pressed Escape twenty times and then measured the next surface through whatever was still on
// screen, which is how a whole pass of station rows became unusable as evidence.
//
// So it escalates through the UI's OWN exit paths. The 2026-09-04 handoff recorded three programmatic
// exits as tried and rejected, and named the real blocker as a product question — whether undocking
// can be driven from outside its confirm flow. What is below is the answer that was found afterwards
// and is what the committed station frames were shot through: clear the dock flags, emit the
// COMMITTED `dock:undocked` the confirm flow itself emits, pop the station screen, and resync. It is
// the committed step the earlier `station:exitRequest` emit never reached, not a harder Escape.
//
// The two dead ends the handoff named are still dead ends, and are not to be re-tried:
//   - `screenManager.closeAll()` tears the panel down but leaves `state.ui.docked` true, so the
//     manager's own pause request stays raised and the sim strands in `paused` with an EMPTY stack
//     and nothing left to close. Strictly worse than being stuck on the panel.
//   - `bus.emit('station:exitRequest', …)` from the probe never reaches the committed undock, because
//     that flow needs a real opener; the screen simply stays open.
//
// A locked screen (the Crucible run surfaces) is popped through the screen manager for the same
// reason, and plain Escape remains the path for everything that answers to it.
async function escalateScreenExit(page) {
  const status = await readUiStatus(page);
  // 1. If docked or top screen is station, undock cleanly through the committed undock path
  if (status && (status.docked || status.top === 'station')) {
    await page.evaluate(() => {
      const sf = window.SF;
      if (!sf) return;
      const state = sf.state;
      const bus = sf.bus;
      const uiOwner = sf.registry && typeof sf.registry.get === 'function'
        ? sf.registry.get('ui')
        : null;
      const sm = uiOwner && uiOwner.screenManager;
      if (state && state.ui) {
        state.ui.docked = false;
        state.ui.dockedStationId = null;
      }
      if (bus) {
        const raw = bus._sfStationExitRawEmit || (typeof bus.emit === 'function' ? bus.emit.bind(bus) : null);
        if (raw) raw('dock:undocked', { committed: true, intent: 'explicit', source: 'probe-escalate' });
        else bus.emit('dock:undocked', { committed: true, intent: 'explicit', source: 'probe-escalate' });
      }
      if (sm && sm.top() === 'station') {
        sm.popScreen();
      }
      if (sm) sm.syncVisibility();
      const dockFade = document.getElementById('dock-fade');
      if (dockFade) {
        dockFade.classList.remove('is-active');
        dockFade.style.display = 'none';
      }
    });
    await page.waitForTimeout(300);
    return;
  }

  // 2. If a locked modal (e.g. crucible screens) or screen is open that ignores Escape
  if (status && status.screenOpen && status.top) {
    const popped = await page.evaluate(() => {
      const sf = window.SF;
      const uiOwner = sf && sf.registry && typeof sf.registry.get === 'function'
        ? sf.registry.get('ui')
        : null;
      const sm = uiOwner && uiOwner.screenManager;
      if (!sm || !sm.isOpen()) return false;
      const top = sm.top();
      const def = typeof sm.getActiveScreenDef === 'function' ? sm.getActiveScreenDef() : null;
      const isLocked = (sm.locked && sm.locked()) || (def && def.data && def.data.locked);
      if (isLocked || top === 'crucibleDraft' || top === 'crucibleRefit' || top === 'crucibleResults' || top === 'crucible') {
        sm.popScreen();
        sm.syncVisibility();
        return true;
      }
      return false;
    });
    if (popped) {
      await page.waitForTimeout(200);
      return;
    }
  }

  // 3. Normal escape keypress for standard modals / screens
  await page.keyboard.press('Escape');
}

export async function ensureFlightIdle(page) {
  let status = null;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    status = await readUiStatus(page);
    if (status && status.mode === 'flight' && status.screenOpen === false && !status.docked) return;
    if (status && (status.screenOpen || status.docked)) {
      await escalateScreenExit(page);
      await page.waitForTimeout(200);
      continue;
    }
    if (status && status.mode !== 'flight') {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(200);
      continue;
    }
    await page.waitForTimeout(200);
  }
  const seen = status
    ? `mode=${status.mode === null ? 'null' : status.mode} screenOpen=${status.screenOpen} top=${status.top === null || status.top === undefined ? 'none' : status.top} docked=${status.docked}`
    : 'no status could be read';
  throw new Error(`Unable to return to idle flight state for capture — last observed ${seen}`);
}

export async function closeOpenScreens(page) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const status = await readUiStatus(page);
    if (status && !status.screenOpen && !status.docked) return;
    await escalateScreenExit(page);
    await page.waitForTimeout(200);
  }
  throw new Error('Escape did not close active screen');
}

async function stabilizeSurfaceForCapture(page, surfaceId) {
  // Screenshot references may park animation; a CPU budget must measure the live UI work.
  if (BUDGET_PROBE_ACTIVE && surfaceId !== 'ship') return;
  if (surfaceId === 'ship') {
    await waitForShipPreviewReady(page);
    return;
  }
  if (surfaceId === 'range') {
    await stabilizeRangeScreen(page);
    return;
  }
  // Both chart focuses are the same animated screen; both need the scan/iris animation parked or
  // the 0.5% repeatability floor flakes on paint timing.
  if (surfaceId === 'chart' || surfaceId === 'chart-galaxy') {
    await stabilizeChartScreen(page);
  }
}

async function waitForShipPreviewReady(page) {
  await page.waitForFunction(() => {
    const canvas = document.querySelector('[data-screen="ship"] .sx-sw__canvas');
    if (!canvas) return false;
    const ready = String(canvas.dataset.previewReady || '').toLowerCase();
    const state = String(canvas.dataset.previewAssetState || '').toLowerCase();
    return ready === 'true' && state !== 'loading';
  }, null, { timeout: 25_000 }).catch(() => {});
  await page.waitForTimeout(250);
}

async function stabilizeRangeScreen(page) {
  await page.evaluate(() => {
    const sf = window.SF;
    const uiOwner = sf && sf.registry && typeof sf.registry.get === 'function'
      ? sf.registry.get('ui')
      : null;
    const sm = uiOwner && uiOwner.screenManager;
    const def = sm && typeof sm.getActiveScreenDef === 'function' ? sm.getActiveScreenDef() : null;
    if (!def || def.id !== 'range') return false;
    if (def._rafId) {
      cancelAnimationFrame(def._rafId);
      def._rafId = 0;
    }
    if (!def._sim || typeof def._stepSimulation !== 'function' || typeof def._render !== 'function') return false;
    const STEP_S = 1 / 120;
    const STEPS = Math.round(1.5 / STEP_S);
    def._accumS = 0;
    def._lastTs = typeof performance !== 'undefined' ? performance.now() : Date.now();
    for (let i = 0; i < STEPS; i += 1) def._stepSimulation(STEP_S);
    def._render();
    return true;
  });
  await page.waitForTimeout(50);
}

async function stabilizeChartScreen(page) {
  await page.evaluate(() => {
    const sf = window.SF;
    const uiOwner = sf && sf.registry && typeof sf.registry.get === 'function'
      ? sf.registry.get('ui')
      : null;
    const sm = uiOwner && uiOwner.screenManager;
    const def = sm && typeof sm.getActiveScreenDef === 'function' ? sm.getActiveScreenDef() : null;
    if (!def || def.id !== 'galaxyMap') return false;
    if (def._animFrame != null) {
      cancelAnimationFrame(def._animFrame);
      def._animFrame = null;
    }
    def._scanRings = [];
    def._iris = null;
    def._scanSweepUntil = 0;
    def._localLiveContacts = 0;
    def._scanPhase = 0;
    def._targetZoom = def._zoom;
    def._lastTime = typeof def._nowMs === 'function'
      ? def._nowMs()
      : (typeof performance !== 'undefined' ? performance.now() : Date.now());
    def._animT = 0;
    if (typeof def._draw === 'function') def._draw();
    if (typeof def._updateInspector === 'function') def._updateInspector();
    return true;
  });
  await page.waitForTimeout(50);
}

async function readUiStatus(page) {
  return page.evaluate(() => {
    const sf = window.SF;
    const state = sf && sf.state;
    const uiOwner = sf && sf.registry && typeof sf.registry.get === 'function'
      ? sf.registry.get('ui')
      : null;
    const sm = uiOwner && uiOwner.screenManager;
    const mode = state && state.mode ? state.mode : null;
    const screenOpen = !!(sm && typeof sm.isOpen === 'function' && sm.isOpen());
    const top = sm && typeof sm.top === 'function' ? sm.top() : null;
    const docked = !!(state && state.ui && state.ui.docked);
    return { mode, screenOpen, top, docked };
  });
}

export async function waitForAnyVisible(page, selectors, timeout, description) {
  await page.waitForFunction((items) => {
    function visible(node) {
      if (!node) return false;
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return !node.hidden
        && style.display !== 'none'
        && style.visibility !== 'hidden'
        && parseFloat(style.opacity || '1') > 0.01
        && rect.width > 4
        && rect.height > 4;
    }
    return items.some((selector) => visible(document.querySelector(selector)));
  }, selectors, { timeout }).catch((error) => {
    throw new Error(`${description} timeout (${timeout}ms): ${error.message}`);
  });
}

async function waitUntilFlightKeysLive(page) {
  await page.waitForFunction(() => !document.body.classList.contains('ui-live-screen'), null, { timeout: 30_000 }).catch(() => {});
  await page.waitForTimeout(400);
}

async function waitForSimTicks(page, deltaTicks, timeoutMs, fallbackMs) {
  const startTick = await page.evaluate(() => {
    const state = window.SF && window.SF.state;
    return state && Number.isFinite(state.tick) ? state.tick : null;
  });
  if (!Number.isFinite(startTick)) {
    await page.waitForTimeout(fallbackMs);
    return;
  }
  await page.waitForFunction(({ start, delta }) => {
    const state = window.SF && window.SF.state;
    return !!(state && Number.isFinite(state.tick) && state.tick >= start + delta);
  }, { start: startTick, delta: Math.max(1, deltaTicks) }, { timeout: timeoutMs })
    .catch(async () => {
      await page.waitForTimeout(fallbackMs);
    });
}

/**
 * Type the seed into the field the player types it into, and prove it took. A silent failure here is
 * the worst possible outcome: the run would look normal and produce a baseline of random galaxies.
 */
async function setUniverseSeed(page, seed) {
  return page.evaluate((value) => {
    const input = document.getElementById('sf-ng-seed');
    if (!input) return false;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
    if (setter && setter.set) setter.set.call(input, String(value));
    else input.value = String(value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return input.value === String(value);
  }, seed);
}

async function clickMainMenuNewGame(page) {
  for (let i = 0; i < 360; i += 1) {
    const clicked = await page.evaluate(() => {
      const button = document.querySelector('[data-screen="mainMenu"] .sf-col > button');
      if (!button || button.disabled) return false;
      button.click();
      return true;
    });
    if (clicked) return true;
    await page.waitForTimeout(250);
  }
  return false;
}

async function clickNewGameLaunch(page) {
  for (let i = 0; i < 240; i += 1) {
    const clicked = await page.evaluate(() => {
      const buttons = [...document.querySelectorAll('[data-screen="newGame"] .sf-ng-footer button')];
      const launch = buttons[buttons.length - 1];
      if (!launch || launch.disabled) return false;
      launch.click();
      return true;
    });
    if (clicked) return true;
    await page.waitForTimeout(250);
  }
  return false;
}

function printCaptureTable({
  rows,
  outputDir,
  updateReferences,
  bootCount,
  totalBytes,
}) {
  console.log('\nUI matrix capture table');
  console.log('surface      mode             viewport      bytes      file');
  for (const row of rows) {
    const plan = row.plan || {};
    const surface = String(plan.surface || '').padEnd(12);
    const mode = String(plan.mode || '').padEnd(16);
    const viewport = String(plan.viewport || '').padEnd(13);
    const bytes = String(row.bytes).padStart(9);
    console.log(`${surface} ${mode} ${viewport} ${bytes}  ${row.name}`);
  }
  console.log(`\nframes: ${rows.length}   boots: ${bootCount}   total bytes: ${totalBytes}`);
  console.log(`devshots: ${outputDir}`);
  if (updateReferences) console.log(`references updated: ${UI_FRAME_REFERENCE_DIR}`);
}

async function findFreePort(start) {
  for (let port = start; port < start + 160; port += 1) {
    const free = await new Promise((resolve) => {
      const socket = createNetServer();
      socket.once('error', () => resolve(false));
      socket.once('listening', () => socket.close(() => resolve(true)));
      socket.listen(port, '127.0.0.1');
    });
    if (free) return port;
  }
  throw new Error('no free probe port');
}

export async function startFreshServer() {
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    const seedPort = 16000 + Math.floor(Math.random() * 32000);
    const port = await findFreePort(seedPort);
    const baseUrl = `http://127.0.0.1:${port}/`;
    const child = spawn(process.execPath, ['server.js', String(port)], {
      cwd: ROOT,
      stdio: ['ignore', 'ignore', 'ignore'],
      windowsHide: true,
    });

    let alive = true;
    child.once('exit', () => { alive = false; });

    for (let i = 0; i < 120; i += 1) {
      if (!alive || child.exitCode != null) break;
      try {
        const response = await fetch(baseUrl);
        if (response.ok) {
          return {
            baseUrl,
            kill: () => {
              try { child.kill(); } catch (_) {}
            },
          };
        }
      } catch (_) {
        // keep probing
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    try { child.kill(); } catch (_) {}
  }
  throw new Error('server did not become reachable after 6 attempts');
}

export function parseArgs(argv) {
  const list = (prefix) => {
    const found = argv.filter((a) => a.startsWith(prefix));
    if (!found.length) return null;
    return found.flatMap((a) => a.slice(prefix.length).split(',')).map((v) => v.trim()).filter(Boolean);
  };
  return {
    updateReferences: argv.includes('--update'),
    // --fill-missing grows the committed baseline without touching a frame that already exists.
    fillMissingOnly: argv.includes('--fill-missing'),
    headed: argv.includes('--headed'),
    quiet: argv.includes('--quiet'),
    restTwinDir: (argv.find((a) => a.startsWith('--rest-twin=')) || '').slice('--rest-twin='.length) || null,
    outputDir: (argv.find((a) => a.startsWith('--out=')) || '').slice('--out='.length) || null,
    budgetsOut: (argv.find((a) => a.startsWith('--budgets-out=')) || '').slice('--budgets-out='.length) || null,
    filter: {
      surfaces: list('--only='),
      modes: list('--mode='),
      viewports: list('--viewport='),
    },
  };
}

async function runCli() {
  const args = parseArgs(process.argv.slice(2));
  const result = await captureUiMatrix({
    outputDir: args.outputDir || DEFAULT_OUTPUT_DIR,
    updateReferences: args.updateReferences,
    fillMissingOnly: args.fillMissingOnly,
    headed: args.headed,
    printTable: true,
    quiet: args.quiet,
    restTwinDir: args.restTwinDir,
    filter: args.filter,
    budgetsOut: args.budgetsOut,
  });
  console.log(`capture:ui-matrix complete — ${result.frames} frames planned, ${result.captures.length} produced`);
  if (args.updateReferences || args.fillMissingOnly) {
    console.log(`references written: ${result.referencesWritten}   kept as-is: ${result.referencesKept}`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCli().catch((error) => {
    console.error(error && error.stack ? error.stack : String(error));
    process.exit(1);
  });
}
