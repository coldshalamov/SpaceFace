# MOB-07 — Swarm on a phone fits the quarter-screen rule too

**Lane 2 [FE].** MOB-02 made the phone *flight* HUD fit 25 % of the screen, but its bench and area check only covered
ordinary flight. A live phone Swarm round (`design/program/fleet/evidence/2026-11-12-phone-swarm-r1.png`, 390×844, round 1):
- the Swarm round panel (`CRUCIBLE · RICOCHET FOUNDRY / ROUND 01 / FIGHT / HOSTILE SHIPS 15/15 / SCORE / +750 CR`) is the
  desktop panel at phone size — the top third of the screen, under the vitals strip;
- the enemy lesson line ("Wasp Swarmer: Light enough to throw — catch one on the line…") sits bare under it;
- floor pad tags printed over the HUD (fixed for the avoid list in ef0ccc5f — check they now yield).

## Build (phone only; desktop unchanged)
1. **Round panel, phone:** one compact line under the vitals strip — `R01 · 15/15 · 0` (round · hostiles left · score),
   with the arena name and credit lines folded into the existing details/expanded view (tap the line to expand, like the
   MOB-02 objective line). Find the panel owner (`grep -rn "HOSTILE SHIPS" src/ui`) and add the phone rules in
   `src/ui/orrery/mobileFlightLayouts.js` (or the panel's own phone media block).
2. **The centre column on phones** (NEXT IGNITION, round callouts, PILE-UP): one size step smaller, never under the vitals
   strip or the radar.
3. **Lesson/notice lines** on the shared glass plate, wrap ≤ 2 lines, clear of the keys.
4. **Measure Swarm too:** extend `scripts/check-mobile-hud-area.mjs` (or a sibling) to a live phone Swarm round — boot like
   `.devshots/stand-in-mobile-throw.mjs` does on `?swarmRound=1`, wait for the fight, then union the same furniture list
   plus the Swarm panel/column. **≤ 25 %** at 390×844 and 844×390.

## Checks
Open every PNG: live phone Swarm round 1 and round 3 at 390×844 and 844×390 (before/after). `node --test test/mobile-*.test.mjs
test/r2-d202b-phone-hud.test.mjs` + the panel's own tests. Commits: `fleet(MOB-07): <what the player gets>`.
