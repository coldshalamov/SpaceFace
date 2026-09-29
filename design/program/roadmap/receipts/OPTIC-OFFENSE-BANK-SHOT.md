# OPTIC-OFFENSE — enemies bank shots off the lattice

Row: `build_map.md` #53 (§24 "Enemies use the room" — offensive half; the defensive splinter
gate landed earlier).

## What landed

`src/ai/fireDiscipline.js` + `src/systems/aiFireIntent.js`:

- `planOpticBankShot` — when an NPC's aimed lane dies on a non-prism body, walks the optic
  cells the shooter could light, replays each candidate's real cascade
  (`opticCascadeHits`/`traceOpticRay` — same grammar the settler runs), and returns the nearest
  cell whose ring lands on the intended target. Refuses when the direct lane is already live,
  when the first contact is a prism (the gate above already judged that shot), when the volley
  carries no energy bolt, when no cascade reaches the target, and when any splinter corridor
  crosses the shooter or a same-team hull. Deterministic: nearest reachable candidate,
  collidable-index order breaks ties.
- Lane ordering is by entry parameter (circle edge along the corridor), not center projection —
  a big body parked past the lane end but leaning back over it correctly counts as cover.
- The first-solid scan runs over the raw iterable and the flat replay set is built only after
  the lane is proven dead — the common case costs one pass and zero allocation.
- `opticCascadeHits` emits partial rings via `opticHeadings(count)`, matching the grammar's own
  emit rather than taking the first count of the fixed eight.
- Mount realization (`opticBankMountStatus` in aiFireIntent): a certified bearing only counts if
  an aim-following optic mount can bear it. Fixed guns release along `rot + facing ± gimbalArc`;
  a bearing outside the cone would fly the clamped edge the cascade never vetted, so the trigger
  holds (`optic_bank_slew`) while `intent.aimAngle` steers `bearing − facing` — the mount's bore
  lands on the corridor (front mounts keep facing 0, so that is the bearing itself), and flightV3
  turns the ship onto the aim whether or not it fires, so convergence is automatic and visible.
  Turrets and homing mounts lead the target themselves and cannot fly a bank: a ship without an
  aim-following energy mount keeps its ordinary (wasted) shot and stamps nothing.
- Candidate cells are also bounded by the furthest-ranging optic-capable mount — a certified
  corridor a bolt cannot physically reach is not a bank.
- `combat.opticBankId` names the corridor being used (or slewed toward); every refusal and
  no-bank path clears it.

## Tests

`test/optic-bank-shot.test.mjs` — 9 tests on the real Ceres prism gallery
(`compileCeresPrismGallery`): intent-level bank override, a **real swept bolt** flying the
certified bearing → prisms the fuse mouth → a spawned splinter physically lands on the off-line
target, clear-lane/kinetic non-banks, wingman-in-cascade refusal, ring-misses-target rejection,
gimbal slew-hold then converge-and-fire, turret-only battery cannot fake a bank, stale
`opticBankId` clearing.

Adjacent: `optic-field` 15/15, `optic-*`+wave suite 96→97/97 (a stale pre-existing red in
`wave-optic-spent-rekindle` — the decode-disc residency change had made `enterSector` leave the
gallery shelved — was repaired to drive `tickOpticFieldRocks` through the real promote path),
AI-fire battery 42/42.

## Deferred boundaries (logged, not blockers)

- **D95** — the awareness layer scans the live collidable index; shelved lattice cells outside
  the player's decode disc are invisible to the planner.
- **D96** — `firesEnergyVolley` excludes continuous/hitscan and homing mounts, so beam- and
  missile-armed ships take neither the defensive refusal nor the bank, even though the optic
  grammar handles beams/missiles. Shared boundary with the pre-existing defensive gate.
