#!/usr/bin/env node
// SpaceFace headless sim CLI — launcher shell.
//
// The command surface lives in ./sf-sim-cli.mjs with identical semantics (same argv,
// stdio, exit codes). This shell exists so the V8 compile cache can be armed BEFORE
// the module graph compiles: in an ESM entry every static import is compiled before
// the entry's own body runs, so the cache cannot be armed from inside the file that
// owns the graph it should cover. Here the only static import is the builtin
// node:module, so the ~470-module CLI graph loads under an already-armed cache.
// enableCompileCache honors NODE_COMPILE_CACHE and falls back to the platform
// tmpdir; it is absent before Node 22.1, so the optional call stays a no-op there.
import nodeModule from 'node:module';
try { nodeModule.enableCompileCache?.(); } catch {}
await import('./sf-sim-cli.mjs');
