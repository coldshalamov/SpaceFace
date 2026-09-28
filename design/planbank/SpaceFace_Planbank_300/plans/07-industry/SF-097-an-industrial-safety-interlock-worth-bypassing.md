# SF-097 — An industrial safety interlock worth bypassing

**Status:** PROPOSED — not admitted or implemented by this pack  
**Kind:** deepening  
**Basis:** design proposal; current gap requires ordinary-route comparison  
**Domain / current routing:** THE WORLD / THE LONG GAME · PQ-145, PQ-148, PQ-177; CV-DAY, CR-FEED, CR-ANVIL · [WF-04](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/design/inference-workflows/workflows/WF-04_STATIONS_PLANETS_WORLD_SITES.md) / [WF-06](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/design/inference-workflows/workflows/WF-06_ECONOMY_INDUSTRY_AND_LOGISTICS.md)  
**Review allocation:** implementer + stronger batch review

[Domain workflow](../../domains/07-industry.md) · [Execution contract](../../EXECUTION_CONTRACT.md) · [Index](../../INDEX.md)

## Chosen player-facing outcome

Give one existing machine a clear safety condition that prevents dangerous normal operation, while allowing a deliberate physical bypass with real risk and legal consequences.

This is a proposed design decision, not a claim that the current game lacks every part of it. Numeric targets in this packet are proposed unless explicitly attributed to a source measurement.

## Why this direction, not the alternatives

A hidden lock feels arbitrary; a consequence-free override makes safety meaningless.

## Before changing code

**Equivalent-feature gate:** compare the current ordinary route with this proposed outcome. If an equivalent already works, use it and close the selected candidate as already satisfied; add only the missing behavior, not a parallel implementation.

Read the current root `AGENTS.md`, relevant nested instructions and the selected owner's current code. Check `git status --short`, the exact-path current work claims and the diff of candidate files. This snapshot is pinned to `c92756afb46a`; newer code and current owner direction win. Preserve foreign edits. The paths below are reading/change candidates, not permission to edit every file or own the whole lane.

## Verified source seams at the planning snapshot

| Existing path | Mechanically located reading anchors; verify the active caller |
|---|---|
| [`src/data/environmentalMachinery.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/data/environmentalMachinery.js) | Read this owner/data seam and trace its live consumer; no task-specific symbol asserted. |
| [`src/systems/environmentalMachinery.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/environmentalMachinery.js) | [`environmentalMachinery`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/environmentalMachinery.js#L100) |
| [`src/systems/worldSiteRuntime.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/worldSiteRuntime.js) | Read this owner/data seam and trace its live consumer; no task-specific symbol asserted. |
| [`src/systems/asteroidSites.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/asteroidSites.js) | [`asteroidSites`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/asteroidSites.js#L120) |
| [`src/systems/siteProduction.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/siteProduction.js) | Read this owner/data seam and trace its live consumer; no task-specific symbol asserted. |

Symbols above were found in source; they are navigation aids, not claims that every symbol must change. A new helper is justified only when the existing owner needs it, and stays subordinate to that owner.

## Implementation sequence

1. **Locate the live seam.** Read the durable site record, materialization helper and operation dispatch. Match every proposed socket to actual placed geometry and collision.
2. **Implement the chosen mechanism.** Use existing operation prerequisites and hazard geometry. Require a visible obstruction/occupancy condition, explain the refusal at the socket and provide an existing-tool bypass such as moving the safety weight. Bypassing must not disable collision/damage authority; workers react through their normal interruption and law owners.
3. **Keep the player-facing chain complete.** Give the site a normal job, a risk and a useful player intervention; update visible machinery state from the same operation truth.
4. **Cover lifecycle and counterexamples.** Test occupied sockets, duplicate interaction, unload/reload, destruction mid-transfer and save between phases. Verify stock, shipment and player totals jointly.
5. **Converge on the played result.** Fly the approach at the shipping camera and use the operation without reading its documentation. Preserve navigation clearance and a visible post-operation change.

## Ownership and non-goals

No second site manager or player-cargo shadow ledger. Stable worldRecordId is persistent identity; entity IDs can recycle. Convert sector-local coordinates once. Physical operation success and money/cargo commits remain separate canonical responsibilities.

Do not replace the selected mechanism with a hidden flag, registry-only addition, free resource grant, debug-only scene, VFX-only simulation, or a report. Do not weaken golden tests or lower default visual quality to make the packet pass. Necessary functional frontend changes use current ORRERY components; this packet does not authorize a competing redesign.

## Scenario and acceptance cases

Operate safely, bypass with a worker nearby and restore the interlock. The machine's output/risk changes physically, no accidental input silently chooses bypass and any harm has accurate provenance.

Add the packet-specific regression to the nearest relevant owner suite. Test the successful path, the contrary/invalid case described above, and removal/cancellation or repeated invocation at the actual commit boundary. Assert authoritative results, not merely that a callback fired. Record an explicit before/after difference for the chosen outcome; passing an unchanged old test alone is insufficient.

**Ordinary-route entry:** Find the place from ordinary flight, identify its moving parts, perform at least two verbs, take its output to a real sink, then return after saving.

**Existing test starting points — verified files, not a complete acceptance suite:**

- [`test/pq-153-01-hazard-geometry.test.mjs`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/test/pq-153-01-hazard-geometry.test.mjs)
- [`test/world-site-map-traffic.test.mjs`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/test/world-site-map-traffic.test.mjs)
- [`test/environmental-machinery.test.mjs`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/test/environmental-machinery.test.mjs)

From the repository root, after its dependencies are available:

```sh
node --test test/pq-153-01-hazard-geometry.test.mjs test/world-site-map-traffic.test.mjs test/environmental-machinery.test.mjs
```

Read these tests before running them: some are integration or media-dependent. Missing packages/assets are an execution limitation, not proof of a game defect. Add the targeted new assertion and run the relevant current checks from `package.json`; do not blindly run the entire repository check chain for every packet.

## Capability dependencies and overlap

No new planbank prerequisite. Existing compatible capabilities satisfy this packet; verify them rather than rebuilding them.

Check the existing INFERENCE catalog and active queue for an equivalent admitted change. If an integration packet reuses this outcome, implement it once and point the integrator to the resulting code. Serialize overlapping exact-path edits; disjoint work can proceed. No all-300 waterfall is intended.

## Finish and review

A bounded result may be **implemented / route-unproven** when production is committed and direct checks pass but this environment cannot exercise the ordinary route. Use **accepted** only when the actual reachable player outcome has been observed. Neither a test-only patch nor a finished plan counts as a production unit.

Give the next reviewer the owned diff/commit, the outcome, precise checks and remaining uncertainty in the existing workflow; do not create another review archive. The stronger batch review should challenge the chosen mechanism, integration and counterexample above, not count files or reward verbosity. When the premise is already satisfied, say so rather than manufacturing work.
