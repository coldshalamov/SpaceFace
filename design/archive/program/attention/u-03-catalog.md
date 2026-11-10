# U-03 catalog — charts (galaxyMap/starmap/localmap)
starmap.js + localmap.js are clean; galaxyMap dirty-status unclear. Copy banks inside
(HAZARD_LABEL/DRIVER_LABEL) are enum-keyed and mirrored by `check-cause-ledger.mjs` — entries
can't be appended without a matching emitted tag; unknown keys are dead copy.
Verdict: NO LANDABLE SEAM — every authored string on this surface is either inside an
enum-pinned bank or live layout. Ledger left open.
