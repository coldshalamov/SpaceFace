# S-14 drafts — Frontier regions (Hyperion Cut, Dione Lane, Eris Margin, Eunomia Gulf, Haumea Rift)

## The Drifter (working-class regular)
The frontier is where he goes when the core stops paying. What he reads off a region is
the marks the first crews left: a claim stake on the far side of the chart, a tag where
nobody was supposed to be, a dead lamp somebody hauled out here on purpose. Draft per
region:
- Hyperion Cut — a second stake-line off the metallic seam (the Cut is a worked cut, the
  Caved Shaft already proves it) and a tag rock the drill crews marked before the cave.
- Dione Lane — the *watched* lane: a convoy tally post by the field where haulers waited
  out customs, and a tag rock on the seam's quiet edge (even the lawful lane has
  graffiti — it's just neater).
- Eris Margin — the Quiet margin: a dead watch pin looking at nothing on the metallic
  field, a mark stone whose plate says the filing is somewhere else.
- Eunomia Gulf — the licensed salvage yard: a lamp row somebody strung along the
  plate-drift field, a gulf-stake where the fence's crews mark what they've cut.
- Haumea Rift — the cold lab: a frost-tag on the icy field edge (observatory crews get
  bored), a listening pin dropped beside the crystalline seam.

## The Archivist (continuity and memory)
Five regions, five different registers — the plates must not read as one author. She maps
each to its station's already-authored voice: Hyperion's claim-crew shorthand, Dione's
manifest/legal voice, Eris's deniable Quiet terseness, Eunomia's salvage-ledger Latin
(license numbers, plate stamps), Haumea's instrument register (the observatory writes in
readings). Draft: each new POI plate carries one line of register-specific paperwork —
a filing number, a license stamp, a reading — before the human beat.

## The Skeptic (cold reader / anti-bloat)
Splittable row, and she enforces the split: five regions only, two POIs each, no zone
surgery, no hazard edits, no touching the foreign Haumea fissure-GLB hunk. Checks the
m2b contract: whitelist types only, `poi_*` ids, anchor rows with pos + landmarkGlb
required — so every new POI is a paired card+anchor edit in the same file. Vetoes:
station chartNotes (count pinned at 17), new fields (economy), new zones (the regions
each already carry named zones with reasons — duplicating the trick adds nothing).

## Tribunal notes (pre-scoring)
- Drifter picks the finds; Archivist sets each plate's voice; Skeptic sets the budget
  (2 per region, 10 total, all pool-neutral plated POIs).
- The silent wrecks in three of these regions (eunomia×2, eris, haumea) are S-13's
  memorial POIs — implemented in the same file hunks, credited to S-13.
- North.js foreign hunk (fissure GLB) untouched — additions append to `pois:` arrays
  and `NORTH_ANCHORS` rows only.
