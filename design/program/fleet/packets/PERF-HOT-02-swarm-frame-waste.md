# PERF-HOT-02 — The remaining Swarm per-frame waste (behaviour-preserving)

Same rules as PERF-HOT-01 (read its packet and your own receipt in
`.devshots/fleet/runs/PERF-HOT-01-swarm-frame-waste.dsx.2026-11-15T18-50-54/RECEIPT.md`, your good work
there is the standard: you correctly refused item 15 and widened two cache keys). One commit per item,
exact paths, tests before/after per item. Item numbers are from the INV-03 receipt
(`.devshots/fleet/runs/INV-03-swarm-hot-path.dsx.2026-11-15T18-35-04/RECEIPT.md`), which has the reasoning.

## Items, in priority order
- **1** `src/render/visualFactory.js` `syncSwarmThreatPlate` (~2860–3020): the biggest one. Cache the child
  handles (plate / chevron / glyph / lamp) once per mark (they live in the `_swarmThreatMarks` WeakMap) instead
  of `getObjectByName` each frame; take the camera world quaternion once per frame from the caller (pass it
  in from the renderer loop at `renderer.js` ~29219) instead of per ship. Only reuse the parent's scale
  instead of `decompose` if you can prove the value is identical (same frame, same matrix); otherwise keep the
  decompose. The marks must look and move exactly as before.
- **6** `src/ui/hud.js` `updateDoctrineTells` (~3398): fill a preallocated `reserved` array of reused
  `{x,y,width,height}` slots in place instead of `.filter().map()` per frame.
- **8** `src/ui/hud.js` (~6158) `resolveObjectiveHudLayout`: memoise on `(viewportWidth, viewportHeight)`;
  return the previous object when unchanged. First confirm no caller mutates the returned layout; if one does,
  skip and say so.
- **13** `src/render/renderer.js` (~29143–29161) per-ship `initialShipLodSample` matrix copies: skip the
  copy when the camera's matrices have not changed since the last copy (compare a per-frame camera revision
  the renderer already keeps, if any; if none exists, skip the item and say so).
- **3** `src/ui/floatingTextRules.js` `seatOutOfRects` (~114–125): avoid the allocations when the label's
  original box is not blocked (the common case); keep the exact same placement result when it is blocked.

## Checks
As PERF-HOT-01. For item 1 also run every test file that mentions `syncSwarmThreatPlate`,
`swarmThreat` or `threatPlate`.
