"""Generate N variants of one image job with `codex exec` (its image tool), then review them.

  python tools/art/imagegen_variants.py run --out <dir> --name <job> --prompt-file p.txt [--variants 3] [--ref a.png b.png]
  python tools/art/imagegen_variants.py contact --out <dir> --name <job>      # contact sheet of every variant (alpha shown on a checker/dark ground)

Each variant gets its own folder <dir>/<name>/v<k>/ (codex's working directory), and must save out.png there.
The prompt file holds the SUBJECT and STYLE only; this wrapper adds the "use your image tool / save as out.png" frame.
Same call shape as crest_batch.py / emblem_batch.py. Never overwrites an existing variant; re-run with --start N for more.
"""
import argparse, os, shutil, subprocess, sys, time
from concurrent.futures import ThreadPoolExecutor

CODEX = shutil.which('codex') or 'codex'


def session_image(vdir):
    """The image THIS run generated, taken from its own Codex session folder.

    Codex keeps every generated image under ~/.codex/generated_images/<session id>/. Runs in parallel share the
    prompt's `out.png` convention, and a run has been seen to copy ANOTHER run's newest image as its own, so the
    session folder (not the model's copy) is the source of truth.
    """
    log = os.path.join(vdir, 'codex.log')
    if not os.path.exists(log):
        return None
    sid = None
    with open(log, encoding='utf-8', errors='ignore') as fh:
        for line in fh:
            if line.startswith('session id:'):
                sid = line.split(':', 1)[1].strip()
                break
    if not sid:
        return None
    folder = os.path.join(os.path.expanduser('~'), '.codex', 'generated_images', sid)
    if not os.path.isdir(folder):
        return None
    pngs = [os.path.join(folder, f) for f in os.listdir(folder) if f.lower().endswith('.png')]
    return max(pngs, key=os.path.getmtime) if pngs else None


def settle(vdir):
    """Make out.png the session's own image. Returns 'ok', 'fixed' (codex had copied a different file) or 'missing'."""
    src = session_image(vdir)
    target = os.path.join(vdir, 'out.png')
    if not src:
        return 'ok' if os.path.exists(target) else 'missing'
    same = os.path.exists(target) and open(target, 'rb').read() == open(src, 'rb').read()
    if not same:
        shutil.copyfile(src, target)
    return 'ok' if same else 'fixed'


def run_variant(job_dir, k, prompt, refs, timeout):
    vdir = os.path.join(job_dir, f'v{k}')
    os.makedirs(vdir, exist_ok=True)
    target = os.path.join(vdir, 'out.png')
    if os.path.exists(target):
        return k, 'exists'
    cmd = [CODEX, 'exec', prompt, '-m', 'gpt-5.5', '-c', 'model_reasoning_effort=low',
           '--skip-git-repo-check', '-s', 'workspace-write']
    for ref in refs:
        cmd += ['-i', ref]
    for attempt in range(2):
        try:
            subprocess.run(cmd, cwd=vdir, stdout=open(os.path.join(vdir, 'codex.log'), 'wb'),
                           stderr=subprocess.STDOUT, timeout=timeout)
        except Exception as exc:  # timeout or launch failure: log and retry once
            with open(os.path.join(vdir, 'codex.err'), 'a') as fh:
                fh.write(f'{time.strftime("%H:%M:%S")} attempt {attempt}: {exc!r}\n')
        status = settle(vdir)
        if status != 'missing':
            return k, status
    return k, 'FAILED'


def cmd_run(args):
    job_dir = os.path.join(args.out, args.name)
    os.makedirs(job_dir, exist_ok=True)
    subject = open(args.prompt_file, encoding='utf-8').read().strip()
    refs = [os.path.abspath(r) for r in (args.ref or [])]
    note = (' The attached reference image(s) show the existing art this must match in construction, line weight, '
            'palette and finish.') if refs else ''
    prompt = ('Use your image generation tool to create ONE image. ' + subject + note +
              ' Save the PNG in the current directory as out.png and reply with the path only.')
    ks = list(range(args.start, args.start + args.variants))
    with ThreadPoolExecutor(max_workers=args.variants) as ex:
        for k, status in ex.map(lambda k: run_variant(job_dir, k, prompt, refs, args.timeout), ks):
            print(time.strftime('%H:%M:%S'), args.name, f'v{k}', status, flush=True)
    print('JOB_DONE', args.name, flush=True)


def cmd_repair(args):
    """Re-derive out.png from each variant's own session folder (fixes jobs run before settle() existed)."""
    for root, dirs, files in os.walk(args.out):
        if 'codex.log' in files and os.path.basename(root).startswith('v'):
            print(os.path.relpath(root, args.out), settle(root))


def cmd_contact(args):
    from PIL import Image, ImageDraw
    job_dir = os.path.join(args.out, args.name)
    items = []
    for d in sorted(os.listdir(job_dir)):
        p = os.path.join(job_dir, d, 'out.png')
        if os.path.exists(p):
            items.append((d, Image.open(p).convert('RGBA')))
    if not items:
        sys.exit('no variants found')
    cell = args.cell
    ground = args.ground
    sheet = Image.new('RGBA', (cell * len(items), cell + 18), (0, 0, 0, 255))
    dr = ImageDraw.Draw(sheet)
    for i, (name, im) in enumerate(items):
        bg = Image.new('RGBA', (cell, cell), (14, 18, 26, 255) if ground == 'dark' else (90, 90, 90, 255))
        t = im.copy()
        t.thumbnail((cell, cell))
        bg.alpha_composite(t, ((cell - t.width) // 2, (cell - t.height) // 2))
        sheet.paste(bg, (i * cell, 18))
        a = im.getchannel('A')
        lo, hi = a.getextrema()
        dr.text((i * cell + 4, 3), f'{name} {im.width}x{im.height} alpha {lo}-{hi}', fill=(255, 255, 255, 255))
    out = os.path.join(job_dir, 'contact.png')
    sheet.convert('RGB').save(out)
    print(out)


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest='cmd', required=True)
    r = sub.add_parser('run')
    r.add_argument('--out', required=True); r.add_argument('--name', required=True)
    r.add_argument('--prompt-file', required=True); r.add_argument('--variants', type=int, default=3)
    r.add_argument('--start', type=int, default=1); r.add_argument('--ref', nargs='*')
    r.add_argument('--timeout', type=int, default=1200)
    r.set_defaults(fn=cmd_run)
    p = sub.add_parser('repair'); p.add_argument('--out', required=True); p.set_defaults(fn=cmd_repair)
    c = sub.add_parser('contact')
    c.add_argument('--out', required=True); c.add_argument('--name', required=True)
    c.add_argument('--cell', type=int, default=640); c.add_argument('--ground', default='dark')
    c.set_defaults(fn=cmd_contact)
    a = ap.parse_args()
    a.fn(a)
