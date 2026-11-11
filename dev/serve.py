"""Development server (never shipped).

Serves the extension folder on http://localhost:8765 and injects
dev/chrome-shim.js into every extension page, so the popup, the preview page
and the effects engine can be tried in a normal browser tab:

    python3 dev/serve.py
    open http://localhost:8765/preview/preview.html?fakecam   # test picture as camera
    open http://localhost:8765/preview/preview.html           # your real camera
    open http://localhost:8765/popup/popup.html
"""
import http.server
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
SHIM = b'<script src="/dev/chrome-shim.js"></script>'


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript",
        ".mjs": "text/javascript",
        ".wasm": "application/wasm",
        ".json": "application/json",
        ".task": "application/octet-stream",
    }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_GET(self):
        path = self.path.split("?", 1)[0]
        if path.endswith(".html") and not path.startswith("/dev/"):
            full = os.path.normpath(os.path.join(ROOT, path.lstrip("/")))
            if full.startswith(ROOT) and os.path.isfile(full):
                with open(full, "rb") as f:
                    body = f.read().replace(b"<head>", b"<head>" + SHIM, 1)
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
                return
        super().do_GET()


if __name__ == "__main__":
    print(f"Serving {ROOT} on http://localhost:{PORT}")
    http.server.ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
