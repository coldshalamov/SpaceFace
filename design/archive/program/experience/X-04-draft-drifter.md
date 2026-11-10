# X-04 draft — Drifter: the gate is a tollbooth on the way to work

Persona: The Drifter. Row §1P 562. Audit: `X-04-audit.md`.

## Ground

Haulers don't marvel at gates. They count the toll against the pay. The first jump should read as
the first leg of a paid run. A pilot short at the booth should hear where the money is.

## Lines (each `_showHint`, once per profile)

- `gate:range`, first-trade contract held: *"Toll's 194. The Ceres run pays 760."*
- Same, no contract: *"Plot a jump."* (unchanged)
- First Ceres arrival, contract held: *"Ceres. Refinery's up the Kettle Line. Dock, collect."*
- Contract pays at Ceres: *"Paid. Toll home, then it's yours."*
- First Helios re-entry after it pays: *"Home. Run cleared plus 320 after tolls."*
- Gate rejects for credits: *"Gate toll 194 cr — purse holds 120 cr. Sell the hold at Helios."*

The Kettle Line is a placed thing on the Ceres arrival chord (FIRST_SESSION_MAP §3). The 320 is the
authored margin (760 − ~440 round-trip tolls). It should come from the tolls actually charged, not be
hard-coded.

## Lands in

- `onboarding.js:741-745` `gate:range`: if `FIRST_TRADE_CONTRACT_KEY` is active, speak under key
  `firstGateToll`. Toll from `gateTollFor` (`travelChoices.js:15`), pay from
  `FIRST_TRADE_CONTRACT.terms.paysCr`. Otherwise keep `firstGate`.
- Same file, the existing `sector:enter` listener (`:759`): a Ceres-arrival branch. Add one completion
  branch on contract source `firstTradeContract` for "Paid" and "Home". Sum the toll from
  `economy:chargeCredits {reason:'gate_toll'}` into `state.onboarding` (existing writer, no new system).
- `src/ui/jumpNotice.js:46-52`: append *" Sell the hold at Helios."* (or *" Sell the hold, then come
  back."* elsewhere). One string branch.
- Pins: `first-session-places.test.mjs:101-109`, `first-trade-contract.test.mjs` (rate unchanged),
  jumpNotice text tests.

## Working life

The first jump teaches the hauler's sum: what the job pays, minus what the road costs.
