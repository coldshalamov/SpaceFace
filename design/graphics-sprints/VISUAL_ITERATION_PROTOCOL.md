<!-- LIFETIME: STABLE -->
# Visual iteration reference

[`docs/visual-assets/README.md`](../../docs/visual-assets/README.md) is the current front door for
player-facing graphics work and owns the active craft direction. Use the relevant production route:
Forge for ship bodies, `LOOK.md` for lighting and surface response, and the VFX standards for effects.

This file's previous mandatory G0–G7 gates, fixed evidence packs, hash-bound approval records,
600–1,000-word asset portraits, and reviewer quotas are retired. They do not gate implementation or
completion; follow the linked front door and current task owner instead.

Visual work should address a visible player-facing result on the default route. Inspect the real
renderer at the gameplay camera and the distances, motion, or interaction relevant to the claim.
Use a still, motion capture, or focused look tool when it helps identify or check the defect; captures
are working material, not a required deliverable. Match the check to the claim rather than producing
a standard image pack.

Keep authored appearance while improving cost. Optimize batching, allocations, culling, residency,
cadence, LODs, and frame pacing; use the highest quality tier the target machine sustains within its
frame budget. When quality settings or visual tradeoffs change, judge the picture and measured cost
on the affected route.
