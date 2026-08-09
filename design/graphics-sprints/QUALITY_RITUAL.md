<!-- LIFETIME: HISTORICAL -->
<!-- Superseded process scaffold. EXPANSION_PROGRAM.md supplies research context and TOP10_ROI_ASSET_PLAN.md a measured ranking; neither dispatches work. Archaeology and technical reference only; it cannot direct implementation unless explicitly reactivated through an admitted packet. -->
# Quality Evidence Ritual — Screenshot-Driven Critique

This is an evidence template for Threads A, B, and E and for any visible Thread D change. It is **not**
count-based acceptance. A fixed number of renders, iterations, deficiencies, named techniques, or self-score
points cannot prove an asset is good.

## Review views

Capture the smallest set of views needed to judge the asset honestly. Include:

- a fully framed clay or neutral-material view that exposes silhouette and form hierarchy;
- a lit game-camera view that shows scale, material separation, and emissive restraint;
- a close/detail view when surface craft or functional detail matters;
- a current player-route screenshot showing the authored asset in its real scene, lighting, tint, and UI
  context;
- comparison views when assessing a revision, a reference target, or a claimed regression.

Ships and places must be legible from the elevated chase/game camera. Add front, side, top, nozzle, muzzle,
docking, or extreme-distance views only when they answer a real review question. Cropped images are valid for
detail review but never substitute for a fully framed context view.

## Critique loop

1. Inspect the current source, export, manifest/runtime route, and prior evidence.
2. Render representative neutral, lit, and in-game views.
3. Write the concrete visible gaps that matter most. Useful categories include silhouette; macro/meso/micro
   hierarchy; functional construction; material response; wear and story; faction identity; scale truth;
   lighting readability; animation/readiness; and fit with the surrounding scene.
4. Choose techniques because they address those gaps. `professional-techniques.md` is a menu and vocabulary,
   not a mandatory recipe.
5. Make the largest coherent improvement justified by the critique, then render again.
6. Repeat while meaningful gaps remain. Stop when independent review and technical evidence support the
   outcome, not when a counter reaches a target.

Keep `deficiency.md` or an equivalent review note concise and current. An optional `iteration_ledger.json`
may record chronology, but its count has no acceptance meaning.

## Independent visual judgment

The final reviewer should judge the saved evidence and current player route, not merely trust the authoring
transcript. There is no numeric pass bar. The reviewer should answer:

- Does the subject read immediately at gameplay distance and remain distinct from adjacent roles/factions?
- Does the construction look intentional and functional rather than primitive, noisy, or generically
  procedural?
- Do materials respond convincingly under the actual renderer and lighting, including shadow and motion?
- Is detail distributed by visual importance instead of evenly sprayed across the surface?
- Does wear, signage, color, and asymmetry tell this asset's story without becoming a universal recipe?
- Is scale, orientation, mount placement, animation, and surrounding composition believable?
- Is the live route using the authored result rather than a fallback?
- Did performance remain healthy through structural optimization rather than visible quality cuts?

## Technical evidence

The evidence bundle should contain the current critique, representative renders, exporter/finalizer output,
the relevant check results, and paths to player-route captures. Preserve provenance and license records where
external source material is used.

Typical handoff shape:

```text
revamp-evidence/<id>/
  deficiency.md
  iteration_ledger.json     # optional chronology, never a quota
  renders/                  # representative current and comparison views
  finalize.log              # exporter output
```

Run `npm run check:visual-stability` for visible runtime changes and the asset checks selected by
`INTEGRATION_GATE.md`. Transcripts alone are not proof.
