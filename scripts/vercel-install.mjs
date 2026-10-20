// Vercel installCommand. Runs `npm ci` with the binary downloads the build
// container never uses already skipped — as a Node spawn so `vercel build`
// also works from a Windows checkout (POSIX `VAR=1 cmd` prefixes only parse
// under bash; Vercel's own builders are Linux and tolerate either).
import { spawnSync } from 'node:child_process';

const result = spawnSync('npm', ['ci'], {
  stdio: 'inherit',
  shell: true,
  env: {
    ...process.env,
    ELECTRON_SKIP_BINARY_DOWNLOAD: '1',
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '1',
  },
});
process.exit(result.status ?? 1);
