# Machine-readable catalog

`task_catalog.json` contains all authored candidate records and content briefs. `dependency_graph.json` is a supporting preflight DAG, not an execution engine. CSV files are text projections for filtering/import preparation. All tasks are NOT_ADMITTED and require current native outcome mapping; no file here owns real-time priority, claims or completion.

`candidate_paths` include directly inspected, repository-routed and inferred owner neighborhoods. They are intentionally not guaranteed current APIs. Resolve the exact selected file/function at adoption. Missing paths must be discovered, not created blindly. Directory candidates require narrowing before worker dispatch.

`source_refs` link to the source manifest. Source observations are distinct from task proposals. `scope` makes optional and parked work explicit. `depends_on` means the outcome must exist; an existing proven implementation satisfies it without redoing its task.

Use `python tools/validate_pack.py` from the pack root to validate IDs, references and acyclicity. No native queue mutation is implemented.
