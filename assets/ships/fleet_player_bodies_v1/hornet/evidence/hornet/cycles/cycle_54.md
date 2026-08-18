# Hornet cycle 54 — form restart

**Counted:** yes. This is a complete form attempt, not a garnish pass.

**LOD0 sha256 (reviewed candidate):** `1069a507e10f04c2…`

| LOD | Hull triangles | Total triangles |
|---|---:|---:|
| 0 | 21,240 | 59,662 |
| 1 | 21,240 | 43,582 |
| 2 | 21,240 | 39,662 |

## What changed

The four disjoint gloves (`Cabin_Glove`, `Waist_Glove`, `Boom_Glove`, `Drive_House`) and the
stepped plate bands and hoop frames that sat *outside* them are gone. In their place: one continuous
loft from a solid chined nose to a closed transom, with station shape varying along the body
(`flat` / `box` / `keel`) rather than the body changing membership. Wings are swept deltas lofted
out of the beam. Twin bells sit in the aft body instead of on a trailing boom. Plating is insets and
plates on the skin.

Measured envelope, from `COLLISION_HULL_MESH` in the exported GLB:

| | cycle 53 | cycle 54 | target |
|---|---:|---:|---:|
| Length | 15.3 | **10.7** | ~10.5 |
| Span | ~2.5 body | **7.4** | ~7.2 |
| Length : span | ~6 : 1 | **1.45 : 1** | ~1.45 : 1 |

## Stills

`cycles/cycle_54/` — `three_quarter.png`, `starboard.png`, `rear.png` are the three valids; each
shows bow, stern and most of the body. Extras: `clay_three_quarter`, `grazing_close`,
`bay_interior`, `drive_rear`, `play_size`, `material_three_quarter`, `orm_isolation`,
`normal_isolation`, `id_or_material_id`.

## Reviews

Three independent read-only reviewers, one still each, given the §4 prompt and told explicitly that
"better than last cycle" is not the bar.

### Measured, from the starboard reviewer

**Confirmed fixed, with numbers:**

| | cycle 53 | cycle 54 |
|---|---:|---:|
| Length : height, profile | 13.6 : 1 | 6.36 : 1 |
| Length within ±10% of median section | 77% | **28.1%** |
| Section reversals along the body | 0 | **5** |
| Deepest waist, as % of max section | — | **65%** |
| Silhouette | snapped in two at mid-body | **one connected component**, no cliff |

MTX-02 (authored cross-section loft) **passes** on the profile view. The rod is gone.

**Still failing, with numbers:**

| Axis | A-list | cycle 54 |
|---|---|---|
| Profile proportion | 2.5–4 : 1 | **6.36 : 1** — a 59% overshoot |
| Value split (dark / mid / hot) | ~15 / 60 / 8 | **3.4 / 76.8 / 2.8** |
| Drive bell as % of stern section | 60–70% | **36%**, on a 27 px neck |
| Readable openings with rims | several | **zero** |
| Accent coverage | one controlled beat | **0.23%**, three stuck-on bars |

### The gate for cycle 55 is arithmetic, not opinion

Off the same starboard camera: **bbox ≥240 px tall against ≤1050 px wide**, **at least three openings
with visible rims**, and a **drive bell ≥95 px**. Re-shoot and re-measure.

### A gap in the controller's brief, recorded so it is not repeated

The form-restart brief specified length : **span** (~1.45 : 1, met exactly) and never specified
length : **height**. That is why the ship came back correct from above and 59% too low in profile —
the reviewer's word for it is "a submarine or a missile". Raise section rather than shorten length:
length is what makes it read fast.

**Verdict so far: REVISE.** The reviewed defect from cycle 53 — "an open plate cage, not a closed
interceptor" — is confirmed **fixed**. The hull is a closed formed shell with a chine and a waist
and reads as an interceptor rather than a scaffold. It is nowhere near `keep`: the reviewer's phrase
is that it **traded a cage for a blank**.

Named failures to carry into cycle 55, highest value first:

1. **The canopy is a picture frame on unbroken skin.** `bay_interior.png` — the builder's own
   nominated proof — shows the outer skin running continuously *underneath* the glass. No hole, no
   rim, no tub, no seat. This single omission fails MTX-03, MTX-04, MTX-07, MTX-57, MTX-61 and
   MTX-12 at once, because each of those rows needs an actual opening to exist.
2. **Nothing on the ship is dark and deep.** Not one opening anywhere. A player circling it sees a
   closed white dart. MTX-56 value hierarchy fails: one value band.
3. **The drive bell renders as a fuzzy translucent ball** at three-quarter distance while
   `drive_rear.png` shows the geometry underneath is sound — a material or normals fault destroying
   real work.
4. **The wing is still a card** — uniform thickness root to tip, no root fillet, no slot, no flap,
   blank underside, and a visible crack at the root in clay.
5. **Loose slivers near the nose and a detached bar above the canopy** — reviewer observation, not
   yet reproduced by measurement. I tried to corroborate it from the exported mesh bounds (the
   merged ceramic group reports a local extent 10.3 units tall against a hull 1.33 tall) but the
   starboard still shows no such mast, so the bounds figure is more likely an artefact of how the
   material groups merge than evidence of a stray object. **Treat the reviewer's sighting as the
   claim and confirm it in Blender before acting** — do not cite the bounds number.
6. **A slab kit still sits on the dorsal spine** — the contract's named forbidden read.
7. **Accents are four flat colour chips**, mirrored left/right, with hard vector edges and no
   recess. MTX-60 authored asymmetry and MTX-42 sprayed-stencil both fail.

## Controller findings, not from the reviewers

**The sockets were left at the old needle coordinates and had to be re-seated.**
`SOCKET_Weapon_Front` sat at x 7.05 against a nose ending at x 5.60 — the gun mounted 1.45 units in
front of the ship, firing from empty space. `SOCKET_Mining_Front` was 2.05 units out. The names are
the runtime contract and did not change; the positions had to follow the hull. Fixed and rebuilt.
This is why a form change can never be reviewed on stills alone.

**Texel density is real but is NOT the binding constraint yet.** Measured from the exported GLB,
hull surfaces carry 10–51 px/m against a contract floor of 256. But `bay_interior.png` is a tight
crop at roughly an order of magnitude more effective density and still fails, because what is
missing there is geometry, not pixels. Raise the maps to 2048/4096 in the *same* pass that cuts the
bays — not before, or the extra resolution only sharpens the scribes.

## Not claimed

The leaf is not closed. Nothing is wired. No mandatory MTX row is marked implemented: the clay gate
fails on the dorsal slab kit, and MTX-46 fails on sight.
