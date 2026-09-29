# Source audit — where the next wave should act

**Baseline:** `9a30ffc00204a943ed9307deb56cb8bf23687ad9`. This is a connected-source and plan audit, not a live-play verdict. The exact inspected ranges and limitations are in [SOURCE_PROVENANCE.md](SOURCE_PROVENANCE.md).

## 1. The routing problem is real in source

The [legacy dispatcher](https://github.com/coldshalamov/SpaceFace/blob/9a30ffc00204a943ed9307deb56cb8bf23687ad9/scripts/program-dispatch.mjs) handles an empty ready-unit set by directing the agent to open-ended finish lanes. The [numbered build board](https://github.com/coldshalamov/SpaceFace/blob/9a30ffc00204a943ed9307deb56cb8bf23687ad9/build_map.md) already contains open directed work and the prior 300-packet bank. Consequently, an empty PQ result is not evidence that the game's useful task supply is empty.

**Proposed change:** fix that message, add exact canonical board/catalog rows, and provide a read-only row selector. The legacy machine queue is not rewritten or falsely reported as refilled. This preserves one status source per work size while giving agents a practical entry point.

## 2. There is already a substantial idea bank

All 300 prior index entries and the September 28 triage were compared, along with current board outcomes. All 300 full packet bodies were not re-read. The prior bank already covers basic G-stick behavior, force weapons, wrecks as terrain, cargo custody, industrial loops, discovery, presentation and continuity. Several combined player moments are already marked completed on the board.

**Proposed change:** explicit deltas and prior references for all 60 strong packets. Most new work is a more precise composition or operational completion of existing intent—not a claim to have invented a completely different feature. Runtime-equivalent work closes rather than being implemented twice.

## 3. The unique game is in interactions, not content count

The [vision](https://github.com/coldshalamov/SpaceFace/blob/9a30ffc00204a943ed9307deb56cb8bf23687ad9/design/VISION.md) identifies physical agency inside a working local world as the core. The useful next questions are therefore whether a tow can complete a partial receiver delivery, a damaged convoy preserves actual freight, a player arriving at a raid produces one settlement, and a kill leaves a useful body with the right legal cause.

NXB-005–008, 023–028 and 033–044 develop these interactions. They are concrete proposals; their absence everywhere in current source was not established. Their packets contain the check that retires them when already true.

## 4. A specific cargo design boundary is visible

The inspected [cargo owner](https://github.com/coldshalamov/SpaceFace/blob/9a30ffc00204a943ed9307deb56cb8bf23687ad9/src/systems/cargo.js) exposes `isUnsellableCargo` as a commodity-wide boolean for persistent/preloaded contract freight. An inspected [market excerpt](https://github.com/coldshalamov/SpaceFace/blob/9a30ffc00204a943ed9307deb56cb8bf23687ad9/src/ui/station/screens/market.js) uses it to filter held rows. This cannot, by itself, distinguish free units from reserved units of the same good.

NXB-025 prescribes quantity-aware intent validation while retaining the aggregate cargo writer and mission ownership. It is an intentional design extension, not a report that a runtime exploit was reproduced. Its narrow NXI-097/098 entries separately protect explicit dump selection and visible ownership.

## 5. Several important foundations already exist

Inspected sources show the bounded G-stick; rack/stock and typed bomb scans; pure seeded wave planning; claim specializations and station growth; ending/continuity/NG+ imports; an audio priority/mix system with its own scheduling loop; and chunked, validated saves. The loop entry delegates to the existing simulation/presentation runners.

The tasks target cross-device, cross-owner, transaction, time, lifetime and ordinary-route boundaries. They do not ask agents to add those foundational systems again. Headers and imports establish only their described architecture; they do not prove the whole feature is polished or reachable.

## 6. Current branch ownership matters

At inspection, [PR #170](https://github.com/coldshalamov/SpaceFace/pull/170) was open and reported alien ecology phases 0–10 plus an AE-160–299 follow-on roadmap. This wave adds no competing ecology program. [PR #174](https://github.com/coldshalamov/SpaceFace/pull/174) was open with discovery/cadence/matrix/economy changes and further experiments reported in flight. NXB-057 waits for that or an equivalent integrated capability before looking for a real cross-feature regression. No PR performance claim is presented as this audit's measurement.

## 7. Professional completion is functional as well as aesthetic

[ORRERY](https://github.com/coldshalamov/SpaceFace/blob/9a30ffc00204a943ed9307deb56cb8bf23687ad9/design/frontend/ORRERY.md) already owns the visual direction. NXB-049–056 complete compositional VFX/audio, selected-object continuity, multi-destination navigation, alternate control semantics and long-content layouts inside that direction. No new UI product is proposed.

A clean source diff cannot certify that the result looks, sounds or feels professional. The attached review plan requires the changed behavior on the ordinary route, including mistakes. It prioritizes fixing the leading player-facing failure rather than accumulating more effects or declaring success from test counts.

## What this audit does not claim

It does not rate every system from hands-on play, certify 60 fps on the user's device, inspect every asset or test, establish 300 novel defects, validate all 115 candidate owner paths end to end, or prove a clean application against a full checkout. Local bundle/tool/patch-fixture validation is separate from game validation. The resulting packet supply is useful precisely because it gives implementers narrow, falsifiable outcomes rather than pretending the unknowns are settled.
