# Cycle 32 — Massline Express Liner v1

LOD0 hash: `00F2DCAB9A2F24506E4A5576B48237D7EB74295CBFCCF0A1E4AB71F64EF35C60`

Stills from the exported LOD0 GLB, live chase helper (60° tilt, FOV 50, D=144 / D=58, no yaw follow).

Source bounds 40.67 x 22.45 x 10.99 m. Length-to-beam 1.81.

| Still | Occupancy | Band |
|---|---:|---|
| play_chase.png | 17.45% width, uncropped | in 8–22% (packet target 13–18%) |
| play_chase_abeam.png | 9.75% width, 27.2% height, uncropped | in 8–22% (packet target 9–12%) |
| play_chase_close.png | 44.97% width, uncropped | in close ratio band |

What this cycle changed:

- Cycle 31 still read as a tan egg with hanging corridor cards, black hoop tape, a black cockpit bite, and stick-mounted drive boxes. Cycle 32 rebuilds the body as three mechanically separate inhabited stations inside the same envelope: a forward operations/boarding shoulder, a wide passenger pressure course, and an aft machinery bulkhead.
- Hat-section rings (standing flange, web, inner channel) in satin anodized metal split those stations. Corridors, keel, and dorsal spine root into them. Crushed-black hoop solids are gone.
- Equatorial corridor shells are hollow framed belts on the passenger station, with inner wall, sill/header, four pane/door bays, mullions, and short returns into the hat rings. They do not pad occupancy with hanging cards.
- Boarding is a recessed port cut and framed glazed vestibule. The snub bow remains. No black visor/bite and no cyan identity pin.
- Twin drives are short tapered housings grown from the aft bulkhead through gusseted load-ring saddles. Throats are thick dark metal with dry refractory inner walls and six thin rooted stator blades.
- Unique maps use cube/box unwrap so they cannot wood-grain. Baked AO lives only in ORM occlusion. Civic shell is quiet rough ceramic; load paths are satin metal; glass is a dark blue-grey dielectric with transmission.

LOD0 29942 tris / 6396 hull / 9 draws. LOD1 24962 / 6396 / 9. LOD2 10596 / 1524 / 8.

Implementing-agent verdict: `review_pending` / `evidence_ready`. Whole-asset G1/G2/G4 stay open. Source candidate only. Not wired.

Remaining risk: at D=144 the wide passenger course can still read as a rectangular belt; authored glass transmission may still look like dark cards in EEVEE; diagnostic bore lighting still throws a bright chamfer on the throat lip. Independent review owns KEEP.
