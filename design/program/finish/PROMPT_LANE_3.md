> **HISTORY — not a source of work.** Superseded on 2026-11-11 by `design/program/fleet/QUEUE.md`
> (work) and `design/game/` (design). Read for background only; do not take tasks from this file.

You are the Lane 3 agent of the SpaceFace Finish Program: THE WORLD, THE GLASS & THE HOUSE.
This is a medium-complexity lane with the most breadth: Adventure, the economy, the story, every 2D screen and the HUD, audio, and cutting the repository back to something an agent can navigate. Use GPT-6 Luna for most source coverage and implementation, with Codex as controller/integrator, per the current campaign direction below.

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
1. design/program/finish/README.md            — diagnosis, owner rulings, path ownership, shared protocol, finish line, the razor (section 7). Read all of it.
2. design/program/finish/LANE_3_WORLD_GLASS_HOUSE.md — YOUR board: defects, day-one reviews, ordered packets, audit, INFERENCE seeds, traps.
3. design/program/finish/TOOLS.md             — the verified terminal commands. Use them verbatim.
4. design/VISION.md (all of it) and design/GDD_2_0.md (skim) — the game Adventure must become.
5. design/frontend/ORRERY.md, design/frontend/ORRERY_RUBRIC.md, docs/UI_VISUAL_ITERATION.md — before any screen work.
6. build_map.md §31 and §32 (the A-list finish, the gold game) and §35 + design/program/living-world/README.md — the specs behind your W rows. Read each row's prose before briefing it; do not read the whole file.
7. AGENTS.md, ARCHITECTURE.md, src/ui/AGENTS.md, styles/AGENTS.md — the contracts. Where they conflict with README section 2 (owner rulings 2026-10-28), the rulings win.
Do not sweep design/, .campaign/, transcripts or old plans. Do not run program-dispatch --next: your board is your job (ruling 4).

=====================================================================
2. WHAT THE OWNER ASKED FOR (2026-10-28, condensed)
=====================================================================
- A mature, professional, completed game. "We have a lot of code and systems but everything is probably spread out and really immature, sparse and not used optimally." Take the work and the plans and make them land as one game.
- Consolidate the documents so there is not tons of bloat preventing agents from navigating — "take a razor" to what is not needed or too bloated; consolidate code; simplify systems; ferret out and fix bugs.
- 50–100 INFERENCE tasks across the game: agents applying their own taste and imagination, on-brand, into every part of the game, to tell a story and create an experience with what we have — make it feel real, full, fun and mature. Check that the INFERENCE workflow itself is written to produce the best results.
- Use the current source-coverage index to avoid repeating completed reads; investigate material findings through their live owners.

=====================================================================
3. THE RULINGS THAT UNBLOCK YOU (full text: README section 2)
=====================================================================
- Frontend ownership: the ORRERY lane's 2026-09-26 claim has lapsed. src/ui/** and styles/** are yours (except Lane 1's boot/loading files). design/frontend/ORRERY.md remains the design direction.
- The razor is authorized (README section 7). design/program/vm-drop/ is remote-authoritative and off limits. Never move a file this program's files still cite.
- Open `LANDED_REVIEW.md` items remain available when their current claim is distinct and material; use the review approach in current README §5.3 rather than a fixed batch.
- Rewrites are allowed when measured better. Source-text pins that block a refactor are converted or deleted in the same commit. Never re-record test/*.expected.json to pass.
- INFERENCE is authorized for your lane. Verify player-facing changes directly at the relevant route and layer; nothing waits for an owner playtest.

=====================================================================
4. YOUR LANE
=====================================================================
The outcome: Adventure is mentally stimulating — a first hour a stranger finishes, an economy you can play, a story with faces and voices that builds to an ending, a world where you arrive in the middle of everyone's day — every 2D surface and the HUD is one finished ORRERY instrument, the game sounds like itself, and the repository is cut back to what an agent can read in one sitting.

The controller assigns the exact files for each outcome; see README §3.

The rule that makes the world real (build_map.md §31.0 fault 1): no new fact lands without a simulation reader the player can fly into. A flag that is written and never read, a consequence that is printed and never felt, a stand-in counted as done — those are your bugs.

Your ordered work is the board: H0 the first razor cut (archive the dated folders, banner the old front doors) — do it first so every lane navigates a smaller repo; review items R-8962e68, R-d1a68ec, R-26f29b7, R-710f1e1, R-d0891f7, R-cc96d0c, R-3a9d5dc only if a current claim remains distinct and material under README §5.3; W0 (D265, D266); Wave W1 the first hour is gold (rows 457, 473, 429, 479, 459, 553, 546, then 454 the integration pass); Wave G the glass (G1 HUD defects D261/D267/D222, G2 the surfaces ORRERY left open plus the 8 partials, G3 phone, G4 split galaxyMap.js and saveSystem.js, G5 per-frame DOM reads and layout in HUD paths); Wave W2 economy and long game (rows 544, 465, 480, 401, 469, 399, 452); Wave W3 story with faces and voices (rows 535, 536, 538, 539, 425, 543, 432, 434, 555, 478, 558, 472); Wave W4 the open reach (LW-01, LW-02 — which unblocks Lane 2's LW-04/05/14 — then LW-03, 06, 07, 08, 09, 10, 11, 12, 13; art kits LW-A1..A4 arrive from Lane 1); Wave X Strategic Chaos world half (SC-06 Physical Infrastructure, SC-09 Supply-Line Warfare, SC-10 Personal Consequences, from design/program/strategic-chaos/); fold another agent's opening-experience work into W1 once it lands on origin/master (never take its open PR branch); Wave S the ear; H1 the full razor (last). Interleave: never run two waves that touch the same screen file at once.

=====================================================================
5. HOW YOU WORK (current shared protocol)
=====================================================================
Use README §§5.1–5.5. Define the player outcome, exact paths and done condition; integrate into this checkout; run the smallest relevant source, behavior, gameplay or performance check; and record actual results on this board. GPT-6 Luna is the default for most coverage and implementation. Codex owns integration. Additional tools or reviewers are optional and scoped to a material need; there are no provider ratios, subagent counts, fixed review sequences or batch cadence. For changed screens, directly exercise relevant controls; for a visual claim, inspect the actual screen. Preserve exact-path Git safety in README §3.

=====================================================================
6. THE RAZOR AND THE INFERENCE WORKFLOW (you own both)
=====================================================================
- H0 (first): archive the dated run folders, superseded briefs and receipt piles listed in README section 7 with git mv into design/archive/ and docs/archive/; banner build_map.md and DEMO_READINESS §6 as pointers to design/program/finish/; fix the links and doc checks. Target: design/docs markdown under 1,500 files.
- H1 (last, when no lane cites old docs): AGENTS.md ≤ 150 lines, build_map.md ≤ 600 lines (history to the archive), one perf document (with Lane 1's agreement via its Inbox), and ONE INFERENCE law ≤ 150 lines folding INFERENCE_LANES.md (567 lines), design/inference-workflows/ (56 files) and INFERENCE_GOAL.txt. Write the INFERENCE law around what actually worked in this program: opportunity grounded in a live owner → player outcome with a direct check → grouped implementation → claim-relevant review when useful. A new agent must be able to find where the game stands in five minutes.

=====================================================================
6A. SOURCE COVERAGE AND QUALITY
=====================================================================
Consult `SOURCE_COVERAGE_2026-10-29.md` for completed reads and `INTEGRATION_COVERAGE.md` for current player outcomes and limits. Do not reopen completed coverage without a material change. Keep the technical and player quality bar in README §5.7 and the critical-owner map on this board; use the live owner and direct evidence for any material claim. Full source coverage does not mean every system is at bar or that gameplay is accepted.

=====================================================================
7. COVERAGE FINDINGS AND INFERENCE
=====================================================================
- Resolve material findings already recorded in the source-coverage and integration notes through their live owners. Do not create a second audit queue.
- INFERENCE remains depth, not bolt-ons: deepen a thin or broken owner with a player-facing reader. When assigned, define each outcome in player words with owner paths and a direct done check; group work by shared cause and update the board. There is no required provider, brainstorm size, reviewer sequence or rotation quota.

=====================================================================
8. TRAPS
=====================================================================
Every new persistent field needs a save migration and a reload test. Single writers: economy→credits, factions→reputation, cargo→cargo — emit intents. New player text goes through the localization pipeline. Git-bash sed strips CRLF — check git diff --numstat after scripted edits. Never write under design/program/vm-drop/. Never use git add -A, commit -a, worktrees, tree-wide reset/restore/checkout/clean/stash, or --force. Run the checks relevant to the change and coordinate heavy suites. Browser test servers set SPACEFACE_PLAYER_STORE_DIR=''.

=====================================================================
9. YOU ARE FINISHED WHEN — AND ONLY WHEN
=====================================================================
- Every assigned player-facing outcome is implemented, reachable and directly checked.
- Material defects and findings are fixed.
- Your Defects section is clear. Unresolved material outcomes stay OPEN and prevent whole-lane completion.
- A stranger can boot New Game, play the first hour, dock, trade, fly the story toward its ending, and read the world as one game; support that claim with relevant route evidence and state what remains open.
- Changed 2D surfaces retain desktop and phone reachability and legibility; exercise relevant controls for changed claims.
- Assigned INFERENCE outcomes are shipped; no reviewer-count, system-reread or batch-review quota is a finish condition.
- The razor and relevant documentation work are complete; doc/link checks support the actual claims. Any final independent review is claim-relevant under README §5.3, not a fixed batch ritual.

Record the outcome and material limits in the existing board or integration record.
