# Ironback MTX Cycle 18 — REVISE

Cycle 18 is the first legal-cycle attempt after the rejected spearhead series. It changes the
primary construction method to a broad stepped barge, adds a central hopper volume, four cutter-arm
assemblies, twin aft drive shoulders, and manufacture-specific 1024 px material maps. Those are
material deltas worth retaining. The candidate is not accepted or promoted.

## Controller disposition

`REVISE`

The current exact-source evidence is not yet a legal acceptance set, but its 2.4915 render scale is
correct. The live renderer normalizes the authored hull's +X length to `targetLength: 1.72`, then
`shipKit.finalizeShip` scales the normalized root by Ironback's radius 24; the resulting 41.28 WU
length is therefore the actual whole-body presentation transform, not a legacy-palette inference.
ImageMagick foreground measurements at 1600 px put default chase at 287 px (17.94%) and abeam at
270 px (16.88%), both inside the shared 8–22% band. Close chase measures 761 px (47.56%), above the
20–42% close band. The failure is the candidate's near-square transverse/arm envelope after the
valid runtime transform, not the shared chase camera or default presentation scale. Cycle 19 must
retain the traced transform and bring the close envelope into band through real macro construction.

The underlying form also remains below the frozen barge target:

- the hopper reads as a shallow framed roof recess with a mostly flat floor, not a deep processing
  volume with readable liner, ribs, gates, and material path;
- the four arms are thin antenna-like chains at the legal default camera, with weak turntable/yoke
  roots and tool heads that do not survive chase distance;
- the command cab reads as a small blue service panel on one shoulder, not a compact multi-pane
  armored command cage with a clear forward relationship;
- the aft shoulder blocks do not yet communicate twin pulse-plate beds, deep impulse chambers, or
  refractory drive structure in the supported views;
- the dominant body is a largely rectangular slab, and the normal-isolation pass remains nearly
  flat across its largest zones. Construction seams and surface relief do not yet explain the mass.

Cycle 19 should preserve the broad pressure-frame direction while changing these exact load-bearing
forms. A re-render, color adjustment, or evidence-only camera workaround is not sufficient.

## Retained exact-source evidence

- LOD0 SHA-256: `F353C7DF709068AEE32A70AC4EEB0D2536F71C25C765FDBB08F81EEA3D8CCD09`
- LOD1 SHA-256: `8D925652FEFDC0904976E599465DF744FEFE39D7BBECCBCDCC991314A9EBF955`
- LOD2 SHA-256: `8F7944D6197AB527CA293E4FFD396A768CAB340E75C6C3C7D771B7A539DFF11B`
- Evidence identity: `cycles/cycle_18/EVIDENCE_IDENTITY.json`
- Required stills: `cycles/cycle_18/*.png`

No live, release, package, manifest, runtime, or program-map path was changed by this cycle.
