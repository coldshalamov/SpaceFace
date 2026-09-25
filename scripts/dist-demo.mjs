// ZERO_TO_HERO §7 item 5 — the demo Electron package. Same game, same bundle route:
// `npm run dist:demo` builds the bundle with --demo, then invokes electron-builder with
// CLI config overrides only, so package.json's "build" block stays the single source.
//
// Running cli.js through process.execPath (not a shell or the .bin shim) means argv
// reaches electron-builder verbatim on every platform — ${version}/${ext} placeholders
// in the artifact name survive cmd.exe, PowerShell and POSIX shells unexpanded.
//
// Extra args pass straight through: `node scripts/dist-demo.mjs --dir` builds unpacked.
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const builderCli = require.resolve('electron-builder/cli.js');

const args = [
  builderCli,
  '-c.productName=SpaceFace Demo',
  '-c.appId=com.spaceface.game.demo',
  '-c.directories.output=dist/demo',
  '-c.win.artifactName=SpaceFace-Demo-Setup-${version}.${ext}',
  '-c.mac.artifactName=SpaceFace-Demo-${version}.${ext}',
  '-c.linux.artifactName=SpaceFace-Demo-${version}.${ext}',
  ...process.argv.slice(2),
];

execFileSync(process.execPath, args, { stdio: 'inherit' });
