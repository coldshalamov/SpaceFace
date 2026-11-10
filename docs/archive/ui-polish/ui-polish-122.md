# ui-polish-122 — Base: identity-card verbs under the foot band at 1280x540

**Screen:** Base, claimed body (`base-claimed`), 1280x540 and 1280x720. File: `src/ui/screens/base.js` (CSS only, one new media block, no selector/ID changes).

**Problem:** On short wide windows (1101+ wide, ≤640 tall) the three Operating Identity cards sit side by side and their verbs (CLEAR SITE STORAGE / ACTIVE) landed under the ESC · CLOSE · DISPATCH CONVOY foot band at scroll 0.

**Fix:** `@media (max-height:640px) and (min-width:1101px)`: tighten the `#sf-base` stack gap to 2px, slim `.base-plan` padding, and slim the `.base-foot` band (padding-block 6px/10px, margin-top 14px). 1280x720 is outside the query and unchanged.

**Result (ui-bench `base-claimed`):**
- 1280x540: 6 → 4 BURIED. All three card verbs now clear the band. Left: "Trade Relay · ACTIVE" card box and the "0u" stored-output line just below it (scroll content), each reported twice.
- 1280x720: 6 → 6, unchanged (not in the query; "Stored output / Upkeep / Input / Output" rows under the band, candidate for a later branch).
- `base` (no body selected): 0 findings at both sizes, before and after.

**Shots:** `ui-shots/polish122/compare-base-claimed-1280x540.png`, `compare-base-claimed-1280x720.png`, `crop-base-claimed-1280x540-foot.png`.

**Checks:** type floor OK. Focused tests (wave-c4-base-kit, claim-specializations, claim-site-discovery-plates): 28/29; the 1 failure (#17 legacy outposts F6 migration) also fails on master.

## Review rework (1366×600 regression)

Code Work's review found the `(max-height:640px) and (min-width:1101px)` block buried the stored-output
panel at 1366×600 (4 → 6). The cap is now `max-height:580px`, so 600-tall glass keeps master spacing.
CSS only; no selector or ID changes.

ui-bench base-claimed, 2 loads each (identical), `_assets-7c9ab`, merged onto origin/master:

| Viewport | master BURIED | branch BURIED |
|---|---|---|
| 1280×540 | 6 | 4 |
| 1920×540 | 6 | 4 |
| 1366×600 | 4 | 4 |
| 1280×600 | 4 | 4 |
| 1101×640 | 6 | 6 |
| 1280×720 | 6 | 6 |

Tests: wave-c4-base-kit 1/1, claim-site-discovery-plates 1/1, claim-specializations 26/27 (F6 legacy
migration fails on master too). Type floor OK. Shots: `ui-shots/polish122/{master,branch}-{1,2}/<size>/`.
