"""serve.py — a convenience server for the kit and the prototypes.

Nothing in this return depends on it: every page opens from `file://` with classic script tags
and relative paths. This exists only because a browser's devtools are easier to live with over
http, and because `_compare.html` embeds the prototypes in an iframe, which some browsers
restrict more tightly under `file://`.

    python assets/ui/kit/serve.py     # then open http://localhost:8391/kit/index.html
"""
import functools
import http.server
import pathlib
import socketserver

ROOT = pathlib.Path(__file__).resolve().parent
PORT = 8391

handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(ROOT))
with socketserver.TCPServer(("", PORT), handler) as httpd:
    print("Field Hardware kit on http://localhost:%d/kit/index.html" % PORT)
    print("  screens: /screens/title.html  /screens/crucible-door.html  /screens/hud.html")
    print("  compare: /screens/_compare.html")
    httpd.serve_forever()
