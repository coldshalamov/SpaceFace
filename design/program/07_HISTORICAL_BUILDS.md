# Historical Builds and Deferred Verification

**Status:** history index, not current work order or acceptance authority.

This ledger records substantial builds whose implementation plans are finished or whose commit is useful
for archaeology. “Historical build” means the build happened; it does not mean every behavior, visual,
performance, or platform claim was accepted. New work comes from `NOW.md` and `roadmap/`, not from the
archived handoffs linked here.

## Recent builds

| Build ID | Commit | Implemented scope | Current evidence | Later verification debt |
|---|---|---|---|---|
| `HB-2026-07-16-SPRINT-1` | `f277c5e7` | Large repository-hygiene pass plus content, encounter, UI, render, flight, input, story, and test changes. Added `POLISH_BRIEFING.md` as a code-research snapshot. | Commit is recoverable. Its breadth means commit presence is not subsystem acceptance. | Review by coherent owner subsystem; rerun affected focused checks at current HEAD; promote remaining `POL-*` outcomes through active packet IDs before archiving the briefing. |
| `HB-2026-07-17-MENU` | `88f558da` | Main/pause/menu-family overhaul and shared menu fascia. Original handoff is archived at [`../_ARCHIVE/historical-builds/2026-07-17/MENU_OVERHAUL_BRIEF.md`](../_ARCHIVE/historical-builds/2026-07-17/MENU_OVERHAUL_BRIEF.md). | Current audit: UI identity 13/13, screen imports 41/41, a11y, and player-facing labels passed. Local `.devshots/menu-overhaul/` captures exist but are ignored and not build/hash-bound evidence. | Re-capture browser and packaged Electron at one committed revision; bind image hashes, route, settings, resolution, and performance; review every migrated menu and focus/input mode. |
| `HB-2026-07-17-DRILL-3D` | `88f558da` | Replaced the drill playfield presentation with the Three.js asteroid interior and added Asteroid Sites/console groundwork. Original render handoff is archived at [`../_ARCHIVE/historical-builds/2026-07-17/DRILL_GRAPHICS_REVAMP_PLAN.md`](../_ARCHIVE/historical-builds/2026-07-17/DRILL_GRAPHICS_REVAMP_PLAN.md). | Current audit: Asteroid Sites 15/15 passed; `.devshots/drill-3d/` and `.devshots/asteroid-works/` are local ignored captures, not durable acceptance. | Public enter→operate→save→Continue→exit route in browser/Electron; visual stability, sparse/dense performance, asset provenance, input/a11y, and capture hashes. Active future mechanics remain in `ASTEROID_OPS_VISION.md`. |
| `HB-2026-07-17-MAP` | `88f558da` plus occupied follow-up | Large one-map implementation and strategic chart presentation. Plans remain active/deferred, not archived. | Map authority 9/9, inspector, confidence 3/3, intent glyphs 4/4, and known/live prices 3/3 passed in the audit. `check:m2:map-cutover` was 13/14; region-data was red while `src/data/sectors.js` carried concurrent palette work. | Let `MAP-2026-07-18` land; rerun complete cutover, public browser/Electron navigation, save semantics, current captures, contrast, and perf before historical promotion. |

## Deferred verification queue

| Verification ID | Build | Exact later action | Completion evidence |
|---|---|---|---|
| `HBV-001` | MENU | Run title, New Game, pause, save/load, settings, help, and return-to-flight routes with keyboard, pointer/trackpad, and gamepad in browser and packaged Electron. | Current commit/build identity, route log, UI/a11y/perf results, hash-bound captures, clean teardown. |
| `HBV-002` | DRILL-3D | Run fresh and restored asteroid operations at sparse/normal/dense site complexity, including survey, machine placement, fault/recovery, exit, and re-entry. | Semantic receipts, save artifact, visual-stability/perf results, browser/Electron media and provenance. |
| `HBV-003` | MAP | After the occupied lane closes, prove one live map route and all data fallbacks without legacy-map dependence. | `check:m2:map-cutover` all green, public route, source pin, current media and no orphan process. |
| `HBV-004` | 7/16 + 7/17 broad commits | Review high-risk shared seams—input, registry/defaults, save, render, UI root, expected telemetry—by owner rather than accepting the aggregate commit. | Per-seam diff review and focused proof recorded at the current commit. |

## Historical-plan policy

- An archived plan is read-only archaeology. Do not resume its unchecked boxes directly.
- If later verification finds a defect, open or update a stable roadmap packet and cite the build ID.
- If an archived design contract is still authoritative, move that compact contract into an active owner
  document before deleting or further compressing history.
- Ignored screenshots and old green logs can guide reproduction; they cannot promote a current status.
