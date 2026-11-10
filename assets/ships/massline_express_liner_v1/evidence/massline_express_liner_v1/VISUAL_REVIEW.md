# Hash-bound visual review — Massline Express Liner v1

- Asset: Massline express liner source candidate
- Scope: whole asset
- Candidate: Cycle 36 LOD0 `AAF714ABF24EF5F7B92AE47818C9CEF2C0512065F405AE9A4BFF0E2D43E1AFEB`
- LOD companions: LOD1 `7FBB3B272962C17D07396CBB90A7594C111CD621431B7955F4AD796A0780158E`; LOD2 `B201060C52819F9F0B2A9416A8FE4915E41D19D2263BFE32EF76E221D141CA50`
- Reviewer: implementing worker original-resolution inspection; controller independent review remains pending
- Cameras: matched LOD0/1/2 play chase, abeam, close (60° / 50° / D=144 and D=58) plus per-LOD clay, grazing, drive-rear, material-ID, ORM, and normal diagnostics from each exported GLB
- Original-resolution inspection: all LOD0/1/2 legal default/abeam/close frames, LOD1/2 authored-band abeam frames, LOD0 clay, and all three drive-rear diagnostics inspected at 1600×900; unchanged transition dimensions are recorded from the generated identities
- Dominant zones: blunt operations bow, three stepped ceramic passenger sections, six paired tucked deck-edge gallery wells, equatorial glazed corridors, framed boarding vestibule, dark keel/cassette/saddle, extended civic axial crown, four-station common aft pressure/load shroud, and two open dry refractory throat cavities
- Bounds / occupancy: 40.27 x 18.96 x 11.11 m, L/B 2.12; chase 17.19%, abeam 8.33%, close 43.92%, all uncropped and in band
- Authored LOD bands: LOD1 default/abeam 187.5/90.0 px in the 90–220 px band; LOD2 default/abeam 81.4/38.7 px in the <=90 px band; matched LOD1/2 far transition 89.0 px
- Material truth: exact unsuffixed semantic glTF names in all LODs; `MAT_SF_Massline_Glazing_SmokedSafety` uses KHR transmission 0.30 in LOD0/1/2
- Implementing iteration decision: `KEEP`
- Whole-asset G1/G2/G4: open; independent reviewer owns the gate verdict and P1 veto

Cycle 36 directly repairs the independent Cycle 35 P1 silhouette rejection. The passenger half-width
drops from 9.65 m to 8.80 m while the inhabited gallery wells and blue-grey glazing remain visible.
The axial crown extends from x=14.35 m to x=-9.45 m, so the longitudinal pressure vessel now dominates
the legal and authored-band abeam views instead of reading as a broad transverse passenger crossbar.

The propulsion correction is one coherent common envelope, not two enlarged appendages. A tapered
four-station pressure/load shroud surrounds both internal ±4.55 m drive centerlines from x=-12.50 m
through x=-19.72 m. It stays visually unified until two open throat rims; its aft end is not capped,
and hollow pressure bands expose dry refractory depth. Legal chase, clay, close, and all LOD abeam
views no longer present two exposed pincer/prong cases. The drive-rear diagnostic confirms the
functional opening rather than a pale closing disk.

LOD1 and LOD2 preserve the blunt bow, stepped longitudinal drum, tucked galleries, common aft shroud,
paired throat openings, and material hierarchy at their declared projected-size bands. The transition
pair remains captured at the same 89.0 px boundary from both exported LODs. No camera, exposure, crop,
or gameplay-distance change was used to hide the corrected forms.

Residual review risk remains at the honest visual layer: the paired dark throat tips can still resolve
as two small terminal marks in close chase, the passenger station remains laterally stepped by design,
and the very small LOD2 abeam view retains only the macro civic envelope. The implementing worker found
no remaining exposed-prong or broad cross/arrow hierarchy in the inspected supported views. This is a
source candidate and a `KEEP` implementing iteration decision only; it is not independently accepted,
released, promoted, or in the live game.
