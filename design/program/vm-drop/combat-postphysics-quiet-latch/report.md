# report — combat-postphysics-quiet-latch (#155)

## Pole

Combat kernel `postPhysics` ensureCombatant + syncCombatantBounds walk after
#154 prePhysics quiet latch. Attachments already empty-early-out on master.
`syncCombatantBounds` is vital clamping only — already done on busy walks
and at mutation sites.

## Cut

When #154 quiet latch is armed (membership + cacheRevision + rescanAt),
`postPhysics` skips the entity walk after reconcile/telemetry. Bench toggles:
`setCombatPostPhysicsQuietSkipForBench` /
`getCombatPostPhysicsQuietSkipForBench`. Publishes
`state.combatRuntime.postPhysicsQuietSkipped`. Wake via existing
`noteCombatPrePhysicsWake` (same set as #154).

## Evidence

- Floor 5×11: medians **~13.5–14.1×**, package floorMin **≥9.32×**,
  absBefore ~11.4–11.8 µs, dirtyWakeOk all true
- Focused: post skip 5/5; +#154 latch 10/10; combat review 27/27 (37/37)
- Am-verify on `97c88f92b`+#154 → `649b3c51a`

## Non-claims

Soft-GPU fps. Picture unchanged. Not the stale empty-byId claim folder
`combat-postphysics-quiet-skip`.
