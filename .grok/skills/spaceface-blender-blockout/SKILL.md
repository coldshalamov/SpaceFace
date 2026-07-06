---
name: spaceface-blender-blockout
description: >
  SpaceFace Blender Modeling Pass — professional hard-surface form using the full range of advanced Blender modeling tools and rigorous iteration. Not a "basic starter". Use for any asset needing strong base geometry (ships, stations, props). Must precede surfacing and life passes for hero work. References professional-techniques.md heavily.
---

# SpaceFace Blender — Modeling Pass (Professional Form Establishment)

**Core job:** Use the full power of Blender's modeling tools to create a base mesh whose form and topology demonstrate professional hard-surface craft.

This pass is not "make a basic readable model." It is the foundation pass that must already show real quality before any surfacing or life work. Previous low-quality output happened because agents treated modeling as "get a silhouette + a few bevels and move on." This pass exists to stop that.

Reference the detailed techniques in `references/professional-techniques.md` (Modeling section). You must actively use and document many of them.

## What Tier 1 looks like vs references

| Signal | Tier 1 (this skill) | Tier 2/3 (later skills) |
|---|---|---|
| Silhouette | Clear fighter/capital read | Same, plus secondary masses |
| Surface | Large flat panels, few insets | Thousands of panels + greebles |
| Color | 1–2 flat albedo zones | Wear, rust, accent zones in maps |
| Depth | Bevel corners only | AO + normal baked recesses |
| Glow | Solid emissive blocks | Masked emissive on thrusters/windows |
| Tri budget | Within kind budget | Same budget, detail from maps not tris |

**Do not stop at Tier 1** for player hero ships, station landmarks, or wholeships in `assets/QUEUE.md` marked priority — chain to Tier 2 → Tier 3.

---

## Read first

- `assets/AGENTS.md` §2 ship visual stack
- `assets/concept/index.json` for mood ref
- `tools/blender/spaceface_export.py` — chamfer law applies even at Tier 1

---

## Mandatory Rigor Protocol (this is non-negotiable)

You will not model once and stop. Follow this loop for every asset until it demonstrates professional craft per `references/professional-techniques.md`:

1. Load any provided concept/reference art (or project bible/concept images from assets/) as reference planes.
2. Build/refine using many techniques from the Modeling section of professional-techniques.md.
3. Set up a proper review rig: orthographic cameras (front/side/top) + 3/4 perspective + turntable.
4. Render clean clay/matcap evaluation images (flat lighting or matcap, no heavy HDRI).
5. Critically evaluate the renders. Create a written "Deficiency List" of at least 8-10 specific issues, explicitly naming missing or poorly executed techniques from professional-techniques.md (e.g., "insufficient support loops around booleans", "bevels lack consistent radius and profile control", "no use of Geometry Nodes or linked instances for micro detail", "UV stretching visible, no advanced relax/pin usage").
6. Fix by deliberately applying the named advanced techniques (use MCP code for precision where helpful).
7. Re-render, re-evaluate, repeat.

You must reach the point where the clay model shows clear evidence of professional modeling practice. "It has a shape and some bevels" is failure.

## Required Advanced Blender Techniques — You must use and demonstrate most of these

This pass is where you prove you are using more than 10% of Blender:

**Core Hard Surface Tools (mandatory mastery):**
- Full modifier stack (order matters): Bevel (with segments, profile, weight, limit method), Boolean (with exact solver + cleanup), Weighted Normal, Data Transfer, Mirror with bisect, Solidify for thickness where appropriate.
- Edge bevel weighting and creasing instead of just raw subdiv.
- Proper boolean workflow: cut, then clean topology with support loops, knife, and dissolve.
- Grease Pencil for precise panel flow guides + knife project.
- Loop Tools / Relax / Space for clean edge distribution.
- Knife, Bisect, and manual retopology where needed for professional quads.

**Topology & Form Rigor:**
- Quads on all visible surfaces. Triangles only where unavoidable and hidden.
- Support loops around every hard feature before and after booleans.
- Consistent bevel radii language across the entire model (match the scale you see in the pro refs).
- Use Sculpt mode (with dynamic topology or multires) for organic form adjustments and wear hinting on the base mesh.
- Non-destructive as long as possible — apply only when necessary for export.

**UV & Preparation (do not defer to later passes):**
- Proper UV unwrapping with pins, relax, and minimize stretch tools.
- Seams hidden on undersides and non-hero areas.
- Start thinking in trim sheets / repeating elements even here.
- Texel density awareness (use the UV squares add-on or manual check).

**Review & Iteration Tools:**
- Multiple camera setups for orthos + hero angles.
- Matcap or flat lighting renders for pure form evaluation.
- Turntable or multi-angle renders.
- Side-by-side comparison in Blender (image planes) or external.

**Other power tools you must consider:**
- Geometry Nodes even in modeling pass for repeatable structural elements.
- Vertex groups for later weighting and masking.
- Custom normals / auto-smooth control.

Tri budgets still apply (respect them with smart decisions), but **professional quality within budget** is the goal, not "stay low poly".

**Artifact requirements:**
- Multiple clean clay evaluation renders (ortho + perspective angles, turntable frames).
- `modeling_iteration_log_<id>.md`: deficiency lists that explicitly name techniques from professional-techniques.md + what was done to address them.
- Final clay renders showing the model has professional form quality.

**Gate:** The model demonstrates multiple advanced modeling techniques from the reference doc in a visible, quality-elevating way. It should not read as basic low-effort geometry. If a 3D forum reviewer would say "this is still very basic modeling," continue iterating.

---

## Material setup (minimal for form evaluation)

Use simple single-color Principled BSDF per role for pure form reading during iteration. Do **not** spend time on complex materials here — that is Pass 2.

Save the real surfacing for the dedicated Surfacing Pass.

## Optional image-gen (support only)

Use only for early silhouette exploration. Always manually rebuild in Blender with the full toolset above. Image-to-3D or lazy generation is forbidden.

## Exit criteria for this pass

This pass is complete only when:

- Multiple high-quality clay renders exist that, when placed side-by-side with the pro reference images, show a model that demonstrates real hard-surface craft.
- You have the iteration log documenting repeated comparison + application of advanced techniques.
- Topology is clean enough for professional baking later.
- All major pro deficiencies from your comparison list have been addressed.

**Do not move to Surfacing Pass until the base form demonstrates professional modeling craft per the techniques reference.**

**Next:** Surfacing Pass.

## Anti-patterns (banned)

- One-and-done modeling.
- Accepting basic topology and form.
- Using only a tiny subset of modeling tools.
- Low iteration count or shallow deficiency lists that don't name specific advanced techniques.