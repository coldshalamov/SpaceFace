# vm-work archived candidate patches — 2026-09-24

Unvetted performance candidates the quiet VM pushed as `vm-work/*` scratch branches but never
packaged into a `vm-drop/` job folder (no `DONE.md`, no witness numbers, no import order vetting).
Archived here as `format-patch` files during the branch cleanup so the remote branches could be
deleted without losing the ideas.

These are **candidates, not shipped work**. Apply by hand (`git am <patch>` or cherry-pick the
hunks) only after measuring that the target code path still matches and the win is real. Some may
already be superseded by later landed work.

| Patch | Claimed effect |
|---|---|
| stampNearWorkBudget early-exit | ~1.8× on that walk |
| energy-relevant probe quiet-skip when hide-latched | ~4.3× |
| idle bomb telegraph quiet-latch | ~2.6× |
| tumbleStates quiet-latch when no tumble/rcs/recovery | ~5.8× |
| preStep movable walk trusts physicsSleeping | ~2× |
| radar asteroid still-layer + drawTrail stroke batch | ~5.8× |
| sync-entity LOD retain — skip updateLod on unchanged band | ~4× |
| radar contacts still-layer while pose signature holds | ~4× |
| idle shieldBubble presentation quiet-latch | ~4.8× |
| settled hull-integrity DOM compare quiet-latch | ~10–21× |
| performance.memory only while Tier-1 counters live | ~50–60 µs/frame |
| hold-prefetch inbound-only — drop wave-catalog kick | admission prefetch trim |
| credits chip pulse restart without forced sync layout | HUD reflow removal |

Source branch tip SHAs are recorded in `~/spaceface-branch-tips-20260924.txt` on the owner's
machine. Everything else on `vm-work/*` was either already on master, packaged under
`design/program/vm-drop/`, or imported in the #166–#170 series.
