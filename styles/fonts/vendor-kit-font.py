#!/usr/bin/env python3
"""PQ-187.02: fetch a pinned OFL font, verify axes/figures, then opt it into fonts.css.

    python styles/fonts/vendor-kit-font.py --fetch
    python styles/fonts/vendor-kit-font.py --check

Requires fonttools + brotli. No font is downloaded in --check mode. Existing Instrument
Sans bytes are read, never replaced. A different existing variable face is not overwritten.
Nothing in this script constitutes headed, route, audio or visual acceptance.
"""
from __future__ import annotations

import argparse
import hashlib
import io
import json
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
FONT = ROOT / 'styles/fonts/bricolage-grotesque-var.woff2'
INSTRUMENT = ROOT / 'styles/fonts/instrument-sans-var.woff2'
CSS = ROOT / 'styles/fonts.css'
SOURCE_BLOB = '42c558b61ba40e340cfccf50786dcda816f3d30b'
INSTRUMENT_BLOB = '8611e41b14c75cfc8360e50d0d22a22d20a1de50'
SOURCE_URL = f'https://api.github.com/repos/fontsource/font-files/git/blobs/{SOURCE_BLOB}'
MARKER = '/* PQ-187.02: verified three-axis Bricolage Grotesque. */'
FACE = f'''{MARKER}
@font-face {{
  font-family: 'Bricolage Grotesque';
  font-style: normal;
  font-weight: 200 800;
  font-stretch: 75% 100%;
  font-display: swap;
  src: url('/styles/fonts/bricolage-grotesque-var.woff2') format('woff2');
}}
'''


def blob_sha(data: bytes) -> str:
    return hashlib.sha1(f'blob {len(data)}\0'.encode() + data).hexdigest()


def fetch_font() -> bytes:
    import base64
    request = urllib.request.Request(SOURCE_URL, headers={
        'Accept': 'application/vnd.github+json', 'User-Agent': 'SpaceFace-kit-font-vendor',
    })
    with urllib.request.urlopen(request, timeout=30) as response:
        payload = json.load(response)
    if payload.get('sha') != SOURCE_BLOB or payload.get('encoding') != 'base64':
        raise ValueError('Unexpected upstream blob response')
    return base64.b64decode(''.join(payload['content'].split()), validate=True)


def tabular_metrics(font_data: bytes) -> dict:
    from fontTools.ttLib import TTFont
    from fontTools.varLib.instancer import instantiateVariableFont
    report = {}
    for weight in (400, 500, 700):
        variable = TTFont(io.BytesIO(font_data))
        axes = {axis.axisTag: axis.defaultValue for axis in variable['fvar'].axes}
        axes['wght'] = weight
        font = instantiateVariableFont(variable, axes, inplace=True)
        cmap = font.getBestCmap()
        glyphs = [cmap[ord(digit)] for digit in '0123456789']
        feature_found = False
        if 'GSUB' in font:
            gsub = font['GSUB'].table
            for feature in gsub.FeatureList.FeatureRecord:
                if feature.FeatureTag != 'tnum':
                    continue
                feature_found = True
                for index in feature.Feature.LookupListIndex:
                    lookup = gsub.LookupList.Lookup[index]
                    for subtable in lookup.SubTable:
                        if lookup.LookupType == 7:
                            if subtable.ExtensionLookupType != 1:
                                raise ValueError('Unsupported tnum extension; inspect shaping before admission')
                            subtable = subtable.ExtSubTable
                        elif lookup.LookupType != 1:
                            raise ValueError('Unsupported tnum lookup; inspect shaping before admission')
                        glyphs = [subtable.mapping.get(name, name) for name in glyphs]
        advances = [font['hmtx'][glyph][0] for glyph in glyphs]
        if len(set(advances)) != 1:
            raise ValueError(f'Instrument Sans {weight} figures are not tabular: {advances}')
        report[str(weight)] = {'tnumFeature': feature_found, 'advances': advances,
                               'unitsPerEm': font['head'].unitsPerEm}
        font.close()
    return report


def verify(font_data: bytes) -> dict:
    from fontTools.ttLib import TTFont
    if blob_sha(font_data) != SOURCE_BLOB:
        raise ValueError('Variable Bricolage bytes do not match the pinned upstream blob')
    if font_data[:4] != b'wOF2':
        raise ValueError('Expected a WOFF2 font, not a download error page')
    with TTFont(io.BytesIO(font_data)) as font:
        axes = {axis.axisTag: [axis.minValue, axis.defaultValue, axis.maxValue]
                for axis in font['fvar'].axes}
        for tag, lower, upper in (('wght', 200, 800), ('wdth', 75, 100), ('opsz', 12, 96)):
            if tag not in axes or axes[tag][0] != lower or axes[tag][2] != upper:
                raise ValueError(f'Unexpected Bricolage {tag} axis: {axes.get(tag)}')
        if not all(code in font.getBestCmap() for code in range(32, 127)):
            raise ValueError('The font is not the Latin UI subset')
    instrument = INSTRUMENT.read_bytes()
    if blob_sha(instrument) != INSTRUMENT_BLOB:
        raise ValueError('Instrument Sans differs from the pinned base; review before replacing evidence')
    return {'source': SOURCE_URL, 'gitBlob': SOURCE_BLOB, 'bytes': len(font_data),
            'sha256': hashlib.sha256(font_data).hexdigest(), 'axes': axes,
            'instrumentBlob': INSTRUMENT_BLOB, 'instrumentTabular': tabular_metrics(instrument)}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument('--fetch', action='store_true')
    mode.add_argument('--check', action='store_true')
    args = parser.parse_args()
    if not FONT.exists() and args.check:
        raise FileNotFoundError(f'NOT DONE: variable font has not been vendored: {FONT}')
    data = FONT.read_bytes() if FONT.exists() else fetch_font()
    # Fail before any write if the license, bytes, axes or existing tabular face are wrong.
    license_file = FONT.with_name('bricolage-grotesque-OFL.txt')
    if not license_file.exists():
        raise FileNotFoundError('The Bricolage OFL must accompany the font')
    report = verify(data)
    current_css = CSS.read_bytes().decode('utf-8')
    if MARKER in current_css and FACE not in current_css:
        raise ValueError('Existing kit face declaration differs; preserve it for review')
    if args.check and FACE not in current_css:
        raise ValueError('The verified variable font is not declared in fonts.css')
    if args.fetch:
        if not FONT.exists():
            FONT.write_bytes(data)
        if FACE not in current_css:
            CSS.write_bytes((current_css + ('\n' if current_css.endswith('\n') else '\n\n') + FACE).encode('utf-8'))
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(f'kit-font: {type(error).__name__}: {error}', file=sys.stderr)
        raise SystemExit(1)
