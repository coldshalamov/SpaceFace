> **HISTORY — not a source of work.** Superseded on 2026-11-11 by `design/program/fleet/QUEUE.md`
> (work) and `design/game/` (design). Read for background only; do not take tasks from this file.

You are the Lane 2 agent of the SpaceFace Finish Program: THE FIGHT & THE SIM.
This is a medium-complexity lane with a lot of volume. Use GPT-6 Luna for most source coverage and implementation; Codex owns integration under the current campaign workflow below.

Repository: C:\Users\93rob\Documents\GitHub\SpaceFace (Windows 11, Git Bash + PowerShell, branch master, one shared checkout).
The controller assigns current outcomes and exact write sets; preserve concurrent work and follow README §3.

=====================================================================
0. EXECUTION
=====================================================================
Finish the assigned outcome and its relevant direct check. The controller owns integration and
selects subsequent work. Preserve active changes, avoid duplicate investigations, and record material
blockers and the next actionable step. Follow the shared protocol in README §§3 and 5.

=====================================================================
1. READ FIRST, IN THIS ORDER (then start working)
=====================================================================
1. design/program/finish/README.md       — diagnosis, owner rulings, path ownership, shared protocol, finish line. Read all of it.
2. design/program/finish/LANE_2_FIGHT_AND_SIM.md — YOUR board: current owned outcomes, material findings, baseline and traps.
3. design/program/finish/TOOLS.md        — the verified terminal commands. Use them verbatim.
4. design/VISION.md (all of it) — the fantasy: "I understand how this world moves, and I can use that understanding to do ridiculous things."
5. build_map.md §33 (the rock is the gun) and §34 (THE WEIGHT) — the specs behind your C and E rows. Read each row's prose before briefing it; do not read the whole file.
6. design/perf/TABLE_AUTHORITY_PLAN.md and design/program/ASSET_PERFORMANCE_PROGRAM.md §7 — before packet F1.
7. AGENTS.md, ARCHITECTURE.md, design/FEEL_CONTRACT.md — the contracts. Where they conflict with README section 2 (owner rulings 2026-10-28), the rulings win.
Do not sweep design/, .campaign/, transcripts or old plans. Do not run program-dispatch --next: your board is your job (ruling 4).

=====================================================================
2. WHAT THE OWNER ASKED FOR (2026-10-28, condensed)
=====================================================================
- The game "always bogs down when the combat is happening or when there's a lot of models on the screen". It must run better with many enemies. The simulation is a third of the frame today; it has to get cheap.
- A mature, professional, completed game: implement its player-facing requirements, ferret out material bugs, and improve the systems that serve those outcomes. Current completed source reads are recorded in `SOURCE_COVERAGE_2026-10-29.md`; this does not claim every system is at bar or gameplay is accepted.
- Rewriting, porting or refactoring is fine when there is a better way. Rules agents wrote may be the thing holding the game back — make the judgment call.

=====================================================================
3. THE RULINGS THAT UNBLOCK YOU (full text: README section 2)
=====================================================================
- Rewrites are allowed when measured better and the default route stays playable. Compatibility paths (flight.js, ai.js, the legacy physics backend) may be deleted once nothing on the default route imports them and their tests are ported.
- Source-text pin tests that block a refactor are converted to behaviour tests or deleted in the same commit (say so in the body). Never re-record test/*.expected.json just to pass.
- Measure on this machine, within one session, host busy printed.
- Use the current claim-relevant review rule in README §5.3; do not schedule batch reviews by packet count.
- INFERENCE is authorized for your lane. Verify player-facing changes directly at the relevant route and layer; nothing waits for an owner playtest, and there is no fixed batch cadence.

=====================================================================
4. YOUR LANE
=====================================================================
The outcome: the fight is the best thing in SpaceFace — fast, physics-centric arcade combat where the rock is the gun, a Crucible/Swarm showcase worth replaying, enemies and creatures that live in the same physics you do — and the simulation under it costs a few milliseconds at 150+ bodies, with code and tests lean enough to change.

The controller assigns the exact files for each outcome; see README §3.

Hard coupling with Lane 1: Lane 1's packet M1 moves the whole simulation into a Web Worker by default. Every line of sim code you write must be worker-safe: no DOM, no window, no main-thread-only reads, determinism through state.rng and state.simTime only. Lane 1's frame bars depend on your F1/F2 — do Wave F first.

Your ordered work is the board: F0 green the sim reds (D241); Wave F (F1 crowd cost — entity-index scans instead of whole-list walks, batched/coalesced contact-impact emission, AI level-of-detail cadence, pooling, Rapier tuning; F2 row 488 wave-15 sim p95 ≤ 20 ms floor / ≤ 8 ms target with a committed fixed-seed stress fixture); Wave C (rows 501, 500, 489, 550, 270, 481, 475, 545, 390, and verifying §31.0 fault 2 "physics for everyone"); Wave X Strategic Chaos (design/program/strategic-chaos/, SC-01 Causal Playground and SC-12 Scenario Forge first, then SC-02, 03, 04, 05, 07, 08, 11 — `node scripts/strategic-chaos.mjs brief SC-01` prints each brief); Wave E (rows 503, 504, 507, 508 and the fighting districts LW-04, LW-05, LW-14 after Lane 3 lands LW-02); Wave K (retire compat paths, slim the registry with per-mode lazy registration, one loot path, census/ledger code out of the tick); Wave T (a manifest-driven check runner and ≤ 150 npm scripts, CI honesty for D224, source-text pin conversion, the slowest 50 tests). Your defects: D191, D241, D224, D175 (guard). Review item R-36df771 remains only if its current claim is distinct and material under README §5.3.

Design bar for every C and E row: it must produce "Holy shit, I did that" moments through physics and consequence, read clearly in a crowd, cost its share of the frame and no more, and connect to systems that already exist (provenance feeds loot feeds the Crucible door feeds the Grudge Ledger). Enemy physics weapons stay rare and memorable (owner 2026-10-21). Hands-off assisted flight comes gradually to rest (owner 2026-09-15).

=====================================================================
5. HOW YOU WORK (current shared protocol)
=====================================================================
Use README §§5.1–5.5. Define the player outcome, exact paths and done condition; integrate into this checkout; run the smallest relevant source, behavior, gameplay or performance check; and record actual results on this board. GPT-6 Luna is the default for most coverage and implementation. Codex owns integration. Additional tools or reviewers are optional and scoped to a material need; there are no provider ratios, subagent counts, fixed review sequences or batch cadence. For a changed screen, directly exercise the controls relevant to the claim. Preserve exact-path Git safety in README §3.
=====================================================================
6. MEASURE
=====================================================================
- Sim cost: within-session A/B on this laptop (scripts/probe-main-thread-profile.mjs --crucible --settle-ms=8000 --eval-file=<expr.js>, or the committed F2 stress fixture), host busy printed, one change at a time, keep what moves the number.
- Gameplay claims: a fixed-seed number (seed 4242) or a focused test. A session-shape claim gets one capped playthrough (docs/VALIDATION_WORKFLOW.md), never a battery.
- Browser test servers set SPACEFACE_PLAYER_STORE_DIR='' so they never mount the owner's save drawer.

=====================================================================
6A. SOURCE COVERAGE AND QUALITY
=====================================================================
Consult SOURCE_COVERAGE_2026-10-29.md for completed reads and INTEGRATION_COVERAGE.md for current player outcomes and limits. Do not reopen completed coverage without a material change. The quality bar remains: expected player outcome, one authoritative owner, measured frame/tick cost, determinism where required, readable cause and effect, connected readers, data-driven variation, behavior checks and manageable code. For a concrete defect, use the current owner map on this board, fix the cause, and verify the claim directly. Full source coverage does not mean every system is at bar or that gameplay is accepted.
=====================================================================
7. COVERAGE FINDINGS AND INFERENCE
=====================================================================
- Resolve material findings already recorded in the source-coverage and integration notes through their live owners. Do not create a second audit queue.
- INFERENCE remains depth, not bolt-ons: deepen a thin or broken owner with a player-facing reader. When assigned, write each outcome in player words with owner paths and a direct done check; group work by shared cause and update the board. There is no required provider, brainstorm size, reviewer sequence or rotation quota.
=====================================================================
8. TRAPS
=====================================================================
Never re-record test/*.expected.json to pass. Run the checks relevant to the change and coordinate heavy suites. Do not restore the old 90 WU/s flight retention target. input.js edits need focused input/rebind/sim validation. A naive emitted-never-heard event grep is noise (events go through wrapper helpers). Never use git add -A, commit -a, worktrees, tree-wide reset/restore/checkout/clean/stash, or --force. Never write under design/program/vm-drop/. Never push someone else's branch or an open PR branch.

=====================================================================
9. YOU ARE FINISHED WHEN
=====================================================================
- Every assigned player-facing outcome is implemented, reachable and directly checked.
- Material defects and findings are fixed; your Defects section and Inbox are clear. Unresolved material outcomes stay OPEN and prevent whole-lane completion.
- The wave-15 and 150-body simulation targets in README §4 are measured and met on the final build with host conditions stated.
- Source coverage is referenced, not repeated. Gameplay claims have their relevant direct checks; whole-mode status matches the current integration record.
- Assigned INFERENCE outcomes are shipped; no reviewer-count, system-reread or batch-review quota is a finish condition.
Then write a plain-language status at the top of your board: done or not done, what the player now feels, and material remaining limits.
