# Hornet cycle 191 — chase-visible drive houses, cockpit, service well, and reducing LODs

**Counted:** yes as a full-job construction attempt; `REVISE` pending independent review, not
accepted or wired.
**Live retained:** C85 (`FDC3636BFC74FA0204D96AE0CE49A4F1D713AB040C74563CB07037B64EB37682`).
**Current source LOD0 sha256:** `3BA42DC9A59B3D5B719CBB149441E0FFCAAC77D56D42CE6B93A5BD5BF9D2AB8F`

## Full-job intent

Correct the C190 default-chase failures at the construction source:

- taper the aft pressure shell into two upward/rearward drive housings whose dark throats read in
  the legal D=144 chase view;
- enlarge and set back the real Boolean-excavated cockpit tub, raised glass shell, and four-sided
  frame;
- give the wings a deeper inboard section, a hull-panel carry-through fairing, and a trailing flap
  separated by a recessed slot;
- move one real radiator/service cut onto the dorsal spine behind the cockpit;
- make the authored LOD ladder strictly reducing while keeping all primary openings and the hull
  resolution floor.

## Evidence

| Still | Result |
|---|---|
| `play_chase.png` | Legal default chase at D=144; both drive mouths now read as paired upward/rearward throats and the aft body tapers into them. |
| `play_chase_abeam.png` | Legal abeam chase at D=144; canopy frame, wing section, and dorsal service well remain visible. |
| `play_chase_close.png` | Legal close chase at D=58; enlarged cockpit opening, wing root carry-through, flap separation, and radiator cassette are visible. |
| `drive_rear.png` | Diagnostic rear crop confirms the two recessed throats, ceramic liners, and dark bores. |
| `orm_isolation.png` / `normal_isolation.png` | Map-isolation stills generated for the material-density path. |

## Structural receipt

| LOD | Hull triangles | Total triangles | Draws | Bytes | SHA256 |
|---:|---:|---:|---:|---:|---|
| 0 | 33,042 | 45,802 | 60 | 16,207,644 | `3BA42DC9A59B3D5B719CBB149441E0FFCAAC77D56D42CE6B93A5BD5BF9D2AB8F` |
| 1 | 24,070 | 31,194 | 49 | 6,821,212 | `46FD7826B406895575640C9568A6F8A8B986F385C43910D0C3E5D87E77CB43B7` |
| 2 | 12,640 | 18,046 | 36 | 4,629,496 | `BAFCE2AF08C41A6C00F1917D8CA4505D8DD0FE48F1354068996A6D35219292A0` |

The ladder is strictly reducing (`45,802 > 31,194 > 18,046`) while every hull remains above the
12,000-triangle technical floor. All three reports retain successful canopy, twin-drive, and
radiator cuts. The LOD map ladder remains `1024 / 512 / 512`.

## Review slots

| Slot | Status | Required disposition |
|---|---|---|
| Form and chase continuity | `pending` | Independent controller review of default and abeam chase stills. |
| Material and visible zones | `pending` | Independent review of cockpit, wings, drive interiors, and service well. |
| Technical LOD and runtime admission | `pending` | Independent structural/hash review and later live-route admission check. |

No slot is self-accepted. C85 remains live and no runtime promotion is authorized by this record.
