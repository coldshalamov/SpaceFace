# ui-polish-133 — Automation drone rungs: earnings line no longer truncated

**Scope:** `src/ui/screens/automationPanel.js` (CSS only, Drone Bay purchase rungs).

**Problem.** Every drone rung squeezed the earnings sentence ("Up to ~113 cr/min capped · shared
ceiling, before upkeep") into a 20ch track, so it ended in an ellipsis jammed against "buffer N".
The bench flagged 6 tangled findings at 1280×720; 960 wrapped range/upkeep onto a ragged second line.

**Fix.** On desktop (≥761 wide) the four short stats (mine, buffer, range, upkeep) keep aligned
columns on line one and the earnings sentence takes its own full line under them. ≤760 keeps its
wrapping flex row with the sentence moved last. No markup, selector, or data changes.

**Checked:** 1280×720 automation findings 6 → 0; 960×540, 960×900, 1920×1080, 390×844 at 0.
