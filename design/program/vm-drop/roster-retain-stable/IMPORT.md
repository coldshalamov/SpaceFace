# IMPORT — roster-retain-stable

1. Apply `patches/0001-perf-ai-retain-stable-liveListSquads-roster.patch` on
   master tip through #66 (or current stacked hillclimb tip).
2. Confirm `liveListSquads` (`freezeResults: false`) retains
   `_liveRosterScratch` when `liveRosterMembershipKey` matches, and refreshes
   mutable member fields only. Frozen `listSquads` must still allocate fresh
   frozen entries and clear the live retain cache.
3. Run: `node --test test/sg06-squad-fire-discipline.test.mjs test/ai-perception.review.test.mjs test/tactical-ai-contact-index.test.mjs test/tactical-ai-id-reuse.test.mjs test/tactical-ai-production-cadence.test.mjs`
   (or broader `test/tactical-ai*.mjs test/ai-*.mjs test/sg06*.mjs`).
4. Optional: `node design/program/vm-drop/roster-retain-stable/artifacts/roster-retain-stable-microbench.mjs`

Scratch: `vm-work/hillclimb-20260924h` @ `454dab17b`.
