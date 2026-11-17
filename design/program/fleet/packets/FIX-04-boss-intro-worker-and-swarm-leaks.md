# FIX-04 — Boss intro throws in the sim worker; Swarm leaks (shrine lore, stunt words, truncated boss tips)

Evidence: `.devshots/fleet/runs/ACCEPT-06-later-content.hydrogen.*/RECEIPT.md` and `.devshots/fleet/accept06/swarm-r5`, `swarm-r10`.

1. **Every Swarm boss intro throws in the sim worker:** `swarmJuiceHud._onBossIntro` runs inside
   `src/core/wholeSimBrowserWorker.js` and throws `ReferenceError: document is not defined` on `swarm:bossIntro`. A UI module
   is subscribed on the worker's bus. Find how `src/ui/swarmJuiceHud.js` (or its subscription) gets into the worker bundle /
   worker bus and keep UI listeners on the main thread only (the worker must not import or subscribe UI). Add a guard test
   that the worker entry's import graph contains no `src/ui/**` module that touches `document`, or the narrowest test that
   catches this. (Recall: a worker bus handler error once closed the whole sim — fc7ac01064.)
2. **Adventure lore in Swarm:** `SHRINE CANTOR: You are out of the chord. The shrines are closed to you.` shows during Swarm
   round 10 (`r10-1-mid1.png`). Find the owner and gate it with `isSwarmGlass(state)` at the source like SWARM-LEAK-01 did.
3. **Stunt words in Swarm:** `QUICK` and `+100 PUNCHED` / `+100 CAROMED` world words appear in Swarm (`r10-1-mid1.png`). The
   Swarm declutter removed the quick-throw tag and SOLID HIT/GLANCE before; find which owner still paints these in Swarm and
   fold them into the single centre callout or drop them in Swarm (the score panel already shows the tally).
4. **Truncated boss counterplay toasts** (`r5-0-open.png`, `r5-2-mid2.png`: "Cross the bow before it locks;…"): one boss tip
   must fit — shorten the copy at its source to one clause ≤ 8 words, or let that lane wrap to two lines.
5. **Boss count mismatch:** round 5 left panel `BOSS 2/2` vs top-centre `1/1` for a single Dreadnought. Make both read the
   same truth.
Tests per item; exact-path commits; `npm run check:sim` green.
