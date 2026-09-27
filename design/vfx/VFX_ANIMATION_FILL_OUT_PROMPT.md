# VFX animation and authored-content fill-out

Copy the assignment below into a follow-up production task. This supplements the September 27
runtime reconstruction; it does not imply that authored ship animation and fracture assets already
exist. The owner rejected the previous thin-filament and ball-puff approach.

> Finish the physical accompaniment to SpaceFace's rebuilt VFX. Own the workflow from inspecting
> the live effect, through authoring the missing asset/animation, to wiring it into default gameplay
> and reviewing its complete lifecycle with the released ship in the VFX lab. Commit and push small
> complete packets. Preserve foreign dirty paths and current exact ownership. Do not touch the
> ORRERY frontend lane. Do not substitute documentation, asset counts, tests, or a closer camera for
> a visibly better action.
>
> Start with the live VFX technique/lifecycle standards, the visual asset production standard, and
> the existing production owners. For Blender/GLB work complete the required material-truth preflight.
> Use the repo's existing Blender, Three.js and three.quarks pipeline. Consult OPEN_SOURCE_INTAKE
> before adding a dependency. Record licenses for external content. Use original work, not copied
> Destiny assets or Unreal source.
>
> Produce three coherent packets, assigning disjoint files if delegating:
>
> 1. **Source mechanisms and physical recoil.** Give special weapons source-local animation:
>    thermal chambers open and heat before releasing material; electrical emitters separate and
>    bridge a visible junction; heavy rail hardware compresses, recoils and recovers; gravity
>    emitters load opposing elements before establishing the field. Use real hardpoint/socket
>    transforms. Recoil must travel through the mechanism, settle, and respect rapid fire without
>    stacking offsets. Distinguish anticipation, discharge and recovery. Do not delay authoritative
>    gameplay or invent charge windows. Coordinate existing audio cues at those real event times.
>
> 2. **Material-specific destruction assets.** Author complementary mineral cleavage fragments,
>    bent armor plates, reactor internals and fuel-system debris with meaningful mass and silhouette.
>    Integrate them with the existing rupture families instead of layering another generic explosion.
>    Rock exposes mineral fracture surfaces; armor ejects from the impact side; reactor damage reveals
>    a source inside the hull; fuel tears into rolling burning sheets. If authoring flow/normal/density
>    textures or baked mesh motion, retain smooth native-resolution contours and view depth. Use
>    distinct seed-selected shapes, inherited velocity and source scale. Fragments cool and retire;
>    surviving wrecks remain solid, dark and readable. Never illuminate the whole wreck uniformly.
>
> 3. **Contact and world response.** Couple powers to their actual surroundings: local hull light,
>    material-appropriate contact reaction, displacement of eligible loose fragments, loaded tool
>    endpoints, and event-local decay. Keep sim changes in the authoritative sim owner; presentation
>    follows receipts. An empty field still has active internal flow. Adding an affected body must
>    change the composition meaningfully. Do not add screen shake, flash, or camera movement to
>    disguise a weak source effect. Any camera response must remain subordinate and accessible.
>
> Judge each packet at the normal gameplay camera beside the real ship and asteroids, with a
> normal-speed continuous clip plus onset, peak, release and aftermath frames. Compare two seeds
> and at least one materially different source size or contact direction. Check a wider view when
> changing small detail. Keep the original frame/camera for before-and-after comparisons. Energy
> needs broad moving body, darker channels and hot folds; it must not look like wires, a rigid neon
> toy, a sphere, or a pile of puffs. Distinct families must remain distinguishable without color.
>
> Preserve deterministic simulation, pause, origin rebasing, reduced-motion/flash, default-route
> reachability and bounded pools. Measure relevant runtime cost on the available renderer and name
> software rendering honestly. Optimize batching, residency and allocation, not default quality.
> Run only the focused checks needed for the changed behavior. Fix a visible failure before calling
> the packet complete. Stop when the assigned actions are visibly improved, wired, checked, and
> published; state any remaining art limitation plainly.

The useful reference is the artists' emphasis on timing, variety, gameplay communication and
shader craft, rather than reproducing a particular game's surface motifs:
[Bungie's Destiny 2 VFX team](https://magazine.artstation.com/2023/08/a-day-on-the-destiny-2-vfx-team/).
