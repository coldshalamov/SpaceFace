// Quiet launch: test and probe browsers must never take focus from what the owner is doing.
//
// Default (verified on this machine: reports the real Intel GPU through ANGLE/D3D11, same as a
// visible window): Chromium's new headless mode on the full Chromium build. No window exists, so
// nothing can steal focus, and the GPU path is the real one.
//
// Fallbacks and switches (all environment variables, so no script needs new arguments):
//   SPACEFACE_TEST_VISIBLE=1            opt out; launch exactly what the script asked for (headed,
//                                       focused). Use for the rare measurement that needs it.
//   SPACEFACE_TEST_QUIET_MODE=offscreen headed window parked at -32000,-32000 instead of headless.
//                                       Pair with restoreForegroundWindow() to hand focus back.
//   SPACEFACE_TEST_QUIET=0              same as VISIBLE (explicit off).
//
// Electron: isolated-evidence launches get SPACEFACE_EVIDENCE_SHOW_INACTIVE=1 and
// SPACEFACE_EVIDENCE_ALLOW_BACKGROUND_EXECUTION=1, which electron/main.cjs honours with
// showInactive() (never focused) and no background throttling. A player launch never sets them.
import { spawnSync } from 'node:child_process';

export function quietWanted(env = process.env) {
  if (String(env.SPACEFACE_TEST_VISIBLE || '') === '1') return false;
  if (String(env.SPACEFACE_TEST_QUIET || '') === '0') return false;
  return true;
}

export function quietMode(env = process.env) {
  return String(env.SPACEFACE_TEST_QUIET_MODE || '').toLowerCase() === 'offscreen'
    ? 'offscreen' : 'headless';
}

const BACKGROUND_ARGS = [
  '--disable-renderer-backgrounding',
  '--disable-background-timer-throttling',
  '--disable-backgrounding-occluded-windows',
];
const GPU_ARGS = [
  '--use-angle=d3d11',
  '--enable-gpu',
  '--ignore-gpu-blocklist',
];
// A script that picked its own rendering backend (software on purpose, a specific GL) keeps it.
const OWN_RENDERER = /^--(disable-gpu\b|use-gl\b|use-angle\b|use-gl=|enable-unsafe-swiftshader|enable-gpu\b)/;

/**
 * Launch options that do not steal focus.
 * @param {{gpu?: boolean, env?: object}} opts
 */
export function quietChromiumOptions({ gpu = true, env = process.env } = {}) {
  if (!quietWanted(env)) return {};
  if (quietMode(env) === 'offscreen') {
    return {
      headless: false,
      args: ['--window-position=-32000,-32000', '--window-size=1536,864',
        ...(gpu ? GPU_ARGS : []), ...BACKGROUND_ARGS],
    };
  }
  return {
    headless: true,
    channel: 'chromium', // the full build in new headless; the shell build is not what a player runs
    args: ['--headless=new', ...(gpu ? GPU_ARGS : []), ...BACKGROUND_ARGS],
  };
}

/** Merge quiet defaults under a script's own launch options (the script's args and viewport win). */
export function quietLaunchOptions(options, { env = process.env } = {}) {
  const source = options && typeof options === 'object' ? options : {};
  if (!quietWanted(env)) return source;
  // Already headless (Playwright's default): no window exists, so there is nothing to quiet.
  if (source.headless !== false) return source;
  const ownRenderer = (source.args || []).some((a) => OWN_RENDERER.test(String(a)));
  const quiet = quietChromiumOptions({ gpu: !ownRenderer, env });
  const scriptArgs = Array.isArray(source.args) ? source.args : [];
  const have = new Set(scriptArgs.map((a) => String(a).split('=')[0]));
  const extra = quiet.args.filter((a) => !have.has(a.split('=')[0]));
  const merged = { ...source, headless: quiet.headless, args: [...scriptArgs, ...extra] };
  if (quiet.channel && !source.channel && !source.executablePath) merged.channel = quiet.channel;
  if (quietMode(env) === 'offscreen') {
    // an off-screen window with a fixed-size viewport behaves like the real one
    merged.args = merged.args.filter((a) => !/^--start-(maximized|fullscreen)/.test(String(a)));
  }
  return merged;
}

/** Environment additions that make an isolated-evidence Electron window inactive and unthrottled. */
export function quietElectronEnv(baseEnv = process.env) {
  if (!quietWanted(baseEnv)) return {};
  return {
    SPACEFACE_TEST_QUIET: '1',
    SPACEFACE_EVIDENCE_SHOW_INACTIVE: '1',
    SPACEFACE_EVIDENCE_ALLOW_BACKGROUND_EXECUTION: '1',
  };
}

/** Electron launch options with the quiet environment folded in (isolated-evidence launches only). */
export function quietElectronOptions(options, { env = process.env } = {}) {
  const source = options && typeof options === 'object' ? options : {};
  if (!quietWanted(env)) return source;
  const launchEnv = source.env || env;
  if (launchEnv.SPACEFACE_ELECTRON_TEST_MODE !== 'isolated-evidence') return source;
  return { ...source, env: { ...launchEnv, ...quietElectronEnv(env) } };
}

/** Wrap a Playwright chromium launcher so every launch is quiet. Idempotent and non-mutating. */
export function quietChromium(chromium) {
  if (!chromium || chromium.__spacefaceQuiet) return chromium;
  const wrapped = Object.create(chromium);
  Object.defineProperty(wrapped, '__spacefaceQuiet', { value: true });
  if (typeof chromium.launch === 'function') {
    wrapped.launch = (options) => chromium.launch(quietLaunchOptions(options));
  }
  if (typeof chromium.launchPersistentContext === 'function') {
    wrapped.launchPersistentContext = (dir, options) =>
      chromium.launchPersistentContext(dir, quietLaunchOptions(options));
  }
  return wrapped;
}

export function quietElectron(electron) {
  if (!electron || electron.__spacefaceQuiet) return electron;
  const wrapped = Object.create(electron);
  Object.defineProperty(wrapped, '__spacefaceQuiet', { value: true });
  if (typeof electron.launch === 'function') {
    wrapped.launch = (options) => electron.launch(quietElectronOptions(options));
  }
  return wrapped;
}

/** Playwright module with quiet chromium/_electron launchers (for scripts that import it directly). */
export async function loadQuietPlaywright(specifier = 'playwright') {
  const mod = await import(specifier);
  const wrapped = Object.create(mod);
  if (mod.chromium) Object.defineProperty(wrapped, 'chromium', { value: quietChromium(mod.chromium), enumerable: true });
  if (mod._electron) Object.defineProperty(wrapped, '_electron', { value: quietElectron(mod._electron), enumerable: true });
  return wrapped;
}

// ---- off-screen fallback: hand focus back to whatever the owner was using (Windows only) ----
const PS_FOREGROUND = `
Add-Type @"
using System; using System.Runtime.InteropServices;
public class SfFg { [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h); }
"@
`;

export function captureForegroundWindow() {
  if (process.platform !== 'win32') return null;
  const r = spawnSync('powershell', ['-NoProfile', '-Command', `${PS_FOREGROUND}[SfFg]::GetForegroundWindow().ToInt64()`],
    { encoding: 'utf8', timeout: 8000 });
  const n = Number(String(r.stdout || '').trim());
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function restoreForegroundWindow(handle) {
  if (process.platform !== 'win32' || !handle) return false;
  const r = spawnSync('powershell', ['-NoProfile', '-Command', `${PS_FOREGROUND}[SfFg]::SetForegroundWindow([IntPtr]${handle})`],
    { encoding: 'utf8', timeout: 8000 });
  return r.status === 0;
}
