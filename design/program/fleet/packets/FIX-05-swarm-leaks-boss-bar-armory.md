# FIX-05 — Aftermath prompt out of Swarm, one boss-bar truth, Swarm pause/news leaks, armory clip, stale boss tests

Evidence: `.devshots/fleet/runs/ACCEPT-07-later-content.hydrogen.*/RECEIPT.md`, frames `.devshots/fleet/accept07/`.

1. **`AFTERMATH / FIELD RESPONSE` leaks into every Swarm round** (`createAftermathChoicePrompt`: "Wreck available / 1 Salvage the
   wreck / 2 Leave the field"), covering the boss card/callout (`swarm-r10/r10-1-mid1.png`, `r4`, `r5`, `demo-swarm`). Gate it at
   the source with `isSwarmGlass(state)` (Swarm has its own loot); Adventure unchanged. Test it.
2. **Round 10 boss bar disagrees:** top-centre `CORSAIR WING 5/5` (~97%) freezes because `swarm:bossHp` (`src/systems/swarmJuice.js`
   ~814) stops emitting after ~2.8 s, while the top-left row (`src/ui/survivalHud.js` `survivalBossFigureText`) keeps
   counting down. Make both read one truth: find why the emitter stops for a multi-body wing (likely it tracks one hull and
   loses it, or only emits on the first champion), emit on every boss HP/count change for all champion bodies, and make
   the top-centre bar show the wing's alive/total and pooled HP. Test with a 5-body wing taking damage and losing members.
3. **Swarm pause screen shows Adventure's `Contract 47-A: Mass Variance Sample 0%`**, and an `OFFICIAL DENIAL` world-news toast
   fires in Swarm. Gate both with `isSwarmGlass(state)` at their owners. Tests.
4. **Armory clip at 1280×720:** card 3's description text and the `Current build` panel clip behind the footer bar
   (`swarm-r4/r4-armory.png`, `r5`, `r10`). Make the content area end above the footer (scroll with the existing fade, or
   compact). Verify with `node scripts/ui-bench.mjs --shot=crucible-draft --walk` and open the PNG.
5. **Stale boss tests:** `test/fix-boss-round-debut.test.mjs` and `test/rc-02-iron-maw-boss-score.test.mjs` fail because they
   assume the pre-PIT-01 rotation (Iron Maw at wave 10; current: 5 iron_maw, 10 corsair_wing, 15 mirrorjaw_foreman, 20
   yardmaster, 25 the_anvil per `swarmBossFor`). Update ONLY the stale expectations to the current design rotation (doc 12),
   with a comment naming `2065539416`; if a failure is NOT explained by the rotation, leave it and report it.
Exact-path commits; tests before/after; `npm run check:sim` green.
