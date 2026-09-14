# UI visual iteration sweep — 2026-09-14

Ran the look-first loop from `docs/UI_VISUAL_ITERATION.md` over the full automatable surface set
(`node scripts/ui-stills.mjs --all`, 33/35 frames; `station-shipworks` timed out under load and
`asteroid-works` could not latch the tether — both known contention failures, not frame verdicts).
Three independent reviewer passes per round; fixes re-photographed and re-reviewed.

## Landed (commit `a48f405c4`)

| Fix | Surface | Owner |
|---|---|---|
| Save caption now clears the lit plate's bottom rule instead of reading as struck through | title | `styles/kit.css` |
| Radar objective line ("OBJ … HELIOS PRIME") was painted under the bezel/face with only its ends visible; now takes the dial's layer | flight | `src/ui/views/hudStyles.js` |
| Review captures hide the dev route's stats panel (`#sf-stats-gl`) | all stills | `scripts/capture-ui-matrix.mjs` (`hideSelectors`), `scripts/ui-stills.mjs` |

Duplicate verb row on THE SHIP ("Take it to the range Record Select a slot" twice): fixed in the
working tree in `src/ui/station/screens/shipworks.js` (stale pinned `.sx-sw-verbs` rack now removed
on refresh). **Uncommitted** — the rack-pinning block it sits on is another lane's uncommitted hunk
in that file; the fix should ride with that lane's commit. Verified fixed by reviewer G1.

## Open findings (ranked; each needs its owner packet)

1. **Leading characters of text runs are blank in the live game** — codex list ("Locked" renders as
   "cked", "B1 — Honest Work" as "— Honest Work", search placeholder as "earch Codex") and the
   flight band tape ("…TRAGE…"). DOM text, computed styles, hit-testing and geometry are all
   correct; the glyphs occupy width but paint nothing. Ruled out by experiment: scroll position,
   overflow/clip, masks/filters, overlay elements (`elementFromPoint` returns the text itself),
   `text-align`/`direction`, font family (system-ui shows the same), the `k-38` wrapper, and
   `paintRow` inline pins. A clone with the same class outside the screen renders correctly.
   Owner: `src/ui/screens/codex.js` + `src/ui/hud.js` tape — needs a dedicated render-level
   investigation, not a CSS guess.
2. **Last row/control clipped at panel bottoms, no continuation cue** — confirmed on station-bar
   (action button sliced), base (RESEARCH OUTPOST CHARTER sliced), station-industry, automation,
   station-contracts, station-dock, station-market, help, mission-log, ship. Owners: `station/`
   screens, `base.js`, `automationPanel.js`, `help.js`, `missionLog.js`, `shipworks.js`.
3. **chart-galaxy label collisions** — "YOU" over the node ring, "GOAL · BEACON" over the marker
   bracket, "11" over the diamond. Owner: `src/ui/galaxyMap.js`.
4. **station-market** — table headers (BUY/SELL/STOCK/HELD) sit ~450 px right of their value
   columns; two model strings merge with no space ("Trade HubThis dock buys it."); bottom plate
   clipped. Owner: `src/ui/station/screens/market.js`.
5. **crucible-results contradiction** — a recorded hull/ghost block renders while the adjacent copy
   says no flight record was kept. Owner: `src/ui/screens/crucible.js`.
6. **THE SHIP** — "SAVE FIT" label half-occluded; thruster callout text over the hull with no plate;
   STARTER panel bottom row clipped. Owner: `src/ui/station/screens/shipworks.js`.
7. **tech-tree** — "LOCKED" uses the same gold as AVAILABLE/RESEARCHED; "Select a node" duplicated.
8. Minor: game-over lone `-` recovery value; crucible-draft Continue's triple affordance;
   credits "MADE BY" duplicated; range/tech-tree tabs with no selected state; wingman radial label
   flush to its border; power-rail rightmost slot glyph clipped; footprint repeats "clears in 0 s";
   chart repeats POSITION/TRACKING.

## Not defects, by direction

Settings, Help, Credits, Pause, Mission log and the radials are still on the pre-kit skin. Reviewers
rate them "No" on the field-hardware tests. Rebuilding them is the queued program work
(`PQ-181` meta shell, `PQ-194` kit port) — each waits on an approved frame, which is why they must
not be hand-restyled.
