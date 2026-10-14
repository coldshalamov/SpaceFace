# Asset bank delivery checkpoint

## Exported candidates

Three model candidates are persisted with all three LODs and sidecars: `truss_short`, `flange_coupler`, `pressure_pipe_valve`.

The initial recovered export envelope used only LOD0 source geometry. The stricter reviewer validator correctly rejected coarse-LOD vertices outside that envelope. The shared exporter now measures actual selected-scene vertex positions through all parent transforms for every LOD, stamps their union into embedded metadata and the sidecar, and refreshes hashes and byte counts. It retains the reviewer scene-occurrence cost calculations.

Fresh source regeneration passes the unchanged independent remote validator: **3 assets, 9 GLBs, 3,818,320 bytes**. **18 Python tests pass** (12 existing cost tests plus 6 bounds tests). This does not certify collision, dynamic motion bounds, gameplay performance or visual acceptance.

## Remaining delivery

The commission is 156 distinct models plus 12 composition recipes, not a claim of 156 published/accepted models. Additional model batches are being visually revised and reviewed. Natural-family candidates need further style and anatomy work. Source, export, review, publication, runtime integration and acceptance remain separate states. No automatic game spawning or master merge is requested by this checkpoint.
