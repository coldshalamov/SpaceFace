# ACCEPT-07 — Later content again, plus the first two minutes (READ-ONLY critic)

You change no tracked file. Files only under `.devshots/fleet/accept07/`. Every acceptance run so far covered only the first ~2
minutes: the Adventure bot stalls at the raider beat, and Swarm runs end by round 3. Shoot and judge the later content.
Run each command in the FOREGROUND through the lock (never kill a holder you did not start) and wait for it to exit.

1. Adventure beats 5–10 (staged fixture; sim on the main lane):
   `node scripts/fleet/game-lock.mjs run -- node scripts/fleet/looks/beat-shots.mjs --out=.devshots/fleet/accept07/beats`
   (read the script's header for its exact arguments — beats `raid`, `claimed`, `seam`, `dock`; it uses `?simLane=main&beat=…`).
2. Swarm later rounds — for each of `?swarmRound=4`, `5`, `10`: boot it (reuse `scripts/fleet/looks/scene-census.mjs`'s boot
   loop, or `scripts/fleet/looks/demo-route.mjs` if it accepts a round), let the fight run ~40 s, and save 4 frames each
   under `.devshots/fleet/accept07/swarm-r<N>/`.
Judge every frame as a first-time player against a 2026 major-release bar, and specifically check:
- Round 4: the freight lane runs for the first time (containers, amber lights, klaxon) with Wasps on both sides.
- Round 5: the Iron Maw boss — boss bar/name at top centre, one callout, readable boss.
- Round 10: Corsair Wing — five ships flying as one; the boss HUD; the room change.
- Brood husk remains (if any round shows brood): organic remains, no cargo container on them.
- Adventure beats: each beat's objective line, what the player is asked to do, and whether the scene shows it.
Receipt: per frame — what you see, what's wrong (frame, where, what, why a player cares), plus the top 10 problems ranked.

## Since ACCEPT-06 (`.devshots/fleet/runs/ACCEPT-06-*/RECEIPT.md`) — check each, fixed / still there / worse
- Round 10: the flyby beam is a thin gold light shaft, not a wedge over the screen (VFX-02).
- Kill smoke is dark, thin, dissolving soot; it never buries a boss (VFX-02).
- No `SHRINE CANTOR` in Swarm; no `QUICK` / `+100 PUNCHED` world words; boss tip is one short clause; the boss row and
  top-centre agree (FIX-04). No `document is not defined` console error on boss intros.
- Field Build chip no longer collides; danger tells merged; world diamonds stay off the HUD (declutter).
- Rocks (Swarm and the Adventure opening): slag shows glowing veins (no black band); dark rocks separate from space; Adventure
  field rocks are textured, not smooth icosahedra (ROCK-03). Crop one of each.
3. Also run the Swarm demo route once (`--route=swarm --headed`, foreground) and report fps, PLAY → first hostile, throws.
