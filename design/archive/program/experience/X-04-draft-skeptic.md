# X-04 draft — The Skeptic

**Verdict.** The first-trade brief makes a checkable claim: "Gate tolls come out of the run — this pay clears
them" (`economyContractTemplates.js:337`). Each toll is set by the *destination's* security (`world.js:5815`,
`travelChoices.js:15-17`). Out costs 194, back costs 246, so 440 total, and 760 − 440 = 320. The game never
shows that arithmetic. A broke pilot hears "Gate toll N cr — purse holds M cr" (`jumpNotice.js:46-52`): the
wall, but not the door.

**Proposal — four one-shot lines.** Each number is computed by `gateTollFor()` at runtime, so the promise
cannot drift from the price. Each line is gated by a `player.hints` flag.
1. **Gate.** In `gate:range` (`onboarding.js:741-745`): if a `firstTradeContract` mission is active and the
   gate leads to Ceres, speak "Toll 194 out, 246 back. The cells pay 760." instead of the generic `firstGate`,
   under the same `_showHint` gates.
2. **Arrival.** On `sector:enter` (`world.js:1204`) into Ceres with the contract active: "Ceres. Refinery is
   down the Flare Rack. Home toll: 246." The Flare Rack is a real anchor (`sectorAnchors.js:109`).
3. **Payout.** When `first_trade_loop` completes, one receipt line: "Run cleared: 760 in, 440 tolls, 320
   yours."
4. **Refusal.** In `jumpAbortText` credits, append " — the Helios board pays work." It is a true pointer:
   starter jobs pay 420–760. This closes FIRST_SESSION_MAP §5 gap 3.

**Poke → reward.**
- Jump broke: told where money is.
- Jump: shown the math before paying it.
- Arrive: pointed at the dock.
- Finish: proof the brief told the truth.

The galaxy map's "N cr toll" (`galaxyMap.js:1064-1102`) must match line 1; a mismatch fails a test.

**Not doing.** No forced jump, no rail beat, no route lock.

**Regression risk.**
- Line 1 must respect `_tutorialRailOwnsVoice`.
- `jump-verb-notice` probably pins the refusal string. Re-pin it deliberately and name it in the commit.

Keep green:
- `first-trade-contract`, `first-session-places:101-109`
- `jump-verb-notice`, `galaxy-map-gate-jump-seam`, `inf-law-11-toll-footprint`
- `first-hour-voice`, `first-hour-voice-priority`, `first-hour-alert-dedupe`
