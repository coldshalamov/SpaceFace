<!-- LIFETIME: STABLE -->
# The Finish Program — three lanes to a finished, smooth, beautiful SpaceFace

**Owner direction, 2026-10-28.** This folder is the plan for the rest of the game. It supersedes
`build_map.md`, `program-dispatch --next`, `FINISH_LANES.md` and `LANDED_REVIEW.md` **as the place
an agent gets its job** until every lane board below reads finished. Those files stay as detail
references (a lane board names a build-map row; the row's prose in `build_map.md` is the spec).

| File | What it is |
|---|---|
| this README | the diagnosis, the owner rulings, the path-ownership map, the shared protocol, the finish line |
| [`TOOLS.md`](./TOOLS.md) | verified terminal commands for Codex, Grok, Gemini, OpenCode and Claude (smoke-tested 2026-10-28) |
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
3. **Codex is the reviewer of record.** The Codex batch review (every ~5 packets, §5.4) replaces
   `LANDED_REVIEW.md` rows: lanes add no new review rows. The 8 open reviews are assigned in the lane
   boards as day-one work and the file retires when they are gone.
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
11. **No playtest gates** (standing ruling 2026-10-04). Nothing waits for the owner to play. The
    player-truth gate runs once per batch of ~5 packets on the modes the batch touched, not per commit.

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

**The game is finished when** all three boards read finished: every listed row closed in code on
the default route, every owned system reviewed and brought to the professional bar (§5.7), every
Defects section empty, every INFERENCE line shipped, the bars above at or
past their target, the Codex batch review of the final batch green, and the document surface cut to
what an agent can read in one sitting (§7).

## 5. The shared working protocol (every lane, every packet)

### 5.1 You are the manager
The lane agent plans, assigns, reviews and commits. It does as little hands-on token-heavy work as
possible. Implementation goes to subagents and terminal agents; the lane agent keeps its context for
judgment.

### 5.2 One packet, start to finish
1. **Brief.** Write `.devshots/finish/<lane>/<packet-id>/PACKET.md` (git-ignored): the player problem
   in player words, the owned paths, the done-when as a number or a test, what not to do (the traps).
2. **Build.** One implementer subagent (Claude), or a terminal agent for grunt work (§5.5). At most
   **two implementer subagents** run at once per lane — concurrent Claude implementers die on the
   session usage limit. Terminal agents run in the background and do not count.
3. **Review ×3, in sequence.** Three reviewer subagents, one after another, each reading the diff and
   the live owner fresh:
   - **R1 correctness** — bugs, regressions, determinism, single-writer law, save compatibility, perf
     cost per frame.
   - **R2 experience** — every way it could be better for the player: more readable, more alive, more
     on-brand (`design/VISION.md`: *"Holy shit, I did that"*), more connected to systems that already
     exist. It lists *every* suggestion, including the expansive ones.
   - **R3 ambition and finish** — what a studio would ship instead; what is still stand-in, silent,
     unwired or cheap; whether the frame budget holds.
   After each review the implementer applies everything worth applying before the next review starts.
4. **Prove.** The done-when number or focused test, plus `npm run check:baseline` when the change
   could plausibly break something. Gameplay batches run player-truth per §2.11.
5. **Land.** Commit your exact paths (`git add -- <paths>` then `git commit -m "..." -- <paths>`), read
   `git show --stat HEAD`, fetch, merge if the remote moved (never rebase, never reset, never force),
   push `origin master`. Update your board in the same push.

### 5.3 Every ~5 packets: Codex is the final authority
Hand the batch's commit range to Codex (GPT 6.1 Sol, extra-high reasoning; `TOOLS.md`). Its job is
not "is this technically correct" — it is: **find what is wrong, fix it, and make the work maximally
ambitious.** Where an implementer took the lazy or less impressive version, Codex builds the impressive
one. Codex edits inside the batch's owned paths only and does not commit; the lane agent reads the
Codex diff, runs the proofs, and lands it. Codex's verdict on a disagreement wins unless it breaks a
contract in `ARCHITECTURE.md` or a measured bar.

### 5.4 Every ~5 frontend packets: Claude Sonnet reviews the screens
For batches that changed 2D screens, HUD or menus, run Claude Sonnet 5.5 at extra-high effort in the
terminal (`TOOLS.md`) over the batch: it shoots each changed screen with
`node scripts/ui-bench.mjs --shot=<id>`, opens the PNGs, judges them against
`design/frontend/ORRERY.md` and `ORRERY_RUBRIC.md`, `--walk`s the controls, and fixes what it sees.

### 5.5 Who does what
| Work | Who |
|---|---|
| Planning, judgment, briefs, merging reviews, landing | the lane agent |
| Implementation needing care | Claude subagents (≤ 2 at a time) |
| The three reviews per packet | Claude subagents, sequential |
| Token-heavy grunt work — reading every line of a module, census, mechanical edits, test conversion, doc moves, data authoring | **split evenly** between Grok 4.7 extra-high (`cursor-agent`) and Gemini 3.8 Flash High (`agy`) |
| Frontend and 3D implementation (screens, CSS, layout, Blender/Forge scripts, shader code) | DeepSeek V4.1 Flash Max through OpenCode (Go provider) |
| Final review + ambition pass every ~5 packets | Codex GPT 6.1 Sol extra-high |
| Frontend batch review every ~5 frontend packets | Claude Sonnet 5.5 extra-high in the terminal |

Run terminal agents in the background with a timeout, several in parallel on disjoint paths. Start
`cursor-agent` runs a few seconds apart (two starting together hit EPERM on its config file). A
terminal agent's output is a draft: the lane agent reviews it like any other diff.

### 5.6 Never stop
The owner does not read code and cannot finish leftover work. A packet that is blocked is skipped,
logged in one line on the board, and the next packet starts. "Blocked" means a missing file, system
or asset — and building the missing thing is the work. When the board's list drains, the lane runs
its audit findings, then its INFERENCE lines, then re-measures the bars, then audits again. A lane
is finished only when §4's line is met for its rows.

### 5.6a There is no such thing as "pre-existing"
"Pre-existing", "unrelated", "out of scope", "not my change", "flaky" and "known issue" are not reasons
to leave anything broken; they describe work nobody has done yet. Every broken thing an agent sees — red
test, console error, clipped screen, wrong number, dead control, silent sound, stand-in model, hitch, bad
player text — is fixed in that sitting when it is in the agent's paths (bugs before features), or becomes
one line in the owning lane's Inbox, which that lane clears before new rows. Every sitting also *hunts*:
play the area's default route with the console open, run the owned suites, read nearby code with a
reviewer's eye. Reviewers and Codex report broken things near the diff, not only ones the diff caused.
No status report lists a broken thing that was noticed and left.

### 5.7 Beyond the plan: the professional review of every system
**The plans do not contain the whole finish.** Agents built this game one packet at a time; few
systems got the most professional implementation on the first pass, and the repo has changed under
all of them since. So every lane also reviews and improves **every system it owns** to a studio bar,
whether or not a row names it. Agents are expected to use their own intelligence, taste and creativity
here — inspect, judge, rewrite where it is worth it. This is not optional cleanup; it is half the job.

- **The bar (judge each system against all of it):** it does what a player expects, every time
  (no edge-case breakage, no stand-ins, no silent paths); one clear owner and one way to do each thing
  (no duplicated or competing implementations); cheap per frame/tick at a 150-body crowd; deterministic
  where it must be; readable to the player (they can see what it did and why); connected (its facts
  have readers, its events have consequences); data-driven where content varies; tested by behaviour,
  not by source text; small enough that an agent can hold it in mind (split what is not).
- **How:** each lane lists its systems on its board (*Systems review* section), ranked by how much a
  player touches them. For each: (1) a Grok or Gemini read of every line produces the inventory and
  findings; (2) for the lane's **critical systems** (named on each board) Codex GPT 6.1 Sol extra-high
  does a **deep review** — reads the whole system and its callers, scores it against the bar, fixes the
  defects it is sure of, and writes a ranked list of the improvements that would make it professional;
  (3) the lane turns that list into packets and runs them through the normal loop. Run two or three
  Codex deep reviews at once on disjoint systems — Codex draws on a separate limit — while the lane's
  own subagents implement the previous system's packets.
- **Freedom:** a system that fails the bar badly may be rewritten (ruling 6). Before rewriting, write
  one paragraph on the board: what is wrong, what the replacement is, how the default route stays
  playable during the change, how it will be proven better.
- **Order:** each lane interleaves this with its planned waves from the start — at least one system
  under review at all times — and finishes it before the lane can be called finished.

## 6. INFERENCE in this program

INFERENCE is how agents apply their own taste to make the game feel real, full, fun and mature —
small on-brand changes everywhere a player looks. It is **depth, not bolt-ons** (owner ruling
2026-10-21): diagnose what is thin, missing detail, or broken in an existing owner and deepen it;
never invent a clip-saver feature with no reader.

- **Seeding.** Each lane's first INFERENCE packet is a brainstorm: two subagents and one Grok and one
  Gemini run each walk the lane's owned code and the ordinary route, and each proposes candidate
  lines in player words, grounded in a named live owner. Three sequential reviewer subagents cut the
  generic ones and sharpen the rest against `design/VISION.md`, `design/CONTENT_BIBLE.md` and the
  fiction; Codex then makes the survivors more ambitious. The result is admitted to the board:
  Lane 1 ≈ 20 lines, Lane 2 ≈ 35, Lane 3 ≈ 45.
- **A line** = `| ID | the problem in player words | owner paths | done check (fixed-seed number, focused test, or a look at the real screen) | don't-do | status |`.
- **Doing lines.** Group 3–5 lines that share a cause or owner into one packet; run the normal
  packet loop (§5.2) and the Codex batch review.
- **Rotation.** When the lane's lines are all shipped, brainstorm the next 15–20 the same way, from
  what the lane now sees on the route. The catalog is never "empty"; the game is the catalog.

## 7. The razor (Lane 3, with every lane's consent by construction)

- **Archive, don't delete history:** `git mv` superseded material under `design/archive/` and
  `docs/archive/`: the dated run folders (`agentic-run-oct18`, `agentic-run-oct20`,
  `world-depth-2026-10-02`, `world-experience-2026-10-2x`, `demo-maturity-2026-10-17`,
  `maturity-cloud-2026-10-20`, `research-2026-10-02`, `design/finish-expansion-2026-09`), superseded UI
  briefs, `roadmap/receipts`, `docs/ui-polish`, `docs/perf-evidence`, `docs/handoffs`, the ~59 `PERF_*`
  documents (folded into one `design/perf/README.md`), and the 56-file INFERENCE workflow folder (folded
  into one ≤ 150-line law).
- **Never** touch `design/program/vm-drop/`. Never move a file a lane prompt or board in this folder
  still cites until that lane's board stops citing it.
- **End state:** `AGENTS.md` ≤ 150 lines, `build_map.md` ≤ 600 lines (history in the archive), one
  perf document, one INFERENCE law, `npm` scripts ≤ 150 behind a manifest runner (Lane 2), and every
  link checker green.
