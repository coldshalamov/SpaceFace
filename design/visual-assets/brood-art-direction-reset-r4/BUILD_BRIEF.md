# Brood art-direction reset: lamellar shear Mite

**Review packet, not a production replacement.** No runtime files, manifests, combat data, collision data or old sources are changed. The generated concept is a reference. The Blender/GLB is an editable form-and-material prototype with explicitly unpassed production gates.

## What failed in the rejected pixels

- Mite M7: two large continuous pillow surfaces consume most of the top view. The root-to-claw transition is a coloured stub meeting a white crescent; small seams do not explain a convincing force path. The flank surfaces are too quiet for the broadness of the form, while the minor appendages are thin decorations
- Splitter A6/V12: multiplying that lobe language and adding triangles has not increased the quality of the primary forms. The body, child bodies and broad jaw blades still have nearly the same smooth response. Repeated comparisons prove export consistency, not visual quality
- Charger C3/C5: panel cuts on the same inflated horseshoe do not change its primary read. Its fork and back lobe look padded rather than like different biological materials under stress
- The strong Kestrel, salvage cutter and trade hub references provide the relevant benchmark: one clear silhouette; clear large, medium and small structure; real attachment; layered depth; controlled light and dark materials. The older fauna are not a quality ceiling

## Directions considered

1. **Lamellar shear organism, selected.** Grown protective plates over recessed flexures; two fixed shearing contact jaws and two supported membrane vanes. Rich wine chitin and dark plum tissue with a restrained dense-chitin cutting edge. Strongest fit to the current silhouette, anatomy contract and saturated polished Look
2. **Tension-sail predator.** Membrane-dominant flattened body with a narrow feeding keel and long spring ribs. Strong negative space, but risks a ray read, softer gameplay silhouette and substantially wider moving-collision demands. Retain for a distinct future species only if its behavior warrants it
3. **Radial mineral rosette.** Interlocking ceramic-like radial scutes with a compact central oral mechanism. Distinctive and attractive but weak forward direction and poor separation from a defensive/anchored role. Reject for a diving Mite

## Selected design: what must survive translation

One sentence: **a nested armoured saddle driving two sharp biological shear jaws**.

Macro:
- Low pointed posterior, three overlapping dorsal lamellae, broad front shoulder shield
- Open forward jaw slot, rooted paired jaws, clear forward direction
- Paired swept lateral membrane vanes. No extra walking legs, mounted machinery or decorative floating spikes

Meso:
- Each lamella is a closed shell with finite thickness, a crowned center, shoulder turn, undercut flange and an overlap that actually occludes the soft layer beneath it
- Root cuffs shroud the jaw flexures. Distal jaw armour and cutting lip are distinct materials and section shapes; avoid a white crescent pasted onto a coloured cylinder
- Jaw tissue must run continuously under the sleeve. Its folds follow flexion/compression, not a mechanical threaded hose
- Vane membrane must be bounded by rooted structural spars. It is opaque/dark at play scale; do not buy beauty with expensive transparency
- The mouth is a small sheltered opening under the front shield. It adds biological credibility at close range, not a glowing attack cue

Surface:
- Carapace: grown laminar chitin, rich saturated wine; broad directional glint, modest coat, matte/slightly lighter exposed lamellar lip
- Flexure/membrane: dark graphite-plum fibrous tissue, rougher and visibly recessed; no uniform glossy rubber
- Cutting chitin: dense ivory keratin-like growth, narrow area share, sharper section and lower gloss than carapace
- Avoid global noise, generated scratches, pink blank balloons, gritty pores, metal fasteners, infection, fungal growth and unsupported glow/weak points

Canon: the owner decision in `design/swarm/SWARM_EXPANSION.md` §9 says the Brood is its own creature, distinct from Adventure's fungus that colonises dead hulls. No fiction is added by this packet.

## Runtime constraints and proposed deviations

Inspected baseline: `brood-mite-redesign/contracts/frozen-mite-contract.json` and `frozen-mite-motion.json`.

Keep mass 22, radius 7.1, +X forward, game +Y up, +Z starboard, sourceScale 1. Baseline bounds are X [-6,6], Y [-1,2.3], Z [-5,5]. Named contact points stay at (6,0,±1.6); the forward middle slot stays physically open. The old jaw split clearance is X [2,6.6], Z [-0.65,0.65]. Jaws remain fixed contact geometry; do not animate a bite or invent an extra damage event. Keep windup/attack/recovery 0.5/0.8/0.8 seconds, two membrane presentation pivots, and three bounded cosmetic death-fragment groups unless an explicit runtime proposal is accepted.

The prototype's named sockets retain those reference coordinates, but the fixed dorsal attachment currently lies above the shell. This is not a proved attachable surface: production must build a credible recessed saddle up to that point or propose and test a socket relocation. Do not silently move it.

The old per-Mite triangle targets (3500/1600/900) and 6 draws are not used as an excuse to preserve the rejected anatomy. The selected unfinished R4 study is 20,236 triangles, 40 mesh objects and four materials before authoring/LOD optimisation. Proposed production exploration budget: LOD0 8–12k, LOD1 3–5k, LOD2 1.2–2k, three semantic materials, two moving groups; target six to nine actual material-group submissions before instancing. No current prototype draw count is claimed. These are proposals, not performance approval. Existing production cap 40 and density probes 100/200/400 must be measured on the actual candidate. If cost is excessive, simplify invisible undersides, combine static same-material geometry, bake shallow growth lines, and preserve top silhouette/joint gaps. Do not return to three low-resolution balloons.

The new silhouette fits inside the broad baseline envelope but does not match the old contact proxy outline. Production needs a new bounded-compound collision fit, truthful negative space and contact-geometry comparison; do not use one convex hull or claim old collider checks apply. All art/runtime deviations must be reviewed together before runtime edits.

## Source, texture, LOD and material strategy

- Keep the editable Blender source and deterministic builder, plus an uncompressed GLB interchange file. The prototype uses original authored section meshes and no downloaded meshes
- Production integration must use the existing Forge/organic authoring seam, not a parallel publishing pipeline. This exploratory builder is intentionally standalone and cannot be called a Forge release
- Use three semantic material regions: carapace/edge pigmentation in one material atlas, rough soft tissue, dense cutting chitin. The prototype uses a fourth lip material to inspect the value break; consolidate it in production
- Author UVs by anatomy and surface direction. One small shared Brood atlas/trim strip can carry lip pigmentation and shallow directional lamellar normals; keep large folds, edge breaks, jaw roots and silhouette in geometry
- No generated concept pixels become textures. No random broad roughness noise or tiled human plating across skin
- Bake only shallow relief from the approved high source onto a hand-reduced surface. Inspect tangent basis, seams and padding at close zoom; texture-only detail must not carry the primary shape
- Create authored LODs after the form direction is accepted for production: preserve crown/shoulder edges, overlap depth, jaw slot, cutting silhouette and fixed socket relationships. Reduce ribs and ventral detail first. Compare at the same scale without re-framing the levels
- Keep animation groups at their actual anatomical roots. Do not merge across motion groups; collision remains simulation-owned and visual LOD never changes it

## Image-grounded acceptance gates

1. **Neutral clay shape gate:** open exact-GLB top, 60-degree chase, side and jaw-root views. All three dorsal lamellae must be visibly different sections with consistent overlap and no interpenetration. Rooted jaws and membranes must remain convincing without colour, texture, emission, rim lighting or a black background hiding gaps
2. **Small-size gate:** inspect measured 170 px and 96 px versions beside M7, plus a 450 px close view. Direction, paired bite opening and lamellar shoulders must survive; no point-cloud of tiny decorative details. These are comparison sizes, not a claim that every Mite occupies 170 px in real gameplay
3. **Anatomical continuity gate:** no floating structures, clipped flexure folds, wafer lips or tube cuffs. Actual mouth and undercuts survive side and underside review. Contact tip locations, clear slot and attachment point are physically supported
4. **Neutral surface gate:** wine shell reads hard/grown, tissue reads recessed/flexible and ivory reads dense cutting material. Flat neutral and grazing light must show the same structure. No detail can depend on generated scratches or dramatic lighting
5. **Export gate:** render a fresh import of the final exported GLB. Compare to the Blender source and retain hashes. Source-only renders never establish export parity
6. **Real Look gate:** use current fleet-look/look-bench and normal game route, at bright arcade and dark neon_noir moods with actual authored-material routing. Include the strongest finished ship nearby. Check actual motion and LOD transitions at gameplay size
7. **Runtime gate:** new source/collider/rig contracts, fixed attack timing, death fragments, exact loader selection, cold/warm load and representative dense-scene CPU/GPU cost. A visually attractive Blender model does not close any of these

## Honest limits

This packet supplies a new art direction, generated reference, editable geometry prototype, actual exported GLB and neutral reviews. It supplies no production rig, UV/baked texture set, authored LODs, collision fit, runtime material mapping, release binary, game Look evidence or representative GPU measurements. The cloud environment's unavailable verified game/GPU path is a separate verification limit; it is not an excuse for the old weak anatomy or a basis for calling this prototype accepted.

Root review chooses whether the construction is strong enough to rebuild in production. No claim of user approval is made.
