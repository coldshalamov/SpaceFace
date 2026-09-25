import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { cp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
const req = createRequire(join(process.cwd(), 'package.json'));
const real = await import(pathToFileURL(req.resolve('esbuild')).href);
const esb = real.default || real;
export async function build(options) {
  const out = process.env.R170_CAPTURE;
  const result = await esb.build({ ...options, metafile: true });
  if (out) {
    await rm(out, { recursive: true, force: true });
    await mkdir(out, { recursive: true });
    await cp(options.outdir, join(out, 'js'), { recursive: true });
    await writeFile(join(out, 'metafile.json'), JSON.stringify(result.metafile));
    const printable = { ...options, alias: options.alias ?? null };
    await writeFile(join(out, 'options.json'), JSON.stringify(printable, null, 1));
    console.log('[r170-capture] esbuild output captured to', out);
  }
  return result;
}
export default { ...esb, build };
