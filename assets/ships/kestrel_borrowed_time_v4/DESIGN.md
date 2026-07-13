# SF-K0 “Borrowed Time” V4 — source-faithful remaster

V4 is a narrow production remaster of the user-supplied `SpaceFace_SF-K0_Borrowed-Time_Revamp.zip` source blend. It is not a new ship design and does not consume V2 or V3 geometry.

The production source retains the pressure hull, armored brow and keel, recessed cockpit, paired shoulder armor, radiator pods and braces, complete axial drive, pulse gimbal, mining head, starboard utility pod, landing skids, RCS, antenna, repair paint, sparse decals, and all nine gameplay sockets. The builder removes only presentation objects, embedded plume meshes, hidden/helper duplicates, long unrooted radiator lips and grab rails, and subpixel bolt/rivet geometry already represented by the PBR maps.

The material pass lifts the near-black armor response into readable warm charcoal without replacing the source textures. Cyan and orange remain ordinary paint except for drive, RCS/navigation/sensor, mining, and cockpit indicators. Pulse muzzle and general utility practicals are explicitly non-emissive. The source’s existing causal scratches, edge wear, engine heat language, repair-green mismatch, hazard marking, and one-sided `BORROWED TIME` decal are preserved.

The packet is isolated under this directory. It does not edit live manifests, `src/render`, Electron, or the active Kestrel files. Promotion is a separate decision after independent review.
