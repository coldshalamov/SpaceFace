# ACCEPT-01 — Play both doors on current HEAD and check what landed today (READ-ONLY critic)

**You change no tracked file.** Files only under `.devshots/fleet/accept01/`. Output: RECEIPT.md. You did INV-02
(`.devshots/fleet/runs/INV-02-first-hour-critic.hydrogen.*/RECEIPT.md`, frames `.devshots/fleet/inv02/`); this is
the same job on today's build, plus a checklist of what changed.

## Do this
1. Through the lock, one at a time (never kill a lock holder you did not start):
   `node scripts/fleet/game-lock.mjs run -- node scripts/fleet/looks/demo-route.mjs --route=swarm --headed --out=.devshots/fleet/accept01/swarm --max-min=8`
   `node scripts/fleet/game-lock.mjs run -- node scripts/fleet/looks/demo-route.mjs --route=adventure --headed --out=.devshots/fleet/accept01/adventure --max-min=8`
   (if `--headed` fails, run headless and say so).
2. Read both `report.md` / `demo-route.json` and LOOK at every frame.

## Checklist — answer each YES / NO / NOT SEEN with the frame name
Swarm:
- Credit chips dropped by kills are visible (small minted hex stacks) and get scooped.
- Brood husk remains look like organic remains — no cargo container on them.
- Enemies are their real ship models, never flat white placeholder shapes.
- Floor price tags and the boss pointer/bar still appear; NO open-world text (no "GOAL · HELIOS STATION",
  "SELF-DEFENSE", "Dock control", "FIELD COIL CRADLE", "RADIO OFF").
- Explosions are big hot events (flash, fireball, ring, smoke), not ~20 px confetti.
- When the run ends: a RUN OVER / results screen, never "FLIGHT INTERRUPTED".
- The top centre while a boss is up shows only the boss bar/name and one callout.
- Armory: no ESC badge on Launch; the third card fades rather than being cut.
Adventure:
- The loading screen: logo, one plain label, thin progress line, rotating controls card — no "Initializing
  systems", no percent, no garbled characters, no overlapping keycaps.
- No HUD over the intro splash.
- The first rock: latch, then a click throws it (no "TOO HEAVY", no rope snap); seconds from first flight to first
  throw.
- The player is never marked AGGRESSOR / attacked by the Navy in the opening.
- No notice spam (count repeats); no MORROWLIGHT card before first dock; the aim tag never sits on your own ship.
- The opening still talks: the objective line and the tutorial lines appear.

## Receipt
The checklist answers, then the top 10 problems you still see (same format as INV-02: frame, where, what, why),
then dead time with seconds, and every console/page error copied exactly.
