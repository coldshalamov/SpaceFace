# Derrick Cycle 04 independent source review

- Candidate SHA-256: `B35007A82902BFC57017950E2A7BB4C8221984D3E090229A507BCCEFFB6F492A`
- Reviewer: `/root/derrick_cycle04_review_resume` on 2026-08-29.
- Reviewed source commit: `f05f09ca58e11789128021b82610ba304355ee8f`.
- Scope: exact-hash source candidate only. This is not release/runtime G6 or player-route G7 acceptance.
- Evidence inspected at original 1920x1080 resolution: `hook_identity.png`, `works_top.png`, `works_site.png`, `works_edge.png`, and `works_top_clay.png`.
- Hierarchy diagnostic: four markers occupy four distinct authored locations: the drum pivot, cable anchor, left lamp, and right lamp. No marker remains piled at the asset origin.
- Retained picture: the Cycle 03 dark lamp hoods and recessed lenses remain legible at works-top scale; the four site shoes remain distinct at works-site scale; the open well, offset brown drum and cable path, crown sheave, platform, A-frame spread, grate, and material separation remain unchanged.
- Export inspection: the four functional nodes retain non-identity local transforms, their meshes are local to those pivots, and the collision helper retains its authored centre and half-extents.
- Independent decision: `KEEP` for the complete Cycle 04 source candidate, with no P0/P1 defects.
- Reviewer-found P2: the original material-ID isolation was grayscale. It was rerendered and direct-verified at rebased commit `7ca946c7a4a109f410e24e6bdd3595e7bf384eff`; the repaired PNG hash is `DA1FA13BE4B04C9EF85DFAC600126141B492F202706EFBE9F2FD6E9AEBA12F76` and contains 7,302 chromatic pixels. The source and parts GLBs remained byte-identical.
- Remaining gap: release/runtime G6 and player-route G7 remain open until the authored part is built, packaged, loaded through the works lease, and judged on the normal route.
