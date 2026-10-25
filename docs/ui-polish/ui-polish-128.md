# ui-polish-128 — Missions ACCEPT on first paint on short wide desktops

Code Work's #600 review play found the Missions dossier's ACCEPT under the frame foot at 1366×600
(key at y≈610 in a 600px window; the dossier scrolled, but the key never showed on first paint).

- **1101+ × 561–800:** the dossier key rides the dossier's foot again (sticky, over a dark fade), so
  ACCEPT sits under the reward and the terms scroll beneath it. 1366×600: ACCEPT 610→456 (in view,
  hit-tests to the key); 1280×720: 644→576.
- **1101+ × ≤560:** the dossier is ~180px, too short for a key under the reward, so ACCEPT takes the
  top of the route column beside the title. 1280×540: off-screen→313; 1101×480: 685→313.
- 960×540, 390×844 and 1920×1080 are outside both queries and unchanged. Selectors and markup unchanged.

Still open: the "RECOMMENDED → CERES REFINERY · CERES BELT" heading wrap at 1366×600 (not reachable
in the bench state, needs the live recommended offer).
