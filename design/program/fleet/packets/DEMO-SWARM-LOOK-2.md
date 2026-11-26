# DEMO-SWARM-LOOK-2 — a stranger's eyes on the first two minutes of Swarm

**For:** a reviewer with vision. **Kind:** READ-ONLY. Change no tracked file; write your RECEIPT.md.

1. Run the Swarm minute probe twice (each takes a few minutes; the game lock serialises game boots):
   `node scripts/fleet/game-lock.mjs run -- node scripts/probe-first-swarm-minute.mjs`
   Output goes to `.devshots/demo/swarm-minute/<stamp>/` (frames, contact.png, report.json, text-lines.txt).
2. Open EVERY frame. Judge as a stranger at a demo who has never seen the game:
   - What is confusing? What text is jargon, an internal id, or noise? (list each line + frame)
   - Any ring, circle, halo, concentric arc or spiral drawn around a ship, rock or the player?
     (the owner hates "Sonic rings"; list each with frame + rough screen position)
   - Anything clipped, overlapping, flickering, or covering the centre of the fight?
   - Does the HUD clearly say round, hostiles left, Scrap, XP/level? Is anything Adventure-only shown
     (Chart/Survey buttons, Traffic, cargo, research, comms)?
   - Does the fight feel readable: can you tell enemies from rocks from pickups?
3. From report.json: press->live control seconds, the loading phases' timings, world speed per 10 s,
   fps, console errors.

## Receipt
Protocol headings; a ranked list (worst first) of what a stranger would notice, each with frame
path and what should change; the timing table.
