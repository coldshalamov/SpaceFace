# PQ-146.00 — Trick taxonomy and detectors

<!-- LIFETIME: ACTIVE_RECEIPT -->

```text
DONE PQ-146.00 — Pure stunt taxonomy and detector engine recognizing 13 named tricks from physics and combat receipts with verified causal chains.
WHAT I FOUND     The physics simulation produced rich contact and tether events, but lacked a causal interpreter to recognize player-orchestrated stunt combinations.
WHAT I CHANGED   Implemented a pure stunt detector module that maps receipt streams to named tricks with structured cause chains, and wired it to the simulation event bus.
WHAT YOU WILL FEEL   When you pull off stunts like slinging asteroids into ships, whipping hostiles with cables, or bowling enemies into each other, the system accurately detects each stunt and its exact cause chain without ever mistaking ordinary flight bumps for combat tricks. Scoring and ledger integration in subsequent leaves will reward and document these moments.
THE NUMBERS      bar | before | after | target
                 Named tricks detected deterministically in scenarios | 0 | 13 | >= 12
                 False-positive rate on ordinary flight tapes | unmeasured | 0.0% | < 5.0%
                 Scenario determinism reproduction | unmeasured | 100% | 100%
THE FRAMES       Not applicable (pure contract and detector logic; presentation leaves .01/.03 follow).
NEXT             PQ-146.01 Combo meter and scoring in the Crucible
```

## Summary of Implementation

- **Taxonomy & Schema (`src/combat/stuntTaxonomy.js`)**:
  - Implemented 13 canonical tricks: `razor_release`, `wrecking_ball`, `clothesline`, `bolas`, `collateral`, `tow_kill`, `rock_discovery`, `dead_mans_mass`, `well_golf`, `near_miss`, `snap_catch`, `shove_bowling`, `bank_shot`.
  - Defined explicit rarity tiers (`common`, `uncommon`, `rare`, `legendary`) and base score multipliers.
  - Every detected trick produces an immutable receipt containing: `schemaVersion: 1`, `trickId`, `name`, `rarity`, `baseScore`, `actorId`, `targetId`, `secondaryIds`, `metrics`, and an ordered `causeChain` tracing the full lineage of who threw, what hit, and what it hit next.
  - Exported through `src/combat/index.js`.

- **Runtime Event Bus Wiring (`src/systems/stuntGrammar.js`)**:
  - Implemented `stuntGrammar` system observing physics receipts, collision consequences, tether releases, whip impacts, impulses, and entity kills.
  - Emits `stunt:trickDetected` onto the event bus.
  - Maintains single-writer isolation on `state.stunts` with a bounded ring buffer (`MAX_RECENT_TRICKS = 64`) and rarity telemetry counters.

- **Verification Suite (`test/stunt-taxonomy.test.mjs`)**:
  - 17 unit tests verifying all 13 tricks in deterministic scenarios.
  - Verified bit-identical reproduction across repeat trace processing.
  - Verified 0 false positives (0.0% rate, well below the 5.0% threshold) against a 1,000-event ordinary flight trace containing cruising, gentle docking bumps, wide clearances, and routine mining unlatches.
