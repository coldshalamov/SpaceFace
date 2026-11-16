# Practical graphics coverage handoff

## Active checkpoint — 2026-11-16

**The coverage goal is active.** The old paragraph below that says it is paused is historical and
must not be used to stop the work. This checkpoint is the current handoff.

### Durable coverage state

`design/program/fleet/graphics-asset-review/coverage-status.json` is the work list. Refresh its
model mapping with `node scripts/fleet/asset-review.mjs index` after landed asset changes; use the
same tool's `show`, `status`, and `summary` commands rather than hand-editing it. It deliberately
groups authoring/release/render-package representations and declared LODs under one model ID.

At this checkpoint, the refreshed list contains **3,566** records:

| Status | Count | Meaning |
| --- | ---: | --- |
| pending | 169 | No individual pass yet. |
| in progress | 0 | No capture should be presumed live from the ledger alone. |
| needs follow-up | 361 | A source or isolated visual pass found a material issue, a required contextual/LOD check, or an incomplete verification. This is not acceptance. |
| passed | 0 | No model has enough current evidence to be called done. |
| unused/unresolved | 3,048 | Source/third-party/candidate groups whose actual runtime use is not proven. Do not delete them on this classification. |

The inventory also has 423 release-manifest entries, 422 runtime packages, 352 runtime model
groups, 4,880 source-model files, and 60 presentation groups that still need individual identity
resolution. Those quantities are inventory facts, not completion evidence. The summary currently
reports 28 current visual LOD observations in its journal-derived metric; capture files can exist
without a matching journal entry, so use the per-model status and evidence paths when deciding what
to do next.

### Work completed in this campaign

#### Review infrastructure and evidence

- Built the durable model ledger and supporting index, facts, and per-model iteration journals.
  `coverage-status.json` is untracked work and should be preserved with the adjacent review
  artifacts; it has current file versions for the representations it knows.
- Added renderer-backed batch viewer support for authored packages, live procedural bombs and fauna,
  and now procedural asteroid type/variant/LOD previews. The relevant uncommitted changes are
  `scripts/fleet-look.mjs` and `src/render/fleetLook.js`; both passed `node --check` after the
  latest asteroid addition. The asteroid route uses the factory's real ID-hash selection rather
  than an arbitrary mesh substitute, and records preview identity in the report.
- Wrote a scoped shared-system review in
  `design/program/fleet/graphics-asset-review/shared-systems-review.md`. It found no evidence for a
  global lighting or emissive reduction; functional lights must be judged with their model and
  scene.
- Wrote practical source notes for the new batches:
  `machine-construction-notes.md` and `works-conduit-notes.md`. They are source inspections, not
  visual acceptance or performance measurements.

#### Visual and construction changes already made

- Ship/faction cleanup: corrected loft UV handling in `shipKit.js`, a raised drift-barge deck decal,
  Meridian Trader cargo/light behavior, independent Reaver strobe behavior, Vael Sniper loft order,
  and Kestrel's damage/plume behavior. The earlier focused ship and Kestrel checks passed; these
  models still need ordinary-route appearance review.
- Character cleanup: Ravel, Rubric, Bracket, Ruud, and Solstice now avoid demonstrated redundant
  material/geometry allocations while preserving their separate dynamic/state pieces. Existing
  focused character suites passed. This did not measure game frame time.
- Packaging: seven greeble render packages and the Repair Tender, Prospector Skiff, and Apron Shuttle
  packages reuse compatible external KTX2 payloads rather than embedding duplicate bytes. The
  scoped package checks and the current renderer captures passed. The bookkeeping measured package
  byte reductions only; it makes no FPS claim. Their installed-context visual follow-up is still
  open.
- Crusher module: added an authored steel collar to close the visible hopper-to-body gap, rebuilt the
  source/release/render-package chain and its manifest/input pins, and passed the scoped builder,
  package, encoding and instance checks. The isolated renderer view shows the gap closed. An
  Adventure approach reached the starter area but did not make the crusher identifiable, so the
  ordinary player route is incomplete; its plain surface treatment also remains a follow-up.
- Fauna: safely reused material instances only within a creature where lifetime/mutation allows it;
  did not merge animated geometry. Bolus cards gained UVs and appropriate double-sided handling.
  Fifteen named Bolus recipes were rebuilt as bounded folded brown volume rather than flat cards,
  with corrected glow placement for Blister/Lantern and a seated Uvula lobe. Focused Bolus and fauna
  tests passed, and isolated current captures exist. Movement, ordinary encounter composition, and
  other Bolus forms are still follow-up work. The requested fleshy, brown, folded infestation
  direction is represented in these forms, but no blanket infestation material was scattered into
  unrelated sites.

#### Captures reviewed and recorded

- Earlier batches covered many ships, characters, fauna, greebles, landmarks, debris, and package
  variants. The first landmark candidate rounds were rejected rather than integrated: they remained
  schematic or less readable than the shipped set pieces. Do not revive them merely because they
  exist in `.devshots`.
- Eight aftermath debris records have current isolated `place` and `inspect` views in
  `.devshots/fleet/graphics-overhaul-asset-review-current/debris-variants-20261116/` and are now
  `needs follow-up` in the ledger. The grating variants are notably flat/dark at approach scale and
  the strut shard is weak as a long thin silhouette. The hopper and liner variants need their actual
  debris-field composition before a geometry or light change is justified. No change was made from
  this batch.
- Eighteen procedural machine/prop records (eight machines and ten props) received a source
  construction pass and are `needs follow-up`; their shared cached geometry, animated/state pieces,
  and small material-allocation candidates are listed in `machine-construction-notes.md`. No visual
  conclusion or change was inferred from source alone.
- Twelve Works conduit packages have completed `place` and `inspect` capture in
  `.devshots/fleet/graphics-overhaul-asset-review-current/works-conduits-20261116/`. The lane family
  reads as dark bronze/blue structure; the power family remains clearly distinct through pale casing
  and restrained yellow power runs. Package inspection found one material, three textures, two
  declared LOD nodes, and no embedded animation per variant. Each is now `needs follow-up` in the
  ledger, pending an installed network composition and observed LOD selection. Do not merge them
  solely from aggregate triangles or primitive counts.

### Current incomplete work and next actions

1. **Finish the stopped asteroid batch.** The recent asteroid viewer route is valid and syntax
   checked, but the queued capture ended without `report.json` after only nine
   `ast_common_rock` LOD images. It is incomplete, therefore none of the six types × five variants
   is a pass. Relaunch under the game lock in smaller batches, inspect `lod0` and `lod2` at minimum,
   then record each type/variant model individually.
2. **Contextualize Works conduits.** The twelve individual rows now hold the isolated visual and
   package evidence. An installed network view is the smallest useful follow-up for joint continuity
   and actual LOD behavior.
3. **Continue finite runtime families before uncertain source candidates.** The 169 pending records
   include procedural asteroids, machine/prop and ship families, current runtime packages, two
   character families, and numerous named places. Batch current renderer captures by family, then
   make only a directly supported repair. Use `needs follow-up` rather than `passed` whenever an
   actual view, motion state, LOD, or player context remains material.
4. **Do not lose package/renderer changes.** The current checkout has uncommitted graphics changes
   from several agents: package GLBs/manifests/input descriptors, crusher assets, character and
   fauna sources, and the viewer files above. Inspect exact diffs and current manifest pins before
   staging anything. There has been no broad commit, merge, or publication in this campaign.
5. **Use the shared game lock.** Existing captures were queued with
   `node scripts/fleet/game-lock.mjs run -- ...`. Avoid stopping other owners' route/gate work. A
   capture receipt with missing image, partial report, or wrong target is an incomplete result, not
   a pass.

### Verification already run

Focused suites previously passed for the touched ships and characters; Bolus tests passed after the
form corrections; package compiler/loader/embedded-resource checks passed for the greeble and three
ship externalization work; and Crusher scoped build/package/instance checks passed. The immediate
latest viewer changes passed `node --check` for both changed files. These checks prove the stated
mechanical paths only. They do not establish ordinary play appearance, full model coverage, or
measured performance.

### Risks and handoff rules

- The checkout is shared and dirty. Preserve foreign work, never reset/clean/stash, and inspect the
  exact diff for a path before editing it. No broad staging or commits.
- Do not treat scratch candidates, source-only inspection, model counts, a successful screenshot
  write, or a benchmark proxy as an art pass. Conversely, do not launch a separate audit campaign:
  the next model-family pass should resolve the material issue in front of it and move on.
- Use Luna for bounded inventory/mechanical checks, Terra for visual/3D work, and Sol only for hard
  one-off judgment. Actual GPT-6.1 Terra Devin-fleet tasks were dispatched and their delivered
  source work was reviewed earlier in the campaign; do not use Astra.
- No performance capture was performed for this handoff, and no frame-rate improvement is claimed.

---

**Owner direction, 2026-11-16:** obtain complete model coverage with a practical quality and
efficiency pass. There is no 20-iteration quota and no required performance-capture campaign. The
goal remains paused until the owner resumes it. The proposed replacement goal is in
[`COVERAGE_GOAL.md`](COVERAGE_GOAL.md); the stored goal objective could not be edited through the
available goal tools. The older instructions to use Astra are superseded: use Luna, Terra and,
sparingly, Sol. User direction takes precedence over stale descriptions and script counters.

## What went wrong and how to change the workflow

We spent too much time on individual candidates, repeated setup, long game-lock queues, build
provenance and investigation while much of the fleet still had no current visual pass. Multiple
workers occasionally selected the same asset; recent outcomes were scattered across scratch notes
instead of immediately entering the durable per-model record. A plausible-looking screenshot was
sometimes treated as more complete than its evidence warranted. The result was genuine fixes but
no trustworthy completion percentage. Don't repeat that pattern.

Use the existing [review front door](README.md), its per-asset facts and journals, and
`node scripts/fleet/asset-review.mjs summary` as starting material, not a finished coverage count.
The generated index was last observed at 2026-11-15 and its richer catalog at 2026-11-13; refresh
against the current release/runtime manifests and live code before assigning work. Those indexes
include source candidates and third-party inputs: do not count them all as separate playable models.
The tool still reports a historical target of 20 iterations; ignore that quota. If the current tool
cannot record the new short dispositions, adapt it narrowly rather than maintaining a second
competing ledger. Preserve the existing journals and other agents' untracked work.

The scratch [dispatch notes](../../../../.devshots/fleet/graphics-session-dispatch-20261115.md)
identify recent reviews and rejected candidates. They prevent duplicate work but are not the durable
coverage authority. Reconcile their concrete results into the chosen ledger once, checking current
asset identity and bytes. An isolated review, old screenshot, rejected candidate, or performance-only
change must not be promoted to an art pass. Other agents and PRs may have changed assets since these
notes were written.

## Fast pass and stop rule

1. Build a finite queue of model families from exact current runtime/release mappings, plus actual
   procedural model builders and incoming merged assets. Group the same model's source, release,
   package, LODs and materially distinct playable variants. Mark source-only, third-party, unused
   and uncertain items separately; verify before calling an asset unused or removing it.
2. Assign nonoverlapping batches by family. Use one viewer session for several files/angles where
   possible (`scripts/fleet-look.mjs --files=... --views=...`), under the game lock. Have a worker
   inspect each actual model at game scale and a useful closer or alternate angle. If a target is
   blank, partially drawn, stale, timed out or the wrong asset, mark it incomplete and move on;
   fix a shared cause once if it materially blocks the batch.
3. For each model, identify the biggest obvious visual issue and the biggest safe construction
   waste. Fix them where justified using the smallest coherent change. A functional light can be
   bright and a material can be intentionally clean: judge whether the object reads as purposeful,
   detailed hardware at its size. Do not add a texture to a tiny emitter for its own sake.
4. Record immediately: model ID and current source/package version, status (`pending`, `in progress`,
   `passed`, `needs follow-up`, or `unused/unresolved`), actual view, short findings and changes,
   and any material limitation. Claim disjoint model/path ownership before edits. A single considered
   pass may be enough; no manufactured iterations. A pass means the actual model was seen and the
   practical surface/geometry/efficiency check was performed, not that it is perfect.
5. Advance to the next batch. Refresh for newly landed assets. Stop only when every in-scope model
   is accounted for and individually passed, with unresolved items explicitly reported. Review shared
   lighting, materials and effects as separate scoped work; they are not automatically certified by
   a model pass. Use focused checks for each edit; no FPS runs or elaborate captures are required by
   this campaign. State theoretical savings as theoretical.

Luna is useful for finite inventories, matching files to known manifests, and mechanical checks; the
observed Luna catalog pass supplied candidate IDs and use sites, but it did not establish visual
quality. Terra should own most actual visual decisions, Blender/GLB edits and integration. Use Sol
for a difficult one-off decision with broad payoff. Do not assume any model's quality based on the
worker's name. One lead can review uncertain or conspicuously weak outcomes and sample batches; do
not create a separate adversarial review ceremony for every item.

Also use the terminal `devin-fleet` agents with GPT-6.1 Terra where the configured accounts still have
usage. Dispatch real, bounded asset or graphics tasks to them in parallel, like other Terra subagents;
verify the available account/profile and model before launching. Give each an explicit nonoverlapping
write set and require it to preserve concurrent work. Review and integrate its actual result, then
record the model's disposition in the same ledger. Do not duplicate active work, assume account
availability, or run Astra. The owner explicitly wants this capacity used, not merely listed as an option.

## Common defects and practical fixes

- **Untextured primitives / mismatched detail.** Power skid had a plain cabinet and capsule under a
  glowing blank sheet; customs pylon had a plain box and post; parts rack was a blank plate despite
  23 isolated draws; railgun had a smooth gold casing. These are obvious failures at close view.
  Give large visible areas plausible panel/metal/paint detail and purposeful fittings. Reuse an
  existing compatible atlas or imagegen texture with correct UVs, color space and texture size;
  retain a coherent silhouette and make detail legible at the game camera. Avoid simply darkening
  the same featureless surface.
- **Flat texture pretending to be volume.** Two ore studies produced identical flat 'rugs' or a
  regular grid of fragments; a railgun panel study looked like stretched printed lines. They were
  rejected. If the silhouette or topography is wrong, alter the shape first: asymmetric mounds,
  attached structural pieces, believable thickness. Use texture for small-scale detail, not as a
  substitute for every important edge. Avoid duplicated patterns that read as tiling.
- **Glow replacing detail.** Bastion, Mule and Hornet had broad decorative strips that dominated
  their hulls. Targeting only their decorative material made markings legible with less glare while
  preserving navigation lights; fixture draws were unchanged. Do not dim all emissives globally:
  a beacon or weapon tell may need brightness. The nav buoy's 55% cyan trial still looked clipped;
  the Lane Pin trial weakened a useful distant cue and its close comparison was inconclusive. A
  darker version is not automatically an improvement.
- **Near-black or washed-out ships.** Leviathan's deck was almost black at one angle; a hull-only
  lightening trial did not fix its separate dark panels. The Last Argument's source-faithful
  color-space correction removed pale pink/blue but lost deck readability. Both were rejected.
  Check light direction, exposure, actual material factors and role before changing a shared shader
  or model. Preserve midtones, panel separation and faction character; don't make every asset gold,
  cyan or grimy. `docs/visual-assets/LOOK.md` describes the current direction.
- **Unclear purpose or connectivity.** Check whether a tube, strut, antenna, ring or box is a
  socket, an actual light, an animated component, a selection cue, or an orphan. Breakaway Fork's
  service pylon was connected to its cross-tie using an existing armor primitive, adding 12 triangles
  per LOD without adding observed draws. Check the ordinary assembled use before 'repairing' a
  standalone part: the ugly Resonator pod appeared to be a modular fallback for the ships traced,
  and another worker already owned its review.
- **Too many static pieces.** Parts rack's generator joined static same-material frame pieces while
  retaining plates, light and collision; isolated draws went 23 to 12 and the package shrank.
  Credit-chip body meshes went 6 to 4 per factory result, mine details 28 to 19, and repair cell
  9 to 7 in focused fixtures. Merge only parts with the same material and transform/motion role;
  preserve named runtime consumers, callbacks, normals, winding, sockets, collision and shared
  resource lifetimes. Near the screen edge a merged bound may submit extra clipped triangles.
  Other agents may have subsequently changed these paths; inspect current code before reusing claims.
- **Needless offscreen submissions.** Ordinary pickup meshes disabled frustum culling; with half
  of a 20-pickup fixture offscreen, submissions fell 40 to 20 (rich: 60 to 30). Swarm pickup
  culling needed a follow-up: the larger visible outer ring froze when its smaller body was culled,
  so its animation moved to its own callback. Test edge visibility, re-entry, animation and reduced
  motion. Do not blindly enable static bounds for shader-displaced plumes, instanced bolts, moving
  debris or world-space ribbons; some have their own conservative culling.
- **Infestation.** The generated brown fibrous cutout was useful as a substrate, and a later
  generated fleshy tile had folds, but neither was integrated. A torus-knot test still looked like
  a smooth pretzel; a folded sheet looked like a pinched star. Texture alone is not an invasive
  growth. Existing growth modules are also used in early sites and Understory gardens. Site and
  strain IDs exist on growth entities, but no suitable late-gated procedural growth host was found.
  Keep the explicit brown, meaty, folded direction; use context/story severity for spread. The
  progression work is noted as `FUNGUS-01-progressive-infestation`; don't scatter growth globally.

## Packaging, visual checks and shared-work pitfalls

- Runtime may use compiled render packages, release GLBs or procedural fallbacks. Trace the actual
  selector before editing: Swarm's base `ship_wasp` ID did not always identify the final hull.
  Conversely, lancer and detonator really did resolve to the same Wasp; a scratch separate bomb
  was lighter but too simplistic and was not shipped. Do not publish disconnected replacement art.
- Forge rebuilds have sometimes changed unrelated normals, LODs, collision, or source pins. Parts
  rack had a release-only sidedness postprocess absent from the normal source build; its accepted
  fix put rack-only policy and static joins in the existing generator. Power skid captured collision
  bounds before joins and retained sockets, with scoped pins and a reproducible 256px surface set.
  Inspect the exact source/release/package diff; don't overwrite shared manifests from a stale copy,
  weaken validation, or claim a rebuild is equivalent merely because triangle totals match.
  Do not build a bespoke finalizer for every marginal improvement; if a safe durable route is not
  available, record the blocker and move on.
- Viewer A/B pages have sometimes changed exposure/sky and even reported ready while drawing only
  part of the target. The proposed viewer fix was not accepted; see
  `.devshots/fleet/lighting-match-study/FINDINGS.md`. Same-scene synchronous overrides can be useful
  for material comparisons when target coverage is verified. Don't compare colors across mismatched
  light, mistake a preview for a packaged result, or repeat a failed capture unchanged. Batch files
  in one session when possible; the renderer lock protects other agents and the user's playtests.
- The last fleet gate after the mine change passed. A separate earlier gate saw a VideoFrame
  warning; an instrumented save/Continue rerun passed 18/18 without reproducing it. Its source and
  relationship to stutter are unknown. This is not a reason to turn the model campaign into a
  performance investigation, or to claim the independent backend desynchronization is fixed.

Shared checkout rules still apply: inspect `git status`, exact diffs and current claims before editing;
do not revert foreign work, use another checkout, or stage/commit broadly. The current fleet queue
and user direction outrank historical plans. No deployment, benchmarks or further work is implied
while this goal is paused.
