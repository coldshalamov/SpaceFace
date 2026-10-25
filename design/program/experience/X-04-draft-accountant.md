# X-04 draft — The Accountant

## Already true

The toll rule is `gateTollFor = round(50 + 200·security)` (`travelChoices.js:15`).

| leg | security | toll |
|---|---|---|
| Helios→Ceres | 0.72 | **194** |
| Ceres→Helios | 0.98 | **246** |
| round trip | | **440** |

The first trade pays **760** for a net **+320** (`economyContractTemplates.js:312-365`, pinned at
`first-session-places.test.mjs:101`). The charge is a single `economy:chargeCredits
{reason:'gate_toll'}` (`world.js:5828`). **No credit flow changes.**

## Rejected

A broke-at-gate grant is rejected: it would be an unpriced faucet. The FB-101 hardship floor
(`economy.js:157`) covers fuel, not tolls. Words fix this, not money.

## Proposal: three lines

1. **Approach.** In the `gate:range` handler (`onboarding.js:741-745`), build the text before
   `_showHint('firstGate', …)`. If `state.missions.active` holds the first-trade run, the text is
   *"Ceres toll 194 cr. The fuel run pays 760 — home costs 246."*
   - Find the run by `cause.tag === 'first_trade_loop'`, falling back to an id prefix of
     `first_trade_`.
   - Take the tolls from `gateTollFor`, never as literals.
   - Otherwise use the shipped `firstUseLine('firstGate')`. Same key, still once.
2. **Return leg.** Add `bus.on('jump:arrive')` (emitted at `world.js:5628`). When it arrives
   `via:'gate'` at the run's destination sector with the run still active, call
   `_showHint('firstGateArrive', 'Refinery is 4.7k out. Deliver, then the gate home is 246 cr.')`.
   That key is created lazily (`onboarding.js:1135`), with no default and no migration.
3. **Rejection names the remedy.** In `src/ui/jumpNotice.js:46-52`, append "— sell the hold or work
   the board". String only.

## The 30-minute target

The rail ends at about 12:30. The Ceres gate is 4.2k wu out, about 30 s at cruise. That is well
under 30 min.

## Determinism and save

There are no draws. One saved hints key is written on routes that reach Ceres. The
`_tutorialRailOwnsVoice` gate keeps it all off the rail.

## Tests

- Add `test/x04-first-gate-toll-line.test.mjs`:
  - with the run active, the toll line shows;
  - without it, the generic line shows;
  - the arrival line fires once;
  - the numbers come from `gateTollFor`.
- Extend `jump-verb-notice.test.mjs` with the rejection wording.
- Keep green: `infer-p11-gate-remedy`, `first-trade-contract`, `first-session-places`,
  `check:player-facing-labels`.

**Verdict: shippable, S.**
