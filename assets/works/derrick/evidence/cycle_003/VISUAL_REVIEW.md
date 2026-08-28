# PQ-131.05 Derrick Cycle 03 author inspection

Candidate `BBACB1168BB8E697B0F69EF5D5D15D327455964C35B80E6CB5911B356B755865`.
Review scope: changed components only. This is not independent G7 or whole-asset acceptance.

The author opened the original 1920 x 1080 `works_top`, `works_site`, `works_edge`, and
`works_top_clay` images after the final exact-source rebuild. Diagnostic crops were used only to
inspect native pixels; they do not replace the legal full frames.

## Changed zones

- `works_top`: both crown fixtures read first as dark hood/socket masses. Each hood is a hollow
  casting with a thick mouth and a smaller warm lens recessed behind it; the prior warm-pinprick
  read is absent. Source still SHA-256:
  `78643F644BCFC9A008B4CB1457DBA70FE2A14E36325E22BD2DF535CA9C7A8B7B`.
- `works_site`: four separate exposed anchor plates survive at the four physical shoe corners.
  They remain inside the folded shoe footprint and use bare interface steel rather than glow,
  outline, marking, or silhouette padding. Source still SHA-256:
  `07C8DDD7914FDD2FCD45EA0A8B49DE1DF48789A9B40680ECC27DFA69988FD0E1`.

## Retained whole-asset reads

The open central well, offset brown winch, visible payout tangent, crown sheave and cable drop,
open A-frame spread, grated offset platform, restrained orange marking, four runtime hooks, and
dark-steel / bare-interface / winch / grate material separation remain visible and unchanged in
role. Clay still holds the connected head-frame without lamp emission.

## Decision

`keep` for the two Cycle 03 component repairs. No P0/P1 is visible in the changed zones at their
supported sizes. Exact candidate remains a `design_candidate`: current-hash independent review,
runtime/release integration, and G7 remain open to the controller.

Remaining visual risk: at 19 px/cell the tall frame is intentionally compressed into a small site
symbol, so antialiasing/runtime compression should be rechecked during integration even though the
four physical anchor plates are distinct in the legal source still.
