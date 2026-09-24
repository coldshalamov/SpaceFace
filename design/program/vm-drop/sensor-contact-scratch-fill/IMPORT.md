# IMPORT — sensor-contact-scratch-fill

1. Apply `patches/0001-perf-ai-scratch-fill-live-sensor-contacts.patch` on
   master tip through #65 (or current stacked hillclimb tip).
2. Confirm ephemeral `liveFramesFor` passes `contactRecords` per batch entry,
   and the durable multi-id route still allocates fresh contact objects
   (no shared `_sensorContactRecordsScratch` across observers).
3. Run: `node --test test/sg06-squad-fire-discipline.test.mjs test/ai-perception.review.test.mjs test/tactical-ai-contact-index.test.mjs test/tactical-ai-id-reuse.test.mjs test/tactical-ai-production-cadence.test.mjs`
4. Optional: `node design/program/vm-drop/sensor-contact-scratch-fill/artifacts/sensor-contact-scratch-fill-microbench.mjs`

Scratch: `vm-work/hillclimb-20260924h` @ `2fcf7a7fc`.
