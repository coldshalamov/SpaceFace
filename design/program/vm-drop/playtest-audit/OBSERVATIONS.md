# Playtest audit — observations ledger

Lane: played-audit + fix-as-found. Owner direction 2026-09-26: batch audits into clean runs,
write observances down as found, polish/fix wherever unambiguous, keep a paper trail other
agents can review. Demo footing: polish to professionalism.

## Method

`node scripts/probe-playtest.mjs --route=<route>` boots a clean-store headless game and walks
a scripted route. Every beat records: seconds, host CPU%, frames>100ms, a PNG, and a census
(screen id, mounted screens, visible text, clickable controls) into
`.devshots/playtest-<route>/` (`report.json` + `census/*.json`). `--only=<beatId>` is a
stop-after list, same contract as `probe-demo-path`'s `SF_DEMO_STOP_AFTER`.

Review path: read `census/*.json` + `report.json` first (cheap text), open PNGs only where the
text says to look.

Severity: `defect` = breaks the game or lies to the player; `rough-edge` = unambiguous polish
miss; `taste` = probably-designed, needs owner-adjacent review; `note` = informational.

Status: `open` | `fixed:<sha>` | `ledgered:<D#>` | `designed`.

## Run 1 — route=screens @ work-branch head (post rebase onto 6ff452c31)

Clean: 25 beats, 4.6 min wall, 0 console errors, 0 shader errors.
Evidence: `.devshots/playtest-screens/` (23 PNGs + census; instrument/-open shots land next run).

| # | sev | status | Observation | Evidence / suspected cause |
|---|-----|--------|-------------|-----------------------------|
| A1 | defect | fixed:c91a1b200 | **Screens stayed painted after their stack pop.** Achievements remained fully rendered during 16s idle while `body.dataset.kScreen=mainMenu`; techTree's giant text bled through the docked station UI. **Root cause:** `src/ui/orrery/constellationLayouts.js` pins `display:grid !important` on `.con-achievements` / `.con-research` roots — screenManager's inline `display:'none'` lost the cascade. Fix: hide writes important-priority inline none; show path clears the property first. | Run-2 walkVerb now asserts post-pop visibility — caught `["achievements"]` still visible. Verified live: open→Esc→+400ms→+1300ms→reopen all correct. The t10-afk byte-identical PNGs and 63/74 heavy frames were the ghost repainting — re-measure next run. |
| A2 | rough-edge | designed | `I` (cargo) and `L` (comms) produce no `screen` — they are HUD **overlays**, not stack screens. Run-2 `-open` PNGs show both render correctly (cargo manifest with capacity/legality/market intel; comms log card). Census blind spot, not a defect. | 15-i04-cargo-open.png, 17-i06-comms-open.png |
| A3 | rough-edge | designed | **M and N both open `galaxyMap` — by design.** `input.js:357` comments: M → galaxyMap LOCAL (near-field), N → galaxyMap GALAXY (star chart); legacy localmap/starmap screens are registry-only for checks. | src/ui/input.js:355-370 |
| A4 | defect | ledgered:D57 | **960×600 viewport loses HUD instruments.** BAND comms feed + status column vanish; radar and the `OBJ … WU` readout clip at the right edge. Root cause measured: `#hud` children are px-anchored, no width breakpoint exists in styles/hud.css. Handed to ledger — PQ-180 owns responsive scalars. | 20-e02-resize-small.png; DEMO_READINESS §6 D57 |
| A5 | rough-edge | designed | Codex discovery cards DO auto-dismiss — `discoveryPlate.js` queues max 3 with 3s TTL + 320ms fade; the apparent stack was a fade overlap plus back-to-back discoveries (Training Derelict + Tutorial Beacon). Working as designed. | discoveryPlate.js:11-13, 146-157 |
| A6 | rough-edge | designed | "INTERCEPT ACTIVE" text in the run-1 census was the **mid-travel** snap — the sector-law presenter hides via `[hidden]`+`!important` the moment `state.ui.docked` flips, and the run-2 `s01-docked` census contains no intercept text. Working as designed. | sectorLawPresenter.js:276 hide-on-docked; s01-docked.json clean |
| A7 | taste | designed | `SPEEDREF` run-together is innerText concatenating label+value+tooltip from separate nodes — the rendered HUD shows a clean big numeral + REF sublabel (PNG verified). Census artifact. | 11-f02-hud.png |
| A8 | note | open | Station COMMS click opens a "COMMS LOG" modal that persists over the panel until Esc — correct behavior, but the harness walk left it open; harness now escapes modals before continuing. | 24-s02 PNG |
| A9 | note | open | Title AFK/attract-tape beat never ran on the title: the t09 achievements pop failure left it idling on achievements. Re-run for a real attract verdict. | run artifact |
| A10 | rough-edge | designed | "Graphics hardware acceleration appears OFF" duplicated in innerText = toast card + `#toast-live` sr-only a11y clone (`toasts.js:6` — announced once through a dedicated polite live region). Both nodes hold the string; only one is painted. Census artifact, not a defect. | toasts.js announceStatus/#toast-live |

## Run 2 — route=screens @ c91a1b200-parent (pre-A1-fix, hardened harness)

Clean: 25 beats, ~4.5 min wall, 0 console errors, 0 shader errors. Station walk now covers
market/shipworks/industry/contracts/factions/bar/ledger tabs via `[data-nav]`.
Evidence: `.devshots/playtest-screens/` run-2 artifact set (PNG byte-identical signature proves
the A1 ghost: 08/09/10 are the same 664372 bytes).

| # | sev | status | Observation | Evidence |
|---|-----|--------|-------------|----------|
| B1 | note | open | **Title AFK beat measured the A1 ghost's repaint cost** — 63/74 frames >100ms at 69% CPU while idling on title. Re-measure post-A1-fix before calling it a perf finding. | run-2 t10 beat log |
| B2 | rough-edge | fixed:7780d8827 | Toast line rendered a tofu glyph (`— ☐ Sanctioned Claim` bottom rail). Root cause: `world.js:4131` emitted `⟢ ${zone.name}` — U+27E2 is outside the HUD font. Fixed by dropping the text glyph; the receipt kind icon (SVG via `glyphSvg`) already carries severity — same retirement toasts.js made for ✓✕¢◈. Swept all `emit('toast')` + alert strings: `⟢` was the only unguarded glyph (⚠⛔☢ carry `\uFE0E`). | world.js:4131 |
| B3 | note | open | Station walk: all 7 `[data-nav]` tabs mount cleanly, controls 61–78 per tab. Tab shots show a designed dense trading UI; no broken controls observed in census. | s02-tab-*.json/png |

**Ledger carry-over resolved:** A4 → D57 in `DEMO_READINESS` §6. A5/A6/A7 verified designed. A10 documented. B2 fixed in `7780d8827`.

## Run 3 — routes=screens+edge @ 793c4ae88 (post-A1-fix + toast-exclusion harness)

screens: 25 beats clean, **zero leftover-screen observations** — A1 fix holds under the
m/Esc/n/Esc/j/Esc/t/Esc toggle spam (x05 `leftovers: []`). All flight instruments and station
tabs mount; no new census defects.

edge: x01–x05 exercised quit-to-title and resume:
- x03 pause→Main Menu→confirm→`screen=mainMenu` — quit seam verified end-to-end.
- x04 `continueAvailable:false` after mid-flight quit — **designed**: autosave fires only on
  dock/undock/sector/jump/mission/trade events or `autosaveIntervalS` (default 0); no trigger
  fired before quit, and the confirm warned "unsaved progress will be lost". No save → no
  Continue row is consistent.
- x05 toggle-spam on title after the quit: harmless no-ops.
- **Harness bug fixed:** x06 (job-accept) originally ran after the quit and timed out in menu
  mode (241s, d=1348 — stale world state, no live flight). Route reordered: spam + dock + accept
  now run before the quit beat.

combat run-1 evidence: crucible quick-play verified — RICOCHET FOUNDRY ROUND 01, 15 hostiles,
hull 260→166 under fire, exit via pause→confirm lands mainMenu. c02 previously misclicked the
GPU-warning toast ("Desktop l**aunch**er") — all 9 control-scan sites + lib `clickWord` now
exclude `#toasts/#alerts/#toast-live`.

## Fixed in flight (harness, not game)

- `--only` is now a stop-after list (old run ignored it and ran the whole route — which is how
  run 1 exists at all).
- Beat-level screenshot landed post-close for open/close beats; `shotNow()` now captures
  mid-beat + writes `census/<suffix>.json` at capture time (end-of-beat census was post-close).
- `waitMode('adventure')` corrected to `'flight'` (was burning 90s per run on a wrong name).
- Census now lists every mounted `.screen` with visibility — makes A1 provable next run.
- Station walk now targets `[data-nav]` tabs instead of whatever `.k-word` matched first
  (run 1 walked the hotbar: COMMS/HAIL/YCharge/…).

## Next runs

- route=screens re-run: confirm A1's mounted-screen list, capture `-open` frames for every
  verb/instrument, real AFK title verdict, station tabs via `[data-nav]`.
- route=edge (new beats): quit-to-title mid-flight and re-enter; save+continue; death mid-run;
  crucible door walk.
