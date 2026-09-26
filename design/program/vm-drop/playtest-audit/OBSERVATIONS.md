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

## Run 7 — routes=screens+edge+combat+loop @ 1743a1143

**screens**: 26 beats clean — i04-cargo / i06-comms verified as live HUD overlays (overlay=true);
t02b switch toggle measured correctly; s02 walked market|shipworks|industry|contracts|factions|bar|
ledger (station tab PNGs all read A-list: bar has patron roster + numbered answers + leads,
industry has recipe tree with SHORT badges + NEEDS REFINERY gate, ledger has event timeline +
net-CR dial). Sandbox screen = dev harness by design.

**edge**: 8 beats, 1 observation — x04 Continue now works (x03 Esc-through-screens fix);
x07 F5/F9 round-trip clean again. x08 real saveLoad slot click landed mode=menu: the slot's Load
verb opens a "Load this save?" confirm modal the probe didn't answer (two-step load is correct
design — probe now clicks the confirm's Load too). Logged-copy nuance, not fixed: from title the
confirm warns "Loading will replace your current game… Unsaved progress is lost" when there is no
in-flight game — shared confirm component, text is generic; watch item.

**combat**: 7 beats, 0 observations — lab doors, launch, fight, deathwatch, c04b death→results, exit
all clean.

**loop**: 10 beats, 1 obs + 1 console error:
- **l04-sell VERIFIED**: held-row → sell-mode tab → live `data-go` "Sell 5" → credits 5400→5446.
  Market sell path works end-to-end.
- **l05/l06 VERIFIED**: clickText found fixed footer "Undock" → mode=flight → jump helios_prime →
  ceres_belt `arrived:true`, autosave `saveNow:true` on arrival. Jump path works end-to-end.
- **l07-hail VERIFIED**: in flight, targeted ship id=328 at 501 WU → hail deck opened
  (`deckOpen:true`, card shows "BELT OUTPOST ↔ CINDER SLUICE / HAULER / FREQ IDLE / FREQ 3.19k").
- **l04b-job**: probe clicked the row CARD (which only selects) instead of the leaf "Dispatch this
  job" verb inside it → active 0→0. Probe fixed (leaf-only verb match + detail-pane fallback).
- **l09-deliver**: early-out "none-in-sector" — no active mission (l04b's miss), untested this run.
- **l08-death**: synthetic path still shows only Load save / New Game (expected — recovery berth
  verb requires the real combat-death receipt; not a defect).
- **NEW console error — needs investigation**: `[render] sector authored prewarm invariant failed;
  residency was not rotated — Incoming sector sector_ceres_belt lost a prepared authored boundary
  before publish` (renderer.js:3560, thrown through the prewarm catch at ~10376). One READY
  boundary record failed `publish()`'s revalidation between snapshot and publish — a generation/
  abort race in sector-prewarm. Arrival still completed; sector falls back to procedural boundaries.
  Repro attempt: `--route=loop --only=l06-jump`. If deterministic → ledger row or targeted fix;
  if a benign supersede, the invariant's loss-detection may need to tolerate rotation.

| run | routes | beats | obs | game fixes landed |
|-----|--------|-------|-----|-------------------|
| 7 | screens+edge+combat+loop | 26+8+7+10 | 1 probe-gap (l04b card-click) + 1 console error (prewarm race) | — (probe fixes only) |

## Run 8 — routes=loop+edge(x08)+screens @ a39b9a915

Clean: loop 10 beats / 8.1 min, edge→x08 8 beats / 3.5 min, screens 28 beats / 7 min.
0 console errors on screens+edge; loop carried the prewarm invariant again (below).

**VERIFIED — the full economy chain is now proven end-to-end on the real path:**
- l04b-job: leaf-verb fix worked — "Dispatch this job" accepted m_2 (dest sector_ceres_belt /
  station_ceres), active 1→2.
- l06-jump: starmap → gate jump → CHARGING 3s → `arrived:true` in sector_ceres_belt, autosave
  `saveNow:true` on arrival.
- l09-deliver: traveled to station_ceres, docked → mission completed: credits 4806→5113 (+307 CR),
  active 2→1, completedLog=1.
- l07-hail: deckOpen on targeted ship (already verified run 7).
- l08-death: synthetic `ship_destroyed` → gameOver "ENVIRONMENTAL HAZARD / Final sortie 7m30s /
  Recovery receipt unavailable" — screen reads A-list (career dial + LOAD SAVE / NEW GAME /
  MAIN MENU). The flight verb row in census `verbs` is DOM-under-screen, not painted — PNG clean.
- screens: all 8 title verbs resolve; flight instruments m/n/j/i/k/l/t all open; station tabs all
  walk (market|shipworks|industry|contracts|factions|bar|ledger); s03 bar-talk exercised.

**Probe defects fixed this run (all were census/actuator blindness, not game bugs):**
- x08-load-slot: confirm lookup `querySelector('#sf-confirm-root, [role="dialog"], …')` bound the
  FIRST match — an unrelated hidden `[role=dialog]` earlier in DOM — so `confirmed=null` while the
  real "Load this save?" modal sat open (PNG-verified). Fixed: prefer `#sf-confirm-root`, wait for
  the dialog to mount, then search it. `4e88c4f1e`
- i08-find: `/` palette DID open — `.sf-find` is `position:fixed` so the beat's raw
  `offsetParent!==null` check reported invisible. Swept all 28 raw offsetParent checks to
  `isVis()` (fixed-aware). `b773c1c57`
- l03-mine: cursor-aimed mining — probe now projects the nearest asteroid through
  `helpers.worldToScreen` and moves the RMB there (was blind point 800,450 → missed, cascading to
  l04 "no live Sell commit" on an empty hold). `a39b9a915` — verify next run.

**Game-side change:** prewarm publish error now carries per-candidate status
(`fail(active=…,state=…,inMap=…)`) so the next occurrence identifies whether the lost record was
superseded/aborted vs genuinely unclaimed. `9e119fd55` — invariant still strict; D59 stays open
until the next sighting classifies it.

**Perf notes (SwiftShader-relative, for the perf lane):** s01-travel-dock 458/1011 heavy frames
(long travel leg), x06-job-accept 233/530, e01-pause-open 16/22 — screen-open bursts remain
shader-compile suspects.

| 8 | loop+edge+screens | 10+8+28 | 3 probe-defects fixed, prewarm 2/3 ceres arrivals | `9e119fd55` diagnostics; probe fixes `4e88c4f1e` `b773c1c57` `a39b9a915` |

## Run 9 — verify pass @ b773c1c57

loop→l04 / edge→x08 / screens→i08, all three fixed beats green:

- **l03-mine**: `aim={x:1239,y:332,onScreen:true,rockId:349,d:69}` — RMB bit the rock; cargo gained
  silicate×12 + ore_iron×4. No cascade.
- **l04-sell**: live `data-go` "Sell 4" found → credits 5400→5453 (+53). Money loop green end-to-end.
- **x08-load-slot**: `confirmed:"Load"` → `afterMode:"flight"` — title→Load→slot→confirm→flight
  round-trip verified. 0 observations on the whole edge route.
- **i08-find**: `key / -> overlay=true` — the palette was never broken; position:fixed blindness.
- Bonus read: e05-resize beats + all instruments now go through `isVis` (28 raw checks swept).

| 9 | loop+edge+screens (stop-after) | 4+8+21 | 0 defects — all 3 probe fixes verified | — |

## Run ledger

| run | routes | beats | obs | game fixes landed |
|-----|--------|-------|-----|-------------------|
| 1 | screens | 25 | A1..A10 | — |
| 2 | screens | 25 | B1..B3 | A1 ghost fix (harness-verified) |
| 3 | screens+edge+combat | 25+6+6 | 0 new | B2 tofu glyph `7780d8827` |
| 4 | loop+edge | 3+6 | 0 defects (1 designed full-hold) | x06/x03 harness fixes |
| 5 | loop+edge | 5+6 | 0 defects (travel budget only) | 2 upstream CI checks fixed |

**D63 — UPSTREAM (not ours): static(2) shard red at master `314cfaaa8`.** bar-faction-greetings
test, check-title-attract, check-countermeasures, check-sg05-runtime, check-sg08-render-vfx,
check-phase0-slice-contract, check-authored-place-runtime, check-perf-packets — verified identical
on detached clean master; the vm branch diff touches none of these files. Owners: whoever landed
the last ~80 commits on master (build-map lanes). Same row now also covers the pq-160-01 auto-clip
detector reds (bolas-kill mark, replayed-window hash, export writes) — identical at detached master
`314cfaaa8`, unrelated to the clips presentation edits on this branch (asserted by the readout/readout
contract lines the tests still pass against).

## Next runs

- loop route now covers: rock→mine→dock→SELL held ore→shipworks→undock (full money loop).
- Remaining unplayed seams: sector JUMP (starmap→charge→arrive), comms HAIL dialogue, mission
  COMPLETION (deliver 47-A), save-slot LOAD round-trip, crucible lab doors (draft/calibration/
  share), gameOver screen (flight death, not crucible), settings toggles doing something visible.
- B1 title AFK: residual heavy-frame cost is the live title scene under SwiftShader — perf lane.

## Run 10 — expanded beats + first real game defect @ 163d0321a

Full sweep on the new probe set: screens 35 beats (incl. new t09b hull-swap, t09c sandbox-launch,
i09 find-query, i10 codex-read, e05 pause-verbs), edge 8, combat 7, loop 10 — **60 beats, 0 defects,
0 console errors, 0 shader errors**.

**D60 — FIXED: `/` global find was dead in flight.** `.sf-find` mounts inside `#screens`, which
screenManager parks at `display:none`+inert whenever the stack is empty — i.e. always in flight, the
primary place the palette is for. Laid out but painted nothing (isVis said true via the
position:fixed clause — pixel evidence caught what the census could not). Fix `163d0321a`:
`globalFind` lifts the lid (display/inert/aria-hidden) for the bare mount and restores it on close
only while the stack stays empty; `screenManager` honors an open `.sf-find--host` so a mid-open
stack sync can't re-park it. Verified by rendered frame: `22-i08-find-open.png` now shows the
dimmed flight scene + focused input + hint line; `23-i09-find-dossier.png` shows query "ceres" →
STATION Ceres Refinery / SECTOR Ceres Belt rows → Enter → full station dossier drawer
(standing/services/powers/Open-on-chart). Whole find→dossier chain green.

New-beat coverage this run: hull-swap flips `aria-pressed`+card; sandbox tile launches a session and
quits clean; codex row click renders the article; pause verb census pushed 6 screens and backed out
— no dead verbs seen.

PR #162 CI remains the upstream set only (program-queue 33 ancestor errors + same 4 feel-contract
tests — verified byte-identical on detached master).

## Run ledger

| run | routes | beats | obs | game fixes landed |
|-----|--------|-------|-----|-------------------|
| 10 | screens+edge+combat+loop | 35+8+7+10 | D60 fixed | find palette in-flight `163d0321a` |

## Next runs

- Adventure real-death → recovery-berth path (c04b covers crucible death only).
- Achievements content depth, crucible share codes, gameOver-vs-berth distinction.

## Run 11 — coverage gaps closed + two real defects @ 19e68ce23..a562abfc5

Screens route re-run with widened beats (35 steps, 0 defects, 0 console/shader errors, ~7.6 min wall).

New coverage landed this run:
- `k01-flight-keys`: F3 → footprint screen renders (chains / chain record / ship ledger / five
  context verbs) — previously never exercised.
- `e05-pause-verbs` now walks all 10 pause verbs with deterministic return-to-pause driving:
  Settings, Load, Mission Log, My Ship, Operations(automation), Local Map, Help, Codex,
  Achievements, Replay — every verb lands on its screen, none dead.
- `s04-ship-range`: shipworks "Take it to the range" verb.

**D61 — FIXED: shipworks verb rack dead clicks.** renderApron() reparents `.sx-sw-verbs` onto
`statsEl.parentElement` (pinned footer row under the stats scroll), but the only `[data-verb]`
click delegation lived on `statsEl` — every verb in the rack (range/record/fit/activate) painted
but did nothing. Probe evidence: s04 clicked "Take the Hitch to the range" and the screen never
left `station`. Fix `cf5cc3cc3`: shared `onVerbClick` bound on the rack's real parent; statsEl
path stopPropagations after handling so a mid-refresh rack can't double-fire. check:baseline
16/16.

**D62 — FIXED: Replay empty state rendered its hint twice.** `replaySummary().detail` was painted
as the header fine line AND again as the `replay-readout` paragraph — "Fly for a while, then
pause and open Replay." duplicated bottom-left. `a562abfc5` hides the readout until a recording
exists (it only reports Ready/End during playback). Test `pq-160-00-replay` 4/4.

Probe-hardening commits (not game defects): e01 drives Esc until pause mounts (prior beat could
leave a mid-pop layer eating the first Esc); e05 exits to flight through in-screen layers (Replay
mounts inside pause — a single Esc left pause open and s01's "autopilot stall" was a frozen sim);
s03 picks the visible `data-nav="bar"`; s01 clears leftover modals before travelling.

## Run 12 — fix verification run

Screens route re-run on the fix: 35 beats, 0 defects, 0 console/shader errors, 5.7 min wall.
s04 now lands `Take the Hitch to the range` -> screen=range and the range lesson screen renders
full (HEAVY HULLS TURN WIDE gate-course card, AGAIN/TRY IT EMPTY/NEXT RULE/RETURN verbs, 9-rule
tab strip). e05 walks all 10 pause verbs green; e01 pause + resume green; F3 footprint green.

## Run 13 — drill screen + remaining-seam coverage

New beat s05 opens the drill screen through the real handoff: `drill:approachStarted` (sets
`activeDrillApproach`, blocks input, dock fade) then `drill:approachCompleted` with the live
asteroid entity id — uiRoot matches the approach and pushes the `drill` screen. Result: 36
beats, 0 defects, 0 console/shader errors; screen=drill, AST-4 ore strip + heat/charge gauges
render (35-s05-drill.png). Recovery-berth path reviewed in code — gameOver receipt fields
(station berth, cost vs quote, hardship fund, coverage line, per-outcome refresh) already
render all cases; the "No recovery route" copy seen at l08 is the genuine no-insurance branch.

## Run ledger

| run | routes | beats | obs | game fixes landed |
|-----|--------|-------|-----|-------------------|
| 10 | screens+edge+combat+loop | 35+8+7+10 | D60 fixed | find palette in-flight `163d0321a` |
| 11 | screens | 35 | D61, D62 found | shipworks dead verbs `cf5cc3cc3`, replay hint `a562abfc5` |
| 12 | screens | 35 | clean | verifies D61/D62 in a fresh boot |
| 13 | screens | 36 | clean | drill screen reached via real approachCompleted handoff |
| 14 | edge+combat+loop | 8+7+10 | clean | regression pass on the D60–D62 fixes HEAD — full sweep green |
| 14.5 | demo-path | 11 steps | clean + D64 found in c04b frame | lab rack off the HUD instruments `ad67e039b` |
| 16 | screens | 36 | D65 found+fixed | clips readout dedupe + sibling-overlay close `577612803`; e05 walk 12/12 verbs |

## Run 14.5 — canonical demo path on the fixes HEAD (probe-demo-path.mjs)

Full route CLEAN PASS on the audit HEAD: title → crucible launch → flight → rounds to real
death (448 s of arena combat) → results → belt → job → physical problem leg → dock → paid →
upgrade → demoEnd. All 11 steps OK, no console errors. End card verified live: reads as a
designed minimal closer (DEMO COMPLETE / emph sentence / credit + fitted-fact register / ORRERY
dial aimed at KEEP PLAYING) — deliberately left as-is; the only absent row was Best Crucible
chain, correctly skipped when no crucible meta persists in the isolated store.

Perf info for the perf agent (SwiftShader-relative, consistent with prior census): the heavy
legs are crucible-rounds (2497/3775 frames >100 ms) and adv-upgrade (519/2399) — one-time
program-compile amplification, not steady state. adv-job/adv-paid/title legs run clean.

**D65 — FIXED: Clips empty state doubled its hint, and media overlays could stack.** `buildContent`
wrote `summary.detail` into the header AND the `clips-readout` paragraph — the same duplicate-hint
defect as D62 (replay). `577612803` hides the readout until clips exist (then it reports Ready /
Exported …). Pause now also closes the sibling media overlay before opening Replay or Clips —
previously a stacked pair could leave replay's header/words bleeding through clips' empty state.

**D64 — FIXED: physics-lab flight rack painted over the HUD instruments.** `showFlightToy`
pinned the controls host `left:16px; bottom:16px` — dead on top of the speed readout, hull
ring, and hull/shield/armor/heat stack, while HULL CRITICAL flashes (c04b frame). `ad67e039b`
pins it bottom-center over the empty strip between the two dial clusters.

## Run 16 — e05 verb-walk completion (12/12 verbs)

Screens re-run after uncapping the e05 walk: all 12 pause verbs now exercised — Load clicks
through the "Open load screen?" confirm onto the real saveLoad screen, Clips opens its overlay
inside pause, Sandbox (dev build) mounts. The run surfaced D65 (clips readout double-hint +
overlay stacking), fixed same-run at `577612803`. 36 beats, 0 residual defects.

## Run 17 — post-D65 verification @ 46dbf8a41

Screens route re-run on the fix HEAD: 36 beats, 18 observations, 0 console errors, 0 shader errors.
e05 walked all 12 pause verbs again (Load→confirm→saveLoad, Clips→clean overlay frame post-dedupe,
Sandbox→dev screen). D65 confirmed fixed in the captured frame: single hint line, readout "Ready"
only when clips exist.

## Probe defect found + fixed — combat route never reached the real crucible

Reviewing c02's frame showed pause-over-practice-lab, not crucible flight: c01b's "Practice room"
verb launches into live sandbox flight, whose only exit is Esc→pause→Main Menu (a real-player path,
not a probe defect). The probe's single-Esc "back out" left the run paused in the lab; every combat
beat after c01b (fight, deathwatch, death) ran against the Training Derelict instead of a real
crucible wave. Fixed in `46dbf8a41` — c01b now settles back to the door through the real exit chain
and rough-edges if it can't. r18 re-run verifies the real crucible is reached again.

## Run 18/19 — combat route repaired, real crucible + D64 verified @ 73d39e742

r18 caught a residual race in the first fix: backToDoor accepted `screen=crucible` while
`mode=loading`, so the practice launch still dropped the run into the lab after the settle
returned (c02 verb=null again). `73d39e742` waits for the launch to resolve post-click and
requires `screen=crucible && mode=menu` before returning.

r19: 7 beats, 0 observations. The route now plays the real crucible loop end-to-end —
door → Quick play → RICOCHET FOUNDRY round 1 (15 hostiles) → real death → `crucibleResults`
("RUN OVER" + kill narrative + hit-side hull diagram + share/ghost codes + same-seed
emphasized retry) → Main menu. The c01b practice-room frame also verifies the D64 fix live:
the lab rack sits bottom-center, clear of the hull/speed cluster.

## Run 20 — demo-path re-run on fix HEAD (harness timeout, not a game defect)

All played steps OK — title → crucible launch → round 1 (real fight, died at sim≈105s,
hull 68→0 under swarm fire) → results → belt → job accept → travel → paid. The run died at
`adv-upgrade` when the probe's own `timeout 1200` killed the browser mid-step — crucible
survival took 666.7 s this run (longer fight than r15), pushing the total past the cap.
Every game step that ran was clean. Re-run as r21 with the cap raised to 2400 s.

## Run 21 — demo-path: `adv-upgrade` timed out → probe defect found + fixed

r21 cleared title → crucible → results → belt → job → problem-leg → paid, then failed at
`adv-upgrade`: `never reached station_helios` after 362 s. Reading `travelTo` showed the
cause was harness-side: it engages autopilot once at leg start and never re-engages on a
drop (manual input, lost target, shelter undock) — unlike `playtest.mjs travelToStation`,
which re-engages each poll. A dropped autopilot mid-leg coasts to a stop and burns the
whole deadline. Fixed `c525cd2c0` (re-engage guard + last-distance/encounter counters in
the timeout error, `81fe334bc`). r22 verifies.

## Next runs

- r22 in flight: demo-path with the autopilot re-engage guard.
- Adventure real-death → recovery-berth (insurance-carrying save) if a fixtured state lands.
- crucibleDraft / crucibleRefit / motionAsk audited via ui-bench stills (r18/19 section) —
  all composed and clean; no live probe path exists (a probe cannot legitimately win a
  crucible round, and motionAsk only mounts on a true first boot).
