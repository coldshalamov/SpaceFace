# ui-polish-166: Research head shows whole rungs and keeps its chevron

**Before (master d2eb44d4fe):** the Research head's pacing line ("A verb every hour ›" over the first rungs) was a single ellipsis-clipped string. At 960×540 and 1024×480 its 20vw cap (192px) cut the chevron to a sliver and the rungs read "1 PROPELLED CHARG…"; at 1280×720 and 1920×1080 they read "1 PROPELLED CHARGE · 2 …".

**After:**
- `techTree.js`: each rung is its own nowrap span on a one-line row. A ResizeObserver hides any rung that wraps below that line, so the head shows whole rungs and never a cut word. The full ladder still opens on hover, focus or click as before.
- `tech-treeLayouts.js`: the rungs row is a one-line wrapping flex row (no ellipsis).
- `constellationLayouts.js`: at 761–1100 × ≤600 the curve may take `min(300px, 30vw)`, which keeps the chevron whole and still clears the rim names.
- No selector or ID changes. The phone layout (where both rungs already fit) is unchanged.

**Checked:** bench `tech-tree` at 390×844, 960×540, 1024×480, 1280×720 and 1920×1080. 960×540 and 1024×480 are now clean, and 1280×720 and 1920×1080 stay clean. 390×844 keeps master's two notes about the Requires list scrolling under the foot. Tests: `lg-verb-curve` 1/1, `tech-tree-research-truth` 3/3. Type floor OK. Compares (not committed): `/workspace/spaceface-scratch/ui-shots/polish166/compare-techtree-*.png`.

**Leftovers:** the phone Research page shows no constellation, only the node picker (by design at ≤760).
