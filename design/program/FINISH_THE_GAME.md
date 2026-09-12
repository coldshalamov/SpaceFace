<!-- LIFETIME: STABLE -->
# Finish the game

This is the operating law when the job is: make SpaceFace look and act finished. Not “close the
next queue leaf.” Not a review campaign.

The queue is still `node scripts/program-dispatch.mjs --ready`. Player-visible brokenness with no
leaf is still the job. Fleet routing:
[`docs/agentic-development/FLEET_COMMAND_STRUCTURE.md`](../docs/agentic-development/FLEET_COMMAND_STRUCTURE.md).
Culture: [`docs/AGENT_OPERATIONS.md`](../docs/AGENT_OPERATIONS.md).

## What “finished” means

A stranger who boots New Game, flies, docks, opens pause, and fights should not ask which prototype
this is. One game. Hitch’s world. Field Hardware over a living picture. No leftover slogans, no
toy primitives next to real ships, no hitch you can feel in your hands.

The done-when on a packet is the floor. If the screen still looks cheap, keep going.

## You are the manager

Do about **half** the work with your own subagents (captains, census, small production, looking at
a result). Drive the **other half** through terminal agents, by strength:

| Strength | Who |
|---|---|
| Unlimited workhorse (sim, hitch, 3D, named leaves) | Devin CLI `swe-2-max` |
| Frontend mutation | Claude Opus 5 |
| Taste / “would I ship this screen” | Claude Fable 5.1 (looks; a different model edits) |
| Extra implementer | OpenCode Go or Command Code `deepseek-v4.1-flash` |
| Eyes on a picture, scoped 3D/UI | Z.ai `glm-5.3-flash` (refreshes ~5h); Clinepass `kimi-k3` |

Do not ask the owner to round-robin. Spawn lanes. Split by **file**, never by worktree. Two writers
never hold the same path. Research and looking do not need a write lease — run them while
implementers are busy.

## The loop

1. **See.** What makes this still feel unfinished on the default route? Code, a live boot, a
   chase-camera look. `--ready` is one source. Your eyes are another. A closed receipt is not proof.
2. **Partition.** Name 4–8 lanes with disjoint files. Hitch, title, HUD, station, toys in the
   world, leftover chrome, one INFERENCE cut, one ready leaf if it is actually player-facing.
3. **Spawn.** Captains launch workers. Workers play or look, then change the thing. First green
   draft is a draft.
4. **Look.** A teammate (different model) checks unfinished, bugs, cheap. Fix what’s real. No
   review JSON, no unlabeled still archives, no receipt novels.
5. **Next.** When a lane returns, immediately fill it with the next unfinished thing on that
   partition. Do not wait for a round to complete. Stop only if the owner said stop, or you would
   ship the whole boot-to-dock tonight.

INFERENCE is one bounded production change for a player problem with no honest packet. It is not a
research essay.

## Do not

- Invent a second queue.
- Run two adversarial waves so you can stamp DONE.
- Store screenshots as deliverables.
- Pass hitch by deleting picture or lowering default quality.
- Restyle the UI from prose while Field Hardware frames exist. Approved frames outrank docs.
- Relitigate closed first-hour work (languages, photo, packaged Hitch traffic) while the title is
  still a column of words.
- Ask the owner to pick between technical options.

## Current unfinished (re-census when stale)

As of 2026-09-11, the picture still fails in this order: title kit unused; HUD is CSS bars; station
is words on a berth; pause is the same word list; drones/mines/wrecks are toys; lane marks and
station fallback if those writers have released; hitch is crowded sim, not another shader prewarm.

Kit assets and a lit world stage already exist. Use them. Do not redesign from zero.
