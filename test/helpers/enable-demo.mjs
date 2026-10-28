// Test seam for demo-path test files: modules that read IS_DEMO resolve the bundle define at
// import time. Import this FIRST (evaluation follows import order) so every module the file pulls
// sees the define baked true, exactly as a `--demo` bundle presents it.
globalThis.__SPACEFACE_DEMO__ = true;
