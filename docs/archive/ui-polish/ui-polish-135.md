# ui-polish-135 — Replay and Clips legends read in full instead of ending in "…"

**Scope:** `styles/ui.css` (CSS only, `.orr-replay__readout` / `.orr-clips__readout` and the empty-reel readline).

**Problem.** Both legends were forced onto one line with an ellipsis above 640 wide, so the
instructions were cut mid-word at 960×540, 1280×720 and even 1920×1080 ("…SCRUB …",
"…THEN EXPO…"). Only phones saw the whole sentence.

**Fix.** The legends wrap at every width with balanced lines (max 96ch). On a short desktop frame
(641+ wide, 461–640 tall) the empty Clips reel's legend moves to the clear band above the ghost
plates, since a wrapped legend at the foot crossed the rail's arc (it dips lower the wider the
frame). At ≤460 tall on desktop the Clips legend keeps its one-line ellipsis: there's no clear band.
No markup, selector, or copy changes.

**Checked:** 390×844, 960×540, 1280×540, 1280×720, 1920×600, 1920×1080, 800×460; bench 0 findings.
