# ui-polish-149: Crucible refit capacity and whole-word labels

The compact desktop jig keeps whole hardpoint names and spare statistics readable. When the complete label columns cannot clear the title and wrapped footer, the same hardpoint controls use the existing scrollable row presentation.

## Changed

- Preserve the original narrow-desktop whole-word wrapping and 15px fitted names.
- Measure the actual jig frame and complete label columns before placing them. A column that cannot fit returns to the existing hardpoint rows rather than placing lower FIT / SELL controls behind the foot.
- Keep fallback rows at their natural height, with their own scroll band and legible ORRERY spare words, separated names/statistics and Hand focus.
- Keep the fitted count above the fallback row band. On retained jigs it clears the measured footer, including wrapped footers.
- Constrain focused narrow-jig controls and their ENTER hints to the label width. Scale row-edge fades to short bands so refusal feedback does not dim the whole interaction.

## Verification

The real-screen UI bench was exercised at 600x844, 640x1000, 480x600 and 1280x720, with all 18 controls walked at each size and resulting pictures reviewed. The changed 640px focused-control case and 480px short-band case were repeated after their respective repairs. Final checks reported no layout/reachability findings.

The 640x1000 arrival retains the hull jig; the other tested arrivals use rows because their complete columns do not fit. Strip and fit update the fixture count (5 to 4 and 5 to 6). The engine-fit refusal displays "Research required: Drive Tuning" and retains the original count. Launch and Extract emit their existing intents and close the fixture layer.

A two-second settled observation at each size recorded stable dimensions and zero stage-class mutations, including both jig and fallback presentations. This verifies fixture composition and emitted intents; the existing run owner continues to own live transactions.
