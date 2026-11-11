# G16-04 — Floating text that doesn't spam, and notices you can read over anything

**Lane 2.** Owner: "popups without borders or spacing … elements popping up overlapping others."
**Evidence (lead capture 2026-11-11, `.devshots/fleet/mine/lookA3-held.png`, Swarm round 3):**
1. **"FRIENDLY FIRE" floating world text appears four times at once** over a cluster of enemies, partly
   overlapping each other and other labels ("+12 SHUNTED" also stacks).
2. **The right-hand notice lines have no backing**: "Different kill — the chain climbs faster." and
   "CARGO RECOVERY NOTICE: …" are bare text, and the world label "TAP · STRIPPED · 1500" behind them makes
   both unreadable.

## Build
1. **Floating world text (owner: `src/ui/floatingText.js` and whoever calls it for FRIENDLY FIRE /
   SHUNTED / stunt words):**
   - Identical text within 1.5 s and 220 px of an existing one **merges** into it as `FRIENDLY FIRE ×4`
     (refresh its timer; one label).
   - At most **4 floating texts on screen**; a new one beyond that replaces the oldest of the lowest
     priority (damage numbers < status words < player-earned words like PILE-UP/SHUNTED).
   - A floating text never draws inside the Stage's banner column or over the HUD corner panels — clamp
     it out of those rects (read them from the Stage / HUD layout, don't hard-code).
2. **Notice lines get a plate:** every line in the right-hand notice/receipt feed is drawn on the shared
   kit glass plate (the same frame G16-01 gives Stage items; see `drafts/G16-one-glass.md` §2 "One style")
   with padding and a max width; text never overflows its plate (wrap to 2 lines, then ellipsis). The feed
   keeps at most 3 lines.
3. **World labels yield to HUD:** pad labels (`TAP · …`, `THE CRATE · 950`, wall guns) fade to 35 % while a
   HUD notice or panel overlaps them.

## Files you may edit
`src/ui/floatingText.js`, the notice/receipt feed owner (find it from the strings above), the Stage slot
CSS in `styles/` if the plate lives there, the pad-label renderer from A01-04, new tests. `git diff` first.
Refresh nothing in `test/ui-frame-references/` yourself; report if `check-ui-budgets` goes stale.

## Checks
Pure tests for merge/limit/priority/clamp. Then the look, through the lock:
`node scripts/fleet/game-lock.mjs run -- node scripts/fleet/looks/context-wheel.mjs .devshots/fleet/g16-04/after`
and describe the `-before.png` (taken in a live fight) — no duplicate floating words, every notice on a plate.

Commit: `fleet(G16-04): floating text merges and caps; notices sit on readable plates`.
