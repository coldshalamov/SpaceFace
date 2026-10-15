# Orchard live pod thermal target readout

This additive increment follows the frozen 120-file shock successor. Its exact three-path delta is scripts/lib/simReadModel.mjs, src/ui/targetPanel.js and test/anvil-orchard-thermal-readout.test.mjs. It adds a bounded read-only planet.ships leaf projection (at most three genuine live Orchard records), carrying occupant generation, lot identity, heat, stage, region and observation time. The existing target facts row displays POD HEAT, stage and existing hull condition. Unavailable exposure stays unknown; saved thermal history is not a presentation fallback.

The default configured whole-sim route is worker. Tests exercise the actual production host serializer, structuredClone and frontend spawn/vitals/domain appliers in one process. They do not exercise a separate browser Worker, render a screenshot or establish live-camera/player-feel acceptance. Projection preserves structural sharing, removes dead/recycled records and makes no native readiness reads. This readout conveys exposure facts, not custody authority. VFX code and budgets remain unchanged. The forecast HUD transport and continuous sheath consumers require separate verification; this increment does not claim to fix them.

Focused tests: 12/12. Existing UI/domain neighbors: 21/21. Independent review: 25/25 (focused plus identity, site-custody, wire-parity and target-intel neighbors). Combined roster status is recorded in the sibling evidence and manifest. All Node runs use both --preserve-symlinks and --preserve-symlinks-main.

Publication must freshly verify feature-branch ownership and append this delta only after the shock increment. No merge or deployment is included. Original outcome gates for forecast, ordinary presentation and target-device performance remain open.

## Current upstream reconciliation

Master b7a2a434353347f0e78951b1cae0d26f3a1d00af changed targetPanel after the original123-file seal. The clean three-way merge preserves its salvage-legality import and full legality facts block alongside Orchard exposure facts. The old604 snapshot remains immutable. Focused merged readout/upstream legality/target-intel tests pass19/19; independent review approves the merge.

## Broader baseline status

Public b7 CI is not wholly green. Root reproduced separate baseline failures and retained exact reproduction logs in the recovery evidence. This focused Orchard result does not certify the entire repository or close unrelated CI gates. The current upstream20-path refresh and restored-neighbor evidence are also retained.

Final combined successor125 validation:646/646 across74files in113.167seconds. All125 source hashes match before/after. Canonical b7support plus frozen125 overlay excludes active Alin changes. Earlier overlay setup failures and their exact baseline-asset repair are retained; no gameplay source repair was needed. This full result belongs to successor125; predecessor123 additionally has its exact19-case merged validation.
