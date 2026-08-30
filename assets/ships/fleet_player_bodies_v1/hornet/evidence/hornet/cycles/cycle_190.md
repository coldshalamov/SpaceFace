# Hornet cycle 190 — restrained plate density / current candidate

**Counted:** yes as a full-job construction attempt; `REVISE` pending independent review, not
accepted or wired.
**Live retained:** C85 (`FDC3636BFC74FA0204D96AE0CE49A4F1D713AB040C74563CB07037B64EB37682`).
**LOD0 sha256:** `D2BD418C466E5F4D8EA938D39EC5729F7021029FC561C6CA8B4BE89F69E25BA8`
**LOD0:** 12,714 hull triangles / 26,406 total triangles / 12,910,220 bytes.

## Full-job intent

Retain C189's form and value hierarchy while blending the narrow repeated seam bands in the
unique hull/armor basecolor, ORM, and normal maps. The map ladder and UV0 unique bake/UV1 detail
path remain intact; the change reduces the close-camera checkerboard read without removing
material density.

## Evidence

| Still | Result |
|---|---|
| `play_chase.png` | Legal default chase framing; aircraft remains correctly sized and centered. |
| `play_chase_abeam.png` | Legal abeam chase framing; dark wing and steel hull grouping remains stable. |
| `play_chase_close.png` | Legal close chase framing; plate seams are less grid-like while construction remains visible. |
| `drive_rear.png` | Both real recessed throats remain visible with inner bore and vanes. |
| `orm_isolation.png` / `normal_isolation.png` | Map-isolation stills generated for the material-density path. |

**Independent review:** not yet allocated. Controller acceptance remains open; no promotion.
