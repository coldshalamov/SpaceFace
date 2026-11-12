# OPENING-1 — The first ten minutes follow the story, not a drill rail

**Lane 2. Demo-critical.** Source: your own recon `design/program/fleet/drafts/G10-recon.md` (read §1–§5) and the plan
`design/game/20_THE_FIRST_HOUR.md` (the Adventure storyboard; rule 2 "one guidance voice"). Today a fresh New Game runs a
12-beat drill rail (`src/systems/onboarding.js` BEATS :310-393) with the story's verbs scattered through it; the 47-A
spindle sits 92 wu away, unnamed; the order is inverted (drills → dock → job → sample → Skim-text → re-dock).

## Build — recon build-order items 1–5, in this order, one commit each
1. **First trade goes to Tethys** — `FIRST_TRADE_CONTRACT_DEST_*` in `economyContractTemplates.js` (the alloy run to Tethys
   is the recommended contract, doc 16 B1).
2. **Kessler's B0 line fires at cold-start install** — the existing `comms.47a.b0.primary` line, once, through the story/comms
   owner, ~4 s after the premise caption (respect the voice silence gate — never stacked on another voice).
3. **Reorder `BEATS` to the Director's sequence**: thrust/brake first (twenty seconds), then **latch (tether) → swing → raid
   → claimed salvage → seam → dock → choice**. Move `marker`, `focus`, `burst`, `disengage`, the missing-three verbs
   (`src/onboarding/missingThree.js`) and the power situations (`src/onboarding/powerSituations.js`) **behind the first dock**
   (the 15–40 minute slot), one at a time on their existing gates. Keep `RESCUE_GATE_ROUTE` consistent; keep the 4 s silence
   gate between beats.
4. **Mark the 47-A sample at spawn** — B0's waypoint/objective points at the bound sample rock (the spindle) from the first
   frame instead of waiting for `tutorial:finished`. One objective line says it (the tracker); no second voice repeats it.
5. **The seam beat mines the real sample** — the bound sample source is the tutorial's rock, so `mining:yield` satisfies B0
   inside the rail (mine before dock).

## Rules
Determinism; single writers (onboarding owns beats, missions owns contracts/nav, story/comms owns lines). Saved games: a
mid-tutorial save must still resume correctly (test it). `npm run check:sim`: the 47-A tape may change if it covers the
opening — if it drifts, find out exactly why; if the drift is the intended new order, record a new reference version openly
(the process PARK-01 used for v27) and say so; never edit an expected file.

## Checks
Focused tests per item with the real owners' events (`ls test | grep -i "onboarding\|tutorial\|47a\|cold-start\|first-trade"`
— update expectations that pinned the old order, each with a one-line reason). Then the look, through the lock:
`node scripts/fleet/game-lock.mjs run -- node scripts/player-truth/run.mjs --mode=adventure --duration=240 --headed --tag=opening1`
and, if it exists by then, `node scripts/fleet/game-lock.mjs run -- node scripts/fleet/looks/demo-route.mjs --route=adventure --headed --out=.devshots/fleet/demo/opening1`.
Report the order of beats and objective lines a player now sees, with sim times. `npm run gate -- --quick`.
Commits: `fix(OPENING-1): <what the player gets>`.
