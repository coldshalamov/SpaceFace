# SFQ-P09 — An economy the pilot can understand and physically influence

A contract, trade or theft changes an intelligible local chain of goods, money and opportunity.

**Disposition:** supporting source program, not an independently active queue. **Milestone band:** 3. **Existing owners to search:** PQ-177 / current economyMissionTerms and custody owners.

## Baseline and uncertainty

The repo already owns supply/demand, mission quotes, cargo, markets and physical trade consequences. This is a coherence and usability expansion, not a replacement economy. All balance values require current route measurement.

Sources: [S01](../audit/SOURCES.md#s01), [S08](../audit/SOURCES.md#s08), [S15](../audit/SOURCES.md#s15), [S16](../audit/SOURCES.md#s16). Source pins do not establish current performance or visual quality.

## Candidate owner paths

- `src/systems/economy.js`
- `src/systems/cargo.js`
- `src/systems/missions.js`
- `src/data/commodities.js`
- `src/ui/market/tradeLogic.js`
- `src/ui/screens/market.js`

These are owner neighborhoods; some are directly inspected and others are routed/inferred from repository maps or prior source context. Resolve the exact live selected function/file before activation. Do not create a missing path just to conform to a plan.

## Build-plan candidates

| Local ID | Work | Player outcome |
| --- | --- | --- |
| [SFQ-B081](../builds/SFQ-B081.md) | Expose the cause of a price | A pilot can distinguish scarcity, reputation, fees and stale intelligence in a quote. |
| [SFQ-B082](../builds/SFQ-B082.md) | Close one industrial supply chain | An observable miner-to-hauler-to-market chain has real goods and bounded accounting. |
| [SFQ-B083](../builds/SFQ-B083.md) | Make useful upgrades affordable without trivializing trade | Early work leads to meaningful hardware choices at a measured pace. |
| [SFQ-B084](../builds/SFQ-B084.md) | Make cargo mass a tactical decision | Heavy freight buys money at the cost of maneuver and escape options. |
| [SFQ-B085](../builds/SFQ-B085.md) | Preserve custody through dirty salvage | Ownership and contamination survive theft, transfer, wreck conversion and sale. |
| [SFQ-B086](../builds/SFQ-B086.md) | Build a recovery economy | Damage or insolvency leaves a playable route back to agency. |
| [SFQ-B087](../builds/SFQ-B087.md) | Make shortages produce jobs | A disrupted route produces a useful delivery, rescue or repair opportunity. |
| [SFQ-B088](../builds/SFQ-B088.md) | Create a bounded xenotech market | Alien materials have concrete uses, handling requirements and a limited buyer network. |
| [SFQ-B089](../builds/SFQ-B089.md) | Stress economy exploits | Transfers, refunds, partial deliveries and save interruption remain conservative. |
| [SFQ-B090](../builds/SFQ-B090.md) | Make the long-game economy optional depth | Automation supports flying instead of replacing the game with menus. |

## Directed INFERENCE candidates

| Local ID | Bounded change | Done when |
| --- | --- | --- |
| [SFQ-I033](../inference/SFQ-I033.md) | Quote shows its timestamp | A stale observation and a live station quote are distinguishable without color alone. |
| [SFQ-I034](../inference/SFQ-I034.md) | Empty hold explanation | The message matches the exact predicate that rejected it. |
| [SFQ-I035](../inference/SFQ-I035.md) | One custody flag survives a split | Split-and-recombine does not launder the flagged lot. |
| [SFQ-I036](../inference/SFQ-I036.md) | Cancelled offer clears its escrow once | Cancel, reload and repeat cannot refund twice. |

## Playable scenes

- [M02 — Breakaway freight](../missions/M02.md): SELECTED / ordinary-world teaching candidate
- [M03 — Warm cargo, narrow margin](../missions/M03.md): SELECTED
- [M06 — The moving manifest](../missions/M06.md): SELECTED
- [M07 — Cargo in the wake](../missions/M07.md): OPTIONAL / combine with an existing heist if similar
- [M08 — The impounded machine](../missions/M08.md): OPTIONAL
- [M13 — Pay back the wake](../missions/M13.md): SELECTED
- [M15 — Shortage at the gate](../missions/M15.md): SELECTED

## Required working method

[Admit into current owners](../integration/01_ADMISSION_AND_CROSSWALK.md), then use the [build-worker loop](../workflows/03_BUILD_WORKER.md) and [independent review](../workflows/08_INDEPENDENT_REVIEW.md). Uncertain design belongs in a [strong-agent campaign](../workflows/02_STRONG_AGENT_DESIGN.md), not a weak worker’s imagination.

Each selected feature needs real input, authoritative behavior, complete presentation and persistence. It is legal to finish this program’s useful core while cutting/defering optional proposals. The full candidate count is not a production quota.
