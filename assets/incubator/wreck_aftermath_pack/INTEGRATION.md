# INTEGRATION — wreck & aftermath ecology pack

**Status: SOURCE ONLY.** GLBs under `source/`, evidence under `evidence/`. No release artifact, no
render package, no manifest row, no runtime edit, no spawn change. Because the pack adds no system,
no entity and no manifest entry, **it cannot move `check:baseline`** — there is no code path that
reaches it. Promotion belongs to whoever holds those paths.

- Fiction: [`design/fiction/THE_LONG_AFTERMATH.md`](../../../design/fiction/THE_LONG_AFTERMATH.md)
- Audit (what already exists, and why this doesn't duplicate it): [`evidence/EXISTING_COVERAGE.md`](evidence/EXISTING_COVERAGE.md)
- Generated catalog: [`evidence/KIT_CATALOG.md`](evidence/KIT_CATALOG.md) — do not hand-edit
- Machine record — **the only authoritative one**: [`evidence/build-report.json`](evidence/build-report.json)
- Builder: [`tools/blender/build_wreck_aftermath_pack.py`](../../../tools/blender/build_wreck_aftermath_pack.py)

**SUPERSEDED — do not read as current:** `evidence/build-report-liner.json`,
`evidence/build-report-corvette.json`, `evidence/build-report-ore_freighter.json`. These are per-family
intermediates written at 19:31, 19:41 and 19:45 on 2026-08-08; every final GLB was exported afterwards
(20:29:06 → 20:44:46) and `build-report.json` was written last, at 20:44:46.563. **13 of their 23 asset
hashes disagree with the bytes on disk**, and quoted envelopes have drifted — `wreck_liner_bow` is
recorded there as 69.07 × 26.77 × 25.76 m against an as-shipped 68.95 × 26.22 × 24.43 m. Every one of
the 37 hashes in `build-report.json` matches disk. Quote figures from `build-report.json` and from
nowhere else.

Rebuild:

```bash
blender --background --factory-startup --python tools/blender/build_wreck_aftermath_pack.py -- --render --distances --sheets --silhouettes --states --gaps --compositions
```

---

## 1 · What is here, and what is deliberately not

| Group | Built | Notes |
| --- | --- | --- |
| **Ore freighter** | 6 pieces + 3 state variants | Open ring-frame trunk. Navigable gap **inside** the hull. |
| **Patrol corvette** | 5 pieces + 2 state variants | Plated monocoque. Carries the `military` / restricted-salvage law. |
| **Passenger liner** | 5 pieces + 2 state variants | Pressure vessel. Outward decompression petal. |
| **Aftermath component kit** | 8 components | Authored TARGET 8–22 m against `WRECK_RADIUS = 9`; **3 of 8 ship outside it** (24.15–27.80 m). See the size-band breach table in §9. |
| **Shared fragment kit** | 6 fragments | One kit for all families, not one per family. |
| **Mining barge** | ✗ **not built** | Specified in fiction §5. |
| **Survey ship** | ✗ **not built** | Specified in fiction §5. |
| **Smuggler / pirate carrier** | ✗ **not built** | Specified in fiction §5. |

**On the three unbuilt hulls — stated plainly rather than buried.** The brief asks for six families.
Three are delivered and three are authored as specification only: they have identity, cause of death
and surviving-feature notes in fiction §5, but no geometry.

This was a deliberate trade, not an oversight. The first family cost roughly ten build/review cycles,
and seven of those were defects in the *fracture grammar* rather than in the freighter — a break
authored as a perimeter fringe on an open truss, a scorch mark burning into a hull section the
fracture had already removed, a navigable gap that measured 36 m against a 28 m player hull, drift
that inflated every exported envelope. Shipping three more hulls quickly would have meant shipping
them *through green automated checks but unlooked-at*, which is precisely how the two earlier
incubator packs accumulated their systemic defect classes.

The three built hulls were chosen to exercise **different fracture rules**, so the grammar is proven
rather than merely exercised three times:

| Hull | Structure | Grammar exercised | Fiction rule proven |
| --- | --- | --- | --- |
| Ore freighter | Open ring-frame trunk | `truss_break()` | §1.1 spine fails in a bay; §1.3 mass stays, area leaves |
| Corvette | Plated monocoque | `break_plane()` | §1.6 directional damage; §2 salvage-cut edge quality |
| Liner | Pressurised drum | outward petal | §1.2 pressure vessels rupture outward and stay attached |

Each remaining hull is now roughly one file section of authored dimensions against that proven
grammar. The barge is a freighter variant (boom root failure, cutter head as the heavy thing that
stayed); the survey ship is a liner variant (delicate wings shredded, lab module intact and sealed);
the carrier is the odd one out and needs the mismatched-plate treatment the `wrk_paint_mismatch_*`
roles already exist for.

---

## 2 · Mapping onto `wreckClasses.js` — the table that makes this consumable

[`src/data/wreckClasses.js`](../../../src/data/wreckClasses.js) already defines the taxonomy, and
[`aftermathWrecks.js`](../../../src/systems/aftermathWrecks.js) already assigns it at kill time. The
pack's state suffixes were authored to land on it rather than inventing a parallel vocabulary.

**The one subtlety: `military` is a provenance fact, not a state.** A military wreck can be fresh or
ancient. So it is carried as *hull identity* (the corvette family) rather than as a state suffix,
and it is the only class flagged `restricted: true`.

| `wreckClasses.js` id | Use this asset | Why |
| --- | --- | --- |
| `fresh` | `*__fresh` variants | Incandescent break metal, live arcing, hard vent jets, debris still close in |
| `battlefield` | base assets (state `cooling`) | Fires out or guttering, heat surviving only in thick sections |
| `ancient` | `*__derelict` variants | No heat, no light, no venting; paint chalked, insulation embrittled |
| `debris` | the **fragment kit** | The no-provenance default; TARGET 4–9 m pieces with no story attached (`frag_strut_shard` ships at 10.59 m — see §9) |
| `military` | **corvette family** (any state) | `restricted: true`. `wreck_corvette_forward__stripped_heavy` is evidence of the crime, not a scrap story |

Report entries for corvette assets carry `"wreckClass": "military"` and `"restricted": true`
directly, so a promotion lane can key off the JSON rather than off filename convention.

---

## 3 · Honest integration story

**The component kit has a real consumer today; the hero hulls do not.**

- [`visualFactory.js:2887`](../../../src/render/visualFactory.js:2887) builds every runtime
  `type: 'wreck'` entity **procedurally**, driven off `entity.radius`, which
  [`aftermathWrecks.js:23`](../../../src/systems/aftermathWrecks.js:23) pins at `WRECK_RADIUS = 9`.
  The eight aftermath components TARGET 8–22 m precisely so they are a **drop-in
  replacement candidate** for that procedural output. **Three missed that target** —
  `aft_weapon_spar` 27.80 m, `aft_engine_section` 24.68 m, `aft_radiator_panel` 24.15 m — so the
  drop-in claim does not currently hold for those three, and the size-band breach table in §9
  governs over this paragraph. Making the swap is a separate, consented
  change — it touches a live render path and is not part of this delivery.
- The three hero families are a **new size class (60–200 m) with no current runtime consumer**.
  Nothing spawns them today. The nearest existing hook is the `landmarkGlb` field used in
  [`sectorAnchors.js`](../../../src/data/sectorAnchors.js), which currently points anonymous
  `place_dead_hulk` / `place_debris_chunk` at every wreck POI in the game. Pointing those at
  class-identifiable hulls instead is the obvious first use, and is also a separate change.

**Not touched, by explicit instruction:** the Wreck Cathedral, `place_dead_hulk`,
`place_debris_chunk`, their render packages, and every live wreck manifest. No path, material name
or node name in this pack collides with them — pack materials all carry the `wrk_` prefix. See
`EXISTING_COVERAGE.md` §1 for the per-asset audit.

---

## 4 · Sockets and interaction points

Named empties, following the convention already in the leased assets (`place_dead_hulk` ships
`SOCKET_Hazard_Core` / `SOCKET_Salvage_Core`; the Cathedral ships `INTERACTION_HangarCavity`), so a
promotion lane can read them with code it already has.

| Prefix | Meaning |
| --- | --- |
| `SOCKET_Salvage_*` | Where a salvage action attaches. Named by what is actually there (`_Drive`, `_Ore`, `_Radiator`, `_Weapon`, `_Hab`, `_Cargo`, `_Collar`). |
| `SOCKET_Hazard_*` | Reactor, break face, volatile tankage, decompression wound. |
| `SOCKET_BlackBox` | The evidence socket. Pairs with `encounterFingerprint` / `provenance` in `aftermathWrecks.js`. |
| `SOCKET_Evidence_*` | Registry marks and manifests — readable identity rather than salvage value. |
| `INTERACTION_*` | Navigable volume. Carries a measured clear radius. |

**Socket survival is verified, not assumed.** Childless empties are exactly the thing an exporter
drops silently, so `verify_sockets()` re-parses each exported GLB and asserts every authored socket
name is present as a node. `build-report.json` records `socketFailures`; the shipped build has none.

---

## 5 · VFX recommendations (damaged lights, venting, fire)

Everything in this pack is **authored geometry with emissive materials** — no particle systems, no
shaders, no runtime VFX. That is deliberate for a source-only drop, but it means a promotion lane
inherits a set of anchor points rather than a set of effects. What the geometry marks, and what a
real VFX pass should replace or augment:

| Authored as | Where to find it | Recommended runtime treatment |
| --- | --- | --- |
| **Venting** — sphere sprays tapering along a direction (`*_vent_*`) | Always at a breach, never on intact plating. `SOCKET_Hazard_Wound`, `SOCKET_Hazard_Break` | Particle emitter along the authored axis. Hard straight jet for `fresh` (pressure remains), slow drift for `cooling`, **absent** for `derelict` |
| **Internal fire** — occluded spheres (`*_fire_*`) | Inside holds and reactor cavities; visible only through a breach or an open hatch | Flickering light + emissive billboard. Must stay occluded — a fire you can see all of is a lamp |
| **Electrical arcing** — tiny spheres at severed conduit ends (`*_arc_*`) | `conduit_stubs(..., live=...)` output | Intermittent arc flash. Keep it the smallest screen area and the highest intensity in the scene |
| **Cooling cracks** — dull red seams following frames (`*_crack_*`) | Traced along real spine / ring / chord lines | Slow pulse, or a temperature gradient fading over the wreck's lifetime |
| **Emergency lighting** — sparse amber/red spheres (`*_emerg*`) | Two or three per hull, never a runway | Slow blink, failing. Off entirely for `derelict` — a derelict with a working light has been *staffed*, which is a different story |
| **Drifting particulate** | Not authored | Add per state: dense for `fresh`, none for `derelict` |

The state ladder is a **light budget**: `fresh` spends all of it, `derelict` spends none. The
`STATE_SUBS` table in the builder already encodes which emissive roles are deleted rather than
recoloured at each rung, and that table is the spec a runtime VFX profile should mirror.

---

## 6 · Collision proxies

Every report entry carries a `collisionProxy` block.

- **Hero primaries and secondaries → compound box, one per named section.** A single AABB around
  `wreck_ore_freighter_bow` would seal the ribcage corridor that is the whole point of the asset.
  Any proxy that closes an `INTERACTION_*` volume is wrong.
- **Debris, components, fragments → one box.** These have no interior.
- The freighter's corridor and the liner's drum bore must remain **open** in the proxy. Their
  measured clear radii are in `build-report.json` under `gaps[]` (see §7).

---

## 7 · Measured claims (nothing here is eyeballed)

Three assertions run on every build and are recorded per asset:

1. **Navigable gap** — `gaps[].clearSpanM`. Exact distance from the probe to the nearest mesh
   *surface* (`closest_point_on_mesh`, not bounding boxes — a bounding-box test is useless for a ring
   frame, where the probe sits inside the AABB while being 24 m clear of the metal). Player hull is
   28 m; the pack requires **≥ 40 m clear span**.

   It failed three times, and every failure was a real defect:
   - Freighter at **36.1 m** — bay bracing routed straight through the ring bore. Fixed structurally
     (bracing moved to dorsal and ventral runs outside the bore).
   - Freighter at **39.4 m** — 0.6 m of bulkhead plate eating the margin. Fixed dimensionally
     (hoppers 28 m → 26 m, so the bay a hopper is torn out of genuinely clears).
   - Liner at **18.5 m** — the drum's shell panels had their width and thickness axes swapped, so
     each "panel" was a radial fin spearing 6 m into the bore. **No render would have caught this**:
     from outside, a drum of radial fins looks exactly like a drum. Fixed, plus the interior decks,
     fire and three emergency lamps that were also sitting in the flight path.
2. **Socket survival** — re-parsed out of the exported GLB, per §4.
3. **Floating marks** — `floatingMarks[]`. Every scorch, crack and lamp must be within 2 m of real
   structure. This caught a burn trail authored onto a hull section the fracture had already removed
   (a mark burning into vacuum), an emergency lamp 12.7 m off the hull, two cooling cracks tracing
   no structural line at all, and two liner lamps hanging in mid-room — one of them in a sector the
   decompression had torn away entirely. Numbers alone did not catch any of them; neither did a wide
   review render.

Renders are **fault-tolerant**: a full pass writes ~170 PNGs over about a quarter of an hour on a
checkout a concurrent writer touches regularly, and one Windows file lock used to raise
`cannot save: <path>` and discard the entire build — every GLB and every measurement with it. Frames
now retry and then record into `renderFailures[]` rather than aborting.

`build-report.json` also records builder SHA-256, Blender version, exporter generator, per-asset
GLB SHA-256 and the canonical full-build command. There is **no RNG anywhere in the builder** —
every dimension, break, drift and state is authored — but byte-reproducibility still requires two
full builds under one pinned toolchain, which has not been done.

---

## 8 · Drift is staging metadata, not baked geometry

Separated sections ship **centred on their own origin**. The drift — how far the section travelled
from its break plane and how it tumbled — is recorded as data (`drift.offsetM`, `tumbleAxis`,
`tumbleDeg`) alongside `shipFrameOriginM`, the piece's position in the intact vessel.

A composition lane reconstructs the scene as `shipFrameOriginM + drift.offsetM`, rotated by the
tumble. `evidence/composition-<family>.png` is that reconstruction, and it is the **only** place
fiction §1.4 can be judged: a per-asset render cannot show whether a section drifted *away from the
break it tore off at*, and a per-asset envelope inflated by a drift offset is simply a wrong number.

The first build baked drift into geometry and reported a 130 m stern section as 175 × 162 × 143 m.

---

## 9 · Known gaps and open work

**Size-band breaches — eight assets ship outside the bands these two documents commit to.** Measured
longest dimension, read from `build-report.json` `sizeM`:

| Asset | Kit | Band committed | Measured longest | Over by |
| --- | --- | --- | --- | --- |
| `aft_weapon_spar` | component | 8–22 m (§1, §3) | **27.80 m** | +5.80 |
| `aft_engine_section` | component | 8–22 m (§1, §3) | **24.68 m** | +2.68 |
| `aft_radiator_panel` | component | 8–22 m (§1, §3) | **24.15 m** | +2.15 |
| `frag_strut_shard` | fragment | 4–9 m (§2) | **10.59 m** | +1.59 |
| `deb_ore_freighter_ring_span` | debris | 8–22 m (`EXISTING_COVERAGE.md` §1) | **53.25 m** | +31.25 |
| `deb_ore_freighter_hopper_lid` | debris | 8–22 m (`EXISTING_COVERAGE.md` §1) | **31.56 m** | +9.56 |
| `deb_liner_hull_panel` | debris | 8–22 m (`EXISTING_COVERAGE.md` §1) | **28.70 m** | +6.70 |
| `deb_corvette_armor_belt` | debris | 8–22 m (`EXISTING_COVERAGE.md` §1) | **22.53 m** | +0.53 |

**The debris breach also breaks the argument the audit rests on.** `EXISTING_COVERAGE.md` §1 justifies
building beside `place_debris_chunk` on the grounds that this pack's debris is *deliberately authored
smaller* than it. Two pieces are not: `deb_ore_freighter_hopper_lid` (31.56 m) and
`deb_ore_freighter_ring_span` (53.25 m) both exceed even the 30.8 m envelope that audit itself records
for `place_debris_chunk`.

**How this shipped: both documents are older than the assets they describe.** INTEGRATION.md's own
mtime is 20:36:10. All eight `aft_` components (20:38:45 → 20:41:55) and all six `frag_` fragments
(20:42:24 → 20:44:14) were exported *after* it — so it predates every asset in the two kits whose
bands it states, along with 25 of the 37 GLBs (20:36:53 → 20:44:46) and `build-report.json` itself
(20:44:46.563). `EXISTING_COVERAGE.md` (18:00:03) predates the entire build, all 37 GLBs included, and
it is the document that states the debris band. The two hand-authored files a promotion lane reads
first are the only two artifacts in the pack that never saw the shipped numbers; `build-report.json`
and `KIT_CATALOG.md` are written at the end of the build and do carry the as-shipped figures. Treat
the bands above as unreviewed intent, not as verified fact — and note that no automated check asserts
them (`build-report.json` records `socketFailures`, `gapFailures`, `floatingMarkFailures` and
`renderFailures`, and nothing for size), which is why the build stayed green.

**Remaining open work:**

- **Corvette has no asset-internal navigable gap.** A 74 m hull with a 14 m beam physically cannot
  contain a 40 m clear span. Its flyable opening is the lance-cut channel *between* the forward and
  engine sections at their authored drift — a composition property, not an asset property. It is
  therefore **not** claimed in `gaps[]` for any corvette asset, and no corvette asset carries an
  `INTERACTION_*` socket. Measuring composition-level gaps is unimplemented.
- **LOD1/LOD2 not authored.** Every asset is LOD0 only. The leased assets ship LOD0/1/2; promotion
  will need the same.
- **1,891 unmerged authoring primitives — a draw-load promotion blocker this list previously omitted
  entirely.** The 37 GLBs contain 1,891 meshes, one node and one draw per authoring primitive: nothing was
  merged after authoring, there is no LOD chain (above), and there is no instancing — `extensionsUsed`
  across the whole pack is `KHR_materials_emissive_strength` and nothing else. The 178 m
  `wreck_ore_freighter_bow` alone carries **208 meshes against `place_dead_hulk`'s 18**, and its
  `__fresh` variant 211. Triangle counts are modest (the same hull is 5,492 tris), so this is a
  submission-cost problem rather than a fill problem — which is exactly the kind that a tris-only
  budget check passes. Merging by material, then LODs, then instancing for the fragment and debris
  kits, is prior work to any spawn wiring.
- **No texture data at all, so KTX2 / Meshopt is not yet the applicable step.** Every one of the 37
  GLBs parses to `images: 0` and `textures: 0` — the pack is untextured material colour and emissive
  throughout. The three assets it benchmarks itself against all carry embedded images:
  `place_dead_hulk` 21, `place_debris_chunk` 21, `place_landmark_wreck_cathedral` 26. Texture
  compression is a promotion step only once textures exist; authoring them is the missing step before
  it. The previous wording here — "No KTX2 / Meshopt" — implied uncompressed textures rather than none.
- **No external adversarial review.** Self-review only, same blocker as the npc-activity and
  everyday-space packs.
- **Emissive screen-share is unmeasured.** The salmon-washout problem was fixed twice from opposite
  directions (emissive value, then review-key exposure, then large-area paint value). An asserted
  invariant — arcing owns the least screen area and the highest strength — would stop that recurring
  on the three unbuilt hulls.
- **Fire occlusion is unasserted.** `check_attachment` catches a mark floating off structure; it does
  not catch the opposite failure, which this pack hit twice: fire fully enclosed and therefore never
  visible. Both freighter fires were invisible until a hopper side was breached. The rule wanted is
  "some rays blocked, some clear".
- **Full G0–G7 acceptance was never claimed.** The three assertions in §6 are what ran.
