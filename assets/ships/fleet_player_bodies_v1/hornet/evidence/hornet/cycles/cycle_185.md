# Hornet cycle 185 — full-job reset rejected; retire the loft technique

**Counted:** yes. This was a complete form/material reset rather than another visor nudge.
**Controller verdict:** REJECT. Not wired. No live or release file changed.
**LOD0 candidate:** `B6CA117F2713DCB617C1DBA5E88E0C0538B31BCEBD7DCEBB90D07C95DC5DD96B`, 10,766 triangles, 454,660 bytes.
**Live C85 retained:** `FDC3636BFC74FA0204D96AE0CE49A4F1D713AB040C74563CB07037B64EB37682`.

## Full-job intent

The cycle discarded C184's incremental factory silhouette and built a new candidate around a
connected three-house shell: narrow hunt nose, broad lifting saddle, shouldered twin-drive
transom, formed wing roots, a cut canopy tub with an open-bottom arch, honest material zones, one
offset radiator, and non-emissive rim/ceramic/bore drive stacks. Root identity, all eleven sockets,
the collision object, `SF_HORNET_PRODUCTION_V1`, and zero emission survived export.

Round 1 was rejected as a smooth capsule with card wings, a dark canopy insert, and drive discs.
The final revision widened the saddle, moved wing roots inside the connected shell, separated
hunt/saddle/transom substances, opened the canopy underside, embedded the drive annuli, and removed
the false dorsal stripe. Those were real structural changes, not garnish, but they did not produce
a promotable ship.

## Final independent reviews

| Still | Model / chat | Verdict | Load-bearing finding |
|---|---|---|---|
| `play_chase.png` | Grok 4.6 xhigh / `55abc0bb-6c45-4f69-9605-e0522b0b35fd` | REVISE | Three houses still read as a tube of modules; wings remain add-on triangles and the canopy a dark cap. |
| `play_chase_close.png` | Grok 4.6 xhigh / `8bb84ff0-4a6f-4214-81a8-fc0b9689df7d` | REVISE | Saddle is a rectangular slab, roots are hard cuts, ceramic ring does not read, and surfacing remains block-out quality. |
| `play_chase_abeam.png` | Grok 4.6 xhigh / `ae327710-5008-47e4-9ef4-51d8f43d1035` | REVISE | Planform is a segmented box with attached trapezoids rather than one wasp-like lifting form. |

The three reviews were fresh reads of the final files, not recycled conclusions from Round 1.
Their common minimum fix is the same: the saddle and wings must be one authored lifting surface,
not a ring loft plus separate fairings.

## Controller A/B and hard rejection

The same legal chase renderer captured the live C85 GLB under `live_c85_compare/`. The live ship is
not Hitch-plus, but it is a coherent correctly sized craft. C185 measures
`31.834 x 20.148 x 4.493`, while the live body measures `10.541 x 7.100 x 2.554`. The builder's
`2.962962...` mesh scale made the candidate **3.02x the live visible length**, violating the frozen
display envelope before art quality is considered.

Even ignoring that hard contract failure, C185 loses the live body's internal coherence: the
saddle is a box, the drive house a separate tube, the canopy a black cap, and the exterior wings
remain visibly attached. The candidate therefore cannot replace C85, and building LOD1/LOD2 would
only reproduce a rejected form.

## Durable disposition

Keep `build_hornet_reset_c185.py` and the stills as a failed-technique record. **Do not resume it by
changing ring widths, adding panels, or moving the canopy.** Scripted station rings plus parented
primitive/fairing pieces have now reproduced the same family of defect after a genuine reset.
The next Hornet attempt must begin from a different source technique: a manually authored or
direct-surface lifting body whose wing carry-through, canopy excavation, and drive transom are one
construction before surfacing.

Hitch/Kestrel untouched. C85 remains live. PQ-050.01 remains open and must not be self-accepted.
