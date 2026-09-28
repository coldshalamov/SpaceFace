# Read-only planbank utilities

Use Python 3.10 or later. Only the standard library is required. None of these scripts calls a model, contacts a network service, changes Git, creates queue entries or starts implementation.

`compile_brief.py SF-136 --output brief-SF-136.md` assembles one selected packet, its domain guide, shared execution rules and linked deep dive. It refuses to overwrite an existing output. Up to five IDs are accepted for a bounded batch. `--mode review` uses the stronger review prompt; `--mode integrate` uses the integration prompt. Local links are rebased to the output location. Keep the original pack available for those links.

`check_source_drift.py --repo /path/to/SpaceFace --task SF-136` compares the selected packet's source/test files and core authority documents with the planning hashes. A changed/moved file is information to reconcile, not an error to fix by resetting Git. Directory entries are only checked for existence; their contents are not recursively proven unchanged by a directory result. Omit `--task` to check all indexed paths. `--json` emits machine-readable results.

`validate_pack.py` checks the archive's 300 IDs, 20 groups, unique chosen implementations, required packet sections, local file links, indexed sources and acyclic conditional dependency references. `--repo` additionally compares all indexed hashes against the exact planning snapshot. Use the drift tool instead when the checkout has advanced. Validation does not assess gameplay quality, external URLs, source semantics or whether an idea is already implemented.

All output writes from the compiler require an explicit new path. Source-drift and validation commands only read. Scripts can be invoked from another directory using their actual full path; no environment variables or repository installation are needed.
