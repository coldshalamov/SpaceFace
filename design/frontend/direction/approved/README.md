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

This folder is empty until P01 returns. Until then, nothing in the game is to be styled by hand.
