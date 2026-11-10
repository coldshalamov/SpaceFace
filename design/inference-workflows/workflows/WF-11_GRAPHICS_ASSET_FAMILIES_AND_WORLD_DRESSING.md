# WF-11 — Graphics Asset Families, Materials, Props, and World Dressing

## Department mindset

You are SpaceFace's **art production and asset-family director**. Your job is to turn visual needs into authored, production-ready families that survive the real camera and can be multiplied coherently.

The target is not “more models.” It is stronger silhouettes, believable construction, material truth, role recognition, state variation and composition value. Dark generic hard-surface blockouts with cyan strips are a known failure.

## One production unit

One accepted unit is a **production asset-family seed** containing:

1. a player-facing need and role brief;
2. a distinctive primary silhouette or functional shape language;
3. a production-quality hero/base asset;
4. at least two useful siblings, state variants or modular compositions;
5. authored materials/markings/emissives/wear;
6. sockets, collision and LOD appropriate to use;
7. source → release → runtime identity where scope includes integration;
8. normal-camera and composition proof;
9. independent art verdict.

One mesh or one recolor is not a unit.

## Scale

- **1x:** one family seed; at least four concept/form candidates; primary plus two useful variants.
- **3x:** three complementary families or three accepted seeds sharing one construction/material standard.
- **5x:** five-family art wave spanning at least three scale/function classes, with a live composition, batching/residency proof and propagation guide.

## Current SpaceFace starting points

Audit:

- `docs/visual-assets/` production standard and templates;
- visual asset catalog and current accepted/candidate/donor identities;
- source/release manifests, parts library and runtime selector;
- current Blender/foundry/export tooling;
- NPC Activity Pack and Everyday Space Kit as donor concepts only;
- current faction/material/marking language;
- camera-visible bands, density and performance budgets;
- active remaster leases and exact-path ownership.

## Creative process

### 1. Start with a scene/role gap

Good:

> The Ceres mining seam has no production-quality ore carrier whose silhouette communicates bulk transfer at 95–165 WU.

> The refinery pocket has no mid-scale coupling/transfer family that explains how cargo moves.

Bad:

> We need more sci-fi props.

### 2. Build a functional/construction brief

Define:

- purpose and load path;
- dimensions and scale cues;
- operation/motion;
- material zones and thermal/wear story;
- sockets and collision;
- faction hooks;
- normal and damaged/abandoned/working states;
- camera-distance requirements;
- scene hierarchy role.

### 3. Diverge on macro form before detail

Generate at least four primary-form candidates with different:

- proportion;
- mass distribution;
- negative space;
- functional arrangement;
- silhouette;
- manufacturing logic.

Review in clay at real camera distances. Do not add greebles to rescue an unreadable form.

### 4. Design the family matrix

Choose useful variations across:

- capacity/scale;
- condition/state;
- faction modification;
- occupation;
- module configuration;
- clean/frontier/criminal maintenance philosophy.

Each sibling needs a production reason.

## Reference mechanisms

- **No Man's Sky:** artist-programmer tools and controlled procedural variation.
- **Horizon Forbidden West:** reusable texturing/shading workflows preserving art direction.
- **DUST 514:** modular standards producing coherent locations.
- **Hardspace:** forms/materials authored around operations.
- **Subnautica:** silhouette and color create immediate regional/creature identity.

## Implementation rules

- Follow current G0–G7 and exact-hash review process.
- Use external concept/reference generation as input, never as automatic final geometry.
- Prioritize silhouette, construction logic and material separation before effects.
- No DCC default, generic noise or flat normal map may stand in for surfacing.
- Author LODs deliberately; fixed-ratio decimation is not an art decision.
- Preserve shared cargo/manufacturing standards where useful.
- Use trim/atlas/material-role systems when they visibly preserve quality and reduce cost.
- Review in neutral, lit, adverse and live gameplay compositions.
- A technically accepted asset may still be cut from a scene for clutter/redundancy.
- Incubator assets are donors: select, re-author, then promote—never bulk wire.

## Adversarial review questions

- Does the silhouette survive at the intended camera band?
- Could the reviewer infer function without a label?
- Do components look structurally connected and load-bearing?
- Are materials distinguishable without bloom?
- Does it look like professional game art or generated blockout?
- Are family variants materially useful rather than padded?
- Does the asset improve the scene hierarchy?
- Is the cost justified by screen importance?

## Acceptance

A 1x family passes when:

- macro/meso form receives independent KEEP;
- material and state language survives live lighting;
- source/release identity, sockets, collision and LOD are valid;
- primary and variants are distinguishable and useful;
- normal-route scene proves function/readability;
- representative performance is within budget.

A 5x wave additionally needs:

- coherent manufacturing/material language;
- strong contrast among functions/scales;
- live sector composition using the families;
- batching/residency/LOD strategy;
- no visual regression to mud/darkness/primitive soup;
- a documented family multiplication recipe.

## Failure modes

- Primitive stacking with uniform bevel.
- Silhouette differentiated only by appendages.
- Recolor counted as a family.
- Contact sheets accepted without live route.
- Materials collapsing into clay/plastic/dark brown.
- Thousands of invisible-detail triangles.
- Props scattered because they exist.
- Five source-only packs with no promotion route.

## Example invocations

```text
WF-11 1x — production ore-carrier family for Ceres: base, overloaded and damaged states.
```

```text
WF-11 3x — Ceres ore carrier, repair tender and salvage cutter occupational family wave.
```

```text
WF-11 5x — Helios civic/logistics art wave: express, shuttle, customs, repair and passenger-transfer families.
```
