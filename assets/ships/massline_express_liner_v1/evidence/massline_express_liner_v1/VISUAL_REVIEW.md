# Hash-bound visual review — Massline Express Liner v1

- Asset: Massline express liner source candidate
- Scope: whole asset
- Candidate: Cycle 35 LOD0 `8D0668D2131B7C27ED2612B052F162C2B573F97FA2E7E7709D2FBD054A5F978C`
- LOD companions: LOD1 `995C086C159FD8E9A16BFDFCC3889A05BFC4B110454783D4D9D2E12F2345434A`; LOD2 `2C36BB6C50AC00C8FC76FFB46DF45517716796414E681D86665CBC081F52E493`
- Reviewer: implementing worker original-resolution inspection; controller independent review remains pending
- Cameras: matched LOD0/1/2 play chase, abeam, close (60° / 50° / D=144 and D=58) plus per-LOD clay, grazing, drive-rear, material-ID, ORM, and normal diagnostics from each exported GLB
- Original-resolution inspection: all LOD0/1/2 legal default/abeam/close frames, all authored-band and transition frames, and the LOD0 clay, grazing, drive-rear, material-ID, ORM, and normal diagnostics inspected at 1600×900
- Dominant zones: blunt operations bow, three stepped ceramic passenger sections, six paired deck-edge gallery wells, equatorial glazed corridors, framed boarding vestibule, dark keel/cassette/saddle, civic dorsal well, tapered central propulsion load bridge, and two short near-axial cases with hollow refractory throats
- Bounds / occupancy: 40.27 x 20.75 x 11.11 m, L/B 1.94; chase 17.19%, abeam 9.08%, close 43.92%, all uncropped and in band
- Authored LOD bands: LOD1 default/abeam 187.4/98.1 px in the 90–220 px band; LOD2 default/abeam 81.4/42.2 px in the <=90 px band; matched LOD1/2 far transition 89.0 px
- Implementing iteration decision: `KEEP`
- Whole-asset G1/G2/G4: open; independent reviewer owns the gate verdict and P1 veto

Cycle 35 directly repairs the Cycle 34 rejection. The propulsion centerlines move from ±8.55 m to ±4.55 m inside the aft pressure envelope. A three-station central afterbody overlaps both roots and reaches x=-16.55 m, so the plant reads as one load-bearing assembly that splits only near two dry bores instead of two swept free-ended pincers. The bow is now blunt rather than spear-pointed, the inhabited belt narrows from 22.45 m to 20.75 m without deleting the six-window passenger rhythm, and the legal abeam silhouette no longer collapses into the former cross/arrow. Blue-grey glazing, higher dielectric transmission, and set-back galvanized datum plates give the windows reflected color and visible depth rather than an opaque black-card read.

LOD1 and LOD2 preserve the blunt bow, stepped passenger course, central load bridge, twin-throat identity, and material hierarchy at their declared projected-size bands. The transition pair is captured at the same 89.0 px boundary from both exported LODs. No camera, exposure, crop, or gameplay-distance change was used to hide the corrected forms.

Residual review risk remains: at very small abeam size the paired throat tips still form two dark uprights, and the passenger pressure belt remains the broadest civic mass by design. The implementing worker found no remaining instance of the original long swept prongs, spear-point/cross silhouette, opaque black glazing, or out-of-band LOD evidence in the inspected frames. This is a source candidate and a `KEEP` iteration decision only; it is not accepted, released, or in the live game.
