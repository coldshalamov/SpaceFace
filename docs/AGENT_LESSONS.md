<!-- LIFETIME: STABLE -->
# Agent lessons — owner preferences

Root [`AGENTS.md`](../AGENTS.md) is the authority and workflow front door. This file keeps durable
product and collaboration preferences; dated implementation facts belong near their current owner
and must be rechecked before use.

## Product and collaboration

- Give plain-language outcomes and verified options. The owner does not need code dumps or a request
  to decide ordinary technical risks; use engineering judgment within the requested scope.
- Verify a suspected bug against the live owner and the intended user behavior before changing it.
  Do not preserve an old implementation merely because prose or a test says it was intentional.
- Finish authorized work without stop-and-go continuation prompts. Do not leave a known defect or a
  placeholder on the path you were assigned.
- Keep investigation records useful and short. Preserve a concrete unresolved finding, its owner,
  and next step; remove stale piles and do not create parallel bug lists.
- Browser and Electron are shells of the same game. Keep gameplay, assets, settings, and player saves
  on the shared route.
- Use the named outside-resource policy in [`OPEN_SOURCE_INTAKE.md`](./OPEN_SOURCE_INTAKE.md) §0.
  Record licensing, bundle, performance, save/determinism, and maintenance effects before adding a
  dependency; do not paste Unreal Engine code.

## Visual identity and performance

- Preserve recognizable ship, station, and prop identity. Do not answer a visual brief with a cheap
  stand-in, an empty/box body, or a camera-facing soft square or disc; distant background stars are
  the exception.
- Small measured visual budgets are allowed when they preserve the authored identity and the result
  is checked at the gameplay camera. The Finish Program README §2 owns current hardware-tier and
  measurement rulings; older absolute “never lower quality” statements do not override it.
- Treat a reported freeze or play-blocking defect at its real production path. Verify the cause is
  handled before claiming the freeze is fixed; do not mask it with catch-and-continue behavior or
  unrelated nearby edits.
- A capture is useful only when the claim needs a rendered observation. Most behavior claims close
  with the live owner and a focused fixed-seed result or test. A missing GPU or capture-harness
  failure does not negate an implementation result; it does leave a visual or performance claim
  unmeasured when that claim depends on the capture.

## Recheck before use

Implementation details, system wiring, asset admission, and deferred-work notes change frequently.
Do not treat old workspace snapshots or a test count as current authority. Check the live owner,
current data, and the relevant route; update or remove a stale lesson in the same edit when it could
lead to a wrong implementation.
