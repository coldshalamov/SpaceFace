<!-- LIFETIME: STABLE -->
# The Finish Program — three lanes to a finished, smooth, beautiful SpaceFace

**Owner direction, 2026-10-28.** This folder is the plan for the rest of the game. It supersedes
`build_map.md`, `program-dispatch --next`, `FINISH_LANES.md` and `LANDED_REVIEW.md` **as the place
an agent gets its job** until every lane board below reads finished. Those files stay as detail
references (a lane board names a build-map row; the row's prose in `build_map.md` is the spec).

**Current integration direction (user, 2026-10-29).** For this integration campaign, the user requests broad game finishing with most coverage and implementation performed by GPT-6 Luna, with Codex as controller/integrator. This updates execution method for this campaign and supersedes the fixed Codex batch-review cadence in §2.3, provider quotas and review rituals in §§5–6, and conflicting instructions copied into lane prompts. The 2026-10-28 owner rulings about game quality, technical contracts, route outcomes and measurement targets remain in force.

| File | What it is |
|---|---|
| this README | the diagnosis, the owner rulings, the path-ownership map, the shared protocol, the finish line |
| [`INTEGRATION_COVERAGE.md`](./INTEGRATION_COVERAGE.md) | 2026-10-29 whole-game integration coverage, repairs, current verification limits and final review scope |
| [`TOOLS.md`](./TOOLS.md) | optional terminal CLI examples last smoke-tested 2026-10-28 |
| [`LANE_1_MACHINE_AND_PICTURE.md`](./LANE_1_MACHINE_AND_PICTURE.md) | **high-complexity lane, needs taste, gets the agent with the most usage**: performance, the renderer, loading, assets, VFX, the look |
| [`LANE_2_FIGHT_AND_SIM.md`](./LANE_2_FIGHT_AND_SIM.md) | medium lane: combat, Crucible/Swarm, the Hand, AI, physics, simulation cost, code and test consolidation |
| [`LANE_3_WORLD_GLASS_HOUSE.md`](./LANE_3_WORLD_GLASS_HOUSE.md) | medium lane: Adventure world, economy, story, every 2D screen and the HUD, audio, and the document razor |
| [`PROMPT_LANE_1.md`](./PROMPT_LANE_1.md), [`PROMPT_LANE_2.md`](./PROMPT_LANE_2.md), [`PROMPT_LANE_3.md`](./PROMPT_LANE_3.md) | the copy-paste prompt that starts each lane's agent |

Each lane board is written by **its own lane only**. That is what lets three agents share one
checkout: no two lanes write the same file.

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
4. **The lane board is the job.** Lanes do not run `program-dispatch --next`; it would hand all three
   lanes the same review. The board's ordered list is the job, then the lane's own audit findings,
   then its INFERENCE lines.
5. **Frontend ownership.** The ORRERY lane's 2026-09-26 claim has lapsed (its handoff is dated
   2026-09-28). `src/ui/**` and `styles/**` belong to Lane 3, except the loading/boot files Lane 1
   owns (§3). `design/frontend/ORRERY.md` remains the design direction.
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

## 3. Path ownership — who may write what

Three agents share one checkout and never use worktrees (`AGENTS.md` §3). Ownership is by path:

| Lane | Owns (writes freely) |
|---|---|
| **1 MACHINE & PICTURE** | `src/render/**` (incl. `vfx*.js`, `render/vfx/**`, `adaptiveQuality.js`, `bloom.js`, `partsLibrary.js`, `packageCpuDetach.js`), `src/core/` frame and boot pipeline (`presentationRunner.js`, `simulationRunner.js`, `simLane*.js`, `wholeSimBrowserWorker.js`, `renderUpdatePhase.js`, the loop), `src/main.js`, the loading/boot UI (`src/ui/boot*.js`, `src/ui/loading*.js`, `src/ui/introSignalRemixBoot.js`, the loading CSS they own), `src/testing/**` (removal from the retail graph), `src/data/lookMoods.js`, `src/data/modelTruth*.js`, `assets/**`, `tools/blender/**`, `electron/**`, `index.html`, `scripts/build-bundle.mjs`, `scripts/probe-*.mjs` perf probes, `vendor/**` |
| **2 FIGHT & SIM** | `src/systems/**` combat, flight, swarm, crucible, physics, tether/Massline, weapons, enemies, spawn and AI files (everything in `src/systems/` not listed for Lane 3), `src/ai/**`, `src/combat/**`, `src/core/physics*.js`, `src/core/flight/**`, `src/core/registry.js` and `src/runtime/authoritativeSystemManifest.js`, `src/sim/**`, `src/balance/**`, `src/matter/**`, `src/sports/**`, combat/enemy/weapon data in `src/data/`, `test/` infrastructure and `package.json` **scripts block**, CI workflows |
| **3 WORLD, GLASS & HOUSE** | `src/ui/**` and `styles/**` (except Lane 1's boot/loading files), `src/systems/` world/economy/story files (`world.js`, `economy.js`, `missions.js`, `npcJobsRuntime.js`, `lawSecurity.js`, `encounterDirector.js`, `traffic.js`, `onboarding.js`, `automation.js`, story/faction/career/market/trade/station systems), `src/world/**`, `src/story/**`, `src/careers/**`, `src/economy/**`, `src/missions/**`, `src/contracts/**`, `src/characters/**`, `src/localization/**`, `src/audio/**`, `src/save/**`, `src/presentation/**`, `src/response/**`, world/story/economy data in `src/data/`, all of `design/`, `docs/`, `build_map.md`, `AGENTS.md`, `CLAUDE.md`, nested `AGENTS.md` files |

Rules:

- **A file you do not own:** if your packet needs a small edit there (an import, a hook, one call
  site), make it minimal, commit it alone by pathspec, and append one line to the owning lane's board
  **Inbox** saying what you changed and why. A larger change goes to the owner's Inbox as a request.
- **A file on the border** (a `src/systems/` file nobody named, a data file used by two lanes):
  the first lane that needs it takes it and writes the path into its board's *Claimed paths* list.
- **Tests follow the code.** Each lane edits the tests of the code it owns. Lane 2 owns the runner,
  `package.json` scripts and CI.
- **Shared ledgers.** `INFERENCE_IDEAS.md` is frozen as history (802 SHIPPED). New INFERENCE lines
  live in each lane board. The demo defect ledger (`DEMO_READINESS_2026-09-20.md` §6) is split into
  the three boards' **Defects** sections for the duration of the program; a defect you see in another
  lane's paths is one line in that lane's Inbox. A defect neither fixed nor logged is still the one
  unacceptable outcome (`AGENTS.md` §7).
- **External CLIs edit inside your owned paths only.** Every packet you hand Codex, Grok, Gemini or
  OpenCode lists the paths it may touch and forbids everything else, forbids commits, and forbids
  `git add -A`, stash, reset, checkout and clean.

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
The current controller owns scope, integration, conflict handling, exact-path publication, and the final claim. Use GPT-6 Luna for most bounded source coverage and implementation, as requested by the user. Assign concrete player-visible outcomes, exact owned paths, existing interfaces to preserve, and a done condition; use direct work for integration or narrow edits where that is faster. Do not create parallel implementations of an active or completed task.

### 5.2 One outcome, start to finish
1. **Select.** Take the next ordered item on the owning lane board. Use the smallest scope that can close a player-visible outcome; a separate packet brief is optional when the board already makes scope and acceptance clear.
2. **Build and integrate.** Use GPT-6 Luna for the bulk of investigation and implementation. The controller owns integration into the shared checkout, preserves concurrent work, and reconciles the result with the live source owner and active contracts.
3. **Verify directly.** Run the smallest check that establishes the claimed result at its relevant layer: a focused behavior check for an invariant, the normal player route for player-facing behavior, and a matched measurement for a performance claim. Run `npm run check:baseline` when the change could plausibly break what it touches. Gameplay batches still follow §2.11. After a failure, change the relevant cause before repeating the same check.
5. **Land.** Commit exact owned paths and push `origin master` under §3. Preserve the shared-tree, fetch/merge, and exact-path rules there. Update the owning board in the same push.

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

### 5.6a There is no such thing as "pre-existing"
"Pre-existing", "unrelated", "out of scope", "not my change", "flaky" and "known issue" are not reasons
to leave anything broken; they describe work nobody has done yet. Every broken thing an agent sees — red
test, console error, clipped screen, wrong number, dead control, silent sound, stand-in model, hitch, bad
player text — is fixed in that sitting when it is in the agent's paths (bugs before features), or becomes
one line in the owning lane's Inbox, which that lane clears before new rows. Every sitting also *hunts*:
play the area's default route with the console open, run the owned suites, read nearby code with a
reviewer's eye. Reviewers and Codex report broken things near the diff, not only ones the diff caused.
No status report lists a broken thing that was noticed and left.

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
