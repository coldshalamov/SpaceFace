#!/usr/bin/env python3
"""Local-only review server with byte ranges for accurate MP4 seeking.

Python's default http.server does not serve ranges; Chrome can report `seeked`
while landing back on frame zero. Keep capture evidence tied to actual media time.
"""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import argparse
import re
import webbrowser


class MediaHandler(SimpleHTTPRequestHandler):
    def send_head(self):
        self.remaining = None
        path = Path(self.translate_path(self.path))
        header = self.headers.get('Range')
        if not header or not path.is_file():
            return super().send_head()
        match = re.fullmatch(r'bytes=(\d*)-(\d*)', header.strip())
        size = path.stat().st_size
        start, end = 0, size - 1
        valid = bool(match and size)
        if valid:
            left, right = match.groups()
            valid = bool(left or right)
            if left:
                start = int(left)
                end = min(int(right), size - 1) if right else size - 1
            elif right:
                start = max(0, size - int(right))
            valid = valid and 0 <= start <= end < size
        if not valid:
            self.send_response(416)
            self.send_header('Content-Range', f'bytes */{size}')
            self.send_header('Content-Length', '0')
            self.end_headers()
            return None
        try:
            source = path.open('rb')
            source.seek(start)
        except OSError:
            self.send_error(404)
            return None
        self.remaining = end - start + 1
        self.send_response(206)
        self.send_header('Content-Type', self.guess_type(str(path)))
        self.send_header('Content-Range', f'bytes {start}-{end}/{size}')
        self.send_header('Content-Length', str(self.remaining))
        self.end_headers()
        return source

    def end_headers(self):
        self.send_header('Accept-Ranges', 'bytes')
        super().end_headers()

    def copyfile(self, source, outputfile):
        if self.remaining is None:
            return super().copyfile(source, outputfile)
        try:
            while self.remaining > 0:
                block = source.read(min(65536, self.remaining))
                if not block:
                    break
                outputfile.write(block)
                self.remaining -= len(block)
        except (BrokenPipeError, ConnectionResetError):
            pass  # The decoder canceled a superseded range; not a failed file.


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=8123)
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parents[2])
    parser.add_argument('--open', action='store_true')
    args = parser.parse_args()
    if not 1 <= args.port <= 65535:
        parser.error('port must be between 1 and 65535')
    root = args.root.resolve()
    if not root.is_dir():
        parser.error('root must be an existing directory')
    try:
        server = ThreadingHTTPServer(('127.0.0.1', args.port), partial(MediaHandler, directory=str(root)))
    except OSError as error:
        raise SystemExit(f'Could not start preview: {error}. Try another --port.') from error
    url = f'http://127.0.0.1:{args.port}/tools/cinematic/signal-remix.html'
    print(url + '\nClose with Ctrl+C. Use Chrome or Edge for the H.264 movie.', flush=True)
    if args.open:
        webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == '__main__':
    main()
