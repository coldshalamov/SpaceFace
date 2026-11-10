import * as esbuild from '/workspace/spaceface/node_modules/esbuild/lib/main.js';
import { readFileSync } from 'node:fs';
const files = process.argv.slice(2);
for (const f of files) {
  const [a, b] = [`vendor/addons/${f}`, `node_modules/three/examples/jsm/${f}`].map((p) => esbuild.transformSync(readFileSync(p, 'utf8'), { minifyWhitespace: true, minifySyntax: true, legalComments: 'none', format: 'esm' }).code);
  console.log(f, a === b ? 'code-identical (comments only)' : `CODE DIFF (${a.length} vs ${b.length} minified chars)`);
}
