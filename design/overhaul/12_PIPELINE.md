# 12 — The pipeline: how the overhaul gets built

**Director, 2026-11-19.** The owner: *"form an agentic pipeline with adversarial reviews to chug through
the game and deliver the best game from this repo"* and *"make sure you or your subagents personally
pass and review everything that gets merged and do little fixes so it's all just like you would do it,
but the other agents save usage as long as you fix problems."* This page is how that runs. The board at
the bottom is the live state; `11_ORDER_OF_WORK.md` keeps the order, `build_map.md` §40 the productions.

## 1. Who does what

| Agent | Takes | Never |
|---|---|---|
| **Director** (Claude Opus) | Writes every packet. Reads every diff before it lands, fixes the small things, looks at every visible change on screen, commits, pushes, keeps this board. Taste calls and the hard seams. | Lets a change land unread. |
| **Sonnet subagents** (≤ 2 at once) | Judgment-heavy builds: HUD and screens [FE], feel, copy, review-finding fixes that need reading around. | Git writes. Opus subagents are never used. |
| **Devin SWE-2 Max** (`scripts/fleet/run.mjs <ID> devin1/devin2`) | Scoped engineering packets with a named seam: sim systems, data tables, benches, tests, run-and-report. Effectively unlimited. | Frontend (owner rule 2026-11-11) or taste. |
| **zcode GLM-5.3** (GLM-5.3-Flash when it must see a frame) | Fully specified small packets, mechanical fixes, recon, reading a frame aloud. Beta: it writes LF into CRLF files (the harvest restores CRLF); judge it by its edits, not its exit code. | Git writes. |
| **Codex gpt-6.2-sol** | **xhigh**: the adversarial review of every batch before it lands. **high**: engine, simulation, load, performance and 3D/Blender builds (the owner's split). | |

## 2. The line every change walks

1. **Packet.** `design/program/fleet/packets/<ID>.md`: the design section it serves, the player-visible
   *done when*, the allowlisted files, the tests, and the pipeline header (no git writes — this
   overrides `PROTOCOL.md`'s commit step).
2. **Snap.** `node .devshots/director/pipe.mjs snap <ID> [--dirty-text] -- <allowlist>` records the
   tree before the builder starts.
3. **Build.** The agent edits the working tree and reports.
4. **Harvest.** `pipe.mjs touched <ID>` lists every path that changed (anything outside the allowlist
   is explained or dropped), then `pipe.mjs harvest <ID> [--onto=<earlier stage>]` replays exactly the
   builder's lines onto HEAD with `git merge-file`. Other agents' uncommitted work stays out. A
   conflict means the builder leaned on someone else's unfinished code: the director ports the idea
   onto HEAD's shape by hand.
5. **Adversarial review.** Codex xhigh reads the patch and its intent
   (`.devshots/director/codex-review.mjs`). **Convergence rule:** a finding blocks only if the batch
   breaks a test, the ordinary player route, or its own claim; pre-existing or scope-widening findings
   become board rows. One re-review, on the delta only. Clean pieces of a batch land without waiting
   for the rest.
6. **Director pass.** Read the whole diff; fix the small things directly; anything visible gets a real
   frame (`node scripts/ui-bench.mjs --shot=<id>` for screens, a headed probe through the game lock for
   flight) that the director opens and judges.
7. **Clean-HEAD check.** `node .devshots/director/headcheck.mjs --stage=<dirs> -- <tests>` runs the
   tests that import each changed module against HEAD plus only the staged lines — a green working
   tree can hide a red HEAD. `check:sim` runs there too when the sim can move; a moved hash follows
   COMMON_BUGS §8/§10d, never a quiet re-record.
8. **Land.** `pipe.mjs stage <ID>`, `git diff --cached --name-status` shows only our paths, commit with
   no pathspec. Push by merge, never rebase or force.
9. **Board.** The row below moves; the inspection ledger records what was seen.

## 3. What the owner sees

Each landing is reported in plain words: what changed in the game, what was checked, what is left.

## 4. Board

| ID | What the player gets | Builder | State |
|---|---|---|---|
| SHARP-01 | A sharp picture: integrated graphics draw at the screen's native pixels again | Director | **Landed** — pin `test/sharp-picture-native-dpr.test.mjs` (e9b9ab5118). Measured headed on the owner's laptop: native 1920×912 held the same 30 Hz present rate as 1×. |
| T2 | No flat brown fog cone ahead of every ship | Director | **Landed** fbdf528e84 |
| T1 + T1C | The rope never refuses; the HUD says who moves (TOW / TUG / ANCHOR); briefs teach it | Director + Sonnet | Harvested; clean-HEAD green except known reds; Codex delta review running |
| T3/T4 + B2C | Fodder take a thrown hull instead of sidestepping it; the starter pistol hits like a gun (NPCs keep theirs) | Director + Sonnet | Same batch as above |
| B3C | Death and loading words: Gauntlet named right, dart and crush kills named | zcode | Building |
| T8 + calm preset | No "First light" modal; one-press calm preset in Settings › Access | Sonnet (next) | Waiting for a free Sonnet |
| OVH-04 | A Swarm run lives in its own space — no campaign anything inside it | Codex | Building |
| OVH-09a | Loose rocks rest; nothing spawns onto a body or a collision course | Devin | Building |
| OVH-09b | Pilots brake for each other instead of pinballing | — | **Hold:** another agent has uncommitted crossing-brake work in `src/ai/maneuver.js`; take it after that lands |
| OVH-08a | Every gun measured on damage against kick | Devin | Building (bench only) |
| OVH-08b | Guns tuned to the curve; heat as rhythm (feathering, per-mount lockout) | — | After OVH-08a |
| LOOK-THREAT | Enemies read as lit hulls, not white smudges in red rings (the 2D threat plates go) | — | Packet next; seen in the native frame `.devshots/director/sharp/run1/B-manual-native-full.png` |
