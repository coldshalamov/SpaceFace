# G18-05 — Restore the Cold Wake swing on Veil Wash

G18-REVIEW found that the two-lap fixture omitted the final lap and started rival impacts too
late. With both corrected, Helios gained only 0.248 s per lap and Veil lost 1.996 s. Tethys
gained 1.443 s and keeps its current line. Mira's Quarry Hook use qualified twice with no
recovery. Veil's Cold Wake caused missed gates and full holds on Rook and Sable.

Steer Cold Wake's live rope through the legal aperture before turning down the exit. Keep the
outgoing release threshold independent of that steering aim. Preserve the working Quarry Hook
and Tethys lines, the standard attachment, native contacts, gate order and 0.8 s advantage.

Owned files: `src/ai/racingDriver.js`, `src/data/racingSetPieces.js`, and
`test/al-race-1-contested-line-4242.test.mjs`. Run the named test. It must count both laps per
rival in both arms, preserve real contact recovery, and pass the Veil and Tethys margins.
The still-red Helios margin has its own packet. The lead checks the visible Veil race path.
