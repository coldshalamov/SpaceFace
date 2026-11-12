# ui-polish-121 — Ship: phantom Registry & recovery rows

**Screen:** Ship (`ship`), 1280x540 and 1280x720. File: `src/ui/orrery/blackFlagRegistryLayouts.js` (CSS only, no selector/ID changes).

**Problem:** When the Black Flag "Registry & recovery" disclosure is closed, Chromium hides `<details>` content with content-visibility rather than display, so the rows still had layout boxes under the fleet index. Hit-tests and the layout gate saw ghost rows over the index: 1 finding at 1280x540, 2 at 1280x720.

**Fix:** `.orr-blackflag-registry:not([open]) > :not(summary) { display:none!important; }` so a closed registry has no boxes at all. Opening it is unchanged.

**Result:** 0 findings at 1280x540 and 1280x720. Pixel-identical to before (the rows were already invisible); the change is to click targets and focus/hit-testing only. Closed registry box is 210x44 under the index at both sizes.

**Shots:** `ui-shots/polish121/before-ship-1280x540.png`, `after-ship-1280x540.png`, and the 1280x720 pair.

**Checks:** type floor OK.

**Noticed, not in scope:** at 1280x720 a faded "Recovery channel / Empty seat / Leave it for now" block shows through behind the hull render and the Range/Record/Slot row. Candidate for the next branch.
