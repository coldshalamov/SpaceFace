# PQ-167 — Session reporting and observed weekly playtests

<!-- LIFETIME: ACTIVE_RECEIPT -->

Session export and gate calculation are implemented. Four consecutive owner playtests remain unproven.

The September 3 receipt claimed four verified weeks and several release milestones. The recorder actually used `createDemoSession`, supplied default findings, invented capture paths, and printed passing milestones without consuming their evidence. Those claims are withdrawn. The four old session files remain preserved for inspection and are excluded from release calculations because their supporting owner/capture records are absent.

The recorder now requires a completed session export, an existing capture, an exact build commit, an explicit statement that the owner played, and three supplied findings. It preserves missing funnel milestones and rejects demo data, future sessions, inadequate duration, duplicate destinations, missing captures, and invented default findings. These checks validate the supplied records; they do not independently prove who played.

The weekly check verifies session dates and four consecutive weekly observations. The gate report computes only its telemetry subset, marks other milestones unmeasured, and returns a failing exit code for missing evidence. Anonymous sessions no longer imply a return rate. Empty datasets render without crashing.

Direct verification: 18 session-report, telemetry-funnel, and playtest tests passed. The real stored dataset admits zero verified sessions and the gate correctly exits 1. Entry baseline was 13/14: the inherited v3 simulation hash differs from its golden, and the full baseline exceeded its wall-time budget. No golden was changed.

Remaining external requirement: four actual weekly owner playtests with their session exports, captures, and findings. No synthetic session or agent report substitutes for these observations.
