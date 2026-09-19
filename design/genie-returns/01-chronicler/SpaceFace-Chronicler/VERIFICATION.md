# Verification record

## What was executed

Environment: Linux x64, Node.js `v22.16.0`. The delivered code uses no installed npm dependencies. The production modules use no DOM, Three.js, network, wall clock, timers, or random draws.

**Module tests:** `node repo/scripts/test-chronicler.mjs` — **61 passed, 0 failed, 0 skipped**. The suite includes 1,176 kill-causality comparisons against the packet's unmodified `compactKillCausality` implementation within one test.

**Addition-only installer tests:** `node --test tests/install.test.mjs` — **3 passed, 0 failed, 0 skipped**. These exercise preview-only behavior, successful/identical installation, conflict refusal before writing, preserving target-owned files, and refusal to follow a destination symlink.

**Fixed-seed demo:** both text and JSON modes ran successfully, including a full evidenced chain, an escaped/returned/defeated ace, a rescue legend, one-hour station recollection, an exact save round trip, and a native-only negative case that correctly refuses to claim collected/sold salvage.

**63-hour synthetic soak:** the final implementation was run under seeds **4242** and **8008**, each uninterrupted and with a mid-inbox JSON save/restore. The restored input was pending, not merely an empty checkpoint. Each trajectory ran **13,608,001** fixed updates at 60 Hz: **54,432,004 update calls across four executions**, representing 252 synthetic hours total.

Both seeds had **byte-identical final archive hashes and output-stream hashes** between uninterrupted and resumed execution. Output hashes include the simulation tick, event name, and full emitted payload. Publication timing is therefore part of the comparison, not just final story text.

| Final implementation result | Seed 4242 | Seed 8008 |
|---|---:|---:|
| Inputs delivered per trajectory, including replay duplicates | 4,019 | 4,026 |
| Accepted normalized facts | 3,767 | 3,774 |
| Duplicate deliveries suppressed | 252 | 252 |
| Supplied complete source chains | 164 | 151 |
| Complete chain announcements | **164** | **151** |
| Pending facts in save checkpoint | 1 | 3 |
| Peak retained stories | 96 | 96 |
| Peak retained facts | 656 | 658 |
| Peak recent replay keys | 2,048 | 2,048 |
| Peak pending facts | 3 | 3 |
| Largest sampled JSON snapshot, bytes | 625,598 | 625,126 |
| Queue drops / detail drops | 0 / 0 | 0 / 0 |
| Invalid or ambiguous final source links | 0 / 0 | 0 / 0 |

The complete-chain result is checked **against the number of actual supplied law/source chains**, not merely “at least one story happened.” The harness refuses a pass when supplied full chains were lost in this workload.

## A defect the soak actually found

Before the final retention change, mature high-scoring stories could crowd out a newly observed kill before its later acquisition/sale/law receipts arrived. The archive looked healthy while new history starved. That was not an acceptable pass.

The fix adds a bounded **60-second developing-story grace** within the existing story cap. A regression test fills the archive with older complete stories and verifies that a newly developing multi-step chain can still reach completion. The final rerun recognized all 164/164 and 151/151 supplied complete chains.

Dense ace/WANTED tests also verify that routine details cannot prevent a later defeat or clear flag from being retained. General causal proof participants are not discarded to manufacture a complete path.

## Performance measurements — limits, not marketing

`evidence/soak-63h.json` contains all measured timings. In the final four trajectories, median event-bearing fixed-update measurements were approximately **3.4–3.6 ms** and the 95th percentiles approximately **4.9–5.3 ms**, under this harness and machine. The largest recorded event-bearing update was approximately **27.3 ms**. Those measurements include possible runtime/host scheduling effects and are not CPU-instruction costs.

The idle fast-path regression verifies that a quiet archive does not rebuild or sort stories on each of 9,999 consecutive idle steps. The soak counted only roughly 7,000 publication passes over 13.6 million updates per run.

This does **not** establish a 60-FPS frame budget in SpaceFace. The renderer, other simulation owners, browser garbage collection, audio, save I/O, real event bursts, and target integrated hardware were not measured together. The observed maximum exceeds a 16.67-ms frame budget; **full-game profiling remains a local acceptance requirement**. Lower configured capacities or a different incremental index strategy may be appropriate if actual event rates or hardware demand it.

The maximum JSON sizes above are sampled workload observations, not worst-case schema bounds. Arrays, facts, strings and configuration have explicit implementation limits, but maximum capacities and long identifiers can produce a larger snapshot.

## Coverage of the tests

The tests cover explicit causal paths; negative and ambiguous lineage; synchronous nested source events; same-tick delivery permutations; source-quantity conservation across partial sales; custody/commodity mismatch; missing native provenance; compact payload copying; private-event suppression; durable legends; escaped versus spared aces; WANTED versus acquittal; true reactor/remedy outcomes; pending saves; deterministic resume; atomic corrupt-save rejection; Continue/new-game boundaries; rewind blocking; reentrant publication; listener teardown; contextual recall; output quotas; rematerialized wrecks not republishing old battles; overload priority; bounded memory; strict source semantics; sector attribution; multi-sector queries; and source-driven retention under a mature archive.

Two packet files support standalone conformance testing and are byte-for-byte copies. When the tests are copied into a real checkout, they prefer that checkout's actual event bus and kill-causality helper. A mismatch against updated source should fail visibly rather than be hidden by a fixture.

## Scope not verified here

No full checkout was cloned or built. No remote commit, PR, registry edit, save whitelist edit, browser playtest, actual audio playback, or live gameplay run was performed. No claim is made that stock inventory/trade/law already emit the new provenance extension. A source event cannot be reconstructed from information that never existed, and Chronicler cannot cure an upstream lack of encounters.

The module and standalone fixtures are complete; live registration, save wiring, producer enrichment and final full-game measurement are the explicit integration boundary in the user's supplied packet. Follow `INTEGRATION-NOTES.md`.
