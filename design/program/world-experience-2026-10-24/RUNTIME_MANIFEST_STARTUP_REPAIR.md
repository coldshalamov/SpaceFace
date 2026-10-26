# Current additive factory import regression

The original orphan-registration correction landed independently in PR585; all current master manifest, membership test, factory and character work remains unchanged. Mop and Receipt export repairs also landed upstream. This successor adds only a third asynchronous test to the existing isolated gate: dynamically import the actual Node factory module, verify its public factory functions, construct the default lookup and require every current Node-safe initialized owner to have a definition. No hardcoded actor list/count, factory workaround, workflow edit or gameplay initialization.

The two original pure-manifest tests remain unchanged. The new test is syntax checked and source reviewed, not locally executed against a complete current graph; hosted qualification is explicitly pending. Mixed archive dependencies would not establish the required import contract, so no local current-graph pass is claimed. The reachable gate now expects3 TAP tests.

Prior head74cba490/run40109520149 passed2/2 startup tests, then broader CI ended failure16:34:51 UTC. Completed static2/static3/sim/feel failures matched actual-base9a88; cancelled comparison groups prevent blanket baseline equivalence. That prior gate did not exercise the new dynamic factory import.

## Historical repair and evidence

# Isolated startup gate after the landed manifest repair

PR585 landed the orphan-registration correction at03fb16fd792001ce5abc668711d5611e28a9972d and added a real Node-factory membership regression. PR586 subsequently landed the split-identifier and warm-teardown runtime fixes atb683b23ce299fe7dd746da9547c34d1cac5aff05. This draft now preserves those changes and every newer master file. It does not reapply or duplicate the landed runtime repair.

Remaining scope is three files only: the two-test isolated pure-import regression, its reachable package check leaf, and this historical evidence report. Current master9a88f14bdbc35797de4bb1bb589ff0004e6a41a6 manifest c45fd45034f05d6338b02cd98f08556b0277e5ae and full manifest test a73362a1af0d24a917945936e3914ae6179cb8d2 (238 init/185 update plus the factory test) are retained byte-for-byte. The earlier233/180 observations below describe the historical c564312e graph, not current counts or current acceptance. Fresh hosted results are reported in the PR body; upstream authors' boot claims are not substituted for our validation.

## Historical repair and qualification

The public DOCKET commit 0a59973d4ed45040cd05e77ba8a129fec7cecd64 also added unrelated shipbreaking-yard, tender, outfit, disaster and workshop registrations without their factories or composition exporter. On master 719a82b85c07417e8661460147ed3977031ceb57, importing the pure manifest fails with ReferenceError at line 59.

This correction removes only those dangling init/update references. It retains DOCKET's init, update and table-clock entries and all existing prompt capabilities. It does not remove feature code or cancel planned shipbreaking/tender/outfit/disaster/workshop integration; those integrations remain OPEN until their actual factories, composition and clocks land coherently.

Validation: exact public manifest plus runtimeProfiles reproduced the failure in Node VM modules without game/browser factories. Corrected sources pass two isolated startup tests and the existing count/order testcase (3/3), on the original 719a82b base with 232 init IDs, 180 update IDs and no clock violations. Static membership comparison against both current public factory tables, including their explicit slot aliases, finds no missing applicable IDs. Public systems/runtime/data/world directory trees were nontruncated and have no implementations for the dangling names. This is not full game boot, browser, Save/Continue or whole-game acceptance.

Publication gate: check:runtime-manifest-startup directly runs the two isolated tests. Inspected 311-command/233-static graph places it on static shard2/3. Existing command order/classifications/workflows are unchanged. The existing full manifest test retains exact233/180 count assertions after preserving the newly landed Wex ticket; its other integration cases were not run locally. Hosted full-checkout results must be reported separately.

Ownership: current open PR509 and PR480 modify different manifest capability-map hunks, not these orphan init/update references. No absorption of those capabilities or other draft ancestry. Separate draft repair; no merge/deploy and no automatic changes to consumer PR582/583.

Conflict reconciliation: master c564312e4466303e658b50b380cb3e08e7ce94f2 includes Wex ticket registration and subsequent review/board documentation. The public-parent merge child preserves all of that work, retains Wex in init only, and removes the same orphan references. The count is now 233 init/180 update. Fresh exact public manifest/profile sources passed both unchanged isolated startup tests and the actual first count/order testcase: 3/3, exit 0, 233 init/180 update, no clock violations (19.092483 ms). The retained Wex factory entry is present in both current public browser and Node factory tables. This remains narrow pure-source qualification, not full factory boot. No master branch update or consumer-PR absorption.
