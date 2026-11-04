# Lantern Ward — authored civic machinery and shore

Date: 2026-11-04. This is the art integration contract for the first Empty Plinth
slice, not a claim that the whole LW-A1 or LW-01 catalog is complete.

## Delivered source and mount

`src/render/lanternWardVisuals.js` is the editable, reproducible production source
for the cradle, family lamp, family receiver, fallen mast, repair shutter,
service-cut cheek and shore-spine segment. Blender is not installed on this
execution host. The commission's authored-geometry alternative is used: these
are deliberately generated production bodies with Ward authorship ID
`lantern-ward-authored-civic-v1`. The canonical procedural factory marker owns
opening admission; the Ward ID is retained in separate metadata.
No external model, texture or generated picture is used.

`src/data/lanternWardLayout.js` owns the shared geometry contract: exact dimensions,
body envelopes, local box proxies, sockets, live-memorial-relative offsets and
reuse placements. `createVisualFactory().build(entity)` mounts
`buildLanternWardVisual(entity)` before generic type selection. The renderer's
existing entity poses, frame membrane, culling, lighting and lifetime remain in
charge. No render loop or timer was added. Runtime/custody integration is owned
by the existing world and job systems and the lead's narrow helpers.

The only canonical new catalog model is `place_lw_lantern_cradle`. The lamp,
receiver and other names below are this slice's explicit generated-body
identities. They are not invented GLB manifest entries or a claim of a completed
15-model civic art program. The supplied source has no generated release bytes
that could drift from its production geometry.

## Composition

The selected composition is an asymmetric crescent with an open service throat.
The Candle Fleet stays at its existing live anchor; the district never moves,
replaces or illuminates its canonical dark plinth. At the current anchor
`(1680,-820)`, the principal marks are:

| Mark | Sector-local position | Purpose |
| --- | --- | --- |
| Public observation | `(1710,-570)` | Approach from the open freight rim |
| Portable cradle / original lamp seat | `(1710,-650)` | Recognizable load and open-versus-retained jaws |
| Fallen mast | `(1775,-650)` | Transverse obstruction in a real passage |
| Family receiver | `(1830,-695)` | Separate brass-marked household installation |
| Tender installation stand | `(1800,-665)` | Attended work, away from the through-lane |
| Cut cheeks | `(1775,-704)` / `(1775,-596)` | 84 WU clear between the two 24 WU-wide bodies |

The action triangle is 120 × 45 WU before body envelopes. A 58 WU transverse mast
leaves two 13 WU margins, too narrow for the 28 WU collision width of the starter
Hitch. The open outside bypass remains south of the pocket. These are authored
geometry facts; the native owner must verify actual swept hull plus load
clearance before committing passage or installation.

Fifteen existing kit pieces retain native-scale doors, lamps and berths. Six
narrow service-spine segments connect the western Steps and eastern White Side.
The western pieces have offset repairs, teal skins and warm lamps; the White
Side uses aligned pale plates. The kit and spine envelopes stay at least 125 WU
from the memorial center. The NE Pit Line bearing remains open. The specific
world placement hook, static bodies and ordinary arrival evidence are recorded
in the lead's integration receipt rather than inferred from this table.

## Cradle and payload contract

The 30.4 × 18.4 WU open platform has two repurposed engine-bell rails, a patched
rear crossmember, a central goods seat, two hinged retainers, a swivel brace,
an asymmetrical switch cabinet and visible front/rear tow eyes. Its unloaded
silhouette exposes the circular seat and open jaw pair. The lamp is **always a
separate entity**; neither cradle nor receiver builds a cosmetic duplicate.

Axes are the game's +X forward, +Y up, XZ flight plane; WU equals source units.
Renderer yaw is `-entity.rot`. There is no automatic centering or normalization.

| Body | Size X × Y × Z, WU | Conservative broadphase radius |
| --- | --- | --- |
| Cradle | 30.4 × 7.8 × 18.4 | 17.8 |
| Family lamp | 6.8 × 8.9 × 6.8 | 4.9 |
| Family receiver | 25.2 × 7.2 × 20.4 | 16.3 |
| Fallen mast | 58 × 7.3 × 12 | 29.7 |
| Repair shutter | 24.6 × 9.2 × 20.4 | 16 |
| Service cheek | 25 × 10.6 × 24 | 17.4 |
| Shore spine | 57 × 6.2 × 12 | 29.2 |

Every body defines explicit local collision boxes. The cradle's cargo-scale
seat is not advertised as a ship passage. The service cut is formed by two
independent solids, so its visible opening must never receive one giant sphere.
Small retainers/brace remain inside the conservative loaded machinery envelope;
native physics owns changes to attachment, load and force.

Cradle sockets are `tow_point`, `tow_rear`, `lamp_seat`, `lamp_retain_left`,
`lamp_retain_right`, `service_approach`, `service_power`. The receiver has a
distinct `lamp_seat`, `service_power`, `service_approach`, `worker_brace`.
`lanternWardSocketWorld` and the actual named `SOCKET_*` scene nodes have tested
matching transforms under rotation and a nonzero galactic origin.

### Household identity and empty receiver — current cue pass

The public apron, blocked-pocket and final Overhead captures exposed a visual
hierarchy problem: the service cheeks' large pale/ochre patches dominated, while
the lamp's small base marks were obscured and the receiver cup was hard to read
among traffic. The current source puts the same three hand-cut brass strokes
on exposed top faces of the actual lamp and both seats.

| Body | Physical cue |
| --- | --- |
| Family lamp | Three raised brass strokes on a dark top cap above the cage; the lifting eye sits behind the mark. Each stroke is nominally 0.9 WU wide, 2.8 WU long and 0.18 WU thick, replacing the 0.28 WU base marks. |
| Cradle | The same three-stroke shape at 1.1× scale on a dark plate seated on the exposed rail. |
| Family receiver | The same shape at 1.25× scale on the back plate; a broad pale annular rim surrounds a dark recessed empty well. |

The brass is non-emissive and the dark gaps separate the three strokes. One
merged brass mesh per family object remains present at every LOD. The wider
lamp cap retains the actual globe and its native lit/damaged response. The
receiver contains an empty cup, never a cosmetic replacement for the finite
lamp entity. All changes fit the existing measured envelopes and preserve
the sockets, colliders, articulation and simulation fields.

Only the service cheeks receive muted hull, enamel, ochre and metal paint,
reducing their competition with the focal work objects. The White Side's pale,
aligned treatment and the historical memorial retain their existing identity.
These are physical surface and shape cues; the ordinary camera and HUD remain
under their existing owners.

## Live presentation interface

Selection requires `entity.data.lanternWardId === 'district_helios_lantern_ward'`,
a known `lanternWardRole` and a nonempty `worldRecordId`. Update callbacks retain
the entity ID, occupant generation, record ID and role; another occupant cannot
borrow an old worker, light or clamp pose.

| Committed scalar field in `entity.data` | Presentation effect |
| --- | --- |
| `lanternWardPhase` | `waiting`, `approach`, `brace`, `connect`, `finish`, `retreat`, `damaged` |
| `lanternWardProgress01` | Deterministic phase pose; repeated render calls cannot advance it |
| `lanternWardClamp01` | Actual empty/retained jaw position |
| `lanternWardDamage01` | Bent guard and unpowered damaged globe |
| `lanternWardWorkerPresent` | Show a genuinely attending worker and attached umbilical |
| `lanternWardLit` | Light the actual lamp; receiver shows only its small status indicator |
| `lanternWardRepaired` | Restore the utility shutter's alignment |
| `lanternWardWhiteSide` | Pale aligned spine panels; set at construction |

The suited worker is approximately 2.15 m tall. Boots brace on the bolted
service platform. During `connect`/`finish`, the tool tip remains on the actual
`service_power` point `(5.4,2.9,0.8)` while the elbow follows work progress.
Its umbilical is finite geometry attached to the platform, not an independent
fake EVA entity. Missing crew hides the pose; cosmetic time does not invent
work. No flashes, autonomous moving particles or looping audio are introduced.

## Material, LOD and disposal

The materials use the existing shared illustrated-surface and material-ABI
owners. Broad teal, ochre, pale enamel and dark machinery faces carry the shape;
bare-metal collars explain manufacture. Raised brass identifies the family
objects, while the service cheeks use the quieter palette described above.
Each body's finish instances are private, so damaged material state cannot
affect a sibling.

Static bolts and fine plates merge by finish. The distant LOD removes only the
cradle's fine hardware; jaws, seats, work faces, household marks and silhouettes
remain. Static child matrices freeze once; every moving joint, limb and damaged
globe retains its explicit animated flag. No per-frame geometry or material
allocation occurs.

Ordinary renderer teardown owns leaf geometry/material disposal.
`detachAuthoredMotion()` makes callbacks permanently inert without disposing
shared traversals. `disposeLanternWardVisual()` is an idempotent explicit
diagnostic/manual teardown. Five/ten-cycle lifetime policy is not inferred from
a screenshot; the focused test checks private resource survival and repeated
retirement directly.

## Verification and picture review

**Current focused result, 2026-11-04: 14/14 passing, zero failures, exit 0**
(1.060 s), from:

```bash
node --test test/lantern-ward-visuals.test.mjs
```

The checks cover the installed production wrapper, canonical hardware identity,
ordinary cargo/explicit asset priority, separate payload, authoritative
articulation, exact contact, saved damage, all pose bounds, transformed sockets,
LOD, malformed pose values, resource retirement and district clearance.
The two new checks raycast broad patches of all three brass strokes and their
dark gaps at LOD0/1/2, and verify the receiver's broad pale top rim above its
recessed empty center. They establish exposed geometry and preserved contracts;
they do not establish readability through live lighting, post-processing or traffic.

The cue pass is local commit `7f24ddfe741e3b78a0ffd7fe9789b8fba8d3d934`,
published at `5476392375ff68ddf4bbaa37534f533d37db2a0f`. Both commits have
the identical Git tree `7d841e0feb68b1518f59511f95ae18702a9c7965`.

### Cue-pass source hashes at 7f24ddfe (SHA-256)

| File | SHA-256 |
| --- | --- |
| `src/render/lanternWardVisuals.js` | `b1617eef45ab3381dfc19a4715a0578ac853088ad2d9c1e049cd88b68367fc63` |
| `test/lantern-ward-visuals.test.mjs` | `5701c3119184f6411833760af8a24a00e5006dc13b18ca8fbc1e54cf11ee3b06` |

**The subsequent ordinary Adventure review rejected the cue pass.** Actual
full-motion frames exposed a later payload-tumble owner turning top faces away
from their physical plane. That owner is repaired separately below. The latest
independent reports retain authority over ordinary-camera acceptance.

### Historical isolated renders — supplementary only

The original supplementary views were rendered through `createVisualFactory`,
shared illustrated materials and Helios light colors/intensities. The camera
used 170 WU width for scale checks and 80/90 WU for close inspection,
at 1280 × 800 on Chromium SwiftShader. There were no browser/shader errors.
The files are `.devshots/lantern-ward/art/01-cradle-gameplay.png` through
`07-shutter-work.png`, with the exact invocation and report beside them.

The art author inspected that older isolated revision and reported visible jaw
shapes, receiver and globe, with close views of keeper hardware, the old household
mark, worker contact and damaged shutter. Those pictures predate the native
loading repair and the current top-face cue pass. They cannot establish the
appearance or acceptance of the current revision.

These are **supplementary geometry views**, not ordinary Adventure, physical
towing, camera traversal, the full production post stack, target-device FPS or
an independent artistic acceptance. The lead and hostile reviewers must inspect
normal route captures before claiming those outcomes. The 170 WU cut view also
clips the outer cheeks and cannot establish the neighborhood's readability in flight.

Historical isolated draw counts: empty receiver 6; receiver with worker and one
lamp 25; loaded cradle 25; work pocket 49; repair shutter with worker 22.
These are measured submitted draws for the named isolated compositions and
their original source revision, not current-revision or whole-game performance numbers.

### Source hashes of the original supplementary picture revision

- `src/render/lanternWardVisuals.js`: `58209eab80934ccad6c88110694ca0fa0654ab36bf7a1f36614ded3cbf70e7af`
- `src/data/lanternWardLayout.js`: `fbd3a9821fa8e28735424db7449e7d29897ab92e28ae0b34d0640e2c7978d586`
- `test/lantern-ward-visuals.test.mjs`: `63a9916cafcefabf2723e70ee7a805fefc41a0b041ad8b42127305d3077c8f6f`


## Native integration repair — open loading geometry

The first native service run rejected the original planar collision projection:
the recessed seat plate ejected the separate lamp, and the continuous north rail
blocked the lamp's diagonal unloading path. The lead removed only the plate's
flight-plane collision projection (its rendered plate remains below the payload)
and authored an actual 15.8 WU gap in the north rail, enamel skin, ribs and bolts.
The updated compound proxy follows that visible opening. The opposite rail,
back frame, tow tongue and receiver walls remain solid. This is a geometry repair,
not a larger success radius or a collision-disabled payload.

The original supplementary images above predate this repair. Native production-order
tests use the repaired geometry and require the same finite lamp within 2 WU of
its receiver, moving below 0.8 WU/s, with an accepted generation-bound clamp and
continuous attended work. Earlier ordinary-route observations are recorded
separately in the two hostile-review reports and implementation receipt. Those
earlier observations do not accept the current cue pass; its new public picture
review remains pending as stated above.

### Maintenance loading-pocket repair

The real full-world collider run found the initial source canister overlapping
the existing Apron Waiting Rail. The final source is (1640,-618); the empty tender
starts at (1695,-545), approaches at (1675,-580), and gives the same bearing to the
shutter's receiving line. No existing shore structure was moved. The measured
source centre gaps are 27.5 WU to the waiting rail and 39.8 WU to the freight
platform. The full Adventure test now requires the finite bearing installed,
not merely a moving tender or elapsed work timer.

### Historical native loading-repair hashes (before the cue pass)

- `src/render/lanternWardVisuals.js`: `cfa3efce32427c39cc20f5363da56869f48b0d965a211b5ff0edd9f8840f6e10`
- `src/data/lanternWardLayout.js`: `05e261278e5e45b638515d2c2e40b0a601c79496d58a36f03ceb50977ca27662`
- `test/lantern-ward-visuals.test.mjs`: `63a9916cafcefabf2723e70ee7a805fefc41a0b041ad8b42127305d3077c8f6f`

## Late presentation-owner repair

The fresh full-motion public run on 7f24ddfe exposed a defect after the authored
producer and wrapper: ordinary ordnance motion treated the six finite Ward bodies
as tumbling cargo. At tick37453 the fixed receiver had physical yaw0 but render
pitch8.534701208670366 and roll−6.201625389916572 radians. Top-face marks and socket
geometry cannot communicate honestly when a later owner turns the whole body
away from its collision plane. The failed ordinary frames05–08 remain evidence.

Commit **95a775e283a3936523b0db493ac2a4e4eb67fdc4** fixes the narrow late motion
owner. Canonical Ward hardware retains snapshot position/yaw and authored child
articulation. Residual off-axis tilt and that owner's own scale are cleaned on the
exact mesh; unrelated cargo keeps its tumble and deployment. A mesh-keyed baseline
prevents an old occupant's dimensions being copied onto a fresh same-ID root.
The ordinary bearing remains scale5; the five authored bodies remain scale1.

`test/lantern-ward-native-pose-render.test.mjs` follows the installed wrapper,
actual snapshot fence, authored update/LOD and actual late motion owner.
**3/3 pass** across full/reduced motion, translated coordinates, socket contacts,
repeated frames, identity reuse and ordinary-cargo controls. Existing ordnance
behavior passes **14/14**. Removing only the new guard in memory causes two
failures; the ordinary-cargo control still passes. See the explicitly summarized
[validation receipt](evidence/late-motion-validation.json).

| File | SHA-256 |
| --- | --- |
| `src/render/ordnanceMotionPresentation.js` | `ed5fb991ff63d260a0af5547bd04ef68bdb04b47b80ae4a586bf8dded4cac21b` |
| `test/lantern-ward-native-pose-render.test.mjs` | `20fd9c0eb88bf0902b340d5057f2c42bfc12c4365ba5c7c2c3d239e917ad2ef7` |

This closes the focused ownership defect. Public visual acceptance still requires
new ordinary-flight pixels on this source; the independent reports own that verdict.

## Opening-admission producer repair

An ordinary F9 Quick Load near the Ward failed because five visible procedural
roots lacked a recognized content boundary. The custom Ward authorship string
had occupied `generatedVisualProducer`, where the existing producer helper
requires `visual-factory-procedural`. Commit **9c7bb9006b5dffee7fc39487277ad8f411feba10**
uses the canonical marker, retains the Ward string as `lanternWardVisualProducer`,
and publishes the contract's explicit `assetId`. The existing helper computes
the actual immutable recipe hash; no arbitrary hash or verified bit is invented.
Geometry, collisions, sockets, articulation, custody and startup gates are unchanged.

The new opening regression passes **3/3** through the installed wrapper, canonical
ensure, actual producer census and opening submission plan. It includes all six
hardware roles and all eight native dressing rows, including White Side, at all
three LODs. Exact live geometry and material subjects form the census. The old
marker and unmarked controls reproduce an incomplete plan despite nonempty
roots and matching resources. A memory-only restoration of the old marker also
fails the positive case. Existing visual, D157 and opening-plan checks pass **43/43**.
[Validation receipt and public-save reproduction](evidence/opening-admission-validation.json).
The subsequent ordinary import/load is separately reviewed; these tests alone
are not public load or visual approval.

| File | SHA-256 |
| --- | --- |
| `src/render/lanternWardVisuals.js` | `c76a931ff607a53615663ef9635877729563da225f1208be320ab64ec04d1943` |
| `test/lantern-ward-visuals.test.mjs` | `9ec2684f22481186ca0e816875269ca266d0f75dc65a7469ca3a4e99a95ce3b8` |
| `test/lantern-ward-opening-admission.test.mjs` | `6da8593e77dfa5b1407e49470b840ecbab01bc814ec4544df9b1c9461855b40c` |
