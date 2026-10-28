# ui-polish-158: Bar questions stay in view at 390x844

**Problem.** In a narrow, tall desktop window (≤480 wide, ≥801 tall) the Bar's reading area is ~174px. The contact's role, name, 44px portrait and opener filled it, so only the first question showed. Tapping it added the answer under the opener and pushed every question out of sight, so a tap looked like it did nothing (Code Work's "Answer the captain" report at 390x844).

**Fix** (`stationTabsLayouts.js`, the existing ≤480 × ≥801 Bar block, CSS only, desktop windows only via the `:not([data-sf-mobile="1"])` scope):
- The role line (already on the selected contact's row) and the key hint step aside.
- The portrait shrinks to 26px beside the name.
- Question rows tighten to 4px padding.
- Once a question is answered, the answer replaces the opener it repeats.

**Result.** All three questions sit inside the reading at 390x844 and 414x896, both before and after a tap. 960x540, 1280x720 and 1920x1080 show a 0.00% pixel change.

**Not in this PR.** At 1280x720 and 960x540 the captain tap works on the bench (the answer appears). The station at 360x800 (under 801 tall) is badly broken: the header blocks overlap and the Bar never shows. That needs its own pass.
