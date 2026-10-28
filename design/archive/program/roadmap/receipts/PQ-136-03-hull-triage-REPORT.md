<!-- LIFETIME: HISTORICAL -->
# PQ-136.03 — Hull triage receipt

- **packetId:** PQ-136
- **leafId:** PQ-136.03
- **candidateCommit:** (the commit carrying this receipt)
- **disposition:** PASS
- **acceptance:** focused_green

## What changed

Every authored hull now has a disposition on the record. 90 hull identities walked (LOD families
collapsed by manifest/hash, never a filename grep): **38 already live · 4 FIELD · 12 VARIANT ·
31 RESERVED · 5 CANNOT-USE**. Full table: `design/graphics-sprints/HULL_TRIAGE_2026-08-24.md`;
matching rows folded into `VISUAL_ASSET_CATALOG.md` (extended in place, no competing document).
Nothing was deleted, moved, or rewired.

## Top-ranked fielding candidates (the next work this record feeds)

Corsair Blade into Corsair raiders (kit exists); Reaver Hook variant so pirates and Corsairs stop
matching; Helios Arclight as a unique heavy; the three still-review-held work hulls
(volatiles_tanker / yard_tug / inspection_cutter) FIELD-ready pending the chase-camera review
already queued by PQ-136.02; Helios Span and Wasp faction kits; a damaged-salvage-cutter wreck
variant; an enclosed-hull pass on the construction rig.

## Controller corrections during review

The lane read the tree mid-surgery and recorded "express currently wears the apron shuttle" —
stale: the draft express reskin was removed before commit 13e377bd; express deliberately has no
whole-ship binding until PQ-049 delivers. Corrected in both files.

## Honest residuals

Factory remasters of Ashline/Helios/work boats stay RESERVED for PQ-050 (an earlier remap onto
them made ships invisible — do not re-wire them from this record). Hitch extras are freeze/donor
only. Third-party kit trees and the wreck/prop packs were out of scope (other leaves own them).
