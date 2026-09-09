# Repository Artifact Retention

This file separates durable product knowledge from generated evidence and local process debris.
It prevents agents from treating every text file as design authority or deleting evidence merely
because it is large or machine-generated.

## Retention classes

| Path | Class | Keep in Git? | Use for decisions? | Rule |
|---|---|---:|---:|---|
| `src/`, `styles/`, `electron/`, `scripts/`, `tools/`, `test/` | implementation | yes | yes | Product and verification source. |
| `design/program/` | global status | yes | yes | Sole cross-program done/remaining/acceptance roll-up. |
| `design/**` active suites | specification | yes | yes, within scope | Resolve ownership through `design/PLAN_REGISTRY.md`. |
| `docs/EVENT_ROUTING.md`, `docs/SYSTEM_REGISTRY.md` | generated navigation | yes | yes, after regeneration | Rebuild with `npm run build:indexes`; do not hand-maintain counts. |
| `docs/worldbuilding/sheets/` | discovery index | yes | no, by itself | Locate prose and runtime records; prose owns voice, runtime code owns implementation truth. |
| `assets/**/evidence/`, `.devshots/` | acceptance evidence | selective | yes, when hash-bound/current | Preserve accepted evidence; `.devshots/` is local by default and should be promoted deliberately. |
| `.campaign/` | active controller state | no by default | yes, for the active campaign | Local/ignored. Never read SAFE review bodies; follow `design/production/ORCHESTRATOR_GOAL.md`. |
| `terminals/`, `agent-tools/` | local transcripts | no | no | Ignored. Preserve a durable conclusion in a maintained document; use Git history for old tracked snapshots. |
| `advisor-artifacts/`, `scratch/`, `.tmp/` | local diagnostics | no | no | Ignored. Promote only a named, reproducible result required by an acceptance record. |
| root `/.tmp*`, `/.grok-scratch/`, build outputs | local scratch | no | no | Disposable and ignored. Never cite as durable proof. |
| `skills/` | vendored generic guidance | yes while intentionally vendored | no | Not SpaceFace policy; root and nested `AGENTS.md` files win. |
| `design/_ARCHIVE/` | historical reference | yes | no, unless revived explicitly | Never a build order or current status source. |

## Promotion rule

Generated output becomes durable only when a maintained document or acceptance record names it,
records why it matters, and provides enough provenance to reproduce or validate it. Otherwise keep
it outside the repository or under an ignored path.

## Cleanup rule

- Routine transcripts, tool dumps, and regenerable diagnostics do not belong in Git. A dedicated
  cleanup may remove previously tracked residue when the path has no current work or maintained
  consumer; Git history remains the archaeology surface.
- Do not treat file size, age, or agent authorship alone as a deletion reason for product source,
  authored media, accepted evidence, or maintained specifications.
- Remove or archive a document only after its useful intent is represented by a stronger authority.
- Prefer a short status banner and a canonical pointer when old content remains valuable for context.
- A transcript is never a substitute for a live check, player-route capture, or inspected code.

## Large files

GitHub's normal file limit is not an asset-quality budget. Release assets should remain high quality,
but generated intermediates, dense authoring sources, and duplicate candidates should live in the
documented asset-source/evidence pipeline rather than being committed accidentally. Follow
`assets/AGENTS.md` and the asset provenance manifests before moving or deleting any asset.
