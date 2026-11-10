Both findings fixed:

- Final marker follows the moving wreck; alignment at the displaced wreck releases the recorder.
- Remembered Wasp resolves to its packaged hull and retains that selection after reload with a different entity ID.

The marker previously used the site center while release checked the wreck position. Wreck rendering also requires `hulkOfDefId`, which now receives the already-recorded ship identity.

Changed only:

- [src/world/playerHullEcho.js](/C:/Users/93rob/Documents/GitHub/SpaceFace/src/world/playerHullEcho.js)
- [test/m11-ship-that-flew-before.test.mjs](/C:/Users/93rob/Documents/GitHub/SpaceFace/test/m11-ship-that-flew-before.test.mjs)

Both new regressions reproduced the original failures before the fix. Final tests:

- `m11-ship-that-flew-before.test.mjs`: **8 passed, 0 failed**
- `world-persistence-foundation.test.mjs`: **20 passed, 0 failed**

`worldRecords.js` needed no change. No adjacent defects found; changes remain uncommitted per campaign constraints.