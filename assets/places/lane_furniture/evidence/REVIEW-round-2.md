<!-- Adversarial art review, round 2, 2026-08-06. Reviewer: codex gpt-5.6-sol at xhigh reasoning,
     after upgrading the CLI 0.130.0-alpha.5 -> 0.146.1 and removing two invalid keys from
     ~/.codex/config.toml that aborted config load. Findings on environment bite, connected
     members and the misleading render framing were applied in the same session. -->

# Lane furniture — adversarial review, round 2 (codex gpt-5.6-sol)

1. Round-one findings falsely closed, worst first:

   1.1. **Tally post:** Round one required “**grating: 4–6 cut voids or cross-bars**” and a yoke pad “**concave (inset hemisphere or thinner center)**.” Current code builds a solid slab, lays decorative bars on top, and adds a convex puck:

   ```python
   put(box('tally_deck', (3.0, 3.0, 0.25), ...))
   put(box(f'tally_grate_{i}', (2.6, 0.12, 0.28), ...))
   put(cyl('tally_yoke_wear_cup', 0.11, 0.06, ...))
   ```

   Nothing is cut, open, or concave. The “crumpled” corner is another box laid under the intact deck. The yoke pads have no arms connecting them to the boom. The specified bollards, cable tray, missing covers, yoke-mounted thermal hood, and soft-line remain absent.

   1.2. **Cold locker:** Round one required a “**9 m lattice spine … one mid-bay faces crushed inward**.” Current code explicitly abandons the lattice:

   ```python
   # Rungs, not diagonals.
   span = 0.30 if i == crushed else 0.44
   put(box(f'locker_rung_{i}', (span, 0.045, 0.045), ...))
   ```

   That is a ladder with one short rung, not a triangulated truss with a displaced structural node. The specified 4 m drum was wrongly reduced to 2.05 m:

   ```python
   put(cyl('locker_drum', 0.90, 2.05, ...), ...)
   ```

   Its claimed 1.8 m face-to-face dimension is also false: a six-sided cylinder with radius `0.90` measures only `1.559 m` across flats. The “sheared” outrigger remains an intact short rod, and its cable is three disconnected cylinders.

   1.3. **Whistle:** Round one ordered “**one S-antenna (three parented cyls with cumulative bend)**” and three unequal hanging chains. Current antenna segments are independently positioned rods:

   ```python
   seg = ((0.58, 0.16, 2.66, 0.34), ...)
   a = put(cyl(..., (sx, sy, sz), ...), ...)
   a.rotation_euler = (bend, math.radians(24), 0)
   ```

   They neither share endpoints nor accumulate transforms; the render shows them floating above the drum. The “chains” are solid four-sided cylinders, not links, and their centers follow the same hard-coded path regardless of the claimed chain length. The boot therefore hangs from nothing. Four vertical bars without a bottom or rim do not make a shopping basket.

   1.4. **Ash pin:** Round one required the melted corner to be “**deleted (boolean or second cut box)**.” Current code adds material instead:

   ```python
   melt = put(box('ash_plate_melt_corner', ...), 'furniture_scorch', r)
   ```

   The name plate remains an intact rectangle with a floating brown square beside it. The five supposed chain links are capped cylinders, not open links. Cage, plate, and cut-end transforms are hand-guessed in world space rather than attached to the leaned spar, producing visibly detached pieces.

   1.5. **Lane pin:** Round one required the middle speed lamp to be an “**empty socket (hole only)**.” Current code fills it with a capped black cylinder:

   ```python
   put(cyl('pin_speed_socket_empty', 0.062, 0.10, ...),
       'furniture_scorch', r)
   ```

   The “half-sheared” annex is merely a pristine half-width rectangle:

   ```python
   put(box('pin_annex_plate_sheared', (0.16, 0.03, 0.20), ...), ...)
   ```

   There is no torn edge, surviving fastener, or hanging half. The base claimed as 1.2 m across flats uses `radius=0.60`, yielding only `1.039 m`.

   1.6. **Claim mark:** Round one explicitly said “**‘torn metal’ is a raised scorch disc, not a hole/lip in the flange**.” The current code is still exactly that raised disc:

   ```python
   put(cyl(f'claim_tear_{i}', 0.055, 0.014, ...),
       'furniture_scorch', r)
   ```

   The flange remains unbroken underneath it. The claim plate is still blank, and the four parallel bars around the lamp have no end rings or bracket defining a cage.

2. New faults round one missed:

   2.1. **Assemblies are not mechanically connected.** Whistle antenna and chains, tally yoke pads, ash-pin memorial pieces, and cold-locker cable segments visibly float. The builder places disconnected primitives by approximate coordinates instead of defining endpoints, brackets, pivots, or shared local assemblies.

   2.2. **Hex dimensions misuse Blender’s cylinder radius.** A six-vertex cylinder’s `radius` is its circumradius, not half its across-flat measurement. The claim shaft is `0.242 m` rather than `0.28 m` across flats; the lane-pin base is `1.039 m` rather than `1.2 m`; the cold-locker drum is `1.559 m` rather than `1.8 m`. Use `radius = flat_to_flat / (2 * cos(pi / 6))`.

   2.3. **Every non-lens material is incorrectly forced metallic:**

   ```python
   bsdf.inputs['Metallic'].default_value = (
       0.0 if role == 'furniture_signal_lens' else 0.85
   )
   ```

   Painted shell, tape/polymer, soot/scorch, and coated identity plates consequently share the same metal response. The role table is mostly recoloring one shader, not six substances.

   2.4. **There is no authored edge language anywhere.** `box()` emits untouched razor-edged cubes; cylinders retain default faceting; no bevel family, hard-edge policy, or smooth-by-angle operation exists. At 20–50 units these read as raw DCC primitives, while at 100 units their blank rectangular sections dominate.

   2.5. **The evidence conceals the actual distance problem.** `setup_render()` scales camera distance from each asset’s own maximum dimension, making every prop large in frame. The 900×900 closeups contain no matched 20/100/300-unit views, so small “fixes” such as 16 mm cables, 14 mm cage bars, tiny dogs, and 30 mm chain fragments have never been shown to survive gameplay projection.

3. Generic-primitive reads at 100 units and the geometry required:

   3.1. **Tally post:** reads as a hexagonal pillar with a rectangular shelf. Replace the blank boom with a tapered two-section arm rooted in a clevis; join both pads with visible yoke arms; move the hood over that yoke; replace the deck slab with a perimeter frame and spaced load-bearing grate bars.

   3.2. **Cold locker:** reads as a brown box threaded onto a ladder, with a glowing torus pasted on its face. Make the drum a correctly dimensioned 4 m hex pressure body with end shoulders and a rear cradle; replace rungs with alternating diagonal braces; crush one bay by moving a rail node inward and reconnecting its braces to that displaced node.

   3.3. **Whistle:** reads as a barrel with loose hairs. Build the mast, basket, antenna, straps, chains, and boot as connected silhouettes: shared endpoints, sag or alternating open links, a closed basket frame, and a visibly clamped antenna root.

   3.4. **Lane pin:** reads as a pole carrying six rectangular planks. Replace the vane boxes with tapered or notched plate profiles, make the repair plate an irregular raw-edged trapezoid with bolt ears, clock the upper station differently from the lower, and build the pass chevron as a projecting V-shaped housing instead of two boxes.

   3.5. **Ash pin:** reads as a leaning rod on a polygon puck. Attach the notched name plate through an offset two-arm bracket, build a complete empty cage with top/bottom rings, and add one broad hanging silhouette—helmet ring, wire of fasteners, or torn streamer—from the spar rather than floating beside it.

   3.6. **Claim mark:** reads as a nail with a can and ribbon. Replace the capsule cylinder with a stepped faceted case—shaft shoulder, wider radio body, narrowed neck, recessed nozzle—and cut a real torn bolt opening into an irregular flange with an embed skirt or rock-biting tabs.

4. Missing from all six is professional installation logic: a credible environment bite, manufactured joints between primary and secondary masses, and screen-scale identity geometry. Round one already named “**grounded mount + readable identity as geometry**,” but every identity plate remains a blank cuboid, the chevron is a rectangular light, and every root terminates in a clean cylinder or slab rather than an embed plug, welded skirt, clamp jaw, ballast frame, or rock interface. None has a consistent medium-width edge family either. These omissions leave scale, ownership, orientation, and load path dependent on color or prose.

5. Single highest-impact remaining code instruction per asset:

   5.1. **`build_tally_post`:** delete `tally_boom`, both yoke-pad meshes, and `tally_yoke_wear_cup`; rebuild them as one connected tapered boom–clevis–U-yoke assembly with a genuinely hollow concave pad and hood over the pads.

   5.2. **`build_cold_locker`:** replace the rail/rung/drum block with a 4 m drum using `radius=1.8/(2*cos(pi/6))`, mounted in a rear cradle on a diagonally braced spine whose crushed bay shares one displaced node.

   5.3. **`build_whistle`:** replace `whistle_chain_*` and `whistle_antenna_s_*` with an endpoint-driven beam/curve helper so every segment physically meets the next and terminates at a modeled clamp, basket, boot, or ground anchor.

   5.4. **`build_lane_pin`:** replace all six `box('pin_vane_*')` calls with a custom plate-profile mesh that gives the normal vanes tapered trailing edges and the repair vanes torn edges plus bolt tabs.

   5.5. **`build_ash_pin`:** create one `ash_lean_root` at the base pivot and parent the spar, name-plate bracket, empty cage, cut end, and hanging offering to it using local coordinates; remove every hand-authored sine-offset placement.

   5.6. **`build_claim_mark`:** replace `claim_tick_capsule` with a three-station faceted loft that visibly integrates the shaft shoulder, radio case, antenna support, and recessed slagged nozzle.


tokens used
152,482
1. Round-one findings falsely closed, worst first:

   1.1. **Tally post:** Round one required “**grating: 4–6 cut voids or cross-bars**” and a yoke pad “**concave (inset hemisphere or thinner center)**.” Current code builds a solid slab, lays decorative bars on top, and adds a convex puck:

   ```python
   put(box('tally_deck', (3.0, 3.0, 0.25), ...))
   put(box(f'tally_grate_{i}', (2.6, 0.12, 0.28), ...))
   put(cyl('tally_yoke_wear_cup', 0.11, 0.06, ...))
   ```

   Nothing is cut, open, or concave. The “crumpled” corner is another box laid under the intact deck. The yoke pads have no arms connecting them to the boom. The specified bollards, cable tray, missing covers, yoke-mounted thermal hood, and soft-line remain absent.

   1.2. **Cold locker:** Round one required a “**9 m lattice spine … one mid-bay faces crushed inward**.” Current code explicitly abandons the lattice:

   ```python
   # Rungs, not diagonals.
   span = 0.30 if i == crushed else 0.44
   put(box(f'locker_rung_{i}', (span, 0.045, 0.045), ...))
   ```

   That is a ladder with one short rung, not a triangulated truss with a displaced structural node. The specified 4 m drum was wrongly reduced to 2.05 m:

   ```python
   put(cyl('locker_drum', 0.90, 2.05, ...), ...)
   ```

   Its claimed 1.8 m face-to-face dimension is also false: a six-sided cylinder with radius `0.90` measures only `1.559 m` across flats. The “sheared” outrigger remains an intact short rod, and its cable is three disconnected cylinders.

   1.3. **Whistle:** Round one ordered “**one S-antenna (three parented cyls with cumulative bend)**” and three unequal hanging chains. Current antenna segments are independently positioned rods:

   ```python
   seg = ((0.58, 0.16, 2.66, 0.34), ...)
   a = put(cyl(..., (sx, sy, sz), ...), ...)
   a.rotation_euler = (bend, math.radians(24), 0)
   ```

   They neither share endpoints nor accumulate transforms; the render shows them floating above the drum. The “chains” are solid four-sided cylinders, not links, and their centers follow the same hard-coded path regardless of the claimed chain length. The boot therefore hangs from nothing. Four vertical bars without a bottom or rim do not make a shopping basket.

   1.4. **Ash pin:** Round one required the melted corner to be “**deleted (boolean or second cut box)**.” Current code adds material instead:

   ```python
   melt = put(box('ash_plate_melt_corner', ...), 'furniture_scorch', r)
   ```

   The name plate remains an intact rectangle with a floating brown square beside it. The five supposed chain links are capped cylinders, not open links. Cage, plate, and cut-end transforms are hand-guessed in world space rather than attached to the leaned spar, producing visibly detached pieces.

   1.5. **Lane pin:** Round one required the middle speed lamp to be an “**empty socket (hole only)**.” Current code fills it with a capped black cylinder:

   ```python
   put(cyl('pin_speed_socket_empty', 0.062, 0.10, ...),
       'furniture_scorch', r)
   ```

   The “half-sheared” annex is merely a pristine half-width rectangle:

   ```python
   put(box('pin_annex_plate_sheared', (0.16, 0.03, 0.20), ...), ...)
   ```

   There is no torn edge, surviving fastener, or hanging half. The base claimed as 1.2 m across flats uses `radius=0.60`, yielding only `1.039 m`.

   1.6. **Claim mark:** Round one explicitly said “**‘torn metal’ is a raised scorch disc, not a hole/lip in the flange**.” The current code is still exactly that raised disc:

   ```python
   put(cyl(f'claim_tear_{i}', 0.055, 0.014, ...),
       'furniture_scorch', r)
   ```

   The flange remains unbroken underneath it. The claim plate is still blank, and the four parallel bars around the lamp have no end rings or bracket defining a cage.

2. New faults round one missed:

   2.1. **Assemblies are not mechanically connected.** Whistle antenna and chains, tally yoke pads, ash-pin memorial pieces, and cold-locker cable segments visibly float. The builder places disconnected primitives by approximate coordinates instead of defining endpoints, brackets, pivots, or shared local assemblies.

   2.2. **Hex dimensions misuse Blender’s cylinder radius.** A six-vertex cylinder’s `radius` is its circumradius, not half its across-flat measurement. The claim shaft is `0.242 m` rather than `0.28 m` across flats; the lane-pin base is `1.039 m` rather than `1.2 m`; the cold-locker drum is `1.559 m` rather than `1.8 m`. Use `radius = flat_to_flat / (2 * cos(pi / 6))`.

   2.3. **Every non-lens material is incorrectly forced metallic:**

   ```python
   bsdf.inputs['Metallic'].default_value = (
       0.0 if role == 'furniture_signal_lens' else 0.85
   )
   ```

   Painted shell, tape/polymer, soot/scorch, and coated identity plates consequently share the same metal response. The role table is mostly recoloring one shader, not six substances.

   2.4. **There is no authored edge language anywhere.** `box()` emits untouched razor-edged cubes; cylinders retain default faceting; no bevel family, hard-edge policy, or smooth-by-angle operation exists. At 20–50 units these read as raw DCC primitives, while at 100 units their blank rectangular sections dominate.

   2.5. **The evidence conceals the actual distance problem.** `setup_render()` scales camera distance from each asset’s own maximum dimension, making every prop large in frame. The 900×900 closeups contain no matched 20/100/300-unit views, so small “fixes” such as 16 mm cables, 14 mm cage bars, tiny dogs, and 30 mm chain fragments have never been shown to survive gameplay projection.

3. Generic-primitive reads at 100 units and the geometry required:

   3.1. **Tally post:** reads as a hexagonal pillar with a rectangular shelf. Replace the blank boom with a tapered two-section arm rooted in a clevis; join both pads with visible yoke arms; move the hood over that yoke; replace the deck slab with a perimeter frame and spaced load-bearing grate bars.

   3.2. **Cold locker:** reads as a brown box threaded onto a ladder, with a glowing torus pasted on its face. Make the drum a correctly dimensioned 4 m hex pressure body with end shoulders and a rear cradle; replace rungs with alternating diagonal braces; crush one bay by moving a rail node inward and reconnecting its braces to that displaced node.

   3.3. **Whistle:** reads as a barrel with loose hairs. Build the mast, basket, antenna, straps, chains, and boot as connected silhouettes: shared endpoints, sag or alternating open links, a closed basket frame, and a visibly clamped antenna root.

   3.4. **Lane pin:** reads as a pole carrying six rectangular planks. Replace the vane boxes with tapered or notched plate profiles, make the repair plate an irregular raw-edged trapezoid with bolt ears, clock the upper station differently from the lower, and build the pass chevron as a projecting V-shaped housing instead of two boxes.

   3.5. **Ash pin:** reads as a leaning rod on a polygon puck. Attach the notched name plate through an offset two-arm bracket, build a complete empty cage with top/bottom rings, and add one broad hanging silhouette—helmet ring, wire of fasteners, or torn streamer—from the spar rather than floating beside it.

   3.6. **Claim mark:** reads as a nail with a can and ribbon. Replace the capsule cylinder with a stepped faceted case—shaft shoulder, wider radio body, narrowed neck, recessed nozzle—and cut a real torn bolt opening into an irregular flange with an embed skirt or rock-biting tabs.

4. Missing from all six is professional installation logic: a credible environment bite, manufactured joints between primary and secondary masses, and screen-scale identity geometry. Round one already named “**grounded mount + readable identity as geometry**,” but every identity plate remains a blank cuboid, the chevron is a rectangular light, and every root terminates in a clean cylinder or slab rather than an embed plug, welded skirt, clamp jaw, ballast frame, or rock interface. None has a consistent medium-width edge family either. These omissions leave scale, ownership, orientation, and load path dependent on color or prose.

5. Single highest-impact remaining code instruction per asset:

   5.1. **`build_tally_post`:** delete `tally_boom`, both yoke-pad meshes, and `tally_yoke_wear_cup`; rebuild them as one connected tapered boom–clevis–U-yoke assembly with a genuinely hollow concave pad and hood over the pads.

   5.2. **`build_cold_locker`:** replace the rail/rung/drum block with a 4 m drum using `radius=1.8/(2*cos(pi/6))`, mounted in a rear cradle on a diagonally braced spine whose crushed bay shares one displaced node.

   5.3. **`build_whistle`:** replace `whistle_chain_*` and `whistle_antenna_s_*` with an endpoint-driven beam/curve helper so every segment physically meets the next and terminates at a modeled clamp, basket, boot, or ground anchor.

   5.4. **`build_lane_pin`:** replace all six `box('pin_vane_*')` calls with a custom plate-profile mesh that gives the normal vanes tapered trailing edges and the repair vanes torn edges plus bolt tabs.

   5.5. **`build_ash_pin`:** create one `ash_lean_root` at the base pivot and parent the spar, name-plate bracket, empty cage, cut end, and hanging offering to it using local coordinates; remove every hand-authored sine-offset placement.

   5.6. **`build_claim_mark`:** replace `claim_tick_capsule` with a three-station faceted loft that visibly integrates the shaft shoulder, radio case, antenna support, and recessed slagged nozzle.
