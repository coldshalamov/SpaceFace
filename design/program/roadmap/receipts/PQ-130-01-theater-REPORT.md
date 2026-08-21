<!-- LIFETIME: RECEIPT -->
# PQ-130.01 Theater — receipt

**State:** done (2026-08-21). **Law:** `design/ASTEROID_WORKS_DESIGN_LAW.md` §2, §3, §4, §6.1–6.2, §10, §11.

## What shipped

- The previous implementer's Theater build (fonts vendored, `--aw-*` warm chrome, console deleted
  to crest + rig cluster, flat axis-aligned ortho camera with two zoom registers, shared bloom
  composite, starfield + silhouette skirt, square pads) was swept onto master unreviewed inside
  `ac865569 "perf work"` by a concurrent lane.
- Review pass 1 (`311142fb`): Z key could only ever select the work register (`inputZoom(-1)`) →
  `toggleZoomRegister()`; three chamfer widths (0.045/0.065/0.085) read as loose bricks → one
  0.018 grout; body top bound sign slip (`worldY(-1) - 3.2S`) → `+`; sky margin 3.5 → 0.5 cells;
  backing wall sized to the field (no gray slab past the silhouette); first frame snaps to the
  clamped framing. `check:asteroid-theater` wired into package.json.
- Review pass 2 (`579c020c`, from the Opus code review): hidden transitional inspector no longer
  rebuilds its DOM twice a second (`LENS_ENABLED = false` until `.06`); alert bank cut to ≤7 words
  each; PQ-024 probe + guard test repointed from deleted `.ao-*` selectors to `[data-chip]` hooks
  and `[data-mode]` on the screen root (survey/palette steps marked transitional for `.04`/`.09`);
  chips 13px.

## Evidence

- `npm run check:asteroid-theater`: 1920×1080 board 96.3%, 8 visible words; 1280×720 board 94.4%,
  8 visible words; no sub-12px, no uppercase, no Saira, no banned blue-gray.
- `npm run check:baseline`: 12/12 green.
- `test/pq024-asteroid-claim-manifest.test.mjs` 17/17, `test/pq024-survey-claim.test.mjs` 22/22.
- Stills at 1920×1080 (`scripts/capture-asteroid-works.mjs`): `.devshots/asteroid-works/01-cutaway-fresh.png`
  (crest + rig cluster only, flat grid, derrick against space), `05-site-register.png` (whole body
  centered in the starfield). Reviewed by eye.
- Opus code review verdict on `66d3787f..ac865569`: "a new silhouette, not a shorter copy" —
  console removed from the DOM in every state; tokens byte-exact to §3.2; composer genuinely
  retired (single ACES pass, no double tone-mapping); camera contract holds by construction.
- `npm run check:playable`: 13/14; the CLEAN step is red from an unrelated ship-texture console
  error that predates this leaf (reproduced on a docs-only commit).

## Deferred to later leaves (recorded, not forgotten)

- `.02`: camera catch-up escape — `CAM_MAX_CELLS_S = 6` vs the 0.06s rocket; resolved by the
  cadence law, plus drop the cap when the rover is more than half a view away.
- `.03`/renderer follow-up: subscribe the mine's bloom to `settings:changed` (bloom/exposure
  toggles currently ignored inside the mine); expose a cell-projection hook and assert §11.1
  flatness numerically in `check:asteroid-theater`; §11.2 site register is ~12px/cell at 720p
  (law amended: ≥16px at 1080p, ≥12px at 720p).
- `.04`: the PQ-024 survey step of the probe goes away with fog.
- `.07`: ledger buffer consumer; alert-state fixture for the word-budget check.
- `.09`: re-aim the probe's palette `[data-item-id]` clicks to the earned palette.
