"""Loopback-only full-app browser fixture. Never include in deployment bundles."""
import http.server
from pathlib import Path
import sys

root=Path(__file__).resolve().parents[1]
dist=(root/sys.argv[1]).resolve()
if dist.parent!=root or not dist.name.startswith('dist-'):
    raise SystemExit('Expected a dedicated build directory in this repository')

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self,*args,**kwargs):
        super().__init__(*args,directory=str(dist),**kwargs)
    def do_GET(self):
        path=self.path.split('?',1)[0]
        if path in ('/','/index.html'):
            body=(dist/'index.html').read_text(encoding='utf-8').replace(
                'src="./src/app/bootstrap.js"','src="./__completion_fixture.js"').encode()
            self.send_response(200);self.send_header('Content-Type','text/html; charset=utf-8');self.end_headers();self.wfile.write(body)
        elif path=='/__completion_fixture.js':
            body=(root/'test-support/completion-browser-robot.js').read_text(encoding='utf-8').replace(
                "'../src/","'./src/").encode()
            self.send_response(200);self.send_header('Content-Type','text/javascript; charset=utf-8');self.end_headers();self.wfile.write(body)
        else:super().do_GET()

http.server.ThreadingHTTPServer(('127.0.0.1',int(sys.argv[2])),Handler).serve_forever()
