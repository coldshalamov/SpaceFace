# ACCEPT-03 — Play both doors on current HEAD (third acceptance) (READ-ONLY critic)

**You change no tracked file.** Files only under `.devshots/fleet/accept03/`. Output: RECEIPT.md. You did INV-02
(`.devshots/fleet/runs/INV-02-first-hour-critic.hydrogen.*/RECEIPT.md`, frames `.devshots/fleet/inv02/`); this is
the same job on today's build, plus a checklist of what changed.

## Do this
1. Through the lock, one at a time (never kill a lock holder you did not start):
   `node scripts/fleet/game-lock.mjs run -- node scripts/fleet/looks/demo-route.mjs --route=swarm --headed --out=.devshots/fleet/accept03/swarm --max-min=8`
   `node scripts/fleet/game-lock.mjs run -- node scripts/fleet/looks/demo-route.mjs --route=adventure --headed --out=.devshots/fleet/accept03/adventure --max-min=8`
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

## Also check (new since ACCEPT-01, receipt `.devshots/fleet/runs/ACCEPT-02-*/RECEIPT.md`)
- Swarm: count throws (`massline:throw`) and seconds from first flight to first throw; the `RMB · THROW` cue is
  visibly lit at least once; arena rocks are grabbed AND thrown; how often TOO HEAVY appears and on what.
- Swarm: the loading veil is gone before enemies attack; enemies never show as white or dark stand-in shapes.
- Adventure: the tutorial advances after the first throw (the next objective line appears).
- Compare every problem in ACCEPT-02's top 10: fixed / still there / worse.

**IMPORTANT:** run each demo-route command in the FOREGROUND and wait for it to exit before reading its output —
do not background it and do not end your session while a run is still going. Write the receipt only at the end.

## New since ACCEPT-02 (check each)
- Swarm: the Line takes the Wasp near the cursor, not walls/pickups (AIM-01); pebbles say `RMB · LATCH` and throw,
  boulders say TOO HEAVY at the start (ROCK-01); no pale crystal shards in rounds 2–3 (FIX-03); a thrown Wasp ploughs
  through 2+ enemies; count throws and kills from throws.
- Adventure: after the first throw the objective moves past "Swing the rock through the wreck" (FIX-03).
- Frame rate: report mean fps per door from the report (compare ACCEPT-02's).
