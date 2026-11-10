All three fixes are implemented, uncommitted for the orchestrator.

- **D206:** B now uses Esc’s existing guard: first press warns when cards remain affordable; second press launches. Esc handling is unchanged. Changed [src/ui/screens/crucibleDraft.js](/C:/Users/93rob/Documents/GitHub/SpaceFace/src/ui/screens/crucibleDraft.js) and [test/crucible-draft-armory.test.mjs](/C:/Users/93rob/Documents/GitHub/SpaceFace/test/crucible-draft-armory.test.mjs). Focused result: **12 tests, 12 pass, 0 fail**.
- **D212:** Absolute-positioned labels caused the detachment; each label now sits beside its own slider. Changed [src/ui/screens/pause.js](/C:/Users/93rob/Documents/GitHub/SpaceFace/src/ui/screens/pause.js) and [src/ui/orrery/pauseLayouts.js](/C:/Users/93rob/Documents/GitHub/SpaceFace/src/ui/orrery/pauseLayouts.js). Verified through **ui-bench Pause → Photo**, with inspected shots and computed assertions at both sizes: labels aligned, **8px slider gaps**. Existing photo tests: **14 pass, 0 fail**.
- **Market overlap:** The phone landscape tab gaps pushed Ledger into Comms; reducing those gaps preserves the existing type size. Changed [src/ui/orrery/mobileScreenLayouts.js](/C:/Users/93rob/Documents/GitHub/SpaceFace/src/ui/orrery/mobileScreenLayouts.js). Bench shots and bounds assertions passed at **1920×1080 and 844×390**, desktop and phone; minimum Ledger–Comms clearance is **12px**.

Ledger rows for orchestrator deletion: **D206, D212**. No numbered market-overlap row was present.

Adjacent defect observed, unchanged: the phone station’s **Munitions** label wraps its final letter.