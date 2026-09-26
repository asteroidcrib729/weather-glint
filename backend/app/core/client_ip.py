import os
from ipaddress import ip_address

from fastapi import Request


def rate_limit_client_key(request: Request) -> str:
    """Use only an ingress-owned address; never trust caller-supplied forwarding chains."""
    if os.environ.get("RENDER") == "true":
        # Render's edge overwrites CF-Connecting-IP on public requests. Uvicorn
        # must run with --no-proxy-headers so X-Forwarded-For cannot change the peer.
        values = request.headers.getlist("cf-connecting-ip")
        if len(values) == 1:
            try:
                return f"render-client:{ip_address(values[0].strip()).compressed}"
            except ValueError:
                pass

    peer = request.client.host if request.client else "unknown"
    return f"connection:{peer}"
