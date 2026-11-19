# 11 — Order of work: tweak now, build next

**Director, 2026-11-18.** The owner's instruction for executing this folder (same evening):

> everything that needs to be done for this to be an amazing game is all going to fit in 2 categories:
> 1. parts that you could tweak right now, maybe a variable that is tuned wrong or not a missing system,
>    but a bad configuration… small and medium tasks [— implement them]
> 2. Parts that should or could be built by other agents… a big production… write the plans into the
>    build map

## 1. Category 1 — tweaked now by the director

Small and medium changes where writing the fix costs about what specifying it would. The director
implements them (or hands a straightforward one to a Sonnet sub-agent, or a fully scoped mechanical one
to Devin SWE-2 Max), and **every batch is reviewed by Codex (GPT-6.2 Sol, xhigh) before it is
committed**.

| # | Tweak | Page | Status |
|---|---|---|---|
| T1 | The rope never refuses: delete TOO HEAVY and the overclass snap; tags ANCHOR / TOW / TUG | `03` §2 | in progress |
| T2 | Headlight beam medium off in clear space | `07` §3 | queued |
| T3 | Fodder never dodges thrown bodies; dodge by tier | `03` §9 | queued |
| T4 | Starter gun competent; feathering instead of the forced vent | `03` §3 | queued |
| T5 | Banned words out of player strings (Crucible, STALE, Unknown weapon, ledger prose on Run Over…) | `08` §5 | queued |
| T6 | Hide unbound verbs (Gyre, Cloak) and truncated labels on the power bar | `08` §4 | queued |
| T7 | DEV · SANDBOX out of the player pause menu | `08` §6 | queued |
| T8 | "First light" prompt replaced by defaults + OS reduced-motion | `08` §2 | queued |
| T9 | The calm-world safety net (non-energised contacts cannot kill) | `03` §5 | queued |
| T10 | Release the assisted-turn bound while latched to an anchor | `03` §2.2 | queued |
| T11 | Swarm starts at zero purse; Kiln's mood labels | `04` §5 | queued |

Status here is updated as each lands; the ledger (`02`) records what was seen after.

## 2. Category 2 — built by agents from the build map

The big productions are rows in **`build_map.md` §40** (IDs `OVH-*`), each with its lane, its seam,
"done when" on screen, and what must never return. Summary:

| Row | Production | Page |
|---|---|---|
| OVH-01 | The Pilot Tree: data, the run engine (Swarm cards), the Adventure screen | `06` §2, `04` §3 |
| OVH-02 | Swarm loop rebuild: retire the Armory, one Scrap economy, fold fourteen systems to four | `04` §2, §5 |
| OVH-03 | The Foundry as a lit set; then each arena | `04` §6, `07` §4 |
| OVH-04 | Swarm in its own space (engine owner) | `04` §6.1, `10` §3 |
| OVH-05 | The five powers rebuilt as force + light + matter; the plough | `03` §4, `07` §7 |
| OVH-06 | Hit feel on the body; damage states; breakable hulls; the 3D tumble | `03` §6–§7 |
| OVH-07 | Line heads: Coupler, Breaker, Harpoon, Chain, Reel; Line Class as rope budget | `03` §2.4, `06` §3 |
| OVH-08 | The gun curve: every family tuned and measured; cue line on rocks | `03` §3 |
| OVH-09 | NPC flight competence and spawn clearance; the ambient census | `03` §5 |
| OVH-10 | The light recipe: fitted sun shadow, skies per region, surfaces under every fight | `07` §2, §4 |
| OVH-11 | The board inside the rock: geology, lamp light, block rules, chains, backfill | `05` §3 |
| OVH-12 | The yard outside, drones on lanes, raids as Swarm rounds, the income cap removed | `05` §4–§5 |
| OVH-13 | The station as a hangar; the Chart simplified | `08` §7–§8 |
| OVH-14 | The god-tier acquisitions, the Tumbler, the stage killers (sinkhole, limb, corona) | `05` §6, `03` §10 |
| OVH-15 | Ghost: cold drift, shadows, sensor cones, sabotage | `03` §11 |
| OVH-16 | Factions to four or five; the warfront; heat tiers | `05` §7 |
| OVH-17 | The economy bench and re-pricing; the ledgers consolidated | `06` §5–§6 |
| OVH-18 | Boot to title: a bright film, a lit title place | `08` §2 |
| OVH-19 | Sound (last) | `09` |

## 3. The order

1. **Category 1, in the order of the table.** Each tweak is small; together they remove most of the
   wonkiness a stranger sees in the first ten minutes.
2. **Swarm to the bar** (the demo): OVH-04 → OVH-02 → OVH-01 → OVH-03 → OVH-05 → OVH-06 → OVH-08.
   Swarm is the proof (doc 10 D2) and the owner's demo.
3. **Adventure's first hours:** OVH-13 → OVH-17 → OVH-07 → OVH-11 → OVH-10 (places).
4. **The long game:** OVH-12 → OVH-14 → OVH-15 → OVH-16.
5. **Last:** OVH-18 polish pass and OVH-19 sound.

No more than six productions in flight (doc 10 §6), never two writers on one file.

## 4. How every batch is checked

1. The focused tests for the changed owner, red-first where behaviour changes.
2. **Codex review** of the batch diff (GPT-6.2 Sol, xhigh, read-only) — findings with file:line;
   the director verifies each finding before acting on it.
3. Commit only the batch's own paths; where a file carries another agent's uncommitted work, stage
   only the batch's hunks.
4. `npm run gate -- --quick` after every few batches; red means fix or revert first.
5. Anything visible is looked at on screen through the ordinary route before it is called done, and
   the ledger row is updated with the frame.
