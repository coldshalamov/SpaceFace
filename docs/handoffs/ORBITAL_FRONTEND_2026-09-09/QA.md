# Orbital — inspected visual and interaction evidence

## Evidence boundary

This is not a live-game approval. Native production modules were rendered with native browser DOM,
Canvas 2D, CSS, fonts and assets. Research and after-action use their actual complete screen controllers.
Other fixtures use the real production view modules with explicitly synthetic read models. Every fixture
screenshot displays its synthetic/no-simulation disclosure. Full world rendering, fitting, transactions,
save persistence and route execution are not proved by these screenshots.

No external concept was presented for approval. The design was authored under the execution prompt's
creative authority, using the bundle's actual screenshots and assets as starting evidence, then refined
against running native presentation. The included art is integrated, not an unused concept board.

## Visual refinement ledger

| Observed problem | Evidence before | Implemented correction | Evidence after |
|---|---|---|---|
| Market action/receipt below 720p fold | pass1-market-1280.png | Quote yields height before transaction receipt; compact chart/stat rhythm; one native commit remains visible | pass2-market-1280.png; final-market-1280x720.png |
| Price mark leaked into quote and SVG chart filled black | pass1-market-1280.png | Scoped icon styling; explicit chart paths/area/average treatment | final-market-1280x720.png |
| Shipworks operation pane overlaid the preview | pass1-shipworks-1280.png | Explicit fleet/stage/operation grid; side pane removed from absolute overlay flow | pass2-shipworks-1280.png; final-shipworks-1280x720.png |
| Shipworks fleet names were truncated unnecessarily | pass2-shipworks-1280.png | Single-column rail with wrapping; native selection intact | final-shipworks-1280x720.png |
| Navigation inspector compressed details into controls | pass3-navigation-1280.png | Non-shrinking content in scrolling inspector; native full-frame canvas coordinates unchanged | pass4-navigation-1280.png; final-navigation-1280x720.png |
| Research detail text could collide with Unlock | pass3-research-1280.png | Independently scrolling detail with non-shrinking action region; native labelled node selector | final-research-1280x720.png; interaction-research-selection-1280.png |
| Save actions outside the 720p composition | pass3-saves-1280.png | Compact title/credits/portrait grid with explicit action row | pass4-saves-1280.png; final-saves-1280x720.png |
| Contract reward and footer overlaid the terms | pass3-contracts-1280.png | Explicit reward grid, two-column terms, non-overlapping action flow | pass4-contracts-1280.png; final-contracts-1280x720.png |
| HUD numeral cells overflowed their backing panel | pass3-flight-1280.png; browser-first-matrix.json | Removed inherited fixed numeral widths with condition-panel-specific CSS; browser bounds assertion | final-flight-danger-1280x720.png; browser-final.json |
| Narrow Market viewport initially exposes only the upper quote | final-market-390x844.png | Existing scroll containment retained; verified actual commit scrolls above fixed footer | interaction-market-mobile-commit-390.png |

## Concrete visual comparisons

Title copy/actions retain native navigation; authored tagline is an intentional identity change. The scout
image is real bundle art and decorative only, never a claim about the active saved hull. Bricolage display
hierarchy and Instrument Sans utility text are deliberately distinct. Coal surfaces, amber actions, mint
safety and terracotta danger replace the former cyan/transparent presentation. Facility glyphs are authored
as one family, not emojis. Primary transaction and research actions remain legible at 720p, while ultrawide
content is bounded rather than stretched indefinitely. Narrow layouts retain controls and allow content
scrolling. Focus is visibly outlined and reduced motion removes transitions. The central flight viewport
remains clear; a missing world renderer is disclosed rather than painted over.

The ordinary market, contract, research, save and native-controller interaction renders were inspected for
copy, hierarchy, typography, palette, asset use, geometry, scroll containment, focus and primary-control
reachability. This does not claim an independent art-director score or a full-game fidelity certification.

## Inspected surfaces

- **title**: 720p initial and final composition, 1080p full image, ultrawide contact sheet; mobile full image; empty Continue and reduced motion in contact sheet.
- **pause**: 720p full initial frame; final three desktop sizes in contact sheets.
- **settings**: 720p full initial frame and final contacts; Access interaction; mobile full image; preview/commit/toggle/select/focus checks.
- **saves**: 720p full before/after action placement; all desktop sizes and empty-slot contact sheet. Storage controller is not mounted.
- **market**: 720p full before/after quote and CTA fixes; 2560x1080 full final image; all desktop contacts, mobile initial and scrolled-commit full images; unavailable quote.
- **shipworks**: 720p full before/after stage/sidebar overlap and rail-label fixes; all desktop contacts. Missing 3D preview explicitly displayed, never fabricated.
- **contracts**: 720p full before/after reward/terms/action layout repair; all desktop contacts and blocked readiness.
- **navigation**: 720p full before/after inspector compression fix; all desktop contacts. Native chrome/glyphs, synthetic positions, no navigation execution.
- **research**: 720p full before/after action/footer treatment and final keyboard-selector interaction; all desktop contacts and locked node. Real techTreeScreen controller.
- **flight**: 720p full before/after numeral containment and final danger state; all desktop contacts. Native instruments only; no running world.
- **gameover**: 720p full before/after loss/recovery layout; all desktop contacts and Ironman. Actual gameOverScreen controller.

## Latest verdict and reproduction

`browser-final.json` is authoritative: 45 capture/DOM cases passed and 10 scoped interaction flows passed.
`browser-first-matrix.json` and `browser-interactions-intermediate.json` preserve earlier failures, including
incorrect test selectors corrected to match native accessible labels/aria-disabled controls, and the real
HUD width defect. They are not the final verdict. `pass1` through `pass4` are genuine development captures.
The review contact sheets are derived from the final PNGs, not design mockups.

Browser plugin was not available. Chromium was used directly. Normal HTTP navigation was actually attempted
and rejected with `net::ERR_BLOCKED_BY_ADMINISTRATOR`; `http-navigation-attempt.json` records the result.
The browser policy was not altered. The successful fixture transport used `about:blank`, `set_content`,
original CSS/assets and native ES modules via Blob/import map. It did not fabricate missing game modules.

With an existing Python Playwright/Chromium installation, run:

```sh
python test/frontend_orbital_browser.py --browser /path/to/chromium
node --test test/orbital-presentation.test.mjs test/orbital-map-labels.test.mjs
```

On a normal local static server, open `test/fixtures/orbital-interface.html?screen=market` (or title, pause,
settings, saves, shipworks, contracts, navigation, research, flight, gameover). That is still the disclosed
fixture, not a launch of SpaceFace's simulation. The normal game remains `index.html` in the full checkout.
