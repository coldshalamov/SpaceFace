// Run any node command as if every tracked file that is modified in the working tree still had its
// committed content. Read-only: nothing in the repo is written and no checkout happens; the committed
// text is served from a mirror folder outside the repo that `scripts/test-sweep.mjs --head` builds.
//
//   SPACEFACE_HEAD_REPO=<repo root> SPACEFACE_HEAD_MIRROR=<mirror dir> \
//     node --import file:///<repo>/scripts/lib/headModeHook.mjs --test test/some.test.mjs
//
// `scripts/test-sweep.mjs --head` sets all of this for you. With no mirror folder set the hook does
// nothing, so a normal run is untouched.
//
// Limit: code that reads a source file as TEXT (fs.readFileSync of a .js file, to grep it) still sees
// the working tree. Only what is imported or executed runs with committed content.
import { register } from 'node:module';

register('./headModeHookImpl.mjs', import.meta.url);
