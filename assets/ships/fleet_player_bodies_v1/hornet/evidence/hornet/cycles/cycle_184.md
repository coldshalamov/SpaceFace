# Hornet cycle 184 — wider cockpit lip, aft transom punches, still REVISE

**Counted:** yes, but see "Not a full-job attempt" below. Three legal chase stills. Hitch-plus not met. Not wired.
**LOD0 sha256:** `2A1DB61D8A791D06DFD8E940803F50DEA2A2C9403C8C3FEE56D2C7B50A38CF21`
**hullTriangles:** 15158 (LOD0 47,142 tris / 10,225,920 B — down 1,222 tris and 187,224 B from C183)
**Framing:** play_chase 10.7% / abeam 8.8% / close 27.3%. Mean luminance 127 / 124 / 125 vs Hitch 94 / 126 / 94.
Median 157 / 155 / 157 vs Hitch 77 / 143 / 77; p05 45 / 25 / 39 vs Hitch 8 / 15 / 5.

Built intent (`build_hornet_mtx.py`): widen the cockpit boolean 0.70x0.34 -> 0.75x0.40 so a white lip
survives at 60 degrees, shrink the visor sheet and tub floor to match, and punch two aft wells at
x -4.50..-4.15 so close sees a transom instead of a roof.

Reviews at play size:

| Still | Agent | Verdict |
|---|---|---|
| `play_chase.png` | opus5-chase | REVISE |
| `play_chase_abeam.png` | opus5-abeam | REVISE |
| `play_chase_close.png` | opus5-close | REVISE |

## Not a full-job attempt — measured

C184 differs from C183 by **198 / 222 / 1,124 pixels**, which is **1.8% / 2.0% / 1.7% of the ship's
own pixels**. Ship bounding box, hull luminance, wings, wells, transom, pods and panel scribes are
pixel-identical. The entire delta is the canopy lozenge, which lost 48% of its dark area and had its
lip dropped on two sides — a rounder sticker, not a better canopy. This is the third consecutive
cycle whose only change is a visor nudge (C177 shrank it, C182 narrowed it, C184 shrank it again),
against an unchanged verdict each time. `PQ-050.md` lists "work split across cycles instead of a
full-job attempt each time" as an automatic fail and "looping the same factory nudge after the same
stills defect" as a stop condition. Both are met.

## Three structural findings — why the surface notes have not converged

1. **The chase camera was under the keel.** `spaceface_chase_camera.py` transcribed the live
   controller's three.js offset `(0, D sin60, -D cos60)` verbatim into Blender, where +Z is up, not
   +Y. At the standard pose that put the camera at Blender z = **-72.0** — below the ship, looking at
   the keel. Every cycle still through C151 photographed the belly mirrored. Fixed and committed this
   session; C152+ are already correct, but 151 cycles of "the canopy will not read" were reports about
   a surface the camera was not pointed at.
2. **The shading erases construction the geometry already has.** The clay pass carries *more* readable
   form than the beauty pass: clay shows stepped forward-deck blocks, chines, a raised mid-hull box and
   real wing-root thickness, all of which the textured render collapses into one value. Measured on
   `play_chase_close`: 56% of ship pixels sit in a 40-level band (140-200) and only 2.5% in the
   100-140 midtone. Of the seven dorsal louvre strokes a player sees, **at most two exist in clay** —
   five are pure texture. The hull is not missing construction; the material is hiding it.
3. **No mandated still is a side elevation.** `play_chase_abeam.png` is left-right mirror-symmetric
   (IoU 0.953 vertical vs 0.466 horizontal): it is a nose-on plan view, the same 60-degree overhead
   pose rotated 90 degrees in azimuth. All three stills are plan views. Wing section, well depth and
   hull cross-section are therefore **not adjudicable from any cycle still** — yet the reviews have
   demanded exactly those for twenty-plus cycles. Either add a diagnostic profile still (not a cycle
   still, which stays chase-only by law), or stop gating on depth the chase camera cannot show.

## Named remains

Chalk hull as one white mass — no hull pixel falls below lum 120 while the backdrop is 97, so every
authored panel line renders brighter than the sky. Card wings — the two wing plates hold **83.8%** of
all dark pixels on the ship, against the gate's 30% ceiling for any single contiguous dark region;
none of the ship's dark comes from shadow, recess or aperture. Canopy is a flat sticker (fill std 3.8,
surround 0.9 levels darker than the deck, and flat in clay too — there is no recess in the geometry).
Drive wells are ~9x9 px amorphous black blobs with no rim, no floor, no circular mouth. Transom is a
white cap. Boxes on skin forward of the louvre band.

**Earned, and previously unrecorded:** the port/starboard wing is no longer a zero-thickness card —
it has a real vertical end-face, two separate lit facets with a hard crease, and a trailing element
split off by a lit slot. Those pixels are identical to C183, so the credit belongs to C183 and the
log did not record it. Limits, stated so nobody calls it finished: constant faceted section root to
tip, no camber, no thickness taper, no leading-edge round, and a bare butt joint into the hull with
no fillet.

## Next cycle

Do not touch the visor. Rebuild the two drive wells as real throats — circular mouth clearing ~14 px
at D=144 on the abeam still (up from 9), a lit rim lip standing proud of the shoulder plate, and a
visible interior floor step so the bore is a darker region >=25% of mouth area. Then break the chalk:
give dorsal panel boundaries a real Z-step with a chamfer, tested as *every dorsal boundary must show
a pixel brighter than the local deck immediately adjacent to a pixel darker than it* — today zero do.
Do not chase specular or roughness: Hitch's close still has 10 px above lum 210 and zero above 225,
Hornet has 6 and 2, so the highlight count is a property of the rig, not a ship difference. The whole
Hitch gap is median and low end.

**Contract gap on this cycle:** the 19:09 evidence sweep also took C184's five isolation proofs
(`orm_isolation`, `normal_isolation`, `id_or_material_id`, `grazing_close`, `drive_rear`), which
`ADVANCED_MODEL_TECHNIQUE_CONTRACT.md` requires for MTX-08 / MTX-13 / MTX-23. `build_hornet_mtx.py`
still writes all five; C185 re-renders them.

Not wired. C85 remains the live game body. Hitch untouched.
