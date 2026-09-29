# FB-138 — A wingman order that is blocked or converted says why on the radial, in the moment

**Kind:** wire · **Lane:** THE FIGHT · **Routing:** open
**Seam tags:** seam: automation.js, seam: wingmanRadial.js
**Write-set:** `src/systems/automation.js`, `src/ui/wingmanRadial.js`, `test/fb-wing-order-refusal.test.mjs`
**Neighbours (extend, never restate):** SFQ-B046

## The gap
`wingOrder:blocked`, `wingOrder:converted` and `wingOrder:status` are emitted from `automation.js` with no
listener. A player orders a wingman, the order is refused or turned into something else, and the radial shows
nothing. SFQ-B046 wants morale to change commitment rather than dialogue; this is the order receipt, not
morale.

## Why this direction
The radial is the order surface; a one-word reason on the refused slot is the minimum receipt and it exists in
the payload.

## Mechanism
- Subscribe `wingmanRadial.js` to the three events: blocked shows the reason word for 2 s on the slot; converted
  shows the new order; status updates the slot glyph (functional edit).
- Pin one receipt per event on a scripted refusal on seed 4242.

## Done when
`test/fb-wing-order-refusal.test.mjs`: three receipts, correct slots; wingman suites stay green.

## Do not
Do not change order rules. Do not add a bark for refusals. Do not restyle the radial (ORRERY).

## Focus test starting points
- Locate wingman suites with `rg wingmanRadial test/` and `rg wingOrder test/`.
