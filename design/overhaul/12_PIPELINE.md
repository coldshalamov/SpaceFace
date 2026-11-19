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

**Codex is out of usage until 2026-11-24 15:52.** Per the owner's rule (never swap agents on a usage
limit), batches that still need its review are built, verified and **parked as commits on
`refs/heads/park/w3-foundry`** (made with a private index, so the shared tree and index are untouched).
Their changes are live in the working folder the owner plays from. On Codex's return: review the park
commits as one batch, fix, then land them on master.

**2026-11-19, the owner: "finish".** The three-batch cap is lifted: everything that does not need Codex
keeps being built, checked and parked. The Pilot Tree chain parks as successive commits on
`refs/heads/park/pilot-tree` (`park-one.mjs --base=park/pilot-tree`), each proven from its own export;
nothing stacks on `park/w3-foundry` (the Foundry there has open must-fixes).

| ID | What the player gets | Builder | State |
|---|---|---|---|
| SHARP-01 | A sharp picture: integrated graphics draw at the screen's native pixels | Director | **Landed** e9b9ab5118. GPU timers (2×2, owner's laptop, Low): native costs ~3 ms in a plain arena (9.5 vs 6.4 ms) and nothing measurable with the Foundry; 30 Hz holds either way. |
| T2 | No flat brown fog cone ahead of every ship | Director | **Landed** fbdf528e84 |
| T1 + T1C | The rope never refuses; TOW / TUG / ANCHOR; briefs teach it | Director + Sonnet | **Landed** 343cd4f569 |
| T3/T4 + B2C | Fodder take a thrown hull; the starter pistol hits like a gun | Director + Sonnet | **Landed** fb79e4172d |
| LOOK-THREAT | Enemies read as lit hulls; the 2D emblem only on your target and bosses | Sonnet | **Landed** 0e10e3f29d |
| Front door (B3, B3C, T8C, OVH-04b) | No First-light modal; one-press calm preset; Swarm/Gauntlet and death words; the run's own pause menu | Director, zcode, Sonnet | **Landed** 5a0ca1eb0d |
| W3 = OVH-04 + OVH-09a | A Swarm run in its own space (load 43.1 → 38.8 s); loose rocks rest; every spawn clear | Codex, Devin, Sonnet porter | **Parked** (park/w3-foundry). Tests 28/28 from the park export; check:sim unchanged; an Adventure new game seen starting clean. Waiting for Codex's review. |
| OVH-03a | The Ricochet Foundry as a lit set: factory deck, conveyors, furnace light, one shop-light shadow | Codex | **Parked** on top of W3. Frames: a dramatic step from black space. **Cost: ~17–20 ms of GPU per frame** (6–9 → ~26 ms, measured): holds 30 Hz, no room for 60. Before landing: cut the cost, fix the furnace casing that vanishes in some frames, respect Shadows Off. |
| OVH-08a | Every gun measured on damage against kick | zcode | Built. Review found three bench errors (cadence rounding, the mortar lifecycle, a 121-tick probe); the fix is Codex's on return. |
| OVH-01a | The Pilot Tree engine: 81 nodes (with the Conjurer bends), banked picks, the three-card draw | zcode | **Parked** on `refs/heads/park/pilot-tree` (the harvest dropped another agent's refund ledger). Clean-HEAD: 254 pass, the same 12 pre-existing failures; check:sim unchanged. Its XP-curve retune is live in the working folder. |
| OVH-01a2 | The route: the sim deals a hand the moment a pick is banked (never the screen); the screen asks by intent and hears refusals in words; only built nodes are dealt (`src/data/pilotLive.js`) | zcode | **Parked** 2a72ed65ff on `park/pilot-tree`. Director: zcode's editor flipped 146 LF lines of the mixed-ending `runSession.js` (restored line by line from the snapshot, `eol-restore.mjs`); the event surface regenerated from exactly the parked tree (`regen-surface.mjs`). |
| OVH-01b | Level up without a pause; three cards in the breath [FE] | Sonnet (`cards`) | **Parked** e59a2a8855 on `park/pilot-tree`. Frames seen (the cards read at a glance; capstone and evolution frames distinct). Director fixes: the overlay's key listener leaked per open; the cards now say the owner's refusals. No new failures against the engine alone (same 92 pre-existing). Not yet seen in a played round. |
| OVH-01b2 | The cards rise over a **paused** round end (found in a played round: the HUD tick stops while the draft pauses the game) | Director | **Parked** 182de3406d. Re-played on the ordinary route (seed 4242): level 5 in round 1, four picks over the draft, the draft revealed after, Ballast read live in round 2 (mass 40 → 52), no page errors. |
| OVH-01c1 | Skill effects — the body: Juggernaut (8 live) and the Bruiser kick chain on one kick stamp (6 live) | Devin `devin3` | **Parked** 94e592ca71. Director: Last Stand caps the hull LEVEL at 30 % (a lifetime ledger let it go dead); `juggernaut_unstoppable` left OFF (the player already never loses the helm to a contact — needs a new effect); `gunFamilies.js` (OVH-08a data) rides along because Heavy Slugs reads it. 4006 tests, no new failures. |
| OVH-01c2 | Skill effects — the rope and the powers: Long Reel, Quick Latch, Sweet Spot, Crane, Second Line, Whip Snap; Quick Cast, Wide Bore, Echo, Combo (10 live) | zcode `sess_94991cd7-4ec5-4a45-bffe-b399af9a1d5f` | **Reviewed**; parks after OVH-06a (shares `tetherGameplay.js`). Left OFF: `rigger_free_hand` (no latched aim penalty exists), `conjurer_deep_cast` (reads the hold from the presentation grip — breaks replays and the worker lane; zcode resumes at its reset, 18:04 EST, to carry the hold in the recorded input). Until Deep Cast lands a Conjurer cannot reach Echo/Combo (two tier-1 nodes only). |
| OVH-01c3 | Skill effects — the guns: Hollow Point, Steady Hands, Drum, Spin-Up, Execution, Ricochet (6 live) | Devin `devin3` | **Parked** f34db8ae68. 4037 tests, no new failures; check:sim unchanged at the tip. **30 nodes live** across Gunner, Bruiser, Rigger, Conjurer, Juggernaut. |
| OVH-06a | The camera answers only you: one cause-tagged gate; hard hull blows kick toward the hit side with a red edge pulse (static tint under reduced motion); hitstop only on hero beats, presentation-only — every Swarm sim slow-mo removed; damage numbers default off | Sonnet (`feel`) | **Reviewed**, ported onto HEAD's shape by its builder (it had leaned on another agent's uncommitted camera rework); 140/140 focused + check:sim. Measured round 8: ~1,300 room camera events refused, 10 hero beats admitted. Director reverted a dead 0.28 dash shake it had switched on. Broad check running, then parks. Watch: the edge pulse is a full-screen blended layer (perf on integrated GPUs). |
| OVH-01c4 | The rest of the tree: the bends (with OVH-05), Coupler (OVH-07), cue line, energised stamp, plough, stealth (OVH-15) nodes, capstones | — | Each node turns on for the draw only when its effect is built and tested (`pilotLive.js`). Open: Unstoppable needs a new effect; Free Hand needs a penalty to remove; Deep Cast (above); Shred, Both Hands, Gold Thread, Quick Vent (OVH-08b), Cue Sight, Bowling (energised stamp), Through and Through, Breaker Rounds, Dozer Blade, Hummingbird, Coupler, the capstones of Rigger and Conjurer, the bends (OVH-05), Ghost (stealth, OVH-15), Industry (Adventure). |
| OVH-08b | Guns tuned to the curve; heat as rhythm (feathering, per-mount lockout) | — | After OVH-08a |
| OVH-09b | Pilots brake for each other | — | **Hold:** another agent's crossing-brake work is in `src/ai/maneuver.js` |
| LOOK-THREAT-b | The gun-ready cue rides the hull (muzzle / running lights) now the emblem is gone | — | Review note (non-blocking) |
| HUD-TAG-01 | The hover tag never prints over a floor sign ("F · TOW" on THE CRATE card) | — | Seen in Swarm frames |

**Agents on hand (2026-11-19):** Devin `acct1`/`acct2` report "Upgrade to Pro" for SWE-2 Max and `acct4`
needs an interactive login, so Devin runs on `devin3` only. zcode runs two at once; it resumes with
`zcode -r <session>`. Sonnet subagents resume with SendMessage after a limit.
