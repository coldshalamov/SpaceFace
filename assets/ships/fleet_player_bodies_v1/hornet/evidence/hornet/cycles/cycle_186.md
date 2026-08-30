# Hornet cycle 186 — continuous chined shell / real drive throats

**Counted:** yes as a full-job construction attempt; `REVISE`, not accepted or wired.
**Live retained:** C85 (`FDC3636BFC74FA0204D96AE0CE49A4F1D713AB040C74563CB07037B64EB37682`).
**LOD0 sha256:** `EA69AC2607CEF82466A26C3C3B557322B45704E73C91AAA3978A5EBE39094180`
**LOD0:** 13,250 hull triangles / 26,820 total triangles / 13,099,752 bytes.

## Full-job intent

Replace the rejected C185 three-house reset with one continuous chined pressure shell, wing
carry-through surfaces, an excavated canopy tub, and recessed twin drive throats. The frozen
Hornet root, sockets, +X forward, collision envelope, and non-emissive authored material roles
were preserved. LOD map ladder is 1024 / 512 / 512.

## Evidence

| Still | Result |
|---|---|
| `play_chase.png` | Legal default chase framing; curved wing carry-through reads, but canopy is weak at play size. |
| `play_chase_abeam.png` | Legal abeam chase framing; continuous planform reads, rear structure is not legible. |
| `play_chase_close.png` | Legal close chase framing; improved broad shell, but material grid dominates. |
| `drive_rear.png` | Both throats are visibly recessed with flange, ceramic annulus, bore, and vane stack. |

The first export exposed a construction bug: the Boolean modifier omitted its cutter operand and
both drive cuts were disabled. That was repaired before this cycle record; the final build reports
both drive wells `opened: true` and canopy/radiator cuts successful.

**Independent review:** not yet allocated. Controller acceptance remains open; no promotion.
