# MOB-08 — Phone: tells and world tags never print on the keys or the callouts

**Lane 3 [FE].** Leftovers from MOB-07 (a8edb98f, report): in **844×390 landscape flight** the FLYBY tell chip
(`#hud .sf-tells > *`, owner `src/ui/hud.js` tell slots) prints over the TETHER and GUN keys; in a phone Swarm round
**pad tags overprint the PILE-UP callout** (centre column, now the left lane under the round line) and a **Powers tag
overprints the "Touch anywhere" caption**. ec46883 makes a tag with no clear seat hide on phones; the tells and the
centre-column callouts are the remaining owners.

## Build
1. Tells on a phone: seat each tell chip out of the deck rects (`src/ui/hudAvoidRects.js` already lists the phone deck) —
   clamp/flip like the pad tags; if no seat, show only the chip's kind word at the screen edge nearest its target.
2. Pad tags vs the Swarm callouts: the left-lane column (MOB-07) must be in the avoid list on phones (check the selector
   `.sf-sj__col > *` still matches after MOB-07's move).
3. The Powers tag vs the first-run caption: the caption (`.mf-ghost-label`) is in the avoid list (ef0ccc5f) — find why the
   Powers tag ignores it (is it a different label owner?) and route it through the same seating.

## Checks
`node scripts/fleet/game-lock.mjs run -- node scripts/fleet/looks/phone-swarm.mjs --round=3` and `--land`; the flight bench
`--shot=mobile-flight,mobile-stick` at 844×390; open every PNG; `check-mobile-hud-area` still ≤ 25 %; mobile tests.
Commits: `fix(MOB-08): <what>`.
