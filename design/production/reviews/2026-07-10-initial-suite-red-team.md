# Initial Production-Suite Red-Team — 2026-07-10

**Mode:** independent read-only review
**Initial verdict:** REJECT
**Purpose:** preserve the rejection and remediation across chat compaction; do not rewrite it away

## Findings and disposition

| ID | Severity | Initial failure | Required disposition |
|---|---|---|---|
| RT-01 | P0 | Auto-approved terminal workers could mutate the deeply dirty live tree; post-hoc diff checks cannot repair destruction | SAFE-001 isolated transaction, enforced writable paths, lease/heartbeat, violation kill, separate stale-safe integration |
| RT-02 | P0 | Campaign schema accepted a fake `ACCEPTED` state with no reviewers, pending gates, empty evidence/hashes, and an open P0 | conditional ACCEPTED schema, digest/evidence/gate/quorum/defect requirements, plus legal-transition controller tests |
| RT-03 | P1 | Early-stop continuation/blocker claims were prose and accepted empty or “trust me” evidence | typed checkpoints/heartbeats/process state; three attempted remedies; controller relaunch/adjudication |
| RT-04 | P1 | Scheduler language could be read as multiple code writers | exact maximum of one code mutation lease and one Blender mutation lease; other slots read-only |
| RT-05 | P1 | Runtime/quality order and critic quorum contradicted | one normative state order; two different model families; third adjudicator on conflict |
| RT-06 | P1 | M2 stopped at three regions and silently narrowed the 24-region Alpha roadmap | three-region M2a proof followed by full-24-region M2b exit |
| RT-07 | P1 | Clean-wave counts and matrices were unresolved | exact M0–M6 consecutive-wave floors and held-out matrices in the build program |
| RT-08 | P1 | Accepted-coverage progress had no canonical ledger path/schema/owner/check | controller-derived `.devshots/production/coverage-ledger.json`, schema, source hashes, completeness gate, milestone hash snapshot |
| RT-09 | P1 | Asset profile and cycle floor could be downgraded in prose | controller-derived exposure tier and build-card schema with 20/8/3 floors and exclusive technique applicability |
| RT-10 | P1 | Asset spec claimed replacement authority but legally lost to F9 | proposed-amendment status, explicit conflict table, AUTH-001 before conflicting execution |
| RT-11 | P1 | Observatory detectors lacked thresholds, sampling, calibration, and paired replay equality | versioned v1 thresholds, fixed sample rates, ≥20 positive/negative benchmark, ≥90% sensitivity/≤10% FP, sim-hash/event equality |
| RT-12 | P1 | Audio and unknown visual failures could escape event incidents | native-rate video with mixed audio, audio analysis, full worst/median/best review, random windows, unclassified finding path |
| RT-13 | P1 | Image/video generation was only a bake-off idea | generated-media pipeline, packet, provenance/color/channel manifest, downstream ingestion and F9 boundary |
| RT-14 | P2 | Only Grok had a persistent start/resume recipe | runner-backed Grok, Claude, and OpenCode recipes; agy restricted until CAP-000 proves persistence |
| RT-15 | P2 | One CAP task mixed read-only smoke tests with mutating benchmarks | CAP-000 read-only, CAP-001 code/product, CAP-002 Blender, CAP-003 generated media |
| RT-16 | P2 | Existing-asset states used incompatible enums | stable classification schema with seven explicit lifecycle values |

## Verification required before superseding this rejection

1. Every JSON schema compiles with the repo's installed validator.
2. A fake ACCEPTED state and untyped blocker claim fail; a fully evidenced structure passes.
3. The whole diff has no whitespace errors or unresolved dispatch placeholders.
4. A fresh independent reviewer re-reads the revised suite and either passes it or opens new IDs.
5. SAFE-001 remains the first implementation packet; prose containment is not mistaken for an
   implemented safety boundary.

This review can be superseded only by a later append-only review record. Fixing the prose does not
mean SAFE-001, the campaign controller, observatory, or generated-media tooling already exists.
