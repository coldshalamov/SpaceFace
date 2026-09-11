# Approved frames — the authority

The rendered style frames in this folder **outrank every prose document about the frontend**,
including [`../FIELD_HARDWARE_PROGRAM.md`](../FIELD_HARDWARE_PROGRAM.md) and
[`../packets/_COMMON/02_ART_DIRECTION.md`](../packets/_COMMON/02_ART_DIRECTION.md). When a frame and
a sentence disagree, the frame wins and the sentence is corrected.

A frame lands here only through a packet return (P01–P05) reviewed by the controller against the art
direction's two tests and anti-pattern guard. Each pick is recorded in `DECISIONS.md` with the
variant chosen, the variants rejected, and why, in plain words.

Files per approved screen:

- `frame-<screen>.png` — the 1920×1080 composite (the target a code packet is built to match);
- `plate-<screen>.png` — the scene alone, when delivered;
- `layer-<screen>.png` — the interface alone on transparent, when delivered;
- `crops-<group>.png` — 100 % element crops;
- `kit-notes.md` — faces, sizes, hexes, plate/edge/glass values, icon rules (merged across packets;
  later packets must match earlier values).

A code packet's acceptance is its live capture beside the frame here. If the build cannot match a
frame for an engineering reason, the frame is revised through a new packet turn, never by
quietly building something else.

---

## What is here (S1 / PQ-194.00, 2026-09-10)

**Six frames, all passing the two tests and the guard.** Per-frame judgement:
`.devshots/delegate-20260910/scratch/pq-194/QA.md` section 1.

| Screen | Register | Frame | Plate | Layer |
|---|---|---|---|---|
| Title v1 "Hangar" | POSTER | `frames/frame-title-v1.png` | `plates/plate-title-v1.png` | `layers/layer-title-v1.png` |
| **Title v2 "Field at dusk" — the pick** | POSTER | `frames/frame-title-v2.png` | `plates/plate-title-v2.png` | `layers/layer-title-v2.png` |
| Title v3 "Bay door" | POSTER | `frames/frame-title-v3.png` | `plates/plate-title-v3.png` | `layers/layer-title-v3.png` |
| Crucible door | POSTER (Crucible temperature) | `frames/frame-crucible-door.png` | `plates/plate-crucible-door.png` | `layers/layer-crucible-door.png` |
| Flight HUD, resting | EDGE | `frames/frame-hud-resting.png` | `plates/plate-flight.png` | `layers/layer-hud-resting.png` |
| Flight HUD, wanted | EDGE (wanted temperature) | `frames/frame-hud-wanted.png` | (shares `plate-flight.png`) | `layers/layer-hud-wanted.png` |

Crops: `crops/crops-title.png`, `crops-crucible.png`, `crops-hud.png`, `crops-hud-wanted.png`.
Numbers: `kit-notes.md`. Picks and reasoning: `DECISIONS.md`.

**The kit these frames are built from** lives at `assets/ui/kit/`: 157 manifested assets
(transparent-PNG surfaces, controls and instruments at @1x and @2x, plus the SVG geometry for
everything that moves), 86 icons at three sizes, the logotype and 37 marks, tokens, a motion
library, a sound cue set, a kit page and three runnable hero prototypes. All of it opens from
`file://`.

**How to look at a frame beside its build:** open
`assets/ui/kit/screens/_compare.html` — it overlays the approved frame on the live prototype at
50 %, as a wipe, or as a difference.
