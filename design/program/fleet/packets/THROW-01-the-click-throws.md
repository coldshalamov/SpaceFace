# THROW-01 — A right-click on a held enemy throws it. Always.

**Lane 1/2 (feel-critical).** The throw is the game's signature (card row 1: "I threw something into something, and it was
satisfying"). Today a first-timer's instinctive gesture fails most of the time.

## What happens today (lead trace, 2026-11-12)
- `src/systems/masslineThrow.js` header: *"F frees YOU, RMB throws THEM."* Default release assist `'snap'`
  (`releaseAssistMode`): the throw fires on the RMB **press** only if the release window toward the aim target opens within
  `SNAP_WINDOW_MS = 90` ms (line ~311). Otherwise the press does not throw.
- The Line's tap grammar (`src/systems/input.js`, "tap latch/cut") then treats the short click as a **cut**; a taut, fast cut
  becomes `massline:selfSling` — **the player flings themself, not the enemy.**
- Scripted latch → swing → click runs this week: **3 throws in 7 latched runs**; the rest self-slung or did nothing; the
  swing grade read "MESSY · NEVER SWUNG". A newcomer clicking at a random point of the swing mostly cuts.

## Build
1. **Press throws.** While latched to a throwable payload (`isThrowArmPayload`), an RMB press (and a phone flick, already a
   discrete press) **always produces `massline:throw`**: if the solver's window toward the aim opens within the snap window,
   release there (today's assist — keep it); if not, **release now** along the best current tangent toward the aim
   (`'snap-manual'` path already exists for no-aim presses — reuse it). Missing is allowed and readable; the validation
   receipt still reports divergence. No auto-steering after release.
2. **A tap on a throwable payload never cuts.** The Line's tap-to-cut stays for non-throwable payloads (asteroids, cargo,
   civilians); for throwable ones, cutting is **F** (already "F frees YOU"). Find the tap/cut arbitration in `input.js`
   (`_throwLineAtPress`, the Line grammar) and gate the cut.
3. **The grade reads the player kindly.** A first throw that connects should not be labelled "MESSY · NEVER SWUNG" — find the
   swing-grade owner (`grep -rn "NEVER SWUNG" src`) and make sure a throw on a short swing grades as a throw (e.g. `QUICK`),
   reserving harsh grades for genuinely messy releases.
4. Hold-to-arm (`'arm'` assist) stays available as a Settings choice; behaviour unchanged there.

## Checks
- Focused tests with the real input + throw systems: (a) press at a random swing phase on a hostile → exactly one
  `massline:throw`, no `massline:selfSling`, no `tether:cut`; (b) press inside the window → throw at the window (today's
  assist, unchanged); (c) tap on an asteroid → cut (unchanged); (d) F while latched to a hostile → cut/self-sling (unchanged).
- `node --test` for the input/massline/tether tests you touch (`ls test | grep -i "massline\|throw\|tether\|input"`), and
  `npm run check:sim` (v27 must be byte-identical — the 47-A tape may not throw; if it changes, stop and report).
- The look, through the lock: `node scripts/fleet/game-lock.mjs run -- node scripts/fleet/looks/throw.mjs .devshots/fleet/looks/throw01/rN N`
  for N = 2, 3, 5 — each must report `throws 1`, `self-slings 0` (the script taps RMB, as a newcomer would).
- `npm run gate -- --quick`.
Commits: `feel(THROW-01): <what the player gets>`.
