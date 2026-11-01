<!-- LIFETIME: STABLE -->
# Lane 3 — THE WORLD, THE GLASS & THE HOUSE (medium complexity)

**Written only by Lane 3.** Other lanes append one line to *Inbox* and nothing else.
Program law: [`README.md`](./README.md). Commands: [`TOOLS.md`](./TOOLS.md). Prompt: [`PROMPT_LANE_3.md`](./PROMPT_LANE_3.md).

**The outcome:** Adventure is mentally stimulating — a first hour a stranger finishes, an economy
you can play, a story with faces and voices that builds to an ending, a world where you arrived in
the middle of everyone's day — every 2D screen and the HUD is one finished instrument (ORRERY), the
game sounds like itself, and the repository is cut back to what an agent can read in one sitting.
Status words: `OPEN`, `ACTIVE`, `LANDED <sha>`, `SKIPPED (<reason>)`.

## Claimed paths (beyond README §3)

## Inbox (other lanes append one line: date, lane, path, what/why)

- 2026-10-31 integration: Asteroid narrow-desktop machine keys move into a 46px two-column right rail, clear of the guide and rig in the opened 390×844 fixture. Async Rover/terrain continuations now honor teardown and generation ownership before reporting failures or publishing readiness; production-callback tests and the reset walk report no cancellation errors. The public PQ-024 actor now waits on the existing renderer readiness API within its original bound and captures the ready view. That route has not run; Rover/terrain appearance remains unknown.

- 2026-10-31 integration: the ordinary M8 run exposed an active-receipt `captionSlot` scope error in the new flight-caption allocator. Its shared slot/bands now exist in the receipt branch; the actual production-function test covers visible/hidden captions and external quotes, and the HUD suite passes 21/21. Public receipt/soak re-verification remains required; the earlier fixture pass did not cover this branch.

- 2026-10-31 integration: airlock graffiti now stays in the station narrative tape through its fade and shares the HUD's existing safe-band allocator during flight. The connected HUD/Comms fixture keeps the quote clear of ordinary captions and drive controls, including during opening-instruction suppression; eight focused cases pass. Docked and flight captures were opened. This is scoped fixture evidence, not natural-docking or performance acceptance. The bench now exposes its existing HUD and bus so these checks use the real shared owners.

- 2026-10-31 integration: Station Standard connects the head, Market and Bar; Shipworks fixes its rack-button styling and uses a readable scrolling instrument at 960×540, with seven slot targets, a working fitting chooser, and reachable Range/Record/Paint controls. Relevant real-module fixture captures were opened; this is not ordinary-route acceptance. The frontend guidance, handoff, review briefs and UI front door retire conflicting numeric gates and blanket border/table/type recipes while retaining useful UX and accessibility guidance. Current details are in `INTEGRATION_COVERAGE.md`; other screens are not implicitly migrated or accepted.

## Defects (this lane's share of the demo defect ledger — delete a row in the commit that fixes it)

| # | What a stranger sees | Where | Next step |
|---|---|---|---|
| ~~D261~~ | Phone 390 flight HUD: TOP SPEED crosses the hull-ring text; crescent/lock instruments collide | `node scripts/ui-bench.mjs --phone`; speed/travel HUD owners | packet G1 — **DONE**: dock cue f0b6d842 + bench #alerts host ad732f2e + legend plate widened so HULL/SHIELD/ARMOR read whole on the phone shot (d108db76, verified on the PNG) |
| ~~D222~~ | CI `static (2)` red: UI budget digest drifted (333 files) | `scripts/check-ui-budgets.mjs`, `test/ui-frame-references/budgets.json` | packet G1 — **DONE `d59a80207513`**: full headed recapture, 38 surfaces + 2 named gaps, digest rebound, `check:ui:budgets` PASS. Caveat: frame costs are contention-inflated (capture ran beside the first-hour playthrough); a quiet recapture is the follow-up, grammar debt stays named |
| ~~D267~~ | Flight HUD projection-count + G-LOC vignette reds | `test/hud-contact-roster-visibility.test.mjs`, `test/inst-05-resting-flight-sheet.test.mjs` | **DONE** — roster tests green on current master; G-LOC red was a brittle pin vs the fade-out timer: `'block'` reordered ahead of the timer-cancel, zero behavior change (`e8a50c236d4`, 10/10 green) |
| D-new | Shipworks Buy-mode left rail: the for-sale list prints over the current-hull spec block ("FLEET · FOR SALE" collides with "473 TOP SPEED") — **verified fixed in working tree 2026-10-30**: the foreign impound-desk wiring (+115 lines, still uncommitted) re-seated the rail; both `station-shipworks` and `station-shipworks-impound` measure clean and read correctly on the PNGs. Re-verify once their edit lands | `src/ui/station/screens/shipworks.js` | packet G2 |

## Landed reviews (resolve material findings under Finish README §5.3)

R-8962e68 (ORRERY sweep, 45 surfaces), R-d1a68ec (faction_understory), R-26f29b7 (physical Adventure
encounters / Vesta carrier-loss recovery), R-710f1e1 (faction_verge), R-d0891f7 (Helios buoy / Vesta
chute accounting), R-cc96d0c (rookBooth salvage market), R-3a9d5dc (moralMemory). When Lane 2's
R-36df771 is also gone, archive `LANDED_REVIEW.md` (ruling 3) and remove the review step from the
docs that describe it.

Batch verdicts in (`.devshots/finish/lane3/batch-{a,b,c}/RECEIPT.md`):
- batch-b: **d1a68ec VERIFIED** (row deleted); **710f1e1 DEFECT** — warden return-to-post dies on
  sector unload (return target lives only on the live entity); fix implementer running
  (`fix-verge-return` packet).
- batch-c: **26f29b7 VERIFIED** (Vesta ledger conserved, 30/30); **d0891f7 VERIFIED** (winch
  exception scoped, 17/17+30/30); **cc96d0c VERIFIED** (rookBooth writers all in-band, 24/24);
  all three rows deleted. **3a9d5dc FIXED 0376013b331** — `moralMemorySystem` registered in
  both production order tables + calendar clock (self-gates 30 s); production-runtime tick
  proof escalates a vengeful debt with `moralMemory:escalated` on the bus. Row deleted.
  **710f1e1 FIXED 6b470a4eb45** — bounded `v.returns` ledger in `state.verge` rides the
  vergeCourt slot; repro test proves a sector-unloaded warden re-claims and walks home. Row deleted.
- **R-c1225fa — DONE.** Every surface verified on real shots: bar rail clean at 1300px/800px;
  market SOLD OUT via new `?soldout=` fixture (hero + row + disabled BUY with honest reason);
  Ctrl+K palette verified via `?cmdk=1` real-keystroke fixture (Unfold layer, etched ladder,
  underline focus, key hints); SAVE FIT wears the amber Lamp Key; FIND A SERVICE flattened to a
  caps word. One real defect found + **fixed `3e37b0b6d1d`**: at ≤880px the hold arc sat beside
  the total in a 2-col grid, so "Unavailable" crushed "HOLD 1 / 40 u" into clipped fragments —
  now spans the row under the total; sold-out + in-stock PNGs and a 24-control walk verified.
- **8962e68 ORRERY row — surveyed** (batch-a2 RECEIPT.md): 23 title findings are the designed
  first-light modal (FP); REAL = shipworks receipt-over-verbs + delta off-1920 edge, crucible-door
  tile sliver, comms+wingman radial crest svg overflow (helix x≈-3); LIKELY-FP = tech-tree
  con-lens crop, ship row-names (needs 1 PNG), power-rail floattext, chart rail-sum; NOT-A-BUG =
  orr-spot under-words authored spotlight, gm-level sr-only carrier, tabscale underlay.
  8 partials reconstructed: crucible-lab, photo-mode, manifest, demoEnd, localmap-legacy,
  starmap-legacy, resultsSheet, shareCode. Worst-five pixel queue: shipworks → crucible-door →
  wingman-radial → comms-radial → ship — **all five verified clean on 2026-10-30 PNGs**
  (shipworks incl. impound variant, no tile sliver, no crest overflow, ship callouts whole).
  Harness defect found: dock fixture opens only ONE
  dock-tree surface per boot — 7 surfaces (station-dock/market/industry/contracts/factions,
  asteroid-works, base) silently unmeasured; needs fixture fix (Lane 2/G).
  batch-a1 CLOSED: crest/morph clips were a clipped-column root cause — the hail panel re-seated
  to `#ui-root` as a fixed overlay (+pointer-events repair) in `861c37f0746`; host-scrim
  full-viewport blur killed `fb38a31448b`; crucible-door + credits items machine-verified NOT
  real (phantom closed-details rect / authored spotlight). Flagged to G5: `#sf-why-tip`,
  `#sf-confirm-root`, `.sf-drawer--entity` still carry flight-time blurs. Dead CSS:
  `hudStyles.js:1254` commtape panel rule.
- **Law/heat review landed** (`review-lawsec-b`, 8/10): 6 defects fixed `5702b742378` — impound
  softlock on destroyed yard/lock (durable-bill repost + marker-flag id-recycle guards), dead
  pay clerk re-staffs on cadence, cross-sector repost coord guard, warm-deserialize stale
  fixtures dropped, heat residue no longer zeroed per tick, NaN heat normalized. Flagged:
  `custodyConsequences.openImpoundBill` never adopts `payload.sectorId` on repost (one-line,
  next packet); `lawSecurity.js` 8.5k-line split proposal recorded for G-wave.
- **Save write-lane review landed** (`review-save-a`, 7.5/10): no silent non-saves, no torn byte
  writes, all ~105 envelope keys have restore consumers. Real drift in the three parallel write
  lanes: D1 every autosave pays a whole-corpus shared-store push (no mirrorPatch), D2 no-worker
  fallback skips recovery rotation over gzipped previous, D3-D7 smaller. Fix packet
  `fix-save-writelane` launched. D8-D10 design flags deferred to the Wave G4 split.
- Localization debt (nearby flags, W3 material): hard-coded player strings in
  `faction_understory.js` (:1069,:1134,:1154,:1735-1906), `faction_verge.js` (:137-161 via _log
  :534), `vestaWinnowRecovery.js` (:98-104,159,342,552-553), `starterWorkday.js` (:9-22),
  `rookBooth.js` (:401-429), `moralMemory.js` (:423-436,913-997,1185-1195).
- System deep-reviews (`.devshots/finish/lane3/review-*/REVIEW.md`): save-b READ path scored
  8/10 — its HIGH defect landed as **fd7b2bd6a60** (importFile's FileReader.onerror now
  re-checks the restore sequence before emitting `save:error`; the rest of the async lanes
  were already guarded by in-flight work; 4/4 race test + save-fuzz 5000 clean). Two mediums
  flagged: gzip slot preview inventing ship facts (needs the saveLoad.js call site to honor
  `meta.gz` — src/ui, ours, packet it in Wave G), index-cache trusting `_blobHash` (tractable
  in-file — add integrity sniff in a later save pass). lawsec-a: missing-method defect absent
  (already fixed); chain review continuing. lawsec-b + save-a moved to Claude reviewers after
  repeated codex context-wall deaths. **save-a REVIEWED 7.5/10** — write path heavily defended,
  check:save-schema green; mediums → G4 split packet: hot autosave lane bypasses the delta
  mirror (O(all-save-bytes) per autosave), no-worker commit fallback drops the gzip retry,
  worker-encode byte-order drift vs sync lane, dirty journal is write-only (kind>>>0 coerces
  string kinds to 0). No data-loss serialize pairs; real asymmetries: capitalBoss
  serialize↔restore, provenanceLedger/chronicler name-mapping, unvalidated encounterDirector
  restore.

## The ordered packets

### H0 — The first razor cut (do first, so every lane navigates a smaller repo)
**LANDED a054f36530a (2026-10-28).** 2,820 files moved via `git mv` into `design/archive/` +
`docs/archive/` (dated run folders, finish-expansion pack, roadmap receipts/evidence/retired/sprint
docs minus the live keepers `README`/`00_EXECUTION_PROTOCOL`/`program-queue.json`/`active/`/
`receipts/playtests/`, ~59 PERF_* folded into `design/perf/README.md`, superseded frontend direction,
docs/ui-polish+perf-evidence+handoffs). 1,470+ kept-file refs rewritten to archive paths incl.
`program-queue.json`; banners on `design/program/README.md`, `build_map.md` (pre-existing) and
DEMO_READINESS §6. **design+docs markdown outside archive/vm-drop: 3,662 → 951.** Checks green:
check-program-docs PASS, check-plan-integrity PASS, check-inference-control PASS.
Deferred to H1: `design/inference-workflows/` (pinned by check-inference-control until the new
INFERENCE law exists), `docs/worldbuilding` (live data readers), program root `*.md` control
surface, `design/program/{jules,atlas,special-500,starter-integration,lab,receipts}` (live-script
readers/provenance, tiny). Judgment calls recorded: `attention/` (179 md), `player-truth/` (108),
`experience/` (54), `demo-prep-2026-10-27` (9) archived as obviously dated beyond the §7 list —
needed to reach the count; all recoverable under `design/archive/program/`.

### W0 — Green the world floor
D265 and D266 (above). Done when both tests are green on seed 4242.
- **D265 DONE 1406c221a39** — the salvor already flew a real job; the red was a committed
  duplicate import making `test/lived-frontier-pockets.test.mjs` a SyntaxError. 28/28 green.
- **D266 in review** — root cause was the harness, not the game: `bootSim` wiped the
  auto-installed `campaign47a:` cold-start contract and the prospector never docked at the sell
  station, so beat 0's mine→skim→dock could never settle. Fix preserves campaign-tagged
  missions (no `nextId` reset) and emits dock:docked/undocked on the sell leg like a live pilot.
  Miner now banks 14 RP @90m; test todo→real 6 RP assertion. 13/13 cohort tests green.
- Found while at it, FIXED: `test/story-spine-memory.test.mjs` + `test/pq-178-03-ledger.test.mjs`
  red on master — legacy whole-beat fills stamped receipts with the current book list's last
  stepId (which never ran) and the ledger trusted stepId over the receipt's own signal. Fix in
  `campaignTransitions.js` (LEGACY_FILL_STEP_ID knock/pull/tow) + `storyLedger.js` (authored
  clause final only when signal ∈ step.accept). 22/22 + regression suites green.
  Follow-up row (foreign/adjacent, not this fix): `w534-books-3-4` (11), `fb-spine-back-half` (2),
  `story-spine-route` (2) fail at `campaign47a:b1:infested` materialization — investigate whether
  master-red or another lane's in-flight dirty `src/ai`, `weapons`, `salvageTender` work.
- Pipeline live: audit split wrote 303 packets (669k lines); wave 1 = 8 packets done,
  wave 2 = 209-packet queue on 8 window-free launchers (4 Grok + 4 Gemini, direct-node, real-user
  env). Codex reviews running under `codex-auto-review` (the only model this client accepts on
  ChatGPT auth — the `gpt-*` slugs demand a newer CLI): day-one batch (7 rows), saveSystem,
  lawSecurity/heat.

### Wave W1 — the first hour is gold (M1)
Rows are the spec (`build_map.md` §31–§32; read each row's prose before briefing):
- **Row 457 RC-FIRST-MINUTES — DONE** (cc56ac32122 + 9beb18845a8). Verified per item: F8/NumLock
  rail labels + both in Help sheet + lessons (clean); threat markers yield to instruments via
  reservedRects + 8-pass slide (clean); in-world names fixed (Fleeing Raider masks trainer reg,
  Bright Seam, Range Drone); visual:false lines captioned (trackerCaptionId path, clean); wu/wu/s
  in range + tender copy fixed. 14/14 + 21/21 pinned suites green; 3 onboarding-suite fails traced
  to foreign dirty `src/core/*`/`weapons.js` — watch, not ours.
- **Row 473 RC-FRONT-DOOR — DONE** (UI scope). Verified end-to-end on the real route: mm:ss clock,
  destination slate names the resumed sector ("Continue · Helios Reach"), first-light preset +
  once-only regression test (rc-473 5/5), settings density readouts, empty slot says empty once.
  Title-interactive timing is **16.5–17.4 s clean / ~26–42 s loaded on SwiftShader vs 10 s —
  entirely inside Lane 1's boot/render pipeline** (media hold → main.js eval/boot → serial shader
  admission); filed to Lane 1 Inbox with the file:line tape. Also repaired stale
  check-player-facing-labels (pins the shared commodityDisplayName helper).
- **Row 429 AL-HUD-1 — DONE.** Bench-verified at 1280×720 + 1920×1080 with `--walk`: no internal
  ids reach the screen (sector-law attacker id + radar label glue + wreck weak-point fixed;
  targetDisplayName path everywhere else); Overhead/Circuits tape no longer overlaps the target
  card (compact tape was fixed-positioned inside contain:layout dock — now static flow);
  shipworks clean both sizes; one news line during tutorial already gated. 9/9 tests incl. new
  race-tape regression. Leftover ORRERY list: expanded radar occludes target card at 1080p
  (modal-intent? flag), shipworks sale-list 4th row clips at 720p edge, Ctrl+K modal keeps
  centre hits unreachable (intended?), waypoint label carries fixture distance (cosmetic).
  Foreign `hud-contact-roster-visibility` still 2-red (projection-count contract — Lane 2's).
- **Row 479 RC-SCREENS-TRUE — DONE** (31bb0dbb20a). All seven §32.7 items bench-verified:
  real 47-A terms in mission log, tab-rail padding, populated game-over bench + CAUSE
  UNRECORDED fallback, TRACKING goal on the map strip, race-board key help as a verb chip,
  Voice live-mix ring in source, factions scroll+fade, ledger fold fade. Flags: settings
  bench shot hangs >280s (harness issue, Lane 1/G); 2 stale test assertions at HEAD
  (racingMap 2-polyline design, station-orbital ensureStylesheet) — Lane 2 Inbox.
- **Row 459 RC-VIGNETTES — DONE.** Most of the spec was already landed (generator recipe,
  charge/await verbs, first-hour prop preference). The live defect: two ambient scenes carried
  `livedRotation` and deadlocked `pickLivedVignette` — seeded 2h route stalled at 2/30 scenes.
  Generator retags them; rotation is exactly 30 curated; regeneration synced 3 stale modules
  (keepMotion). Acceptance green: 30 once-ever scenes, zero repeated lines, byte-identical
  replay, real massline tow, save round-trip. Adjacent fix: `deferDuringGuidedOnboarding`
  had zero enforcement in requestAuthoredEncounter (onboarding-opportunity-admission red at
  HEAD) — gated, force included. 15/15 acceptance + 94/94 + 40/40 neighbors.
- **Row 553 ATT-E01** — onboarding rail texture, tier-0 life, ambient traffic.
- ~~Row 546 W-TEACH~~ — **DONE `511b8555b52`.** flownBefore plumbs game:new→boot→pace→serialize and
  genuinely skips stick drills + power ladder + first-flight card while the rail stays; situation
  lines honor the rail's silence gate (stroke no longer starved). 21/21 + rc-458 12/12.
- **Row 454 GOLD-M1** — the integration pass: play the first hour on the real route, fix until every first-hour system is gold or names its missing file.
  **Run 1 (stranger s4242 1h, `.devshots/actual-game/stranger-seed4242-1h.json`):** clean sim
  (216k ticks, no death/freeze/wrap) and the rail engaged — attach +1 s, five powerSituation
  lessons, momentumKill `throw` +513 s, wantedBeat `reportDenied` +518 s (the designed
  no-wall path), 45 tutorial lines, 13 milestones, 8 verbs, 4 pursuits resolved, 3 kills,
  heat peak 0.1425. **But docks/sales/missions = 0:** the rescue `grab` beat never
  completed, and the gate chain (grab gates seam; the missing-three rail — never started,
  `firsthour:started` absent — also holds seam via the `|| 'seam'` fallback) kept
  seam→dock→choice unreachable. Mechanism: scripted-pilot choreography under emergent
  physics (191 broken lines, 623 latch denials). **Pilot recovery `4f1816bb7d3c`:** the
  extracted twin's evolved mechanics (drift-reel winch, orbit-side sweep, press-onto-ring
  grab, direct-away burns) ported into the harness copy — rc-458 lands momentumKill at
  135 s (was 513 s). Run 2 launched on the ported pilot; verdict follows its ledger.
  **Run 2/3 stall diagnosed + fixed `ab676eaa96d9`:** the run reached beat 6 (`focus`, "Hold
  course. Let the raider cross your bow.") and parked ~1 000 sim-s. Live probe evidence: the
  flyby census armed leases repeatedly, but on *other* entities (a surviving hostile wing and
  traffic ships won `beatsBest` on the `direct` tiebreak) — `p.targetId === _trainerId` almost
  never matched, and a missed/spent authored pass never restaged (respawn only fires on a
  *lost* actor). Two production defects + one pilot defect, all fixed: (a) `_resolveProximityDone`
  now restages the authored pass once it stops closing or slows below arming speed — retry,
  never a wall, same contract as the seam rock; (b) a flagged training target outranks
  `direct` in `beatsBest`, so a stray hostile in the pocket can no longer starve the staged
  lesson (flagged trainers exist only during onboarding — normal targeting unchanged);
  (c) the pilot now holds course with a cold stick instead of burning at the trainer on boost
  through the crossing window the census refuses. In-process replay (`createAuthoritativeRuntime`
  + production profile) reaches focus → trainer lease `match=true` → beat done → burst at
  ~265 s. Focused tests pin both contracts (11/11 flight-drill + flyby-focus green). Run 4
  launched with a `flybyFocus:start` target-vs-trainer tap for the authoritative verdict.
  **Run 4 named the third wall, fixed `0b2e6d40a187`:** the pilot reached focus towing the
  claimed salvage — the authored "take it anyway" path delivers a tethered player to beat 6 —
  and every census returned early on `player.tether.active` (zero flyby events for the rest of
  the run). While a line is out, acquisition isn't running, so a lease's latch bias is inert:
  only the flagged trainer may now lease while tethered; refused hostiles stay refused.
  **Run 5 evidence:** `flybyFocus:start` on the trainer `match=true` at t=308 while
  tethered — beat done, rail advanced to `burst`. The hour continues: burst → disengage →
  seam → dock → choice, with the rescue `shove` stage live alongside.
  **Runs 16–37 — the "freeze" cracked, and it was never a freeze:** every prior stall at
  t≈273 was the *player dying* during beat 2 (claimed salvage) — `pilot.step` early-returns
  on `!alive`, so the trace went silent while the world kept simulating the full hour at
  full CPU (heartbeat instrumentation proved ticks/simTime advancing, `alive=false hull=0`).
  Real defects found and fixed in order: (a) the harness respawn binder listened on
  `entity:killed`, which `beginPlayerDefeat` never emits for the player — now drives the
  after-action `combat.recoverPendingPlayer()` contract on `player:death`
  (`c7dbf4d3`); (b) the rescue beacon was a mass-1 dynamic body — any contact punted the
  finish line off forever — pinned `dynamic:false` (`647d720a`); (c) the *fixed* beacon
  then inherited `entity.radius=60` as solid collider, making pod-inside-60 physically
  impossible — small solid core `radius:6` keeps it pinned while the ring stays open
  space; grab completed in run 33 (`c3bdb432`); (d) the delivered pod's line anchored the
  hull at v=0 through "Boost. Keep the speed." — boost stage cuts the tow first; (e) the
  boost beat completes on the *verb* (`input.boost` held), not arrival — the pilot was
  parking at the just-delivered beacon waypoint — it now holds boost on a long heading;
  (f) `FIELD_FLAGS` was never set by the harness (defaults off for Tier-B goldens) — the
  fields system was a strict no-op so well/repulsor/cone could never fire — production
  profile now applied (`ce483d3e`); (g) the seam rock orbit: `flyTo` brake-lead at v≈62
  needs ~77wu to stop vs a ~26-radius rock — early speed bleed lands the approach inside
  scan range. Run 36 reached beat 9 `seam` at ~t=990, still flying.
  **Runs 38–43 — field-strobe, runaway rock, and the choice-berth wall:** (h) the pilot
  wrote `toggleClearingCone` every tick; the verb is a level-consumed *toggle* in
  `fields._handleInput`, so the wedge strobed and stayed on — it shoved the seam rock
  ~4 000 wu off its mark (run 38). Edge-fired once + released after the beat; (i) the
  exiled rock then exposed a worse defect: a drifting tutorial body gets shelved to its
  world record, which advances it *ballistically* — each offload cycle rematerialized it
  kilometres further away (run 39: waypoint exiled 129 → 41 416 wu while the ship trailed
  at 15 wu/s, an unbounded chase = a real first-hour wall). Pinned the spawned training
  rock `dynamic:false` — same "finish line must not be punt-able" ruling as the rescue
  beacon — and pinned the spec in the drill test (`812a5b21`, 7/7 + 23/23 green); (j) the
  docked block sold, repaired and undocked without reading the board — the choice beat
  completes on `mission:accepted` and its marker flips to the mission's foreign diamond,
  so the pick branch under the `wp.onboarding` gate never ran (run 40: 260+ sim-s parked).
  Work is now taken at the berth before casting off, the dock/choice beats run on the
  beat line regardless of waypoint ownership, the `sold` followup line resolves to the
  board, the board's offer list is read as `slots` (not `offers`), `services.acceptMission`
  goes through the booted missions instance so a refusal retries the next offer, sealed
  manifest freight is never sold mid-route, and after `_finish()` the pilot flies the
  accepted contract's docked-delivery leg instead of re-docking the same station forever.
  **Run 5 named the rescue-wall defect (fixed, commit follows probe):** the run parked at
  `resc=shove` ("Put the scout into the asteroid") for ~800 sim-s. Live cast dump: the scout
  is a *fleeing* drone and the escape predicate measured only scout→pilot distance — a chased
  scout stays in the pilot's envelope while the pair drifts kilometres off the wall's line:
  no escape fires, no fail, and the push can never arrive. Earlier in the same window the
  fail/restage pair could also churn (~3 `scout escaped` fails/s) whenever the standing wall
  itself sat beyond the pilot's reach, because a respawned scout re-anchors on the far wall's
  line and lands out of reach again — the same loop the missing-piece comment already warns
  about. Production fix: all three rescue drift branches (swing rock >1800, shove scout
  escape, grab pod >3000) now restage the whole tableau near the pilot when the *standing
  anchor* is also out of reach (quiet — a carried-away pocket is not a charged miss), and the
  shove escape check anchors to the wall as well as the pilot so a runaway chase is a spent
  tableau, not an invisible wall. Pilot fix: the shove branch now uses the taught verb —
  latch the scout (it cannot run tethered), winch tight, burn at the wall, cut when it flies
  true — instead of tail-chasing a fleeing drone and firing. Regression test pins the
  whole-tableau restage, the charged single-fail retry on a near wall, and the wall-anchor
  runaway case (7/7 flight-drill green). Commit `f1060d81d347`.
  **Probe verdict (in-process, seed 4242):** intercept latch `target=612→614:drone/scout` at
  t=278-280 (first press caught an ambient drone, retried onto the marked body), tethered
  tow dragged the scout through the wall zone — `shove:complete fails=0` at t=286, ~8 s
  after latch. Rail advanced `disengage` → `resc=grab` at t=296 → pod latch t=316. Named
  the next defect on the same probe: the beacon run boosted onto the ring at ~190 wu/s —
  the turn circle misses the 60-radius ring by 40+ every pass (dBeacon oscillates 75→105,
  never <60). Pilot fix `ac61e3597d69`: bleed the final leg until the aim line actually
  crosses the ring. Run 6 launched on the full fix set.
  **Beacon delivery saga (runs 7–15, seed 4242):** four pursuit/guidance schemes parked in
  stable circles off the ring (dB 111–420). Root cause named: nose-at-beacon is radial
  thrust — centripetal force only — and cannot remove tangential velocity; plus the
  mass-1 dynamic beacon got punted by field impulse/ambient traffic and coasted off at
  ~30–150 wu/s (probe beacon:live@74→919 receding). Two fixes: the beacon is now a fixed
  body (`physicsBody.dynamic:false`, gate-pinned in rescue-opening test — a real player
  watches the finish line hold still too), and the pilot brakes a circling approach
  dead via closing-rate detection then *ratchets*: park, let the winched pod glide
  ~line-length forward of the hull, bite closer, park again — the pod only needs to
  graze the 60-ring with the line held. Commits `0e883dec`→`35332cd5`, `647d720a`.
  **Runs 44–83 — the Furnace Detail gauntlet (seed 4242, actual-game harness):** the
  campaign's Book-1 worksite (mites + CR-FEED disposal pods) produced the deepest wedge
  chain of the route, each layer exposing the next: (a) `furnaceIntake` and `bombs`
  were missing from the harness registry — production-manifest systems, so the mouth
  ring could never eat pods headless (parity gap, registered in manifest order);
  (b) mites are `collides:false` fauna — projectile sweeps skip them; only blast
  damage lands, so the waypoint's own "buy frag at Tethys" resupply line is real
  gameplay, not flavor (mite-phase drop-and-veer: lead the drop by the 6 s fuze,
  sprint 110+ out, 30 dmg/blast vs 60-hull mites — one blast caught the nested
  cluster); (c) `payload` bodies are weapon-immune — the authored verb is towing
  each pod through the CR-FEED lip (`furnaceIntake` eats any edible body inside 90);
  (d) three pursuit walls in a row — `flyTo`'s turn-radius brake parked at a stable
  d≈215/v≈43 equilibrium on a drifting pod, then a 320-wu two-branch limit cycle,
  then a *saturating* intercept lead (`min(d/60,30)`) that aimed 3600 wu past the
  pod forever — the lead is now intercept time `d/max(v,80)`; (e) the Furnace
  ledger now owns navigation while any lot is unresolved — in run 77 a second
  contract's route dragged a tethered pod through three gate jumps at 9000 wu/s;
  no tethered body ever rides a gate now (`cmd.cut` before every jump request);
  (f) pods blast-punted across the Voronoi cell line can't be fed or frag-killed
  (220 hull vs 30-dmg frags) — the line crosses cell boundaries without a gate, so
  the recovery is latching the stray in its own cell and hauling it home; checking
  the tow before the hop check keeps the lead-crossing ship from cutting its own
  line at every boundary; (g) broke/poor legs: a credits-refused charge parks a
  gate route forever — `noGateFunds` walks the contiguous cell map instead, and a
  `low_fuel` abort berths at the sector's refuel station; (h) aiming AT a
  foreign-cell target parks at the arrive band on the near side of the cell line —
  every fallback flight aims 400 wu past the mark; (i) multi-hop routing: the
  cross-sector leg plots `world:requestRoute` and jumps the NEXT leg only —
  requesting a two-hop destination directly aborts `not_a_neighbor` (run 75:
  station_expanse, 21k parked aborts); (j) engage targeting: nearest-needed over
  the waypoint pin (a contract's `targetEntityIds` lists every live mark — run 83
  chased the pinned wasp's 16 km retreat while two sat at the site), and the
  45–60 wu/s small-body band is close-pursuit only, past ~900 wu it runs down.
  **Run 83 evidence:** mites 4/4 by frag blasts; pod #1645 fed in Ceres; pod #1690
  hauled Vesta Forge→Ceres and fed; pod #1586 hauled Tethys Junction→Helios→Ceres
  and fed at t=1346; `m_4` settled, story advanced to "Tethys board — Cinder
  marks", m_5 (b2:cinder) accepted and the ship gate-hopped Tethys→Vesta→Charon
  Expanse cleanly. Every Furnace lot resolved `received`, zero lost.
  **Runs 85–93 — the Cinder Wasp delivery chain (seed 4242, actual-game harness):**
  m_5's authored third act (3 wasps → marked evidence hull → Rook's pad) produced
  a four-layer wedge chain, each layer one owned fix: (a) **egress lifecycle
  defect** — `stepEgressExits` silently retired fleeing ships 960+ WU out with no
  `entity:killed`, so wasp #5929 escaped the worksite, died invisibly, and the
  contract parked at 2/3 forever (`cinderIssuedSlots` blocked respawn); mission-
  owned bodies are now exempt from the egress bound — the mirror of
  `_handoffFleeingTarget`, which strips pinning only on settlement — with 12/12
  focused tests green; run 85 hunted the same wasp from d=7287 to kill and the
  route reached 3/3; (b) **invulnerable marked hull** — the evidence wreck pins
  at hull 1 under sustained fire by design; the authored path is tether→pad→
  hold, not kill; (c) **harness production-parity gap** — `rookBooth` was
  registered in `registry.js` (immediately before `kesslerScale`) but missing
  from the harness system list, so the offer/dwell/`_closeSale` receipt chain
  could never run headless; registered at production order and `coreSystem`
  supplies `helpers.removeEntity` normally; (d) **tether-event contract drift**
  — the pilot listened for historical `tether:attached`/`tether:broken` while
  `tetherGameplay` emits `tether:latched`/`tether:broke`, leaving `lineAttached`/
  `latchedId` dead; fixed to listen for the live names with owner (`sourceId`/
  `actorId` vs `state.playerId`) and flail guards, plus the sticky
  `tetherMode:'nearest'` from pod-phase pulses was cleared to the scored
  `aimWorld`/`aimIntentActive` path so the receipt selects the marked hull by id
  (`previewMatched:true`), not the nearest companion shard; (e) **target
  re-selection instability** — `entityList.find(markedHull)` could rename the
  target between ticks (three marked wrecks), so a "wrong body" guard cut the
  correct line 300+ times; the leg now prefers the latched hull and otherwise
  picks the nearest marked wreck deterministically.
  **Run 93 evidence:** scored latch on marked hull #15827, towed hull→pad
  2294→68 inside the ring at shipV≤6, booth offer/dwell/`_closeSale` consumed
  the body (`entity_destroyed` + `rookWreck:delivered`), `m_5` settled
  (`missions=none`), and the story advanced to "Compost Run — Rookside
  Receiving" at t=1638 with the ship already en route.
  **Runs 93–104 — the post-sale `world.step` `unreachable` trap (deterministic,
  seed 4242):** every run that cleared the sale panicked ~2 s later inside
  Rapier stepping (runs 93/94/98/100/103; tick ≈98058). Call-site probes named
  `world.step` itself while joint/collider/parent/record validity sweeps stayed
  clean — not a stale handle. The burst dump at the fatal step showed 3 074
  records: **3 002 identical `ship_kestrel` wrecks, 2 938 at one exact point**
  ((10652,29072) — the site anchor plus the coincident-spawn ladder's maximum
  64×2.5 WU escape), all `collides:true` dynamic 12-collider measured skins.
  Root cause: the M11 player-hull echo minted at `preserved_cockpit` (one
  wreck bound to the player's recorded hull loss) shelved the moment the
  player left the exit disc — the lean far row drops `hullEchoLossId`/`siteId`/
  `scanLabel`/`salvagePool`, so `tickPlayerHullEcho` re-minted a missing echo
  every tick and the shelve pass took each copy: ~1 anonymous durable twin row
  per tick for thousands of ticks, all at the authored point. The accelerating
  post-sale ship swept the unbounded promote disc over the point, minted the
  whole coincident heap in one adoption pass, and the concentric-collider
  contact set detonated the solver (the Package D class the coincident-spawn
  ladder exists to prevent — its 64-nudge cap was long exhausted). Owned fix
  in `farActorTable.js`, matching the D89/D141/D189 precedent: (a)
  `shouldVirtualizeFarActor` exempts `data.hullEchoLossId` — the echo is one
  resident owner-keyed body and never shelves, killing the mint/shelve
  factory; (b) `restoreFarActorTable` drops `isStrippedHullEchoTwin` rows
  (wreck + `persistenceOwner:'alienEcology'` + no `hullEchoLossId` — a
  signature exclusive to this factory) so pre-fix polluted saves heal at load.
  Focused regression `test/hull-echo-shelf.test.mjs` (4/4): residency
  exemption, twin signature, restore eviction, and a 40-tick
  `tickPlayerHullEcho`+`tickFarActors` loop asserting one live echo and zero
  rows. **Run 104 evidence:** at the historic fatal tick `recs=59 /
  worldBodies=192 / worldColliders=831` (pre-fix: 3 074 / 3 190 / 36 925) —
  no burst, no churn, no trap; the route crossed the whole garden/ecology
  region cleanly. Residual risk noted, not fixed: the coincident-spawn
  ladder still stacks >64 same-point bodies onto one slot if some future
  population authors them (no owned-path population approaches it now), and
  `tickFarActors`' promote loop remains unbounded. Route tail (3rd wasp hunt
  → sale → ending) continuing under the same run.
  **Runs 104–106 — two more owner-side defects on the same leg:**
  (a) the third Cinder Wasp fled at a sustained ~470 WU/s (reaction-drive
  `travelCeiling`) versus the pilot's ~302 WU/s — a required mark the player
  could never catch; the egress bound that would normally resolve the flee is
  deliberately exempt for mission-owned bodies, so the contract parked at 2/3
  forever. `observeCinderEscape` in `cinderRoute.js` now resolves a
  sustained flee + ≥960 WU separation for the egress fade window as a lane
  clearance, releases the hull to the ambient bound, and counts the escaped
  slot as hull-lost for the exhausted settlement (8/8 focused tests; egress +
  story suites green). Run 106: the third slot cleared by escape at t≈1509,
  m_5 settled, Rook sale closed, story advanced to Compost Run. (b) a second
  clone factory: aftermath wreck-field ecology re-minted its scavenger slot
  ~1/tick (~14 000 ship mint→virtualize pairs over the wasp leg). The roster
  owner binds `fieldId::slotId → entityId` and `_materializeRoster` re-mints
  whenever the bound body is absent — a shelved scavenger read as vacant, and
  the lean far row dropped `wreckFieldId`/`wreckEcologyRole`/`wreckEcology`/
  `scavengerWork`, so a promoted shell would return a stranger and unbind.
  Fixed owner-side: `leanIdentityData` preserves the ecology identity on the
  row, `_resolveEcologySlot` counts a far row carrying the field's identity
  as occupied (the body promotes back into the same slot), the scavenger
  drive loop only steers live bodies, and `_decayField` drops the shelved
  row with the slot; sector-exit keeps a shelved-backed bind so re-entry
  cannot mint a twin either. Focused regression
  `test/aftermath-ecology-shelve.test.mjs` (3/3): shelve → no twin for 30
  ticks → promote restores the same id; sector exit/re-entry round-trips the
  shelved occupant; decay leaves no tombstone row. Far-actor + ecology +
  scavenger-work suites green (55/37/69); three remaining scavenger-loop
  failures reproduce at plain HEAD — confirmed foreign, not this fix.
  **Run 107 on-route proof: the whole historical churn window (ticks
  ~96 000–150 000) minted exactly 3 scavengers, each shelved once and never
  re-minted — vs ~14 000 mint→virtualize pairs pre-fix.**
  **Runs 109–113 — the Compost leg itself needed three layers:**
  (a) harness parity: `understoryGardens` (the receiver's registered owner)
  was missing from the playthrough manifest — the b2 waypoint resolved but
  no garden entity ever spawned (`garden=none`, ship parked at the
  approach). Registered at its production position after `lootShards`;
  the harness now runs 59 systems. (b) the authored receiver only eats
  *player-fed* mass: `tether:released` stamps `lastThrowerId` on the freed
  body (the understory's own release listener), jettisoned pods carry
  `thrownBy` at spawn — so the pilot tows an edible body inside the mouth,
  cuts, and backs the hull out of the receiver's 76 WU spawn-clearance core
  until the swallow lands. Aftermath-owned wrecks are valid candidates;
  the owner's `consumeByGarden` gate refuses claimed/durable/mission
  freight on its own, and ecology inhabitants (`wreckFieldId`) stay
  excluded so a feed can't re-vacate a roster slot. (c) the Scale 4
  choreography: a wide entry crossed the pad 91 WU off-axis — `spawnD`
  never entered the jettison window, the miss bail pushed deeper into the
  rack cluster that pinned the hull, and the wedge recovery only existed
  inside the run phase (run 110: 875 s parked at v≈0). Fixed: the run aim
  now biases ~half the lateral error past the axis so the crossing lands
  at the pad, a +across miss retreats over the open corridor instead of
  deeper into the furniture side, and a sustained v<12 pin anywhere in
  the worksite rocks the hull off the prop (strafe + alternating escape
  sides) before re-staging. Route re-verification in flight as run 115.
  **Runs 116–120 — heat ledger truth on the tutorial lane:** tutorial-era
  shots on lawful, non-hostile bodies minted unprovoked-hit chips toward a
  WANTED the authored lesson never intended; `heat.js` now exempts the
  onboarding victim set (trainer, Claim-Jumper, wing) while haulers and
  set dressing still price shots, and the pilot's fire gate refuses
  lawful/non-hostile bodies outside that window (38/38 heat + 4/4 new
  focused green; zero `[heat]` lines through onboarding and both gate
  transits in run 120). Run 121 then proved the *designed* heat works: a
  genuine smuggling bust at Ceres (+0.184, restricted salvage-bay stack)
  minted WANTED — but the pilot jumping sectors froze the warrant in its
  home zone, a real soft-lock (heat only cools inside the crime sector,
  outside the search circle). Owned fix is a harness-side cooling leg:
  wanted preempts every hop, returns to the crime sector, holds beyond the
  circle until the escape clock clears (run 121: bust t=862, cleared 0 by
  t=873, disposal leg resumed). A second authored conviction followed in
  Charon — `faction hostile` +0.20 after the wasp kills dropped the faction
  below its aggro threshold — same recovery, then Rook's sale settled at
  the boundary.
  **Runs 122–123 — Compost candidate truth:** the feed leg chased a
  5 000-mass asteroid 19 000+ WU out — `asteroid` is a
  `LARGE_BRIDLE_ENDPOINT_TYPE` (fixed anchor like stations/planets), never
  towable, and `dynamic===false` bodies share the trap. Candidate
  selection now excludes anchor-type and non-dynamic bodies; run 123 found
  real wreck #5614 (mass 100), towed it in, and the garden ate it
  (`target_lost`, waypoint rolled to The Nest at t=1890). One authored
  subtlety confirmed, not changed: the receiver's site-clear core counts
  the player ship, so cut-then-back-out is the required feed.
  **Runs 124–125 — two wedges into the Nest leg:** (a) the garden's 109.6 WU
  static hull is a solid bowl — after the eat the braking ship froze 34 WU
  inside the back wall where every exit bearing deepens the contact
  (generic fix: track last position outside all static-solid envelopes;
  sustained v≈0 inside one flies back to that open point — the way in is
  the way out; gated off while tethered so the compost tow-in never fires
  it). (b) the generic waypoint handler's `arrive:200` parked 200 WU out —
  outside the Nest's 140 WU admission radius forever. The dedicated nest
  leg now stops at the approach, waits out `tickNestVisit` pacing
  (`tension_recovery` is the earned post-fight arc — run 129 waited
  t≈2100→2382 through recovery/aftermath/quiet, by design), and departs
  >3 000 WU once live.
  **Runs 126–128 — the live-encounter virtualization defect:** with
  admission fixed, the departure leg exposed the real engine bug — at
  ~2 000 WU out the far-actor table shelved and destroyed the *live* Nest
  cast (carrier 5023, doors, wasps): `the_nest` tick saw no canonical
  carrier, aborted `unresolved_nest_carrier`, deleted the live row, and
  the generic abort reason isn't a Nest outcome so no receipt ever wrote —
  the b2 visit orphaned `active` and Elroy could never post. Owned fix in
  `shouldVirtualizeFarActor`: entities bound in
  `encounterDirector.squadMembership` or stamped `data.nestEncounterId`
  never virtualize while their live encounter owns them; ordinary far
  actors still shelf (19/19 far-actors incl. the new live-cast residency
  regression). Run 128 proved the cast stays resident — and exposed one
  more authored-edge soft-lock upstream: an escaped furnace pod on a
  ballistic track faster than cruise (~183 vs ~180 WU/s) is uncatchable
  forever and nothing ever marks an escaped lot `lost`, so the worksite
  ledger could never close (run 128 chased pod #813 out to 110 000 WU and
  growing). The pilot's intercept now boosts when aligned and beyond
  ~700 WU (converged d=703→115 in 14 s in run 129).
  **Run 129 — the complete route lands, seed 4242:** clean onboarding, no
  tutorial heat; Scale 4 settled; furnace 4/4 incl. the boosted pod catch;
  Ceres smuggling bust recovered in-sector; Cinder 3/3 + marked hull →
  Rook sale; compost feed credited (`understory:playerGrowth`); Nest
  admission after the pacing hold, `the_nest` live, cast resident while
  the ship departed past the 3 000 WU escape threshold → `carrier_escapes`
  receipt (m_6 posting is the dependency proof); Elroy `6225` engaged and
  killed t≈2480 → `force` outcome → `mission:completed` → `next: 3`;
  Book 3 `campaign47a:b3:berth` tow mission live at t≈2529 — the whole
  Book 2 chain through the ending on the ordinary route, zero wedge
  fires, zero errors. Player-truth adventure + swarm gates attached as
  `.devshots/player-truth/nov1-route-*/`.
  **Player-truth gate investigation (nov1 → rerun):** the first
  adventure gate failed the route at `Universe seed mismatch: requested
  4242, launched 2444950233`, run under ~9 s p99 frames while run 129
  itself held the box (~2 900 CPU-s). Isolated reproduction on a quiet
  box proved the path correct end to end: bench probe
  (`tools/ui-bench.html?screen=newGame`) emits `game:new {seed:4242}`;
  real-page probe launches flight with `probeState` reporting
  `seed:4242, runSeed:0` — `selectAuthoritativeRunSeed` reads
  `meta.seed` for adventure (`run.seed` is the run-envelope seed, 0 on
  this path). The quiet-host gate rerun cleared the seed boundary and
  completed route PASS (intro → menu → first-run → mode select →
  preparation → spawn → play). Its remaining `player_control` FAIL was
  a trace-sampling artifact, not dead input: the KeyD window
  (sim 16.35→17.35) contains exactly one pose sample at both ends so
  `probeDead` measured 0 rad, while the trace's own samples show rot
  0 → 0.243 at sim 16.62 → **3.13 rad** by sim 18.13 — a full ~180°
  yaw answer; spawn thrust measured Δv=165. The host is diagnostic-only
  (SwiftShader software GL, `contended: true`); Oct artifacts on this
  box carry the same chronic UNKNOWNs (readability/frame_time/
  offscreen_marker) with player_control passing when sampling is dense.
  The swarm rerun on the freed box lands the product-side verdict:
  `player_control PASS — 0/6 probes dead · 0 pinned spans`, route /
  round_resolution / kills_before_input / round_transitions /
  rounds_reached round 3 all PASS; only `readability` and `frame_time`
  stay UNKNOWN ("software-renderer evidence only" — SwiftShader
  ceiling, identical to the Oct artifacts). The swarm-idle pass failed
  at startup admission (`GAME_START_FAILED: first world picture`),
  the same marginal-host presentation race that pass had already
  cleared in the contended first run. Product-side signal is clean;
  the binding green belongs to the designated quiet host — this box is
  diagnostic-only by the harness's own contract.
  Binding verdict artifacts: `.devshots/gate-adventure-rerun.log` and
  `.devshots/gate-swarm-rerun.log` (+ `scratch/player-truth/*/`).
- **Audit-fix packets landed 2026-10-29/30:** encounter bookkeeping `37e1ebe0d24`, heat victim
  `d79feb41121`, mining/careers `bfa9ec3b6a9`, save restore `7b4cced23e8`, unique-wreck persistence
  `bd978111178`, special500 registered in production `6ca62459ba5`, c47a truth `97283ecd9c1`,
  spine live vocabulary + first-blood sheet `cc0a86c423b`, Iron Maw + board retention
  `a5bcb39034f`, onboarding Continue restage `242aba9fc73`, chart Set Course/zoom/labels
  `310e9d30033`, faction reachability `07b48d6736d`, broke-pilot note offers + onboarding
  re-init `52dff9cf272`; story/wreck reds green (beat standard 5/5 sheets, campaign47a-live
  18/18, embodied-save, ecology-reactions, stranger-replay, f15 wrecks).
  Also landed 2026-10-29/30: faction save wiring + choir spawner + fulfillment hand-in;
  unique-wreck story rewards with station readers + Choir–Vael treaty effect; reds batch 4
  (stationApp insertBefore, yard keepalive, station pricing memory, leaked DOM stubs, WU units).
  **Recovery round after the quota wall (all pushed):** D261 dock cue f0b6d842, bench #alerts
  host + receipts/impound seeded shots ad732f2e, mission-log failure reasons + stake refund
  88d846f2, impound-lot desk verbs + Helix service-ring docket card 23282c76, kill_thrown deed
  817a35bf, Rook receipt names the weighed hull 418c1a64, reds sweep 54f691f5 (escort source-pins
  → behavior, lying fixtures repaired, racing ladder occupancy, accept-hold diagnostics, cohort
  fixture regen). Two reds-batch workers died to the quota wall — their surviving diffs were
  reviewed and landed in that sweep. `check:first-hour` repaired a51a5765 (stale source pins
  re-bound to live seams: `_onboardingOwnsOpeningNav`, per-sector hostile contract, 6 s attract,
  stamp signature, relocated splash line; rescue-recognition fake bus taught `off`).
  Recorded for later packets: world.js:1553 sector content rng publishes to `state.world.rng`
  (determinism shift — needs its own packet); chart waypoint identity record from missions.js
  (:12291) and `world._onSetCourse` carrying onboarding/presentation fields (:12307); chart
  :3347 raw station-id fallback, :5758 invented 0.5 security, :3284 "fresh ago".
- **Audit-fix implementers originally launched** (digests `.devshots/finish/lane3/triage-*.md`):
  fix-c47a-truth (embodied register→Pick-a-Side lock, Deep Reach softlock, NG+ latch, dock gating),
  fix-onboarding-continue (rescue-era Continue restores no actors/panel — top systems-b item),
  fix-heat-victim (unprovoked fire adds zero heat — victim type read damage channel),
  fix-encounter-bookkeeping (resolve never records completed → gated chains deadlock),
  fix-spine-vocab (obsolete Beat-1/2 method ids → spine records nothing, six voices silenced),
  fix-ironmaw-board (Iron Maw never spawns on Charon→Ashfall; epoch rebuild deletes contract
  classes), fix-save-restore (Continue crash on signature mismatch; restore drops boost-regen,
  weaponless hulls, empty-ownedShips normalization), fix-uniquewrecks-persist (wreck progress
  lost across saves; elapsed fuse detonates reminted hull), fix-mining-careers (held-beam cargo
  printer; hauler expiresAtEpoch:1 kills chain at ~5 min), verify-economy-honesty (dirty 200-line
  economy.js diff vs packet — landable?).
- **Save writelane landed `1fc335672aa`** — D1/D2/D3/D4/D5/D7 fixed (mirror deltas, gzip recovery
  rotation, prepared-envelope cache, redundant worker validate removed, serialized player key
  order, superseded pending marker); 4 new tests; schema+fuzz green.
- **D222 UI budget — OPEN after current measurement.** The earlier `d59a80207513` pass is
  historical. The current canonical matrix completed151/160 frames with named capture/route
  failures and was not promoted. Chart-galaxy authored-UI callbacks average47.49ms in that
  receipt; a bounded mounted-chart CPU profile identifies label collision placement as the
  dominant work. The first clipping rewrite showed no matched benefit and was rejected; the original placer remains. Current budgets and source metadata remain open.
  This is UI-owned callback time, not a whole-world performance proxy.

### Wave G — the glass (every 2D surface; use the current Finish workflow)
Direction: `design/frontend/ORRERY.md`, `ORRERY_RUBRIC.md`; method: `docs/UI_VISUAL_ITERATION.md`
(`node scripts/ui-bench.mjs --shot=<id>`, open the PNG, fix, `--walk`).
- **G1 — HUD defects** D261, D267, D222.
- **G2 — The surfaces the ORRERY handoff left open:** flight HUD, comms, power rail, drill, base,
  sandbox (loading belongs to Lane 1), and the 8 "partial" surfaces from R-8962e68.
- **G3 — Phone and short screens** across every surface (`ui-bench --phone`).
- **G4 — Split the UI monoliths:** `galaxyMap.js` (12,332 lines: pure layout/search/route out, drawing stays),
  `saveSystem.js` (10,040: migrations / import / slots / serialize / storage), the largest screen files.
- **G5 — UI cost.** Per-frame DOM reads and forced layouts in HUD paths (the caption and callout
  fixes of 2026-10-27/28 are the pattern); every HUD write batched per frame.
  Audit 2026-10-30: `hud.js` clean — zero `getComputedStyle`, every `getBoundingClientRect`/
  `offsetWidth` is event-driven (resize/ResizeObserver, cargo-buy animation), stale-flagged
  (`objectiveEdgeBoxes` re-measures only on invalidate), or explicitly bounded to one forced
  layout per frame. No per-frame layout reads found.

### Wave W2 — an economy you can play and a long game that lasts
- **Row 544 W-ECONOMY** — travel ≤ 50 % of time, a play-changing purchase every 15–25 minutes, pay by the tonne.
- **Row 465 RC-MARKET-WHY** — the market explains itself. **Row 480 RC-MARKET-PLAY** — Convoy Shares, Forward Slip, Auditor Penn, Dump Chute, Cold Chain, Labor Stoppage (after 465).
- **Row 401 AL-LONG-3** — hulls you commit to (two irreversible refits, ladder to hour 15, deed-priced resale).
  **Row 469 RC-FIT-VISIBLE** — the fit shows on the hull (the drawn-module half is Lane 1's; Inbox).
- **Row 399 AL-LONG-1** — seen at minute one, moved at hour fifteen (≥ 8 `revisitNeed` one-offs).
- **Row 452 GOLD-INSPECTOR** — the inspector's shift, a fourth career branch.

### Wave W3 — a story with faces and voices
- **Row 535 W-BOOKS-5-7**, **Row 536 W-DOORS** (the Five Doors, one playable act each), **Row 538 W-ARCS** (fourteen faction arcs × three missions), **Row 539 W-CULL** (the Cull ladder).
- **Row 425 AL-STORY-3** — faces on the radio (the row asks for an owner ruling; the owner delegated judgment calls on 2026-10-28 — decide, record the decision here, build it). **Row 543 W-FACES** — canon, new and culture portrait pools (authored 2D images are allowed, owner ruling 2026-10-03).
- **Row 432 PULSE-RADIO** — ≥ 2 h per channel before a repeat, live-fact segments, The Margin as a show.
- **Row 434 PULSE-CHATTER** — every ship is somebody; ≥ 3,000 hail/chatter lines (grunt-author through Grok/Gemini, cut hard in review).
- **Row 555 ATT-T02**, **Row 478 RC-STATION-STAGE** — the station is a stage. **Row 558 ATT-E04** — secrets layer. **Row 472 RC-VENUES** — toys out of the drawer.

### Wave W4 — the open reach (living world, `design/program/living-world/`)
`node scripts/living-world.mjs --next` lists dependency-ready briefs; `--task=LW-xx` prints one.
Order: **LW-01** Lantern Ward → **LW-02** reusable district composition (unblocks Lane 2's LW-04/05/14) →
**LW-03** Switchyard → **LW-06** Widow's Run → **LW-07** Nine-Mouth Cut → **LW-08** Iron Maw →
**LW-09** Memorial Gardens → **LW-10** Fourth Toll → **LW-11** Gate Audits → **LW-12** THE WEIGHT with an
open future → **LW-13** the other seventeen sectors. Art kits LW-A1…A4 come from Lane 1 (watch your Inbox).

### Wave X — Strategic Chaos, the world half
From `design/program/strategic-chaos/` (`node scripts/strategic-chaos.mjs brief SC-06`): **SC-06**
Physical Infrastructure, **SC-09** Supply-Line Warfare, **SC-10** Personal Consequences. Lane 2 builds
SC-01 Causal Playground and SC-12 Scenario Forge first; use them to prove yours.

### In flight elsewhere — integrate when it lands
Another agent's opening-experience work (open PR "Create Adventure, Swarm, Tethys, Ceres, Cinder/Rook,
and Compost opening experiences", plus files staged in the shared index under
`design/program/opening-experience-2026-10-27/`). Do not take or merge that branch. When it arrives on
`origin/master`, fold its openings into Wave W1 and re-run the first-hour pass. Also read
`design/program/alive-world-plan-2026-10-27.md` alongside the living-world pack before W4.

### Wave S — the ear
Every verb has a voice, the mix has a hierarchy, silence exists (`FINISH_LANES.md` lane 8 checklist,
`src/audio/**`). Audit first: list verbs with no sound or a placeholder, then fix in batches.
Audit state 2026-10-30: the cue contract suite is green — `check:audio-identity` (91 semantic
cues resolve; `sfx_accel_transition` was uncovered, listed `1b500b762e7`), `check:first-hour-audio`
(audible/blocked trace green), asteroid routing, beam-verb truth table, mining signatures.
**Live audition done `scripts/capture-wave-s-audition.mjs`** (real headed boot, analyser taps on
the live buses, webm artifact + JSON in `.devshots/audio/`): master floor 0.0002 RMS at idle
drift pre- and post-dock (silence exists), 24 distinct non-click recipes over the walk
(combat verbs each answer with their own voice), the music bus dipped 0.00154→0.0005 on the
duck:true danger cue and recovered (hierarchy ducks predictably), `stationHum` loop lived
while docked and released on undock (the place answers). Residual honesty: audible distinctness
is judged from the artifact, not a metric; ambient peak under the hum is quiet (0.0003) — the
loop's structural presence is the measured leg.

### H1 — The full razor (last, when the other lanes no longer cite old docs)
README §7 end state: `AGENTS.md` ≤ 150 lines, `build_map.md` ≤ 600 lines, one perf document, one
INFERENCE law (fold `INFERENCE_LANES.md` + `design/inference-workflows/` + `INFERENCE_GOAL.txt`), stale
`NOW.md`/`FINISH_LANES.md`/`FINISH_THE_GAME.md` folded or archived, every nested `AGENTS.md` still true.
Write the new front door so the next agent after this program knows where the game stands.

## Source coverage and material defects

Completed reads and their explicit coverage gaps are recorded in
[`SOURCE_COVERAGE_2026-10-29.md`](./SOURCE_COVERAGE_2026-10-29.md); current player outcomes, open
defects and accepted limits are in [`INTEGRATION_COVERAGE.md`](./INTEGRATION_COVERAGE.md). Reuse
those records instead of repeating completed reads or creating per-system review rows. For an
unclosed material claim, inspect the live owner and the smallest relevant route or behavior; when a
concrete defect is present, fix its cause and directly check the result. Preserve the quality bars
and architecture contracts in the Finish README. Record a distinct material defect in the owning
lane's Defects section or Inbox, with its owner and next step; do not create a second audit queue.

## INFERENCE (seed ≈ 45 lines in the brainstorm packet, README §6)

Seed directions — ground each in a live owner, write it in player words, give it a done check:
dock and someone remembers your last visit; prices that move because of something you did; a
freighter you saved sending cargo later; patrols reacting to your heat before they see you; a bar
regular whose story advances each visit; radio that mentions your kill; mission text in the voice of
the person giving it; empty states that tell a tiny story; a map that shows rumours and danger you
learned about; station announcements tied to the live economy; a ship's name and captain on hail;
wrecks with readable histories; a reason to come back to the first sector at hour ten; failure that
teaches by situation; tooltips that explain *why* in one line; every screen's last row visible
(open catalog line RC-49 carries over: station tabs hide their last row).

## Traps

Integration 2026-10-31: phone station title/credits and Shipworks diagram/nameplate overlaps are
repaired in the shared Standard and Shipworks style owners. Inspected 390×844 and 960×540 fixture
captures have no browser errors or geometry overlap/clipping findings. The control walk remains
incomplete after resets/confirmations; the impound fixture has no canonical lot desk. These visual
repairs do not close ordinary station-tab last-row reachability (RC-49) or impound controls.
The new 960×540 Market layout's trade-console overflow is also repaired. Its scoped fixture
filters/searches the list, scrolls to and selects its last filtered row, and hit-tests the quantity
and trade controls inside the viewport; ordinary station/trade acceptance remains pending.

- Save compatibility: every new persistent field needs a migration and a reload test (`src/save/`).
- Single writers: economy→credits, factions→reputation, cargo→cargo (`AGENTS.md` §6) — emit intents, do not write another system's state.
- Localization: four of five locales are machine-filled; new player text goes through the localization pipeline, never hard-coded.
- `design/program/vm-drop/` is remote-authoritative; never write under it locally.
- Git-bash `sed` strips CRLF; check `git diff --numstat` after scripted edits of mixed-ending files.
