<!-- LIFETIME: STABLE -->
# The Finish Program — three lanes to a finished, smooth, beautiful SpaceFace

**Owner direction, 2026-10-28.** This folder is the plan for the rest of the game. It supersedes
`build_map.md`, `program-dispatch --next`, `FINISH_LANES.md` and `LANDED_REVIEW.md` **as the place
an agent gets its job** until every lane board below reads finished. Those files stay as detail
references (a lane board names a build-map row; the row's prose in `build_map.md` is the spec).

**Current execution.** The controller owns integration of the working tree, plans and open PRs. The latest owner direction calls for 5–10 useful GPT-6.1 Terra/Sol departments, using terminal workers alongside the three available native worker slots. Assign substantial, disjoint work and preserve concurrent edits under §5. Keep the owner's Chrome and VLC open. Prefer short, purposeful play and checks that resolve a named question. ChatGPT Pro creation jobs remain on hold while the intended Pro account is usage-locked; do not substitute Work or another model.

**Final release review, owner direction November4.** After finishing the product outcomes and
incorporating the three additional commissions, obtain three successive independent subagent
release-readiness approvals of the coherent candidate. Each reviewer must assess the actual
player experience against this program, report concrete shortcomings, and withhold approval for
material unfinished work. Fix those findings before restarting the approval sequence; material
candidate changes invalidate prior approvals. Keep the reviews blind to earlier verdicts where
practical. This is the owner's final review requirement, not a recurring gate for every patch;
reviewer agreement does not itself prove correctness, literal perfection or market competitiveness.

| File | What it is |
|---|---|
| this README | the diagnosis, the owner rulings, the path-ownership map, the shared protocol, the finish line |
| [`INTEGRATION_COVERAGE.md`](./INTEGRATION_COVERAGE.md) | 2026-10-29 whole-game integration coverage, repairs, current verification limits and final review scope |
| [`STUDIO.md`](./STUDIO.md) | Controller, departments, asset processing, worker handoffs and current execution capacity |
| [`TOOLS.md`](./TOOLS.md) | optional terminal CLI examples last smoke-tested 2026-10-28 |
| [`SMOOTH_PROGRAM_2026-11-05.md`](./SMOOTH_PROGRAM_2026-11-05.md) | **owner priority 2026-11-05: PLAYABLE FIRST** — why the 3D world froze while the HUD kept moving, the measurement kit, landed rounds, the ranked performance backlog, owner decisions and the smoothness finish line |
| [`MASTER_PLAN.md`](./MASTER_PLAN.md) | **owner direction 2026-11-06: the master plan** — 29 campaigns (engine, ship, world, look, process) + how agents must work (diagnose first, no tunnel vision, 90%-wonky is a defect) + the launch prompt |
| [`chaos/`](./chaos/README.md) | **owner direction 2026-11-06: CHAOS** — GTA-style physics-chaos open world: reaction matrix (the "feels alive" stopping condition), ~45 front-loaded gameplay/UX units, three lanes with prompts |
| [`swarm/`](./swarm/README.md) | **owner priority 2026-11-05: SWARM** — the vision, configuration audit and plans S1–S16 for Crucible Swarm (look and feel; recommends holding queued Lane 2 Swarm breadth until these land) |
| [`LANE_1_MACHINE_AND_PICTURE.md`](./LANE_1_MACHINE_AND_PICTURE.md) | **high-complexity lane, needs taste, gets the agent with the most usage**: performance, the renderer, loading, assets, VFX, the look |
| [`LANE_2_FIGHT_AND_SIM.md`](./LANE_2_FIGHT_AND_SIM.md) | medium lane: combat, Crucible/Swarm, the Hand, AI, physics, simulation cost, code and test consolidation |
| [`LANE_3_WORLD_GLASS_HOUSE.md`](./LANE_3_WORLD_GLASS_HOUSE.md) | medium lane: Adventure world, economy, story, every 2D screen and the HUD, audio, and the document razor |
| [`PROMPT_LANE_1.md`](./PROMPT_LANE_1.md), [`PROMPT_LANE_2.md`](./PROMPT_LANE_2.md), [`PROMPT_LANE_3.md`](./PROMPT_LANE_3.md) | the copy-paste prompt that starts each lane's agent |

Lane boards organize outcomes. Current assignments and exact path ownership are coordinated by the controller; preserve concurrent work in the shared checkout.

---

## 1. The diagnosis (2026-10-28, four read-only scouts + the repo's own measurements)

**The game is enormous and thin.** ~1.27 M lines of JS in `src/` (261 registered systems, 205 in
the sim update order), 4,850 test files, 774 npm scripts, ~3,600 markdown documents of which roughly
5 % carry authority. `renderer.js` is 36,741 lines with a 10.9k-line `init()`; `vfx.js` 18,470;
`partsLibrary.js` 18,565. 3,340 commits landed in the last two weeks, almost all of them content.
The plan surface ran out of rows before the experience ran out of gaps (`build_map.md` §31.0 says the
same: *"breadth of a ten-year live game, connective tissue of a vertical slice"*).

**It does not run.** Measured on the owner's laptop (Intel Core Ultra 7 155U, Intel iGPU, ANGLE/D3D11):

| Measurement (source) | Now |
|---|---|
| Crucible active round, ~150 entities — frame interval (`ASSET_PERFORMANCE_PROGRAM.md` §7.1) | **p50 86 ms (≈12 fps), p95 125 ms** |
| Same round — GPU time per frame (timer queries) | p50 23.7 ms, p95 65 ms → **the main thread is the limit, not the GPU** |
| Same round — where the main thread goes (§7) | sim step 32 % (physics 9 %, contact-impact emission ~8 %, tactical AI 3 %); `WebGLRenderer.render` 16 % (`setProgram` 7.9 %); `unreadyDrawGuard` 12.5 %; native/DOM/submit 32 % |
| Crucible under the player-truth harness (D269) | p50 279 ms, p99 4,606 ms, a 5.4 s freeze — observer-inflated, but the demo's first button |
| Loading/draft freezes (§7.2) | 5.0 s (fixed 10-27, unconfirmed), 2.5 s, 2.2 s, 2.1 s, 1.9 s, 1.6 s, four of 1.0–1.4 s |
| Adventure flight, seed 4242 (`.devshots/frame-solid/2026-10-21…`) | p50 23.2 ms, p95 53.5, p99 109.4, longest 324 ms; 142 frames > 50 ms in 66 s |
| Adventure long session (D268) | "Graphics interrupted" terminal pane after ~172 s on a contended host |
| Load | 28 MB of minified JS in the eager game closure; deployed route streams 146 MB (84.7 MB GLB) before first flight; launch→flight 11.6 s local warm, 43.9 s deployed |

**The levers already exist and are switched off.** Agents built the fixes, then rules kept them off:

- **Whole-sim worker** (`src/core/simLaneMain.js`, `wholeSimBrowserWorker.js`, `?simLane=worker`):
  9 stages landed, golden digests bit-identical worker vs main, independent review **SHIP** — held
  opt-in only because the wire hop measured p95 0.85 ms against a self-imposed 0.5 ms bar
  (`design/perf/STRUCTURAL-HORIZON.md`). The sim costs ~27 ms of an 86 ms frame on the main thread.
- **Opaque BatchedMesh path** (`renderer.js` `_opaqueBatchEnabled = false`, gated PQ-129.12).
- **`mergeGroups`** in the render-package compiler — enabled for 1 of 414 packages.
- **Integrated-GPU quality tier and dynamic resolution** (`src/render/adaptiveQuality.js`) — never
  auto-applied because "do not lower default quality".

## 2. Owner rulings for this program (2026-10-28)

These come from the owner's request of 2026-10-28 and outrank older policy text (user direction is
first in `AGENTS.md` §4). `AGENTS.md` and `CLAUDE.md` carry pointers to this section.

1. **Smooth beats lavish.** The default quality on a machine is the highest tier that holds the frame
   budget on that machine. Auto-detect, auto-apply, and use dynamic resolution with hysteresis bands
   (never a continuous oscillating ratio). Small graphical sacrifices are allowed — fewer taps in the
   composite, a lower render scale on integrated GPUs with sharpening, fewer shadow casters, 1024 maps
   on props a few hundred pixels tall, a capped light pool, cheaper particles — when a within-session
   A/B proves the frame win **and** a look check (the real screen at the gameplay camera, opened and
   judged) proves the picture still reads as SpaceFace. Deleting authored content to pass a number is
   still forbidden; budgeting it is the job. Record every sacrifice in `docs/visual-assets/LOOK.md`.
2. **Measure on this machine.** The owner's laptop is the target. Perf A/B runs here, within one
   session (alternate modes in rotating blocks inside one flight; print host busy). This replaces
   "never produce captures on this box" for the program. Contention is reported, never a reason to
   skip a measurement.
3. **Review the claim, not a quota.** For this campaign, use §5.3: one independent review when it
   can change a fix, acceptance or significant risk. Do not schedule reviews by packet count or
   duplicate an active/completed review. Preserve any open `LANDED_REVIEW.md` item that still has a
   distinct current claim; the controller owns deciding whether its evidence remains material.
4. **The boards record the work.** The controller selects the next material outcome using the lane boards and current integration records.
5. **Frontend direction.** `design/frontend/ORRERY.md` remains the design direction. Current UI write sets are assigned by the controller (§3).
6. **Rewrites are allowed.** Porting, refactoring or rewriting a subsystem is allowed when it is
   measured better and the default route stays playable. Compatibility paths (`flight.js`, `ai.js`,
   the legacy physics backend) may be deleted once nothing on the default route imports them and their
   tests are ported. Test scaffolding comes out of the retail graph.
7. **Source-text pin tests do not block refactors.** About 365 tests read `src/` text with regexes. When
   one blocks a split, a perf change or a rewrite, convert it to a behaviour test or delete it in the
   same commit and say so in the body. Determinism goldens (`test/*.expected.json`) are still never
   re-recorded just to pass.
8. **The sim worker's 0.5 ms wire bar is not a ship blocker.** Flip `simLane=worker` to default when a
   within-session A/B on this laptop shows the frame win and the parity/digest tests are green.
9. **INFERENCE is authorized in every lane** — about 100 new lines across the three boards (§6).
10. **The razor is authorized.** Lane 3 archives superseded documents, folders and scripts and shrinks
    the policy surface (§7). `design/program/vm-drop/` is remote-authoritative and off limits.
11. **No playtest gates** (standing ruling 2026-10-04). Nothing waits for the owner to play. Verify
    each player-facing claim at the smallest relevant route and layer; there is no fixed batch or
    per-commit player-truth cadence.

## 3. Path ownership

The controller assigns exact, non-overlapping write sets for current work; lane names organize the
backlog, not permanent subsystem locks. Inspect status and the relevant diff before editing, preserve
concurrent changes, and coordinate any actual overlap. Tests follow the affected owner. The controller
integrates and publishes exact paths under the shared-checkout rules in `AGENTS.md`.

## 4. The finish line (measured on this laptop, seed 4242, within-session A/B, host busy printed)

Lane 1's first packet re-records the baseline with today's build and writes it into its board. The
**floor** is the owner's ask (worst hitches 5× better, everything else at least 2×). The **target** is
"runs like Destiny 2 on this machine": no frame you can feel.

| Bar | Baseline | Floor | Target |
|---|---|---|---|
| Crucible active round, ≥150 entities, frame p50 | 86 ms | ≤ 43 ms | **≤ 16.7 ms (60 fps)** |
| Crucible round p99 / longest frame in round | 125 ms p95 / multi-second | ≤ 66 ms / ≤ 250 ms | **≤ 33 ms / ≤ 50 ms** |
| Swarm wave 15 stress (row 488) sim p95 | unmeasured | ≤ 20 ms | ≤ 8 ms |
| Adventure flight p50 / p99 / longest | 23.2 / 109.4 / 324 ms | ≤ 16.7 / ≤ 55 / ≤ 65 ms | **≤ 12 / ≤ 25 / ≤ 50 ms** |
| Longest main-thread task from Launch click to first flight frame (loading, draft, title) | 5,000 ms | ≤ 1,000 ms | **≤ 150 ms** |
| Loading-screen animation frame gap p99 (the animation the player watches) | visibly hitches | ≤ 100 ms | **≤ 34 ms, never a visible freeze** |
| Launch click → controllable flight, local warm | 11.6 s | ≤ 8 s | ≤ 5 s |
| Deployed first-load bytes before first flight / eager JS | 146 MB / 28 MB | ≤ 60 MB / ≤ 12 MB | ≤ 35 MB / ≤ 6 MB |
| 30-minute Adventure soak + one forced context loss | "Graphics interrupted" at ~172 s | zero terminal panes | zero terminal panes, zero frames > 250 ms after load |

**The game is finished when** all three boards read finished: every listed player-facing outcome is
implemented and directly checked on the default route; material defects and findings are fixed;
the completed source coverage is recorded in
[`SOURCE_COVERAGE_2026-10-29.md`](./SOURCE_COVERAGE_2026-10-29.md); each Defects section is empty;
the authorized INFERENCE outcomes are shipped; the product bars above meet their targets; and the
final build-map, requested last-300-commit review and documentation work are closed.
Source coverage documents what was read; it does not by itself mean every system is at bar or that
the game is accepted. There is no fixed batch-review gate.

## 5. The shared working protocol (every lane, every packet)

### 5.1 Controller and coverage
The current controller owns scope, integration, conflict handling, exact-path publication, and the final claim. Use the current model and staffing direction above. Assign concrete player-visible outcomes, exact owned paths, existing interfaces to preserve, and a done condition; use direct work for integration or narrow edits where that is faster. Do not create parallel implementations of an active or completed task.

### 5.2 One outcome, start to finish
1. **Select.** Take the next ordered item on the owning lane board. Use the smallest scope that can close a player-visible outcome; a separate packet brief is optional when the board already makes scope and acceptance clear.
2. **Build and integrate.** Use the current staffing direction above. The controller owns integration into the shared checkout, preserves concurrent work, and reconciles the result with the live source owner and active contracts.
3. **Verify directly.** Run the smallest check that establishes the claimed result at its relevant layer: a focused behavior check for an invariant, the normal player route for player-facing behavior, and a matched measurement for a performance claim. Run `npm run check:baseline` when the change could plausibly break what it touches. Gameplay batches still follow §2.11. After a failure, change the relevant cause before repeating the same check.
4. **Land.** Commit exact owned paths and push `origin master` under §3. Preserve the shared-tree, fetch/merge, and exact-path rules there. Update the owning board in the same push.

### 5.3 Review when it adds value
Use one independent, claim-relevant review when an unresolved question could materially change the fix, acceptance, or significant risk, or when a governing requirement calls for it. The controller checks the integrated result and its direct evidence. Do not run review sequences, repeat completed reviews, duplicate active investigations, add reviewer quotas, or require agreement across models. Incorporate material findings before landing; record unrelated defects in the owning lane Inbox.

### 5.4 Screen and visual claims
For a changed screen, directly exercise the changed controls on the real route; use `node scripts/ui-bench.mjs --walk` when available and relevant. For a visual claim, inspect the actual screen at the gameplay camera and fix visible defects. Use screenshots or specialist tools when the claim requires them; there is no fixed third-party reviewer or capture quota.

### 5.5 Tools and delegation
Use available tools and agents by fit to the concrete task. GPT-6 Luna is the default for most coverage and implementation in this campaign. Additional agents or terminal tools are optional, scoped to disjoint owned paths, and do not replace controller integration. There are no required provider ratios, third-party model quotas, or parallel-start rituals. A tool result is a draft until integrated and checked against the stated outcome.

### 5.6 Finish the assigned outcomes
The owner does not finish leftover agent work. A packet that cannot move is recorded with its next
concrete step, and independent work continues. When an assigned outcome closes, use the source
coverage and integration records to pick up material remaining findings and route gaps. Do not
repeat a completed source read, audit or review unless a new material delta could change the fix,
acceptance, authority or significant risk. A lane is finished only when §4's product outcomes and
remaining risks are honestly closed.

### 5.6a Discovered defects
A concrete material defect encountered in the assigned work is fixed or recorded with its owner and
next step. Do not dismiss a failure as pre-existing, or expand an assignment into an unrelated audit.

### 5.7 Source coverage and system quality
The 2026-10-29 source coverage index records full reads, explicit reuse and known coverage gaps in
[`SOURCE_COVERAGE_2026-10-29.md`](./SOURCE_COVERAGE_2026-10-29.md). The current player-facing results,
open defects and accepted limits are in [`INTEGRATION_COVERAGE.md`](./INTEGRATION_COVERAGE.md).
Use those records to avoid duplicating completed work and to find the live owner for a concrete
issue. Full source coverage is not a blanket review verdict: keep the real technical and player
quality bars in this README and the critical-owner maps on the lane boards, then check a material
claim against its live owner and direct evidence. Quality expectations remain: player-expected
outcomes, one authoritative owner, measured per-frame/tick cost, determinism where required, readable
cause and effect, connected readers, data-driven variation, behavior checks, and manageable code.
Do not create a per-system `UNREVIEWED → AT BAR` queue or require provider/model agreement.

## 6. INFERENCE in this program

INFERENCE applies the team's taste to make the game feel real, full, fun and mature. It is **depth,
not bolt-ons** (owner ruling 2026-10-21): diagnose what is thin, missing detail or broken in an
existing owner and deepen it; do not invent a feature without a player-facing reader. Use the live
route and the lane's existing material to identify a concrete opportunity when assigned or when an
open board outcome needs it. A line records the player problem, owner paths, direct done check,
constraint and status. Group related work by shared cause, verify the resulting player outcome, and
update the owning board. There is no required brainstorm provider, number of lines, review sequence
or rotation quota.

## 7. The razor (Lane 3, with every lane's consent by construction)

- **Archive, don't delete history:** `git mv` superseded material under `design/archive/` and
  `docs/archive/`: the dated run folders (`agentic-run-oct18`, `agentic-run-oct20`,
  `world-depth-2026-10-02`, `world-experience-2026-10-2x`, `demo-maturity-2026-10-17`,
  `maturity-cloud-2026-10-20`, `research-2026-10-02`, `design/archive/finish-expansion-2026-09`), superseded UI
  briefs, `roadmap/receipts`, `docs/archive/ui-polish`, `docs/archive/perf-evidence`, `docs/archive/handoffs`, the ~59 `PERF_*`
  documents (folded into one `design/perf/README.md`), and the 56-file INFERENCE workflow folder (folded
  into one ≤ 150-line law).
- **Never** touch `design/program/vm-drop/`. Never move a file a lane prompt or board in this folder
  still cites until that lane's board stops citing it.
- **End state:** one current front door makes the game's state and next work easy to find; active
  documents point to the right owners and outcomes; the performance and INFERENCE guidance has one
  clear home each; and the relevant compatibility checks for changed documentation pass. Line,
  file, and script counts are maintenance signals, not game-completion outcomes.
