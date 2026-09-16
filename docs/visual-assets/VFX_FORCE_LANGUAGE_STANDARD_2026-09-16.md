# SpaceFace VFX Force Language Standard — 2026-09-16

## Purpose

This document turns the current VFX upgrade into a reusable authoring system rather than a one-off polish pass.

The governing rule is:

> Declare the **force family** first, then the **specific verb**.

A VFX author must be able to answer four questions before touching rendering code:

1. **What force family is acting?**
2. **What gameplay verb is being expressed?**
3. **What moment is being shown?** (`arming`, `travel`, `lock`, `sustain`, `warning`, `contact`, `decay`, `failure`)
4. **What gameplay boundaries constrain it?** (`range`, `angle`, `ownership`, `duration`, `screen budget`, `reduced-motion`, `reduced-flash`)

If those four answers are not explicit, the effect is underspecified and should not ship.

---

## Force families

### 1. Machined impulse
**Fantasy:** dead, mechanical violence.  
**Used for:** ballistic guns, muzzle events, casing-adjacent flashes, kinetic discharge.  
**Visual primitives:** fractured cones, asymmetric sparks, pressure flashes, hot metal, directed debris, abrupt falloff.  
**Never:** soft glows, mystical swirls, generic energy fog.

### 2. Driven plasma
**Fantasy:** sustained engineered exhaust or plasma discharge.  
**Used for:** main drive plumes, reverse jets, directed hot exhaust.  
**Visual primitives:** nozzle collar, long convex sheets, layered convection, cooling edge, directional wake, velocity persistence.  
**Never:** bulbous blobs with no flow direction.

### 3. Metric stress
**Fantasy:** the local geometry of motion or gravity is being perturbed.  
**Used for:** well, repulsor, cone, skim, anchor-coupled fieldwork.  
**Visual primitives:** folded surfaces, pressure fronts, empty throats, tension bands, broken shells, vectoring ribs.  
**Never:** generic dots, stars, or swirls reused for every field.

### 4. Coherent energy
**Fantasy:** engineered aligned energy release.  
**Used for:** beam apertures, coherent launchers, directed emitters.  
**Visual primitives:** slotted apertures, split-lens emission, staged charge, clean packet alignment, disciplined decay.

### 5. Induced current
**Fantasy:** unstable electrical coupling and branching conduction.  
**Used for:** electrical tools, chain discharges, current bridges.  
**Visual primitives:** branches, arcing forks, transient bridges, flicker with topology, extinguishing junctions.

### 6. Reactive matter
**Fantasy:** a physical material has been sprayed, seeded, dispersed, or adhered.  
**Used for:** goo, chemical ordnance, residue, corrosion, foam, tagging clouds.  
**Visual primitives:** droplets, adherence, accumulation, splatter, clumps, streaking residue.  
**Never:** treat as pure light unless gameplay fiction says it is ionized or combusting.

---

## Identity stack

Every effect must read at three layers:

1. **Family readability** — the player can tell which physical/fictional force is in play.
2. **Verb readability** — the player can tell what is being done.
3. **Instance readability** — the player can distinguish this specific tool from sibling tools in the same family.

Color can help, but **shape, motion, and timing are the authoritative identity carriers**.

---

## Starter tool standards

### Seed
- Family: metric stress / anchor tool
- Read: locking frame, not suction
- Mandatory cues: articulated clamp geometry, travel state, lock state, warning state, anchor-state clarity
- Forbidden cues: inward gravity swirl

### Well
- Family: metric stress
- Read: inward deformation
- Mandatory cues: empty throat, inward-traveling bands, compressive feel

### Repulsor
- Family: metric stress
- Read: outward pressure release
- Mandatory cues: expanding shell breaks, outward ribs, burst front

### Cone
- Family: metric stress
- Read: sector-directed shaping of space
- Mandatory cues: sector-limited fronts, wedge silhouette, outward advected fronts

### Skim
- Family: metric stress / transport field
- Read: parallel intake lanes, not vortex and not cone
- Mandatory cues: lateral sheet banks, centerline collection, rail-like orientation

### Reverse jets
- Family: driven plasma
- Read: short authority thrust with visible gas flow
- Mandatory cues: nozzle collar, elongated flare, directionality, non-bulb shape

### Guns / launchers
- Family depends on weapon class, but source flash must always match weapon ontology.
- Mechanical guns: broken sparks, hard pressure, metal heat.
- Coherent launchers: clean apertures, staged optical charge.
- Electrical discharge: branching current.

---

## Authoring checklist for new effects

Before implementation, fill this out:

- **Name:**
- **Family:**
- **Gameplay owner:**
- **Trigger source:**
- **Primary verb:**
- **Life stages:**
- **Silhouette grammar:**
- **Motion grammar:**
- **Material grammar:**
- **Range/angle bounds:**
- **Decay behavior:**
- **Reduced motion fallback:**
- **Reduced flash fallback:**
- **Bloom-off readability check:**
- **Grayscale readability check:**

If the effect cannot survive bloom-off and grayscale review, it is not sufficiently legible.

---

## Implementation map in this packet

- `src/render/forceLanguage/catalog.js` — shared effect catalog and family metadata
- `src/render/forceLanguage/sweptSurfaceBatch.js` — folded-surface batch renderer
- `src/render/forceLanguage/fieldForcePresentation.js` — fieldwork recipes and lifecycle
- `src/render/forceLanguage/weaponDischargePool.js` — weapon-source VFX family renderers
- `src/render/vfx.js` — live integration and routing
- `src/render/weapons/presenter.js` — source event integration
- `src/render/thruster/...` — reverse-jet / plume corrections
- `scripts/vfx-force-language-lab.html` — diagnostic authoring lab

---

## Validation protocol

Minimum acceptance for a new or modified effect:

1. Unit / structural tests pass.
2. Effect reads correctly at normal distance.
3. Effect reads correctly against dark space and busy backgrounds.
4. Effect still reads with bloom disabled.
5. Effect still reads in reduced motion / reduced flash modes.
6. Effect does not silently fall back to another tool's look.
7. Effect decays when gameplay authority is removed.

Suggested commands:

- `npm run check:vfx-force-language`
- `npm run check:vfx-sleep`
- `npm run check:vfx-techniques`
- `npm run check:thruster:plasma-unit`
- `scripts/vfx-force-language-lab.html` — local authoring lab; open directly in a browser

---

## Design law

The screen is not merely reporting state. It is letting the player *compose motion as art*.  
Therefore the VFX system must do two things at once:

- explain mechanics with ruthless clarity
- reward skilled play with a woven tapestry of distinct, layered motion

If an effect is technically correct but visually interchangeable with another one, it has failed.
