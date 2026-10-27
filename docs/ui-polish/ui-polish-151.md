# UI polish 151: Bar questions reach the reading at 390x844

Phone portrait (under 481 wide, 801+ tall), Station Bar tab.

- Before: contacts took two fifths of the panel, so the reading showed the name and reply but the questions sat below the fold (only a sliver of the first one showed).
- After: contacts get one third and the reading two thirds. The reading is a column with the questions settling at its foot, so the first question reads whole under the reply and the rest scroll with it. Question rows are a little tighter.
- Scope: one `@media (max-width:480px) and (min-height:801px)` block in `src/ui/orrery/stationTabsLayouts.js`. No selectors or IDs changed.
- Bench: station-bar measured clean at 390x844, 960x540, 1280x720 and 1920x1080. A tried sticky footer for the questions overlapped the reply in the short reading, so it was dropped.
