# CLAIM — tumble-body-language-quiet-skip

Quiet Grok Bot VM hillclimb package **#107**.

Pole: prepareFrame / vfx tumble body-language residual after #106
(`_updateTumbleBodyLanguageVfx` walked `shipPitchCandidates` every quiet tick
with zero active tumble/thrownTrail). Prior hold (~29× without wake) was
unsafe on `entityIndexVersion` alone — tumble can start on an existing ship
without an index bump.

Quiet latch after first empty walk+empty cadence; dirty wake on
`pitchPresentationEpoch` (bumped when `updateShipPitchPresentation` writes
active tumble / thrown-trail / recover). Portable quiet path **~29×** median
(floor ≥25.9× across rebenches). Soft-GPU fps not a KPI. Picture ON.
