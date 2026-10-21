# A non-Node app for ZcashFlight's proxy mode. Standard library only.
# Python's urllib honours HTTP_PROXY / HTTPS_PROXY, which ZcashFlight sets when app.proxy is true.
# The address is synthetic (from `zcashflight synth`) and passed in by the policy.
import json, os, urllib.request
from http.server import BaseHTTPRequestHandler, HTTPServer

ADDR = os.environ["ZF_SYNTH_ADDRESS"]

def post(url, payload):
    req = urllib.request.Request(url, data=json.dumps(payload).encode(), headers={"content-type": "application/json"}, method="POST")
    try:
        urllib.request.urlopen(req, timeout=5).read()
    except Exception:
        pass  # the sinkhole refuses HTTPS tunnels to third parties; the request was still observed

class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/health":
            pass
        elif self.path == "/plain-http":
            post("http://analytics.example.com/track", {"event": "checkout", "address": ADDR})
        elif self.path == "/https":
            post("https://analytics.example.com/track", {"event": "checkout", "address": ADDR})
        else:
            self.send_response(404); self.end_headers(); return
        self.send_response(200); self.end_headers(); self.wfile.write(b"ok")
    def log_message(self, *args):
        pass

HTTPServer(("127.0.0.1", int(os.environ.get("PORT", "4720"))), Handler).serve_forever()
