<!-- LIFETIME: LIVING -->
# UI grammar ownership — who clears which red cell

PQ-180 .02. Every surface in the grammar matrix, the file that owns it, how a player reaches it, and
the **packet and leaf** that clears each failing cell. **The generated matrix outranks this page**:

```
node scripts/check-ui-grammar-matrix.mjs --static                 # manifest + frame coverage, no browser
node scripts/check-ui-grammar-matrix.mjs --headed                 # boot the game on the real GPU and measure
node scripts/check-ui-grammar-matrix.mjs --json=.devshots/ui-grammar/matrix.json
```

`scripts/ui-grammar-surfaces.mjs` is the source and the `--json` output carries one row per failing
cell with `{surface, rule, status, packet, leaf, detail}` — that is the artifact the map §18 table
mirrors. If this page and the file disagree, the file is right.

## What counts as a pass

A cell is green **only when the rule itself was measured**. A proxy is not a pass, and the observation
we do have is kept in the cell detail instead:

| Not a pass | Why |
|---|---|
| `check:wcag-contrast` is listed for this surface | listing a check does not measure contrast |
| 6 focusable elements were found | counting focusables is not a keyboard traversal |
| 40 text nodes are visible under forced-colors | presence is not legibility |
| the screen-memory bag has 2 keys | a stored bag is not a proven restore |
| one `[data-why]` node exists | one marker is not three disclosure tiers |
| `?locale=qps-ploc` was requested | a locale flag is not +40 % expansion; the growth must be witnessed in the measured text |

Statuses: `green` / `n/a` pass. `red` (measured, below the floor), `unproven` (not directly
exercised), `unmeasured` (no seam exists at all) all **fail**.

## Reachability

- `public-route` — the harness opened it the way a player does (a key, a button).
- `fixture` — a **named environmental state** (a bus event) put the game where the harness cannot yet
  fly. It unlocks honest measurement of what is on screen; it can **never** green reachability.
- Inherited: a destination reached by clicking inside a fixture-only parent is fixture-only too.
- `none` — no route at all.

## The surfaces (40 shipping; 34 are real and openable)

| Surface | Archetype | Owner file | Entry | Evidence | Clears its reds |
|---|---|---|---|---|---|
| `flight` | FLIGHT-HUD | `src/ui/hud.js` | default route after Launch | public-route | *unassigned → PQ-180 .02* |
| `power-rail` | OVERLAY | `src/ui/powerRail.js` | always mounted in the HUD | public-route | PQ-184 `ui-frame-timing` |
| `comms-radial` | OVERLAY | `src/ui/commsRadial.js` | `L` | public-route | *unassigned → PQ-180 .02* |
| `wingman-radial` | OVERLAY | `src/ui/wingmanRadial.js` | `Z` | public-route | *unassigned → PQ-180 .02* |
| `ship` | INSTRUMENT | `src/ui/ship/shipScreen.js` | `F2` | public-route | *unassigned → PQ-180 .02* |
| `footprint` | INSTRUMENT | `src/ui/screens/footprint.js` | `F3` | public-route | *unassigned → PQ-180 .02* |
| `range` | INSTRUMENT | `src/ui/screens/range.js` | `F4` | public-route | *unassigned → PQ-180 .02* |
| `chart` | INSTRUMENT | `src/ui/galaxyMap.js` | `M` | public-route | PQ-168 `chart` |
| `chart-galaxy` | INSTRUMENT | `src/ui/galaxyMap.js` | `N` | public-route | PQ-168 `chart` |
| `title` | META-SHELL | `src/ui/screens/mainMenu.js` | first screen of the game | public-route | PQ-181 `meta-shell` |
| `new-game` | META-SHELL | `src/ui/screens/newGame.js` | title → New Game | public-route | PQ-181 `meta-shell` |
| `pause` | META-SHELL | `src/ui/screens/pause.js` | `Escape` / `P` | public-route | PQ-181 `meta-shell` |
| `settings` | META-SHELL | `src/ui/screens/settings.js` | pause → Settings | public-route | PQ-181 `meta-shell` |
| `save-load` | META-SHELL | `src/ui/screens/saveLoad.js` | pause → Save | public-route | PQ-181 `meta-shell` |
| `help` | META-SHELL | `src/ui/screens/help.js` | `F1` / `H` | public-route | PQ-181 `meta-shell` |
| `codex` | META-SHELL | `src/ui/screens/codex.js` | `K` | public-route | PQ-181 `meta-shell` |
| `mission-log` | META-SHELL | `src/ui/screens/missionLog.js` | `J` | public-route | PQ-181 `meta-shell` |
| `tech-tree` | META-SHELL | `src/ui/screens/techTree.js` | `T` | public-route | PQ-181 `meta-shell` |
| `game-over` | META-SHELL | `src/ui/screens/gameOver.js` | the run ends | **fixture** `player-death` | PQ-181 `meta-shell` |
| `credits` | META-SHELL | **does not exist** | — | none | PQ-181 `meta-shell` |
| `statistics` | META-SHELL | **does not exist** | — | none | PQ-181 `meta-shell` |
| `photo-mode` | META-SHELL | **does not exist** | — | none | PQ-181 `meta-shell` |
| `station-dock` | STATION | `src/ui/station/stationScreen.js` | dock at a berth | **fixture** `dock` | PQ-162 `station-screens` |
| `station-market` … `station-ledger` (7) | STATION | `src/ui/station/screens/*.js` | Command Dock → destination | fixture (inherited) | PQ-162 `station-screens` |
| `crucible-door` | CRUCIBLE | `src/ui/screens/crucible.js` | **title → Crucible button** | public-route | PQ-182 `crucible-screens` |
| `crucible-draft` | CRUCIBLE | `src/ui/screens/crucibleDraft.js` | after a wave clears | **fixture** | PQ-182 `crucible-screens` |
| `crucible-refit` | CRUCIBLE | `src/ui/screens/crucibleDraft.js` | the ten-wave refit | **fixture** | PQ-182 `crucible-screens` |
| `crucible-results` | CRUCIBLE | `src/ui/screens/crucible.js` | a run ends | **fixture** | PQ-182 `crucible-screens` |
| `crucible-lab` | CRUCIBLE | `src/ui/screens/crucibleLabControls.js` | **registers no screen id** | none | PQ-182 `crucible-screens` |
| `asteroid-works` | WORKS | `src/ui/asteroid/asteroidScreen.js` | `B` on a selected asteroid | public-route | PQ-130 `works-screens` |
| `base` | WORKS | `src/ui/screens/base.js` | `U` on a claimable body | public-route | PQ-130 `works-screens` |
| `automation` | WORKS | `src/ui/screens/automationPanel.js` | **pause → Operations** | public-route | PQ-130 `works-screens` |
| `localmap-legacy` / `starmap-legacy` | INSTRUMENT | `src/ui/screens/{localmap,starmap}.js` | superseded by the chart | none | PQ-168 `chart` |

`sandbox` is `IS_DEV` only and is excluded from the shipping list. **22 of 40 are on a public route;
34 exist and have an implemented opener** — those 34 are the only rows that may count toward the
"≥ 30 real surfaces" floor. Rows for screens that do not exist, and legacy screens with no route,
are listed for honesty and never count.

## Rule ownership, independent of who owns the screen

A rule the matrix cannot measure is owned by whoever must build the seam, not by the screen:

| Rule | Owner | Leaf | Why it is not measured |
|---|---|---|---|
| `entity-links` | **PQ-183** | `entity-links` | link coverage is PQ-183 work on every surface |
| `ui-frame-ms` | **PQ-184** | `ui-frame-timing` | no published UI frame timing seam; calling `refresh()` in a loop would change the cadence it claims to measure |
| `type-roles`, `colour-on-state`, `motion-contract`, `reduce-motion`, `forced-colors`, `layout-skeleton`, `disclosure-tiers`, `load-bearing-names`, `data-states`, `screen-memory`, `keyboard`, `gamepad`, `contrast`, `pseudo-loc` (unwitnessed) | **PQ-180** | `.00` | the matrix has no seam that exercises the rule — building it is this packet's own work |
| `reference-frames` | **PQ-180** | `.03` | the capture matrix |
| any measured defect on a surface no packet owns | **PQ-180** | `.02` | assigning an owner *is* .02 |

**Six surfaces have no admitted owner packet** — `flight`, the three overlays and the four
instruments are not covered by PQ-162/168/181/182/130. Their measured defects currently fall to
PQ-180 .02. Root must either admit an owner packet for the HUD and the instruments, or accept .02 as
the assignment route.

## What the matrix reports today (2026-09-04, static run)

40 surfaces, **0 green, 40 red, 0 measured**. No runtime cell has ever been measured: the browser is
an owned resource and the first measured run needs a granted capture window. The only column that is
real today is `reference-frames`, which counts PNGs on disk — `flight`, `ship`, `footprint`, `range`
and `chart` have all 12; the other 35 surfaces have none (60 of 480 planned frames exist).

**Absences already proven without a measurement run:**

| Absence | Owner |
|---|---|
| No credits, statistics or photo-mode surface exists on any route | PQ-181 `meta-shell` |
| The Crucible lab registers no screen id, so no route opens it | PQ-182 `crucible-screens` |
| The station is reachable only through the `dock` fixture — no automated public route docks | PQ-162 `station-screens` |
| Three Crucible run surfaces are reachable only mid-run through fixtures | PQ-182 `crucible-screens` |
| 420 of 480 planned reference frames do not exist | PQ-180 `.03` |
| The flight HUD, three overlays and four instruments have no admitted owner packet | PQ-180 `.02` |

## Renderer honesty

Headless Chromium renders through **SwiftShader (software)**; only `--headed` uses the host GPU. Every
run records which renderer produced it, and nothing measured under SwiftShader is performance
acceptance evidence.

## Boot order is part of the contract

A fixture changes the session, so a surface opened after one records a **false** red. One boot visits
surfaces in `orderForOneBoot()` order: menu phase (title, new game, Crucible door) → the HUD → key
routes in flight → nested screens → push-screen fixtures → docking. Anything destructive (`game-over`)
gets its **own boot**. `test/ui-grammar-matrix.test.mjs` pins this.

## The three ways to make this table lie

1. **Green a cell by defaulting it.** A missing measurement is `unproven` and `unproven` fails.
2. **Green a rule from a proxy.** See the table at the top: an observation is evidence for the person
   doing the work, never a pass.
3. **Widen a threshold to clear a red.** The floors live in `scripts/ui-grammar-thresholds.mjs` with
   the line of the grammar each one comes from. Move a number only with a causal record.
