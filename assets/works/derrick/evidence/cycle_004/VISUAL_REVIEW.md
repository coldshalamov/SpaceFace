# Derrick Cycle 04 visual and hierarchy inspection

- Candidate SHA-256: `B35007A82902BFC57017950E2A7BB4C8221984D3E090229A507BCCEFFB6F492A`
- Scope: source-asset hierarchy correction only. This is not integration, release, or G7 acceptance.
- Evidence inspected at original 1920x1080 resolution: `hook_identity.png`, `works_top.png`, `works_site.png`, `works_edge.png`, and `works_top_clay.png`.
- Hierarchy diagnostic: four markers occupy four distinct authored locations: the drum pivot, cable anchor, left lamp, and right lamp. No marker remains piled at the asset origin.
- Retained picture: the Cycle 03 dark lamp hoods and recessed lenses remain legible at works-top scale; the four site shoes remain distinct at works-site scale; the open well, offset brown drum and cable path, crown sheave, platform, A-frame spread, grate, and material separation remain unchanged.
- Export inspection: the four functional nodes retain non-identity local transforms, their meshes are local to those pivots, and the collision helper retains its authored centre and half-extents.
- Component decision: `KEEP` for the Cycle 04 hierarchy/export correction. Whole-asset gates remain open pending controller review and integration.
- Remaining risk: runtime animation/control semantics have not been exercised against this source candidate. The controller owns integration, independent review, and release acceptance.
