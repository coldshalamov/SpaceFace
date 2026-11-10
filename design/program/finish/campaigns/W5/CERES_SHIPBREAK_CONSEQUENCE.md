# Second Measure: the cut that cannot be braced

## Diagnosis and chosen scope

The director toolbox's Ceres brace → cut → release → tow → cradle sequence already exists.
`ceresShipbreak.js` owns the three authored sections; `ceresWorkfleet.js` coordinates the original
breaker, cutter and receiving cradle through native bodies and attachments. This is separate from
the LARK salvage-yard jobs and the saved Wreck Cathedral. No new model or duplicate job is needed.

The missed consequence was concrete: cutting the long-plate seam before bracing releases the
original 1,800-mass body. The canonical site kernel then refuses `brace_long_plate` with
`section-already-cut`. The yard returned no call, while Kessler still advertised the impossible
400-credit brace. A direct before-source probe reproduced both misleading presentation outcomes.
This is a presentation gap over sound physical/save ownership, not a reason to replace that owner.

## Change

- The existing arrival call warns that the support cannot catch an already freed plate.
- A premature cut gets a local yard explanation and an accurate Kessler return conversation.
  Neither grants a brace, wage, new plate, repair or crew job.
- After a supported cut, the yard names the remaining clamp and the actual original's destination
  instead of asking the pilot to repeat the completed seam cut.
- A destroyed original takes precedence over a stale secured phase. Docked UI and repeated calls
  remain quiet. All consequence text derives from the current site/job, including after Continue.

Exact source scope: `src/systems/ceresWorkfleetStagecraft.js` and
`src/ui/station/ceresShiftConversation.js`. The new test is
`test/ceres-shipbreak-consequence.test.mjs`; one obsolete silence assertion changes in
`test/ceres-workfleet-stagecraft.test.mjs`. No model, geometry, sim authority, economy, schema or
denied source/upload changes. Existing unrelated working-tree edits are preserved.

## Verification, 10 November 2026

**33/33 passed:**

```
node --test test/ceres-shipbreak-consequence.test.mjs test/ceres-workfleet-stagecraft.test.mjs test/ceres-shipbreak-route.test.mjs test/ceres-shift-wage.test.mjs test/ceres-receiver-handoff.test.mjs
```

New checks use the actual production factory, ordinary mining beam logic and native physics.
The premature-cut original moves under a declared test impulse and survives the full versioned
save envelope with the same world identity, pose, velocity and no wage or duplicate body. The
successful branch earns exactly 400 credits, saves while the cut plate remains supported,
restores that support without repayment, and then releases into the existing native tow with
the same original as its target. No successful cradle receipt is inferred from starting that tow.
Neighboring receiver tests independently cover actual native retention and typed continuation.

Player-facing labels, save-schema check (v23, 467 paths), type floor and exact-path whitespace
checks pass. UI imports (55/55), accessibility and panel-composited contrast checks pass.
The contrast audit still reports 17 raw-nebula combinations below threshold; this slice changes
no colors or compositing. No expected golden, release receipt or package manifest was changed.

An independent native probe held the normal site-beam `KeyB` through 200 production ticks with
the actual default Mk1. It confirmed the accepted premature cut, the real target's
“Section already cut” readout, all three original crew bodies still parked, no job and no wage.
Full save restoration and reentry preserved those outcomes and announced the current consequence
once. This is production-input/continuation evidence from a declared approach fixture, not a
rendered flight journey. The Kessler tests also route through the actual generated Helios Bar
contact, available choices and reply dispatcher.

**Limits:** work approaches are fixtures and beam holds call the real mining owner directly.
The new success check runs the production tick through attachment/extraction, not the complete
long lift. Neighbor receiver coverage uses its own declared setup. No rendered ordinary arrival,
full uninterrupted brace-to-cradle journey, pointer/gamepad, audiovisual or performance acceptance
is claimed. The wider Ceres commission remains incomplete.

The relevant remote sector PR [#945](https://github.com/coldshalamov/SpaceFace/pull/945) was observed
draft/unmerged at `1984cdc6e3322125d407d450e09f2a029a779c9e`; its published increment concerns
Breakwater services and does not duplicate this source scope. This commit adds only the two source files, two tests and this supporting note to that draft branch.

## Exact-parent publication verification

The final four-file source/test slice passed **33/33** against parent `1984cdc6e3322125d407d450e09f2a029a779c9e`, without importing unrelated dirty working-tree changes. The immutable-parent loader was audited across 1,981 repository imports: four candidate files, three existing parent Breakwater files, and 1,974 unchanged base files. Three directly read JSON fixtures also matched the parent. All three new consequence tests fail on the unchanged parent. All three existing-file preimages match exactly; the reviewed source bytes are unchanged.

The earlier UI/a11y/contrast/schema checks above were performed on the shared development tree; the exact-parent run independently verifies the 33-test Ceres suite. No whole-repository CI, rendered route, or full commission acceptance is implied. The seven previously excluded upload paths are not part of this commit. The PR remains draft and unmerged.
