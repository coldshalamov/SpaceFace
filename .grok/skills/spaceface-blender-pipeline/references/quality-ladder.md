# Quality Ladder — Reference Image Mapping

Use this when briefing agents or reviewing deliverables. Each tier has a named skill.

## Reference Guidance

The images shared earlier (#1 current output vs #2 Eve, #3, #4 pro examples) show the target quality level. 

For any asset:
- Use `references/professional-techniques.md` as the primary definition of what "professional" means.
- Load any available concept art or bible images from the project as reference planes.
- Apply the general rigor protocol in each skill.

## What each pass actually delivers

- **Modeling Pass:** Professional hard-surface form using advanced non-destructive techniques, full modifier power, topology rigor, and rigorous iteration. The clay result must already show real craft.
- **Surfacing Pass:** Advanced skins, layers, node-based effects, procedural + painted systems, trim sheets, filters, and material complexity.
- **Life & Polish Pass:** Animation, moving parts, secondary details, and finishing that make the asset feel alive instead of static.

The old "start basic and add a little" approach is explicitly rejected. Each pass has mandatory advanced technique lists and strict iteration protocols.

## Vision gate questions

### Tier 1 → 2
- Are there panel insets on every major face?
- Is greeble density 3× higher at joints than on flats?
- Does it look kit-bashed/asymmetric vs toy-symmetric?

### Tier 2 → 3
- Does AO contact sheet show recess depth without the mesh?
- Does roughness show edge wear and cavity dirt?
- Would removing lights still show material variation?

### Tier 3 → Image 2 (review only)
- Under HDRI, do metals specular correctly?
- Are emissive limited to engines/windows?
- (Ignore explosions — not GLB work)

## Do not conflate

| Wrong target | Right target |
|---|---|
| More emissive glow (Image 1 fix) | Roughness + AO (Image 4 fix) |
| Subdividing hull (burns tris) | Normal map from floaters |
| Three.js metalness slider | Re-bake roughness |
| Meshy photo-to-3D | Tier 1 blockout |
| Beauty PNG as deliverable | Map flats + validated GLB |