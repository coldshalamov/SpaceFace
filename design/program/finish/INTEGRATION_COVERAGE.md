# Whole-game integration status

Updated 2026-10-29. This is the current cross-lane handoff for the Finish Program. Detailed packet
source coverage is summarized in [SOURCE_COVERAGE_2026-10-29.md](./SOURCE_COVERAGE_2026-10-29.md);
the attached design target and Swarm-specific gaps are in
[SWARM_RENAISSANCE_GAPS.md](./SWARM_RENAISSANCE_GAPS.md). The lane boards remain authoritative for
active assignments. A source read or focused test does not establish ordinary-route acceptance.

## Current player-facing evidence

| Area | Result | Remaining material outcome |
|---|---|---|
| Swarm spawn/motion observation | Published fix `4a5e683497e` corrected observer overflow and unmapped-player attribution. Corrected offline idle and active captures report zero anomalies without changing the 8 WU/s physics limit. | The original whole Swarm gate remains FAIL: the default pilot died in wave 2. Do not claim whole-mode acceptance. |
| Ordinary Foundry Fortify | Current headed public run cleared waves 1–8 and reached wave 9 alive before its 45-minute cap. Controls, round resolution/transitions, player model, LOD/pop behavior, VFX, loadout and edge markers passed; 1,219 offscreen-marker samples passed after the observer repair. | Original current verdict remains FAIL for one wave-six moving asteroid whose causal identity is missing. The force recorder retained only the first four seconds of the whole run, so later opening coverage is being repaired before classifying its motion. Readability and frame time are UNKNOWN (p50 65 ms / p99 186 ms). The ten-wave/boss journey is still unfinished. Artifacts: `.devshots/finish/integration-2026-10-29/foundry-ten-wave-current/`. |
| Hero Maneuvers | M02 public route banked, committed a bomb, and returned through phase alive; the target survived, an allowed miss. Pinball charged its physical dash and reported target lost with zero contacts; native contact behavior has separate focused coverage. | No public contact or complete three-ability experience is claimed. Boomerang/readout and readability remain under their owners. |
| Adventure | 300.9 simulated seconds reached; core route/control checks passed. The corrected public Tethys route reached Borrowed Sun, charged the first lease exactly 650 credits, saved, reloaded, Continued and saved again. The saved lease retained all eight completed beats. | Readability, performance, starter hauling/stealth routes and the long-session/context-loss check remain open. |
| NPC weapon behavior | Published `a41981ae13a`: NPC fixed mounts and turrets aim from the actual muzzle; six focused cases pass. K1 measures actual disabled intervals; SG06 preserves real multi-ship convergence. Ladder totals preserve future history without counting it toward current unlocks. | These focused results do not establish broad combat-route acceptance. |
| Startup/rendering | The last completed integrated bundle builds all 414 shipping render packages. Its baseline passes all 17 behavior checks but takes 122.83 seconds against a 90-second budget under simultaneous live-browser and Node-suite load. The earlier shared-host run took 73.07 seconds; this does not establish an isolated speedup or a current budget pass. | Opening performance, baseline timing and the final stable checks remain open. |
| Whole game / final phase | Source packets are tracked below; targeted repairs have landed or are being integrated. | Final build-map closure, final stable checks, remaining gameplay routes, and the requested last-300-commit review remain open. Do not mark the game finished. |

## Current integration follow-up

The Fortify, Hero Maneuvers, Borrowed Sun registration/save, and main-lane presentation changes
remain a local integration candidate. Their dependencies must ship together; they are not yet
available to cloud agents from master. The last completed bundle includes the scoped RU-7 warm and save repair and builds all 414 shipping render packages; receipt `1e7ea6e4482659762f772dd77aecd12c31a41f03f1433f368ba044ac836cd619` covers 2748 files (74.02 MB raw / 41.76 MB bundled). It includes the carrier residency, rigid shadow-owner and typed wave-plan/HUD repairs; it predates the later preparation diagnostics and automatic-quality candidate. Save schema v22/461 paths and module preloads passed in that build.
A duplicate Hero readout property reported by the bundler was removed.

- `c2f5714f570` fixes the offscreen observer: lit detonator fuses and their danger bands are
  intentionally marker-eligible. Its seven focused cases pass; the earlier route verdict remains
  the original FAIL. The same commit coalesces callout seating and rejects unrelated NPC impacts.
- The same-flight callout ABBA showed 24,077 immediate seat requests versus 202 coalesced requests
  in its first wave-one pair. Wave/event load changed in later blocks, so this does not establish
  an isolated whole-frame FPS gain. Latest player-impact filtering still needs current budget
  measurement. Fresh integrated-GPU profiles currently receive a suggestion, not automatic quality
  selection; no unmeasured quality reduction was applied.
- `8f39f12dcb3` stops paused construction/refit overlays retaining duplicate flight bodies.
- `f5d1a0831dd` isolates Helix campaign consequences/deadlines from Swarm runs.
- Atlas query-array protection (`618983f7e9e`), forward-compatible motion profile stamps
  (`441a58ef6ce`), copy-owned fallback transport (`7e649f5274d`), and actual map station type
  symbols (`ff8d63cfb54`) are published with focused checks. The actual scrolled map was inspected.
- Published `6ee48f68a99`: Pallet Jack now captures the original 60-WU/s dumped payload through the native
  clamp in a production runtime. The committed drift and objective identity survive its warning;
  player-changed motion remains an escape. The ordinary purchased-and-dumped cargo route also
  passes unchanged encounter pacing, two cold Continue restores, and nonlethal parley recovery.
- Fortify turrets now deliberately acquire live Brood targets through the existing spatial grid,
  then fire canonical projectiles. The new regression includes real collider occlusion and ammo.
- Hero combined fittings now refuse conflicting Veil/Pinball/Boomerang Shift ownership; the actual
  Hero-to-V3 input regression passes.

- Published `e7334cd9378` and `e3494024af1`: player-mined Adventure bulk cores survive
  Continue; the connected starter native circuit exercises normal trade, gate tolls, a paid fitting,
  authored seam extraction, MassLine and an earned Swing Drive. This is a native fixture with contact
  arrangement, not a browser hauling acceptance.
- Borrowed Sun's local candidate advances arrival/deployment on its sector calendar outside native
  residency; service still requires its real native body. The ordinary-boot regression passes.
  Live gate inspection confirms world-origin updates reach both realms: the old renderer snapshot
  was held during sector preparation and caught up when it completed. The actual carrier omitted
  the authored-station selector, so its local fix now selects the shipped trade-hub body and repairs
  older Continue metadata. The production-runtime/factory route and normal-gate native checks pass;
  the public lease purchase and Quick Save/Continue path subsequently completed.
- Current draw census finds roughly 29 drawable objects per Wasp (57 callbacks across two passes).
  A bounded compiler experiment preserves every primitive and saves zero draws, so it was rejected.
  Quality and retained opaque batching comparisons have not shown a stable isolated win; defaults
  remain unchanged. Current performance is not accepted.
- The current census identifies visible Wasps as Ashline (`sf.render.ashline-dart`, hash `f4d38c0f…`)
  and confirms repeated roots share drawn geometry. `a9c07600e34` keeps unaffected retained batches
  active when another owner's shadow policy changes; both active and during-residency shared-slot
  cases pass (29/29). The one subsequent same-flight comparison stayed in preparation with zero
  activations, so it establishes no batching FPS gain or active/direct visual equivalence. Actual
  canvas pictures were inspected; compile/admission progress remains a separate open measurement.
- Published `e1e560cc05c` exposes current retained-batch preparation progress. The subsequent bounded current run progressed through all 20 groups and activated at +29.8 seconds with 20 batches / 52 instances / 8 roots and zero rollbacks. The shadow-changing player owner stayed on direct draws. Actual retained, direct and restored canvas captures were inspected. This establishes admission and fallback behavior, not an isolated FPS improvement.
- Published `a0c9a01f966` resolves force identities from exact receipt mappings rather than a six-digit raw-ID assumption; all eight focused provenance cases pass. Streaming the actual wave-six artifact found no receipt for that life because the run recorder had already frozen its first opening window. The generic ID repair does not close the original route failure. The per-wave recorder now reinstalls a bounded opening observer before each next public launch and retains exact wave-scoped receipts. Its nine focused cases pass, including real observer reinstallation, later-window mapping, missing windows and ambiguity. A missing later capture is UNKNOWN/partial, never an earlier window relabeled complete. The original artifact remains unchanged; a new route with per-wave captures is still required to classify its wave-six motion.
- Published `3341dd4512a` consolidates the root agent front door, orientation, task router and policy manifest. Historical provider quotas, ownership locks and conflicting routing no longer masquerade as current instruction; architecture and preservation contracts remain.
- The current flight-footage profile measures roughly 0.22 % main-thread CPU in the recorder/codec/
  presented hook, rather than establishing the board's old 8–12 % FPS claim. M12 now records the
  current finding and leaves any unmeasured GPU cost explicit.
- Published `71a898b50f7`: hidden hail availability updates skip layout reads; visible panels follow
  the current anchor. All 28 focused hail contracts pass.

**Published save repair (`cbb6e8e020c`, regular safety-suite wiring `eeef330e7dc`):** one
instrumented public F5 failed the old 200,000-node preflight guard before encoding/writing. A
canonical complete-market capture contains 248,652 nodes but only 2.93 MB of JSON: bounded
game-owned market history could exceed that guard. Main, worker and inline lanes now share a
500,000-node allowance while retaining the 12 MiB, depth, collection and separate 200,000-node
native-attestation limits. The safety suite passes, including full-market round trips, over-limit
refusal, retained previous saves and native-physics negative cases. The isolated live browser then
completed public purchase, Quick Save, reload, Continue and a second successful Quick Save.

The RU-7 warm is explicit and idempotent. Adventure and every Continue retain its readiness gate;
standalone Swarm/Gauntlet starts skip four unreachable Ceres payloads (3.24 MiB raw). Unconditional
source-page preload hints were removed too. Focused readiness/Continue/preload checks pass;
the current default Foundry census measured zero requests for those four payloads in both captured
windows. No wall time or FPS improvement is claimed from the byte count alone.

Current broad checks and repairs:

- The first serial SIM group ran all 39 commands: 38 passed; its sole Tally hail failure was a DOM
  fixture mismatch, repaired in `ec20ab138b9` with all three focused native/presenter tests passing.
- The first FEEL group ran all 28 commands: 23 passed. Its five failures have direct resolutions:
  `4f564f3d5dc` gives service fixtures a real docked berth; `3cd076035a7` refreshes resized Rapier
  observer proxies and measures a real moving-ship bump above the felt threshold; `ae6b79b67bc`
  reconnects Last Shift cues/worker acknowledgement and repairs the reduced-motion NPC fixture.
  The current worker/main Last Shift recovery journey passes 34 cases, VP-220 passes 25, the flight
  lab passes, and both knock seeds retain the 10% limit with measured 2.56% responses. These focused
  resolutions do not rewrite the original full-group report or claim a fresh full-matrix pass.
- The targeted earlier-static-failure recheck passes 38 current commands. Its remaining attempted
  command was a retired test; the current replacement already passed through `check:ui-identity`.
  The previously timed-out Phoebe native case passed separately. Headed UI budgets remain pending.
- The integrated Crucible arc suite now runs the cohort, three abilities and Fortify regressions in
  the existing CI command: 78/78 pass. The runtime-maturity aggregate initially ran 932 tests,
  with 919 passing and 13 fixture failures. The repaired aggregate then passed 934/935; its sole
  remaining camera diagnostic call-count pin was corrected and passes all eight focused cases.
  Published `2898adaffed` preserves the actual bounded-finalization, late-recovery and recording
  contracts. `74d9868b404` repairs the matrix parser's Node-option handling. The 19 actual browser
  commands remain queued for serial execution; there is no fresh whole-matrix claim.

**Live Adventure slowdown:** the post-fix Continued Tethys page remained focused/visible and drew
about 56 frames/s while advancing only 0.2 simulated seconds in ten wall seconds. The worker's
authoritative boundary cost was about 1.52 seconds; packing and domain diff were only a few
milliseconds. A single 11.51-second worker profile attributes roughly 11.13 seconds to
`tickFarActors`/`resolveFarEncounters`. A native replay of the actual isolated save reproduced
14 unique far rows growing to 1,004 by sim time 20.37; 992 were anonymous Borrowed Sun reflectors.
Generic NPC shelving removed their identity, so the carrier reprinted four parts every fixed tick.
The residency repair keeps the bounded carrier cohort with its owner under distant activity tiers
and removes unrecoverable legacy part shells on Continue. The normal-gate native check retains the
same four reflectors across 180 ticks with zero carrier far rows. An independent encounter repair
uses deterministic team queues, respects cooldowns and dead actors, and snapshots/revalidates cells
around catch-up; dense friendly/cooling/mixed and simultaneous-due cases pass. Combined native checks
pass 47/47. The post-fix public route then reached the selected carrier at about 232 WU, opened its
scanner offer, paid exactly 650 credits and completed Save/Continue. The helper's first verifier
incorrectly expected a worker ledger on the main mirror and timed out after the successful payment.
A later stale-index QA click bought a second note and charter in the isolated store. No real shared
save was touched; the subsequent Quick envelope retains the first filled note, second open note and
charter after Continue. The ignored helper now uses the actual `borrowedSun:leaseSold` receipt and
exact debit, and warns against repeating an ambiguous purchase. The earlier
debugger snapshot exceeded the worker's five-second watchdog and closed that isolated QA worker;
this diagnostic-induced interruption is separate from the observed production slowdown. Its
isolated save/server remain preserved.
- Current Cryo idle40/45 capture has no core FAIL and passes VFX coverage (p95 1% screen, no measured
  player/threat hiding). Overall verdict is INCOMPLETE for idle round resolution/transitions,
  insufficient readable-body samples and performance. No active three-round or whole-mode claim.
- `3aa38b08ea2` makes live station Services agree with Overview through the existing station record resolver; three behavior cases pass.
- `64faa351b40` carries Pallet Jack/Kilnback authored motion through the worker read model and clears
  retired casks; 13 focused tests pass. `a1f3974fe90` repairs the independently stale Ashline package
  admission pin with six behavior cases. Its contribution to Wasp draw cost is not yet established.
- The old 12.5 GB `.devshots/green813` temporary copy was inventoried. One unique historical test is
  preserved under the ignored `green813-salvage` folder; 1,627 differing versions are in Git. The
  execution tool rejected exact directory removal as blocked by policy, so the copy remains.

Additional integration checkpoint (2026-10-29):

- `57686d45cac` published the connected 94-path implementation; `2dbfa28c3ac` removed the remaining provider/audit mandates and count-based finish proxies from the Finish docs without altering assignments.
- `c7be545a6df` (published through merge `c1233cf7ad7`) refreshes attested animation pivots before retained instances copy their matrices. The actual bank-driven same-frame and asynchronous-preparation cases pass (7), as do the existing retained-batch guards (29). No frame-rate improvement is claimed. Ashline color baking was rejected: its 15 used materials differ in non-color properties, so preserving authored PBR behavior yields no compatible material merge.
- `84f0fd8a230` defers the generic controls card while the opening objective owns attention and preserves its teach-once hint for the later quiet moment. The public first-15 route now passes B0's exclusive tracker instruction and optional mission-log context; focused HUD-attention cases pass (20).
- The 19 browser commands have run once. Several original failures were outdated actors: First Light dismissal, the held mission-accept gesture, public bounty-role copy, persistent confirmation-root handling, and navigation calls retaining 30-second defaults despite their existing larger startup budgets. Relevant repaired routes are being checked individually, without repeating the entire matrix. Current direct evidence includes successful cargo loading, B0, a single desktop/mobile flight round, authored ship/station admission, market, trail rendering, cold open, ship stability and lab parity. No fresh all-browser-green claim yet.
- Two main-lane cargo-fixture launches stalled behind the loading veil for over 90 seconds, with one world submission and no first-playable stamp; later direct launches passed. Cause remains UNKNOWN. This is the explicit `simLane=main` compatibility route, not proof of a worker-default failure. Existing witness/latch fields are retained for another occurrence; the required long session and context restore remain open.
- The latest baseline on the uncommitted Auto candidate passed 16 behavior links and failed generated save-schema drift; regeneration now passes version 22 / 462 paths. Its 110.79-second wall time still exceeds the 90-second budget. This is not a fresh 17/17 full-run pass or a current timing pass.
- Automatic quality remains an uncommitted candidate with preserved legacy manual/custom settings, measured-benefit resolution trials and manual overrides. Its first long Electron comparison closed without results for an UNKNOWN reason. A new matched comparison/look and long-session recovery remain required; no 60-fps/default-quality acceptance is claimed. The responsive one-full-card prompt-deck candidate has native routing coverage but still needs its actual viewport look/control walk.
- `b6673fe1b3c` closes the 26 orphan-source classification gap and fixes story validator receipt/choice handling plus faction token matching. The combined checker run retains one failing first-blood authored-sheet case (two obsolete method references and two bark citations). That overlaps the active foreign `fix-spine-vocab` packet; one Lane 3 Inbox line names the required authored-sheet validation. It is not treated as fixed.

## Published changes relevant to integration

These SHAs are retained as navigation pointers, not as substitutes for current-tree review:

- `4a5e683497e`: observer capacity/RPC and player attribution corrections, live first-birth spawn
  checking, and hazard cleanup. Corrected offline idle/active traces passed; the original public
  Swarm failure is still open.
- `88474f40e9d`: world payment, refused-spawn, custody, lifetime, encounter-retirement, and touch
  release fixes; relevant focused suites passed.
- `a1291970946`: restored authored landmark GLBs to canonical loading and measured parts/station
  registration; atlas, manifest, wiring, and release-pin checks passed.
- `637f67c8d0b`: scoped first-flight residency to required opening subjects while retaining declared
  zero-count pools and mobile policy; focused checks passed. No causal performance improvement is
  claimed from the visible route alone.
- `742cc8ebf97`: station scroll ownership and service copy; native bottom-row reachability and
  desktop/touch activation were checked.
- `5d969ed4ff3`: disposed shadow-batch retirement and expected inactive-owner cancellation.
- `281feb86a2f`: admission deadlines/priorities and itinerary memo identity.
- `78c6370f974`: recycled presentation occupants, retired stage-load cancellation, warmup boundary.
- `1fd0cb94323`: authored VFX flash velocity.
- `4282a6bdbcc`: stale RCS action/node references.
- `6c8aaaee9f1`: mounted readmission residency.
- `d23c3aac5c8`, `8e2fedc8e01`, `2df8bb0d53c`, `c3315a4098c`, `f02310a2e96`, and
  `321e6d287a9` are earlier bounded loader, test-fixture, runtime identity, authored material,
  save/tutorial, and Swarm opening repairs recorded in the prior integration history.

## Source coverage state

The durable packet matrix is [SOURCE_COVERAGE_2026-10-29.md](./SOURCE_COVERAGE_2026-10-29.md).
Packets U001–U072 are reported source-complete in their source notes or prior integration record;
U049–U054 and U061–U066 have now closed with their owner notes. This is source coverage only;
packet completion does not imply gameplay acceptance.

The detailed packet notes and capture artifacts referenced by that matrix live under the ignored
local `.devshots/finish/integration-2026-10-29/` tree. They are not part of the repository and are
not visible to cloud agents; the current summary and acceptance status are recorded here.
