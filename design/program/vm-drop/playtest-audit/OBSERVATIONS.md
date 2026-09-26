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

## Run 4 — routes=loop+edge @ 136401111..80094775f (post-reorder)

**loop** (new route): l01 boot→flight clean; l02 autopilot reached nearest asteroid (id 344,
d0=90→d=78) in 2.2s — spawn field has rocks close by; l03 14s RMB mine → **cargo gained a new
commodity** (`cmdty_unclassified_composite` already aboard +1 new id, usedMass ticked up) — mining
end-to-end works: aim→beam→yield→hold.

**edge**: x06 docked Helios (99s autopilot), MISSIONS tab opened; accept search found no `ACCEPT`
verb — the board's real commit verb is "DISPATCH THIS JOB" and it can be readiness-gated
(READINESS: "Blocked — Need 4 u cargo capacity"). HOLD dial read 250/250 with SELL — a freight:loss
event during the 99s trip ("TRAGEDY AT HELIOS: RELIEF FREIGHTER LOST" on the BAND) had filled the
hold with recovery goods; verified a second clean trip keeps hold 0/250 so this was a live event,
not a baseline grant. **The board correctly says blocked in words — good design.** x03 quit now
undocks first (Esc at a station exits the hub, not pause); x04 continue pending re-verify — the
x06 dock autosave + forced undock-save should produce a Continue row this run.

Harness: census now records `player.cargo` {usedVolume, capVolume, itemCount}; x06 selects an offer
row then clicks `dispatch this job|accept|take on|sign`; blocked readiness is logged as a datum, not
a failure.

**Screen-quality notes from the stills (all A-list already):** contracts board (route map + risk/
standing/payload/readiness columns), market (spread/trend chart/forecast/quantity dial), bar
(patron portraits + numbered dialogue tree + leads board), pause (grouped verbs + flight brief +
explicit autosave contract text), crucible results (RUN OVER + kill-cam sector diagram + killer
card + LAST 8 HITS + gold primary). Nothing to fix on these surfaces today.

## Run 5 — routes=loop+edge @ 9e009042d

**loop**: l03 mining verified again (hold gained ore_iron×1, silicate×2, assay_sample×1). l04 station
travel timed out at 4 min with ~630 WU remaining — focused probe `/tmp/probe-ap.mjs` shows the
autopilot leg itself is *working*: 1462→145 WU over ~2 min, status cycling cruise→avoiding→braking,
speed 12–250 with detour wiggles (d briefly rose 554→646 mid-avoid). Not a game defect — a probe
budget issue on ~1500 WU legs; travel timeout raised to 8 min + re-engage on autopilot drop.
l04 sell/l05 outfit therefore skipped; l06 gate-jump beat added next run.

**edge**: all clean. x03 quit seam verified (Esc→pause→Main Menu→confirm→mainMenu). **x04 resume now
verified**: `continueAvailable:true`, restored into live flight (simTime 29.6, hull 140, shield 345,
credits 5000) — the x06-dock + x03-undock autosave chain works. x06 picked a *services* row
("Sell what you hauled" matched /haul/) instead of a contract — probe now clicks the row that
actually contains a commit verb, falling back to select-row→detail-pane verb.

**CI note**: static(2) went red on 9 checks — verified 7/9 identical on clean master (upstream);
fixed the 2 that upstream commit 6ff452c31 left stale: `check:ui:control-labels` (tether gained the
Digit3 hotbar alias) and `check:gamepad-mission-log` (live-glyph prompt dropped the Start → Pause →
Mission Log sentence; stub lacked `style.removeProperty`/`cancelAnimationFrame`).


## Run 6 — routes=screens+edge+combat+loop @ c86319628

**screens**: t02b-settings-toggle false-positive corrected — the switch state lives on the
`.k-words--row.is-on` class, not the Off/On word text; beat now flips the switch, asserts `is-on`,
and restores deterministically (was previously a no-op click + blind restore). i04-cargo/i06-comms
keys emit `ui:toggleCargo`/`ui:toggleComms` → HUD overlays, never `ui.screen` — beats now assert the
overlay element (.sf-cargo-panel.open / #sf-comm-backlog) instead of a screen id.

**edge**: x06 job-accept now clicks the real DISPATCH row (accepted "8u Fuel Cells to Ceres").
**x07 quicksave verified**: F5 stamped meta.lastSavedAt, F9 restored flight with credits intact
(5000→5000, simDrift 0.3s). x03 found Esc was consumed by the residual station screen after the
undock helper — beat now presses through screens until `pause` (also why x04 showed no Continue).

**combat**: c01b labdoors walked Share codes + Practice room (practice entry goes through
mode=loading). c04/c04b could not kill the player inside 60s (hull 2 survived; crucible invulnerable
toggle or weak aggro) — crucible death path still unproven live, but the demo-path run proved
death→results earlier. Lab deck (Spawn bodies/Clear enemies/Refill) overlaps the speed dial during
the death beat — practice tooling, flagged as a watch item only.

**loop**: l03 mining produced cargo (composite + 47-A assay sample). l04 SELL clicked the Buy/Sell
mode TAB (view switch), not the data-go commit — probe now picks a held row and clicks the live
"Sell N" verb, flagging DISABLED/none explicitly. **REAL DEFECT → fixed**: `world:requestJump`
accepted while docked wedges `jump.state=CHARGING` forever (chargeT never ticks under the station
screen) — `_onRequestJump` now rejects with `docked` (commit 05db48a78). l06's stall also exposed
that l05's Undock click silently failed: the footer Undock verb is `position:fixed`, so
`offsetParent!==null` filters are blind to it — added `H.clickText`/`H.isVis` helpers covering
fixed elements. l07 hail ran while docked → deck opened "CHANNEL IDLE" (correct: not_in_flight);
needs rerun in flight. l08 synthetic ship_destroyed → gameOver showed only Load save / New Game —
recoverable berth verb needs the real combat receipt path; synthetic emit can't produce it.

| run | routes | beats | obs | game fixes landed |
|-----|--------|-------|-----|-------------------|
| 6 | screens+edge+combat+loop | 26+7+6+8 | 2 real (jump-wedge, sell-tab) + probe gaps | requestJump docked-reject |

**Run 7 queue**: full-route rerun with all beats — i/l overlays, t02b switch, l04 sell commit,
l04b job-accept→l06 mission-sector jump→l09 dock-and-get-paid, l07 hail in flight, l08 gameOver.

## Run ledger

| run | routes | beats | obs | game fixes landed |
|-----|--------|-------|-----|-------------------|
| 1 | screens | 25 | A1..A10 | — |
| 2 | screens | 25 | B1..B3 | A1 ghost fix (harness-verified) |
| 3 | screens+edge+combat | 25+6+6 | 0 new | B2 tofu glyph `7780d8827` |
| 4 | loop+edge | 3+6 | 0 defects (1 designed full-hold) | x06/x03 harness fixes |
| 5 | loop+edge | 5+6 | 0 defects (travel budget only) | 2 upstream CI checks fixed |

## Next runs

- loop route now covers: rock→mine→dock→SELL held ore→shipworks→undock (full money loop).
- Remaining unplayed seams: sector JUMP (starmap→charge→arrive), comms HAIL dialogue, mission
  COMPLETION (deliver 47-A), save-slot LOAD round-trip, crucible lab doors (draft/calibration/
  share), gameOver screen (flight death, not crucible), settings toggles doing something visible.
- B1 title AFK: residual heavy-frame cost is the live title scene under SwiftShader — perf lane.
