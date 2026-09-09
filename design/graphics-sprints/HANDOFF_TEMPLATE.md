<!-- LIFETIME: HISTORICAL -->
<!-- Superseded process scaffold. EXPANSION_PROGRAM.md supplies research context and TOP10_ROI_ASSET_PLAN.md a measured ranking; neither dispatches work. Archaeology and technical reference only; it cannot direct implementation unless explicitly reactivated through an admitted packet. -->
# Cross-Thread Handoff Template

> **Activated-sprint template.** Use when concurrent ownership genuinely requires a handoff. It is
> not a default terminal state and does not replace end-to-end integration in ordinary work.

Paste this block at the end of every graphics sprint (Threads A, B, E) for the integrator and Thread C.

```yaml
handoff_version: 1
thread: A | B | E
sprint_id: 2026-07-08-kit-engines
agent: <session id>
completed_at: <ISO8601>

assets:
  - id: engine_vector
    source_glb: assets/ships/parts/engines/engine_vector.glb
    blend_path: assets/ships/parts/blender/engine_vector.blend | null
    art_status: full_finish | surfacing_wip | blocked
    review_status: independently_reviewed | author_review_only | needs_review
    evidence: assets/ships/parts/revamp-evidence/engine_vector/
    lifecycle: SOURCE_GLB  # CONCEPT | SOURCE_GLB | RELEASE_BUILT | MANIFEST_SLOT | RUNTIME_MAP | VISIBLE_IN_PLAY
    manifest_row: exists | needs_new_row
    runtimeSlots: engine  # slot name if kit part
    blocked: false
    blocked_reason: ""

integrator_actions:
  - run finalize_part.mjs if not done
  - npm run build:sg04:release-assets
  - update parts_manifest if new id
  - npm run check:assets:live

thread_c_actions:  # leave empty if already wired
  - add to PART_LIBRARY_CONTRACT.slots.<slot>
  - add engineRecordFor / HULL_FILE_BY_DEF_ID / PLACE_FILES / sectorAnchors as needed

forbidden_for_thread_c_until: RELEASE_BUILT

checks_required:
  - check:assets:live
  - check:asset-reachability
  - check:visual-stability
  - check:parts-manifest  # if manifest touched

screenshots_proven:
  - revamp-evidence/engine_vector/renders/<latest>_lit_34_full.png
  - revamp-evidence/engine_vector/renders/<latest>_lit_close_detail.png
```

## Lifecycle definitions

| State | Who sets it | Thread C may wire? |
|-------|-------------|-------------------|
| CONCEPT | Reference art only | No |
| SOURCE_GLB | A/B/E after export | No |
| RELEASE_BUILT | Integrator after release build | No |
| MANIFEST_SLOT | Integrator | Partial (slot only) |
| RUNTIME_MAP | Thread C | Yes — this is C's job |
| VISIBLE_IN_PLAY | Thread C + D + verify | Done |

## Inbox location

Save handoffs to: `design/graphics-sprints/handoffs/<YYYY-MM-DD>-<thread>-<batch>.yaml`

Integrator processes inbox before assigning Thread C work.
