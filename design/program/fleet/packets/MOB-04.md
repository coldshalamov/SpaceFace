# MOB-04 — High performance by default on phones

Use design/game ruling 3 and `drafts/MOB.md` §MOB-04. Before the renderer initializes, a phone
without a saved video profile starts in Auto on the authored `low` preset, including the 30 fps
cap. Preserve saved video settings and desktop defaults. Keep the stored profile byte-identical
at boot. Reuse the mobile detector and the quality preset owner.

Owned files: `src/core/graphicsProfileBootstrap.js` and `test/graphics-profile-bootstrap.test.mjs`.
Run the focused bootstrap test. Boot the 390×844 route through the game lock, inspect the first
playable picture and verify the active preset, frame cap and observed cadence.
