# SFQ-P23 — Save integrity, input access and product completeness

The game preserves a player’s progress, explains failures, and stays usable across ordinary devices and sessions.

**Disposition:** supporting source program, not an independently active queue. **Milestone band:** 1. **Existing owners to search:** PQ-164 / PQ-165 / PQ-166 / current save and transition owners.

## Baseline and uncertainty

Browser and Electron share the game route and save contracts. Existing migrations, transition tokens and accessibility support must be extended, not replaced. Language count and platform promises need a scoped launch decision.

Sources: [S01](../audit/SOURCES.md#s01), [S08](../audit/SOURCES.md#s08), [S14](../audit/SOURCES.md#s14), [S19](../audit/SOURCES.md#s19). Source pins do not establish current performance or visual quality.

## Candidate owner paths

- `src/save/saveSystem.js`
- `src/core/runTransitionGuard.js`
- `src/systems/input.js`
- `src/ui/screens/settings.js`
- `electron/main.cjs`
- `src/main.js`

These are owner neighborhoods; some are directly inspected and others are routed/inferred from repository maps or prior source context. Resolve the exact live selected function/file before activation. Do not create a missing path just to conform to a plan.

## Build-plan candidates

| Local ID | Work | Player outcome |
| --- | --- | --- |
| [SFQ-B221](../builds/SFQ-B221.md) | Prove save-resume through new interactions | Tethers, material states, site changes and mission transactions resume or expire intentionally. |
| [SFQ-B222](../builds/SFQ-B222.md) | Make old saves recover safely | Added content does not invalidate a player’s existing campaign silently. |
| [SFQ-B223](../builds/SFQ-B223.md) | Protect overlapping new/load operations | Rapid user actions cannot commit a stale async scene or overwrite the wrong save. |
| [SFQ-B224](../builds/SFQ-B224.md) | Finish input rebinding and device changes | Keyboard, trackpad, mouse and supported controller can reach essential verbs. |
| [SFQ-B225](../builds/SFQ-B225.md) | Make settings truthful | Displayed values actually control gameplay presentation and persist correctly. |
| [SFQ-B226](../builds/SFQ-B226.md) | Preserve critical information access | Reduced motion, reduced flash, larger text and non-color cues keep the game playable. |
| [SFQ-B227](../builds/SFQ-B227.md) | Prepare localization without scope inflation | Text is consistently sourced and survives expansion, without inventing a localization project size. |
| [SFQ-B228](../builds/SFQ-B228.md) | Make errors leave an exit | Missing assets, failed services and corrupted optional state produce useful recovery paths. |
| [SFQ-B229](../builds/SFQ-B229.md) | Audit packaged parity and media provenance | The same game, assets and licenses work in the intended local product. |
| [SFQ-B230](../builds/SFQ-B230.md) | Close whole-session reliability | The complete play session tolerates ordinary interruption and return. |

## Directed INFERENCE candidates

| Local ID | Bounded change | Done when |
| --- | --- | --- |
| [SFQ-I089](../inference/SFQ-I089.md) | Transient handle does not enter save | Round-trip restores behavior without stale object references. |
| [SFQ-I090](../inference/SFQ-I090.md) | Disconnect clears held action | Reconnect begins neutral and never fires an old held command. |
| [SFQ-I091](../inference/SFQ-I091.md) | Large text preserves primary action | The action remains visible and focusable. |
| [SFQ-I092](../inference/SFQ-I092.md) | Error path has a safe return | The player can leave the failed operation without restarting the process. |

## Playable scenes

- [M36 — The universe keeps working](../missions/M36.md): CORE FINISH ROUTE / composite acceptance, not a new mission

## Required working method

[Admit into current owners](../integration/01_ADMISSION_AND_CROSSWALK.md), then use the [build-worker loop](../workflows/03_BUILD_WORKER.md) and [independent review](../workflows/08_INDEPENDENT_REVIEW.md). Uncertain design belongs in a [strong-agent campaign](../workflows/02_STRONG_AGENT_DESIGN.md), not a weak worker’s imagination.

Each selected feature needs real input, authoritative behavior, complete presentation and persistence. It is legal to finish this program’s useful core while cutting/defering optional proposals. The full candidate count is not a production quota.
