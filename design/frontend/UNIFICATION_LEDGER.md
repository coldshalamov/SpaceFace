<!-- LIFETIME: UNTIL THE LAST ROW IS DONE -->
# Deckplate unification — the ledger

One row per shootable surface. The bar is [`THE_BAR.md`](THE_BAR.md); the loop is
[`../../docs/UI_VISUAL_ITERATION.md`](../../docs/UI_VISUAL_ITERATION.md). This file is how the pass
survives a context compaction: read it, take the first row that is not DONE, keep going.

**The job is not a new design system.** It is finishing Deckplate (`src/ui/deckplate/`) onto every
surface by assembly. Adding a fifth token root is the defect this ledger exists to prevent.

Survey taken 2026-09-22 with the glyph-level bench audit (commit `9f42fb4ae`). "Findings" is what
the machine saw; a clean machine reading does **not** mean the screen passed — most rows below read
clean and still look cheap. The PNG decides.

## Status vocabulary

- `SURVEYED` — photographed, defects recorded, not yet touched.
- `MIGRATED` — assembled from `--dp-` primitives, bench clean, PNG opened and judged, `--walk` run.
- `DONE` — MIGRATED and committed.

---

## Order of work

Player path first, because that is the order a reviewer forms an opinion in: title → pause →
settings → station (7 tabs) → flight → chart → ship → crucible → the rest.

| # | Screen | Findings at survey | Status | Commit |
|---|---|---|---|---|
| 1 | `title` / `mainMenu` | EMPTY BOX 64×787 left rail | **DONE** | `a51aa1241` |
| 2 | `motionAsk` | EMPTY BOX 64×787 (inherits title) | **DONE** | this pass |
| 3 | `new-game` | ON TOP OF ×1 | SURVEYED | |
| 4 | `pause` | clean — cramped column, dead DEV bar, quarter-frame | **DONE** | `00b25955b` |
| 5 | `settings` | clean | SURVEYED | |
| 6 | `save-load` | clean | SURVEYED | |
| 7 | `station` / `station-dock` | ON TOP OF ×3, CUT OFF ×6 | SURVEYED | |
| 8 | `station-market` | ON TOP OF ×3, CUT OFF ×6 | SURVEYED | |
| 9 | `station-shipworks` | ON TOP OF ×5, CUT OFF ×2, OFF FRAME ×3 | SURVEYED | |
| 10 | `station-industry` | ON TOP OF ×1 | SURVEYED | |
| 11 | `station-contracts` | clean | SURVEYED | |
| 12 | `station-factions` | ON TOP OF ×2, CUT OFF ×2, OFF FRAME ×2 | SURVEYED | |
| 13 | `station-bar` | clean | SURVEYED | |
| 14 | `station-ledger` | clean | SURVEYED | |
| 15 | `flight` | EMPTY BOX 276×40 right bar | PARTIAL — empty box fixed | this pass |
| 16 | `comms-radial` | BURIED ×3, EMPTY BOX 276×40 | SURVEYED | |
| 17 | `wingman-radial` | EMPTY BOX 276×40 | SURVEYED | |
| 18 | `crucibleHud` | clean | SURVEYED | |
| 19 | `chart` / `galaxyMap` | `SECTOR_HELIOS` title **fixed**; crumb still leaks the id; three panels stacked bottom-left | PARTIAL | this pass |
| 20 | `chart-galaxy` | clean | SURVEYED | |
| 21 | `ship` | CUT OFF ×2, OFF FRAME ×4, hero number bisected | SURVEYED | |
| 22 | `range` | clean | SURVEYED | |
| 23 | `footprint` | clean | SURVEYED | |
| 24 | `crucible` | ON TOP OF ×6 | SURVEYED | |
| 25 | `crucible-draft` | clean | SURVEYED | |
| 26 | `crucible-refit` | clean | SURVEYED | |
| 27 | `crucible-results` | clean | SURVEYED | |
| 28 | `mission-log` | clean | SURVEYED | |
| 29 | `codex` | clean | SURVEYED | |
| 30 | `help` | clean | SURVEYED | |
| 31 | `achievements` | clean | SURVEYED | |
| 32 | `credits` | clean | SURVEYED | |
| 33 | `game-over` | clean | SURVEYED | |
| 34 | `tech-tree` | clean | SURVEYED | |
| 35 | `asteroid-works` / `drill` | clean | SURVEYED | |
| 36 | `base` | clean | SURVEYED | |
| 37 | `automation` | clean | SURVEYED | |
| 38 | `replay` | ON TOP OF ×1 (copy printed twice) | SURVEYED | |
| 39 | `clips` | ON TOP OF ×1 (copy printed twice) | SURVEYED | |
| 40 | `sandbox` | OFF FRAME ×6 | SURVEYED | |
| 41 | `localmap` | clean | SURVEYED | |
| 42 | `starmap` | clean | SURVEYED | |

---

## Standing repairs, not tied to one screen

- [x] `pageerror: Cannot read properties of null (reading 'security')` — **fixed**. `galaxyMap.js`
      `_weatherSnapshot` guarded with `Number.isFinite(Number(sector && sector.security))`, and
      `Number(null)` is `0`, which is finite — so the guard passed with no sector and the next read
      threw. Gone from `station*`, `range` and `chart`.
- [ ] `styles/hud.css` loads twice: `<link>` at `index.html:16` and `@import` at `styles/ui.css:5`.
      Cascade order is the whole strategy.
- [x] `styles/AGENTS.md` forbade exactly this work: *"Do not impose universal palette, opacity,
      blur, radius, typography, animation, or panel recipes."* **Rewritten** — one system, screens
      assemble it, a new `--xx-` prefix is a defect.
- [ ] Retire `--k-`, `--sf-`, `--fh-`, `--of-`, `--so-`, `--mf-`, `--visor-` once no screen reads
      them. Aliases during flight, deletion at the end.
- [ ] Extend `scripts/check-ui-screen-imports.mjs` past its 18-screen list so a screen cannot grow
      its own stylesheet again.

## Depth tiers

Forty-two screens do not get equal effort, or the pass ends on `sandbox` with the station untouched.

**Tier A — to the bar, walked, judged.** title, pause, settings, station ×7, flight, chart, ship.
Thirteen screens: everything a player sees in the first hour, repeatedly.

**Tier B — bench-clean, every value from `--dp-*`, one PNG opened.** The other twenty-nine.

A Tier B screen that turns out to be on a player's main path is promoted, not skipped.

## Loop notes, earned the hard way

- **Run `node --check` on any file holding a CSS template literal.** A markdown backtick in a
  comment ends the string and kills the module. It has now happened twice in this pass.
- **The bench settles animations before the shutter** (`settleAnimations`). Before that it
  photographed the entrance stagger and gave two different pictures of the same screen.
- **Bench-clean is not done.** Pause read clean with MAIN MENU and QUIT below the fold of a
  scrolling column, because a scroller is reachable by the audit's definition and unacceptable by
  a player's. Open the PNG.
- **KNOWN AUDIT GAP.** The chart's bottom-left corner has three panels of type stacked on each
  other — plainly visible in `.devshots/ui-bench/chart.png` — and `tangledType` does not report it.
  Two excuses were removed already (the 0.85 alpha threshold, and treating any gradient as an
  opaque plate) and it still passes, so the cause is something else: most likely the runs share a
  host, or an ancestor/descendant skip is swallowing them. Worth one focused hour; until then the
  chart's corner is a defect the machine cannot see and the eye can.
