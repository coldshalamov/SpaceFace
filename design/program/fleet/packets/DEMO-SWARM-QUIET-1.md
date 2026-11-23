# DEMO-SWARM-QUIET-1 — Adventure's chatter stays out of a Swarm fight

**For:** a builder agent (code, exact instructions). **Kind:** gating + plain words. Commit your own files.

Swarm is the demo: a short arcade run in Madame Kiln's Foundry. A probe of a real first Swarm
minute (`.devshots/demo/swarm-minute/2026-11-23T21-33-11/text-lines.txt`, frames beside it) recorded
these lines on screen during round 1. They belong to Adventure (cargo, research, comms, the
open-world death recovery) or repeat what the screen already says:

| Line | Why it must not show in a Swarm run |
|---|---|
| `Cargo aboard. Manifest [ I ].` | Swarm has no cargo manifest |
| `Research complete.` | Adventure research |
| `Mayday.` | Adventure comms bark |
| `Emergency recovery online…` | Adventure death recovery; Swarm goes to Run Over |
| `Ship lost.` | repeats `SHIP DESTROYED` and the Run Over plate |
| `Swing threat detected.` / `Line strain.` / `Target destroyed.` | robotic narration of what the player just saw; one voice per moment (`design/overhaul/08_INTERFACE.md` §1.2) |

## Do
1. Find each line's source (`grep -rn "<text>" src`). For each, gate it so it does not show during a
   Swarm run (state.run.kind === 'survival', or the existing Swarm/run-mode helper the HUD uses —
   find it, do not invent a second one), at the SOURCE when the source is Adventure-only, otherwise
   in the one place toasts/announcements are admitted (src/ui/toasts.js or the announcer) with a
   small, named Swarm deny-list. Adventure keeps every line exactly as now.
2. `Swing threat detected.`, `Line strain.`, `Target destroyed.`: drop them in Swarm; in Adventure
   leave them (another worker decides there).
3. Achievements may still toast in Swarm, but never more than one at a time and never during a
   level-up moment (if that is not a one-line change, leave it and say so).
4. Add a focused test: a Swarm run state + each source fired -> no toast; an Adventure state -> the
   toast still shows.

## You may edit
The source files of those lines, src/ui/toasts.js (only the admission point), and tests.
Before editing a file run `git diff -- <file>`; if it has changes you did not make, use
`bash scripts/fleet/own-commit.sh begin <file>` before and `... commit "<msg>" <file>` after.
Never git add -A, reset, stash, restore or checkout. Plain-English commit messages.

## Receipt
Protocol headings; per line: source file:line, how gated (commit); test results.
