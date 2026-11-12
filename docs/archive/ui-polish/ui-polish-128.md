# ui-polish-128 — Missions ACCEPT on first paint on short wide desktops

Code Work's #600 review play found the Missions dossier's ACCEPT under the frame foot at 1366×600
(key at y≈610 in a 600px window; the dossier scrolled, but the key never showed on first paint).

- **1101+ × ≤720:** ACCEPT takes the top of the route column beside the title, and the route ring
  follows beneath it. Nothing rides over the terms, which scroll in the dossier as on master.
  1366×600: off-screen (y≈610) → about y330; 1280×540: off-screen → 313; 1101×480: 685 → 313.
- **Review fix (Code Work HOLD on d5763fbdfe):** the first cut used a sticky foot over a fade at
  561–800 tall, which buried RISK/STANDING/FOLLOW-UP at first paint (1366×600 and 1101×561 0→6,
  1101×800 0→2). That block is gone; 721–800 tall is back to master (ACCEPT was already reachable).
  Bench on contracts/dock: 0 findings at 1366×600, 1101×561, 1101×800, 1366×720, 1280×540,
  1101×480, 1280×720 and 960×540; 390×844 and 1920×1080 are outside the query and match master.
- Selectors and markup unchanged.

Still open: the "RECOMMENDED → CERES REFINERY · CERES BELT" heading wrap at 1366×600 (not reachable
in the bench state, needs the live recommended offer).
