#!/usr/bin/env python3
"""Iteration capture for the Continuum loading visualizer.

Grabs the live proof page (serve-loading-signal-proof.mjs) at several times and
saves PNGs + a small metrics JSON into .devshots/continuum/. For agent visual
iteration only — not a shipped check.
"""
import asyncio, base64, io, json, os, sys
from pathlib import Path
import numpy as np
from PIL import Image
from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / '.devshots' / 'continuum'
OUT.mkdir(parents=True, exist_ok=True)
URL = os.environ.get('CONTINUUM_URL', 'http://127.0.0.1:8765/scripts/loading-signal-tableaux-proof.html')
TIMES = [float(x) for x in os.environ.get('CONTINUUM_TIMES', '4,32.5,61,90').split(',')]
MODES = os.environ.get('CONTINUUM_MODES', 'webgl').split(',')
W, H = 960, 540

def metrics(im):
    return {
        'mean': round(float(im.mean()), 3),
        'lit': round(float((im.max(2) > 20).mean()), 5),
        'white': round(float((im.min(2) > 240).mean()), 6),
        'max': int(im.max()),
    }

async def main():
    report = {'times': TIMES, 'modes': MODES, 'captures': []}
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            executable_path=os.environ.get('CHROMIUM_PATH', r'C:\Users\93rob\AppData\Local\ms-playwright\chromium-1223\chrome-win64\chrome.exe'),
            headless=True,
            args=['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
        page = await browser.new_page(viewport={'width': 1280, 'height': 900}, device_scale_factor=1)
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        await page.goto(f'{URL}?paused&width={W}&height={H}', wait_until='load')
        await page.wait_for_function('!!window.proof')
        for mode in MODES:
            await page.evaluate('(m)=>{proof.mount(m,%d,%d);proof.play(false);proof.setReduced(false)}' % (W, H), mode)
            for t in TIMES:
                await page.evaluate('(t)=>proof.seek(t,6)', t)
                data = await page.evaluate('proof.image()')
                png = base64.b64decode(data.split(',', 1)[1])
                name = f'{mode}-{str(t).replace(".", "-")}s'
                (OUT / f'{name}.png').write_bytes(png)
                im = np.asarray(Image.open(io.BytesIO(png)).convert('RGB'))
                m = metrics(im)
                report['captures'].append({'mode': mode, 'time': t, **m})
                print(mode, t, m, flush=True)
        report['errors'] = errors
        await browser.close()
    (OUT / 'capture-report.json').write_text(json.dumps(report, indent=2))
    if errors:
        print('PAGE ERRORS:', errors, flush=True)
        sys.exit(1)

if __name__ == '__main__':
    asyncio.run(main())
