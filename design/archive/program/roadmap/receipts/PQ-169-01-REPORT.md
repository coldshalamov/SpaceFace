<!-- LIFETIME: ACTIVE_RECEIPT -->
# PQ-169.01 — Ghosts

```text
DONE  PQ-169.01 — a shared Crucible run's pose tape plays back as a translucent ghost hull, and two machines that hold the same tape get the same hash.

WHAT I FOUND     Daily seed and today's board were already local. There was no pose tape, no shared ghost hash, and nothing in the arena that flew last run's line.

WHAT I CHANGED   A Crucible run now records the live hull's pose, hashes that tape so two copies of the same file match, and keeps it on the local record. The door can race the last ghost for this seed. The ghost is a see-through hull on rails — it does not shoot, ram, or write campaign money. Playback arms only on a live survival start, so an ordinary New Game cannot inherit a leftover ghost.

WHAT YOU WILL FEEL   Finish a Crucible run and the next time you pick that seed, Ghost offers to race the last recorded hull. It is translucent and does not fight you. There is still no online share, no Steam board, and no weekly twist.

THE NUMBERS      bar | before | after | target
                 same tape JSON, two independent storages | missing | both 1864785429 | identical uint32
                 change one sample | n/a | hash differs | different
                 ghostPoseAt at recorded tick 6 | missing | x=6 z=0 r=0.5 | sample hit
                 ghostPoseAt between ticks 0 and 6 | missing | x=3 r=0.25 | interpolates
                 settle + reload + second storage JSON | 0 ghost rows | hash 1864785429, 3 frames | persists
                 empty tape writes a ghost row | n/a | 0 rows | 0
                 campaign credits / weapons / Rapier body on ghost | n/a | credits unchanged, no weapons, no Rapier | not a combatant
                 non-survival start arms leftover playback | would show in adventure | tape null, hash still queued | no
                 PQ-169.00 daily seed 2026-09-06 | 1537801443 | 1537801443 | unchanged

THE FRAMES       Not a camera leaf. GPU was reserved. The claim is a hash, a save bag, and pose playback, proven in node tests.

NEXT             PQ-169.02 Weekly mutators.
```

## Controller verification — 2026-09-07

Landed from `C:\sf-wt\pq16901` onto primary after review. Playback now arms only when a live survival run is on the machine, so a leftover Ghost queue cannot appear in ordinary New Game. Focused tests on primary: `test/crucible-meta.test.mjs` + `test/crucible-record-band.test.mjs`. `npm run check:crucible:meta`. Headed `check:crucible:route` not re-run (GPU reserved).
