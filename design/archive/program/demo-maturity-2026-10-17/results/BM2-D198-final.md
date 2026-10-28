RESULT: DONE for the measured fixes; D198 remains open for the orchestrator’s verdict.

Hidden-screen warming forced **83 ms of style/layout in the first second → 0 ms**. A second trace exposed a **3.06 s covered-title warm-up draw**; it now waits until the title is requested again. Authored visuals and quality remain intact.

Final largest post-click callback gap: **190 ms**, with **82% host CPU contention**. This supports the targeted fixes, not a quiet-host speedup claim.

Files changed:

- [src/ui/uiRoot.js](/C:/Users/93rob/Documents/GitHub/SpaceFace/src/ui/uiRoot.js)
- [src/render/uiStage.js](/C:/Users/93rob/Documents/GitHub/SpaceFace/src/render/uiStage.js)
- [test/ui-screen-prewarm-cadence.test.mjs](/C:/Users/93rob/Documents/GitHub/SpaceFace/test/ui-screen-prewarm-cadence.test.mjs)
- [test/ui-stage-berth-prewarm.test.mjs](/C:/Users/93rob/Documents/GitHub/SpaceFace/test/ui-stage-berth-prewarm.test.mjs)

**81 tests passed, 0 failed**, covering queue cadence, stage lifecycle, registration, hidden-screen styles, yard/ring layout, and embark scheduling.

Remaining: visible-title shader warm-up can still stall, and the final click cost 80 ms. No commits or ledger edits were made.

[Full measurements, test names, and evidence](/C:/Users/93rob/Documents/GitHub/SpaceFace/.devshots/bm2-d198/RESULT.md)