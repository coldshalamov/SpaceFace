# ui-polish-109: phone Help Factions shows its crest ring

**Problem (390×844, phone shell):** Factions kept the desktop's `height:100%` orbit inside the phone's
auto-height page, so the crest ring collapsed to zero height. Only the open power's reading showed, and
there was no way to pick another faction.

**Fix (`src/ui/orrery/mobileScreenLayouts.js`, phone shell only):** the Factions tab is a column with the
ring in its own 320px berth above the reading. As on the narrow desktop (≤560), only the chosen, hovered
or focused crest prints its name; every crest keeps its aria-label.

Desktop selectors are untouched (the rules sit under `data-sf-mobile="1"`), so 960×540, 1280×720 and
1920×1080 are unchanged. Type floor check passes.
