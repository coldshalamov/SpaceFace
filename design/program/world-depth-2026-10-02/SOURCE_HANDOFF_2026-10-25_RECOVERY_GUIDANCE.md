# Last Shift recovery guidance: source handoff
Updated: 25 October 2026, 03:18 UTC.

Published source: [07d6980fbd77e557b511177ea8cd0bbf88d4fb1d](https://github.com/coldshalamov/SpaceFace/commit/07d6980fbd77e557b511177ea8cd0bbf88d4fb1d), parent 5beb49b9049cd826296b6ae13baa690ba4995667. This handoff covers source and local qualification only.

## Implemented behavior
Scanning the original recorder exposes an optional recovery page. It distinguishes filing sources from returning hardware, explains cautious tow handling and no extra payment, and reads the current owner state. Tow or berth loss updates an open page; closed pages stay closed. Back requests fresh state. Stale callbacks, malformed recovery states, rejected prompt admission, lifecycle clears and reentrant resolution cannot revive an invalid action. The new read-only request crosses the main-to-simulation bridge; custody, ownership, rewards and return requirements are unchanged.

## Exact six changed paths
- package.json — 1915680f691fabb6236229c159e67938d21aa622
- src/core/mainToSimEventSurface.js — affd68c3d0185c36de709d8c735548601631aae7
- src/systems/lastShift.js — 2f616ce2a737c9404125a2004855f434b3e01575
- src/ui/lastShiftPrompt.js — 4c33e40bff779f0396d7ae8f84a241402f59948d
- test/last-shift-recovery-guidance.test.mjs — 20d8ebc5d45121d07a3ecbb2caaaa3fa0473baf3
- test/last-shift-worker-entry.test.mjs — fc31770cf5610a55ed54a82b8449259e38fc540a

## Local evidence and boundaries
The coherent local qualification completed 59 cases. Independent source review passed. The optional-chain test was UNRUN LOCALLY because full-filesystem child execution was unavailable; it remains unchanged in the published test leaf. Separate configured-start attempts did earn three-source filing and the original 5T tow, but ended in destruction or a protective pause. Complete original-recorder return has not passed; these configured-start control attempts are not an ordinary-arrival playthrough. This is not a browser, independently piloted route, full Save/Continue or whole-game acceptance result.

## Next executable work
Continue the bounded recorder route and establish actual original-recorder return without changing physics or rewards. Preserve failed attempts separately. The reviewed fairlead collision/visual successor remains a separate held candidate: publication, normal generated-census checks, current-runtime Save behavior and live visual acceptance remain open. Do not install it by inference from a preview or preparation manifest.

All twelve outcome goals remain OPEN in [OPEN_GOALS.md](OPEN_GOALS.md). Preserve original scope in [IMPLEMENTATION.md](IMPLEMENTATION.md), [TWENTY_CONCEPT_MAP.json](TWENTY_CONCEPT_MAP.json) and [build_map.md](../../../build_map.md). [Prior immutable register](https://github.com/coldshalamov/SpaceFace/blob/5d62a0e86b8d9071d7e03b02b6c965f3ded3bab5/design/program/world-depth-2026-10-02/OPEN_GOALS.md) retains history. The old checkpoint and sector register are unchanged historical evidence, not authorization to retry held operations.
