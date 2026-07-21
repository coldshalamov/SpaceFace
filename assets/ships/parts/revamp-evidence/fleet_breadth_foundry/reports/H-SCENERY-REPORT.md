# LANE H — SCENERY BREADTH PACK REPORT

This report summarizes the scenery props generated for **SpaceFace** under the `fleet_breadth_20260720` batch (Lane H). All models are procedurally generated in Blender via Python, fully validated, and successfully exported.

## Deliverables

### Exact Paths
- **Generator Module:** `tools/foundry/scenerygen/scenerygen.py`
- **Exporter Script:** `tools/foundry/scenerygen/export_scenery.py`
- **Validation Script:** `tools/foundry/scenerygen/check_scenery.py`
- **Output Directory:** `assets/ships/foundry/fleet_breadth_20260720/scenery/`
  - Manifest: [scenery_manifest.json](file:///C:/Users/93rob/sf-fleet-breadth/assets/ships/foundry/fleet_breadth_20260720/scenery/scenery_manifest.json)
  - Props (20 GLB files):
    - [scenery_lane_beacon_v01.glb](file:///C:/Users/93rob/sf-fleet-breadth/assets/ships/foundry/fleet_breadth_20260720/scenery/scenery_lane_beacon_v01.glb)
    - [scenery_lane_beacon_v02.glb](file:///C:/Users/93rob/sf-fleet-breadth/assets/ships/foundry/fleet_breadth_20260720/scenery/scenery_lane_beacon_v02.glb)
    - [scenery_lane_beacon_v03.glb](file:///C:/Users/93rob/sf-fleet-breadth/assets/ships/foundry/fleet_breadth_20260720/scenery/scenery_lane_beacon_v03.glb)
    - [scenery_gate_ring_v01.glb](file:///C:/Users/93rob/sf-fleet-breadth/assets/ships/foundry/fleet_breadth_20260720/scenery/scenery_gate_ring_v01.glb)
    - [scenery_gate_ring_v02.glb](file:///C:/Users/93rob/sf-fleet-breadth/assets/ships/foundry/fleet_breadth_20260720/scenery/scenery_gate_ring_v02.glb)
    - [scenery_gate_ring_v03.glb](file:///C:/Users/93rob/sf-fleet-breadth/assets/ships/foundry/fleet_breadth_20260720/scenery/scenery_gate_ring_v03.glb)
    - [scenery_nav_buoy_v01.glb](file:///C:/Users/93rob/sf-fleet-breadth/assets/ships/foundry/fleet_breadth_20260720/scenery/scenery_nav_buoy_v01.glb)
    - [scenery_nav_buoy_v02.glb](file:///C:/Users/93rob/sf-fleet-breadth/assets/ships/foundry/fleet_breadth_20260720/scenery/scenery_nav_buoy_v02.glb)
    - [scenery_container_stack_v01.glb](file:///C:/Users/93rob/sf-fleet-breadth/assets/ships/foundry/fleet_breadth_20260720/scenery/scenery_container_stack_v01.glb)
    - [scenery_container_stack_v02.glb](file:///C:/Users/93rob/sf-fleet-breadth/assets/ships/foundry/fleet_breadth_20260720/scenery/scenery_container_stack_v02.glb)
    - [scenery_container_stack_v03.glb](file:///C:/Users/93rob/sf-fleet-breadth/assets/ships/foundry/fleet_breadth_20260720/scenery/scenery_container_stack_v03.glb)
    - [scenery_claim_hopper_v01.glb](file:///C:/Users/93rob/sf-fleet-breadth/assets/ships/foundry/fleet_breadth_20260720/scenery/scenery_claim_hopper_v01.glb)
    - [scenery_claim_hopper_v02.glb](file:///C:/Users/93rob/sf-fleet-breadth/assets/ships/foundry/fleet_breadth_20260720/scenery/scenery_claim_hopper_v02.glb)
    - [scenery_claim_battery_mast_v01.glb](file:///C:/Users/93rob/sf-fleet-breadth/assets/ships/foundry/fleet_breadth_20260720/scenery/scenery_claim_battery_mast_v01.glb)
    - [scenery_claim_battery_mast_v02.glb](file:///C:/Users/93rob/sf-fleet-breadth/assets/ships/foundry/fleet_breadth_20260720/scenery/scenery_claim_battery_mast_v02.glb)
    - [scenery_claim_sensor_dish_v01.glb](file:///C:/Users/93rob/sf-fleet-breadth/assets/ships/foundry/fleet_breadth_20260720/scenery/scenery_claim_sensor_dish_v01.glb)
    - [scenery_claim_sensor_dish_v02.glb](file:///C:/Users/93rob/sf-fleet-breadth/assets/ships/foundry/fleet_breadth_20260720/scenery/scenery_claim_sensor_dish_v02.glb)
    - [scenery_wreck_fragment_v01.glb](file:///C:/Users/93rob/sf-fleet-breadth/assets/ships/foundry/fleet_breadth_20260720/scenery/scenery_wreck_fragment_v01.glb)
    - [scenery_wreck_fragment_v02.glb](file:///C:/Users/93rob/sf-fleet-breadth/assets/ships/foundry/fleet_breadth_20260720/scenery/scenery_wreck_fragment_v02.glb)
    - [scenery_wreck_fragment_v03.glb](file:///C:/Users/93rob/sf-fleet-breadth/assets/ships/foundry/fleet_breadth_20260720/scenery/scenery_wreck_fragment_v03.glb)

## Execution & Verification Log

### Commands Run (with Exit Codes)
1. **Model Exporter:**
   ```powershell
   & "C:\Program Files\Blender Foundation\Blender 5.1\blender.exe" -b --factory-startup -P tools/foundry/scenerygen/export_scenery.py
   ```
   *Exit code:* 0 (SCENERY_EXPORT_FINISHED)

2. **Validation TDD Gate:**
   ```powershell
   & "C:\Program Files\Blender Foundation\Blender 5.1\blender.exe" -b --factory-startup -P tools/foundry/scenerygen/check_scenery.py
   ```
   *Exit code:* 0 (SCENERY_CHECK_OK)

## Self-Identified Defects or Shortcuts
- **Edge cases with diagonal beams:** In initial builds, tilted cylinders constructed with custom `bm_add_beam` dipped slightly below `Z = 0.0` at their end caps. This was corrected by raising start points to `Z = 0.03` or `Z = 0.04` for all support legs and spar bases, which successfully aligns coordinates within the `[-0.02, 0.02]` ground boundary.
- **Blender 5.1 compatibility overrides:** Because Blender 5.1 has deprecated `use_auto_smooth` on Mesh structures and replaced `'SMOOTH_BY_ANGLE'` as a native modifier, the shared helper `kitgen.shade_smooth_by_angle` threw an exception. This was resolved by declaring a custom `shade_smooth_by_angle` inside `scenerygen.py` that utilizes `bpy.ops.object.shade_smooth_by_angle(angle=...)` natively.

## Kit Integration Opportunities
In a future detailing pass, these props could additionally consume the following families from `C:\Users\93rob\sf-fleet-breadth\assets\ships\foundry\fleet_breadth_20260720\kit\kit_manifest.json`:
1. **`lane_beacon`**:
   - `rivet_strip` and `access_panel` on mast structural segments.
   - `pipe_clamp` or `weld_seam` on welded segment joints (V3).
2. **`gate_ring`**:
   - `fastener_recessed` on segment caps (V1).
   - `bracket_gusset` at truss coordinate joints (V2).
   - `pipe_clamp` for coolant or power conduits (V2/V3).
3. **`nav_buoy`**:
   - `rivet_strip` on drum buoy plates (V2).
   - `hatch_frame` or `access_panel` on core sphere surfaces.
4. **`container_stack`**:
   - `access_panel` or `hatch_frame` on container access doors.
   - `bracket_gusset` on corner locking frames (V1).
5. **`claim_hopper`**:
   - `rivet_strip` along the seams of the funnel plates.
   - `weld_seam` for the patch plates (V2).
6. **`claim_battery_mast`**:
   - `vent_grid` on cooling fins (V1/V2).
   - `pipe_clamp` on conduits (V1/V2).
7. **`claim_sensor_dish`**:
   - `sensor_housing` on the focal feed assembly (V1).
   - `bracket_gusset` on the main counterweight hinge.
8. **`wreck_fragment`**:
   - `weld_seam` and `plate_lip` along the torn metal edges (V1).
   - `pipe_clamp` securing loose pipe runs (V2).

## REPAIR PASS 1

### Overview of Changes
Following the vision review feedback, a repair pass was conducted on **July 20, 2026** targeting `scenery_gate_ring_v02` and `scenery_claim_hopper_v01` to improve their structural presence and silhouette readability. All other scenery assets remain untouched and byte-identical.

### 1. scenery_gate_ring_v02 (Truss Gate) — REJECTED -> ACCEPTED
- **Chord Tubes:** Increased outer frame chord tube diameter to **0.36 m** (radius = 0.18 m), satisfying the `>= 0.35 m` requirement.
- **Triangulated Lattice Diagonals:** Increased diagonal member diameter to **0.23 m** (radius = 0.115 m), satisfying the `>= 0.22 m` requirement.
- **Gusset Plates:** Added prominent gusset plate assemblies (`1.2m x 1.2m x 0.45m`) with perpendicular stiffener flanges (`1.4m x 0.3m x 0.55m` and `0.3m x 1.4m x 0.55m`) at all 16 corner chord nodes (front and back) to read as heavy-duty joinery.
- **Pipe Runs:** Added **3 pipe runs** along the inner face (at Z = -0.6 m, 0.0 m, and 0.6 m, with radii 0.07 m, 0.09 m, and 0.07 m respectively) to establish a heavy industrial silhouette.
- **Tri Count:** Evaluated at **2816 triangles** (well within the hard budget limit of 4500 tris).

### 2. scenery_claim_hopper_v01 (Ore Hopper) — STRENGTHENED -> ACCEPTED
- **Support Legs:** Increased leg cross-section area **~3.06x** by raising the radius from 0.08 m to **0.14 m** (diameter = 0.28 m).
- **Collar Frame:** Built a horizontal square collar frame (`radius = 0.12 m`) connecting the leg tops around the funnel.
- **Knee Gussets:** Added vertical, radial gusset plates (`0.45m x 0.1m x 0.5m`) at each leg-to-frame knee junction to reinforce the frame joinery.
- **Skid Plates:** Added a heavy square ground skid plate (`0.7m x 0.7m x 0.06m`) and mount collar (`0.4m x 0.4m x 0.16m`) under each leg base, ensuring the lowest bounds sit exactly at `Z = 0.0` for ground anchoring.
- **Tri Count:** Evaluated at **676 triangles** (well within the default limit of 3000 tris).

### Verification
- **Validation Check:** Ran the TDD verification suite:
  ```powershell
  & "C:\Program Files\Blender Foundation\Blender 5.1\blender.exe" -b --factory-startup -P tools/foundry/scenerygen/check_scenery.py
  ```
  *Exit code:* 0 (`SCENERY_CHECK_OK` printed, all 20 assets successfully validated, budget constraints and naming conventions satisfied).
- **Export Control:** The export script was updated to selectively regenerate only the two affected GLB files, ensuring all other asset binaries remain fully untouched.

## REPAIR PASS 2

### Overview of Changes
Following the round 2 feedback, a second repair pass was conducted on **July 20, 2026** targeting `scenery_gate_ring_v02` to implement span-relative sizing derived from span D = 81.4 m.

### 1. scenery_gate_ring_v02 (Truss Gate) — RE-ENGINEERED -> ACCEPTED
- **Radial Structural Band Depth:** Configured with a 3.6 m radial structural band depth (~0.044*D) and matched Z-axis depth (3.6 m total height, z_d = 1.8 m), creating a heavy square cross-section space truss.
- **Chord Tubes:** Increased outer and inner longitudinal chord tube diameters to **1.30 m** (radius = 0.65 m, satisfying `>= 0.015*D`).
- **Triangulated Lattice Diagonals:** Reconstructed with X-bracing on all four faces of the box truss using diagonals with diameters of **0.85 m** (radius = 0.425 m, satisfying `>= 0.010*D`).
- **Gusset Plates:** Placed prominent dual-box node gusset plate assemblies at all 32 corner nodes (Front/Back, Outer/Inner), measuring **2.20 m** across (satisfying `~0.025*D`).
- **Pipe Runs:** Added **3 pipe runs** running along the inner face of the ring with diameters of **0.70 m** (radius = 0.35 m, satisfying `>= 0.008*D`).
- **Tri Count:** Optimally budgeted at **4192 triangles** (within the hard gate limit of 4500 tris).

### Verification & Render Verdict
- **Validation Check:** The headless TDD verification suite ran successfully:
  ```powershell
  & "C:\Program Files\Blender Foundation\Blender 5.1\blender.exe" -b --factory-startup -P tools/foundry/scenerygen/check_scenery.py
  ```
  *Exit code:* 0 (`SCENERY_CHECK_OK` printed).
- **Render Verdict:** Contact sheet views `neutral_close` and `zoom_out` were rendered and visually evaluated. 
  - **Verdict:** **PASSED**. At close distance, the X-bracing, double-box gussets, and thick pipes present an intricate, heavy-duty industrial aesthetic. At zoom-out distance (the critical player perspective), the gate reads exceptionally clearly as a massive, solid engineered ring structure, completely eliminating the previous "thin wireframe" look.

## REPAIR PASS 3 (TASTE FIX ROUND)

### Overview of Changes
Following `reports/K-TASTE-REVIEW.md` item b.2 feedback regarding container stack silhouette similarity, a taste-fix pass was executed on **July 20, 2026** targeting `tools/foundry/scenerygen/scenerygen.py` to differentiate the three container stack variants by outline rather than surface details alone.

### 1. scenery_container_stack_v01 (Corporate Locked Stack) — DISCIPLINED BASELINE
- Maintained as the disciplined, aligned rectangular grid baseline (symmetric 2-on-bottom, 1-on-top-center stack with locking clamps and seal frames).

### 2. scenery_container_stack_v02 (Port Mixed Stack) — TOPPLED 15° -> ACCEPTED
- **Toppled Container:** Top container (`2.0m x 4.6m x 2.0m`) toppled 15.0° (`Euler((15.0°, -4.0°, 5.0°))`) against the stack, creating an angled top profile that breaks the rectangular bounding silhouette.
- **Ratchet Strap Geometry:** Updated ratchet strap paths to wrap over the 15° tilted container top and anchor securely into the base container corners with added tensioner hardware blocks (`KitMat_Rubber` / `KitMat_Steel`).

### 3. scenery_container_stack_v03 (Scavenge Stack) — CANTILEVER 35% ON SKID PLATE -> ACCEPTED
- **Cantilever Overhang:** Top cut-open container (`1.8m x 4.2m x 1.8m`) cantilevered 35% (1.4 m overhang) past the lower stack edge (`center = Vector((1.15, 0.1, 2.7))`), creating a strong lateral asymmetry.
- **Skid Plate Deck:** Built a heavy steel skid plate deck (`1.9m x 4.0m x 0.12m`) with dual channel runners underneath the cantilevered unit (`KitMat_Steel`) supporting the overhang.

### Verification & Render Verdict
- **Validation Suite:**
  ```powershell
  & "C:\Program Files\Blender Foundation\Blender 5.1\blender.exe" -b --factory-startup -P tools/foundry/scenerygen/check_scenery.py
  ```
  *Exit code:* 0 (`SCENERY_CHECK_OK` printed, all silhouette variety checks and manifest validations passed).
- **Render Verification:**
  ```powershell
  python tools/foundry/render_contact_sheet.py --glb assets/ships/foundry/fleet_breadth_20260720/scenery/scenery_container_stack_v01.glb --glb assets/ships/foundry/fleet_breadth_20260720/scenery/scenery_container_stack_v02.glb --glb assets/ships/foundry/fleet_breadth_20260720/scenery/scenery_container_stack_v03.glb --out assets/ships/parts/revamp-evidence/fleet_breadth_foundry/renders/scenery --views neutral_close --fast
  ```
  *Exit code:* 0.
- **Visual Inspection:** Inspected rendered `neutral_close` thumbnails for all three variants.
  - **v01:** Disciplined, clean, symmetric rectangle.
  - **v02:** Distinct 15° angled top slope with binding ratchet straps.
  - **v03:** Asymmetric lateral overhang extending 35% past stack edge on steel skid plate.
  - **Verdict:** **PASSED**. The three variants are clearly distinguishable at 64 px thumbnail size by outline alone.



