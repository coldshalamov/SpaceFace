# FB-133 — The packaged volatiles tanker and inspection cutter are fielded with their jobs

**Kind:** wire · **Lane:** THE WORLD · **Routing:** open
**Seam tags:** seam: occupationalTrafficCraft.js, seam: traffic.js
**Write-set:** `src/data/occupationalTrafficCraft.js`, `src/systems/traffic.js`, `test/fb-tanker-cutter-fielded.test.mjs`
**Neighbours (extend, never restate):** SF-221, SFQ-B098

## The gap
`OCCUPATIONAL_TRAFFIC_CRAFT` maps five packaged hulls to job kinds and its own header documents
`volatiles_tanker` and `inspection_cutter` as packaged but deliberately unfielded; `traffic.js` zeroes the
`tanker` and `customs` ambient weights outside Helios. Two authored working craft never fly. Adjacent to
SF-221 (a convoy readable as a working group).

## Why this direction
Two data rows un-zero the roles; the tanker takes the hauler graph with a volatile lot and the cutter takes
the patrol graph with the customs scan verb.

## Mechanism
- Add the two rows; give tankers a volatile manifest (so `cargo:volatileCryo` and friends fire on a spill) and
  cutters the inspection graph, weighted into sectors with refuel or customs services.
- Pin that both spawn on seed 4242 in the right sectors and that their job signature profiles resolve.

## Done when
`test/fb-tanker-cutter-fielded.test.mjs`: both fielded, signatures resolve, no spawn in sectors without their
service; `npc-jobs-runtime-occupational-heads.test.mjs` stays green.

## Do not
Do not raise ambient counts. Do not add hulls. Do not field them in high-sec cores as ambient pirates' prey
without the escort mix.

## Focus test starting points
- `test/npc-jobs-runtime-occupational-heads.test.mjs`
- `test/traffic-role-mix-reads-contents.test.mjs`
