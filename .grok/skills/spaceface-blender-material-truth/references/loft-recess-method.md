# Loft and recess method for SpaceFace hard surfaces

Read this when a camera-prominent ship, place, housing, boom, or pressure body reads as a stack of
Blender primitives. This is a defect-repair method, not a required house style.

## 1. Start from manufactured stations

Describe the existing part along its dominant axis as a short list of section stations. Each station
records position, width, height, corner/chamfer behavior, and local offset. Use sections that a
fabricator could explain:

- blunt cap or receiver flange;
- parallel pressure/service midbody;
- frame station or shoulder;
- narrowed transfer section;
- load-spreading root.

Avoid a featureless nose-to-tail taper. Deliberate parallel runs and shoulders give the eye scale and
construction rhythm.

A compact octagonal section helper:

```python
def octagonal_section(width, height, chamfer_x, chamfer_z, axis_pos, offset_z=0.0):
    half_w, half_h = width * 0.5, height * 0.5
    ring_2d = (
        (half_w, half_h - chamfer_z),
        (half_w - chamfer_x, half_h),
        (-(half_w - chamfer_x), half_h),
        (-half_w, half_h - chamfer_z),
        (-half_w, -(half_h - chamfer_z)),
        (-(half_w - chamfer_x), -half_h),
        (half_w - chamfer_x, -half_h),
        (half_w, -(half_h - chamfer_z)),
    )
    return [(x, axis_pos, z + offset_z) for x, z in ring_2d]
```

Create one ring per station and bridge corresponding vertices. Close the ends only when the part is
actually capped. Add wall thickness, an interior ring, or a separate inner shell when an opening is
camera-visible. Inspect face winding, non-manifold edges, section twist, pinching, and grazing-light
waves before adding detail.

Use a superellipse or another authored profile when the fiction calls for a formed vessel rather
than faceted plate. The important fact is authored section transition, not the eight-sided example.

## 2. Cut depth into the skin

Use inset/recess, a controlled boolean, or equivalent direct modeling when a bay or channel has real
depth. A representative bmesh sequence is:

```python
result = bmesh.ops.inset_region(
    bm,
    faces=selected_faces,
    thickness=inset_width,
    depth=0.0,
    use_even_offset=True,
    use_boundary=True,
)
inset_faces = [face for face in result.get("faces", []) if face.is_valid]
for face in inset_faces:
    direction = face.normal.normalized()
    bmesh.ops.translate(
        bm,
        verts=list(face.verts),
        vec=direction * -recess_depth,
    )
```

Do not assume the original selection is still the inset floor after the operation; inspect the
returned geometry. Give camera-visible recesses:

- an outer rim and wall thickness;
- an inner wall/floor or open service volume;
- a believable connection to structure, cable, coolant, payload, or airflow;
- material separation only where the substance actually changes.

Use trim, decal, or baked normal treatment when the depth is genuinely shallow at the supported
camera. Avoid boolean slivers, coplanar overlays, hidden interior cost, and rows of floating panel
bars.

## 3. Zone rather than flood

Assign regions before adding fine detail:

1. primary silhouette and quiet plate;
2. frame/load-transfer construction;
3. access and service zones;
4. heat/flow/contact zones;
5. sparse identity markings and instruments.

Concentrate meso and fine work around interfaces. Preserve quiet surfaces so the detail has contrast.
Size fine work from projected gameplay pixels and function; do not import a universal greeble ratio.

## 4. Review without flattering the model

Fit diagnostic cameras from the evaluated world-space bounds of visible render geometry. Use the
chosen view direction and the camera field of view to calculate distance with a small framing margin.
This prevents hand-placed close cameras from entering geometry.

Use a fixed neutral environment, one hard lateral key, restrained complementary fill, and optional
rim. Put the primary diagnostic camera on the key side, then add a separate shadow-side stress view.
Keep matched exposure, background, and framing across baseline/candidate. These diagnostics never
replace the supported gameplay camera or exact normal-route evidence.

If a render suddenly becomes much slower, check near-plane and camera intersections before lowering
samples or removing authored detail.

## 5. Blender execution traps

- Inspect object, parent, and shared-data transforms before beveling. Apply non-uniform mesh scale
  only when dimensions, pivots, sockets, collision, parenting, and shared-data intent remain correct.
- Do not set a keep-world-transform parent inverse when the child is supposed to inherit the
  parent's authored space.
- Measure the transformed face/object normal against the intended view or axis; do not infer visible
  rotation from an Euler axis name.
- Query the connected Blender version and RNA for compositor, action, node-socket, enum, and operator
  behavior. Keep compatibility helpers local.
- Establish Object/Edit mode, active object, and selection explicitly before context-dependent
  operators.
- Treat an implausibly fast transparent-black render as a failed render dependency, not success.
- Preview downsampling can erase fine stars, markings, and wear. Inspect native-size crops or numeric
  pixel statistics before declaring the authored signal absent.

## 6. SpaceFace export correction

SpaceFace ships authored GLBs through its real source, candidate, finalizer, manifest, and Three.js
runtime path. Verify the asset family's units, axes, sockets, collision, LOD names, material roles,
and output directories from the live repository.

Procedural Blender nodes, Cycles `Pointiness`, viewport lighting, compositor effects, and diagnostic
cameras/lights are authoring or evidence tools; they do not automatically survive glTF. Bake or
translate only the approved mesh-aware result into portable base-color, tangent-normal, ORM,
emissive, and supported material parameters. Let the sanctioned SpaceFace exporter/finalizer own
compression and packaging.

Do not copy another game's assumptions about missing GLB loaders, world scale, export folders,
material dressing, object joining, or draw-call budgets.
