"""Gunicorn settings, read from the environment so deployments never edit this file."""

from __future__ import annotations

import os

bind = f"{os.environ.get('NUDGE_WEB_HOST', '127.0.0.1')}:{os.environ.get('NUDGE_WEB_PORT', '8000')}"
workers = int(os.environ.get("NUDGE_WEB_WORKERS", "2"))
threads = int(os.environ.get("NUDGE_WEB_THREADS", "4"))
worker_class = "gthread"
timeout = int(os.environ.get("NUDGE_WEB_TIMEOUT", "30"))
accesslog = "-"
errorlog = "-"
forwarded_allow_ips = os.environ.get("NUDGE_FORWARDED_ALLOW_IPS", "127.0.0.1")
# The runtime control socket isn't used, and the container's filesystem is read-only.
control_socket_disable = True
