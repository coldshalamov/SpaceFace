# SF-182 — Separate physical contamination from what the pilot knows

**Status:** PROPOSED — not admitted or implemented by this pack  
**Kind:** conditional expansion  
**Basis:** expansion proposal derived from existing ecology canon; not a claim of a shipped feature gap  
**Domain / current routing:** THE WORLD / THE LONG GAME — conditional later slice · Existing alien-ecology-program; CV-SO, CR-HOLLOW · [WF-03](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/design/inference-workflows/workflows/WF-03_SECTOR_WORLD_COMPOSITION.md) / [WF-08](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/design/inference-workflows/workflows/WF-08_MISSIONS_HEISTS_CONTRACTS_AND_WORLD_ACTIVITIES.md) / [WF-09](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/design/inference-workflows/workflows/WF-09_NARRATIVE_CHARACTERS_AND_LEDGER.md) / [WF-10](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/design/inference-workflows/workflows/WF-10_EXPLORATION_DISCOVERY_AND_MYSTERY.md)  
**Review allocation:** strong seam/cause adjudication first when unresolved; bounded implementation; stronger batch review

[Domain workflow](../../domains/13-ecology.md) · [Execution contract](../../EXECUTION_CONTRACT.md) · [Index](../../INDEX.md)

## Chosen player-facing outcome

Make the first slice's contamination derive from real place/event state while scanner terminology changes independently with revelation.

This is a proposed design decision, not a claim that the current game lacks every part of it. Numeric targets in this packet are proposed unless explicitly attributed to a source measurement.

## Why this direction, not the alternatives

One combined infection/story slider violates the canon; serializing cosmetic growth adds unnecessary state.

## Before changing code

**Expansion gate:** implement only when this expansion is explicitly selected/admitted. Reconcile with the current alien-ecology program and reuse its canonical owner; do not displace core-game repairs or launch all ecology ideas together.

Read the current root `AGENTS.md`, relevant nested instructions and the selected owner's current code. Check `git status --short`, the exact-path current work claims and the diff of candidate files. This snapshot is pinned to `c92756afb46a`; newer code and current owner direction win. Preserve foreign edits. The paths below are reading/change candidates, not permission to edit every file or own the whole lane.

## Verified source seams at the planning snapshot

| Existing path | Mechanically located reading anchors; verify the active caller |
|---|---|
| [`design/alien-ecology-program/00_CANON_SYNTHESIS.md`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/design/alien-ecology-program/00_CANON_SYNTHESIS.md) | Read this owner/data seam and trace its live consumer; no task-specific symbol asserted. |
| [`design/alien-ecology-program/08_ENGINEERING_ARCHITECTURE.md`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/design/alien-ecology-program/08_ENGINEERING_ARCHITECTURE.md) | Read this owner/data seam and trace its live consumer; no task-specific symbol asserted. |
| [`design/alien-ecology-program/09_VERTICAL_SLICE.md`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/design/alien-ecology-program/09_VERTICAL_SLICE.md) | Read this owner/data seam and trace its live consumer; no task-specific symbol asserted. |
| [`src/systems/regionalEcology.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/regionalEcology.js) | [`regionalEcology`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/regionalEcology.js#L223) |
| [`src/systems/scanner.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/scanner.js) | [`scanner`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/scanner.js#L806) |
| [`src/systems/worldSiteRuntime.js`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/src/systems/worldSiteRuntime.js) | Read this owner/data seam and trace its live consumer; no task-specific symbol asserted. |

Symbols above were found in source; they are navigation aids, not claims that every symbol must change. A new helper is justified only when the existing owner needs it, and stays subordinate to that owner.

## Implementation sequence

1. **Locate the live seam.** Read the existing canon and vertical-slice plan plus current implementation. Reuse its IDs and helper if landed; any proposed new path in the bank is not evidence of a missing file.
2. **Implement the chosen mechanism.** Use the architecture's proposed pure alienEcology helper if it has landed, otherwise add the smallest data/helper module through the existing owner. Keep C and R separate: a scan may increase knowledge but never fungal mass. Persist only player-caused site changes and revelation through their current canonical containers.
3. **Keep the player-facing chain complete.** Make the alien consequence alter a familiar physical verb and give noncombat observation a useful outcome. Present memory as fragmentary traces, not an authoritative voice.
4. **Cover lifecycle and counterexamples.** Test boundary distance, carrier separation, lost host, save/revisit and ordinary uninfected control. Confirm no species gains intelligence or instant adaptive armor.
5. **Converge on the played result.** Play the encounter without lore text. The rule should be discoverable and the mystery should deepen without revealing an unsupported origin story.

## Ownership and non-goals

One biological phenomenon tied to Vethari; finite/noisy connection, no new brain mass, no omniscient hive and no telepathic exposition. Precursor machines are a separate remnant layer. Preserve source/host/carrier distinctions and all current save/cargo/law owners.

Do not replace the selected mechanism with a hidden flag, registry-only addition, free resource grant, debug-only scene, VFX-only simulation, or a report. Do not weaken golden tests or lower default visual quality to make the packet pass. Necessary functional frontend changes use current ORRERY components; this packet does not authorize a competing redesign.

## Scenario and acceptance cases

Visit the same site with low and high knowledge, scan repeatedly and reload. Physical behavior remains identical for equal world state, labels become more informative and neither story progress nor opening the map creates contamination.

Add the packet-specific regression to the nearest relevant owner suite. Test the successful path, the contrary/invalid case described above, and removal/cancellation or repeated invocation at the actual commit boundary. Assert authoritative results, not merely that a callback fired. Record an explicit before/after difference for the chosen outcome; passing an unchanged old test alone is insufficient.

**Ordinary-route entry:** Only after the upstream vertical slice is real: approach a reachable contaminated place, infer one local rule, use an existing tool, and revisit its bounded consequence.

**Existing test starting points — verified files, not a complete acceptance suite:**

- [`test/asteroid-scan-glyph.test.mjs`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/test/asteroid-scan-glyph.test.mjs)
- [`test/planet-state-scanner-signals.test.mjs`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/test/planet-state-scanner-signals.test.mjs)
- [`test/scanner-signal-investigation.test.mjs`](https://github.com/coldshalamov/SpaceFace/blob/c92756afb46a9115d47e9d1757369678023efce4/test/scanner-signal-investigation.test.mjs)

From the repository root, after its dependencies are available:

```sh
node --test test/asteroid-scan-glyph.test.mjs test/planet-state-scanner-signals.test.mjs test/scanner-signal-investigation.test.mjs
```

Read these tests before running them: some are integration or media-dependent. Missing packages/assets are an execution limitation, not proof of a game defect. Add the targeted new assertion and run the relevant current checks from `package.json`; do not blindly run the entire repository check chain for every packet.

## Capability dependencies and overlap

No new planbank prerequisite. Existing compatible capabilities satisfy this packet; verify them rather than rebuilding them.

Check the existing INFERENCE catalog and active queue for an equivalent admitted change. If an integration packet reuses this outcome, implement it once and point the integrator to the resulting code. Serialize overlapping exact-path edits; disjoint work can proceed. No all-300 waterfall is intended.

## Finish and review

A bounded result may be **implemented / route-unproven** when production is committed and direct checks pass but this environment cannot exercise the ordinary route. Use **accepted** only when the actual reachable player outcome has been observed. Neither a test-only patch nor a finished plan counts as a production unit.

Give the next reviewer the owned diff/commit, the outcome, precise checks and remaining uncertainty in the existing workflow; do not create another review archive. The stronger batch review should challenge the chosen mechanism, integration and counterexample above, not count files or reward verbosity. When the premise is already satisfied, say so rather than manufacturing work.
