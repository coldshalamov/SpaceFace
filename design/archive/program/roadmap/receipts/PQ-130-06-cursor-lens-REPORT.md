<!-- LIFETIME: RECEIPT -->
# PQ-130.06 Hover as instrument — receipt

**State:** done (2026-08-21). **Law:** design law §6.4, §3.2–§3.4, §2.5, §10, §11.3–§11.4.

## What shipped
- `src/ui/asteroid/inspector.js` rewritten as the **cursor lens** (`createCursorLens`, pure model
  builders, `seamSplits`, `LENS_CHIPS`, `sentenceCase`; kept `commodityName`, `formationLabel`,
  `surveySentences`, `placementReason` for their importers/tests). The five prose cards are gone.
- Card: max 260px, `--aw-surface`, r10, soft shadow, +18/+18 from the pointer with edge flip and the
  described cell's projected box as a keep-out; row 1 = 22px swatch sampling the board's material
  colour + name (Instrument Sans 14) + assay numerals (Spline Sans Mono 13); row 2 = enumerated chips
  — `Bore Nu` (gold), `Farm` (mint), `Hazard` (coral), `Locked MkN` (coral, replaces Bore),
  `Splits seam` (gold), `Valid seat` / `Blocked` (ghost); machines: lamp + one body line + the 3×3
  contact ring inside the card. ≤2 text lines, never tutorial copy; ~150ms delay while driving,
  instant in build mode; hides on leave, drive key, zoom, mode exit, session stop. Seam size from the
  renderer hook; claim-formation membership paints a wordless ring on the swatch (mint committed /
  gold volatile) — the real consumer of `surveyCellRole` (a test had been passing on a comment).
- `asteroidScreen.js`: `LENS_ENABLED` deleted; lens wired; the inspector's half of the hidden
  transitional container removed (palette's stays until `.09`). Four context-bay operator buttons
  (export hold/ship, pod target, recipe switch, bulk transfer) deleted as dead code — unreachable since
  `.01`; owner APIs untouched; the §6.6 Site drawer (`.07`/`.10`) re-binds them.
- `styles/asteroid-ops.css`: additive `.aw-lens` block. `check-asteroid-theater.mjs`: lens assertion
  (hover shows ≤2 text lines, ≤ words budget, gone after leave; negative-tested). Capture adds
  `08-lens.png`, `08b-lens-machine.png`.

## Evidence
- pq024 survey-claim 22/22, claim-manifest 17/17; `check:asteroid-theater` holds incl. "lens over vein
  10,3 — 170x68px, 1 text line, 6 words, chips [Bore 2u, Farm]"; `check:playable` 14/14 (one known
  CLEAN flake, green on rerun). Still reviewed by the orchestrator: `08-lens.png`.

## Handed on
- `.07`: the renderer's cyan hover box is the loudest element on the board and cyan is reserved for
  flow (§3.2) — make it a thin gold/ink outline.
- `.09`: `scripts/lib/pq024CommittedPresentation.mjs` still asserts inspector kicker/title surfaces
  that §10 deleted; drop those four assertions when the palette lands (crest chips carry the truth).
- `surveySentences` has no runtime consumer until the ledger drawer.
