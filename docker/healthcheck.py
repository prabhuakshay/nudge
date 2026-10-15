"""Container health check: asks the web server's own health endpoint whether it is working."""

import os
import sys
import urllib.request

host = os.environ.get("NUDGE_WEB_HOST", "127.0.0.1")
port = os.environ.get("NUDGE_WEB_PORT", "8000")
request = urllib.request.Request(  # noqa: S310 - fixed http URL built from local settings
    f"http://{host}:{port}/api/v1/health",
    # "localhost" is always in the default allowed hosts, whatever the public domain is.
    headers={"Host": "localhost"},
)
try:
    with urllib.request.urlopen(request, timeout=4) as response:  # noqa: S310
        sys.exit(0 if response.status == 200 else 1)
except OSError:
    sys.exit(1)
