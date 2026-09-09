<!-- Adversarial art review, round 1, 2026-08-06. Reviewer: grok (gpt-5.6-sol was unavailable —
     the installed codex CLI reports it "requires a newer version of Codex" and its own model
     refresh fails on an unknown reasoning-effort variant). Findings 1-3 were applied in the
     same session; the rest remain open. -->

# Lane furniture — adversarial review, round 1

1. **Fiction not implemented (worst first)**

1. **Tally post — wrong machine entirely.** Fiction: *“A 6 m tower on a 3 m square platform deck… Primary vertical is a 1.1 m diameter hexagonal drum… Bolted on: a boom arm 3.2 m long with a mass-sensor yoke (two pads like blunt tongs)… yoke pad one side worn concave, the other replaced with a flat unpainted plate… boom droops 8°… deck corner crumpled.”* Code: two portal legs + inward boxes + crossbeam (`build_tally_post` L193–207) — a fly-through gantry. Zero platform, hex scale house, boom, yoke, thermal hood, tag chain, soft-line, 8° droop, or crumpled deck.

2. **Cold locker — box fridge, not tick-on-wire.** Fiction: *“A 4 m hexagonal drum (face-to-face 1.8 m) mounted on a 9 m spine of lattice truss… root clamp and two outrigger legs (one often shorter)… drum at mid-spine so the mass hangs like a tick on a wire… hatch with three dogs… bond lamp ring… solar / trickle petal (one petal bent)… one lattice bay crushed inward… hatch dog replaced with a welded scrap bar; outrigger leg sheared and cabled.”* Code: `locker_body` cube 2.30×1.60×1.70 (L248), face door + lever + four foot clamps + four box fins (L246–267). No hex drum, lattice, mid-spine hang, dogs, ring, petal, crushed bay, scrap dog, or sheared/cabled leg.

3. **Lane pin — clean toothpick, not the specified corridor post.** Fiction: *“A 9 m vertical spine… 0.22 m diameter, planted in a 1.2 m hexagonal base drum (depth 0.8 m)… At 4 m and 7.5 m: two vane fins — thin plates 1.6 m long, 0.4 m deep — set at 120° with a third vane that is often not a fin at all: a flat unpainted repair plate… pass-side chevron housing (0.5 m)… speed band of three small lamps… Ref 44-C annex plate (0.3 × 0.2 m) on the drum… upper vane twisted 30°… speed-band middle lamp empty socket; annex plate half-sheared.”* Code: circular collar r=0.34×h=0.22 (L170), mast h=5.4 total ~6.55 m (L171), three identical vanes 1.05×0.05×0.60 at one z=4.30 (L173–177), three tip lenses + placard on mast (L179–182). No 9 m height, hex ballast drum, dual vane stations, repair plate, twist, chevron, speed band / empty socket, or drum annex shear.

4. **Whistle — tank with sticks, not Free build kit.** Fiction: *“2.2 m scavenged fuel drum (1 m diameter) clamped… with cargo straps and three unequal chains… 0.7 m jury mast of welded rebar and a lamp cluster in a shopping basket of wire… wide-band antenna bent from a survey paddle… hand crank… plaque… single boot… antenna S-curved… one chain replaced with polymer line; drum lid warped and held with a clamp.”* Code: tank r=0.62×h=1.55 (L218), two box straps (L220–221), three straight aerial cylinders (L223–230), one lens, cell pack, weld collar (L232–238). No 1 m×2.2 m drum, chains, rebar mast, wire basket, paddle antenna / S-curve, crank, name plaque, boot, polymer line, or warped lid clamp.

5. **Ash pin — plaque-on-slab, not lean spar memorial.** Fiction: *“A 3.5 m slender pin — often a cut spar… 1 m poured or foamed base… name plate (0.5 × 0.3 m)… single lamp in a cage… spar leaned by the explosion… plate half-melted on one corner; lamp cage empty more often than not; ballast chain one link wrong alloy.”* Code: upright plate 1.30×0.09×2.10 + fold (L278–281), short stem, foot, name plate 0.52×0.03×0.20, solid dead lamp cylinder, three cube tokens (L282–293). No slender 3.5 m spar, lean, 0.5×0.3 plate, empty cage, melt corner, streamers/helmet, or wrong-alloy chain.

6. **Claim mark — partial; listed bent/bolted pieces still absent.** Fiction: *“paint-marker nozzle… spare gel puck wired with tape to the flange… sometimes a faded flag streamer… paint nozzle… capped with slag… gel lamp in a caged housing.”* Code: flange + 2 bolts / 2 tear cylinders, hex shaft, capsule, Y-scaled torus, plate, solid cage cylinder + lens, tether torus (L120–160). No nozzle, slag cap, spare puck, streamer; “cage” is a bare cylinder (L151–152), not bars; “torn metal” is a raised scorch disc (L129–131), not a hole/lip in the flange.

---

2. **Generic box/cylinder at ~100 u — geometry that fixes it**

1. **`place_cold_locker`** — at distance: rounded rectangle. Fix: replace body with **hex drum** face-to-face **1.8 m**, height **~2.0–2.2 m**, center at z≈**4.5 m** on a **9 m** lattice spine (bay size ~0.45 m, one mid-bay faces **crushed inward 0.12–0.18 m**); **two outriggers** from root (leg B **0.7×** length of A, tip **cabled** with 2–3 segments); **hatch face** with **three dog levers** + **bond ring** (thin torus, major r≈hatch); **one solar petal** 0.4×0.15 m, bent **~25°**, on drum crown.

2. **`place_tally_post`** — at distance: thin H / goalpost. Fix: **3×3 m** deck (thickness **0.25 m**, grating: 4–6 cut voids or cross-bars); **hex scale house** diameter **1.1 m**, height **4 m** on deck center; **boom** 3.2×0.18×0.22 m from house at z≈**3.5 m**, rotated **−8°** pitch; **yoke** at boom tip: two pads **0.35×0.25×0.12 m**, pad A **concave** (inset hemisphere or thinner center), pad B **flat bare plate** 0.02 m thick; **1.5 m mast** + gold pulse on house crown.

3. **`place_lane_pin`** — at distance: needle + three fins (still a stick). Fix: **hex base drum** flat-to-flat **1.2 m**, height **0.8 m**; mast to **9 m**; vanes **1.6×0.05×0.4 m** at z=**4.0** and z=**7.5**; vane 2 = **bare repair plate** same envelope, unpainted; vane 0 at upper station **yaw +30°**; **chevron housing** 0.5×0.15×0.35 m on pass side mid-mast; **speed band** three 0.06 m sockets vertical, **middle empty** (hole only).

4. **`place_ash_pin`** — at distance: thin upright rectangle. Fix: **slender spar** r≈**0.06–0.08 m**, length **3.5 m**, **lean 10–15°**; **name plate** **0.5×0.03×0.3 m** bolted mid-spar, **one corner melted** (cut triangle ~0.12 m); **empty cage** (4–6 thin bars, no lens); **ballast chain** 4–5 links from foot, one link **scale 1.25×** / different radius.

5. **`place_whistle`** — at distance: fat can + three needles. Fix: drum **Ø1.0 m × 2.2 m**; **three unequal chains** (lengths 0.9 / 1.3 / 1.1 m, thicknesses 0.03 / 0.03 / **0.02 polymer**); **rebar mast** 0.7 m of 2–3 welded rods; **wire basket** (open box/frame 0.35 m) holding **2–3 lamp blobs**; **S-curve antenna** as 3-segment poly-cylinder from survey-paddle plate **0.45×0.08×0.02 m**; **boot** 0.28×0.12×0.12 m hanging off a chain.

6. **`place_claim_mark`** — least generic (spike+plate already breaks circle), still reads as **nail with bead** past ~150 u. Fix: **paint nozzle** blunt cone r=0.04→0.02, h=0.12 on capsule tip + **slag blob** 0.05 m; **flag streamer** 0.8×0.12×0.01 m ribbon from ring with mid-bend; **spare gel puck** Ø0.08×0.04 taped on flange; these give secondary offset mass off the vertical.

---

3. **Symmetric vs damaged mismatches**

1. **Lane pin is fully symmetric / factory-true** where fiction’s modeller form is damaged: third vane as **matched fin** (L173–177), no **30° twist**, no **empty speed-band socket**, no **half-sheared annex**. Code even asserts the opposite doctrine (L165–166, L172). Concord faction table wants legible annex and service, not matched tourist fins — and the physical-form block is the damage spec.

2. **Tally post is bilaterally symmetric gate** where fiction wants **one-sided boom silhouette**, **mismatched yoke pads**, **8° droop**, **one crumpled deck corner**. Repair sleeve on one leg (L206–207) is the only asymmetry and is not any of those.

3. **Cold locker is nearly bilateral** (door-centered box, four clamps, even fin row). Fiction wants **one short outrigger**, **one crushed lattice bay**, **one scrap dog**, **one bent petal** — all directional damage. One clamp angle (L261) is cosmetic noise, not the named failures.

4. **Ash pin is “bent” only via a small roof fold**, not the required **explosion lean of the spar**; plate is **rectangular intact**, not **half-melted**; lamp is **filled solid** (dead ceramic) rather than **empty cage** (missing more often than not). Wrong damage language: tidy memorial slab vs neglected lean iron.

5. **Claim mark** gets lean + crushed ring + two missing bolts mostly right; still **too clean** where fiction wants **slag-capped nozzle** and often-gone **spare puck**. Tears are **symmetric raised discs**, not **asymmetric torn flange holes**.

6. **Whistle** is asymmetrically staged but with the **wrong** damage set (tilted tank + random aerials) instead of **S-antenna, unequal chains, warped lid, polymer swap**. Asymmetry is present; **authored damage identity is not**.

---

4. **Triangle budget**

| Asset | Tris | Mis-spend |
|---|---|---|
| claim_mark | **616** | **Over:** `claim_antenna_ring` torus 18×6 + 14-vert capsule + 12-vert flange — ring alone can be 10 major / 4 minor. **Under:** zero tris on nozzle, cage bars, spare puck, streamer (the silhouette extras). |
| lane_pin | **328** | **Over:** 12-vert mast full height for a form that is wrong at root. **Under:** no tris on hex drum facets, dual vane rows, chevron, empty socket hole, half-shear cut. |
| tally_post | **264** | **Entire budget on wrong topology** (legs/heads/beam). **Under to zero:** platform grating, hex house, boom, yoke pads, bollards. |
| whistle | **256** | **Over:** 14-vert tank + three 6-vert poles that read as the same stick. **Under:** chains, basket, S-antenna segments, boot, plaque (high silhouette, low cost). |
| cold_locker | **208** | **Over-relative:** solid box door + 4 full clamp boxes + 4 fins. **Under:** lattice spine (the whole long silhouette) has **0** tris; no ring, dogs, petal. |
| ash_pin | **172** | **Over:** thick hull plate box as primary mass. **Under:** spar lean profile, empty cage bars, chain links, melt cut — all cheap, all absent. |

Rule of thumb failed: spend on **offset secondary silhouettes** (boom, vanes-at-two-heights, lattice, chains), not on **smooth prim resolution**.

---

5. **Missing from all six (pro lane clutter always has)**

**Grounded mount + readable identity as geometry.** None have a rock/embed interface that reads at 50–100 u (weld skirt / embed plug / clamp jaws biting a pad / ballast that implies plant depth — claim flange floats; locker clamps sit under a free box; pin collar is a thin washer). All “plates” are **blank slabs** with no **raised/stencil blocks**, **chevron cuts**, or **numeral bars** — so at chase distance they are grey rectangles, not corridor IDs. Pros always put **mount bite** and **ID/direction as mesh**, not only material color.

Also universal absence: **inter-part conduit/cable runs** (even 2–3 tube segments) that tie assemblies into one installed appliance rather than lego prims.

---

6. **Single highest-impact code change per asset**

1. **`build_tally_post`:** Delete the dual-leg gantry. Build: `box` deck 3×3×0.25 at z=0.125 with two bollard cyls; hex `cyl(..., verts=6)` scale house r=0.55 h=4 at z=2.25; `box` boom 3.2×0.2×0.22 from house at (1.6,0,3.2) with `rotation_euler=(0, radians(-8), 0)`; yoke = two end pads, pad1 inset/thinner, pad2 bare thin plate; mast 1.5 m + gold lens on roof.

2. **`build_cold_locker`:** Delete solid body/door/fin fridge. Build: lattice = 4–5 stacked `box` longerons + diagonal braces, height 9 m; hex drum r≈0.9 (flat-to-flat 1.8) at mid height; root clamp + outrigger A full / B 0.7× + cable segments on B; hatch face + 3 dog boxes + torus bond ring; one petal box bent 25°.

3. **`build_lane_pin`:** Hex drum flat-to-flat 1.2 h=0.8; mast depth such that tip z=9, r=0.11; vanes 1.6×0.05×0.4 at z=4.0 and 7.5; `pin_vane_2` role `furniture_bare_steel` and no aero taper; upper vane_0 `rotation_euler z += radians(30)`; add chevron box 0.5 m pass-side; speed band three cyls with middle omitted (or hole ring only); annex 0.3×0.2 on drum with one corner `box` shear cut / missing triangle.

4. **`build_whistle`:** Resize tank to r=0.5 h=2.2; replace aerial loop with: 0.7 m multi-rod mast, open basket + 2 lenses, one S-antenna (three parented cyls with cumulative bend) ending in paddle plate; three chain links of unequal length (third thinner, `furniture_painted_shell` as polymer); add plaque box + boot box hanging from a chain.

5. **`build_ash_pin`:** Replace wide `ash_hull_plate` as primary with spar `cyl` r=0.07 h=3.5, `rotation_euler=(radians(12),0,radians(-4))`; foot/base r=0.5 h=0.15; name plate 0.5×0.03×0.3 with one corner deleted (boolean or second cut box); lamp = 4 thin bar cyls in a cage, no lens mesh; 4–5 chain links from foot, one link scale 1.3.

6. **`build_claim_mark`:** Keep lean/crush/bolts; add paint nozzle (+slag blob) on capsule tip, spare gel puck + tape strip on flange, 3–4 cage bar cyls around lamp, and a thin streamer box from the ring with a mid-joint bend — kill torus major_segments from 18→10 if tris must stay ~400.
