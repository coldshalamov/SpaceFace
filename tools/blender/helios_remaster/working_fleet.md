# Helios working fleet: construction source

`working_fleet.py` rebuilds eight existing occupational craft from the established
`build_npc_work_fleet.py` component source, keeping useful hardware and replacing the
blank dominant shells. It imports the current source GLB's surfaced materials,
socket graph and collision mesh. It never edits shared manifests or release output.

Run with Blender 5.1:

```
blender --background --threads 3 --python tools/blender/helios_remaster/working_fleet.py
```

`--only <id>` rebuilds one craft. `--skip id,id` skips named craft. Candidate GLBs,
editable BLEND scenes and hash/LOD reports are written to
`.devshots/helios-remaster/working-fleet/`. `--render-only --only <id>` renders the exact
exported GLB through the supported D144, D144 abeam and D58 chase cameras. Those neutral
Blender frames do not replace review through the game's actual illustrated shader.

The editable scenes contain both the individual manufacturing components and merged
LOD outputs. The individual components are hidden initially so the complete surfaced
LOD0 assembly is the visible working state. Reveal the `*_EDITABLE_COMPONENTS`
collection and hide `*_EXPORT` when editing individual assemblies.

| Craft | Construction that now owns the overhead read |
| --- | --- |
| Repair Tender | Broad workshop shoulders surround an exposed hydraulic trench. A hose reel sits between two open standards; service cassettes and a stocked plate rack give it a workshop hierarchy. |
| Rescue Lifter | The forward half is an open lowered casualty cradle. Two tapered sponsons carry the hoist around the bed; pads, load straps and guide rails stay visible without a roof. |
| Prospector Skiff | A circular sample carousel and optical bridge occupy an actual assay well, with a small pressure cab, folded working arm and open claim-stake cradle. |
| Scrap Sweeper | A dark toothed roller feed lies between tapered formed scoop cheeks. The rear debris hopper is cut into the chassis and its lattice/caught stock remain visible. |
| Apron Shuttle | A pressure-coach shell with paired recessed glazed roof ribbons, structural mullions, pilot cab, service door and separate aft cooling opening. |
| Salvage Cutter | An exposed hydraulic receiver and service drum support paired forged shear jaws that open in the horizontal plane, where the chase camera can see both jaws and their gap. |
| Yard Tug | The already authored girder, wheelhouse, push gear and drive pods remain. Real pod cooling apertures and a recessed deck capstan explain the machinery without changing its silhouette. |
| Ore Barge | Six existing cargo baskets seat into real deck openings over transverse load members. Their ties, bow hydraulics and formed wear cheeks replace the uninterrupted deck/bow slabs. |

The second construction pass follows the controller's rejection of the first pass:
small rectangular wells did not sufficiently distinguish the roles. Enlarged role
assemblies and open load space replace that approach. The old Tender Cycles images
are first-pass diagnostics, not final-candidate evidence.

Every exported material carries `spacefaceRemasterGeometry=true`, so the renderer can
retain common light/shadow treatment without drawing its compatibility fake surface
wells over the new modeled recesses. Five existing substance families remain; the
craft use six or seven LOD0 draw groups including their separate drive hooks. No new
texture sheets or unbounded material variants were introduced.

Source/candidate comparison verified all eight socket transforms and collision bounds
with zero delta. Updated visible geometry fits within the prior craft envelope
(floating-point tolerance 1e-5 m). Three LODs retain machinery silhouettes; LOD1 keeps
meso construction rather than dropping the entire work assembly at normal range.
This is a technical result, not an artistic acceptance claim. The controller owns
exact-candidate game-renderer review, any requested corrections, source promotion,
generated release metadata and normal-route performance verification.
