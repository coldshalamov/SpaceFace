# Task MJ4 — board rows 352 + 353: M29 "Two correct orders" and M25 "A fossil made of motion"

Read first: `_constraints-codex.md`, briefs `design/finish-expansion-2026-09/missions/M29.md` and
`M25.md`, and the disposition rows in `design/program/admit-sfq-m/DISPOSITIONS.md`.

## The residuals

- **M29 (row 352):** needs persistent machine protocol state — owned by the machine systems, not
  data modules. Two orderings are both correct; the machine's accepted sequence is a persistent
  per-site protocol the player must read (observe, position, present, choose per the brief).
  Persist the protocol in the site/machine runtime state, save round-trip included.
- **M25 (row 353):** fossil/evidence reads exist in `src/data/alienEcology.js`; the missing piece
  is the physical-evidence operation in site runtime (`src/world/worldSiteRuntime.js` or the live
  owner you find): compare, stimulate, follow — the player can stimulate the motion-fossil, read
  its recorded path, and follow it to a real place with a real outcome.

## Done when

- `test/m29-two-correct-orders.test.mjs` pins: both orderings accepted, the machine remembers its
  protocol across save/reload, and a wrong-order present is refused with the reason.
- `test/m25-fossil-made-of-motion.test.mjs` pins: stimulation produces a readable recorded path,
  following it reaches the place, and the outcome settles once.
